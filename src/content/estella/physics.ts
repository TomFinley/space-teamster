import { type AtmosphereModel } from '../types';

export interface BodyPhysicsDef {
  radius: number;
  gm: number;
  rotationPeriod?: number;
  notes?: string;
}

export interface AtmospherePhysicsDef {
  kind: AtmosphereModel['kind'];
  height: number;
  surfaceDensity: number;
  scaleHeight: number;
  windProfileId?: string;
  turbulenceProfileId?: string;
  notes?: string;
}

export interface BodyFlightProfileDef {
  color: [number, number, number];
  planetFillColor?: string;
  planetStrokeColor?: string;
  terrainFillColor?: string;
  terrainStrokeColor?: string;
  terrainBrightColor?: string;
  orbitalDefaults: {
    baseTimeScale: number;
    thrustAccel: number;
    thrustAccelMax: number;
    fuelDeltaV: number;
    transitionAltitude: number;
  };
}

/** Exact body physics by stable node id. */
export const ESTELLA_BODY_PHYSICS: Partial<Record<string, BodyPhysicsDef>> = {
  estella: {
    radius: 450_000,
    gm: 3.5 * 450_000 * 450_000,
    notes: 'Gameplay-scale Estella primary used as the parent gravity well for dwarf-planet transfers.',
  },
  'estella-i': {
    radius: 150_000,
    gm: 3.7 * 150_000 * 150_000,
    rotationPeriod: 42_000,
    notes: 'Small hot inner airless world; Mercury-like surface gravity, gameplay-scaled.',
  },
  'estella-ii': {
    radius: 320_000,
    gm: 8.9 * 320_000 * 320_000,
    rotationPeriod: 90_000,
    notes: 'Venus-like inner world; near-Venus surface gravity, gameplay-scaled.',
  },
  'estella-iii': {
    radius: 360_000,
    gm: 9.6 * 360_000 * 360_000,
    rotationPeriod: 64_000,
    notes: 'Earth-like capital world; near-Earth surface gravity, gameplay-scaled.',
  },
  'estella-iiia': {
    radius: 140_000,
    gm: 1.62 * 140_000 * 140_000,
    rotationPeriod: 58_000,
    notes: 'Large airless moon of Estella III; Luna-like surface gravity, gameplay-scaled.',
  },
  'estella-iv': {
    radius: 345_000,
    gm: 9.2 * 345_000 * 345_000,
    rotationPeriod: 70_000,
    notes: 'Earth-like sister/rival world; near-Earth surface gravity, gameplay-scaled.',
  },
  'estella-viii': {
    radius: 180_000,
    gm: 1.7 * 180_000 * 180_000,
    rotationPeriod: 48_000,
    notes: 'Initial authored dwarf-planet test body for Estella navigation prototyping.',
  },
  'estella-ix': {
    radius: 165_000,
    gm: 1.45 * 165_000 * 165_000,
    rotationPeriod: 52_000,
    notes: 'Icy sibling dwarf planet near Estella VIII for same-belt transfer prototyping.',
  },
};

/** Flight/rendering profile data needed to adapt Estella bodies into current gameplay phases. */
export const ESTELLA_BODY_FLIGHT_PROFILES: Partial<Record<string, BodyFlightProfileDef>> = {
  estella: {
    color: [255, 210, 130],
    planetFillColor: '#241806',
    planetStrokeColor: '#d59a32',
    terrainFillColor: '#241806',
    terrainStrokeColor: '#d59a32',
    terrainBrightColor: '#ffd58a',
    orbitalDefaults: {
      baseTimeScale: 2_400,
      thrustAccel: 0.0006,
      thrustAccelMax: 0.025,
      fuelDeltaV: 1_200,
      transitionAltitude: 20_000,
    },
  },
  'estella-i': {
    color: [205, 125, 70],
    planetFillColor: '#21100a',
    planetStrokeColor: '#b66332',
    terrainFillColor: '#21100a',
    terrainStrokeColor: '#b66332',
    terrainBrightColor: '#e09a62',
    orbitalDefaults: { baseTimeScale: 50, thrustAccel: 0.05, thrustAccelMax: 1.0, fuelDeltaV: 900, transitionAltitude: 8_000 },
  },
  'estella-ii': {
    color: [210, 170, 85],
    planetFillColor: '#261b08',
    planetStrokeColor: '#c49a3f',
    terrainFillColor: '#261b08',
    terrainStrokeColor: '#c49a3f',
    terrainBrightColor: '#e6c26a',
    orbitalDefaults: { baseTimeScale: 50, thrustAccel: 0.08, thrustAccelMax: 1.8, fuelDeltaV: 1_600, transitionAltitude: 45_000 },
  },
  'estella-iii': {
    color: [80, 150, 220],
    planetFillColor: '#071827',
    planetStrokeColor: '#3e95d0',
    terrainFillColor: '#0b1d16',
    terrainStrokeColor: '#4e9b70',
    terrainBrightColor: '#8ccf9d',
    orbitalDefaults: { baseTimeScale: 50, thrustAccel: 0.08, thrustAccelMax: 1.8, fuelDeltaV: 1_600, transitionAltitude: 35_000 },
  },
  'estella-iiia': {
    color: [170, 165, 150],
    planetFillColor: '#171613',
    planetStrokeColor: '#8d897c',
    terrainFillColor: '#171613',
    terrainStrokeColor: '#8d897c',
    terrainBrightColor: '#c8c0aa',
    orbitalDefaults: { baseTimeScale: 50, thrustAccel: 0.05, thrustAccelMax: 1.0, fuelDeltaV: 850, transitionAltitude: 7_000 },
  },
  'estella-iv': {
    color: [95, 190, 165],
    planetFillColor: '#071f1a',
    planetStrokeColor: '#43b59d',
    terrainFillColor: '#10250f',
    terrainStrokeColor: '#73b84f',
    terrainBrightColor: '#b7d77a',
    orbitalDefaults: { baseTimeScale: 50, thrustAccel: 0.08, thrustAccelMax: 1.8, fuelDeltaV: 1_500, transitionAltitude: 40_000 },
  },
  'estella-viii': {
    color: [135, 155, 170],
    planetFillColor: '#101820',
    planetStrokeColor: '#607080',
    terrainFillColor: '#101820',
    terrainStrokeColor: '#607080',
    terrainBrightColor: '#8da0ad',
    orbitalDefaults: {
      baseTimeScale: 50,
      thrustAccel: 0.05,
      thrustAccelMax: 1.0,
      fuelDeltaV: 900,
      transitionAltitude: 8_000,
    },
  },
  'estella-ix': {
    color: [190, 145, 220],
    planetFillColor: '#1b1026',
    planetStrokeColor: '#a06ec0',
    terrainFillColor: '#1b1026',
    terrainStrokeColor: '#a06ec0',
    terrainBrightColor: '#d2a8e8',
    orbitalDefaults: {
      baseTimeScale: 50,
      thrustAccel: 0.05,
      thrustAccelMax: 1.0,
      fuelDeltaV: 900,
      transitionAltitude: 8_000,
    },
  },
};

/** Exact atmosphere simulation params by stable node id. */
export const ESTELLA_ATMOSPHERE_PHYSICS: Partial<Record<string, AtmospherePhysicsDef>> = {
  'estella-ii': {
    kind: 'venuslike-toxic',
    height: 120_000,
    surfaceDensity: 6.0,
    scaleHeight: 14_000,
    notes: 'Gameplay-thick Venus-like envelope; orbital platforms are placed above the simulated drag band.',
  },
  'estella-iii': {
    kind: 'breathable',
    height: 80_000,
    surfaceDensity: 1.2,
    scaleHeight: 8_000,
    notes: 'Earth-like breathable atmosphere; lower than Tycho but paired with near-Earth entry speeds.',
  },
  'estella-iv': {
    kind: 'breathable',
    height: 75_000,
    surfaceDensity: 1.0,
    scaleHeight: 8_500,
    notes: 'Slightly thinner green-tinted Earth-like atmosphere for the sister world.',
  },
};
