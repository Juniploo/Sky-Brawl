// Fighter jet models (low-poly versions of real jets: see aircraft.js for their shapes).
// To use your own model later: load a GLTF with GLTFLoader and return it from
// buildJetModel instead. Keep the nose pointing toward -Z, put the flame meshes
// in userData.flames, and update JET_GEOMETRY in shared/planes.js to match.
import * as THREE from 'three';
import { JET_GEOMETRY, PLANES, DEFAULT_PLANE } from '/shared/planes.js';
import { AIRCRAFT, buildAircraft } from './aircraft.js';

function materials(color) {
  return {
    body: new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide }),
    dark: new THREE.MeshLambertMaterial({ color: 0x2c2f36, flatShading: true, side: THREE.DoubleSide }),
    inside: new THREE.MeshLambertMaterial({ color: 0x15171c, flatShading: true, side: THREE.DoubleSide }), // intake tunnels
    light: new THREE.MeshLambertMaterial({ color: 0xf2f2f2, flatShading: true }),
    glass: new THREE.MeshPhongMaterial({ color: 0x3a5f7a, shininess: 140, specular: 0xbfe6ff, flatShading: true }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffa13d, transparent: true, opacity: 0.85 })
  };
}

/** planeKey picks the jet ('f16', 'f22', 'fa18', 'f15', 'f14' — see shared/planes.js). */
export function buildJetModel(color = 0xff5a36, planeKey = DEFAULT_PLANE) {
  const key = AIRCRAFT[planeKey] ? planeKey : DEFAULT_PLANE;
  const mats = materials(color);
  const { group, flames, swing } = buildAircraft(AIRCRAFT[key], mats);
  const scale = PLANES[key]?.modelScale ?? 1;
  group.scale.setScalar(scale);
  group.userData = { flames, swing, scale, bodyMat: mats.body, planeKey: key, sweep: swing?.min ?? 0 };
  return group;
}

export function disposeModel(model) {
  model.traverse((c) => {
    c.geometry?.dispose();
    if (c.material) [].concat(c.material).forEach((m) => m.dispose());
  });
}

/** Afterburner flames follow the throttle; F-14 wings sweep back as you go faster. */
export function updateJetFlame(model, throttle, boosting) {
  const f = 0.35 + throttle * 0.8 + (boosting ? 1.2 : 0);
  for (const flame of model.userData.flames) {
    flame.scale.y = f * (0.9 + Math.random() * 0.2);
    flame.material.color.setHex(boosting ? 0x7fd8ff : 0xffa13d);
  }
  const sw = model.userData.swing;
  if (sw) {
    const target = sw.min + (sw.max - sw.min) * Math.min(1, throttle * 0.6 + (boosting ? 0.6 : 0));
    model.userData.sweep += (target - model.userData.sweep) * 0.05;
    for (const { pivot, side } of sw.sides) pivot.rotation.y = -side * model.userData.sweep;
  }
}

const _e = new THREE.Vector3();
/** World position of the engine exhaust (for smoke trails). */
export function enginePosition(position, quaternion, scale, out = _e) {
  const o = JET_GEOMETRY.engineOffset;
  return out.set(o[0], o[1], o[2]).multiplyScalar(scale).applyQuaternion(quaternion).add(position);
}

/** Repaint a jet (used when teams change). */
export function setJetColor(model, color) {
  model.userData.bodyMat.color.setHex(color);
}

/** Placeholder missile: white body, red nose, little fins, flame. Points toward -Z. */
export function buildMissileModel() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f4f4, flatShading: true });
  const red = new THREE.MeshLambertMaterial({ color: 0xe03030, flatShading: true });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 3, 6), white);
  body.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 6), red);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.9;
  const fins = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.5), red);
  fins.position.z = 1.2;
  const fins2 = fins.clone();
  fins2.rotation.z = Math.PI / 2;
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 1.6, 6).translate(0, 0.8, 0),
    new THREE.MeshBasicMaterial({ color: 0xffd060 })
  );
  flame.rotation.x = Math.PI / 2;
  flame.position.z = 1.5;
  g.add(body, nose, fins, fins2, flame);
  g.scale.setScalar(1.4);
  return g;
}
