import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Bot, BrainCircuit, Gauge, Lock, ShieldCheck, SlidersHorizontal, Zap } from 'lucide-react';
import { useStore } from '../lib/store';
import type { Snapshot, StrategyProfile } from '../../shared/types';
import { cx, fmtKwh, fmtPct, fmtUsd, titleCase } from '../lib/format';
import { Badge, Dot, Meter, Panel, SectionHeader, Stat, Toggle } from '../components/ui';

const STRATEGIES: { value: StrategyProfile; label: string }[] = [
  { value: 'conservative', label: 'Cautious' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'aggressive', label: 'Bold' },
];

function AgentCard({ snapshot, id }: { snapshot: Snapshot; id: string }) {
  const { act } = useStore();
  const household = snapshot.households.find((h) => h.id === id)!;
  const forecast = snapshot.forecasts[id];
  const agentOrders = snapshot.orders.filter((o) => o.householdId === id && o.agent);
  const latest = agentOrders[agentOrders.length - 1];
  const [risk, setRisk] = useState(household.riskAppetite);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setRisk(household.riskAppetite);
  }, [household.riskAppetite, editing]);

  const commitRisk = () => {
    setEditing(false);
    act(`/api/actions/agent/${id}`, { riskAppetite: risk });
  };

  return (
    <div className="panel panel-hover flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg border"
            style={{ borderColor: `${household.color}33`, background: `${household.color}12` }}
          >
            <Bot size={14} style={{ color: household.color }} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-medium text-white/85">{household.name}</span>
              <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-white/20">{household.short}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.06em] text-white/25">
              <span className={household.autonomy ? 'text-mint-400/80' : 'text-solar/80'}>
                {household.autonomy ? 'autonomous' : 'approval mode'}
              </span>
              <span className="text-white/10">·</span>
              <span>{household.strategy}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="num text-[13px] text-mint-400">{household.balanceMtr.toFixed(0)}</div>
          <div className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-white/22">MTR</div>
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-lg border border-white/[0.045] bg-black/20 p-2.5">
        {[
          ['Accuracy', `${(100 - (forecast?.mape ?? 0)).toFixed(0)}%`],
          ['P2P today', `${household.todayP2pKwh.toFixed(1)}`],
          ['Revenue', `$${household.todayRevenueUsd.toFixed(1)}`],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-white/22">{label}</div>
            <div className="num mt-0.5 text-[11px] text-white/70">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-white/25">Strategy</span>
          <div title="Toggle autonomy">
            <Toggle
              checked={household.autonomy}
              onChange={(next) => act(`/api/actions/agent/${id}`, { autonomy: next })}
              label=""
            />
          </div>
        </div>
        <div className="mt-1.5 flex gap-1">
          {STRATEGIES.map((s) => (
            <button
              key={s.value}
              onClick={() => act(`/api/actions/agent/${id}`, { strategy: s.value })}
              className={cx(
                'flex-1 rounded-md border py-1 font-mono text-[8.5px] uppercase tracking-[0.06em] transition-all',
                household.strategy === s.value
                  ? 'border-white/15 bg-white/[0.06] text-white/80'
                  : 'border-white/[0.05] text-white/30 hover:border-white/10 hover:text-white/60',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-white/25">Risk appetite</span>
          <span className="num text-[9px] text-white/45">{(risk * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min={5}
          max={95}
          value={Math.round(risk * 100)}
          onChange={(e) => {
            setEditing(true);
            setRisk(Number(e.target.value) / 100);
          }}
          onMouseUp={commitRisk}
          onTouchEnd={commitRisk}
          onKeyUp={commitRisk}
          className="mt-2 w-full"
          aria-label={`${household.name} risk appetite`}
        />
      </div>

      <div className="mt-3 flex-1 border-t border-white/[0.05] pt-2.5">
        {latest ? (
          <>
            <div className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-white/25">
              <BrainCircuit size={9} />
              latest decision
              <span className="ml-auto text-white/15">{latest.side}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[9.5px] leading-relaxed text-white/35">{latest.rationale}</p>
          </>
        ) : (
          <p className="text-[9.5px] text-white/25">No order submitted for this window.</p>
        )}
      </div>
    </div>
  );
}

function AgentsView({ snapshot }: { snapshot: Snapshot }) {
  const { households } = snapshot;
  const [filter, setFilter] = useState<string>('all');

  const agentOrders = snapshot.orders.filter((o) => o.agent);
  const decisions = useMemo(
    () =>
      agentOrders
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .filter((o) => filter === 'all' || o.householdId === filter)
        .slice(0, 12),
    [agentOrders, filter],
  );

  const active = households.filter((h) => h.autonomy).length;
  const capacity = households.reduce((s, h) => s + h.pvKwp, 0);
  const storage = households.reduce((s, h) => s + h.batteryKwh, 0);
  const avgAccuracy =
    100 - households.reduce((s, h) => s + (snapshot.forecasts[h.id]?.mape ?? 0), 0) / households.length;
  const grossRevenue = households.reduce((s, h) => s + h.todayRevenueUsd, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Panel>
          <Stat
            label="Autonomous fleet"
            value={`${active}/${households.length}`}
            tone="mint"
            icon={<Bot size={14} />}
            sub="Agents trading without human approval"
          />
        </Panel>
        <Panel>
          <Stat
            label="Managed capacity"
            value={capacity.toFixed(1)}
            unit="kWp"
            tone="amber"
            icon={<Zap size={14} />}
            sub={`${storage.toFixed(0)} kWh of distributed storage`}
          />
        </Panel>
        <Panel>
          <Stat
            label="Mean accuracy"
            value={avgAccuracy.toFixed(1)}
            unit="%"
            tone="blue"
            icon={<Gauge size={14} />}
            sub="Weighted absolute % error on holdout"
          />
        </Panel>
        <Panel>
          <Stat
            label="Resident proceeds"
            value={fmtUsd(grossRevenue)}
            tone="violet"
            icon={<ArrowUpRight size={14} />}
            sub={`${fmtKwh(snapshot.kpis.energyTradedKwh)} settled today`}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8">
          <div className="mb-3 flex items-center justify-between">
            <SectionHeader eyebrow="Autonomous agents" title="Fleet configuration" />
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-white/25">
              <Dot pulse tone="mint" /> policies enforced on-chain
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {households.map((h) => (
              <AgentCard key={h.id} snapshot={snapshot} id={h.id} />
            ))}
          </div>
        </div>

        <div className="col-span-12 space-y-4 xl:col-span-4">
          <Panel padded={false}>
            <div className="p-5 pb-3">
              <SectionHeader eyebrow="Reasoning stream" title="Why the fleet acted" right={<Badge tone="violet">{decisions.length}</Badge>} />
              <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
                <button
                  onClick={() => setFilter('all')}
                  className={cx(
                    'shrink-0 rounded-md border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.06em]',
                    filter === 'all' ? 'border-white/15 bg-white/[0.05] text-white/70' : 'border-white/[0.05] text-white/30',
                  )}
                >
                  all
                </button>
                {households.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setFilter(h.id)}
                    className={cx(
                      'shrink-0 rounded-md border px-1.5 py-1 font-mono text-[8px] uppercase tracking-[0.06em]',
                      filter === h.id ? 'border-white/15 bg-white/[0.05] text-white/70' : 'border-white/[0.05] text-white/30',
                    )}
                  >
                    {h.name.replace(' House', '').replace('Community ', '')}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[640px] overflow-y-auto px-4 pb-4">
              {decisions.map((o) => {
                const h = households.find((x) => x.id === o.householdId);
                return (
                  <div key={o.id} className="border-b border-white/[0.04] py-2.5 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full" style={{ background: h?.color }} />
                        <span className="text-[9.5px] text-white/60">{h?.name}</span>
                      </div>
                      <span
                        className={cx(
                          'num text-[8px] uppercase tracking-[0.06em]',
                          o.side === 'sell' ? 'text-solar/80' : 'text-mint-400/80',
                        )}
                      >
                        {o.side} {o.qtyKwh.toFixed(1)} @ ${o.price.toFixed(3)}
                      </span>
                    </div>
                    <p className="mt-1 text-[9.5px] leading-relaxed text-white/30">{o.rationale}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Meter value={o.confidence * 100} tone={o.confidence > 0.8 ? 'mint' : 'amber'} className="flex-1" />
                      <span className="num text-[8px] text-white/20">{(o.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <SectionHeader eyebrow="Control plane" title="Agent policy" right={<SlidersHorizontal size={13} className="text-white/25" />} />
            <div className="mt-3 space-y-3 text-[10px] leading-relaxed text-white/35">
              <div className="flex items-start gap-2.5">
                <Lock size={12} className="mt-0.5 shrink-0 text-mint-400/60" />
                <p>
                  <span className="text-white/60">Reserve prices.</span> Sellers never offer below LCOE + storage wear;
                  buyers never bid above retail minus the network charge. The spread is shaded by P10–P90 uncertainty.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldCheck size={12} className="mt-0.5 shrink-0 text-mint-400/60" />
                <p>
                  <span className="text-white/60">Collateral.</span> Every forward contract locks buyer escrow and a 12%
                  seller delivery bond. Shortfalls release the bond to the harmed counterparty.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <Bot size={12} className="mt-0.5 shrink-0 text-mint-400/60" />
                <p>
                  <span className="text-white/60">Human override.</span> Turning autonomy off stops the agent from
                  submitting new orders; the operator can still place orders manually from the market console.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-mint-500/20 bg-mint-500/[0.05]">
              <ShieldCheck size={14} className="text-mint-400" />
            </div>
            <div>
              <div className="text-[11.5px] text-white/70">Human-in-the-loop by design</div>
              <p className="text-[10px] text-white/30">
                {fmtPct((active / households.length) * 100, 0)} of the fleet is currently autonomous. Every decision,
                override and settlement remains auditable on the ledger.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-5">
            {STRATEGIES.map((s) => (
              <div key={s.value} className="text-center">
                <div className="num text-[13px] text-white/70">
                  {households.filter((h) => h.strategy === s.value).length}
                </div>
                <div className="font-mono text-[8px] uppercase tracking-[0.08em] text-white/25">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

export default function Agents() {
  const { snapshot } = useStore();
  if (!snapshot) return null;
  return <AgentsView snapshot={snapshot} />;
}
