# MicroTrade Pro — Predictive P2P Energy Trading

**IEEE ClimateChain Global Hackathon 2026 · Track 2: Renewable Energy & Energy Trading**

A neighborhood microgrid where 9 household **forecasting agents** predict their own supply and demand, negotiate **forward agreements** in a uniform-price double auction, and settle delivered energy on a **verifiable Ed25519 ledger** with green certificates.

## What it does

1. **Predict** — each home trains a ridge-ensemble model on 21 days of meter history + local weather (Open-Meteo, synthetic fallback) and publishes P10/P50/P90 load + solar curves for 48h.
2. **Coordinate** — agents convert forecasts into risk-shaded limit orders. A day-ahead double auction clears every delivery hour; matches become escrowed forward contracts (12% seller bond).
3. **Settle** — hourly delivery is metered, escrow released, bonds slashed on shortfall, and a GreenREC minted per delivered green kWh. Every write is a signed transaction in a Merkle-committed PoA chain.

## Stack

- Client: React 18 + Vite + Tailwind + Three.js (live 3D microgrid), SSE streaming
- Server: Node + Express + TypeScript, deterministic simulation engine
- AI: dependency-free ridge regression (15 standardized features, holdout WAPE + skill vs naive)
- Chain: purpose-built ledger (Ed25519, nonces, gas, Merkle roots) + Solidity reference in `contracts/`
- Data: Open-Meteo forecast API with 1h disk cache + deterministic synthetic fallback

## Quickstart

```bash
npm install
npm run dev        # web http://localhost:5173 · api http://localhost:8787
```

Production:

```bash
npm run build      # tsc server + vite client
npm start          # serves dist/ + API on :8787
npm test           # vitest: auction, ridge model, ledger integrity
```

Other:

```bash
npm run typecheck  # tsc --noEmit
npm run sim:reset  # delete data/state.json and reseed
```

## API

- `GET /api/state` — full snapshot (clock, households, forecasts, orders, trades, contracts, ledger, KPIs)
- `GET /api/forecast/:id` — household forecast + tomorrow forecast
- `GET /api/stream` — Server-Sent Events snapshot stream
- `POST /api/actions/day-ahead` — clear tomorrow's 24h auction
- `POST /api/actions/advance {hours}` — step simulation clock
- `POST /api/actions/running {running}` / `POST /api/actions/speed {speed}`
- `POST /api/actions/agent/:id {strategy, autonomy, riskAppetite}`
- `POST /api/actions/order {householdId, side, slot, qtyKwh, price}`
- `POST /api/actions/rec/:serial/retire`
- `POST /api/actions/verify` — recompute parent links + Merkle roots
- `POST /api/actions/reset` — reseed world

## Project layout

```
server/  sim/engine|history|load|weather|households  ai/model|forecaster
         market/auction|agents  chain/ledger|crypto  index.ts (API + static)
shared/  types.ts  utils.ts
src/     pages/Overview|Forecast|Market|Ledger|Agents|Docs
         components/MicrogridScene|Charts|ui  lib/store|api|format
contracts/MicroTradeEnergy.sol (V1, deployed Sepolia) + MicroTradeEnergyV2.sol (hardened: staked bond, oracle-gated settle/mint, reentrancy guard)   tests/auction|model|ledger

## Deployments (Sepolia testnet, chain 11155111)

- V1 `MicroTradeEnergy` — `0x8d1e4ad61a2e4071707b512473652924b8E4c914` (tagged `sepolia-v1`; demo-grade, bond not escrowed)
- V2 `MicroTradeEnergyV2` — `0x2f7EbFA1942B97F74D428226CcA48dD643794E78` (staked bond, oracle-gated, nonReentrant)

Source verification on the block explorer is pending; verify with the exact
compiler version + optimizer settings used at deploy time.
data/    state.json (persisted world)  weather-cache.json
```

## Simulation notes

- Advances 1 simulated hour every 6s at 1× (adjustable 1–8×, pause, +1h step).
- Day-ahead clears 24 hourly slots; settlement occurs as each slot passes.
- Balances start at 260 MTR/household; 1 MTR ≈ 1 USD of delivered energy.
- Retail $0.284/kWh, feed-in $0.068, LCOE $0.108, network charge $0.055, grid intensity 0.373 kg/kWh.

## Limitations (prototype)

- Meter + weather history is simulated deterministically; live weather used when reachable.
- Ledger is local PoA, not a production L2; delivery verified from simulated telemetry.
- Tariffs simplified; not market or investment advice.

## License

MIT — see LICENSE.
