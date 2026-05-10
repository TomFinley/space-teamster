export interface LandingPhaseDef {
  id: number;
  poiId: string;
}

export interface ClusterPhaseDef {
  id: number;
}

export interface ApproachPhaseDef {
  id: number;
  kind: 'descent' | 'departure';
  poiId: string;
  subtitle?: string;
  fuelSeconds?: number;
  landingPoiId?: string;
  returnToOrbitalLevelId?: number;
  departureOrbitalLevelId?: number;
  exitAltitude?: number;
  thresholdApoapsisAltitude?: number;
  targetOrbitAltitude?: number;
  orbitDir?: 1 | -1;
}

export interface TransferSystemBodyDef {
  bodyId: string;
  patchRadius: number;
  displayPatchRadius?: number;
  arrivalAltitudeMin?: number;
  arrivalAltitudeMax?: number;
  arrivalSpeedMarginMin?: number;
  arrivalSpeedMarginMax?: number;
  arrivalOrbitalLevelId?: number;
}

export type OrbitalSeedDef =
  | {
    kind: 'localPoiOrbit';
    poiId: string;
    orbitAlt: number;
    orbitSense: 1 | -1;
  }
  | {
    kind: 'transferBodyOrbit';
    bodyId: string;
  };

export type OrbitalPhaseDef =
  | {
    id: number;
    kind: 'surfaceOrbit';
    poiId: string;
    name: string;
    subtitle: string;
    orbitAlt: number;
    reentryApproachLevelId: number;
    orbitSense: 1 | -1;
    fuelDeltaV?: number;
    thrustAccel?: number;
    thrustAccelMax?: number;
    showLandingSite?: boolean;
    orbitModeId?: string;
    escapeToOrbitalLevelId?: number;
    escapeTargetBodyId?: string;
    parentTransferPeriapsisAltitude?: number;
  }
  | {
    id: number;
    kind: 'stationOrbit';
    stationPoiId: string;
    name: string;
    subtitle: string;
    playerOrbitAlt: number;
    reentryApproachLevelId: number;
    startSense: 1 | -1;
    fuelDeltaV: number;
    dockingLevelId: number;
    showLandingSite?: boolean;
    orbitModeId?: string;
    escapeToOrbitalLevelId?: number;
    parentTransferPeriapsisAltitude?: number;
  }
  | {
    id: number;
    kind: 'systemTransfer';
    bodyId: string;
    name: string;
    subtitle: string;
    seed: OrbitalSeedDef;
    reentryApproachLevelId: number;
    fuelDeltaV: number;
    showLandingSite?: boolean;
    orbitModeId?: string;
    systemBodies: TransferSystemBodyDef[];
    targetBodyId: string;
    conicRadiusBodyId: string;
    conicRadiusScale: number;
  }
  | {
    id: number;
    kind: 'bodyArrival';
    bodyId: string;
    name: string;
    subtitle: string;
    reentryApproachLevelId: number;
    startAltitude: number;
    startExcessSpeed: number;
    startRadialVelocity: number;
    fuelDeltaV: number;
    showLandingSite?: boolean;
    escapeToOrbitalLevelId?: number;
  };

export const LANDING_PHASES: LandingPhaseDef[] = [
  { id: 6, poiId: 'castor-settlement' },
  { id: 7, poiId: 'port-kessler' },
  { id: 8, poiId: 'pollux-outpost' },
];

export const APPROACH_PHASES: ApproachPhaseDef[] = [
  { id: 10, kind: 'descent', poiId: 'castor-settlement', fuelSeconds: 120, returnToOrbitalLevelId: 11 },
  { id: 11, kind: 'descent', poiId: 'castor-settlement', fuelSeconds: 120, returnToOrbitalLevelId: 11 },
  { id: 12, kind: 'departure', poiId: 'castor-settlement', fuelSeconds: 140, departureOrbitalLevelId: 12 },
  { id: 13, kind: 'descent', poiId: 'port-kessler', fuelSeconds: 85, returnToOrbitalLevelId: 13 },
  { id: 14, kind: 'departure', poiId: 'port-kessler', departureOrbitalLevelId: 14 },
  {
    id: 15,
    kind: 'departure',
    poiId: 'castor-settlement',
    subtitle: 'Launch and build speed for the Pollux transfer',
    fuelSeconds: 280,
    departureOrbitalLevelId: 15,
  },
  { id: 16, kind: 'descent', poiId: 'pollux-outpost', fuelSeconds: 260, returnToOrbitalLevelId: 17 },
  {
    id: 17,
    kind: 'departure',
    poiId: 'port-kessler',
    subtitle: 'Atmospheric departure — build speed for the Castor transfer',
    fuelSeconds: 110,
    departureOrbitalLevelId: 18,
  },
  {
    id: 18,
    kind: 'departure',
    poiId: 'castor-settlement',
    subtitle: 'Launch and build speed for the Tycho transfer',
    fuelSeconds: 280,
    departureOrbitalLevelId: 20,
  },
];

export const ORBITAL_PHASES: OrbitalPhaseDef[] = [
  {
    id: 11,
    kind: 'surfaceOrbit',
    poiId: 'castor-settlement',
    name: 'Castor Orbit',
    subtitle: 'Deorbit to mining settlement',
    orbitAlt: 100_000,
    reentryApproachLevelId: 11,
    orbitSense: -1,
  },
  {
    id: 12,
    kind: 'stationOrbit',
    stationPoiId: 'calloway',
    name: 'Calloway Rendezvous',
    subtitle: 'Raise apoapsis and rendezvous with Calloway Station',
    playerOrbitAlt: 100_000,
    reentryApproachLevelId: 12,
    startSense: -1,
    fuelDeltaV: 2000,
    dockingLevelId: 12,
  },
  {
    id: 13,
    kind: 'surfaceOrbit',
    poiId: 'port-kessler',
    name: 'Tycho Orbit',
    subtitle: 'Deorbit toward the surface target',
    orbitAlt: 140_000,
    reentryApproachLevelId: 13,
    orbitSense: 1,
    orbitModeId: 'low',
  },
  {
    id: 14,
    kind: 'stationOrbit',
    stationPoiId: 'anchor',
    name: 'Anchor Rendezvous',
    subtitle: 'Raise apoapsis and rendezvous with Anchor Station',
    playerOrbitAlt: 140_000,
    reentryApproachLevelId: 14,
    startSense: 1,
    fuelDeltaV: 1000,
    dockingLevelId: 14,
    orbitModeId: 'low',
  },
  {
    id: 15,
    kind: 'surfaceOrbit',
    poiId: 'castor-settlement',
    name: 'Castor Transfer',
    subtitle: 'Escape Castor and set up the Pollux transfer',
    orbitAlt: 100_000,
    reentryApproachLevelId: 15,
    orbitSense: -1,
    showLandingSite: false,
    fuelDeltaV: 1600,
    thrustAccel: 0.06,
    thrustAccelMax: 1.2,
    escapeToOrbitalLevelId: 16,
    escapeTargetBodyId: 'pollux',
  },
  {
    id: 16,
    kind: 'systemTransfer',
    bodyId: 'tycho',
    name: 'Tycho Transfer',
    subtitle: 'Adjust the transfer and arrive at Pollux',
    seed: { kind: 'transferBodyOrbit', bodyId: 'castor' },
    reentryApproachLevelId: 14,
    fuelDeltaV: 2800,
    showLandingSite: false,
    orbitModeId: 'high',
    systemBodies: [
      { bodyId: 'castor', patchRadius: 700_000 },
      {
        bodyId: 'pollux',
        patchRadius: 800_000,
        arrivalAltitudeMin: 120_000,
        arrivalAltitudeMax: 220_000,
        arrivalSpeedMarginMin: 2,
        arrivalSpeedMarginMax: 100,
        arrivalOrbitalLevelId: 17,
      },
    ],
    targetBodyId: 'pollux',
    conicRadiusBodyId: 'pollux',
    conicRadiusScale: 1.2,
  },
  {
    id: 17,
    kind: 'bodyArrival',
    bodyId: 'pollux',
    name: 'Pollux Arrival',
    subtitle: 'Brake into Pollux orbit and set up the descent',
    reentryApproachLevelId: 16,
    startAltitude: 180_000,
    startExcessSpeed: 60,
    startRadialVelocity: -35,
    fuelDeltaV: 1300,
    escapeToOrbitalLevelId: 16,
  },
  {
    id: 18,
    kind: 'systemTransfer',
    bodyId: 'tycho',
    name: 'Castor Transfer',
    subtitle: 'Leave Tycho and intercept Castor',
    seed: { kind: 'localPoiOrbit', poiId: 'port-kessler', orbitAlt: 140_000, orbitSense: 1 },
    reentryApproachLevelId: 17,
    fuelDeltaV: 2200,
    showLandingSite: false,
    orbitModeId: 'high',
    systemBodies: [
      {
        bodyId: 'castor',
        patchRadius: 700_000,
        arrivalAltitudeMin: 120_000,
        arrivalAltitudeMax: 220_000,
        arrivalSpeedMarginMin: 2,
        arrivalSpeedMarginMax: 100,
        arrivalOrbitalLevelId: 19,
      },
      { bodyId: 'pollux', patchRadius: 800_000 },
    ],
    targetBodyId: 'castor',
    conicRadiusBodyId: 'castor',
    conicRadiusScale: 1.2,
  },
  {
    id: 19,
    kind: 'stationOrbit',
    stationPoiId: 'morrow',
    name: 'Morrow Rendezvous',
    subtitle: 'Raise or trim your orbit and rendezvous with Morrow Station',
    playerOrbitAlt: 100_000,
    reentryApproachLevelId: 12,
    startSense: -1,
    fuelDeltaV: 900,
    dockingLevelId: 15,
    showLandingSite: false,
    escapeToOrbitalLevelId: 18,
  },
  {
    id: 20,
    kind: 'surfaceOrbit',
    poiId: 'castor-settlement',
    name: 'Castor Transfer',
    subtitle: 'Escape Castor and set up Tycho arrival',
    orbitAlt: 100_000,
    reentryApproachLevelId: 18,
    orbitSense: -1,
    showLandingSite: false,
    fuelDeltaV: 1600,
    thrustAccel: 0.06,
    thrustAccelMax: 1.2,
    escapeToOrbitalLevelId: 13,
    parentTransferPeriapsisAltitude: 200_000,
  },
];

export type MissionStartDef =
  | { kind: 'docking'; dockingLevelId: number }
  | { kind: 'landing'; poiId: string; departureApproachLevelId: number }
  | { kind: 'cluster'; clusterLevelId: number }
  | { kind: 'estellaNav' };
