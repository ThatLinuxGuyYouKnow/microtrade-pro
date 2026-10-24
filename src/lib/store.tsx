import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Snapshot } from '../../shared/types';
import { post } from './api';

interface Toast {
  id: number;
  message: string;
  tone: 'ok' | 'error' | 'info';
}

interface StoreValue {
  snapshot: Snapshot | null;
  connected: boolean;
  error: string | null;
  act: (path: string, body?: unknown) => Promise<any>;
  refresh: () => Promise<void>;
  toast: (message: string, tone?: Toast['tone']) => void;
  toasts: Toast[];
}

const Store = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4600);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('state unavailable');
      setSnapshot((await res.json()) as Snapshot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'state unavailable');
    }
  }, []);

  useEffect(() => {
    refresh();
    const source = new EventSource('/api/stream');
    source.onopen = () => {
      setConnected(true);
      setError(null);
    };
    source.onmessage = (event) => {
      try {
        setSnapshot(JSON.parse(event.data) as Snapshot);
        setConnected(true);
      } catch {
        /* ignore malformed frame */
      }
    };
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [refresh]);

  const act = useCallback(
    async (path: string, body?: unknown) => {
      try {
        const result = await post<Record<string, unknown>>(path, body);
        if (result?.state) setSnapshot(result.state as Snapshot);
        if (typeof result?.message === 'string') {
          toast(result.message, result.ok === false ? 'error' : 'ok');
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'action failed';
        toast(message, 'error');
        throw err;
      }
    },
    [toast],
  );

  const value = useMemo(
    () => ({ snapshot, connected, error, act, refresh, toast, toasts }),
    [snapshot, connected, error, act, refresh, toast, toasts],
  );

  return <Store.Provider value={value}>{children}</Store.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(Store);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}

export function useSnapshot(): Snapshot | null {
  return useStore().snapshot;
}
