// Draws homing missiles. The server owns them; we get their positions in
// every snapshot and draw them slightly in the past, like other planes.
import * as THREE from 'three';
import { buildMissileModel } from './jetModel.js';

const FORWARD = new THREE.Vector3(0, 0, -1);
const _dir = new THREE.Vector3();
const _back = new THREE.Vector3();

export class MissileView {
  constructor(scene) {
    this.scene = scene;
    this.items = new Map(); // id -> { model, buffer: [{t, pos}], target, smokeT, gone }
  }

  /** list = [[id, x, y, z, targetId], ...] from a snapshot taken at server time t. */
  push(t, list) {
    for (const [id, x, y, z, target] of list) {
      let m = this.items.get(id);
      if (!m) {
        const model = buildMissileModel();
        model.visible = false;
        this.scene.add(model);
        m = { model, buffer: [], target, smokeT: 0, gone: false };
        this.items.set(id, m);
      }
      m.target = target;
      m.buffer.push({ t, pos: new THREE.Vector3(x, y, z) });
      if (m.buffer.length > 30) m.buffer.shift();
    }
  }

  /** The server said this missile exploded; stop drawing it (after the delay catches up). */
  remove(id) {
    const m = this.items.get(id);
    if (!m) return;
    this.scene.remove(m.model);
    this.items.delete(id);
  }

  /** Missiles currently chasing player `id`. */
  countTargeting(id) {
    let n = 0;
    for (const m of this.items.values()) if (m.target === id) n++;
    return n;
  }

  update(dt, renderTime, effects) {
    for (const m of this.items.values()) {
      const buf = m.buffer;
      if (!buf.length || renderTime < buf[0].t) { m.model.visible = false; continue; }
      let a = buf[buf.length - 1], b = null;
      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i].t <= renderTime) { a = buf[i]; b = buf[i + 1] ?? null; break; }
      }
      const prev = buf[Math.max(0, buf.indexOf(a) - 1)];
      if (b) {
        m.model.position.lerpVectors(a.pos, b.pos, (renderTime - a.t) / (b.t - a.t || 1));
        _dir.subVectors(b.pos, a.pos);
      } else {
        // No newer data: keep flying the way it was going.
        _dir.subVectors(a.pos, prev.pos);
        const speed = _dir.length() / Math.max(1, (a.t - prev.t)) ; // m per ms
        m.model.position.copy(a.pos).addScaledVector(_dir.normalize(), speed * Math.min(renderTime - a.t, 200));
      }
      if (_dir.lengthSq() > 1e-6) m.model.quaternion.setFromUnitVectors(FORWARD, _dir.normalize());
      m.model.visible = true;

      m.smokeT -= dt;
      if (m.smokeT <= 0) {
        m.smokeT = 0.02;
        _back.copy(FORWARD).applyQuaternion(m.model.quaternion).multiplyScalar(-2.5).add(m.model.position);
        effects.smokePuff(_back, { size: 0.8, life: 2.2, grow: 2.2, vel: new THREE.Vector3(0, 0.5, 0) });
      }
    }
  }
}
