// ============================================================
//  REAL JET SHAPES — low-poly versions of real fighters, built from numbers.
//  Keys match shared/planes.js. All sizes in metres; the nose points to -Z,
//  +X is the right wing, +Y is up.
//
//  fuselage.profile  [radius, z] pairs from nose to tail (turned into a round body,
//                    then squashed by sx/sy)
//  wing / lex / stab / glove  outline of the RIGHT half seen from above: [x, z] points
//                    (the left half is mirrored automatically)
//  tails.profile     outline of a fin seen from the side: [z, y] points;
//                    tails.x = where each fin sits, tails.cant = lean outward (radians)
//  intakes           air intakes (boxes); x ≠ 0 means one on each side
//  nacelles          separate engine pods (F-14)
//  nozzles           engine exhausts (flames come out here); square = flat stealth nozzle
//  rails             wingtip / under-wing missiles (decoration)
//  swing             F-14 swing wing: outer wing outline + pivot point
// ============================================================
import * as THREE from 'three';

export const AIRCRAFT = {
  f16: {
    fuselage: { profile: [[0, -6.2], [0.35, -5.4], [0.6, -4.4], [0.72, -3], [0.8, -1], [0.8, 2], [0.72, 4], [0.58, 5.2]], sx: 1, sy: 1.05 },
    canopy: { z: -3.3, length: 2.4, width: 0.55, height: 0.55, y: 0.62 },
    wing: { points: [[0.7, -1.0], [4.6, 1.8], [4.6, 2.5], [0.7, 2.9]], y: -0.1 },
    lex: { points: [[0.55, -3.6], [0.78, -1.0], [0.78, 0.2], [0.6, 0.2]], y: -0.05 },
    stab: { points: [[0.6, 3.4], [2.7, 4.5], [2.7, 5.0], [0.6, 5.2]], y: 0 },
    tails: { profile: [[1.6, 0.5], [4.2, 3.6], [5.0, 3.6], [5.1, 0.5]], x: [0], cant: 0 },
    intakes: [{ x: 0, y: -0.78, z: -1.7, w: 1.0, h: 0.6, l: 2.2 }],
    nozzles: [{ x: 0, z: 5.4, r: 0.55 }],
    rails: [[4.6, -0.1, 1.6]]
  },

  f22: {
    fuselage: { profile: [[0, -6.0], [0.4, -5.0], [0.7, -3.8], [0.85, -2], [0.95, 0], [0.95, 3], [0.8, 4.8]], sx: 1.5, sy: 0.7 },
    canopy: { z: -3.2, length: 2.6, width: 0.6, height: 0.5, y: 0.45 },
    wing: { points: [[1.0, -1.6], [5.0, 2.2], [5.0, 2.8], [1.0, 3.6]], y: -0.05 },
    stab: { points: [[1.0, 3.4], [3.1, 4.9], [3.1, 5.4], [1.0, 5.6]], y: 0 },
    tails: { profile: [[1.0, 0.3], [3.4, 2.7], [4.1, 2.7], [3.9, 0.3]], x: [-1.4, 1.4], cant: 0.47 },
    intakes: [{ x: 1.3, y: -0.05, z: -2.0, w: 0.6, h: 0.7, l: 2.4 }],
    nozzles: [{ x: -0.55, z: 5.1, r: 0.45, square: true }, { x: 0.55, z: 5.1, r: 0.45, square: true }]
  },

  fa18: {
    fuselage: { profile: [[0, -6.3], [0.35, -5.4], [0.6, -4.2], [0.75, -2.5], [0.85, 0], [0.85, 3], [0.75, 4.8]], sx: 1.1, sy: 0.95 },
    canopy: { z: -3.6, length: 2.4, width: 0.55, height: 0.55, y: 0.62 },
    wing: { points: [[0.9, -0.4], [4.6, 1.5], [4.6, 2.2], [0.9, 2.6]], y: -0.1 },
    lex: { points: [[0.5, -4.0], [1.05, -0.4], [1.05, 0.4], [0.8, 0.4]], y: -0.02 },
    stab: { points: [[0.8, 3.6], [2.9, 4.6], [2.9, 5.1], [0.8, 5.3]], y: 0 },
    tails: { profile: [[1.0, 0.4], [2.8, 2.9], [3.5, 2.9], [3.6, 0.4]], x: [-1.0, 1.0], cant: 0.35 },
    intakes: [{ x: 1.05, y: -0.35, z: -1.0, w: 0.5, h: 0.6, l: 2.0 }],
    nozzles: [{ x: -0.5, z: 5.0, r: 0.45 }, { x: 0.5, z: 5.0, r: 0.45 }],
    rails: [[4.6, -0.1, 1.4]]
  },

  f15: {
    fuselage: { profile: [[0, -6.4], [0.4, -5.4], [0.65, -4.2], [0.8, -2.8], [0.95, -1], [1.0, 2], [0.9, 4.6]], sx: 1.3, sy: 0.85 },
    canopy: { z: -3.6, length: 2.6, width: 0.6, height: 0.6, y: 0.62 },
    wing: { points: [[1.2, -1.0], [5.6, 1.7], [5.6, 2.6], [1.2, 3.0]], y: 0.05 },
    stab: { points: [[1.1, 3.6], [3.4, 4.7], [3.4, 5.3], [1.1, 5.5]], y: 0 },
    tails: { profile: [[1.8, 0.4], [4.5, 3.4], [5.1, 3.4], [5.2, 0.4]], x: [-1.35, 1.35], cant: 0 },
    intakes: [{ x: 1.4, y: 0.0, z: -1.6, w: 0.75, h: 0.9, l: 3.0 }],
    nozzles: [{ x: -0.65, z: 5.3, r: 0.5 }, { x: 0.65, z: 5.3, r: 0.5 }],
    rails: [[3.2, -0.35, 1.0]]
  },

  f14: {
    fuselage: { profile: [[0, -7.0], [0.35, -6.0], [0.6, -4.8], [0.75, -3.2], [0.85, -1.5], [0.7, 1.5], [0.5, 4.5]], sx: 1.1, sy: 0.9 },
    canopy: { z: -4.0, length: 3.2, width: 0.6, height: 0.6, y: 0.6 },
    glove: { points: [[0.8, -2.6], [2.4, -0.6], [2.4, 1.2], [0.8, 1.6]], y: 0.1 },
    pancake: { points: [[0.7, -1.4], [1.6, -1.4], [1.6, 4.8], [0.5, 4.8]], y: -0.05 }, // flat body between the engines
    swing: { points: [[0, -0.2], [4.4, 1.5], [4.4, 2.2], [0, 1.4]], pivot: [2.3, 0.15, -0.1], min: 0.15, max: 0.9 },
    nacelles: [{ x: 1.55, z0: -2.4, z1: 4.6, r: 0.62 }],
    intakes: [{ x: 1.55, y: 0.0, z: -2.9, w: 0.95, h: 1.0, l: 1.2 }],
    stab: { points: [[1.6, 3.8], [4.0, 5.0], [4.0, 5.6], [1.6, 5.8]], y: 0 },
    tails: { profile: [[2.0, 0.5], [4.2, 3.1], [4.9, 3.1], [5.0, 0.5]], x: [-1.55, 1.55], cant: 0.1 },
    nozzles: [{ x: -1.55, z: 5.0, r: 0.52 }, { x: 1.55, z: 5.0, r: 0.52 }],
    rails: [[1.0, -0.75, -0.5], [1.0, -0.75, 2.0]]
  }
};

// ------------------------------------------------------------ geometry helpers

/** Flat plate from an outline seen from above ([x, z] points), `t` thick. */
function planform(points, t) {
  const s = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? s.lineTo(x, z) : s.moveTo(x, z)));
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);   // outline's y becomes z, thickness points down
  geo.translate(0, t / 2, 0); // centre the thickness
  return geo;
}
const mirrorPoints = (pts) => pts.map(([x, z]) => [-x, z]).reverse();

/** Fin from an outline seen from the side ([z, y] points), `t` thick. */
function finGeometry(profile, t) {
  const s = new THREE.Shape();
  profile.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2);  // outline's x becomes z, thickness becomes x
  geo.translate(t / 2, 0, 0);
  return geo;
}

/** Round body from [radius, z] pairs, squashed sideways (sx) and up/down (sy). */
function bodyGeometry(profile, sx, sy, segments = 8) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(Math.max(r, 0.001), z));
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.rotateX(Math.PI / 2);   // lathe axis (y) becomes z
  geo.scale(sx, sy, 1);
  return geo;
}

// ------------------------------------------------------------ builder

/**
 * Builds a jet from its AIRCRAFT entry. Returns { group, flames, swing } where
 * flames are the afterburner meshes and swing (F-14 only) holds the moving wings.
 */
export function buildAircraft(spec, mats) {
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mats[mat]);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const both = (x, fn) => (x === 0 ? [fn(0)] : [fn(x), fn(-x)]);

  // Fuselage + canopy
  const f = spec.fuselage;
  add(bodyGeometry(f.profile, f.sx, f.sy), 'body');
  const c = spec.canopy;
  const canopy = add(new THREE.SphereGeometry(0.5, 8, 6), 'glass', 0, c.y, c.z);
  canopy.scale.set(c.width * 2, c.height * 2, c.length);

  // Flat surfaces (each side)
  const plate = (part, t, mat = 'body') => {
    if (!part) return;
    add(planform(part.points, t), mat, 0, part.y ?? 0, 0);
    add(planform(mirrorPoints(part.points), t), mat, 0, part.y ?? 0, 0);
  };
  plate(spec.wing, 0.16);
  plate(spec.lex, 0.12);
  plate(spec.glove, 0.2);
  plate(spec.pancake, 0.3);
  plate(spec.stab, 0.12);

  // Vertical fins
  const T = spec.tails;
  const finGeo = finGeometry(T.profile, 0.14);
  for (const x of T.x) {
    const fin = add(finGeo, 'body', x, 0, 0);
    fin.rotation.z = x === 0 ? 0 : -Math.sign(x) * T.cant; // lean outward
  }

  // Engine pods, intakes, nozzles
  for (const n of spec.nacelles ?? []) {
    both(n.x, (x) => {
      const pod = add(new THREE.CylinderGeometry(n.r, n.r * 0.9, n.z1 - n.z0, 8), 'body', x, 0, (n.z0 + n.z1) / 2);
      pod.rotation.x = Math.PI / 2;
    });
  }
  for (const it of spec.intakes ?? []) {
    both(it.x, (x) => {
      add(new THREE.BoxGeometry(it.w, it.h, it.l), 'body', x, it.y, it.z);
      add(new THREE.BoxGeometry(it.w * 0.8, it.h * 0.75, 0.05), 'dark', x, it.y, it.z - it.l / 2 - 0.01); // dark opening
    });
  }
  const flames = [];
  for (const n of spec.nozzles) {
    let noz;
    if (n.square) noz = add(new THREE.BoxGeometry(n.r * 2.2, n.r * 1.2, 0.8), 'dark', n.x, 0, n.z);
    else { noz = add(new THREE.CylinderGeometry(n.r * 0.9, n.r, 0.8, 8), 'dark', n.x, 0, n.z); noz.rotation.x = Math.PI / 2; }
    const flame = add(new THREE.ConeGeometry(n.r * 0.85, 2.6, 8).translate(0, 1.3, 0), 'flame', n.x, 0, n.z + 0.35);
    flame.rotation.x = Math.PI / 2;
    if (n.square) flame.scale.x = 1.6;
    flames.push(flame);
  }

  // Missiles on rails (decoration)
  const railGeo = new THREE.CylinderGeometry(0.13, 0.13, 2.4, 6);
  for (const [x, y, z] of spec.rails ?? []) {
    both(x, (xx) => { add(railGeo, 'light', xx, y, z).rotation.x = Math.PI / 2; });
  }

  // F-14 swing wings: each outer wing hangs from a pivot and sweeps back with speed
  let swing = null;
  if (spec.swing) {
    const S = spec.swing;
    const [px, py, pz] = S.pivot;
    swing = { min: S.min, max: S.max, sides: [] };
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(px * side, py, pz);
      const pts = side === 1 ? S.points : mirrorPoints(S.points);
      const wing = new THREE.Mesh(planform(pts, 0.14), mats.body);
      pivot.add(wing);
      g.add(pivot);
      swing.sides.push({ pivot, side });
    }
  }

  return { group: g, flames, swing };
}
