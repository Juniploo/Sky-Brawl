// Arcade flight model, shared by browser and server.
// The server runs this to decide where everyone really is; the browser runs
// the exact same code to predict your own plane instantly (no input lag).
import * as THREE from 'three';

export const SIM_DT = 1 / 60; // one input = one 1/60 s step, on both sides

const FORWARD = new THREE.Vector3(0, 0, -1);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const _target = new THREE.Vector3();
const _local = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _inv = new THREE.Quaternion();
const _rot = new THREE.Quaternion();
const AGGRESSIVE_ANGLE = THREE.MathUtils.degToRad(12);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export function createPlane() {
  return {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    forward: new THREE.Vector3(0, 0, -1),
    velocity: new THREE.Vector3(),
    speed: 0,
    throttle: 0.6,
    boostFuel: 0,
    boosting: false,
    rates: { pitch: 0, yaw: 0, roll: 0 } // smoothed control inputs
  };
}

export function copyPlane(dst, src) {
  dst.position.copy(src.position);
  dst.quaternion.copy(src.quaternion);
  dst.forward.copy(src.forward);
  dst.velocity.copy(src.velocity);
  dst.speed = src.speed;
  dst.throttle = src.throttle;
  dst.boostFuel = src.boostFuel;
  dst.boosting = src.boosting;
  dst.rates.pitch = src.rates.pitch;
  dst.rates.yaw = src.rates.yaw;
  dst.rates.roll = src.rates.roll;
}

export function spawnPlane(p, stats, position, yaw) {
  p.position.copy(position);
  p.quaternion.setFromAxisAngle(Y_AXIS, yaw);
  p.forward.copy(FORWARD).applyQuaternion(p.quaternion);
  p.throttle = 0.6;
  p.speed = stats.minSpeed + p.throttle * (stats.maxSpeed - stats.minSpeed);
  p.velocity.copy(p.forward).multiplyScalar(p.speed);
  p.boostFuel = stats.boostFuel;
  p.boosting = false;
  p.rates.pitch = p.rates.yaw = p.rates.roll = 0;
}

/** '' when fine, otherwise which limit the plane is breaking. */
export function planeWarning(p, map) {
  if (Math.hypot(p.position.x, p.position.z) > map.boundary) return 'boundary';
  if (p.position.y > map.ceiling) return 'ceiling';
  return '';
}

/**
 * Advance a plane by one step.
 * input: { x, y, z: aim direction, u/d: throttle up/down (0/1), r: roll (-1/0/1), b: boost (0/1) }
 * steer: false = ignore the aim and fly straight (used for stale inputs after a respawn)
 */
export function stepPlane(p, stats, map, input, dt, steer = true) {
  // --- Throttle & boost ---
  if (input.u) p.throttle += dt * 0.7;
  if (input.d) p.throttle -= dt * 0.7;
  p.throttle = clamp(p.throttle, 0, 1);

  p.boosting = !!input.b && p.boostFuel > 0;
  if (p.boosting) p.boostFuel = Math.max(0, p.boostFuel - dt);
  else if (!input.b) p.boostFuel = Math.min(stats.boostFuel, p.boostFuel + stats.boostRecharge * dt);

  let targetSpeed = p.boosting ? stats.boostSpeed : stats.minSpeed + p.throttle * (stats.maxSpeed - stats.minSpeed);
  targetSpeed -= p.forward.y * 25; // a little slower climbing, faster diving
  p.speed += (targetSpeed - p.speed) * damp(p.boosting ? 2.5 : 1.2, dt);

  // --- Where to steer ---
  if (steer) _target.set(input.x, input.y, input.z);
  else _target.copy(p.forward);
  if (_target.lengthSq() < 1e-6) _target.copy(p.forward);
  _target.normalize();
  const warn = planeWarning(p, map);
  if (warn === 'boundary') _target.set(-p.position.x, 0, -p.position.z).normalize();
  if (p.position.y > map.ceiling) { _target.y = Math.min(_target.y, -0.4); _target.normalize(); }

  // --- Steering toward the target ---
  _inv.copy(p.quaternion).invert();
  _local.copy(_target).applyQuaternion(_inv); // target in the plane's own space
  const angleOff = Math.acos(clamp(-_local.z, -1, 1));

  let lx = _local.x, ly = _local.y;
  if (_local.z > -0.3) {
    // Far off to the side or behind: turn as hard as possible.
    const len = Math.hypot(lx, ly) || 1;
    lx /= len; ly /= len;
  } else {
    lx = clamp(lx * 4, -1, 1);
    ly = clamp(ly * 4, -1, 1);
  }

  _right.copy(X_AXIS).applyQuaternion(p.quaternion);
  _up.copy(Y_AXIS).applyQuaternion(p.quaternion);
  // Positive roll = bank right.
  let wingsLevel = clamp(_right.y * 2, -1, 1);
  if (_up.y < 0) wingsLevel = _right.y >= 0 ? 1 : -1; // upside down: roll back upright
  const aggressive = clamp(lx * 2.5, -1, 1);
  const influence = clamp(angleOff / AGGRESSIVE_ANGLE, 0, 1);
  let rollIn = wingsLevel + (aggressive - wingsLevel) * influence;
  const manualRoll = clamp(Number(input.r) || 0, -1, 1);
  if (manualRoll !== 0) rollIn = manualRoll; // A/D overrides

  const k = damp(8, dt);
  p.rates.pitch += (ly - p.rates.pitch) * k;
  p.rates.yaw += (lx - p.rates.yaw) * k;
  p.rates.roll += (rollIn - p.rates.roll) * k;

  // Rotate around the plane's own axes (post-multiply = local space).
  p.quaternion.multiply(_rot.setFromAxisAngle(X_AXIS, p.rates.pitch * stats.pitchRate * dt));
  p.quaternion.multiply(_rot.setFromAxisAngle(Y_AXIS, -p.rates.yaw * stats.yawRate * dt));
  p.quaternion.multiply(_rot.setFromAxisAngle(Z_AXIS, -p.rates.roll * stats.rollRate * dt));
  p.quaternion.normalize();

  // --- Move forward ---
  p.forward.copy(FORWARD).applyQuaternion(p.quaternion);
  p.velocity.copy(p.forward).multiplyScalar(p.speed);
  p.position.addScaledVector(p.velocity, dt);
}
