// Shared contract between the simulation server and the web client.

export type StrategyProfile = 'conservative' | 'balanced' | 'aggressive';

export interface Household {
  id: string;
  name: string;
  short: string;
  archetype: string;
  address: string; // ed25519 public key, 0x-prefixed
  pvKwp: number;
  batteryKwh: number;
  occupants: number;
  hasEv: boolean;
  hasHeatPump: boolean;
  color: string;
  strategy: StrategyProfile;
  autonomy: boolean;
  riskAppetite: number; // 0..1
  position: { x: number; z: number };
  seed: number;
}

export interface WeatherSlot {
  t: string;
  tempC: number;
  cloudPct: number;
  radiationWm2: number;
  windKph: number;
}

export interface ForecastPoint {
  t: string;
  loadP10: number;
  loadP50: number;
  loadP90: number;
  solarP10: number;
  solarP50: number;
  solarP90: number;
  netP50: number;
  confidence: number; // 0..1
}

export interface ForecastDriver {
  label: string;
  detail: string;
  contribution: number; // kWh share, signed
}

export interface ForecastSummary {
  householdId: string;
  generatedAt: string;
  horizonHours: number;
  mape: number;
  skill: number;
  dailyLoadKwh: number;
  dailySolarKwh: number;
  surplusKwh: number;
  deficitKwh: number;
  confidence: number;
  peakLoadKw: number;
  peakSolarKw: number;
  drivers: ForecastDriver[];
  points: ForecastPoint[];
}

export type OrderSide = 'buy' | 'sell';

export interface Order {
  id: string;
  householdId: string;
  side: OrderSide;
  slot: string;
  qtyKwh: number;
  price: number;
  createdAt: string;
  agent: boolean;
  status: 'open' | 'filled' | 'partial' | 'cancelled' | 'expired';
  filledKwh: number;
  rationale: string;
  confidence: number;
}

export interface Trade {
  id: string;
  slot: string;
  buyerId: string;
  sellerId: string;
  qtyKwh: number;
  price: number;
  clearedAt: string;
  source: 'day_ahead' | 'intraday' | 'grid';
  contractId?: string;
  txHash?: string;
}

export type ContractStatus = 'pending' | 'settled' | 'partial' | 'defaulted';

export interface ForwardContract {
  id: string;
  address: string;
  buyerId: string;
  sellerId: string;
  slot: string;
  qtyKwh: number;
  price: number;
  escrowMtr: number;
  bondMtr: number;
  deliveredKwh: number;
  status: ContractStatus;
  createdAt: string;
  settledAt?: string;
  settlementTx?: string;
}

export interface DayAheadSlot {
  slot: string;
  clearingPrice: number;
  volumeKwh: number;
  matchedOrders: number;
  demandKwh: number;
  supplyKwh: number;
}

export interface ChainEvent {
  name: string;
  args: Record<string, string | number | boolean>;
}

export type TxType = 'transfer' | 'call' | 'deploy' | 'anchor';

export interface Tx {
  hash: string;
  type: TxType;
  from: string;
  to: string;
  method: string;
  args: Record<string, string | number | boolean>;
  valueMtr: number;
  nonce: number;
  gas: number;
  feeMtr: number;
  signature: string;
  status: 'success' | 'reverted';
  timestamp: string;
  blockNumber: number;
  events: ChainEvent[];
}

export interface Block {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: string;
  validator: string;
  txCount: number;
  merkleRoot: string;
  gasUsed: number;
  nonce: number;
  txHashes: string[];
  transactions: Tx[];
}

export interface GreenCertificate {
  id: string;
  serial: string;
  ownerId: string;
  kwh: number;
  vintage: string;
  project: string;
  txHash: string;
  retired: boolean;
  retiredAt?: string;
}

export interface LedgerContract {
  address: string;
  kind: 'EnergyForward' | 'GreenREC' | 'MicroTradeToken';
  buyerId?: string;
  sellerId?: string;
  qtyKwh?: number;
  price?: number;
  deliveryStart?: string;
  status: 'active' | 'settled' | 'defaulted';
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  at: string;
  kind: 'forecast' | 'order' | 'trade' | 'settlement' | 'chain' | 'rec' | 'agent' | 'system' | 'grid';
  actor: string;
  message: string;
  meta?: string;
}

export interface Kpis {
  energyTradedKwh: number;
  p2pTrades: number;
  co2AvoidedKg: number;
  valueSettledUsd: number;
  avgMape: number;
  p2pSharePct: number;
  recsMinted: number;
  gridImportKwh: number;
  gridExportKwh: number;
  householdSavingsUsd: number;
  activeAgents: number;
  contractsSettled: number;
  contractsDefaulted: number;
}

export interface HouseholdView extends Household {
  balanceMtr: number;
  todayNetKwh: number;
  todayRevenueUsd: number;
  todayP2pKwh: number;
  status: 'surplus' | 'deficit' | 'balanced';
  currentNetKw: number;
  recKwh: number;
}

export interface LedgerView {
  height: number;
  txCount: number;
  totalBlocks: number;
  lastBlockHash: string;
  validator: string;
  chainIntegrity: boolean;
  totalSupplyMtr: number;
  blocks: Block[];
  contracts: LedgerContract[];
  recs: GreenCertificate[];
  balances: { householdId: string; name: string; address: string; balance: number }[];
}

export interface Snapshot {
  version: string;
  track: string;
  clock: string;
  timezone: string;
  running: boolean;
  speed: number;
  phase: 'live' | 'paused' | 'complete';
  weatherNow: WeatherSlot | null;
  weather: WeatherSlot[];
  households: HouseholdView[];
  forecasts: Record<string, ForecastSummary>;
  tomorrowForecasts: Record<string, ForecastSummary> | null;
  orders: Order[];
  trades: Trade[];
  contracts: ForwardContract[];
  dayAhead: DayAheadSlot[];
  ledger: LedgerView;
  events: ActivityEvent[];
  kpis: Kpis;
  nextDelivery: string | null;
  market: {
    openOrders: number;
    clearedVolumeKwh: number;
    avgClearingPrice: number;
    bidDepthKwh: number;
    askDepthKwh: number;
  };
}

export interface AgentConfigInput {
  strategy?: StrategyProfile;
  autonomy?: boolean;
  riskAppetite?: number;
}
