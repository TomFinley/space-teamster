// Cluster phase: local traffic-volume navigation for Belt asteroid clusters.

import { COL_HUD, COL_HUD_DIM, COL_SUCCESS, COL_WARNING, drawHudInfoPanel, drawHudLabel } from './hud-layout';
import { InputState } from './input';

export interface ClusterPortDef {
  id: string;
  name: string;
  poiId: string;
  memberId: string;
  x: number;
  y: number;
  angle: number;
}

export interface ClusterMemberDef {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  ports: ClusterPortDef[];
}

export interface ClusterLevel {
  id: number;
  name: string;
  subtitle: string;
  rx: number;
  ry: number;
  orbitAngle: number;
  members: ClusterMemberDef[];
  targetPortId: string;
  startX: number;
  startY: number;
  startVX: number;
  startVY: number;
  startAngle: number;
  forwardAccel: number;
  rotAccel: number;
  baseTimeScale: number;
  captureRadius: number;
  captureMaxSpeed: number;
  timeWarpLevels: number[];
}

export interface ClusterState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angVel: number;
  sas: boolean;
  alive: boolean;
  arrived: boolean;
  highThrust: boolean;
  thrustForward: number;
  thrustBackward: number;
  thrustLeft: number;
  thrustRight: number;
  rotCCW: boolean;
  rotCW: boolean;
  sasForward: number;
  sasBackward: number;
  sasLeft: number;
  sasRight: number;
  sasCCW: boolean;
  sasCW: boolean;
  dvUsed: number;
  timeWarpLevel: number;
  timeWarp: number;
}

export interface ClusterCamera {
  x: number;
  y: number;
  zoom: number;
}

function makePorts(memberId: string, names: { id: string; name: string; poiId: string }[], radius = 5200): ClusterPortDef[] {
  return names.map((p, i) => {
    const a = -Math.PI / 2 + (i / names.length) * Math.PI * 2;
    return {
      id: p.id,
      name: p.name,
      poiId: p.poiId,
      memberId,
      x: Math.cos(a) * radius,
      y: Math.sin(a) * radius,
      angle: a,
    };
  });
}

const CARAVANSERAI_PORTS = makePorts('caravanserai', [
  { id: 'caravanserai-commercial-berth-a', name: 'Commercial Berth A', poiId: 'caravanserai-main-commercial-dock' },
  { id: 'caravanserai-player-hangar-bay', name: 'Player Hangar Bay', poiId: 'caravanserai-player-hangar' },
  { id: 'caravanserai-highliner-bay', name: 'Highliner Bay', poiId: 'caravanserai-highliner-bay-poi' },
  { id: 'caravanserai-outfitter-dock', name: 'Outfitter Dock', poiId: 'caravanserai-outfitter-drydock' },
  { id: 'caravanserai-certification-authority-dock', name: 'Certification Dock', poiId: 'caravanserai-certification-authority' },
  { id: 'caravanserai-refuel-depot-dock', name: 'Refuel Depot Dock', poiId: 'caravanserai-refuel-depot' },
  { id: 'caravanserai-foreign-quarter-dock', name: 'Foreign Quarter Dock', poiId: 'caravanserai-foreign-quarter' },
  { id: 'caravanserai-customs-inspection-dock', name: 'Customs Inspection Dock', poiId: 'caravanserai-customs-inspection' },
  { id: 'caravanserai-free-trader-anchorage-dock', name: 'Free Trader Anchorage', poiId: 'caravanserai-free-trader-anchorage' },
  { id: 'caravanserai-lookout-spire-dock', name: 'Lookout Spire Dock', poiId: 'caravanserai-lookout-spire' },
]);

const STILL_PORTS = makePorts('the-still', [
  { id: 'still-public-berth-a', name: 'Public Berth A', poiId: 'still-public-approach-dock' },
  { id: 'still-guild-hq-dock', name: 'Guild HQ Dock', poiId: 'still-guild-hq' },
  { id: 'still-refinery-core-dock', name: 'Refinery Core Dock', poiId: 'still-refinery-core' },
  { id: 'still-distribution-clamp-1', name: 'Distribution Clamp 1', poiId: 'still-distribution-bay' },
  { id: 'still-worker-hab-dock', name: 'Worker Hab Dock', poiId: 'still-worker-hab' },
  { id: 'still-skim-runner-berth', name: 'Skim-Runner Berth', poiId: 'still-skim-runner-berth-poi' },
]);

const PROSPECT_ROCK_PORTS = makePorts('prospect-rock-es-c-0101', [
  { id: 'prospect-rock-main-dock-port', name: 'Prospector Dock', poiId: 'prospect-rock-main-dock' },
]);

const SURVEY_ROCK_PORTS = makePorts('survey-rock-es-s-0101', [
  { id: 'survey-rock-beacon-dock-port', name: 'Beacon Dock', poiId: 'survey-rock-beacon-dock' },
]);

export const NEAR_BELT_CLUSTER_LEVEL: ClusterLevel = {
  id: 90,
  name: 'Near Belt Traffic Volume',
  subtitle: 'Local flight: Caravanserai to The Still',
  rx: 80_000,
  ry: 45_000,
  orbitAngle: 0,
  members: [
    { id: 'caravanserai', name: 'The Caravanserai', x: 0, y: 0, radius: 4200, ports: CARAVANSERAI_PORTS },
    { id: 'the-still', name: 'The Still', x: 42_000, y: -18_000, radius: 3200, ports: STILL_PORTS },
    { id: 'prospect-rock-es-c-0101', name: 'Prospect Rock', x: -26_000, y: 22_000, radius: 1800, ports: PROSPECT_ROCK_PORTS },
    { id: 'survey-rock-es-s-0101', name: 'Survey Rock', x: 24_000, y: 33_000, radius: 1600, ports: SURVEY_ROCK_PORTS },
  ],
  targetPortId: 'still-public-berth-a',
  startX: -6_500,
  startY: 2_000,
  startVX: 0,
  startVY: 0,
  startAngle: 2.05,
  forwardAccel: 37.5,
  rotAccel: 2.8,
  baseTimeScale: 2,
  captureRadius: 8_000,
  captureMaxSpeed: 18,
  timeWarpLevels: [1, 2, 5, 10],
};

export const CLUSTER_LEVELS: ClusterLevel[] = [NEAR_BELT_CLUSTER_LEVEL];

export function clusterLevelById(id: number): ClusterLevel | undefined {
  return CLUSTER_LEVELS.find(l => l.id === id);
}

function memberForPoi(level: ClusterLevel, poiId: string): ClusterMemberDef | undefined {
  return level.members.find(member => member.ports.some(port => port.poiId === poiId));
}

function portForPoi(level: ClusterLevel, poiId: string): ClusterPortDef | undefined {
  for (const member of level.members) {
    const port = member.ports.find(p => p.poiId === poiId);
    if (port) return port;
  }
  return undefined;
}

export function createNearBeltClusterLevel(sourcePoiId: string, destinationPoiId: string, id: number): ClusterLevel | null {
  const sourceMember = memberForPoi(NEAR_BELT_CLUSTER_LEVEL, sourcePoiId);
  const destPort = portForPoi(NEAR_BELT_CLUSTER_LEVEL, destinationPoiId);
  const destMember = destPort ? memberForPoi(NEAR_BELT_CLUSTER_LEVEL, destinationPoiId) : undefined;
  if (!sourceMember || !destPort || !destMember) return null;

  const dx = destMember.x - sourceMember.x;
  const dy = destMember.y - sourceMember.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / dist;
  const uy = dy / dist;
  const startDist = NEAR_BELT_CLUSTER_LEVEL.captureRadius + 3_000;
  return {
    ...NEAR_BELT_CLUSTER_LEVEL,
    id,
    subtitle: `Local flight: ${sourceMember.name} to ${destMember.name}`,
    targetPortId: destPort.id,
    startX: sourceMember.x + ux * startDist,
    startY: sourceMember.y + uy * startDist,
    startVX: 0,
    startVY: 0,
    startAngle: Math.atan2(ux, uy),
  };
}

export function createClusterState(level: ClusterLevel): ClusterState {
  return {
    x: level.startX,
    y: level.startY,
    vx: level.startVX,
    vy: level.startVY,
    angle: level.startAngle,
    angVel: 0,
    sas: false,
    alive: true,
    arrived: false,
    highThrust: false,
    thrustForward: 0,
    thrustBackward: 0,
    thrustLeft: 0,
    thrustRight: 0,
    rotCCW: false,
    rotCW: false,
    sasForward: 0,
    sasBackward: 0,
    sasLeft: 0,
    sasRight: 0,
    sasCCW: false,
    sasCW: false,
    dvUsed: 0,
    timeWarpLevel: 0,
    timeWarp: level.timeWarpLevels[0] ?? 1,
  };
}

export function createClusterCamera(level: ClusterLevel): ClusterCamera {
  return { x: level.startX, y: level.startY, zoom: 0.006 };
}

function targetPort(level: ClusterLevel): { member: ClusterMemberDef; port: ClusterPortDef; x: number; y: number } | null {
  for (const member of level.members) {
    const port = member.ports.find(p => p.id === level.targetPortId);
    if (port) return { member, port, x: member.x + port.x, y: member.y + port.y };
  }
  return null;
}

function ellipseValue(x: number, y: number, level: ClusterLevel): number {
  const ca = Math.cos(level.orbitAngle), sa = Math.sin(level.orbitAngle);
  const lx = x * ca + y * sa;
  const ly = -x * sa + y * ca;
  return (lx * lx) / (level.rx * level.rx) + (ly * ly) / (level.ry * level.ry);
}

export function updateCluster(s: ClusterState, input: InputState, level: ClusterLevel, dt: number): void {
  if (!s.alive || s.arrived) return;

  if (input.toggleSAS) s.sas = !s.sas;

  s.thrustForward = 0;
  s.thrustBackward = 0;
  s.thrustLeft = 0;
  s.thrustRight = 0;
  s.sasForward = 0;
  s.sasBackward = 0;
  s.sasLeft = 0;
  s.sasRight = 0;
  s.rotCCW = false;
  s.rotCW = false;
  s.sasCCW = false;
  s.sasCW = false;

  s.highThrust = input.toggleHighThrust;
  const thrustMult = s.highThrust ? 4 : 1;
  const accel = level.forwardAccel * thrustMult;
  const strafeAccel = accel * 0.3;

  const rotAccel = level.rotAccel * thrustMult;
  let angularAccel = 0;
  if (input.rotateLeft) { angularAccel -= rotAccel; s.rotCCW = true; }
  if (input.rotateRight) { angularAccel += rotAccel; s.rotCW = true; }
  const dampAccel = Math.max(-rotAccel, Math.min(rotAccel, -s.angVel * 8));
  angularAccel += dampAccel;
  if (!input.rotateLeft && !input.rotateRight) {
    if (dampAccel < -0.01) s.sasCCW = true;
    if (dampAccel > 0.01) s.sasCW = true;
  }
  s.angVel += angularAccel * dt;
  if (Math.abs(s.angVel) < 0.003 && !input.rotateLeft && !input.rotateRight) s.angVel = 0;
  s.angle += s.angVel * dt;

  const fwdX = Math.sin(s.angle);
  const fwdY = Math.cos(s.angle);
  const rightX = Math.cos(s.angle);
  const rightY = -Math.sin(s.angle);

  let ax = 0;
  let ay = 0;
  const anyThrust = input.moveUp || input.moveDown || input.moveLeft || input.moveRight;
  if (input.moveUp) { ax += fwdX * accel; ay += fwdY * accel; s.thrustForward = 1; }
  if (input.moveDown) { ax -= fwdX * accel; ay -= fwdY * accel; s.thrustBackward = 1; }
  if (input.moveRight) { ax += rightX * strafeAccel; ay += rightY * strafeAccel; s.thrustRight = 0.3; }
  if (input.moveLeft) { ax -= rightX * strafeAccel; ay -= rightY * strafeAccel; s.thrustLeft = 0.3; }

  if (s.sas && !anyThrust) {
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (speed > 0.02) {
      const dampAccel = Math.min(level.forwardAccel, speed * 0.9);
      const dax = -(s.vx / speed) * dampAccel;
      const day = -(s.vy / speed) * dampAccel;
      ax += dax;
      ay += day;
      const f = dax * fwdX + day * fwdY;
      const r = dax * rightX + day * rightY;
      if (f > 0.01) s.sasForward = Math.min(1, f / level.forwardAccel);
      if (f < -0.01) s.sasBackward = Math.min(1, -f / level.forwardAccel);
      if (r > 0.01) s.sasRight = Math.min(0.3, r / level.forwardAccel);
      if (r < -0.01) s.sasLeft = Math.min(0.3, -r / level.forwardAccel);
    } else {
      s.vx = 0;
      s.vy = 0;
    }
  }

  s.vx += ax * dt;
  s.vy += ay * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.dvUsed += Math.sqrt(ax * ax + ay * ay) * dt;

  const target = targetPort(level);
  if (target) {
    const dx = target.member.x - s.x;
    const dy = target.member.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (dist <= level.captureRadius && speed <= level.captureMaxSpeed) s.arrived = true;
  }

  if (ellipseValue(s.x, s.y, level) > 1.25) s.alive = false;
}

export function updateClusterCamera(cam: ClusterCamera, s: ClusterState, level: ClusterLevel, dt: number, W: number, H: number): void {
  const targetZoom = Math.min((W * 0.82) / (level.rx * 2), (H * 0.82) / (level.ry * 2));
  const smooth = dt <= 0 ? 1 : 1 - Math.exp(-4 * dt);
  cam.x += (s.x - cam.x) * smooth;
  cam.y += (s.y - cam.y) * smooth;
  cam.zoom += (targetZoom - cam.zoom) * smooth;
}

function cws(wx: number, wy: number, cam: ClusterCamera, W: number, H: number): [number, number] {
  return [(wx - cam.x) * cam.zoom + W / 2, -(wy - cam.y) * cam.zoom + H / 2];
}

export function renderCluster(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
  cam: ClusterCamera, s: ClusterState, level: ClusterLevel, time: number,
): void {
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#030308';
  ctx.fillRect(0, 0, W, H);
  drawClusterStars(ctx, W, H);
  drawTrafficVolume(ctx, cam, level, W, H);
  for (const member of level.members) drawClusterMember(ctx, cam, level, member, W, H);
  drawClusterTargetIndicator(ctx, cam, s, level, W, H);
  drawClusterShip(ctx, cam, s, W, H, time);
  drawSpeedVectorDot(ctx, cam, s, W, H);
}

const CLUSTER_STARS: { x: number; y: number; b: number }[] = [];
function drawClusterStars(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  if (CLUSTER_STARS.length === 0) {
    let seed = 76543;
    for (let i = 0; i < 180; i++) {
      seed = (seed * 16807) % 2147483647;
      const x = (seed / 2147483647) * 1.2 - 0.1;
      seed = (seed * 16807) % 2147483647;
      const y = (seed / 2147483647) * 1.2 - 0.1;
      seed = (seed * 16807) % 2147483647;
      const b = 0.15 + (seed / 2147483647) * 0.45;
      CLUSTER_STARS.push({ x, y, b });
    }
  }
  for (const star of CLUSTER_STARS) {
    ctx.fillStyle = `rgba(180, 190, 210, ${star.b})`;
    ctx.fillRect(star.x * W, star.y * H, 1.5, 1.5);
  }
}

function drawTrafficVolume(ctx: CanvasRenderingContext2D, cam: ClusterCamera, level: ClusterLevel, W: number, H: number): void {
  const [cx, cy] = cws(0, 0, cam, W, H);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-level.orbitAngle);
  ctx.beginPath();
  ctx.ellipse(0, 0, level.rx * cam.zoom, level.ry * cam.zoom, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0, 255, 204, 0.28)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(-level.rx * cam.zoom, 0);
  ctx.lineTo(level.rx * cam.zoom, 0);
  ctx.strokeStyle = 'rgba(0, 255, 204, 0.13)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.font = '11px monospace';
  ctx.fillStyle = 'rgba(0,255,204,0.55)';
  ctx.textAlign = 'center';
  ctx.fillText('NEAR BELT TRAFFIC VOLUME', cx, cy - level.ry * cam.zoom - 10);
}

function drawClusterMember(
  ctx: CanvasRenderingContext2D, cam: ClusterCamera, level: ClusterLevel,
  member: ClusterMemberDef, W: number, H: number,
): void {
  const [mx, my] = cws(member.x, member.y, cam, W, H);
  const target = targetPort(level);
  const z = cam.zoom;
  const r = Math.max(8, member.radius * z);

  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const rr = r * (1 + 0.10 * Math.sin(a * 3 + member.x * 0.001) + 0.06 * Math.sin(a * 7));
    const x = mx + Math.cos(a) * rr;
    const y = my - Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#080d0d';
  ctx.fill();
  ctx.strokeStyle = '#60736f';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  drawDefaultStationGlyph(ctx, mx, my, z);

  for (const port of member.ports) {
    const wx = member.x + port.x;
    const wy = member.y + port.y;
    const [px, py] = cws(wx, wy, cam, W, H);
    const isTarget = target?.port.id === port.id;
    ctx.beginPath();
    ctx.arc(px, py, isTarget ? 5 : 2.8, 0, Math.PI * 2);
    ctx.fillStyle = isTarget ? '#00ffcc' : 'rgba(120, 190, 180, 0.75)';
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(mx, my, level.captureRadius * z, 0, Math.PI * 2);
  ctx.strokeStyle = target?.member.id === member.id ? 'rgba(0,255,204,0.45)' : 'rgba(120,190,180,0.24)';
  ctx.lineWidth = target?.member.id === member.id ? 1.8 : 1.2;
  ctx.setLineDash([6, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = '11px monospace';
  ctx.fillStyle = '#8fd8cc';
  ctx.textAlign = 'center';
  ctx.fillText(member.name.toUpperCase(), mx, my - r - 8);
}

function drawDefaultStationGlyph(ctx: CanvasRenderingContext2D, sx: number, sy: number, z: number): void {
  const hub = Math.max(3, 900 * z);
  const spoke = Math.max(8, 4800 * z);
  ctx.strokeStyle = 'rgba(0, 255, 136, 0.65)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(sx, sy, hub, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(a) * hub, sy - Math.sin(a) * hub);
    ctx.lineTo(sx + Math.cos(a) * spoke, sy - Math.sin(a) * spoke);
    ctx.stroke();
  }
}

function drawClusterTargetIndicator(
  ctx: CanvasRenderingContext2D, cam: ClusterCamera,
  s: ClusterState, level: ClusterLevel, W: number, H: number,
): void {
  const target = targetPort(level);
  if (!target) return;
  const [tx, ty] = cws(target.x, target.y, cam, W, H);
  const margin = 40;
  const onScreen = tx > margin && tx < W - margin && ty > margin && ty < H - margin;
  if (!onScreen) {
    const dx = tx - W / 2;
    const dy = ty - H / 2;
    const scale = Math.min((W / 2 - margin) / Math.max(Math.abs(dx), 1), (H / 2 - margin) / Math.max(Math.abs(dy), 1));
    const ex = W / 2 + dx * scale;
    const ey = H / 2 + dy * scale;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / Math.max(len, 1);
    const ny = dy / Math.max(len, 1);
    ctx.beginPath();
    ctx.moveTo(ex + nx * 12, ey + ny * 12);
    ctx.lineTo(ex - nx * 6 - ny * 7, ey - ny * 6 + nx * 7);
    ctx.lineTo(ex - nx * 6 + ny * 7, ey - ny * 6 - nx * 7);
    ctx.closePath();
    ctx.fillStyle = '#00ffcc';
    ctx.fill();
  }

  const dist = Math.sqrt((target.x - s.x) ** 2 + (target.y - s.y) ** 2);
  ctx.font = '11px monospace';
  ctx.fillStyle = '#00ffcc';
  ctx.textAlign = 'center';
  ctx.fillText(`${target.member.name.toUpperCase()} / ${target.port.name.toUpperCase()} ${(dist / 1000).toFixed(1)}km`, Math.max(160, Math.min(W - 160, tx)), Math.max(24, Math.min(H - 24, ty - 14)));
}

function drawSpeedVectorDot(ctx: CanvasRenderingContext2D, cam: ClusterCamera, s: ClusterState, W: number, H: number): void {
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  if (speed < 0.1) return;
  const lookahead = 10;
  const [px, py] = cws(s.x + s.vx * lookahead, s.y + s.vy * lookahead, cam, W, H);
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,255,136,0.7)';
  ctx.fill();
  const [sx, sy] = cws(s.x, s.y, cam, W, H);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(px, py);
  ctx.strokeStyle = 'rgba(0,255,136,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawClusterShip(ctx: CanvasRenderingContext2D, cam: ClusterCamera, s: ClusterState, W: number, H: number, time: number): void {
  const [sx, sy] = cws(s.x, s.y, cam, W, H);
  const size = 13;
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

  ctx.fillStyle = '#102010';
  ctx.fillRect(contX0, contY0, contX1 - contX0, contY1 - contY0);
  ctx.strokeStyle = 'rgba(68, 170, 102, 0.85)';
  ctx.lineWidth = 1;
  ctx.strokeRect(contX0, contY0, contX1 - contX0, contY1 - contY0);

  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(frameX0, frameY0, frameX1 - frameX0, frameY1 - frameY0);
  ctx.beginPath();
  ctx.moveTo(-cabHalfBackW * 0.75, cabBackY);
  ctx.lineTo(frameX0 * 0.65, frameY0);
  ctx.moveTo(cabHalfBackW * 0.75, cabBackY);
  ctx.lineTo(frameX1 * 0.65, frameY0);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-cabHalfFrontW, cabFrontY);
  ctx.lineTo(cabHalfFrontW, cabFrontY);
  ctx.lineTo(cabHalfBackW, cabBackY);
  ctx.lineTo(-cabHalfBackW, cabBackY);
  ctx.closePath();
  ctx.fillStyle = '#0a140a';
  ctx.fill();
  ctx.strokeStyle = '#00ff88';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-size * 0.13, -size * 0.58);
  ctx.lineTo(0, -size * 0.68);
  ctx.lineTo(size * 0.13, -size * 0.58);
  ctx.strokeStyle = '#00ccff';
  ctx.stroke();

  drawClusterFlames(ctx, s, size, time);
  ctx.restore();
}

function drawClusterFlames(ctx: CanvasRenderingContext2D, s: ClusterState, size: number, time: number): void {
  const flicker = 0.75 + 0.25 * Math.sin(time * 45);
  const hi = s.highThrust ? 2.2 : 1;
  const main = 14 * hi * flicker;
  const side = main;
  const rot = 1.75 * flicker;
  const w = s.highThrust ? 3 : 2;

  function flare(x: number, y: number, dx: number, dy: number, len: number, width: number, color?: string, lineWidth = w): void {
    const px = -dy, py = dx;
    ctx.beginPath();
    ctx.moveTo(x - px * width, y - py * width);
    ctx.lineTo(x + dx * len, y + dy * len);
    ctx.lineTo(x + px * width, y + py * width);
    ctx.strokeStyle = color ?? (s.highThrust ? '#ffdd66' : '#ffaa00');
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  const rearY = size * 1.08;
  const frontY = -size * 0.84;
  for (const x of [-size * 0.2, size * 0.2]) {
    if (s.thrustForward || s.sasForward) flare(x, rearY, 0, 1, main * Math.max(s.thrustForward, s.sasForward), 1.4);
    if (s.thrustBackward || s.sasBackward) flare(x, frontY, 0, -1, main * Math.max(s.thrustBackward, s.sasBackward), 1.4);
  }
  const sideY = size * 0.42;
  if (s.thrustLeft || s.sasLeft) flare(size * 0.45, sideY, 1, 0, side * Math.max(s.thrustLeft, s.sasLeft), 1.1);
  if (s.thrustRight || s.sasRight) flare(-size * 0.45, sideY, -1, 0, side * Math.max(s.thrustRight, s.sasRight), 1.1);
  if (s.rotCCW || s.sasCCW) {
    flare(-size * 0.45, -size * 0.35, -1, 0, rot, 0.45, '#ff3333', 1.2);
    flare(size * 0.45, size * 0.65, 1, 0, rot, 0.45, '#ff3333', 1.2);
  }
  if (s.rotCW || s.sasCW) {
    flare(size * 0.45, -size * 0.35, 1, 0, rot, 0.45, '#ff3333', 1.2);
    flare(-size * 0.45, size * 0.65, -1, 0, rot, 0.45, '#ff3333', 1.2);
  }
}

export function drawClusterHUD(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
  s: ClusterState, level: ClusterLevel, state: 'flying' | 'arrived' | 'crashed',
  phaseDvUsed = 0, missionDvUsed = 0, suppressStateOverlays = false,
): void {
  const W = canvas.width, H = canvas.height;
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  const target = targetPort(level);

  ctx.save();
  ctx.font = '13px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = COL_HUD_DIM;
  ctx.fillText(level.name, W - 20, 24);
  ctx.textAlign = 'left';

  let ly = 30;
  const lh = 20;
  drawHudLabel(ctx, 20, ly, 'SPD', `${speed.toFixed(1)} m/s`, COL_HUD); ly += lh;
  drawHudLabel(ctx, 20, ly, 'THR', s.highThrust ? 'HIGH' : 'LOW', s.highThrust ? COL_WARNING : COL_HUD_DIM); ly += lh;
  drawHudLabel(ctx, 20, ly, 'SAS', s.sas ? 'ON' : 'OFF', s.sas ? COL_SUCCESS : COL_HUD_DIM); ly += lh;
  drawHudLabel(ctx, 20, ly, 'WARP', `${s.timeWarp}x`, s.timeWarp > 1 ? COL_WARNING : COL_HUD_DIM); ly += lh;
  drawHudLabel(ctx, 20, ly, 'PH ΔV', `${phaseDvUsed.toFixed(0)} m/s`, COL_HUD); ly += lh;
  drawHudLabel(ctx, 20, ly, 'MIS ΔV', `${missionDvUsed.toFixed(0)} m/s`, COL_HUD); ly += lh;

  const rows: { label: string; value: string; color?: string }[] = [];
  if (target) {
    const dist = Math.sqrt((target.member.x - s.x) ** 2 + (target.member.y - s.y) ** 2);
    rows.push({ label: 'RANGE', value: `${(dist / 1000).toFixed(2)} km < ${(level.captureRadius / 1000).toFixed(2)} km`, color: dist <= level.captureRadius ? COL_SUCCESS : COL_HUD });
    rows.push({ label: 'REL V', value: `${speed.toFixed(1)} m/s < ${level.captureMaxSpeed.toFixed(0)} m/s`, color: speed <= level.captureMaxSpeed ? COL_SUCCESS : COL_HUD });
  }

  drawHudInfoPanel(ctx, canvas, {
    title: 'LOCAL TRAFFIC',
    name: target ? `${target.member.name} / ${target.port.name}` : level.name,
    subtitle: level.subtitle,
    rows,
    guidance: 'Enter the destination intercept circle below 18 m/s for docking handoff.',
  });

  if (!suppressStateOverlays && state === 'arrived') {
    ctx.fillStyle = 'rgba(0, 20, 0, 0.62)';
    ctx.fillRect(W / 2 - 220, H / 2 - 60, 440, 120);
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 220, H / 2 - 60, 440, 120);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('BERTH APPROACH COMPLETE', W / 2, H / 2 - 15);
    ctx.fillStyle = COL_HUD_DIM;
    ctx.font = '14px monospace';
    ctx.fillText('ENTER: Continue  |  BACKSPACE: Retry  |  L: Levels', W / 2, H / 2 + 25);
  }
  if (!suppressStateOverlays && state === 'crashed') {
    ctx.fillStyle = 'rgba(20, 0, 0, 0.62)';
    ctx.fillRect(W / 2 - 210, H / 2 - 60, 420, 120);
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 210, H / 2 - 60, 420, 120);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff3333';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('LEFT TRAFFIC VOLUME', W / 2, H / 2 - 15);
    ctx.fillStyle = COL_HUD_DIM;
    ctx.font = '14px monospace';
    ctx.fillText('BACKSPACE: Retry  |  L: Levels', W / 2, H / 2 + 25);
  }

  if (state === 'flying') {
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = COL_HUD_DIM;
    ctx.fillText('W/S: Fore/Aft  A/D: Strafe  Q/E: Rotate  T: SAS  Shift: Hi Thrust  [/]: Warp  BACKSPACE: Restart  L: Levels', W / 2, H - 15);
  }
  ctx.restore();
}
