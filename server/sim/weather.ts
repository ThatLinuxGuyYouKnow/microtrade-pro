import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { WeatherSlot } from '../../shared/types.js';
import { CONFIG } from '../config.js';
import { clamp, round, seededRng, startOfHour } from '../../shared/utils.js';

const CACHE_FILE = 'data/weather-cache.json';
const CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheShape {
  fetchedAt: string;
  source: 'open-meteo' | 'synthetic';
  latitude: number;
  longitude: number;
  slots: WeatherSlot[];
}

function ensureDir(path: string) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Physical clear-sky irradiance approximation for the given hour (W/m²). */
export function clearSkyRadiation(date: Date, latDeg: number): number {
  const dayOfYear = Math.floor(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(date.getUTCFullYear(), 0, 0)) /
      86_400_000,
  );
  const declination = 23.45 * Math.sin(((360 / 365) * (dayOfYear - 81) * Math.PI) / 180);
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60; // UTC; Austin is UTC-5/6
  const solarHour = hour - 6; // approximate local solar time offset for longitude -97.7
  const hourAngle = (15 * (solarHour - 12) * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const dec = (declination * Math.PI) / 180;
  const cosZenith =
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle);
  if (cosZenith <= 0.02) return 0;
  const airMass = 1 / Math.max(cosZenith, 0.08);
  // Simple atmospheric attenuation, tuned to Central Texas in autumn.
  const direct = 950 * Math.pow(0.7, Math.pow(airMass, 0.678));
  return clamp(direct * cosZenith, 0, 980);
}

export function syntheticWeather(startIso: string, hours: number, seedText = 'weather'): WeatherSlot[] {
  const start = new Date(startIsoIso(startIso));
  const slots: WeatherSlot[] = [];
  const dayRng = seededRng(`${seedText}-${startIso.slice(0, 10)}`);
  const cloudBias = dayRng() * 30;
  const tempOffsets = new Map<string, number>();
  for (let i = 0; i < hours; i++) {
    const date = new Date(start.getTime() + i * 3600_000);
    const localHour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: CONFIG.timezone,
        hour: 'numeric',
        hour12: false,
      }).format(date),
    );
    const dayAngle = ((localHour - 16) / 24) * Math.PI * 2;
    const dateKey = date.toISOString().slice(0, 10);
    if (!tempOffsets.has(dateKey)) {
      tempOffsets.set(dateKey, (seededRng(`temp-${dateKey}-${seedText}`)() - 0.4) * 11);
    }
    // Synoptic day-to-day swings make weather features genuinely informative.
    const tempC = 23.2 - 5.6 * Math.cos(dayAngle) + (tempOffsets.get(dateKey) ?? 0) + (dayRng() - 0.5) * 1.1;
    const cloudPct = clamp(cloudBias + 22 * Math.sin((i / 7) * Math.PI) + (dayRng() - 0.5) * 28, 0, 96);
    const clear = clearSkyRadiation(date, CONFIG.location.lat);
    const radiationWm2 = clear * (1 - 0.62 * (cloudPct / 100)) * (0.94 + dayRng() * 0.08);
    slots.push({
      t: date.toISOString(),
      tempC: round(tempC, 1),
      cloudPct: round(cloudPct, 0),
      radiationWm2: round(Math.max(0, radiationWm2), 0),
      windKph: round(6 + dayRng() * 16, 1),
    });
  }
  return slots;
}

function startIsoIso(iso: string): string {
  return startOfHour(iso);
}

export async function loadWeather(nowIso: string, force = false): Promise<{ slots: WeatherSlot[]; source: string }> {
  const cached = readCache();
  if (!force && cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) {
    const patched = alignToNow(cached.slots, nowIso);
    if (patched.length >= 36) return { slots: patched, source: cached.source };
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.location.lat}` +
      `&longitude=${CONFIG.location.lon}` +
      '&hourly=temperature_2m,cloud_cover,shortwave_radiation,wind_speed_10m' +
      '&forecast_days=3&past_days=2&timezone=UTC';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const json = (await res.json()) as {
      hourly: {
        time: string[];
        temperature_2m: number[];
        cloud_cover: number[];
        shortwave_radiation: number[];
        wind_speed_10m: number[];
      };
    };
    const slots: WeatherSlot[] = json.hourly.time.map((t, i) => ({
      t: new Date(`${t}:00Z`).toISOString(),
      tempC: round(json.hourly.temperature_2m[i] ?? 22, 1),
      cloudPct: round(json.hourly.cloud_cover[i] ?? 20, 0),
      radiationWm2: round(Math.max(0, json.hourly.shortwave_radiation[i] ?? 0), 0),
      windKph: round(json.hourly.wind_speed_10m[i] ?? 8, 1),
    }));
    if (slots.length < 24) throw new Error('open-meteo returned too few hours');
    const cache: CacheShape = {
      fetchedAt: new Date().toISOString(),
      source: 'open-meteo',
      latitude: CONFIG.location.lat,
      longitude: CONFIG.location.lon,
      slots,
    };
    writeCache(cache);
    return { slots: alignToNow(slots, nowIso), source: 'open-meteo' };
  } catch (error) {
    const slots = syntheticWeather(nowIso, 72);
    writeCache({
      fetchedAt: new Date().toISOString(),
      source: 'synthetic',
      latitude: CONFIG.location.lat,
      longitude: CONFIG.location.lon,
      slots,
    });
    return { slots, source: 'synthetic' };
  }
}

function alignToNow(slots: WeatherSlot[], nowIso: string): WeatherSlot[] {
  const now = new Date(startOfHour(nowIso)).getTime();
  // Keep two days of history for backtests plus the full forward horizon.
  const past = slots.filter((s) => new Date(s.t).getTime() >= now - 48 * 3600_000);
  if (past.length >= 36) return past;
  const last = slots.length ? slots[slots.length - 1].t : nowIso;
  return [...slots, ...syntheticWeather(last, 72, 'weather-tail')];
}

function readCache(): CacheShape | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as CacheShape;
  } catch {
    return null;
  }
}

function writeCache(cache: CacheShape) {
  try {
    ensureDir(CACHE_FILE);
    writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch {
    // Cache is best-effort; simulation must keep running without disk access.
  }
}

export function weatherAt(slots: WeatherSlot[], iso: string): WeatherSlot {
  const target = new Date(iso).getTime();
  let best = slots[0];
  let bestDiff = Infinity;
  for (const slot of slots) {
    const diff = Math.abs(new Date(slot.t).getTime() - target);
    if (diff < bestDiff) {
      best = slot;
      bestDiff = diff;
    }
  }
  return best;
}
