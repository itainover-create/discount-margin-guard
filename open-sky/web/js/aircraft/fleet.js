// GLOBAL SKIES fleet table (client side). Each entry mirrors the flight
// model in core/src/aircraft_fleet.cpp (geometry, contact points, eye point,
// speeds): the visual model, cockpit, sounds and procedures are generated
// from the same numbers, so what you see is what the core flies.
//
// Names: every design has an original name; the real type it is modelled on
// is shown as a class reference only ("737-800 class"). Manufacturers' names
// and trade dress are not used as product names. A licensee can switch the
// display to real type names with FLEET_OPTIONS.realNames (Settings).

export const FLEET_OPTIONS = { realNames: false };

// geometry in body axes (x fwd, y right, z down), metres, CG origin
export const FLEET = [
  {
    id: 0, key: 'skylark-t1', name: 'Skylark T1', classRef: 'C172-class trainer', real: 'Cessna 172S',
    cat: 'Trainer', role: 'Four-seat piston trainer', cockpit: 'trainer', sound: 'piston', style: 'trainer',
    engines: 1, flaps: ['0°', '10°', '20°', 'FULL'], toDetent: 0, vr: 55, vref: 65, cruise: { ft: 6500, kt: 120 },
    mtow: 1157, fuelKg: 144, pax: 3, rangeNm: 640, ceilingFt: 14000, gearRetract: false,
  },
  {
    id: 1, key: 'meridian-738', name: 'Meridian 738', classRef: '737-800 class', real: 'Boeing 737-800',
    cat: 'Airliner', role: 'Short/medium-haul twin, 162-189 seats', cockpit: 'yoke', sound: 'fan', style: 'airliner',
    engines: 2, flaps: ['UP', '1', '5', '15', '30', '40'], toDetent: 2, vr: 145, vref: 145, cruise: { ft: 35000, mach: 0.785 },
    mtow: 79010, oew: 41413, fuelKg: 20894, pax: 162, rangeNm: 2935, ceilingFt: 41000, gearRetract: true,
    g: { L: 39.5, noseX: 19.5, fusD: 3.76, fusH: 4.0, b: 35.8, S: 124.6, sweep: 25, taper: 0.22, dihedral: 6, wingZ: 1.15,
      htail: 14.4, vtail: 7.2, cg: 3.0, mainAft: 1.3, wheelbase: 15.6, track: 5.72, bogie: 2, noseWheels: 2,
      eng: [[2.5, -4.9, 1.6], [2.5, 4.9, 1.6]], engD: 2.05, winglet: 'blended', eye: [16.3, -0.55, -1.05] },
    livery: { body: 0xf4f5f6, belly: 0xd6dbe2, stripe: 0x16325c, accent: 0xd4a85c, tail: 0x16325c, eng: 0xd8dde3 },
  },
  {
    id: 2, key: 'aurora-320', name: 'Aurora 320', classRef: 'A320 class', real: 'Airbus A320',
    cat: 'Airliner', role: 'Short/medium-haul twin, fly-by-wire, 150-180 seats', cockpit: 'sidestick', sound: 'fan', style: 'airliner',
    engines: 2, flaps: ['0', '1', '2', '3', 'FULL'], toDetent: 1, vr: 140, vref: 135, cruise: { ft: 35000, mach: 0.78 },
    mtow: 78000, oew: 42600, fuelKg: 18730, pax: 150, rangeNm: 3300, ceilingFt: 39800, gearRetract: true,
    g: { L: 37.6, noseX: 17.0, fusD: 3.95, fusH: 4.14, b: 35.8, S: 122.6, sweep: 25, taper: 0.24, dihedral: 5.1, wingZ: 1.2,
      htail: 12.45, vtail: 6.3, cg: 2.9, mainAft: 1.2, wheelbase: 12.6, track: 7.6, bogie: 2, noseWheels: 2,
      eng: [[2.6, -5.75, 1.5], [2.6, 5.75, 1.5]], engD: 2.2, winglet: 'sharklet', eye: [14.0, -0.55, -1.1] },
    livery: { body: 0xf6f6f4, belly: 0xf6f6f4, stripe: 0xd4a85c, accent: 0x16325c, tail: 0x0f2747, eng: 0x16325c },
  },
  {
    id: 3, key: 'horizon-789', name: 'Horizon 789', classRef: '787-9 class', real: 'Boeing 787-9',
    cat: 'Airliner', role: 'Long-haul composite twin, 290 seats', cockpit: 'yoke', sound: 'fanHeavy', style: 'airliner',
    engines: 2, flaps: ['UP', '1', '5', '15', '20', '30'], toDetent: 3, vr: 160, vref: 148, cruise: { ft: 39000, mach: 0.85 },
    mtow: 254011, oew: 128850, fuelKg: 101300, pax: 290, rangeNm: 7530, ceilingFt: 43000, gearRetract: true,
    g: { L: 62.8, noseX: 30.8, fusD: 5.77, fusH: 5.97, b: 60.1, S: 377, sweep: 32, taper: 0.18, dihedral: 6.5, wingZ: 1.9,
      htail: 19.8, vtail: 9.4, cg: 4.6, mainAft: 1.8, wheelbase: 25.6, track: 9.8, bogie: 4, noseWheels: 2,
      eng: [[4.0, -9.4, 2.4], [4.0, 9.4, 2.4]], engD: 3.55, winglet: 'raked', chevrons: true, eye: [27.5, -0.6, -1.5] },
    livery: { body: 0xf7f7f7, belly: 0x0f2747, stripe: 0xd4a85c, accent: 0x16325c, tail: 0x0f2747, eng: 0xe6e8eb },
  },
  {
    id: 4, key: 'titan-77w', name: 'Titan 77W', classRef: '777-300ER class', real: 'Boeing 777-300ER',
    cat: 'Airliner', role: 'Long-haul twin, 396 seats', cockpit: 'yoke', sound: 'fanHeavy', style: 'airliner',
    engines: 2, flaps: ['UP', '1', '5', '15', '20', '30'], toDetent: 3, vr: 170, vref: 150, cruise: { ft: 35000, mach: 0.84 },
    mtow: 351534, oew: 167829, fuelKg: 145538, pax: 396, rangeNm: 7370, ceilingFt: 43100, gearRetract: true,
    g: { L: 73.9, noseX: 36.3, fusD: 6.2, fusH: 6.4, b: 64.8, S: 436.8, sweep: 31.6, taper: 0.15, dihedral: 6, wingZ: 2.0,
      htail: 21.5, vtail: 10.5, cg: 4.9, mainAft: 2.0, wheelbase: 31.2, track: 10.9, bogie: 6, noseWheels: 2,
      eng: [[4.5, -9.6, 2.6], [4.5, 9.6, 2.6]], engD: 4.1, winglet: 'raked', eye: [33.0, -0.6, -1.6] },
    livery: { body: 0xf4f5f6, belly: 0xc9ced6, stripe: 0x16325c, accent: 0xd4a85c, tail: 0xd4a85c, eng: 0xd8dde3 },
  },
  {
    id: 5, key: 'monarch-744', name: 'Monarch 744', classRef: '747-400 class', real: 'Boeing 747-400',
    cat: 'Airliner', role: 'Four-engine long-haul jumbo, 416 seats', cockpit: 'yoke', sound: 'fanHeavy', style: 'airliner',
    engines: 4, flaps: ['UP', '1', '5', '10', '20', '25'], toDetent: 3, vr: 165, vref: 150, cruise: { ft: 35000, mach: 0.85 },
    mtow: 396890, oew: 178756, fuelKg: 173000, pax: 416, rangeNm: 7260, ceilingFt: 45100, gearRetract: true,
    g: { L: 70.6, noseX: 31.0, fusD: 6.5, fusH: 7.8, b: 64.4, S: 541.2, sweep: 37.5, taper: 0.24, dihedral: 7, wingZ: 2.4,
      htail: 22.2, vtail: 10.6, cg: 5.0, mainAft: 1.9, wheelbase: 25.6, track: 11.0, bogie: 4, noseWheels: 2,
      eng: [[6.0, -12.0, 2.3], [6.0, 12.0, 2.3], [1.0, -21.0, 1.6], [1.0, 21.0, 1.6]], engD: 2.9, winglet: 'canted', hump: true, eye: [26.0, -0.6, -2.4] },
    livery: { body: 0xf4f5f6, belly: 0xd6dbe2, stripe: 0xd4a85c, accent: 0x16325c, tail: 0x16325c, eng: 0xd8dde3 },
  },
  {
    id: 6, key: 'zephyr-359', name: 'Zephyr 359', classRef: 'A350-900 class', real: 'Airbus A350-900',
    cat: 'Airliner', role: 'Long-haul composite twin, fly-by-wire, 315 seats', cockpit: 'sidestick', sound: 'fanHeavy', style: 'airliner',
    engines: 2, flaps: ['0', '1', '2', '3', 'FULL'], toDetent: 1, vr: 155, vref: 140, cruise: { ft: 39000, mach: 0.85 },
    mtow: 283000, oew: 142400, fuelKg: 110523, pax: 315, rangeNm: 8100, ceilingFt: 43100, gearRetract: true,
    g: { L: 66.8, noseX: 32.3, fusD: 5.96, fusH: 6.09, b: 64.75, S: 442, sweep: 31.9, taper: 0.17, dihedral: 6, wingZ: 2.0,
      htail: 18.6, vtail: 9.7, cg: 4.8, mainAft: 1.9, wheelbase: 28.7, track: 10.6, bogie: 4, noseWheels: 2,
      eng: [[4.2, -10.0, 2.5], [4.2, 10.0, 2.5]], engD: 3.6, winglet: 'curved', mask: true, eye: [29.0, -0.6, -1.5] },
    livery: { body: 0xf6f6f4, belly: 0xf6f6f4, stripe: 0x16325c, accent: 0xd4a85c, tail: 0x0f2747, eng: 0x0f2747 },
  },
  {
    id: 7, key: 'colossus-388', name: 'Colossus 388', classRef: 'A380 class', real: 'Airbus A380-800',
    cat: 'Airliner', role: 'Double-deck four-engine, fly-by-wire, 525 seats', cockpit: 'sidestick', sound: 'fanHeavy', style: 'airliner',
    engines: 4, flaps: ['0', '1', '2', '3', 'FULL'], toDetent: 2, vr: 165, vref: 140, cruise: { ft: 35000, mach: 0.85 },
    mtow: 575000, oew: 277000, fuelKg: 253983, pax: 525, rangeNm: 8000, ceilingFt: 43000, gearRetract: true,
    g: { L: 72.7, noseX: 37.5, fusD: 7.14, fusH: 8.41, b: 79.75, S: 845, sweep: 33.5, taper: 0.22, dihedral: 5.6, wingZ: 2.6,
      htail: 30.4, vtail: 11.5, cg: 5.6, mainAft: 2.2, wheelbase: 33.6, track: 14.3, bogie: 6, noseWheels: 2,
      eng: [[5.0, -15.5, 2.6], [5.0, 15.5, 2.6], [0.0, -25.5, 1.9], [0.0, 25.5, 1.9]], engD: 3.6, winglet: 'fence', deck2: true, eye: [34.0, -0.7, -4.4] },
    livery: { body: 0xf6f6f4, belly: 0xd6dbe2, stripe: 0xd4a85c, accent: 0x16325c, tail: 0x16325c, eng: 0xe6e8eb },
  },
  {
    id: 8, key: 'talon-15', name: 'Talon 15', classRef: 'F-15C class', real: 'McDonnell Douglas F-15C',
    cat: 'Fighter', role: 'Twin-engine air superiority fighter, Mach 2.5', cockpit: 'fighter', sound: 'military', style: 'fighter',
    engines: 2, flaps: ['UP', 'DN'], toDetent: 0, vr: 125, vref: 150, cruise: { ft: 30000, mach: 0.9 },
    mtow: 30845, oew: 12700, fuelKg: 6100, pax: 0, rangeNm: 1060, ceilingFt: 65000, gearRetract: true, afterburner: true,
    g: { L: 19.43, noseX: 10.1, fusD: 2.0, fusW: 3.0, b: 13.05, S: 56.5, sweep: 45, taper: 0.25, wingZ: -0.3,
      htail: 8.6, vtail: 3.1, tails: 'twin', cant: 2, cg: 2.0, mainAft: 0.7, wheelbase: 5.42, track: 2.75, bogie: 1, noseWheels: 1,
      eng: [[-7.0, -0.6, 0.1], [-7.0, 0.6, 0.1]], engD: 1.15, intake: 'box', eye: [5.6, 0, -1.0] },
    livery: { body: 0x8a96a3, belly: 0xa7b1bb, stripe: 0x5c6a78, accent: 0xd4a85c, tail: 0x76828f, eng: 0x4a4f55 },
  },
  {
    id: 9, key: 'specter-22', name: 'Specter 22', classRef: 'F-22 class', real: 'Lockheed Martin F-22 Raptor',
    cat: 'Fighter', role: 'Stealth air dominance fighter, supercruise, thrust vectoring', cockpit: 'fighter', sound: 'military', style: 'fighter',
    engines: 2, flaps: ['UP', 'DN'], toDetent: 0, vr: 130, vref: 145, cruise: { ft: 40000, mach: 1.5 },
    mtow: 38000, oew: 19700, fuelKg: 8200, pax: 0, rangeNm: 1600, ceilingFt: 65000, gearRetract: true, afterburner: true, tvc: true,
    g: { L: 18.9, noseX: 9.8, fusD: 2.1, fusW: 3.6, b: 13.56, S: 78.04, sweep: 42, taper: 0.12, wingZ: -0.1,
      htail: 8.8, vtail: 3.0, tails: 'twin', cant: 28, cg: 2.1, mainAft: 0.7, wheelbase: 6.0, track: 3.3, bogie: 1, noseWheels: 1,
      eng: [[-7.5, -0.6, 0.0], [-7.5, 0.6, 0.0]], engD: 1.1, intake: 'caret', nozzle: '2d', eye: [5.3, 0, -1.0] },
    livery: { body: 0x7d858e, belly: 0x8c949c, stripe: 0x6c747c, accent: 0xb9c0c7, tail: 0x737b84, eng: 0x45494e },
  },
  {
    id: 10, key: 'arrow-35', name: 'Arrow 35', classRef: 'F-35A class', real: 'Lockheed Martin F-35A',
    cat: 'Fighter', role: 'Single-engine stealth multirole fighter', cockpit: 'fighter', sound: 'military', style: 'fighter',
    engines: 1, flaps: ['UP', 'DN'], toDetent: 0, vr: 145, vref: 150, cruise: { ft: 30000, mach: 0.9 },
    mtow: 31800, oew: 13290, fuelKg: 8278, pax: 0, rangeNm: 1200, ceilingFt: 50000, gearRetract: true, afterburner: true,
    g: { L: 15.7, noseX: 8.0, fusD: 2.2, fusW: 3.4, b: 10.7, S: 42.7, sweep: 35, taper: 0.2, wingZ: -0.1,
      htail: 6.7, vtail: 2.6, tails: 'twin', cant: 25, cg: 2.0, mainAft: 0.7, wheelbase: 5.1, track: 3.4, bogie: 1, noseWheels: 1,
      eng: [[-6.0, 0, 0.1]], engD: 1.25, intake: 'caret', eye: [4.2, 0, -1.0] },
    livery: { body: 0x6d7378, belly: 0x7a8085, stripe: 0x5d6368, accent: 0x9da3a8, tail: 0x666c71, eng: 0x3f4347 },
  },
  {
    id: 11, key: 'nightwing-2', name: 'Nightwing 2', classRef: 'B-2 class', real: 'Northrop Grumman B-2 Spirit',
    cat: 'Bomber', role: 'Flying-wing strategic bomber, 6,000 nm', cockpit: 'yoke', sound: 'fan', style: 'flyingwing',
    engines: 4, flaps: ['—'], toDetent: 0, vr: 140, vref: 140, cruise: { ft: 40000, mach: 0.8 },
    mtow: 170600, oew: 71700, fuelKg: 75750, pax: 0, rangeNm: 6000, ceilingFt: 50000, gearRetract: true,
    g: { L: 21.0, noseX: 9.5, b: 52.4, S: 478, sweep: 33, cg: 3.6, mainAft: 1.0, wheelbase: 11.0, track: 12.2, bogie: 4, noseWheels: 2,
      eng: [[-2.0, -5.0, -0.3], [-2.0, -2.8, -0.3], [-2.0, 2.8, -0.3], [-2.0, 5.0, -0.3]], engD: 1.1, eye: [7.5, -0.5, -1.4] },
    livery: { body: 0x5d646e, belly: 0x4f565f, stripe: 0x3f454d, accent: 0x6a717b, tail: 0x5d646e, eng: 0x2a2e33 },
  },
  {
    id: 12, key: 'vega-650', name: 'Vega 650', classRef: 'G650 class', real: 'Gulfstream G650',
    cat: 'Business jet', role: 'Ultra-long-range business jet, Mach 0.925', cockpit: 'yoke', sound: 'fan', style: 'airliner',
    engines: 2, flaps: ['0', '10', '20', '39'], toDetent: 1, vr: 140, vref: 125, cruise: { ft: 45000, mach: 0.85 },
    mtow: 45178, oew: 24494, fuelKg: 20049, pax: 14, rangeNm: 7000, ceilingFt: 51000, gearRetract: true,
    g: { L: 30.4, noseX: 13.7, fusD: 2.6, fusH: 2.72, b: 30.4, S: 119.2, sweep: 33, taper: 0.3, dihedral: 3, wingZ: 0.8,
      htail: 10.6, vtail: 4.5, ttail: true, cg: 2.4, mainAft: 1.0, wheelbase: 13.5, track: 4.9, bogie: 2, noseWheels: 2,
      eng: [[-8.8, -2.4, -1.1], [-8.8, 2.4, -1.1]], engD: 1.55, rearEngines: true, winglet: 'blended', ovalWindows: true, eye: [11.3, -0.5, -0.9] },
    livery: { body: 0xf6f6f4, belly: 0xf6f6f4, stripe: 0xd4a85c, accent: 0x16325c, tail: 0xf6f6f4, eng: 0xf0f0ee },
  },
  {
    id: 13, key: 'stinger-330', name: 'Stinger 330', classRef: 'Extra 330 class', real: 'Extra 330LX',
    cat: 'Aerobatic', role: 'Unlimited-class aerobatic monoplane, ±10 g, 400°/s roll', cockpit: 'aerobatic', sound: 'pistonBig', style: 'aerobatic',
    engines: 1, flaps: ['—'], toDetent: 0, vr: 60, vref: 80, cruise: { ft: 4000, kt: 170 },
    mtow: 1250, fuelKg: 66, pax: 1, rangeNm: 400, ceilingFt: 16000, gearRetract: false,
    livery: { body: 0xf6f6f4, stripe: 0x16325c, accent: 0xd4a85c, tail: 0xd4a85c },
  },
];

export const FLEET_BY_ID = new Map(FLEET.map((f) => [f.id, f]));
export function fleetEntry(id) { return FLEET_BY_ID.get(id | 0) || FLEET[0]; }
export function displayName(f) { return FLEET_OPTIONS.realNames && f.real ? f.real : f.name; }
export function isJet(f) { return f.style !== 'trainer' && f.style !== 'aerobatic'; }

// Body-axis eye point (x fwd, y right, z down) of each aircraft
export function eyeBody(f) {
  if (f.g && f.g.eye) return f.g.eye;
  if (f.style === 'aerobatic') return [-0.6, 0, -0.75];
  return null;  // trainer: the cockpit module defines it
}
