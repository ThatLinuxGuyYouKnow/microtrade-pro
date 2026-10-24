import type { ForecastDriver, ForecastPoint, ForecastSummary, Household, WeatherSlot } from '../../shared/types.js';
import { CONFIG } from '../config.js';
import { addHours, clamp, round } from '../../shared/utils.js';
import { isWeekendLocal, localHourOf } from '../sim/load.js';
import type { HouseholdHistory } from '../sim/history.js';
import { weatherAt } from '../sim/weather.js';
import { evaluate, explain, predict, trainRidge, type RidgeModel, type TrainingRow } from './model.js';

const HORIZON = CONFIG.forecastHorizon;

export function featuresFor(iso: string, weather: WeatherSlot): number[] {
  const hour = localHourOf(iso, CONFIG.timezone);
  const weekend = isWeekendLocal(iso, CONFIG.timezone) ? 1 : 0;
  const cdd = Math.max(0, weather.tempC - 23.5) / 10;
  const hdd = Math.max(0, 12.5 - weather.tempC) / 10;
  const harmonics: number[] = [];
  for (let k = 1; k <= 5; k++) {
    harmonics.push(Math.sin((2 * Math.PI * k * hour) / 24));
    harmonics.push(Math.cos((2 * Math.PI * k * hour) / 24));
  }
  return [
    ...harmonics,
    weekend,
    cdd,
    hdd,
    weather.cloudPct / 100,
    weather.radiationWm2 / 1000,
  ];
}

function trainingRows(history: HouseholdHistory): { rows: TrainingRow[]; persistence: number[] } {
  const points = history.points;
  const rows: TrainingRow[] = [];
  const persistence: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const w: WeatherSlot = {
      t: p.t,
      tempC: p.tempC,
      cloudPct: p.cloudPct,
      radiationWm2: p.radiationWm2,
      windKph: 8,
    };
    rows.push({ x: featuresFor(p.t, w), y: p.loadKwh });
    const prev = points[i - 24];
    persistence.push(prev ? prev.loadKwh : p.loadKwh);
  }
  return { rows, persistence };
}

export interface TrainedHouseholdModel {
  model: RidgeModel;
  metrics: { mae: number; mape: number; rmse: number; skill: number };
}

export function trainHouseholdModel(history: HouseholdHistory): TrainedHouseholdModel {
  const { rows, persistence } = trainingRows(history);
  const holdoutSize = Math.min(72, Math.floor(rows.length * 0.18));
  const trainRows = rows.slice(0, rows.length - holdoutSize);
  const testRows = rows.slice(rows.length - holdoutSize);
  const testPersistence = persistence.slice(rows.length - holdoutSize);

  const holdoutModel = trainRidge(trainRows, 1.4);
  const metrics = evaluate(holdoutModel, testRows, testPersistence);
  const model = trainRidge(rows, 1.4);
  return {
    model: { ...model, mape: metrics.mape, skill: metrics.skill },
    metrics: { mae: round(metrics.mae, 2), mape: round(metrics.mape, 1), rmse: round(metrics.rmse, 2), skill: round(metrics.skill, 3) },
  };
}

export function forecastHousehold(
  household: Household,
  history: HouseholdHistory,
  weatherSlots: WeatherSlot[],
  startIso: string,
  generatedAt: string,
  hours = HORIZON,
): ForecastSummary {
  const { model, metrics } = trainHouseholdModel(history);
  const points: ForecastPoint[] = [];
  let loadSum = 0;
  let solarSum = 0;
  let surplus = 0;
  let deficit = 0;
  let peakLoad = 0;
  let peakSolar = 0;
  const contributions = { base: 0, weekend: 0, cooling: 0, heating: 0, daylight: 0 };

  for (let i = 0; i < hours; i++) {
    const iso = addHours(startIso, i);
    const weather = weatherAt(weatherSlots, iso);
    const x = featuresFor(iso, weather);
    const loadP50 = predict(model, x);
    const { intercept, parts } = explain(model, x);
    contributions.base += intercept + parts.slice(0, 10).reduce((a, b) => a + b, 0);
    contributions.weekend += parts[10];
    contributions.cooling += parts[11];
    contributions.heating += parts[12];
    contributions.daylight += parts[13] + parts[14];

    const tempDerate = 1 - 0.0035 * Math.max(0, weather.tempC - 25);
    let solarP50 =
      household.pvKwp * ((Math.max(0, weather.radiationWm2) * 1.035) / 1000) * tempDerate * 0.965;
    solarP50 = clamp(solarP50, 0, household.pvKwp * 1.03);

    const horizonPenalty = 1 + i * 0.012;
    const cloudFactor = 0.06 + 0.3 * (weather.cloudPct / 100);
    const sigma =
      Math.max(0.11, model.residualStd) * horizonPenalty * (1 + 0.35 * (weather.cloudPct / 100));
    const loadP10 = Math.max(0.02, loadP50 - 1.2816 * sigma);
    const loadP90 = loadP50 + 1.2816 * sigma;

    const solarSpread = cloudFactor * Math.min(1.1, horizonPenalty);
    const solarP10 = Math.max(0, solarP50 * (1 - solarSpread));
    const solarP90 = Math.min(household.pvKwp * 1.03, solarP50 * (1 + solarSpread * 0.55));

    const confidence = clamp(
      0.985 - i * 0.0045 - (weather.cloudPct / 100) * 0.06 - Math.max(0, 0.35 - metrics.skill) * 0.2,
      0.52,
      0.98,
    );

    const netP50 = solarP50 - loadP50;
    if (i < 24) {
      loadSum += loadP50;
      solarSum += solarP50;
      surplus += Math.max(0, netP50);
      deficit += Math.max(0, -netP50);
      peakLoad = Math.max(peakLoad, loadP50);
      peakSolar = Math.max(peakSolar, solarP50);
    }

    points.push({
      t: iso,
      loadP10: round(loadP10, 2),
      loadP50: round(loadP50, 2),
      loadP90: round(loadP90, 2),
      solarP10: round(solarP10, 2),
      solarP50: round(solarP50, 2),
      solarP90: round(solarP90, 2),
      netP50: round(netP50, 2),
      confidence: round(confidence, 3),
    });
  }

  const drivers: ForecastDriver[] = [
    {
      label: 'Occupancy rhythm',
      detail: 'Learned daily profile, weekday cycle and household size',
      contribution: round(contributions.base, 1),
    },
    {
      label: 'Cooling demand',
      detail: 'Weather-driven air-conditioning above 23.5 °C',
      contribution: round(contributions.cooling, 1),
    },
    {
      label: 'Heating demand',
      detail: 'Heat-pump load below 12.5 °C',
      contribution: round(contributions.heating, 1),
    },
    {
      label: 'Weekend behaviour',
      detail: 'Later mornings and higher daytime occupancy',
      contribution: round(contributions.weekend, 1),
    },
    {
      label: 'Daylight & cloud',
      detail: 'Lighting offset and irradiance interaction',
      contribution: round(contributions.daylight, 1),
    },
  ].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    householdId: household.id,
    generatedAt,
    horizonHours: hours,
    mape: round(metrics.mape, 1),
    skill: round(metrics.skill, 3),
    dailyLoadKwh: round(loadSum, 1),
    dailySolarKwh: round(solarSum, 1),
    surplusKwh: round(surplus, 1),
    deficitKwh: round(deficit, 1),
    confidence: round(points.slice(0, 24).reduce((s, p) => s + p.confidence, 0) / Math.min(24, points.length), 3),
    peakLoadKw: round(peakLoad, 2),
    peakSolarKw: round(peakSolar, 2),
    drivers,
    points,
  };
}

export function forecastAll(
  households: Household[],
  history: Record<string, HouseholdHistory>,
  weather: WeatherSlot[],
  startIso: string,
  generatedAt: string,
): Record<string, ForecastSummary> {
  const out: Record<string, ForecastSummary> = {};
  for (const household of households) {
    out[household.id] = forecastHousehold(household, history[household.id], weather, startIso, generatedAt);
  }
  return out;
}
