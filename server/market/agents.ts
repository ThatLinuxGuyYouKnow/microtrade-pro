import type { ForecastSummary, Household, Order, StrategyProfile } from '../../shared/types.js';
import { CONFIG } from '../config.js';
import { clamp, round } from '../../shared/utils.js';
import { localHourOf } from '../sim/load.js';

const RISK: Record<StrategyProfile, number> = {
  conservative: 0.28,
  balanced: 0.52,
  aggressive: 0.78,
};

export function riskFor(household: Household): number {
  return clamp(household.riskAppetite ?? RISK[household.strategy], 0.05, 0.95);
}

function shading(strategy: StrategyProfile): { ask: number; bid: number; qty: number } {
  if (strategy === 'conservative') return { ask: 0.012, bid: 0.009, qty: -0.12 };
  if (strategy === 'aggressive') return { ask: -0.008, bid: -0.007, qty: 0.14 };
  return { ask: 0, bid: 0, qty: 0.02 };
}

function timeOfUse(iso: string): { peak: boolean; midday: boolean; hour: number } {
  const hour = localHourOf(iso, CONFIG.timezone);
  return { peak: hour >= 17 && hour <= 21, midday: hour >= 9 && hour <= 15, hour };
}

export interface AgentOrderDraft {
  slot: string;
  side: 'buy' | 'sell';
  qtyKwh: number;
  price: number;
  confidence: number;
  rationale: string;
}

/**
 * Each household agent converts its probabilistic forecast into limit orders.
 * It never trades against its own uncertainty for free: the bid/ask spread is
 * widened by the P10–P90 band, and the quantity is shaded by risk appetite.
 */
export function buildAgentOrders(household: Household, forecast: ForecastSummary): AgentOrderDraft[] {
  if (!household.autonomy) return [];
  const risk = riskFor(household);
  const shade = shading(household.strategy);
  const isBattery = household.id === 'h9';
  const drafts: AgentOrderDraft[] = [];

  for (const point of forecast.points.slice(0, 24)) {
    const { peak, midday, hour } = timeOfUse(point.t);
    const surplus = Math.max(0, point.netP50);
    const deficit = Math.max(0, -point.netP50);
    const band = Math.max(0.05, (point.solarP90 - point.solarP10) / 2 + (point.loadP90 - point.loadP10) / 2);
    const confidence = point.confidence;

    if (isBattery) {
      if (midday) {
        const qty = clamp(7.5 + risk * 2.5 - deficit * 0.2, 3, 11);
        const price = clamp(0.142 + (risk - 0.5) * 0.012, 0.115, 0.16);
        drafts.push({
          slot: point.t,
          side: 'buy',
          qtyKwh: round(qty, 2),
          price: round(price, 3),
          confidence,
          rationale: `Absorbing midday solar before the evening peak — ${qty.toFixed(1)} kWh at $${price.toFixed(3)}/kWh.`,
        });
      } else if (peak) {
        const qty = clamp(7.5 + risk * 3, 4, 12);
        const price = round(clamp(0.198 + (risk - 0.5) * 0.014, 0.176, 0.228), 3);
        drafts.push({
          slot: point.t,
          side: 'sell',
          qtyKwh: round(qty, 2),
          price,
          confidence: Math.max(0.7, confidence),
          rationale: `Discharging into the 17:00–21:00 scarcity window at $${price.toFixed(3)}/kWh.`,
        });
      } else if (surplus > 0.4) {
        const qty = round(surplus * 0.85, 2);
        drafts.push({
          slot: point.t,
          side: 'sell',
          qtyKwh: qty,
          price: round(clamp(0.112 + (risk - 0.5) * 0.018, 0.088, 0.15), 3),
          confidence,
          rationale: `Surplus canopy generation (${surplus.toFixed(1)} kWh) with 85% offered to neighbours.`,
        });
      }
      continue;
    }

    if (surplus > 0.25) {
      const fraction = clamp(0.5 + risk * 0.4 + shade.qty, 0.3, 0.95);
      const qty = round(surplus * fraction, 2);
      if (qty < 0.15) continue;
      const uncertainty = clamp(band / Math.max(surplus, 0.6), 0.01, 0.08);
      const scarcity = peak ? 0.02 : midday ? -0.012 : 0;
      const ask = clamp(
        CONFIG.lcoe +
          (household.batteryKwh > 0 ? CONFIG.batteryWear : 0) +
          uncertainty * 0.3 +
          scarcity * 0.6 +
          shade.ask,
        0.072,
        0.238,
      );
      drafts.push({
        slot: point.t,
        side: 'sell',
        qtyKwh: qty,
        price: round(ask, 3),
        confidence,
        rationale: `Forecast ${surplus.toFixed(1)} kWh surplus at ${String(hour).padStart(2, '0')}:00; offering ${qty.toFixed(1)} kWh at $${ask.toFixed(3)}/kWh.`,
      });
    } else if (deficit > 0.25) {
      const fraction = clamp(0.55 + risk * 0.4 + shade.qty, 0.4, 0.98);
      const qty = round(deficit * fraction, 2);
      if (qty < 0.15) continue;
      const uncertainty = clamp(band / Math.max(deficit, 0.6), 0.01, 0.08);
      const scarcity = peak ? 0.022 : midday ? -0.006 : 0;
      const bid = clamp(
        CONFIG.retailTariff -
          CONFIG.networkCharge -
          0.006 -
          uncertainty * 0.2 +
          scarcity * 0.6 +
          shade.bid,
        0.118,
        0.272,
      );
      drafts.push({
        slot: point.t,
        side: 'buy',
        qtyKwh: qty,
        price: round(bid, 3),
        confidence,
        rationale: `Forecast ${deficit.toFixed(1)} kWh deficit at ${String(hour).padStart(2, '0')}:00; bidding ${qty.toFixed(1)} kWh at $${bid.toFixed(3)}/kWh vs $${CONFIG.retailTariff.toFixed(3)} retail.`,
      });
    }
  }

  return drafts;
}

export function materializeOrders(
  household: Household,
  forecast: ForecastSummary,
  createdAt: string,
): Order[] {
  return buildAgentOrders(household, forecast).map((draft) => ({
    id: `ord-${household.id}-${draft.slot}-${draft.side}-${draft.qtyKwh}`,
    householdId: household.id,
    side: draft.side,
    slot: draft.slot,
    qtyKwh: draft.qtyKwh,
    price: draft.price,
    createdAt,
    agent: true,
    status: 'open',
    filledKwh: 0,
    rationale: draft.rationale,
    confidence: round(draft.confidence, 3),
  }));
}
