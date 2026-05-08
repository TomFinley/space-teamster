import { type Placement } from '../types';

/**
 * Canonical editable placement overrides for Estella nodes.
 *
 * The node inventory can carry a coarse placement so the tree remains readable, but exact
 * spatial data should live here. Add records by stable node id as authored values become
 * known. This lets future edits touch one small file instead of the whole content tree.
 */
export const ESTELLA_PLACEMENTS: Partial<Record<string, Placement>> = {
  // Example shape for a circular stellar orbit:
  // 'estella-iii': {
  //   kind: 'orbit',
  //   parentId: 'estella',
  //   usage: 'stellar',
  //   orbit: {
  //     kind: 'circular',
  //     radius: 150_000_000_000,
  //     epochAngle: 0,
  //     epochTime: 0,
  //     orbitSense: 1,
  //     period: 31_557_600,
  //   },
  // },

  // Example shape for a non-circular cluster orbit:
  // 'belt-cluster-wreckage-field': {
  //   kind: 'orbit',
  //   parentId: 'estella',
  //   usage: 'eccentric',
  //   orbit: {
  //     kind: 'keplerian',
  //     semiMajorAxis: 420_000_000_000,
  //     eccentricity: 0.18,
  //     argumentOfPeriapsis: 1.1,
  //     meanAnomalyAtEpoch: 0.4,
  //     epochTime: 0,
  //     orbitSense: 1,
  //   },
  // },

  'estella-viii': {
    kind: 'orbit',
    parentId: 'estella',
    usage: 'stellar',
    orbit: {
      kind: 'circular',
      radius: 42_000_000,
      epochAngle: 2.1,
      epochTime: 0,
      orbitSense: 1,
      period: 1_600_000,
    },
  },
  'estella-viii-friendly-station': {
    kind: 'orbit',
    parentId: 'estella-viii',
    usage: 'low',
    orbit: {
      kind: 'circular',
      radius: 260_000,
      altitude: 80_000,
      epochAngle: 0.4,
      epochTime: 0,
      orbitSense: 1,
      period: 7_200,
    },
  },
  'estella-viii-high-station': {
    kind: 'orbit',
    parentId: 'estella-viii',
    usage: 'high',
    orbit: {
      kind: 'circular',
      radius: 420_000,
      altitude: 240_000,
      epochAngle: -1.2,
      epochTime: 0,
      orbitSense: 1,
      period: 14_400,
    },
  },
  'estella-viii-captured-moonlet': {
    kind: 'orbit',
    parentId: 'estella-viii',
    usage: 'moon',
    orbit: {
      kind: 'circular',
      radius: 640_000,
      epochAngle: 1.6,
      epochTime: 0,
      orbitSense: 1,
      period: 28_800,
    },
  },
  'estella-viii-settlement': {
    kind: 'surface',
    parentId: 'estella-viii',
    angle: 0.15,
    side: 'equatorial',
  },
  'estella-viii-mining-site': {
    kind: 'surface',
    parentId: 'estella-viii',
    angle: 2.35,
    side: 'equatorial',
  },
  'estella-viii-abandoned-site': {
    kind: 'surface',
    parentId: 'estella-viii',
    angle: -1.7,
    side: 'unspecified',
  },

  'estella-ix': {
    kind: 'orbit',
    parentId: 'estella',
    usage: 'stellar',
    orbit: {
      kind: 'circular',
      radius: 42_300_000,
      epochAngle: 2.95,
      epochTime: 0,
      orbitSense: 1,
      period: 1_620_000,
    },
  },
  'estella-ix-research-station': {
    kind: 'orbit',
    parentId: 'estella-ix',
    usage: 'low',
    orbit: {
      kind: 'circular',
      radius: 240_000,
      altitude: 75_000,
      epochAngle: -0.35,
      epochTime: 0,
      orbitSense: 1,
      period: 7_400,
    },
  },
  'estella-ix-supply-depot': {
    kind: 'orbit',
    parentId: 'estella-ix',
    usage: 'high',
    orbit: {
      kind: 'circular',
      radius: 390_000,
      altitude: 225_000,
      epochAngle: 1.05,
      epochTime: 0,
      orbitSense: 1,
      period: 14_800,
    },
  },
  'estella-ix-captured-moonlet': {
    kind: 'orbit',
    parentId: 'estella-ix',
    usage: 'moon',
    orbit: {
      kind: 'circular',
      radius: 600_000,
      epochAngle: -1.75,
      epochTime: 0,
      orbitSense: 1,
      period: 29_600,
    },
  },
  'estella-ix-research-base': {
    kind: 'surface',
    parentId: 'estella-ix',
    angle: 0.55,
    side: 'equatorial',
  },
  'estella-ix-ice-mine': {
    kind: 'surface',
    parentId: 'estella-ix',
    angle: 2.75,
    side: 'equatorial',
  },
  'estella-ix-geological-feature': {
    kind: 'surface',
    parentId: 'estella-ix',
    angle: -1.15,
    side: 'unspecified',
  },
};
