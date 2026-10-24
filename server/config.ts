export const CONFIG = {
  version: '1.0.0',
  track: 'Track 2 — Renewable Energy & Energy Trading',
  timezone: 'America/Chicago',
  location: {
    name: 'Cedar Hollow, Austin, TX',
    lat: 30.2672,
    lon: -97.7431,
  },
  // Market design parameters, USD per kWh unless noted.
  retailTariff: 0.284,
  feedInTariff: 0.068,
  networkCharge: 0.055,
  lcoe: 0.108,
  batteryWear: 0.019,
  gridCarbonKgPerKwh: 0.373,
  co2PerKwh: 0.373,
  // Token: 1 MTR is a settlement credit worth ~1 USD of delivered energy.
  startingBalanceMtr: 260,
  sellerBondPct: 0.12,
  tolerancePct: 0.05,
  slotHours: 1,
  hoursPerDay: 24,
  historyDays: 21,
  forecastHorizon: 48,
  maxBlocks: 56,
  maxEvents: 140,
  maxTrades: 80,
  maxOrders: 320,
  tickIntervalMs: 6000,
  validatorName: 'Cedar Hollow DAO',
  tokenName: 'MicroTrade Energy Credit',
  tokenSymbol: 'MTR',
} as const;

export const ARchetypes: Record<string, { base: number; morning: number; midday: number; evening: number; night: number }> = {
  family: { base: 0.34, morning: 0.9, midday: 0.55, evening: 1.55, night: 0.4 },
  retiree: { base: 0.42, morning: 0.7, midday: 0.9, evening: 1.2, night: 0.42 },
  wfh: { base: 0.5, morning: 1.0, midday: 1.25, evening: 1.4, night: 0.45 },
  small: { base: 0.26, morning: 0.55, midday: 0.38, evening: 0.85, night: 0.3 },
  duplex: { base: 0.48, morning: 0.95, midday: 0.8, evening: 1.7, night: 0.5 },
};
