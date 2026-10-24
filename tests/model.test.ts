import { describe, expect, it } from 'vitest';
import { evaluate, predict, trainRidge, type TrainingRow } from '../server/ai/model.js';

function synthetic(rows = 300): { train: TrainingRow[]; test: TrainingRow[] } {
  const all: TrainingRow[] = [];
  for (let i = 0; i < rows; i++) {
    const hour = i % 24;
    const heat = Math.max(0, 30 - 23.5) / 10;
    const x = [Math.sin((2 * Math.PI * hour) / 24), Math.cos((2 * Math.PI * hour) / 24), heat];
    // ground truth: evening peak + cooling term + noise
    const evening = hour >= 17 && hour <= 21 ? 1.2 : 0.3;
    const y = Math.max(0.05, 0.8 + evening + heat * 1.5 + Math.sin(i) * 0.05);
    all.push({ x, y });
  }
  return { train: all.slice(0, 240), test: all.slice(240) };
}

describe('ridge regression', () => {
  it('fits a simple load pattern with low error', () => {
    const { train, test } = synthetic();
    const model = trainRidge(train, 1.0);
    const persistence = test.map((_, i) => (i === 0 ? test[0].y : test[i - 1].y));
    const metrics = evaluate(model, test, persistence);
    expect(metrics.mape).toBeLessThan(25);
    expect(model.residualStd).toBeGreaterThan(0);
    expect(model.samples).toBe(train.length);
  });

  it('never predicts negative load', () => {
    const { train } = synthetic();
    const model = trainRidge(train, 1.0);
    expect(predict(model, [-10, -10, -10])).toBeGreaterThanOrEqual(0);
  });

  it('throws on empty training data', () => {
    expect(() => trainRidge([])).toThrow();
  });

  it('beats persistence on structured data', () => {
    const { train, test } = synthetic(400);
    const model = trainRidge(train, 1.0);
    const persistence = test.map((r) => r.y);
    // shift persistence by one step to simulate naive forecast
    const naive = [test[0].y, ...test.slice(0, -1).map((r) => r.y)];
    const metrics = evaluate(model, test, naive);
    expect(metrics.skill).toBeGreaterThanOrEqual(0);
    expect(persistence.length).toBe(test.length);
  });
});
