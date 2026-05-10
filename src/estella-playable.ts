import { APPROACH_LEVELS, type ApproachLevel } from './approach';
import { DOCKING_LEVELS, createGenericDockingLevel, type DockingLevel } from './docking';
import { LEVELS, createLandingLevel, type LevelDef } from './levels';
import { CLUSTER_LEVELS, createNearBeltClusterLevel, nearBeltClusterMemberNameForPoi, nearBeltDockingSlotForPoi, type ClusterLevel } from './cluster';
import { ORBITAL_LEVELS, type OrbitalLevel } from './orbital';
import { ESTELLA_NODES_BY_ID } from './content/estella';
import { estellaDisplayPath } from './content/estella/navigation';
import { ESTELLA_SURFACE_FLIGHT_PROFILES } from './content/estella/flight-profiles';
import { type Placement, type WorldNode } from './content/types';
import { BODIES, STATION_POIS, SURFACE_POIS, bodyById, bodyStateRelativeToParent, stationPoiById, surfacePoiById } from './world';

export interface EstellaPlayableMission {
  start: { kind: 'landing'; level: LevelDef; nextApproachLevelId: number } | { kind: 'docking'; level: DockingLevel } | { kind: 'cluster'; level: ClusterLevel };
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

function estellaHudPath(nodeId: string): string {
  return estellaDisplayPath(nodeId)
    .split(' -> ')
    .map(part => {
      const node = [...ESTELLA_NODES_BY_ID.values()].find(n => n.catalogId === part || `${n.catalogId} ${n.name}` === part || n.name === part);
      return node ? nodeName(node) : part;
    })
    .join(' -> ');
}

function senseLabel(sense: 1 | -1): string {
  return sense === 1 ? 'CCW' : 'CW';
}

function orbitalStationNameForHud(stationId: string): string {
  try { return stationPoiById(stationId).name; }
  catch { return nodeName(ESTELLA_NODES_BY_ID.get(stationId)); }
}


function surfaceMarkersForBody(bodyId: string): NonNullable<OrbitalLevel['surfaceMarkers']> {
  return SURFACE_POIS
    .filter(poi => poi.bodyId === bodyId)
    .map(poi => ({ id: poi.id, name: poi.name, angle: poi.surfaceAngle, altitude: poi.altitude, labelVisibility: ESTELLA_SURFACE_FLIGHT_PROFILES[poi.id]?.labelVisibility }));
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

function bodyParentId(bodyId: string): string | undefined {
  return bodyById(bodyId).orbit?.parentBodyId;
}

function bodyPathToRoot(bodyId: string): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = bodyId;
  while (current && !seen.has(current)) {
    seen.add(current);
    path.push(current);
    current = bodyParentId(current);
  }
  return path;
}

function bodyIsDescendantOf(bodyId: string, ancestorId: string): boolean {
  return bodyPathToRoot(bodyId).includes(ancestorId);
}

function childBodyOnPath(ancestorId: string, descendantId: string): string | undefined {
  let current: string | undefined = descendantId;
  let child: string | undefined;
  while (current && current !== ancestorId) {
    child = current;
    current = bodyParentId(current);
  }
  return current === ancestorId ? child : undefined;
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
  const env = b.approachEnvironment ?? { windLayers: [], turbulence: [] };
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
    dragNose: b.atmosphere ? 0.000020 : 0,
    dragBroadside: b.atmosphere ? 0.00040 : 0,
    dragWingPerRad: b.atmosphere ? 0.00015 : 0,
    liftBody: b.atmosphere ? 0.00012 : 0,
    liftWingPerRad: b.atmosphere ? 0.00085 : 0,
    heatCoeff: b.atmosphere ? 1e-5 : 0,
    dissipation: b.atmosphere ? 0.08 : 0,
    heatCapacity: b.atmosphere ? 3 : 1,
    wingsMaxTemp: b.atmosphere ? 0.50 : 1,
    maxWingAngle: b.atmosphere ? 1.0 : 0,
    wingAngleRate: b.atmosphere ? 1.0 : 0,
    thrustAccel: 15,
    thrustAccelMax: 150,
    fuelSeconds: kind === 'departure' ? departure.fuelSeconds : (b.atmosphere ? 85 : departure.fuelSeconds),
    gateX: 0,
    gateY: kind === 'departure' ? 0 : poi.descentProfile.gateY,
    gateRadius: kind === 'departure' ? 0 : poi.descentProfile.gateRadius,
    gateMaxSpeed: kind === 'departure' ? 0 : poi.descentProfile.gateMaxSpeed,
    gateMinSpeed: kind === 'departure' ? 0 : poi.descentProfile.gateMinSpeed,
    windLayers: env.windLayers,
    turbulence: env.turbulence,
    landingLevelId,
    ...(kind === 'departure'
      ? {
          departure: {
            exitAltitude: b.atmosphere ? b.orbitalDefaults.transitionAltitude : departure.exitAltitude,
            thresholdApoapsisAltitude: departureTarget?.thresholdApoapsisAltitude ?? departure.thresholdApoapsisAltitude,
            targetOrbitAltitude: departureTarget?.targetOrbitAltitude ?? departure.targetOrbitAltitude,
            orbitalLevelId,
            orbitDir: departureTarget?.orbitDir ?? departure.orbitDir,
          },
        }
      : { returnToOrbital: { exitAltitude: b.orbitalDefaults.transitionAltitude, orbitalLevelId } }),
  };
}

function finalDestinationHud(finalDestinationId: string): { name: string; location: string } {
  const finalNode = ESTELLA_NODES_BY_ID.get(finalDestinationId);
  return {
    name: finalNode ? nodeName(finalNode) : finalDestinationId,
    location: estellaHudPath(finalDestinationId),
  };
}

function applyDestinationHud(level: OrbitalLevel, finalDestinationId: string | undefined): void {
  if (finalDestinationId) {
    const final = finalDestinationHud(finalDestinationId);
    level.finalDestinationName = final.name;
    level.finalDestinationLocation = final.location;
  }
  if (level.station) {
    level.nextObjectiveName = orbitalStationNameForHud(level.station.id);
    level.nextObjectiveDetail = `Rendezvous with ${level.nextObjectiveName} (${senseLabel(level.station.orbitSense)} orbit).`;
  } else if (level.reentryApproachLevelId !== undefined && level.showLandingSite !== false) {
    const finalNode = finalDestinationId ? ESTELLA_NODES_BY_ID.get(finalDestinationId) : undefined;
    level.nextObjectiveName = finalNode ? nodeName(finalNode) : 'Surface site';
    level.nextObjectiveDetail = `Deorbit and descend to ${level.nextObjectiveName}.`;
  }
  if (bodyById(level.bodyId).transferGameplay) level.conicRadius = bodyById(level.bodyId).transferGameplay?.patchRadius;
}

function lowOrbitAltitude(bodyId: string): number {
  const b = bodyById(bodyId);
  return Math.max(35_000, (b.atmosphere?.height ?? 0) + 20_000);
}

function departureThresholdForLowOrbit(bodyId: string): number {
  const b = bodyById(bodyId);
  return Math.max(30_000, (b.atmosphere?.height ?? 0) + 10_000);
}

function generatedApproachIndex(reentryApproachLevelId: number | undefined): number {
  if (reentryApproachLevelId === undefined) return 0;
  const idx = APPROACH_LEVELS.findIndex(level => level.id === reentryApproachLevelId);
  return idx >= 0 ? idx : 0;
}

function fallbackSurfacePoiIdForBody(bodyId: string): string | undefined {
  return SURFACE_POIS.find(poi => poi.bodyId === bodyId && ESTELLA_NODES_BY_ID.has(poi.id))?.id;
}

function createFallbackReentryApproach(bodyId: string, orbitalLevelId: number, preferredPoiId?: string): { approachId: number; landingSiteAngle: number } | null {
  const b = bodyById(bodyId);
  if (!b.atmosphere) return null;
  const poiId = preferredPoiId && surfacePoiById(preferredPoiId).bodyId === bodyId
    ? preferredPoiId
    : fallbackSurfacePoiIdForBody(bodyId);
  if (!poiId) return null;
  const landingId = nextId();
  const approachId = nextId();
  register(LEVELS, createGeneratedLandingLevel(poiId, landingId));
  register(APPROACH_LEVELS, createApproachLevel('descent', poiId, approachId, landingId, orbitalLevelId));
  return { approachId, landingSiteAngle: surfacePlacement(poiId).angle ?? 0 };
}

function createOrbitalLevel(opts: {
  id: number;
  bodyId: string;
  name: string;
  finalDestinationId?: string;
  reentryApproachLevelId?: number;
  fallbackReentryPoiId?: string;
  landingSiteAngle?: number;
  dockingLevelId?: number;
  station?: OrbitalLevel['station'];
  startOrbit?: { radius: number; epochAngle: number; orbitSense: 1 | -1 };
  showLandingSite?: boolean;
  escapeToOrbitalLevelId?: number;
  escapeTargetBodyId?: string;
}): OrbitalLevel {
  const b = bodyById(opts.bodyId);
  const fallbackReentry = opts.reentryApproachLevelId === undefined
    ? createFallbackReentryApproach(opts.bodyId, opts.id, opts.fallbackReentryPoiId)
    : null;
  const reentryApproachLevelId = opts.reentryApproachLevelId ?? fallbackReentry?.approachId;
  const landingSiteAngle = opts.landingSiteAngle ?? fallbackReentry?.landingSiteAngle ?? 0;
  const r = opts.startOrbit?.radius ?? (b.radius + lowOrbitAltitude(opts.bodyId));
  const startAngle = opts.startOrbit ? opts.startOrbit.epochAngle + 0.06 * opts.startOrbit.orbitSense : landingSiteAngle + Math.PI * 0.85;
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
    aeroNoseDrag: b.atmosphere ? 0.00002 : 0,
    aeroBroadsideDrag: b.atmosphere ? 0.0004 : 0,
    aeroLiftCoeff: b.atmosphere ? 0.00012 : 0,
    highAtmoAoA: b.atmosphere ? 0.44 : 0,
    lowAtmoAoA: b.atmosphere ? 0.13 : 0,
    rcsAngularAccel: b.atmosphere ? 0.5 : 1.5,
    heatCoeff: b.atmosphere ? 1e-5 : 0,
    heatDissipation: b.atmosphere ? 0.08 : 0,
    transitionAltitude: b.orbitalDefaults.transitionAltitude,
    landingSiteAngle,
    surfaceMarkers: surfaceMarkersForBody(opts.bodyId),
    orbitMarkers: orbitMarkersForBody(opts.bodyId),
    approachLevelIdx: generatedApproachIndex(reentryApproachLevelId),
    approachGravity: b.gm / (b.radius * b.radius),
    reentryApproachLevelId,
    showLandingSite: opts.showLandingSite ?? !opts.station,
    station: opts.station,
    dockingLevelId: opts.dockingLevelId,
  };
  applyDestinationHud(level, opts.finalDestinationId);
  if (opts.escapeToOrbitalLevelId) {
    level.escapeToOrbitalLevelId = opts.escapeToOrbitalLevelId;
    level.escapeSOIRadius = b.transferGameplay?.patchRadius ?? TRANSFER_PATCH_RADIUS;
  }
  if (opts.escapeTargetBodyId) {
    level.escapeTargetBodyId = opts.escapeTargetBodyId;
    level.escapeVectorSpeed = hohmannDepartureVInf(opts.bodyId, opts.escapeTargetBodyId);
  }
  return level;
}

function createSystemTransferLevel(opts: {
  id: number;
  frameBodyId: string;
  destinationBodyId: string;
  arrivalOrbitalLevelId: number;
  finalDestinationId: string;
  sourceBodyId?: string;
  startOrbit?: { radius: number; epochAngle: number; orbitSense: 1 | -1 };
}): OrbitalLevel {
  const parent = bodyById(opts.frameBodyId);
  const seed = opts.sourceBodyId
    ? bodyStateRelativeToParent(opts.sourceBodyId, 0)
    : circularStart(opts.frameBodyId, opts.startOrbit?.radius ?? parent.radius + lowOrbitAltitude(opts.frameBodyId), opts.startOrbit?.epochAngle ?? Math.PI * 0.85, opts.startOrbit?.orbitSense ?? -1);
  const source = opts.sourceBodyId ? bodyById(opts.sourceBodyId) : parent;
  const destination = bodyById(opts.destinationBodyId);
  if (!destination.orbit || destination.orbit.parentBodyId !== opts.frameBodyId) throw new Error('Generated Estella transfer requires destination orbiting frame body');
  const systemBodies = BODIES
    .filter(body => body.orbit?.parentBodyId === opts.frameBodyId && body.transferGameplay)
    .map(body => transferBodyMarker(body.id, body.id === opts.destinationBodyId ? opts.arrivalOrbitalLevelId : undefined));
  const level: OrbitalLevel = {
    id: opts.id,
    bodyId: opts.frameBodyId,
    bodyName: parent.name,
    name: `${source.name} → ${destination.name} Transfer`,
    subtitle: 'Generated Estella transfer',
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
    systemBodies,
    targetBodyId: opts.destinationBodyId,
    conicRadius: destination.orbit.radius * 1.2,
  };
  applyDestinationHud(level, opts.finalDestinationId);
  level.nextObjectiveName = destination.name;
  const finalKind = playableKind(opts.finalDestinationId);
  if (finalKind === 'dock') {
    const targetStation = stationPoiById(parentNode(opts.finalDestinationId)!.id);
    level.transferArrivalOrbitSense = targetStation.orbit.orbitSense;
    level.nextObjectiveDetail = `Intercept ${destination.name}; target dock orbit is ${senseLabel(targetStation.orbit.orbitSense)}.`;
  } else {
    level.nextObjectiveDetail = `Intercept ${destination.name}; then deorbit to the target surface site.`;
  }
  return level;
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
    const bodyId = sourceId ? centralBodyIdForPoi(sourceId) : centralBodyIdForPoi(destinationId);
    return {
      thresholdApoapsisAltitude: departureThresholdForLowOrbit(bodyId),
      targetOrbitAltitude: lowOrbitAltitude(bodyId),
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

function buildRouteObjective(opts: {
  currentBodyId: string;
  targetBodyId: string;
  destinationOrbital: OrbitalLevel;
  destinationId: string;
  initialSourceId: string;
}): OrbitalLevel {
  if (opts.currentBodyId === opts.targetBodyId) return opts.destinationOrbital;

  const startOrbit = opts.currentBodyId === centralBodyIdForPoi(opts.initialSourceId)
    ? sourceStartOrbit(opts.initialSourceId)
    : undefined;

  if (bodyIsDescendantOf(opts.targetBodyId, opts.currentBodyId)) {
    const childId = childBodyOnPath(opts.currentBodyId, opts.targetBodyId);
    if (!childId) return opts.destinationOrbital;
    const childArrival = buildRouteObjective({ ...opts, currentBodyId: childId });
    return register(ORBITAL_LEVELS, createSystemTransferLevel({
      id: nextId(),
      frameBodyId: opts.currentBodyId,
      startOrbit,
      destinationBodyId: childId,
      arrivalOrbitalLevelId: childArrival.id,
      finalDestinationId: opts.destinationId,
    }));
  }

  const parentId = bodyParentId(opts.currentBodyId);
  if (!parentId) return opts.destinationOrbital;
  const parentObjective = buildRouteObjective({ ...opts, currentBodyId: parentId });
  const targetIsTransferInParent = parentObjective.bodyId === parentId && !!parentObjective.targetBodyId;
  return register(ORBITAL_LEVELS, createOrbitalLevel({
    id: nextId(),
    bodyId: opts.currentBodyId,
    name: `${nodeName(ESTELLA_NODES_BY_ID.get(opts.currentBodyId))} Escape`,
    finalDestinationId: opts.destinationId,
    showLandingSite: false,
    startOrbit,
    fallbackReentryPoiId: playableKind(opts.initialSourceId) === 'surface' && opts.currentBodyId === centralBodyIdForPoi(opts.initialSourceId) ? opts.initialSourceId : undefined,
    escapeToOrbitalLevelId: parentObjective.id,
    escapeTargetBodyId: targetIsTransferInParent ? parentObjective.targetBodyId : undefined,
  }));
}

export function createPlayableEstellaMission(sourceId: string, destinationId: string): EstellaPlayableMission {
  const sourceKind = playableKind(sourceId);
  const destKind = playableKind(destinationId);
  const clusterSourceSlot = nearBeltDockingSlotForPoi(sourceId);
  const clusterDestSlot = nearBeltDockingSlotForPoi(destinationId);
  if (clusterSourceSlot && clusterDestSlot) {
    const final = finalDestinationHud(destinationId);
    const destDockingId = nextId();
    const clusterId = nextId();
    const destMemberName = nearBeltClusterMemberNameForPoi(destinationId) ?? 'Near Belt destination';
    const sourceMemberName = nearBeltClusterMemberNameForPoi(sourceId) ?? 'Near Belt source';
    const destDocking = register(DOCKING_LEVELS, createGenericDockingLevel({
      id: destDockingId,
      name: destMemberName,
      subtitle: 'Deliver generated Estella cargo',
      exitMode: false,
      finalDestinationName: final.name,
      finalDestinationLocation: final.location,
      nextObjectiveDetail: 'Complete docking at the assigned Belt berth.',
      targetSpoke: clusterDestSlot.targetSpoke,
      targetSide: clusterDestSlot.targetSide,
      targetSlot: clusterDestSlot.targetSlot,
      fillPct: 0.55,
    }));
    const clusterLevel = createNearBeltClusterLevel(sourceId, destinationId, clusterId, destDocking.id);
    if (clusterLevel) {
      register(CLUSTER_LEVELS, clusterLevel);
      const sourceDocking = register(DOCKING_LEVELS, createGenericDockingLevel({
        id: nextId(),
        name: sourceMemberName,
        subtitle: 'Undock and enter Near Belt local traffic',
        exitMode: true,
        clusterLevelId: clusterLevel.id,
        finalDestinationName: final.name,
        finalDestinationLocation: final.location,
        nextObjectiveDetail: `Clear the berth; next: ${clusterLevel.name}.`,
        targetSpoke: clusterSourceSlot.targetSpoke,
        targetSide: clusterSourceSlot.targetSide,
        targetSlot: clusterSourceSlot.targetSlot,
        fillPct: 0.55,
        exitDistance: 140,
      }));
      return { start: { kind: 'docking', level: sourceDocking } };
    }
  }

  const sourceBodyId = centralBodyIdForPoi(sourceId);
  const destBodyId = centralBodyIdForPoi(destinationId);
  const sameBody = sourceBodyId === destBodyId;
  const destSurface = destKind === 'surface';
  const departureTarget = generatedEstellaDepartureTarget(destinationId, sourceId);
  const destLandingId = destSurface ? nextId() : 0;
  const destApproachId = destSurface ? nextId() : 0;
  const destDockingId = !destSurface ? nextId() : 0;
  const destinationOrbitalId = nextId();

  if (destSurface) {
    register(LEVELS, createGeneratedLandingLevel(destinationId, destLandingId));
    register(APPROACH_LEVELS, createApproachLevel('descent', destinationId, destApproachId, destLandingId, destinationOrbitalId));
  } else {
    const station = stationPoiById(parentNode(destinationId)!.id);
    const final = finalDestinationHud(destinationId);
    register(DOCKING_LEVELS, createGenericDockingLevel({
      id: destDockingId,
      name: station.name,
      subtitle: 'Deliver generated Estella cargo',
      exitMode: false,
      targetSpoke: station.docking.delivery.targetSpoke,
      targetSide: station.docking.delivery.targetSide,
      targetSlot: station.docking.delivery.targetSlot,
      fillPct: station.docking.delivery.fillPct,
      finalDestinationName: final.name,
      finalDestinationLocation: final.location,
      nextObjectiveDetail: 'Deliver to the target bay.',
    }));
  }

  const destinationOrbital = register(ORBITAL_LEVELS, createOrbitalLevel({
    id: destinationOrbitalId,
    bodyId: destBodyId,
    name: destSurface ? `${nodeName(ESTELLA_NODES_BY_ID.get(destinationId))} Deorbit` : `${nodeName(parentNode(destinationId))} Rendezvous`,
    finalDestinationId: destinationId,
    reentryApproachLevelId: destSurface ? destApproachId : undefined,
    fallbackReentryPoiId: !destSurface && sourceKind === 'surface' && sourceBodyId === destBodyId ? sourceId : undefined,
    landingSiteAngle: destSurface ? surfacePlacement(destinationId).angle ?? 0 : 0,
    dockingLevelId: destSurface ? undefined : destDockingId,
    station: destSurface ? undefined : stationTargetForPoi(destinationId),
    startOrbit: sameBody ? sourceStartOrbit(sourceId) : undefined,
  }));

  const startOrbital = sameBody
    ? destinationOrbital
    : buildRouteObjective({
        currentBodyId: sourceBodyId,
        targetBodyId: destBodyId,
        destinationOrbital,
        destinationId,
        initialSourceId: sourceId,
      });

  if (sourceKind === 'surface') {
    const launchLandingId = nextId();
    const launchApproachId = nextId();
    const launchLanding = register(LEVELS, createGeneratedLandingLevel(sourceId, launchLandingId));
    register(APPROACH_LEVELS, createApproachLevel('departure', sourceId, launchApproachId, launchLandingId, startOrbital.id, departureTarget));
    return { start: { kind: 'landing', level: launchLanding, nextApproachLevelId: launchApproachId } };
  }

  const station = stationPoiById(parentNode(sourceId)!.id);
  const sourceDockingId = nextId();
  const final = finalDestinationHud(destinationId);
  const sourceDocking = register(DOCKING_LEVELS, createGenericDockingLevel({
    id: sourceDockingId,
    name: station.name,
    subtitle: 'Undock and begin generated Estella route',
    exitMode: true,
    orbitalLevelId: startOrbital.id,
    finalDestinationName: final.name,
    finalDestinationLocation: final.location,
    nextObjectiveDetail: `Clear the station; next: ${startOrbital.name}.`,
    targetSpoke: station.docking.undock.targetSpoke,
    targetSide: station.docking.undock.targetSide,
    targetSlot: station.docking.undock.targetSlot,
    fillPct: station.docking.undock.fillPct,
    exitDistance: station.docking.undock.exitDistance,
  }));
  return { start: { kind: 'docking', level: sourceDocking } };
}
