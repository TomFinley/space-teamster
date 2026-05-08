import { type WorldNode, type WorldValidationIssue, validateWorldTree } from '../types';
import { ESTELLA_ECONOMY } from './economy';
import { ESTELLA_INSTITUTIONS, ESTELLA_HIGHLINER_SEEDS } from './institutions';
import { ESTELLA_LAYOUTS } from './layouts';
import { ESTELLA_NODE_BLUEPRINTS } from './nodes';
import { ESTELLA_PLACEMENTS } from './placements';
import { ESTELLA_ATMOSPHERE_PHYSICS, ESTELLA_BODY_FLIGHT_PROFILES, ESTELLA_BODY_PHYSICS } from './physics';

export { ESTELLA_ECONOMY } from './economy';
export { ESTELLA_HIGHLINER_SEEDS, ESTELLA_INSTITUTIONS } from './institutions';
export { ESTELLA_LAYOUTS } from './layouts';
export { ESTELLA_NODE_BLUEPRINTS, ESTELLA_REGION_NAMES } from './nodes';
export { ESTELLA_PLACEMENTS } from './placements';
export { ESTELLA_ATMOSPHERE_PHYSICS, ESTELLA_BODY_FLIGHT_PROFILES, ESTELLA_BODY_PHYSICS } from './physics';

function applyDetailOverlays(node: WorldNode): WorldNode {
  const layout = ESTELLA_LAYOUTS[node.id];
  const economy = ESTELLA_ECONOMY[node.id];
  return {
    ...node,
    placement: ESTELLA_PLACEMENTS[node.id] ?? node.placement,
    layoutId: layout?.layoutId ?? node.layoutId,
    accessPoints: layout?.accessPoints ?? node.accessPoints,
    economyTags: economy?.tags ?? node.economyTags,
  };
}

function validateDetailIds(nodes: readonly WorldNode[]): WorldValidationIssue[] {
  const issues: WorldValidationIssue[] = [];
  const ids = new Set(nodes.map(node => node.id));
  const check = (recordName: string, record: Record<string, unknown>) => {
    for (const id of Object.keys(record)) {
      if (!ids.has(id)) {
        issues.push({ severity: 'error', message: `${recordName} references missing node ${id}`, nodeId: id });
      }
    }
  };
  check('ESTELLA_PLACEMENTS', ESTELLA_PLACEMENTS);
  check('ESTELLA_LAYOUTS', ESTELLA_LAYOUTS);
  check('ESTELLA_ECONOMY', ESTELLA_ECONOMY);
  check('ESTELLA_BODY_PHYSICS', ESTELLA_BODY_PHYSICS);
  check('ESTELLA_BODY_FLIGHT_PROFILES', ESTELLA_BODY_FLIGHT_PROFILES);
  check('ESTELLA_ATMOSPHERE_PHYSICS', ESTELLA_ATMOSPHERE_PHYSICS);
  return issues;
}

export const ESTELLA_NODES: WorldNode[] = ESTELLA_NODE_BLUEPRINTS.map(applyDetailOverlays);

export const ESTELLA_VALIDATION_ISSUES: WorldValidationIssue[] = [
  ...validateWorldTree(ESTELLA_NODES),
  ...validateDetailIds(ESTELLA_NODES),
];

export const ESTELLA_NODES_BY_ID = new Map(ESTELLA_NODES.map(node => [node.id, node]));

export function estellaNodeById(id: string): WorldNode | undefined {
  return ESTELLA_NODES_BY_ID.get(id);
}

export function estellaChildrenOf(parentId: string): WorldNode[] {
  return ESTELLA_NODES.filter(node => node.placement?.parentId === parentId);
}

export function estellaPois(): WorldNode[] {
  return ESTELLA_NODES.filter(node => node.kind === 'poi');
}

export function estellaPoisByTag(tag: string): WorldNode[] {
  return estellaPois().filter(node => (node.tags ?? []).includes(tag) || (node.economyTags ?? []).includes(tag) || (node.gameplayTags ?? []).includes(tag));
}

export function estellaBodyPhysics(nodeId: string) {
  return ESTELLA_BODY_PHYSICS[nodeId];
}

export function estellaAtmospherePhysics(nodeId: string) {
  return ESTELLA_ATMOSPHERE_PHYSICS[nodeId];
}
