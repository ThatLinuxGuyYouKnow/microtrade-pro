import type {
  Block,
  ChainEvent,
  GreenCertificate,
  LedgerContract,
  Tx,
  TxType,
} from '../../shared/types.js';
import { CONFIG } from '../config.js';
import { sha256, VALIDATOR_WALLET, type Wallet } from './crypto.js';
import { round } from '../../shared/utils.js';

export interface LedgerSnapshot {
  blocks: Block[];
  balances: Record<string, number>;
  nonces: Record<string, number>;
  contracts: LedgerContract[];
  recs: GreenCertificate[];
  totalBlocks: number;
  txCount: number;
  recCounter: number;
  supplyMtr: number;
}

interface PendingTx {
  hash: string;
  type: TxType;
  from: string;
  fromId: string;
  to: string;
  method: string;
  args: Record<string, string | number | boolean>;
  valueMtr: number;
  nonce: number;
  gas: number;
  feeMtr: number;
  signature: string;
  timestamp: string;
}

export interface TxRequest {
  type: TxType;
  fromId: string;
  fromAddress: string;
  to: string;
  method: string;
  args?: Record<string, string | number | boolean>;
  valueMtr?: number;
  gas?: number;
  signer: Wallet;
}

const TX_FEE = 0.002;

function merkleRoot(hashes: string[]): string {
  if (hashes.length === 0) return sha256('empty');
  let level = [...hashes];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = level[i + 1] ?? a;
      next.push(sha256(a + b));
    }
    level = next;
  }
  return level[0];
}

function contractAddress(buyerId: string, sellerId: string, slot: string, seq: number): string {
  return `0x${sha256(`forward:${buyerId}:${sellerId}:${slot}:${seq}`).slice(0, 40)}`;
}

export class Ledger {
  blocks: Block[] = [];
  balances: Record<string, number> = {};
  nonces: Record<string, number> = {};
  contracts: LedgerContract[] = [];
  recs: GreenCertificate[] = [];
  mempool: PendingTx[] = [];
  totalBlocks = 0;
  txCount = 0;
  recCounter = 0;
  supplyMtr = 0;
  private forwardSeq = 0;
  private nonceCounter = 0;

  constructor(balances: Record<string, number>) {
    this.balances = { ...balances };
    this.supplyMtr = Object.values(balances).reduce((a, b) => a + b, 0);
    this.blocks = [this.genesis()];
    this.totalBlocks = 1;
  }

  private genesis(): Block {
    const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, 0)).toISOString();
    const base = { number: 0, parentHash: '0x' + '0'.repeat(64), timestamp, validator: CONFIG.validatorName };
    const hash = sha256(JSON.stringify({ ...base, merkleRoot: sha256('genesis'), nonce: 0 }));
    return {
      number: 0,
      hash,
      parentHash: '0x' + '0'.repeat(64),
      timestamp,
      validator: CONFIG.validatorName,
      txCount: 0,
      merkleRoot: sha256('genesis'),
      gasUsed: 0,
      nonce: 0,
      txHashes: [],
      transactions: [],
    };
  }

  balanceOf(address: string): number {
    return round(this.balances[address] ?? 0, 3);
  }

  submit(req: TxRequest): PendingTx {
    const nonce = this.nonces[req.fromAddress] ?? 0;
    const timestamp = new Date().toISOString();
    const args = req.args ?? {};
    const valueMtr = round(req.valueMtr ?? 0, 3);
    const digest = {
      type: req.type,
      from: req.fromAddress,
      to: req.to,
      method: req.method,
      args,
      valueMtr,
      nonce,
      timestamp,
    };
    const hash = sha256(JSON.stringify(digest));
    const tx: PendingTx = {
      hash,
      type: req.type,
      from: req.fromAddress,
      fromId: req.fromId,
      to: req.to,
      method: req.method,
      args,
      valueMtr,
      nonce,
      gas: req.gas ?? 21_000,
      feeMtr: TX_FEE,
      signature: req.signer.sign(hash),
      timestamp,
    };
    this.mempool.push(tx);
    this.nonces[req.fromAddress] = nonce + 1;
    return tx;
  }

  /** PoA block production. Executes up to `limit` pending transactions. */
  mine(limit = 48): Block | null {
    if (this.mempool.length === 0) return null;
    const batch = this.mempool.splice(0, limit);
    const executed: Tx[] = [];

    for (const pending of batch) {
      const result = this.execute(pending);
      executed.push(result);
      this.txCount += 1;
    }

    const parent = this.blocks[this.blocks.length - 1];
    const hashes = executed.map((t) => t.hash);
    const timestamp = new Date().toISOString();
    const nonce = ++this.nonceCounter;
    const root = merkleRoot(hashes);
    const hash = sha256(
      JSON.stringify({
        number: parent.number + 1,
        parentHash: parent.hash,
        timestamp,
        merkleRoot: root,
        validator: CONFIG.validatorName,
        nonce,
      }),
    );
    const block: Block = {
      number: parent.number + 1,
      hash,
      parentHash: parent.hash,
      timestamp,
      validator: CONFIG.validatorName,
      txCount: executed.length,
      merkleRoot: root,
      gasUsed: executed.reduce((s, t) => s + t.gas, 0),
      nonce,
      txHashes: hashes,
      transactions: executed,
    };
    this.blocks.push(block);
    this.totalBlocks += 1;
    if (this.blocks.length > CONFIG.maxBlocks) this.blocks.splice(1, this.blocks.length - CONFIG.maxBlocks);
    return block;
  }

  flush(): Block[] {
    const produced: Block[] = [];
    let block = this.mine();
    while (block) {
      produced.push(block);
      block = this.mine();
    }
    return produced;
  }

  private execute(pending: PendingTx): Tx {
    const events: ChainEvent[] = [];
    let status: 'success' | 'reverted' = 'success';
    // Snapshot mutable state so a reverted call cannot leak partial writes.
    const snapshot = {
      balances: { ...this.balances },
      contracts: this.contracts.map((c) => ({ ...c })),
      recs: this.recs.map((r) => ({ ...r })),
    };

    try {
      const fromBalance = this.balanceOf(pending.from);
      const totalDebit = pending.valueMtr + pending.feeMtr;
      if (fromBalance < totalDebit) throw new Error('insufficient balance');

      this.balances[pending.from] = round(fromBalance - totalDebit, 3);
      this.balances[VALIDATOR_WALLET.address] = round(
        (this.balances[VALIDATOR_WALLET.address] ?? 0) + pending.feeMtr,
        3,
      );

      if (pending.type === 'transfer') {
        this.balances[pending.to] = round((this.balances[pending.to] ?? 0) + pending.valueMtr, 3);
        events.push({
          name: 'Transfer',
          args: { from: pending.from, to: pending.to, amountMtr: pending.valueMtr },
        });
      } else if (pending.type === 'deploy') {
        this.executeDeploy(pending, events);
      } else if (pending.method === 'settleForward') {
        this.executeSettlement(pending, events);
      } else if (pending.method === 'retireRec') {
        const serial = String(pending.args.serial);
        const rec = this.recs.find((r) => r.serial === serial);
        if (!rec) throw new Error('certificate not found');
        if (rec.retired) throw new Error('certificate already retired');
        if (rec.ownerId !== pending.fromId) throw new Error('not certificate owner');
        rec.retired = true;
        rec.retiredAt = pending.timestamp;
        events.push({ name: 'CertificateRetired', args: { serial, kwh: rec.kwh } });
      } else if (pending.type === 'anchor') {
        events.push({
          name: 'ForecastAnchored',
          args: { root: String(pending.args.root), day: String(pending.args.day), model: 'ridge-v1' },
        });
      } else {
        events.push({ name: 'CallExecuted', args: { method: pending.method } });
      }

      if (pending.type === 'deploy' && pending.valueMtr > 0) {
        // deploy value is escrowed inside the contract, already debited above.
      }
    } catch (error) {
      status = 'reverted';
      this.balances = snapshot.balances;
      this.contracts = snapshot.contracts;
      this.recs = snapshot.recs;
      events.push({
        name: 'Reverted',
        args: { reason: error instanceof Error ? error.message : 'execution error' },
      });
    }

    const tx: Tx = {
      hash: pending.hash,
      type: pending.type,
      from: pending.from,
      to: pending.to,
      method: pending.method,
      args: pending.args,
      valueMtr: pending.valueMtr,
      nonce: pending.nonce,
      gas: pending.gas,
      feeMtr: pending.feeMtr,
      signature: pending.signature,
      status,
      timestamp: pending.timestamp,
      blockNumber: this.totalBlocks,
      events,
    };
    return tx;
  }

  private executeDeploy(pending: PendingTx, events: ChainEvent[]) {
    const buyerId = String(pending.args.buyerId);
    const sellerId = String(pending.args.sellerId);
    const qtyKwh = Number(pending.args.qtyKwh);
    const price = Number(pending.args.price);
    const slot = String(pending.args.slot);
    const bondMtr = Number(pending.args.bondMtr);
    const address = String(pending.args.contractAddress || contractAddress(buyerId, sellerId, slot, ++this.forwardSeq));

    // Lock the seller delivery bond (buyer escrow is the tx value).
    const sellerAddress = String(pending.args.sellerAddress);
    const sellerBalance = this.balanceOf(sellerAddress);
    if (sellerBalance < bondMtr) throw new Error('insufficient seller bond');
    this.balances[sellerAddress] = round(sellerBalance - bondMtr, 3);

    this.contracts.push({
      address,
      kind: 'EnergyForward',
      buyerId,
      sellerId,
      qtyKwh,
      price,
      deliveryStart: slot,
      status: 'active',
      createdAt: pending.timestamp,
    });
    events.push({
      name: 'ForwardOpened',
      args: { contract: address, buyer: buyerId, seller: sellerId, qtyKwh, priceUsd: price, slot },
    });
    events.push({ name: 'BondLocked', args: { seller: sellerId, bondMtr } });
  }

  private executeSettlement(pending: PendingTx, events: ChainEvent[]) {
    const contract = this.contracts.find((c) => c.address === String(pending.args.contract));
    if (!contract) throw new Error('contract not found');
    if (contract.status !== 'active') throw new Error('contract already settled');

    const delivered = Math.min(Number(pending.args.deliveredKwh), contract.qtyKwh ?? 0);
    const qty = contract.qtyKwh ?? 0;
    const price = contract.price ?? 0;
    const escrow = round(qty * price, 3);
    const bond = round(escrow * CONFIG.sellerBondPct, 3);
    const payment = round(delivered * price, 3);
    const buyerId = contract.buyerId ?? '';
    const sellerId = contract.sellerId ?? '';
    const buyerAddress = String(pending.args.buyerAddress);
    const sellerAddress = String(pending.args.sellerAddress);

    const tolerance = qty * CONFIG.tolerancePct;
    const ratio = qty > 0 ? delivered / qty : 0;
    let penalty = 0;
    let status: LedgerContract['status'] = 'settled';

    if (delivered + tolerance < qty) {
      status = ratio < 0.8 ? 'defaulted' : 'settled';
      penalty = round(bond * (ratio < 0.8 ? 0.6 : 0.25), 3);
      events.push({
        name: 'DeliveryShortfall',
        args: { contract: contract.address, deliveredKwh: round(delivered, 2), shortfallKwh: round(qty - delivered, 2) },
      });
    }

    this.balances[buyerAddress] = round((this.balances[buyerAddress] ?? 0) + (escrow - payment) + penalty, 3);
    this.balances[sellerAddress] = round(
      (this.balances[sellerAddress] ?? 0) + payment + (bond - penalty),
      3,
    );

    contract.status = status === 'defaulted' ? 'defaulted' : 'settled';
    if (status === 'defaulted') {
      events.push({ name: 'ContractDefaulted', args: { contract: contract.address, penaltyMtr: penalty } });
    }

    events.push({
      name: 'ForwardSettled',
      args: {
        contract: contract.address,
        buyer: buyerId,
        seller: sellerId,
        deliveredKwh: round(delivered, 3),
        paymentMtr: payment,
        penaltyMtr: penalty,
      },
    });

    if (delivered > 0) {
      this.recCounter += 1;
      const rec: GreenCertificate = {
        id: `rec-${this.recCounter}`,
        serial: `REC-2026-${String(this.recCounter).padStart(5, '0')}`,
        ownerId: buyerId,
        kwh: round(delivered, 2),
        vintage: contract.deliveryStart?.slice(0, 10) ?? pending.timestamp.slice(0, 10),
        project: 'Cedar Hollow Community Solar',
        txHash: pending.hash,
        retired: false,
      };
      this.recs.unshift(rec);
      if (this.recs.length > 80) this.recs.pop();
      events.push({ name: 'GreenCertificateMinted', args: { serial: rec.serial, kwh: rec.kwh, owner: buyerId } });
    }
  }

  integrity(): { ok: boolean; checked: number; brokenAt?: number } {
    let checked = 0;
    for (let i = 1; i < this.blocks.length; i++) {
      const block = this.blocks[i];
      const parent = this.blocks[i - 1];
      const recomputedRoot = merkleRoot(block.txHashes);
      if (block.parentHash !== parent.hash || block.merkleRoot !== recomputedRoot) {
        return { ok: false, checked, brokenAt: block.number };
      }
      checked += 1;
    }
    return { ok: true, checked };
  }

  toJSON(): LedgerSnapshot {
    return {
      blocks: this.blocks,
      balances: this.balances,
      nonces: this.nonces,
      contracts: this.contracts,
      recs: this.recs,
      totalBlocks: this.totalBlocks,
      txCount: this.txCount,
      recCounter: this.recCounter,
      supplyMtr: this.supplyMtr,
    };
  }

  static fromJSON(snapshot: LedgerSnapshot): Ledger {
    const ledger = new Ledger({});
    ledger.blocks = snapshot.blocks;
    ledger.balances = snapshot.balances;
    ledger.nonces = snapshot.nonces;
    ledger.contracts = snapshot.contracts;
    ledger.recs = snapshot.recs;
    ledger.totalBlocks = snapshot.totalBlocks;
    ledger.txCount = snapshot.txCount;
    ledger.recCounter = snapshot.recCounter;
    ledger.supplyMtr = snapshot.supplyMtr;
    ledger.forwardSeq = snapshot.contracts.length;
    return ledger;
  }
}
