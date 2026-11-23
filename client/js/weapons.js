// Bullet tracers you can see. These are visual only: the server decides hits.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _prev = new THREE.Vector3();
const TRACER_AXIS = new THREE.Vector3(0, 0, -1);

export class Tracers {
  constructor(scene, max = 800) {
    this.max = max;
    this.bullets = [];
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.22, 0.22, 7),
      new THREE.MeshBasicMaterial({ color: 0xfff0a0 }),
      max
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  spawn(position, velocity, life, own = false) {
    if (this.bullets.length >= this.max) this.bullets.shift();
    this.bullets.push({ pos: position.clone(), vel: velocity.clone(), life, own });
  }

  /** stopTest(from, to, tracer) returns true if the tracer should disappear (hit something). */
  update(dt, stopTest) {
    const list = this.bullets;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      b.life -= dt;
      _prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      if (b.life <= 0 || stopTest(_prev, b.pos, b)) continue;
      list[w++] = b;
    }
    list.length = w;

    for (let i = 0; i < w; i++) {
      const b = list[i];
      _q.setFromUnitVectors(TRACER_AXIS, _dir.copy(b.vel).normalize());
      _m.compose(b.pos, _q, _one);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
