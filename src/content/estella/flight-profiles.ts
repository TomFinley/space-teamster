import { type LandingLayoutDef, type TerrainFeature } from '../../world';

export interface EstellaSurfaceFlightProfile {
  subtitle: string;
  labelVisibility?: 'always' | 'target';
  padCenterX: number;
  padHalfWidth: number;
  padY: number;
  roughness: number;
  features: TerrainFeature[];
  landingLayout?: LandingLayoutDef;
  landingStart: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    landingMaxVSpeed: number;
    landingMaxHSpeed: number;
    landingMaxAngle: number;
  };
  descentProfile: {
    startX: number;
    startY: number;
    startVX: number;
    startVY: number;
    startAngle: number;
    gateY: number;
    gateRadius: number;
    gateMaxSpeed: number;
    gateMinSpeed: number;
  };
  departureProfile: {
    startY: number;
    startVY: number;
    exitAltitude: number;
    thresholdApoapsisAltitude: number;
    targetOrbitAltitude: number;
    orbitDir: 1 | -1;
    fuelSeconds: number;
  };
}

const ESTELLA_VIII_DEFAULT_SURFACE_PROFILE: EstellaSurfaceFlightProfile = {
  subtitle: 'Generated Estella surface site',
  padCenterX: 1000,
  padHalfWidth: 28,
  padY: 30,
  roughness: 0.6,
  features: [
    { xStart: 900, xEnd: 920, height: 44 },
    { xStart: 1080, xEnd: 1100, height: 50 },
  ],
  landingStart: {
    x: 1000,
    y: 260,
    vx: 0,
    vy: -3,
    landingMaxVSpeed: 4.0,
    landingMaxHSpeed: 3.0,
    landingMaxAngle: 0.26,
  },
  descentProfile: {
    startX: -90_000,
    startY: 9_000,
    startVX: 480,
    startVY: -24,
    startAngle: 1.5,
    gateY: 1500,
    gateRadius: 1800,
    gateMaxSpeed: 150,
    gateMinSpeed: 15,
  },
  departureProfile: {
    startY: 260,
    startVY: 0,
    exitAltitude: 8_000,
    thresholdApoapsisAltitude: 85_000,
    targetOrbitAltitude: 100_000,
    orbitDir: -1,
    fuelSeconds: 180,
  },
};

const ESTELLA_IX_DEFAULT_SURFACE_PROFILE: EstellaSurfaceFlightProfile = {
  ...ESTELLA_VIII_DEFAULT_SURFACE_PROFILE,
  subtitle: 'Generated Estella IX icy surface site',
  features: [
    { xStart: 880, xEnd: 905, height: 38 },
    { xStart: 1110, xEnd: 1135, height: 46 },
  ],
};

const ESTELLA_HEARTH_DEFAULT_SURFACE_PROFILE: EstellaSurfaceFlightProfile = {
  ...ESTELLA_VIII_DEFAULT_SURFACE_PROFILE,
  subtitle: 'Generated Hearth surface site',
  features: [
    { xStart: 860, xEnd: 890, height: 34 },
    { xStart: 1120, xEnd: 1150, height: 42 },
  ],
};

const ESTELLA_HEARTH_ATMO_SURFACE_PROFILE: EstellaSurfaceFlightProfile = {
  ...ESTELLA_HEARTH_DEFAULT_SURFACE_PROFILE,
  subtitle: 'Generated Hearth atmospheric surface site',
  descentProfile: {
    startX: -90_000,
    startY: 30_000,
    startVX: 1_350,
    startVY: -70,
    startAngle: 1.5,
    gateY: 1800,
    gateRadius: 1700,
    gateMaxSpeed: 170,
    gateMinSpeed: 20,
  },
  departureProfile: {
    ...ESTELLA_HEARTH_DEFAULT_SURFACE_PROFILE.departureProfile,
    startY: 320,
    startVY: 5,
    exitAltitude: 30_000,
    thresholdApoapsisAltitude: 90_000,
    targetOrbitAltitude: 140_000,
    fuelSeconds: 180,
  },
};

const CLOUD_CITY_ALTITUDE = 55_000;

const ESTELLA_II_CLOUD_CITY_PROFILE: EstellaSurfaceFlightProfile = {
  subtitle: 'Atmospheric platform landing deck in Estella II\'s upper cloud layer',
  padCenterX: 1000,
  padHalfWidth: 70,
  padY: CLOUD_CITY_ALTITUDE,
  roughness: 0,
  features: [],
  landingLayout: {
    kind: 'cloud-city',
    deckLeft: 620,
    deckRight: 1380,
    deckY: CLOUD_CITY_ALTITUDE,
    deckThickness: 18,
    supportXs: [760, 1240],
    supportWidth: 22,
    supportHeight: 240,
    domes: [
      { x: 820, radius: 62, height: 42 },
      { x: 1160, radius: 78, height: 54 },
      { x: 1320, radius: 44, height: 34 },
    ],
  },
  landingStart: {
    x: 1000,
    y: CLOUD_CITY_ALTITUDE + 260,
    vx: 0,
    vy: -3,
    landingMaxVSpeed: 3.5,
    landingMaxHSpeed: 2.5,
    landingMaxAngle: 0.22,
  },
  descentProfile: {
    startX: -85_000,
    startY: CLOUD_CITY_ALTITUDE + 24_000,
    startVX: 1_050,
    startVY: -45,
    startAngle: 1.5,
    gateY: 1_800,
    gateRadius: 1_900,
    gateMaxSpeed: 150,
    gateMinSpeed: 20,
  },
  departureProfile: {
    startY: CLOUD_CITY_ALTITUDE + 260,
    startVY: 4,
    exitAltitude: 75_000,
    thresholdApoapsisAltitude: 130_000,
    targetOrbitAltitude: 160_000,
    orbitDir: -1,
    fuelSeconds: 150,
  },
};

export const ESTELLA_SURFACE_FLIGHT_PROFILES: Partial<Record<string, EstellaSurfaceFlightProfile>> = {
  'estella-i-worker-hab': ESTELLA_HEARTH_DEFAULT_SURFACE_PROFILE,
  'estella-i-refractory-mine': ESTELLA_HEARTH_DEFAULT_SURFACE_PROFILE,
  'estella-i-hot-processing': ESTELLA_HEARTH_DEFAULT_SURFACE_PROFILE,
  'estella-i-deep-listening': ESTELLA_HEARTH_DEFAULT_SURFACE_PROFILE,
  'estella-ii-cloud-city': ESTELLA_II_CLOUD_CITY_PROFILE,
  'estella-ii-deep-pressure-ops': { ...ESTELLA_HEARTH_ATMO_SURFACE_PROFILE, labelVisibility: 'target' },
  'estella-iii-capital-city': ESTELLA_HEARTH_ATMO_SURFACE_PROFILE,
  'estella-iii-finance-city': ESTELLA_HEARTH_ATMO_SURFACE_PROFILE,
  'estella-iii-high-tech-city': ESTELLA_HEARTH_ATMO_SURFACE_PROFILE,
  'estella-iii-coastal-resort': ESTELLA_HEARTH_ATMO_SURFACE_PROFILE,
  'estella-iii-agricultural-region': ESTELLA_HEARTH_ATMO_SURFACE_PROFILE,
  'estella-iii-polar-science': ESTELLA_HEARTH_ATMO_SURFACE_PROFILE,
  'estella-iii-military-spaceport': { ...ESTELLA_HEARTH_ATMO_SURFACE_PROFILE, labelVisibility: 'target' },
  'estella-iii-historic-site': ESTELLA_HEARTH_ATMO_SURFACE_PROFILE,
  'estella-iiia-helium-mining': ESTELLA_HEARTH_DEFAULT_SURFACE_PROFILE,
  'estella-iiia-science-settlement': ESTELLA_HEARTH_DEFAULT_SURFACE_PROFILE,
  'estella-iiia-heritage-site': ESTELLA_HEARTH_DEFAULT_SURFACE_PROFILE,
  'estella-iv-primary-city': ESTELLA_HEARTH_ATMO_SURFACE_PROFILE,
  'estella-iv-climate-poi-1': ESTELLA_HEARTH_ATMO_SURFACE_PROFILE,
  'estella-iv-climate-poi-2': ESTELLA_HEARTH_ATMO_SURFACE_PROFILE,
  'estella-iv-climate-poi-3': ESTELLA_HEARTH_ATMO_SURFACE_PROFILE,
  'estella-viii-settlement': ESTELLA_VIII_DEFAULT_SURFACE_PROFILE,
  'estella-viii-mining-site': ESTELLA_VIII_DEFAULT_SURFACE_PROFILE,
  'estella-viii-abandoned-site': {
    ...ESTELLA_VIII_DEFAULT_SURFACE_PROFILE,
    labelVisibility: 'target',
  },
  'estella-ix-research-base': ESTELLA_IX_DEFAULT_SURFACE_PROFILE,
  'estella-ix-ice-mine': ESTELLA_IX_DEFAULT_SURFACE_PROFILE,
  'estella-ix-geological-feature': {
    ...ESTELLA_IX_DEFAULT_SURFACE_PROFILE,
    labelVisibility: 'target',
  },
};
