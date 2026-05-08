// Orbital phase: 2D Keplerian orbit around a planet with aerobraking.
// Self-contained module: physics, prediction, rendering, HUD.

import { ORBITAL_PHASES, type OrbitalPhaseDef, type OrbitalSeedDef, type TransferSystemBodyDef } from './campaign-content';
import { COL_DANGER, COL_HUD, COL_HUD_DIM, COL_SUCCESS, COL_WARNING, drawHudInfoPanel, drawHudLabel } from './hud-layout';
import { InputState } from './input';
import { APPROACH_LEVELS, approachLevelById, createApproachState, predictTrajectory, type ApproachInitOverride } from './approach';
import { bodyById, bodyOrbitModeById, bodyStateRelativeToParent, stationPoiById, surfacePoiById } from './world';

// ===================== Types =====================

export interface OrbitalTransferBody {
  id: string;
  name: string;
  radius: number;
  gm: number;
  color: [number, number, number];
  orbitRadius: number;
  epochAngle: number;
  epochTime: number;
  orbitSense: 1 | -1;
  patchRadius: number;           // gameplay patch/intercept radius
  displayPatchRadius?: number;   // optional smaller/larger rendered radius
  arrivalAltitudeMin?: number;
  arrivalAltitudeMax?: number;
  arrivalSpeedMarginMin?: number;
  arrivalSpeedMarginMax?: number;
  arrivalOrbitalLevelId?: number;
}

export interface OrbitalLevel {
  id: number;
  bodyId: string;
  bodyName?: string;
  name: string;
  subtitle: string;

  // Planet
  planetRadius: number;     // meters
  planetGM: number;         // gravitational parameter (m³/s²)
  atmoHeight: number;       // atmosphere thickness above surface (meters)
  atmoColor: [number, number, number]; // RGB for atmosphere tint
  planetFillColor?: string;
  planetStrokeColor?: string;

  // Time scaling: "1x" display = baseTimeScale × real physics rate
  // This makes orbits visually fast while keeping velocities realistic
  baseTimeScale: number;

  // Starting orbit (state vectors, physics-time velocities)
  startX: number;
  startY: number;
  startVX: number;
  startVY: number;

  // Ship
  thrustAccel: number;      // m/s² (low/precision thrust)
  thrustAccelMax: number;   // m/s² (high/full thrust after warmup)
  thrustWallDvPerSec?: number;     // optional wall-clock Δv/s target for precision thrust
  thrustWallDvPerSecMax?: number;  // optional wall-clock Δv/s target for max thrust
  fuelDeltaV: number;       // total delta-v budget in m/s

  // Atmosphere (for aerobraking)
  surfaceDensity: number;
  scaleHeight: number;

  // Aero model (AoA-dependent in atmosphere)
  aeroNoseDrag: number;       // Cd when nose-first
  aeroBroadsideDrag: number;  // Cd when broadside
  aeroLiftCoeff: number;      // body lift coefficient
  highAtmoAoA: number;        // radians, default AoA for upper atmosphere entry
  lowAtmoAoA: number;         // radians, default AoA for lower atmosphere (approach-like)
  rcsAngularAccel: number;    // rad/s² for A/D pitch control in atmo

  // Heat
  heatCoeff: number;
  heatDissipation: number;

  // Transition to approach phase
  transitionAltitude: number; // meters above surface — switch to approach when below this

  // Landing site (angle on planet surface, radians from +X axis)
  landingSiteAngle: number;
  surfaceMarkers?: {
    id: string;
    name: string;
    angle: number;
    labelVisibility?: 'always' | 'target';
  }[];
  orbitMarkers?: {
    id: string;
    name: string;
    orbitRadius: number;
    epochAngle: number;
    epochTime: number;
    orbitSense: 1 | -1;
  }[];

  // Approach phase linkage
  approachLevelIdx: number;
  approachGravity: number;
  reentryApproachLevelId?: number;
  showLandingSite?: boolean;

  // Station (rendezvous target, optional)
  station?: {
    id: string;
    name?: string;
    orbitRadius: number;       // meters from planet center
    epochAngle: number;        // radians at epoch
    epochTime: number;         // world time at epoch
    orbitSense: 1 | -1;
    captureRadius: number;     // meters — get inside this
    captureMaxSpeed: number;   // m/s max relative speed for success
  };
  dockingLevelId?: number;

  // Optional transfer-system bodies (for moon-to-moon transfers)
  systemBodies?: OrbitalTransferBody[];
  targetBodyId?: string;
  escapeSOIRadius?: number;
  escapeToOrbitalLevelId?: number;
  escapeTargetBodyId?: string;
  escapeVectorAngle?: number;
  escapeVectorSpeed?: number;
  parentTransferPeriapsisAltitude?: number;
  conicRadius?: number;
  orbitModeId?: string;
}

export interface OrbitalState {
  x: number;         // position relative to planet center
  y: number;
  vx: number;
  vy: number;

  fuel: number;      // legacy field; no longer caps thrust
  dvUsed: number;
  alive: boolean;
  enteredAtmo: boolean;
  temperature: number; // 0..1, for display

  // Trail (ring buffer of recent positions, using wall-clock time)
  trail: { x: number; y: number; t: number }[];
  trailIdx: number;

  // Time
  time: number;        // physics time
  realTime: number;    // wall-clock time (for trail)
  timeWarp: number;    // user-controlled multiplier (displayed)
  timeWarpLevel: number; // index into WARP_SPEEDS

  // Thrust state (individual thrusters, can fire simultaneously)
  thrustPro: boolean;    // prograde thruster firing
  thrustRetro: boolean;  // retrograde thruster firing
  thrustLeft: boolean;   // left (radial) thruster firing
  thrustRight: boolean;  // right (radial) thruster firing
  thrusting: 'none' | 'prograde' | 'retrograde' | 'left' | 'right'; // legacy, for prediction dirty
  highThrust: boolean;
  inAtmo: boolean;

  // Ship orientation (used in atmosphere for AoA control)
  angle: number;
  renderAngle: number;
  targetAoA: number;

  // Rendezvous
  docked: boolean;
  inRendezvousZoom: boolean;   // in close-proximity rendezvous mode
  pacingModeId: string;
  pendingBodyCapture?: {
    bodyId: string;
    time: number;
    rx: number;
    ry: number;
    rvx: number;
    rvy: number;
  };
}

export interface OrbitalInitOverride {
  x: number;
  y: number;
  vx: number;
  vy: number;
  time?: number;
}

// ===================== Constants =====================

const WARP_SPEEDS = [1, 2, 5, 10, 25, 50, 100];
const TRAIL_MAX = 800;
const TRAIL_DURATION = 12; // wall-clock seconds
const PHYSICS_SUBSTEP = 1 / 120;
const SYSTEM_TRANSFER_SUBSTEP = 0.5;
const THRUST_EPS = 1e-6;
const ATMO_WARP_CAP = 5; // max displayed warp in upper atmosphere
const ATMO_LOW_WARP_CAP = 1; // max displayed warp in lower atmosphere (below transition alt)
const ATMO_TIME_SCALE = 20; // base time scale in atmosphere (vs 100 in space) = 5x slowdown
const ATMO_THRUST_MULT = 5;  // thrust multiplier in atmosphere (compensate for slower time)

function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function moveAngleToward(current: number, target: number, maxDelta: number): number {
  const delta = normalizeAngle(target - current);
  if (Math.abs(delta) <= maxDelta) return target;
  return normalizeAngle(current + Math.sign(delta) * maxDelta);
}

function hohmannDepartureVInf(innerOrbitRadius: number, outerOrbitRadius: number, parentGM: number): number {
  const a = (innerOrbitRadius + outerOrbitRadius) * 0.5;
  const vCirc = Math.sqrt(parentGM / innerOrbitRadius);
  const vTransfer = Math.sqrt(parentGM * (2 / innerOrbitRadius - 1 / a));
  return Math.max(0, vTransfer - vCirc);
}

function transferBodyFromDef(levelBodyId: string, def: TransferSystemBodyDef): OrbitalTransferBody {
  const body = bodyById(def.bodyId);
  if (!body.orbit || body.orbit.parentBodyId !== levelBodyId) {
    throw new Error(`Body ${def.bodyId} is not orbiting ${levelBodyId}`);
  }
  return {
    id: body.id,
    name: body.name,
    radius: body.radius,
    gm: body.gm,
    color: body.color,
    orbitRadius: body.orbit.radius,
    epochAngle: body.orbit.epochAngle,
    epochTime: body.orbit.epochTime,
    orbitSense: body.orbit.orbitSense,
    patchRadius: def.patchRadius,
    displayPatchRadius: def.displayPatchRadius,
    arrivalAltitudeMin: def.arrivalAltitudeMin,
    arrivalAltitudeMax: def.arrivalAltitudeMax,
    arrivalSpeedMarginMin: def.arrivalSpeedMarginMin,
    arrivalSpeedMarginMax: def.arrivalSpeedMarginMax,
    arrivalOrbitalLevelId: def.arrivalOrbitalLevelId,
  };
}

function localTransferBodyForBody(bodyId: string): OrbitalTransferBody | null {
  const body = bodyById(bodyId);
  if (!body.orbit || !body.transferGameplay) return null;
  return {
    id: body.id,
    name: body.name,
    radius: body.radius,
    gm: body.gm,
    color: body.color,
    orbitRadius: body.orbit.radius,
    epochAngle: body.orbit.epochAngle,
    epochTime: body.orbit.epochTime,
    orbitSense: body.orbit.orbitSense,
    patchRadius: body.transferGameplay.patchRadius,
    displayPatchRadius: body.transferGameplay.displayPatchRadius,
  };
}

export function getTransferBody(level: OrbitalLevel, bodyId: string): OrbitalTransferBody | null {
  return level.systemBodies?.find(b => b.id === bodyId) ?? null;
}

export function transferBodyState(
  level: OrbitalLevel, bodyId: string, time: number,
): { x: number; y: number; vx: number; vy: number } | null {
  const body = getTransferBody(level, bodyId);
  if (!body) return null;
  const omega = body.orbitSense * Math.sqrt(level.planetGM / (body.orbitRadius ** 3));
  const angle = body.epochAngle + omega * (time - body.epochTime);
  const speed = Math.sqrt(level.planetGM / body.orbitRadius);
  return {
    x: body.orbitRadius * Math.cos(angle),
    y: body.orbitRadius * Math.sin(angle),
    vx: -body.orbitSense * speed * Math.sin(angle),
    vy: body.orbitSense * speed * Math.cos(angle),
  };
}

let _cachedEscapeTarget: { levelId: number; timeBin: number; angle: number } | null = null;

function optimizedEscapeTargetAngle(level: OrbitalLevel, time: number, vInf: number): number | null {
  if (!level.escapeToOrbitalLevelId) return null;
  const nextLevel = ORBITAL_LEVELS.find(l => l.id === level.escapeToOrbitalLevelId);
  const originState = nextLevel ? transferBodyState(nextLevel, level.bodyId, time) : null;
  const targetBody = nextLevel?.targetBodyId ? getTransferBody(nextLevel, nextLevel.targetBodyId) : null;
  const originBody = bodyById(level.bodyId);
  const targetBodyDef = nextLevel?.targetBodyId ? bodyById(nextLevel.targetBodyId) : null;
  if (!nextLevel || !originState || !targetBody || !originBody.orbit || !targetBodyDef?.orbit) return null;

  const timeBin = Math.floor(time / 20);
  if (_cachedEscapeTarget && _cachedEscapeTarget.levelId === level.id && _cachedEscapeTarget.timeBin === timeBin) {
    return _cachedEscapeTarget.angle;
  }

  const baseAngle = Math.atan2(originState.vy, originState.vx);
  const transferA = (originBody.orbit.radius + targetBodyDef.orbit.radius) * 0.5;
  const hohmannTime = Math.PI * Math.sqrt((transferA * transferA * transferA) / nextLevel.planetGM);
  const horizon = hohmannTime * 1.35;
  const stepSize = Math.max(120, horizon / 480);
  let bestAngle = baseAngle;
  let bestDist = Infinity;
  let bestRelSpeed = Infinity;

  const evalAngle = (angle: number) => {
    const trial: OrbitalState = {
      x: originState.x,
      y: originState.y,
      vx: originState.vx + Math.cos(angle) * vInf,
      vy: originState.vy + Math.sin(angle) * vInf,
      fuel: 0,
      dvUsed: 0,
      alive: true,
      enteredAtmo: false,
      temperature: 0,
      trail: [],
      trailIdx: 0,
      time,
      realTime: 0,
      timeWarp: 1,
      timeWarpLevel: 0,
      thrustPro: false,
      thrustRetro: false,
      thrustLeft: false,
      thrustRight: false,
      thrusting: 'none',
      highThrust: false,
      inAtmo: false,
      angle: 0,
      renderAngle: 0,
      targetAoA: nextLevel.highAtmoAoA,
      docked: false,
      inRendezvousZoom: false,
      pacingModeId: currentPacingProfile(nextLevel, Math.sqrt(originState.x * originState.x + originState.y * originState.y) - nextLevel.planetRadius).orbitModeId,
    };
    const points = predictOrbit(trial, nextLevel, horizon, stepSize, nextLevel.highAtmoAoA);
    let minDist = Infinity;
    let relSpeedAtMin = Infinity;
    for (const pt of points) {
      const bodyPos = transferBodyState(nextLevel, targetBody.id, pt.t);
      if (!bodyPos) continue;
      const dx = pt.x - bodyPos.x;
      const dy = pt.y - bodyPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        const rvx = pt.vx - bodyPos.vx;
        const rvy = pt.vy - bodyPos.vy;
        relSpeedAtMin = Math.sqrt(rvx * rvx + rvy * rvy);
      }
    }
    if (minDist < bestDist - 1 || (Math.abs(minDist - bestDist) <= 1 && relSpeedAtMin < bestRelSpeed)) {
      bestDist = minDist;
      bestRelSpeed = relSpeedAtMin;
      bestAngle = angle;
    }
  };

  const coarseRange = Math.PI * 0.45;
  for (let i = 0; i <= 24; i++) {
    const f = i / 24;
    evalAngle(baseAngle - coarseRange + f * coarseRange * 2);
  }
  for (let pass = 0; pass < 2; pass++) {
    const refineRange = pass === 0 ? Math.PI * 0.08 : Math.PI * 0.025;
    const center = bestAngle;
    for (let i = 0; i <= 10; i++) {
      const f = i / 10;
      evalAngle(center - refineRange + f * refineRange * 2);
    }
  }

  _cachedEscapeTarget = { levelId: level.id, timeBin, angle: bestAngle };
  return bestAngle;
}

function parentTransferTargetForLevel(
  level: OrbitalLevel, time: number,
): { angle: number; speed: number; vInf: number } | null {
  if (level.parentTransferPeriapsisAltitude === undefined || !level.escapeToOrbitalLevelId) return null;
  const originBody = bodyById(level.bodyId);
  if (!originBody.orbit) return null;
  const nextLevel = ORBITAL_LEVELS.find(l => l.id === level.escapeToOrbitalLevelId);
  if (!nextLevel || nextLevel.bodyId !== originBody.orbit.parentBodyId) return null;

  const parentState = bodyStateRelativeToParent(level.bodyId, time);
  const rApo = originBody.orbit.radius;
  const rPeri = nextLevel.planetRadius + level.parentTransferPeriapsisAltitude;
  if (rPeri <= 0 || rPeri >= rApo) return null;

  const a = (rApo + rPeri) * 0.5;
  const transferSpeedAtApo = Math.sqrt(nextLevel.planetGM * (2 / rApo - 1 / a));
  const parentSpeed = Math.hypot(parentState.vx, parentState.vy);
  if (parentSpeed < 1e-6) return null;

  const tanX = parentState.vx / parentSpeed;
  const tanY = parentState.vy / parentSpeed;
  const desiredVX = tanX * transferSpeedAtApo;
  const desiredVY = tanY * transferSpeedAtApo;
  const vInfX = desiredVX - parentState.vx;
  const vInfY = desiredVY - parentState.vy;
  const vInf = Math.hypot(vInfX, vInfY);
  const patchR = level.escapeSOIRadius ?? level.conicRadius ?? 0;
  const speed = patchR > 0 ? Math.sqrt(vInf * vInf + 2 * level.planetGM / patchR) : vInf;
  return {
    angle: Math.atan2(vInfY, vInfX),
    speed,
    vInf,
  };
}

function escapeTargetForLevel(
  level: OrbitalLevel, time: number,
): { angle: number; speed: number } | null {
  const parentTarget = parentTransferTargetForLevel(level, time);
  if (parentTarget) return { angle: parentTarget.angle, speed: parentTarget.speed };

  let angle: number | null = null;
  const vInf = level.escapeVectorSpeed ?? 0;
  if (level.escapeToOrbitalLevelId) {
    const nextLevel = ORBITAL_LEVELS.find(l => l.id === level.escapeToOrbitalLevelId);
    const retargetsSameBody = nextLevel?.targetBodyId === level.bodyId;
    if (!retargetsSameBody) {
      angle = optimizedEscapeTargetAngle(level, time, vInf);
      if (angle === null) {
        const fallbackState = nextLevel ? transferBodyState(nextLevel, level.bodyId, time) : null;
        if (fallbackState) angle = Math.atan2(fallbackState.vy, fallbackState.vx);
      }
    }
  }
  if (angle === null && level.escapeVectorAngle !== undefined) angle = level.escapeVectorAngle;
  if (angle === null) return null;

  const patchR = level.escapeSOIRadius ?? level.conicRadius ?? 0;
  const speed = patchR > 0 ? Math.sqrt(vInf * vInf + 2 * level.planetGM / patchR) : vInf;
  return { angle, speed };
}

export function currentEscapeVector(
  s: OrbitalState, level: OrbitalLevel,
): { angle: number; speed: number; x: number; y: number; vInf: number } | null {
  if (!level.escapeSOIRadius) return null;
  const patchR = level.escapeSOIRadius;
  const effSpeed = (vx: number, vy: number, radius: number) => {
    const v2 = vx * vx + vy * vy;
    return Math.sqrt(Math.max(0, v2 - 2 * level.planetGM / Math.max(radius, 1)));
  };

  const r = Math.sqrt(s.x * s.x + s.y * s.y);
  if (r >= patchR) {
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (speed > 0.01) {
      const scale = patchR / Math.max(r, 1);
      return {
        angle: Math.atan2(s.vy, s.vx),
        speed,
        x: s.x * scale,
        y: s.y * scale,
        vInf: effSpeed(s.vx, s.vy, r),
      };
    }
  }

  const pred = getCachedPrediction(s, level);
  for (let i = 1; i < pred.points.length; i++) {
    const prev = pred.points[i - 1];
    const pt = pred.points[i];
    const r0 = Math.sqrt(prev.x * prev.x + prev.y * prev.y);
    const r1 = Math.sqrt(pt.x * pt.x + pt.y * pt.y);
    if (r0 < patchR && r1 >= patchR) {
      const frac = (patchR - r0) / Math.max(1e-6, (r1 - r0));
      const x = prev.x + (pt.x - prev.x) * frac;
      const y = prev.y + (pt.y - prev.y) * frac;
      const vx = prev.vx + (pt.vx - prev.vx) * frac;
      const vy = prev.vy + (pt.vy - prev.vy) * frac;
      return {
        angle: Math.atan2(vy, vx),
        speed: Math.sqrt(vx * vx + vy * vy),
        x, y,
        vInf: effSpeed(vx, vy, patchR),
      };
    }
  }
  return null;
}

// ===================== Levels =====================

function approachById(id: number) {
  const level = approachLevelById(id);
  if (!level) throw new Error(`Missing approach level ${id}`);
  return level;
}

function approachIndexById(id: number): number {
  const idx = APPROACH_LEVELS.findIndex(l => l.id === id);
  if (idx < 0) throw new Error(`Missing approach level index ${id}`);
  return idx;
}

function createOrbitalBase(
  id: number,
  bodyId: string,
  name: string,
  subtitle: string,
  startX: number,
  startY: number,
  startVX: number,
  startVY: number,
  approachLevelId: number,
): OrbitalLevel {
  const body = bodyById(bodyId);
  const atmo = body.atmosphere;
  const approach = approachById(approachLevelId);
  return {
    id,
    bodyId,
    name,
    subtitle,
    planetRadius: body.radius,
    planetGM: body.gm,
    atmoHeight: atmo?.height ?? 0,
    atmoColor: atmo?.color ?? [0, 0, 0],
    planetFillColor: body.planetFillColor,
    planetStrokeColor: body.planetStrokeColor,
    baseTimeScale: body.orbitalDefaults.baseTimeScale,
    startX,
    startY,
    startVX,
    startVY,
    thrustAccel: body.orbitalDefaults.thrustAccel,
    thrustAccelMax: body.orbitalDefaults.thrustAccelMax,
    fuelDeltaV: body.orbitalDefaults.fuelDeltaV,
    surfaceDensity: atmo?.surfaceDensity ?? 0,
    scaleHeight: atmo?.scaleHeight ?? 1,
    aeroNoseDrag: atmo ? 0.00002 : 0,
    aeroBroadsideDrag: atmo ? 0.0004 : 0,
    aeroLiftCoeff: atmo ? 0.00012 : 0,
    highAtmoAoA: atmo ? 0.44 : 0,
    lowAtmoAoA: atmo ? 0.13 : 0,
    rcsAngularAccel: 0.5,
    heatCoeff: atmo ? 1e-5 : 0,
    heatDissipation: atmo ? 0.08 : 0,
    transitionAltitude: body.orbitalDefaults.transitionAltitude,
    landingSiteAngle: approach.frame.landingSiteAngle,
    approachLevelIdx: approachIndexById(approachLevelId),
    approachGravity: body.gm / (body.radius * body.radius),
    reentryApproachLevelId: approachLevelId,
    showLandingSite: true,
  };
}

function applyLocalChildBodyClamp(level: OrbitalLevel): OrbitalLevel {
  const transferBody = localTransferBodyForBody(level.bodyId);
  if (transferBody) {
    level.conicRadius = transferBody.patchRadius;
    level.escapeSOIRadius = transferBody.patchRadius;
  }
  return level;
}

function createSurfaceOrbitalLevel(def: Extract<OrbitalPhaseDef, { kind: 'surfaceOrbit' }>): OrbitalLevel {
  const poi = surfacePoiById(def.poiId);
  const body = bodyById(poi.bodyId);
  const r = body.radius + def.orbitAlt;
  const v = Math.sqrt(body.gm / r);
  const level = createOrbitalBase(def.id, poi.bodyId, def.name, def.subtitle, 0, r, -def.orbitSense * v, 0, def.reentryApproachLevelId);
  level.landingSiteAngle = poi.surfaceAngle;
  if (def.fuelDeltaV !== undefined) level.fuelDeltaV = def.fuelDeltaV;
  if (def.thrustAccel !== undefined) level.thrustAccel = def.thrustAccel;
  if (def.thrustAccelMax !== undefined) level.thrustAccelMax = def.thrustAccelMax;
  if (def.showLandingSite !== undefined) level.showLandingSite = def.showLandingSite;
  if (def.escapeToOrbitalLevelId) level.escapeToOrbitalLevelId = def.escapeToOrbitalLevelId;
  if (def.parentTransferPeriapsisAltitude !== undefined) level.parentTransferPeriapsisAltitude = def.parentTransferPeriapsisAltitude;
  if (def.escapeTargetBodyId) level.escapeTargetBodyId = def.escapeTargetBodyId;
  if (def.escapeTargetBodyId) {
    const originBody = bodyById(level.bodyId);
    const targetBody = bodyById(def.escapeTargetBodyId);
    const parentBody = originBody.orbit ? bodyById(originBody.orbit.parentBodyId) : null;
    if (originBody.orbit && targetBody.orbit && parentBody) {
      level.escapeVectorSpeed = hohmannDepartureVInf(originBody.orbit.radius, targetBody.orbit.radius, parentBody.gm);
    }
  }
  return applyLocalChildBodyClamp(level);
}

function createStationOrbitalLevel(def: Extract<OrbitalPhaseDef, { kind: 'stationOrbit' }>): OrbitalLevel {
  const stationPoi = stationPoiById(def.stationPoiId);
  const body = bodyById(stationPoi.bodyId);
  const r = body.radius + def.playerOrbitAlt;
  const v = Math.sqrt(body.gm / r);
  const level = createOrbitalBase(def.id, stationPoi.bodyId, def.name, def.subtitle, 0, r, -def.startSense * v, 0, def.reentryApproachLevelId);
  level.fuelDeltaV = def.fuelDeltaV;
  level.showLandingSite = def.showLandingSite ?? false;
  level.station = {
    id: stationPoi.id,
    orbitRadius: stationPoi.orbit.radius,
    epochAngle: stationPoi.orbit.epochAngle,
    epochTime: stationPoi.orbit.epochTime,
    orbitSense: stationPoi.orbit.orbitSense,
    captureRadius: stationPoi.captureRadius,
    captureMaxSpeed: stationPoi.captureMaxSpeed,
  };
  level.dockingLevelId = def.dockingLevelId;
  if (def.escapeToOrbitalLevelId) level.escapeToOrbitalLevelId = def.escapeToOrbitalLevelId;
  if (def.parentTransferPeriapsisAltitude !== undefined) level.parentTransferPeriapsisAltitude = def.parentTransferPeriapsisAltitude;
  return applyLocalChildBodyClamp(level);
}

function createTransferSeed(levelBodyId: string, seed: OrbitalSeedDef): { x: number; y: number; vx: number; vy: number } {
  if (seed.kind === 'transferBodyOrbit') {
    const body = bodyById(seed.bodyId);
    if (!body.orbit || body.orbit.parentBodyId !== levelBodyId) throw new Error(`Body ${seed.bodyId} is not orbiting ${levelBodyId}`);
    const speed = Math.sqrt(bodyById(levelBodyId).gm / body.orbit.radius);
    return {
      x: body.orbit.radius * Math.cos(body.orbit.epochAngle),
      y: body.orbit.radius * Math.sin(body.orbit.epochAngle),
      vx: -body.orbit.orbitSense * speed * Math.sin(body.orbit.epochAngle),
      vy: body.orbit.orbitSense * speed * Math.cos(body.orbit.epochAngle),
    };
  }

  const poi = surfacePoiById(seed.poiId);
  const body = bodyById(poi.bodyId);
  const r = body.radius + seed.orbitAlt;
  const v = Math.sqrt(body.gm / r);
  return { x: 0, y: r, vx: -seed.orbitSense * v, vy: 0 };
}

function resolvedModeBaseTimeScale(level: OrbitalLevel, modeId: string): number {
  const mode = bodyOrbitModeById(level.bodyId, modeId);
  if (!mode) return level.baseTimeScale;
  if (mode.maxOuterOrbitWallTime && level.systemBodies?.length) {
    const outerOrbit = level.systemBodies.reduce((m, b) => Math.max(m, b.orbitRadius), 0);
    if (outerOrbit > 0) {
      const outerPeriod = Math.PI * 2 * Math.sqrt((outerOrbit ** 3) / level.planetGM);
      return Math.max(1, Math.ceil((outerPeriod / mode.maxOuterOrbitWallTime) / 50) * 50);
    }
  }
  return mode.baseTimeScale ?? level.baseTimeScale;
}

function referenceModeWallThrust(bodyId: string, modeId: string): { low: number; high: number } | null {
  const mode = bodyOrbitModeById(bodyId, modeId);
  if (!mode) return null;
  const low = mode.thrustWallDvPerSec ?? ((mode.thrustAccel !== undefined && mode.baseTimeScale !== undefined) ? mode.thrustAccel * mode.baseTimeScale : undefined);
  const high = mode.thrustWallDvPerSecMax ?? ((mode.thrustAccelMax !== undefined && mode.baseTimeScale !== undefined) ? mode.thrustAccelMax * mode.baseTimeScale : undefined);
  if (low === undefined || high === undefined) return null;
  return { low, high };
}

function applyOrbitMode(level: OrbitalLevel, modeId: string): OrbitalLevel {
  const mode = bodyOrbitModeById(level.bodyId, modeId);
  if (!mode) return level;
  level.orbitModeId = modeId;
  level.baseTimeScale = resolvedModeBaseTimeScale(level, modeId);
  if (mode.thrustAccel !== undefined) level.thrustAccel = mode.thrustAccel;
  if (mode.thrustAccelMax !== undefined) level.thrustAccelMax = mode.thrustAccelMax;
  if (mode.thrustWallDvPerSec !== undefined) level.thrustWallDvPerSec = mode.thrustWallDvPerSec;
  if (mode.thrustWallDvPerSecMax !== undefined) level.thrustWallDvPerSecMax = mode.thrustWallDvPerSecMax;
  if (mode.matchWallThrustToModeId) {
    const wallThrust = referenceModeWallThrust(level.bodyId, mode.matchWallThrustToModeId);
    if (wallThrust) {
      level.thrustWallDvPerSec = wallThrust.low;
      level.thrustWallDvPerSecMax = wallThrust.high;
    }
  }
  return level;
}

function isLowPassMode(level: OrbitalLevel, alt: number): boolean {
  return level.atmoHeight > 0 ? alt < level.atmoHeight : alt < level.transitionAltitude * 2;
}

function modeMatchesAltitude(mode: { minAltitude?: number; maxAltitude?: number }, alt: number): boolean {
  if (mode.minAltitude !== undefined && alt < mode.minAltitude) return false;
  if (mode.maxAltitude !== undefined && alt >= mode.maxAltitude) return false;
  return true;
}

function resolvedOrbitModeForAltitude(level: OrbitalLevel, alt: number) {
  const activeModeId = level.orbitModeId;
  if (!activeModeId) return null;
  const bodyModes = bodyById(level.bodyId).orbitModes ?? [];
  const maxIdx = bodyModes.findIndex(m => m.id === activeModeId);
  if (maxIdx < 0) return bodyOrbitModeById(level.bodyId, activeModeId);

  let resolved = bodyModes[Math.min(maxIdx, bodyModes.length - 1)] ?? null;
  for (let i = 0; i <= maxIdx; i++) {
    const mode = bodyModes[i];
    if (modeMatchesAltitude(mode, alt)) resolved = mode;
  }
  return resolved;
}

function currentPacingProfile(level: OrbitalLevel, alt: number, lockedOrbitModeId?: string) {
  const lowPass = isLowPassMode(level, alt);
  const orbitMode = lowPass
    ? null
    : ((lockedOrbitModeId && lockedOrbitModeId !== 'atmo')
      ? (bodyOrbitModeById(level.bodyId, lockedOrbitModeId) ?? resolvedOrbitModeForAltitude(level, alt))
      : resolvedOrbitModeForAltitude(level, alt));
  return {
    lowPass,
    orbitModeId: lowPass ? 'atmo' : (orbitMode?.id ?? level.orbitModeId ?? 'default'),
    baseTimeScale: lowPass ? ATMO_TIME_SCALE : (orbitMode ? resolvedModeBaseTimeScale(level, orbitMode.id) : level.baseTimeScale),
    thrustAccel: orbitMode?.thrustAccel ?? level.thrustAccel,
    thrustAccelMax: orbitMode?.thrustAccelMax ?? level.thrustAccelMax,
    thrustWallDvPerSec: !lowPass && orbitMode?.id === level.orbitModeId ? level.thrustWallDvPerSec : undefined,
    thrustWallDvPerSecMax: !lowPass && orbitMode?.id === level.orbitModeId ? level.thrustWallDvPerSecMax : undefined,
  };
}

function createSystemTransferLevel(def: Extract<OrbitalPhaseDef, { kind: 'systemTransfer' }>): OrbitalLevel {
  const seed = createTransferSeed(def.bodyId, def.seed);
  const level = createOrbitalBase(def.id, def.bodyId, def.name, def.subtitle, seed.x, seed.y, seed.vx, seed.vy, def.reentryApproachLevelId);
  level.fuelDeltaV = def.fuelDeltaV;
  level.showLandingSite = def.showLandingSite ?? false;
  level.systemBodies = def.systemBodies.map(bodyDef => transferBodyFromDef(def.bodyId, bodyDef));
  level.targetBodyId = def.targetBodyId;
  const conicBody = level.systemBodies.find(body => body.id === def.conicRadiusBodyId);
  if (conicBody) level.conicRadius = conicBody.orbitRadius * def.conicRadiusScale;
  return def.orbitModeId ? applyOrbitMode(level, def.orbitModeId) : level;
}

function createBodyArrivalLevel(def: Extract<OrbitalPhaseDef, { kind: 'bodyArrival' }>): OrbitalLevel {
  const body = bodyById(def.bodyId);
  const level = createOrbitalBase(def.id, def.bodyId, def.name, def.subtitle, 0, body.radius + def.startAltitude, 0, 0, def.reentryApproachLevelId);
  const r = level.startY;
  const vEsc = Math.sqrt(2 * level.planetGM / r);
  level.startVX = vEsc + def.startExcessSpeed;
  level.startVY = def.startRadialVelocity;
  level.thrustAccel = 0.06;
  level.thrustAccelMax = 1.2;
  level.fuelDeltaV = def.fuelDeltaV;
  level.showLandingSite = def.showLandingSite ?? true;
  if (def.escapeToOrbitalLevelId) level.escapeToOrbitalLevelId = def.escapeToOrbitalLevelId;
  return applyLocalChildBodyClamp(level);
}

function createOrbitalLevel(def: OrbitalPhaseDef): OrbitalLevel {
  const level = def.kind === 'surfaceOrbit'
    ? createSurfaceOrbitalLevel(def)
    : def.kind === 'stationOrbit'
      ? createStationOrbitalLevel(def)
      : def.kind === 'systemTransfer'
        ? createSystemTransferLevel(def)
        : createBodyArrivalLevel(def);
  return ('orbitModeId' in def && def.orbitModeId) ? applyOrbitMode(level, def.orbitModeId) : level;
}

export const ORBITAL_LEVELS: OrbitalLevel[] = ORBITAL_PHASES.map(createOrbitalLevel);

export function orbitalLevelById(id: number): OrbitalLevel | undefined {
  return ORBITAL_LEVELS.find(l => l.id === id);
}

// ===================== State =====================

export function createOrbitalState(level: OrbitalLevel, override?: OrbitalInitOverride): OrbitalState {
  _predDirty = true;
  _cachedPred = null;
  _predLastStateTime = -1;
  _wasRendezvousZoom = false;
  _maneuverCache = null;
  const initTime = override?.time ?? 0;
  const x = override?.x ?? level.startX;
  const y = override?.y ?? level.startY;
  const alt = Math.sqrt(x * x + y * y) - level.planetRadius;
  return {
    x,
    y,
    vx: override?.vx ?? level.startVX,
    vy: override?.vy ?? level.startVY,
    fuel: 0,
    dvUsed: 0,
    alive: true,
    enteredAtmo: false,
    temperature: 0,
    trail: [],
    trailIdx: 0,
    time: initTime,
    realTime: 0,
    timeWarp: 1,
    timeWarpLevel: 0,
    thrustPro: false, thrustRetro: false, thrustLeft: false, thrustRight: false,
    thrusting: 'none',
    highThrust: false,
    inAtmo: false,
    angle: 0,
    renderAngle: Math.atan2(override?.vy ?? level.startVY, override?.vx ?? level.startVX),
    targetAoA: 0,
    docked: false,
    inRendezvousZoom: false,
    pacingModeId: currentPacingProfile(level, alt).orbitModeId,
  };
}

/** Convert orbital state at transition into approach-phase initial conditions.
 *  Approach coords: gate/LZ at x=0, ship starts at negative x, flies right. */
function orbitSense(x: number, y: number, vx: number, vy: number): 1 | -1 {
  return x * vy - y * vx < 0 ? -1 : 1; // -1 = CW, +1 = CCW
}

function aoaDisplayToPhysical(
  aoaDisplay: number,
  x: number, y: number, vx: number, vy: number,
): number {
  return -orbitSense(x, y, vx, vy) * aoaDisplay;
}

export function orbitalToApproachParams(
  os: OrbitalState, level: OrbitalLevel,
): ApproachInitOverride {
  const r = Math.sqrt(os.x * os.x + os.y * os.y);
  const alt = r - level.planetRadius;

  const radX = os.x / r;
  const radY = os.y / r;

  // Fixed approach frame: +X is clockwise along the surface.
  const localDir: 1 | -1 = -1;
  const tanX = -radY * localDir;
  const tanY = radX * localDir;

  const vRadial = os.vx * radX + os.vy * radY;
  const vTangential = os.vx * tanX + os.vy * tanY;

  let angleDiff = Math.atan2(os.y, os.x) - level.landingSiteAngle;
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
  const approachX = angleDiff * level.planetRadius * localDir;

  const velDirApproach = Math.atan2(vTangential, vRadial);
  const noseUpSign = vTangential < 0 ? -1 : 1;
  const shipAngle = velDirApproach - noseUpSign * level.lowAtmoAoA;

  return {
    x: approachX,
    y: alt,
    vx: vTangential,
    vy: vRadial,
    angle: shipAngle,
    wx: os.x,
    wy: os.y,
    wvx: os.vx,
    wvy: os.vy,
    localDir,
  };
}

// ===================== Orbital Mechanics =====================

interface OrbitalElements {
  a: number;
  e: number;
  omega: number;
  h: number;
  energy: number;
  periapsis: number;
  apoapsis: number;
  trueAnomaly: number;
}

export function computeElements(x: number, y: number, vx: number, vy: number, gm: number): OrbitalElements {
  const r = Math.sqrt(x * x + y * y);
  const v2 = vx * vx + vy * vy;
  const energy = v2 / 2 - gm / r;
  const a = -gm / (2 * energy);
  const h = x * vy - y * vx;
  const ex = (vy * h) / gm - x / r;
  const ey = (-vx * h) / gm - y / r;
  const e = Math.sqrt(ex * ex + ey * ey);
  const omega = Math.atan2(ey, ex);
  const periapsis = a * (1 - e);
  const apoapsis = e < 1 ? a * (1 + e) : Infinity;
  const theta = Math.atan2(y, x);
  let trueAnomaly = theta - omega;
  while (trueAnomaly > Math.PI) trueAnomaly -= 2 * Math.PI;
  while (trueAnomaly < -Math.PI) trueAnomaly += 2 * Math.PI;
  return { a, e, omega, h, energy, periapsis, apoapsis, trueAnomaly };
}

function orbitPosition(elem: OrbitalElements, nu: number): { x: number; y: number } {
  const p = elem.a * (1 - elem.e * elem.e);
  const r = p / (1 + elem.e * Math.cos(nu));
  if (r < 0) return { x: 0, y: 0 };
  const angle = nu + elem.omega;
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

export function outgoingEscapeAngle(elem: OrbitalElements): number | null {
  if (!(elem.e > 1) || !Number.isFinite(elem.e)) return null;
  const nuInf = Math.acos(-1 / elem.e);
  return elem.omega + (elem.h >= 0 ? nuInf : -nuInf);
}

export function escapeSpeedAtInfinity(elem: OrbitalElements): number | null {
  if (!(elem.energy > 0)) return null;
  return Math.sqrt(2 * elem.energy);
}

function stumpffC(z: number): number {
  if (z > 1e-8) {
    const sz = Math.sqrt(z);
    return (1 - Math.cos(sz)) / z;
  }
  if (z < -1e-8) {
    const sz = Math.sqrt(-z);
    return (1 - Math.cosh(sz)) / z;
  }
  return 0.5 - z / 24 + (z * z) / 720;
}

function stumpffS(z: number): number {
  if (z > 1e-8) {
    const sz = Math.sqrt(z);
    return (sz - Math.sin(sz)) / (sz * sz * sz);
  }
  if (z < -1e-8) {
    const sz = Math.sqrt(-z);
    return (Math.sinh(sz) - sz) / (sz * sz * sz);
  }
  return (1 / 6) - z / 120 + (z * z) / 5040;
}

function propagateTwoBodyState(
  x: number, y: number, vx: number, vy: number,
  gm: number, dt: number,
): { x: number; y: number; vx: number; vy: number } {
  if (dt === 0) return { x, y, vx, vy };

  const r0 = Math.sqrt(x * x + y * y);
  const v2 = vx * vx + vy * vy;
  const rv0 = (x * vx + y * vy) / Math.max(r0, 1e-9);
  const sqrtMu = Math.sqrt(gm);
  const alpha = 2 / r0 - v2 / gm;

  let chi = Math.abs(alpha) > 1e-6
    ? sqrtMu * Math.abs(alpha) * dt
    : sqrtMu * dt / Math.max(r0, 1);

  for (let i = 0; i < 12; i++) {
    const z = alpha * chi * chi;
    const C = stumpffC(z);
    const S = stumpffS(z);
    const F = (r0 * rv0 / sqrtMu) * chi * chi * C
      + (1 - alpha * r0) * chi * chi * chi * S
      + r0 * chi
      - sqrtMu * dt;
    const dF = (r0 * rv0 / sqrtMu) * chi * (1 - z * S)
      + (1 - alpha * r0) * chi * chi * C
      + r0;
    const dChi = F / Math.max(Math.abs(dF), 1e-9);
    chi -= dChi;
    if (Math.abs(dChi) < 1e-7) break;
  }

  const z = alpha * chi * chi;
  const C = stumpffC(z);
  const S = stumpffS(z);
  const f = 1 - (chi * chi / r0) * C;
  const g = dt - (chi * chi * chi / sqrtMu) * S;
  const nx = f * x + g * vx;
  const ny = f * y + g * vy;
  const r = Math.sqrt(nx * nx + ny * ny);
  const fdot = (sqrtMu / (Math.max(r, 1e-9) * r0)) * (alpha * chi * chi * chi * S - chi);
  const gdot = 1 - (chi * chi / Math.max(r, 1e-9)) * C;
  return {
    x: nx,
    y: ny,
    vx: fdot * x + gdot * vx,
    vy: fdot * y + gdot * vy,
  };
}

// ===================== Atmosphere =====================

/** Get station position at a given physics time. */
function senseLabel(sense: 1 | -1): 'CW' | 'CCW' {
  return sense < 0 ? 'CW' : 'CCW';
}

function stationOrbitSense(level: OrbitalLevel): 1 | -1 {
  return level.station?.orbitSense ?? orbitSense(level.startX, level.startY, level.startVX, level.startVY);
}

function stationPos(level: OrbitalLevel, time: number): { x: number; y: number; vx: number; vy: number } | null {
  if (!level.station) return null;
  const st = level.station;
  const sense = st.orbitSense;
  const omega = sense * Math.sqrt(level.planetGM / (st.orbitRadius * st.orbitRadius * st.orbitRadius));
  const angle = st.epochAngle + omega * (time - st.epochTime);
  const x = st.orbitRadius * Math.cos(angle);
  const y = st.orbitRadius * Math.sin(angle);
  const v = Math.sqrt(level.planetGM / st.orbitRadius);
  const vx = -sense * v * Math.sin(angle);
  const vy = sense * v * Math.cos(angle);
  return { x, y, vx, vy };
}

function atmoDensity(alt: number, level: OrbitalLevel): number {
  if (alt <= 0) return level.surfaceDensity;
  if (alt >= level.atmoHeight) return 0;
  return level.surfaceDensity * Math.exp(-alt / level.scaleHeight);
}

/** Compute aero forces (drag + lift) and heat rate, AoA-dependent.
 *  aoa: angle of attack in radians (positive = nose above velocity). */
function aeroForces(
  x: number, y: number, vx: number, vy: number,
  aoa: number, level: OrbitalLevel,
): { ax: number; ay: number; heatRate: number; aoa: number } {
  const r = Math.sqrt(x * x + y * y);
  const alt = r - level.planetRadius;
  const rho = atmoDensity(alt, level);
  if (rho < 1e-10) return { ax: 0, ay: 0, heatRate: 0, aoa: 0 };

  const speed = Math.sqrt(vx * vx + vy * vy);
  if (speed < 0.1) return { ax: 0, ay: 0, heatRate: 0, aoa: 0 };

  const velAngle = Math.atan2(vy, vx);
  // Normalize AoA to [-π, π]
  let normAoA = aoa;
  while (normAoA > Math.PI) normAoA -= 2 * Math.PI;
  while (normAoA < -Math.PI) normAoA += 2 * Math.PI;
  const useAngle = velAngle + normAoA;

  const sinA = Math.sin(normAoA);
  const cosA = Math.cos(normAoA);

  // Drag: AoA-dependent cross section
  const Cd = level.aeroNoseDrag * cosA * cosA + level.aeroBroadsideDrag * sinA * sinA;
  const q = 0.5 * rho * speed * speed;
  const dragAccel = q * Cd;

  let ax = -(vx / speed) * dragAccel;
  let ay = -(vy / speed) * dragAccel;

  // Lift: perpendicular to velocity, proportional to sin(AoA)*cos(AoA)
  const Cl = level.aeroLiftCoeff;
  if (Cl > 1e-7) {
    const aoaEff = Math.abs(sinA * cosA);
    const liftAccel = q * Cl * aoaEff;
    // Lift direction: component of nose perpendicular to velocity
    const noseX = Math.cos(useAngle);
    const noseY = Math.sin(useAngle);
    const vdx = vx / speed, vdy = vy / speed;
    const dot = noseX * vdx + noseY * vdy;
    let px = noseX - dot * vdx;
    let py = noseY - dot * vdy;
    const pl = Math.sqrt(px * px + py * py);
    if (pl > 0.001) {
      px /= pl; py /= pl;
      ax += px * liftAccel;
      ay += py * liftAccel;
    }
  }

  const heatRate = dragAccel * speed * level.heatCoeff;
  return { ax, ay, heatRate, aoa: normAoA };
}

// ===================== Physics Update =====================

export function updateOrbital(
  s: OrbitalState, input: InputState, level: OrbitalLevel, dt: number,
): void {
  if (!s.alive || s.enteredAtmo || s.docked) return;

  // Track wall-clock time (for trail)
  s.realTime += dt;
  s.pendingBodyCapture = undefined;

  // --- Time warp controls ---
  if (input.warpUp) {
    s.timeWarpLevel = Math.min(s.timeWarpLevel + 1, WARP_SPEEDS.length - 1);
    s.timeWarp = WARP_SPEEDS[s.timeWarpLevel];
  }
  if (input.warpDown) {
    s.timeWarpLevel = Math.max(s.timeWarpLevel - 1, 0);
    s.timeWarp = WARP_SPEEDS[s.timeWarpLevel];
  }

  // Thrust cancels time warp
  const boostHeld = input.throttleUp || input.throttleDown || input.pitch !== 0;
  if (boostHeld && s.timeWarpLevel > 0) {
    s.timeWarpLevel = 0;
    s.timeWarp = 1;
  }

  // Detect low-pass entry/exit for snap-rotate
  const wasInAtmo = s.inAtmo;

  const r0 = Math.sqrt(s.x * s.x + s.y * s.y);
  const alt0 = r0 - level.planetRadius;
  const pacing = currentPacingProfile(level, alt0, boostHeld ? s.pacingModeId : undefined);
  const inLowAtmo = alt0 < level.transitionAltitude;
  const atmoWarpCap = inLowAtmo ? ATMO_LOW_WARP_CAP : ATMO_WARP_CAP;
  const effectiveWarp = pacing.lowPass
    ? Math.min(s.timeWarp, atmoWarpCap)
    : s.timeWarp;

  const effectiveBaseScale = pacing.baseTimeScale;
  const totalScale = effectiveBaseScale * effectiveWarp;
  const effectiveDt = dt * totalScale;

  // Substeps
  // High-transfer pacing used to jump from fine local integration to ~20s physics steps,
  // which visibly changed the orbit right at the low->high regime boundary.
  const stepLimit = (!s.inAtmo && level.systemBodies && effectiveBaseScale > 200)
    ? SYSTEM_TRANSFER_SUBSTEP
    : PHYSICS_SUBSTEP;
  const substeps = Math.max(1, Math.ceil(effectiveDt / stepLimit));
  const subDt = effectiveDt / substeps;

  s.thrusting = 'none';
  s.thrustPro = false; s.thrustRetro = false; s.thrustLeft = false; s.thrustRight = false;

  // Toggle high thrust with Space
  s.highThrust = input.toggleHighThrust; // hold Shift for high thrust

  const baseThrust = s.highThrust ? pacing.thrustAccelMax : pacing.thrustAccel;
  const wallThrust = s.highThrust ? pacing.thrustWallDvPerSecMax : pacing.thrustWallDvPerSec;
  const effThrust = wallThrust !== undefined
    ? (wallThrust / pacing.baseTimeScale)
    : (pacing.lowPass ? baseThrust * ATMO_THRUST_MULT : baseThrust);
  let visualThrustX = 0;
  let visualThrustY = 0;

  // --- Ship orientation (applied after substep loop updates s.inAtmo) ---
  // Deferred to after substep loop — see below

  for (let step = 0; step < substeps; step++) {
    const prevTime = s.time;
    const prevX = s.x;
    const prevY = s.y;
    const prevVX = s.vx;
    const prevVY = s.vy;
    const r = Math.sqrt(s.x * s.x + s.y * s.y);
    const alt = r - level.planetRadius;

    if (r < level.planetRadius) { s.alive = false; return; }

    // Low-pass mode: real atmosphere for atmospheric bodies, low-altitude handling for airless ones.
    s.inAtmo = isLowPassMode(level, alt);
    const vacuumCoast = !boostHeld && !s.inAtmo && atmoDensity(alt, level) < 1e-10;

    if (vacuumCoast) {
      s.temperature += (-level.heatDissipation * s.temperature) * subDt;
      if (s.temperature < 0) s.temperature = 0;
      const next = propagateTwoBodyState(s.x, s.y, s.vx, s.vy, level.planetGM, subDt);
      s.x = next.x;
      s.y = next.y;
      s.vx = next.vx;
      s.vy = next.vy;
      s.time += subDt;
    } else {
      // Gravity
      const gAccel = level.planetGM / (r * r);
      let ax = -gAccel * (s.x / r);
      let ay = -gAccel * (s.y / r);

      // Aero forces (AoA-dependent drag + lift)
      const displayAoA = s.inAtmo ? s.targetAoA : level.highAtmoAoA;
      const aero = aeroForces(s.x, s.y, s.vx, s.vy, aoaDisplayToPhysical(displayAoA, s.x, s.y, s.vx, s.vy), level);
      ax += aero.ax;
      ay += aero.ay;

      // Heat
      s.temperature += (aero.heatRate - level.heatDissipation * s.temperature) * subDt;
      if (s.temperature < 0) s.temperature = 0;
      if (s.temperature > 1.5) s.temperature = 1.5;

      // Thrust
      {
        const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        if (speed > 0.01) {
          let thrustX = 0, thrustY = 0;

          if (s.inRendezvousZoom) {
            // Rendezvous zoom: WASD = screen coordinates
            // W = +Y world (screen up), S = -Y, A = -X (screen left), D = +X
            if (input.throttleUp)    { thrustY += effThrust; }
            if (input.throttleDown)  { thrustY -= effThrust; }
            if (input.pitch < 0)     { thrustX -= effThrust; } // A = left
            if (input.pitch > 0)     { thrustX += effThrust; } // D = right
            // Decompose into ship's 4 thrusters (prograde/retro/left/right)
            if (thrustX !== 0 || thrustY !== 0) {
              const pdx = s.vx / speed, pdy = s.vy / speed;
              const leftX = -pdy, leftY = pdx;
              const prog = thrustX * pdx + thrustY * pdy;
              const lat = thrustX * leftX + thrustY * leftY;
              if (prog > 0.01) s.thrustPro = true;
              if (prog < -0.01) s.thrustRetro = true;
              if (lat > 0.01) s.thrustLeft = true;
              if (lat < -0.01) s.thrustRight = true;
              s.thrusting = 'prograde'; // mark as thrusting for prediction dirty
            }
          } else if (s.inAtmo) {
            const noseX = Math.cos(s.angle);
            const noseY = Math.sin(s.angle);
            if (input.throttleUp) {
              thrustX += noseX * effThrust;
              thrustY += noseY * effThrust;
              s.thrusting = 'prograde'; s.thrustPro = true;
            }
            if (input.throttleDown) {
              thrustX -= noseX * effThrust;
              thrustY -= noseY * effThrust;
              s.thrusting = 'retrograde'; s.thrustRetro = true;
            }
          } else {
            const pdx = s.vx / speed;
            const pdy = s.vy / speed;
            const leftX = -pdy;
            const leftY = pdx;
            if (input.throttleUp) {
              thrustX += pdx * effThrust;
              thrustY += pdy * effThrust;
              s.thrusting = 'prograde'; s.thrustPro = true;
            }
            if (input.throttleDown) {
              thrustX -= pdx * effThrust;
              thrustY -= pdy * effThrust;
              s.thrusting = 'retrograde'; s.thrustRetro = true;
            }
            if (input.pitch < 0) {
              thrustX += leftX * effThrust;
              thrustY += leftY * effThrust;
              s.thrusting = 'left'; s.thrustLeft = true;
            }
            if (input.pitch > 0) {
              thrustX -= leftX * effThrust;
              thrustY -= leftY * effThrust;
              s.thrusting = 'right'; s.thrustRight = true;
            }
          }

          let thrustMag = Math.sqrt(thrustX * thrustX + thrustY * thrustY);
          if (thrustMag > effThrust && thrustMag > THRUST_EPS) {
            const scale = effThrust / thrustMag;
            thrustX *= scale;
            thrustY *= scale;
            thrustMag = effThrust;
          }
          if (thrustMag > THRUST_EPS) {
            const dvUsed = thrustMag * subDt;
            ax += thrustX;
            ay += thrustY;
            visualThrustX = thrustX;
            visualThrustY = thrustY;
            s.dvUsed += dvUsed;
          }
        }
      }

      // Symplectic Euler
      s.vx += ax * subDt;
      s.vy += ay * subDt;
      s.x += s.vx * subDt;
      s.y += s.vy * subDt;
      s.time += subDt;
    }

    if (!s.pendingBodyCapture && level.targetBodyId) {
      const targetBody = getTransferBody(level, level.targetBodyId);
      const prevBody = targetBody ? transferBodyState(level, targetBody.id, prevTime) : null;
      const nextBody = targetBody ? transferBodyState(level, targetBody.id, s.time) : null;
      if (targetBody && prevBody && nextBody) {
        const prevRX = prevX - prevBody.x;
        const prevRY = prevY - prevBody.y;
        const prevDist = Math.sqrt(prevRX * prevRX + prevRY * prevRY);
        const nextRX = s.x - nextBody.x;
        const nextRY = s.y - nextBody.y;
        const nextDist = Math.sqrt(nextRX * nextRX + nextRY * nextRY);
        if (prevDist > targetBody.patchRadius && nextDist <= targetBody.patchRadius) {
          const denom = nextDist - prevDist;
          const frac = Math.max(0, Math.min(1, (targetBody.patchRadius - prevDist) / (Math.abs(denom) > 1e-6 ? denom : -1e-6)));
          const crossTime = prevTime + (s.time - prevTime) * frac;
          const shipX = prevX + (s.x - prevX) * frac;
          const shipY = prevY + (s.y - prevY) * frac;
          const shipVX = prevVX + (s.vx - prevVX) * frac;
          const shipVY = prevVY + (s.vy - prevVY) * frac;
          const bodyCross = transferBodyState(level, targetBody.id, crossTime);
          if (bodyCross) {
            s.pendingBodyCapture = {
              bodyId: targetBody.id,
              time: crossTime,
              rx: shipX - bodyCross.x,
              ry: shipY - bodyCross.y,
              rvx: shipVX - bodyCross.vx,
              rvy: shipVY - bodyCross.vy,
            };
          }
        }
      }
    }

    // Invalidate prediction when orbit changes
    if (s.thrusting !== 'none') _predDirty = true;

    // Transition: below transition altitude while in atmosphere
    const newR = Math.sqrt(s.x * s.x + s.y * s.y);
    const newAlt = newR - level.planetRadius;
    if (newAlt <= level.transitionAltitude) {
      s.enteredAtmo = true;
      return;
    }

    if (newR <= level.planetRadius) { s.alive = false; return; }

    // Docking check
    if (level.station && !s.docked) {
      const sp = stationPos(level, s.time)!;
      const dx = s.x - sp.x, dy = s.y - sp.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < level.station.captureRadius) {
        const rvx = s.vx - sp.vx, rvy = s.vy - sp.vy;
        const relSpd = Math.sqrt(rvx * rvx + rvy * rvy);
        if (relSpd < level.station.captureMaxSpeed) {
          s.docked = true;
          return;
        }
      }
    }
  }

  // --- Ship orientation (after substep loop so s.inAtmo is current) ---
  // Snap-rotate on atmo entry
  if (s.inAtmo && !wasInAtmo) {
    s.targetAoA = level.highAtmoAoA;
    s.timeWarpLevel = 0;
    s.timeWarp = 1;
    _predDirty = true;
  }
  // Snap-rotate on atmo exit
  if (!s.inAtmo && wasInAtmo) {
    s.targetAoA = 0;
    _predDirty = true;
  }

  if (!boostHeld) {
    const settledAlt = Math.sqrt(s.x * s.x + s.y * s.y) - level.planetRadius;
    s.pacingModeId = currentPacingProfile(level, settledAlt).orbitModeId;
  }

  if (s.inAtmo) {
    // A/D is always yaw left/right on screen: A = CCW, D = CW.
    // Convert that into the player-facing AoA convention (positive = nose above horizon)
    // based on current orbit direction.
    if (input.pitch !== 0) {
      const sense = orbitSense(s.x, s.y, s.vx, s.vy);
      s.targetAoA += input.pitch * sense * level.rcsAngularAccel * dt;
      if (s.targetAoA > Math.PI * 0.9) s.targetAoA = Math.PI * 0.9;
      if (s.targetAoA < -Math.PI * 0.9) s.targetAoA = -Math.PI * 0.9;
      _predDirty = true;
    }
    // Ship angle tracks velocity; positive displayed AoA always means "nose above horizon"
    const velAngle = Math.atan2(s.vy, s.vx);
    s.angle = velAngle + aoaDisplayToPhysical(s.targetAoA, s.x, s.y, s.vx, s.vy);
    s.renderAngle = s.angle;
  } else {
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (speed > 0.1) s.angle = Math.atan2(s.vy, s.vx);
    s.targetAoA = 0;

    let targetRenderAngle = s.renderAngle;
    if (Math.hypot(visualThrustX, visualThrustY) > THRUST_EPS) {
      targetRenderAngle = Math.atan2(visualThrustY, visualThrustX);
    } else if (speed > 0.1) {
      targetRenderAngle = Math.atan2(s.vy, s.vx);
    }
    const maxRenderDelta = (Math.PI * 0.5 / 0.1) * dt;
    s.renderAngle = moveAngleToward(s.renderAngle, targetRenderAngle, maxRenderDelta);
  }

  // Trail update (wall-clock time)
  const trailEntry = { x: s.x, y: s.y, t: s.realTime };
  if (s.trail.length < TRAIL_MAX) {
    s.trail.push(trailEntry);
  } else {
    s.trail[s.trailIdx] = trailEntry;
    s.trailIdx = (s.trailIdx + 1) % TRAIL_MAX;
  }

  // Maneuver suggestion (only when idle)
  updateManeuverSuggestion(s, level);
}

// ===================== Orbit Prediction (Numerical) =====================

interface PredPoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alt: number;
  t: number;        // physics time at this point
  inAtmo: boolean;
  belowCritical: boolean;
  heatRate: number;
}

interface PredEvent {
  x: number; y: number;
  vx: number; vy: number;
  alt: number;
  idx: number;
}

interface ClosestApproach {
  dist: number;
  relSpeed: number;
  progradeRel: number;   // positive = ship moving ahead of station
  radialRel: number;     // positive = ship moving outward from planet
  shipX: number; shipY: number;
  stationX: number; stationY: number;
  idx: number;
}

interface TargetBodyApproach {
  bodyId: string;
  dist: number;
  relSpeed: number;
  shipX: number; shipY: number;
  bodyX: number; bodyY: number;
  relX: number; relY: number;
  relVX: number; relVY: number;
  idx: number;
  withinArrival: boolean;
  flybyAltitude?: number;
  impactsBody?: boolean;
}

interface PredictionResult {
  points: PredPoint[];
  atmoEntry: PredEvent | null;
  atmoExit: PredEvent | null;
  approachStart: PredEvent | null;
  impact: PredEvent | null;
  closestApproach: ClosestApproach | null;
  targetBodyApproach: TargetBodyApproach | null;
}

export function normalizeArrivalState(
  body: OrbitalTransferBody,
  rx: number, ry: number, rvx: number, rvy: number,
): { x: number; y: number; vx: number; vy: number; dist: number; speed: number } {
  const dist = Math.sqrt(rx * rx + ry * ry);
  const speed = Math.sqrt(rvx * rvx + rvy * rvy);
  const minR = body.radius + (body.arrivalAltitudeMin ?? 0);
  const maxR = body.radius + (body.arrivalAltitudeMax ?? 0);
  const targetR = Math.max(minR, Math.min(maxR, dist));
  const vEsc = Math.sqrt(2 * body.gm / targetR);
  const minSpeed = Math.max(vEsc * 1.002, vEsc + (body.arrivalSpeedMarginMin ?? 2));
  const maxSpeed = Math.max(minSpeed + 1, vEsc + (body.arrivalSpeedMarginMax ?? 100));
  const rHatX = rx / Math.max(dist, 1);
  const rHatY = ry / Math.max(dist, 1);
  const radialSpeed = rvx * rHatX + rvy * rHatY;
  const tanX = -rHatY;
  const tanY = rHatX;
  const tangentialSpeed = rvx * tanX + rvy * tanY;
  const speedMag = Math.max(speed, 1);
  const dirRad = radialSpeed / speedMag;
  const dirTan = tangentialSpeed / speedMag;
  const targetSpeed = Math.max(minSpeed, Math.min(maxSpeed, speed));
  const targetVR = dirRad * targetSpeed;
  const targetVT = dirTan * targetSpeed;
  return {
    x: rHatX * targetR,
    y: rHatY * targetR,
    vx: rHatX * targetVR + tanX * targetVT,
    vy: rHatY * targetVR + tanY * targetVT,
    dist: targetR,
    speed: targetSpeed,
  };
}

function simulateTargetBodyEncounter(
  body: OrbitalTransferBody,
  local: { x: number; y: number; vx: number; vy: number },
): { x: number; y: number; vx: number; vy: number; dist: number; relSpeed: number; dt: number; impactsBody: boolean } {
  let x = local.x;
  let y = local.y;
  let vx = local.vx;
  let vy = local.vy;
  let bestX = x;
  let bestY = y;
  let bestVX = vx;
  let bestVY = vy;
  let bestDist = Math.sqrt(x * x + y * y);
  let bestDt = 0;
  const baseR = Math.max(bestDist, body.radius + 1);
  const refPeriod = Math.PI * 2 * Math.sqrt((baseR ** 3) / body.gm);
  const maxTime = Math.min(Math.max(refPeriod * 2, 6_000), 30_000);
  const stepSize = Math.min(2, Math.max(0.25, refPeriod / 6_000));
  const subDt = stepSize / 4;
  let prevDist = bestDist;

  for (let t = 0; t < maxTime; t += stepSize) {
    for (let i = 0; i < 4; i++) {
      const r = Math.sqrt(x * x + y * y);
      if (r <= body.radius) {
        return { x, y, vx, vy, dist: body.radius, relSpeed: Math.sqrt(vx * vx + vy * vy), dt: t, impactsBody: true };
      }
      const g = body.gm / (r * r);
      vx += -(x / r) * g * subDt;
      vy += -(y / r) * g * subDt;
      x += vx * subDt;
      y += vy * subDt;
    }

    const r = Math.sqrt(x * x + y * y);
    if (r < bestDist) {
      bestDist = r;
      bestX = x;
      bestY = y;
      bestVX = vx;
      bestVY = vy;
      bestDt = t + stepSize;
    }
    if (r <= body.radius) {
      return { x, y, vx, vy, dist: body.radius, relSpeed: Math.sqrt(vx * vx + vy * vy), dt: t + stepSize, impactsBody: true };
    }
    const radialSpeed = (x * vx + y * vy) / Math.max(r, 1);
    if (t > 0 && prevDist < body.patchRadius && r >= body.patchRadius && radialSpeed > 0) {
      break;
    }
    prevDist = r;
  }

  return {
    x: bestX,
    y: bestY,
    vx: bestVX,
    vy: bestVY,
    dist: bestDist,
    relSpeed: Math.sqrt(bestVX * bestVX + bestVY * bestVY),
    dt: bestDt,
    impactsBody: bestDist <= body.radius,
  };
}

function analyzePrediction(points: PredPoint[], level: OrbitalLevel): PredictionResult {
  let atmoEntry: PredEvent | null = null;
  let atmoExit: PredEvent | null = null;
  let approachStart: PredEvent | null = null;
  let impact: PredEvent | null = null;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const pt = points[i];

    // Atmo entry: transition from outside to inside
    if (!atmoEntry && !prev.inAtmo && pt.inAtmo) {
      atmoEntry = { x: pt.x, y: pt.y, vx: pt.vx, vy: pt.vy, alt: pt.alt, idx: i };
    }

    // Atmo exit: transition from inside to outside (after entry)
    if (atmoEntry && !atmoExit && prev.inAtmo && !pt.inAtmo) {
      atmoExit = { x: pt.x, y: pt.y, vx: pt.vx, vy: pt.vy, alt: pt.alt, idx: i };
    }

    // Approach start: first point below critical altitude
    if (!approachStart && pt.belowCritical) {
      approachStart = { x: pt.x, y: pt.y, vx: pt.vx, vy: pt.vy, alt: pt.alt, idx: i };
    }

    // Impact: altitude <= 0
    if (!impact && pt.alt <= 0) {
      impact = { x: pt.x, y: pt.y, vx: pt.vx, vy: pt.vy, alt: 0, idx: i };
      break;
    }
  }

  // Closest approach to station
  // If any points are within capture radius, pick the one with lowest relative speed.
  // Otherwise, pick the point with minimum distance.
  let closestApproach: ClosestApproach | null = null;
  if (level.station) {
    let bestDist = Infinity;
    let bestRelSpeed = Infinity;
    let hasWithinCapture = false;
    const st = level.station;
    const sense = stationOrbitSense(level);
    const omega = sense * Math.sqrt(level.planetGM / (st.orbitRadius ** 3));
    const stV = Math.sqrt(level.planetGM / st.orbitRadius);
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const stAngle = st.epochAngle + omega * (pt.t - st.epochTime);
      const stX = st.orbitRadius * Math.cos(stAngle);
      const stY = st.orbitRadius * Math.sin(stAngle);
      const dx = pt.x - stX, dy = pt.y - stY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const stVx = -sense * stV * Math.sin(stAngle);
      const stVy = sense * stV * Math.cos(stAngle);
      const relVx = pt.vx - stVx, relVy = pt.vy - stVy;
      const relSpeed = Math.sqrt(relVx * relVx + relVy * relVy);

      const withinCapture = dist < st.captureRadius;
      let dominated = false;
      if (withinCapture) {
        // Within capture: pick lowest relative speed
        if (!hasWithinCapture || relSpeed < bestRelSpeed) {
          bestRelSpeed = relSpeed;
          hasWithinCapture = true;
        } else dominated = true;
      } else if (!hasWithinCapture) {
        // Outside capture, no capture points yet: pick closest distance
        if (dist < bestDist) {
          bestDist = dist;
        } else dominated = true;
      } else dominated = true;

      if (!dominated) {
        // Decompose relative velocity into station prograde and radial
        const progX = -sense * Math.sin(stAngle), progY = sense * Math.cos(stAngle);
        const radX = Math.cos(stAngle), radY = Math.sin(stAngle);
        const progradeRel = relVx * progX + relVy * progY;
        const radialRel = relVx * radX + relVy * radY;
        closestApproach = {
          dist, relSpeed, progradeRel, radialRel,
          shipX: pt.x, shipY: pt.y,
          stationX: stX, stationY: stY,
          idx: i,
        };
      }
    }
  }

  let targetBodyApproach: TargetBodyApproach | null = null;
  const targetBody = level.targetBodyId ? getTransferBody(level, level.targetBodyId) : null;
  if (targetBody) {
    let bestOutside: TargetBodyApproach | null = null;
    let bestOutsideDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const bodyPos = transferBodyState(level, targetBody.id, pt.t);
      if (!bodyPos) continue;
      const dx = pt.x - bodyPos.x;
      const dy = pt.y - bodyPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestOutsideDist) {
        const relVx = pt.vx - bodyPos.vx;
        const relVy = pt.vy - bodyPos.vy;
        bestOutsideDist = dist;
        bestOutside = {
          bodyId: targetBody.id,
          dist,
          relSpeed: Math.sqrt(relVx * relVx + relVy * relVy),
          shipX: pt.x,
          shipY: pt.y,
          bodyX: bodyPos.x,
          bodyY: bodyPos.y,
          relX: dx,
          relY: dy,
          relVX: relVx,
          relVY: relVy,
          idx: i,
          withinArrival: false,
        };
      }
    }

    targetBodyApproach = bestOutside;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const pt = points[i];
      const prevBody = transferBodyState(level, targetBody.id, prev.t);
      const bodyPos = transferBodyState(level, targetBody.id, pt.t);
      if (!prevBody || !bodyPos) continue;
      const prevDx = prev.x - prevBody.x;
      const prevDy = prev.y - prevBody.y;
      const prevDist = Math.sqrt(prevDx * prevDx + prevDy * prevDy);
      const dx = pt.x - bodyPos.x;
      const dy = pt.y - bodyPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (!(prevDist > targetBody.patchRadius && dist <= targetBody.patchRadius)) continue;

      const denom = dist - prevDist;
      const frac = Math.max(0, Math.min(1, (targetBody.patchRadius - prevDist) / (Math.abs(denom) > 1e-6 ? denom : -1e-6)));
      const tCross = prev.t + (pt.t - prev.t) * frac;
      const shipX = prev.x + (pt.x - prev.x) * frac;
      const shipY = prev.y + (pt.y - prev.y) * frac;
      const shipVX = prev.vx + (pt.vx - prev.vx) * frac;
      const shipVY = prev.vy + (pt.vy - prev.vy) * frac;
      const bodyCross = transferBodyState(level, targetBody.id, tCross);
      if (!bodyCross) break;
      const rx = shipX - bodyCross.x;
      const ry = shipY - bodyCross.y;
      const rvx = shipVX - bodyCross.vx;
      const rvy = shipVY - bodyCross.vy;
      const normalized = normalizeArrivalState(targetBody, rx, ry, rvx, rvy);
      const localElem = computeElements(normalized.x, normalized.y, normalized.vx, normalized.vy, targetBody.gm);
      const flybyAltitude = localElem.periapsis - targetBody.radius;
      const encounter = simulateTargetBodyEncounter(targetBody, normalized);
      targetBodyApproach = {
        bodyId: targetBody.id,
        dist: encounter.dist,
        relSpeed: encounter.relSpeed,
        shipX,
        shipY,
        bodyX: bodyCross.x,
        bodyY: bodyCross.y,
        relX: encounter.x,
        relY: encounter.y,
        relVX: encounter.vx,
        relVY: encounter.vy,
        idx: i,
        withinArrival: true,
        flybyAltitude,
        impactsBody: flybyAltitude < 0 || encounter.impactsBody,
      };
      break;
    }
  }

  return { points, atmoEntry, atmoExit, approachStart, impact, closestApproach, targetBodyApproach };
}

// Cached prediction — only recomputed when orbit changes
let _cachedPred: PredictionResult | null = null;
let _predDirty = true;
let _predFrameCount = 0;
let _predLastStateTime = -1;
const ATMO_RECALC_INTERVAL = 30; // recalc every N frames when in atmo
const COAST_RECALC_INTERVAL = 90; // recalc every N frames when coasting (for gradient update)

/** Mark prediction as needing recomputation (call when orbit changes). */
export function invalidatePrediction(): void { _predDirty = true; }

function hybridizeApproachPrediction(
  pred: PredictionResult, level: OrbitalLevel,
): PredictionResult {
  if (!pred.approachStart || level.atmoHeight <= 0) return pred;
  const approachLevel = APPROACH_LEVELS[level.approachLevelIdx];
  if (!approachLevel || approachLevel.departure) return pred;

  const init = orbitalToApproachParams({
    x: pred.approachStart.x,
    y: pred.approachStart.y,
    vx: pred.approachStart.vx,
    vy: pred.approachStart.vy,
    fuel: 0,
    dvUsed: 0,
    alive: true,
    enteredAtmo: false,
    temperature: 0,
    trail: [],
    trailIdx: 0,
    time: 0,
    realTime: 0,
    timeWarp: 1,
    timeWarpLevel: 0,
    thrustPro: false,
    thrustRetro: false,
    thrustLeft: false,
    thrustRight: false,
    thrusting: 'none',
    highThrust: false,
    inAtmo: true,
    angle: 0,
    renderAngle: 0,
    targetAoA: 0,
    docked: false,
    inRendezvousZoom: false,
    pacingModeId: 'atmo',
  }, level);
  const as = createApproachState(approachLevel, init);
  const trajStep = 0.4;
  const traj = predictTrajectory(as, approachLevel, 0, 240, trajStep, false, false);
  const localDir = init.localDir ?? -1;

  const localToWorld = (lx: number, ly: number, lvx: number, lvy: number) => {
    const theta = level.landingSiteAngle + lx / (level.planetRadius * localDir);
    const r = level.planetRadius + ly;
    const radX = Math.cos(theta), radY = Math.sin(theta);
    const tanX = -radY * localDir, tanY = radX * localDir;
    return {
      x: radX * r,
      y: radY * r,
      vx: tanX * lvx + radX * lvy,
      vy: tanY * lvx + radY * lvy,
      alt: ly,
    };
  };

  const prefix = pred.points.slice(0, pred.approachStart.idx + 1);
  const hybridTail: PredPoint[] = [];
  let prevX = as.x, prevY = as.y, prevVX = as.vx, prevVY = as.vy;
  for (let i = 0; i < traj.points.length; i++) {
    const pt = traj.points[i];
    const lvx = i === 0 ? prevVX : (pt.x - prevX) / trajStep;
    const lvy = i === 0 ? prevVY : (pt.y - prevY) / trajStep;
    const w = localToWorld(pt.x, pt.y, lvx, lvy);
    hybridTail.push({
      x: w.x,
      y: w.y,
      vx: w.vx,
      vy: w.vy,
      alt: w.alt,
      t: pred.points[pred.approachStart.idx].t + (i + 1) * trajStep,
      inAtmo: true,
      belowCritical: w.alt < level.transitionAltitude,
      heatRate: 0,
    });
    prevX = pt.x; prevY = pt.y; prevVX = lvx; prevVY = lvy;
  }

  // Orbital estimate ignores terrain and uses the notional surface at y=0.
  // Add an explicit surface-impact endpoint so the red X / label are preserved.
  if (traj.impactX !== null) {
    const w = localToWorld(traj.impactX, 0, prevVX, prevVY);
    hybridTail.push({
      x: w.x,
      y: w.y,
      vx: w.vx,
      vy: w.vy,
      alt: 0,
      t: pred.points[pred.approachStart.idx].t + (traj.points.length + 1) * trajStep,
      inAtmo: true,
      belowCritical: true,
      heatRate: 0,
    });
  }

  return analyzePrediction(prefix.concat(hybridTail), level);
}

function getCachedPrediction(s: OrbitalState, level: OrbitalLevel): PredictionResult {
  if (s.time !== _predLastStateTime) {
    _predLastStateTime = s.time;
    _predFrameCount++;
    // Periodic recalc: faster in atmo (drag), slower when coasting (gradient shift)
    if (s.inAtmo && _predFrameCount % ATMO_RECALC_INTERVAL === 0) _predDirty = true;
    else if (_predFrameCount % COAST_RECALC_INTERVAL === 0) _predDirty = true;
  }
  if (!_predDirty && _cachedPred) return _cachedPred;
  const elem = computeElements(s.x, s.y, s.vx, s.vy, level.planetGM);
  const hasClosedOrbit = elem.a > 0 && Number.isFinite(elem.a) && elem.e < 1;
  const period = hasClosedOrbit ? 2 * Math.PI * Math.sqrt(elem.a ** 3 / level.planetGM) : 10000;
  const rNow = Math.sqrt(s.x * s.x + s.y * s.y);
  const alt = rNow - level.planetRadius;
  const pacing = currentPacingProfile(level, alt, s.pacingModeId);
  let maxTime = Math.min(period * 0.95, 20000); // atmosphere / low-pass fallback
  if (level.systemBodies) {
    const targetOrbit = level.systemBodies.reduce((m, b) => Math.max(m, b.orbitRadius), 0);
    const transferTime = targetOrbit > 0 ? Math.PI * Math.sqrt(targetOrbit ** 3 / level.planetGM) : 0;
    maxTime = Math.max(period * 1.02, Math.min(Math.max(transferTime * 1.5, period * 1.02), 800000));
  } else if (!pacing.lowPass) {
    const fallbackHalfOrbitTime = Math.PI * Math.sqrt(Math.max(rNow, level.planetRadius + level.transitionAltitude) ** 3 / level.planetGM);
    const vacuumHorizon = hasClosedOrbit
      ? period * 1.02
      : Math.max(fallbackHalfOrbitTime * 1.5, 120000);
    maxTime = Math.min(vacuumHorizon, 800000);
  }
  const stepSize = !pacing.lowPass
    ? Math.min(20, Math.max(1, maxTime / 2200))
    : Math.max(1, maxTime / 2200);
  // Use current AoA if in atmo, otherwise standard high-atmo AoA
  const predAoA = s.inAtmo ? s.targetAoA : level.highAtmoAoA;
  const points = predictOrbit(s, level, maxTime, stepSize, predAoA);
  _cachedPred = hybridizeApproachPrediction(analyzePrediction(points, level), level);
  _predDirty = false;
  return _cachedPred;
}

function predictOrbit(
  s: OrbitalState, level: OrbitalLevel, maxPhysTime: number, stepSize: number,
  predAoA: number,
): PredPoint[] {
  const points: PredPoint[] = [{
    x: s.x,
    y: s.y,
    vx: s.vx,
    vy: s.vy,
    alt: Math.sqrt(s.x * s.x + s.y * s.y) - level.planetRadius,
    t: s.time,
    inAtmo: Math.sqrt(s.x * s.x + s.y * s.y) - level.planetRadius < level.atmoHeight,
    belowCritical: Math.sqrt(s.x * s.x + s.y * s.y) - level.planetRadius < level.transitionAltitude,
    heatRate: 0,
  }];
  let x = s.x, y = s.y, vx = s.vx, vy = s.vy;
  let prevTheta = Math.atan2(y, x);
  let angleAccum = 0;
  // Substeps per prediction step for accuracy when atmosphere is involved
  const subs = 4;
  const subDt = stepSize / subs;

  for (let t = 0; t < maxPhysTime; t += stepSize) {
    const r0 = Math.sqrt(x * x + y * y);
    if (r0 < level.planetRadius) {
      points.push({ x, y, vx, vy, alt: r0 - level.planetRadius, t: s.time + t, inAtmo: true, belowCritical: true, heatRate: 0 });
      return points;
    }
    const alt0 = r0 - level.planetRadius;
    const vacuumCoast = atmoDensity(alt0, level) < 1e-10;

    if (vacuumCoast) {
      const next = propagateTwoBodyState(x, y, vx, vy, level.planetGM, stepSize);
      x = next.x;
      y = next.y;
      vx = next.vx;
      vy = next.vy;
    } else {
      for (let si = 0; si < subs; si++) {
        const r = Math.sqrt(x * x + y * y);
        if (r < level.planetRadius) {
          points.push({ x, y, vx, vy, alt: r - level.planetRadius, t: s.time + t, inAtmo: true, belowCritical: true, heatRate: 0 });
          return points;
        }
        const alt = r - level.planetRadius;
        const belowTransition = alt < level.transitionAltitude;

        // Gravity: always orbital GM/r² radial toward center
        // (consistent physics for the entire orbital prediction)
        const gAccel = level.planetGM / (r * r);
        let ax = -gAccel * (x / r);
        let ay = -gAccel * (y / r);

        // Aero: use lowAtmoAoA below transition, predAoA above.
        const displayAoA = belowTransition ? level.lowAtmoAoA : predAoA;
        const useAoA = aoaDisplayToPhysical(displayAoA, x, y, vx, vy);
        const aero = aeroForces(x, y, vx, vy, useAoA, level);
        ax += aero.ax;
        ay += aero.ay;
        vx += ax * subDt;
        vy += ay * subDt;
        x += vx * subDt;
        y += vy * subDt;
      }
    }

    const r = Math.sqrt(x * x + y * y);
    const alt = r - level.planetRadius;
    const aero = aeroForces(x, y, vx, vy, aoaDisplayToPhysical(predAoA, x, y, vx, vy), level);
    points.push({
      x, y, vx, vy, alt, t: s.time + t + stepSize,
      inAtmo: alt < level.atmoHeight,
      belowCritical: alt < level.transitionAltitude,
      heatRate: aero.heatRate,
    });
    const theta = Math.atan2(y, x);
    let dTheta = theta - prevTheta;
    while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
    while (dTheta < -Math.PI) dTheta += 2 * Math.PI;
    angleAccum += Math.abs(dTheta);
    prevTheta = theta;
    if (!level.systemBodies && level.conicRadius && r >= level.conicRadius) return points;
    if (angleAccum >= Math.PI * 2) return points;
  }
  return points;
}

// ===================== Maneuver Suggestion =====================

interface ManeuverSuggestion {
  burnX: number; burnY: number;     // where to burn (on current orbit)
  burnTime: number;                  // physics time of burn
  deltaV: number;                    // m/s prograde (negative = retrograde)
  flybyDist: number;                 // predicted closest approach to station
  flybyRelSpeed: number;             // relative speed at flyby
  arrivalX: number; arrivalY: number; // where ship meets station orbit
  stationX: number; stationY: number; // where station is at arrival
}

let _wasRendezvousZoom = false;
let _maneuverCache: ManeuverSuggestion | null = null;
let _maneuverLastCompute = 0;    // realTime of last computation
let _maneuverThrottleIdle = 0;   // realTime when throttle went idle
const MANEUVER_IDLE_DELAY = 3;   // seconds after idle before first compute
const MANEUVER_RECOMPUTE = 5;    // seconds between recomputes

/** Solve Kepler's equation: M = E - e*sin(E) for E given M and e. */
function solveKepler(M: number, e: number): number {
  let E = M; // initial guess
  for (let i = 0; i < 12; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/** Compute time to travel from true anomaly nu1 to nu2 on an orbit with elements (a, e, GM).
 *  Assumes elliptical orbit (e < 1). Returns positive time. */
function timeOfFlight(nu1: number, nu2: number, a: number, e: number, gm: number, cw: boolean): number {
  // Convert true anomaly to eccentric anomaly
  function nuToE(nu: number): number {
    return Math.atan2(Math.sqrt(1 - e * e) * Math.sin(nu), e + Math.cos(nu));
  }
  let E1 = nuToE(nu1);
  let E2 = nuToE(nu2);
  // Mean anomalies
  let M1 = E1 - e * Math.sin(E1);
  let M2 = E2 - e * Math.sin(E2);
  // For CW orbits, time goes with decreasing true anomaly
  let dM = cw ? M1 - M2 : M2 - M1;
  while (dM < 0) dM += 2 * Math.PI;
  // Time = dM / n, where n = sqrt(GM/a³)
  const n = Math.sqrt(gm / (a * a * a));
  return dM / n;
}

function computeManeuver(s: OrbitalState, level: OrbitalLevel): ManeuverSuggestion | null {
  if (!level.station) return null;
  const st = level.station;
  const gm = level.planetGM;
  const rTarget = st.orbitRadius;
  const stOmega = stationOrbitSense(level) * Math.sqrt(gm / (rTarget * rTarget * rTarget));
  
  // Check if there's already a good flyby — don't suggest if so
  const pred = getCachedPrediction(s, level);
  if (pred.closestApproach) {
    const ca = pred.closestApproach;
    if (ca.dist < st.captureRadius * 2 && ca.relSpeed < st.captureMaxSpeed * 10) {
      return null; // already on a good trajectory
    }
  }
  
  const points = pred.points;
  if (points.length < 10) return null;
  
  // Collect all candidate maneuvers
  interface Candidate {
    suggestion: ManeuverSuggestion;
    quality: number; // lower = better (combined distance + speed)
  }
  const candidates: Candidate[] = [];
  
  const step = Math.max(1, Math.floor(points.length / 60));
  const startIdx = Math.floor(points.length * 0.05); // skip first 5% of orbit
  
  for (let pi = startIdx; pi < points.length; pi += step) {
    const pt = points[pi];
    const r = Math.sqrt(pt.x * pt.x + pt.y * pt.y);
    const speed = Math.sqrt(pt.vx * pt.vx + pt.vy * pt.vy);
    if (r < level.planetRadius + level.atmoHeight) continue;
    if (speed < 1) continue;
    
    const pdx = pt.vx / speed;
    const pdy = pt.vy / speed;
    
    for (let dv = -50; dv <= 50; dv += 5) {
      if (dv === 0) continue;
      
      const nvx = pt.vx + pdx * dv;
      const nvy = pt.vy + pdy * dv;
      const nv2 = nvx * nvx + nvy * nvy;
      const energy = nv2 / 2 - gm / r;
      if (energy >= 0) continue;
      const a = -gm / (2 * energy);
      const h = pt.x * nvy - pt.y * nvx;
      const ex = (nvy * h) / gm - pt.x / r;
      const ey = (-nvx * h) / gm - pt.y / r;
      const e = Math.sqrt(ex * ex + ey * ey);
      if (e >= 1) continue;
      
      const periapsis = a * (1 - e);
      const apoapsis = a * (1 + e);
      if (rTarget < periapsis || rTarget > apoapsis) continue;
      
      const p = a * (1 - e * e);
      const cosNu = (p / rTarget - 1) / e;
      if (Math.abs(cosNu) > 1) continue;
      const nuCross = Math.acos(cosNu);
      const omega = Math.atan2(ey, ex);
      const burnTheta = Math.atan2(pt.y, pt.x);
      let burnNu = burnTheta - omega;
      while (burnNu > Math.PI) burnNu -= 2 * Math.PI;
      while (burnNu < -Math.PI) burnNu += 2 * Math.PI;
      const isCW = h < 0;
      
      for (const crossNu of [nuCross, -nuCross]) {
        const tof = timeOfFlight(burnNu, crossNu, a, e, gm, isCW);
        if (tof < 1 || tof > 20000) continue;
        
        const arrivalAngle = crossNu + omega;
        const arrivalX = rTarget * Math.cos(arrivalAngle);
        const arrivalY = rTarget * Math.sin(arrivalAngle);
        
        const arrivalPhysTime = pt.t + tof;
        const stAngle = st.epochAngle + stOmega * (arrivalPhysTime - st.epochTime);
        const stX = rTarget * Math.cos(stAngle);
        const stY = rTarget * Math.sin(stAngle);
        
        const dx = arrivalX - stX, dy = arrivalY - stY;
        const flybyDist = Math.sqrt(dx * dx + dy * dy);
        
        const vShipAtCross = Math.sqrt(gm * (2 / rTarget - 1 / a));
        const vStation = Math.sqrt(gm / rTarget);
        const flybyRelSpeed = Math.abs(vShipAtCross - vStation);
        
        // Quality: normalized distance + normalized speed (both 0..1 ideally)
        const distNorm = flybyDist / st.captureRadius;  // 1.0 = at capture edge
        const speedNorm = flybyRelSpeed / st.captureMaxSpeed; // 1.0 = at speed limit
        const quality = distNorm + speedNorm;
        
        // Filter: only keep maneuvers that are "good" (<2x radius, <10x speed)
        if (flybyDist > st.captureRadius * 2) continue;
        if (flybyRelSpeed > st.captureMaxSpeed * 10) continue;
        
        candidates.push({
          quality,
          suggestion: {
            burnX: pt.x, burnY: pt.y,
            burnTime: pt.t,
            deltaV: dv,
            flybyDist,
            flybyRelSpeed,
            arrivalX, arrivalY,
            stationX: stX, stationY: stY,
          },
        });
      }
    }
  }
  
  if (candidates.length === 0) return null;
  
  // Find best quality
  let bestQuality = Infinity;
  for (const c of candidates) {
    if (c.quality < bestQuality) bestQuality = c.quality;
  }
  
  // Among all within 10% of best quality, pick least delta-v
  const threshold = bestQuality * 1.1;
  let best: ManeuverSuggestion | null = null;
  let bestDv = Infinity;
  for (const c of candidates) {
    if (c.quality <= threshold) {
      const absDv = Math.abs(c.suggestion.deltaV);
      if (absDv < bestDv) {
        bestDv = absDv;
        best = c.suggestion;
      }
    }
  }
  
  return best;
}

function updateManeuverSuggestion(s: OrbitalState, level: OrbitalLevel): void {
  if (!level.station || s.docked) { _maneuverCache = null; return; }
  
  const isThrusting = s.thrusting !== 'none';
  if (isThrusting) {
    _maneuverThrottleIdle = s.realTime;
    return; // don't compute while thrusting
  }
  
  const idleTime = s.realTime - _maneuverThrottleIdle;
  if (idleTime < MANEUVER_IDLE_DELAY) return; // wait for idle
  
  const timeSinceCompute = s.realTime - _maneuverLastCompute;
  if (_maneuverCache && timeSinceCompute < MANEUVER_RECOMPUTE) return; // recent enough
  
  _maneuverCache = computeManeuver(s, level);
  _maneuverLastCompute = s.realTime;
}

// ===================== Camera =====================

export interface OrbitalCamera {
  x: number;
  y: number;
  zoom: number;
}

export function createOrbitalCamera(level: OrbitalLevel): OrbitalCamera {
  const orbitR = Math.sqrt(level.startX * level.startX + level.startY * level.startY);
  const zoom = 350 / orbitR;
  return { x: 0, y: 0, zoom };
}

export function updateOrbitalCamera(
  cam: OrbitalCamera, s: OrbitalState, level: OrbitalLevel,
  dt: number, W: number, H: number,
): void {
  const smooth = 1 - Math.exp(-1.5 * dt);
  const halfScreen = Math.min(W, H) * 0.45;

  // Check rendezvous proximity
  let inRendezvousZoom = false;
  if (level.station && !s.inAtmo) {
    const sp = stationPos(level, s.time)!;
    const dx = s.x - sp.x, dy = s.y - sp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const rvx = s.vx - sp.vx, rvy = s.vy - sp.vy;
    const relSpd = Math.sqrt(rvx * rvx + rvy * rvy);
    if (dist < 100_000 && relSpd < level.station.captureMaxSpeed * 10) {
      inRendezvousZoom = true;
    }
  }
  // Reset warp on rendezvous zoom entry
  if (inRendezvousZoom && !_wasRendezvousZoom) {
    s.timeWarpLevel = 0;
    s.timeWarp = 1;
  }
  _wasRendezvousZoom = inRendezvousZoom;
  s.inRendezvousZoom = inRendezvousZoom;

  const r = Math.sqrt(s.x * s.x + s.y * s.y);
  const alt = r - level.planetRadius;
  const pacing = currentPacingProfile(level, alt, s.thrusting !== 'none' ? s.pacingModeId : undefined);

  if (pacing.lowPass) {
    // Low-pass / atmosphere: most zoom, center on the ship, keep local trajectory readable.
    const transferView = !!level.systemBodies;
    const viewRadius = transferView
      ? Math.max(alt * 8, level.transitionAltitude * 6, 180000)
      : Math.max(alt * 6, 60000);
    const targetZoom = halfScreen / viewRadius;
    cam.zoom += (targetZoom - cam.zoom) * smooth;
    cam.x += (s.x - cam.x) * smooth;
    cam.y += (s.y - cam.y) * smooth;
  } else if (inRendezvousZoom) {
    // Rendezvous proximity: zoom in, center on ship (hard track)
    const sp = stationPos(level, s.time)!;
    const dx = s.x - sp.x, dy = s.y - sp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const viewRadius = Math.max(dist * 1.5, 50_000);
    const targetZoom = halfScreen / viewRadius;
    const fastSmooth = 1 - Math.exp(-5.0 * dt);
    cam.zoom += (targetZoom - cam.zoom) * fastSmooth;
    // Hard-track ship position (no lag)
    cam.x = s.x;
    cam.y = s.y;
  } else {
    // Low orbit shows the local orbit around the current body; only the unlocked highest
    // transfer mode zooms out to the full system.
    const elem = computeElements(s.x, s.y, s.vx, s.vy, level.planetGM);
    let maxR = elem.e < 1 ? elem.apoapsis * 1.15 : Math.sqrt(s.x * s.x + s.y * s.y) * 1.5;
    if (level.station) maxR = Math.max(maxR, level.station.orbitRadius * 1.15);
    const showSystemView = !!level.systemBodies && pacing.orbitModeId === level.orbitModeId;
    const systemOuterR = level.systemBodies?.reduce((m, b) => Math.max(m, b.orbitRadius + (b.displayPatchRadius ?? b.patchRadius)), 0) ?? 0;
    if (showSystemView && systemOuterR > 0) {
      maxR = Math.max(maxR, systemOuterR * 1.05);
    }
    if (level.conicRadius && (showSystemView || !level.systemBodies)) {
      maxR = Math.min(maxR, level.conicRadius * 1.05);
    }
    const targetZoom = halfScreen / Math.max(maxR, level.planetRadius * 1.5);
    cam.zoom += (targetZoom - cam.zoom) * smooth;
    cam.x += (0 - cam.x) * smooth;
    cam.y += (0 - cam.y) * smooth;
  }
}

// ===================== Rendering =====================

function ws(wx: number, wy: number, cam: OrbitalCamera, W: number, H: number): [number, number] {
  return [
    (wx - cam.x) * cam.zoom + W / 2,
    -(wy - cam.y) * cam.zoom + H / 2,
  ];
}

export function renderOrbital(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
  cam: OrbitalCamera, s: OrbitalState, level: OrbitalLevel, time: number,
): void {
  const W = canvas.width, H = canvas.height;

  ctx.fillStyle = '#030308';
  ctx.fillRect(0, 0, W, H);

  drawStars(ctx, W, H);
  drawPlanet(ctx, cam, level, W, H);
  drawAtmosphere(ctx, cam, level, W, H);
  if (level.systemBodies) drawSystemBodies(ctx, cam, s, level, W, H);
  else drawCentralBodyLabel(ctx, cam, level, W, H);
  drawOrbitingPoiMarkers(ctx, cam, s, level, W, H);
  drawSurfacePoiMarkers(ctx, cam, level, W, H);
  let rendezvousZoomed = false;
  if (level.station) {
    const sp = stationPos(level, s.time)!;
    const dx = s.x - sp.x, dy = s.y - sp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const rvx = s.vx - sp.vx, rvy = s.vy - sp.vy;
    const relSpd = Math.sqrt(rvx * rvx + rvy * rvy);
    rendezvousZoomed = dist < 100_000 && relSpd < level.station.captureMaxSpeed * 10;
    drawStation(ctx, cam, s, level, W, H, rendezvousZoomed);
  }
  if (!level.surfaceMarkers && !level.station && level.showLandingSite !== false) drawLandingSite(ctx, cam, level, W, H);
  if (level.escapeSOIRadius) drawEscapeGuidance(ctx, cam, s, level, W, H);
  if (!rendezvousZoomed) {
    drawOrbitPrediction(ctx, cam, s, level, W, H);
    drawTrail(ctx, cam, s, W, H);
    drawOrbitalMarkers(ctx, cam, s, level, W, H);
  }
  if (!rendezvousZoomed && _maneuverCache) drawManeuverMarker(ctx, cam, _maneuverCache, W, H);
  drawShip(ctx, cam, s, level, W, H, time);
}

// --- Stars ---
const STAR_CACHE: { x: number; y: number; b: number }[] = [];
function drawStars(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  if (STAR_CACHE.length === 0) {
    let seed = 12345;
    for (let i = 0; i < 200; i++) {
      seed = (seed * 16807) % 2147483647;
      const x = (seed / 2147483647) * 1.2 - 0.1;
      seed = (seed * 16807) % 2147483647;
      const y = (seed / 2147483647) * 1.2 - 0.1;
      seed = (seed * 16807) % 2147483647;
      const b = 0.2 + (seed / 2147483647) * 0.6;
      STAR_CACHE.push({ x, y, b });
    }
  }
  for (const star of STAR_CACHE) {
    ctx.fillStyle = `rgba(180, 190, 210, ${star.b})`;
    ctx.fillRect(star.x * W, star.y * H, 1.5, 1.5);
  }
}

// --- Planet ---
function drawPlanet(
  ctx: CanvasRenderingContext2D, cam: OrbitalCamera,
  level: OrbitalLevel, W: number, H: number,
): void {
  const [cx, cy] = ws(0, 0, cam, W, H);
  const r = level.planetRadius * cam.zoom;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = level.planetFillColor ?? '#0a0f0a';
  ctx.fill();

  ctx.beginPath();
  const segments = 120;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const noise =
      Math.sin(angle * 7 + 1.3) * 0.003 +
      Math.sin(angle * 13 + 4.7) * 0.002 +
      Math.sin(angle * 23 + 2.1) * 0.001;
    const pr = r * (1 + noise);
    const px = cx + Math.cos(angle) * pr;
    const py = cy - Math.sin(angle) * pr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = level.planetStrokeColor ?? '#224422';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function orbitalBodyName(level: OrbitalLevel): string {
  if (level.bodyName) return level.bodyName;
  try { return bodyById(level.bodyId).name; }
  catch { return level.bodyId; }
}

function orbitalStationName(level: OrbitalLevel): string {
  if (level.station?.name) return level.station.name;
  if (!level.station) return '';
  try { return stationPoiById(level.station.id).name; }
  catch { return level.station.id; }
}

function drawCentralBodyLabel(
  ctx: CanvasRenderingContext2D, cam: OrbitalCamera,
  level: OrbitalLevel, W: number, H: number,
): void {
  const [cx, cy] = ws(0, 0, cam, W, H);
  const centerBodyR = Math.max(8, level.planetRadius * cam.zoom);
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(120, 180, 255, 0.9)';
  ctx.fillText(orbitalBodyName(level).toUpperCase(), cx, cy - centerBodyR - 8);
}

function drawSystemBodies(
  ctx: CanvasRenderingContext2D, cam: OrbitalCamera,
  s: OrbitalState, level: OrbitalLevel, W: number, H: number,
): void {
  const [cx, cy] = ws(0, 0, cam, W, H);
  drawCentralBodyLabel(ctx, cam, level, W, H);

  let offscreenTargetLabel: { x: number; y: number; color: string; name: string } | null = null;

  for (const body of level.systemBodies ?? []) {
    const pos = transferBodyState(level, body.id, s.time);
    if (!pos) continue;
    const [bx, by] = ws(pos.x, pos.y, cam, W, H);
    const orbitR = body.orbitRadius * cam.zoom;
    const [cr, cg, cb] = body.color;

    ctx.beginPath();
    ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.25)`;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    const br = Math.max(3, body.radius * cam.zoom);
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,0.35)`;
    ctx.lineWidth = 1;
    ctx.stroke();

    if (body.id === level.targetBodyId) {
      const patchR = (body.displayPatchRadius ?? body.patchRadius) * cam.zoom;
      ctx.beginPath();
      ctx.arc(bx, by, patchR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.45)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const visible = bx >= 24 && bx <= W - 24 && by >= 24 && by <= H - 24;
    if (visible) {
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.9)`;
      ctx.fillText(body.name.toUpperCase(), bx, by - br - 6);
    } else if (body.id === level.targetBodyId) {
      const dx = bx - W / 2;
      const dy = by - H / 2;
      const edgeInset = 18;
      const scale = Math.min(
        ((W / 2) - edgeInset) / Math.max(Math.abs(dx), 1),
        ((H / 2) - edgeInset) / Math.max(Math.abs(dy), 1),
      );
      offscreenTargetLabel = {
        x: W / 2 + dx * scale,
        y: H / 2 + dy * scale,
        color: `rgba(${cr}, ${cg}, ${cb}, 0.95)`,
        name: body.name.toUpperCase(),
      };
    }
  }

  if (offscreenTargetLabel) {
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = offscreenTargetLabel.color;
    ctx.fillText(offscreenTargetLabel.name, offscreenTargetLabel.x, offscreenTargetLabel.y);
    ctx.textBaseline = 'alphabetic';
  }

  const pred = getCachedPrediction(s, level);
  if (pred.targetBodyApproach) {
    const ca = pred.targetBodyApproach;
    const targetBody = level.targetBodyId ? getTransferBody(level, level.targetBodyId) : null;
    const [ssx, ssy] = ws(ca.shipX, ca.shipY, cam, W, H);

    if (!ca.withinArrival) {
      const [bsx, bsy] = ws(ca.bodyX, ca.bodyY, cam, W, H);
      ctx.beginPath();
      ctx.moveTo(ssx, ssy);
      ctx.lineTo(bsx, bsy);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(bsx, bsy, 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const midX = (ssx + bsx) / 2;
      const midY = (ssy + bsy) / 2;
      const distStr = ca.dist > 1000 ? `${(ca.dist / 1000).toFixed(1)}km` : `${ca.dist.toFixed(0)}m`;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffaa00';
      ctx.fillText(`${distStr}  ${ca.relSpeed.toFixed(0)}m/s`, midX, midY - 6);
    }

    if (ca.withinArrival && targetBody) {
      const flybyAlt = ca.flybyAltitude ?? (ca.dist - targetBody.radius);
      const flybySense = senseLabel(orbitSense(ca.relX, ca.relY, ca.relVX, ca.relVY));
      const accent = ca.impactsBody ? '#ff6666' : '#00ffcc';
      const signedAltKm = `${Math.round(flybyAlt / 1000)}km`;
      const labelText = `FBY ${signedAltKm} ${flybySense}`;

      ctx.beginPath();
      ctx.arc(ssx, ssy, 6, 0, Math.PI * 2);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = accent;
      ctx.fillText(labelText, ssx + 10, ssy - 8);
    }
  }
}

// --- Atmosphere ---
function drawAtmosphere(
  ctx: CanvasRenderingContext2D, cam: OrbitalCamera,
  level: OrbitalLevel, W: number, H: number,
): void {
  const [cx, cy] = ws(0, 0, cam, W, H);
  const innerR = level.planetRadius * cam.zoom;
  const outerR = (level.planetRadius + level.atmoHeight) * cam.zoom;
  const [ar, ag, ab] = level.atmoColor;

  const bands = 12;
  for (let i = 0; i < bands; i++) {
    const f0 = i / bands;
    const f1 = (i + 1) / bands;
    const r0 = innerR + (outerR - innerR) * f0;
    const r1 = innerR + (outerR - innerR) * f1;
    const alpha = 0.15 * (1 - f0) * (1 - f0);
    ctx.beginPath();
    ctx.arc(cx, cy, r1, 0, Math.PI * 2);
    ctx.arc(cx, cy, r0, 0, Math.PI * 2, true);
    ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha})`;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, 0.3)`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawOrbitingPoiMarkers(
  ctx: CanvasRenderingContext2D, cam: OrbitalCamera,
  s: OrbitalState, level: OrbitalLevel, W: number, H: number,
): void {
  const markers = level.orbitMarkers ?? [];
  const [cx, cy] = ws(0, 0, cam, W, H);
  for (const marker of markers) {
    const omega = marker.orbitSense * Math.sqrt(level.planetGM / (marker.orbitRadius ** 3));
    const angle = marker.epochAngle + omega * (s.time - marker.epochTime);
    const x = marker.orbitRadius * Math.cos(angle);
    const y = marker.orbitRadius * Math.sin(angle);
    const [mx, my] = ws(x, y, cam, W, H);
    const isTarget = level.station?.id === marker.id;
    const col = isTarget ? '#00ffcc' : 'rgba(160, 170, 180, 0.75)';

    if (!isTarget) {
      ctx.beginPath();
      ctx.arc(cx, cy, marker.orbitRadius * cam.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(160, 170, 180, 0.16)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 7]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.arc(mx, my, isTarget ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = isTarget ? '#ffffff' : 'rgba(220, 220, 220, 0.3)';
    ctx.stroke();

    const outwardX = mx - cx;
    const outwardY = my - cy;
    const outLen = Math.max(1, Math.hypot(outwardX, outwardY));
    const labelX = mx + outwardX / outLen * 48;
    const labelY = my + outwardY / outLen * 48;
    ctx.beginPath();
    ctx.moveTo(mx + outwardX / outLen * 9, my + outwardY / outLen * 9);
    ctx.lineTo(labelX - outwardX / outLen * 8, labelY - outwardY / outLen * 8);
    ctx.strokeStyle = isTarget ? 'rgba(0, 255, 204, 0.35)' : 'rgba(160, 170, 180, 0.24)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = isTarget ? 'bold 10px monospace' : '10px monospace';
    ctx.textAlign = outwardX >= 0 ? 'left' : 'right';
    ctx.textBaseline = outwardY >= 0 ? 'top' : 'bottom';
    ctx.fillStyle = col;
    ctx.fillText(marker.name.toUpperCase(), labelX, labelY);
    ctx.textBaseline = 'alphabetic';
  }
}

function drawSurfacePoiMarkers(
  ctx: CanvasRenderingContext2D, cam: OrbitalCamera,
  level: OrbitalLevel, W: number, H: number,
): void {
  const markers = level.surfaceMarkers ?? [];
  if (markers.length === 0) return;
  for (const marker of markers) {
    const isTarget = Math.abs(normalizeAngle(marker.angle - level.landingSiteAngle)) < 1e-5 && level.showLandingSite !== false && !level.station;
    const col = isTarget ? '#00ffcc' : 'rgba(160, 170, 180, 0.75)';
    const surfR = level.planetRadius;
    const showLabel = isTarget || marker.labelVisibility !== 'target';
    const labelR = Math.max(level.planetRadius * 0.72, level.planetRadius - Math.max(8_000, level.planetRadius * 0.12));
    const sx = surfR * Math.cos(marker.angle);
    const sy = surfR * Math.sin(marker.angle);
    const lx = labelR * Math.cos(marker.angle);
    const ly = labelR * Math.sin(marker.angle);
    const [ssx, ssy] = ws(sx, sy, cam, W, H);
    const [lsx, lsy] = ws(lx, ly, cam, W, H);

    ctx.beginPath();
    ctx.moveTo(ssx, ssy);
    ctx.lineTo(lsx, lsy);
    ctx.strokeStyle = isTarget ? 'rgba(0, 255, 204, 0.28)' : 'rgba(160, 170, 180, 0.14)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(ssx, ssy, isTarget ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();

    if (showLabel) {
      const outwardX = lsx - W / 2;
      ctx.font = isTarget ? 'bold 10px monospace' : '10px monospace';
      ctx.fillStyle = col;
      ctx.textAlign = outwardX >= 0 ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(marker.name.toUpperCase(), lsx, lsy);
      ctx.textBaseline = 'alphabetic';
    }
  }
}

// --- Landing site ---
function drawLandingSite(
  ctx: CanvasRenderingContext2D, cam: OrbitalCamera,
  level: OrbitalLevel, W: number, H: number,
): void {
  const angle = level.landingSiteAngle;
  const surfR = level.planetRadius;
  const atmoR = level.planetRadius + level.atmoHeight;

  const sx = surfR * Math.cos(angle);
  const sy = surfR * Math.sin(angle);
  const [ssx, ssy] = ws(sx, sy, cam, W, H);

  const ax = atmoR * 1.15 * Math.cos(angle);
  const ay = atmoR * 1.15 * Math.sin(angle);
  const [asx, asy] = ws(ax, ay, cam, W, H);

  ctx.beginPath();
  ctx.moveTo(ssx, ssy);
  ctx.lineTo(asx, asy);
  ctx.strokeStyle = 'rgba(0, 255, 204, 0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(ssx, ssy, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#00ffcc';
  ctx.fill();

  ctx.font = '11px monospace';
  ctx.fillStyle = '#00ffcc';
  ctx.textAlign = 'center';
  const labelR = atmoR * 1.2;
  const lx = labelR * Math.cos(angle);
  const ly = labelR * Math.sin(angle);
  const [lsx, lsy] = ws(lx, ly, cam, W, H);
  ctx.fillText('LZ', lsx, lsy + 4);
}

function drawEscapeGuidance(
  ctx: CanvasRenderingContext2D, cam: OrbitalCamera,
  s: OrbitalState, level: OrbitalLevel, W: number, H: number,
): void {
  const [cx, cy] = ws(0, 0, cam, W, H);
  const soiR = level.escapeSOIRadius! * cam.zoom;
  ctx.beginPath();
  ctx.arc(cx, cy, soiR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(120, 180, 255, 0.28)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 8]);
  ctx.stroke();
  ctx.setLineDash([]);

  const drawVector = (
    angle: number, color: string, label: string, outwardScale = 1.02,
    originAnchor?: { x: number; y: number },
  ) => {
    const tipR = level.escapeSOIRadius! * outwardScale;
    const baseR = level.escapeSOIRadius! * 0.9;
    let tip = ws(Math.cos(angle) * tipR, Math.sin(angle) * tipR, cam, W, H);
    let base = originAnchor ? ws(originAnchor.x, originAnchor.y, cam, W, H)
      : ws(Math.cos(angle) * baseR, Math.sin(angle) * baseR, cam, W, H);
    if (originAnchor) {
      const dirLen = 18;
      tip = [base[0] + Math.cos(angle) * dirLen, base[1] - Math.sin(angle) * dirLen];
    }
    const margin = 44;
    const onScreen = (p: [number, number]) => p[0] >= margin && p[0] <= W - margin && p[1] >= margin && p[1] <= H - margin;

    if (!onScreen(tip) || !onScreen(base)) {
      const ox = Math.max(margin, Math.min(W - margin, cx));
      const oy = Math.max(margin, Math.min(H - margin, cy));
      let dirX = Math.cos(angle);
      let dirY = -Math.sin(angle); // screen-space Y flip
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
      dirX /= dirLen; dirY /= dirLen;

      const tx = dirX > 0 ? (W - margin - ox) / dirX : dirX < 0 ? (margin - ox) / dirX : Infinity;
      const ty = dirY > 0 ? (H - margin - oy) / dirY : dirY < 0 ? (margin - oy) / dirY : Infinity;
      const candidates = [tx, ty].filter(v => Number.isFinite(v) && v > 0);
      const t = candidates.length > 0 ? Math.min(...candidates) : 0;
      tip = [ox + dirX * t, oy + dirY * t];
      base = [tip[0] - dirX * 18, tip[1] - dirY * 18];
    }

    const dx = tip[0] - base[0], dy = tip[1] - base[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len, ny = dy / len;
    const px = -ny, py = nx;
    ctx.beginPath();
    ctx.moveTo(base[0], base[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.lineTo(tip[0] - nx * 9 + px * 4, tip[1] - ny * 9 + py * 4);
    ctx.moveTo(tip[0], tip[1]);
    ctx.lineTo(tip[0] - nx * 9 - px * 4, tip[1] - ny * 9 - py * 4);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(label, Math.max(70, Math.min(W - 70, tip[0])), Math.max(18, Math.min(H - 18, tip[1] - 8)));
  };

  const target = escapeTargetForLevel(level, s.time);
  if (target) {
    const targetLabel = `ESCAPE ${target.speed.toFixed(0)}m/s`;
    drawVector(target.angle, '#66bbff', targetLabel);
  }

  const current = currentEscapeVector(s, level);
  if (current) {
    drawVector(current.angle, '#ffaa00', `CUR ${current.speed.toFixed(0)}m/s`, 0.98, { x: current.x, y: current.y });
  }
}

// --- Station (rendezvous target) ---
function drawStation(
  ctx: CanvasRenderingContext2D, cam: OrbitalCamera,
  s: OrbitalState, level: OrbitalLevel, W: number, H: number,
  zoomed: boolean,
): void {
  const st = level.station!;
  const pos = stationPos(level, s.time)!;
  const [sx, sy] = ws(pos.x, pos.y, cam, W, H);

  // Station orbit — fading dashed circle, bright ahead of station
  const [cx, cy] = ws(0, 0, cam, W, H);
  const orbitR = st.orbitRadius * cam.zoom;
  const stAngle = Math.atan2(pos.y, pos.x); // station's current angle
  const steps = zoomed ? 360 : 120; // more segments when zoomed in
  let prevOx = 0, prevOy = 0;
  let dashAccum = 0, dashOn = true;
  const dashLen = zoomed ? 5 : 8;   // tighter dashes when zoomed
  const orbitDir = st.orbitSense;
  ctx.lineWidth = 1.5;
  for (let i = 1; i <= steps; i++) {
    const frac = i / steps;
    const a = stAngle + orbitDir * frac * Math.PI * 2;
    const ox = cx + Math.cos(a) * orbitR;
    const oy = cy - Math.sin(a) * orbitR;
    if (i === 1) { prevOx = ox; prevOy = oy; continue; }
    const segLen = Math.sqrt((ox - prevOx) ** 2 + (oy - prevOy) ** 2);
    dashAccum += segLen;
    if (dashAccum > dashLen) { dashOn = !dashOn; dashAccum -= dashLen; }
    if (dashOn) {
      const alpha = 0.2 + 0.6 * (1 - frac); // 0.8 near station -> 0.2 far
      ctx.strokeStyle = `rgba(80, 140, 255, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(prevOx, prevOy);
      ctx.lineTo(ox, oy);
      ctx.stroke();
    }
    prevOx = ox; prevOy = oy;
  }

  // Capture circle + speed label (only in zoomed mode)
  if (zoomed) {
    const capR = Math.max(st.captureRadius * cam.zoom, 8);
    ctx.beginPath();
    ctx.arc(sx, sy, capR, 0, Math.PI * 2);
    ctx.strokeStyle = '#ccbbff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '10px monospace';
    ctx.fillStyle = '#ccbbff';
    ctx.textAlign = 'left';
    ctx.fillText(`<${st.captureMaxSpeed}m/s`, sx + capR + 4, sy + 3);
  }

  // Station icon (small square + solar panels)
  const sz = 5;
  ctx.strokeStyle = '#ccbbff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sx - sz / 2, sy - sz / 2, sz, sz);
  // Solar panels
  ctx.beginPath();
  ctx.moveTo(sx - sz * 1.5, sy); ctx.lineTo(sx - sz / 2, sy);
  ctx.moveTo(sx + sz / 2, sy); ctx.lineTo(sx + sz * 1.5, sy);
  ctx.stroke();

  // Closest approach marker (only in zoomed mode)
  const pred = getCachedPrediction(s, level);
  if (!zoomed && pred.closestApproach) {
    const ca = pred.closestApproach;
    // Station position at closest approach
    const [casx, casy] = ws(ca.stationX, ca.stationY, cam, W, H);
    const [cashx, cashy] = ws(ca.shipX, ca.shipY, cam, W, H);

    // Dashed line between ship and station at closest approach
    ctx.beginPath();
    ctx.moveTo(cashx, cashy);
    ctx.lineTo(casx, casy);
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = ca.dist < st.captureRadius ? '#00ffcc' : '#ffaa00';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // Flyby marker at station's predicted position
    ctx.beginPath();
    ctx.arc(casx, casy, 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Distance + relative speed label
    const midX = (cashx + casx) / 2;
    const midY = (cashy + casy) / 2;
    const withinCapture = ca.dist < st.captureRadius;
    const distStr = withinCapture ? `<${Math.round(st.captureRadius / 1000)}km` : 
      (ca.dist > 1000 ? `${(ca.dist / 1000).toFixed(1)}km` : `${ca.dist.toFixed(0)}m`);
    const col = withinCapture ? '#00ffcc' : '#ffaa00';
    ctx.font = '10px monospace';
    ctx.fillStyle = col;
    ctx.textAlign = 'center';

    ctx.fillText(`${distStr}  ${ca.relSpeed.toFixed(0)}m/s`, midX, midY - 6);
  }
}

// --- Maneuver suggestion marker ---
function drawManeuverMarker(
  ctx: CanvasRenderingContext2D, cam: OrbitalCamera,
  m: ManeuverSuggestion, W: number, H: number,
): void {
  const [mx, my] = ws(m.burnX, m.burnY, cam, W, H);

  // Blue X
  const sz = 6;
  ctx.strokeStyle = '#4488ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mx - sz, my - sz); ctx.lineTo(mx + sz, my + sz);
  ctx.moveTo(mx + sz, my - sz); ctx.lineTo(mx - sz, my + sz);
  ctx.stroke();

  // Label
  const label = m.deltaV > 0 ? 'speed up' : 'slow down';
  ctx.font = '10px monospace';
  ctx.fillStyle = '#4488ff';
  ctx.textAlign = 'center';
  ctx.fillText(label, mx, my - sz - 4);
}

// --- Orbit prediction (numerical, with aerobraking) ---
function drawOrbitPrediction(
  ctx: CanvasRenderingContext2D, cam: OrbitalCamera,
  s: OrbitalState, level: OrbitalLevel, W: number, H: number,
): void {
  const pred = getCachedPrediction(s, level);
  const points = pred.points;
  if (points.length < 2) return;

  // --- Draw orbit line ---
  ctx.lineWidth = 1.5;
  let prevSx = 0, prevSy = 0;
  let dashAccum = 0, dashOn = true;
  const dashLen = 8;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const [sx, sy] = ws(pt.x, pt.y, cam, W, H);

    if (i === 0) { prevSx = sx; prevSy = sy; continue; }

    const segLen = Math.sqrt((sx - prevSx) ** 2 + (sy - prevSy) ** 2);
    dashAccum += segLen;
    if (dashAccum > dashLen) { dashOn = !dashOn; dashAccum -= dashLen; }

    if (dashOn) {
      const frac = i / points.length;
      const alpha = 0.2 + 0.8 * (1 - frac); // 1.0 ahead → 0.2 at full orbit

      // Color: green=vacuum, yellow=in atmo, orange=below critical altitude
      let r = 0, g = 255, b = 100; // green
      if (pt.belowCritical) {
        r = 255; g = 160; b = 0;    // orange
      } else if (pt.inAtmo) {
        r = 255; g = 220; b = 0;    // yellow
      }

      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(prevSx, prevSy);
      ctx.lineTo(sx, sy);
      ctx.stroke();
    }

    prevSx = sx;
    prevSy = sy;
  }

  // --- Event markers on orbit (arrow icons, no text) ---

  // Helper: draw arrow at a point along velocity direction
  function drawEventArrow(
    ex: number, ey: number, evx: number, evy: number,
    color: string, inward: boolean, size: number,
  ) {
    const [mx, my] = ws(ex, ey, cam, W, H);
    const spd = Math.sqrt(evx * evx + evy * evy);
    if (spd < 0.01) return;

    // Arrow along velocity direction on screen
    // Screen velocity: (evx, -evy) due to Y flip
    const svx = evx / spd, svy = -evy / spd;
    // Perpendicular (for arrowhead wings)
    const px = -svy, py = svx;

    // For "inward" (entry/approach): arrow points along velocity
    // For "outward" (exit): arrow also along velocity but we add an upward tick
    const tipX = mx + svx * size;
    const tipY = my + svy * size;
    const baseX = mx - svx * size;
    const baseY = my - svy * size;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Arrow shaft
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(tipX, tipY);
    // Arrowhead
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - svx * size * 0.6 + px * size * 0.4, tipY - svy * size * 0.6 + py * size * 0.4);
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - svx * size * 0.6 - px * size * 0.4, tipY - svy * size * 0.6 - py * size * 0.4);
    ctx.stroke();

    if (!inward) {
      // Exit: add a small "kick up" line (perpendicular away from planet)
      const rr = Math.sqrt(ex * ex + ey * ey);
      const outX = ex / rr, outY = ey / rr; // radial outward in world
      const soutX = outX, soutY = -outY;     // screen coords
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + soutX * size * 1.2, my + soutY * size * 1.2);
      ctx.stroke();
    }
  }

  // Atmo entry: yellow arrow diving in
  if (pred.atmoEntry) {
    drawEventArrow(
      pred.atmoEntry.x, pred.atmoEntry.y,
      pred.atmoEntry.vx, pred.atmoEntry.vy,
      '#ffdd00', true, 8,
    );
  }

  // Atmo exit: yellow arrow with upward kick
  if (pred.atmoExit) {
    drawEventArrow(
      pred.atmoExit.x, pred.atmoExit.y,
      pred.atmoExit.vx, pred.atmoExit.vy,
      '#ffdd00', false, 8,
    );
  }

  // Approach start: orange arrow, slightly larger
  if (pred.approachStart) {
    drawEventArrow(
      pred.approachStart.x, pred.approachStart.y,
      pred.approachStart.vx, pred.approachStart.vy,
      '#ff8844', true, 10,
    );
    // Double ring to distinguish from entry
    const [mx, my] = ws(pred.approachStart.x, pred.approachStart.y, cam, W, H);
    ctx.beginPath();
    ctx.arc(mx, my, 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff8844';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Impact point marker + distance from LZ (only for landing missions, not station)
  if (pred.impact) {
    const [mx, my] = ws(pred.impact.x, pred.impact.y, cam, W, H);
    const onScreen = mx > 20 && mx < W - 20 && my > 20 && my < H - 20;

    // Red X marker (always)
    if (onScreen) {
      ctx.strokeStyle = '#ff2200';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx - 5, my - 5); ctx.lineTo(mx + 5, my + 5);
      ctx.moveTo(mx + 5, my - 5); ctx.lineTo(mx - 5, my + 5);
      ctx.stroke();
    } else {
      const margin = 38;
      const cx = Math.max(margin, Math.min(W - margin, mx));
      const cy = Math.max(margin, Math.min(H - margin, my));
      const dx = mx - cx, dy = my - cy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 1) {
        const nx = dx / len, ny = dy / len;
        const as = 10;
        ctx.beginPath();
        ctx.moveTo(cx + nx * as, cy + ny * as);
        ctx.lineTo(cx - nx * 4 - ny * as * 0.5, cy - ny * 4 + nx * as * 0.5);
        ctx.lineTo(cx - nx * 4 + ny * as * 0.5, cy - ny * 4 - nx * as * 0.5);
        ctx.closePath();
        ctx.fillStyle = '#ff2200';
        ctx.fill();
      }
    }

    // Distance from LZ short/long (only for landing missions)
    if (!level.station) {
      const impactAngle = Math.atan2(pred.impact.y, pred.impact.x);
      let angleDiff = impactAngle - level.landingSiteAngle;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      const arcDist = Math.abs(angleDiff) * level.planetRadius / 1000;
      const elem = computeElements(s.x, s.y, s.vx, s.vy, level.planetGM);
      const isShort = elem.h < 0 ? angleDiff > 0 : angleDiff < 0;
      const distLabel = arcDist < 1 ? 'ON TARGET' :
        `${arcDist.toFixed(0)}km ${isShort ? 'short' : 'long'}`;
      const distCol = arcDist < 5 ? '#00ffcc' : '#ff6644';
      const labelX = onScreen ? mx : Math.max(60, Math.min(W - 60, mx));
      const labelY = onScreen ? my + 18 : Math.max(50, Math.min(H - 20, my)) - 14;
      ctx.font = '10px monospace';
      ctx.fillStyle = distCol;
      ctx.textAlign = 'center';
      ctx.fillText(distLabel, labelX, labelY);
    }
  }
}

// --- Trail ---
function drawTrail(
  ctx: CanvasRenderingContext2D, cam: OrbitalCamera,
  s: OrbitalState, W: number, H: number,
): void {
  if (s.trail.length < 2) return;

  const now = s.realTime;
  ctx.lineWidth = 2;

  const entries: { x: number; y: number; t: number }[] = [];
  if (s.trail.length < TRAIL_MAX) {
    for (const e of s.trail) entries.push(e);
  } else {
    for (let i = 0; i < TRAIL_MAX; i++) {
      entries.push(s.trail[(s.trailIdx + i) % TRAIL_MAX]);
    }
  }

  let prevSx = 0, prevSy = 0, prevValid = false;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const age = now - e.t;
    if (age > TRAIL_DURATION || age < 0) { prevValid = false; continue; }

    const [sx, sy] = ws(e.x, e.y, cam, W, H);

    if (prevValid) {
      const alpha = 0.6 * (1 - age / TRAIL_DURATION);
      if (alpha > 0.01) {
        ctx.strokeStyle = `rgba(0, 255, 136, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(prevSx, prevSy);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }
    }

    prevSx = sx;
    prevSy = sy;
    prevValid = true;
  }
}

// --- Pe/Ap markers ---
function drawOrbitalMarkers(
  ctx: CanvasRenderingContext2D, cam: OrbitalCamera,
  s: OrbitalState, level: OrbitalLevel, W: number, H: number,
): void {
  const elem = computeElements(s.x, s.y, s.vx, s.vy, level.planetGM);

  // (Pe/Ap diamond markers removed)
}

// --- Ship ---
function drawShip(
  ctx: CanvasRenderingContext2D, cam: OrbitalCamera,
  s: OrbitalState, level: OrbitalLevel, W: number, H: number, time: number,
): void {
  const [sx, sy] = ws(s.x, s.y, cam, W, H);
  const size = 10;
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  // Screen rotation: 0=up, positive=CW. Convert world-angle to screen-angle.
  const screenAngle = Math.atan2(Math.cos(s.renderAngle), Math.sin(s.renderAngle));

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(screenAngle);

  const cabFrontY = -size * 0.82;
  const cabBackY = -size * 0.32;
  const cabHalfFrontW = size * 0.22;
  const cabHalfBackW = size * 0.34;
  const frameX0 = -size * 0.42;
  const frameX1 = size * 0.42;
  const frameY0 = -size * 0.04;
  const frameY1 = size * 1.02;
  const contX0 = -size * 0.28;
  const contX1 = size * 0.28;
  const contY0 = size * 0.12;
  const contY1 = size * 0.86;
  const rearNozzleY = frameY1;
  const rearNozzleLeftX = -size * 0.2;
  const rearNozzleRightX = size * 0.2;
  const sideThrusterY = size * 0.42;
  const sideThrusterX = size * 0.42;

  // Container fill
  ctx.fillStyle = '#102010';
  ctx.fillRect(contX0, contY0, contX1 - contX0, contY1 - contY0);
  ctx.strokeStyle = 'rgba(68, 170, 102, 0.85)';
  ctx.lineWidth = 1;
  ctx.strokeRect(contX0, contY0, contX1 - contX0, contY1 - contY0);
  for (let i = 1; i < 3; i++) {
    const x = contX0 + ((contX1 - contX0) * i) / 3;
    ctx.beginPath();
    ctx.moveTo(x, contY0);
    ctx.lineTo(x, contY1);
    ctx.stroke();
  }

  // Frame
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(frameX0, frameY0, frameX1 - frameX0, frameY1 - frameY0);
  const bracket = size * 0.12;
  for (const [bx, by, dx, dy] of [
    [frameX0, frameY0, 1, 1], [frameX1, frameY0, -1, 1],
    [frameX0, frameY1, 1, -1], [frameX1, frameY1, -1, -1],
  ] as [number, number, number, number][]) {
    ctx.beginPath();
    ctx.moveTo(bx, by + dy * bracket);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + dx * bracket, by);
    ctx.stroke();
  }

  // Cab struts
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-cabHalfBackW * 0.75, cabBackY);
  ctx.lineTo(frameX0 * 0.65, frameY0);
  ctx.moveTo(cabHalfBackW * 0.75, cabBackY);
  ctx.lineTo(frameX1 * 0.65, frameY0);
  ctx.stroke();

  // Cab trapezoid
  ctx.beginPath();
  ctx.moveTo(-cabHalfFrontW, cabFrontY);
  ctx.lineTo(cabHalfFrontW, cabFrontY);
  ctx.lineTo(cabHalfBackW, cabBackY);
  ctx.lineTo(-cabHalfBackW, cabBackY);
  ctx.closePath();
  ctx.fillStyle = '#0a140a';
  ctx.fill();
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cockpit window
  ctx.beginPath();
  ctx.moveTo(-size * 0.13, -size * 0.58);
  ctx.lineTo(0, -size * 0.68);
  ctx.lineTo(size * 0.13, -size * 0.58);
  ctx.strokeStyle = '#00ccff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Rear nozzles
  ctx.strokeStyle = '#557755';
  ctx.lineWidth = 1.2;
  for (const x of [rearNozzleLeftX, rearNozzleRightX]) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.07, rearNozzleY);
    ctx.lineTo(x, rearNozzleY + size * 0.12);
    ctx.lineTo(x + size * 0.07, rearNozzleY);
    ctx.stroke();
  }

  // Thrust flames — bigger in high thrust mode
  const hi = s.highThrust;
  const flicker = 0.7 + 0.3 * Math.sin(time * (hi ? 55 : 40));
  const flameBase = hi ? 24 : 8;
  const flameRcs = hi ? 18 : 6;
  const fw = hi ? 3 : 2;
  const mainCol = hi ? '#ffdd66' : '#ffaa00';
  const retroCol = hi ? '#ffaa44' : '#ff6600';
  const rcsCol = hi ? '#ff8844' : '#ff4400';
  const anyVacuumThrust = !s.inAtmo && (s.thrustPro || s.thrustRetro || s.thrustLeft || s.thrustRight);

  if (anyVacuumThrust) {
    const fl = flameBase * flicker;
    for (const x of [rearNozzleLeftX, rearNozzleRightX]) {
      ctx.beginPath();
      ctx.moveTo(x - size * 0.08, rearNozzleY + size * 0.06);
      ctx.lineTo(x, rearNozzleY + fl);
      ctx.lineTo(x + size * 0.08, rearNozzleY + size * 0.06);
      ctx.strokeStyle = mainCol;
      ctx.lineWidth = fw;
      ctx.stroke();
    }
  } else {
    if (s.thrustPro) {
      const fl = flameBase * flicker;
      for (const x of [rearNozzleLeftX, rearNozzleRightX]) {
        ctx.beginPath();
        ctx.moveTo(x - size * 0.08, rearNozzleY + size * 0.06);
        ctx.lineTo(x, rearNozzleY + fl);
        ctx.lineTo(x + size * 0.08, rearNozzleY + size * 0.06);
        ctx.strokeStyle = mainCol;
        ctx.lineWidth = fw;
        ctx.stroke();
      }
    }
    if (s.thrustRetro) {
      const fl = flameBase * flicker;
      ctx.beginPath();
      ctx.moveTo(-size * 0.11, cabFrontY);
      ctx.lineTo(0, cabFrontY - fl);
      ctx.lineTo(size * 0.11, cabFrontY);
      ctx.strokeStyle = retroCol;
      ctx.lineWidth = fw;
      ctx.stroke();
    }
    if (s.thrustLeft) {
      const fl = flameRcs * flicker;
      ctx.beginPath();
      ctx.moveTo(sideThrusterX, sideThrusterY - size * 0.08);
      ctx.lineTo(sideThrusterX + fl, sideThrusterY);
      ctx.lineTo(sideThrusterX, sideThrusterY + size * 0.08);
      ctx.strokeStyle = rcsCol;
      ctx.lineWidth = fw;
      ctx.stroke();
    }
    if (s.thrustRight) {
      const fl = flameRcs * flicker;
      ctx.beginPath();
      ctx.moveTo(-sideThrusterX, sideThrusterY - size * 0.08);
      ctx.lineTo(-sideThrusterX - fl, sideThrusterY);
      ctx.lineTo(-sideThrusterX, sideThrusterY + size * 0.08);
      ctx.strokeStyle = rcsCol;
      ctx.lineWidth = fw;
      ctx.stroke();
    }
  }

  ctx.restore();

  // Velocity vector line
  if (speed > 0.1) {
    const vLen = 30;
    const vsx = sx + (s.vx / speed) * vLen;
    const vsy = sy - (s.vy / speed) * vLen;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(vsx, vsy);
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Relative velocity vector to station (when in rendezvous proximity)
  if (level.station) {
    const sp = stationPos(level, s.time)!;
    const dx = s.x - sp.x, dy = s.y - sp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const rvx = s.vx - sp.vx, rvy = s.vy - sp.vy;
    const relSpd = Math.sqrt(rvx * rvx + rvy * rvy);
    if (dist < 100_000 && relSpd < level.station.captureMaxSpeed * 10) {
      const maxSpeed = level.station.captureMaxSpeed;
      const allCyan = relSpd <= maxSpeed;
      // Proportional: 40 m/s = 60px
      const scale = 60 / 40; // 1.5 px per m/s
      const ndx = rvx / Math.max(relSpd, 0.1);
      const ndy = rvy / Math.max(relSpd, 0.1);
      // Screen direction (flip Y)
      const sdx = ndx, sdy = -ndy;
      const totalLen = relSpd * scale;

      if (allCyan) {
        // All cyan
        const rvsx = sx + sdx * totalLen;
        const rvsy = sy + sdy * totalLen;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(rvsx, rvsy);
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // First 20m/s cyan, rest orange
        const cyanLen = maxSpeed * scale;
        const cyanX = sx + sdx * cyanLen;
        const cyanY = sy + sdy * cyanLen;
        const rvsx = sx + sdx * totalLen;
        const rvsy = sy + sdy * totalLen;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(cyanX, cyanY);
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cyanX, cyanY);
        ctx.lineTo(rvsx, rvsy);
        ctx.strokeStyle = '#ff6644';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Arrowhead (color matches tip)
      const rvsx = sx + sdx * totalLen;
      const rvsy = sy + sdy * totalLen;
      const aLen = totalLen;
      if (aLen > 5) {
        const px = -sdy, py = sdx;
        ctx.strokeStyle = allCyan ? '#00ffcc' : '#ff6644';
        ctx.beginPath();
        ctx.moveTo(rvsx, rvsy);
        ctx.lineTo(rvsx - sdx * 6 + px * 3, rvsy - sdy * 6 + py * 3);
        ctx.moveTo(rvsx, rvsy);
        ctx.lineTo(rvsx - sdx * 6 - px * 3, rvsy - sdy * 6 - py * 3);
        ctx.stroke();
      }
    }
  }
}

// ===================== HUD =====================

const EARTH_STANDARD_SURFACE_DENSITY = 1.225;

function orbitalTargetPanel(
  s: OrbitalState,
  level: OrbitalLevel,
  pred: PredictionResult,
  peAlt: number,
  apAlt: number,
): { name: string; rows: { label: string; value: string; color?: string }[]; guidance: string } {
  if (level.station) {
    const stationName = orbitalStationName(level);
    const sp = stationPos(level, s.time)!;
    const dx = s.x - sp.x;
    const dy = s.y - sp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const rvx = s.vx - sp.vx;
    const rvy = s.vy - sp.vy;
    const relSpd = Math.sqrt(rvx * rvx + rvy * rvy);
    const distStr = dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${dist.toFixed(0)} m`;
    const capStr = level.station.captureRadius >= 1000 ? `${(level.station.captureRadius / 1000).toFixed(1)} km` : `${level.station.captureRadius.toFixed(0)} m`;
    const rows = [
      { label: 'DIST', value: `${distStr} < ${capStr}`, color: dist < level.station.captureRadius ? COL_SUCCESS : COL_HUD },
      { label: 'REL', value: `${relSpd.toFixed(0)} m/s < ${level.station.captureMaxSpeed.toFixed(0)} m/s`, color: relSpd < level.station.captureMaxSpeed ? COL_SUCCESS : COL_WARNING },
    ];
    const guidance = dist < level.station.captureRadius
      ? `Hold relative speed below ${level.station.captureMaxSpeed.toFixed(0)} m/s.`
      : 'Match speed and close for docking.';
    return { name: stationName, rows, guidance };
  }

  if (level.targetBodyId) {
    const body = getTransferBody(level, level.targetBodyId);
    const pos = body ? transferBodyState(level, body.id, s.time) : null;
    if (body && pos) {
      const dx = s.x - pos.x;
      const dy = s.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const rvx = s.vx - pos.vx;
      const rvy = s.vy - pos.vy;
      const relSpd = Math.sqrt(rvx * rvx + rvy * rvy);
      const rows: { label: string; value: string; color?: string }[] = [];
      if (pred.targetBodyApproach) {
        const ca = pred.targetBodyApproach;
        const flybyMetric = ca.withinArrival ? (ca.flybyAltitude ?? (ca.dist - body.radius)) : ca.dist;
        const flybySense = senseLabel(orbitSense(ca.relX, ca.relY, ca.relVX, ca.relVY));
        const flybyText = `${Math.round(flybyMetric / 1000)} km ${flybySense}`;
        const targetFlyby = body.arrivalAltitudeMin !== undefined && body.arrivalAltitudeMax !== undefined
          ? `${Math.round(body.arrivalAltitudeMin / 1000)}-${Math.round(body.arrivalAltitudeMax / 1000)} km`
          : `< ${Math.round(body.patchRadius / 1000)} km`;
        rows.push({ label: 'FBY', value: `${flybyText}  ${targetFlyby}`, color: ca.impactsBody ? COL_DANGER : (ca.withinArrival ? COL_SUCCESS : COL_WARNING) });
        if (body.arrivalSpeedMarginMin !== undefined && body.arrivalSpeedMarginMax !== undefined) {
          rows.push({ label: 'ARR', value: `${ca.relSpeed.toFixed(0)} m/s  ${body.arrivalSpeedMarginMin.toFixed(0)}-${body.arrivalSpeedMarginMax.toFixed(0)} m/s`, color: ca.withinArrival ? COL_SUCCESS : COL_WARNING });
        }
      } else {
        rows.push({ label: 'DIST', value: `${(dist / 1000).toFixed(0)} km < ${(body.patchRadius / 1000).toFixed(0)} km`, color: dist <= body.patchRadius ? COL_SUCCESS : COL_HUD });
      }
      return {
        name: body.name,
        rows,
        guidance: 'Shape the intercept and arrive inside the target circle.',
      };
    }
  }

  if (level.escapeSOIRadius && (level.escapeTargetBodyId || level.parentTransferPeriapsisAltitude !== undefined)) {
    const rows: { label: string; value: string; color?: string }[] = [];
    const target = escapeTargetForLevel(level, s.time);
    const apText = apAlt === Infinity ? 'ESC' : `${apAlt.toFixed(0)} km`;
    rows.push({ label: 'ApA', value: `${apText} > ${(level.escapeSOIRadius / 1000).toFixed(0)} km`, color: apAlt === Infinity || apAlt * 1000 >= level.escapeSOIRadius - level.planetRadius ? COL_SUCCESS : COL_HUD });
    const current = currentEscapeVector(s, level);
    if (current) {
      rows.push({ label: 'VESC', value: target ? `${current.speed.toFixed(0)} m/s  ${target.speed.toFixed(0)} m/s` : `${current.speed.toFixed(0)} m/s`, color: COL_WARNING });
      if (target) {
        let err = current.angle - target.angle;
        while (err > Math.PI) err -= 2 * Math.PI;
        while (err < -Math.PI) err += 2 * Math.PI;
        rows.push({ label: 'ERR', value: `${(Math.abs(err) * 180 / Math.PI).toFixed(1)}° → 0.0°`, color: Math.abs(err) < 0.12 ? COL_SUCCESS : COL_WARNING });
      }
    }
    const name = level.escapeTargetBodyId
      ? bodyById(level.escapeTargetBodyId).name
      : (() => {
          const body = bodyById(level.bodyId);
          return (body.orbit ? bodyById(body.orbit.parentBodyId).name : body.name);
        })();
    return {
      name,
      rows,
      guidance: 'Line up the escape vector and exit the local SOI.',
    };
  }

  const approachLevel = level.reentryApproachLevelId !== undefined ? approachLevelById(level.reentryApproachLevelId) : undefined;
  return {
    name: approachLevel?.poi.name ?? orbitalBodyName(level),
    rows: [{ label: 'PeA', value: `${peAlt.toFixed(1)} km < ${(level.transitionAltitude / 1000).toFixed(1)} km`, color: peAlt * 1000 <= level.transitionAltitude ? COL_SUCCESS : COL_WARNING }],
    guidance: level.atmoHeight > 0 ? 'Deorbit and land near the LZ.' : 'Descend and enter approach near the target site.',
  };
}

export function drawOrbitalHUD(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
  s: OrbitalState, level: OrbitalLevel,
  state: 'orbiting' | 'enteredAtmo' | 'crashed' | 'docked',
  destinationName: string | undefined,
  destinationLocation: string | undefined,
  phaseDvUsed: number = 0,
  missionDvUsed: number = 0,
  suppressStateOverlays = false,
): void {
  const W = canvas.width, H = canvas.height;
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  const r = Math.sqrt(s.x * s.x + s.y * s.y);
  const altKm = (r - level.planetRadius) / 1000;
  const altMeters = r - level.planetRadius;

  const elem = computeElements(s.x, s.y, s.vx, s.vy, level.planetGM);
  const peAlt = (elem.periapsis - level.planetRadius) / 1000;
  const apAlt = elem.e < 1 ? (elem.apoapsis - level.planetRadius) / 1000 : Infinity;
  const peInAtmo = peAlt < level.atmoHeight / 1000;
  const peBelowCrit = peAlt < level.transitionAltitude / 1000;
  const apInAtmo = apAlt < level.atmoHeight / 1000;
  const apBelowCrit = apAlt < level.transitionAltitude / 1000;
  const escapeApsis = level.escapeSOIRadius ? elem.apoapsis >= level.escapeSOIRadius : false;
  const pred = getCachedPrediction(s, level);
  const predictedImpact = pred.impact !== null;
  const rho = level.atmoHeight > 0 ? atmoDensity(Math.max(0, altMeters), level) : 0;
  const rhoFracStd = rho / EARTH_STANDARD_SURFACE_DENSITY;
  const rhoCol = rhoFracStd > 0.3 ? COL_WARNING : rhoFracStd > 0.05 ? COL_HUD : COL_HUD_DIM;
  const tempCol = s.temperature > 0.7 ? COL_DANGER : s.temperature > 0.3 ? COL_WARNING : COL_HUD;

  ctx.save();

  ctx.font = '13px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = COL_HUD_DIM;
  ctx.fillText(`${level.name}  [g=${(level.planetGM / (level.planetRadius * level.planetRadius)).toFixed(1)}]`, W - 20, 24);

  const lx = 20;
  let ly = 30;
  const lh = 20;
  ctx.font = '14px "Courier New", monospace';
  ctx.textAlign = 'left';

  drawHudLabel(ctx, lx, ly, 'ALT', `${altKm.toFixed(1)} km`, COL_HUD); ly += lh;
  drawHudLabel(ctx, lx, ly, 'SPD', `${speed.toFixed(0)} m/s`, COL_HUD); ly += lh;
  const peCol = peBelowCrit ? '#ff8844' : peInAtmo ? '#ffdd00' : COL_HUD;
  drawHudLabel(ctx, lx, ly, 'PeA', `${peAlt.toFixed(1)} km`, peCol); ly += lh;
  const apCol = (apAlt === Infinity || escapeApsis) ? COL_WARNING : apBelowCrit ? '#ff8844' : apInAtmo ? '#ffdd00' : COL_HUD;
  const apStr = (apAlt === Infinity || escapeApsis) ? 'ESCAPE' : `${apAlt.toFixed(1)} km`;
  drawHudLabel(ctx, lx, ly, 'ApA', apStr, apCol); ly += lh;
  if (level.atmoHeight > 0) {
    drawHudLabel(ctx, lx, ly, 'ATM', `${(rhoFracStd * 100).toFixed(1)}%`, rhoCol); ly += lh;
    drawHudLabel(ctx, lx, ly, 'TEMP', `${(s.temperature * 100).toFixed(0)}%`, tempCol); ly += lh;
  }
  if (s.inAtmo) {
    drawHudLabel(ctx, lx, ly, 'AoA', `${(s.targetAoA * 180 / Math.PI).toFixed(1)}°`, COL_HUD); ly += lh;
  }
  drawHudLabel(ctx, lx, ly, 'ECC', elem.e.toFixed(4), COL_HUD_DIM); ly += lh;
  drawHudLabel(ctx, lx, ly, 'THR', s.highThrust ? 'HIGH' : 'LOW', s.highThrust ? COL_WARNING : COL_HUD_DIM); ly += lh;
  const currentWarpCap = s.inAtmo ? (altKm < level.transitionAltitude / 1000 ? ATMO_LOW_WARP_CAP : ATMO_WARP_CAP) : 999;
  const warpDisplay = s.timeWarp > currentWarpCap ? `${currentWarpCap}x (capped)` : `${s.timeWarp}x`;
  drawHudLabel(ctx, lx, ly, 'WARP', warpDisplay, s.timeWarp > 1 ? COL_WARNING : COL_HUD_DIM); ly += lh;
  drawHudLabel(ctx, lx, ly, 'PH ΔV', `${phaseDvUsed.toFixed(0)} m/s`, COL_HUD); ly += lh;
  drawHudLabel(ctx, lx, ly, 'MIS ΔV', `${missionDvUsed.toFixed(0)} m/s`, COL_HUD); ly += lh;

  const targetPanel = orbitalTargetPanel(s, level, pred, peAlt, apAlt);
  drawHudInfoPanel(ctx, canvas, {
    title: 'DESTINATION',
    name: destinationName ?? targetPanel.name,
    subtitle: destinationLocation,
    rows: targetPanel.rows,
    guidance: targetPanel.guidance,
  });

  if (peInAtmo && state === 'orbiting') {
    const entryPt = pred.approachStart || pred.atmoEntry;
    if (entryPt) {
      const entrySpeed = Math.sqrt(entryPt.vx * entryPt.vx + entryPt.vy * entryPt.vy);
      const rr = Math.sqrt(entryPt.x * entryPt.x + entryPt.y * entryPt.y);
      const radX = entryPt.x / rr, radY = entryPt.y / rr;
      const vr = entryPt.vx * radX + entryPt.vy * radY;
      const vh = Math.sqrt(Math.max(0, entrySpeed * entrySpeed - vr * vr));
      const entryAngle = Math.abs(Math.atan2(-vr, vh)) * 180 / Math.PI;
      ly += 4;
      ctx.font = '13px "Courier New", monospace';
      ctx.fillStyle = '#885544';
      ctx.fillText('ENTRY', lx, ly);
      ctx.fillStyle = '#ff8844';
      ctx.fillText(`${entrySpeed.toFixed(0)} m/s  ${entryAngle.toFixed(1)}°`, lx + 56, ly);
      ly += lh;
    }
  }

  let warnY = 30;
  if (predictedImpact && state === 'orbiting') {
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = COL_DANGER;
    if (Math.sin(Date.now() * 0.012) > -0.3) ctx.fillText('⚠ IMPACT TRAJECTORY', W / 2, warnY);
    warnY += 22;
  } else if (peInAtmo && level.atmoHeight > 0 && state === 'orbiting') {
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = COL_WARNING;
    if (Math.sin(Date.now() * 0.008) > -0.3) ctx.fillText('⚠ AEROBRAKE TRAJECTORY', W / 2, warnY);
    warnY += 22;
  }

  if (s.inAtmo && level.atmoHeight > 0 && state === 'orbiting') {
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff8844';
    ctx.fillText('AEROBRAKING', W / 2, warnY);
    warnY += 22;
  }

  if (level.station && state === 'orbiting') {
    const sp = stationPos(level, s.time)!;
    const dx = s.x - sp.x, dy = s.y - sp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const rvx = s.vx - sp.vx, rvy = s.vy - sp.vy;
    const relSpd = Math.sqrt(rvx * rvx + rvy * rvy);
    if (dist < level.station.captureRadius && relSpd > level.station.captureMaxSpeed) {
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = COL_SUCCESS;
      if (Math.sin(Date.now() * 0.01) > -0.3) ctx.fillText('◇ MATCH SPEED ◇', W / 2, warnY);
      warnY += 22;
    }
  }

  if (!suppressStateOverlays && state === 'enteredAtmo') {
    ctx.fillStyle = 'rgba(0, 20, 0, 0.6)';
    ctx.fillRect(W / 2 - 200, H / 2 - 80, 400, 160);
    ctx.strokeStyle = COL_SUCCESS;
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 200, H / 2 - 80, 400, 160);

    ctx.textAlign = 'center';
    ctx.fillStyle = COL_SUCCESS;
    ctx.font = 'bold 24px monospace';
    ctx.fillText('ENTERING ATMOSPHERE', W / 2, H / 2 - 35);
    ctx.font = '14px monospace';
    ctx.fillText(`Speed: ${speed.toFixed(0)} m/s`, W / 2, H / 2 - 5);
    ctx.fillText(`Altitude: ${altKm.toFixed(1)} km`, W / 2, H / 2 + 15);
    ctx.fillStyle = COL_HUD_DIM;
    ctx.font = '14px monospace';
    ctx.fillText('BACKSPACE: Retry  |  L: Levels', W / 2, H / 2 + 55);
  }

  if (!suppressStateOverlays && state === 'docked') {
    ctx.fillStyle = 'rgba(0, 20, 0, 0.6)';
    ctx.fillRect(W / 2 - 200, H / 2 - 80, 400, 160);
    ctx.strokeStyle = COL_SUCCESS;
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 200, H / 2 - 80, 400, 160);

    ctx.textAlign = 'center';
    ctx.fillStyle = COL_SUCCESS;
    ctx.font = 'bold 28px monospace';
    ctx.fillText('RENDEZVOUS', W / 2, H / 2 - 35);
    ctx.font = '16px monospace';
    ctx.fillText('Successful', W / 2, H / 2 - 5);
    ctx.fillStyle = COL_HUD_DIM;
    ctx.font = '14px monospace';
    ctx.fillText('BACKSPACE: Retry  |  L: Levels', W / 2, H / 2 + 55);
  }

  if (!suppressStateOverlays && state === 'crashed') {
    ctx.fillStyle = 'rgba(20, 0, 0, 0.6)';
    ctx.fillRect(W / 2 - 200, H / 2 - 60, 400, 120);
    ctx.strokeStyle = COL_DANGER;
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 200, H / 2 - 60, 400, 120);

    ctx.textAlign = 'center';
    ctx.fillStyle = COL_DANGER;
    ctx.font = 'bold 28px monospace';
    ctx.fillText('IMPACT', W / 2, H / 2 - 15);
    ctx.fillStyle = COL_HUD_DIM;
    ctx.font = '14px monospace';
    ctx.fillText('BACKSPACE: Retry  |  L: Levels', W / 2, H / 2 + 25);
  }

  if (state === 'orbiting') {
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = COL_HUD_DIM;
    ctx.fillText('W/S: Pro/Retro  A/D: Left/Right  SHIFT: Hi/Lo Thrust  [/]: Warp  BACKSPACE: Restart  L: Levels', W / 2, H - 15);
  }

  ctx.restore();
}
