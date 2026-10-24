import { useState } from 'react';
import {
  ArrowRight,
  BatteryCharging,
  Blocks,
  BrainCircuit,
  Check,
  CloudSun,
  Cpu,
  Database,
  Gauge,
  Globe2,
  Layers,
  Leaf,
  Link2,
  Network,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { fmtKwh, fmtPct, fmtUsd, cx } from '../lib/format';
import { Badge, Panel, SectionHeader, Spinner } from '../components/ui';

const SECTIONS = [
  { id: 'abstract', label: 'Abstract' },
  { id: 'problem', label: 'The problem' },
  { id: 'solution', label: 'The solution' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'ai', label: 'Forecasting AI' },
  { id: 'market', label: 'Market design' },
  { id: 'settlement', label: 'Settlement & trust' },
  { id: 'impact', label: 'Climate impact' },
  { id: 'track', label: 'Track alignment' },
  { id: 'scale', label: 'Adoption & scale' },
  { id: 'limits', label: 'Limitations' },
  { id: 'run', label: 'Run locally' },
] as const;

function Anchor({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-[16px] font-medium tracking-[-0.01em] text-white/90">
      {children}
    </h2>
  );
}

function Callout({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
      <div className="flex items-center gap-2 text-mint-400/80">
        {icon}
        <span className="text-[11px] font-medium text-white/70">{title}</span>
      </div>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/35">{children}</p>
    </div>
  );
}

export default function Docs() {
  const { snapshot, act } = useStore();
  const [resetting, setResetting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (!snapshot) return null;

  const reset = async () => {
    setResetting(true);
    try {
      await act('/api/actions/reset');
    } finally {
      setResetting(false);
      setConfirm(false);
    }
  };

  const kpis = snapshot.kpis;
  const annualisedMwh = (kpis.energyTradedKwh / 1) * 365 / 1000;
  const annualAvoided = annualisedMwh * 0.373;

  return (
    <div className="space-y-6">
      <Panel className="relative overflow-hidden p-6 sm:p-8">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-[320px] w-[320px] rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.35), transparent 65%)' }}
        />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="mint">IEEE ClimateChain 2026</Badge>
            <Badge tone="blue">Track 2 · Renewable Energy & Energy Trading</Badge>
            <Badge tone="neutral">Working prototype</Badge>
          </div>
          <h1 className="mt-4 max-w-3xl text-[30px] font-medium leading-[1.15] tracking-[-0.03em] text-white sm:text-[38px]">
            Predictive peer-to-peer energy trading, coordinated by autonomous agents.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-white/45">
            MicroTrade Pro turns a neighbourhood into a self-balancing energy market. Household agents forecast their
            own supply and demand, negotiate forward agreements with neighbours, and settle delivered electrons on a
            verifiable ledger — keeping renewable power local instead of curtailing it.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
            {[
              ['Settled in this session', fmtKwh(kpis.energyTradedKwh)],
              ['CO₂ avoided', `${kpis.co2AvoidedKg.toFixed(1)} kg`],
              ['Forecast error', `${kpis.avgMape.toFixed(1)}%`],
              ['P2P share', fmtPct(kpis.p2pSharePct)],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-white/25">{label}</div>
                <div className="num mt-1 text-[18px] text-white/85">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-3">
          <div className="sticky top-24 hidden lg:block">
            <div className="eyebrow mb-2">Contents</div>
            <nav className="space-y-0.5 border-l border-white/[0.06]">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="-ml-px block border-l border-transparent py-1.5 pl-3 text-[11px] text-white/30 transition-colors hover:border-mint-500/50 hover:text-white/70"
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </div>
        </div>

        <div className="col-span-12 space-y-8 lg:col-span-9">
          <section className="scroll-mt-24">
            <Anchor id="abstract">Abstract</Anchor>
            <div className="mt-3 space-y-3 text-[12px] leading-[1.75] text-white/45">
              <p>
                Rooftop solar is now the cheapest electricity ever built, yet most of it is still traded through a
                century-old, centralised market. A household with a midday surplus is paid a feed-in tariff far below
                retail, while its neighbour pays full retail a few metres away. Distribution networks absorb losses,
                curtailment rises, and residents capture little of the value they create.
              </p>
              <p>
                MicroTrade Pro is a proof-of-concept for a local energy market that clears <em>ahead of time</em> rather
                than reactively. Each prosumer runs a forecasting agent that combines local weather with three weeks of
                meter history to predict the next 48 hours as a probability distribution. A double auction matches
                sellers and buyers hour by hour, and the resulting forward agreements are escrowed in smart contracts
                and settled against delivered kilowatt-hours. The output is a complete, auditable loop from weather to
                forecast to contract to settlement.
              </p>
            </div>
          </section>

          <section className="scroll-mt-24">
            <Anchor id="problem">The problem</Anchor>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Callout icon={<CloudSun size={13} />} title="Forecasting is local">
                Neighbourhood grids are weather- and behaviour-driven. Central forecasts operate at substation scale and
                cannot tell a household agent what a specific roof will produce at 14:00 tomorrow.
              </Callout>
              <Callout icon={<Zap size={13} />} title="Surplus is stranded">
                Export limits, low feed-in tariffs and voltage constraints mean clean generation is curtailed exactly
                when the neighbourhood needs it least but the grid needs it most.
              </Callout>
              <Callout icon={<ShieldCheck size={13} />} title="Trust is missing">
                Without a shared, tamper-evident record of who promised what, neighbours cannot safely enter forward
                agreements, and certificates can be double-counted.
              </Callout>
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-white/35">
              The consequence is measurable: households overpay for imported power, distribution losses rise, and the
              climate value of distributed generation is left on the table.
            </p>
          </section>

          <section className="scroll-mt-24">
            <Anchor id="solution">The solution</Anchor>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                {
                  n: '01',
                  title: 'Predict',
                  icon: <BrainCircuit size={14} />,
                  body: 'A per-household ridge ensemble converts weather + 21 days of meter data into P10/P50/P90 load and solar curves for the next 48 hours.',
                },
                {
                  n: '02',
                  title: 'Coordinate',
                  icon: <Workflow size={14} />,
                  body: 'Each agent turns its forecast into risk-adjusted limit orders. A uniform-price double auction clears every hourly delivery slot and forms forward contracts.',
                },
                {
                  n: '03',
                  title: 'Settle',
                  icon: <Blocks size={14} />,
                  body: 'Buyer escrow and seller bonds are locked on-chain. Delivered energy releases payment, mints a REC, and leaves a verifiable audit trail.',
                },
              ].map((item) => (
                <div key={item.n} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] text-mint-400/60">{item.n}</span>
                    <span className="text-mint-400/70">{item.icon}</span>
                  </div>
                  <div className="mt-3 text-[13px] font-medium text-white/85">{item.title}</div>
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/35">{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="scroll-mt-24">
            <Anchor id="architecture">Architecture</Anchor>
            <p className="mt-2 text-[11.5px] leading-relaxed text-white/35">
              A single deterministic simulation node owns the world state and exposes it over HTTP and Server-Sent
              Events. The React client is a pure view layer, so every number on screen can be reproduced from the
              ledger and the simulation seed.
            </p>
            <div className="mt-4 rounded-2xl border border-white/[0.06] bg-[#080d0b] p-4 sm:p-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
                {[
                  {
                    icon: <Database size={13} />,
                    title: 'Signals',
                    tone: 'text-flow',
                    items: ['Open-Meteo forecast', '21-day meter history', 'Retail + feed-in tariff', 'PV & storage registry'],
                  },
                  {
                    icon: <Cpu size={13} />,
                    title: 'Forecast',
                    tone: 'text-mint-400',
                    items: ['Ridge ensemble per home', '24 seasonal harmonics', 'HDD / CDD weather terms', 'P10–P90 quantiles'],
                  },
                  {
                    icon: <Network size={13} />,
                    title: 'Coordinate',
                    tone: 'text-solar',
                    items: ['9 autonomous agents', 'Risk-shaded limit orders', 'Uniform-price auction', 'Forward contracts'],
                  },
                  {
                    icon: <Blocks size={13} />,
                    title: 'Settle',
                    tone: 'text-[#B79CF0]',
                    items: ['Escrow + delivery bond', 'Metered delivery proof', 'REC mint / retire', 'Signed block history'],
                  },
                ].map((col, i) => (
                  <>
                    <div key={col.title} className="rounded-xl border border-white/[0.06] bg-white/[0.018] p-3.5">
                      <div className={cx('flex items-center gap-2', col.tone)}>
                        {col.icon}
                        <span className="font-mono text-[9px] uppercase tracking-[0.12em]">{col.title}</span>
                      </div>
                      <ul className="mt-2.5 space-y-1.5">
                        {col.items.map((item) => (
                          <li key={item} className="flex items-start gap-1.5 text-[9.5px] leading-snug text-white/35">
                            <span className="mt-[5px] h-[2px] w-[2px] shrink-0 rounded-full bg-white/20" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {i < 3 && (
                      <div key={`arrow-${i}`} className="hidden items-center justify-center lg:flex">
                        <ArrowRight size={13} className="text-white/15" />
                      </div>
                    )}
                  </>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-mint-500/10 bg-mint-500/[0.03] px-3 py-2">
                <span className="flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-mint-400/70">
                  <ShieldCheck size={10} /> Ed25519 signed
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-mint-400/60">
                  <Link2 size={10} /> Merkle committed
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-mint-400/50">
                  <Layers size={10} /> PoA finality
                </span>
                <span className="ml-auto font-mono text-[8.5px] uppercase tracking-[0.1em] text-white/20">
                  React · Three.js · Express · TypeScript
                </span>
              </div>
            </div>
          </section>

          <section className="scroll-mt-24">
            <Anchor id="ai">Forecasting AI</Anchor>
            <div className="mt-3 space-y-3 text-[11.5px] leading-relaxed text-white/40">
              <p>
                Every household trains its own model on 21 days of 15-minute history — about 2,000 samples — using
                ordinary least squares with L2 regularisation. Standardising features before solving the 15×15 normal
                equations keeps the system stable on short windows. A held-out 72-hour tail is never seen during fitting
                and is used to report honest error.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/[0.05] bg-black/25 p-4">
                  <div className="eyebrow text-[8px]">Load model</div>
                  <div className="mt-2 space-y-1 font-mono text-[9.5px] leading-relaxed text-mint-400/70">
                    <div>ŷ(t) = β₀ + Σₖ βₖ xₖ(t)</div>
                    <div className="text-white/30">x = [sin/cos 1..5× daily, weekend,</div>
                    <div className="text-white/30">     CDD, HDD, cloud, irradiance]</div>
                    <div className="pt-1 text-white/25">min ‖y − Xβ‖² + λ‖β‖², λ = 1.4</div>
                  </div>
                </div>
                <div className="rounded-xl border border-white/[0.05] bg-black/25 p-4">
                  <div className="eyebrow text-[8px]">Solar model</div>
                  <div className="mt-2 space-y-1 font-mono text-[9.5px] leading-relaxed text-solar/70">
                    <div>P = kWp × (G × 1.035 / 1000) × η_temp × η_soil</div>
                    <div className="text-white/30">η_temp = 1 − 0.0035 (T − 25)</div>
                    <div className="text-white/30">band = f(cloud forecast error, horizon)</div>
                    <div className="pt-1 text-white/25">quantiles from residual distribution</div>
                  </div>
                </div>
              </div>
              <p>
                Uncertainty is not an afterthought. Residual standard deviation, horizon decay and cloud cover expand
                the P10–P90 band, and those bounds feed directly into the agent's bid/ask shading and the quantity it is
                willing to commit. The UI exposes each forecast's drivers — occupancy rhythm, cooling, heating, weekend
                behaviour, daylight — so residents can see <em>why</em> their agent acted.
              </p>
            </div>
          </section>

          <section className="scroll-mt-24">
            <Anchor id="market">Market design</Anchor>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-[11.5px] font-medium text-white/70">Uniform-price double auction</h3>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/35">
                  Bids are ranked high to low, asks low to high, and the book clears while bid ≥ ask. Every matched pair
                  in a delivery hour settles at the midpoint of the marginal bid and ask. This is simple, strategy-proof
                  enough for a community market, and avoids discriminating between neighbours.
                </p>
              </div>
              <div>
                <h3 className="text-[11.5px] font-medium text-white/70">Forward contracts</h3>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/35">
                  Contracts are hourly, referenced to a delivery timestamp, and collateralised at creation. Buyers
                  escrow the notional; sellers lock a 12% bond. Delivery within 5% settles in full. A shortfall is
                  pro-rated and the bond compensates the buyer.
                </p>
              </div>
              <div>
                <h3 className="text-[11.5px] font-medium text-white/70">Agent policy</h3>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/35">
                  Sellers ask at least LCOE plus battery wear; buyers bid at most retail minus the network charge.
                  Risk appetite controls how much of the forecast surplus/deficit is offered, and how far the limit
                  price is shaded toward the uncertain tail.
                </p>
              </div>
              <div>
                <h3 className="text-[11.5px] font-medium text-white/70">Storage arbitrage</h3>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/35">
                  The community battery bids for cheap midday solar and discharges into the 17:00–21:00 scarcity window,
                  smoothing the local price curve and giving rooftop owners a second buyer for their surplus.
                </p>
              </div>
            </div>
          </section>

          <section className="scroll-mt-24">
            <Anchor id="settlement">Settlement & trust</Anchor>
            <div className="mt-3 space-y-3 text-[11.5px] leading-relaxed text-white/40">
              <p>
                The ledger is a purpose-built, EVM-inspired chain. Every write is an Ed25519-signed transaction with a
                monotonically increasing nonce, gas metering and a fee. Transactions execute inside deterministic
                contracts — <span className="font-mono text-[10px] text-white/55">EnergyForward</span>,{' '}
                <span className="font-mono text-[10px] text-white/55">GreenREC</span> and{' '}
                <span className="font-mono text-[10px] text-white/55">MicroTradeToken</span> — and emit events that the
                explorer renders without trusting the client.
              </p>
              <p>
                Blocks are produced by a single proof-of-authority validator for the prototype. Each block commits its
                transactions to a Merkle root and references its parent hash. The Explorer's “Verify chain” button
                recomputes every stored root and link, and a tamper anywhere in the block body breaks the check. A
                Solidity reference implementation of the same contracts ships in{' '}
                <span className="font-mono text-[10px] text-white/55">contracts/MicroTradeEnergy.sol</span> for a
                production L2 deployment.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Callout icon={<Users size={13} />} title="Resident custody">
                  Each household has its own key derived from a demo seed. The server never holds a shared operator key,
                  and orders can be placed manually when autonomy is disabled.
                </Callout>
                <Callout icon={<Leaf size={13} />} title="Certificate integrity">
                  A REC is minted to the buyer at settlement, with a unique serial and the settlement transaction hash,
                  preventing double counting across the community.
                </Callout>
                <Callout icon={<Gauge size={13} />} title="Auditable forecasts">
                  The hash of the model output is anchored before the auction. Settlement can always be traced back to
                  the exact forecast that justified the price.
                </Callout>
              </div>
            </div>
          </section>

          <section className="scroll-mt-24">
            <Anchor id="impact">Climate impact</Anchor>
            <div className="mt-3 grid gap-4 sm:grid-cols-[1.2fr_1fr]">
              <div className="space-y-3 text-[11.5px] leading-relaxed text-white/40">
                <p>
                  The prototype has settled <span className="text-mint-400">{fmtKwh(kpis.energyTradedKwh)}</span> of
                  peer-to-peer energy in this session, avoiding an estimated{' '}
                  <span className="text-mint-400">{kpis.co2AvoidedKg.toFixed(1)} kg CO₂e</span> at the US grid average of
                  0.373 kg/kWh. Residents captured{' '}
                  <span className="text-solar">{fmtUsd(kpis.householdSavingsUsd)}</span> of value versus default tariffs.
                </p>
                <p>
                  Scaled to a 120-home block with a similar solar profile, the same clearing behaviour represents a
                  meaningful local demand response: generation is consumed within the distribution network, reducing
                  line losses and the need for peaking imports. Each avoided MWh is roughly 0.37 t CO₂e, before
                  accounting for reduced curtailment.
                </p>
                <p className="text-[10.5px] text-white/25">
                  Illustrative annualisation from this session: {annualisedMwh.toFixed(1)} MWh →{' '}
                  {annualAvoided.toFixed(1)} t CO₂e for one 9-node microgrid. Actual impact depends on local grid
                  intensity, PV yield and settlement frequency.
                </p>
              </div>
              <div className="rounded-xl border border-mint-500/15 bg-mint-500/[0.03] p-4">
                <div className="eyebrow text-[8px] text-mint-400/60">Session ledger</div>
                <div className="mt-3 space-y-3">
                  {[
                    ['P2P energy', fmtKwh(kpis.energyTradedKwh)],
                    ['CO₂ avoided', `${kpis.co2AvoidedKg.toFixed(1)} kg`],
                    ['Resident value', fmtUsd(kpis.householdSavingsUsd)],
                    ['RECs minted', `${kpis.recsMinted}`],
                    ['Grid imports displaced', fmtPct(kpis.p2pSharePct)],
                    ['Contracts honoured', `${kpis.contractsSettled} / ${kpis.contractsSettled + kpis.contractsDefaulted}`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between border-b border-white/[0.05] pb-2 last:border-0">
                      <span className="text-[10px] text-white/35">{label}</span>
                      <span className="num text-[11.5px] text-white/80">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="scroll-mt-24">
            <Anchor id="track">Track alignment</Anchor>
            <p className="mt-2 text-[11.5px] leading-relaxed text-white/35">
              Track 2 asks for decentralised, efficient energy systems. The table below maps each challenge bullet to a
              shipped capability in this prototype.
            </p>
            <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.06]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    {['Challenge requirement', 'Implementation in MicroTrade Pro', 'Where to see it'].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-mono text-[8px] font-normal uppercase tracking-[0.12em] text-white/25 first:pl-4">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Peer-to-peer energy trading', 'Hourly uniform-price double auction with autonomous agents and a manual operator console', 'Market'],
                    ['Renewable certificate tracking', 'GreenREC minted per delivered kWh at settlement, unique serial, retire flow', 'Ledger'],
                    ['Microgrid coordination systems', '9-node neighbourhood simulation with live topology, storage, and grid fallback', 'Overview'],
                    ['Tokenized incentives for clean energy', 'MTR settlement token with escrow, seller bonds, and resident proceeds', 'Ledger / Agents'],
                  ].map((row) => (
                    <tr key={row[0]} className="border-b border-white/[0.045] last:border-0">
                      <td className="px-4 py-3 align-top text-[10.5px] leading-snug text-white/65">{row[0]}</td>
                      <td className="px-4 py-3 align-top text-[10.5px] leading-snug text-white/35">{row[1]}</td>
                      <td className="px-4 py-3 align-top">
                        <span className="rounded border border-white/[0.07] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-white/35">
                          {row[2]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ['Climate impact', 'Directly displaces grid imports and monetises avoided CO₂; measurable through settled kWh and RECs.'],
                ['Innovation', 'Forecast-conditioned forward trading: the probability distribution — not just the mean — prices the order.'],
                ['Technical execution', 'Working full-stack simulation, 9 trained models, on-chain settlement, verifiable hashes, tests.'],
                ['Practical usefulness', 'Deployable as a VPP/aggregator layer on existing smart meters with no new hardware.'],
                ['Presentation', 'Live topology, explainable model cards, and an explorer that makes every settlement inspectable.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-lg border border-white/[0.05] bg-white/[0.012] px-3.5 py-3">
                  <div className="flex items-center gap-1.5 text-[10.5px] text-white/70">
                    <Check size={11} className="text-mint-400" /> {title}
                  </div>
                  <p className="mt-1 text-[9.5px] leading-relaxed text-white/30">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="scroll-mt-24">
            <Anchor id="scale">Adoption & scale</Anchor>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Callout icon={<Globe2 size={13} />} title="Regulatory fit">
                FERC Order 2222 opens wholesale markets to distributed aggregation in the US; the EU's Clean Energy
                Package mandates local energy communities. The market layer is designed to plug into both.
              </Callout>
              <Callout icon={<BatteryCharging size={13} />} title="No new hardware">
                The only inputs are smart-meter reads, inverter telemetry and a weather feed — all commonly available.
                Trading runs in software, so a utility or co-op can pilot with existing AMI infrastructure.
              </Callout>
              <Callout icon={<Sparkles size={13} />} title="Economic model">
                A small settlement fee per cleared MWh funds validator operation. Residents keep the spread between the
                feed-in floor and retail, and storage owners earn arbitrage.
              </Callout>
            </div>
          </section>

          <section className="scroll-mt-24">
            <Anchor id="limits">Limitations & next steps</Anchor>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                'Meter and weather history are simulated deterministically; the weather feed is real when online.',
                'The ledger is a local proof-of-authority prototype, not a production L2 with economic finality.',
                'Delivery is verified from simulated smart-meter telemetry, not hardware attestations.',
                'Tariffs, taxes and network charges are simplified and do not constitute market advice.',
                'Next: real smart-meter adapters, zk-attested forecasts, and a hardhat-deployed L2 testnet.',
                'Next: multi-day rolling auctions, demand-response events, and flexibility markets for heat pumps.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 rounded-lg border border-white/[0.045] bg-white/[0.012] px-3 py-2.5 text-[10px] leading-relaxed text-white/35">
                  <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-white/20" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="scroll-mt-24">
            <Anchor id="run">Run locally</Anchor>
            <div className="mt-3 grid gap-4 sm:grid-cols-[1.1fr_1fr]">
              <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4 font-mono text-[10px] leading-relaxed text-white/40">
                <div className="text-white/25"># install & launch</div>
                <div>npm install</div>
                <div>npm run dev</div>
                <div className="mt-3 text-white/25"># web · api</div>
                <div className="text-mint-400/70">http://localhost:5173</div>
                <div className="text-mint-400/70">http://localhost:8787/api/state</div>
                <div className="mt-3 text-white/25"># production</div>
                <div>npm run build && npm start</div>
                <div className="mt-3 text-white/25"># verification</div>
                <div>npm test</div>
              </div>
              <div className="space-y-2.5 text-[10.5px] leading-relaxed text-white/35">
                <p>
                  The stack is React 18 + Vite + Tailwind + Three.js on the client, and Node/Express + TypeScript with a
                  deterministic simulation engine on the server. State is persisted to{' '}
                  <span className="font-mono text-white/55">data/state.json</span>; delete it to reseed.
                </p>
                <p>
                  The simulation advances one hour every six seconds at 1×. Use the play/pause, speed and{' '}
                  <span className="font-mono text-white/55">+1h</span> controls to drive the demo, or run the day-ahead
                  auction for tomorrow from the header.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {['TypeScript', 'React', 'Three.js', 'Express', 'Ed25519', 'Ridge regression'].map((tag) => (
                    <span key={tag} className="rounded border border-white/[0.07] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-white/30">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/15 bg-danger/[0.03] px-4 py-3">
              <div>
                <div className="text-[10.5px] text-white/60">Reset the demonstration</div>
                <p className="text-[9.5px] text-white/25">
                  Rebuilds the world, retrains all nine models and replays the morning settlement.
                </p>
              </div>
              {!confirm ? (
                <button className="btn h-8 border-danger/20 text-[10.5px] text-danger/80 hover:border-danger/40 hover:text-danger" onClick={() => setConfirm(true)}>
                  Reset simulation
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button className="btn h-8 text-[10.5px]" onClick={() => setConfirm(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-primary h-8 text-[10.5px]" onClick={reset} disabled={resetting}>
                    {resetting ? <Spinner size={11} /> : <RefreshCw size={11} />} Confirm reset
                  </button>
                </div>
              )}
            </div>
          </section>

          <div className="flex items-center justify-between border-t border-white/[0.05] pt-4 font-mono text-[8.5px] uppercase tracking-[0.12em] text-white/20">
            <span>MicroTrade Pro · v{snapshot.version}</span>
            <span>Built for IEEE ClimateChain Global Hackathon 2026 · Track 2</span>
          </div>
        </div>
      </div>
    </div>
  );
}
