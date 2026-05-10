import { COL_HUD, COL_HUD_DIM, COL_SUCCESS, COL_TITLE, COL_WARNING } from './hud-layout';
import { ESTELLA_NODES_BY_ID } from './content/estella';
import { estellaDisplayPath } from './content/estella/navigation';
import { type Placement, type WorldNode } from './content/types';
import { bodyById, type BodyDef } from './world';

export interface EstellaMissionLeg {
  title: string;
  detail: string;
}

export interface EstellaTransferOption {
  id: 'now' | 'soon' | 'best';
  label: string;
  waitTime: number;
  transferTime: number;
  departureVInf: number;
  departureVInfAngle: number;
  arrivalVInf: number;
  totalDeltaV: number;
  sourceBodyId: string;
  destinationBodyId: string;
}

export interface EstellaGeneratedMissionState {
  sourceId: string;
  destinationId: string;
  title: string;
  subtitle: string;
  legs: EstellaMissionLeg[];
  transferOptions: EstellaTransferOption[];
  selectedTransferOption: number;
}

function nodeName(id: string): string {
  const node = ESTELLA_NODES_BY_ID.get(id);
  if (!node) return id;
  return node.catalogId && node.catalogId !== node.name ? `${node.catalogId} ${node.name}` : node.name;
}

function chainToRoot(nodeId: string): WorldNode[] {
  const chain: WorldNode[] = [];
  let current = ESTELLA_NODES_BY_ID.get(nodeId);
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    chain.push(current);
    current = current.placement?.parentId ? ESTELLA_NODES_BY_ID.get(current.placement.parentId) : undefined;
  }
  return chain;
}

function lowestCommonAncestor(a: WorldNode[], b: WorldNode[]): WorldNode | undefined {
  const bIds = new Set(b.map(node => node.id));
  return a.find(node => bIds.has(node.id));
}

function placementVerbUp(node: WorldNode, placement: Placement | undefined): EstellaMissionLeg {
  if (!placement) return { title: `Depart ${nodeName(node.id)}`, detail: 'Leave current location.' };
  if (placement.kind === 'aboard') {
    return { title: `Undock from ${nodeName(node.id)}`, detail: `Exit ${nodeName(placement.parentId)} local map.` };
  }
  if (placement.kind === 'surface') {
    return { title: `Launch from ${nodeName(node.id)}`, detail: `Depart surface of ${nodeName(placement.parentId)}.` };
  }
  if (placement.kind === 'cluster-member') {
    return { title: `Leave ${nodeName(node.id)}`, detail: `Navigate local cluster space toward ${nodeName(placement.parentId)}.` };
  }
  return { title: `Depart orbit of ${nodeName(node.id)}`, detail: `Enter transfer context around ${nodeName(placement.parentId)}.` };
}

function placementVerbDown(node: WorldNode, placement: Placement | undefined): EstellaMissionLeg {
  if (!placement) return { title: `Arrive at ${nodeName(node.id)}`, detail: 'Arrive at target location.' };
  if (placement.kind === 'aboard') {
    return { title: `Dock at ${nodeName(node.id)}`, detail: `Access point aboard ${nodeName(placement.parentId)}.` };
  }
  if (placement.kind === 'surface') {
    const angle = placement.angle === undefined ? 'authored surface site' : `${(placement.angle * 180 / Math.PI).toFixed(1)}° radial site`;
    return { title: `Land at ${nodeName(node.id)}`, detail: `Descend to ${angle} on ${nodeName(placement.parentId)}.` };
  }
  if (placement.kind === 'cluster-member') {
    return { title: `Cluster-hop to ${nodeName(node.id)}`, detail: `Approach local coordinates (${placement.x.toFixed(0)}, ${placement.y.toFixed(0)}) in ${nodeName(placement.parentId)}.` };
  }
  if (placement.orbit?.kind === 'circular') {
    return { title: `Rendezvous with ${nodeName(node.id)}`, detail: `${placement.usage ?? 'orbital'} circular orbit, r=${(placement.orbit.radius / 1000).toFixed(0)}km.` };
  }
  if (placement.orbit?.kind === 'keplerian') {
    return { title: `Intercept ${nodeName(node.id)}`, detail: `${placement.usage ?? 'orbital'} Keplerian orbit, a=${(placement.orbit.semiMajorAxis / 1000).toFixed(0)}km, e=${placement.orbit.eccentricity.toFixed(2)}.` };
  }
  return { title: `Rendezvous with ${nodeName(node.id)}`, detail: `${placement.usage ?? 'orbital'} orbit.` };
}

function dedupeConsecutive(legs: EstellaMissionLeg[]): EstellaMissionLeg[] {
  const out: EstellaMissionLeg[] = [];
  for (const leg of legs) {
    const prev = out[out.length - 1];
    if (prev && prev.title === leg.title && prev.detail === leg.detail) continue;
    out.push(leg);
  }
  return out;
}

function bodyNodeIdForLocation(nodeId: string): string | undefined {
  let current = ESTELLA_NODES_BY_ID.get(nodeId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.kind === 'cluster') return current.id;
    if (current.kind === 'planet' || current.kind === 'moon' || current.kind === 'dwarf-planet' || current.kind === 'gas-giant') return current.id;
    current = current.placement?.parentId ? ESTELLA_NODES_BY_ID.get(current.placement.parentId) : undefined;
  }
  return undefined;
}

function bodyPathToRoot(bodyId: string): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = bodyId;
  while (current && !seen.has(current)) {
    seen.add(current);
    path.push(current);
    current = bodyById(current).orbit?.parentBodyId;
  }
  return path;
}

function transferBodyPair(sourceId: string, destinationId: string): { source: BodyDef; destination: BodyDef; parent: BodyDef } | null {
  const sourceBodyId = bodyNodeIdForLocation(sourceId);
  const destinationBodyId = bodyNodeIdForLocation(destinationId);
  if (!sourceBodyId || !destinationBodyId || sourceBodyId === destinationBodyId) return null;
  const sourcePath = bodyPathToRoot(sourceBodyId);
  const destinationPath = bodyPathToRoot(destinationBodyId);
  for (const sourceCandidate of sourcePath) {
    const source = bodyById(sourceCandidate);
    const sourceParentId = source.orbit?.parentBodyId;
    if (!sourceParentId) continue;
    for (const destinationCandidate of destinationPath) {
      if (sourceCandidate === destinationCandidate) continue;
      const destination = bodyById(destinationCandidate);
      if (destination.orbit?.parentBodyId === sourceParentId) {
        return { source, destination, parent: bodyById(sourceParentId) };
      }
    }
  }
  return null;
}

function circularBodyState(body: BodyDef, parent: BodyDef, time: number): { x: number; y: number; vx: number; vy: number } | null {
  if (!body.orbit || body.orbit.parentBodyId !== parent.id) return null;
  const omega = body.orbit.orbitSense * Math.sqrt(parent.gm / (body.orbit.radius ** 3));
  const angle = body.orbit.epochAngle + omega * (time - body.orbit.epochTime);
  const speed = Math.sqrt(parent.gm / body.orbit.radius);
  return {
    x: body.orbit.radius * Math.cos(angle),
    y: body.orbit.radius * Math.sin(angle),
    vx: -body.orbit.orbitSense * speed * Math.sin(angle),
    vy: body.orbit.orbitSense * speed * Math.cos(angle),
  };
}

function stumpffC(z: number): number {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 0.5 - z / 24 + z * z / 720;
}

function stumpffS(z: number): number {
  if (z > 1e-6) {
    const r = Math.sqrt(z);
    return (r - Math.sin(r)) / (r * r * r);
  }
  if (z < -1e-6) {
    const r = Math.sqrt(-z);
    return (Math.sinh(r) - r) / (r * r * r);
  }
  return 1 / 6 - z / 120 + z * z / 5040;
}

function lambertVelocity(
  r1: { x: number; y: number },
  r2: { x: number; y: number },
  tof: number,
  gm: number,
): { v1x: number; v1y: number; v2x: number; v2y: number } | null {
  const r1m = Math.hypot(r1.x, r1.y);
  const r2m = Math.hypot(r2.x, r2.y);
  const cosDt = Math.max(-1, Math.min(1, (r1.x * r2.x + r1.y * r2.y) / Math.max(1, r1m * r2m)));
  let sinDt = (r1.x * r2.y - r1.y * r2.x) / Math.max(1, r1m * r2m);
  if (sinDt < 0) sinDt = -sinDt;
  if (Math.abs(sinDt) < 1e-5 || Math.abs(1 - cosDt) < 1e-8) return null;
  const A = sinDt * Math.sqrt((r1m * r2m) / (1 - cosDt));
  if (!Number.isFinite(A) || Math.abs(A) < 1e-6) return null;

  const tofForZ = (z: number): { t: number; y: number } | null => {
    const c = stumpffC(z);
    const s = stumpffS(z);
    if (c <= 0) return null;
    const y = r1m + r2m + A * (z * s - 1) / Math.sqrt(c);
    if (y <= 0) return null;
    const x = Math.sqrt(y / c);
    const t = (x * x * x * s + A * Math.sqrt(y)) / Math.sqrt(gm);
    return Number.isFinite(t) ? { t, y } : null;
  };

  let bestZ = 0;
  let bestErr = Infinity;
  let prevZ = -20;
  let prev = tofForZ(prevZ);
  let bracket: { lo: number; hi: number } | null = null;
  for (let i = 1; i <= 240; i++) {
    const z = -20 + (40 * i) / 240;
    const cur = tofForZ(z);
    if (cur) {
      const err = Math.abs(cur.t - tof);
      if (err < bestErr) { bestErr = err; bestZ = z; }
      if (prev && (prev.t - tof) * (cur.t - tof) <= 0) {
        bracket = { lo: prevZ, hi: z };
        break;
      }
    }
    prevZ = z;
    prev = cur;
  }
  if (bracket) {
    for (let i = 0; i < 36; i++) {
      const mid = (bracket.lo + bracket.hi) * 0.5;
      const loVal = tofForZ(bracket.lo);
      const midVal = tofForZ(mid);
      if (!loVal || !midVal) break;
      if ((loVal.t - tof) * (midVal.t - tof) <= 0) bracket.hi = mid;
      else bracket.lo = mid;
    }
    bestZ = (bracket.lo + bracket.hi) * 0.5;
  }

  const solved = tofForZ(bestZ);
  if (!solved || bestErr > tof * 0.35) return null;
  const f = 1 - solved.y / r1m;
  const g = A * Math.sqrt(solved.y / gm);
  const gdot = 1 - solved.y / r2m;
  if (Math.abs(g) < 1e-9) return null;
  return {
    v1x: (r2.x - f * r1.x) / g,
    v1y: (r2.y - f * r1.y) / g,
    v2x: (gdot * r2.x - r1.x) / g,
    v2y: (gdot * r2.y - r1.y) / g,
  };
}

function transferEstimate(source: BodyDef, destination: BodyDef, parent: BodyDef, waitTime: number, tof: number): EstellaTransferOption | null {
  const s0 = circularBodyState(source, parent, waitTime);
  const d1 = circularBodyState(destination, parent, waitTime + tof);
  if (!s0 || !d1) return null;
  const lambert = lambertVelocity(s0, d1, tof, parent.gm);
  if (!lambert) return null;
  const depVx = lambert.v1x - s0.vx;
  const depVy = lambert.v1y - s0.vy;
  const departureVInf = Math.hypot(depVx, depVy);
  const departureVInfAngle = Math.atan2(depVy, depVx);
  const arrivalVInf = Math.hypot(lambert.v2x - d1.vx, lambert.v2y - d1.vy);
  const totalDeltaV = departureVInf + arrivalVInf;
  if (!Number.isFinite(totalDeltaV)) return null;
  return { id: 'now', label: 'Depart now', waitTime, transferTime: tof, departureVInf, departureVInfAngle, arrivalVInf, totalDeltaV, sourceBodyId: source.id, destinationBodyId: destination.id };
}

function computeTransferOptions(sourceId: string, destinationId: string): EstellaTransferOption[] {
  const pair = transferBodyPair(sourceId, destinationId);
  if (!pair || !pair.source.orbit || !pair.destination.orbit) return [];
  const { source, destination, parent } = pair;
  const sourceOrbit = source.orbit!;
  const destinationOrbit = destination.orbit!;
  const r1 = sourceOrbit.radius;
  const r2 = destinationOrbit.radius;
  const hohmannTime = Math.PI * Math.sqrt((((r1 + r2) * 0.5) ** 3) / parent.gm);
  const n1 = Math.sqrt(parent.gm / (r1 ** 3));
  const n2 = Math.sqrt(parent.gm / (r2 ** 3));
  const synodic = Math.PI * 2 / Math.max(1e-9, Math.abs(n1 - n2));
  const maxWait = Math.min(Math.max(synodic * 1.15, 14 * 86_400), 140 * 86_400);
  const minTof = Math.max(0.35 * hohmannTime, 12 * 3_600);
  const maxTof = Math.max(2.4 * hohmannTime, minTof * 1.5);

  const bestForWait = (waitTime: number): EstellaTransferOption | null => {
    let best: EstellaTransferOption | null = null;
    for (let i = 0; i <= 40; i++) {
      const tof = minTof + (maxTof - minTof) * i / 40;
      const est = transferEstimate(source, destination, parent, waitTime, tof);
      if (est && (!best || est.totalDeltaV < best.totalDeltaV)) best = est;
    }
    return best;
  };

  const now = bestForWait(0);
  let best = now;
  const samples: EstellaTransferOption[] = [];
  for (let i = 0; i <= 48; i++) {
    const wait = maxWait * i / 48;
    const est = bestForWait(wait);
    if (!est) continue;
    samples.push(est);
    if (!best || est.totalDeltaV < best.totalDeltaV) best = est;
  }
  if (!best) return [];
  let soon = now ?? best;
  const threshold = best.totalDeltaV * 2;
  for (const sample of samples) {
    if (sample.totalDeltaV <= threshold) {
      soon = sample;
      break;
    }
  }

  const withMeta = (option: EstellaTransferOption, id: EstellaTransferOption['id'], label: string): EstellaTransferOption => ({ ...option, id, label });
  const raw = [
    now ? withMeta(now, 'now', 'Depart now') : null,
    withMeta(soon, 'soon', 'Earliest <2x best'),
    withMeta(best, 'best', 'Lowest ΔV'),
  ].filter((option): option is EstellaTransferOption => !!option);
  const deduped: EstellaTransferOption[] = [];
  for (const option of raw) {
    if (deduped.some(existing => Math.abs(existing.waitTime - option.waitTime) < 60 && Math.abs(existing.totalDeltaV - option.totalDeltaV) < 1)) continue;
    deduped.push(option);
  }
  return deduped;
}

export function generateEstellaMission(sourceId: string, destinationId: string): EstellaGeneratedMissionState {
  const srcChain = chainToRoot(sourceId);
  const dstChain = chainToRoot(destinationId);
  const lca = lowestCommonAncestor(srcChain, dstChain);
  const lcaId = lca?.id;
  const up = lcaId ? srcChain.slice(0, srcChain.findIndex(node => node.id === lcaId)) : srcChain;
  const down = lcaId ? dstChain.slice(0, dstChain.findIndex(node => node.id === lcaId)).reverse() : dstChain.slice().reverse();

  const legs: EstellaMissionLeg[] = [
    { title: `START: ${nodeName(sourceId)}`, detail: estellaDisplayPath(sourceId) },
    ...up.map(node => placementVerbUp(node, node.placement)),
    ...(lca ? [{ title: `Transfer context: ${nodeName(lca.id)}`, detail: 'Route crosses this common parent in the Estella hierarchy.' }] : []),
    ...down.map(node => placementVerbDown(node, node.placement)),
    { title: `END: ${nodeName(destinationId)}`, detail: estellaDisplayPath(destinationId) },
  ];

  return {
    sourceId,
    destinationId,
    title: `Generated Mission: ${nodeName(sourceId)} → ${nodeName(destinationId)}`,
    subtitle: 'Prototype generated from Estella hierarchy and exact-authored placements.',
    legs: dedupeConsecutive(legs),
    transferOptions: computeTransferOptions(sourceId, destinationId),
    selectedTransferOption: 0,
  };
}

function formatDuration(seconds: number): string {
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${(seconds / 3_600).toFixed(1)}h`;
  return `${(seconds / 86_400).toFixed(1)}d`;
}

export function drawEstellaGeneratedMission(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  mission: EstellaGeneratedMissionState,
): void {
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = '#030611';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = COL_TITLE;
  ctx.font = 'bold 28px monospace';
  ctx.fillText('ESTELLA GENERATED MISSION', W / 2, 42);
  ctx.fillStyle = COL_HUD_DIM;
  ctx.font = '13px monospace';
  ctx.fillText(mission.subtitle, W / 2, 66);

  const x = Math.max(36, W / 2 - 460);
  const y = 94;
  const w = Math.min(920, W - 72);
  const h = H - 150;
  ctx.fillStyle = 'rgba(0, 120, 120, 0.05)';
  ctx.strokeStyle = '#1b4a4a';
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);

  ctx.textAlign = 'left';
  ctx.fillStyle = COL_SUCCESS;
  ctx.font = 'bold 15px monospace';
  ctx.fillText(mission.title, x + 18, y + 28);

  const optionBlockH = mission.transferOptions.length ? 112 : 0;
  const rowH = 44;
  const maxRows = Math.floor((h - 70 - optionBlockH) / rowH);
  for (let i = 0; i < Math.min(maxRows, mission.legs.length); i++) {
    const leg = mission.legs[i];
    const rowY = y + 68 + i * rowH;
    ctx.fillStyle = i === 0 || i === mission.legs.length - 1 ? COL_WARNING : COL_HUD;
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${(i + 1).toString().padStart(2, '0')}. ${leg.title}`, x + 24, rowY);
    ctx.fillStyle = COL_HUD_DIM;
    ctx.font = '11px monospace';
    const detail = leg.detail.length > 118 ? `${leg.detail.slice(0, 115)}...` : leg.detail;
    ctx.fillText(detail, x + 54, rowY + 16);
  }

  if (mission.transferOptions.length) {
    const optY = y + h - optionBlockH + 16;
    ctx.fillStyle = COL_SUCCESS;
    ctx.font = 'bold 13px monospace';
    ctx.fillText('TRANSFER WINDOW OPTIONS', x + 24, optY);
    ctx.fillStyle = COL_HUD_DIM;
    ctx.font = '11px monospace';
    ctx.fillText('A/D: choose departure time. Estimates use approximate Lambert/porkchop sampling.', x + 250, optY);
    for (let i = 0; i < mission.transferOptions.length; i++) {
      const opt = mission.transferOptions[i];
      const selected = i === mission.selectedTransferOption;
      const rowY = optY + 24 + i * 22;
      ctx.fillStyle = selected ? 'rgba(0, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.12)';
      ctx.fillRect(x + 18, rowY - 13, w - 36, 18);
      ctx.strokeStyle = selected ? COL_SUCCESS : '#1b4a4a';
      ctx.strokeRect(x + 18, rowY - 13, w - 36, 18);
      ctx.fillStyle = selected ? COL_SUCCESS : COL_HUD;
      ctx.font = selected ? 'bold 12px monospace' : '12px monospace';
      const text = `${selected ? '▶' : ' '} ${opt.label.padEnd(18)} wait ${formatDuration(opt.waitTime).padStart(6)}  TOF ${formatDuration(opt.transferTime).padStart(6)}  ΔV ${(opt.totalDeltaV).toFixed(0)}m/s  dep ${(opt.departureVInf).toFixed(0)}  arr ${(opt.arrivalVInf).toFixed(0)}`;
      ctx.fillText(text, x + 28, rowY);
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = COL_HUD_DIM;
  ctx.font = '13px monospace';
  ctx.fillText('Enter: start flying generated mission   L: missions', W / 2, H - 24);
}
