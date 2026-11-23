// Terrain height function, shared by client (to build the mesh) and
// server (to detect crashes). Deterministic: same seed = same world.

export function makeNoise2D(seed) {
  function hash(ix, iz) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  return function noise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
    return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
  };
}

function fbm(noise, x, z, octaves) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Sharp mountain ridges: 0 (valley) .. 1 (ridge top). */
function ridged(noise, x, z, octaves) {
  let amp = 1, freq = 1, sum = 0, norm = 0, weight = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(noise(x * freq + i * 17.3, z * freq - i * 9.1));
    n *= n * weight;
    weight = Math.min(1, n * 1.6);
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Distance from (x, z) to the nearest point on a line made of [x, z] points. */
function distToPath(path, x, z) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const px = ax + dx * t - x, pz = az + dz * t - z;
    best = Math.min(best, px * px + pz * pz);
  }
  return Math.sqrt(best);
}

const distToPaths = (paths, x, z) => paths.reduce((m, p) => Math.min(m, distToPath(p, x, z)), Infinity);

// Small seeded random generator, so trees/clouds are the same for everyone.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- terrain types

function islandsHeight(map, noise) {
  return (x, z) => {
    let land = map.seabed;
    for (const isl of map.islands) {
      const dx = x - isl.x, dz = z - isl.z;
      const d = Math.sqrt(dx * dx + dz * dz) / isl.r;
      if (d > 1.7) continue;
      const k = 1 - d;
      // Inside the island: mountain shape. Outside: beach sloping into the sea.
      const v = k > 0 ? isl.h * Math.pow(k, 1.3) + 4 : 4 + k * 60;
      if (v > land) land = v;
    }
    const n = fbm(noise, x * 0.004, z * 0.004, 4);
    const rough = land > 0 ? 6 + land * 0.2 : 3;
    return Math.max(map.seabed, land + n * rough);
  };
}

function mountainsHeight(map, noise) {
  return (x, z) => {
    // Peaks
    let h = map.valleyFloor + map.peakHeight * ridged(noise, x * 0.0016, z * 0.0016, 5);
    h += fbm(noise, x * 0.01, z * 0.01, 2) * 8;
    // Carve valleys: the floor in the middle, rising walls toward the sides.
    const d = distToPaths(map.valleys, x, z);
    const floor = map.valleyFloor + fbm(noise, x * 0.006 + 50, z * 0.006, 2) * 6;
    const w = map.valleyWidth;
    h = floor + (h - floor) * smoothstep(w * 0.25, w, d);
    // Frozen lake in the middle
    const L = map.lake;
    if (L) {
      const dl = Math.hypot(x - L.x, z - L.z);
      h = Math.min(h, -6 + smoothstep(L.r * 0.7, L.r * 1.4, dl) * (h + 6));
    }
    return h;
  };
}

function canyonHeight(map, noise) {
  return (x, z) => {
    // Desert plateau with gentle dunes
    let h = map.plateau + fbm(noise, x * 0.003, z * 0.003, 3) * 14;
    // Mesas: flat-topped towers with steep sides
    for (const m of map.mesas) {
      const d = Math.hypot(x - m.x, z - m.z) / m.r;
      if (d < 1.3) h = Math.max(h, map.plateau + m.h * smoothstep(1.15, 0.85, d + fbm(noise, x * 0.02, z * 0.02, 2) * 0.1));
    }
    // Canyons: steep walls with stepped layers ("terraces")
    const wobble = fbm(noise, x * 0.008, z * 0.008, 2) * 30;
    const d = distToPaths(map.canyons, x, z) + wobble;
    const w = map.canyonWidth;
    let t = smoothstep(w * 0.2, w * 0.55, d);
    const steps = 4;
    const stepped = Math.floor(t * steps) / steps;
    t = stepped + smoothstep(0, 1, (t * steps) % 1) / steps; // terraces
    h = map.canyonFloor + (h - map.canyonFloor) * t;
    return h;
  };
}

const TYPES = { islands: islandsHeight, mountains: mountainsHeight, canyon: canyonHeight };

export function createTerrain(map) {
  const noise = makeNoise2D(map.seed);
  const heightAt = TYPES[map.terrain](map, noise);

  // Height of whatever you'd crash into: ground or water.
  function surfaceAt(x, z) {
    return Math.max(heightAt(x, z), map.waterLevel);
  }

  return { heightAt, surfaceAt };
}
