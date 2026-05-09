import { ESTELLA_ATMOSPHERE_PHYSICS, ESTELLA_BODY_FLIGHT_PROFILES, ESTELLA_BODY_PHYSICS, ESTELLA_NODES_BY_ID, ESTELLA_PLACEMENTS } from './index';
import { ESTELLA_SURFACE_FLIGHT_PROFILES } from './flight-profiles';
import { type BodyDef, type StationPoiDef, type SurfacePoiDef, type TurbulenceZoneDef, type WindLayerDef } from '../../world';
import { type Placement, type WorldNode } from '../types';

function node(id: string): WorldNode {
  const n = ESTELLA_NODES_BY_ID.get(id);
  if (!n) throw new Error(`Missing Estella node: ${id}`);
  return n;
}

function nodeName(id: string): string {
  const n = node(id);
  if (n.kind === 'planet' || n.kind === 'moon' || n.kind === 'dwarf-planet' || n.kind === 'gas-giant') {
    return n.catalogId && n.catalogId !== n.name ? `${n.catalogId} ${n.name}` : n.name;
  }
  const p = n.placement;
  const parent = p?.parentId ? ESTELLA_NODES_BY_ID.get(p.parentId) : undefined;
  return parent?.name && n.name.startsWith(`${parent.name} `) ? n.name.slice(parent.name.length + 1) : n.name;
}

function placement(id: string): Placement {
  const p = ESTELLA_PLACEMENTS[id] ?? node(id).placement;
  if (!p) throw new Error(`Missing Estella placement: ${id}`);
  return p;
}

function surfacePlacement(id: string): Extract<Placement, { kind: 'surface' }> {
  const p = placement(id);
  if (p.kind !== 'surface') throw new Error(`${id} is not surface-placed`);
  return p;
}

function orbitPlacement(id: string): Extract<Placement, { kind: 'orbit' }> {
  const p = placement(id);
  if (p.kind !== 'orbit') throw new Error(`${id} is not orbit-placed`);
  return p;
}

function circularOrbit(id: string) {
  const p = orbitPlacement(id);
  if (p.orbit?.kind !== 'circular') throw new Error(`${id} does not have circular orbit params`);
  return p.orbit;
}

function bodyOrbit(id: string): BodyDef['orbit'] {
  const p = ESTELLA_PLACEMENTS[id] ?? node(id).placement;
  if (p?.kind !== 'orbit' || p.orbit?.kind !== 'circular') return undefined;
  return {
    parentBodyId: p.parentId,
    radius: p.orbit.radius,
    epochAngle: p.orbit.epochAngle,
    epochTime: p.orbit.epochTime,
    orbitSense: p.orbit.orbitSense,
  };
}

const TRANSFER_GAMEPLAY_OVERRIDES: Partial<Record<string, NonNullable<BodyDef['transferGameplay']>>> = {
  'estella-v': { patchRadius: 4_000_000, displayPatchRadius: 4_000_000 },
  'estella-vi': { patchRadius: 4_500_000, displayPatchRadius: 4_500_000 },
  'estella-vii': { patchRadius: 2_500_000, displayPatchRadius: 2_500_000 },
};

function transferGameplay(id: string): BodyDef['transferGameplay'] {
  const n = node(id);
  if (!n.capabilities?.hasSOI) return undefined;
  const override = TRANSFER_GAMEPLAY_OVERRIDES[id];
  if (override) return override;
  if (n.kind === 'moon') return { patchRadius: 320_000, displayPatchRadius: 320_000 };
  if (n.kind === 'dwarf-planet') return { patchRadius: 1_500_000, displayPatchRadius: 1_500_000 };
  if (n.kind === 'planet') return { patchRadius: 8_000_000, displayPatchRadius: 8_000_000 };
  return undefined;
}

function approachEnvironment(id: string): BodyDef['approachEnvironment'] {
  const windProfiles: Partial<Record<string, { windLayers: WindLayerDef[]; turbulence: TurbulenceZoneDef[] }>> = {
    'estella-v': {
      windLayers: [
        { altitudeCenter: 18_000, altitudeWidth: 5_000, strength: 12 },
        { altitudeCenter: 6_000, altitudeWidth: 2_200, strength: -8 },
      ],
      turbulence: [
        { altitudeMin: 5_000, altitudeMax: 8_000, strength: 1.5 },
      ],
    },
    'estella-iii': {
      windLayers: [
        { altitudeCenter: 16_000, altitudeWidth: 3_500, strength: -10 },
        { altitudeCenter: 6_000, altitudeWidth: 2_000, strength: 8 },
      ],
      turbulence: [],
    },
    'estella-vi': {
      windLayers: [
        { altitudeCenter: 46_000, altitudeWidth: 7_000, strength: 20 },
        { altitudeCenter: 24_000, altitudeWidth: 4_500, strength: -18 },
        { altitudeCenter: 9_000, altitudeWidth: 2_400, strength: 12 },
      ],
      turbulence: [
        { altitudeMin: 12_000, altitudeMax: 16_000, strength: 3 },
        { altitudeMin: 34_000, altitudeMax: 38_000, strength: 2 },
      ],
    },
    'estella-iv': {
      windLayers: [
        { altitudeCenter: 28_000, altitudeWidth: 4_500, strength: 18 },
        { altitudeCenter: 13_000, altitudeWidth: 2_800, strength: -14 },
        { altitudeCenter: 4_500, altitudeWidth: 1_500, strength: 10 },
      ],
      turbulence: [
        { altitudeMin: 7_000, altitudeMax: 10_000, strength: 3 },
        { altitudeMin: 18_000, altitudeMax: 21_000, strength: 2 },
        { altitudeMin: 30_000, altitudeMax: 33_000, strength: 1 },
      ],
    },
  };
  return windProfiles[id];
}

function createEstellaBody(id: string): BodyDef {
  const n = node(id);
  const physics = ESTELLA_BODY_PHYSICS[id];
  const flight = ESTELLA_BODY_FLIGHT_PROFILES[id];
  if (!physics) throw new Error(`Missing Estella body physics: ${id}`);
  if (!flight) throw new Error(`Missing Estella body flight profile: ${id}`);
  const atmosphere = ESTELLA_ATMOSPHERE_PHYSICS[id];
  return {
    id,
    name: n.name,
    radius: physics.radius,
    gm: physics.gm,
    color: flight.color,
    planetFillColor: flight.planetFillColor,
    planetStrokeColor: flight.planetStrokeColor,
    terrainFillColor: flight.terrainFillColor,
    terrainStrokeColor: flight.terrainStrokeColor,
    terrainBrightColor: flight.terrainBrightColor,
    atmosphere: atmosphere ? {
      height: atmosphere.height,
      surfaceDensity: atmosphere.surfaceDensity,
      scaleHeight: atmosphere.scaleHeight,
      color: flight.color,
    } : null,
    orbit: bodyOrbit(id),
    orbitalDefaults: flight.orbitalDefaults,
    approachEnvironment: approachEnvironment(id),
    transferGameplay: transferGameplay(id),
  };
}

function createSurfacePoi(id: string): SurfacePoiDef {
  const p = surfacePlacement(id);
  const profile = ESTELLA_SURFACE_FLIGHT_PROFILES[id];
  if (!profile) throw new Error(`Missing Estella surface flight profile: ${id}`);
  return {
    id,
    name: nodeName(id),
    subtitle: profile.subtitle,
    bodyId: p.parentId,
    surfaceAngle: p.angle ?? 0,
    altitude: p.altitude ?? 0,
    padCenterX: profile.padCenterX,
    padHalfWidth: profile.padHalfWidth,
    padY: profile.padY,
    roughness: profile.roughness,
    features: profile.features,
    landingLayout: profile.landingLayout,
    landingStart: profile.landingStart,
    descentProfile: profile.descentProfile,
    departureProfile: profile.departureProfile,
  };
}

function stationCaptureRadius(usage: string | undefined): number {
  if (usage === 'high' || usage === 'moon') return 25_000;
  return 20_000;
}

function stationCaptureMaxSpeed(usage: string | undefined): number {
  if (usage === 'moon') return 25;
  return 22;
}

function createStationPoi(dockNodeId: string): StationPoiDef {
  const orbit = circularOrbit(dockNodeId);
  const orbitPlacementDef = orbitPlacement(dockNodeId);
  const childPoi = [...ESTELLA_NODES_BY_ID.values()].find(n => n.placement?.kind === 'aboard' && n.placement.parentId === dockNodeId);
  return {
    id: dockNodeId,
    name: nodeName(dockNodeId),
    subtitle: childPoi?.summary ?? 'Generated Estella docking site',
    bodyId: orbitPlacementDef.parentId,
    orbit: {
      parentBodyId: orbitPlacementDef.parentId,
      radius: orbit.radius,
      epochAngle: orbit.epochAngle,
      epochTime: orbit.epochTime,
      orbitSense: orbit.orbitSense,
    },
    captureRadius: stationCaptureRadius(orbitPlacementDef.usage),
    captureMaxSpeed: stationCaptureMaxSpeed(orbitPlacementDef.usage),
    docking: {
      undock: { exitDistance: 140, targetSpoke: 0, targetSide: 1, targetSlot: 2, fillPct: 0.55 },
      delivery: { targetSpoke: 2, targetSide: 0, targetSlot: 2, fillPct: 0.55 },
      beamRange: 12,
      beamStrength: 0.5,
      thrustForce: 3200,
      rotTorque: 1200,
      tugMass: 500,
      containerMass: 2000,
      dampingAssist: false,
    },
  };
}

function playableSurfacePoiIds(bodyId: string): string[] {
  return [...ESTELLA_NODES_BY_ID.values()]
    .filter(n => {
      const p = ESTELLA_PLACEMENTS[n.id] ?? n.placement;
      return n.kind === 'poi'
        && p?.kind === 'surface'
        && p.parentId === bodyId
        && ESTELLA_SURFACE_FLIGHT_PROFILES[n.id] !== undefined;
    })
    .map(n => n.id)
    .sort();
}

function playableDockNodeIds(bodyId: string): string[] {
  return [...ESTELLA_NODES_BY_ID.values()]
    .filter(n => {
      const p = ESTELLA_PLACEMENTS[n.id] ?? n.placement;
      const hasAboardPoi = [...ESTELLA_NODES_BY_ID.values()].some(child =>
        child.kind === 'poi' && child.placement?.kind === 'aboard' && child.placement.parentId === n.id,
      );
      return hasAboardPoi
        && p?.kind === 'orbit'
        && p.parentId === bodyId
        && p.orbit?.kind === 'circular';
    })
    .map(n => n.id)
    .sort();
}

function playableBodyIds(): string[] {
  return Object.keys(ESTELLA_BODY_FLIGHT_PROFILES)
    .filter(id => ESTELLA_BODY_PHYSICS[id] !== undefined && ESTELLA_NODES_BY_ID.has(id))
    .sort();
}

const PLAYABLE_BODY_IDS = playableBodyIds();

export const ESTELLA_BODIES: BodyDef[] = PLAYABLE_BODY_IDS.map(createEstellaBody);

export const ESTELLA_SURFACE_POIS: SurfacePoiDef[] = PLAYABLE_BODY_IDS.flatMap(bodyId =>
  playableSurfacePoiIds(bodyId).map(createSurfacePoi),
);

export const ESTELLA_STATION_POIS: StationPoiDef[] = PLAYABLE_BODY_IDS.flatMap(bodyId =>
  playableDockNodeIds(bodyId).map(createStationPoi),
);
