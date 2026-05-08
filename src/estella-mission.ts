import { COL_HUD, COL_HUD_DIM, COL_SUCCESS, COL_TITLE, COL_WARNING } from './hud-layout';
import { ESTELLA_NODES_BY_ID } from './content/estella';
import { estellaDisplayPath } from './content/estella/navigation';
import { type Placement, type WorldNode } from './content/types';

export interface EstellaMissionLeg {
  title: string;
  detail: string;
}

export interface EstellaGeneratedMissionState {
  sourceId: string;
  destinationId: string;
  title: string;
  subtitle: string;
  legs: EstellaMissionLeg[];
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
  };
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

  const rowH = 44;
  const maxRows = Math.floor((h - 70) / rowH);
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

  ctx.textAlign = 'center';
  ctx.fillStyle = COL_HUD_DIM;
  ctx.font = '13px monospace';
  ctx.fillText('Enter: back to Estella nav   L: missions', W / 2, H - 24);
}
