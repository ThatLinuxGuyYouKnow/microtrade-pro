import type { Household, WeatherSlot } from '../../shared/types.js';
import { addHours, startOfHour } from '../../shared/utils.js';
import { CONFIG } from '../config.js';
import { syntheticWeather } from './weather.js';
import { householdLoadKwh, householdSolarKwh, isWeekendLocal, localHourOf, rngFor } from './load.js';

export interface HistoryPoint {
  t: string;
  loadKwh: number;
  solarKwh: number;
  tempC: number;
  cloudPct: number;
  radiationWm2: number;
}

export interface HouseholdHistory {
  householdId: string;
  points: HistoryPoint[];
}

export function buildHistory(households: Household[], nowIso: string): Record<string, HouseholdHistory> {
  const end = startOfHour(nowIso);
  const start = addHours(end, -CONFIG.historyDays * 24);
  const weather = syntheticWeather(start, CONFIG.historyDays * 24, 'history-weather');
  const byTime = new Map(weather.map((w) => [w.t, w]));
  const out: Record<string, HouseholdHistory> = {};

  for (const household of households) {
    const points: HistoryPoint[] = [];
    for (let i = 0; i < CONFIG.historyDays * 24; i++) {
      const iso = addHours(start, i);
      const w: WeatherSlot =
        byTime.get(iso) ??
        ({
          t: iso,
          tempC: 23,
          cloudPct: 20,
          radiationWm2: 0,
          windKph: 8,
        } satisfies WeatherSlot);
      const rng = rngFor(`${household.id}-hist-${iso}`);
      const loadKwh = householdLoadKwh(household, w, localHourOf(iso, CONFIG.timezone), isWeekendLocal(iso, CONFIG.timezone), rng);
      const solarKwh = householdSolarKwh(household, w, rngFor(`${household.id}-solar-${iso}`));
      points.push({
        t: iso,
        loadKwh,
        solarKwh,
        tempC: w.tempC,
        cloudPct: w.cloudPct,
        radiationWm2: w.radiationWm2,
      });
    }
    out[household.id] = { householdId: household.id, points };
  }
  return out;
}

export function actualSlot(
  household: Household,
  weather: WeatherSlot,
  iso: string,
): { loadKwh: number; solarKwh: number; netKwh: number } {
  const rng = rngFor(`actual-${household.id}-${iso}-${household.seed}`);
  const loadKwh = householdLoadKwh(household, weather, localHourOf(iso, CONFIG.timezone), isWeekendLocal(iso, CONFIG.timezone), rng);
  const solarKwh = householdSolarKwh(household, weather, rngFor(`actual-solar-${household.id}-${iso}`));
  return { loadKwh, solarKwh, netKwh: solarKwh - loadKwh };
}
