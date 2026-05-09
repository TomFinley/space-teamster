import { ESTELLA_BODIES, ESTELLA_STATION_POIS, ESTELLA_SURFACE_POIS } from './content/estella/gameplay';
import { TYCHO_BODIES, TYCHO_STATION_POIS, TYCHO_SURFACE_POIS } from './content/tycho/geography';

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

export interface CloudCityLandingLayout {
  kind: 'cloud-city';
  deckLeft: number;
  deckRight: number;
  deckY: number;
  deckThickness: number;
  supportXs: number[];
  supportWidth: number;
  supportHeight: number;
  domes: { x: number; radius: number; height: number }[];
}

export type LandingLayoutDef = CloudCityLandingLayout;

export interface SurfacePoiDef {
  id: string;
  name: string;
  subtitle: string;
  bodyId: string;
  surfaceAngle: number;
  altitude: number;
  padCenterX: number;
  padHalfWidth: number;
  padY: number;
  roughness: number;
  features: TerrainFeature[];
  landingLayout?: LandingLayoutDef;
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

export const BODIES: BodyDef[] = [...TYCHO_BODIES, ...ESTELLA_BODIES];

export const SURFACE_POIS: SurfacePoiDef[] = [...TYCHO_SURFACE_POIS, ...ESTELLA_SURFACE_POIS];

export const STATION_POIS: StationPoiDef[] = [...TYCHO_STATION_POIS, ...ESTELLA_STATION_POIS];

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
