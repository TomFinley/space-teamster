import { type AccessPoint, type AtmosphereModel, type InstitutionDef, type OrbitDef, type OrbitUsage, type RegionId, type WorldNode, type WorldNodeKind, validateWorldTree } from '../types';

export const ESTELLA_REGION_NAMES: Record<RegionId, string> = {
  hearth: 'The Hearth',
  camps: 'The Camps',
  belt: 'The Belt',
  wells: 'The Wells',
  reach: 'The Reach',
};

const ROOT_ID = 'estella';

function ap(id: string, name: string, kind: AccessPoint['kind'], servesPoiIds: string[], localX = 0, localY = 0, angle = 0, tags: string[] = []): AccessPoint {
  return { id, name, kind, localX, localY, angle, servesPoiIds, tags };
}

function orbiting(args: {
  id: string;
  catalogId?: string;
  name: string;
  kind: WorldNodeKind;
  regionId?: RegionId;
  parentId: string;
  usage?: OrbitUsage;
  orbit?: OrbitDef;
  summary: string;
  tags?: string[];
  economyTags?: string[];
  gameplayTags?: string[];
  capabilities?: WorldNode['capabilities'];
  atmosphere?: AtmosphereModel;
  layoutId?: string;
  accessPoints?: AccessPoint[];
}): WorldNode {
  return {
    id: args.id,
    catalogId: args.catalogId,
    name: args.name,
    kind: args.kind,
    regionId: args.regionId,
    placement: { kind: 'orbit', parentId: args.parentId, usage: args.usage, orbit: args.orbit },
    summary: args.summary,
    tags: args.tags,
    economyTags: args.economyTags,
    gameplayTags: args.gameplayTags,
    capabilities: args.capabilities,
    atmosphere: args.atmosphere,
    layoutId: args.layoutId,
    accessPoints: args.accessPoints,
  };
}

function cluster(args: {
  id: string;
  name: string;
  regionId: RegionId;
  parentId: string;
  usage?: Extract<OrbitUsage, 'co-orbital' | 'eccentric' | 'outer' | 'swarm'>;
  orbit?: OrbitDef;
  summary: string;
  tags?: string[];
  gameplayTags?: string[];
}): WorldNode {
  return orbiting({
    id: args.id,
    name: args.name,
    kind: 'cluster',
    regionId: args.regionId,
    parentId: args.parentId,
    usage: args.usage,
    orbit: args.orbit,
    summary: args.summary,
    tags: args.tags,
    gameplayTags: args.gameplayTags,
    capabilities: { clusterNavigation: true, dockOnly: true },
  });
}

function clusterMember(args: {
  id: string;
  catalogId?: string;
  name: string;
  kind: WorldNodeKind;
  regionId: RegionId;
  parentId: string;
  x: number;
  y: number;
  summary: string;
  tags?: string[];
  economyTags?: string[];
  layoutId?: string;
  accessPoints?: AccessPoint[];
}): WorldNode {
  return {
    id: args.id,
    catalogId: args.catalogId,
    name: args.name,
    kind: args.kind,
    regionId: args.regionId,
    placement: { kind: 'cluster-member', parentId: args.parentId, x: args.x, y: args.y },
    summary: args.summary,
    tags: args.tags,
    economyTags: args.economyTags,
    capabilities: { dockable: true, dockOnly: true },
    layoutId: args.layoutId,
    accessPoints: args.accessPoints,
  };
}

function surfacePoi(id: string, catalogId: string, name: string, parentId: string, regionId: RegionId, summary: string, tags: string[] = [], economyTags: string[] = [], side: 'day' | 'night' | 'terminator' | 'polar' | 'equatorial' | 'unspecified' = 'unspecified'): WorldNode {
  return {
    id,
    catalogId,
    name,
    kind: 'poi',
    regionId,
    placement: { kind: 'surface', parentId, side },
    summary,
    tags: ['surface', ...tags],
    economyTags,
    capabilities: { landable: true },
    accessPoints: [ap(`${id}-pad-a`, 'Pad A', 'landing-pad', [id])],
  };
}

function aboardPoi(id: string, catalogId: string | undefined, name: string, parentId: string, regionId: RegionId, summary: string, tags: string[] = [], economyTags: string[] = []): WorldNode {
  return {
    id,
    catalogId,
    name,
    kind: 'poi',
    regionId,
    placement: { kind: 'aboard', parentId },
    summary,
    tags,
    economyTags,
    capabilities: { dockable: true },
  };
}

function stationWithPoi(args: {
  stationId: string;
  poiId: string;
  catalogId: string;
  stationName: string;
  poiName?: string;
  parentId: string;
  regionId: RegionId;
  usage?: Extract<OrbitUsage, 'low' | 'high' | 'very-inner' | 'stellar' | 'planetary' | 'moon'>;
  orbit?: OrbitDef;
  summary: string;
  tags?: string[];
  economyTags?: string[];
  layoutId?: string;
}): WorldNode[] {
  return [
    orbiting({
      id: args.stationId,
      name: args.stationName,
      kind: 'station',
      regionId: args.regionId,
      parentId: args.parentId,
      usage: args.usage ?? 'low',
      orbit: args.orbit,
      summary: args.summary,
      tags: args.tags,
      economyTags: args.economyTags,
      layoutId: args.layoutId ?? 'small-transit-hub',
      capabilities: { dockable: true, dockOnly: true },
      accessPoints: [
        ap(`${args.stationId}-berth-a`, 'Berth A', 'docking-berth', [args.poiId], -20, 0, 0),
        ap(`${args.stationId}-berth-b`, 'Berth B', 'docking-berth', [args.poiId], 20, 0, Math.PI),
      ],
    }),
    aboardPoi(args.poiId, args.catalogId, args.poiName ?? args.stationName, args.stationId, args.regionId, args.summary, args.tags, args.economyTags),
  ];
}

function atmosphere(kind: AtmosphereModel['kind'], notes?: string, playableEntry = true): AtmosphereModel {
  return { kind, notes, playableEntry };
}

export const ESTELLA_NODE_BLUEPRINTS: WorldNode[] = [
  {
    id: ROOT_ID,
    catalogId: 'Estella',
    name: 'Estella',
    kind: 'star',
    summary: 'Yellow star at the center of the system; named after Captain Kasimir Volker\'s wife.',
    tags: ['yellow-star', 'system-root'],
  },

  // I. The Hearth
  orbiting({ id: 'estella-i', catalogId: 'Estella I', name: 'Estella I', kind: 'planet', regionId: 'hearth', parentId: ROOT_ID, usage: 'stellar', summary: 'Mercury-like airless inner planet; refractory mining, dark-side habitation, and near-star skim staging.', tags: ['mercury-like', 'airless', 'hot'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  ...stationWithPoi({ stationId: 'estella-i-low-orbit-station', poiId: 'estella-i-transit-customs', catalogId: 'Estella I.1', stationName: 'Estella I Low Orbit Station', poiName: 'Transit, Customs, and Skim Staging', parentId: 'estella-i', regionId: 'hearth', summary: 'Low-orbit transit, customs, and skim staging station.', tags: ['customs', 'transit', 'skim-staging'], economyTags: ['passengers', 'inspection', 'skim-support'] }),
  surfacePoi('estella-i-worker-hab', 'Estella I.2', 'Dark-Side Worker Hab', 'estella-i', 'hearth', 'Sealed and climate-controlled worker habitation on the dark side.', ['sealed-hab', 'dark-side'], ['workers', 'life-support']),
  surfacePoi('estella-i-refractory-mine', 'Estella I.3', 'Terminator Refractory Mine', 'estella-i', 'hearth', 'Heat-tolerant refractory metal mining on the terminator.', ['mine', 'terminator'], ['refractory-metals']),
  surfacePoi('estella-i-hot-processing', 'Estella I.4', 'Terminator Hot Processing', 'estella-i', 'hearth', 'Hot processing and refining facility.', ['refinery', 'terminator'], ['refined-metals']),
  surfacePoi('estella-i-deep-listening', 'Estella I.5', 'Star-Shielded Observatory', 'estella-i', 'hearth', 'Deep-listening observatory shielded from the star.', ['observatory', 'science'], ['science-data']),

  orbiting({ id: 'estella-ii', catalogId: 'Estella II', name: 'Acheron', kind: 'planet', regionId: 'hearth', parentId: ROOT_ID, usage: 'stellar', summary: 'Venus-like world with toxic lower atmosphere, wealthy aerostat cities, and brutal surface extraction.', tags: ['venus-like', 'toxic-atmosphere', 'acheron'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, hasAtmosphere: true }, atmosphere: atmosphere('venuslike-toxic', 'Playable work centers on Olympos and other atmospheric platforms; surface access is extreme/deep-pressure.') }),
  ...stationWithPoi({ stationId: 'estella-ii-commercial-hub', poiId: 'estella-ii-commercial-hub-dock', catalogId: 'Estella II.4', stationName: 'Acheron Commercial Hub', parentId: 'estella-ii', regionId: 'hearth', summary: 'Orbital commercial, customs, and transfer hub over Acheron.', tags: ['commercial', 'customs', 'transit'], economyTags: ['passengers', 'inspection', 'luxury-goods', 'hydrogen'] }),
  orbiting({ id: 'estella-ii-olympos-platform', catalogId: undefined, name: 'Olympos', kind: 'atmospheric-station', regionId: 'hearth', parentId: 'estella-ii', usage: 'low', summary: 'Decadent cloud city in Acheron\'s habitable upper layer.', tags: ['olympos', 'cloud-city', 'luxury', 'atmospheric-platform'], capabilities: { dockable: true, atmosphericPlatform: true }, layoutId: 'cloud-city-exterior', accessPoints: [ap('olympos-dock-a', 'Olympos Dock A', 'docking-berth', ['estella-ii-olympos'], -80, 0, 0), ap('olympos-dock-b', 'Olympos Dock B', 'docking-berth', ['estella-ii-olympos'], 80, 0, Math.PI)] }),
  aboardPoi('estella-ii-olympos', 'Estella II.1', 'Olympos', 'estella-ii-olympos-platform', 'hearth', 'Decadent cloud city in Acheron\'s habitable upper atmosphere; premium passenger and luxury cargo destination.', ['olympos', 'luxury', 'passenger', 'iconic'], ['luxury-goods', 'passengers', 'premium-cargo']),
  orbiting({ id: 'estella-ii-nimbus-crucible-platform', name: 'Nimbus Crucible Platform', kind: 'atmospheric-station', regionId: 'hearth', parentId: 'estella-ii', usage: 'low', summary: 'Acid-cloud aerostat station processing hydrogen sulfide and hosting Union terraforming research.', tags: ['nimbus-crucible', 'science', 'hydrogen', 'acid-clouds', 'atmospheric-platform'], capabilities: { dockable: true, atmosphericPlatform: true }, accessPoints: [ap('nimbus-crucible-dock', 'Nimbus Dock', 'docking-berth', ['estella-ii-nimbus-crucible'])] }),
  aboardPoi('estella-ii-nimbus-crucible', 'Estella II.2', 'Nimbus Crucible', 'estella-ii-nimbus-crucible-platform', 'hearth', 'Deep acid-cloud aerostat and Acheron\'s only economical native hydrogen source.', ['nimbus-crucible', 'science', 'hydrogen', 'acid-clouds'], ['hydrogen', 'science-data', 'instruments']),
  surfacePoi('estella-ii-pandemonium', 'Estella II.3', 'Pandemonium', 'estella-ii', 'hearth', 'Deep-pressure surface penal mining city nominally controlled by Cerberus Human Resources.', ['pandemonium', 'deep-pressure', 'penal-colony', 'hazard'], ['rare-metals', 'pressure-equipment', 'prisoner-transport']),

  orbiting({ id: 'estella-iii', catalogId: 'Estella III', name: 'Gaia', kind: 'planet', regionId: 'hearth', parentId: ROOT_ID, usage: 'stellar', summary: 'Earth-like capital world: old money, government, dense traffic, and breathable atmosphere.', tags: ['earth-like', 'capital', 'civilized', 'gaia'], economyTags: ['consumer-goods', 'electronics', 'pharmaceuticals', 'luxury-goods'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, hasAtmosphere: true, landable: true }, atmosphere: atmosphere('breathable', 'Earth-like breathable atmosphere.') }),
  ...stationWithPoi({ stationId: 'estella-iii-main-customs-station', poiId: 'estella-iii-main-customs', catalogId: 'Estella III.1', stationName: 'Gaia Main Customs Station', poiName: 'Main Customs and Arrival Hub', parentId: 'estella-iii', regionId: 'hearth', summary: 'Main customs and arrival station for Gaia.', tags: ['customs', 'arrival-hub'], economyTags: ['inspection', 'passengers'] }),
  ...stationWithPoi({ stationId: 'estella-iii-luxury-habitat', poiId: 'estella-iii-luxury-orbital-habitat', catalogId: 'Estella III.2', stationName: 'Gaia Luxury Orbital Habitat', parentId: 'estella-iii', regionId: 'hearth', usage: 'high', summary: 'High-orbit luxury habitat over Gaia.', tags: ['luxury', 'habitat'], economyTags: ['luxury-goods', 'passengers'] }),
  surfacePoi('estella-iii-capital-city', 'Estella III.3', 'Capital City Spaceport', 'estella-iii', 'hearth', 'Capital city: passengers, VIPs, government, lobbyists, and taxes.', ['capital', 'government', 'passenger'], ['vip-passengers', 'documents', 'luxury-goods']),
  surfacePoi('estella-iii-finance-city', 'Estella III.4', 'Secondary Finance City', 'estella-iii', 'hearth', 'Secondary major city with finance, commerce, and banking.', ['finance', 'commerce'], ['secure-cargo', 'passengers']),
  surfacePoi('estella-iii-high-tech-city', 'Estella III.5', 'High-Tech Industrial City', 'estella-iii', 'hearth', 'Electronics, optics, and fragile cargo origin.', ['high-tech', 'industrial'], ['electronics', 'optics', 'fragile-cargo']),
  surfacePoi('estella-iii-coastal-resort', 'Estella III.6', 'Coastal Resort', 'estella-iii', 'hearth', 'Passenger destination and luxury cargo site.', ['resort', 'passenger'], ['luxury-goods', 'passengers']),
  surfacePoi('estella-iii-agricultural-region', 'Estella III.7', 'Agricultural Region', 'estella-iii', 'hearth', 'Breadbasket agricultural region.', ['agriculture'], ['bulk-food']),
  surfacePoi('estella-iii-polar-science', 'Estella III.8', 'Polar Science and Weather Research', 'estella-iii', 'hearth', 'Polar science and weather research site.', ['polar', 'science'], ['science-data', 'weather-instruments']),
  surfacePoi('estella-iii-military-spaceport', 'Estella III.9', 'Government/Military Spaceport', 'estella-iii', 'hearth', 'Restricted government and military spaceport.', ['restricted', 'military'], ['classified-cargo']),
  surfacePoi('estella-iii-historic-site', 'Estella III.10', 'Historic First Dome Site', 'estella-iii', 'hearth', 'Historic/cultural pilgrimage site: the first colony\'s first dome.', ['historic', 'pilgrimage'], ['passengers', 'cultural-goods']),

  orbiting({ id: 'estella-iiia', catalogId: 'Estella IIIa', name: 'Estella IIIa', kind: 'moon', regionId: 'hearth', parentId: 'estella-iii', usage: 'moon', summary: 'Large airless moon of Gaia; heritage, helium-3, and early off-world settlement.', tags: ['luna-like', 'airless', 'heritage'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  ...stationWithPoi({ stationId: 'estella-iiia-main-port', poiId: 'estella-iiia-main-port-transit', catalogId: 'Estella IIIa.1', stationName: 'Estella IIIa Main Port', parentId: 'estella-iiia', regionId: 'hearth', summary: 'Main lunar port, transit, and customs.', tags: ['customs', 'transit'], economyTags: ['passengers', 'helium-3'] }),
  surfacePoi('estella-iiia-helium-mining', 'Estella IIIa.2', 'Helium-3 and Regolith Mine', 'estella-iiia', 'hearth', 'Helium-3 and regolith mining site.', ['mine'], ['helium-3', 'regolith']),
  surfacePoi('estella-iiia-science-settlement', 'Estella IIIa.3', 'Lunar Science Settlement', 'estella-iiia', 'hearth', 'Science settlement and observatory.', ['science', 'observatory'], ['science-data']),
  surfacePoi('estella-iiia-heritage-site', 'Estella IIIa.4', 'First Off-World Colony Heritage Site', 'estella-iiia', 'hearth', 'Heritage site marking the first off-world colony.', ['historic', 'heritage'], ['passengers', 'cultural-goods']),

  orbiting({ id: 'estella-iv', catalogId: 'Estella IV', name: 'Dahai', kind: 'planet', regionId: 'hearth', parentId: ROOT_ID, usage: 'stellar', summary: 'Breathable ocean world of archipelagos, marine industry, and weather-shaped settlements.', tags: ['water-world', 'ocean', 'breathable', 'rival-world', 'dahai'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, hasAtmosphere: true, landable: true }, atmosphere: atmosphere('breathable', 'Humid marine atmosphere over a global ocean.') }),
  ...stationWithPoi({ stationId: 'estella-iv-main-station', poiId: 'estella-iv-main-orbital-station', catalogId: 'Estella IV.1', stationName: 'Dahai Main Orbital Station', parentId: 'estella-iv', regionId: 'hearth', summary: 'Main orbital station for Dahai.', tags: ['transit'], economyTags: ['passengers', 'consumer-goods'] }),
  surfacePoi('estella-iv-primary-city', 'Estella IV.2', 'Primary Island Port', 'estella-iv', 'hearth', 'Primary island city and port.', ['city', 'port', 'island'], ['passengers', 'consumer-goods']),
  surfacePoi('estella-iv-climate-poi-1', 'Estella IV.3', 'Archipelago Weather Station', 'estella-iv', 'hearth', 'Storm-watch and climate station across Dahai\'s island chains.', ['weather', 'archipelago'], ['regional-goods', 'weather-instruments']),
  surfacePoi('estella-iv-climate-poi-2', 'Estella IV.4', 'Floating Mariculture Platform', 'estella-iv', 'hearth', 'Oceanic food and biotech platform.', ['mariculture', 'floating-platform'], ['regional-goods', 'bulk-food', 'biotech']),
  surfacePoi('estella-iv-climate-poi-3', 'Estella IV.5', 'Pelagic Research Atoll', 'estella-iv', 'hearth', 'Remote ocean research atoll.', ['science', 'atoll', 'ocean'], ['regional-goods', 'science-data']),

  ...stationWithPoi({ stationId: 'skim-hub-alpha', poiId: 'skim-hub-alpha-precursor-dock', catalogId: 'Skim Hub Alpha', stationName: 'Skim Hub Alpha', parentId: ROOT_ID, regionId: 'hearth', usage: 'very-inner', summary: 'Primary stellar antimatter precursor receiving station and skim crew base.', tags: ['skim-hub', 'guild', 'hazard'], economyTags: ['antimatter-precursor'] }),
  ...stationWithPoi({ stationId: 'skim-hub-beta', poiId: 'skim-hub-beta-precursor-dock', catalogId: 'Skim Hub Beta', stationName: 'Skim Hub Beta', parentId: ROOT_ID, regionId: 'hearth', usage: 'very-inner', summary: 'Secondary/backup stellar antimatter precursor station.', tags: ['skim-hub', 'guild', 'backup'], economyTags: ['antimatter-precursor'] }),
  ...stationWithPoi({ stationId: 'coronal-observation-post', poiId: 'coronal-observation-post-ops', catalogId: 'Coronal Observation Post', stationName: 'Coronal Observation Post', parentId: ROOT_ID, regionId: 'hearth', usage: 'very-inner', summary: 'Innermost coronal observation and endgame operations post.', tags: ['skim-hub', 'science', 'endgame'], economyTags: ['science-data', 'antimatter-precursor'] }),

  // II. The Camps
  orbiting({ id: 'estella-v', catalogId: 'Estella V', name: 'Estella V', kind: 'planet', regionId: 'camps', parentId: ROOT_ID, usage: 'stellar', summary: 'Mars-like industrial planet with thin CO2 atmosphere and dust storms.', tags: ['mars-like', 'thin-atmosphere', 'dust-storms'], economyTags: ['ore', 'refined-goods'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, hasAtmosphere: true, landable: true }, atmosphere: atmosphere('thin-co2', 'Dust storms and thin CO2 atmosphere.') }),
  ...stationWithPoi({ stationId: 'estella-v-transit-station', poiId: 'estella-v-transit-customs', catalogId: 'Estella V.1', stationName: 'Estella V Transit Station', parentId: 'estella-v', regionId: 'camps', summary: 'Transit and customs station.', tags: ['transit', 'customs'] }),
  surfacePoi('estella-v-capital-settlement', 'Estella V.2', 'Capital Settlement', 'estella-v', 'camps', 'Passenger/admin capital settlement.', ['settlement', 'admin'], ['passengers', 'documents']),
  surfacePoi('estella-v-open-cast-mine', 'Estella V.3', 'Open-Cast Ore Mine', 'estella-v', 'camps', 'Open-cast ore mine.', ['mine'], ['ore']),
  surfacePoi('estella-v-atmo-refinery', 'Estella V.4', 'Atmospheric Refining Complex', 'estella-v', 'camps', 'Atmospheric refining and light-industrial complex.', ['refinery', 'industrial'], ['refined-goods', 'industrial-chemicals']),
  surfacePoi('estella-v-storm-research', 'Estella V.5', 'Storm-Prone Research Outpost', 'estella-v', 'camps', 'Research outpost in severe dust-storm territory.', ['science', 'hazard'], ['science-data']),
  surfacePoi('estella-v-abandoned-colony', 'Estella V.6', 'Abandoned Colony', 'estella-v', 'camps', 'Abandoned colony site with salvage potential.', ['abandoned', 'salvage'], ['salvage']),
  ...stationWithPoi({ stationId: 'estella-v-orbital-factory', poiId: 'estella-v-high-orbit-factory', catalogId: 'Estella V.7', stationName: 'Estella V Orbital Factory', parentId: 'estella-v', regionId: 'camps', usage: 'high', summary: 'High-orbit factory.', tags: ['factory'], economyTags: ['manufactured-goods'] }),

  orbiting({ id: 'estella-va', catalogId: 'Estella Va', name: 'Estella Va', kind: 'moon', regionId: 'camps', parentId: 'estella-v', usage: 'moon', summary: 'Small airless moon of Estella V used for ore handling and strip mining.', tags: ['airless', 'moon', 'mining'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  surfacePoi('estella-va-strip-mine', 'Estella Va.1', 'Heavy Ore Strip Mine', 'estella-va', 'camps', 'Heavy ore strip mine.', ['mine'], ['heavy-ore']),
  surfacePoi('estella-va-miner-hab', 'Estella Va.2', 'Miner Hab', 'estella-va', 'camps', 'Miner habitation site.', ['hab'], ['workers', 'life-support']),
  ...stationWithPoi({ stationId: 'estella-va-ore-depot', poiId: 'estella-va-ore-handling-depot', catalogId: 'Estella Va.3', stationName: 'Estella Va Ore-Handling Depot', parentId: 'estella-va', regionId: 'camps', summary: 'Low-orbit ore-handling depot.', tags: ['ore-depot'], economyTags: ['heavy-ore'] }),

  orbiting({ id: 'estella-vi', catalogId: 'Estella VI', name: 'Estella VI', kind: 'planet', regionId: 'camps', parentId: ROOT_ID, usage: 'stellar', summary: 'Mid rocky industrial world with thick cold N2/CO2 atmosphere; the system\'s hard atmospheric flight school.', tags: ['industrial', 'thick-atmosphere', 'flight-school'], economyTags: ['machinery', 'finished-goods', 'bulk-food'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, hasAtmosphere: true, landable: true }, atmosphere: atmosphere('thick-cold', 'Physically demanding civilian atmospheric operations.') }),
  ...stationWithPoi({ stationId: 'estella-vi-main-dispatch', poiId: 'estella-vi-main-transit-dispatch', catalogId: 'Estella VI.1', stationName: 'Estella VI Main Dispatch Station', parentId: 'estella-vi', regionId: 'camps', summary: 'Main transit and dispatch station.', tags: ['dispatch', 'transit'] }),
  ...stationWithPoi({ stationId: 'estella-vi-heavy-cargo-dispatch', poiId: 'estella-vi-heavy-cargo-station', catalogId: 'Estella VI.2', stationName: 'Estella VI Heavy-Cargo Dispatch', parentId: 'estella-vi', regionId: 'camps', usage: 'high', summary: 'High-orbit heavy-cargo dispatch station.', tags: ['heavy-cargo'], economyTags: ['machinery', 'bulk-cargo'] }),
  surfacePoi('estella-vi-industrial-city', 'Estella VI.3', 'Industrial City', 'estella-vi', 'camps', 'Machinery and finished-goods industrial city.', ['industrial', 'city'], ['machinery', 'finished-goods']),
  surfacePoi('estella-vi-foundry-complex', 'Estella VI.4', 'Foundry Complex', 'estella-vi', 'camps', 'Smelting and heavy refining complex: the industrial hub.', ['foundry', 'refinery'], ['smelted-metals', 'heavy-machinery']),
  surfacePoi('estella-vi-spaceport', 'Estella VI.5', 'Weather-Gated Spaceport', 'estella-vi', 'camps', 'Passenger and bulk-food dispatch spaceport; weather-gated.', ['spaceport', 'weather-gated'], ['passengers', 'bulk-food']),
  surfacePoi('estella-vi-agricultural-lowlands', 'Estella VI.6', 'Agricultural Lowlands', 'estella-vi', 'camps', 'Bulk food agricultural lowlands.', ['agriculture'], ['bulk-food']),
  surfacePoi('estella-vi-polar-weather-research', 'Estella VI.7', 'Polar Weather Research', 'estella-vi', 'camps', 'Polar weather research site.', ['science', 'polar'], ['science-data']),
  surfacePoi('estella-vi-mountain-mining', 'Estella VI.8', 'Mountain Mining Site', 'estella-vi', 'camps', 'Specialty ore mountain mining site with hard-pad, high-altitude operations.', ['mine', 'mountain', 'hard-pad'], ['specialty-ore']),

  orbiting({ id: 'estella-via', catalogId: 'Estella VIa', name: 'Estella VIa', kind: 'moon', regionId: 'camps', parentId: 'estella-vi', usage: 'moon', summary: 'Small airless shipyard moon.', tags: ['airless', 'shipyard'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  ...stationWithPoi({ stationId: 'estella-via-drydock', poiId: 'estella-via-drydock-station', catalogId: 'Estella VIa.1', stationName: 'Estella VIa Drydock', parentId: 'estella-via', regionId: 'camps', summary: 'Low-orbit drydock and shipyard.', tags: ['drydock', 'shipyard'], economyTags: ['ship-components', 'repairs'] }),
  ...stationWithPoi({ stationId: 'estella-via-component-supply', poiId: 'estella-via-component-supply-station', catalogId: 'Estella VIa.2', stationName: 'Estella VIa Component Supply', parentId: 'estella-via', regionId: 'camps', usage: 'high', summary: 'High-orbit component supply station.', tags: ['components'], economyTags: ['ship-components'] }),
  surfacePoi('estella-via-surface-anchor', 'Estella VIa.3', 'Drydock Surface Anchor', 'estella-via', 'camps', 'Surface anchor and staff habitation for drydock operations.', ['drydock', 'hab'], ['workers', 'ship-components']),
  surfacePoi('estella-via-rare-alloy-extraction', 'Estella VIa.4', 'Rare Alloy Extraction', 'estella-via', 'camps', 'Rare alloy extraction site.', ['mine'], ['rare-alloys']),

  orbiting({ id: 'estella-vib', catalogId: 'Estella VIb', name: 'Estella VIb', kind: 'moon', regionId: 'camps', parentId: 'estella-vi', usage: 'moon', summary: 'Small airless specialty/pharma moon.', tags: ['airless', 'pharma', 'specialty'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  ...stationWithPoi({ stationId: 'estella-vib-cold-chain-transit', poiId: 'estella-vib-cold-chain-station', catalogId: 'Estella VIb.1', stationName: 'Estella VIb Cold-Chain Transit', parentId: 'estella-vib', regionId: 'camps', summary: 'Cold-chain transit station.', tags: ['cold-chain'], economyTags: ['pharmaceuticals', 'perishables'] }),
  surfacePoi('estella-vib-vat-protein', 'Estella VIb.2', 'Biotech / Vat-Protein Primary', 'estella-vib', 'camps', 'Biotech and vat-protein primary site.', ['biotech'], ['vat-protein', 'biotech']),
  surfacePoi('estella-vib-pharma-horticulture', 'Estella VIb.3', 'Pharmaceutical Horticulture', 'estella-vib', 'camps', 'Pharmaceutical and specialty horticulture site.', ['pharma', 'horticulture'], ['pharmaceuticals', 'specialty-crops']),
  surfacePoi('estella-vib-aquaculture', 'Estella VIb.4', 'Boutique Aquaculture', 'estella-vib', 'camps', 'Boutique luxury aquaculture.', ['aquaculture', 'luxury'], ['luxury-food']),

  orbiting({ id: 'estella-vii', catalogId: 'Estella VII', name: 'Estella VII', kind: 'planet', regionId: 'camps', parentId: ROOT_ID, usage: 'stellar', summary: 'Small airless rocky precision-ops planet.', tags: ['airless', 'precision-ops'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  ...stationWithPoi({ stationId: 'estella-vii-transit-station', poiId: 'estella-vii-transit-export', catalogId: 'Estella VII.1', stationName: 'Estella VII Transit / Export Station', parentId: 'estella-vii', regionId: 'camps', summary: 'Transit and export station.', tags: ['transit', 'export'] }),
  surfacePoi('estella-vii-high-vacuum-factory', 'Estella VII.2', 'High-Vacuum Precision Factory', 'estella-vii', 'camps', 'High-vacuum precision factory.', ['factory', 'high-vacuum'], ['precision-parts']),
  surfacePoi('estella-vii-feedstock-mine', 'Estella VII.3', 'Specialty Feedstock Mine', 'estella-vii', 'camps', 'Specialty feedstock mine.', ['mine'], ['specialty-feedstock']),
  surfacePoi('estella-vii-worker-hab', 'Estella VII.4', 'Worker Hab', 'estella-vii', 'camps', 'Worker habitation.', ['hab'], ['workers', 'life-support']),
  surfacePoi('estella-vii-black-project-outpost', 'Estella VII.5', 'Sealed Research Outpost', 'estella-vii', 'camps', 'Sealed research outpost with black-project rumors.', ['science', 'restricted', 'rumor'], ['classified-cargo', 'science-data']),

  // III. The Belt
  cluster({ id: 'belt-cluster-near', name: 'Cluster 1 — The Near', regionId: 'belt', parentId: ROOT_ID, usage: 'co-orbital', summary: 'Co-orbital with the Caravanserai; first-contract rocks and beginner work.', tags: ['belt-cluster', 'open', 'home-base-cluster'] }),
  cluster({ id: 'belt-cluster-working', name: 'Cluster 2 — The Working', regionId: 'belt', parentId: ROOT_ID, usage: 'co-orbital', summary: 'Active industrial mid-Belt cluster.', tags: ['belt-cluster', 'open'], gameplayTags: ['unexpanded-container'] }),
  cluster({ id: 'belt-cluster-outer-drift', name: 'Cluster 3 — The Outer Drift', regionId: 'belt', parentId: ROOT_ID, usage: 'co-orbital', summary: 'Sparser, more varied Belt cluster with longer transfers.', tags: ['belt-cluster', 'open'] }),
  cluster({ id: 'belt-cluster-wreckage-field', name: 'Cluster 4 — The Wreckage Field', regionId: 'belt', parentId: ROOT_ID, usage: 'eccentric', summary: 'Dense eccentric-orbit field with navigation hazard and salvage flavor; license-gated.', tags: ['belt-cluster', 'salvage', 'hazard'], gameplayTags: ['unexpanded-container', 'salvage-license-required'] }),
  cluster({ id: 'belt-cluster-quiet-side', name: 'Cluster 5 — The Quiet Side', regionId: 'belt', parentId: ROOT_ID, usage: 'outer', summary: 'Outer co-planar cluster with smuggler dead-drops and reputation-gated rare work.', tags: ['belt-cluster', 'smuggling', 'reputation-gated'] }),

  clusterMember({ id: 'caravanserai', catalogId: 'ES-C-0001', name: 'The Caravanserai', kind: 'asteroid', regionId: 'belt', parentId: 'belt-cluster-near', x: 0, y: 0, summary: 'Massive industrial-civic asteroid; home base, Highliner port, player hangar of record, and system contract hub.', tags: ['home-base', 'highliner-port', 'mission-board', 'guild-presence'], economyTags: ['contracts', 'fuel', 'services'], layoutId: 'caravanserai-exterior', accessPoints: [ap('caravanserai-commercial-berth-a', 'Commercial Berth A', 'docking-berth', ['caravanserai-main-commercial-dock'], -160, 20, 0), ap('caravanserai-player-hangar-bay', 'Player Hangar Bay', 'hangar-bay', ['caravanserai-player-hangar'], -80, -40, 0), ap('caravanserai-highliner-bay', 'Highliner Bay', 'highliner-berth', ['caravanserai-highliner-bay-poi'], 220, 0, Math.PI), ap('caravanserai-outfitter-dock', 'Outfitter Dock', 'cargo-bay', ['caravanserai-outfitter-drydock'], 80, -80, Math.PI / 2)] }),
  aboardPoi('caravanserai-main-commercial-dock', 'ES-C-0001.1', 'Main Commercial Dock', 'caravanserai', 'belt', 'Mission board, refuel, and light services.', ['dock', 'mission-board'], ['contracts', 'fuel', 'light-service']),
  aboardPoi('caravanserai-player-hangar', 'ES-C-0001.2', 'Player Hangar', 'caravanserai', 'belt', 'Bay rental and light repair; player hangar of record.', ['home-base', 'hangar'], ['repairs', 'storage']),
  aboardPoi('caravanserai-highliner-bay-poi', 'ES-C-0001.3', 'Highliner Bay', 'caravanserai', 'belt', 'Massive bay active during Eras; premium direct-Highliner missions.', ['highliner', 'era-event'], ['premium-cargo', 'immigrants']),
  aboardPoi('caravanserai-outfitter-drydock', 'ES-C-0001.4', 'Outfitter / Drydock', 'caravanserai', 'belt', 'Hulls, electronics, life support, cargo systems, and weapons.', ['outfitter', 'drydock'], ['upgrades', 'ship-components']),
  aboardPoi('caravanserai-certification-authority', 'ES-C-0001.5', 'Certification Authority', 'caravanserai', 'belt', 'Guild-administered Teamster certifications.', ['guild', 'certification'], ['certifications']),
  aboardPoi('caravanserai-refuel-depot', 'ES-C-0001.6', 'Refinery / Refuel Depot', 'caravanserai', 'belt', 'Local fuel sales and refuel depot.', ['fuel'], ['fuel']),
  aboardPoi('caravanserai-foreign-quarter', 'ES-C-0001.7', 'Foreign Quarter', 'caravanserai', 'belt', 'Era-flavored social space, faction NPCs, rumors, and side jobs.', ['social', 'factions', 'era-event'], ['rumors', 'passengers']),
  aboardPoi('caravanserai-customs-inspection', 'ES-C-0001.8', 'Customs / Inspection Bay', 'caravanserai', 'belt', 'Inspection bay that can route jobs or complicate them.', ['customs', 'inspection'], ['inspection']),
  aboardPoi('caravanserai-free-trader-anchorage', 'ES-C-0001.9', 'Free Trader Anchorage', 'caravanserai', 'belt', 'Independent freighters, rumor mill, and off-board jobs.', ['free-trader', 'rumors'], ['contracts', 'rumors']),
  aboardPoi('caravanserai-lookout-spire', 'ES-C-0001.10', 'Lookout Spire', 'caravanserai', 'belt', 'Atmospheric lookout where Era arrivals are announced.', ['lookout', 'era-event'], ['tourists', 'rumors']),

  clusterMember({ id: 'the-still', catalogId: 'ES-M-0001', name: 'The Still', kind: 'asteroid', regionId: 'belt', parentId: 'belt-cluster-near', x: 42000, y: -18000, summary: 'Metallic asteroid dominated by the Teamsters\' Guild fuel synthesis operation; restricted and strategic.', tags: ['guild', 'fuel-refinery', 'restricted', 'strategic'], economyTags: ['fuel', 'antimatter-precursor'], layoutId: 'still-exterior', accessPoints: [ap('still-public-berth-a', 'Public Berth A', 'docking-berth', ['still-public-approach-dock'], -120, 30, 0), ap('still-distribution-clamp-1', 'Distribution Clamp 1', 'cargo-bay', ['still-distribution-bay'], 120, -20, Math.PI), ap('still-skim-runner-berth', 'Skim-Runner Berth', 'cargo-bay', ['still-skim-runner-berth-poi'], 0, 140, -Math.PI / 2)] }),
  aboardPoi('still-public-approach-dock', 'ES-M-0001.1', 'Public Approach Dock', 'the-still', 'belt', 'Civilian fuel sales, customs, and the only place most Teamsters see on the Still.', ['public', 'customs', 'fuel'], ['fuel', 'inspection']),
  aboardPoi('still-guild-hq', 'ES-M-0001.2', 'Guild HQ', 'the-still', 'belt', 'Faction headquarters and alternative certification/upgrade authority for high-rep Guild members.', ['guild', 'hq', 'restricted'], ['certifications', 'upgrades']),
  aboardPoi('still-refinery-core', 'ES-M-0001.3', 'Refinery Core', 'the-still', 'belt', 'Restricted synthesis facility; most Teamsters never see this.', ['restricted', 'refinery-core'], ['fuel']),
  aboardPoi('still-distribution-bay', 'ES-M-0001.4', 'Distribution Bay', 'the-still', 'belt', 'Guild-licensed bay where fuel canisters are loaded for system-wide distribution.', ['guild-licensed', 'cargo'], ['fuel-canisters']),
  aboardPoi('still-worker-hab', 'ES-M-0001.5', 'Worker Hab / Foreign Quarter', 'the-still', 'belt', 'Refiner workforce habitation and rumor mill.', ['hab', 'social'], ['workers', 'rumors']),
  aboardPoi('still-skim-runner-berth-poi', 'ES-M-0001.6', 'Skim-Runner Berth', 'the-still', 'belt', 'Berth where Hearth skim ships deliver precursor canisters.', ['skim-runner', 'guild'], ['antimatter-precursor']),

  clusterMember({ id: 'prospect-rock-es-c-0101', catalogId: 'ES-C-0101', name: 'Prospect Rock', kind: 'asteroid', regionId: 'belt', parentId: 'belt-cluster-near', x: -26000, y: 22000, summary: 'Small carbonaceous first-contract prospecting rock in the Near Belt.', tags: ['prospecting', 'first-contract', 'small-asteroid'], economyTags: ['ore', 'local-goods'], layoutId: 'small-asteroid-dock' }),
  aboardPoi('prospect-rock-main-dock', 'ES-C-0101.1', 'Prospector Dock', 'prospect-rock-es-c-0101', 'belt', 'Single dock for prospectors, claim crews, and beginner Belt work.', ['dock', 'prospecting'], ['ore', 'supplies']),

  clusterMember({ id: 'survey-rock-es-s-0101', catalogId: 'ES-S-0101', name: 'Survey Rock', kind: 'asteroid', regionId: 'belt', parentId: 'belt-cluster-near', x: 24000, y: 33000, summary: 'Small stony survey and beacon-maintenance asteroid in the Near Belt.', tags: ['survey', 'beacon', 'small-asteroid'], economyTags: ['science-data', 'local-goods'], layoutId: 'small-asteroid-dock' }),
  aboardPoi('survey-rock-beacon-dock', 'ES-S-0101.1', 'Beacon Dock', 'survey-rock-es-s-0101', 'belt', 'Single service dock for survey crews and traffic-beacon maintenance.', ['dock', 'survey', 'beacon'], ['science-data', 'supplies']),

  clusterMember({ id: 'industrial-refinery-asteroid-es-m-0002', catalogId: 'ES-M-0002', name: 'Industrial Refinery Asteroid', kind: 'asteroid', regionId: 'belt', parentId: 'belt-cluster-working', x: -24000, y: 31000, summary: 'Bulk processor slowly eating its metallic host; origin of the Belt-to-Camps ore corridor.', tags: ['refinery', 'industrial'], economyTags: ['ore', 'finished-goods'], layoutId: 'industrial-refinery-asteroid' }),
  aboardPoi('industrial-refinery-ore-intake', 'ES-M-0002.1', 'Ore Intake Dock', 'industrial-refinery-asteroid-es-m-0002', 'belt', 'Bulk ore receive dock.', ['dock'], ['ore']),
  aboardPoi('industrial-refinery-finished-goods', 'ES-M-0002.2', 'Finished Goods Bay', 'industrial-refinery-asteroid-es-m-0002', 'belt', 'Bulk finished goods dispatch bay.', ['cargo'], ['finished-goods']),
  aboardPoi('industrial-refinery-staff-hab', 'ES-M-0002.3', 'Staff Hab', 'industrial-refinery-asteroid-es-m-0002', 'belt', 'Surface/interior staff habitation.', ['hab'], ['workers']),

  clusterMember({ id: 'casino-asteroid-es-c-0002', catalogId: 'ES-C-0002', name: 'Casino Asteroid', kind: 'asteroid', regionId: 'belt', parentId: 'belt-cluster-quiet-side', x: 15000, y: 52000, summary: 'Shady casino asteroid where legal vice overlays fenced goods, deniable meetings, and disappearances.', tags: ['casino', 'vice', 'smuggling'], economyTags: ['luxury-goods', 'fenced-goods'], layoutId: 'casino-asteroid' }),
  aboardPoi('casino-concourse', 'ES-C-0002.1', 'The Concourse', 'casino-asteroid-es-c-0002', 'belt', 'Legal vice, expensive resort, and dazzling main dock.', ['casino', 'resort'], ['luxury-goods', 'passengers']),
  aboardPoi('casino-backstairs-bay', 'ES-C-0002.2', 'Backstairs Bay', 'casino-asteroid-es-c-0002', 'belt', 'Known-but-quiet criminal hideout and fenced goods bay.', ['criminal', 'smuggling'], ['fenced-goods']),
  aboardPoi('casino-private-berth', 'ES-C-0002.3', 'Private Berth', 'casino-asteroid-es-c-0002', 'belt', 'VIP/anonymous dock where faction politics happen.', ['vip', 'anonymous'], ['vip-passengers', 'deniable-cargo']),

  clusterMember({ id: 'science-asteroid-es-s-0001', catalogId: 'ES-S-0001', name: 'Science / Observation Asteroid', kind: 'asteroid', regionId: 'belt', parentId: 'belt-cluster-outer-drift', x: -52000, y: -9000, summary: 'Quiet stony asteroid for long-baseline observation and edge science.', tags: ['science', 'observatory', 'off-grid'], economyTags: ['science-data'], layoutId: 'science-observation-asteroid' }),
  aboardPoi('science-asteroid-main-observatory-dock', 'ES-S-0001.1', 'Main Observatory Dock', 'science-asteroid-es-s-0001', 'belt', 'Civilian-accessible observatory dock.', ['science', 'dock'], ['science-data']),
  aboardPoi('science-asteroid-listening-array', 'ES-S-0001.2', 'Listening Array', 'science-asteroid-es-s-0001', 'belt', 'Restricted deep-listening array.', ['restricted', 'listening-array'], ['science-data']),
  aboardPoi('science-asteroid-sealed-research', 'ES-S-0001.3', 'Sealed Research Outpost', 'science-asteroid-es-s-0001', 'belt', 'Restricted sealed research outpost.', ['restricted', 'science'], ['classified-cargo', 'science-data']),

  orbiting({ id: 'estella-viii', catalogId: 'Estella VIII', name: 'Estella VIII', kind: 'dwarf-planet', regionId: 'belt', parentId: ROOT_ID, usage: 'stellar', summary: 'Friendly settled dwarf planet; first proper orbital-body training in the Belt.', tags: ['dwarf-planet', 'training', 'airless'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  ...stationWithPoi({ stationId: 'estella-viii-friendly-station', poiId: 'estella-viii-first-rendezvous-station', catalogId: 'Estella VIII.1', stationName: 'Estella VIII Friendly Station', parentId: 'estella-viii', regionId: 'belt', summary: 'Friendly first-rendezvous station.', tags: ['training', 'rendezvous'] }),
  ...stationWithPoi({ stationId: 'estella-viii-high-station', poiId: 'estella-viii-harder-approach-station', catalogId: 'Estella VIII.2', stationName: 'Estella VIII Higher Orbit Station', parentId: 'estella-viii', regionId: 'belt', usage: 'high', summary: 'Higher-orbit station with harder approach and more cargo.', tags: ['rendezvous', 'higher-orbit'] }),
  surfacePoi('estella-viii-settlement', 'Estella VIII.3', 'Civic Settlement', 'estella-viii', 'belt', 'Small civic settlement.', ['settlement'], ['passengers', 'local-goods']),
  surfacePoi('estella-viii-mining-site', 'Estella VIII.4', 'Mining Site', 'estella-viii', 'belt', 'Airless dwarf mining site.', ['mine'], ['ore']),
  orbiting({ id: 'estella-viii-captured-moonlet', catalogId: 'Estella VIII.5', name: 'Estella VIII Captured Moonlet', kind: 'asteroid', regionId: 'belt', parentId: 'estella-viii', usage: 'moon', summary: 'Captured moonlet with a single docking site.', tags: ['captured', 'dock-only'], capabilities: { dockable: true, dockOnly: true }, accessPoints: [ap('estella-viii-moonlet-dock', 'Moonlet Dock', 'docking-berth', ['estella-viii-moonlet-docking-site'])] }),
  aboardPoi('estella-viii-moonlet-docking-site', 'Estella VIII.5.1', 'Captured Moonlet Docking Site', 'estella-viii-captured-moonlet', 'belt', 'Single docking site on Estella VIII captured moonlet.', ['dock-only'], ['local-goods']),
  surfacePoi('estella-viii-abandoned-site', 'Estella VIII.6', 'Abandoned Site', 'estella-viii', 'belt', 'Abandoned site with salvage potential.', ['abandoned', 'salvage'], ['salvage']),

  orbiting({ id: 'estella-ix', catalogId: 'Estella IX', name: 'Estella IX', kind: 'dwarf-planet', regionId: 'belt', parentId: ROOT_ID, usage: 'stellar', summary: 'Icy scientific dwarf planet with small SOI and less development.', tags: ['dwarf-planet', 'icy', 'science'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  ...stationWithPoi({ stationId: 'estella-ix-research-station', poiId: 'estella-ix-low-orbit-research-station', catalogId: 'Estella IX.1', stationName: 'Estella IX Research Station', parentId: 'estella-ix', regionId: 'belt', summary: 'Low-orbit research station.', tags: ['science'], economyTags: ['science-data'] }),
  ...stationWithPoi({ stationId: 'estella-ix-supply-depot', poiId: 'estella-ix-opposite-sense-supply-depot', catalogId: 'Estella IX.2', stationName: 'Estella IX Supply Depot', parentId: 'estella-ix', regionId: 'belt', summary: 'Opposite-sense orbit supply depot.', tags: ['supply-depot', 'opposite-sense'], economyTags: ['supplies'] }),
  surfacePoi('estella-ix-research-base', 'Estella IX.3', 'Research Base', 'estella-ix', 'belt', 'Icy dwarf research base.', ['science'], ['science-data']),
  surfacePoi('estella-ix-ice-mine', 'Estella IX.4', 'Ice Mine', 'estella-ix', 'belt', 'Ice mine.', ['mine', 'ice'], ['ice', 'volatiles']),
  orbiting({ id: 'estella-ix-captured-moonlet', catalogId: 'Estella IX.5', name: 'Estella IX Captured Moonlet', kind: 'asteroid', regionId: 'belt', parentId: 'estella-ix', usage: 'moon', summary: 'Captured moonlet observation outpost.', tags: ['captured', 'science'], capabilities: { dockable: true, dockOnly: true }, accessPoints: [ap('estella-ix-moonlet-dock', 'Observation Dock', 'docking-berth', ['estella-ix-moonlet-observation-outpost'])] }),
  aboardPoi('estella-ix-moonlet-observation-outpost', 'Estella IX.5.1', 'Observation Outpost', 'estella-ix-captured-moonlet', 'belt', 'Observation outpost on captured moonlet.', ['science'], ['science-data']),
  surfacePoi('estella-ix-geological-feature', 'Estella IX.6', 'Geological Feature', 'estella-ix', 'belt', 'Lore-bearing geological feature.', ['geology', 'lore'], ['science-data']),

  // IV. The Wells
  orbiting({ id: 'estella-x', catalogId: 'Estella X', name: 'Estella X', kind: 'gas-giant', regionId: 'wells', parentId: ROOT_ID, usage: 'stellar', summary: 'Warm inner giant, Saturn-flavored and friendliest of the Wells.', tags: ['gas-giant', 'warm-inner-giant'], capabilities: { hasGravityWell: true, hasSOI: true, hasAtmosphere: true, skimOnly: true }, atmosphere: atmosphere('gas-giant', 'Upper-atmosphere skim only; not landable.', true) }),
  ...stationWithPoi({ stationId: 'estella-x-skim-hub', poiId: 'estella-x-observation-skim-hub', catalogId: 'Estella X.1', stationName: 'Estella X Skim Hub / Observation', parentId: 'estella-x', regionId: 'wells', summary: 'Orbital skim hub and observation site.', tags: ['skim-hub', 'observation'], economyTags: ['industrial-gas'] }),
  orbiting({ id: 'estella-xa', catalogId: 'Estella Xa', name: 'Estella Xa', kind: 'moon', regionId: 'wells', parentId: 'estella-x', usage: 'moon', summary: 'Ice moon with subsurface ocean and airless surface.', tags: ['ice-moon', 'airless', 'subsurface-ocean'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  surfacePoi('estella-xa-volatiles-transit', 'Estella Xa.1', 'Volatiles Transit', 'estella-xa', 'wells', 'Volatiles transit site.', ['volatiles'], ['volatiles', 'water']),
  surfacePoi('estella-xa-deep-ice-mine', 'Estella Xa.2', 'Deep Ice / Water Mine', 'estella-xa', 'wells', 'Deep ice and water mine.', ['mine', 'ice'], ['water', 'ice']),
  surfacePoi('estella-xa-exobiology-research', 'Estella Xa.3', 'Sealed Exobiology Research', 'estella-xa', 'wells', 'Sealed exobiology research site.', ['science', 'restricted'], ['science-data', 'biological-samples']),
  orbiting({ id: 'estella-xb', catalogId: 'Estella Xb', name: 'Estella Xb', kind: 'moon', regionId: 'wells', parentId: 'estella-x', usage: 'moon', summary: 'Rocky airless moon with rare-element mining and smelting.', tags: ['rocky-moon', 'airless'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  surfacePoi('estella-xb-rare-element-mine', 'Estella Xb.1', 'Rare-Element Strip Mine', 'estella-xb', 'wells', 'Rare-element strip mine.', ['mine'], ['rare-elements']),
  surfacePoi('estella-xb-smelting-processing', 'Estella Xb.2', 'Smelting / Hot Processing', 'estella-xb', 'wells', 'Smelting and hot processing site.', ['smelter'], ['processed-ore']),
  surfacePoi('estella-xb-worker-hab', 'Estella Xb.3', 'Worker Hab', 'estella-xb', 'wells', 'Worker habitation.', ['hab'], ['workers', 'life-support']),
  orbiting({ id: 'estella-xc', catalogId: 'Estella Xc', name: 'Estella Xc', kind: 'moon', regionId: 'wells', parentId: 'estella-x', usage: 'moon', summary: 'Small airless moon with main outpost and transit/refuel station.', tags: ['small-moon', 'airless', 'services'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  surfacePoi('estella-xc-main-outpost', 'Estella Xc.1', 'Main Outpost / Services', 'estella-xc', 'wells', 'Main outpost and services site.', ['outpost', 'services'], ['supplies', 'repairs']),
  ...stationWithPoi({ stationId: 'estella-xc-transit-refuel-station', poiId: 'estella-xc-transit-refuel', catalogId: 'Estella Xc.2', stationName: 'Estella Xc Transit / Refuel Station', parentId: 'estella-xc', regionId: 'wells', summary: 'Transit and refuel station.', tags: ['transit', 'refuel'], economyTags: ['fuel', 'supplies'] }),
  orbiting({ id: 'estella-xd', catalogId: 'Estella Xd', name: 'Estella Xd', kind: 'moon', regionId: 'wells', parentId: 'estella-x', usage: 'moon', summary: 'Tidally heated rocky airless moon.', tags: ['tidal-heating', 'rocky-moon', 'airless'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  surfacePoi('estella-xd-geothermal-extraction', 'Estella Xd.1', 'Geothermal Extraction', 'estella-xd', 'wells', 'Geothermal extraction site.', ['geothermal'], ['industrial-energy', 'minerals']),
  ...stationWithPoi({ stationId: 'estella-xd-orbital-chem-station', poiId: 'estella-xd-chem-station', catalogId: 'Estella Xd.2', stationName: 'Estella Xd Orbital Chem Station', parentId: 'estella-xd', regionId: 'wells', summary: 'Orbital chemical processing station.', tags: ['chemistry'], economyTags: ['industrial-chemicals'] }),
  cluster({ id: 'estella-x-captives', name: 'Estella X Captives', regionId: 'wells', parentId: 'estella-x', usage: 'co-orbital', summary: 'Trojan/captured docking-only asteroid(s) in Estella X\'s SOI.', tags: ['captives', 'dock-only'] }),
  clusterMember({ id: 'estella-x-trojan-captive', catalogId: 'ES-C-X-0001', name: 'Estella X Trojan Captive', kind: 'asteroid', regionId: 'wells', parentId: 'estella-x-captives', x: 0, y: 0, summary: 'Trojan asteroid waypoint for refuel and comm relay.', tags: ['trojan', 'waypoint'], economyTags: ['fuel', 'communications'] }),
  aboardPoi('estella-x-captive-refuel-relay', 'ES-C-X-0001.1', 'Refuel / Comm Relay Waypoint', 'estella-x-trojan-captive', 'wells', 'Docking waypoint with refuel and comm relay.', ['dock-only', 'waypoint'], ['fuel', 'communications']),

  orbiting({ id: 'estella-xi', catalogId: 'Estella XI', name: 'Estella XI', kind: 'gas-giant', regionId: 'wells', parentId: ROOT_ID, usage: 'stellar', summary: 'Big Jupiter-flavored giant: largest, busiest, and most exotic of the Wells.', tags: ['gas-giant', 'big-giant', 'busy'], capabilities: { hasGravityWell: true, hasSOI: true, hasAtmosphere: true, skimOnly: true }, atmosphere: atmosphere('gas-giant', 'Upper-atmosphere skim possible.', true) }),
  ...stationWithPoi({ stationId: 'estella-xi-industrial-skim-hub', poiId: 'estella-xi-skim-hub', catalogId: 'Estella XI.1', stationName: 'Estella XI Industrial Skim Hub', parentId: 'estella-xi', regionId: 'wells', summary: 'Industrial gas skim hub.', tags: ['skim-hub'], economyTags: ['industrial-gas'] }),
  ...stationWithPoi({ stationId: 'estella-xi-observation-transit-nexus', poiId: 'estella-xi-observation-nexus', catalogId: 'Estella XI.2', stationName: 'Estella XI Observation / Transit Nexus', parentId: 'estella-xi', regionId: 'wells', summary: 'Observation and transit nexus.', tags: ['observation', 'transit'], economyTags: ['science-data', 'passengers'] }),
  orbiting({ id: 'estella-xia', catalogId: 'Estella XIa', name: 'Estella XIa', kind: 'moon', regionId: 'wells', parentId: 'estella-xi', usage: 'moon', summary: 'Sulfur volcanic hostile moon with thin SO2 atmosphere.', tags: ['sulfur', 'volcanic', 'hostile'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, hasAtmosphere: true, landable: true }, atmosphere: atmosphere('thin-so2', 'Thin hostile SO2 atmosphere.') }),
  surfacePoi('estella-xia-sulfur-mine', 'Estella XIa.1', 'Sulfur Mine', 'estella-xia', 'wells', 'Sulfur mine.', ['mine', 'sulfur'], ['sulfur']),
  ...stationWithPoi({ stationId: 'estella-xia-orbital-chem-station', poiId: 'estella-xia-chem-station', catalogId: 'Estella XIa.2', stationName: 'Estella XIa Orbital Chem Station', parentId: 'estella-xia', regionId: 'wells', summary: 'Orbital chemical station.', tags: ['chemistry'], economyTags: ['industrial-chemicals'] }),
  surfacePoi('estella-xia-sealed-worker-hab', 'Estella XIa.3', 'Sealed Worker Hab', 'estella-xia', 'wells', 'Sealed worker habitation.', ['hab', 'sealed'], ['workers', 'life-support']),
  surfacePoi('estella-xia-rare-element-extraction', 'Estella XIa.4', 'Specialty Rare-Element Extraction', 'estella-xia', 'wells', 'Specialty rare-element extraction site.', ['mine'], ['rare-elements']),
  orbiting({ id: 'estella-xib', catalogId: 'Estella XIb', name: 'Estella XIb', kind: 'moon', regionId: 'wells', parentId: 'estella-xi', usage: 'moon', summary: 'Methane/nitrogen moon with thick cold methane atmosphere.', tags: ['methane', 'thick-atmosphere', 'cryo'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, hasAtmosphere: true, landable: true }, atmosphere: atmosphere('methane-nitrogen', 'Thick cold methane/nitrogen atmosphere.') }),
  surfacePoi('estella-xib-cryo-transit', 'Estella XIb.1', 'Cryo Transit', 'estella-xib', 'wells', 'Cryogenic transit site.', ['cryo', 'transit'], ['cryogenic-cargo']),
  surfacePoi('estella-xib-methane-refinery', 'Estella XIb.2', 'Methane Refinery', 'estella-xib', 'wells', 'Methane refinery.', ['refinery', 'methane'], ['methane']),
  surfacePoi('estella-xib-organic-chemistry', 'Estella XIb.3', 'Organic Chemistry Plant', 'estella-xib', 'wells', 'Organic chemistry plant.', ['chemistry'], ['organic-chemicals']),
  surfacePoi('estella-xib-hydrocarbon-extraction', 'Estella XIb.4', 'Hydrocarbon Extraction', 'estella-xib', 'wells', 'Hydrocarbon extraction site.', ['extraction'], ['hydrocarbons']),
  surfacePoi('estella-xib-science-settlement', 'Estella XIb.5', 'Science Settlement', 'estella-xib', 'wells', 'Science settlement.', ['science', 'settlement'], ['science-data']),
  orbiting({ id: 'estella-xic', catalogId: 'Estella XIc', name: 'Estella XIc', kind: 'moon', regionId: 'wells', parentId: 'estella-xi', usage: 'moon', summary: 'Ice moon with subsurface ocean and airless surface.', tags: ['ice-moon', 'airless'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  ...stationWithPoi({ stationId: 'estella-xic-research-station', poiId: 'estella-xic-research-station-poi', catalogId: 'Estella XIc.1', stationName: 'Estella XIc Research Station', parentId: 'estella-xic', regionId: 'wells', summary: 'Research station.', tags: ['science'], economyTags: ['science-data'] }),
  surfacePoi('estella-xic-deep-ice-exobiology', 'Estella XIc.2', 'Sealed Deep-Ice Exobiology', 'estella-xic', 'wells', 'Sealed deep-ice exobiology site.', ['science', 'restricted'], ['biological-samples', 'science-data']),
  surfacePoi('estella-xic-ice-mining', 'Estella XIc.3', 'Ice Mining', 'estella-xic', 'wells', 'Ice mining site.', ['mine', 'ice'], ['ice', 'water']),
  orbiting({ id: 'estella-xid', catalogId: 'Estella XId', name: 'Estella XId', kind: 'moon', regionId: 'wells', parentId: 'estella-xi', usage: 'moon', summary: 'Mid-size rocky airless moon; Wells region hub and service center.', tags: ['rocky-moon', 'hub', 'airless'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  ...stationWithPoi({ stationId: 'estella-xid-main-port-station', poiId: 'estella-xid-main-port', catalogId: 'Estella XId.1', stationName: 'Estella XId Main Port Station', parentId: 'estella-xid', regionId: 'wells', summary: 'Main port station and Wells region hub.', tags: ['hub', 'main-port'], economyTags: ['passengers', 'contracts'] }),
  surfacePoi('estella-xid-services-outfitter-hangar', 'Estella XId.2', 'Services / Outfitter / Hangar', 'estella-xid', 'wells', 'Services, outfitter, and hangar site.', ['services', 'outfitter'], ['repairs', 'upgrades']),
  surfacePoi('estella-xid-customs-transit', 'Estella XId.3', 'Customs / Transit', 'estella-xid', 'wells', 'Customs and transit site.', ['customs', 'transit'], ['inspection', 'passengers']),
  surfacePoi('estella-xid-specialty-cargo', 'Estella XId.4', 'Specialty Cargo Handling', 'estella-xid', 'wells', 'Specialty cargo handling site.', ['cargo'], ['specialty-cargo']),
  orbiting({ id: 'estella-xie', catalogId: 'Estella XIe', name: 'Estella XIe', kind: 'moon', regionId: 'wells', parentId: 'estella-xi', usage: 'moon', summary: 'Small airless moon with outer-spec drydock and fabrication.', tags: ['small-moon', 'airless', 'drydock'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  surfacePoi('estella-xie-outer-spec-drydock', 'Estella XIe.1', 'Outer-Spec Drydock', 'estella-xie', 'wells', 'Outer-spec drydock.', ['drydock'], ['repairs', 'ship-components']),
  surfacePoi('estella-xie-component-fabrication', 'Estella XIe.2', 'Component / Fabrication', 'estella-xie', 'wells', 'Component fabrication site.', ['fabrication'], ['ship-components']),
  surfacePoi('estella-xie-rare-alloy-extraction', 'Estella XIe.3', 'Rare Alloy Extraction', 'estella-xie', 'wells', 'Rare alloy extraction site.', ['mine'], ['rare-alloys']),
  orbiting({ id: 'estella-xif', catalogId: 'Estella XIf', name: 'Estella XIf', kind: 'moon', regionId: 'wells', parentId: 'estella-xi', usage: 'moon', summary: 'Small airless observatory moon.', tags: ['small-moon', 'science', 'airless'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  surfacePoi('estella-xif-observatory', 'Estella XIf.1', 'Observatory', 'estella-xif', 'wells', 'Observatory site.', ['observatory'], ['science-data']),
  surfacePoi('estella-xif-deep-listening-array', 'Estella XIf.2', 'Deep-Listening Array', 'estella-xif', 'wells', 'Deep-listening array.', ['listening-array', 'science'], ['science-data']),
  surfacePoi('estella-xif-sealed-research-outpost', 'Estella XIf.3', 'Sealed Research Outpost', 'estella-xif', 'wells', 'Sealed research outpost.', ['science', 'restricted'], ['classified-cargo', 'science-data']),
  cluster({ id: 'estella-xi-captives', name: 'Estella XI Captives', regionId: 'wells', parentId: 'estella-xi', usage: 'co-orbital', summary: 'Four docking-only captured asteroids in Estella XI\'s SOI.', tags: ['captives', 'dock-only'] }),
  clusterMember({ id: 'estella-xi-captive-smuggler-deaddrop', catalogId: 'ES-C-XI-0001', name: 'Smuggler Dead-Drop Captive', kind: 'asteroid', regionId: 'wells', parentId: 'estella-xi-captives', x: 0, y: 0, summary: 'Captured asteroid used as smuggler dead-drop.', tags: ['smuggling'], economyTags: ['deniable-cargo'] }),
  aboardPoi('estella-xi-smuggler-deaddrop-poi', 'ES-C-XI-0001.1', 'Smuggler Dead-Drop', 'estella-xi-captive-smuggler-deaddrop', 'wells', 'Dock-only smuggler dead-drop.', ['smuggling', 'dock-only'], ['deniable-cargo']),
  clusterMember({ id: 'estella-xi-captive-science-waypoint', catalogId: 'ES-I-XI-0001', name: 'Science Waypoint Captive', kind: 'asteroid', regionId: 'wells', parentId: 'estella-xi-captives', x: 12000, y: -8000, summary: 'Captured asteroid science waypoint.', tags: ['science'], economyTags: ['science-data'] }),
  aboardPoi('estella-xi-science-waypoint-poi', 'ES-I-XI-0001.1', 'Science Waypoint', 'estella-xi-captive-science-waypoint', 'wells', 'Dock-only science waypoint.', ['science', 'dock-only'], ['science-data']),
  clusterMember({ id: 'estella-xi-captive-fence', catalogId: 'ES-M-XI-0001', name: 'Pirate-Adjacent Fence Captive', kind: 'asteroid', regionId: 'wells', parentId: 'estella-xi-captives', x: -14000, y: 9000, summary: 'Captured asteroid with pirate-adjacent fence.', tags: ['fence', 'pirate-adjacent'], economyTags: ['fenced-goods'] }),
  aboardPoi('estella-xi-fence-poi', 'ES-M-XI-0001.1', 'Pirate-Adjacent Fence', 'estella-xi-captive-fence', 'wells', 'Dock-only pirate-adjacent fence.', ['fence', 'dock-only'], ['fenced-goods']),
  clusterMember({ id: 'estella-xi-captive-religious-retreat', catalogId: 'ES-I-XI-0002', name: 'Religious Retreat Captive', kind: 'asteroid', regionId: 'wells', parentId: 'estella-xi-captives', x: 6000, y: 16000, summary: 'Captured asteroid religious retreat.', tags: ['religious', 'retreat'], economyTags: ['pilgrims', 'supplies'] }),
  aboardPoi('estella-xi-religious-retreat-poi', 'ES-I-XI-0002.1', 'Religious Retreat', 'estella-xi-captive-religious-retreat', 'wells', 'Dock-only religious retreat.', ['religious', 'dock-only'], ['pilgrims', 'supplies']),

  orbiting({ id: 'estella-xii', catalogId: 'Estella XII', name: 'Estella XII', kind: 'gas-giant', regionId: 'wells', parentId: ROOT_ID, usage: 'stellar', summary: 'Cold outer Neptune-flavored giant and bridge to the Reach.', tags: ['gas-giant', 'cold-outer-giant'], capabilities: { hasGravityWell: true, hasSOI: true, hasAtmosphere: true, skimOnly: true }, atmosphere: atmosphere('gas-giant', 'Cold gas giant; light skim possible.', true) }),
  ...stationWithPoi({ stationId: 'estella-xii-observation-post-station', poiId: 'estella-xii-observation-post', catalogId: 'Estella XII.1', stationName: 'Estella XII Observation Post', parentId: 'estella-xii', regionId: 'wells', summary: 'Observation post around the cold outer giant.', tags: ['observation'], economyTags: ['science-data'] }),
  orbiting({ id: 'estella-xiia', catalogId: 'Estella XIIa', name: 'Estella XIIa', kind: 'moon', regionId: 'wells', parentId: 'estella-xii', usage: 'moon', summary: 'Large icy moon with thin nitrogen atmosphere in flavor.', tags: ['icy-moon', 'thin-atmosphere'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, hasAtmosphere: true, landable: true }, atmosphere: atmosphere('thin-nitrogen', 'Thin nitrogen atmosphere; mostly flavor.') }),
  surfacePoi('estella-xiia-deep-ice-mine', 'Estella XIIa.1', 'Deep Ice Mine', 'estella-xiia', 'wells', 'Deep ice mine.', ['mine', 'ice'], ['ice', 'water']),
  surfacePoi('estella-xiia-volatiles-transit', 'Estella XIIa.2', 'Volatiles Transit', 'estella-xiia', 'wells', 'Volatiles transit site.', ['volatiles', 'transit'], ['volatiles']),
  surfacePoi('estella-xiia-isolated-settlement', 'Estella XIIa.3', 'Isolated Settlement', 'estella-xiia', 'wells', 'Isolated settlement.', ['settlement', 'isolated'], ['supplies', 'passengers']),
  orbiting({ id: 'estella-xiib', catalogId: 'Estella XIIb', name: 'Estella XIIb', kind: 'moon', regionId: 'wells', parentId: 'estella-xii', usage: 'moon', summary: 'Small airless rocky moon.', tags: ['small-moon', 'airless'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  surfacePoi('estella-xiib-outpost', 'Estella XIIb.1', 'Outpost', 'estella-xiib', 'wells', 'Small outer-moon outpost.', ['outpost'], ['supplies']),
  ...stationWithPoi({ stationId: 'estella-xiib-transit-station', poiId: 'estella-xiib-transit-station-poi', catalogId: 'Estella XIIb.2', stationName: 'Estella XIIb Transit Station', parentId: 'estella-xiib', regionId: 'wells', summary: 'Transit station.', tags: ['transit'], economyTags: ['passengers', 'supplies'] }),
  orbiting({ id: 'estella-xiic', catalogId: 'Estella XIIc', name: 'Estella XIIc', kind: 'moon', regionId: 'wells', parentId: 'estella-xii', usage: 'moon', summary: 'Captured comet/KBO, airless.', tags: ['comet', 'kbo', 'airless'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  surfacePoi('estella-xiic-isotope-mining', 'Estella XIIc.1', 'Isotope Mining', 'estella-xiic', 'wells', 'Isotope mining site.', ['mine', 'isotopes'], ['isotopes']),
  surfacePoi('estella-xiic-comet-research', 'Estella XIIc.2', 'Comet Research', 'estella-xiic', 'wells', 'Comet research site.', ['science', 'comet'], ['science-data']),
  orbiting({ id: 'estella-xiid', catalogId: 'Estella XIId', name: 'Estella XIId', kind: 'moon', regionId: 'wells', parentId: 'estella-xii', usage: 'moon', summary: 'Small airless moon with black-project/exile site.', tags: ['small-moon', 'airless', 'restricted'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  surfacePoi('estella-xiid-black-project-exile', 'Estella XIId.1', 'Sealed Black-Project / Exile Site', 'estella-xiid', 'wells', 'Sealed black-project or exile site.', ['restricted', 'exile', 'black-project'], ['classified-cargo', 'prisoners']),
  cluster({ id: 'estella-xii-captives', name: 'Estella XII Captives', regionId: 'wells', parentId: 'estella-xii', usage: 'co-orbital', summary: 'Two icy captured asteroid/comet sites in Estella XII\'s SOI.', tags: ['captives', 'icy', 'dock-only'] }),
  clusterMember({ id: 'estella-xii-captive-smuggler-waypoint', catalogId: 'ES-I-XII-0001', name: 'Smuggler Waypoint Captive', kind: 'comet-fragment', regionId: 'wells', parentId: 'estella-xii-captives', x: 0, y: 0, summary: 'Icy smuggler waypoint.', tags: ['smuggling'], economyTags: ['deniable-cargo'] }),
  aboardPoi('estella-xii-smuggler-waypoint-poi', 'ES-I-XII-0001.1', 'Smuggler Waypoint', 'estella-xii-captive-smuggler-waypoint', 'wells', 'Dock-only smuggler waypoint.', ['dock-only', 'smuggling'], ['deniable-cargo']),
  clusterMember({ id: 'estella-xii-captive-comm-relay', catalogId: 'ES-I-XII-0002', name: 'Deep-Space Comm Relay Captive', kind: 'comet-fragment', regionId: 'wells', parentId: 'estella-xii-captives', x: 10000, y: -12000, summary: 'Icy deep-space comm relay.', tags: ['communications'], economyTags: ['communications'] }),
  aboardPoi('estella-xii-comm-relay-poi', 'ES-I-XII-0002.1', 'Deep-Space Comm Relay', 'estella-xii-captive-comm-relay', 'wells', 'Dock-only deep-space comm relay.', ['dock-only', 'communications'], ['communications']),

  // V. The Reach
  orbiting({ id: 'estella-xiii', catalogId: 'Estella XIII', name: 'Estella XIII', kind: 'dwarf-planet', regionId: 'reach', parentId: ROOT_ID, usage: 'stellar', summary: 'Primary ice dwarf and de facto capital of the Reach.', tags: ['ice-dwarf', 'reach-capital'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  ...stationWithPoi({ stationId: 'estella-xiii-main-port-station', poiId: 'estella-xiii-main-port', catalogId: 'Estella XIII.1', stationName: 'Estella XIII Main Port', parentId: 'estella-xiii', regionId: 'reach', summary: 'Main port with refuel, dispatch, and customs.', tags: ['main-port', 'customs'], economyTags: ['fuel', 'supplies', 'passengers'] }),
  surfacePoi('estella-xiii-governors-outpost', 'Estella XIII.2', 'Governor\'s Outpost / Settlement', 'estella-xiii', 'reach', 'Governor\'s outpost and settlement.', ['settlement', 'government'], ['supplies', 'passengers']),
  surfacePoi('estella-xiii-deep-ice-mining', 'Estella XIII.3', 'Deep Ice Mining', 'estella-xiii', 'reach', 'Deep ice mining site.', ['mine', 'ice'], ['ice', 'water']),
  surfacePoi('estella-xiii-long-range-observatory', 'Estella XIII.4', 'Long-Range Comm Relay / Observatory', 'estella-xiii', 'reach', 'Long-range communications relay and observatory.', ['communications', 'observatory'], ['communications', 'science-data']),
  surfacePoi('estella-xiii-prison-exile-colony', 'Estella XIII.5', 'Prison / Exile Colony', 'estella-xiii', 'reach', 'Prison and exile colony.', ['prison', 'exile'], ['prisoners', 'supplies']),
  surfacePoi('estella-xiii-classified-research', 'Estella XIII.6', 'Sealed Classified Research Outpost', 'estella-xiii', 'reach', 'Sealed classified research outpost.', ['restricted', 'science'], ['classified-cargo', 'science-data']),

  orbiting({ id: 'estella-xiv', catalogId: 'Estella XIV', name: 'Estella XIV', kind: 'dwarf-planet', regionId: 'reach', parentId: ROOT_ID, usage: 'stellar', summary: 'Smaller ice dwarf/rogue planetoid with eccentric inhabitants.', tags: ['ice-dwarf', 'eccentric'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  ...stationWithPoi({ stationId: 'estella-xiv-transit-dock-station', poiId: 'estella-xiv-transit-dock', catalogId: 'Estella XIV.1', stationName: 'Estella XIV Transit Dock', parentId: 'estella-xiv', regionId: 'reach', summary: 'Minimal-service transit dock.', tags: ['transit', 'minimal-services'], economyTags: ['supplies'] }),
  surfacePoi('estella-xiv-religious-retreat', 'Estella XIV.2', 'Religious Retreat / Monastery', 'estella-xiv', 'reach', 'Religious retreat and monastery.', ['religious', 'retreat'], ['pilgrims', 'supplies']),
  surfacePoi('estella-xiv-smuggler-haven', 'Estella XIV.3', 'Smuggler Haven', 'estella-xiv', 'reach', 'Reputation-gated smuggler haven.', ['smuggling', 'reputation-gated'], ['deniable-cargo', 'fenced-goods']),
  surfacePoi('estella-xiv-abandoned-active-site', 'Estella XIV.4', 'Abandoned-but-Active Site', 'estella-xiv', 'reach', 'Mystery site: abandoned but still somehow active.', ['abandoned', 'mystery', 'writer-territory'], ['salvage', 'classified-cargo']),

  cluster({ id: 'reach-comet-swarm', name: 'Captured Comet Swarm', regionId: 'reach', parentId: ROOT_ID, usage: 'swarm', summary: 'Fragmented captured periodic comet: tight swarm of six icy docking-only bodies.', tags: ['comet-swarm', 'cluster-mode', 'dock-only'] }),
  clusterMember({ id: 'reach-comet-fragment-1', catalogId: 'ES-I-RC-0001', name: 'Comet Fragment 1', kind: 'comet-fragment', regionId: 'reach', parentId: 'reach-comet-swarm', x: 0, y: 0, summary: 'Icy fragment with ice mining.', tags: ['ice-mining'], economyTags: ['ice'] }),
  aboardPoi('reach-comet-fragment-1-poi', 'ES-I-RC-0001.1', 'Ice Mining Dock', 'reach-comet-fragment-1', 'reach', 'Dock-only ice mining site.', ['dock-only', 'ice-mining'], ['ice']),
  clusterMember({ id: 'reach-comet-fragment-2', catalogId: 'ES-I-RC-0002', name: 'Comet Fragment 2', kind: 'comet-fragment', regionId: 'reach', parentId: 'reach-comet-swarm', x: 9000, y: 6000, summary: 'Icy fragment with prospector cache.', tags: ['prospector-cache'], economyTags: ['supplies', 'salvage'] }),
  aboardPoi('reach-comet-fragment-2-poi', 'ES-I-RC-0002.1', 'Prospector Cache', 'reach-comet-fragment-2', 'reach', 'Dock-only prospector cache.', ['dock-only', 'cache'], ['supplies', 'salvage']),
  clusterMember({ id: 'reach-comet-fragment-3', catalogId: 'ES-I-RC-0003', name: 'Comet Fragment 3', kind: 'comet-fragment', regionId: 'reach', parentId: 'reach-comet-swarm', x: -6000, y: 11000, summary: 'Icy fragment with dead-drop.', tags: ['dead-drop'], economyTags: ['deniable-cargo'] }),
  aboardPoi('reach-comet-fragment-3-poi', 'ES-I-RC-0003.1', 'Dead-Drop', 'reach-comet-fragment-3', 'reach', 'Dock-only dead-drop.', ['dock-only', 'smuggling'], ['deniable-cargo']),
  clusterMember({ id: 'reach-comet-fragment-4', catalogId: 'ES-I-RC-0004', name: 'Comet Fragment 4', kind: 'comet-fragment', regionId: 'reach', parentId: 'reach-comet-swarm', x: 15000, y: -3000, summary: 'Icy fragment with isolated science cell.', tags: ['science'], economyTags: ['science-data'] }),
  aboardPoi('reach-comet-fragment-4-poi', 'ES-I-RC-0004.1', 'Isolated Science Cell', 'reach-comet-fragment-4', 'reach', 'Dock-only isolated science cell.', ['dock-only', 'science'], ['science-data']),
  clusterMember({ id: 'reach-comet-fragment-5', catalogId: 'ES-I-RC-0005', name: 'Comet Fragment 5', kind: 'comet-fragment', regionId: 'reach', parentId: 'reach-comet-swarm', x: -13000, y: -9000, summary: 'Icy fragment with ice mining.', tags: ['ice-mining'], economyTags: ['ice'] }),
  aboardPoi('reach-comet-fragment-5-poi', 'ES-I-RC-0005.1', 'Secondary Ice Dock', 'reach-comet-fragment-5', 'reach', 'Dock-only ice mining site.', ['dock-only', 'ice-mining'], ['ice']),
  clusterMember({ id: 'reach-comet-fragment-6', catalogId: 'ES-I-RC-0006', name: 'Comet Fragment 6', kind: 'comet-fragment', regionId: 'reach', parentId: 'reach-comet-swarm', x: 5000, y: -15000, summary: 'Icy fragment with isolated science cell.', tags: ['science'], economyTags: ['science-data'] }),
  aboardPoi('reach-comet-fragment-6-poi', 'ES-I-RC-0006.1', 'Outer Science Cell', 'reach-comet-fragment-6', 'reach', 'Dock-only science cell.', ['dock-only', 'science'], ['science-data']),

  orbiting({ id: 'reach-rogue-kbo-fragment', catalogId: 'ES-I-RK-0001', name: 'Captured Rogue Planetoid / KBO Fragment', kind: 'dwarf-planet', regionId: 'reach', parentId: ROOT_ID, usage: 'outer', summary: 'Lonely eccentric captured rogue planetoid/KBO fragment.', tags: ['rogue', 'kbo', 'lonely'], capabilities: { hasGravityWell: true, hasSOI: true, hasSurface: true, landable: true }, atmosphere: atmosphere('none', undefined, false) }),
  surfacePoi('reach-rogue-isotope-mine', 'ES-I-RK-0001.1', 'Specialty Isotope Mine', 'reach-rogue-kbo-fragment', 'reach', 'Specialty isotope mine.', ['mine', 'isotopes'], ['isotopes']),
  surfacePoi('reach-rogue-lonely-beacon', 'ES-I-RK-0001.2', 'Lonely Beacon / Lone-Operator Station', 'reach-rogue-kbo-fragment', 'reach', 'Lonely beacon and lone-operator station.', ['beacon', 'isolated'], ['communications', 'supplies']),
  orbiting({ id: 'deepest-dock-body', catalogId: 'ES-I-DD-0001', name: 'The Deepest Dock', kind: 'comet-fragment', regionId: 'reach', parentId: ROOT_ID, usage: 'outer', summary: 'Small dead asteroid or comet fragment on the far side of the Reach: the literal end of the line.', tags: ['deepest-dock', 'end-of-line', 'writer-territory'], capabilities: { dockable: true, dockOnly: true }, accessPoints: [ap('deepest-dock-berth', 'The Deepest Dock', 'docking-berth', ['deepest-dock-poi'])] }),
  aboardPoi('deepest-dock-poi', 'ES-I-DD-0001.1', 'The Deepest Dock', 'deepest-dock-body', 'reach', 'Writer-defined dock at the settled outer limit.', ['dock-only', 'mystery'], ['supplies', 'salvage']),
];

