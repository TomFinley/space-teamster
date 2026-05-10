// Mission definitions for Space Teamster campaign.

import { type MissionStartDef } from './campaign-content';

export interface Mission {
  id: number;
  name: string;
  subtitle: string;
  destinationName: string;
  destinationLocation: string;
  completionText: string;
  stub: boolean;           // true = "coming soon", not playable yet
  startWorldTime: number;  // absolute system time to reset to on mission start
  start: MissionStartDef;
}

export const MISSIONS: Mission[] = [
  {
    id: 1,
    name: 'Mail Run',
    subtitle: 'Deliver supplies from Orbital Hub Calloway to the mining settlement on Castor.',
    destinationName: 'Castor Settlement',
    destinationLocation: 'Castor surface',
    completionText: 'Mail, rations, snacks, packages — small pleasures for the hard-working miners. You\'re invited to join the evening at The Rusty Vein.',
    stub: false,
    startWorldTime: 0,
    start: { kind: 'docking', dockingLevelId: 1 },
  },
  {
    id: 2,
    name: 'Core Samples',
    subtitle: 'Haul geological survey cores from Castor\'s mining camp back to Calloway Station.',
    destinationName: 'Calloway Station',
    destinationLocation: 'orbiting Castor 100km CW',
    completionText: 'The lab techs have been waiting weeks for these. Dr. Vasquez is already pulling the first core before your container clamps disengage.',
    stub: false,
    startWorldTime: 0,
    start: { kind: 'landing', poiId: 'castor-settlement', departureApproachLevelId: 12 },
  },
  {
    id: 3,
    name: 'Festival Freight',
    subtitle: 'Deliver decorations from Anchor Station to Port Kessler on Tycho for Founders\' Day.',
    destinationName: 'Port Kessler',
    destinationLocation: 'Tycho surface',
    completionText: 'The whole town turns out to unload. Kids are already hanging lanterns. The festival committee insists you stay for the opening ceremony at Kessler Square.',
    stub: false,
    startWorldTime: 0,
    start: { kind: 'docking', dockingLevelId: 13 },
  },
  {
    id: 4,
    name: 'The Morning After',
    subtitle: 'Haul recycling and festival waste from Port Kessler back up to Anchor Station.',
    destinationName: 'Anchor Station',
    destinationLocation: 'orbiting Tycho 180km CCW',
    completionText: 'Not glamorous, but Anchor\'s waste chief slips you a bonus for the quick turnaround. \'Fastest cleanup in three years,\' she says.',
    stub: false,
    startWorldTime: 0,
    start: { kind: 'landing', poiId: 'port-kessler', departureApproachLevelId: 14 },
  },
  {
    id: 5,
    name: 'Twin Run',
    subtitle: 'Transport drilling equipment from Castor to the new outpost on Pollux, its sister moon.',
    destinationName: 'Pollux Outpost',
    destinationLocation: 'Pollux surface',
    completionText: 'The Pollux crew has been working with improvised tools for months. The foreman shakes your hand and won\'t let go.',
    stub: false,
    startWorldTime: 0,
    start: { kind: 'landing', poiId: 'castor-settlement', departureApproachLevelId: 15 },
  },
  {
    id: 6,
    name: 'The Hard Way Up',
    subtitle: 'Deliver medical supplies from Port Kessler on Tycho to Morrow Station in high Castor orbit.',
    destinationName: 'Morrow Station',
    destinationLocation: 'orbiting Castor 220km CW',
    completionText: 'The station medic checks every crate twice. \'You have no idea how long we\'ve been rationing,\' she says quietly.',
    stub: false,
    startWorldTime: 0,
    start: { kind: 'landing', poiId: 'port-kessler', departureApproachLevelId: 17 },
  },
  {
    id: 7,
    name: 'Long Haul',
    subtitle: 'Priority cargo from Calloway Station in Castor orbit to Port Kessler on Tycho.',
    destinationName: 'Port Kessler',
    destinationLocation: 'Tycho surface',
    completionText: 'Dock workers at Kessler give you the nod — the one reserved for drivers who\'ve done the long haul. Your name goes on the board at The Rusty Anchor.',
    stub: false,
    startWorldTime: 0,
    start: { kind: 'docking', dockingLevelId: 16 },
  },
  {
    id: 8,
    name: 'Estella Transfer',
    subtitle: 'Prototype navigation browser for exact-authored Estella locations.',
    destinationName: 'Estella Navigation',
    destinationLocation: 'authored system map',
    completionText: 'Navigation route set.',
    stub: false,
    startWorldTime: 0,
    start: { kind: 'estellaNav' },
  },
];
