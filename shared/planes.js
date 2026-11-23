// ============================================================
//  PLANE STATS — the one place to tune or add planes.
//  (Each plane's 3D shape is in client/js/aircraft.js under the same key.)
//  Copy an entry, give it a new key, change the numbers. Done.
//  Speeds are in metres/second, turn rates in radians/second.
// ============================================================

export const PLANES = {
  f16: {
    name: 'F-16 Falcon',
    description: 'Balanced all-rounder. Good at everything, great at nothing.',
    modelScale: 1.0,
    minSpeed: 55,        // speed at 0% throttle
    maxSpeed: 125,       // speed at 100% throttle
    boostSpeed: 175,     // speed while holding Shift
    boostFuel: 4,        // seconds of boost when full
    boostRecharge: 0.4,  // boost seconds regained per second
    pitchRate: 1.5,
    yawRate: 0.5,
    rollRate: 3.4,
    health: 100,
    gun: {
      fireRate: 14,        // bullets per second
      damage: 8,
      bulletSpeed: 700,
      range: 900,          // metres before a bullet disappears
      spread: 0.006,       // random inaccuracy
      heatPerShot: 0.025,  // 0..1, overheat at 1
      coolRate: 0.4,       // heat lost per second when not firing
      overheatRecover: 0.3 // guns unlock again once heat drops to this
    },
    missiles: 4,
    flares: 3
  },

  f22: {
    name: 'F-22 Raptor',
    description: 'Interceptor: the fastest and most agile, but fragile.',
    modelScale: 1.0,
    minSpeed: 70, maxSpeed: 150, boostSpeed: 210,
    boostFuel: 5, boostRecharge: 0.5,
    pitchRate: 1.7, yawRate: 0.6, rollRate: 4.0,
    health: 70,
    gun: { fireRate: 16, damage: 6, bulletSpeed: 750, range: 900, spread: 0.006,
           heatPerShot: 0.025, coolRate: 0.45, overheatRecover: 0.3 },
    missiles: 2, flares: 3
  },

  fa18: {
    name: 'F/A-18 Hornet',
    description: 'Turns tighter than anything, but not very fast.',
    modelScale: 1.0,
    minSpeed: 50, maxSpeed: 115, boostSpeed: 165,
    boostFuel: 4, boostRecharge: 0.4,
    pitchRate: 1.85, yawRate: 0.65, rollRate: 3.6,
    health: 95,
    gun: { fireRate: 14, damage: 8, bulletSpeed: 700, range: 900, spread: 0.006,
           heatPerShot: 0.025, coolRate: 0.4, overheatRecover: 0.3 },
    missiles: 4, flares: 4
  },

  f15: {
    name: 'F-15 Eagle',
    description: 'Fast and tough with strong guns, but turns wide.',
    modelScale: 1.1,
    minSpeed: 60, maxSpeed: 140, boostSpeed: 190,
    boostFuel: 4, boostRecharge: 0.4,
    pitchRate: 1.3, yawRate: 0.45, rollRate: 3.0,
    health: 125,
    gun: { fireRate: 12, damage: 10, bulletSpeed: 720, range: 950, spread: 0.006,
           heatPerShot: 0.028, coolRate: 0.4, overheatRecover: 0.3 },
    missiles: 6, flares: 3
  },

  f14: {
    name: 'F-14 Tomcat',
    description: 'Heavy fighter: slow and tough, carries the most missiles.',
    modelScale: 1.2,
    minSpeed: 45, maxSpeed: 105, boostSpeed: 155,
    boostFuel: 3, boostRecharge: 0.3,
    pitchRate: 1.2, yawRate: 0.4, rollRate: 2.4,
    health: 160,
    gun: { fireRate: 10, damage: 12, bulletSpeed: 650, range: 850, spread: 0.008,
           heatPerShot: 0.03, coolRate: 0.35, overheatRecover: 0.3 },
    missiles: 8, flares: 4
  }
};

export const DEFAULT_PLANE = 'f16';

// Where things sit on the jet models (before modelScale is applied).
// If you swap in your own models, update these to match them.
export const JET_GEOMETRY = {
  gunOffsets: [[-1.1, -0.25, -2.2], [1.1, -0.25, -2.2]], // left and right guns, near the nose
  engineOffset: [0, 0, 5.6],                             // where the smoke trail comes out
  hitRadius: 6                                           // size of the hit sphere for bullets
};

// Homing missiles (right click). Each plane's `missiles` above is how many it carries per life.
export const MISSILE = {
  speed: 270,          // m/s (planes boost to ~175, so you can't just outrun it...)
  turnRate: 1.9,       // rad/s (...but a hard turn can out-turn it)
  damage: 60,
  life: 7,             // seconds before it runs out of fuel
  proximity: 8,        // explodes within this many metres of its target
  lockTime: 2,         // seconds of keeping a target in your sights to lock on
  lockRange: 1400,     // metres
  lockCone: 12,        // degrees from your nose to start locking
  keepCone: 20,        // degrees: a lock in progress survives this far off-centre
  maxTrackAngle: 75,   // degrees: if the target gets further off the missile's nose, it loses track
  cooldown: 1.5        // seconds between launches
};

// Flares (F). Each plane's `flares` above is how many it carries per life.
export const FLARE = {
  cooldown: 6,         // seconds between flares
  decoyRange: 2000     // missiles chasing you within this range get fooled
};
