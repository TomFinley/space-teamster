// Approach phase: atmospheric reentry to reach a target gate.
// Self-contained module: physics, prediction, rendering, HUD.

import { APPROACH_PHASES, ORBITAL_PHASES, type ApproachPhaseDef } from './campaign-content';
import { config } from './config';
import { COL_DANGER, COL_HUD, COL_HUD_DIM, COL_SUCCESS, COL_WARNING, drawHudInfoPanel, drawHudLabel } from './hud-layout';
import { InputState } from './input';
import { landingLevelByPoiId } from './levels';
import { Camera, worldToScreen } from './renderer';
import { type BodyDef, type SurfacePoiDef, type TurbulenceZoneDef, type WindLayerDef, bodyById, stationPoiById, surfacePoiById } from './world';

// ===================== Types =====================

export interface ApproachFrame {
  planetRadius: number;
  planetGM: number;
  landingSiteAngle: number;
  localDir: 1 | -1;
}

export interface ApproachLevel {
  id: number;
  name: string;
  subtitle: string;
  body: BodyDef;
  poi: SurfacePoiDef;
  frame: ApproachFrame;
  gravity: number;
  startX: number;
  startY: number;
  startVX: number;
  startVY: number;
  startAngle: number;
  surfaceDensity: number;
  scaleHeight: number;
  dragNose: number;
  dragBroadside: number;
  dragWingPerRad: number;
  liftBody: number;
  liftWingPerRad: number;
  heatCoeff: number;
  dissipation: number;
  heatCapacity: number;
  wingsMaxTemp: number;
  maxWingAngle: number;
  wingAngleRate: number;
  thrustAccel: number;
  thrustAccelMax: number;
  fuelSeconds: number;
  gateX: number;
  gateY: number;
  gateRadius: number;
  gateMaxSpeed: number;
  gateMinSpeed: number;
  windLayers: WindLayer[];
  turbulence: TurbulenceZone[];
  landingLevelId: number;
  returnToOrbital?: {
    exitAltitude: number;
    orbitalLevelId: number;
  };
  departure?: {
    exitAltitude: number;
    thresholdApoapsisAltitude: number;
    targetOrbitAltitude: number;
    orbitalLevelId: number;
    orbitDir?: 1 | -1;
  };
}

export interface ApproachInitOverride {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  wx?: number;
  wy?: number;
  wvx?: number;
  wvy?: number;
  localDir?: 1 | -1;
}

export type WindLayer = WindLayerDef;

export type TurbulenceZone = TurbulenceZoneDef;

const APPROACH_WARP_SPEEDS = [1, 2, 5];
const EARTH_STANDARD_SURFACE_DENSITY = 1.225;

export interface ApproachState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVel: number;
  worldX: number;
  worldY: number;
  worldVX: number;
  worldVY: number;
  localDir: 1 | -1;
  throttle: number;
  fuel: number;
  dvUsed: number;
  wingsDeployed: boolean;
  wingAngle: number;
  temperature: number;
  alive: boolean;
  gateReached: boolean;
  gateSpeed: number;
  retroFiring: boolean;
  highThrust: boolean;
  timeWarp: number;
  timeWarpLevel: number;
  _foldTimer: number;
  _deployTimer: number;
}

interface TrajectoryPoint {
  x: number;
  y: number;
  temp: number;
  burnedUp: boolean;
}

export interface TrajectoryResult {
  points: TrajectoryPoint[];
  impactX: number | null;
  reachedGate: boolean;
  overheatIdx: number;
  wingFoldIdx: number;
}

function createApproachFrame(poi: SurfacePoiDef): ApproachFrame {
  const body = bodyById(poi.bodyId);
  return {
    planetRadius: body.radius,
    planetGM: body.gm,
    landingSiteAngle: poi.surfaceAngle,
    localDir: -1,
  };
}

function approachEnvironment(body: BodyDef): { windLayers: WindLayer[]; turbulence: TurbulenceZone[] } {
  return {
    windLayers: body.approachEnvironment?.windLayers ?? [],
    turbulence: body.approachEnvironment?.turbulence ?? [],
  };
}

function createDescentApproach(def: ApproachPhaseDef): ApproachLevel {
  const poi = surfacePoiById(def.poiId);
  const body = bodyById(poi.bodyId);
  const atmo = body.atmosphere;
  const airless = !atmo;
  const landingLevel = landingLevelByPoiId(def.landingPoiId ?? poi.id);
  if (!landingLevel) throw new Error(`Missing landing level for ${def.landingPoiId ?? poi.id}`);
  const env = approachEnvironment(body);
  return {
    id: def.id,
    name: `${poi.name} Descent`,
    subtitle: def.subtitle ?? (airless ? 'Powered descent — arrive at the target site' : 'Atmospheric approach — arrive at the target site'),
    body,
    poi,
    frame: createApproachFrame(poi),
    gravity: body.gm / (body.radius * body.radius),
    startX: poi.descentProfile.startX,
    startY: poi.descentProfile.startY,
    startVX: poi.descentProfile.startVX,
    startVY: poi.descentProfile.startVY,
    startAngle: poi.descentProfile.startAngle,
    surfaceDensity: atmo?.surfaceDensity ?? 0,
    scaleHeight: atmo?.scaleHeight ?? 1,
    dragNose: atmo ? 0.000020 : 0,
    dragBroadside: atmo ? 0.00040 : 0,
    dragWingPerRad: atmo ? 0.00015 : 0,
    liftBody: atmo ? 0.00012 : 0,
    liftWingPerRad: atmo ? 0.00085 : 0,
    heatCoeff: atmo ? 1e-5 : 0,
    dissipation: atmo ? 0.08 : 0,
    heatCapacity: atmo ? 3 : 1,
    wingsMaxTemp: atmo ? 0.50 : 1,
    maxWingAngle: atmo ? 1.0 : 0,
    wingAngleRate: atmo ? 1.0 : 0,
    thrustAccel: 15,
    thrustAccelMax: 150,
    fuelSeconds: def.fuelSeconds ?? (atmo ? 85 : 120),
    gateX: 0,
    gateY: poi.descentProfile.gateY,
    gateRadius: poi.descentProfile.gateRadius,
    gateMaxSpeed: poi.descentProfile.gateMaxSpeed,
    gateMinSpeed: poi.descentProfile.gateMinSpeed,
    windLayers: env.windLayers,
    turbulence: env.turbulence,
    landingLevelId: landingLevel.id,
    returnToOrbital: {
      exitAltitude: body.orbitalDefaults.transitionAltitude,
      orbitalLevelId: def.returnToOrbitalLevelId ?? 0,
    },
  };
}

function createDepartureApproach(def: ApproachPhaseDef): ApproachLevel {
  const poi = surfacePoiById(def.poiId);
  const body = bodyById(poi.bodyId);
  const atmo = body.atmosphere;
  const defaults = poi.departureProfile;
  const env = approachEnvironment(body);
  return {
    id: def.id,
    name: `${poi.name} Departure`,
    subtitle: def.subtitle ?? (atmo ? 'Atmospheric departure — build speed for orbit' : 'Launch and build horizontal speed for orbit'),
    body,
    poi,
    frame: createApproachFrame(poi),
    gravity: body.gm / (body.radius * body.radius),
    startX: 0,
    startY: defaults.startY,
    startVX: 0,
    startVY: defaults.startVY,
    startAngle: 0,
    surfaceDensity: atmo?.surfaceDensity ?? 0,
    scaleHeight: atmo?.scaleHeight ?? 1,
    dragNose: atmo ? 0.000020 : 0,
    dragBroadside: atmo ? 0.00040 : 0,
    dragWingPerRad: atmo ? 0.00015 : 0,
    liftBody: atmo ? 0.00012 : 0,
    liftWingPerRad: atmo ? 0.00085 : 0,
    heatCoeff: atmo ? 1e-5 : 0,
    dissipation: atmo ? 0.08 : 0,
    heatCapacity: atmo ? 3 : 1,
    wingsMaxTemp: atmo ? 0.50 : 1,
    maxWingAngle: atmo ? 1.0 : 0,
    wingAngleRate: atmo ? 1.0 : 0,
    thrustAccel: 15,
    thrustAccelMax: 150,
    fuelSeconds: def.fuelSeconds ?? defaults.fuelSeconds,
    gateX: 0,
    gateY: 0,
    gateRadius: 0,
    gateMaxSpeed: 0,
    gateMinSpeed: 0,
    windLayers: env.windLayers,
    turbulence: env.turbulence,
    landingLevelId: 0,
    departure: {
      exitAltitude: def.exitAltitude ?? defaults.exitAltitude,
      thresholdApoapsisAltitude: def.thresholdApoapsisAltitude ?? defaults.thresholdApoapsisAltitude,
      targetOrbitAltitude: def.targetOrbitAltitude ?? defaults.targetOrbitAltitude,
      orbitalLevelId: def.departureOrbitalLevelId ?? 0,
      orbitDir: def.orbitDir ?? defaults.orbitDir,
    },
  };
}

export const APPROACH_LEVELS: ApproachLevel[] = APPROACH_PHASES.map(def =>
  def.kind === 'descent' ? createDescentApproach(def) : createDepartureApproach(def)
);

export function approachLevelById(id: number): ApproachLevel | undefined {
  return APPROACH_LEVELS.find(l => l.id === id);
}

export const DEFAULT_APPROACH_LEVEL = APPROACH_LEVELS[2];

// ===================== State =====================

export function createApproachState(
  level: ApproachLevel,
  override?: ApproachInitOverride,
): ApproachState {
  const init = override ?? {
    x: level.startX, y: level.startY,
    vx: level.startVX, vy: level.startVY,
    angle: level.startAngle,
  };

  const frame = level.frame;
  const airless = level.body.atmosphere === null;
  let localDir: 1 | -1 = override?.localDir ?? frame.localDir;

  let worldX = init.x;
  let worldY = init.y;
  let worldVX = init.vx;
  let worldVY = init.vy;
  let x = init.x;
  let y = init.y;
  let vx = init.vx;
  let vy = init.vy;

  if (override?.wx !== undefined && override?.wy !== undefined && override?.wvx !== undefined && override?.wvy !== undefined) {
    worldX = override.wx;
    worldY = override.wy;
    worldVX = override.wvx;
    worldVY = override.wvy;
    if (override.localDir === undefined) {
      const h = worldX * worldVY - worldY * worldVX;
      if (Math.abs(h) > 1e-6) localDir = h < 0 ? -1 : 1;
    }
  } else {
    const world = localToWorldFrame(init.x, init.y, init.vx, init.vy, frame, localDir);
    worldX = world.wx;
    worldY = world.wy;
    worldVX = world.wvx;
    worldVY = world.wvy;
  }

  if (airless || override?.wx !== undefined) {
    const local = worldToLocalFrame(worldX, worldY, worldVX, worldVY, frame, localDir);
    x = local.x;
    y = local.y;
    vx = local.vx;
    vy = local.vy;
  }

  return {
    x, y, vx, vy,
    angle: init.angle, angularVel: 0,
    worldX, worldY, worldVX, worldVY, localDir,
    throttle: 0, fuel: 0, dvUsed: 0,
    wingsDeployed: false, wingAngle: MIN_WING_ANGLE, temperature: 0,
    alive: true, gateReached: false, gateSpeed: 0, retroFiring: false, highThrust: false,
    timeWarp: 1, timeWarpLevel: 0,
    _foldTimer: 0, _deployTimer: 0,
  };
}

// ===================== Physics =====================

const MIN_WING_ANGLE = 0.087; // ~5 degrees

function effectiveWingMaxAngle(level: ApproachLevel): number {
  return Math.max(level.maxWingAngle, MIN_WING_ANGLE);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function worldToLocalFrame(
  wx: number, wy: number, wvx: number, wvy: number,
  frame: ApproachFrame, localDir: 1 | -1,
): { x: number; y: number; vx: number; vy: number } {
  const r = Math.sqrt(wx * wx + wy * wy);
  const theta = Math.atan2(wy, wx);
  const angleDiff = wrapAngle(theta - frame.landingSiteAngle);
  const radX = wx / r;
  const radY = wy / r;
  const tanX = -radY * localDir;
  const tanY = radX * localDir;
  return {
    x: angleDiff * frame.planetRadius * localDir,
    y: r - frame.planetRadius,
    vx: wvx * tanX + wvy * tanY,
    vy: wvx * radX + wvy * radY,
  };
}

function localToWorldFrame(
  x: number, y: number, vx: number, vy: number,
  frame: ApproachFrame, localDir: 1 | -1,
): { wx: number; wy: number; wvx: number; wvy: number } {
  const theta = frame.landingSiteAngle + x / (frame.planetRadius * localDir);
  const r = frame.planetRadius + y;
  const radX = Math.cos(theta);
  const radY = Math.sin(theta);
  const tanX = -radY * localDir;
  const tanY = radX * localDir;
  return {
    wx: radX * r,
    wy: radY * r,
    wvx: tanX * vx + radX * vy,
    wvy: tanY * vx + radY * vy,
  };
}

function impactCrossX(prevX: number, prevY: number, x: number, y: number, level: ApproachLevel): number {
  const prevGround = getApproachTerrainHeight(prevX, level);
  const ground = getApproachTerrainHeight(x, level);
  const prevClearance = prevY - prevGround;
  const clearance = y - ground;
  const denom = prevClearance - clearance;
  if (Math.abs(denom) < 1e-6) return x;
  const t = clamp(prevClearance / denom, 0, 1);
  return prevX + (x - prevX) * t;
}

export function getApproachApoapsisAltitude(s: ApproachState, level: ApproachLevel): number | null {
  const planetRadius = level.frame.planetRadius;
  const planetGM = level.frame.planetGM;
  let wx = s.worldX;
  let wy = s.worldY;
  let wvx = s.worldVX;
  let wvy = s.worldVY;

  if (level.body.atmosphere !== null) {
    const world = localToWorldFrame(s.x, s.y, s.vx, s.vy, level.frame, level.frame.localDir);
    wx = world.wx; wy = world.wy; wvx = world.wvx; wvy = world.wvy;
  }

  const r = Math.sqrt(wx * wx + wy * wy);
  const v2 = wvx * wvx + wvy * wvy;
  const energy = v2 * 0.5 - planetGM / r;
  const h = wx * wvy - wy * wvx;
  const e2 = 1 + (2 * energy * h * h) / (planetGM * planetGM);
  const e = Math.sqrt(Math.max(0, e2));

  if (energy >= 0 || e >= 1) return Infinity;

  const a = -planetGM / (2 * energy);
  return a * (1 + e) - planetRadius;
}

function density(y: number, level: ApproachLevel): number {
  if (y <= 0) return level.surfaceDensity;
  return level.surfaceDensity * Math.exp(-y / level.scaleHeight);
}

/** Get wind acceleration at altitude (horizontal, m/s²). Time-evolving. */
function getWind(y: number, level: ApproachLevel, time: number = 0): number {
  let wind = 0;
  for (let i = 0; i < level.windLayers.length; i++) {
    const w = level.windLayers[i];
    // Slowly evolve width and strength over time
    // Each layer gets a unique phase offset from its index
    const phase = i * 2.17;
    const widthMod = 1 + 0.3 * Math.sin(time * 0.08 + phase);
    const strengthMod = 1 + 0.25 * Math.sin(time * 0.06 + phase + 1.3)
                          + 0.1 * Math.sin(time * 0.15 + phase * 0.7);
    const curWidth = w.altitudeWidth * widthMod;
    const curStrength = w.strength * strengthMod;

    const dist = Math.abs(y - w.altitudeCenter);
    if (dist < curWidth) {
      const t = dist / curWidth;
      wind += curStrength * (1 - t * t);
    }
  }
  return wind;
}

/** Get current wind layer params for rendering (time-evolved). */
function getWindLayerParams(w: WindLayer, idx: number, time: number) {
  const phase = idx * 2.17;
  const widthMod = 1 + 0.3 * Math.sin(time * 0.08 + phase);
  const strengthMod = 1 + 0.25 * Math.sin(time * 0.06 + phase + 1.3)
                        + 0.1 * Math.sin(time * 0.15 + phase * 0.7);
  return {
    altitudeCenter: w.altitudeCenter,
    altitudeWidth: w.altitudeWidth * widthMod,
    strength: w.strength * strengthMod,
  };
}

/** Get turbulence torque (random rotational force, rad/s²). */
function getTurbulenceTorque(
  x: number, y: number, time: number, level: ApproachLevel,
): number {
  let torque = 0;
  for (const z of level.turbulence) {
    if (y >= z.altitudeMin && y <= z.altitudeMax) {
      const edgeDist = Math.min(y - z.altitudeMin, z.altitudeMax - y);
      const edgeFade = clamp(edgeDist / 500, 0, 1);
      const hash = Math.sin(x * 0.001 + y * 0.0013 + time * 3.7) *
                   Math.cos(x * 0.0007 + time * 5.3) +
                   Math.sin(y * 0.0008 + time * 4.9) * 0.5;
      torque += hash * z.strength * edgeFade;
    }
  }
  return torque;
}

/** Check if currently in turbulence zone. */
function inTurbulence(y: number, level: ApproachLevel): boolean {
  for (const z of level.turbulence) {
    if (y >= z.altitudeMin && y <= z.altitudeMax) return true;
  }
  return false;
}

/** Compute aero accelerations and heat rate for a given state snapshot. */
function aeroForces(
  x: number, y: number, vx: number, vy: number,
  angle: number, wingAngle: number,
  level: ApproachLevel,
): { ax: number; ay: number; heatRate: number; aoa: number } {
  const speed = Math.sqrt(vx * vx + vy * vy);
  const rho = density(y, level);
  let ax = 0, ay = 0, heatRate = 0, aoa = 0;

  if (speed < 1 || rho < 1e-7) return { ax, ay, heatRate, aoa };

  // AoA: angle between velocity and ship nose
  const velAngle = Math.atan2(vx, vy);
  aoa = velAngle - angle;
  while (aoa > Math.PI) aoa -= 2 * Math.PI;
  while (aoa < -Math.PI) aoa += 2 * Math.PI;

  // Body drag from cross-section: nose-first = min, broadside = max
  const sinA = Math.sin(aoa);
  const cosA = Math.cos(aoa);
  let Cd = level.dragNose * cosA * cosA + level.dragBroadside * sinA * sinA;

  // Wing drag (additive)
  Cd += wingAngle * level.dragWingPerRad;

  const q = 0.5 * rho * speed * speed;

  // Drag
  const dragA = q * Cd;
  ax -= (vx / speed) * dragA;
  ay -= (vy / speed) * dragA;

  // Lift: body (always) + wings (when deployed)
  const Cl = level.liftBody + wingAngle * level.liftWingPerRad;
  if (Cl > 0.00001) {
    const aoaEff = Math.abs(Math.sin(aoa) * Math.cos(aoa));
    const liftA = q * Cl * aoaEff;

    // Lift direction: component of nose perpendicular to velocity
    const noseX = Math.sin(angle);
    const noseY = Math.cos(angle);
    const vdx = vx / speed, vdy = vy / speed;
    const dot = noseX * vdx + noseY * vdy;
    let px = noseX - dot * vdx;
    let py = noseY - dot * vdy;
    const pl = Math.sqrt(px * px + py * py);
    if (pl > 0.001) {
      px /= pl; py /= pl;
      ax += px * liftA;
      ay += py * liftA;
    }
  }

  // Heat proportional to drag * speed (more drag = more friction heating)
  heatRate = dragA * speed * level.heatCoeff;

  return { ax, ay, heatRate, aoa };
}

export function updateApproach(
  s: ApproachState, input: InputState, level: ApproachLevel, dt: number, time: number,
): void {
  if (!s.alive || s.gateReached) return;

  // --- High thrust toggle ---
  s.highThrust = input.toggleHighThrust; // hold Shift for high thrust
  const effThrust = s.highThrust ? level.thrustAccelMax : level.thrustAccel;

  // --- Deployables ---
  if (input.toggleWings && !s.wingsDeployed) {
    s.wingsDeployed = true;
    s.wingAngle = MIN_WING_ANGLE;
  }
  if (s.wingsDeployed) {
    const wingMaxAngle = effectiveWingMaxAngle(level);
    if (input.wingAngleUp) {
      s.wingAngle = clamp(s.wingAngle + level.wingAngleRate * dt, MIN_WING_ANGLE, wingMaxAngle);
    }
    if (input.wingAngleDown) {
      s.wingAngle = clamp(s.wingAngle - level.wingAngleRate * dt, MIN_WING_ANGLE, wingMaxAngle);
    }
  }
  if (s.wingsDeployed && input.wingAngleDown && s.wingAngle <= MIN_WING_ANGLE + 0.001) {
    s._foldTimer = (s._foldTimer ?? 0) + dt;
    if (s._foldTimer >= 0.5) { s.wingsDeployed = false; s._foldTimer = 0; }
  } else {
    s._foldTimer = 0;
  }
  if (!s.wingsDeployed && input.wingAngleUp) {
    s._deployTimer = (s._deployTimer ?? 0) + dt;
    if (s._deployTimer >= 0.5) {
      s.wingsDeployed = true;
      s.wingAngle = MIN_WING_ANGLE;
      s._deployTimer = 0;
    }
  } else {
    s._deployTimer = 0;
  }
  if (s.temperature > level.wingsMaxTemp && s.wingsDeployed) {
    s.wingAngle = clamp(s.wingAngle - level.wingAngleRate * dt, MIN_WING_ANGLE, effectiveWingMaxAngle(level));
    if (s.wingAngle <= MIN_WING_ANGLE + 0.001) s.wingsDeployed = false;
  }

  const canBurn = true;
  if (input.throttleUp && canBurn) {
    s.throttle = clamp(s.throttle + 2.5 * dt, 0, 1);
  } else if (!input.throttleDown) {
    s.throttle = clamp(s.throttle - 3.0 * dt, 0, 1);
  }

  let angAccel = 0;
  if (Math.abs(input.pitch) > 0.01) angAccel += input.pitch * config.rcsAngularAccel;
  angAccel -= s.angularVel * config.angularDrag;

  s.retroFiring = false;
  const airless = level.body.atmosphere === null;

  if (airless) {
    const r = Math.sqrt(s.worldX * s.worldX + s.worldY * s.worldY);
    const radX = s.worldX / r;
    const radY = s.worldY / r;
    const tanX = -radY * s.localDir;
    const tanY = radX * s.localDir;
    const g = level.frame.planetGM / (r * r);
    let ax = -g * radX;
    let ay = -g * radY;

    if (s.throttle > 0.01 && canBurn) {
      const t = s.throttle * effThrust;
      const noseX = Math.sin(s.angle);
      const noseY = Math.cos(s.angle);
      ax += (tanX * noseX + radX * noseY) * t;
      ay += (tanY * noseX + radY * noseY) * t;
      s.dvUsed += t * dt;
    }

    if (input.throttleDown && canBurn) {
      const t = effThrust;
      const noseX = Math.sin(s.angle);
      const noseY = Math.cos(s.angle);
      ax -= (tanX * noseX + radX * noseY) * t;
      ay -= (tanY * noseX + radY * noseY) * t;
      s.dvUsed += t * dt;
      s.retroFiring = true;
    }

    s.angularVel += angAccel * dt;
    s.angle = wrapAngle(s.angle + s.angularVel * dt);

    s.worldVX += ax * dt;
    s.worldVY += ay * dt;
    s.worldX += s.worldVX * dt;
    s.worldY += s.worldVY * dt;

    const local = worldToLocalFrame(s.worldX, s.worldY, s.worldVX, s.worldVY, level.frame, s.localDir);
    s.x = local.x;
    s.y = local.y;
    s.vx = local.vx;
    s.vy = local.vy;
  } else {
    const effectiveWing = s.wingsDeployed ? s.wingAngle : 0;
    const { ax: aeroAx, ay: aeroAy, heatRate } = aeroForces(
      s.x, s.y, s.vx, s.vy, s.angle, effectiveWing, level,
    );
    let ax = aeroAx;
    let ay = -level.gravity + aeroAy;

    ax += getWind(s.y, level, time);
    angAccel += getTurbulenceTorque(s.x, s.y, time, level);

    if (s.throttle > 0.01 && canBurn) {
      const t = s.throttle * effThrust;
      ax += Math.sin(s.angle) * t;
      ay += Math.cos(s.angle) * t;
      s.dvUsed += t * dt;
    }

    if (input.throttleDown && canBurn) {
      const t = effThrust;
      ax -= Math.sin(s.angle) * t;
      ay -= Math.cos(s.angle) * t;
      s.dvUsed += t * dt;
      s.retroFiring = true;
    }

    s.temperature += (heatRate / level.heatCapacity - level.dissipation * s.temperature) * dt;
    s.temperature = clamp(s.temperature, 0, 1.5);
    if (s.temperature >= 1.0) { s.alive = false; return; }

    s.angularVel += angAccel * dt;
    s.angle = wrapAngle(s.angle + s.angularVel * dt);

    s.vx += ax * dt;
    s.vy += ay * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  }

  if (s.y <= getApproachTerrainHeight(s.x, level)) { s.alive = false; return; }

  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  const inGateX = s.x >= level.gateX - level.gateRadius && s.x <= level.gateX + level.gateRadius;
  const terrainAtGate = getApproachTargetHeight(s.x, level);
  const inGateY = s.y >= terrainAtGate && s.y <= level.gateY + terrainAtGate;
  if (inGateX && inGateY && speed <= level.gateMaxSpeed && speed >= level.gateMinSpeed) {
    s.gateReached = true;
    s.gateSpeed = speed;
  }

  if (level.departure) {
    const apa = getApproachApoapsisAltitude(s, level);
    if (s.y >= level.departure.exitAltitude && apa !== null && apa >= level.departure.thresholdApoapsisAltitude) {
      s.gateReached = true;
      s.gateSpeed = Math.abs(s.vx);
    }
  }
}

// ===================== Trajectory Prediction =====================

export function predictTrajectory(
  s: ApproachState, level: ApproachLevel,
  predTime: number = 0, maxTime = 180, step = 0.4,
  includeWind: boolean = true,
  includeTerrain: boolean = true,
): TrajectoryResult {
  const points: TrajectoryPoint[] = [];
  let impactX: number | null = null;
  let reachedGate = false;
  let overheatIdx = -1;
  let wingFoldIdx = -1;
  let temp = s.temperature;
  const angle = s.angle;
  const wing = s.wingsDeployed ? s.wingAngle : 0;
  let dead = false;
  let prevTooHot = temp >= level.wingsMaxTemp;
  const airless = level.body.atmosphere === null;

  if (airless) {
    let wx = s.worldX, wy = s.worldY, wvx = s.worldVX, wvy = s.worldVY;
    let prevLocal = worldToLocalFrame(wx, wy, wvx, wvy, level.frame, s.localDir);

    for (let t = 0; t < maxTime; t += step) {
      const r = Math.sqrt(wx * wx + wy * wy);
      const g = level.frame.planetGM / (r * r);
      const ax = -g * (wx / r);
      const ay = -g * (wy / r);

      wvx += ax * step;
      wvy += ay * step;
      wx += wvx * step;
      wy += wvy * step;

      const local = worldToLocalFrame(wx, wy, wvx, wvy, level.frame, s.localDir);
      points.push({ x: local.x, y: local.y, temp: clamp(temp, 0, 1), burnedUp: false });

      if (!reachedGate) {
        const inGX = local.x >= level.gateX - level.gateRadius && local.x <= level.gateX + level.gateRadius;
        const tAtGate = getApproachTargetHeight(local.x, level);
        const inGY = local.y >= tAtGate && local.y <= level.gateY + tAtGate;
        if (inGX && inGY) reachedGate = true;
      }

      const impactHeight = includeTerrain ? getApproachTerrainHeight(local.x, level) : 0;
      if (local.y <= impactHeight) {
        impactX = impactCrossX(prevLocal.x, prevLocal.y - impactHeight, local.x, local.y - impactHeight, level);
        break;
      }
      prevLocal = local;
    }

    return { points, impactX, reachedGate, overheatIdx, wingFoldIdx };
  }

  let x = s.x, y = s.y, vx = s.vx, vy = s.vy;
  let prevX = x, prevY = y;

  for (let t = 0; t < maxTime; t += step) {
    const { ax: aax, ay: aay, heatRate } = aeroForces(x, y, vx, vy, angle, wing, level);
    let ax = aax + (includeWind ? getWind(y, level, predTime) : 0);
    const ay = -level.gravity + aay;

    temp += (heatRate / level.heatCapacity - level.dissipation * temp) * step;
    const tooHotForWings = temp >= level.wingsMaxTemp;
    if (wingFoldIdx < 0) {
      if (points.length === 0) {
        // first point — set initial state
      } else if (!prevTooHot && tooHotForWings) {
        wingFoldIdx = points.length;
      } else if (prevTooHot && !tooHotForWings) {
        wingFoldIdx = points.length;
      }
    }
    prevTooHot = tooHotForWings;
    if (temp >= 1.0 && overheatIdx < 0) overheatIdx = points.length;
    if (temp >= 1.0) dead = true;
    temp = clamp(temp, 0, 1.5);

    prevX = x; prevY = y;
    vx += ax * step;
    vy += ay * step;
    x += vx * step;
    y += vy * step;

    points.push({ x, y, temp: clamp(temp, 0, 1), burnedUp: dead });

    if (!dead && !reachedGate) {
      const inGX = x >= level.gateX - level.gateRadius && x <= level.gateX + level.gateRadius;
      const tAtGate = getApproachTargetHeight(x, level);
      const inGY = y >= tAtGate && y <= level.gateY + tAtGate;
      if (inGX && inGY) reachedGate = true;
    }
    const impactHeight = includeTerrain ? getApproachTerrainHeight(x, level) : 0;
    if (y <= impactHeight) {
      impactX = impactCrossX(prevX, prevY - impactHeight, x, y - impactHeight, level);
      break;
    }
  }
  return { points, impactX, reachedGate, overheatIdx, wingFoldIdx };
}

// ===================== Camera =====================

export interface ApproachCamera {
  x: number; y: number; zoom: number;
}

export function createApproachCamera(level: ApproachLevel): ApproachCamera {
  return { x: level.startX, y: level.startY, zoom: 0.015 };
}

export function updateApproachCamera(
  cam: ApproachCamera, s: ApproachState, level: ApproachLevel,
  dt: number, W: number, H: number,
): void {
  const smooth = 1 - Math.exp(-2.0 * dt);

  const baseZoom = 0.04;
  const maxZoom = baseZoom * 2;
  const minZoom = baseZoom * 0.2;

  if (level.departure) {
    const exitAlt = level.departure.exitAltitude;
    const hDist = Math.max(1500, Math.abs(s.vx) * 10 + 2000);
    const vDist = Math.max(s.y, exitAlt) + 600;
    const targetZoom = clamp(Math.min((W * 0.75) / hDist, (H * 0.8) / vDist), minZoom, maxZoom);
    cam.zoom += (targetZoom - cam.zoom) * smooth;

    const viewW = W / cam.zoom;
    const viewH = H / cam.zoom;
    const groundH = getApproachTargetHeight(s.x, level);
    const shipTopCy = s.y - 0.33 * viewH;
    const groundCy = groundH + 0.38 * viewH;
    const cx = s.x + clamp(s.vx * 2.5, -viewW * 0.2, viewW * 0.2);
    const cy = Math.max(shipTopCy, Math.min(s.y, groundCy));

    cam.x += (cx - cam.x) * smooth;
    cam.y += (cy - cam.y) * smooth;
    return;
  }

  // Fit both ship and gate horizontally in ~80% of screen
  const hDist = Math.abs(level.gateX - s.x) + level.gateRadius;
  const zoomForH = (W * 0.8) / Math.max(hDist, 100);

  // Fit ship, elevated target gate, and actual ground vertically in ~80% of screen.
  const targetBaseY = getApproachTargetHeight(level.gateX, level);
  const terrainY = getApproachTerrainHeight(level.gateX, level);
  const highY = Math.max(s.y, targetBaseY + level.gateY);
  const lowY = Math.min(s.y, terrainY);
  const vDist = highY - lowY + 1000;
  const zoomForV = (H * 0.8) / Math.max(vDist, 100);

  const targetZoom = clamp(Math.min(zoomForH, zoomForV), minZoom, maxZoom);
  cam.zoom += (targetZoom - cam.zoom) * smooth;

  const z = cam.zoom;
  const viewW = W / z;
  const viewH = H / z;

  let cx = s.x;
  let cy = s.y;

  const gateX = level.gateX;
  if (gateX > s.x) {
    const gateCx = gateX - viewW * 0.4;
    const shipLimitCx = s.x + viewW * 0.4;
    cx = Math.min(gateCx, shipLimitCx);
    cx = Math.max(cx, s.x);
  } else {
    const gateCx = gateX + viewW * 0.4;
    const shipLimitCx = s.x - viewW * 0.4;
    cx = Math.max(gateCx, shipLimitCx);
    cx = Math.min(cx, s.x);
  }

  const terrainH = getApproachTerrainHeight(s.x, level);
  const targetH = getApproachTargetHeight(level.gateX, level);
  const lowVisibleCy = terrainH + 0.46 * viewH;
  const highVisibleCy = Math.max(s.y, targetH + level.gateY) - 0.46 * viewH;
  cy = Math.max(highVisibleCy, Math.min(s.y, lowVisibleCy));

  cam.x += (cx - cam.x) * smooth;
  cam.y += (cy - cam.y) * smooth;
}

// ===================== Rendering =====================

const COL_GATE = '#00ffcc';
const COL_GATE_DIM = '#007766';
const COL_GROUND = '#224422';

function ws(wx: number, wy: number, cam: ApproachCamera, W: number, H: number): [number, number] {
  return [
    (wx - cam.x) * cam.zoom + W / 2,
    -(wy - cam.y) * cam.zoom + H / 2,
  ];
}

// ===================== Approach Terrain (Perlin noise) =====================

// Simple 1D value noise with smooth interpolation
function noiseHash(n: number): number {
  // Deterministic pseudo-random from integer
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function smoothNoise(x: number): number {
  const ix = Math.floor(x);
  const fx = x - ix;
  // Smoothstep
  const t = fx * fx * (3 - 2 * fx);
  return noiseHash(ix) * (1 - t) + noiseHash(ix + 1) * t;
}

function perlin1D(x: number, freq: number, seed: number): number {
  return smoothNoise(x * freq + seed) * 2 - 1; // -1 to 1
}

/** Get approach terrain height at world x. Two octaves of Perlin noise. */
function getApproachTerrainHeight(x: number, level?: ApproachLevel): number {
  // Large rolling hills
  const h1 = perlin1D(x, 0.00008, 42.0) * 1200;
  // Medium detail
  const h2 = perlin1D(x, 0.0003, 97.0) * 400;
  return Math.max(0, h1 + h2 + 300); // offset so average is ~300m, min 0
}

function getApproachTargetHeight(x: number, level: ApproachLevel): number {
  return level.poi.altitude || getApproachTerrainHeight(x, level);
}

function tempColor(t: number): string {
  if (t < 0.25) return '#00ff88';
  if (t < 0.50) return '#aaff00';
  if (t < 0.70) return '#ffaa00';
  if (t < 0.85) return '#ff6600';
  return '#ff2200';
}

export function renderApproach(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
  cam: ApproachCamera, s: ApproachState, level: ApproachLevel, time: number,
): void {
  const W = canvas.width, H = canvas.height;

  // --- Background: atmosphere gradient ---
  drawAtmoBackground(ctx, cam, W, H, level);

  // --- Terrain (Perlin noise ground) ---
  drawApproachTerrain(ctx, cam, level, W, H);


  // --- Wind layers ---
  drawWindLayers(ctx, cam, level, W, H, time);

  // --- Trajectory preview ---
  drawTrajectory(ctx, cam, s, level, W, H, time);

  if (level.departure) {
    drawDepartureTarget(ctx, cam, level, W, H);
  } else {
    drawGate(ctx, cam, s, level, W, H);
  }

  // --- Ship ---
  drawApproachShip(ctx, cam, s, level, W, H, time);
}

function drawAtmoBackground(
  ctx: CanvasRenderingContext2D, cam: ApproachCamera,
  W: number, H: number, level: ApproachLevel,
): void {
  // Sample altitude at top and bottom of screen
  const topY = cam.y + H / (2 * cam.zoom);
  const botY = cam.y - H / (2 * cam.zoom);

  // Draw bands
  const bands = 30;
  for (let i = 0; i < bands; i++) {
    const frac = i / bands;
    const alt = topY + (botY - topY) * frac;
    const rho = density(Math.max(0, alt), level);

    // Space is dark, atmosphere adds blue then orange near ground
    const atmoFrac = level.surfaceDensity > 0 ? Math.min(1, rho / (level.surfaceDensity * 0.3)) : 0;
    const r = Math.floor(5 + atmoFrac * 15);
    const g = Math.floor(5 + atmoFrac * 20);
    const b = Math.floor(16 + atmoFrac * 40);
    ctx.fillStyle = `rgb(${r},${g},${b})`;

    const sy = (frac * H);
    const sh = H / bands + 1;
    ctx.fillRect(0, sy, W, sh);
  }
}

function drawApproachTerrain(
  ctx: CanvasRenderingContext2D, cam: ApproachCamera, level: ApproachLevel, W: number, H: number,
): void {
  // Always draw the planetary ground. Elevated targets (e.g. Cloud City) are handled by
  // target/gate overlays, not by moving the terrain itself.

  // One sample every ~4 screen pixels
  const pixelsPerSample = 4;
  const numSamples = Math.ceil(W / pixelsPerSample) + 2;
  const worldPerPixel = 1 / cam.zoom;
  const worldStep = pixelsPerSample * worldPerPixel;
  const viewLeft = cam.x - W / (2 * cam.zoom);
  const startWorldX = viewLeft - worldStep;

  // Build terrain points
  ctx.beginPath();
  let firstSx = 0, firstSy = 0;
  for (let i = 0; i <= numSamples; i++) {
    const wx = startWorldX + i * worldStep;
    const wy = getApproachTerrainHeight(wx, level);
    const [sx, sy] = ws(wx, wy, cam, W, H);
    if (i === 0) { ctx.moveTo(sx, sy); firstSx = sx; }
    else ctx.lineTo(sx, sy);
  }
  // Close at bottom of screen
  const lastSx = firstSx + numSamples * pixelsPerSample;
  ctx.lineTo(lastSx + 10, H + 10);
  ctx.lineTo(firstSx - 10, H + 10);
  ctx.closePath();
  ctx.fillStyle = level.body.terrainFillColor ?? '#060c06';
  ctx.fill();

  // Outline
  ctx.beginPath();
  for (let i = 0; i <= numSamples; i++) {
    const wx = startWorldX + i * worldStep;
    const wy = getApproachTerrainHeight(wx, level);
    const [sx, sy] = ws(wx, wy, cam, W, H);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.strokeStyle = level.body.terrainStrokeColor ?? COL_GROUND;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.strokeStyle = level.body.terrainBrightColor ?? level.body.terrainStrokeColor ?? COL_GROUND;
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

function drawWindLayers(
  ctx: CanvasRenderingContext2D, cam: ApproachCamera,
  level: ApproachLevel, W: number, H: number, time: number,
): void {
  for (let i = 0; i < level.windLayers.length; i++) {
    const w = getWindLayerParams(level.windLayers[i], i, time);
    const topAlt = w.altitudeCenter + w.altitudeWidth;
    const botAlt = w.altitudeCenter - w.altitudeWidth;
    const [, syTop] = ws(0, topAlt, cam, W, H);
    const [, syBot] = ws(0, botAlt, cam, W, H);

    // Skip if off screen
    if (syTop > H + 10 || syBot < -10) continue;

    const bandH = syBot - syTop;
    if (bandH < 1) continue;

    // Color: blue-ish for headwind (negative), orange-ish for tailwind (positive)
    const isHead = w.strength < 0;
    const alpha = clamp(Math.abs(w.strength) / 15, 0.02, 0.07);
    ctx.fillStyle = isHead
      ? `rgba(60, 100, 200, ${alpha})`
      : `rgba(200, 150, 60, ${alpha})`;
    ctx.fillRect(0, syTop, W, bandH);

    // Arrow indicators showing wind direction
    const arrowSpacing = 120;
    const arrowSize = Math.min(12, bandH * 0.3);
    const syMid = (syTop + syBot) / 2;
    ctx.strokeStyle = isHead
      ? `rgba(80, 140, 255, ${alpha * 3})`
      : `rgba(255, 200, 80, ${alpha * 3})`;
    ctx.lineWidth = 1.5;

    for (let sx = arrowSpacing / 2; sx < W; sx += arrowSpacing) {
      const dir = w.strength > 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(sx - dir * arrowSize, syMid - arrowSize * 0.4);
      ctx.lineTo(sx + dir * arrowSize, syMid);
      ctx.lineTo(sx - dir * arrowSize, syMid + arrowSize * 0.4);
      ctx.stroke();
    }

    // Label at left edge
    const [, syLabel] = ws(0, w.altitudeCenter, cam, W, H);
    if (syLabel > 10 && syLabel < H - 10) {
      ctx.font = '10px monospace';
      ctx.fillStyle = isHead ? 'rgba(80, 140, 255, 0.6)' : 'rgba(255, 200, 80, 0.6)';
      ctx.textAlign = 'left';
      const label = isHead ? `← ${Math.abs(w.strength).toFixed(0)} m/s²` : `→ ${w.strength.toFixed(0)} m/s²`;
      ctx.fillText(label, 8, syLabel + 3);
    }
  }
}

function drawTrajectory(
  ctx: CanvasRenderingContext2D, cam: ApproachCamera,
  s: ApproachState, level: ApproachLevel, W: number, H: number, time: number,
): void {
  const result = predictTrajectory(s, level, time);
  const pts = result.points;
  if (pts.length < 2) return;

  ctx.lineWidth = 2;
  const dashLen = 8;
  let dashOn = true;
  let dashAccum = 0;

  for (let i = 1; i < pts.length; i++) {
    const [sx0, sy0] = ws(pts[i - 1].x, pts[i - 1].y, cam, W, H);
    const [sx1, sy1] = ws(pts[i].x, pts[i].y, cam, W, H);

    if ((sx0 < -200 && sx1 < -200) || (sx0 > W + 200 && sx1 > W + 200)) continue;
    if ((sy0 < -200 && sy1 < -200) || (sy0 > H + 200 && sy1 > H + 200)) continue;

    const segLen = Math.sqrt((sx1 - sx0) ** 2 + (sy1 - sy0) ** 2);
    dashAccum += segLen;
    if (dashAccum > dashLen) {
      dashOn = !dashOn;
      dashAccum -= dashLen;
    }

    if (dashOn) {
      ctx.strokeStyle = pts[i].burnedUp ? '#ff2200' : tempColor(pts[i].temp);
      ctx.globalAlpha = pts[i].burnedUp ? 0.4 : 0.7;
      ctx.beginPath();
      ctx.moveTo(sx0, sy0);
      ctx.lineTo(sx1, sy1);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  if (level.departure) return;

  // Impact point marker + distance indicator (always visible)
  const last = pts[pts.length - 1];
  if (last) {
    const [lsx, lsy] = ws(last.x, Math.max(last.y, 0), cam, W, H);
    const hasImpact = result.impactX !== null;
    const endX = result.impactX ?? last.x;
    const diff = endX - level.gateX;
    const onTarget = hasImpact && Math.abs(diff) < level.gateRadius;

    // X marker at impact/end point (if on screen)
    if (lsx > -50 && lsx < W + 50 && lsy > -50 && lsy < H + 50) {
      if (onTarget) {
        ctx.beginPath();
        ctx.arc(lsx, lsy, 7, 0, Math.PI * 2);
        ctx.strokeStyle = COL_GATE;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#ff2200';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lsx - 6, lsy - 6); ctx.lineTo(lsx + 6, lsy + 6);
        ctx.moveTo(lsx + 6, lsy - 6); ctx.lineTo(lsx - 6, lsy + 6);
        ctx.stroke();
      }
    }

    // Label: impact distance, escape, or generic long if prediction runs out
    let tag: string | null = null;
    let tagCol = '#ff6644';
    if (onTarget) {
      tag = 'ON TARGET';
      tagCol = '#00ffcc';
    } else if (!hasImpact) {
      if (level.returnToOrbital && last.y >= level.returnToOrbital.exitAltitude) {
        tag = 'ESCAPE';
      }
    } else {
      const distKm = Math.abs(diff) / 1000;
      // Short/long is defined relative to the side you are approaching from:
      // from left: short=left of target, long=right of target
      // from right: short=right of target, long=left of target
      const approachingFromRight = s.x > level.gateX;
      const isShort = approachingFromRight ? diff > 0 : diff < 0;
      tag = `${distKm.toFixed(1)}km ${isShort ? 'short' : 'long'}`;
    }
    if (tag) {
      const labelX = clamp(lsx, 60, W - 60);
      const labelY = clamp(lsy - 14, 50, H - 20);
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = tagCol;
      ctx.textAlign = 'center';
      ctx.fillText(tag, labelX, labelY);
    }
  }

  // --- Trajectory markers ---

  // Wing marker: shows where wings transition (too hot or cool enough)
  // Don't draw if overheat comes first (or at same point)
  if (result.wingFoldIdx >= 0 && result.wingFoldIdx < pts.length &&
      (result.overheatIdx < 0 || result.wingFoldIdx < result.overheatIdx)) {
    const p = pts[result.wingFoldIdx];
    const [mx, my] = ws(p.x, p.y, cam, W, H);
    if (mx > -50 && mx < W + 50 && my > -50 && my < H + 50) {
      // Wings icon: two lines showing fold/unfold
      const isCooling = p.temp < level.wingsMaxTemp;
      if (isCooling) {
        // Wings opening: lines spreading outward
        ctx.strokeStyle = '#00ccff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mx - 3, my + 2); ctx.lineTo(mx - 9, my - 3);
        ctx.moveTo(mx + 3, my + 2); ctx.lineTo(mx + 9, my - 3);
        ctx.stroke();
      } else {
        // Wings folding: lines closing inward
        ctx.strokeStyle = '#00ccff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mx - 8, my - 2); ctx.lineTo(mx - 3, my + 4);
        ctx.moveTo(mx + 8, my - 2); ctx.lineTo(mx + 3, my + 4);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(mx, my + 1, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#00ccff';
      ctx.fill();
    }
  }

  // Overheat marker (red X)
  if (result.overheatIdx >= 0 && result.overheatIdx < pts.length) {
    const p = pts[result.overheatIdx];
    const [mx, my] = ws(p.x, p.y, cam, W, H);
    if (mx > -50 && mx < W + 50 && my > -50 && my < H + 50) {
      ctx.strokeStyle = '#ff2200';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(mx - 7, my - 7); ctx.lineTo(mx + 7, my + 7);
      ctx.moveTo(mx + 7, my - 7); ctx.lineTo(mx - 7, my + 7);
      ctx.stroke();
    }
  }
}

function drawDepartureTarget(
  ctx: CanvasRenderingContext2D, cam: ApproachCamera,
  level: ApproachLevel, W: number, H: number,
): void {
  if (!level.departure) return;

  const targetY = level.departure.exitAltitude;
  const [, sy] = ws(cam.x, targetY, cam, W, H);
  const onScreen = sy > 0 && sy < H;

  if (onScreen) {
    ctx.strokeStyle = COL_GATE_DIM;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(W, sy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '11px monospace';
    ctx.fillStyle = COL_GATE;
    ctx.textAlign = 'center';
    ctx.fillText(`TRANSFER ALT ${(targetY / 1000).toFixed(1)}km`, W / 2, sy - 8);
  } else {
    const cy = clamp(sy, 36, H - 36);
    const dir = sy < 0 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(W - 34, cy + dir * 10);
    ctx.lineTo(W - 42, cy - dir * 4);
    ctx.lineTo(W - 26, cy - dir * 4);
    ctx.closePath();
    ctx.fillStyle = COL_GATE;
    ctx.fill();
    ctx.font = '11px monospace';
    ctx.fillStyle = COL_GATE;
    ctx.textAlign = 'right';
    ctx.fillText(`TRANSFER ALT ${(targetY / 1000).toFixed(1)}km`, W - 50, cy + 4);
  }
}

function drawGate(
  ctx: CanvasRenderingContext2D, cam: ApproachCamera,
  s: ApproachState, level: ApproachLevel, W: number, H: number,
): void {
  // Gate rectangle sits on terrain
  const terrainAtGate = getApproachTargetHeight(level.gateX, level);
  const [leftX, topY] = ws(level.gateX - level.gateRadius, level.gateY + terrainAtGate, cam, W, H);
  const [rightX, botY] = ws(level.gateX + level.gateRadius, terrainAtGate, cam, W, H);
  const [centerX] = ws(level.gateX, (level.gateY + terrainAtGate * 2) * 0.5, cam, W, H);
  const rectW = rightX - leftX;
  const rectH = botY - topY;

  const onScreen = rightX > 0 && leftX < W && botY > 0 && topY < H;

  if (onScreen && Math.abs(rectW) > 2) {
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    const speedOk = speed <= level.gateMaxSpeed && speed >= level.gateMinSpeed;
    const col = speedOk ? COL_GATE : COL_GATE_DIM;

    // Rectangle outline
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(leftX, topY, rectW, rectH);
    ctx.setLineDash([]);

    // Speed label at top
    ctx.font = '11px monospace';
    ctx.fillStyle = COL_GATE_DIM;
    ctx.textAlign = 'center';
    ctx.fillText(`${level.gateMinSpeed}-${level.gateMaxSpeed} m/s`, centerX, topY - 6);
  }

  // Off-screen indicator
  if (!onScreen) {
    const [gcx, gcy] = ws(level.gateX, terrainAtGate + level.gateY * 0.5, cam, W, H);
    const margin = 40;
    const cx = clamp(gcx, margin, W - margin);
    const cy = clamp(gcy, margin, H - margin);
    const dx = gcx - cx, dy = gcy - cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1) {
      const nx = dx / len, ny = dy / len;
      const as = 10;
      ctx.beginPath();
      ctx.moveTo(cx + nx * as, cy + ny * as);
      ctx.lineTo(cx - nx * 4 - ny * as * 0.5, cy - ny * 4 + nx * as * 0.5);
      ctx.lineTo(cx - nx * 4 + ny * as * 0.5, cy - ny * 4 - nx * as * 0.5);
      ctx.closePath();
      ctx.fillStyle = COL_GATE;
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const dist = Math.sqrt((s.x - level.gateX) ** 2 + (s.y - level.gateY * 0.5) ** 2);
    ctx.font = '11px monospace';
    ctx.fillStyle = COL_GATE;
    ctx.textAlign = 'center';
    ctx.fillText(`TGT ${(dist / 1000).toFixed(1)}km`, cx, cy - 14);
  }
}

function drawApproachShip(
  ctx: CanvasRenderingContext2D, cam: ApproachCamera,
  s: ApproachState, level: ApproachLevel, W: number, H: number, time: number,
): void {
  const [sx, sy] = ws(s.x, s.y, cam, W, H);
  const size = 14;

  // --- Plasma teardrop (proportional to heat GENERATED, scales with zoom) ---
  const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  const rho = density(s.y, level);
  // Use same drag-based heat formula as physics
  const sinA = Math.sin(Math.atan2(s.vx, s.vy) - s.angle);
  const cosA = Math.cos(Math.atan2(s.vx, s.vy) - s.angle);
  const bodyCd = level.dragNose * cosA * cosA + level.dragBroadside * sinA * sinA;
  const effectiveWing = s.wingsDeployed ? s.wingAngle : 0;
  const totalCd = bodyCd + effectiveWing * level.dragWingPerRad;
  const dragAccel = 0.5 * rho * spd * spd * totalCd;
  const actualHeatRate = dragAccel * spd * level.heatCoeff;
  // Normalize: 0.1/s heat rate = full plasma intensity
  const plasmaIntensity = clamp(actualHeatRate / 0.1, 0, 1);
  if (plasmaIntensity > 0.02) {
    const intensity = plasmaIntensity;
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    const velAngle = speed > 10 ? Math.atan2(s.vx, s.vy) : s.angle;
    const flicker = 0.85 + 0.15 * Math.sin(time * 30);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(velAngle);

    // Ship-scale: proportional to the ship icon size and intensity
    const frontR = size * (0.4 + intensity * 0.8) * flicker;
    const tailLen = size * (1.5 + intensity * 5) * flicker;
    const bw = frontR * 0.7;

    // Teardrop path
    ctx.beginPath();
    ctx.moveTo(0, tailLen);
    ctx.quadraticCurveTo(-bw * 1.3, tailLen * 0.25, -bw, -frontR * 0.2);
    ctx.arc(0, -frontR * 0.2, frontR, Math.PI, 0, false);
    ctx.quadraticCurveTo(bw * 1.3, tailLen * 0.25, 0, tailLen);

    const grad = ctx.createLinearGradient(0, -frontR, 0, tailLen);
    const rr = 255, gg = Math.floor(180 * intensity);
    grad.addColorStop(0, `rgba(${rr}, ${gg}, 40, ${0.55 * intensity})`);
    grad.addColorStop(0.35, `rgba(${rr}, ${Math.floor(gg * 0.5)}, 0, ${0.3 * intensity})`);
    grad.addColorStop(1, 'rgba(180, 40, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Bright core at nose
    ctx.beginPath();
    ctx.arc(0, -frontR * 0.2, frontR * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 180, ${0.35 * intensity * flicker})`;
    ctx.fill();

    ctx.restore();
  }

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(s.angle);

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

  // Wings mounted to the schematic frame shoulders
  if (s.wingsDeployed) {
    const wingMaxAngle = effectiveWingMaxAngle(level);
    const t = (s.wingAngle - MIN_WING_ANGLE) / Math.max(wingMaxAngle - MIN_WING_ANGLE, 1e-6);
    const wingRootY = size * 0.16;
    const wingRootX = size * 0.34;
    const wingSpan = size * (0.38 + t * 0.72);
    const sweepY = size * (0.55 * (1 - t) + 0.04);
    ctx.beginPath();
    ctx.moveTo(-wingRootX, wingRootY);
    ctx.lineTo(-(wingRootX + wingSpan), wingRootY + sweepY);
    ctx.moveTo(wingRootX, wingRootY);
    ctx.lineTo(wingRootX + wingSpan, wingRootY + sweepY);
    ctx.strokeStyle = '#00ccff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

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

  // Main thrust flame (rear)
  if (s.throttle > 0.05) {
    const hi = s.highThrust;
    const flicker = 0.7 + 0.3 * Math.sin(time * (hi ? 55 : 40));
    const fl = (size * (hi ? 0.85 : 0.55) + s.throttle * size * (hi ? 1.9 : 1.35)) * flicker;
    const mainCol = hi ? '#ffdd66' : '#ffaa00';
    const coreCol = hi ? '#fff0b0' : '#ffdd66';
    const flameWidth = hi ? 2.6 : 2;
    for (const x of [rearNozzleLeftX, rearNozzleRightX]) {
      ctx.beginPath();
      ctx.moveTo(x - size * 0.08, rearNozzleY + size * 0.06);
      ctx.lineTo(x, rearNozzleY + fl);
      ctx.lineTo(x + size * 0.08, rearNozzleY + size * 0.06);
      ctx.strokeStyle = mainCol;
      ctx.lineWidth = flameWidth;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - size * 0.04, rearNozzleY + size * 0.04);
      ctx.lineTo(x, rearNozzleY + fl * 0.58);
      ctx.lineTo(x + size * 0.04, rearNozzleY + size * 0.04);
      ctx.strokeStyle = coreCol;
      ctx.lineWidth = hi ? 1.8 : 1.3;
      ctx.stroke();
    }
  }

  // Retro thrust flame (nose)
  if (s.retroFiring) {
    const hi = s.highThrust;
    const flicker = 0.7 + 0.3 * Math.sin(time * (hi ? 58 : 45));
    const fl = (size * (hi ? 1.15 : 0.75) + size * 0.95) * flicker;
    const retroCol = hi ? '#ffaa44' : '#ff6600';
    const coreCol = hi ? '#ffdd88' : '#ffcc44';
    ctx.beginPath();
    ctx.moveTo(-size * 0.11, cabFrontY);
    ctx.lineTo(0, cabFrontY - fl);
    ctx.lineTo(size * 0.11, cabFrontY);
    ctx.strokeStyle = retroCol;
    ctx.lineWidth = hi ? 2.6 : 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, cabFrontY);
    ctx.lineTo(0, cabFrontY - fl * 0.5);
    ctx.strokeStyle = coreCol;
    ctx.lineWidth = hi ? 1.8 : 1.5;
    ctx.stroke();
  }

  ctx.restore();
}

// ===================== HUD =====================

function approachDepartureTargetName(level: ApproachLevel): string {
  const orbitalId = level.departure?.orbitalLevelId;
  if (!orbitalId) return `${level.body.name} Orbit`;
  const orbital = ORBITAL_PHASES.find(phase => phase.id === orbitalId);
  if (!orbital) return `${level.body.name} Orbit`;
  if (orbital.kind === 'stationOrbit') return stationPoiById(orbital.stationPoiId).name;
  if (orbital.kind === 'systemTransfer') return bodyById(orbital.targetBodyId).name;
  if (orbital.kind === 'bodyArrival') return bodyById(orbital.bodyId).name;
  if (orbital.kind === 'surfaceOrbit') {
    if (orbital.escapeTargetBodyId) return bodyById(orbital.escapeTargetBodyId).name;
    if (orbital.parentTransferPeriapsisAltitude !== undefined) {
      const body = bodyById(surfacePoiById(orbital.poiId).bodyId);
      if (body.orbit) return bodyById(body.orbit.parentBodyId).name;
    }
    return `${bodyById(surfacePoiById(orbital.poiId).bodyId).name} Orbit`;
  }
  return level.body.name;
}

function drawApproachHUD(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
  s: ApproachState, level: ApproachLevel,
  state: 'approaching' | 'approachSuccess' | 'approachFailed',
  time: number,
  destinationName: string | undefined,
  destinationLocation: string | undefined,
  phaseDvUsed: number = 0,
  missionDvUsed: number = 0,
  suppressStateOverlays = false,
): void {
  const W = canvas.width, H = canvas.height;
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  const altKm = (s.y / 1000);
  const targetBaseY = getApproachTargetHeight(level.gateX, level);
  const distGate = Math.sqrt((s.x - level.gateX) ** 2 + (s.y - (targetBaseY + level.gateY)) ** 2);
  const departure = level.departure;
  const apa = departure ? getApproachApoapsisAltitude(s, level) : null;
  const rho = density(s.y, level);
  const rhoFracStd = rho / EARTH_STANDARD_SURFACE_DENSITY;
  const rhoCol = rhoFracStd > 0.3 ? COL_WARNING : rhoFracStd > 0.05 ? COL_HUD : COL_HUD_DIM;
  const tempCol = tempColor(s.temperature);

  ctx.save();
  const lx = 20;
  let ly = 30;
  const lh = 20;

  ctx.font = '14px "Courier New", monospace';
  ctx.textAlign = 'left';

  ctx.font = '13px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = COL_HUD_DIM;
  ctx.fillText(`${level.name}  [g=${level.gravity.toFixed(1)}]`, W - 20, 24);
  ctx.textAlign = 'left';
  ctx.font = '14px "Courier New", monospace';

  drawHudLabel(ctx, lx, ly, 'ALT', `${altKm.toFixed(1)} km`, COL_HUD); ly += lh;
  drawHudLabel(ctx, lx, ly, 'H/S', `${Math.abs(s.vx).toFixed(0)} m/s`, COL_HUD); ly += lh;
  drawHudLabel(ctx, lx, ly, 'V/S', `${s.vy.toFixed(0)} m/s`, COL_HUD); ly += lh;
  const spdCol = departure
    ? COL_HUD
    : (speed > level.gateMaxSpeed ? COL_WARNING : speed < level.gateMinSpeed ? COL_HUD_DIM : COL_SUCCESS);
  drawHudLabel(ctx, lx, ly, 'SPD', `${speed.toFixed(0)} m/s`, spdCol); ly += lh;

  if (departure) {
    const apaText = apa === null ? '--' : (apa === Infinity ? 'ESC' : `${(apa / 1000).toFixed(1)} km`);
    const apaCol = apa === null ? COL_HUD_DIM
      : apa >= departure.thresholdApoapsisAltitude ? COL_SUCCESS
      : COL_WARNING;
    drawHudLabel(ctx, lx, ly, 'ApA', apaText, apaCol); ly += lh;
  }

  const velAngle = Math.atan2(s.vx, s.vy);
  let aoa = velAngle - s.angle;
  while (aoa > Math.PI) aoa -= 2 * Math.PI;
  while (aoa < -Math.PI) aoa += 2 * Math.PI;
  const aoaDisplay = (s.vx >= 0 ? 1 : -1) * aoa;
  drawHudLabel(ctx, lx, ly, 'AoA', `${(aoaDisplay * 180 / Math.PI).toFixed(1)}°`, COL_HUD); ly += lh;

  let cfgStr = 'CLEAN';
  let cfgCol = COL_HUD;
  if (s.wingsDeployed) { cfgStr = `WINGS ${(s.wingAngle * 180 / Math.PI).toFixed(0)}°`; cfgCol = '#00ccff'; }
  drawHudLabel(ctx, lx, ly, 'CFG', cfgStr, cfgCol); ly += lh;
  drawHudLabel(ctx, lx, ly, 'ATM', `${(rhoFracStd * 100).toFixed(1)}%`, rhoCol); ly += lh;
  drawHudLabel(ctx, lx, ly, 'TEMP', `${(s.temperature * 100).toFixed(0)}%`, tempCol); ly += lh;
  drawHudLabel(ctx, lx, ly, 'THR', s.highThrust ? 'HIGH' : 'LOW', s.highThrust ? COL_WARNING : COL_HUD_DIM); ly += lh;
  drawHudLabel(ctx, lx, ly, 'WARP', `${s.timeWarp}x`, s.timeWarp > 1 ? COL_WARNING : COL_HUD_DIM); ly += lh;
  drawHudLabel(ctx, lx, ly, 'PH ΔV', `${phaseDvUsed.toFixed(0)} m/s`, COL_HUD); ly += lh;
  drawHudLabel(ctx, lx, ly, 'MIS ΔV', `${missionDvUsed.toFixed(0)} m/s`, COL_HUD); ly += lh;

  const panelRows = departure
    ? (() => {
        const apaText = apa === null ? '--' : (apa === Infinity ? 'ESC' : `${(apa / 1000).toFixed(1)} km`);
        const altReady = s.y >= departure.exitAltitude;
        const apaReady = apa !== null && apa >= departure.thresholdApoapsisAltitude;
        return [
          { label: 'ALT', value: `${(s.y / 1000).toFixed(1)} km > ${(departure.exitAltitude / 1000).toFixed(1)} km`, color: altReady ? COL_SUCCESS : COL_HUD },
          { label: 'ApA', value: `${apaText} > ${(departure.thresholdApoapsisAltitude / 1000).toFixed(0)} km`, color: apaReady ? COL_SUCCESS : COL_WARNING },
          { label: 'DIR', value: (departure.orbitDir ?? level.poi.departureProfile.orbitDir) > 0 ? 'RIGHT' : 'LEFT', color: COL_SUCCESS },
        ];
      })()
    : [
        { label: 'DIST', value: `${(distGate / 1000).toFixed(1)} km < ${(level.gateRadius / 1000).toFixed(1)} km`, color: distGate <= level.gateRadius ? COL_SUCCESS : COL_HUD },
        { label: 'SPD', value: `${speed.toFixed(0)} m/s  ${level.gateMinSpeed.toFixed(0)}-${level.gateMaxSpeed.toFixed(0)} m/s`, color: speed >= level.gateMinSpeed && speed <= level.gateMaxSpeed ? COL_SUCCESS : COL_WARNING },
      ];

  drawHudInfoPanel(ctx, canvas, {
    title: 'DESTINATION',
    name: destinationName ?? (departure ? approachDepartureTargetName(level) : level.poi.name),
    subtitle: destinationLocation,
    rows: panelRows,
    guidance: departure
      ? 'Climb and raise apoapsis to the target orbit for handoff.'
      : 'Arrive at target area and match speed.',
  });

  // --- Temperature bar (left side) ---
  const barX = 190;
  const barY = 54;
  const barW = 18;
  const barH = 130;

  ctx.strokeStyle = COL_HUD_DIM;
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);

  const fillH = barH * Math.min(s.temperature, 1);
  ctx.fillStyle = tempCol;
  ctx.fillRect(barX, barY + barH - fillH, barW, fillH);

  const wmY = barY + barH - barH * level.wingsMaxTemp;
  ctx.strokeStyle = '#00ccff';
  ctx.beginPath();
  ctx.moveTo(barX - 4, wmY);
  ctx.lineTo(barX + barW + 4, wmY);
  ctx.stroke();
  ctx.fillStyle = '#00ccff';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('WNG', barX + barW + 8, wmY + 3);
  ctx.fillStyle = COL_HUD_DIM;
  ctx.fillText('TEMP', barX - 2, barY + barH + 14);

  // --- Warnings (center top) ---
  let warnY = 30;
  const now = Date.now();

  if (s.temperature > level.wingsMaxTemp * 0.8 && s.wingsDeployed) {
    if (Math.sin(now * 0.012) > -0.3) {
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = COL_DANGER;
      ctx.fillText('⚠ TOO HOT FOR WINGS', W / 2, warnY);
      warnY += 24;
    }
  }

  const windAccel = getWind(s.y, level, time);
  if (Math.abs(windAccel) > 1) {
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    const windDir = windAccel > 0 ? '→' : '←';
    const windCol = Math.abs(windAccel) > 8 ? COL_WARNING : '#5588cc';
    ctx.fillStyle = windCol;
    ctx.fillText(`WIND ${windDir} ${Math.abs(windAccel).toFixed(0)} m/s²`, W / 2, warnY);
    warnY += 22;
  }

  if (inTurbulence(s.y, level)) {
    if (Math.sin(now * 0.008) > -0.2) {
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = COL_WARNING;
      ctx.fillText('⚠ TURBULENCE', W / 2, warnY);
      warnY += 22;
    }
  }

  if (!suppressStateOverlays && state === 'approachSuccess') {
    ctx.fillStyle = 'rgba(0, 20, 0, 0.6)';
    ctx.fillRect(W / 2 - 200, H / 2 - 80, 400, 160);
    ctx.strokeStyle = COL_SUCCESS;
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 200, H / 2 - 80, 400, 160);

    ctx.textAlign = 'center';
    ctx.fillStyle = COL_SUCCESS;
    ctx.font = 'bold 28px monospace';
    ctx.fillText('TARGET REACHED', W / 2, H / 2 - 40);
    ctx.font = '16px monospace';
    ctx.fillText(`Speed: ${s.gateSpeed.toFixed(0)} m/s`, W / 2, H / 2);
    ctx.fillStyle = COL_HUD_DIM;
    ctx.font = '14px monospace';
    ctx.fillText('BACKSPACE: Retry  |  L: Levels', W / 2, H / 2 + 50);
  }

  if (!suppressStateOverlays && state === 'approachFailed') {
    ctx.fillStyle = 'rgba(20, 0, 0, 0.6)';
    ctx.fillRect(W / 2 - 200, H / 2 - 60, 400, 120);
    ctx.strokeStyle = COL_DANGER;
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 200, H / 2 - 60, 400, 120);

    ctx.textAlign = 'center';
    ctx.fillStyle = COL_DANGER;
    ctx.font = 'bold 28px monospace';
    const msg = s.temperature >= 1 ? 'BURNED UP' : 'IMPACT';
    ctx.fillText(msg, W / 2, H / 2 - 15);
    ctx.fillStyle = COL_HUD_DIM;
    ctx.font = '14px monospace';
    ctx.fillText('BACKSPACE: Retry  |  L: Levels', W / 2, H / 2 + 25);
  }

  if (state === 'approaching') {
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = COL_HUD_DIM;
    ctx.fillText('A/D: Pitch  W: Thrust  S: Retro  SHIFT: Hi/Lo  G: Wings  Q/E: Angle  [/]: Warp  BACKSPACE: Restart  L: Levels', W / 2, H - 15);
  }

  ctx.restore();
}

export { drawApproachHUD };
