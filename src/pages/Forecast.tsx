import { useEffect, useMemo, useState } from 'react';
import { Cloud, CloudSun, Gauge, Radar, Sun, Wind, Zap, ArrowUpRight, CircleHelp } from 'lucide-react';
import { useStore } from '../lib/store';
import type { Snapshot } from '../../shared/types';
import { fmtDay, fmtHourLabel, fmtKwh, fmtPct, fmtTime, cx } from '../lib/format';
import { Badge, Dot, Meter, Panel, SectionHeader, Stat } from '../components/ui';
import { TimeSeriesChart } from '../components/Charts';

function ForecastView({ snapshot }: { snapshot: Snapshot }) {
  const { act } = useStore();
  const [selected, setSelected] = useState('h1');
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');

  const { households, forecasts, tomorrowForecasts, weatherNow, timezone, clock } = snapshot;
  const tomorrowAvailable = Boolean(tomorrowForecasts?.[selected]);

  const forecast = day === 'tomorrow' ? tomorrowForecasts?.[selected] : forecasts[selected];
  const points = useMemo(() => {
    if (!forecast) return [];
    if (day === 'today') {
      // Show the whole operating day, starting at local midnight.
      return forecast.points.slice(0, 24);
    }
    return forecast.points.slice(0, 24);
  }, [forecast, day]);

  const labels = points.map((p) => fmtHourLabel(p.t, timezone));
  const household = households.find((h) => h.id === selected)!;

  useEffect(() => {
    if (day === 'tomorrow' && !tomorrowAvailable) setDay('today');
  }, [day, tomorrowAvailable]);

  const metrics = [
    ['WAPE', `${forecast?.mape ?? 0}%`],
    ['Skill vs naive', `+${((forecast?.skill ?? 0) * 100).toFixed(0)}%`],
    ['Mean confidence', fmtPct((forecast?.confidence ?? 0) * 100)],
    ['Horizon', `${forecast?.horizonHours ?? 48}h`],
  ];

  const drivers = forecast?.drivers ?? [];
  const maxDriver = Math.max(1, ...drivers.map((d) => Math.abs(d.contribution)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {households.map((h) => (
            <button
              key={h.id}
              onClick={() => setSelected(h.id)}
              className={cx(
                'inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] transition-all',
                selected === h.id
                  ? 'border-white/20 bg-white/[0.06] text-white'
                  : 'border-white/[0.05] text-white/40 hover:border-white/10 hover:text-white/70',
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: h.color }} />
              {h.name.replace(' House', '').replace('Community ', '')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-black/30 p-0.5">
          <button
            onClick={() => setDay('today')}
            className={cx(
              'rounded-[6px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em]',
              day === 'today' ? 'bg-white/[0.08] text-white' : 'text-white/35 hover:text-white/70',
            )}
          >
            Today
          </button>
          <button
            onClick={() => setDay('tomorrow')}
            disabled={!tomorrowAvailable}
            className={cx(
              'rounded-[6px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-30',
              day === 'tomorrow' ? 'bg-white/[0.08] text-white' : 'text-white/35 hover:text-white/70',
            )}
          >
            Tomorrow
          </button>
        </div>
      </div>

      {day === 'tomorrow' && !tomorrowAvailable ? (
        <Panel className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Radar size={22} className="text-mint-400/60" />
          <div>
            <div className="text-[14px] text-white/80">Tomorrow's forecast is not published yet</div>
            <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-relaxed text-white/35">
              Agents publish a fresh probabilistic forecast when the day-ahead auction opens for the next delivery day.
            </p>
          </div>
          <button className="btn btn-primary mt-1" onClick={() => act('/api/actions/day-ahead')}>
            <Zap size={12} /> Run day-ahead auction
          </button>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-12 gap-4">
            <Panel className="col-span-12 xl:col-span-8">
              <SectionHeader
                eyebrow={`${household.name} · ${household.archetype}`}
                title={day === 'today' ? 'Today · delivery-day forecast' : 'Tomorrow · delivery-day forecast'}
                right={
                  <div className="hidden items-center gap-4 font-mono text-[9px] uppercase tracking-[0.08em] sm:flex">
                    <span className="flex items-center gap-1.5 text-solar">
                      <span className="h-[2px] w-3 rounded bg-solar" /> solar
                    </span>
                    <span className="flex items-center gap-1.5 text-flow">
                      <span className="h-[2px] w-3 rounded bg-flow" /> load
                    </span>
                    <span className="flex items-center gap-1.5 text-mint-400">
                      <span className="h-[2px] w-3 rounded bg-mint-400" /> net
                    </span>
                  </div>
                }
              />
              <div className="mt-4">
                <TimeSeriesChart
                  labels={labels}
                  series={[
                    {
                      key: 'solar',
                      label: 'Solar P50',
                      color: '#F5B84A',
                      values: points.map((p) => p.solarP50),
                      fill: true,
                      width: 1.6,
                    },
                    {
                      key: 'load',
                      label: 'Load P50',
                      color: '#67B7F7',
                      values: points.map((p) => p.loadP50),
                      fill: true,
                      width: 1.6,
                    },
                    {
                      key: 'net',
                      label: 'Net position',
                      color: '#5CE1A8',
                      values: points.map((p) => p.netP50),
                      width: 1.9,
                      dashed: false,
                    },
                  ]}
                  bands={[
                    { upper: points.map((p) => p.solarP90), lower: points.map((p) => p.solarP10), color: 'rgba(245,184,74,0.09)' },
                    { upper: points.map((p) => p.loadP90), lower: points.map((p) => p.loadP10), color: 'rgba(103,183,247,0.075)' },
                  ]}
                  height={286}
                  formatY={(v) => `${v.toFixed(1)}`}
                  formatValue={(v) => `${v.toFixed(2)} kWh`}
                  xTickEvery={3}
                  zeroLine
                />
              </div>
              <div className="mt-4 grid gap-3 border-t border-white/[0.05] pt-3 sm:grid-cols-3">
                <div className="flex items-start gap-2 text-[10.5px] leading-relaxed text-white/35">
                  <Sun size={12} className="mt-0.5 shrink-0 text-solar/70" />
                  Shaded regions are the P10–P90 band from residual quantiles and cloud-cover uncertainty.
                </div>
                <div className="flex items-start gap-2 text-[10.5px] leading-relaxed text-white/35">
                  <Gauge size={12} className="mt-0.5 shrink-0 text-mint-400/70" />
                  Error is WAPE across a held-out 72-hour window, not in-sample fit.
                </div>
                <div className="flex items-start gap-2 text-[10.5px] leading-relaxed text-white/35">
                  <CircleHelp size={12} className="mt-0.5 shrink-0 text-white/30" />
                  Generated {fmtDay(forecast?.generatedAt, timezone)} at {fmtTime(forecast?.generatedAt, timezone)}.
                </div>
              </div>
            </Panel>

            <div className="col-span-12 space-y-4 xl:col-span-4">
              <Panel>
                <SectionHeader eyebrow="Model performance" title="Ridge forecast ensemble" right={<Badge tone="mint">ridge v1</Badge>} />
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="num text-[34px] leading-none text-white">{(100 - (forecast?.mape ?? 0)).toFixed(1)}%</div>
                    <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/30">Forecast accuracy</div>
                  </div>
                  <div className="text-right">
                    <div className="num text-[15px] text-mint-400">+{((forecast?.skill ?? 0) * 100).toFixed(0)}%</div>
                    <div className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-white/25">skill vs naive</div>
                  </div>
                </div>
                <div className="mt-3">
                  <Meter value={100 - (forecast?.mape ?? 0)} tone="mint" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {metrics.map(([label, value]) => (
                    <div key={label}>
                      <div className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-white/25">{label}</div>
                      <div className="num mt-0.5 text-[12px] text-white/75">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg border border-white/[0.05] bg-black/20 p-2.5">
                  <p className="text-[10px] leading-relaxed text-white/30">
                    24 seasonal harmonics + cooling/heating degree terms + cloud and irradiance, standardised and solved
                    with L2 regularisation. Trained on 21 days of 15-minute meter data.
                  </p>
                </div>
              </Panel>

              <Panel>
                <SectionHeader eyebrow="Attribution" title="What drives the forecast" />
                <div className="mt-3.5 space-y-2.5">
                  {drivers.map((d) => (
                    <div key={d.label}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[10.5px] text-white/60">{d.label}</span>
                        <span className={cx('num text-[10px]', d.contribution >= 0 ? 'text-white/55' : 'text-flow')}>
                          {d.contribution >= 0 ? '+' : ''}
                          {d.contribution.toFixed(1)} kWh
                        </span>
                      </div>
                      <div className="mt-1 flex h-[3px] overflow-hidden rounded-full bg-white/[0.05]">
                        <div
                          className={cx('h-full rounded-full', d.contribution >= 0 ? 'bg-mint-500/70' : 'bg-flow/60')}
                          style={{ width: `${(Math.abs(d.contribution) / maxDriver) * 100}%` }}
                        />
                      </div>
                      <p className="mt-0.5 text-[9px] leading-relaxed text-white/20">{d.detail}</p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <SectionHeader eyebrow="Inputs" title="Local weather signal" right={<Badge tone="blue">open-meteo</Badge>} />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {[
                    ['Temperature', weatherNow ? `${weatherNow.tempC.toFixed(1)} °C` : '—', <Sun size={12} key="t" />],
                    ['Cloud cover', weatherNow ? `${weatherNow.cloudPct.toFixed(0)}%` : '—', <Cloud size={12} key="c" />],
                    ['Irradiance', weatherNow ? `${weatherNow.radiationWm2.toFixed(0)} W/m²` : '—', <CloudSun size={12} key="i" />],
                    ['Wind', weatherNow ? `${weatherNow.windKph.toFixed(0)} km/h` : '—', <Wind size={12} key="w" />],
                  ].map(([label, value, icon]) => (
                    <div key={label as string} className="rounded-lg border border-white/[0.05] bg-black/20 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-white/25">{label}</span>
                        <span className="text-white/25">{icon}</span>
                      </div>
                      <div className="num mt-1.5 text-[12.5px] text-white/75">{value}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Panel>
              <Stat label="Daily load" value={(forecast?.dailyLoadKwh ?? 0).toFixed(1)} unit="kWh" tone="blue" sub="Next 24 delivery hours" />
            </Panel>
            <Panel>
              <Stat label="Daily generation" value={(forecast?.dailySolarKwh ?? 0).toFixed(1)} unit="kWh" tone="amber" sub={`Peak ${(forecast?.peakSolarKw ?? 0).toFixed(1)} kW at roof`} />
            </Panel>
            <Panel>
              <Stat label="Surplus window" value={(forecast?.surplusKwh ?? 0).toFixed(1)} unit="kWh" tone="mint" sub="Sell-side liquidity offered to neighbourhood" />
            </Panel>
            <Panel>
              <Stat label="Deficit window" value={(forecast?.deficitKwh ?? 0).toFixed(1)} unit="kWh" tone="red" sub="Residual demand after solar" />
            </Panel>
          </div>

          <Panel padded={false} className="overflow-hidden">
            <div className="flex items-center justify-between p-5 pb-3">
              <SectionHeader eyebrow="Delivery schedule" title="Hourly forecast ledger" />
              <div className="flex items-center gap-2">
                <Dot tone="mint" />
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/25">P10 / P50 / P90</span>
              </div>
            </div>
            <div className="max-h-[320px] overflow-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead className="sticky top-0 bg-[#0a0f0d]">
                  <tr className="border-y border-white/[0.05]">
                    {['Hour', 'Load P10', 'Load P50', 'Load P90', 'Solar P50', 'Net position', 'Confidence'].map((h) => (
                      <th key={h} className="px-4 py-2 font-mono text-[8.5px] font-normal uppercase tracking-[0.12em] text-white/25 first:pl-5 last:pr-5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.t} className="table-row">
                      <td className="num py-2 pl-5 pr-4 text-[10.5px] text-white/60">{fmtTime(p.t, timezone)}</td>
                      <td className="num px-4 py-2 text-[10px] text-white/30">{p.loadP10.toFixed(2)}</td>
                      <td className="num px-4 py-2 text-[10.5px] text-white/70">{p.loadP50.toFixed(2)}</td>
                      <td className="num px-4 py-2 text-[10px] text-white/30">{p.loadP90.toFixed(2)}</td>
                      <td className="num px-4 py-2 text-[10.5px] text-solar/80">{p.solarP50.toFixed(2)}</td>
                      <td className={cx('num px-4 py-2 text-[10.5px]', p.netP50 >= 0 ? 'text-mint-400' : 'text-white/40')}>
                        {p.netP50 >= 0 ? '+' : ''}
                        {p.netP50.toFixed(2)} kWh
                      </td>
                      <td className="px-4 py-2 pr-5">
                        <div className="flex items-center gap-2">
                          <div className="h-[3px] w-14 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className="h-full rounded-full bg-mint-500/60" style={{ width: `${p.confidence * 100}%` }} />
                          </div>
                          <span className="num text-[9px] text-white/30">{(p.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      <p className="flex items-center gap-1.5 px-1 text-[10px] text-white/20">
        <ArrowUpRight size={10} />
        Forecasts are anchored to the settlement ledger at generation time, so any later trade can be audited against the
        model output that justified it.
      </p>
    </div>
  );
}


export default function Forecast() {
  const { snapshot } = useStore();
  if (!snapshot) return null;
  return <ForecastView snapshot={snapshot} />;
}
