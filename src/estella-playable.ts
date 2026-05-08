import { APPROACH_LEVELS, type ApproachLevel } from './approach';
import { DOCKING_LEVELS, createGenericDockingLevel, type DockingLevel } from './docking';
import { LEVELS, createLandingLevel, type LevelDef } from './levels';
import { ORBITAL_LEVELS, type OrbitalLevel } from './orbital';
import { ESTELLA_NODES_BY_ID } from './content/estella';
import { type Placement, type WorldNode } from './content/types';
import { bodyById, stationPoiById, surfacePoiById } from './world';

export interface EstellaPlayableMission {
  start: { kind: 'landing'; level: LevelDef; nextApproachLevelId: number } | { kind: 'docking'; level: DockingLevel };
}

interface GeneratedDepartureTarget {
  thresholdApoapsisAltitude: number;
  targetOrbitAltitude: number;
  orbitDir: 1 | -1;
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

function body() {
  return bodyById(BODY_ID);
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

function createGeneratedLandingLevel(poiId: string, id: number): LevelDef {
  return createLandingLevel(poiId, id);
}

function createApproachLevel(kind: 'departure' | 'descent', poiId: string, id: number, landingLevelId: number, orbitalLevelId: number, departureTarget?: GeneratedDepartureTarget): ApproachLevel {
  const poi = surfacePoiById(poiId);
  const b = bodyById(poi.bodyId);
  const departure = poi.departureProfile;
  return {
    id,
    name: `${poi.name} ${kind === 'departure' ? 'Departure' : 'Descent'}`,
    subtitle: kind === 'departure' ? `Generated launch to ${b.name} orbit` : `Generated powered descent to ${poi.name}`,
    body: b,
    poi,
    frame: { planetRadius: b.radius, planetGM: b.gm, landingSiteAngle: poi.surfaceAngle, localDir: -1 },
    gravity: b.gm / (b.radius * b.radius),
    startX: kind === 'departure' ? 0 : poi.descentProfile.startX,
    startY: kind === 'departure' ? departure.startY : poi.descentProfile.startY,
    startVX: kind === 'departure' ? 0 : poi.descentProfile.startVX,
    startVY: kind === 'departure' ? departure.startVY : poi.descentProfile.startVY,
    startAngle: kind === 'departure' ? 0 : poi.descentProfile.startAngle,
    surfaceDensity: b.atmosphere?.surfaceDensity ?? 0,
    scaleHeight: b.atmosphere?.scaleHeight ?? 1,
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
      ? {
          departure: {
            exitAltitude: departure.exitAltitude,
            thresholdApoapsisAltitude: departureTarget?.thresholdApoapsisAltitude ?? departure.thresholdApoapsisAltitude,
            targetOrbitAltitude: departureTarget?.targetOrbitAltitude ?? departure.targetOrbitAltitude,
            orbitalLevelId,
            orbitDir: departureTarget?.orbitDir ?? departure.orbitDir,
          },
        }
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
  startOrbit?: { radius: number; epochAngle: number; orbitSense: 1 | -1 };
}): OrbitalLevel {
  const b = body();
  const r = opts.startOrbit?.radius ?? (b.radius + 100_000);
  const startAngle = opts.startOrbit ? opts.startOrbit.epochAngle + 0.06 * opts.startOrbit.orbitSense : (opts.landingSiteAngle ?? 0) + Math.PI * 0.85;
  const startSense = opts.startOrbit?.orbitSense ?? -1;
  const start = circularStart(r, startAngle, startSense);
  return {
    id: opts.id,
    bodyId: BODY_ID,
    name: opts.name,
    subtitle: opts.station ? `Generated rendezvous around ${b.name}` : `Generated ${b.name} orbit`,
    planetRadius: b.radius,
    planetGM: b.gm,
    atmoHeight: b.atmosphere?.height ?? 0,
    atmoColor: b.atmosphere?.color ?? [0, 0, 0],
    planetFillColor: b.planetFillColor,
    planetStrokeColor: b.planetStrokeColor,
    baseTimeScale: b.orbitalDefaults.baseTimeScale,
    startX: start.x,
    startY: start.y,
    startVX: start.vx,
    startVY: start.vy,
    thrustAccel: b.orbitalDefaults.thrustAccel,
    thrustAccelMax: b.orbitalDefaults.thrustAccelMax,
    fuelDeltaV: 1800,
    surfaceDensity: b.atmosphere?.surfaceDensity ?? 0,
    scaleHeight: b.atmosphere?.scaleHeight ?? 1,
    aeroNoseDrag: 0,
    aeroBroadsideDrag: 0,
    aeroLiftCoeff: 0,
    highAtmoAoA: 0,
    lowAtmoAoA: 0,
    rcsAngularAccel: 1.5,
    heatCoeff: 0,
    heatDissipation: 0,
    transitionAltitude: b.orbitalDefaults.transitionAltitude,
    landingSiteAngle: opts.landingSiteAngle ?? 0,
    approachLevelIdx: 0,
    approachGravity: b.gm / (b.radius * b.radius),
    reentryApproachLevelId: opts.reentryApproachLevelId,
    showLandingSite: !opts.station,
    station: opts.station,
    dockingLevelId: opts.dockingLevelId,
  };
}

function stationTargetForPoi(poiId: string): NonNullable<OrbitalLevel['station']> {
  const parent = parentNode(poiId)!;
  const station = stationPoiById(parent.id);
  return {
    id: station.id,
    name: station.name,
    orbitRadius: station.orbit.radius,
    epochAngle: station.orbit.epochAngle,
    epochTime: station.orbit.epochTime,
    orbitSense: station.orbit.orbitSense,
    captureRadius: station.captureRadius,
    captureMaxSpeed: station.captureMaxSpeed,
  };
}

function sourceStartOrbit(sourceId: string): { radius: number; epochAngle: number; orbitSense: 1 | -1 } | undefined {
  if (playableKind(sourceId) !== 'dock') return undefined;
  const station = stationPoiById(parentNode(sourceId)!.id);
  return {
    radius: station.orbit.radius,
    epochAngle: station.orbit.epochAngle,
    orbitSense: station.orbit.orbitSense,
  };
}

export function generatedEstellaDepartureTarget(destinationId: string): GeneratedDepartureTarget {
  if (playableKind(destinationId) !== 'dock') {
    return {
      thresholdApoapsisAltitude: 30_000,
      targetOrbitAltitude: 35_000,
      orbitDir: -1,
    };
  }

  const b = body();
  const target = stationPoiById(parentNode(destinationId)!.id);
  const targetAltitude = Math.max(0, target.orbit.radius - b.radius);
  // Existing launch UI convention is screen/local direction, while station orbitSense
  // uses orbital math sign. In current campaign data, CW station targets use orbitSense=-1
  // and require RIGHTward launch guidance, so these signs intentionally invert.
  const orbitDir = target.orbit.orbitSense === -1 ? 1 : -1;
  return {
    thresholdApoapsisAltitude: Math.max(b.orbitalDefaults.transitionAltitude + 5_000, targetAltitude * 0.85),
    targetOrbitAltitude: targetAltitude,
    orbitDir,
  };
}

export function generatedEstellaDepartureOrbitDir(destinationId: string): 1 | -1 {
  return generatedEstellaDepartureTarget(destinationId).orbitDir;
}

function register<T extends { id: number }>(arr: T[], item: T): T {
  const existingIdx = arr.findIndex(v => v.id === item.id);
  if (existingIdx >= 0) arr.splice(existingIdx, 1, item);
  else arr.push(item);
  return item;
}

export function createPlayableEstellaMission(sourceId: string, destinationId: string): EstellaPlayableMission {
  const sourceKind = playableKind(sourceId);
  const destKind = playableKind(destinationId);
  const destSurface = destKind === 'surface';
  const departureTarget = generatedEstellaDepartureTarget(destinationId);
  const destLandingId = destSurface ? nextId() : 0;
  const destApproachId = destSurface ? nextId() : 0;
  const destDockingId = !destSurface ? nextId() : 0;
  const orbitalId = nextId();

  if (destSurface) {
    register(LEVELS, createGeneratedLandingLevel(destinationId, destLandingId));
    register(APPROACH_LEVELS, createApproachLevel('descent', destinationId, destApproachId, destLandingId, orbitalId));
  } else {
    const station = stationPoiById(parentNode(destinationId)!.id);
    register(DOCKING_LEVELS, createGenericDockingLevel({
      id: destDockingId,
      name: station.name,
      subtitle: 'Deliver generated Estella cargo',
      exitMode: false,
      targetSpoke: station.docking.delivery.targetSpoke,
      targetSide: station.docking.delivery.targetSide,
      targetSlot: station.docking.delivery.targetSlot,
      fillPct: station.docking.delivery.fillPct,
    }));
  }

  const orbital = register(ORBITAL_LEVELS, createOrbitalLevel({
    id: orbitalId,
    name: destSurface ? `${nodeName(ESTELLA_NODES_BY_ID.get(destinationId))} Deorbit` : `${nodeName(parentNode(destinationId))} Rendezvous`,
    reentryApproachLevelId: destSurface ? destApproachId : undefined,
    landingSiteAngle: destSurface ? surfacePlacement(destinationId).angle ?? 0 : 0,
    dockingLevelId: destSurface ? undefined : destDockingId,
    station: destSurface ? undefined : stationTargetForPoi(destinationId),
    startOrbit: sourceStartOrbit(sourceId),
  }));

  if (sourceKind === 'surface') {
    const launchLandingId = nextId();
    const launchApproachId = nextId();
    const launchLanding = register(LEVELS, createGeneratedLandingLevel(sourceId, launchLandingId));
    register(APPROACH_LEVELS, createApproachLevel('departure', sourceId, launchApproachId, launchLandingId, orbital.id, departureTarget));
    return { start: { kind: 'landing', level: launchLanding, nextApproachLevelId: launchApproachId } };
  }

  const station = stationPoiById(parentNode(sourceId)!.id);
  const sourceDockingId = nextId();
  const sourceDocking = register(DOCKING_LEVELS, createGenericDockingLevel({
    id: sourceDockingId,
    name: station.name,
    subtitle: 'Undock and begin generated Estella route',
    exitMode: true,
    orbitalLevelId: orbital.id,
    targetSpoke: station.docking.undock.targetSpoke,
    targetSide: station.docking.undock.targetSide,
    targetSlot: station.docking.undock.targetSlot,
    fillPct: station.docking.undock.fillPct,
    exitDistance: station.docking.undock.exitDistance,
  }));
  return { start: { kind: 'docking', level: sourceDocking } };
}
