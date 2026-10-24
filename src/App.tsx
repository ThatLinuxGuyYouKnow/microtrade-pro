import { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  Bot,
  Gauge,
  Zap,
  Blocks,
  Sparkles,
  Play,
  Pause,
  ChevronRight,
  Radio,
  FastForward,
} from 'lucide-react';
import { StoreProvider, useStore } from './lib/store';
import { fmtDay, fmtTime, cx } from './lib/format';
import { Dot, Spinner } from './components/ui';
import Overview from './pages/Overview';
import Forecast from './pages/Forecast';
import Market from './pages/Market';
import Ledger from './pages/Ledger';
import Agents from './pages/Agents';
import Docs from './pages/Docs';

const ROUTES = [
  { id: 'overview', label: 'Overview', icon: Gauge, section: 'Operate', eyebrow: 'Control room', title: 'Neighbourhood overview' },
  { id: 'forecast', label: 'Forecast', icon: Sparkles, section: 'Operate', eyebrow: 'Predictive layer', title: 'Forecast intelligence' },
  { id: 'market', label: 'Market', icon: ArrowLeftRight, section: 'Operate', eyebrow: 'Day-ahead market', title: 'Peer-to-peer exchange' },
  { id: 'ledger', label: 'Ledger', icon: Blocks, section: 'Verify', eyebrow: 'Settlement layer', title: 'Verifiable ledger' },
  { id: 'agents', label: 'Agents', icon: Bot, section: 'Govern', eyebrow: 'Autonomy', title: 'Agent fleet' },
  { id: 'docs', label: 'Documentation', icon: BookOpen, section: 'Understand', eyebrow: 'ClimateChain 2026', title: 'Project dossier' },
] as const;

type RouteId = (typeof ROUTES)[number]['id'];

function parseRoute(): RouteId {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES.find((r) => r.id === hash)?.id ?? 'overview') as RouteId;
}

function useRoute() {
  const [route, setRoute] = useState<RouteId>(parseRoute);
  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute());
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = (id: string) => {
    window.location.hash = `/${id}`;
  };
  return { route, navigate };
}

function BrandMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M16 4.5 26 10v12L16 27.5 6 22V10L16 4.5Z" stroke="#34D399" strokeOpacity="0.55" strokeWidth="1.2" />
      <path d="M17.8 9.5 12 17.2h3.6L14.2 23l6-8.1h-3.7l1.3-5.4Z" fill="#5CE1A8" />
    </svg>
  );
}

function Sidebar({ route, navigate }: { route: RouteId; navigate: (id: string) => void }) {
  const { snapshot, connected } = useStore();
  const sections = ['Operate', 'Verify', 'Govern', 'Understand'];
  return (
    <aside className="sticky top-0 hidden h-screen w-[230px] shrink-0 flex-col border-r border-white/[0.06] bg-[#070b0a]/95 lg:flex">
      <div className="flex items-center gap-2.5 px-5 pb-6 pt-5">
        <BrandMark />
        <div>
          <div className="text-[13px] font-semibold tracking-[-0.01em] text-white/95">MicroTrade</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-mint-400/70">Pro · microgrid</div>
        </div>
      </div>

      <nav className="flex-1 px-3">
        {sections.map((section) => {
          const items = ROUTES.filter((r) => r.section === section);
          if (!items.length) return null;
          return (
            <div key={section} className="mb-5">
              <div className="eyebrow px-2.5 pb-1.5 text-[8.5px]">{section}</div>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = route === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.id)}
                      className={cx(
                        'group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[12.5px] transition-colors',
                        active ? 'bg-white/[0.055] text-white' : 'text-white/45 hover:bg-white/[0.025] hover:text-white/80',
                      )}
                    >
                      {active && (
                        <span className="absolute -left-3 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r bg-mint-400" />
                      )}
                      <Icon size={14} className={active ? 'text-mint-400' : 'text-white/30 group-hover:text-white/55'} />
                      {item.label}
                      {item.id === 'market' && snapshot?.market.openOrders ? (
                        <span className="ml-auto font-mono text-[9px] text-white/25">{snapshot.market.openOrders}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="px-3 pb-4">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/35">Simulation node</span>
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-mint-400">
              <Dot pulse tone={connected ? 'mint' : 'amber'} />
              {connected ? 'live' : 'sync'}
            </span>
          </div>
          <div className="mt-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-white/30">Block height</span>
              <span className="num text-white/70">{snapshot?.ledger.height ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-white/30">Local clock</span>
              <span className="num text-white/70">{snapshot ? fmtTime(snapshot.clock, snapshot.timezone) : '—'}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-white/30">Timezone</span>
              <span className="num text-white/50">CDT</span>
            </div>
          </div>
        </div>
        <a
          href="https://ieee-climatechain-hack.devpost.com"
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center justify-between px-1 font-mono text-[9px] uppercase tracking-[0.1em] text-white/25 transition-colors hover:text-white/50"
        >
          IEEE ClimateChain ’26
          <ChevronRight size={10} />
        </a>
      </div>
    </aside>
  );
}

function TopBar({
  route,
  navigate,
}: {
  route: RouteId;
  navigate: (id: string) => void;
}) {
  const { snapshot, act } = useStore();
  const [busy, setBusy] = useState(false);
  const meta = ROUTES.find((r) => r.id === route)!;
  const running = snapshot?.running ?? false;
  const speed = snapshot?.speed ?? 1;

  const runDayAhead = async () => {
    setBusy(true);
    try {
      await act('/api/actions/day-ahead');
    } catch {
      /* toast handled */
    } finally {
      setBusy(false);
    }
  };

  const cycleSpeed = async () => {
    const options = [1, 2, 4, 8];
    const next = options[(options.indexOf(speed) + 1) % options.length];
    await act('/api/actions/speed', { speed: next });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#060908]/88 backdrop-blur-xl">
      <div className="flex h-[68px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <div className="eyebrow mb-0.5 flex items-center gap-2">
            <span className="text-mint-400/60">{meta.eyebrow}</span>
            <span className="text-white/15">/</span>
            <span className="hidden text-white/25 sm:inline">Cedar Hollow</span>
          </div>
          <h1 className="truncate text-[17px] font-medium tracking-[-0.015em] text-white/95">{meta.title}</h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="mr-1 hidden items-center gap-2.5 border-r border-white/[0.07] pr-3 md:flex">
            <div className="text-right">
              <div className="num text-[12px] leading-tight text-white/80">
                {snapshot ? fmtTime(snapshot.clock, snapshot.timezone) : '—:—'}
              </div>
              <div className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-white/30">
                {snapshot ? fmtDay(snapshot.clock, snapshot.timezone) : '—'}
              </div>
            </div>
            <Radio size={13} className={cx(running ? 'text-mint-400 live-dot' : 'text-white/25')} />
          </div>

          <button
            className="btn h-9 w-9 !p-0"
            title={running ? 'Pause simulation' : 'Resume simulation'}
            onClick={() => act('/api/actions/running', { running: !running })}
          >
            {running ? <Pause size={13} /> : <Play size={13} />}
          </button>

          <button className="btn hidden h-9 sm:inline-flex" onClick={cycleSpeed} title="Simulation speed">
            <FastForward size={12} className="text-white/40" />
            <span className="num text-[11px]">{speed}×</span>
          </button>

          <button
            className="btn hidden h-9 sm:inline-flex"
            onClick={() => act('/api/actions/advance', { hours: 1 })}
            title="Advance one simulated hour"
          >
            <span className="num text-[11px]">+1h</span>
          </button>

          <button className="btn btn-primary h-9" onClick={runDayAhead} disabled={busy}>
            {busy ? <Spinner size={12} /> : <Zap size={12} />}
            <span className="hidden text-[12px] sm:inline">Run day-ahead</span>
            <span className="text-[12px] sm:hidden">Auction</span>
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-t border-white/[0.05] px-3 py-2 lg:hidden">
        {ROUTES.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={cx(
                'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px]',
                route === item.id ? 'bg-white/[0.07] text-white' : 'text-white/40',
              )}
            >
              <Icon size={12} />
              {item.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}

function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'pointer-events-auto rounded-xl border bg-[#0b100e]/95 px-4 py-3 text-[12px] shadow-2xl backdrop-blur-xl fade-up',
            t.tone === 'error'
              ? 'border-danger/25 text-white/80'
              : t.tone === 'ok'
                ? 'border-mint-500/25 text-white/80'
                : 'border-white/10 text-white/70',
          )}
        >
          <div className="flex items-start gap-2.5">
            <span
              className={cx(
                'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                t.tone === 'error' ? 'bg-danger' : t.tone === 'ok' ? 'bg-mint-400' : 'bg-white/40',
              )}
            />
            {t.message}
          </div>
        </div>
      ))}
    </div>
  );
}

function Pages({ route, navigate }: { route: RouteId; navigate: (id: string) => void }) {
  switch (route) {
    case 'overview':
      return <Overview onNavigate={navigate} />;
    case 'forecast':
      return <Forecast />;
    case 'market':
      return <Market />;
    case 'ledger':
      return <Ledger />;
    case 'agents':
      return <Agents />;
    case 'docs':
      return <Docs />;
  }
}

function Shell() {
  const { snapshot, connected, error, refresh } = useStore();
  const { route, navigate } = useRoute();

  if (!snapshot) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6">
        <BrandMark />
        <div className="text-center">
          <div className="text-[15px] font-medium text-white/90">MicroTrade Pro</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
            {error ? 'simulation node unreachable' : 'booting simulation node'}
          </div>
        </div>
        {error ? (
          <button className="btn btn-primary" onClick={() => refresh()}>
            Retry connection
          </button>
        ) : (
          <div className="w-[220px]">
            <div className="skeleton h-1 rounded-full" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grain flex min-h-screen bg-[#060908]">
      <Sidebar route={route} navigate={navigate} />
      <div className="relative min-w-0 flex-1">
        <TopBar route={route} navigate={navigate} />
        <main className="mx-auto w-full max-w-[1480px] px-4 pb-16 pt-5 sm:px-6 lg:px-8">
          <div key={route} className="fade-up">
            <Pages route={route} navigate={navigate} />
          </div>
          <footer className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/[0.05] pt-5 text-[10.5px] text-white/25 sm:flex-row sm:items-center">
            <span>
              MicroTrade Pro · predictive P2P energy exchange · simulation environment, not financial advice
            </span>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em]">
              {connected ? 'stream connected' : 'reconnecting'} · v{snapshot.version} · IEEE ClimateChain 2026
            </span>
          </footer>
        </main>
      </div>
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
