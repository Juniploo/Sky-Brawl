// Visual effects: smoke trails, explosions, bullet impacts.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

export class Effects {
  constructor(scene) {
    this.scene = scene;

    // Smoke puffs: one instanced mesh holds all of them (fast).
    this.maxPuffs = 900;
    this.puffs = [];
    this.smoke = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x777777, transparent: true, opacity: 0.55, depthWrite: false, flatShading: true }),
      this.maxPuffs
    );
    this.smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.smoke.setColorAt(0, new THREE.Color(1, 1, 1)); // creates the per-puff color buffer
    this.smoke.frustumCulled = false;
    this.smoke.count = 0;
    scene.add(this.smoke);

    this.fireGeo = new THREE.IcosahedronGeometry(1, 1);
    this.fragGeo = new THREE.TetrahedronGeometry(1, 0);
    this.fragMats = new Map();
    this.fireballs = [];
    this.frags = [];

    this.flareGeo = new THREE.IcosahedronGeometry(0.9, 0);
    this.flareMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0 });
    this.flares = [];
  }

  /** A burst of burning flares dropping from a plane (pos, planeVelocity). */
  flareBurst(pos, planeVel) {
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(this.flareGeo, this.flareMat);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      const side = i % 2 === 0 ? 1 : -1;
      const vel = planeVel.clone().multiplyScalar(0.35).add(new THREE.Vector3(
        side * (8 + Math.random() * 14), -4 - Math.random() * 8, (Math.random() - 0.5) * 10));
      this.flares.push({ mesh, vel, age: -i * 0.06, life: 3, smokeT: 0 });
    }
    this.fireball(pos, 4, 0.25, 0xfff6c8);
  }

  smokePuff(pos, { size = 1, life = 2, color = 0xffffff, vel = null, grow = 2.5 } = {}) {
    if (this.puffs.length >= this.maxPuffs) this.puffs.shift();
    this.puffs.push({
      pos: pos.clone(),
      vel: vel ? vel.clone() : new THREE.Vector3((Math.random() - 0.5) * 2, 0.5 + Math.random(), (Math.random() - 0.5) * 2),
      age: 0, life, size, grow,
      color: new THREE.Color(color),
      rot: Math.random() * 6
    });
  }

  fireball(pos, size, life, color = 0xffc04a) {
    const mesh = new THREE.Mesh(this.fireGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    mesh.position.copy(pos);
    mesh.scale.setScalar(size * 0.3);
    this.scene.add(mesh);
    this.fireballs.push({ mesh, age: 0, life, size });
  }

  explosion(pos, { size = 10, color = 0xff8a2a, fragments = 16, fire = true, smoke = true } = {}) {
    if (fire) {
      this.fireball(pos, size, 0.7);
      this.fireball(pos, size * 0.6, 0.45, 0xfff3b0);
    }
    if (!this.fragMats.has(color)) this.fragMats.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true }));
    const mat = this.fragMats.get(color);
    for (let i = 0; i < fragments; i++) {
      const mesh = new THREE.Mesh(this.fragGeo, mat);
      mesh.position.copy(pos);
      const base = size * (0.06 + Math.random() * 0.08);
      mesh.scale.setScalar(base);
      this.scene.add(mesh);
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5)
        .normalize().multiplyScalar(size * (1.5 + Math.random() * 2.5));
      vel.y += size * 0.8;
      this.frags.push({ mesh, vel, age: 0, life: 1.2 + Math.random(), base, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0) });
    }
    if (smoke) {
      for (let i = 0; i < 10; i++) {
        const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * size, (Math.random() - 0.5) * size, (Math.random() - 0.5) * size));
        this.smokePuff(p, { size: size * 0.35, life: 3 + Math.random() * 2, color: 0x4a4a4a, grow: 1.5,
          vel: new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 3, (Math.random() - 0.5) * 3) });
      }
    }
  }

  spark(pos) {
    this.fireball(pos, 2.5, 0.15, 0xfff2a0);
  }

  splash(pos) {
    for (let i = 0; i < 3; i++) {
      this.smokePuff(pos, { size: 0.8, life: 0.8, color: 0xe8f8ff, grow: 2,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, 6 + Math.random() * 6, (Math.random() - 0.5) * 4) });
    }
  }

  /** One puff of a plane's smoke trail. Damaged planes leave dark smoke. */
  trail(pos, boosting, healthFrac) {
    const jitter = () => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    this.smokePuff(pos, { size: boosting ? 0.6 : 0.35, life: 1.4, grow: 2, vel: jitter() });
    if (healthFrac < 0.4 && Math.random() < 0.6) {
      this.smokePuff(pos, { size: 0.9, life: 2.2, grow: 2.5, color: 0x3a3a3a, vel: jitter().add(new THREE.Vector3(0, 2, 0)) });
    }
  }

  update(dt) {
    // Fireballs: grow and fade.
    let w = 0;
    for (const f of this.fireballs) {
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) { this.scene.remove(f.mesh); f.mesh.material.dispose(); continue; }
      f.mesh.scale.setScalar(f.size * (0.3 + t * 0.9));
      f.mesh.material.opacity = 1 - t * t;
      this.fireballs[w++] = f;
    }
    this.fireballs.length = w;

    // Fragments: fly, fall, spin, shrink.
    w = 0;
    for (const f of this.frags) {
      f.age += dt;
      if (f.age >= f.life) { this.scene.remove(f.mesh); continue; }
      f.vel.y -= 25 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += f.spin.x * dt;
      f.mesh.rotation.y += f.spin.y * dt;
      const t = f.age / f.life;
      f.mesh.scale.setScalar(f.base * (t > 0.7 ? (1 - t) / 0.3 : 1));
      this.frags[w++] = f;
    }
    this.frags.length = w;

    // Flares: fall, flicker, leave smoke.
    w = 0;
    for (const f of this.flares) {
      f.age += dt;
      if (f.age >= f.life) { this.scene.remove(f.mesh); continue; }
      if (f.age > 0) {
        f.vel.y -= 9.8 * dt;
        f.vel.multiplyScalar(Math.exp(-0.6 * dt));
        f.mesh.position.addScaledVector(f.vel, dt);
        f.mesh.scale.setScalar((1.2 - f.age / f.life) * (0.8 + Math.random() * 0.5));
        f.smokeT -= dt;
        if (f.smokeT <= 0) {
          f.smokeT = 0.05;
          this.smokePuff(f.mesh.position, { size: 0.7, life: 1.8, grow: 2.5, vel: new THREE.Vector3(0, 1, 0) });
        }
      }
      this.flares[w++] = f;
    }
    this.flares.length = w;

    // Smoke puffs.
    w = 0;
    for (const p of this.puffs) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.pos.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.exp(-1.5 * dt));
      this.puffs[w++] = p;
    }
    this.puffs.length = w;
    for (let i = 0; i < w; i++) {
      const p = this.puffs[i];
      const t = p.age / p.life;
      const scale = p.size * (1 + p.grow * t) * (t > 0.6 ? (1 - t) / 0.4 : 1);
      _q.setFromEuler(_e.set(p.rot, p.rot * 0.7, 0));
      _m.compose(p.pos, _q, _s.setScalar(scale));
      this.smoke.setMatrixAt(i, _m);
      this.smoke.setColorAt(i, p.color);
    }
    this.smoke.count = w;
    this.smoke.instanceMatrix.needsUpdate = true;
    if (this.smoke.instanceColor) this.smoke.instanceColor.needsUpdate = true;
  }
}
