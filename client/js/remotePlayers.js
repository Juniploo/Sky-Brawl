// Other players' planes. The server sends their position ~30 times a second;
// we draw them slightly in the past and blend between updates, so they glide smoothly.
import * as THREE from 'three';
import { PLANES, DEFAULT_PLANE } from '/shared/planes.js';
import { colorToCss, TEAMS } from '/shared/protocol.js';
import { buildJetModel, updateJetFlame, enginePosition, setJetColor, disposeModel } from './jetModel.js';

const FORWARD = new THREE.Vector3(0, 0, -1);
const _v = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export class RemotePlayers {
  constructor(scene, labelLayer) {
    this.scene = scene;
    this.layer = labelLayer;
    this.players = new Map();
  }

  /** Create/remove planes to match the room's player list. */
  sync(roster, myId) {
    const ids = new Set();
    const myTeam = roster.find((r) => r.id === myId)?.team ?? null;
    for (const info of roster) {
      if (info.id === myId) continue;
      ids.add(info.id);
      let r = this.players.get(info.id);
      if (!r) {
        const stats = PLANES[info.plane] ?? PLANES.starter;
        const model = buildJetModel(info.color, PLANES[info.plane] ? info.plane : DEFAULT_PLANE);
        model.visible = false;
        this.scene.add(model);
        const label = document.createElement('div');
        label.className = 'nametag';
        label.innerHTML = '<span class="name"></span><div class="hp"><div></div></div>';
        this.layer.appendChild(label);
        r = {
          id: info.id, model, label, stats,
          nameEl: label.querySelector('.name'), hpEl: label.querySelector('.hp div'),
          buffer: [], smokeT: 0,
          position: model.position, quaternion: model.quaternion,
          forward: new THREE.Vector3(0, 0, -1), velocity: new THREE.Vector3(),
          alive: false, health: 1, protected: false
        };
        this.players.set(info.id, r);
      }
      r.name = info.name;
      r.team = info.team;
      if (r.color !== info.color) { r.color = info.color; setJetColor(r.model, info.color); }
      r.nameEl.textContent = info.name;
      r.nameEl.style.color = info.team ? TEAMS[info.team].css : colorToCss(info.color);
      r.label.classList.toggle('ally', !!info.team && info.team === myTeam);
    }
    for (const [id, r] of this.players) {
      if (!ids.has(id)) {
        this.scene.remove(r.model);
        r.label.remove();
        this.players.delete(id);
      }
    }
  }

  get(id) { return this.players.get(id); }

  /** They respawned in a different plane: swap the model. */
  setPlane(r, planeKey) {
    if (!PLANES[planeKey] || r.model.userData.planeKey === planeKey) return;
    const visible = r.model.visible;
    this.scene.remove(r.model);
    disposeModel(r.model);
    r.stats = PLANES[planeKey];
    r.model = buildJetModel(r.color ?? 0xffffff, planeKey);
    r.model.visible = visible;
    r.position = r.model.position;
    r.quaternion = r.model.quaternion;
    this.scene.add(r.model);
  }

  push(t, e) {
    const r = this.players.get(e.i);
    if (!r) return;
    if (e.pk) this.setPlane(r, e.pk);
    r.buffer.push({
      t, life: e.l, alive: e.a === 1,
      pos: new THREE.Vector3(e.x, e.y, e.z),
      quat: new THREE.Quaternion(e.q[0], e.q[1], e.q[2], e.q[3]),
      speed: e.v, throttle: e.th, boosting: e.bo === 1, health: e.h, protected: e.pr === 1
    });
    while (r.buffer.length > 2 && r.buffer[0].t < t - 1500) r.buffer.shift();
  }

  /** renderTime = server time (ms) we are drawing at. */
  update(dt, renderTime, camera, effects, nowMs) {
    for (const r of this.players.values()) {
      const buf = r.buffer;
      if (buf.length === 0) continue;

      let a = null, b = null;
      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i].t <= renderTime) { a = buf[i]; b = buf[i + 1] ?? null; break; }
      }
      let latest;
      if (!a) {
        latest = buf[0];
        r.position.copy(latest.pos);
        r.quaternion.copy(latest.quat);
      } else if (!b || a.life !== b.life || !a.alive) {
        // No newer update yet (or they just respawned): extrapolate a little.
        latest = b && a.life !== b.life ? b : a;
        r.quaternion.copy(latest.quat);
        _fwd.copy(FORWARD).applyQuaternion(latest.quat);
        const ahead = latest === a ? Math.min(renderTime - a.t, 250) / 1000 : 0;
        r.position.copy(latest.pos).addScaledVector(_fwd, latest.speed * ahead);
      } else {
        latest = b;
        const k = (renderTime - a.t) / (b.t - a.t || 1);
        r.position.lerpVectors(a.pos, b.pos, k);
        r.quaternion.slerpQuaternions(a.quat, b.quat, k);
      }

      r.alive = latest.alive;
      r.health = latest.health / r.stats.health;
      r.protected = latest.protected;
      r.forward.copy(FORWARD).applyQuaternion(r.quaternion);
      r.velocity.copy(r.forward).multiplyScalar(latest.speed);
      const blink = r.protected && Math.floor(nowMs / 120) % 2 === 0;
      r.model.visible = r.alive && !blink;
      updateJetFlame(r.model, latest.throttle, latest.boosting);

      if (r.alive) {
        r.smokeT -= dt;
        if (r.smokeT <= 0) {
          r.smokeT = 0.03;
          effects.trail(enginePosition(r.position, r.quaternion, r.stats.modelScale), latest.boosting, r.health);
        }
      }

      // Name tag above the plane
      _v.copy(r.position);
      _v.y += 7 * r.stats.modelScale;
      const dist = camera.position.distanceTo(r.position);
      _v.project(camera);
      if (!r.alive || _v.z > 1 || dist > 2200) {
        r.label.style.display = 'none';
      } else {
        r.label.style.display = '';
        r.label.style.transform = `translate(${(_v.x + 1) / 2 * innerWidth}px, ${(1 - _v.y) / 2 * innerHeight}px) translate(-50%, -100%)`;
        r.label.style.opacity = dist > 1200 ? 0.6 : 1;
        r.hpEl.style.width = `${Math.max(0, r.health) * 100}%`;
      }
    }
  }
}
