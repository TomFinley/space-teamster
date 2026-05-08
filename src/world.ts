export interface CircularOrbitDef {
  parentBodyId: string;
  radius: number;
  epochAngle: number;
  epochTime: number;
  orbitSense: 1 | -1;
}

export interface OrbitModeDef {
  id: string;
  label: string;
  minAltitude?: number;
  maxAltitude?: number;
  baseTimeScale?: number;
  maxOuterOrbitWallTime?: number;
  thrustAccel?: number;
  thrustAccelMax?: number;
  thrustWallDvPerSec?: number;
  thrustWallDvPerSecMax?: number;
  matchWallThrustToModeId?: string;
}

export interface WindLayerDef {
  altitudeCenter: number;
  altitudeWidth: number;
  strength: number;
}

export interface TurbulenceZoneDef {
  altitudeMin: number;
  altitudeMax: number;
  strength: number;
}

export interface BodyDef {
  id: string;
  name: string;
  radius: number;
  gm: number;
  color: [number, number, number];
  planetFillColor?: string;
  planetStrokeColor?: string;
  terrainFillColor?: string;
  terrainStrokeColor?: string;
  terrainBrightColor?: string;
  atmosphere: {
    height: number;
    surfaceDensity: number;
    scaleHeight: number;
    color: [number, number, number];
  } | null;
  orbit?: CircularOrbitDef;
  orbitModes?: OrbitModeDef[];
  orbitalDefaults: {
    baseTimeScale: number;
    thrustAccel: number;
    thrustAccelMax: number;
    fuelDeltaV: number;
    transitionAltitude: number;
  };
  approachEnvironment?: {
    windLayers: WindLayerDef[];
    turbulence: TurbulenceZoneDef[];
  };
  transferGameplay?: {
    patchRadius: number;
    displayPatchRadius?: number;
  };
}

export interface TerrainFeature {
  xStart: number;
  xEnd: number;
  height: number;
}

export interface SurfacePoiDef {
  id: string;
  name: string;
  subtitle: string;
  bodyId: string;
  surfaceAngle: number;
  padCenterX: number;
  padHalfWidth: number;
  padY: number;
  roughness: number;
  features: TerrainFeature[];
  landingStart: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    landingMaxVSpeed: number;
    landingMaxHSpeed: number;
    landingMaxAngle: number;
  };
  descentProfile: {
    startX: number;
    startY: number;
    startVX: number;
    startVY: number;
    startAngle: number;
    gateY: number;
    gateRadius: number;
    gateMaxSpeed: number;
    gateMinSpeed: number;
  };
  departureProfile: {
    startY: number;
    startVY: number;
    exitAltitude: number;
    thresholdApoapsisAltitude: number;
    targetOrbitAltitude: number;
    orbitDir: 1 | -1;
    fuelSeconds: number;
  };
}

export interface StationPoiDef {
  id: string;
  name: string;
  subtitle: string;
  bodyId: string;
  orbit: CircularOrbitDef;
  captureRadius: number;
  captureMaxSpeed: number;
  docking: {
    undock: {
      exitDistance: number;
      targetSpoke: number;
      targetSide: number;
      targetSlot: number;
      fillPct: number;
    };
    delivery: {
      targetSpoke: number;
      targetSide: number;
      targetSlot: number;
      fillPct: number;
    };
    beamRange: number;
    beamStrength: number;
    thrustForce: number;
    rotTorque: number;
    tugMass: number;
    containerMass: number;
    dampingAssist: boolean;
  };
}

const TYCHO_RADIUS = 450_000;
const TYCHO_GM = 3.5 * TYCHO_RADIUS * TYCHO_RADIUS;
const SHARED_MOON_RADIUS = 200_000;
const SHARED_MOON_GM = 1.6 * SHARED_MOON_RADIUS * SHARED_MOON_RADIUS;
const CASTOR_SYSTEM_ORBIT_RADIUS = 15_000_000;
const POLLUX_SYSTEM_ORBIT_RADIUS = 21_000_000;
const CASTOR_SYSTEM_EPOCH_ANGLE = -1.25;
const POLLUX_SYSTEM_EPOCH_ANGLE = CASTOR_SYSTEM_EPOCH_ANGLE + 0.70;

const TYCHO_WIND_LAYERS: WindLayerDef[] = [
  { altitudeCenter: 14000, altitudeWidth: 1800, strength: 7 },
  { altitudeCenter: 8000, altitudeWidth: 1400, strength: -10 },
  { altitudeCenter: 4200, altitudeWidth: 900, strength: 4 },
];

const TYCHO_TURBULENCE: TurbulenceZoneDef[] = [
  { altitudeMin: 4500, altitudeMax: 9500, strength: 3 },
];

export const BODIES: BodyDef[] = [
  {
    id: 'tycho',
    name: 'Tycho',
    radius: TYCHO_RADIUS,
    gm: TYCHO_GM,
    color: [70, 135, 210],
    atmosphere: {
      height: 90_000,
      surfaceDensity: 1.5,
      scaleHeight: 8500,
      color: [70, 135, 210],
    },
    orbitModes: [
      {
        id: 'low',
        label: 'Tycho low orbit',
        maxAltitude: 800_000,
        baseTimeScale: 60,
        thrustAccel: 0.08,
        thrustAccelMax: 1.5,
      },
      {
        id: 'high',
        label: 'Tycho high orbit',
        minAltitude: 800_000,
        baseTimeScale: 2400,
        thrustWallDvPerSec: 4.8,
        thrustWallDvPerSecMax: 90,
      },
    ],
    orbitalDefaults: {
      baseTimeScale: 60,
      thrustAccel: 0.08,
      thrustAccelMax: 1.5,
      fuelDeltaV: 500,
      transitionAltitude: 20_000,
    },
    approachEnvironment: {
      windLayers: TYCHO_WIND_LAYERS,
      turbulence: TYCHO_TURBULENCE,
    },
  },
  {
    id: 'castor',
    name: 'Castor',
    radius: SHARED_MOON_RADIUS,
    gm: SHARED_MOON_GM,
    color: [160, 145, 120],
    planetFillColor: '#17130e',
    planetStrokeColor: '#665a46',
    terrainFillColor: '#17130e',
    terrainStrokeColor: '#665a46',
    terrainBrightColor: '#8b7b61',
    atmosphere: null,
    orbitalDefaults: {
      baseTimeScale: 50,
      thrustAccel: 0.05,
      thrustAccelMax: 1.0,
      fuelDeltaV: 400,
      transitionAltitude: 8_000,
    },
    transferGameplay: {
      patchRadius: 1_050_000,
    },
    orbit: {
      parentBodyId: 'tycho',
      radius: CASTOR_SYSTEM_ORBIT_RADIUS,
      epochAngle: CASTOR_SYSTEM_EPOCH_ANGLE,
      epochTime: 0,
      orbitSense: 1,
    },
  },
  {
    id: 'pollux',
    name: 'Pollux',
    radius: SHARED_MOON_RADIUS,
    gm: SHARED_MOON_GM,
    color: [110, 150, 185],
    planetFillColor: '#0e1620',
    planetStrokeColor: '#5d8aa7',
    terrainFillColor: '#0e1620',
    terrainStrokeColor: '#5d8aa7',
    terrainBrightColor: '#86aec8',
    atmosphere: null,
    orbitalDefaults: {
      baseTimeScale: 50,
      thrustAccel: 0.05,
      thrustAccelMax: 1.0,
      fuelDeltaV: 400,
      transitionAltitude: 8_000,
    },
    transferGameplay: {
      patchRadius: 1_200_000,
    },
    orbit: {
      parentBodyId: 'tycho',
      radius: POLLUX_SYSTEM_ORBIT_RADIUS,
      epochAngle: POLLUX_SYSTEM_EPOCH_ANGLE,
      epochTime: 0,
      orbitSense: 1,
    },
  },
];

export const SURFACE_POIS: SurfacePoiDef[] = [
  {
    id: 'castor-settlement',
    name: 'Castor Settlement',
    subtitle: 'Mining outpost on airless moon',
    bodyId: 'castor',
    surfaceAngle: -Math.PI / 3,
    padCenterX: 1000,
    padHalfWidth: 25,
    padY: 30,
    roughness: 0.7,
    features: [
      { xStart: 920, xEnd: 935, height: 45 },
      { xStart: 1050, xEnd: 1065, height: 55 },
    ],
    landingStart: {
      x: 980,
      y: 250,
      vx: 5,
      vy: -2,
      landingMaxVSpeed: 4.0,
      landingMaxHSpeed: 3.0,
      landingMaxAngle: 0.26,
    },
    descentProfile: {
      startX: -110000,
      startY: 9000,
      startVX: 540,
      startVY: -26,
      startAngle: 1.5,
      gateY: 1600,
      gateRadius: 1900,
      gateMaxSpeed: 150,
      gateMinSpeed: 15,
    },
    departureProfile: {
      startY: 250,
      startVY: 5,
      exitAltitude: 8_000,
      thresholdApoapsisAltitude: 20_000,
      targetOrbitAltitude: 100_000,
      orbitDir: 1,
      fuelSeconds: 140,
    },
  },
  {
    id: 'port-kessler',
    name: 'Port Kessler',
    subtitle: 'Atmospheric frontier port on Tycho',
    bodyId: 'tycho',
    surfaceAngle: Math.PI / 5,
    padCenterX: 1000,
    padHalfWidth: 20,
    padY: 32,
    roughness: 1.1,
    features: [
      { xStart: 820, xEnd: 845, height: 55 },
      { xStart: 905, xEnd: 912, height: 95 },
      { xStart: 920, xEnd: 935, height: 45 },
      { xStart: 1065, xEnd: 1072, height: 110 },
      { xStart: 1090, xEnd: 1115, height: 60 },
      { xStart: 1150, xEnd: 1185, height: 40 },
    ],
    landingStart: {
      x: 970,
      y: 320,
      vx: 6,
      vy: -2,
      landingMaxVSpeed: 4.0,
      landingMaxHSpeed: 3.0,
      landingMaxAngle: 0.26,
    },
    descentProfile: {
      startX: -70000,
      startY: 22000,
      startVX: 980,
      startVY: -55,
      startAngle: 1.5,
      gateY: 1800,
      gateRadius: 1700,
      gateMaxSpeed: 150,
      gateMinSpeed: 15,
    },
    departureProfile: {
      startY: 320,
      startVY: 5,
      exitAltitude: 30_000,
      thresholdApoapsisAltitude: 35_000,
      targetOrbitAltitude: 180_000,
      orbitDir: -1,
      fuelSeconds: 90,
    },
  },
  {
    id: 'pollux-outpost',
    name: 'Pollux Outpost',
    subtitle: 'Fresh-cut drilling camp on Pollux',
    bodyId: 'pollux',
    surfaceAngle: 0.92,
    padCenterX: 1000,
    padHalfWidth: 22,
    padY: 28,
    roughness: 1.0,
    features: [
      { xStart: 835, xEnd: 860, height: 40 },
      { xStart: 900, xEnd: 916, height: 70 },
      { xStart: 948, xEnd: 958, height: 28 },
      { xStart: 1044, xEnd: 1054, height: 32 },
      { xStart: 1085, xEnd: 1108, height: 82 },
      { xStart: 1140, xEnd: 1170, height: 50 },
    ],
    landingStart: {
      x: 955,
      y: 260,
      vx: 4,
      vy: -2,
      landingMaxVSpeed: 4.0,
      landingMaxHSpeed: 3.0,
      landingMaxAngle: 0.26,
    },
    descentProfile: {
      startX: -110000,
      startY: 9000,
      startVX: 540,
      startVY: -26,
      startAngle: 1.5,
      gateY: 1600,
      gateRadius: 1900,
      gateMaxSpeed: 150,
      gateMinSpeed: 15,
    },
    departureProfile: {
      startY: 260,
      startVY: 5,
      exitAltitude: 8_000,
      thresholdApoapsisAltitude: 20_000,
      targetOrbitAltitude: 100_000,
      orbitDir: 1,
      fuelSeconds: 130,
    },
  },
];

export const STATION_POIS: StationPoiDef[] = [
  {
    id: 'calloway',
    name: 'Calloway Station',
    subtitle: 'Castor orbital freight and lab hub',
    bodyId: 'castor',
    orbit: {
      parentBodyId: 'castor',
      radius: 300_000,
      epochAngle: -0.25,
      epochTime: 0,
      orbitSense: -1,
    },
    captureRadius: 20_000,
    captureMaxSpeed: 20,
    docking: {
      undock: { exitDistance: 120, targetSpoke: 0, targetSide: 1, targetSlot: 2, fillPct: 0.7 },
      delivery: { targetSpoke: 2, targetSide: 0, targetSlot: 1, fillPct: 0.7 },
      beamRange: 12,
      beamStrength: 0.5,
      thrustForce: 3200,
      rotTorque: 1200,
      tugMass: 500,
      containerMass: 2000,
      dampingAssist: false,
    },
  },
  {
    id: 'anchor',
    name: 'Anchor Station',
    subtitle: 'Tycho orbital transfer and storage hub',
    bodyId: 'tycho',
    orbit: {
      parentBodyId: 'tycho',
      radius: 630_000,
      epochAngle: -2.2,
      epochTime: 0,
      orbitSense: 1,
    },
    captureRadius: 25_000,
    captureMaxSpeed: 22,
    docking: {
      undock: { exitDistance: 160, targetSpoke: 1, targetSide: 0, targetSlot: 4, fillPct: 0.65 },
      delivery: { targetSpoke: 3, targetSide: 1, targetSlot: 2, fillPct: 0.7 },
      beamRange: 12,
      beamStrength: 0.5,
      thrustForce: 3200,
      rotTorque: 1200,
      tugMass: 500,
      containerMass: 2000,
      dampingAssist: false,
    },
  },
  {
    id: 'morrow',
    name: 'Morrow Station',
    subtitle: 'High-orbit Castor research station',
    bodyId: 'castor',
    orbit: {
      parentBodyId: 'castor',
      radius: 420_000,
      epochAngle: 1.4,
      epochTime: 0,
      orbitSense: -1,
    },
    captureRadius: 22_000,
    captureMaxSpeed: 20,
    docking: {
      undock: { exitDistance: 140, targetSpoke: 0, targetSide: 0, targetSlot: 3, fillPct: 0.6 },
      delivery: { targetSpoke: 1, targetSide: 1, targetSlot: 4, fillPct: 0.6 },
      beamRange: 12,
      beamStrength: 0.5,
      thrustForce: 3200,
      rotTorque: 1200,
      tugMass: 500,
      containerMass: 2000,
      dampingAssist: false,
    },
  },
];

export function bodyById(bodyId: string): BodyDef {
  const body = BODIES.find(b => b.id === bodyId);
  if (!body) throw new Error(`Unknown body: ${bodyId}`);
  return body;
}

export function bodyOrbitModeById(bodyId: string, modeId: string): OrbitModeDef | null {
  return bodyById(bodyId).orbitModes?.find(m => m.id === modeId) ?? null;
}

export function surfacePoiById(poiId: string): SurfacePoiDef {
  const poi = SURFACE_POIS.find(p => p.id === poiId);
  if (!poi) throw new Error(`Unknown surface POI: ${poiId}`);
  return poi;
}

export function stationPoiById(poiId: string): StationPoiDef {
  const poi = STATION_POIS.find(p => p.id === poiId);
  if (!poi) throw new Error(`Unknown station POI: ${poiId}`);
  return poi;
}

export function orbitAngularRate(parentGM: number, radius: number): number {
  return Math.sqrt(parentGM / (radius ** 3));
}

export function circularOrbitState(parentGM: number, orbit: CircularOrbitDef, time: number): { x: number; y: number; vx: number; vy: number } {
  const omega = orbit.orbitSense * orbitAngularRate(parentGM, orbit.radius);
  const angle = orbit.epochAngle + omega * (time - orbit.epochTime);
  const speed = Math.sqrt(parentGM / orbit.radius);
  return {
    x: orbit.radius * Math.cos(angle),
    y: orbit.radius * Math.sin(angle),
    vx: -orbit.orbitSense * speed * Math.sin(angle),
    vy: orbit.orbitSense * speed * Math.cos(angle),
  };
}

export function bodyStateRelativeToParent(bodyId: string, time: number): { x: number; y: number; vx: number; vy: number } {
  const body = bodyById(bodyId);
  if (!body.orbit) return { x: 0, y: 0, vx: 0, vy: 0 };
  const parent = bodyById(body.orbit.parentBodyId);
  return circularOrbitState(parent.gm, body.orbit, time);
}

export function stationState(stationId: string, time: number): { x: number; y: number; vx: number; vy: number } {
  const poi = stationPoiById(stationId);
  const body = bodyById(poi.bodyId);
  return circularOrbitState(body.gm, poi.orbit, time);
}
