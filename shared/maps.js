// ============================================================
//  MAPS — each map is just data. The terrain is generated from it
//  (see terrain.js), so adding a map = adding an entry here.
//
//  terrain types:
//   'islands'   — mountains rising out of the sea (list of islands)
//   'mountains' — ridged snowy peaks with valleys carved along `valleys`
//   'canyon'    — flat desert plateau with canyons carved along `canyons`
//
//  bands: heights (m) where the ground colour changes:
//   below `shore` = colors.seabed/shore, then grass, forest, rock, peak.
// ============================================================

export const MAPS = {
  islands: {
    name: 'Tropical Islands',
    description: 'Sunny islands and open sea. Lots of room to dogfight.',
    terrain: 'islands',
    seed: 1337,
    size: 4400,          // width of the terrain mesh in metres
    resolution: 176,     // terrain grid cells per side (higher = more detail, slower)
    boundary: 1800,      // radius of the battle area
    ceiling: 1000,       // max altitude
    spawnHeight: 260,
    waterLevel: 0,
    seabed: -40,
    sky: { top: 0x3b8fe8, horizon: 0xcdeeff },
    fog: { near: 700, far: 3200 },
    sun: 0xfff1d6,
    water: 0x2aa8df,
    waterOpacity: 0.82,
    colors: {
      seabed: 0xd8c286, shore: 0xf2dd9b, grass: 0x6cc44f,
      forest: 0x3d9a42, rock: 0x8c8073, peak: 0xa89c8e, steep: 0x8c8073
    },
    bands: { shore: 6, grass: 60, forest: 140, rock: 200 },
    trees: { type: 'palm', count: 500, minH: 6, maxH: 110 },
    clouds: { count: 45, minY: 260, maxY: 520, color: 0xffffff },
    balloons: 12,
    // x, z = centre, r = radius, h = peak height
    islands: [
      { x: 0,     z: 0,     r: 470, h: 230 },
      { x: 900,   z: -520,  r: 300, h: 140 },
      { x: -860,  z: -640,  r: 270, h: 110 },
      { x: -700,  z: 760,   r: 350, h: 170 },
      { x: 820,   z: 820,   r: 230, h: 90 },
      { x: 150,   z: -1150, r: 190, h: 60 },
      { x: 1320,  z: 120,   r: 170, h: 55 },
      { x: -1360, z: 60,    r: 210, h: 80 }
    ]
  },

  mountains: {
    name: 'Snowy Mountains',
    description: 'Huge peaks with valleys to race through. A frozen lake in the middle.',
    terrain: 'mountains',
    seed: 4242,
    size: 4400,
    resolution: 200,
    boundary: 1800,
    ceiling: 1200,
    spawnHeight: 560,
    waterLevel: 0,
    peakHeight: 440,     // tallest mountains
    valleyFloor: 18,     // height of valley bottoms
    valleyWidth: 230,    // metres across (at the top of the valley walls)
    lake: { x: 0, z: 0, r: 260 },
    // Valleys follow these lines (lists of [x, z] points).
    valleys: [
      [[-2200, -700], [-1200, -450], [-500, -120], [0, 0], [600, 260], [1300, 700], [2200, 1000]],
      [[-600, 2200], [-350, 1200], [-120, 500], [0, 0], [300, -600], [700, -1300], [1000, -2200]],
      [[-2200, 900], [-1300, 650], [-700, 300], [-300, 120]]
    ],
    sky: { top: 0x5d8fc9, horizon: 0xe4eef7 },
    fog: { near: 600, far: 3000 },
    sun: 0xffffff,
    water: 0xc9ecff,     // ice
    waterOpacity: 0.95,
    colors: {
      seabed: 0x9fb8c8, shore: 0xe9f0f4, grass: 0xdfe8ee,
      forest: 0x2f5a3c, rock: 0x7b8088, peak: 0xffffff, steep: 0x6f747c
    },
    bands: { shore: 4, grass: 40, forest: 150, rock: 250 },
    trees: { type: 'pine', count: 700, minH: 10, maxH: 170 },
    clouds: { count: 35, minY: 560, maxY: 800, color: 0xf4f7fa },
    balloons: 12
  },

  canyon: {
    name: 'Desert Canyon',
    description: 'A flat desert cut by deep winding canyons. Fly low if you dare.',
    terrain: 'canyon',
    seed: 777,
    size: 4400,
    resolution: 220,
    boundary: 1800,
    ceiling: 900,
    spawnHeight: 300,
    waterLevel: 0,
    plateau: 150,        // height of the desert floor
    canyonFloor: -4,     // canyon bottoms are just under water level = a river
    canyonWidth: 240,
    // Canyons follow these lines (lists of [x, z] points).
    canyons: [
      [[-2200, 300], [-1400, -100], [-800, 250], [-200, -150], [300, 200], [900, -250], [1500, 150], [2200, -200]],
      [[-300, -2200], [-450, -1300], [-150, -700], [-200, -150]],
      [[300, 200], [600, 900], [350, 1500], [700, 2200]]
    ],
    // Flat-topped rock towers on the plateau.
    mesas: [
      { x: -1000, z: -900, r: 160, h: 120 },
      { x: 1100, z: 900, r: 200, h: 140 },
      { x: -900, z: 1000, r: 130, h: 100 },
      { x: 1200, z: -1000, r: 150, h: 110 },
      { x: 0, z: 1200, r: 110, h: 90 }
    ],
    sky: { top: 0x3f86d6, horizon: 0xf6dfb8 },
    fog: { near: 800, far: 3400 },
    sun: 0xffe2b0,
    water: 0x3aa7a0,
    waterOpacity: 0.85,
    colors: {
      seabed: 0x8a6a4a, shore: 0xb9784a, grass: 0xc4703f,
      forest: 0xd99a5b, rock: 0xe8c48a, peak: 0xa8503a, steep: 0xb8603a
    },
    stripes: true,       // layered rock bands on cliff faces
    bands: { shore: 8, grass: 60, forest: 120, rock: 175 },
    trees: { type: 'cactus', count: 350, minH: 140, maxH: 175 },
    clouds: { count: 18, minY: 400, maxY: 600, color: 0xffffff },
    balloons: 12
  }
};

export const DEFAULT_MAP = 'islands';
