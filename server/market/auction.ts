import type { Order, Trade } from '../../shared/types.js';
import { round } from '../../shared/utils.js';

export interface AuctionMatch {
  buyerId: string;
  sellerId: string;
  buyerOrderId: string;
  sellerOrderId: string;
  qtyKwh: number;
  price: number;
}

export interface AuctionResult {
  slot: string;
  matches: AuctionMatch[];
  clearingPrice: number;
  volumeKwh: number;
  demandKwh: number;
  supplyKwh: number;
  matchedOrders: number;
}

/**
 * Uniform-price double auction.
 * Bids are ranked high→low, asks low→high; the market clears while bid ≥ ask.
 * Every matched pair transacts at the midpoint of the marginal bid and ask,
 * which is the standard uniform clearing rule for community energy markets.
 */
export function doubleAuction(slot: string, orders: Order[]): AuctionResult {
  const relevant = orders.filter((o) => o.slot === slot && o.status !== 'cancelled' && o.qtyKwh - o.filledKwh > 0.01);
  const buys = relevant
    .filter((o) => o.side === 'buy')
    .map((o) => ({ order: o, remaining: o.qtyKwh - o.filledKwh }))
    .sort((a, b) => b.order.price - a.order.price || a.order.createdAt.localeCompare(b.order.createdAt));
  const sells = relevant
    .filter((o) => o.side === 'sell')
    .map((o) => ({ order: o, remaining: o.qtyKwh - o.filledKwh }))
    .sort((a, b) => a.order.price - b.order.price || a.order.createdAt.localeCompare(b.order.createdAt));

  const demandKwh = buys.reduce((s, b) => s + b.remaining, 0);
  const supplyKwh = sells.reduce((s, s2) => s + s2.remaining, 0);

  let bi = 0;
  let si = 0;
  const provisional: { buy: Order; sell: Order; qty: number; bid: number; ask: number }[] = [];

  while (bi < buys.length && si < sells.length) {
    const b = buys[bi];
    const s = sells[si];
    if (b.order.price + 1e-9 < s.order.price) break;
    const qty = Math.min(b.remaining, s.remaining);
    if (qty > 0.01) {
      provisional.push({ buy: b.order, sell: s.order, qty, bid: b.order.price, ask: s.order.price });
      b.remaining -= qty;
      s.remaining -= qty;
    }
    if (b.remaining <= 0.01) bi += 1;
    if (s.remaining <= 0.01) si += 1;
  }

  if (provisional.length === 0) {
    return { slot, matches: [], clearingPrice: 0, volumeKwh: 0, demandKwh, supplyKwh, matchedOrders: 0 };
  }

  const marginal = provisional[provisional.length - 1];
  const clearingPrice = round((marginal.bid + marginal.ask) / 2, 3);
  const volumeKwh = provisional.reduce((s, m) => s + m.qty, 0);

  const matches: AuctionMatch[] = provisional.map((m) => ({
    buyerId: m.buy.householdId,
    sellerId: m.sell.householdId,
    buyerOrderId: m.buy.id,
    sellerOrderId: m.sell.id,
    qtyKwh: round(m.qty, 2),
    price: clearingPrice,
  }));

  // Write fills back onto the order objects.
  for (const m of provisional) {
    const buyer = orders.find((o) => o.id === m.buy.id);
    const seller = orders.find((o) => o.id === m.sell.id);
    for (const order of [buyer, seller]) {
      if (!order) continue;
      order.filledKwh = round(order.filledKwh + m.qty, 2);
      order.status = order.filledKwh >= order.qtyKwh - 0.01 ? 'filled' : 'partial';
    }
  }

  return {
    slot,
    matches,
    clearingPrice,
    volumeKwh: round(volumeKwh, 2),
    demandKwh: round(demandKwh, 2),
    supplyKwh: round(supplyKwh, 2),
    matchedOrders: provisional.length * 2,
  };
}

/** Turn a match into the UI trade record; the on-chain hash is attached later. */
export function tradeFromMatch(
  match: AuctionMatch,
  slot: string,
  clearedAt: string,
  index: number,
  contractId: string,
): Trade {
  return {
    id: `tr-${slot}-${index}-${match.buyerId}-${match.sellerId}`,
    slot,
    buyerId: match.buyerId,
    sellerId: match.sellerId,
    qtyKwh: match.qtyKwh,
    price: match.price,
    clearedAt,
    source: 'day_ahead',
    contractId,
  };
}
