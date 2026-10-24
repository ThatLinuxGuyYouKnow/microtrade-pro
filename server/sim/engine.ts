import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type {
  ActivityEvent,
  AgentConfigInput,
  ContractStatus,
  DayAheadSlot,
  ForecastSummary,
  ForwardContract,
  GreenCertificate,
  Household,
  HouseholdView,
  Kpis,
  LedgerContract,
  LedgerView,
  Order,
  Snapshot,
  Trade,
  WeatherSlot,
} from '../../shared/types.js';
import { CONFIG } from '../config.js';
import {
  addHours,
  clamp,
  localDateKey,
  round,
  startOfHour,
  sum,
} from '../../shared/utils.js';
import { createHouseholds } from './households.js';
import { buildHistory, actualSlot } from './history.js';
import { isWeekendLocal, localHourOf, rngFor } from './load.js';
import { loadWeather, weatherAt } from './weather.js';
import { forecastAll, forecastHousehold } from '../ai/forecaster.js';
import { buildAgentOrders, riskFor } from '../market/agents.js';
import { doubleAuction } from '../market/auction.js';
import { Ledger, type LedgerSnapshot } from '../chain/ledger.js';
import { sha256, TREASURY_WALLET, VALIDATOR_WALLET, walletFromSeed, type Wallet } from '../chain/crypto.js';

const STATE_FILE = 'data/state.json';

interface Persisted {
  version: string;
  clock: string;
  running: boolean;
  speed: number;
  marketDay: string;
  weatherSource: string;
  weather: WeatherSlot[];
  forecasts: Record<string, ForecastSummary>;
  tomorrowForecasts: Record<string, ForecastSummary> | null;
  orders: Order[];
  trades: Trade[];
  contracts: ForwardContract[];
  dayAhead: DayAheadSlot[];
  events: ActivityEvent[];
  kpis: Kpis;
  settledSlots: string[];
  households: Household[];
  ledger: LedgerSnapshot;
  contractSeq: number;
  eventSeq: number;
  seededAt: string;
}

const emptyKpis = (): Kpis => ({
  energyTradedKwh: 0,
  p2pTrades: 0,
  co2AvoidedKg: 0,
  valueSettledUsd: 0,
  avgMape: 0,
  p2pSharePct: 0,
  recsMinted: 0,
  gridImportKwh: 0,
  gridExportKwh: 0,
  householdSavingsUsd: 0,
  activeAgents: 0,
  contractsSettled: 0,
  contractsDefaulted: 0,
});

export class Engine extends EventEmitter {
  clock = '';
  running = true;
  speed = 1;
  marketDay = '';
  weatherSource = 'synthetic';
  weather: WeatherSlot[] = [];
  forecasts: Record<string, ForecastSummary> = {};
  tomorrowForecasts: Record<string, ForecastSummary> | null = null;
  orders: Order[] = [];
  trades: Trade[] = [];
  contracts: ForwardContract[] = [];
  dayAhead: DayAheadSlot[] = [];
  events: ActivityEvent[] = [];
  kpis: Kpis = emptyKpis();
  settledSlots: string[] = [];
  households: Household[] = [];
  ledger!: Ledger;
  wallets = new Map<string, Wallet>();
  private contractSeq = 0;
  private eventSeq = 0;
  private seededAt = '';
  private lastTick = Date.now();
  private timer: NodeJS.Timeout | null = null;

  private constructor() {
    super();
  }

  // ---------------------------------------------------------------- bootstrap

  static async create(): Promise<Engine> {
    const engine = new Engine();
    const now = new Date().toISOString();
    const persisted = engine.readPersisted();
    if (persisted && persisted.version === CONFIG.version) {
      engine.hydrate(persisted);
      engine.startTicker();
      return engine;
    }
    const weather = await loadWeather(now, false);
    engine.weather = weather.slots;
    engine.weatherSource = weather.source;
    engine.households = createHouseholds();
    engine.buildWallets();
    engine.ledger = engine.freshLedger();
    engine.clock = addHours(localMidnight(now), 13);
    engine.marketDay = localDateKey(engine.clock, CONFIG.timezone);
    engine.seededAt = engine.clock;
    engine.seedDay(localMidnight(now));
    engine.save();
    engine.startTicker();
    return engine;
  }

  static async reset(): Promise<Engine> {
    try {
      if (existsSync(STATE_FILE)) writeFileSync(STATE_FILE, '');
    } catch {
      /* noop */
    }
    return Engine.create();
  }

  private buildWallets() {
    this.wallets.clear();
    for (const household of this.households) {
      this.wallets.set(household.id, walletFromSeed(household.id, `cedar-hollow-resident-${household.id}`));
    }
    this.wallets.set('treasury', TREASURY_WALLET);
    this.wallets.set('validator', VALIDATOR_WALLET);
  }

  private freshLedger(): Ledger {
    const balances: Record<string, number> = {
      [TREASURY_WALLET.address]: 5000,
      [VALIDATOR_WALLET.address]: 40,
    };
    for (const household of this.households) {
      balances[walletFromSeed(household.id, `cedar-hollow-resident-${household.id}`).address] =
        CONFIG.startingBalanceMtr;
    }
    return new Ledger(balances);
  }

  /** Clear today's day-ahead market and replay the morning, so the demo opens with history. */
  private seedDay(dayStart: string) {
    const generatedAt = addHours(dayStart, -6);
    this.forecasts = forecastAll(this.households, this.history(), this.weather, dayStart, generatedAt);
    this.anchorForecasts(generatedAt, 'day-ahead seed');
    const auction = this.clearForecastDay(dayStart, this.forecasts, 'day_ahead');
    this.pushEvent('forecast', 'Forecast Mesh', `9 household agents published 48h probabilistic forecasts · mean MAPE ${this.meanMape().toFixed(1)}%`, generatedAt);
    this.pushEvent(
      'trade',
      'Market',
      `Day-ahead auction cleared ${auction.volume.toFixed(1)} kWh across ${auction.contracts} forward contracts`,
      generatedAt,
    );
    const elapsed = Math.max(0, Math.round((new Date(this.clock).getTime() - new Date(dayStart).getTime()) / 3600_000));
    for (let h = 0; h < elapsed; h++) {
      this.settleSlot(addHours(dayStart, h), true);
    }
    this.pushEvent('system', 'Grid', 'Microgrid simulation restored — agents live, contracts settling hourly', this.clock);
  }

  private history() {
    return buildHistory(this.households, this.clock);
  }

  // -------------------------------------------------------------- market core

  private wallet(id: string): Wallet {
    const wallet = this.wallets.get(id);
    if (!wallet) throw new Error(`unknown wallet ${id}`);
    return wallet;
  }

  private addressOf(id: string): string {
    if (id === 'treasury') return TREASURY_WALLET.address;
    if (id === 'validator') return VALIDATOR_WALLET.address;
    return this.wallet(id).address;
  }

  private clearForecastDay(startIso: string, forecasts: Record<string, ForecastSummary>, source: 'day_ahead' | 'intraday') {
    const createdAt = this.clock;
    const daySlots = Array.from({ length: 24 }, (_, i) => addHours(startIso, i));
    this.orders = this.orders.filter((o) => !daySlots.includes(o.slot));
    for (const household of this.households) {
      const forecast = forecasts[household.id];
      if (!forecast) continue;
      for (const draft of buildAgentOrders(household, forecast)) {
        const slot = draft.slot;
        if (!daySlots.includes(slot)) continue;
        this.orders.push({
          id: `ord-${household.id}-${slot}-${draft.side}-${draft.qtyKwh}`,
          householdId: household.id,
          side: draft.side,
          slot,
          qtyKwh: draft.qtyKwh,
          price: draft.price,
          createdAt,
          agent: true,
          status: 'open',
          filledKwh: 0,
          rationale: draft.rationale,
          confidence: round(draft.confidence, 3),
        });
      }
    }

    let volume = 0;
    let contracts = 0;
    this.dayAhead = this.dayAhead.filter((d) => !daySlots.includes(d.slot));
    for (const slot of daySlots) {
      const result = doubleAuction(slot, this.orders);
      volume += result.volumeKwh;
      this.dayAhead.push({
        slot,
        clearingPrice: result.clearingPrice,
        volumeKwh: result.volumeKwh,
        matchedOrders: result.matchedOrders,
        demandKwh: result.demandKwh,
        supplyKwh: result.supplyKwh,
      });
      result.matches.forEach((match, index) => {
        const contract = this.openContract(match, slot, index, source);
        if (contract) contracts += 1;
      });
    }
    this.orders = this.orders.slice(-CONFIG.maxOrders);
    this.dayAhead.sort((a, b) => a.slot.localeCompare(b.slot));
    this.ledger.flush();
    return { volume, contracts };
  }

  private openContract(
    match: { buyerId: string; sellerId: string; qtyKwh: number; price: number },
    slot: string,
    index: number,
    source: 'day_ahead' | 'intraday',
  ): ForwardContract | null {
    const buyer = this.households.find((h) => h.id === match.buyerId);
    const seller = this.households.find((h) => h.id === match.sellerId);
    if (!buyer || !seller) return null;
    const escrow = round(match.qtyKwh * match.price, 3);
    const bond = round(escrow * CONFIG.sellerBondPct, 3);
    const buyerAddress = this.addressOf(buyer.id);
    const sellerAddress = this.addressOf(seller.id);
    if (this.ledger.balanceOf(buyerAddress) < escrow + 0.01) return null;
    if (this.ledger.balanceOf(sellerAddress) < bond + 0.01) return null;

    this.contractSeq += 1;
    const address = `0x${sha256(`forward:${buyer.id}:${seller.id}:${slot}:${this.contractSeq}`).slice(0, 40)}`;
    const id = `fwd-${this.contractSeq}`;
    const tx = this.ledger.submit({
      type: 'deploy',
      fromId: buyer.id,
      fromAddress: buyerAddress,
      to: address,
      method: 'openForward',
      args: {
        buyerId: buyer.id,
        sellerId: seller.id,
        buyerAddress,
        sellerAddress,
        qtyKwh: match.qtyKwh,
        price: match.price,
        slot,
        bondMtr: bond,
        contractAddress: address,
      },
      valueMtr: escrow,
      gas: 68_000,
      signer: this.wallet(buyer.id),
    });

    const contract: ForwardContract = {
      id,
      address,
      buyerId: buyer.id,
      sellerId: seller.id,
      slot,
      qtyKwh: match.qtyKwh,
      price: match.price,
      escrowMtr: escrow,
      bondMtr: bond,
      deliveredKwh: 0,
      status: 'pending',
      createdAt: this.clock,
    };
    this.contracts.unshift(contract);

    this.trades.unshift({
      id: `tr-${this.contractSeq}`,
      slot,
      buyerId: buyer.id,
      sellerId: seller.id,
      qtyKwh: match.qtyKwh,
      price: match.price,
      clearedAt: this.clock,
      source,
      contractId: id,
      txHash: tx.hash,
    });
    return contract;
  }

  private settleSlot(slot: string, silent = false) {
    if (this.settledSlots.includes(slot)) return;
    this.settledSlots.push(slot);
    if (this.settledSlots.length > 200) this.settledSlots.shift();

    const due = this.contracts.filter((c) => c.slot === slot && c.status === 'pending');
    const weather = weatherAt(this.weather, slot);
    const deliveredBySeller = new Map<string, number>();
    const boughtByBuyer = new Map<string, number>();
    let p2pKwh = 0;
    let p2pValue = 0;
    let settled = 0;
    let defaulted = 0;

    for (const contract of due) {
      const seller = this.households.find((h) => h.id === contract.sellerId);
      if (!seller) continue;
      const actual = actualSlot(seller, weather, slot);
      const availableSurplus = seller.id === 'h9' ? contract.qtyKwh : Math.max(0, actual.netKwh);
      const delivered = round(Math.min(contract.qtyKwh, availableSurplus), 2);
      const ratio = contract.qtyKwh > 0 ? delivered / contract.qtyKwh : 0;

      const tx = this.ledger.submit({
        type: 'call',
        fromId: contract.buyerId,
        fromAddress: this.addressOf(contract.buyerId),
        to: contract.address,
        method: 'settleForward',
        args: {
          contract: contract.address,
          deliveredKwh: delivered,
          buyerAddress: this.addressOf(contract.buyerId),
          sellerAddress: this.addressOf(contract.sellerId),
        },
        gas: 92_000,
        signer: this.wallet(contract.buyerId),
      });

      contract.deliveredKwh = delivered;
      contract.settledAt = this.clock;
      contract.settlementTx = tx.hash;
      contract.status = (delivered >= contract.qtyKwh * (1 - CONFIG.tolerancePct)
        ? 'settled'
        : ratio < 0.8
          ? 'defaulted'
          : 'partial') as ContractStatus;

      p2pKwh += delivered;
      p2pValue += delivered * contract.price;
      deliveredBySeller.set(contract.sellerId, (deliveredBySeller.get(contract.sellerId) ?? 0) + delivered);
      boughtByBuyer.set(contract.buyerId, (boughtByBuyer.get(contract.buyerId) ?? 0) + delivered);
      if (contract.status === 'defaulted') defaulted += 1;
      else settled += 1;
    }

    // Grid fallback for every household's residual position.
    let gridImport = 0;
    let gridExport = 0;
    let savings = 0;
    for (const household of this.households) {
      const actual = actualSlot(household, weather, slot);
      const sold = deliveredBySeller.get(household.id) ?? 0;
      const bought = boughtByBuyer.get(household.id) ?? 0;
      const residual = actual.netKwh - sold + bought;
      if (residual < -0.02) {
        const kwh = -residual;
        gridImport += kwh;
        savings += bought * (CONFIG.retailTariff - averagePrice(this.contracts, slot, household.id, 'buy'));
      } else if (residual > 0.02) {
        gridExport += residual;
        savings += sold * (averagePrice(this.contracts, slot, household.id, 'sell') - CONFIG.feedInTariff);
      }
    }

    this.kpis.energyTradedKwh = round(this.kpis.energyTradedKwh + p2pKwh, 2);
    this.kpis.p2pTrades += due.length;
    this.kpis.valueSettledUsd = round(this.kpis.valueSettledUsd + p2pValue, 2);
    this.kpis.co2AvoidedKg = round(this.kpis.energyTradedKwh * CONFIG.co2PerKwh, 1);
    this.kpis.gridImportKwh = round(this.kpis.gridImportKwh + gridImport, 2);
    this.kpis.gridExportKwh = round(this.kpis.gridExportKwh + gridExport, 2);
    this.kpis.householdSavingsUsd = round(this.kpis.householdSavingsUsd + Math.max(0, savings), 2);
    this.kpis.contractsSettled += settled;
    this.kpis.contractsDefaulted += defaulted;
    this.kpis.recsMinted = this.ledger.recs.length;
    this.kpis.avgMape = this.meanMape();
    this.kpis.p2pSharePct = round(
      (this.kpis.energyTradedKwh / Math.max(0.1, this.kpis.energyTradedKwh + this.kpis.gridImportKwh)) * 100,
      1,
    );
    this.kpis.activeAgents = this.households.filter((h) => h.autonomy).length;

    if (due.length > 0) {
      this.ledger.flush();
      if (!silent) {
        this.pushEvent(
          'settlement',
          'Settlement',
          `${fmtHour(slot)} delivered · ${p2pKwh.toFixed(1)} kWh P2P · ${gridImport.toFixed(1)} kWh grid import · ${defaulted ? `${defaulted} default(s)` : 'all contracts honoured'}`,
        );
      }
    }
  }

  private meanMape(): number {
    const forecasts = Object.values(this.forecasts);
    if (!forecasts.length) return 0;
    const weight = sum(forecasts.map((f) => f.dailyLoadKwh)) || 1;
    return round(forecasts.reduce((s, f) => s + f.mape * f.dailyLoadKwh, 0) / weight, 1);
  }

  private anchorForecasts(at: string, label: string) {
    const root = sha256(JSON.stringify(this.forecasts));
    this.ledger.submit({
      type: 'anchor',
      fromId: 'validator',
      fromAddress: VALIDATOR_WALLET.address,
      to: '0xForecastRegistry',
      method: 'anchorForecast',
      args: { root, day: this.marketDay, label },
      gas: 34_000,
      signer: VALIDATOR_WALLET,
    });
    this.ledger.flush();
    this.pushEvent('chain', 'Forecast Registry', `Forecast batch anchored on-chain · root ${root.slice(0, 14)}…`, at);
  }

  // ------------------------------------------------------------------ actions

  runDayAhead(): { ok: boolean; message: string; volume?: number; contracts?: number } {
    const tomorrowStart = addHours(localMidnight(this.clock), 24);
    const tomorrowKey = localDateKey(tomorrowStart, CONFIG.timezone);
    const existing = this.contracts.some(
      (c) => localDateKey(c.slot, CONFIG.timezone) === tomorrowKey && c.status === 'pending',
    );
    if (existing) {
      return { ok: false, message: 'Tomorrow’s forward market is already cleared. Advance the clock to settle it.' };
    }

    const generatedAt = this.clock;
    const forecasts = forecastAll(
      this.households,
      buildHistory(this.households, this.clock),
      this.weather,
      tomorrowStart,
      generatedAt,
    );
    this.tomorrowForecasts = forecasts;
    this.anchorForecasts(generatedAt, 'day-ahead tomorrow');
    const result = this.clearForecastDay(tomorrowStart, forecasts, 'day_ahead');
    this.pushEvent(
      'trade',
      'Market',
      `Day-ahead auction for ${tomorrowKey}: ${result.volume.toFixed(1)} kWh cleared across ${result.contracts} forward contracts`,
      generatedAt,
    );
    this.save();
    this.emitUpdate();
    return {
      ok: true,
      message: `Cleared ${result.volume.toFixed(1)} kWh for tomorrow across ${result.contracts} contracts.`,
      volume: result.volume,
      contracts: result.contracts,
    };
  }

  advance(hours = 1): void {
    for (let i = 0; i < hours; i++) {
      const previousSlot = startOfHour(this.clock);
      this.clock = addHours(this.clock, CONFIG.slotHours);
      this.settleSlot(previousSlot);

      const newDay = localDateKey(this.clock, CONFIG.timezone);
      if (newDay !== this.marketDay) {
        this.marketDay = newDay;
        const midnight = localMidnight(this.clock);
        this.forecasts =
          this.tomorrowForecasts ??
          forecastAll(this.households, buildHistory(this.households, this.clock), this.weather, midnight, this.clock);
        this.tomorrowForecasts = null;
        this.pushEvent('system', 'Grid', `New operating day ${newDay} — forecasts rolled forward, agents re-armed`, this.clock);
      }
    }
    if (this.orders.length > CONFIG.maxOrders) this.orders = this.orders.slice(-CONFIG.maxOrders);
    if (this.trades.length > CONFIG.maxTrades) this.trades = this.trades.slice(0, CONFIG.maxTrades);
    if (this.contracts.length > 140) this.contracts = this.contracts.slice(0, 140);
    this.save();
    this.emitUpdate();
  }

  setRunning(running: boolean): void {
    this.running = running;
    this.save();
    this.emitUpdate();
  }

  setSpeed(speed: number): void {
    this.speed = clamp(Math.round(speed * 10) / 10, 1, 8);
    this.save();
    this.emitUpdate();
  }

  updateAgent(id: string, input: AgentConfigInput): { ok: boolean; message: string } {
    const household = this.households.find((h) => h.id === id);
    if (!household) return { ok: false, message: 'Unknown household agent' };
    if (input.strategy) {
      household.strategy = input.strategy;
      const defaults = { conservative: 0.28, balanced: 0.52, aggressive: 0.78 } as const;
      household.riskAppetite = defaults[input.strategy];
    }
    if (typeof input.autonomy === 'boolean') household.autonomy = input.autonomy;
    if (typeof input.riskAppetite === 'number') household.riskAppetite = clamp(input.riskAppetite, 0.05, 0.95);
    this.pushEvent(
      'agent',
      household.name,
      `Strategy updated to ${household.strategy} · risk ${(household.riskAppetite * 100).toFixed(0)}% · ${household.autonomy ? 'autonomous' : 'manual approval'}`,
    );
    this.save();
    this.emitUpdate();
    return { ok: true, message: `${household.name} agent updated.` };
  }

  placeOrder(input: {
    householdId: string;
    side: 'buy' | 'sell';
    slot: string;
    qtyKwh: number;
    price: number;
  }): { ok: boolean; message: string; trade?: Trade } {
    const household = this.households.find((h) => h.id === input.householdId);
    if (!household) return { ok: false, message: 'Unknown household' };
    const qty = round(clamp(input.qtyKwh, 0.05, 60), 2);
    const price = round(clamp(input.price, 0.01, 0.6), 3);
    const slot = startOfHour(input.slot);
    const order: Order = {
      id: `ord-manual-${Date.now()}-${household.id}`,
      householdId: household.id,
      side: input.side,
      slot,
      qtyKwh: qty,
      price,
      createdAt: this.clock,
      agent: false,
      status: 'open',
      filledKwh: 0,
      rationale: `Manual ${input.side} order placed by the community operator.`,
      confidence: 1,
    };
    this.orders.push(order);
    this.pushEvent(
      'order',
      household.name,
      `Operator placed a ${qty.toFixed(1)} kWh ${input.side} limit order at $${price.toFixed(3)}/kWh`,
    );

    const opposing = this.orders
      .filter(
        (o) =>
          o.slot === slot &&
          o.id !== order.id &&
          o.side !== input.side &&
          o.status !== 'filled' &&
          o.status !== 'cancelled' &&
          (input.side === 'buy' ? o.price <= price : o.price >= price),
      )
      .sort((a, b) =>
        input.side === 'buy' ? a.price - b.price : b.price - a.price || a.createdAt.localeCompare(b.createdAt),
      )[0];

    if (!opposing) {
      this.save();
      this.emitUpdate();
      return { ok: true, message: 'Order resting in the book — no crossing counterparty yet.' };
    }

    const result = doubleAuction(slot, [order, opposing]);
    if (!result.matches.length) {
      this.save();
      this.emitUpdate();
      return { ok: true, message: 'Order resting in the book — no crossing counterparty yet.' };
    }
    const match = result.matches[0];
    const contract = this.openContract(match, slot, 0, 'intraday');
    this.ledger.flush();
    const trade = this.trades[0];
    if (contract && trade) {
      this.pushEvent(
        'trade',
        'Intraday',
        `Operator order matched ${match.qtyKwh.toFixed(1)} kWh at $${match.price.toFixed(3)}/kWh · contract ${contract.address.slice(0, 10)}…`,
      );
    }
    this.save();
    this.emitUpdate();
    return { ok: true, message: `Matched ${match.qtyKwh.toFixed(1)} kWh at $${match.price.toFixed(3)}/kWh.`, trade };
  }

  retireCertificate(serial: string): { ok: boolean; message: string } {
    const rec = this.ledger.recs.find((r) => r.serial === serial);
    if (!rec) return { ok: false, message: 'Certificate not found' };
    if (rec.retired) return { ok: false, message: 'Certificate already retired' };
    const wallet = this.wallet(rec.ownerId);
    this.ledger.submit({
      type: 'call',
      fromId: rec.ownerId,
      fromAddress: wallet.address,
      to: '0xRECRegistry',
      method: 'retireRec',
      args: { serial },
      gas: 46_000,
      signer: wallet,
    });
    this.ledger.flush();
    this.pushEvent('rec', 'REC Registry', `Certificate ${serial} retired — ${rec.kwh.toFixed(1)} kWh claimed against scope-2 emissions`, this.clock);
    this.save();
    this.emitUpdate();
    return { ok: true, message: `${serial} retired.` };
  }

  verifyChain(): { ok: boolean; checked: number; brokenAt?: number; message: string } {
    const result = this.ledger.integrity();
    return {
      ...result,
      message: result.ok
        ? `Chain verified: ${result.checked} blocks, all parent links and Merkle roots valid.`
        : `Integrity failure at block ${result.brokenAt}.`,
    };
  }

  // ----------------------------------------------------------------- snapshot

  snapshot(): Snapshot {
    const currentSlot = startOfHour(this.clock);
    const weatherNow = weatherAt(this.weather, this.clock);
    const openOrders = this.orders.filter((o) => o.status === 'open');
    const cleared = this.trades.filter((t) => t.source !== 'grid');

    const households: HouseholdView[] = this.households.map((household) => {
      const actual = actualSlot(household, weatherNow, currentSlot);
      const net = actual.netKwh;
      const todayTrades = this.trades.filter(
        (t) =>
          localDateKey(t.slot, CONFIG.timezone) === this.marketDay &&
          (t.buyerId === household.id || t.sellerId === household.id),
      );
      const soldKwh = sum(todayTrades.filter((t) => t.sellerId === household.id).map((t) => t.qtyKwh));
      const boughtKwh = sum(todayTrades.filter((t) => t.buyerId === household.id).map((t) => t.qtyKwh));
      const revenue = sum(
        todayTrades
          .filter((t) => t.sellerId === household.id)
          .map((t) => t.qtyKwh * t.price),
      );
      const recKwh = sum(
        this.ledger.recs.filter((r) => r.ownerId === household.id && !r.retired).map((r) => r.kwh),
      );
      return {
        ...household,
        balanceMtr: this.ledger.balanceOf(this.addressOf(household.id)),
        todayNetKwh: round(
          this.forecasts[household.id]
            ? this.forecasts[household.id].dailySolarKwh - this.forecasts[household.id].dailyLoadKwh
            : net,
          1,
        ),
        todayRevenueUsd: round(revenue, 2),
        todayP2pKwh: round(soldKwh + boughtKwh, 1),
        status: net > 0.3 ? 'surplus' : net < -0.3 ? 'deficit' : 'balanced',
        currentNetKw: round(net, 2),
        recKwh: round(recKwh, 1),
      };
    });

    const blocks = this.ledger.blocks.slice(-22).reverse().map((b) => ({
      ...b,
      transactions: b.transactions.slice(-18),
    }));

    const ledgerContracts: LedgerContract[] = this.ledger.contracts
      .slice(-70)
      .reverse()
      .map((c) => ({ ...c }));

    const recs = this.ledger.recs.slice(0, 40).map((r) => ({ ...r }));

    const balances = [
      ...this.households.map((h) => ({
        householdId: h.id,
        name: h.name,
        address: this.addressOf(h.id),
        balance: this.ledger.balanceOf(this.addressOf(h.id)),
      })),
      {
        householdId: 'treasury',
        name: 'Community Treasury',
        address: TREASURY_WALLET.address,
        balance: this.ledger.balanceOf(TREASURY_WALLET.address),
      },
      {
        householdId: 'validator',
        name: CONFIG.validatorName,
        address: VALIDATOR_WALLET.address,
        balance: this.ledger.balanceOf(VALIDATOR_WALLET.address),
      },
    ];

    const integrity = this.ledger.integrity();
    const ledger: LedgerView = {
      height: this.ledger.totalBlocks,
      txCount: this.ledger.txCount,
      totalBlocks: this.ledger.totalBlocks,
      lastBlockHash: this.ledger.blocks[this.ledger.blocks.length - 1]?.hash ?? '',
      validator: CONFIG.validatorName,
      chainIntegrity: integrity.ok,
      totalSupplyMtr: round(this.ledger.supplyMtr, 2),
      blocks,
      contracts: ledgerContracts,
      recs,
      balances,
    };

    const futureWeather = this.weather.filter((w) => new Date(w.t).getTime() >= new Date(currentSlot).getTime() - 3600_000).slice(0, 26);
    const nextDelivery = this.contracts
      .filter((c) => c.status === 'pending')
      .map((c) => c.slot)
      .sort()[0] ?? null;

    return {
      version: CONFIG.version,
      track: CONFIG.track,
      clock: this.clock,
      timezone: CONFIG.timezone,
      running: this.running,
      speed: this.speed,
      phase: this.running ? 'live' : 'paused',
      weatherNow,
      weather: futureWeather,
      households,
      forecasts: this.forecasts,
      tomorrowForecasts: this.tomorrowForecasts,
      orders: this.orders
        .filter((o) => o.status !== 'cancelled')
        .slice(-CONFIG.maxOrders)
        .sort((a, b) => a.slot.localeCompare(b.slot)),
      trades: this.trades.slice(0, CONFIG.maxTrades),
      contracts: this.contracts.slice(0, 100),
      dayAhead: this.dayAhead.slice(-48),
      ledger,
      events: this.events.slice(0, 60),
      kpis: {
        ...this.kpis,
        avgMape: this.meanMape(),
        activeAgents: this.households.filter((h) => h.autonomy).length,
        recsMinted: this.ledger.recs.length,
      },
      nextDelivery,
      market: {
        openOrders: openOrders.length,
        clearedVolumeKwh: round(sum(cleared.map((t) => t.qtyKwh)), 1),
        avgClearingPrice: round(
          cleared.length ? sum(cleared.map((t) => t.price * t.qtyKwh)) / Math.max(0.1, sum(cleared.map((t) => t.qtyKwh))) : 0,
          3,
        ),
        bidDepthKwh: round(sum(openOrders.filter((o) => o.side === 'buy').map((o) => o.qtyKwh - o.filledKwh)), 1),
        askDepthKwh: round(sum(openOrders.filter((o) => o.side === 'sell').map((o) => o.qtyKwh - o.filledKwh)), 1),
      },
    };
  }

  // ----------------------------------------------------------------- plumbing

  private pushEvent(kind: ActivityEvent['kind'], actor: string, message: string, at = this.clock) {
    this.eventSeq += 1;
    this.events.unshift({
      id: `ev-${this.eventSeq}`,
      at,
      kind,
      actor,
      message,
    });
    if (this.events.length > CONFIG.maxEvents) this.events = this.events.slice(0, CONFIG.maxEvents);
  }

  private startTicker() {
    if (this.timer) clearInterval(this.timer);
    this.lastTick = Date.now();
    this.timer = setInterval(() => {
      if (!this.running) {
        this.lastTick = Date.now();
        return;
      }
      const interval = CONFIG.tickIntervalMs / this.speed;
      if (Date.now() - this.lastTick >= interval) {
        this.lastTick = Date.now();
        this.advance(1);
      }
    }, 900);
  }

  private emitUpdate() {
    this.emit('update');
  }

  private readPersisted(): Persisted | null {
    try {
      if (!existsSync(STATE_FILE)) return null;
      const raw = readFileSync(STATE_FILE, 'utf8');
      if (!raw.trim()) return null;
      return JSON.parse(raw) as Persisted;
    } catch {
      return null;
    }
  }

  private hydrate(p: Persisted) {
    this.clock = p.clock;
    this.running = p.running;
    this.speed = p.speed;
    this.marketDay = p.marketDay;
    this.weatherSource = p.weatherSource;
    this.weather = p.weather;
    this.forecasts = p.forecasts;
    this.tomorrowForecasts = p.tomorrowForecasts;
    this.orders = p.orders;
    this.trades = p.trades;
    this.contracts = p.contracts;
    this.dayAhead = p.dayAhead;
    this.events = p.events;
    this.kpis = p.kpis;
    this.settledSlots = p.settledSlots;
    this.households = p.households;
    this.ledger = Ledger.fromJSON(p.ledger);
    this.contractSeq = p.contractSeq;
    this.eventSeq = p.eventSeq;
    this.seededAt = p.seededAt;
    this.buildWallets();
    this.startTicker();
  }

  save() {
    try {
      const payload: Persisted = {
        version: CONFIG.version,
        clock: this.clock,
        running: this.running,
        speed: this.speed,
        marketDay: this.marketDay,
        weatherSource: this.weatherSource,
        weather: this.weather,
        forecasts: this.forecasts,
        tomorrowForecasts: this.tomorrowForecasts,
        orders: this.orders,
        trades: this.trades,
        contracts: this.contracts,
        dayAhead: this.dayAhead,
        events: this.events,
        kpis: this.kpis,
        settledSlots: this.settledSlots,
        households: this.households,
        ledger: this.ledger.toJSON(),
        contractSeq: this.contractSeq,
        eventSeq: this.eventSeq,
        seededAt: this.seededAt,
      };
      mkdirSync('data', { recursive: true });
      writeFileSync(STATE_FILE, JSON.stringify(payload));
    } catch {
      // Non-fatal: the in-memory engine keeps working.
    }
  }
}

// --------------------------------------------------------------------- helpers

function localMidnight(iso: string): string {
  const hour = localHourOf(iso, CONFIG.timezone) % 24;
  return addHours(startOfHour(iso), -hour);
}

function fmtHour(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CONFIG.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function averagePrice(
  contracts: ForwardContract[],
  slot: string,
  householdId: string,
  role: 'buy' | 'sell',
): number {
  const relevant = contracts.filter(
    (c) => c.slot === slot && (role === 'buy' ? c.buyerId : c.sellerId) === householdId,
  );
  if (!relevant.length) return role === 'buy' ? CONFIG.retailTariff : CONFIG.feedInTariff;
  return sum(relevant.map((c) => c.price)) / relevant.length;
}

export { localMidnight };
