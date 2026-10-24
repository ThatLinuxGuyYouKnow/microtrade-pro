import type { Household, WeatherSlot } from '../../shared/types.js';
import { ARchetypes } from '../config.js';
import { clamp, seededRng } from '../../shared/utils.js';
import { HOUSEHOLD_ARCHETYPE_KEYS } from './households.js';

/** Structural load model — the ground truth the forecaster tries to learn. */
export function householdLoadKwh(
  household: Household,
  weather: WeatherSlot,
  localHour: number,
  isWeekend: boolean,
  rng: () => number,
): number {
  const key = HOUSEHOLD_ARCHETYPE_KEYS[household.id] ?? 'family';
  const arch = ARchetypes[key];
  let base: number;
  if (localHour >= 0 && localHour < 6) base = arch.base + arch.night * 0.15;
  else if (localHour < 9) base = arch.base + arch.morning * 0.75;
  else if (localHour < 16) base = arch.base + arch.midday;
  else if (localHour < 22) base = arch.base + arch.evening;
  else base = arch.base + arch.night * 0.5;

  const occupancy = 0.82 + household.occupants * 0.045;
  base *= occupancy;
  if (isWeekend) base *= localHour >= 9 && localHour < 22 ? 1.12 : 1.03;

  const temp = weather.tempC;
  const cooling = Math.max(0, temp - 23.5) * (household.hasHeatPump ? 0.23 : 0.11);
  const heating = Math.max(0, 12.5 - temp) * (household.hasHeatPump ? 0.21 : 0.1);
  const daylight = weather.radiationWm2 > 120 ? 0.06 : 0; // lighting offset

  let ev = 0;
  if (household.hasEv) {
    // Commuter charging is habitual, with a modest day-to-day variation.
    if (localHour >= 17 && localHour < 22) ev = 1.15 + rng() * 0.25;
    else if (localHour >= 0 && localHour < 5) ev = 0.45 + rng() * 0.15;
  }

  const noise = 0.965 + rng() * 0.07;
  const total = (base + cooling + heating - daylight + ev) * noise;
  return clamp(total, 0.05, 14);
}

export function householdSolarKwh(household: Household, weather: WeatherSlot, rng: () => number): number {
  if (household.pvKwp <= 0) return 0;
  const irradiance = Math.max(0, weather.radiationWm2) * 1.035;
  const tempDerate = 1 - 0.0035 * Math.max(0, weather.tempC - 25);
  const soiling = 0.965;
  const noise = 0.97 + rng() * 0.06;
  return clamp(household.pvKwp * (irradiance / 1000) * tempDerate * soiling * noise, 0, household.pvKwp * 1.05);
}

export function isWeekendLocal(iso: string, timezone: string): boolean {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(new Date(iso));
  return day === 'Sat' || day === 'Sun';
}

export function localHourOf(iso: string, timezone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(new Date(iso)),
  );
}

export function rngFor(seedText: string): () => number {
  return seededRng(seedText);
}
