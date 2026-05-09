import { LANDING_PHASES } from './campaign-content';
import { type BodyDef, type SurfacePoiDef, bodyById, surfacePoiById, type LandingLayoutDef, type TerrainFeature } from './world';

export { type LandingLayoutDef, type TerrainFeature };

export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  body: BodyDef;
  poi: SurfacePoiDef;
  gravity: number;
  landingMaxVSpeed: number;
  landingMaxHSpeed: number;
  landingMaxAngle: number;
  startX: number;
  startY: number;
  startVX: number;
  startVY: number;
  padCenterX: number;
  padHalfWidth: number;
  padY: number;
  roughness: number;
  features: TerrainFeature[];
  landingLayout?: LandingLayoutDef;
  terrainFillColor?: string;
  terrainStrokeColor?: string;
  terrainBrightColor?: string;
}

export function createLandingLevel(surfacePoiId: string, id: number): LevelDef {
  const poi = surfacePoiById(surfacePoiId);
  const body = bodyById(poi.bodyId);
  return {
    id,
    name: poi.name,
    subtitle: poi.subtitle,
    body,
    poi,
    gravity: body.gm / (body.radius * body.radius),
    landingMaxVSpeed: poi.landingStart.landingMaxVSpeed,
    landingMaxHSpeed: poi.landingStart.landingMaxHSpeed,
    landingMaxAngle: poi.landingStart.landingMaxAngle,
    startX: poi.landingStart.x,
    startY: poi.landingStart.y,
    startVX: poi.landingStart.vx,
    startVY: poi.landingStart.vy,
    padCenterX: poi.padCenterX,
    padHalfWidth: poi.padHalfWidth,
    padY: poi.padY,
    roughness: poi.roughness,
    features: poi.features,
    landingLayout: poi.landingLayout,
    terrainFillColor: body.terrainFillColor,
    terrainStrokeColor: body.terrainStrokeColor,
    terrainBrightColor: body.terrainBrightColor,
  };
}

export const LEVELS: LevelDef[] = LANDING_PHASES.map(def => createLandingLevel(def.poiId, def.id));

export function landingLevelById(id: number): LevelDef | undefined {
  return LEVELS.find(l => l.id === id);
}

export function landingLevelByPoiId(poiId: string): LevelDef | undefined {
  return LEVELS.find(l => l.poi.id === poiId);
}

export const DEFAULT_LANDING_LEVEL = LEVELS[0];
