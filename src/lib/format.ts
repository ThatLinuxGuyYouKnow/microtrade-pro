export function fmtTime(iso: string | null | undefined, timezone = 'America/Chicago'): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function fmtHourLabel(iso: string, timezone = 'America/Chicago'): string {
  const h = Number(fmtTime(iso, timezone).slice(0, 2));
  return `${String(h).padStart(2, '0')}:00`;
}

export function fmtDay(iso: string | null | undefined, timezone = 'America/Chicago'): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(iso));
}

export function fmtLongDay(iso: string | null | undefined, timezone = 'America/Chicago'): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso));
}

export function fmtKwh(value: number, dp = 1): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)} MWh`;
  return `${value.toFixed(dp)} kWh`;
}

export function fmtKw(value: number, dp = 1): string {
  return `${value.toFixed(dp)} kW`;
}

export function fmtUsd(value: number, dp = 2): string {
  if (!Number.isFinite(value)) return '—';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

export function fmtMtr(value: number, dp = 2): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtPct(value: number, dp = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(dp)}%`;
}

export function fmtPrice(value: number, dp = 3): string {
  return `$${value.toFixed(dp)}`;
}

export function shortAddr(address: string): string {
  if (!address) return '—';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function shortHash(hash: string): string {
  if (!hash) return '—';
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function kwhToHouseholds(value: number): string {
  return `${Math.round(value / 10.5)} home-days`;
}

export function co2Equivalents(kg: number): string {
  if (kg < 1) return `${(kg * 1000).toFixed(0)} g CO₂e`;
  if (kg > 1000) return `${(kg / 1000).toFixed(2)} t CO₂e`;
  return `${kg.toFixed(1)} kg CO₂e`;
}

export function relativeHour(iso: string, clock: string): string {
  const diff = Math.round((new Date(iso).getTime() - new Date(clock).getTime()) / 3600_000);
  if (diff === 0) return 'now';
  if (diff === 1) return '+1h';
  if (diff > 0) return `+${diff}h`;
  return `${diff}h`;
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}
