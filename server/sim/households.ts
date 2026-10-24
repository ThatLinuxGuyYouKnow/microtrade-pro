import type { Household } from '../../shared/types.js';
import { walletFromSeed } from '../chain/crypto.js';
import { seededRng } from '../../shared/utils.js';

interface Seed {
  id: string;
  name: string;
  archetype: string;
  archetypeKey: 'family' | 'retiree' | 'wfh' | 'small' | 'duplex';
  pvKwp: number;
  batteryKwh: number;
  occupants: number;
  hasEv: boolean;
  hasHeatPump: boolean;
  color: string;
  position: { x: number; z: number };
  strategy: 'conservative' | 'balanced' | 'aggressive';
}

const SEEDS: Seed[] = [
  {
    id: 'h1', name: 'Alder House', archetype: 'Family of four · solar + EV',
    archetypeKey: 'family', pvKwp: 7.2, batteryKwh: 13.5, occupants: 4,
    hasEv: true, hasHeatPump: true, color: '#5CE1A8', position: { x: -6.4, z: -4.2 },
    strategy: 'balanced',
  },
  {
    id: 'h2', name: 'Birch House', archetype: 'Retired couple · rooftop solar',
    archetypeKey: 'retiree', pvKwp: 4.8, batteryKwh: 5, occupants: 2,
    hasEv: false, hasHeatPump: false, color: '#F5B84A', position: { x: -6.6, z: 3.4 },
    strategy: 'conservative',
  },
  {
    id: 'h3', name: 'Cedar House', archetype: 'Work-from-home · solar + EV',
    archetypeKey: 'wfh', pvKwp: 6.6, batteryKwp: 0, batteryKwh: 10, occupants: 3,
    hasEv: true, hasHeatPump: true, color: '#67B7F7', position: { x: -1.2, z: -7.4 },
    strategy: 'aggressive',
  } as Seed,
  {
    id: 'h4', name: 'Dogwood House', archetype: 'Compact home · no storage',
    archetypeKey: 'small', pvKwp: 3.6, batteryKwh: 0, occupants: 2,
    hasEv: false, hasHeatPump: false, color: '#B79CF0', position: { x: 4.6, z: -5.6 },
    strategy: 'balanced',
  },
  {
    id: 'h5', name: 'Elm House', archetype: 'Family of five · 20 kWh battery',
    archetypeKey: 'family', pvKwp: 9.0, batteryKwh: 20, occupants: 5,
    hasEv: true, hasHeatPump: true, color: '#F18F80', position: { x: 7.6, z: 1.4 },
    strategy: 'balanced',
  },
  {
    id: 'h6', name: 'Fir House', archetype: 'Townhome · shared roof array',
    archetypeKey: 'small', pvKwp: 2.4, batteryKwh: 5, occupants: 2,
    hasEv: false, hasHeatPump: false, color: '#7FD4C1', position: { x: 3.2, z: 6.6 },
    strategy: 'conservative',
  },
  {
    id: 'h7', name: 'Grove House', archetype: 'Duplex · solar canopy + EV',
    archetypeKey: 'duplex', pvKwp: 8.4, batteryKwh: 16, occupants: 6,
    hasEv: true, hasHeatPump: false, color: '#E3C567', position: { x: -3.2, z: 6.4 },
    strategy: 'aggressive',
  },
  {
    id: 'h8', name: 'Hazel House', archetype: 'Family of three · heat pump',
    archetypeKey: 'family', pvKwp: 5.4, batteryKwh: 13.5, occupants: 3,
    hasEv: false, hasHeatPump: true, color: '#8AB4F8', position: { x: 7.4, z: -2.6 },
    strategy: 'balanced',
  },
  {
    id: 'h9', name: 'Community Battery', archetype: 'Shared 120 kWh storage array',
    archetypeKey: 'small', pvKwp: 14, batteryKwh: 120, occupants: 0,
    hasEv: false, hasHeatPump: false, color: '#9BE37A', position: { x: 0.2, z: 1.2 },
    strategy: 'aggressive',
  },
];

export function createHouseholds(): Household[] {
  return SEEDS.map((s) => {
    const wallet = walletFromSeed(s.id, `cedar-hollow-resident-${s.id}`);
    const rng = seededRng(`household-${s.id}`);
    const idNum = Number(s.id.slice(1));
    return {
      id: s.id,
      name: s.name,
      short: `CH-${String(idNum).padStart(2, '0')}`,
      archetype: s.archetype,
      address: wallet.address,
      pvKwp: s.pvKwp,
      batteryKwh: s.batteryKwh,
      occupants: s.occupants,
      hasEv: s.hasEv,
      hasHeatPump: s.hasHeatPump,
      color: s.color,
      strategy: s.strategy,
      autonomy: true,
      riskAppetite: s.strategy === 'aggressive' ? 0.78 : s.strategy === 'conservative' ? 0.28 : 0.52,
      position: s.position,
      seed: Math.floor(rng() * 1e6),
    };
  });
}

export function findHousehold(households: Household[], id: string): Household | undefined {
  return households.find((h) => h.id === id);
}

export const HOUSEHOLD_ARCHETYPE_KEYS: Record<string, Seed['archetypeKey']> = Object.fromEntries(
  SEEDS.map((s) => [s.id, s.archetypeKey]),
);

export const PV_META = Object.fromEntries(
  SEEDS.map((s) => [s.id, { pvKwp: s.pvKwp, batteryKwh: s.batteryKwh, occupants: s.occupants }]),
);
