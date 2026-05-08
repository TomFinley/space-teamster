import { ESTELLA_BODY_FLIGHT_PROFILES, ESTELLA_BODY_PHYSICS, ESTELLA_NODES_BY_ID, ESTELLA_PLACEMENTS } from './index';
import { type BodyDef, type StationPoiDef, type SurfacePoiDef } from '../../world';
import { type Placement, type WorldNode } from '../types';

const ESTELLA_VIII_ID = 'estella-viii';
const ESTELLA_VIII_SURFACE_POI_IDS = [
  'estella-viii-settlement',
  'estella-viii-mining-site',
  'estella-viii-abandoned-site',
] as const;
const ESTELLA_VIII_STATION_NODE_IDS = [
  'estella-viii-friendly-station',
  'estella-viii-high-station',
] as const;

function node(id: string): WorldNode {
  const n = ESTELLA_NODES_BY_ID.get(id);
  if (!n) throw new Error(`Missing Estella node: ${id}`);
  return n;
}

function nodeName(id: string): string {
  const n = node(id);
  return n.catalogId && n.catalogId !== n.name ? `${n.catalogId} ${n.name}` : n.name;
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

function createEstellaBody(id: string): BodyDef {
  const n = node(id);
  const physics = ESTELLA_BODY_PHYSICS[id];
  const flight = ESTELLA_BODY_FLIGHT_PROFILES[id];
  if (!physics) throw new Error(`Missing Estella body physics: ${id}`);
  if (!flight) throw new Error(`Missing Estella body flight profile: ${id}`);
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
    atmosphere: null,
    orbitalDefaults: flight.orbitalDefaults,
  };
}

function createSurfacePoi(id: string): SurfacePoiDef {
  const p = surfacePlacement(id);
  const name = nodeName(id);
  return {
    id,
    name,
    subtitle: 'Generated Estella surface site',
    bodyId: ESTELLA_VIII_ID,
    surfaceAngle: p.angle ?? 0,
    padCenterX: 1000,
    padHalfWidth: 28,
    padY: 30,
    roughness: 0.6,
    features: [
      { xStart: 900, xEnd: 920, height: 44 },
      { xStart: 1080, xEnd: 1100, height: 50 },
    ],
    landingStart: {
      x: 1000,
      y: 260,
      vx: 0,
      vy: -3,
      landingMaxVSpeed: 4.0,
      landingMaxHSpeed: 3.0,
      landingMaxAngle: 0.26,
    },
    descentProfile: {
      startX: -90_000,
      startY: 9_000,
      startVX: 480,
      startVY: -24,
      startAngle: 1.5,
      gateY: 1500,
      gateRadius: 1800,
      gateMaxSpeed: 150,
      gateMinSpeed: 15,
    },
    departureProfile: {
      startY: 260,
      startVY: 0,
      exitAltitude: 8_000,
      thresholdApoapsisAltitude: 85_000,
      targetOrbitAltitude: 100_000,
      orbitDir: -1,
      fuelSeconds: 180,
    },
  };
}

function createStationPoi(stationNodeId: string): StationPoiDef {
  const orbit = circularOrbit(stationNodeId);
  const stationNode = node(stationNodeId);
  const childPoi = [...ESTELLA_NODES_BY_ID.values()].find(n => n.placement?.kind === 'aboard' && n.placement.parentId === stationNodeId);
  return {
    id: stationNodeId,
    name: stationNode.name,
    subtitle: childPoi?.summary ?? 'Generated Estella station',
    bodyId: ESTELLA_VIII_ID,
    orbit: {
      parentBodyId: ESTELLA_VIII_ID,
      radius: orbit.radius,
      epochAngle: orbit.epochAngle,
      epochTime: orbit.epochTime,
      orbitSense: orbit.orbitSense,
    },
    captureRadius: 2200,
    captureMaxSpeed: 80,
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

export const ESTELLA_BODIES: BodyDef[] = [createEstellaBody(ESTELLA_VIII_ID)];

export const ESTELLA_SURFACE_POIS: SurfacePoiDef[] = ESTELLA_VIII_SURFACE_POI_IDS.map(createSurfacePoi);

export const ESTELLA_STATION_POIS: StationPoiDef[] = ESTELLA_VIII_STATION_NODE_IDS.map(createStationPoi);
