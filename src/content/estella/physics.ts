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

const EARTH_STANDARD_DENSITY = 1.225;
const ACHERON_OLYMPOS_ALTITUDE = 55_000;
const ACHERON_SCALE_HEIGHT = 14_000;
const ACHERON_SURFACE_DENSITY = EARTH_STANDARD_DENSITY * Math.exp(ACHERON_OLYMPOS_ALTITUDE / ACHERON_SCALE_HEIGHT);

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
    gm: 3.5 * 450_000 * 450_000 * 8_000,
    notes: 'Gameplay-scale Estella primary; GM is boosted with stellar orbit radii scaled 20x so transfer speeds are high enough for playable patched-conic flybys while periods remain similar.',
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
    notes: 'Gaia, the Earth-like capital world; near-Earth surface gravity, gameplay-scaled.'
  },
  'estella-iiia': {
    radius: 140_000,
    gm: 1.62 * 140_000 * 140_000,
    rotationPeriod: 58_000,
    notes: 'Large airless moon of Gaia; Luna-like surface gravity, gameplay-scaled.'
  },
  'estella-iv': {
    radius: 345_000,
    gm: 9.2 * 345_000 * 345_000,
    rotationPeriod: 70_000,
    notes: 'Dahai, a breathable ocean world; near-Earth surface gravity, gameplay-scaled.'
  },
  'estella-v': {
    radius: 280_000,
    gm: 3.9 * 280_000 * 280_000,
    rotationPeriod: 72_000,
    notes: 'Mars-like Camps industrial world with thin CO2 atmosphere and dust-storm operations.',
  },
  'estella-va': {
    radius: 85_000,
    gm: 0.42 * 85_000 * 85_000,
    rotationPeriod: 38_000,
    notes: 'Small airless mining moon of Estella V.',
  },
  'estella-vi': {
    radius: 330_000,
    gm: 7.8 * 330_000 * 330_000,
    rotationPeriod: 82_000,
    notes: 'Thick cold atmospheric Camps industrial world and flight-school planet.',
  },
  'estella-via': {
    radius: 95_000,
    gm: 0.55 * 95_000 * 95_000,
    rotationPeriod: 44_000,
    notes: 'Small airless shipyard moon of Estella VI.',
  },
  'estella-vib': {
    radius: 80_000,
    gm: 0.38 * 80_000 * 80_000,
    rotationPeriod: 41_000,
    notes: 'Small airless specialty/pharma moon of Estella VI.',
  },
  'estella-vii': {
    radius: 170_000,
    gm: 1.2 * 170_000 * 170_000,
    rotationPeriod: 50_000,
    notes: 'Small airless Camps precision-ops planet.',
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
    orbitalDefaults: { baseTimeScale: 50, thrustAccel: 0.08, thrustAccelMax: 1.8, fuelDeltaV: 1_600, transitionAltitude: 70_000 },
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
    color: [65, 170, 225],
    planetFillColor: '#031724',
    planetStrokeColor: '#2f9fd8',
    terrainFillColor: '#062431',
    terrainStrokeColor: '#38b7cf',
    terrainBrightColor: '#8be8ff',
    orbitalDefaults: { baseTimeScale: 50, thrustAccel: 0.08, thrustAccelMax: 1.8, fuelDeltaV: 1_500, transitionAltitude: 40_000 },
  },
  'estella-v': {
    color: [190, 120, 85],
    planetFillColor: '#20100c',
    planetStrokeColor: '#a76042',
    terrainFillColor: '#21110d',
    terrainStrokeColor: '#a76042',
    terrainBrightColor: '#d88b62',
    orbitalDefaults: { baseTimeScale: 50, thrustAccel: 0.07, thrustAccelMax: 1.5, fuelDeltaV: 1_250, transitionAltitude: 28_000 },
  },
  'estella-va': {
    color: [155, 135, 115],
    planetFillColor: '#15120f',
    planetStrokeColor: '#806f60',
    terrainFillColor: '#15120f',
    terrainStrokeColor: '#806f60',
    terrainBrightColor: '#b8a18c',
    orbitalDefaults: { baseTimeScale: 50, thrustAccel: 0.04, thrustAccelMax: 0.9, fuelDeltaV: 750, transitionAltitude: 5_000 },
  },
  'estella-vi': {
    color: [120, 165, 180],
    planetFillColor: '#0d1b20',
    planetStrokeColor: '#5f9fb2',
    terrainFillColor: '#132020',
    terrainStrokeColor: '#6c9d9b',
    terrainBrightColor: '#a7c9c3',
    orbitalDefaults: { baseTimeScale: 50, thrustAccel: 0.08, thrustAccelMax: 1.8, fuelDeltaV: 1_500, transitionAltitude: 55_000 },
  },
  'estella-via': {
    color: [145, 150, 150],
    planetFillColor: '#111516',
    planetStrokeColor: '#758080',
    terrainFillColor: '#111516',
    terrainStrokeColor: '#758080',
    terrainBrightColor: '#a7b0b0',
    orbitalDefaults: { baseTimeScale: 50, thrustAccel: 0.04, thrustAccelMax: 0.9, fuelDeltaV: 750, transitionAltitude: 5_000 },
  },
  'estella-vib': {
    color: [155, 150, 180],
    planetFillColor: '#151420',
    planetStrokeColor: '#827aa8',
    terrainFillColor: '#151420',
    terrainStrokeColor: '#827aa8',
    terrainBrightColor: '#bbb2df',
    orbitalDefaults: { baseTimeScale: 50, thrustAccel: 0.04, thrustAccelMax: 0.9, fuelDeltaV: 750, transitionAltitude: 5_000 },
  },
  'estella-vii': {
    color: [120, 120, 130],
    planetFillColor: '#101014',
    planetStrokeColor: '#666a72',
    terrainFillColor: '#101014',
    terrainStrokeColor: '#666a72',
    terrainBrightColor: '#999faa',
    orbitalDefaults: { baseTimeScale: 50, thrustAccel: 0.04, thrustAccelMax: 0.85, fuelDeltaV: 800, transitionAltitude: 5_500 },
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
    surfaceDensity: ACHERON_SURFACE_DENSITY,
    scaleHeight: ACHERON_SCALE_HEIGHT,
    notes: 'Venus-like envelope calibrated so Olympos at 55 km is approximately Earth-standard density.',
  },
  'estella-v': {
    kind: 'thin-co2',
    height: 55_000,
    surfaceDensity: 0.18,
    scaleHeight: 11_000,
    notes: 'Thin CO2 Mars-like atmosphere; enough for dust/weather handling but weak lift.',
  },
  'estella-iii': {
    kind: 'breathable',
    height: 80_000,
    surfaceDensity: 1.2,
    scaleHeight: 8_000,
    notes: 'Earth-like breathable atmosphere; lower than Tycho but paired with near-Earth entry speeds.',
  },
  'estella-vi': {
    kind: 'thick-cold',
    height: 95_000,
    surfaceDensity: 2.2,
    scaleHeight: 11_500,
    notes: 'Thick cold N2/CO2 atmosphere; demanding civilian flight-school world.',
  },
  'estella-iv': {
    kind: 'breathable',
    height: 75_000,
    surfaceDensity: 1.0,
    scaleHeight: 8_500,
    notes: 'Humid marine breathable atmosphere for Dahai, a water world.'
  },
};
