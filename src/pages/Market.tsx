import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Clock3,
  FileSignature,
  Landmark,
  Layers,
  Lock,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useStore } from '../lib/store';
import type { Snapshot } from '../../shared/types';
import {
  cx,
  fmtDay,
  fmtHourLabel,
  fmtKwh,
  fmtPrice,
  fmtTime,
  fmtUsd,
} from '../lib/format';
import { Badge, CopyButton, Dot, EmptyState, Panel, SectionHeader, Segmented, Stat, Spinner } from '../components/ui';
import { DepthBar, TimeSeriesChart } from '../components/Charts';

const STATUS_TONE: Record<string, string> = {
  pending: 'border-solar/25 bg-solar/[0.06] text-solar',
  settled: 'border-mint-500/25 bg-mint-500/[0.06] text-mint-400',
  partial: 'border-flow/25 bg-flow/[0.06] text-flow',
  defaulted: 'border-danger/25 bg-danger/[0.06] text-danger',
};

function dateKey(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );
}

function MarketView({ snapshot }: { snapshot: Snapshot }) {
  const { act } = useStore();
  const { households, orders, trades, contracts, dayAhead, timezone, clock } = snapshot;
  const currentSlot = useMemo(() => {
    const d = new Date(clock);
    d.setUTCMinutes(0, 0, 0);
    return d.toISOString();
  }, [clock]);

  const defaultSlot =
    dayAhead.find((d) => d.slot === currentSlot && d.volumeKwh > 0)?.slot ??
    dayAhead.find((d) => new Date(d.slot).getTime() >= new Date(clock).getTime() && d.volumeKwh > 0)?.slot ??
    dayAhead.find((d) => d.slot === currentSlot)?.slot ??
    dayAhead[0]?.slot ??
    currentSlot;

  const [slot, setSlot] = useState(defaultSlot);
  useEffect(() => {
    if (!dayAhead.some((d) => d.slot === slot)) setSlot(defaultSlot);
  }, [dayAhead, defaultSlot, slot]);

  const todayKey = dateKey(clock, timezone);
  const todaySlots = dayAhead.filter((d) => dateKey(d.slot, timezone) === todayKey);
  const chartSlots = (todaySlots.length ? todaySlots : dayAhead.slice(0, 24)).slice(0, 24);
  const labels = chartSlots.map((d) => fmtHourLabel(d.slot, timezone));
  const prices = chartSlots.map((d) => (d.volumeKwh > 0 ? d.clearingPrice : null));
  const volumes = chartSlots.map((d) => d.volumeKwh);
  const maxVol = Math.max(1, ...volumes);

  const slotInfo = dayAhead.find((d) => d.slot === slot);
  const slotOrders = orders.filter((o) => o.slot === slot);
  const bids = slotOrders
    .filter((o) => o.side === 'buy')
    .sort((a, b) => b.price - a.price)
    .map((o) => ({ price: o.price, qty: Math.max(0.1, o.qtyKwh - o.filledKwh) }));
  const asks = slotOrders
    .filter((o) => o.side === 'sell')
    .sort((a, b) => a.price - b.price)
    .map((o) => ({ price: o.price, qty: Math.max(0.1, o.qtyKwh - o.filledKwh) }));

  const slotTrades = trades.filter((t) => t.slot === slot);
  const recentTrades = (slotTrades.length ? slotTrades : trades).slice(0, 12);
  const pendingContracts = contracts.filter((c) => c.status === 'pending');
  const escrowLocked = pendingContracts.reduce((s, c) => s + c.escrowMtr, 0);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof dayAhead>();
    for (const d of dayAhead) {
      const key = dateKey(d.slot, timezone);
      const arr = map.get(key) ?? [];
      arr.push(d);
      map.set(key, arr);
    }
    return [...map.entries()].slice(0, 2);
  }, [dayAhead, timezone]);

  // order ticket
  const [householdId, setHouseholdId] = useState('h1');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qty, setQty] = useState('2.0');
  const [price, setPrice] = useState((slotInfo?.clearingPrice || 0.17).toFixed(3));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setPrice((slotInfo?.clearingPrice || 0.17).toFixed(3));
  }, [slot, slotInfo?.clearingPrice]);

  const submit = async () => {
    setSubmitting(true);
    try {
      await act('/api/actions/order', {
        householdId,
        side,
        slot,
        qtyKwh: Number(qty),
        price: Number(price),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const total = Math.max(0, Number(qty) || 0) * Math.max(0, Number(price) || 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Panel>
          <Stat
            label="Cleared volume"
            value={snapshot.market.clearedVolumeKwh.toFixed(1)}
            unit="kWh"
            tone="mint"
            icon={<Zap size={14} />}
            sub={`${trades.length} forward agreements`}
          />
        </Panel>
        <Panel>
          <Stat
            label="Average clearing"
            value={snapshot.market.avgClearingPrice.toFixed(3)}
            unit="$/kWh"
            tone="amber"
            icon={<Landmark size={14} />}
            sub="Uniform-price double auction"
          />
        </Panel>
        <Panel>
          <Stat
            label="Open interest"
            value={(snapshot.market.bidDepthKwh + snapshot.market.askDepthKwh).toFixed(1)}
            unit="kWh"
            tone="blue"
            icon={<Layers size={14} />}
            sub={`${snapshot.market.bidDepthKwh.toFixed(1)} bid · ${snapshot.market.askDepthKwh.toFixed(1)} ask`}
          />
        </Panel>
        <Panel>
          <Stat
            label="Escrow locked"
            value={escrowLocked.toFixed(2)}
            unit="MTR"
            tone="violet"
            icon={<Lock size={14} />}
            sub={`${pendingContracts.length} contracts awaiting delivery`}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 xl:col-span-8">
          <Panel>
            <SectionHeader
              eyebrow="Price formation"
              title="Today's uniform clearing price"
              right={
                <div className="flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.08em]">
                  <span className="flex items-center gap-1.5 text-mint-400">
                    <span className="h-[2px] w-3 rounded bg-mint-400" /> clearing
                  </span>
                  <span className="flex items-center gap-1.5 text-white/30">
                    <span className="h-[2px] w-3 rounded bg-white/20" /> retail
                  </span>
                </div>
              }
            />
            <div className="mt-3">
              <TimeSeriesChart
                labels={labels}
                series={[
                  {
                    key: 'retail',
                    label: 'Retail',
                    color: 'rgba(255,255,255,0.16)',
                    values: chartSlots.map(() => 0.284),
                    dashed: true,
                    width: 1,
                  },
                  {
                    key: 'clear',
                    label: 'Clearing',
                    color: '#5CE1A8',
                    values: prices,
                    fill: true,
                    dot: true,
                    width: 1.8,
                  },
                ]}
                height={190}
                formatY={(v) => `$${v.toFixed(2)}`}
                formatValue={(v) => `$${v.toFixed(3)}`}
                xTickEvery={3}
                yMin={0}
                yMax={0.33}
              />
            </div>
            <div className="mt-2 flex items-end gap-[3px]">
              {volumes.map((v, i) => (
                <div
                  key={i}
                  className="relative flex-1"
                  title={`${labels[i]} · ${v.toFixed(1)} kWh`}
                >
                  <div
                    className={cx('w-full rounded-sm', v > 0 ? 'bg-mint-500/30' : 'bg-white/[0.03]')}
                    style={{ height: `${Math.max(2, (v / maxVol) * 22)}px` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[8.5px] uppercase tracking-[0.08em] text-white/20">
              <span>00:00</span>
              <span>cleared volume</span>
              <span>23:00</span>
            </div>
          </Panel>

          <Panel padded={false}>
            <div className="flex items-center justify-between p-5 pb-3">
              <SectionHeader eyebrow="Delivery book" title="Forward slots" />
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/25">
                {fmtDay(clock, timezone)} · local
              </span>
            </div>
            <div className="overflow-x-auto px-3 pb-4">
              <div className="flex gap-5">
                {grouped.map(([key, slots]) => (
                  <div key={key} className="min-w-0">
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-white/30">
                        {fmtDay(slots[0].slot, timezone)}
                      </span>
                      {key === todayKey && <Badge tone="mint">today</Badge>}
                    </div>
                    <div className="flex gap-1">
                      {slots.map((d) => {
                        const active = d.slot === slot;
                        const past = new Date(d.slot).getTime() < new Date(clock).getTime() - 3600_000;
                        return (
                          <button
                            key={d.slot}
                            onClick={() => setSlot(d.slot)}
                            className={cx(
                              'group relative w-[46px] shrink-0 rounded-md border px-1 pb-1 pt-1.5 text-center transition-all',
                              active
                                ? 'border-mint-500/50 bg-mint-500/[0.09]'
                                : 'border-white/[0.05] bg-white/[0.015] hover:border-white/[0.12]',
                              past && 'opacity-40',
                            )}
                          >
                            <div className={cx('num text-[9.5px]', active ? 'text-mint-300' : 'text-white/55')}>
                              {String(Number(fmtTime(d.slot, timezone).slice(0, 2))).padStart(2, '0')}
                            </div>
                            <div className="mt-1 h-5 flex items-end justify-center gap-[2px]">
                              {[0, 1, 2].map((k) => (
                                <span
                                  key={k}
                                  className={cx(
                                    'w-[2px] rounded-sm',
                                    d.volumeKwh > 0 ? 'bg-mint-500/45' : 'bg-white/[0.06]',
                                  )}
                                  style={{
                                    height: `${Math.max(3, Math.min(20, (d.volumeKwh / (maxVol || 1)) * 20 * (0.5 + k * 0.22)))}px`,
                                  }}
                                />
                              ))}
                            </div>
                            <div className="num mt-[3px] text-[8px] text-white/25">
                              {d.clearingPrice > 0 ? `$${d.clearingPrice.toFixed(2)}` : '—'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel>
            <SectionHeader
              eyebrow="Trade blotter"
              title="Settled peer-to-peer flow"
              right={
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/25">
                  {slotInfo ? fmtHourLabel(slotInfo.slot, timezone) : '—'} delivery
                </span>
              }
            />
            <div className="mt-4 overflow-x-auto">
              {recentTrades.length === 0 ? (
                <EmptyState title="No trades cleared for this slot" detail="Orders may still be resting in the book, or agents found no profitable counterparty." />
              ) : (
                <table className="w-full min-w-[600px] text-left">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {['Time', 'Seller', 'Buyer', 'Volume', 'Price', 'Notional', 'Source', 'Contract'].map((h) => (
                        <th key={h} className="pb-2 font-mono text-[8.5px] font-normal uppercase tracking-[0.12em] text-white/25">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentTrades.map((t) => {
                      const seller = households.find((h) => h.id === t.sellerId);
                      const buyer = households.find((h) => h.id === t.buyerId);
                      const contract = contracts.find((c) => c.id === t.contractId);
                      return (
                        <tr key={t.id} className="table-row">
                          <td className="num py-2.5 text-[10px] text-white/50">{fmtTime(t.slot, timezone)}</td>
                          <td className="py-2.5 text-[10.5px] text-white/70">{seller?.name.replace(' House', '')}</td>
                          <td className="py-2.5 text-[10.5px] text-white/70">{buyer?.name.replace(' House', '')}</td>
                          <td className="num py-2.5 text-[10.5px] text-white/55">{t.qtyKwh.toFixed(2)} kWh</td>
                          <td className="num py-2.5 text-[10.5px] text-mint-400">{fmtPrice(t.price)}</td>
                          <td className="num py-2.5 text-[10.5px] text-white/55">{fmtUsd(t.qtyKwh * t.price)}</td>
                          <td className="py-2.5">
                            <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-white/30">
                              {t.source.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2.5">
                            {contract ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="num text-[9px] text-flow/80">{contract.address.slice(0, 8)}…</span>
                                <CopyButton value={contract.address} label="" />
                              </span>
                            ) : (
                              <span className="text-white/20">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Panel>
        </div>

        <div className="col-span-12 space-y-4 xl:col-span-4">
          <Panel>
            <SectionHeader
              eyebrow="Order book"
              title={slotInfo ? `${fmtHourLabel(slotInfo.slot, timezone)} delivery` : 'Delivery slot'}
              right={
                slotInfo?.volumeKwh ? (
                  <Badge tone="mint">{slotInfo.volumeKwh.toFixed(1)} kWh cleared</Badge>
                ) : (
                  <Badge tone="neutral">uncleared</Badge>
                )
              }
            />
            <div className="mt-4">
              {bids.length || asks.length ? (
                <DepthBar bids={bids} asks={asks} marker={slotInfo?.clearingPrice || undefined} />
              ) : (
                <EmptyState title="Order book is empty" detail="No agent submitted an order for this delivery hour." />
              )}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.05] pt-3">
              {[
                ['Demand', `${(slotInfo?.demandKwh ?? 0).toFixed(1)} kWh`],
                ['Supply', `${(slotInfo?.supplyKwh ?? 0).toFixed(1)} kWh`],
                ['Spread', bids[0] && asks[0] ? fmtPrice(Math.max(0, bids[0].price - asks[0].price)) : '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-white/25">{label}</div>
                  <div className="num mt-1 text-[11px] text-white/65">{value}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <SectionHeader eyebrow="Operator console" title="Place a limit order" right={<Badge tone="blue">manual</Badge>} />
            <div className="mt-4 space-y-3">
              <div>
                <label className="eyebrow mb-1.5 block text-[8.5px]">Household</label>
                <select
                  className="input appearance-none"
                  value={householdId}
                  onChange={(e) => setHouseholdId(e.target.value)}
                >
                  {households.map((h) => (
                    <option key={h.id} value={h.id} className="bg-[#0b100e]">
                      {h.name} · {h.balanceMtr.toFixed(0)} MTR
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="eyebrow mb-1.5 block text-[8.5px]">Side</label>
                  <Segmented
                    options={[
                      { value: 'buy', label: 'Buy' },
                      { value: 'sell', label: 'Sell' },
                    ]}
                    value={side}
                    onChange={setSide}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="eyebrow mb-1.5 block text-[8.5px]">Volume · kWh</label>
                  <input className="input" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" />
                </div>
              </div>
              <div>
                <label className="eyebrow mb-1.5 block text-[8.5px]">Limit price · $/kWh</label>
                <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2">
                <span className="text-[10px] text-white/30">Maximum notional</span>
                <span className="num text-[12px] text-white/80">{fmtUsd(total)}</span>
              </div>
              <button className="btn btn-primary w-full" onClick={submit} disabled={submitting || !Number(qty) || !Number(price)}>
                {submitting ? <Spinner size={12} /> : <FileSignature size={12} />}
                Submit {side} order
              </button>
              <p className="text-[9.5px] leading-relaxed text-white/25">
                Crossing orders execute instantly at the midpoint. Otherwise the order rests in the book until a
                counterparty arrives or the delivery hour passes.
              </p>
            </div>
          </Panel>

          <Panel>
            <SectionHeader
              eyebrow="On-chain agreements"
              title="Forward contracts"
              right={<span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-mint-400"><ShieldCheck size={11} /> escrowed</span>}
            />
            <div className="mt-3 space-y-1.5">
              {contracts.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg border border-white/[0.045] bg-black/20 px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[9.5px] text-white/55">
                      <span className="num">{fmtTime(c.slot, timezone)}</span>
                      <ArrowRight size={8} className="text-white/20" />
                      <span className="truncate">
                        {households.find((h) => h.id === c.sellerId)?.name.replace(' House', '')}
                      </span>
                      <ArrowRight size={8} className="text-white/20" />
                      <span className="truncate">
                        {households.find((h) => h.id === c.buyerId)?.name.replace(' House', '')}
                      </span>
                    </div>
                    <div className="num mt-0.5 text-[8.5px] text-white/25">
                      {c.qtyKwh.toFixed(1)} kWh · {fmtPrice(c.price)} · {c.deliveredKwh.toFixed(1)} delivered
                    </div>
                  </div>
                  <span className={cx('rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em]', STATUS_TONE[c.status])}>
                    {c.status}
                  </span>
                </div>
              ))}
              {contracts.length === 0 && <EmptyState title="No forward contracts yet" />}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/25">
                {contracts.filter((c) => c.status === 'settled').length} settled
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-white/25">
                <Clock3 size={9} /> hourly delivery
              </span>
            </div>
          </Panel>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.012] px-4 py-3">
        <div className="flex items-center gap-2 text-[10.5px] text-white/30">
          <Dot tone="mint" />
          Agents pay at most retail − network charge; they sell at or above LCOE + storage wear. The clearing midpoint is
          the settlement price for every matched pair.
        </div>
        <button
          className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-white/30 hover:text-mint-400"
          onClick={() => act('/api/actions/day-ahead')}
        >
          clear tomorrow <ArrowUpRight size={10} />
        </button>
      </div>
    </div>
  );
}

export default function Market() {
  const { snapshot } = useStore();
  if (!snapshot) return null;
  return <MarketView snapshot={snapshot} />;
}
