import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Blocks as BlocksIcon,
  ChevronDown,
  CircleDollarSign,
  FileCheck2,
  Fingerprint,
  Hash,
  Landmark,
  Leaf,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useStore } from '../lib/store';
import type { Snapshot, Tx } from '../../shared/types';
import {
  cx,
  fmtDay,
  fmtKwh,
  fmtMtr,
  fmtPrice,
  fmtTime,
  fmtUsd,
  shortAddr,
} from '../lib/format';
import { Badge, CopyButton, EmptyState, Meter, Panel, SectionHeader, Spinner, Stat } from '../components/ui';

function LedgerView({ snapshot }: { snapshot: Snapshot }) {
  const { act } = useStore();
  const { ledger, households, timezone, contracts } = snapshot;
  const [selected, setSelected] = useState<number>(ledger.blocks[0]?.number ?? 0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [verifyState, setVerifyState] = useState<{ ok: boolean; message: string } | null>(
    ledger.chainIntegrity ? { ok: true, message: 'All parent links and Merkle roots valid.' } : null,
  );
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!ledger.blocks.some((b) => b.number === selected) && ledger.blocks[0]) {
      setSelected(ledger.blocks[0].number);
    }
  }, [ledger.blocks, selected]);

  const block = ledger.blocks.find((b) => b.number === selected) ?? ledger.blocks[0];

  const nameFor = (address: string) => {
    const h = households.find((x) => x.address === address);
    if (h) return h.name;
    const b = ledger.balances.find((x) => x.address === address);
    if (b) return b.name;
    if (address === '0xForecastRegistry') return 'Forecast Registry';
    if (address === '0xRECRegistry') return 'REC Registry';
    if (address.startsWith('0x') && address.length === 42) return shortAddr(address);
    return address;
  };

  const verify = async () => {
    setVerifying(true);
    try {
      const result = await act('/api/actions/verify');
      setVerifyState({ ok: Boolean(result.ok), message: String(result.message) });
    } catch {
      setVerifyState({ ok: false, message: 'Verification request failed.' });
    } finally {
      setVerifying(false);
    }
  };

  const activeRecs = ledger.recs.filter((r) => !r.retired);
  const retired = ledger.recs.filter((r) => r.retired);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Panel>
          <Stat
            label="Chain height"
            value={ledger.height.toLocaleString()}
            unit="blocks"
            tone="mint"
            icon={<BlocksIcon size={14} />}
            sub={`${ledger.txCount} signed transactions`}
          />
        </Panel>
        <Panel>
          <Stat
            label="Token supply"
            value={fmtMtr(ledger.totalSupplyMtr, 0)}
            unit="MTR"
            tone="blue"
            icon={<CircleDollarSign size={14} />}
            sub="Energy credit · 1 MTR ≈ 1 USD settled"
          />
        </Panel>
        <Panel>
          <Stat
            label="Green certificates"
            value={activeRecs.length}
            unit="REC"
            tone="amber"
            icon={<Leaf size={14} />}
            sub={`${fmtKwh(activeRecs.reduce((s, r) => s + r.kwh, 0))} unretired`}
          />
        </Panel>
        <Panel>
          <div className="flex h-full flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Consensus integrity</span>
              {ledger.chainIntegrity ? (
                <ShieldCheck size={15} className="text-mint-400" />
              ) : (
                <ShieldAlert size={15} className="text-danger" />
              )}
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className={cx('num text-[22px] leading-none', ledger.chainIntegrity ? 'text-mint-400' : 'text-danger')}>
                {ledger.chainIntegrity ? 'Valid' : 'Fault'}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/25">PoA · Ed25519</span>
            </div>
            <button className="btn mt-3 h-8 w-full" onClick={verify} disabled={verifying}>
              {verifying ? <Spinner size={11} /> : <Fingerprint size={11} />}
              Verify chain
            </button>
            {verifyState && (
              <p className={cx('mt-2 text-[9.5px] leading-relaxed', verifyState.ok ? 'text-mint-400/70' : 'text-danger/80')}>
                {verifyState.message}
              </p>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-12 xl:col-span-4" padded={false}>
          <div className="flex items-center justify-between p-5 pb-3">
            <SectionHeader eyebrow="Block explorer" title="Recent blocks" />
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-mint-400">
              <span className="h-1 w-1 rounded-full bg-mint-400 live-dot" /> final
            </span>
          </div>
          <div className="max-h-[520px] overflow-y-auto px-3 pb-4">
            {ledger.blocks.map((b) => (
              <button
                key={b.number}
                onClick={() => setSelected(b.number)}
                className={cx(
                  'mb-1 flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all',
                  selected === b.number
                    ? 'border-mint-500/25 bg-mint-500/[0.055]'
                    : 'border-transparent hover:border-white/[0.07] hover:bg-white/[0.02]',
                )}
              >
                <div
                  className={cx(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border font-mono text-[10px]',
                    selected === b.number
                      ? 'border-mint-500/30 bg-mint-500/10 text-mint-400'
                      : 'border-white/[0.07] bg-white/[0.02] text-white/40',
                  )}
                >
                  {b.number}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="num text-[10px] text-white/60">{b.hash.slice(0, 18)}…</span>
                    <span className="font-mono text-[8.5px] text-white/25">{fmtTime(b.timestamp, timezone)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.06em] text-white/25">
                    <span>{b.txCount} tx</span>
                    <span className="text-white/10">·</span>
                    <span>{b.gasUsed.toLocaleString()} gas</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="col-span-12 xl:col-span-8" padded={false}>
          {block ? (
            <>
              <div className="border-b border-white/[0.05] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="eyebrow mb-1">Block #{block.number}</div>
                    <div className="flex items-center gap-2">
                      <h2 className="num text-[16px] text-white/90">{block.hash.slice(0, 26)}…</h2>
                      <CopyButton value={block.hash} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="mint">
                      <BadgeCheck size={10} /> final
                    </Badge>
                    <Badge tone="neutral">{block.txCount} successful</Badge>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
                  {[
                    ['Timestamp', `${fmtDay(block.timestamp, timezone)} ${fmtTime(block.timestamp, timezone)}`],
                    ['Validator', block.validator],
                    ['Parent', `${block.parentHash.slice(0, 12)}…`],
                    ['Merkle root', `${block.merkleRoot.slice(0, 12)}…`],
                    ['Gas used', block.gasUsed.toLocaleString()],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-white/25">{label}</div>
                      <div className="num mt-1 truncate text-[10px] text-white/60">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="max-h-[430px] overflow-y-auto">
                {block.transactions.length === 0 && (
                  <div className="p-6">
                    <EmptyState title="Genesis block" detail="The chain begins with the community treasury allocation." />
                  </div>
                )}
                {block.transactions.map((tx) => (
                  <TxRow
                    key={tx.hash}
                    tx={tx}
                    expanded={expanded === tx.hash}
                    onToggle={() => setExpanded(expanded === tx.hash ? null : tx.hash)}
                    nameFor={nameFor}
                    timezone={timezone}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="p-6">
              <EmptyState title="No blocks yet" />
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-12 xl:col-span-5" padded={false}>
          <div className="p-5 pb-3">
            <SectionHeader eyebrow="Settlement token" title="MTR balances" right={<Badge tone="blue">ERC-20 style</Badge>} />
          </div>
          <div className="max-h-[320px] overflow-y-auto px-3 pb-4">
            {ledger.balances.map((b) => {
              const max = Math.max(...ledger.balances.map((x) => x.balance));
              return (
                <div key={b.householdId} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.02]">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.02]">
                    <CircleDollarSign size={11} className="text-white/35" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10.5px] text-white/65">{b.name}</span>
                      <span className="num text-[10.5px] text-white/75">{fmtMtr(b.balance)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Meter value={(b.balance / max) * 100} tone={b.householdId === 'treasury' ? 'amber' : 'mint'} className="flex-1" />
                      <span className="num text-[8px] text-white/20">{shortAddr(b.address)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="col-span-12 xl:col-span-7" padded={false}>
          <div className="flex items-center justify-between p-5 pb-3">
            <SectionHeader eyebrow="Renewable energy certificates" title="Green certificates" />
            <div className="flex items-center gap-2">
              <Badge tone="mint">{activeRecs.length} active</Badge>
              <Badge tone="neutral">{retired.length} retired</Badge>
            </div>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {ledger.recs.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Certificates mint on settlement" detail="Each delivered green kWh mints a REC to the buyer." />
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-[#0a0f0d]">
                  <tr className="border-y border-white/[0.05]">
                    {['Serial', 'Owner', 'Volume', 'Vintage', 'Status', ''].map((h) => (
                      <th key={h} className="px-4 py-2 font-mono text-[8px] font-normal uppercase tracking-[0.1em] text-white/25 first:pl-5 last:pr-5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledger.recs.slice(0, 14).map((rec) => {
                    const owner = households.find((h) => h.id === rec.ownerId);
                    return (
                      <tr key={rec.serial} className="table-row">
                        <td className="py-2 pl-5 pr-4">
                          <div className="num text-[9.5px] text-white/65">{rec.serial}</div>
                          <div className="num text-[8px] text-white/20">{rec.txHash.slice(0, 12)}…</div>
                        </td>
                        <td className="px-4 py-2 text-[10px] text-white/55">{owner?.name ?? rec.ownerId}</td>
                        <td className="num px-4 py-2 text-[10px] text-mint-400/80">{rec.kwh.toFixed(1)} kWh</td>
                        <td className="num px-4 py-2 text-[9.5px] text-white/35">{rec.vintage}</td>
                        <td className="px-4 py-2">
                          {rec.retired ? (
                            <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-white/25">retired</span>
                          ) : (
                            <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-mint-400">active</span>
                          )}
                        </td>
                        <td className="px-4 py-2 pr-5 text-right">
                          {!rec.retired && (
                            <button
                              onClick={() => act(`/api/actions/rec/${rec.serial}/retire`)}
                              className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-white/30 hover:text-mint-400"
                            >
                              retire
                            </button>
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

      <Panel padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
          <SectionHeader eyebrow="Smart-contract registry" title="Energy forward agreements" />
          <div className="flex items-center gap-2">
            <Badge tone="violet">EnergyForward.sol</Badge>
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/25">
              {contracts.filter((c) => c.status === 'pending').length} active · {contracts.filter((c) => c.status === 'settled').length} settled
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-y border-white/[0.05] bg-white/[0.012]">
                {['Contract', 'Delivery', 'Seller', 'Buyer', 'Quantity', 'Price', 'Escrow', 'Delivery status', 'State'].map((h) => (
                  <th key={h} className="px-4 py-2 font-mono text-[8px] font-normal uppercase tracking-[0.1em] text-white/25 first:pl-5 last:pr-5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contracts.slice(0, 12).map((c) => {
                const seller = households.find((h) => h.id === c.sellerId);
                const buyer = households.find((h) => h.id === c.buyerId);
                const ratio = c.qtyKwh ? (c.deliveredKwh / c.qtyKwh) * 100 : 0;
                return (
                  <tr key={c.id} className="table-row">
                    <td className="py-2.5 pl-5 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span className="num text-[9.5px] text-flow/80">{c.address.slice(0, 10)}…</span>
                        <CopyButton value={c.address} label="" />
                      </div>
                      <div className="num mt-0.5 text-[8px] text-white/20">{c.id}</div>
                    </td>
                    <td className="num px-4 py-2.5 text-[9.5px] text-white/55">{fmtTime(c.slot, timezone)}</td>
                    <td className="px-4 py-2.5 text-[10px] text-white/55">{seller?.name.replace(' House', '')}</td>
                    <td className="px-4 py-2.5 text-[10px] text-white/55">{buyer?.name.replace(' House', '')}</td>
                    <td className="num px-4 py-2.5 text-[10px] text-white/55">{c.qtyKwh.toFixed(1)} kWh</td>
                    <td className="num px-4 py-2.5 text-[10px] text-mint-400/80">{fmtPrice(c.price)}</td>
                    <td className="num px-4 py-2.5 text-[10px] text-white/45">{fmtMtr(c.escrowMtr)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Meter
                          value={ratio}
                          tone={c.status === 'defaulted' ? 'red' : c.status === 'settled' ? 'mint' : 'amber'}
                          className="w-14"
                        />
                        <span className="num text-[8.5px] text-white/30">{c.deliveredKwh.toFixed(1)} kWh</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 pr-5">
                      <span
                        className={cx(
                          'rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em]',
                          c.status === 'settled'
                            ? 'border-mint-500/25 bg-mint-500/[0.05] text-mint-400'
                            : c.status === 'pending'
                              ? 'border-solar/25 bg-solar/[0.05] text-solar'
                              : c.status === 'partial'
                                ? 'border-flow/25 bg-flow/[0.05] text-flow'
                                : 'border-danger/25 bg-danger/[0.05] text-danger',
                        )}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: <Fingerprint size={14} />,
            title: 'Signed by the resident',
            body: 'Every transaction is Ed25519-signed by the household wallet. Validators reject any payload whose signature does not recover the sender.',
          },
          {
            icon: <Hash size={14} />,
            title: 'Merkle-committed blocks',
            body: 'Transactions are committed to a Merkle root; each block references its parent hash. Tampering with any field breaks the chain check.',
          },
          {
            icon: <Sparkles size={14} />,
            title: 'Forecasts anchored, not trusted',
            body: 'At auction time the model output hash is anchored on-chain, so settlement can be audited against the exact forecast that priced it.',
          },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-white/[0.05] bg-white/[0.012] p-4">
            <div className="flex items-center gap-2 text-mint-400/80">
              {item.icon}
              <span className="text-[11px] font-medium text-white/70">{item.title}</span>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-white/30">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TxRow({
  tx,
  expanded,
  onToggle,
  nameFor,
  timezone,
}: {
  tx: Tx;
  expanded: boolean;
  onToggle: () => void;
  nameFor: (address: string) => string;
  timezone: string;
}) {
  return (
    <div className="border-b border-white/[0.04] last:border-0">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-white/[0.015]">
        <span
          className={cx(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
            tx.status === 'success'
              ? 'border-mint-500/20 bg-mint-500/[0.05] text-mint-400'
              : 'border-danger/20 bg-danger/[0.05] text-danger',
          )}
        >
          {tx.status === 'success' ? <FileCheck2 size={11} /> : <ShieldAlert size={11} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-white/60">{tx.method}</span>
            <span className="truncate font-mono text-[8.5px] text-white/22">{tx.hash.slice(0, 22)}…</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[8.5px] text-white/25">
            <span>{nameFor(tx.from)}</span>
            <span className="text-white/10">→</span>
            <span className="truncate">{nameFor(tx.to)}</span>
            <span className="text-white/10">·</span>
            <span>{fmtTime(tx.timestamp, timezone)}</span>
          </div>
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <div className="num text-[9.5px] text-white/55">{tx.valueMtr > 0 ? `${fmtMtr(tx.valueMtr)} MTR` : '—'}</div>
          <div className="font-mono text-[8px] uppercase tracking-[0.06em] text-white/20">{tx.gas.toLocaleString()} gas</div>
        </div>
        <ChevronDown size={13} className={cx('shrink-0 text-white/25 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="mx-5 mb-3 rounded-lg border border-white/[0.055] bg-black/30 p-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="eyebrow mb-1 text-[8px]">Signature</div>
              <div className="break-all font-mono text-[8.5px] leading-relaxed text-white/35">{tx.signature}</div>
            </div>
            <div className="space-y-1.5">
              {[
                ['Transaction hash', tx.hash],
                ['From', tx.from],
                ['To', tx.to],
                ['Nonce / fee', `${tx.nonce} / ${tx.feeMtr} MTR`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-white/22">{label}</span>
                  <span className="num truncate text-[8.5px] text-white/45">{value}</span>
                </div>
              ))}
            </div>
          </div>
          {tx.events.length > 0 && (
            <div className="mt-3 border-t border-white/[0.05] pt-2.5">
              <div className="eyebrow mb-1.5 text-[8px]">Emitted events</div>
              <div className="flex flex-wrap gap-1.5">
                {tx.events.map((event, i) => (
                  <span key={i} className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 font-mono text-[8px] text-white/40">
                    <span className="text-mint-400/70">{event.name}</span>
                    <span className="text-white/20"> · </span>
                    {Object.entries(event.args)
                      .slice(0, 4)
                      .map(([k, v]) => `${k}=${String(v).slice(0, 18)}`)
                      .join(' ')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Ledger() {
  const { snapshot } = useStore();
  if (!snapshot) return null;
  return <LedgerView snapshot={snapshot} />;
}
