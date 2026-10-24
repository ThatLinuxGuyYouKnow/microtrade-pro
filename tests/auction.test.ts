import { describe, expect, it } from 'vitest';
import { doubleAuction } from '../server/market/auction.js';
import type { Order } from '../shared/types.js';

function makeOrder(partial: Partial<Order> & { id: string; side: 'buy' | 'sell' }): Order {
  return {
    householdId: partial.householdId ?? 'h1',
    slot: '2026-10-24T14:00:00.000Z',
    qtyKwh: 2,
    price: partial.side === 'buy' ? 0.2 : 0.12,
    createdAt: '2026-10-24T10:00:00.000Z',
    agent: true,
    status: 'open',
    filledKwh: 0,
    rationale: 'test',
    confidence: 0.9,
    ...partial,
  } as Order;
}

describe('doubleAuction', () => {
  it('clears crossing bids and asks at the midpoint', () => {
    const orders = [
      makeOrder({ id: 'b1', side: 'buy', householdId: 'buyer', price: 0.2, qtyKwh: 2 }),
      makeOrder({ id: 's1', side: 'sell', householdId: 'seller', price: 0.12, qtyKwh: 2 }),
    ];
    const result = doubleAuction('2026-10-24T14:00:00.000Z', orders);
    expect(result.matches).toHaveLength(1);
    expect(result.clearingPrice).toBeCloseTo(0.16, 3);
    expect(result.volumeKwh).toBeCloseTo(2, 2);
    expect(orders.find((o) => o.id === 'b1')?.status).toBe('filled');
  });

  it('does not clear when bid < ask', () => {
    const orders = [
      makeOrder({ id: 'b1', side: 'buy', householdId: 'buyer', price: 0.1, qtyKwh: 2 }),
      makeOrder({ id: 's1', side: 'sell', householdId: 'seller', price: 0.2, qtyKwh: 2 }),
    ];
    const result = doubleAuction('2026-10-24T14:00:00.000Z', orders);
    expect(result.matches).toHaveLength(0);
    expect(result.clearingPrice).toBe(0);
  });

  it('ranks bids high-to-low and asks low-to-high', () => {
    const orders = [
      makeOrder({ id: 'b-lo', side: 'buy', householdId: 'b1', price: 0.15, qtyKwh: 5 }),
      makeOrder({ id: 'b-hi', side: 'buy', householdId: 'b2', price: 0.22, qtyKwh: 1 }),
      makeOrder({ id: 's-hi', side: 'sell', householdId: 's1', price: 0.2, qtyKwh: 5 }),
      makeOrder({ id: 's-lo', side: 'sell', householdId: 's2', price: 0.13, qtyKwh: 1 }),
    ];
    const result = doubleAuction('2026-10-24T14:00:00.000Z', orders);
    expect(result.matches.length).toBeGreaterThan(0);
    // best bid (0.22) meets best ask (0.13) first
    expect(result.matches[0].buyerOrderId).toBe('b-hi');
    expect(result.matches[0].sellerOrderId).toBe('s-lo');
  });

  it('partially fills the larger side', () => {
    const orders = [
      makeOrder({ id: 'b1', side: 'buy', householdId: 'buyer', price: 0.2, qtyKwh: 5 }),
      makeOrder({ id: 's1', side: 'sell', householdId: 'seller', price: 0.12, qtyKwh: 2 }),
    ];
    const result = doubleAuction('2026-10-24T14:00:00.000Z', orders);
    expect(result.volumeKwh).toBeCloseTo(2, 2);
    expect(orders.find((o) => o.id === 'b1')?.status).toBe('partial');
    expect(orders.find((o) => o.id === 's1')?.status).toBe('filled');
  });
});
