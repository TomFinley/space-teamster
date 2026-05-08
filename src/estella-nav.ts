import { COL_HUD, COL_HUD_DIM, COL_SUCCESS, COL_TITLE, COL_WARNING } from './hud-layout';
import {
  estellaDisplayPath,
  estellaFolderEntries,
  estellaFolderTitle,
  estellaParentFolder,
  type EstellaFolderKey,
  type EstellaNavEntry,
  type EstellaNavTarget,
} from './content/estella/navigation';

export interface EstellaNavPhaseState {
  selecting: 'source' | 'destination' | 'ready';
  folder: EstellaFolderKey;
  cursorIndex: number;
  sourceId?: string;
  destinationId?: string;
  routeText: string;
}

export function createEstellaNavState(): EstellaNavPhaseState {
  return {
    selecting: 'source',
    folder: 'root',
    cursorIndex: 0,
    routeText: '',
  };
}

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

function selectedEntry(state: EstellaNavPhaseState): EstellaNavEntry | undefined {
  return estellaFolderEntries(state.folder)[state.cursorIndex];
}

export function moveEstellaCursor(state: EstellaNavPhaseState, delta: number): void {
  state.cursorIndex = clampIndex(state.cursorIndex + delta, estellaFolderEntries(state.folder).length);
}

export function estellaNavBack(state: EstellaNavPhaseState): void {
  const parent = estellaParentFolder(state.folder);
  if (!parent) return;
  state.folder = parent;
  state.cursorIndex = 0;
}

export function estellaNavForward(state: EstellaNavPhaseState): void {
  const entry = selectedEntry(state);
  if (entry?.kind !== 'folder' || !entry.key) return;
  state.folder = entry.key;
  state.cursorIndex = 0;
}

export function estellaNavActivate(state: EstellaNavPhaseState): void {
  const entry = selectedEntry(state);
  if (!entry) return;
  if (entry.kind === 'folder') {
    estellaNavForward(state);
    return;
  }
  if (!entry.target) return;
  if (state.selecting === 'source') {
    state.sourceId = entry.target.id;
    state.selecting = 'destination';
    state.folder = 'root';
    state.cursorIndex = 0;
    state.routeText = '';
    return;
  }
  state.destinationId = entry.target.id;
  state.selecting = 'ready';
  state.routeText = `NAV SET: ${estellaDisplayName(state.sourceId)} → ${estellaDisplayName(state.destinationId)}`;
}

export function resetEstellaNavSelection(state: EstellaNavPhaseState): void {
  state.selecting = 'source';
  state.folder = 'root';
  state.cursorIndex = 0;
  state.sourceId = undefined;
  state.destinationId = undefined;
  state.routeText = '';
}

function estellaDisplayName(targetId: string | undefined): string {
  if (!targetId) return '—';
  const path = estellaDisplayPath(targetId);
  const parts = path.split(' -> ');
  return parts[parts.length - 1] ?? targetId;
}

function targetSummary(id: string | undefined): string {
  if (!id) return '';
  return estellaDisplayPath(id);
}

function drawEntryList(
  ctx: CanvasRenderingContext2D,
  entries: readonly EstellaNavEntry[],
  selectedIndex: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.strokeStyle = '#1b4a4a';
  ctx.lineWidth = 1;
  ctx.fillStyle = 'rgba(0, 120, 120, 0.04)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);

  if (entries.length === 0) {
    ctx.fillStyle = COL_WARNING;
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('No exact-authored entries here.', x + 18, y + 36);
    return;
  }

  const visible = Math.min(12, entries.length);
  let start = Math.max(0, selectedIndex - Math.floor(visible / 2));
  start = Math.min(start, Math.max(0, entries.length - visible));
  const rowH = 38;
  for (let i = 0; i < visible; i++) {
    const idx = start + i;
    const entry = entries[idx];
    const rowY = y + 30 + i * rowH;
    const sel = idx === selectedIndex;
    if (sel) {
      ctx.fillStyle = 'rgba(0, 255, 136, 0.16)';
      ctx.fillRect(x + 8, rowY - 17, w - 16, rowH - 4);
    }
    ctx.fillStyle = sel ? '#ffffff' : COL_HUD;
    ctx.font = sel ? 'bold 15px monospace' : '15px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${entry.kind === 'folder' ? '▸' : '•'} ${entry.label}`, x + 18, rowY);
    ctx.fillStyle = COL_HUD_DIM;
    ctx.font = '11px monospace';
    const detail = entry.detail.length > 100 ? `${entry.detail.slice(0, 97)}...` : entry.detail;
    ctx.fillText(detail, x + 40, rowY + 15);
  }
}

export function drawEstellaNavigation(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: EstellaNavPhaseState,
): void {
  const W = canvas.width;
  const H = canvas.height;
  const entries = estellaFolderEntries(state.folder);

  ctx.fillStyle = '#030611';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = COL_TITLE;
  ctx.font = 'bold 30px monospace';
  ctx.fillText('ESTELLA TRANSFER', W / 2, 42);

  ctx.fillStyle = state.selecting === 'source' ? COL_SUCCESS : state.selecting === 'destination' ? COL_WARNING : COL_HUD;
  ctx.font = 'bold 15px monospace';
  const modeText = state.selecting === 'source' ? 'SELECT SOURCE' : state.selecting === 'destination' ? 'SELECT DESTINATION' : 'ROUTE READY';
  ctx.fillText(modeText, W / 2, 66);

  const panelX = Math.max(30, W / 2 - 420);
  const panelY = 132;
  const panelW = Math.min(840, W - 60);
  const panelH = Math.max(260, H - 290);

  drawEntryList(ctx, entries, state.cursorIndex, panelX, panelY, panelW, panelH);

  const infoY = 86;
  ctx.fillStyle = 'rgba(0, 255, 255, 0.06)';
  ctx.fillRect(panelX, infoY, panelW, 34);
  ctx.strokeStyle = '#164848';
  ctx.strokeRect(panelX, infoY, panelW, 34);
  ctx.fillStyle = COL_HUD;
  ctx.font = '12px monospace';
  ctx.fillText(`SRC: ${targetSummary(state.sourceId)}`, panelX + 12, infoY + 13);
  ctx.fillText(`DST: ${targetSummary(state.destinationId)}`, panelX + 12, infoY + 28);

  const footerY = panelY + panelH + 26;
  ctx.fillStyle = COL_HUD_DIM;
  ctx.font = '13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('W/S: move   D or Enter: open/select   A: back   Backspace: clear route   L: missions', W / 2, footerY);

  if (state.routeText) {
    ctx.fillStyle = COL_SUCCESS;
    ctx.font = 'bold 15px monospace';
    ctx.fillText(state.routeText, W / 2, footerY + 24);
  }
}
