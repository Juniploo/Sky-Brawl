// Machine gun logic (fire rate + overheat), shared by browser and server.
import * as THREE from 'three';
import { JET_GEOMETRY } from './planes.js';

export class Guns {
  constructor(gunStats) {
    this.g = gunStats;
    this.reset();
  }

  reset() { this.heat = 0; this.overheated = false; this.cooldown = 0; this.side = 0; }

  /** Calls fire(sideIndex) for every bullet that should come out during this step. */
  update(dt, firing, fire) {
    const g = this.g;
    this.cooldown -= dt;
    if (this.overheated && this.heat <= g.overheatRecover) this.overheated = false;

    if (firing && !this.overheated) {
      while (this.cooldown <= 0 && !this.overheated) {
        fire(this.side);
        this.side ^= 1;
        this.cooldown += 1 / g.fireRate;
        this.heat += g.heatPerShot;
        if (this.heat >= 1) { this.heat = 1; this.overheated = true; }
      }
    } else {
      this.cooldown = Math.max(0, this.cooldown);
      this.heat = Math.max(0, this.heat - g.coolRate * dt);
    }
  }
}


/** World position of gun `side` (0 = left, 1 = right). */
export function gunMuzzle(position, quaternion, stats, side, out) {
  const o = JET_GEOMETRY.gunOffsets[side];
  return out.set(o[0], o[1], o[2]).multiplyScalar(stats.modelScale).applyQuaternion(quaternion).add(position);
}

/** Bullet velocity: plane's forward direction + a little random spread + plane's own speed. */
export function bulletVelocity(forward, planeVelocity, gunStats, out) {
  const s = gunStats.spread * 2;
  out.copy(forward);
  out.x += (Math.random() - 0.5) * s;
  out.y += (Math.random() - 0.5) * s;
  out.z += (Math.random() - 0.5) * s;
  return out.normalize().multiplyScalar(gunStats.bulletSpeed).add(planeVelocity);
}

/** Does the line segment a→b pass within `radius` of `center`? */
export function segmentHitsSphere(a, b, center, radius) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = center.x - a.x, acy = center.y - a.y, acz = center.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz || 1;
  const t = Math.max(0, Math.min(1, (acx * abx + acy * aby + acz * abz) / lenSq));
  const dx = a.x + abx * t - center.x, dy = a.y + aby * t - center.y, dz = a.z + abz * t - center.z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

