// A small, dependency-free ridge regression used by every household agent.
// Features are standardised before solving the normal equations, which keeps
// the 9×9 system well-conditioned on a 21-day training window.

export interface RidgeModel {
  weights: number[]; // excludes intercept
  intercept: number;
  means: number[];
  stds: number[];
  residualStd: number;
  mape: number;
  skill: number;
  samples: number;
}

export interface TrainingRow {
  x: number[];
  y: number;
}

function solve(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) continue;
    [a[col], a[pivot]] = [a[pivot], a[col]];

    const div = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= div;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      if (factor === 0) continue;
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}

export function trainRidge(rows: TrainingRow[], lambda = 1.2): RidgeModel {
  if (rows.length === 0) throw new Error('trainRidge requires at least one sample');
  const dim = rows[0].x.length;
  const means = new Array(dim).fill(0);
  const stds = new Array(dim).fill(0);

  for (const row of rows) for (let j = 0; j < dim; j++) means[j] += row.x[j];
  for (let j = 0; j < dim; j++) means[j] /= rows.length;

  for (const row of rows) {
    for (let j = 0; j < dim; j++) {
      const d = row.x[j] - means[j];
      stds[j] += d * d;
    }
  }
  for (let j = 0; j < dim; j++) stds[j] = Math.sqrt(stds[j] / rows.length) || 1;

  const xtx = Array.from({ length: dim }, () => new Array(dim).fill(0));
  const xty = new Array(dim).fill(0);
  const meanY = rows.reduce((s, r) => s + r.y, 0) / rows.length;

  for (const row of rows) {
    const z = row.x.map((v, j) => (v - means[j]) / stds[j]);
    const centeredY = row.y - meanY;
    for (let i = 0; i < dim; i++) {
      xty[i] += z[i] * centeredY;
      for (let j = 0; j < dim; j++) xtx[i][j] += z[i] * z[j];
    }
  }
  for (let i = 0; i < dim; i++) xtx[i][i] += lambda;

  const weights = solve(xtx, xty);

  let sse = 0;
  let absErr = 0;
  let actualSum = 0;
  for (const row of rows) {
    const pred = predictRaw(weights, means, stds, meanY, row.x);
    const err = row.y - pred;
    sse += err * err;
    absErr += Math.abs(err);
    actualSum += row.y;
  }

  return {
    weights,
    intercept: meanY,
    means,
    stds,
    residualStd: Math.sqrt(sse / Math.max(1, rows.length - dim - 1)),
    mape: actualSum > 0 ? (absErr / actualSum) * 100 : 0,
    skill: 0,
    samples: rows.length,
  };
}

function predictRaw(weights: number[], means: number[], stds: number[], intercept: number, x: number[]): number {
  let out = intercept;
  for (let j = 0; j < weights.length; j++) out += weights[j] * ((x[j] - means[j]) / stds[j]);
  return out;
}

export function predict(model: RidgeModel, x: number[]): number {
  return Math.max(0, predictRaw(model.weights, model.means, model.stds, model.intercept, x));
}

/** Decompose a prediction into standardised feature contributions (kWh). */
export function explain(model: RidgeModel, x: number[]): { intercept: number; parts: number[] } {
  const parts = model.weights.map((w, j) => w * ((x[j] - model.means[j]) / model.stds[j]));
  return { intercept: model.intercept, parts };
}

export function evaluate(
  model: RidgeModel,
  rows: TrainingRow[],
  persistence: number[],
): { mae: number; mape: number; rmse: number; skill: number; persistenceMae: number } {
  let absErr = 0;
  let sqErr = 0;
  let naiveErr = 0;
  let actualSum = 0;
  rows.forEach((row, i) => {
    const pred = predict(model, row.x);
    const err = Math.abs(row.y - pred);
    absErr += err;
    sqErr += err * err;
    actualSum += row.y;
    if (persistence[i] != null) naiveErr += Math.abs(row.y - persistence[i]);
  });
  const mae = absErr / rows.length;
  const persistenceMae = naiveErr / rows.length;
  return {
    mae,
    // Weighted absolute percentage error (WAPE): robust to near-zero night loads.
    mape: actualSum > 0 ? (absErr / actualSum) * 100 : 0,
    rmse: Math.sqrt(sqErr / rows.length),
    skill: persistenceMae > 0 ? Math.max(0, 1 - mae / persistenceMae) : 0,
    persistenceMae,
  };
}
