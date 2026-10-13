// GLOBAL SKIES fleet table (client side). Each entry mirrors the flight
// model in core/src/aircraft_fleet.cpp (geometry, contact points, eye point,
// speeds): the visual model, cockpit, sounds and procedures are generated
// from the same numbers, so what you see is what the core flies.
//
// Names: the real type name (`real`, e.g. "Boeing 737 MAX 8") is shown by
// default (FLEET_OPTIONS.realNames, Settings). Every entry also keeps an
// original internal name (`name`) and a class reference (`classRef`), used
// when real names are switched off. Liveries are original colours only (no
// airline trade dress or logos). A commercial release should clear the
// manufacturers' trademarks / licensing for the real type names first.

export const FLEET_OPTIONS = { realNames: true };

// law (jets): 'conventional' (direct controls + yaw damper) or 'fbw', mirroring
// the core's ControlLaw; cockpit 'yoke' / 'sidestick' is only the inceptor.
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
    cat: 'Airliner', role: 'Short/medium-haul twin, 162-189 seats', cockpit: 'yoke', sound: 'fan', style: 'airliner', law: 'conventional',
    engines: 2, flaps: ['UP', '1', '5', '15', '30', '40'], toDetent: 2, vr: 145, vref: 145, cruise: { ft: 35000, mach: 0.785 },
    mtow: 79010, oew: 41413, fuelKg: 20894, pax: 162, rangeNm: 2935, ceilingFt: 41000, gearRetract: true,
    g: { L: 39.5, noseX: 19.5, fusD: 3.76, fusH: 4.0, b: 35.8, S: 124.6, sweep: 25, taper: 0.22, dihedral: 6, wingZ: 1.15,
      htail: 14.4, vtail: 7.2, cg: 3.0, mainAft: 1.3, wheelbase: 15.6, track: 5.72, bogie: 2, noseWheels: 2,
      eng: [[2.5, -4.9, 1.6], [2.5, 4.9, 1.6]], engD: 2.05, winglet: 'blended', eye: [16.3, -0.55, -1.05] },
    livery: { body: 0xf4f5f6, belly: 0xd6dbe2, stripe: 0x16325c, accent: 0xd4a85c, tail: 0x16325c, eng: 0xd8dde3 },
  },
  {
    id: 2, key: 'aurora-320', name: 'Aurora 320', classRef: 'A320 class', real: 'Airbus A320',
    cat: 'Airliner', role: 'Short/medium-haul twin, fly-by-wire, 150-180 seats', cockpit: 'sidestick', sound: 'fan', style: 'airliner', law: 'fbw',
    engines: 2, flaps: ['0', '1', '2', '3', 'FULL'], toDetent: 1, vr: 140, vref: 135, cruise: { ft: 35000, mach: 0.78 },
    mtow: 78000, oew: 42600, fuelKg: 18730, pax: 150, rangeNm: 3300, ceilingFt: 39800, gearRetract: true,
    g: { L: 37.6, noseX: 17.0, fusD: 3.95, fusH: 4.14, b: 35.8, S: 122.6, sweep: 25, taper: 0.24, dihedral: 5.1, wingZ: 1.2,
      htail: 12.45, vtail: 6.3, cg: 2.9, mainAft: 1.2, wheelbase: 12.6, track: 7.6, bogie: 2, noseWheels: 2,
      eng: [[2.6, -5.75, 1.5], [2.6, 5.75, 1.5]], engD: 2.2, winglet: 'sharklet', eye: [14.0, -0.55, -1.1] },
    livery: { body: 0xf6f6f4, belly: 0xf6f6f4, stripe: 0xd4a85c, accent: 0x16325c, tail: 0x0f2747, eng: 0x16325c },
  },
  {
    id: 3, key: 'horizon-789', name: 'Horizon 789', classRef: '787-9 class', real: 'Boeing 787-9',
    cat: 'Airliner', role: 'Long-haul composite twin, 290 seats', cockpit: 'yoke', sound: 'fanHeavy', style: 'airliner', law: 'fbw',
    engines: 2, flaps: ['UP', '1', '5', '15', '20', '30'], toDetent: 3, vr: 160, vref: 148, cruise: { ft: 39000, mach: 0.85 },
    mtow: 254011, oew: 128850, fuelKg: 101300, pax: 290, rangeNm: 7530, ceilingFt: 43000, gearRetract: true,
    g: { L: 62.8, noseX: 30.8, fusD: 5.77, fusH: 5.97, b: 60.1, S: 377, sweep: 32, taper: 0.18, dihedral: 6.5, wingZ: 1.9,
      htail: 19.8, vtail: 9.4, cg: 4.6, mainAft: 1.8, wheelbase: 25.6, track: 9.8, bogie: 4, noseWheels: 2,
      eng: [[4.0, -9.4, 2.4], [4.0, 9.4, 2.4]], engD: 3.55, winglet: 'raked', chevrons: true, eye: [27.5, -0.6, -1.5] },
    livery: { body: 0xf7f7f7, belly: 0x0f2747, stripe: 0xd4a85c, accent: 0x16325c, tail: 0x0f2747, eng: 0xe6e8eb },
  },
  {
    id: 4, key: 'titan-77w', name: 'Titan 77W', classRef: '777-300ER class', real: 'Boeing 777-300ER',
    cat: 'Airliner', role: 'Long-haul twin, 396 seats', cockpit: 'yoke', sound: 'fanHeavy', style: 'airliner', law: 'fbw',
    engines: 2, flaps: ['UP', '1', '5', '15', '20', '30'], toDetent: 3, vr: 170, vref: 150, cruise: { ft: 35000, mach: 0.84 },
    mtow: 351534, oew: 167829, fuelKg: 145538, pax: 396, rangeNm: 7370, ceilingFt: 43100, gearRetract: true,
    g: { L: 73.9, noseX: 36.3, fusD: 6.2, fusH: 6.4, b: 64.8, S: 436.8, sweep: 31.6, taper: 0.15, dihedral: 6, wingZ: 2.0,
      htail: 21.5, vtail: 10.5, cg: 4.9, mainAft: 2.0, wheelbase: 31.2, track: 10.9, bogie: 6, noseWheels: 2,
      eng: [[4.5, -9.6, 2.6], [4.5, 9.6, 2.6]], engD: 4.1, winglet: 'raked', eye: [33.0, -0.6, -1.6] },
    livery: { body: 0xf4f5f6, belly: 0xc9ced6, stripe: 0x16325c, accent: 0xd4a85c, tail: 0xd4a85c, eng: 0xd8dde3 },
  },
  {
    id: 5, key: 'monarch-744', name: 'Monarch 744', classRef: '747-400 class', real: 'Boeing 747-400',
    cat: 'Airliner', role: 'Four-engine long-haul jumbo, 416 seats', cockpit: 'yoke', sound: 'fanHeavy', style: 'airliner', law: 'conventional',
    engines: 4, flaps: ['UP', '1', '5', '10', '20', '25'], toDetent: 3, vr: 165, vref: 150, cruise: { ft: 35000, mach: 0.85 },
    mtow: 396890, oew: 178756, fuelKg: 173000, pax: 416, rangeNm: 7260, ceilingFt: 45100, gearRetract: true,
    g: { L: 70.6, noseX: 31.0, fusD: 6.5, fusH: 7.8, b: 64.4, S: 541.2, sweep: 37.5, taper: 0.24, dihedral: 7, wingZ: 2.4,
      htail: 22.2, vtail: 10.6, cg: 5.0, mainAft: 1.9, wheelbase: 25.6, track: 11.0, bogie: 4, noseWheels: 2,
      eng: [[6.0, -12.0, 2.3], [6.0, 12.0, 2.3], [1.0, -21.0, 1.6], [1.0, 21.0, 1.6]], engD: 2.9, winglet: 'canted', hump: true, eye: [26.0, -0.6, -2.4] },
    livery: { body: 0xf4f5f6, belly: 0xd6dbe2, stripe: 0xd4a85c, accent: 0x16325c, tail: 0x16325c, eng: 0xd8dde3 },
  },
  {
    id: 6, key: 'zephyr-359', name: 'Zephyr 359', classRef: 'A350-900 class', real: 'Airbus A350-900',
    cat: 'Airliner', role: 'Long-haul composite twin, fly-by-wire, 315 seats', cockpit: 'sidestick', sound: 'fanHeavy', style: 'airliner', law: 'fbw',
    engines: 2, flaps: ['0', '1', '2', '3', 'FULL'], toDetent: 1, vr: 155, vref: 140, cruise: { ft: 39000, mach: 0.85 },
    mtow: 283000, oew: 142400, fuelKg: 110523, pax: 315, rangeNm: 8100, ceilingFt: 43100, gearRetract: true,
    g: { L: 66.8, noseX: 32.3, fusD: 5.96, fusH: 6.09, b: 64.75, S: 442, sweep: 31.9, taper: 0.17, dihedral: 6, wingZ: 2.0,
      htail: 18.6, vtail: 9.7, cg: 4.8, mainAft: 1.9, wheelbase: 28.7, track: 10.6, bogie: 4, noseWheels: 2,
      eng: [[4.2, -10.0, 2.5], [4.2, 10.0, 2.5]], engD: 3.6, winglet: 'curved', mask: true, eye: [29.0, -0.6, -1.5] },
    livery: { body: 0xf6f6f4, belly: 0xf6f6f4, stripe: 0x16325c, accent: 0xd4a85c, tail: 0x0f2747, eng: 0x0f2747 },
  },
  {
    id: 7, key: 'colossus-388', name: 'Colossus 388', classRef: 'A380 class', real: 'Airbus A380-800',
    cat: 'Airliner', role: 'Double-deck four-engine, fly-by-wire, 525 seats', cockpit: 'sidestick', sound: 'fanHeavy', style: 'airliner', law: 'fbw',
    engines: 4, flaps: ['0', '1', '2', '3', 'FULL'], toDetent: 2, vr: 165, vref: 140, cruise: { ft: 35000, mach: 0.85 },
    mtow: 575000, oew: 277000, fuelKg: 253983, pax: 525, rangeNm: 8000, ceilingFt: 43000, gearRetract: true,
    g: { L: 72.7, noseX: 37.5, fusD: 7.14, fusH: 8.41, b: 79.75, S: 845, sweep: 33.5, taper: 0.22, dihedral: 5.6, wingZ: 2.6,
      htail: 30.4, vtail: 11.5, cg: 5.6, mainAft: 2.2, wheelbase: 33.6, track: 14.3, bogie: 6, noseWheels: 2,
      eng: [[5.0, -15.5, 2.6], [5.0, 15.5, 2.6], [0.0, -25.5, 1.9], [0.0, 25.5, 1.9]], engD: 3.6, winglet: 'fence', deck2: true, eye: [34.0, -0.7, -4.4] },
    livery: { body: 0xf6f6f4, belly: 0xd6dbe2, stripe: 0xd4a85c, accent: 0x16325c, tail: 0x16325c, eng: 0xe6e8eb },
  },
  {
    id: 8, key: 'talon-15', name: 'Talon 15', classRef: 'F-15C class', real: 'McDonnell Douglas F-15C',
    cat: 'Fighter', role: 'Twin-engine air superiority fighter, Mach 2.5', cockpit: 'fighter', sound: 'military', style: 'fighter', law: 'fbw',
    engines: 2, flaps: ['UP', 'DN'], toDetent: 0, vr: 125, vref: 150, cruise: { ft: 30000, mach: 0.9 },
    mtow: 30845, oew: 12700, fuelKg: 6100, pax: 0, rangeNm: 1060, ceilingFt: 65000, gearRetract: true, afterburner: true,
    g: { L: 19.43, noseX: 10.1, fusD: 2.0, fusW: 3.0, b: 13.05, S: 56.5, sweep: 45, taper: 0.25, wingZ: -0.3,
      htail: 8.6, vtail: 3.1, tails: 'twin', cant: 2, cg: 2.0, mainAft: 0.7, wheelbase: 5.42, track: 2.75, bogie: 1, noseWheels: 1,
      eng: [[-7.0, -0.6, 0.1], [-7.0, 0.6, 0.1]], engD: 1.15, intake: 'box', eye: [5.6, 0, -1.0] },
    livery: { body: 0x8a96a3, belly: 0xa7b1bb, stripe: 0x5c6a78, accent: 0xd4a85c, tail: 0x76828f, eng: 0x4a4f55 },
  },
  {
    id: 9, key: 'specter-22', name: 'Specter 22', classRef: 'F-22 class', real: 'Lockheed Martin F-22 Raptor',
    cat: 'Fighter', role: 'Stealth air dominance fighter, supercruise, thrust vectoring', cockpit: 'fighter', sound: 'military', style: 'fighter', law: 'fbw',
    engines: 2, flaps: ['UP', 'DN'], toDetent: 0, vr: 130, vref: 145, cruise: { ft: 40000, mach: 1.5 },
    mtow: 38000, oew: 19700, fuelKg: 8200, pax: 0, rangeNm: 1600, ceilingFt: 65000, gearRetract: true, afterburner: true, tvc: true,
    g: { L: 18.9, noseX: 9.8, fusD: 2.1, fusW: 3.6, b: 13.56, S: 78.04, sweep: 42, taper: 0.12, wingZ: -0.1,
      htail: 8.8, vtail: 3.0, tails: 'twin', cant: 28, cg: 2.1, mainAft: 0.7, wheelbase: 6.0, track: 3.3, bogie: 1, noseWheels: 1,
      eng: [[-7.5, -0.6, 0.0], [-7.5, 0.6, 0.0]], engD: 1.1, intake: 'caret', nozzle: '2d', eye: [5.3, 0, -1.0] },
    livery: { body: 0x7d858e, belly: 0x8c949c, stripe: 0x6c747c, accent: 0xb9c0c7, tail: 0x737b84, eng: 0x45494e },
  },
  {
    id: 10, key: 'arrow-35', name: 'Arrow 35', classRef: 'F-35A class', real: 'Lockheed Martin F-35A',
    cat: 'Fighter', role: 'Single-engine stealth multirole fighter', cockpit: 'fighter', sound: 'military', style: 'fighter', law: 'fbw',
    engines: 1, flaps: ['UP', 'DN'], toDetent: 0, vr: 145, vref: 150, cruise: { ft: 30000, mach: 0.9 },
    mtow: 31800, oew: 13290, fuelKg: 8278, pax: 0, rangeNm: 1200, ceilingFt: 50000, gearRetract: true, afterburner: true,
    g: { L: 15.7, noseX: 8.0, fusD: 2.2, fusW: 3.4, b: 10.7, S: 42.7, sweep: 35, taper: 0.2, wingZ: -0.1,
      htail: 6.7, vtail: 2.6, tails: 'twin', cant: 25, cg: 2.0, mainAft: 0.7, wheelbase: 5.1, track: 3.4, bogie: 1, noseWheels: 1,
      eng: [[-6.0, 0, 0.1]], engD: 1.25, intake: 'caret', eye: [4.2, 0, -1.0] },
    livery: { body: 0x6d7378, belly: 0x7a8085, stripe: 0x5d6368, accent: 0x9da3a8, tail: 0x666c71, eng: 0x3f4347 },
  },
  {
    id: 11, key: 'nightwing-2', name: 'Nightwing 2', classRef: 'B-2 class', real: 'Northrop Grumman B-2 Spirit',
    cat: 'Bomber', role: 'Flying-wing strategic bomber, 6,000 nm', cockpit: 'yoke', sound: 'fan', style: 'flyingwing', law: 'fbw',
    engines: 4, flaps: ['—'], toDetent: 0, vr: 140, vref: 140, cruise: { ft: 40000, mach: 0.8 },
    mtow: 170600, oew: 71700, fuelKg: 75750, pax: 0, rangeNm: 6000, ceilingFt: 50000, gearRetract: true,
    g: { L: 21.0, noseX: 9.5, b: 52.4, S: 478, sweep: 33, cg: 3.6, mainAft: 1.0, wheelbase: 11.0, track: 12.2, bogie: 4, noseWheels: 2,
      eng: [[-2.0, -5.0, -0.3], [-2.0, -2.8, -0.3], [-2.0, 2.8, -0.3], [-2.0, 5.0, -0.3]], engD: 1.1, eye: [7.5, -0.5, -1.4] },
    livery: { body: 0x5d646e, belly: 0x4f565f, stripe: 0x3f454d, accent: 0x6a717b, tail: 0x5d646e, eng: 0x2a2e33 },
  },
  {
    id: 12, key: 'vega-650', name: 'Vega 650', classRef: 'G650 class', real: 'Gulfstream G650',
    cat: 'Business jet', role: 'Ultra-long-range business jet, Mach 0.925', cockpit: 'yoke', sound: 'fan', style: 'airliner', law: 'fbw',
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
  // ---- v2.1: real-type extension (ids 14-25). Numbers mirror core/src/aircraft_fleet.cpp.
  {
    id: 14, key: 'swiftlet-4', name: 'Swiftlet 4', classRef: 'Citation CJ4 class', real: 'Cessna Citation CJ4',
    cat: 'Business jet', role: 'Light business jet, single-pilot, 2,165 nm', cockpit: 'yoke', sound: 'fan', style: 'airliner', law: 'conventional',
    engines: 2, flaps: ['UP', '15', '35'], toDetent: 1, vr: 110, vref: 105, cruise: { ft: 45000, mach: 0.70 },
    mtow: 7761, oew: 4663, fuelKg: 2644, pax: 9, rangeNm: 2165, ceilingFt: 45000, gearRetract: true,
    g: { L: 16.26, noseX: 7.8, fusD: 1.7, fusH: 1.78, b: 15.49, S: 30.66, sweep: 12.5, taper: 0.38, dihedral: 4, wingZ: 0.55,
      htail: 6.4, vtail: 2.5, htailFrac: 0.38, cg: 1.45, mainAft: 0.6, wheelbase: 6.5, track: 4.2, bogie: 1, noseWheels: 1,
      eng: [[-4.6, -1.35, -0.55], [-4.6, 1.35, -0.55]], engD: 0.86, rearEngines: true, ovalWindows: true, eye: [5.6, -0.42, -0.55] },
    livery: { body: 0xf7f7f5, belly: 0xe2e5e9, stripe: 0x2f5d50, accent: 0xb8925a, tail: 0xf7f7f5, eng: 0xeceeef },
  },
  {
    id: 15, key: 'petrel-300', name: 'Petrel 300', classRef: 'Phenom 300E class', real: 'Embraer Phenom 300E',
    cat: 'Business jet', role: 'Light business jet, single-pilot, Mach 0.80, 2,010 nm', cockpit: 'yoke', sound: 'fan', style: 'airliner', law: 'conventional',
    engines: 2, flaps: ['0', '1', '2', '3', 'FULL'], toDetent: 1, vr: 112, vref: 110, cruise: { ft: 41000, mach: 0.74 },
    mtow: 8415, oew: 5425, fuelKg: 2428, pax: 9, rangeNm: 2010, ceilingFt: 45000, gearRetract: true,
    g: { L: 15.64, noseX: 7.6, fusD: 1.75, fusH: 1.82, b: 15.91, S: 28.5, sweep: 23, taper: 0.35, dihedral: 5, wingZ: 0.55,
      htail: 5.9, vtail: 2.4, ttail: true, cg: 1.4, mainAft: 0.6, wheelbase: 6.3, track: 3.75, bogie: 1, noseWheels: 1,
      eng: [[-4.2, -1.4, -0.7], [-4.2, 1.4, -0.7]], engD: 0.9, rearEngines: true, winglet: 'blended', ovalWindows: true, eye: [5.4, -0.42, -0.55] },
    livery: { body: 0xf4f4f2, belly: 0x3a3f46, stripe: 0x8c1d2c, accent: 0xc0c5cb, tail: 0x3a3f46, eng: 0xf4f4f2 },
  },
  {
    id: 16, key: 'borealis-75', name: 'Borealis 75', classRef: 'Global 7500 class', real: 'Bombardier Global 7500',
    cat: 'Business jet', role: 'Ultra-long-range business jet, fly-by-wire, 7,700 nm', cockpit: 'yoke', sound: 'fan', style: 'airliner', law: 'fbw',
    engines: 2, flaps: ['0', '6', '16', '30'], toDetent: 1, vr: 138, vref: 115, cruise: { ft: 45000, mach: 0.85 },
    mtow: 52096, oew: 25764, fuelKg: 23360, pax: 17, rangeNm: 7700, ceilingFt: 51000, gearRetract: true,
    g: { L: 33.88, noseX: 15.7, fusD: 2.69, fusH: 2.8, b: 31.7, S: 110, sweep: 33, taper: 0.28, dihedral: 3, wingZ: 0.85,
      htail: 10.5, vtail: 4.6, ttail: true, cg: 2.5, mainAft: 1.0, wheelbase: 15.3, track: 4.3, bogie: 2, noseWheels: 2,
      eng: [[-11.0, -2.6, -1.2], [-11.0, 2.6, -1.2]], engD: 1.62, rearEngines: true, winglet: 'blended', ovalWindows: true, eye: [13.2, -0.5, -0.95] },
    livery: { body: 0xf6f6f4, belly: 0xf6f6f4, stripe: 0x1d2d44, accent: 0x9aa7b5, tail: 0x1d2d44, eng: 0xf0f0ee },
  },
  {
    id: 17, key: 'lumen-223', name: 'Lumen 223', classRef: 'A220-300 class', real: 'Airbus A220-300',
    cat: 'Airliner', role: 'Narrowbody twin, fly-by-wire, 130-160 seats', cockpit: 'sidestick', sound: 'fan', style: 'airliner', law: 'fbw',
    engines: 2, flaps: ['0', '1', '2', '3', '4'], toDetent: 1, vr: 140, vref: 130, cruise: { ft: 35000, mach: 0.78 },
    mtow: 70900, oew: 37081, fuelKg: 17440, pax: 140, rangeNm: 3450, ceilingFt: 41000, gearRetract: true,
    g: { L: 38.7, noseX: 18.6, fusD: 3.7, fusH: 3.82, b: 35.1, S: 112.3, sweep: 26, taper: 0.25, dihedral: 5, wingZ: 1.15,
      htail: 11.5, vtail: 6.3, cg: 2.8, mainAft: 1.2, wheelbase: 16.3, track: 6.7, bogie: 2, noseWheels: 2,
      eng: [[2.3, -5.3, 1.45], [2.3, 5.3, 1.45]], engD: 2.1, winglet: 'blended', eye: [15.6, -0.55, -1.05] },
    livery: { body: 0xf5f6f7, belly: 0xf5f6f7, stripe: 0x1f6f78, accent: 0xe0b15a, tail: 0x1f6f78, eng: 0x1f6f78 },
  },
  {
    id: 18, key: 'egret-295', name: 'Egret 295', classRef: 'E195-E2 class', real: 'Embraer E195-E2',
    cat: 'Airliner', role: 'Regional/narrowbody twin, fly-by-wire, 120-146 seats', cockpit: 'yoke', sound: 'fan', style: 'airliner', law: 'fbw',
    engines: 2, flaps: ['0', '1', '2', '3', '5', 'FULL'], toDetent: 2, vr: 145, vref: 130, cruise: { ft: 35000, mach: 0.78 },
    mtow: 62500, oew: 35700, fuelKg: 13690, pax: 132, rangeNm: 2600, ceilingFt: 41000, gearRetract: true,
    g: { L: 41.5, noseX: 20.4, fusD: 3.01, fusH: 3.35, b: 35.12, S: 103, sweep: 26, taper: 0.24, dihedral: 5, wingZ: 1.1,
      htail: 12.1, vtail: 6.3, cg: 2.8, mainAft: 1.2, wheelbase: 17.5, track: 6.2, bogie: 2, noseWheels: 2,
      eng: [[2.0, -5.6, 1.4], [2.0, 5.6, 1.4]], engD: 2.1, winglet: 'curved', eye: [17.6, -0.55, -1.0] },
    livery: { body: 0xf4f5f6, belly: 0xc3cad3, stripe: 0x5a2a6e, accent: 0x7fc2a8, tail: 0x5a2a6e, eng: 0xe4e7ea },
  },
  {
    id: 19, key: 'meridian-8m', name: 'Meridian 8M', classRef: '737 MAX 8 class', real: 'Boeing 737 MAX 8',
    cat: 'Airliner', role: 'Short/medium-haul twin, 162-189 seats', cockpit: 'yoke', sound: 'fan', style: 'airliner', law: 'conventional',
    engines: 2, flaps: ['UP', '1', '5', '15', '30', '40'], toDetent: 2, vr: 150, vref: 145, cruise: { ft: 35000, mach: 0.79 },
    mtow: 82191, oew: 45070, fuelKg: 20730, pax: 172, rangeNm: 3550, ceilingFt: 41000, gearRetract: true,
    g: { L: 39.52, noseX: 19.5, fusD: 3.76, fusH: 4.0, b: 35.92, S: 127, sweep: 25, taper: 0.22, dihedral: 6, wingZ: 1.15,
      htail: 14.4, vtail: 7.2, cg: 3.1, mainAft: 1.3, wheelbase: 15.6, track: 5.72, bogie: 2, noseWheels: 2,
      eng: [[3.0, -4.9, 1.45], [3.0, 4.9, 1.45]], engD: 2.0, winglet: 'split', chevrons: true, eye: [16.3, -0.55, -1.05] },
    livery: { body: 0xf5f5f3, belly: 0x2b4a6f, stripe: 0xc8573e, accent: 0x2b4a6f, tail: 0x2b4a6f, eng: 0xdfe3e7 },
  },
  {
    id: 20, key: 'aurora-321n', name: 'Aurora 321N', classRef: 'A321neo class', real: 'Airbus A321neo',
    cat: 'Airliner', role: 'Long narrowbody twin, fly-by-wire, 180-220 seats', cockpit: 'sidestick', sound: 'fan', style: 'airliner', law: 'fbw',
    engines: 2, flaps: ['0', '1', '2', '3', 'FULL'], toDetent: 2, vr: 155, vref: 140, cruise: { ft: 35000, mach: 0.78 },
    mtow: 97000, oew: 50100, fuelKg: 18860, pax: 206, rangeNm: 3500, ceilingFt: 39800, gearRetract: true,
    g: { L: 44.51, noseX: 22.0, fusD: 3.95, fusH: 4.14, b: 35.8, S: 122.6, sweep: 25, taper: 0.24, dihedral: 5.1, wingZ: 1.2,
      htail: 12.45, vtail: 6.3, cg: 2.9, mainAft: 1.3, wheelbase: 16.91, track: 7.59, bogie: 2, noseWheels: 2,
      eng: [[2.8, -5.75, 1.5], [2.8, 5.75, 1.5]], engD: 2.35, winglet: 'sharklet', eye: [19.0, -0.55, -1.1] },
    livery: { body: 0xf6f6f4, belly: 0xf6f6f4, stripe: 0xd05f2a, accent: 0x243447, tail: 0xd05f2a, eng: 0x243447 },
  },
  {
    id: 21, key: 'vista-763', name: 'Vista 763', classRef: '767-300ER class', real: 'Boeing 767-300ER',
    cat: 'Airliner', role: 'Semi-widebody long-haul twin, 218-261 seats', cockpit: 'yoke', sound: 'fanHeavy', style: 'airliner', law: 'conventional',
    engines: 2, flaps: ['UP', '1', '5', '15', '20', '30'], toDetent: 3, vr: 160, vref: 142, cruise: { ft: 35000, mach: 0.80 },
    mtow: 186880, oew: 90011, fuelKg: 73100, pax: 261, rangeNm: 5980, ceilingFt: 43100, gearRetract: true,
    g: { L: 54.94, noseX: 26.9, fusD: 5.03, fusH: 5.41, b: 47.57, S: 283.3, sweep: 31.5, taper: 0.2, dihedral: 6, wingZ: 1.7,
      htail: 18.6, vtail: 8.6, cg: 4.2, mainAft: 1.6, wheelbase: 22.76, track: 9.3, bogie: 4, noseWheels: 2,
      eng: [[4.3, -7.6, 2.2], [4.3, 7.6, 2.2]], engD: 2.85, eye: [23.8, -0.55, -1.3] },
    livery: { body: 0xf2f3f4, belly: 0x9aa4ae, stripe: 0x0e4d64, accent: 0xe3c16f, tail: 0x0e4d64, eng: 0xd8dde3 },
  },
  {
    id: 22, key: 'solstice-339', name: 'Solstice 339', classRef: 'A330-900 class', real: 'Airbus A330-900',
    cat: 'Airliner', role: 'Widebody long-haul twin, fly-by-wire, 260-300 seats', cockpit: 'sidestick', sound: 'fanHeavy', style: 'airliner', law: 'fbw',
    engines: 2, flaps: ['0', '1', '2', '3', 'FULL'], toDetent: 1, vr: 155, vref: 137, cruise: { ft: 37000, mach: 0.82 },
    mtow: 251000, oew: 132000, fuelKg: 111270, pax: 287, rangeNm: 7200, ceilingFt: 41450, gearRetract: true,
    g: { L: 63.66, noseX: 31.4, fusD: 5.64, fusH: 5.64, b: 64.0, S: 465, sweep: 30, taper: 0.2, dihedral: 5.5, wingZ: 1.95,
      htail: 19.4, vtail: 9.0, cg: 4.6, mainAft: 1.9, wheelbase: 25.37, track: 10.68, bogie: 4, noseWheels: 2,
      eng: [[4.2, -9.4, 2.3], [4.2, 9.4, 2.3]], engD: 3.4, winglet: 'curved', eye: [28.4, -0.6, -1.5] },
    livery: { body: 0xf7f7f7, belly: 0x1c3b57, stripe: 0x4aa3a2, accent: 0xf2c14e, tail: 0x4aa3a2, eng: 0x1c3b57 },
  },
  {
    id: 23, key: 'ocelot-16', name: 'Ocelot 16', classRef: 'F-16C class', real: 'Lockheed Martin F-16C Fighting Falcon',
    cat: 'Fighter', role: 'Single-engine multirole fighter, fly-by-wire sidestick, Mach 2', cockpit: 'fighter', sound: 'military', style: 'fighter', law: 'fbw',
    engines: 1, flaps: ['UP', 'DN'], toDetent: 0, vr: 140, vref: 145, cruise: { ft: 30000, mach: 0.9 },
    mtow: 19187, oew: 8570, fuelKg: 3175, pax: 0, rangeNm: 2280, ceilingFt: 50000, gearRetract: true, afterburner: true,
    g: { L: 15.06, noseX: 7.4, fusD: 1.7, fusW: 2.3, b: 9.96, S: 27.87, sweep: 40, taper: 0.23, wingZ: 0.0,
      htail: 5.58, vtail: 2.9, tails: 'single', cg: 1.7, mainAft: 0.6, wheelbase: 4.0, track: 2.36, bogie: 1, noseWheels: 1,
      eng: [[-6.0, 0, 0.0]], engD: 1.15, intake: 'chin', intakeW: 1.0, eye: [4.0, 0, -1.05] },
    livery: { body: 0x9aa3ac, belly: 0xb3bac1, stripe: 0x6f7a85, accent: 0xc9a25a, tail: 0x8b959f, eng: 0x4a4f55 },
  },
  {
    id: 24, key: 'corvid-18', name: 'Corvid 18', classRef: 'F/A-18E class', real: 'Boeing F/A-18E Super Hornet',
    cat: 'Fighter', role: 'Twin-engine carrier multirole fighter, 7.5 g', cockpit: 'fighter', sound: 'military', style: 'fighter', law: 'fbw',
    engines: 2, flaps: ['AUTO', 'HALF', 'FULL'], toDetent: 0, vr: 150, vref: 140, cruise: { ft: 30000, mach: 0.85 },
    mtow: 29937, oew: 14552, fuelKg: 6531, pax: 0, rangeNm: 1800, ceilingFt: 50000, gearRetract: true, afterburner: true,
    g: { L: 18.31, noseX: 9.4, fusD: 2.0, fusW: 3.3, b: 13.62, S: 46.45, sweep: 28, taper: 0.35, wingZ: -0.2,
      htail: 8.4, vtail: 3.1, tails: 'twin', cant: 20, cg: 2.0, mainAft: 0.8, wheelbase: 5.85, track: 3.11, bogie: 1, noseWheels: 2,
      eng: [[-7.5, -0.55, 0.1], [-7.5, 0.55, 0.1]], engD: 1.0, intake: 'caret', eye: [5.6, 0, -1.1] },
    livery: { body: 0x7f8a95, belly: 0x98a2ab, stripe: 0x5f6a75, accent: 0xb9c0c7, tail: 0x737e89, eng: 0x45494e },
  },
  {
    id: 25, key: 'monsoon-2k', name: 'Monsoon 2K', classRef: 'Typhoon class', real: 'Eurofighter Typhoon',
    cat: 'Fighter', role: 'Canard-delta twin-engine fighter, fly-by-wire, supercruise', cockpit: 'fighter', sound: 'military', style: 'fighter', law: 'fbw',
    engines: 2, flaps: ['UP', 'DN'], toDetent: 1, vr: 140, vref: 150, cruise: { ft: 30000, mach: 0.9 },
    mtow: 23500, oew: 11000, fuelKg: 4996, pax: 0, rangeNm: 2000, ceilingFt: 55000, gearRetract: true, afterburner: true,
    g: { L: 15.96, noseX: 8.2, fusD: 1.9, fusW: 2.4, b: 10.95, S: 51.2, sweep: 53, taper: 0.12, wingZ: 0.15,
      htail: 4.6, vtail: 3.0, tails: 'single', canard: true, cg: 1.9, mainAft: 0.7, wheelbase: 4.9, track: 3.4, bogie: 1, noseWheels: 1,
      eng: [[-6.8, -0.45, 0.1], [-6.8, 0.45, 0.1]], engD: 0.95, intake: 'chin', intakeW: 1.5, eye: [4.6, 0, -1.1] },
    livery: { body: 0x8e979f, belly: 0xa2aab1, stripe: 0x6d767e, accent: 0xb0b7be, tail: 0x858e96, eng: 0x45494e },
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
