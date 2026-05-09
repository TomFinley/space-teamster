// Terrain generation and height lookup.
// Terrain is a polyline of (x, y) points at regular spacing.

import { LevelDef } from './levels';

export interface LandingPad {
  left: number;
  right: number;
  y: number;
  centerX: number;
}

export interface TerrainData {
  points: [number, number][];  // [x, y] pairs
  spacing: number;
  startX: number;
  endX: number;
  pad: LandingPad;
}

export interface LandingCollision {
  hit: boolean;
  onPad: boolean;
}

export function generateTerrain(level: LevelDef): TerrainData {
  const spacing = 2;          // meters between points
  const startX = 0;
  const endX = 2000;
  const numPoints = Math.floor((endX - startX) / spacing) + 1;

  const padCenterX = level.padCenterX;
  const padHalfWidth = level.padHalfWidth;
  const padLeft = padCenterX - padHalfWidth;
  const padRight = padCenterX + padHalfWidth;
  const padY = level.padY;
  const roughness = level.roughness;

  const points: [number, number][] = [];

  for (let i = 0; i < numPoints; i++) {
    const x = startX + i * spacing;

    if (level.landingLayout?.kind === 'cloud-city') {
      points.push([x, 0]);
      continue;
    }

    // Base terrain from layered sinusoids, scaled by roughness
    // Offset so terrain stays well above zero even with high roughness
    const baseHeight = padY + 50 * roughness;
    let y = baseHeight;
    y += 45 * roughness * Math.sin(x * 0.0025 + 0.5);
    y += 30 * roughness * Math.sin(x * 0.007 + 1.2);
    y += 18 * roughness * Math.sin(x * 0.018 + 3.1);
    y += 10 * roughness * Math.sin(x * 0.045 + 0.7);
    y += 5 * roughness * Math.sin(x * 0.11 + 2.3);

    // Flatten the landing pad area with smooth blend
    const distFromPad = Math.max(0, Math.abs(x - padCenterX) - padHalfWidth);
    const blendWidth = 40;
    const blend = Math.min(1, distFromPad / blendWidth);
    y = padY + (y - padY) * blend * blend;

    // Level-specific features (towers, walls, structures)
    // These are NOT affected by pad blend — they stand on their own
    for (const feat of level.features) {
      if (x >= feat.xStart && x <= feat.xEnd) {
        y = Math.max(y, padY + feat.height);
      }
    }

    // Ridge in the far left (background terrain)
    if (x > 150 && x < 450) {
      const ridgeCenter = 300;
      const ridgeDist = Math.abs(x - ridgeCenter);
      const ridgeHeight = Math.max(0, (60 * roughness) - ridgeDist * 0.4);
      y = Math.max(y, padY + ridgeHeight);
    }

    // Ensure minimum ground level
    y = Math.max(y, 0);

    points.push([x, y]);
  }

  return {
    points,
    spacing,
    startX,
    endX,
    pad: {
      left: padLeft,
      right: padRight,
      y: padY,
      centerX: padCenterX,
    },
  };
}

// Get terrain height at any x by linear interpolation
export function getTerrainHeight(terrain: TerrainData, x: number): number {
  if (x <= terrain.startX) return terrain.points[0][1];
  if (x >= terrain.endX) return terrain.points[terrain.points.length - 1][1];

  const idx = (x - terrain.startX) / terrain.spacing;
  const i = Math.floor(idx);
  const frac = idx - i;

  if (i >= terrain.points.length - 1) return terrain.points[terrain.points.length - 1][1];

  const y0 = terrain.points[i][1];
  const y1 = terrain.points[i + 1][1];
  return y0 + (y1 - y0) * frac;
}

// Check if a point is on the landing pad
export function isOnPad(terrain: TerrainData, x: number): boolean {
  return x >= terrain.pad.left && x <= terrain.pad.right;
}

export function checkLandingCollision(level: LevelDef, terrain: TerrainData, x: number, y: number): LandingCollision {
  if (level.landingLayout?.kind === 'cloud-city') {
    const layout = level.landingLayout;
    const deckTop = layout.deckY;
    const deckBottom = layout.deckY - layout.deckThickness;
    const onDeckX = x >= layout.deckLeft && x <= layout.deckRight;
    const hitsDeck = onDeckX && y <= deckTop && y >= deckBottom;
    if (hitsDeck) return { hit: true, onPad: isOnPad(terrain, x) };

    for (const sx of layout.supportXs) {
      const half = layout.supportWidth * 0.5;
      if (x >= sx - half && x <= sx + half && y >= deckTop - layout.supportHeight && y <= deckTop) {
        return { hit: true, onPad: false };
      }
    }

    for (const dome of layout.domes) {
      const dx = x - dome.x;
      if (Math.abs(dx) <= dome.radius) {
        const domeY = deckTop + Math.sqrt(Math.max(0, dome.radius * dome.radius - dx * dx)) * (dome.height / dome.radius);
        if (y >= deckTop && y <= domeY) return { hit: true, onPad: false };
      }
    }

    return { hit: false, onPad: false };
  }

  return { hit: y <= getTerrainHeight(terrain, x), onPad: isOnPad(terrain, x) };
}

export function landingReferenceHeight(level: LevelDef, terrain: TerrainData, x: number): number {
  return level.landingLayout?.kind === 'cloud-city' ? level.padY : getTerrainHeight(terrain, x);
}
