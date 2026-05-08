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

/** Exact atmosphere simulation params by stable node id. Empty until values are authored. */
export const ESTELLA_ATMOSPHERE_PHYSICS: Partial<Record<string, AtmospherePhysicsDef>> = {};
