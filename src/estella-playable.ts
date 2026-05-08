import { APPROACH_LEVELS, type ApproachLevel } from './approach';
import { DOCKING_LEVELS, createGenericDockingLevel, type DockingLevel } from './docking';
import { LEVELS, type LevelDef } from './levels';
import { ORBITAL_LEVELS, type OrbitalLevel } from './orbital';
import { ESTELLA_BODY_PHYSICS, ESTELLA_NODES_BY_ID } from './content/estella';
import { type Placement, type WorldNode } from './content/types';
import { type BodyDef, type SurfacePoiDef } from './world';

export interface EstellaPlayableMission {
  start: { kind: 'landing'; level: LevelDef; nextApproachLevelId: number } | { kind: 'docking'; level: DockingLevel };
}

const BODY_ID = 'estella-viii';
const BASE_ID = 80_000;
let seq = 0;

function nextId(): number {
  return BASE_ID + (++seq);
}

function nodeName(node: WorldNode | undefined): string {
  if (!node) return 'Estella site';
  return node.catalogId && node.catalogId !== node.name ? `${node.catalogId} ${node.name}` : node.name;
}

const ESTELLA_VIII_BODY: BodyDef = (() => {
  const physics = ESTELLA_BODY_PHYSICS[BODY_ID];
  if (!physics) throw new Error(`Missing Estella physics for ${BODY_ID}`);
  return {
    id: BODY_ID,
    name: 'Estella VIII',
    radius: physics.radius,
    gm: physics.gm,
    color: [135, 155, 170],
    planetFillColor: '#101820',
    planetStrokeColor: '#607080',
    terrainFillColor: '#101820',
    terrainStrokeColor: '#607080',
    terrainBrightColor: '#8da0ad',
    atmosphere: null,
    orbitalDefaults: {
      baseTimeScale: 50,
      thrustAccel: 0.05,
      thrustAccelMax: 1.0,
      fuelDeltaV: 900,
      transitionAltitude: 8_000,
    },
  };
})();

function body(): BodyDef {
  return ESTELLA_VIII_BODY;
}

function circularStart(radius: number, angle: number, sense: 1 | -1): { x: number; y: number; vx: number; vy: number } {
  const b = body();
  const speed = Math.sqrt(b.gm / radius);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    vx: -sense * Math.sin(angle) * speed,
    vy: sense * Math.cos(angle) * speed,
  };
}

function placement(nodeId: string): Placement | undefined {
  return ESTELLA_NODES_BY_ID.get(nodeId)?.placement;
}

function parentNode(nodeId: string): WorldNode | undefined {
  const p = placement(nodeId);
  return p?.parentId ? ESTELLA_NODES_BY_ID.get(p.parentId) : undefined;
}

function playableKind(poiId: string): 'surface' | 'dock' {
  const p = placement(poiId);
  return p?.kind === 'surface' ? 'surface' : 'dock';
}

function surfacePlacement(poiId: string): Extract<Placement, { kind: 'surface' }> {
  const p = placement(poiId);
  if (p?.kind !== 'surface') throw new Error(`${poiId} is not a surface POI`);
  return p;
}

function orbitalPlacementForDockPoi(poiId: string): Extract<Placement, { kind: 'orbit' }> {
  const dockParent = parentNode(poiId);
  const p = dockParent?.placement;
  if (p?.kind !== 'orbit') throw new Error(`${poiId} parent is not orbiting`);
  return p;
}

function createSurfacePoi(poiId: string): SurfacePoiDef {
  const node = ESTELLA_NODES_BY_ID.get(poiId)!;
  const p = surfacePlacement(poiId);
  const name = nodeName(node);
  return {
    id: `estella-generated-${poiId}`,
    name,
    subtitle: 'Generated Estella surface site',
    bodyId: BODY_ID,
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

function createLandingLevel(poiId: string, id: number): LevelDef {
  const poi = createSurfacePoi(poiId);
  const b = body();
  return {
    id,
    name: poi.name,
    subtitle: poi.subtitle,
    body: b,
    poi,
    gravity: b.gm / (b.radius * b.radius),
    landingMaxVSpeed: poi.landingStart.landingMaxVSpeed,
    landingMaxHSpeed: poi.landingStart.landingMaxHSpeed,
    landingMaxAngle: poi.landingStart.landingMaxAngle,
    startX: poi.landingStart.x,
    startY: poi.landingStart.y,
    startVX: poi.landingStart.vx,
    startVY: poi.landingStart.vy,
    padCenterX: poi.padCenterX,
    padHalfWidth: poi.padHalfWidth,
    padY: poi.padY,
    roughness: poi.roughness,
    features: poi.features,
    terrainFillColor: b.terrainFillColor,
    terrainStrokeColor: b.terrainStrokeColor,
    terrainBrightColor: b.terrainBrightColor,
  };
}

function createApproachLevel(kind: 'departure' | 'descent', poiId: string, id: number, landingLevelId: number, orbitalLevelId: number): ApproachLevel {
  const poi = createSurfacePoi(poiId);
  const b = body();
  const departure = poi.departureProfile;
  return {
    id,
    name: `${poi.name} ${kind === 'departure' ? 'Departure' : 'Descent'}`,
    subtitle: kind === 'departure' ? 'Generated launch to Estella VIII orbit' : 'Generated powered descent to Estella VIII site',
    body: b,
    poi,
    frame: { planetRadius: b.radius, planetGM: b.gm, landingSiteAngle: poi.surfaceAngle, localDir: -1 },
    gravity: b.gm / (b.radius * b.radius),
    startX: kind === 'departure' ? 0 : poi.descentProfile.startX,
    startY: kind === 'departure' ? departure.startY : poi.descentProfile.startY,
    startVX: kind === 'departure' ? 0 : poi.descentProfile.startVX,
    startVY: kind === 'departure' ? departure.startVY : poi.descentProfile.startVY,
    startAngle: kind === 'departure' ? 0 : poi.descentProfile.startAngle,
    surfaceDensity: 0,
    scaleHeight: 1,
    dragNose: 0,
    dragBroadside: 0,
    dragShield: 0,
    dragWingPerRad: 0,
    liftBody: 0,
    liftWingPerRad: 0,
    heatCoeff: 0,
    dissipation: 0,
    shieldHeatMult: 0,
    wingsMaxTemp: 1,
    maxWingAngle: 0,
    wingAngleRate: 0,
    thrustAccel: 15,
    thrustAccelMax: 150,
    fuelSeconds: departure.fuelSeconds,
    gateX: 0,
    gateY: kind === 'departure' ? 0 : poi.descentProfile.gateY,
    gateRadius: kind === 'departure' ? 0 : poi.descentProfile.gateRadius,
    gateMaxSpeed: kind === 'departure' ? 0 : poi.descentProfile.gateMaxSpeed,
    gateMinSpeed: kind === 'departure' ? 0 : poi.descentProfile.gateMinSpeed,
    windLayers: [],
    turbulence: [],
    landingLevelId,
    ...(kind === 'departure'
      ? { departure: { exitAltitude: departure.exitAltitude, thresholdApoapsisAltitude: departure.thresholdApoapsisAltitude, targetOrbitAltitude: departure.targetOrbitAltitude, orbitalLevelId, orbitDir: departure.orbitDir } }
      : { returnToOrbital: { exitAltitude: b.orbitalDefaults.transitionAltitude, orbitalLevelId } }),
  };
}

function createOrbitalLevel(opts: {
  id: number;
  name: string;
  reentryApproachLevelId?: number;
  landingSiteAngle?: number;
  dockingLevelId?: number;
  station?: OrbitalLevel['station'];
}): OrbitalLevel {
  const b = body();
  const r = b.radius + 100_000;
  const start = circularStart(r, (opts.landingSiteAngle ?? 0) + Math.PI * 0.85, -1);
  return {
    id: opts.id,
    bodyId: BODY_ID,
    bodyName: b.name,
    name: opts.name,
    subtitle: opts.station ? 'Generated rendezvous around Estella VIII' : 'Generated Estella VIII orbit',
    planetRadius: b.radius,
    planetGM: b.gm,
    atmoHeight: 0,
    atmoColor: [0, 0, 0],
    planetFillColor: b.planetFillColor,
    planetStrokeColor: b.planetStrokeColor,
    baseTimeScale: 50,
    startX: start.x,
    startY: start.y,
    startVX: start.vx,
    startVY: start.vy,
    thrustAccel: 0.06,
    thrustAccelMax: 1.2,
    fuelDeltaV: 1800,
    surfaceDensity: 0,
    scaleHeight: 1,
    aeroNoseDrag: 0,
    aeroBroadsideDrag: 0,
    aeroLiftCoeff: 0,
    highAtmoAoA: 0,
    lowAtmoAoA: 0,
    rcsAngularAccel: 1.5,
    heatCoeff: 0,
    heatDissipation: 0,
    transitionAltitude: 8_000,
    landingSiteAngle: opts.landingSiteAngle ?? 0,
    approachLevelIdx: 0,
    approachGravity: b.gm / (b.radius * b.radius),
    reentryApproachLevelId: opts.reentryApproachLevelId,
    showLandingSite: !opts.station,
    station: opts.station,
    dockingLevelId: opts.dockingLevelId,
  };
}

function stationTargetForPoi(poiId: string): OrbitalLevel['station'] {
  const parent = parentNode(poiId)!;
  const p = orbitalPlacementForDockPoi(poiId);
  const orbit = p.orbit?.kind === 'circular' ? p.orbit : null;
  return {
    id: parent.id,
    name: nodeName(parent),
    orbitRadius: orbit?.radius ?? body().radius + 120_000,
    epochAngle: orbit?.epochAngle ?? 0,
    epochTime: orbit?.epochTime ?? 0,
    orbitSense: orbit?.orbitSense ?? 1,
    captureRadius: 2200,
    captureMaxSpeed: 80,
  };
}

function register<T extends { id: number }>(arr: T[], item: T): T {
  arr.push(item);
  return item;
}

export function createPlayableEstellaMission(sourceId: string, destinationId: string): EstellaPlayableMission {
  const sourceKind = playableKind(sourceId);
  const destKind = playableKind(destinationId);
  const destSurface = destKind === 'surface';
  const destLandingId = destSurface ? nextId() : 0;
  const destApproachId = destSurface ? nextId() : 0;
  const destDockingId = !destSurface ? nextId() : 0;
  const orbitalId = nextId();

  let destLanding: LevelDef | undefined;
  if (destSurface) {
    destLanding = register(LEVELS, createLandingLevel(destinationId, destLandingId));
    register(APPROACH_LEVELS, createApproachLevel('descent', destinationId, destApproachId, destLandingId, orbitalId));
  } else {
    register(DOCKING_LEVELS, createGenericDockingLevel({
      id: destDockingId,
      name: nodeName(ESTELLA_NODES_BY_ID.get(destinationId)),
      subtitle: 'Deliver generated Estella cargo',
      exitMode: false,
      targetSpoke: 2,
      targetSide: 0,
      targetSlot: 2,
    }));
  }

  const orbital = register(ORBITAL_LEVELS, createOrbitalLevel({
    id: orbitalId,
    name: destSurface ? `${nodeName(ESTELLA_NODES_BY_ID.get(destinationId))} Deorbit` : `${nodeName(parentNode(destinationId))} Rendezvous`,
    reentryApproachLevelId: destSurface ? destApproachId : undefined,
    landingSiteAngle: destSurface ? surfacePlacement(destinationId).angle ?? 0 : 0,
    dockingLevelId: destSurface ? undefined : destDockingId,
    station: destSurface ? undefined : stationTargetForPoi(destinationId),
  }));

  if (sourceKind === 'surface') {
    const launchLandingId = nextId();
    const launchApproachId = nextId();
    const launchLanding = register(LEVELS, createLandingLevel(sourceId, launchLandingId));
    register(APPROACH_LEVELS, createApproachLevel('departure', sourceId, launchApproachId, launchLandingId, orbital.id));
    return { start: { kind: 'landing', level: launchLanding, nextApproachLevelId: launchApproachId } };
  }

  const sourceDockingId = nextId();
  const sourceDocking = register(DOCKING_LEVELS, createGenericDockingLevel({
    id: sourceDockingId,
    name: nodeName(parentNode(sourceId)),
    subtitle: 'Undock and begin generated Estella route',
    exitMode: true,
    orbitalLevelId: orbital.id,
  }));
  return { start: { kind: 'docking', level: sourceDocking } };
}
