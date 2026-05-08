import { APPROACH_LEVELS, type ApproachLevel } from './approach';
import { DOCKING_LEVELS, createGenericDockingLevel, type DockingLevel } from './docking';
import { LEVELS, createLandingLevel, type LevelDef } from './levels';
import { ORBITAL_LEVELS, type OrbitalLevel } from './orbital';
import { ESTELLA_NODES_BY_ID } from './content/estella';
import { ESTELLA_SURFACE_FLIGHT_PROFILES } from './content/estella/flight-profiles';
import { type Placement, type WorldNode } from './content/types';
import { STATION_POIS, SURFACE_POIS, bodyById, bodyStateRelativeToParent, stationPoiById, surfacePoiById } from './world';

export interface EstellaPlayableMission {
  start: { kind: 'landing'; level: LevelDef; nextApproachLevelId: number } | { kind: 'docking'; level: DockingLevel };
}

interface GeneratedDepartureTarget {
  thresholdApoapsisAltitude: number;
  targetOrbitAltitude: number;
  orbitDir: 1 | -1;
}

const ESTELLA_SYSTEM_BODY_ID = 'estella';
const TRANSFER_PATCH_RADIUS = 1_500_000;
const BASE_ID = 80_000;
let seq = 0;

function nextId(): number {
  return BASE_ID + (++seq);
}

function nodeName(node: WorldNode | undefined): string {
  if (!node) return 'Estella site';
  if (node.kind === 'planet' || node.kind === 'moon' || node.kind === 'dwarf-planet' || node.kind === 'gas-giant') {
    return node.catalogId && node.catalogId !== node.name ? `${node.catalogId} ${node.name}` : node.name;
  }
  const parent = node.placement?.parentId ? ESTELLA_NODES_BY_ID.get(node.placement.parentId) : undefined;
  return parent?.name && node.name.startsWith(`${parent.name} `) ? node.name.slice(parent.name.length + 1) : node.name;
}


function surfaceMarkersForBody(bodyId: string): NonNullable<OrbitalLevel['surfaceMarkers']> {
  return SURFACE_POIS
    .filter(poi => poi.bodyId === bodyId)
    .map(poi => ({ id: poi.id, name: poi.name, angle: poi.surfaceAngle, labelVisibility: ESTELLA_SURFACE_FLIGHT_PROFILES[poi.id]?.labelVisibility }));
}

function orbitMarkersForBody(bodyId: string): NonNullable<OrbitalLevel['orbitMarkers']> {
  return STATION_POIS
    .filter(station => station.bodyId === bodyId)
    .map(station => ({
      id: station.id,
      name: station.name,
      orbitRadius: station.orbit.radius,
      epochAngle: station.orbit.epochAngle,
      epochTime: station.orbit.epochTime,
      orbitSense: station.orbit.orbitSense,
    }));
}

function circularStart(bodyId: string, radius: number, angle: number, sense: 1 | -1): { x: number; y: number; vx: number; vy: number } {
  const b = bodyById(bodyId);
  const speed = Math.sqrt(b.gm / radius);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    vx: -sense * Math.sin(angle) * speed,
    vy: sense * Math.cos(angle) * speed,
  };
}

function hohmannDepartureVInf(sourceBodyId: string, destinationBodyId: string): number {
  const source = bodyById(sourceBodyId);
  const destination = bodyById(destinationBodyId);
  if (!source.orbit || !destination.orbit || source.orbit.parentBodyId !== destination.orbit.parentBodyId) return 0;
  const parent = bodyById(source.orbit.parentBodyId);
  const a = (source.orbit.radius + destination.orbit.radius) * 0.5;
  const vCirc = Math.sqrt(parent.gm / source.orbit.radius);
  const vTransfer = Math.sqrt(parent.gm * (2 / source.orbit.radius - 1 / a));
  return vTransfer - vCirc;
}

function transferBodyMarker(bodyId: string, arrivalOrbitalLevelId?: number): NonNullable<OrbitalLevel['systemBodies']>[number] {
  const b = bodyById(bodyId);
  if (!b.orbit) throw new Error(`${bodyId} has no Estella system orbit`);
  return {
    id: b.id,
    name: b.name,
    radius: b.radius,
    gm: b.gm,
    color: b.color,
    orbitRadius: b.orbit.radius,
    epochAngle: b.orbit.epochAngle,
    epochTime: b.orbit.epochTime,
    orbitSense: b.orbit.orbitSense,
    patchRadius: b.transferGameplay?.patchRadius ?? TRANSFER_PATCH_RADIUS,
    displayPatchRadius: b.transferGameplay?.displayPatchRadius ?? TRANSFER_PATCH_RADIUS,
    arrivalAltitudeMin: 40_000,
    arrivalAltitudeMax: 90_000,
    arrivalSpeedMarginMin: 5,
    arrivalSpeedMarginMax: 90,
    arrivalOrbitalLevelId,
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
  bodyId: string;
  name: string;
  reentryApproachLevelId?: number;
  landingSiteAngle?: number;
  dockingLevelId?: number;
  station?: OrbitalLevel['station'];
  startOrbit?: { radius: number; epochAngle: number; orbitSense: 1 | -1 };
  showLandingSite?: boolean;
  escapeToOrbitalLevelId?: number;
  escapeTargetBodyId?: string;
}): OrbitalLevel {
  const b = bodyById(opts.bodyId);
  const r = opts.startOrbit?.radius ?? (b.radius + 100_000);
  const startAngle = opts.startOrbit ? opts.startOrbit.epochAngle + 0.06 * opts.startOrbit.orbitSense : (opts.landingSiteAngle ?? 0) + Math.PI * 0.85;
  const startSense = opts.startOrbit?.orbitSense ?? -1;
  const start = circularStart(opts.bodyId, r, startAngle, startSense);
  const level: OrbitalLevel = {
    id: opts.id,
    bodyId: opts.bodyId,
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
    surfaceMarkers: surfaceMarkersForBody(opts.bodyId),
    orbitMarkers: orbitMarkersForBody(opts.bodyId),
    approachLevelIdx: 0,
    approachGravity: b.gm / (b.radius * b.radius),
    reentryApproachLevelId: opts.reentryApproachLevelId,
    showLandingSite: opts.showLandingSite ?? !opts.station,
    station: opts.station,
    dockingLevelId: opts.dockingLevelId,
  };
  if (opts.escapeToOrbitalLevelId) {
    level.escapeToOrbitalLevelId = opts.escapeToOrbitalLevelId;
    level.escapeSOIRadius = bodyById(opts.bodyId).transferGameplay?.patchRadius ?? TRANSFER_PATCH_RADIUS;
  }
  if (opts.escapeTargetBodyId) {
    level.escapeTargetBodyId = opts.escapeTargetBodyId;
    level.escapeVectorSpeed = hohmannDepartureVInf(opts.bodyId, opts.escapeTargetBodyId);
  }
  return level;
}

function createSystemTransferLevel(opts: {
  id: number;
  sourceBodyId: string;
  destinationBodyId: string;
  arrivalOrbitalLevelId: number;
}): OrbitalLevel {
  const parent = bodyById(ESTELLA_SYSTEM_BODY_ID);
  const seed = bodyStateRelativeToParent(opts.sourceBodyId, 0);
  const source = bodyById(opts.sourceBodyId);
  const destination = bodyById(opts.destinationBodyId);
  if (!source.orbit || !destination.orbit) throw new Error('Generated Estella transfer requires orbiting bodies');
  return {
    id: opts.id,
    bodyId: ESTELLA_SYSTEM_BODY_ID,
    bodyName: parent.name,
    name: `${source.name} → ${destination.name} Transfer`,
    subtitle: 'Generated Estella dwarf-planet transfer',
    planetRadius: parent.radius,
    planetGM: parent.gm,
    atmoHeight: 0,
    atmoColor: [0, 0, 0],
    planetFillColor: parent.planetFillColor,
    planetStrokeColor: parent.planetStrokeColor,
    baseTimeScale: parent.orbitalDefaults.baseTimeScale,
    startX: seed.x,
    startY: seed.y,
    startVX: seed.vx,
    startVY: seed.vy,
    thrustAccel: parent.orbitalDefaults.thrustAccel,
    thrustAccelMax: parent.orbitalDefaults.thrustAccelMax,
    thrustWallDvPerSec: 1.5,
    thrustWallDvPerSecMax: 60,
    fuelDeltaV: 1_200,
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
    transitionAltitude: parent.orbitalDefaults.transitionAltitude,
    landingSiteAngle: 0,
    approachLevelIdx: 0,
    approachGravity: 0,
    showLandingSite: false,
    systemBodies: [
      transferBodyMarker(opts.sourceBodyId),
      transferBodyMarker(opts.destinationBodyId, opts.arrivalOrbitalLevelId),
    ],
    targetBodyId: opts.destinationBodyId,
    conicRadius: destination.orbit.radius * 1.2,
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

function centralBodyIdForPoi(poiId: string): string {
  if (playableKind(poiId) === 'surface') return surfacePoiById(poiId).bodyId;
  return stationPoiById(parentNode(poiId)!.id).bodyId;
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

export function generatedEstellaDepartureTarget(destinationId: string, sourceId?: string): GeneratedDepartureTarget {
  if ((sourceId && centralBodyIdForPoi(sourceId) !== centralBodyIdForPoi(destinationId)) || playableKind(destinationId) !== 'dock') {
    return {
      thresholdApoapsisAltitude: 30_000,
      targetOrbitAltitude: 35_000,
      orbitDir: -1,
    };
  }

  const target = stationPoiById(parentNode(destinationId)!.id);
  const b = bodyById(target.bodyId);
  const targetAltitude = Math.max(0, target.orbit.radius - b.radius);
  // Existing launch UI convention is screen/local direction, while station orbitSense
  // uses orbital math sign. In current campaign data, CW station targets use orbitSense=-1
  // and require RIGHTward launch guidance, so these signs intentionally invert.
  const orbitDir = target.orbit.orbitSense === -1 ? 1 : -1;
  return {
    thresholdApoapsisAltitude: Math.max((b.atmosphere?.height ?? 0) + 10_000, Math.min(targetAltitude * 0.5, 20_000)),
    targetOrbitAltitude: targetAltitude,
    orbitDir,
  };
}

export function generatedEstellaDepartureOrbitDir(destinationId: string, sourceId?: string): 1 | -1 {
  return generatedEstellaDepartureTarget(destinationId, sourceId).orbitDir;
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
  const sourceBodyId = centralBodyIdForPoi(sourceId);
  const destBodyId = centralBodyIdForPoi(destinationId);
  const sameBody = sourceBodyId === destBodyId;
  const destSurface = destKind === 'surface';
  const departureTarget = generatedEstellaDepartureTarget(destinationId, sourceId);
  const destLandingId = destSurface ? nextId() : 0;
  const destApproachId = destSurface ? nextId() : 0;
  const destDockingId = !destSurface ? nextId() : 0;
  const destinationOrbitalId = nextId();
  const transferOrbitalId = sameBody ? 0 : nextId();
  const sourceOrbitalId = sameBody ? destinationOrbitalId : nextId();

  if (destSurface) {
    register(LEVELS, createGeneratedLandingLevel(destinationId, destLandingId));
    register(APPROACH_LEVELS, createApproachLevel('descent', destinationId, destApproachId, destLandingId, destinationOrbitalId));
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

  const destinationOrbital = register(ORBITAL_LEVELS, createOrbitalLevel({
    id: destinationOrbitalId,
    bodyId: destBodyId,
    name: destSurface ? `${nodeName(ESTELLA_NODES_BY_ID.get(destinationId))} Deorbit` : `${nodeName(parentNode(destinationId))} Rendezvous`,
    reentryApproachLevelId: destSurface ? destApproachId : undefined,
    landingSiteAngle: destSurface ? surfacePlacement(destinationId).angle ?? 0 : 0,
    dockingLevelId: destSurface ? undefined : destDockingId,
    station: destSurface ? undefined : stationTargetForPoi(destinationId),
    startOrbit: sameBody ? sourceStartOrbit(sourceId) : undefined,
  }));

  let startOrbital = destinationOrbital;
  if (!sameBody) {
    const transferOrbital = register(ORBITAL_LEVELS, createSystemTransferLevel({
      id: transferOrbitalId,
      sourceBodyId,
      destinationBodyId: destBodyId,
      arrivalOrbitalLevelId: destinationOrbital.id,
    }));
    startOrbital = register(ORBITAL_LEVELS, createOrbitalLevel({
      id: sourceOrbitalId,
      bodyId: sourceBodyId,
      name: `${nodeName(ESTELLA_NODES_BY_ID.get(sourceBodyId))} Escape`,
      showLandingSite: false,
      startOrbit: sourceStartOrbit(sourceId),
      escapeToOrbitalLevelId: transferOrbital.id,
      escapeTargetBodyId: destBodyId,
    }));
  }

  if (sourceKind === 'surface') {
    const launchLandingId = nextId();
    const launchApproachId = nextId();
    const launchLanding = register(LEVELS, createGeneratedLandingLevel(sourceId, launchLandingId));
    register(APPROACH_LEVELS, createApproachLevel('departure', sourceId, launchApproachId, launchLandingId, startOrbital.id, departureTarget));
    return { start: { kind: 'landing', level: launchLanding, nextApproachLevelId: launchApproachId } };
  }

  const station = stationPoiById(parentNode(sourceId)!.id);
  const sourceDockingId = nextId();
  const sourceDocking = register(DOCKING_LEVELS, createGenericDockingLevel({
    id: sourceDockingId,
    name: station.name,
    subtitle: 'Undock and begin generated Estella route',
    exitMode: true,
    orbitalLevelId: startOrbital.id,
    targetSpoke: station.docking.undock.targetSpoke,
    targetSide: station.docking.undock.targetSide,
    targetSlot: station.docking.undock.targetSlot,
    fillPct: station.docking.undock.fillPct,
    exitDistance: station.docking.undock.exitDistance,
  }));
  return { start: { kind: 'docking', level: sourceDocking } };
}
