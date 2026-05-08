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

  'estella-i': {
    kind: 'orbit',
    parentId: 'estella',
    usage: 'stellar',
    orbit: { kind: 'circular', radius: 12_000_000, epochAngle: -0.7, epochTime: 0, orbitSense: 1, period: 360_000 },
  },
  'estella-i-low-orbit-station': {
    kind: 'orbit',
    parentId: 'estella-i',
    usage: 'low',
    orbit: { kind: 'circular', radius: 225_000, altitude: 75_000, epochAngle: 0.2, epochTime: 0, orbitSense: 1, period: 6_800 },
  },
  'estella-i-worker-hab': { kind: 'surface', parentId: 'estella-i', angle: -2.2, side: 'night' },
  'estella-i-refractory-mine': { kind: 'surface', parentId: 'estella-i', angle: -0.2, side: 'terminator' },
  'estella-i-hot-processing': { kind: 'surface', parentId: 'estella-i', angle: 0.35, side: 'terminator' },
  'estella-i-deep-listening': { kind: 'surface', parentId: 'estella-i', angle: 2.55, side: 'night' },

  'estella-ii': {
    kind: 'orbit',
    parentId: 'estella',
    usage: 'stellar',
    orbit: { kind: 'circular', radius: 22_000_000, epochAngle: 0.65, epochTime: 0, orbitSense: 1, period: 760_000 },
  },
  'estella-ii-cloud-city-platform': {
    kind: 'orbit',
    parentId: 'estella-ii',
    usage: 'low',
    orbit: { kind: 'circular', radius: 430_000, altitude: 110_000, epochAngle: -0.8, epochTime: 0, orbitSense: 1, period: 8_200 },
  },
  'estella-ii-science-platform': {
    kind: 'orbit',
    parentId: 'estella-ii',
    usage: 'low',
    orbit: { kind: 'circular', radius: 455_000, altitude: 135_000, epochAngle: 1.2, epochTime: 0, orbitSense: 1, period: 8_900 },
  },
  'estella-ii-deep-pressure-ops': { kind: 'surface', parentId: 'estella-ii', angle: -1.35, side: 'unspecified' },

  'estella-iii': {
    kind: 'orbit',
    parentId: 'estella',
    usage: 'stellar',
    orbit: { kind: 'circular', radius: 32_000_000, epochAngle: 1.45, epochTime: 0, orbitSense: 1, period: 1_180_000 },
  },
  'estella-iii-main-customs-station': {
    kind: 'orbit',
    parentId: 'estella-iii',
    usage: 'low',
    orbit: { kind: 'circular', radius: 500_000, altitude: 140_000, epochAngle: -0.15, epochTime: 0, orbitSense: 1, period: 9_000 },
  },
  'estella-iii-luxury-habitat': {
    kind: 'orbit',
    parentId: 'estella-iii',
    usage: 'high',
    orbit: { kind: 'circular', radius: 760_000, altitude: 400_000, epochAngle: 1.75, epochTime: 0, orbitSense: 1, period: 16_000 },
  },
  'estella-iii-capital-city': { kind: 'surface', parentId: 'estella-iii', angle: 0.1, side: 'equatorial' },
  'estella-iii-finance-city': { kind: 'surface', parentId: 'estella-iii', angle: 0.7, side: 'equatorial' },
  'estella-iii-high-tech-city': { kind: 'surface', parentId: 'estella-iii', angle: 1.35, side: 'equatorial' },
  'estella-iii-coastal-resort': { kind: 'surface', parentId: 'estella-iii', angle: 2.05, side: 'equatorial' },
  'estella-iii-agricultural-region': { kind: 'surface', parentId: 'estella-iii', angle: 2.85, side: 'equatorial' },
  'estella-iii-polar-science': { kind: 'surface', parentId: 'estella-iii', angle: -2.55, side: 'polar' },
  'estella-iii-military-spaceport': { kind: 'surface', parentId: 'estella-iii', angle: -1.3, side: 'unspecified' },
  'estella-iii-historic-site': { kind: 'surface', parentId: 'estella-iii', angle: -0.55, side: 'equatorial' },

  'estella-iiia': {
    kind: 'orbit',
    parentId: 'estella-iii',
    usage: 'moon',
    orbit: { kind: 'circular', radius: 1_350_000, epochAngle: 2.4, epochTime: 0, orbitSense: 1, period: 120_000 },
  },
  'estella-iiia-main-port': {
    kind: 'orbit',
    parentId: 'estella-iiia',
    usage: 'low',
    orbit: { kind: 'circular', radius: 205_000, altitude: 65_000, epochAngle: 0.6, epochTime: 0, orbitSense: 1, period: 6_600 },
  },
  'estella-iiia-helium-mining': { kind: 'surface', parentId: 'estella-iiia', angle: -0.85, side: 'equatorial' },
  'estella-iiia-science-settlement': { kind: 'surface', parentId: 'estella-iiia', angle: 1.6, side: 'equatorial' },
  'estella-iiia-heritage-site': { kind: 'surface', parentId: 'estella-iiia', angle: 2.8, side: 'equatorial' },

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
