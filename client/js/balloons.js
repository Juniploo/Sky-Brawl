// Draws the target balloons. Where they are comes from shared/balloons.js,
// whether they're hit/popped comes from the server.
import * as THREE from 'three';
import { balloonPos } from '/shared/balloons.js';

const envelopeGeo = new THREE.IcosahedronGeometry(7, 1);
const basketGeo = new THREE.BoxGeometry(2.4, 1.8, 2.4);
const basketMat = new THREE.MeshLambertMaterial({ color: 0x8a5a35, flatShading: true });
const ropeMat = new THREE.LineBasicMaterial({ color: 0x333333 });
const ropeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -8, 0), new THREE.Vector3(0, -12, 0)]);

export class BalloonView {
  constructor(scene) {
    this.scene = scene;
    this.items = new Map(); // id -> { data, group, envMat, flash }
  }

  get count() { return this.items.size; }

  set(list) {
    for (const id of [...this.items.keys()]) this.remove(id);
    for (const data of list) {
      const group = new THREE.Group();
      const envMat = new THREE.MeshLambertMaterial({ color: data.color, flatShading: true });
      const envelope = new THREE.Mesh(envelopeGeo, envMat);
      envelope.scale.y = 1.2;
      const basket = new THREE.Mesh(basketGeo, basketMat);
      basket.position.y = -13;
      group.add(envelope, basket, new THREE.Line(ropeGeo, ropeMat));
      this.scene.add(group);
      this.items.set(data.id, { data, group, envMat, flash: 0 });
    }
  }

  get(id) { return this.items.get(id); }

  flash(id) {
    const b = this.items.get(id);
    if (b) b.flash = 1;
  }

  remove(id) {
    const b = this.items.get(id);
    if (!b) return null;
    this.scene.remove(b.group);
    b.envMat.dispose();
    this.items.delete(id);
    return b;
  }

  /** t = server time in seconds (already delayed like other planes). */
  update(dt, t) {
    for (const b of this.items.values()) {
      balloonPos(b.data, t, b.group.position);
      b.group.rotation.y += dt * 0.3;
      if (b.flash > 0) {
        b.flash = Math.max(0, b.flash - dt * 6);
        b.envMat.emissive.setScalar(b.flash * 0.6);
      }
    }
  }
}
