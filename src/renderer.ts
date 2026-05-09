// Canvas rendering: ship, terrain, effects.
// Wireframe style on dark background.

import { config } from './config';
import {
  ShipState, SHIP_OUTLINE, CAB_OUTLINE, BELT_LINE, ENGINE_PODS, COCKPIT_LINE, GEAR_LEFT, GEAR_RIGHT,
  COLLISION_POINTS, GEAR_COLLISION_POINTS, landingAutoAngleTarget, localToWorld,
} from './ship';
import { LevelDef } from './levels';
import { TerrainData, checkLandingCollision } from './terrain';

// --- Colors ---
const COL_BG = '#050510';
const COL_SHIP = '#00ff88';
const COL_SHIP_DIM = '#006633';
const COL_TRIM = '#2d7a55';
const COL_COCKPIT = '#00ccff';
const COL_THRUST = '#ffaa00';
const COL_THRUST_CORE = '#ffffff';
const COL_RCS = '#ff4400';
const COL_TERRAIN = '#224422';
const COL_TERRAIN_BRIGHT = '#33aa44';
const COL_PAD = '#00ff00';
const COL_PAD_MARKING = '#00cc00';
const COL_GEAR = '#00dd66';
const COL_STARS = '#334';

// --- Camera ---
export interface Camera {
  x: number;
  y: number;
  zoom: number; // px per meter
}

export function createCamera(): Camera {
  return { x: config.startX, y: config.startY, zoom: 2 };
}

export function updateCamera(cam: Camera, ship: ShipState, terrainHeight: number, dt: number): void {
  const c = config;
  const t = 1 - Math.exp(-c.cameraSmoothing * dt);

  // Dynamic zoom based on altitude above terrain
  const altitude = ship.y - terrainHeight;
  const zoomT = Math.max(0, Math.min(1, (altitude - c.zoomLowAlt) / (c.zoomHighAlt - c.zoomLowAlt)));
  const targetZoom = c.maxZoom + (c.minZoom - c.maxZoom) * zoomT;
  cam.zoom += (targetZoom - cam.zoom) * t;

  // Horizontal: follow ship with velocity lead
  const targetX = ship.x + ship.vx * c.cameraLeadFactor;
  cam.x += (targetX - cam.x) * t;

  // Vertical: pan down to show ground, keep ship in top ~10-20%
  const viewH = 600 / cam.zoom; // approximate screen height in world units
  // Ship at 10% from top: cam.y = ship.y - 0.4 * viewH
  const shipTopCy = ship.y - 0.4 * viewH;
  // Ground at bottom ~10%: cam.y = terrainHeight + 0.4 * viewH
  const groundCy = terrainHeight + 0.4 * viewH;
  // Choose: show ground if possible, but don't push ship below top 10%
  const targetY = Math.max(shipTopCy, Math.min(ship.y, groundCy));
  cam.y += (targetY - cam.y) * t;
}

// --- World-to-screen transform ---
export function worldToScreen(
  wx: number, wy: number,
  cam: Camera, canvasW: number, canvasH: number
): [number, number] {
  const sx = (wx - cam.x) * cam.zoom + canvasW / 2;
  const sy = -(wy - cam.y) * cam.zoom + canvasH / 2; // flip y
  return [sx, sy];
}

// --- Main render ---
export function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  cam: Camera,
  ship: ShipState,
  terrain: TerrainData,
  level: LevelDef,
  time: number,
): void {
  const W = canvas.width;
  const H = canvas.height;

  // Clear
  ctx.fillStyle = COL_BG;
  ctx.fillRect(0, 0, W, H);

  // Stars (simple static dots)
  drawStars(ctx, cam, W, H);

  // Terrain
  drawTerrain(ctx, cam, terrain, level, W, H);
  drawCustomLandingLayout(ctx, cam, level, W, H);

  // Landing pad markings
  drawPad(ctx, cam, terrain, level, W, H);

  // Predicted trajectory
  drawPredictedTrajectory(ctx, cam, ship, terrain, level, W, H, time);

  // Ship
  drawShip(ctx, cam, ship, W, H, time);
}

export function drawLaunchGuidance(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  cam: Camera,
  terrain: TerrainData,
  targetAltitude: number,
  orbitDir: 1 | -1,
): void {
  const W = canvas.width;
  const H = canvas.height;
  const worldY = terrain.pad.y + targetAltitude;
  const [, sy] = worldToScreen(cam.x, worldY, cam, W, H);
  const onScreen = sy > 0 && sy < H;

  ctx.save();
  if (onScreen) {
    ctx.strokeStyle = 'rgba(0,255,204,0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(W, sy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    const dirArrow = orbitDir > 0 ? '→' : '←';
    ctx.fillText(`ASCENT ALT ${targetAltitude.toFixed(0)}m   ${dirArrow}`, W / 2, sy - 10);
  } else {
    const cy = Math.max(36, Math.min(H - 36, sy));
    const dir = sy < 0 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(W - 36, cy + dir * 10);
    ctx.lineTo(W - 44, cy - dir * 4);
    ctx.lineTo(W - 28, cy - dir * 4);
    ctx.closePath();
    ctx.fillStyle = '#00ffcc';
    ctx.fill();
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`ASCENT ${targetAltitude.toFixed(0)}m`, W - 50, cy + 4);
  }
  ctx.restore();
}

// --- Stars ---
function drawStars(ctx: CanvasRenderingContext2D, cam: Camera, W: number, H: number): void {
  // Parallax stars based on camera position
  ctx.fillStyle = COL_STARS;
  const seed = 42;
  for (let i = 0; i < 120; i++) {
    const hash = (i * 2654435761 + seed) >>> 0;
    const bx = (hash % 3000) - 500;
    const by = (((hash >> 12) % 2000)) - 200;
    // Parallax: stars move slower
    const parallax = 0.05;
    const sx = (bx - cam.x * parallax) * cam.zoom + W / 2;
    const sy = -(by - cam.y * parallax) * cam.zoom + H / 2;
    // Wrap
    const wx = ((sx % W) + W) % W;
    const wy = ((sy % H) + H) % H;
    const brightness = 0.3 + (hash % 100) / 150;
    ctx.globalAlpha = brightness;
    ctx.fillRect(wx, wy, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
}

// --- Terrain ---
function drawTerrain(
  ctx: CanvasRenderingContext2D, cam: Camera,
  terrain: TerrainData, level: LevelDef, W: number, H: number
): void {
  // Find visible x range
  const leftX = cam.x - W / (2 * cam.zoom) - 10;
  const rightX = cam.x + W / (2 * cam.zoom) + 10;

  // Find start/end indices
  const startIdx = Math.max(0, Math.floor((leftX - terrain.startX) / terrain.spacing));
  const endIdx = Math.min(terrain.points.length - 1,
    Math.ceil((rightX - terrain.startX) / terrain.spacing));

  if (startIdx >= endIdx) return;

  // Draw filled terrain (dark)
  ctx.beginPath();
  const [sx0, sy0] = worldToScreen(terrain.points[startIdx][0], terrain.points[startIdx][1], cam, W, H);
  ctx.moveTo(sx0, sy0);

  for (let i = startIdx + 1; i <= endIdx; i++) {
    const [sx, sy] = worldToScreen(terrain.points[i][0], terrain.points[i][1], cam, W, H);
    ctx.lineTo(sx, sy);
  }

  // Close at bottom of screen
  const [sxEnd] = worldToScreen(terrain.points[endIdx][0], 0, cam, W, H);
  const [sxStart] = worldToScreen(terrain.points[startIdx][0], 0, cam, W, H);
  ctx.lineTo(sxEnd, H + 10);
  ctx.lineTo(sxStart, H + 10);
  ctx.closePath();
  ctx.fillStyle = level.terrainFillColor ?? '#080e08';
  ctx.fill();

  // Draw terrain outline
  ctx.beginPath();
  ctx.moveTo(sx0, sy0);
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const [sx, sy] = worldToScreen(terrain.points[i][0], terrain.points[i][1], cam, W, H);
    ctx.lineTo(sx, sy);
  }
  ctx.strokeStyle = level.terrainStrokeColor ?? COL_TERRAIN;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Brighter edge on top of terrain
  ctx.strokeStyle = level.terrainBrightColor ?? COL_TERRAIN_BRIGHT;
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

// --- Landing pad ---
function drawCustomLandingLayout(
  ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef, W: number, H: number,
): void {
  if (level.landingLayout?.kind !== 'cloud-city') return;
  const layout = level.landingLayout;
  const deckCol = level.terrainBrightColor ?? COL_PAD;
  const dimCol = level.terrainStrokeColor ?? COL_PAD_MARKING;

  const [dl, dt] = worldToScreen(layout.deckLeft, layout.deckY, cam, W, H);
  const [dr, db] = worldToScreen(layout.deckRight, layout.deckY - layout.deckThickness, cam, W, H);
  ctx.fillStyle = 'rgba(20, 80, 90, 0.65)';
  ctx.fillRect(dl, dt, dr - dl, db - dt);
  ctx.strokeStyle = deckCol;
  ctx.lineWidth = 2;
  ctx.strokeRect(dl, dt, dr - dl, db - dt);

  for (const sx of layout.supportXs) {
    const [x0, y0] = worldToScreen(sx - layout.supportWidth * 0.5, layout.deckY, cam, W, H);
    const [x1, y1] = worldToScreen(sx + layout.supportWidth * 0.5, layout.deckY - layout.supportHeight, cam, W, H);
    ctx.fillStyle = 'rgba(40, 100, 110, 0.55)';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = dimCol;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }

  for (const dome of layout.domes) {
    const [cx, cy] = worldToScreen(dome.x, layout.deckY, cam, W, H);
    ctx.beginPath();
    ctx.ellipse(cx, cy, dome.radius * cam.zoom, dome.height * cam.zoom, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = 'rgba(80, 190, 255, 0.22)';
    ctx.fill();
    ctx.strokeStyle = '#6fd6ff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function drawPad(
  ctx: CanvasRenderingContext2D, cam: Camera,
  terrain: TerrainData, level: LevelDef, W: number, H: number
): void {
  const pad = terrain.pad;
  const [lx, ly] = worldToScreen(pad.left, pad.y, cam, W, H);
  const [rx, ry] = worldToScreen(pad.right, pad.y, cam, W, H);
  const [cx, cy] = worldToScreen(pad.centerX, pad.y, cam, W, H);
  const padCol = level.terrainBrightColor ?? COL_PAD;
  const padMarkCol = level.terrainStrokeColor ?? COL_PAD_MARKING;

  // Pad surface line
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.lineTo(rx, ry);
  ctx.strokeStyle = padCol;
  ctx.lineWidth = 3;
  ctx.stroke();

  // End markers
  const markerH = 8 * cam.zoom;
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.lineTo(lx, ly - markerH);
  ctx.moveTo(rx, ry);
  ctx.lineTo(rx, ry - markerH);
  ctx.strokeStyle = padCol;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Center marker (small diamond) — only when pad is on screen
  if (cx > 0 && cx < W && cy > 0 && cy < H) {
    ctx.beginPath();
    const ds = 3;
    ctx.moveTo(cx, cy - ds);
    ctx.lineTo(cx + ds, cy);
    ctx.lineTo(cx, cy + ds);
    ctx.lineTo(cx - ds, cy);
    ctx.closePath();
    ctx.strokeStyle = padMarkCol;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Off-screen indicator: arrow at screen edge pointing toward pad
  const margin = 40;
  const padOnScreen = cx > margin && cx < W - margin && cy > margin && cy < H - margin;
  if (!padOnScreen) {
    // Clamp pad position to screen edge
    const clampX = Math.max(margin, Math.min(W - margin, cx));
    const clampY = Math.max(margin, Math.min(H - margin, cy));

    // Arrow pointing from clamped position toward actual pad
    const dx = cx - clampX;
    const dy = cy - clampY;
    const len = Math.sqrt(dx * dx + dy * dy);
    const dirX = len > 0 ? dx / len : 0;
    const dirY = len > 0 ? dy / len : 0;

    // Draw arrow triangle
    const arrowSize = 10;
    const perpX = -dirY;
    const perpY = dirX;
    ctx.beginPath();
    ctx.moveTo(clampX + dirX * arrowSize, clampY + dirY * arrowSize);
    ctx.lineTo(clampX - dirX * 4 + perpX * arrowSize * 0.6, clampY - dirY * 4 + perpY * arrowSize * 0.6);
    ctx.lineTo(clampX - dirX * 4 - perpX * arrowSize * 0.6, clampY - dirY * 4 - perpY * arrowSize * 0.6);
    ctx.closePath();
    ctx.fillStyle = padCol;
    ctx.globalAlpha = 0.8;
    ctx.fill();

    // Distance label
    const distM = Math.sqrt(
      (cam.x - pad.centerX) ** 2 + (cam.y - pad.y) ** 2
    );
    ctx.font = '11px monospace';
    ctx.fillStyle = padCol;
    ctx.textAlign = 'center';
    ctx.fillText(`PAD ${Math.round(distM)}m`, clampX, clampY - 14);
    ctx.globalAlpha = 1;
  }
}

function predictLandingTrajectory(
  ship: ShipState,
  terrain: TerrainData,
  level: LevelDef,
  time: number,
  horizon = 5,
  dt = 1 / 30,
): [number, number][] {
  const sim: ShipState = { ...ship };
  const points: [number, number][] = [[sim.x, sim.y]];
  const collisionPoints = sim.gearDeployed ? GEAR_COLLISION_POINTS : COLLISION_POINTS;

  for (let t = 0; t < horizon; t += dt) {
    let ax = 0;
    let ay = -config.gravity;
    let angAccel = 0;

    const thrustAccel = sim.throttle * config.mainEngineAccel;
    if (thrustAccel > 0.01) {
      ax += Math.sin(sim.gimbalAngle) * thrustAccel;
      ay += Math.cos(sim.gimbalAngle) * thrustAccel;
    }

    const speed = Math.sqrt(sim.vx * sim.vx + sim.vy * sim.vy);
    if (speed > 0.01) {
      ax -= sim.vx * speed * config.dragCoeff;
      ay -= sim.vy * speed * config.dragCoeff;
    }

    angAccel -= sim.angularVel * config.angularDrag;
    if (sim.autoRotateEnabled) {
      const targetAngle = landingAutoAngleTarget(sim.vx, sim.vy);
      const desiredAngVel = (targetAngle - sim.angle) * 5.0;
      const angVelError = desiredAngVel - sim.angularVel;
      angAccel += Math.max(-config.rcsAngularAccel * 2, Math.min(config.rcsAngularAccel * 2, angVelError * 8.0));
    }

    if (config.windEnabled) {
      const windTime = time + t;
      const wind = Math.sin(windTime * config.windFrequency * 2 * Math.PI)
                 * Math.sin(windTime * config.windFrequency * 0.7 * 2 * Math.PI + 1.3)
                 * config.windStrength;
      ax += wind;
    }

    sim.angularVel += angAccel * dt;
    sim.angle += sim.angularVel * dt;
    while (sim.angle > Math.PI) sim.angle -= Math.PI * 2;
    while (sim.angle < -Math.PI) sim.angle += Math.PI * 2;

    sim.vx += ax * dt;
    sim.vy += ay * dt;
    sim.x += sim.vx * dt;
    sim.y += sim.vy * dt;
    points.push([sim.x, sim.y]);

    let hit = false;
    for (const [lx, ly] of collisionPoints) {
      const [wx, wy] = localToWorld(lx, ly, sim.x, sim.y, sim.angle, sim.facingSign);
      if (checkLandingCollision(level, terrain, wx, wy).hit) {
        hit = true;
        break;
      }
    }
    if (hit) break;
  }

  return points;
}

function drawPredictedTrajectory(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  ship: ShipState,
  terrain: TerrainData,
  level: LevelDef,
  W: number,
  H: number,
  time: number,
): void {
  const points = predictLandingTrajectory(ship, terrain, level, time);
  if (points.length < 2) return;

  ctx.beginPath();
  const [sx0, sy0] = worldToScreen(points[0][0], points[0][1], cam, W, H);
  ctx.moveTo(sx0, sy0);
  for (let i = 1; i < points.length; i++) {
    const [sx, sy] = worldToScreen(points[i][0], points[i][1], cam, W, H);
    ctx.lineTo(sx, sy);
  }
  ctx.strokeStyle = 'rgba(0, 255, 204, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
}

// --- Ship ---
function drawShip(
  ctx: CanvasRenderingContext2D, cam: Camera,
  ship: ShipState, W: number, H: number, time: number
): void {
  const exhaustDirX = -Math.sin(ship.renderGimbalAngle);
  const exhaustDirY = -Math.cos(ship.renderGimbalAngle);
  const exhaustPerpX = -exhaustDirY;
  const exhaustPerpY = exhaustDirX;
  // Container / frame body
  const outline = SHIP_OUTLINE.map(([lx, ly]) => {
    const [wx, wy] = localToWorld(lx, ly, ship.x, ship.y, ship.angle, ship.facingSign);
    return worldToScreen(wx, wy, cam, W, H);
  });
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i][0], outline[i][1]);
  ctx.closePath();
  ctx.strokeStyle = COL_SHIP;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Belt line
  drawPolyline(ctx, cam, ship, BELT_LINE, COL_TRIM, 1.6, W, H);

  // Container with ribs
  drawPolyline(ctx, cam, ship, [[-5.5, -2.0], [5.5, -2.0], [5.5, 2.0], [-5.5, 2.0], [-5.5, -2.0]], '#44aa66', 1, W, H);
  for (const x of [-3.0, -1.0, 1.0, 3.0]) {
    const [wx0, wy0] = localToWorld(x, -2.0, ship.x, ship.y, ship.angle, ship.facingSign);
    const [wx1, wy1] = localToWorld(x, 2.0, ship.x, ship.y, ship.angle, ship.facingSign);
    const [sx0, sy0] = worldToScreen(wx0, wy0, cam, W, H);
    const [sx1, sy1] = worldToScreen(wx1, wy1, cam, W, H);
    ctx.beginPath();
    ctx.moveTo(sx0, sy0);
    ctx.lineTo(sx1, sy1);
    ctx.strokeStyle = '#335f33';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Cab, separated from container, truck-facing right
  drawPolyline(ctx, cam, ship, [...CAB_OUTLINE, CAB_OUTLINE[0]], COL_SHIP, 1.5, W, H);
  drawPolyline(ctx, cam, ship, [[6.2, 1.0], [7.0, 1.0]], COL_SHIP_DIM, 1, W, H);
  drawPolyline(ctx, cam, ship, [[6.2, -0.8], [7.0, -0.8]], COL_SHIP_DIM, 1, W, H);
  drawPolyline(ctx, cam, ship, [[7.8, -1.8], [7.8, 3.1]], COL_SHIP_DIM, 1, W, H); // rear cab pillar
  drawPolyline(ctx, cam, ship, [[10.4, 2.8], [10.8, 1.2]], COL_SHIP_DIM, 1, W, H); // front windshield edge
  drawPolyline(ctx, cam, ship, [[10.6, -1.8], [10.9, -1.4]], COL_SHIP_DIM, 1, W, H); // bumper/nose

  const sideWindow = [
    [8.05, 2.9],
    [9.05, 2.9],
    [9.7, 2.35],
    [9.65, 1.55],
    [8.05, 1.55],
  ] as [number, number][];
  const sideWindowScreen = sideWindow.map(([lx, ly]) => {
    const [wx, wy] = localToWorld(lx, ly, ship.x, ship.y, ship.angle, ship.facingSign);
    return worldToScreen(wx, wy, cam, W, H);
  });
  ctx.beginPath();
  ctx.moveTo(sideWindowScreen[0][0], sideWindowScreen[0][1]);
  for (let i = 1; i < sideWindowScreen.length; i++) ctx.lineTo(sideWindowScreen[i][0], sideWindowScreen[i][1]);
  ctx.closePath();
  ctx.fillStyle = 'rgba(70, 190, 255, 0.35)';
  ctx.fill();
  ctx.strokeStyle = COL_COCKPIT;
  ctx.lineWidth = 1;
  ctx.stroke();

  drawPolyline(ctx, cam, ship, [[7.9, -0.15], [8.35, -0.15]], COL_SHIP, 1.2, W, H); // door handle

  // Engine pods as filled circles on the belt frame, with nacelles aimed by the current thrust vector
  for (const [px, py] of ENGINE_PODS) {
    const [podWX, podWY] = localToWorld(px, py, ship.x, ship.y, ship.angle, ship.facingSign);
    const [sx, sy] = worldToScreen(podWX, podWY, cam, W, H);
    const [sxR, syR] = worldToScreen(...localToWorld(px + 0.8, py, ship.x, ship.y, ship.angle, ship.facingSign), cam, W, H);
    const r = Math.hypot(sxR - sx, syR - sy);
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = COL_TRIM;
    ctx.fill();
    ctx.strokeStyle = COL_SHIP;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const mouthCX = podWX + exhaustDirX * 0.55;
    const mouthCY = podWY + exhaustDirY * 0.55;
    const tipCX = podWX + exhaustDirX * 1.35;
    const tipCY = podWY + exhaustDirY * 1.35;
    const funnel = [
      [mouthCX - exhaustPerpX * 0.42, mouthCY - exhaustPerpY * 0.42],
      [mouthCX + exhaustPerpX * 0.42, mouthCY + exhaustPerpY * 0.42],
      [tipCX + exhaustPerpX * 0.26, tipCY + exhaustPerpY * 0.26],
      [tipCX - exhaustPerpX * 0.26, tipCY - exhaustPerpY * 0.26],
    ].map(([wx, wy]) => worldToScreen(wx, wy, cam, W, H));
    ctx.beginPath();
    ctx.moveTo(funnel[0][0], funnel[0][1]);
    for (let i = 1; i < funnel.length; i++) ctx.lineTo(funnel[i][0], funnel[i][1]);
    ctx.closePath();
    ctx.fillStyle = '#173322';
    ctx.fill();
    ctx.strokeStyle = COL_SHIP;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  // Cockpit window / windshield
  const cockpit = COCKPIT_LINE.map(([lx, ly]) => {
    const [wx, wy] = localToWorld(lx, ly, ship.x, ship.y, ship.angle, ship.facingSign);
    return worldToScreen(wx, wy, cam, W, H);
  });
  ctx.beginPath();
  ctx.moveTo(cockpit[0][0], cockpit[0][1]);
  for (let i = 1; i < cockpit.length; i++) ctx.lineTo(cockpit[i][0], cockpit[i][1]);
  ctx.strokeStyle = COL_COCKPIT;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  if (ship.gearDeployed) {
    drawPolyline(ctx, cam, ship, GEAR_LEFT, COL_GEAR, 1.8, W, H);
    drawPolyline(ctx, cam, ship, GEAR_RIGHT, COL_GEAR, 1.8, W, H);
  }

  if (ship.thrustFiring) drawThrust(ctx, cam, ship, W, H, time);
  if (ship.rcsRotLeft || ship.rcsRotRight || ship.rcsTranslating) drawRCS(ctx, cam, ship, W, H, time);
}

function drawPolyline(
  ctx: CanvasRenderingContext2D, cam: Camera,
  ship: ShipState, points: [number, number][],
  color: string, lineWidth: number, W: number, H: number
): void {
  const screenPts = points.map(([lx, ly]) => {
    const [wx, wy] = localToWorld(lx, ly, ship.x, ship.y, ship.angle, ship.facingSign);
    return worldToScreen(wx, wy, cam, W, H);
  });
  ctx.beginPath();
  ctx.moveTo(screenPts[0][0], screenPts[0][1]);
  for (let i = 1; i < screenPts.length; i++) {
    ctx.lineTo(screenPts[i][0], screenPts[i][1]);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawThrust(
  ctx: CanvasRenderingContext2D, cam: Camera,
  ship: ShipState, W: number, H: number, time: number
): void {
  const flicker = 0.85 + 0.15 * Math.sin(time * 40) * Math.cos(time * 67);
  const flameDirX = -Math.sin(ship.renderGimbalAngle);
  const flameDirY = -Math.cos(ship.renderGimbalAngle);
  const flamePerpX = -flameDirY;
  const flamePerpY = flameDirX;
  const thrustLevel = ship.thrustVisualLevel;
  const minLengthPx = 8;
  const minWidthPx = 4;
  const zoom = Math.max(cam.zoom, 0.001);
  const flameLength = Math.max((1.2 + thrustLevel * 3) * flicker, minLengthPx / zoom);
  const flameWidth = Math.max((1.0 + thrustLevel * 1.2) * flicker, minWidthPx / zoom);
  const simplified = zoom < 1.35;
  const brightFlashActive = thrustLevel >= 0.2;

  for (const [podX, podY] of ENGINE_PODS) {
    const [podWX, podWY] = localToWorld(podX, podY, ship.x, ship.y, ship.angle, ship.facingSign);
    const nozzleX = podWX + flameDirX * 1.35;
    const nozzleY = podWY + flameDirY * 1.35;
    const [sNozX, sNozY] = worldToScreen(nozzleX, nozzleY, cam, W, H);

    const glowR = Math.max(2.4, 1.2 * zoom);
    if (brightFlashActive) {
      ctx.beginPath();
      ctx.arc(sNozX, sNozY, glowR * 1.45, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 190, 80, 0.42)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sNozX, sNozY, glowR * 0.85, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 245, 210, 0.95)';
      ctx.fill();
    }

    if (simplified) {
      const flameLengthPx = Math.max(minLengthPx + thrustLevel * 4, flameLength * zoom);
      const flameWidthPx = Math.max(minWidthPx + thrustLevel * 2, flameWidth * zoom);
      const dirSX = flameDirX;
      const dirSY = -flameDirY;
      const tipSX = sNozX + dirSX * flameLengthPx;
      const tipSY = sNozY + dirSY * flameLengthPx;
      const leftSX = sNozX - (-dirSY) * flameWidthPx * 0.5;
      const leftSY = sNozY - dirSX * flameWidthPx * 0.5;
      const rightSX = sNozX + (-dirSY) * flameWidthPx * 0.5;
      const rightSY = sNozY + dirSX * flameWidthPx * 0.5;

      ctx.beginPath();
      ctx.moveTo(leftSX, leftSY);
      ctx.lineTo(tipSX, tipSY);
      ctx.lineTo(rightSX, rightSY);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 210, 110, 0.95)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(sNozX - (-dirSY) * flameWidthPx * 0.18, sNozY - dirSX * flameWidthPx * 0.18);
      ctx.lineTo(sNozX + dirSX * flameLengthPx * 0.55, sNozY + dirSY * flameLengthPx * 0.55);
      ctx.lineTo(sNozX + (-dirSY) * flameWidthPx * 0.18, sNozY + dirSX * flameWidthPx * 0.18);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 250, 225, 0.98)';
      ctx.fill();
      continue;
    }

    const tipX = nozzleX + flameDirX * flameLength;
    const tipY = nozzleY + flameDirY * flameLength;
    const baseLeftX = nozzleX - flamePerpX * flameWidth * 0.5;
    const baseLeftY = nozzleY - flamePerpY * flameWidth * 0.5;
    const baseRightX = nozzleX + flamePerpX * flameWidth * 0.5;
    const baseRightY = nozzleY + flamePerpY * flameWidth * 0.5;

    const [sTipX, sTipY] = worldToScreen(tipX, tipY, cam, W, H);
    const [sBlX, sBlY] = worldToScreen(baseLeftX, baseLeftY, cam, W, H);
    const [sBrX, sBrY] = worldToScreen(baseRightX, baseRightY, cam, W, H);

    ctx.beginPath();
    ctx.moveTo(sBlX, sBlY);
    ctx.lineTo(sTipX, sTipY);
    ctx.lineTo(sBrX, sBrY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 210, 110, 0.95)';
    ctx.fill();

    const coreLength = flameLength * 0.55;
    const coreTipX = nozzleX + flameDirX * coreLength;
    const coreTipY = nozzleY + flameDirY * coreLength;
    const [sCoreX, sCoreY] = worldToScreen(coreTipX, coreTipY, cam, W, H);
    const [sLeftX, sLeftY] = worldToScreen(nozzleX - flamePerpX * flameWidth * 0.18, nozzleY - flamePerpY * flameWidth * 0.18, cam, W, H);
    const [sRightX, sRightY] = worldToScreen(nozzleX + flamePerpX * flameWidth * 0.18, nozzleY + flamePerpY * flameWidth * 0.18, cam, W, H);
    ctx.beginPath();
    ctx.moveTo(sLeftX, sLeftY);
    ctx.lineTo(sCoreX, sCoreY);
    ctx.lineTo(sRightX, sRightY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 250, 225, 0.98)';
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

function drawRCS(
  ctx: CanvasRenderingContext2D, cam: Camera,
  ship: ShipState, W: number, H: number, time: number
): void {
  const flicker = 0.6 + 0.4 * Math.sin(time * 80);
  const puffLen = 2 * flicker;

  // RCS thruster positions and fire directions (local space)
  // For CW rotation (rcsRotRight): fire top-right leftward, bottom-left rightward
  // For CCW rotation (rcsRotLeft): fire top-left rightward, bottom-right leftward
  interface Puff { x: number; y: number; dx: number; dy: number; }
  const puffs: Puff[] = [];

  if (ship.rcsRotRight) {
    puffs.push({ x: 9.6, y: 3.0, dx: 1, dy: 0 });
    puffs.push({ x: -5.8, y: -2.2, dx: -1, dy: 0 });
  }
  if (ship.rcsRotLeft) {
    puffs.push({ x: -5.8, y: 2.2, dx: -1, dy: 0 });
    puffs.push({ x: 9.6, y: -1.2, dx: 1, dy: 0 });
  }
  if (ship.rcsTranslating) {
    puffs.push({ x: 8.8, y: 3.6, dx: 0.6, dy: 0.8 });
    puffs.push({ x: -5.5, y: -2.6, dx: -0.6, dy: -0.8 });
  }

  ctx.strokeStyle = COL_RCS;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;

  for (const p of puffs) {
    const [sx, sy] = worldToScreen(
      ...localToWorld(p.x, p.y, ship.x, ship.y, ship.angle, ship.facingSign), cam, W, H
    );
    const [ex, ey] = worldToScreen(
      ...localToWorld(p.x + p.dx * puffLen, p.y + p.dy * puffLen, ship.x, ship.y, ship.angle, ship.facingSign), cam, W, H
    );
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}
