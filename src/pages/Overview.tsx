import { lazy, Suspense, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, BatteryCharging, CircleDollarSign, CloudSun, Leaf, Sparkles, Timer } from 'lucide-react';
import { useStore } from '../lib/store';
import type { Snapshot } from '../../shared/types';
import { fmtDay, fmtHourLabel, fmtKwh, fmtPct, fmtPrice, fmtTime, fmtUsd, cx } from '../lib/format';
import { Badge, Dot, Meter, Panel, SectionHeader, Stat } from '../components/ui';
import { Sparkline, TimeSeriesChart } from '../components/Charts';

const MicrogridScene = lazy(() => import('../components/MicrogridScene'));

const EVENT_TONE: Record<string, 'mint' | 'amber' | 'blue' | 'violet' | 'neutral'> = {
  settlement: 'mint',
  trade: 'blue',
  forecast: 'violet',
  chain: 'neutral',
  rec: 'mint',
  grid: 'amber',
  agent: 'violet',
  order: 'blue',
  system: 'neutral',
};

function dateKey(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );
}

function AccuracyGauge({ value }: { value: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative flex h-[118px] w-[118px] items-center justify-center">
      <svg width="118" height="118" className="-rotate-90">
        <circle cx="59" cy="59" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle
          cx="59"
          cy="59"
          r={radius}
          fill="none"
          stroke="#5CE1A8"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
          style={{ filter: 'drop-shadow(0 0 6px rgba(92,225,168,0.35))' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-[28px] leading-none text-white">{pct.toFixed(1)}</span>
        <span className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.14em] text-white/30">% accuracy</span>
      </div>
    </div>
  );
}

function OverviewView({ snapshot, onNavigate }: { snapshot: Snapshot; onNavigate: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { households, kpis, dayAhead, trades, events, contracts, clock, timezone, weatherNow } = snapshot;

  const todayKey = dateKey(clock, timezone);
  const today = dayAhead.filter((d) => dateKey(d.slot, timezone) === todayKey);
  const priceLabels = today.map((d) => fmtHourLabel(d.slot, timezone));
  const priceSeries = today.map((d) => (d.volumeKwh > 0 ? d.clearingPrice : null));
  const volumeSeries = today.map((d) => d.volumeKwh);
  const maxVolume = Math.max(1, ...volumeSeries);
  const tradedSpark = useMemo(() => {
    let acc = 0;
    return today.map((d) => (acc += d.volumeKwh));
  }, [today]);

  const latestOrders = snapshot.orders
    .filter((o) => o.agent)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);

  const pending = contracts.filter((c) => c.status === 'pending').slice(0, 3);
  const accuracy = 100 - kpis.avgMape;
  const autonomous = households.filter((h) => h.autonomy).length;
  const p2pShare = kpis.p2pSharePct;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8">
          <Suspense
            fallback={<div className="skeleton h-[420px] w-full rounded-2xl" />}
          >
            <MicrogridScene
              households={households}
              trades={trades}
              clock={clock}
              timezone={timezone}
              weather={weatherNow}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onOpenAgent={() => onNavigate('agents')}
            />
          </Suspense>
        </div>

        <div className="col-span-12 grid gap-4 sm:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
          <Panel className="flex flex-col">
            <SectionHeader
              eyebrow="Agent mesh"
              title="Forecast confidence"
              right={<Badge tone="mint">ridge v1</Badge>}
            />
            <div className="mt-3 flex items-center gap-4">
              <AccuracyGauge value={accuracy} />
              <div className="min-w-0 flex-1 space-y-2.5">
                {[
                  ['Autonomous agents', `${autonomous} / ${households.length}`],
                  ['Mean confidence', fmtPct((households.reduce((s, h) => s + (snapshot.forecasts[h.id]?.confidence ?? 0), 0) / households.length) * 100)],
                  ['Horizon', '48 hours · 15-min native'],
                  ['Skill vs naive', `+${(((households.reduce((s, h) => s + (snapshot.forecasts[h.id]?.skill ?? 0), 0) / households.length) * 100) || 0).toFixed(0)}%`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-2">
                    <span className="text-[10.5px] text-white/35">{label}</span>
                    <span className="num text-[11px] text-white/75">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-white/[0.06] bg-black/20 p-3">
              <div className="flex items-center justify-between">
                <span className="eyebrow text-[8.5px]">Local vs grid supply</span>
                <span className="num text-[10.5px] text-mint-400">{fmtPct(p2pShare)} P2P</span>
              </div>
              <div className="mt-2 flex h-[6px] overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full bg-mint-400" style={{ width: `${p2pShare}%` }} />
                <div className="h-full flex-1 bg-solar/40" />
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[8.5px] uppercase tracking-[0.06em] text-white/25">
                <span>{fmtKwh(kpis.energyTradedKwh)} traded</span>
                <span>{fmtKwh(kpis.gridImportKwh)} imported</span>
              </div>
            </div>
          </Panel>

          <Panel className="flex flex-1 flex-col">
            <SectionHeader
              eyebrow="Settlement queue"
              title="Next deliveries"
              right={
                <button
                  onClick={() => onNavigate('market')}
                  className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/30 hover:text-mint-400"
                >
                  market →
                </button>
              }
            />
            <div className="mt-3 flex-1 space-y-1.5">
              {pending.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.07] py-5 text-center">
                  <span className="text-[11.5px] text-white/40">All forward contracts settled</span>
                  <span className="mt-1 text-[10px] text-white/25">Run the day-ahead auction to open tomorrow</span>
                </div>
              )}
              {pending.map((c) => {
                const buyer = households.find((h) => h.id === c.buyerId);
                const seller = households.find((h) => h.id === c.sellerId);
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-2.5 rounded-lg border border-white/[0.045] bg-black/20 px-2.5 py-2"
                  >
                    <div className="flex h-7 w-9 shrink-0 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.02]">
                      <span className="num text-[9.5px] text-white/60">{fmtTime(c.slot, timezone)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-[10.5px] text-white/70">
                        <span className="truncate">{seller?.name.replace(' House', '')}</span>
                        <ArrowRight size={9} className="text-white/25" />
                        <span className="truncate">{buyer?.name.replace(' House', '')}</span>
                      </div>
                      <div className="num mt-0.5 text-[9px] text-white/30">
                        {c.qtyKwh.toFixed(1)} kWh · {fmtPrice(c.price)}
                      </div>
                    </div>
                    <span className="h-1.5 w-1.5 rounded-full bg-mint-400/60" />
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/25">
                {contracts.filter((c) => c.status === 'pending').length} pending
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-solar">
                <Timer size={9} />
                {fmtDay(clock, timezone)}
              </span>
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: 'Energy settled',
            value: kpis.energyTradedKwh.toFixed(1),
            unit: 'kWh',
            sub: `${kpis.p2pTrades} P2P contracts · ${fmtPct(p2pShare)} of demand`,
            tone: 'mint' as const,
            icon: <BatteryCharging size={14} />,
            spark: tradedSpark,
            color: '#5CE1A8',
          },
          {
            label: 'CO₂ avoided',
            value: kpis.co2AvoidedKg.toFixed(1),
            unit: 'kg',
            sub: 'Displaced grid intensity · 0.373 kg/kWh',
            tone: 'mint' as const,
            icon: <Leaf size={14} />,
            spark: tradedSpark.map((v) => v * 0.373),
            color: '#8CF2C6',
          },
          {
            label: 'Resident value',
            value: kpis.householdSavingsUsd.toFixed(2),
            unit: 'USD',
            sub: 'Saved vs retail tariff and feed-in floor',
            tone: 'amber' as const,
            icon: <CircleDollarSign size={14} />,
            spark: tradedSpark.map((v) => v * 0.17),
            color: '#F5B84A',
          },
          {
            label: 'Forecast error',
            value: kpis.avgMape.toFixed(1),
            unit: '%',
            sub: 'Weighted absolute % error · 9 agents',
            tone: kpis.avgMape < 12 ? ('mint' as const) : ('amber' as const),
            icon: <Sparkles size={14} />,
            spark: households.map((h) => snapshot.forecasts[h.id]?.mape ?? 0),
            color: '#67B7F7',
          },
        ].map((item) => (
          <Panel key={item.label} className="pb-3">
            <Stat
              label={item.label}
              value={item.value}
              unit={item.unit}
              sub={item.sub}
              tone={item.tone}
              icon={item.icon}
            />
            <div className="mt-3 opacity-80">
              <Sparkline values={item.spark.length ? item.spark : [0, 0]} color={item.color} height={26} />
            </div>
          </Panel>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-12 xl:col-span-8">
          <SectionHeader
            eyebrow="Uniform-price double auction"
            title="Today's clearing curve"
            right={
              <div className="flex items-center gap-4 font-mono text-[9px] uppercase tracking-[0.08em]">
                <span className="flex items-center gap-1.5 text-mint-400">
                  <span className="h-[2px] w-3 rounded bg-mint-400" /> clearing
                </span>
                <span className="flex items-center gap-1.5 text-white/30">
                  <span className="h-[2px] w-3 rounded bg-white/25" /> retail
                </span>
                <button
                  onClick={() => onNavigate('market')}
                  className="hidden text-white/35 hover:text-mint-400 sm:inline"
                >
                  open book →
                </button>
              </div>
            }
          />
          <div className="mt-4">
            <TimeSeriesChart
              labels={priceLabels}
              series={[
                {
                  key: 'retail',
                  label: 'Retail tariff',
                  color: 'rgba(255,255,255,0.18)',
                  values: today.map(() => 0.284),
                  dashed: true,
                  width: 1,
                },
                {
                  key: 'clear',
                  label: 'P2P clearing',
                  color: '#5CE1A8',
                  values: priceSeries,
                  width: 1.8,
                  fill: true,
                  dot: true,
                },
              ]}
              height={214}
              formatY={(v) => `$${v.toFixed(2)}`}
              formatValue={(v) => `$${v.toFixed(3)}`}
              xTickEvery={3}
              yMin={0}
              yMax={0.33}
            />
          </div>
          <div className="mt-3 flex items-end gap-[3px]" aria-hidden>
            {volumeSeries.map((v, i) => (
              <div key={i} className="group relative flex-1">
                <div
                  className={cx(
                    'w-full rounded-sm transition-colors',
                    v > 0 ? 'bg-mint-500/35 group-hover:bg-mint-400/70' : 'bg-white/[0.035]',
                  )}
                  style={{ height: `${Math.max(2, (v / maxVolume) * 26)}px` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[8.5px] uppercase tracking-[0.08em] text-white/20">
            <span>00:00</span>
            <span>volume by delivery hour</span>
            <span>23:00</span>
          </div>
        </Panel>

        <Panel className="col-span-12 xl:col-span-4">
          <SectionHeader
            eyebrow="Event log"
            title="Grid activity"
            right={
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-mint-400">
                <Dot pulse /> streaming
              </span>
            }
          />
          <div className="mt-3 max-h-[286px] space-y-0.5 overflow-y-auto pr-1">
            {events.slice(0, 12).map((event) => (
              <div key={event.id} className="group flex gap-2.5 rounded-md px-1.5 py-[7px] hover:bg-white/[0.02]">
                <div className="mt-[5px] flex flex-col items-center">
                  <span
                    className={cx(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      EVENT_TONE[event.kind] === 'mint'
                        ? 'bg-mint-400'
                        : EVENT_TONE[event.kind] === 'amber'
                          ? 'bg-solar'
                          : EVENT_TONE[event.kind] === 'blue'
                            ? 'bg-flow'
                            : EVENT_TONE[event.kind] === 'violet'
                              ? 'bg-[#B79CF0]'
                              : 'bg-white/30',
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[10.5px] font-medium text-white/70">{event.actor}</span>
                    <span className="num shrink-0 text-[8.5px] text-white/25">{fmtTime(event.at, timezone)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-white/35">{event.message}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-12 overflow-hidden xl:col-span-8" padded={false}>
          <div className="p-5 pb-3">
            <SectionHeader
              eyebrow="Prosumer register"
              title="Households & storage"
              right={
                <div className="flex items-center gap-2">
                  <CloudSun size={12} className="text-white/30" />
                  <span className="font-mono text-[9.5px] text-white/30">
                    {weatherNow ? `${weatherNow.tempC.toFixed(0)}°C · ${weatherNow.radiationWm2.toFixed(0)} W/m²` : '—'}
                  </span>
                </div>
              }
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-y border-white/[0.05] bg-white/[0.012]">
                  {['Home', 'Position', 'Net now', 'P2P today', 'Revenue', 'MTR balance', 'RECs'].map((h) => (
                    <th key={h} className="px-4 py-2 font-mono text-[8.5px] font-normal uppercase tracking-[0.12em] text-white/25 first:pl-5 last:pr-5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {households.map((h) => {
                  const width = Math.min(100, (Math.abs(h.currentNetKw) / 7) * 100);
                  return (
                    <tr
                      key={h.id}
                      onClick={() => setSelectedId(h.id)}
                      className={cx(
                        'table-row cursor-pointer',
                        selectedId === h.id && 'bg-mint-500/[0.04]',
                      )}
                    >
                      <td className="py-2.5 pl-5 pr-4">
                        <div className="flex items-center gap-2.5">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: h.color }} />
                          <div>
                            <div className="text-[11.5px] text-white/80">{h.name}</div>
                            <div className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-white/25">{h.short}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cx(
                            'inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.08em]',
                            h.status === 'surplus'
                              ? 'border-mint-500/20 bg-mint-500/[0.05] text-mint-400'
                              : h.status === 'deficit'
                                ? 'border-solar/20 bg-solar/[0.05] text-solar'
                                : 'border-white/10 text-white/40',
                          )}
                        >
                          <span
                            className={cx(
                              'h-1 w-1 rounded-full',
                              h.status === 'surplus' ? 'bg-mint-400' : h.status === 'deficit' ? 'bg-solar' : 'bg-white/40',
                            )}
                          />
                          {h.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-[3px] w-16 overflow-hidden rounded-full bg-white/[0.05]">
                            <div
                              className={cx('h-full rounded-full', h.currentNetKw >= 0 ? 'bg-mint-400' : 'bg-solar/80')}
                              style={{ width: `${width}%` }}
                            />
                          </div>
                          <span className="num text-[10px] text-white/55">
                            {h.currentNetKw >= 0 ? '+' : ''}
                            {h.currentNetKw.toFixed(1)}
                          </span>
                        </div>
                      </td>
                      <td className="num px-4 py-2.5 text-[10.5px] text-white/55">{h.todayP2pKwh.toFixed(1)} kWh</td>
                      <td className="num px-4 py-2.5 text-[10.5px] text-white/55">{fmtUsd(h.todayRevenueUsd)}</td>
                      <td className="num px-4 py-2.5 text-[10.5px] text-white/55">{h.balanceMtr.toFixed(1)}</td>
                      <td className="px-4 py-2.5 pr-5">
                        <span className="num text-[10.5px] text-mint-400/80">{h.recKwh.toFixed(0)} kWh</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="col-span-12 xl:col-span-4">
          <SectionHeader
            eyebrow="Explainable autonomy"
            title="Agent rationale"
            right={<Badge tone="violet">9 agents</Badge>}
          />
          <div className="mt-3 space-y-2">
            {latestOrders.map((o) => {
              const h = households.find((x) => x.id === o.householdId);
              return (
                <div key={o.id} className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: h?.color }} />
                      <span className="text-[10.5px] font-medium text-white/70">{h?.name}</span>
                    </div>
                    <span
                      className={cx(
                        'num text-[9px] uppercase tracking-[0.08em]',
                        o.side === 'sell' ? 'text-solar' : 'text-mint-400',
                      )}
                    >
                      {o.side} · {o.qtyKwh.toFixed(1)} kWh
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/35">{o.rationale}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Meter value={o.confidence * 100} tone={o.confidence > 0.8 ? 'mint' : 'amber'} className="flex-1" />
                    <span className="num text-[8.5px] text-white/30">{(o.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => onNavigate('forecast')}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] py-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-white/35 transition-colors hover:border-mint-500/25 hover:text-mint-400"
          >
            inspect forecast model <ArrowUpRight size={10} />
          </button>
        </Panel>
      </div>
    </div>
  );
}


export default function Overview({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { snapshot } = useStore();
  if (!snapshot) return null;
  return <OverviewView snapshot={snapshot} onNavigate={onNavigate} />;
}
