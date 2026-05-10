// Docking phase: visual prototype for tug + container delivery.
// Self-contained module: physics, rendering, HUD.

import { COL_DANGER, COL_HUD, COL_HUD_DIM, COL_SUCCESS, COL_WARNING, drawHudInfoPanel, drawHudLabel } from './hud-layout';
import { InputState } from './input';

// ===================== Types =====================

// Station geometry constants
const HUB_RADIUS = 20;       // central hub radius (meters)
const SPOKE_WIDTH = 6;        // spoke core width (the stem)
const BAY_SLOT_W = 8;         // width of each bay slot (along spoke, wider for clearance)
const BAY_SLOT_D = 20;        // depth of each bay slot (perpendicular, open on outside)
const WALL_THICK = 1.5;       // wall thickness between bays (thicker, more visible)
const BAYS_PER_SIDE = 6;
const BAY_PITCH = BAY_SLOT_W + WALL_THICK; // center-to-center spacing along spoke
const SPOKE_LEN = BAYS_PER_SIDE * BAY_PITCH + WALL_THICK;

interface BayInfo {
  spokeIdx: number;
  side: number;
  slot: number;
  filled: boolean;
  isTarget: boolean;
  colorIdx: number;
  isPlayerBay: boolean;  // player starts here (skip collision)
}

export interface DockingLevel {
  id: number;
  name: string;
  subtitle: string;
  hasContainer: boolean;
  exitMode: boolean;         // true = undocking (goal: get away from station)
  exitDistance: number;      // meters to clear for exit completion
  orbitalLevelId?: number;
  clusterLevelId?: number;
  finalDestinationName?: string;
  finalDestinationLocation?: string;
  nextObjectiveDetail?: string;

  // Station center
  stationX: number; stationY: number;

  // Bay layout (generated)
  bays: BayInfo[];

  // Tractor beam
  beamRange: number;
  beamStrength: number;

  // Ship
  tugMass: number;
  containerMass: number;
  thrustForce: number;
  rotTorque: number;
  dampingAssist: boolean;

  // Start
  startX: number; startY: number;
  startVX: number; startVY: number;
  startAngle: number;
}

export interface DockingState {
  x: number; y: number;     // position (meters)
  vx: number; vy: number;   // velocity
  angle: number;            // radians
  angVel: number;           // angular velocity

  sas: boolean;
  alive: boolean;
  delivered: boolean;

  // Thrust flags for rendering
  thrustUp: boolean;
  thrustDown: boolean;
  thrustLeft: boolean;
  thrustRight: boolean;
  rotCW: boolean;
  rotCCW: boolean;
  // SAS thruster flags (for rendering SAS corrections)
  sasUp: boolean; sasDown: boolean; sasLeft: boolean; sasRight: boolean;
  sasCW: boolean; sasCCW: boolean;
  beamActive: boolean;
  beamAligned: boolean;
  highThrust: boolean;
  exitComplete: boolean;
  leftStartBay: boolean;   // has left the starting bay area (enables collision)
  dvUsed: number;
}

export interface DockingInitOverride {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
}

// ===================== Levels =====================

function generateBays(targetSpoke: number, targetSide: number, targetSlot: number, fillPct: number): BayInfo[] {
  const bays: BayInfo[] = [];
  let seed = 42;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let spoke = 0; spoke < 4; spoke++) {
    for (let side = 0; side < 2; side++) {
      for (let slot = 0; slot < BAYS_PER_SIDE; slot++) {
        const isTarget = spoke === targetSpoke && side === targetSide && slot === targetSlot;
        const filled = isTarget ? false : rng() < fillPct;
        const colorIdx = Math.floor(rng() * 5);
        bays.push({ spokeIdx: spoke, side, slot, filled, isTarget, colorIdx, isPlayerBay: false });
      }
    }
  }
  return bays;
}

/** Get world-space center and open direction of a bay.
 *  Bay is perpendicular to spoke. Opens toward the spoke (inward). */
function bayWorldPos(bay: BayInfo, sx: number, sy: number): { x: number; y: number; angle: number } {
  const spokeAngle = bay.spokeIdx * Math.PI / 2;
  // Position along spoke
  const alongDist = HUB_RADIUS + WALL_THICK + bay.slot * BAY_PITCH + BAY_SLOT_W / 2;
  // Side offset: center of bay slot is SPOKE_WIDTH/2 + BAY_SLOT_D/2 away from spoke center
  const sideSign = bay.side === 0 ? 1 : -1;
  const perpDist = (SPOKE_WIDTH / 2 + BAY_SLOT_D / 2) * sideSign;
  const sdx = Math.cos(spokeAngle), sdy = Math.sin(spokeAngle);
  const pdx = -sdy, pdy = sdx; // perpendicular (left of spoke direction)
  const bx = sx + sdx * alongDist + pdx * perpDist;
  const by = sy + sdy * alongDist + pdy * perpDist;
  // Bay opens toward spoke (inward) = opposite of perpendicular outward direction
  const openAngle = spokeAngle + (bay.side === 0 ? -Math.PI / 2 : Math.PI / 2);
  return { x: bx, y: by, angle: openAngle };
}

/** Check if point is inside station solid geometry. Returns push-out vector or null. */
function stationCollision(
  px: number, py: number, sx: number, sy: number, bays: BayInfo[],
): { nx: number; ny: number; depth: number } | null {
  // Check hub
  const hdx = px - sx, hdy = py - sy;
  const hDist = Math.sqrt(hdx * hdx + hdy * hdy);
  if (hDist < HUB_RADIUS) {
    const d = HUB_RADIUS - hDist;
    return { nx: hdx / Math.max(hDist, 0.1), ny: hdy / Math.max(hDist, 0.1), depth: d };
  }

  // Check spoke cores and bay walls
  for (let spoke = 0; spoke < 4; spoke++) {
    const a = spoke * Math.PI / 2;
    const sdx = Math.cos(a), sdy = Math.sin(a);
    const pdx = -sdy, pdy = sdx;
    // Project into spoke-local coords: lx = along spoke, ly = perpendicular
    const lx = (px - sx) * sdx + (py - sy) * sdy;
    const ly = (px - sx) * pdx + (py - sy) * pdy;

    // Spoke core
    if (lx > HUB_RADIUS && lx < HUB_RADIUS + SPOKE_LEN && Math.abs(ly) < SPOKE_WIDTH / 2) {
      const pushPerp = SPOKE_WIDTH / 2 - Math.abs(ly);
      const sign = ly > 0 ? 1 : -1;
      return { nx: pdx * sign, ny: pdy * sign, depth: pushPerp };
    }

    // Bay walls: thin rects between each bay slot, extending perpendicular from spoke
    for (let side = 0; side < 2; side++) {
      const sideSign = side === 0 ? 1 : -1;
      for (let wallIdx = 0; wallIdx <= BAYS_PER_SIDE; wallIdx++) {
        // Wall rendered as line at HUB_RADIUS + wallIdx * BAY_PITCH
        // Collision: treat as thin rect centered on same position
        const wallAlong = HUB_RADIUS + wallIdx * BAY_PITCH;
        const wallPerpStart = SPOKE_WIDTH / 2;
        const wallPerpEnd = SPOKE_WIDTH / 2 + BAY_SLOT_D;
        const sly = ly * sideSign;
        const halfW = WALL_THICK / 2;
        if (sly > wallPerpStart && sly < wallPerpEnd && Math.abs(lx - wallAlong) < halfW) {
          const pushAlong = halfW - Math.abs(lx - wallAlong);
          const sign2 = (lx - wallAlong) > 0 ? 1 : -1;
          return { nx: sdx * sign2, ny: sdy * sign2, depth: pushAlong + 0.1 };
        }
      }

      // Filled bay containers are solid
      for (let slot = 0; slot < BAYS_PER_SIDE; slot++) {
        const bay = bays.find(b => b.spokeIdx === spoke && b.side === side && b.slot === slot);

        if (bay && bay.filled && !bay.isPlayerBay) {
          const slotCenter = HUB_RADIUS + WALL_THICK + slot * BAY_PITCH + BAY_SLOT_W / 2;
          const sly2 = ly * sideSign;
          const contHalfW = CONTAINER_H / 2;
          const contHalfD = CONTAINER_W / 2;
          const contPerpCenter = SPOKE_WIDTH / 2 + BAY_SLOT_D / 2;
          if (sly2 > contPerpCenter - contHalfD && sly2 < contPerpCenter + contHalfD &&
              lx > slotCenter - contHalfW && lx < slotCenter + contHalfW) {
            // Push out along nearest edge
            const dpx = contHalfD - Math.abs(sly2 - contPerpCenter);
            const dpy = contHalfW - Math.abs(lx - slotCenter);
            if (dpx < dpy) {
              const s3 = (sly2 - contPerpCenter) > 0 ? 1 : -1;
              return { nx: pdx * sideSign * s3, ny: pdy * sideSign * s3, depth: dpx };
            } else {
              const s3 = (lx - slotCenter) > 0 ? 1 : -1;
              return { nx: sdx * s3, ny: sdy * s3, depth: dpy };
            }
          }
        }
      }
    }
  }
  return null;
}

// Mission 1: Mail Run — undock from Calloway Station
const MISSION1_DOCKING: DockingLevel = {
  id: 1,
  name: 'Calloway Station',
  subtitle: 'Undock and clear the station',
  hasContainer: true,
  exitMode: true,
  exitDistance: 120,
  orbitalLevelId: 11,
  stationX: 0, stationY: 0,
  bays: generateBays(0, 1, 2, 0.7),
  beamRange: 12,
  beamStrength: 0.5,
  thrustForce: 3200,
  rotTorque: 1200,
  tugMass: 500,
  containerMass: 2000,
  dampingAssist: false,   // SAS off at start
  // Start inside the bay — compute from bay position
  startX: 0, startY: 0, // will be set by init code
  startVX: 0, startVY: 0,
  startAngle: 0,
};

// Position player inside their starting bay
(() => {
  const bay = MISSION1_DOCKING.bays.find(b => b.spokeIdx === 0 && b.side === 1 && b.slot === 2)!;
  bay.filled = false;   // don't show a static container (player IS the container)
  bay.isTarget = false;
  bay.isPlayerBay = true;
  // Clear any target bay (exit mode has no target)
  for (const b of MISSION1_DOCKING.bays) b.isTarget = false;
  const bp = bayWorldPos(bay, MISSION1_DOCKING.stationX, MISSION1_DOCKING.stationY);
  MISSION1_DOCKING.startX = bp.x;
  MISSION1_DOCKING.startY = bp.y;
  MISSION1_DOCKING.startAngle = bp.angle + Math.PI;
})();

const MISSION2_DOCKING: DockingLevel = {
  id: 12,
  name: 'Calloway Station',
  subtitle: 'Deliver core samples to the lab bay',
  hasContainer: true,
  exitMode: false,
  exitDistance: 0,
  stationX: 0, stationY: 0,
  bays: generateBays(2, 0, 1, 0.7),
  beamRange: 12,
  beamStrength: 0.5,
  thrustForce: 3200,
  rotTorque: 1200,
  tugMass: 500,
  containerMass: 2000,
  dampingAssist: false,
  startX: -120, startY: 0,
  startVX: 0,
  startVY: 0,
  startAngle: 0,
};

const MISSION3_DOCKING: DockingLevel = {
  id: 13,
  name: 'Anchor Station',
  subtitle: 'Undock and clear the station',
  hasContainer: true,
  exitMode: true,
  exitDistance: 160,
  orbitalLevelId: 13,
  stationX: 0, stationY: 0,
  bays: generateBays(1, 0, 4, 0.65),
  beamRange: 12,
  beamStrength: 0.5,
  thrustForce: 3200,
  rotTorque: 1200,
  tugMass: 500,
  containerMass: 2000,
  dampingAssist: false,
  startX: 0, startY: 0,
  startVX: 0,
  startVY: 0,
  startAngle: 0,
};

(() => {
  const bay = MISSION3_DOCKING.bays.find(b => b.spokeIdx === 1 && b.side === 0 && b.slot === 4)!;
  bay.filled = false;
  bay.isTarget = false;
  bay.isPlayerBay = true;
  for (const b of MISSION3_DOCKING.bays) b.isTarget = false;
  const bp = bayWorldPos(bay, MISSION3_DOCKING.stationX, MISSION3_DOCKING.stationY);
  MISSION3_DOCKING.startX = bp.x;
  MISSION3_DOCKING.startY = bp.y;
  MISSION3_DOCKING.startAngle = bp.angle + Math.PI;
})();

const MISSION4_DOCKING: DockingLevel = {
  id: 14,
  name: 'Anchor Station',
  subtitle: 'Deliver waste to the processing bay',
  hasContainer: true,
  exitMode: false,
  exitDistance: 0,
  stationX: 0, stationY: 0,
  bays: generateBays(3, 1, 2, 0.7),
  beamRange: 12,
  beamStrength: 0.5,
  thrustForce: 3200,
  rotTorque: 1200,
  tugMass: 500,
  containerMass: 2000,
  dampingAssist: false,
  startX: -120, startY: 0,
  startVX: 0,
  startVY: 0,
  startAngle: 0,
};

const MISSION6_DOCKING: DockingLevel = {
  id: 15,
  name: 'Morrow Station',
  subtitle: 'Deliver medical supplies to the research dock',
  hasContainer: true,
  exitMode: false,
  exitDistance: 0,
  stationX: 0, stationY: 0,
  bays: generateBays(1, 1, 4, 0.55),
  beamRange: 12,
  beamStrength: 0.5,
  thrustForce: 3200,
  rotTorque: 1200,
  tugMass: 500,
  containerMass: 2000,
  dampingAssist: false,
  startX: -120, startY: 0,
  startVX: 0,
  startVY: 0,
  startAngle: 0,
};

const MISSION7_DOCKING: DockingLevel = {
  id: 16,
  name: 'Calloway Station',
  subtitle: 'Undock and clear the station',
  hasContainer: true,
  exitMode: true,
  exitDistance: 120,
  orbitalLevelId: 20,
  stationX: 0, stationY: 0,
  bays: generateBays(0, 1, 2, 0.7),
  beamRange: 12,
  beamStrength: 0.5,
  thrustForce: 3200,
  rotTorque: 1200,
  tugMass: 500,
  containerMass: 2000,
  dampingAssist: false,
  startX: 0, startY: 0,
  startVX: 0,
  startVY: 0,
  startAngle: 0,
};

(() => {
  const bay = MISSION7_DOCKING.bays.find(b => b.spokeIdx === 0 && b.side === 1 && b.slot === 2)!;
  bay.filled = false;
  bay.isTarget = false;
  bay.isPlayerBay = true;
  for (const b of MISSION7_DOCKING.bays) b.isTarget = false;
  const bp = bayWorldPos(bay, MISSION7_DOCKING.stationX, MISSION7_DOCKING.stationY);
  MISSION7_DOCKING.startX = bp.x;
  MISSION7_DOCKING.startY = bp.y;
  MISSION7_DOCKING.startAngle = bp.angle + Math.PI;
})();

export function createGenericDockingLevel(opts: {
  id: number;
  name: string;
  subtitle: string;
  exitMode: boolean;
  orbitalLevelId?: number;
  clusterLevelId?: number;
  targetSpoke?: number;
  targetSide?: number;
  targetSlot?: number;
  fillPct?: number;
  exitDistance?: number;
  finalDestinationName?: string;
  finalDestinationLocation?: string;
  nextObjectiveDetail?: string;
}): DockingLevel {
  const targetSpoke = opts.targetSpoke ?? 0;
  const targetSide = opts.targetSide ?? 1;
  const targetSlot = opts.targetSlot ?? 2;
  const level: DockingLevel = {
    id: opts.id,
    name: opts.name,
    subtitle: opts.subtitle,
    hasContainer: true,
    exitMode: opts.exitMode,
    exitDistance: opts.exitDistance ?? 140,
    orbitalLevelId: opts.orbitalLevelId,
    clusterLevelId: opts.clusterLevelId,
    finalDestinationName: opts.finalDestinationName,
    finalDestinationLocation: opts.finalDestinationLocation,
    nextObjectiveDetail: opts.nextObjectiveDetail,
    stationX: 0, stationY: 0,
    bays: generateBays(targetSpoke, targetSide, targetSlot, opts.fillPct ?? 0.55),
    beamRange: 12,
    beamStrength: 0.5,
    thrustForce: 3200,
    rotTorque: 1200,
    tugMass: 500,
    containerMass: 2000,
    dampingAssist: false,
    startX: opts.exitMode ? 0 : -120,
    startY: 0,
    startVX: 0,
    startVY: 0,
    startAngle: 0,
  };
  if (opts.exitMode) {
    const bay = level.bays.find(b => b.spokeIdx === targetSpoke && b.side === targetSide && b.slot === targetSlot)!;
    bay.filled = false;
    bay.isTarget = false;
    bay.isPlayerBay = true;
    for (const b of level.bays) b.isTarget = false;
    const bp = bayWorldPos(bay, level.stationX, level.stationY);
    level.startX = bp.x;
    level.startY = bp.y;
    level.startAngle = bp.angle + Math.PI;
  }
  return level;
}

export const DOCKING_LEVELS: DockingLevel[] = [
  MISSION1_DOCKING,
  MISSION2_DOCKING,
  MISSION3_DOCKING,
  MISSION4_DOCKING,
  MISSION6_DOCKING,
  MISSION7_DOCKING,
];

// ===================== State =====================

export function createDockingState(level: DockingLevel, override?: DockingInitOverride): DockingState {
  return {
    x: override?.x ?? level.startX, y: override?.y ?? level.startY,
    vx: override?.vx ?? level.startVX, vy: override?.vy ?? level.startVY,
    angle: override?.angle ?? (level.startAngle || 0),
    angVel: 0,
    sas: level.dampingAssist,
    alive: true,
    delivered: false,
    thrustUp: false, thrustDown: false, thrustLeft: false, thrustRight: false,
    rotCW: false, rotCCW: false,
    sasUp: false, sasDown: false, sasLeft: false, sasRight: false,
    sasCW: false, sasCCW: false,
    beamActive: false, beamAligned: false,
    highThrust: false,
    exitComplete: false,
    leftStartBay: !level.exitMode, // if not exit mode, collision is always on
    dvUsed: 0,
  };
}

// ===================== Ship Geometry =====================

// Ship dimensions (meters)
// Cab is at the front (+X in ship-local). Frame extends behind.
const CAB_W = 4;     // cab length (along ship axis)
const CAB_H = 3.5;   // cab width (perpendicular) — roughly 20ft container proportions
const CAB_GAP = 1.5;  // gap between cab and frame
const FRAME_W = 16;   // frame length (when loaded)
const FRAME_H = 6;    // frame width (wraps container)
const CONTAINER_W = 14;
const CONTAINER_H = 4;
const EMPTY_FRAME_W = 6;  // fits around cab like a 20ft container
const EMPTY_FRAME_H = 5;

// ===================== Physics =====================

export function updateDocking(
  s: DockingState, input: InputState, level: DockingLevel, dt: number,
): void {
  if (!s.alive || s.delivered) return;

  // SAS toggle (T key)
  if (input.toggleSAS) s.sas = !s.sas;

  const mass = level.tugMass + (level.hasContainer ? level.containerMass : 0);
  const inertia = mass * 2;

  // Rotation: Q = CCW, E = CW
  s.rotCCW = false; s.rotCW = false;
  let torque = 0;
  s.sasUp = false; s.sasDown = false; s.sasLeft = false; s.sasRight = false;
  s.sasCW = false; s.sasCCW = false;

  if (input.wingAngleDown) { torque += level.rotTorque; s.rotCCW = true; }  // Q = CCW on screen
  if (input.wingAngleUp) { torque -= level.rotTorque; s.rotCW = true; }     // E = CW on screen
  if (s.sas && !input.wingAngleDown && !input.wingAngleUp) {
    if (Math.abs(s.angVel) > 0.05) {
      torque -= s.angVel * level.rotTorque * 5;
      if (s.angVel > 0.01) s.sasCW = true;
      if (s.angVel < -0.01) s.sasCCW = true;
    } else {
      s.angVel = 0; // snap to zero when close
    }
  }
  s.angVel += (torque / inertia) * dt;
  s.angle += s.angVel * dt;

  // Translation: WASD = screen directions, decomposed into ship thrusters
  s.thrustUp = false; s.thrustDown = false; s.thrustLeft = false; s.thrustRight = false;
  const hiThrust = input.toggleHighThrust; // Shift held = high thrust
  s.highThrust = hiThrust;
  const thrustMult = hiThrust ? 4 : 1;
  const force = level.thrustForce * thrustMult;

  // Screen-direction thrust in world coords
  let screenFx = 0, screenFy = 0;
  if (input.throttleUp)        screenFy += force;  // W = screen up = +Y world
  if (input.throttleDown)      screenFy -= force;  // S = screen down = -Y world
  if (input.pitch < -0.1)      screenFx -= force;  // A = screen left = -X world
  if (input.pitch > 0.1)       screenFx += force;  // D = screen right = +X world

  // Decompose into ship-local axes to determine which thrusters fire
  // Ship forward (+X local) = (cos(angle), sin(angle)) in world
  // Ship right (+Y local, screen down when angle=0) = (-sin(angle), cos(angle))... 
  // Actually: ship local +X = forward. In world: (cos a, sin a).
  // Ship local +Y = right side. In world: perpendicular CW = (sin a, -cos a)? 
  // Let's just project:
  const cosA = Math.cos(s.angle), sinA = Math.sin(s.angle);
  // Ship forward (local +X) in world = (cosA, sinA)
  // Ship left (local +Y toward screen-top when angle=0) in world = (-sinA, cosA)
  const fwd = screenFx * cosA + screenFy * sinA;      // forward component
  const lat = -screenFx * sinA + screenFy * cosA;     // left component

  if (fwd > 0.01) s.thrustRight = true;   // forward thrust (+X local)
  if (fwd < -0.01) s.thrustLeft = true;   // backward thrust (-X local)
  if (lat > 0.01) s.thrustUp = true;      // left thrust (+Y local = screen up)
  if (lat < -0.01) s.thrustDown = true;   // right thrust (-Y local = screen down)
  (s as any)._hiThrustRender = hiThrust;  // for bigger flames

  let fx = screenFx, fy = screenFy;

  // SAS translation damping
  if (s.sas) {
    const anyInput = input.throttleUp || input.throttleDown || input.pitch !== 0;
    if (!anyInput) {
      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      if (speed > 0.05) {
        const maxF = level.thrustForce * 2;
        const sasFx = -Math.max(-maxF, Math.min(maxF, s.vx * mass * 2.0));
        const sasFy = -Math.max(-maxF, Math.min(maxF, s.vy * mass * 2.0));
        fx += sasFx;
        fy += sasFy;
        const cosA = Math.cos(s.angle), sinA = Math.sin(s.angle);
        const sasFwd = sasFx * cosA + sasFy * sinA;
        const sasLat = -sasFx * sinA + sasFy * cosA;
        if (sasFwd > 0.01) s.sasRight = true;
        if (sasFwd < -0.01) s.sasLeft = true;
        if (sasLat > 0.01) s.sasUp = true;
        if (sasLat < -0.01) s.sasDown = true;
      } else {
        s.vx = 0; s.vy = 0; // snap to zero when close
      }
    }
  }

  const thrusterFx = fx;
  const thrusterFy = fy;
  s.dvUsed += Math.sqrt(thrusterFx * thrusterFx + thrusterFy * thrusterFy) / mass * dt;

  // Tractor beam: alignment-gated, PID-like pull + rotation (not in exit mode)
  s.beamActive = false;
  s.beamAligned = false;
  if (level.hasContainer && !level.exitMode) {
    const target = level.bays.find(b => b.isTarget);
    if (target) {
      const bp = bayWorldPos(target, level.stationX, level.stationY);
      const tdx = bp.x - s.x, tdy = bp.y - s.y;
      const tDist = Math.sqrt(tdx * tdx + tdy * tdy);

      if (tDist < level.beamRange) {
        // Check alignment: ship angle vs bay open angle (need ~180° offset since ship backs in)
        const targetAngle = bp.angle + Math.PI; // ship should face opposite to bay opening
        let angleDiff = s.angle - targetAngle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        if (Math.abs(angleDiff) < 0.18) { // ~10 degrees
          s.beamAligned = true;
          s.beamActive = true;

          // Rotational correction: critically damped PD
          // For critical damping: D = 2 * sqrt(K * I)
          const rotK = 3.0;
          const rotD = 2 * Math.sqrt(rotK * inertia / level.rotTorque) + 2.0;
          torque -= angleDiff * level.rotTorque * rotK;
          torque -= s.angVel * level.rotTorque * rotD;
          // Snap when very close
          if (Math.abs(angleDiff) < 0.01 && Math.abs(s.angVel) < 0.05) {
            s.angle -= angleDiff; // snap to exact target
            s.angVel = 0;
          }

          // Translational correction: PD controller toward bay center
          const posK = level.beamStrength * mass * 3.0; // proportional
          const velK = level.beamStrength * mass * 4.0; // derivative (damping to prevent overshoot)
          fx += tdx * posK - s.vx * velK;
          fy += tdy * posK - s.vy * velK;
        } else {
          s.beamAligned = false;
        }
      }
    }
  }

  s.vx += (fx / mass) * dt;
  s.vy += (fy / mass) * dt;

  s.x += s.vx * dt;
  s.y += s.vy * dt;

  // Track when player has left the starting bay (for exit mode)
  if (!s.leftStartBay) {
    const distFromStart = Math.sqrt(
      (s.x - level.startX) * (s.x - level.startX) +
      (s.y - level.startY) * (s.y - level.startY)
    );
    if (distFromStart > BAY_SLOT_D + 5) s.leftStartBay = true;
  }

  // Collision: check probe points (only after leaving start bay)
  if (!s.leftStartBay) { /* skip collision while inside starting bay */ }
  else {
  const colCos = Math.cos(s.angle), colSin = Math.sin(s.angle);
  const probes: [number, number][] = [];

  if (level.hasContainer) {
    // Frame: 10 points around the frame perimeter (centered on origin)
    const fhw = FRAME_W / 2, fhh = FRAME_H / 2;
    probes.push(
      [-fhw, -fhh], [-fhw, 0], [-fhw, fhh],           // rear edge
      [fhw, -fhh], [fhw, 0], [fhw, fhh],              // front edge of frame
      [0, -fhh], [0, fhh],                              // side centers
      [-fhw * 0.5, -fhh], [-fhw * 0.5, fhh],          // mid-rear sides
    );
    // Cab: 4 corners
    const cabX0 = fhw + CAB_GAP;
    const cabX1 = cabX0 + CAB_W;
    const cabHH = CAB_H / 2;
    probes.push([cabX0, -cabHH], [cabX0, cabHH], [cabX1, -cabHH * 0.7], [cabX1, cabHH * 0.7]);
    // Container: 4 corners + 2 midpoints
    const chw = CONTAINER_W / 2, chh = CONTAINER_H / 2;
    probes.push([-chw, -chh], [-chw, chh], [chw, -chh], [chw, chh], [0, -chh], [0, chh]);
  } else {
    // Empty: frame + cab inside
    const fhw = EMPTY_FRAME_W / 2, fhh = EMPTY_FRAME_H / 2;
    probes.push(
      [-fhw, -fhh], [-fhw, 0], [-fhw, fhh],
      [fhw, -fhh], [fhw, 0], [fhw, fhh],
      [0, -fhh], [0, fhh],
    );
    // Cab corners
    const chh2 = CAB_H / 2;
    probes.push([-CAB_W / 2, -chh2], [CAB_W / 2, -chh2], [-CAB_W / 2, chh2], [CAB_W / 2, chh2]);
  }

  for (const [lx, ly] of probes) {
    const wx = s.x + lx * colCos - ly * colSin;
    const wy = s.y + lx * colSin + ly * colCos;
    const col = stationCollision(wx, wy, level.stationX, level.stationY, level.bays);
    if (col) {
      s.x += col.nx * col.depth * 1.1;
      s.y += col.ny * col.depth * 1.1;
      const vNorm = s.vx * col.nx + s.vy * col.ny;
      if (vNorm < 0) {
        const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        if (speed > 5) { s.alive = false; return; }
        // Stop along collision normal (no bounce)
        s.vx -= col.nx * vNorm;
        s.vy -= col.ny * vNorm;
      }
      break;
    }
  }
  } // end collision else block

  // Delivery check: container inside target bay + nearly stationary
  if (level.hasContainer && !level.exitMode) {
    const target = level.bays.find(b => b.isTarget);
    if (target) {
      const bp = bayWorldPos(target, level.stationX, level.stationY);
      const dx = s.x - bp.x, dy = s.y - bp.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      if (dist < 3 && speed < 0.5 && Math.abs(s.angVel) < 0.1) {
        s.delivered = true;
      }
    }
  }

  // Exit check: far enough from station
  if (level.exitMode) {
    const edx = s.x - level.stationX, edy = s.y - level.stationY;
    const eDist = Math.sqrt(edx * edx + edy * edy);
    if (eDist > level.exitDistance) {
      s.exitComplete = true;
    }
  }
}

// ===================== Camera =====================

export interface DockingCamera {
  x: number; y: number;
  zoom: number; // pixels per meter
}

export function createDockingCamera(): DockingCamera {
  return { x: 0, y: 0, zoom: 4 };
}

export function updateDockingCamera(
  cam: DockingCamera, s: DockingState, level: DockingLevel, dt: number, W: number, H: number,
): void {
  const smooth = dt <= 0 ? 1 : 1 - Math.exp(-3.0 * dt);

  let targetX = s.x;
  let targetY = s.y;
  let targetZoom = 4;

  if (level.exitMode) {
    const dx = level.stationX - s.x;
    const dy = level.stationY - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    targetX = (s.x + level.stationX) * 0.5;
    targetY = (s.y + level.stationY) * 0.5;
    targetZoom = Math.min(4, Math.max(1.8, Math.min((W * 0.7) / Math.max(dist, 40), (H * 0.7) / Math.max(dist, 40))));
  } else {
    const target = level.bays.find(b => b.isTarget);
    if (target) {
      const bp = bayWorldPos(target, level.stationX, level.stationY);
      const dx = bp.x - s.x;
      const dy = bp.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      targetX = (s.x + bp.x) * 0.5;
      targetY = (s.y + bp.y) * 0.5;
      const fitDist = Math.max(30, dist + 25);
      targetZoom = Math.min(4, Math.max(2.0, Math.min((W * 0.7) / fitDist, (H * 0.7) / fitDist)));
    }
  }

  cam.x += (targetX - cam.x) * smooth;
  cam.y += (targetY - cam.y) * smooth;
  cam.zoom += (targetZoom - cam.zoom) * smooth;
}

// ===================== Rendering =====================

function dws(wx: number, wy: number, cam: DockingCamera, W: number, H: number): [number, number] {
  return [
    (wx - cam.x) * cam.zoom + W / 2,
    -(wy - cam.y) * cam.zoom + H / 2, // Y flipped
  ];
}

export function renderDocking(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
  cam: DockingCamera, s: DockingState, level: DockingLevel, time: number,
): void {
  const W = canvas.width, H = canvas.height;

  // Background
  ctx.fillStyle = '#030308';
  ctx.fillRect(0, 0, W, H);

  // Stars
  drawDockingStars(ctx, W, H);

  // Station
  drawStation(ctx, cam, level, W, H);

  // Ship (tug + container)
  drawTug(ctx, cam, s, level, W, H, time);

  // Neutral X at ship center
  const [cx, cy] = dws(s.x, s.y, cam, W, H);
  ctx.strokeStyle = 'rgba(0, 255, 136, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy - 5); ctx.lineTo(cx + 5, cy + 5);
  ctx.moveTo(cx + 5, cy - 5); ctx.lineTo(cx - 5, cy + 5);
  ctx.stroke();

  // Prediction dot (where ship will be in 2s)
  const predX = s.x + s.vx * 2;
  const predY = s.y + s.vy * 2;
  const [px, py] = dws(predX, predY, cam, W, H);
  ctx.beginPath();
  ctx.arc(px, py, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 255, 136, 0.3)';
  ctx.fill();

  drawDockingTargetIndicator(ctx, cam, s, level, W, H);
}

function drawDockingTargetIndicator(
  ctx: CanvasRenderingContext2D, cam: DockingCamera,
  s: DockingState, level: DockingLevel, W: number, H: number,
): void {
  const target = level.bays.find(b => b.isTarget);
  if (!target) return;
  const bp = bayWorldPos(target, level.stationX, level.stationY);
  const [tx, ty] = dws(bp.x, bp.y, cam, W, H);
  const margin = 40;
  const onScreen = tx > margin && tx < W - margin && ty > margin && ty < H - margin;
  if (onScreen) return;

  const cx = Math.max(margin, Math.min(W - margin, tx));
  const cy = Math.max(margin, Math.min(H - margin, ty));
  const dx = tx - cx, dy = ty - cy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  const nx = dx / len, ny = dy / len;
  const as = 10;
  ctx.beginPath();
  ctx.moveTo(cx + nx * as, cy + ny * as);
  ctx.lineTo(cx - nx * 4 - ny * as * 0.5, cy - ny * 4 + nx * as * 0.5);
  ctx.lineTo(cx - nx * 4 + ny * as * 0.5, cy - ny * 4 - nx * as * 0.5);
  ctx.closePath();
  ctx.fillStyle = '#00ffcc';
  ctx.fill();

  const dist = Math.sqrt((s.x - bp.x) ** 2 + (s.y - bp.y) ** 2);
  ctx.font = '11px monospace';
  ctx.fillStyle = '#00ffcc';
  ctx.textAlign = 'center';
  ctx.fillText(`TGT ${dist.toFixed(0)}m`, cx, cy - 14);
}

// --- Stars ---
const DOCK_STARS: { x: number; y: number; b: number }[] = [];
function drawDockingStars(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  if (DOCK_STARS.length === 0) {
    let seed = 54321;
    for (let i = 0; i < 150; i++) {
      seed = (seed * 16807) % 2147483647;
      DOCK_STARS.push({
        x: (seed / 2147483647) * 1.2 - 0.1,
        y: ((seed = (seed * 16807) % 2147483647) / 2147483647) * 1.2 - 0.1,
        b: 0.15 + ((seed = (seed * 16807) % 2147483647) / 2147483647) * 0.4,
      });
    }
  }
  for (const star of DOCK_STARS) {
    ctx.fillStyle = `rgba(180, 190, 210, ${star.b})`;
    ctx.fillRect(star.x * W, star.y * H, 1.5, 1.5);
  }
}

// --- Station ---
function drawStation(
  ctx: CanvasRenderingContext2D, cam: DockingCamera,
  level: DockingLevel, W: number, H: number,
): void {
  const z = cam.zoom;
  const sx = level.stationX, sy = level.stationY;

  // --- Hub (filled dark circle with outline) ---
  const [hx, hy] = dws(sx, sy, cam, W, H);
  const hr = HUB_RADIUS * z;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0f14';
  ctx.fill();
  ctx.strokeStyle = '#556677';
  ctx.lineWidth = 2;
  ctx.stroke();

  // --- 4 Spokes ---
  for (let spoke = 0; spoke < 4; spoke++) {
    const a = spoke * Math.PI / 2;
    const sdx = Math.cos(a), sdy = Math.sin(a);
    const pdx = -sdy, pdy = sdx;

    // Spoke core rectangle
    const startDist = HUB_RADIUS;
    const endDist = HUB_RADIUS + SPOKE_LEN;
    const hw = SPOKE_WIDTH / 2;

    // 4 corners of spoke in world coords
    const corners = [
      [sx + sdx * startDist + pdx * hw, sy + sdy * startDist + pdy * hw],
      [sx + sdx * endDist + pdx * hw, sy + sdy * endDist + pdy * hw],
      [sx + sdx * endDist - pdx * hw, sy + sdy * endDist - pdy * hw],
      [sx + sdx * startDist - pdx * hw, sy + sdy * startDist - pdy * hw],
    ];

    ctx.beginPath();
    for (let i = 0; i < corners.length; i++) {
      const [scx, scy] = dws(corners[i][0], corners[i][1], cam, W, H);
      if (i === 0) ctx.moveTo(scx, scy); else ctx.lineTo(scx, scy);
    }
    ctx.closePath();
    ctx.fillStyle = '#080c10';
    ctx.fill();
    ctx.strokeStyle = '#445566';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // --- Bay walls and containers ---
  for (let spoke = 0; spoke < 4; spoke++) {
    const a = spoke * Math.PI / 2;
    const sdx = Math.cos(a), sdy = Math.sin(a);
    const pdx = -sdy, pdy = sdx;

    for (let side = 0; side < 2; side++) {
      const sideSign = side === 0 ? 1 : -1;

      // Draw walls between bays (blue)
      for (let wallIdx = 0; wallIdx <= BAYS_PER_SIDE; wallIdx++) {
        const wallAlong = HUB_RADIUS + wallIdx * BAY_PITCH;
        const wallStart = SPOKE_WIDTH / 2;
        const wallEnd = SPOKE_WIDTH / 2 + BAY_SLOT_D;
        // Wall is a thin line from spoke edge outward
        const w0x = sx + sdx * wallAlong + pdx * wallStart * sideSign;
        const w0y = sy + sdy * wallAlong + pdy * wallStart * sideSign;
        const w1x = sx + sdx * wallAlong + pdx * wallEnd * sideSign;
        const w1y = sy + sdy * wallAlong + pdy * wallEnd * sideSign;
        const [sw0x, sw0y] = dws(w0x, w0y, cam, W, H);
        const [sw1x, sw1y] = dws(w1x, w1y, cam, W, H);
        ctx.beginPath();
        ctx.moveTo(sw0x, sw0y); ctx.lineTo(sw1x, sw1y);
        ctx.strokeStyle = '#4466aa';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Draw contents of each bay (no back wall — bays open on outside)
      for (let slot = 0; slot < BAYS_PER_SIDE; slot++) {
        const bay = level.bays.find(b => b.spokeIdx === spoke && b.side === side && b.slot === slot)!;

        // Container inside (same shape as player's container, diverse colors)
        if (bay.filled) {
          const bp = bayWorldPos(bay, sx, sy);
          const oa = bp.angle;
          // Container is CONTAINER_W x CONTAINER_H, centered in bay
          // In bay coords: long axis perpendicular to spoke (depth direction)
          const cos2 = Math.cos(oa), sin2 = Math.sin(oa);
          const cw2 = CONTAINER_W / 2, ch2 = CONTAINER_H / 2;
          // depth dir = (cos oa, sin oa), width dir = (-sin oa, cos oa)
          const ddx2 = cos2, ddy2 = sin2;
          const wdx2 = -sin2, wdy2 = cos2;
          const corners = [
            [bp.x - wdx2*ch2 - ddx2*cw2, bp.y - wdy2*ch2 - ddy2*cw2],
            [bp.x + wdx2*ch2 - ddx2*cw2, bp.y + wdy2*ch2 - ddy2*cw2],
            [bp.x + wdx2*ch2 + ddx2*cw2, bp.y + wdy2*ch2 + ddy2*cw2],
            [bp.x - wdx2*ch2 + ddx2*cw2, bp.y - wdy2*ch2 + ddy2*cw2],
          ];
          const fills = ['#2a1a1a', '#1a1a2a', '#2a2a1a', '#1a2a2a', '#2a1a2a'];
          const strokes2 = ['#aa5533', '#5533aa', '#aaaa33', '#33aa99', '#aa33aa'];
          ctx.beginPath();
          for (let ci = 0; ci < 4; ci++) {
            const [scx2, scy2] = dws(corners[ci][0], corners[ci][1], cam, W, H);
            if (ci === 0) ctx.moveTo(scx2, scy2); else ctx.lineTo(scx2, scy2);
          }
          ctx.closePath();
          ctx.fillStyle = fills[bay.colorIdx % fills.length];
          ctx.fill();
          ctx.strokeStyle = strokes2[bay.colorIdx % strokes2.length];
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Target bay highlight
        if (bay.isTarget) {
          const bp = bayWorldPos(bay, sx, sy);
          const [tcx, tcy] = dws(bp.x, bp.y, cam, W, H);
          // Dashed rectangle showing where to park
          const oa = bp.angle;
          const cos2 = Math.cos(oa), sin2 = Math.sin(oa);
          const cw2 = CONTAINER_W / 2, ch2 = CONTAINER_H / 2;
          const ddx2 = cos2, ddy2 = sin2;
          const wdx2 = -sin2, wdy2 = cos2;
          const tc = [
            [bp.x - wdx2*ch2 - ddx2*cw2, bp.y - wdy2*ch2 - ddy2*cw2],
            [bp.x + wdx2*ch2 - ddx2*cw2, bp.y + wdy2*ch2 - ddy2*cw2],
            [bp.x + wdx2*ch2 + ddx2*cw2, bp.y + wdy2*ch2 + ddy2*cw2],
            [bp.x - wdx2*ch2 + ddx2*cw2, bp.y - wdy2*ch2 + ddy2*cw2],
          ];
          ctx.beginPath();
          for (let ci = 0; ci < 4; ci++) {
            const [scx2, scy2] = dws(tc[ci][0], tc[ci][1], cam, W, H);
            if (ci === 0) ctx.moveTo(scx2, scy2); else ctx.lineTo(scx2, scy2);
          }
          ctx.closePath();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = '#00ffcc';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = '9px monospace';
          ctx.fillStyle = '#00ffcc';
          ctx.textAlign = 'center';
          ctx.fillText('TGT', tcx, tcy + 3);
        }
      }
    }
  }
}

// --- Tug + Container ---
function drawTug(
  ctx: CanvasRenderingContext2D, cam: DockingCamera,
  s: DockingState, level: DockingLevel, W: number, H: number, time: number,
): void {
  const [sx, sy] = dws(s.x, s.y, cam, W, H);
  const z = cam.zoom;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-s.angle);

  const cabW = CAB_W * z;
  const cabH = CAB_H * z;
  const gap = CAB_GAP * z;

  if (level.hasContainer) {
    // === LOADED CONFIG ===
    const frameW = FRAME_W * z;
    const frameH = FRAME_H * z;
    const contW = CONTAINER_W * z;
    const contH = CONTAINER_H * z;

    // Layout: [frame with container] --gap-- [cab]
    // Frame center is origin, cab is to the right
    const frameX0 = -frameW / 2;
    const frameX1 = frameW / 2;
    const cabX0 = frameX1 + gap; // cab starts after gap

    // Container (centered in frame)
    ctx.fillStyle = '#1a2a1a';
    ctx.fillRect(-contW / 2, -contH / 2, contW, contH);
    ctx.strokeStyle = '#44aa66';
    ctx.lineWidth = 1;
    ctx.strokeRect(-contW / 2, -contH / 2, contW, contH);
    // Container stripes
    ctx.strokeStyle = 'rgba(68, 170, 102, 0.3)';
    for (let i = 1; i < 4; i++) {
      const lx = -contW / 2 + (contW * i) / 4;
      ctx.beginPath(); ctx.moveTo(lx, -contH / 2); ctx.lineTo(lx, contH / 2); ctx.stroke();
    }

    // Frame wireframe
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(frameX0, -frameH / 2, frameW, frameH);

    // Corner brackets
    const cb = frameH * 0.12;
    ctx.lineWidth = 2;
    for (const [bx, by, dx, dy] of [
      [frameX0, -frameH/2, 1, 1], [frameX1, -frameH/2, -1, 1],
      [frameX0, frameH/2, 1, -1], [frameX1, frameH/2, -1, -1],
    ] as [number, number, number, number][]) {
      ctx.beginPath();
      ctx.moveTo(bx, by + dy * cb); ctx.lineTo(bx, by); ctx.lineTo(bx + dx * cb, by);
      ctx.stroke();
    }

    // Connecting lines: frame to cab
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(frameX1, -cabH / 2 * 0.8); ctx.lineTo(cabX0, -cabH / 2 * 0.8);
    ctx.moveTo(frameX1, cabH / 2 * 0.8); ctx.lineTo(cabX0, cabH / 2 * 0.8);
    ctx.stroke();

    // Cab
    drawCab(ctx, cabX0, cabW, cabH);

    // Nozzles under, flames on top (drawn after frame/container)
    drawNozzles(ctx, frameX0, frameX1, frameH);
    // (flames drawn below, after cab)

  } else {
    // === EMPTY CONFIG — cab inside a compact frame ===
    const efW = EMPTY_FRAME_W * z;
    const efH = EMPTY_FRAME_H * z;
    const frameX0 = -efW / 2;
    const frameX1 = efW / 2;

    // Frame (solid, around the cab)
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(frameX0, -efH / 2, efW, efH);

    // Cab inside frame (centered)
    const innerCabX = -cabW / 2;
    drawCab(ctx, innerCabX, cabW, cabH);

    drawNozzles(ctx, frameX0, frameX1, efH);
  }

  // Flames drawn LAST (on top of everything)
  if (level.hasContainer) {
    const frameW = FRAME_W * z;
    const frameH = FRAME_H * z;
    drawFlames(ctx, -frameW / 2, frameW / 2, frameH, z, s, time);
  } else {
    const efW = EMPTY_FRAME_W * z;
    const efH = EMPTY_FRAME_H * z;
    drawFlames(ctx, -efW / 2, efW / 2, efH, z, s, time);
  }

  ctx.restore();
}

function drawCab(ctx: CanvasRenderingContext2D, x0: number, w: number, h: number): void {
  // Trapezoid: wider at back, narrower at front
  const narrow = h * 0.7;
  ctx.fillStyle = '#0c180c';
  ctx.beginPath();
  ctx.moveTo(x0, -h / 2);
  ctx.lineTo(x0 + w, -narrow / 2);
  ctx.lineTo(x0 + w, narrow / 2);
  ctx.lineTo(x0, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cockpit window
  ctx.strokeStyle = '#00ccff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0 + w * 0.5, -narrow * 0.3);
  ctx.lineTo(x0 + w * 0.85, -narrow * 0.2);
  ctx.lineTo(x0 + w * 0.85, narrow * 0.2);
  ctx.lineTo(x0 + w * 0.5, narrow * 0.3);
  ctx.closePath();
  ctx.stroke();
}

function drawNozzles(
  ctx: CanvasRenderingContext2D,
  x0: number, x1: number, fh: number,
): void {
  const fw = x1 - x0;
  const t1x = x0 + fw * 0.25;
  const t2x = x0 + fw * 0.75;
  const nz = fh * 0.18;
  ctx.fillStyle = '#557755';
  for (const tx of [t1x, t2x]) {
    ctx.beginPath();
    ctx.moveTo(tx - nz, -fh / 2); ctx.lineTo(tx + nz, -fh / 2); ctx.lineTo(tx, -fh / 2 - nz);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tx - nz, fh / 2); ctx.lineTo(tx + nz, fh / 2); ctx.lineTo(tx, fh / 2 + nz);
    ctx.closePath(); ctx.fill();
  }
}

function drawFlames(
  ctx: CanvasRenderingContext2D,
  x0: number, x1: number, fh: number, z: number,
  s: DockingState, time: number,
): void {
  const fw = x1 - x0;
  const t1x = x0 + fw * 0.25;
  const t2x = x0 + fw * 0.75;
  const nz = fh * 0.18;
  const hi = (s as any)._hiThrustRender;
  const flicker = 0.8 + 0.2 * Math.sin(time * 40) * Math.cos(time * 67);
  const fl = (hi ? 4.2 : 2.2) * z * flicker;
  const rcsfl = (hi ? 2.2 : 1.3) * z * flicker;

  function drawGlow(x: number, y: number, r: number, outer = 0.42, inner = 0.95) {
    ctx.beginPath();
    ctx.arc(x, y, r * 1.45, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 190, 80, ${outer})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 245, 210, ${inner})`;
    ctx.fill();
  }

  function drawFlare(x: number, y: number, dx: number, dy: number, len: number, width: number, glow = true) {
    const px = -dy;
    const py = dx;
    if (glow) drawGlow(x, y, Math.max(1.2, width * 0.7));

    ctx.beginPath();
    ctx.moveTo(x - px * width * 0.5, y - py * width * 0.5);
    ctx.lineTo(x + dx * len, y + dy * len);
    ctx.lineTo(x + px * width * 0.5, y + py * width * 0.5);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 210, 110, 0.95)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x - px * width * 0.18, y - py * width * 0.18);
    ctx.lineTo(x + dx * len * 0.55, y + dy * len * 0.55);
    ctx.lineTo(x + px * width * 0.18, y + py * width * 0.18);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 250, 225, 0.98)';
    ctx.fill();
  }

  function drawMainSet(up: boolean, down: boolean, fwd: boolean, back: boolean, flameLen?: number) {
    const f = flameLen ?? fl;
    const width = nz * 0.95;
    for (const tx of [t1x, t2x]) {
      if (up) drawFlare(tx, fh / 2 + nz, 0, 1, f, width);
      if (down) drawFlare(tx, -fh / 2 - nz, 0, -1, f, width);
      if (fwd) {
        drawFlare(tx, -fh / 2 - nz, -1, 0, f * 0.9, width * 0.75);
        drawFlare(tx, fh / 2 + nz, -1, 0, f * 0.9, width * 0.75);
      }
      if (back) {
        drawFlare(tx, -fh / 2 - nz, 1, 0, f * 0.9, width * 0.75);
        drawFlare(tx, fh / 2 + nz, 1, 0, f * 0.9, width * 0.75);
      }
    }
  }

  function drawRCS(ccw: boolean, cw: boolean, len: number) {
    const width = Math.max(0.9, nz * 0.45);
    // CCW on screen: top-left fires up, bottom-right fires down
    if (ccw) {
      drawFlare(x0 + nz * 0.3, -fh / 2, 0, -1, len, width, false);
      drawFlare(x1 - nz * 0.3, fh / 2, 0, 1, len, width, false);
    }
    // CW on screen: top-right fires up, bottom-left fires down
    if (cw) {
      drawFlare(x1 - nz * 0.3, -fh / 2, 0, -1, len, width, false);
      drawFlare(x0 + nz * 0.3, fh / 2, 0, 1, len, width, false);
    }
  }

  drawMainSet(s.thrustUp, s.thrustDown, s.thrustRight, s.thrustLeft);
  drawRCS(s.rotCCW, s.rotCW, rcsfl);

  const normalFl = 2.0 * z * flicker;
  const normalRcs = 1.1 * z * flicker;
  drawMainSet(s.sasUp, s.sasDown, s.sasRight, s.sasLeft, normalFl);
  drawRCS(s.sasCCW, s.sasCW, normalRcs);
}

// ===================== HUD =====================

export function drawDockingHUD(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
  s: DockingState, level: DockingLevel,
  state: 'docking' | 'delivered' | 'crashed',
  completionText: string = '',
  destinationName: string | undefined,
  destinationLocation: string | undefined,
  phaseDvUsed: number = 0,
  missionDvUsed: number = 0,
  suppressStateOverlays = false,
): void {
  const W = canvas.width, H = canvas.height;
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);

  ctx.save();
  ctx.font = '14px "Courier New", monospace';
  ctx.textAlign = 'left';

  const lx = 20;
  let ly = 30;
  const lh = 20;

  ctx.font = '13px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = COL_HUD_DIM;
  ctx.fillText(level.name, W - 20, 24);

  ctx.textAlign = 'left';
  ctx.font = '14px "Courier New", monospace';

  drawHudLabel(ctx, lx, ly, 'SPD', `${speed.toFixed(1)} m/s`, COL_HUD); ly += lh;
  drawHudLabel(ctx, lx, ly, 'ANG', `${(s.angle * 180 / Math.PI).toFixed(1)}°`, COL_HUD); ly += lh;
  drawHudLabel(ctx, lx, ly, 'THR', s.highThrust ? 'HIGH' : 'LOW', s.highThrust ? COL_WARNING : COL_HUD_DIM); ly += lh;
  drawHudLabel(ctx, lx, ly, 'SAS', s.sas ? 'ON' : 'OFF', s.sas ? COL_SUCCESS : COL_HUD_DIM); ly += lh;
  drawHudLabel(ctx, lx, ly, 'PH ΔV', `${phaseDvUsed.toFixed(0)} m/s`, COL_HUD); ly += lh;
  drawHudLabel(ctx, lx, ly, 'MIS ΔV', `${missionDvUsed.toFixed(0)} m/s`, COL_HUD); ly += lh;

  const target = level.bays.find(b => b.isTarget);
  const panelRows: { label: string; value: string; color?: string }[] = [];
  let guidance = level.exitMode
    ? `Clear the station to at least ${level.exitDistance.toFixed(0)} m.`
    : 'Close on the target bay and align the container.';

  if (target && !level.exitMode) {
    const bp = bayWorldPos(target, level.stationX, level.stationY);
    const dx = s.x - bp.x, dy = s.y - bp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const targetAngle = bp.angle + Math.PI;
    let angleDiff = s.angle - targetAngle;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    panelRows.push({ label: 'DIST', value: `${dist.toFixed(1)} m < ${level.beamRange.toFixed(1)} m`, color: dist < level.beamRange ? COL_SUCCESS : COL_HUD });
    panelRows.push({ label: 'ALIGN', value: `${(Math.abs(angleDiff) * 180 / Math.PI).toFixed(1)}° < 10.3°`, color: Math.abs(angleDiff) < 0.18 ? COL_SUCCESS : COL_WARNING });
    guidance = s.beamActive
      ? 'Hold alignment and let the tractor beam pull you in.'
      : dist < level.beamRange
        ? 'Align the container to activate the tractor beam.'
        : 'Close on the target bay and align the container.';
  }

  if (level.exitMode) {
    const edx = s.x - level.stationX, edy = s.y - level.stationY;
    const eDist = Math.sqrt(edx * edx + edy * edy);
    panelRows.push({ label: 'STN', value: `${eDist.toFixed(0)} m > ${level.exitDistance.toFixed(0)} m`, color: eDist >= level.exitDistance ? COL_SUCCESS : COL_HUD });
  }

  drawHudInfoPanel(ctx, canvas, {
    title: 'DESTINATION',
    name: level.finalDestinationName ?? destinationName ?? level.name,
    subtitle: level.finalDestinationLocation ?? destinationLocation,
    rows: panelRows,
    guidance: level.nextObjectiveDetail ?? guidance,
  });

  // Tractor beam warning
  if (state === 'docking' && target) {
    const bp = bayWorldPos(target, level.stationX, level.stationY);
    const dx = s.x - bp.x, dy = s.y - bp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < level.beamRange) {
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      if (s.beamActive) {
        ctx.fillStyle = '#00ffcc';
        ctx.fillText('\u25c7 TRACTOR BEAM ACTIVE \u25c7', W / 2, 30);
      } else {
        ctx.fillStyle = '#ffaa00';
        if (Math.sin(Date.now() * 0.008) > -0.3) {
          ctx.fillText('ALIGN CONTAINER TO ACTIVATE BEAM', W / 2, 30);
        }
      }
    }
  }

  // State overlays
  if (!suppressStateOverlays && state === 'delivered') {
    const boxH = completionText ? 200 : 120;
    ctx.fillStyle = 'rgba(0, 20, 0, 0.6)';
    ctx.fillRect(W / 2 - 230, H / 2 - 80, 460, boxH);
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 230, H / 2 - 80, 460, boxH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('DELIVERED', W / 2, H / 2 - 35);
    if (completionText) {
      ctx.fillStyle = '#88aa88';
      ctx.font = '12px monospace';
      const maxW = 400;
      const words = completionText.split(' ');
      let line = '';
      let y = H / 2 - 5;
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxW) {
          ctx.fillText(line, W / 2, y);
          line = word;
          y += 16;
        } else line = test;
      }
      if (line) ctx.fillText(line, W / 2, y);
    }
    ctx.fillStyle = COL_HUD_DIM;
    ctx.font = '14px monospace';
    ctx.fillText('BACKSPACE: Retry  |  L: Levels', W / 2, H / 2 - 80 + boxH - 15);
  }
  if (!suppressStateOverlays && state === 'crashed') {
    ctx.fillStyle = 'rgba(20, 0, 0, 0.6)';
    ctx.fillRect(W / 2 - 200, H / 2 - 60, 400, 120);
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 200, H / 2 - 60, 400, 120);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff3333';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('CRASHED', W / 2, H / 2 - 15);
    ctx.fillStyle = COL_HUD_DIM;
    ctx.font = '14px monospace';
    ctx.fillText('BACKSPACE: Retry  |  L: Levels', W / 2, H / 2 + 25);
  }

  // Controls hint
  if (state === 'docking') {
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = COL_HUD_DIM;
    ctx.fillText('W/S: Up/Down  A/D: Left/Right  Q/E: Rotate  T: SAS  Shift: Hi Thrust  BACKSPACE: Restart  L: Levels', W / 2, H - 15);
  }

  ctx.restore();
}
