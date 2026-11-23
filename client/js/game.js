// A multiplayer match from this player's point of view.
//
// How the netcode works (short version):
//  1. Every 1/60 s we record your input (aim, keys) and fly your plane with it
//     immediately, so controls feel instant ("prediction").
//  2. Inputs are sent to the server, which flies the *real* plane with the same code.
//  3. The server sends back where your plane really is. We jump to that and quickly
//     re-apply the inputs it hasn't seen yet ("reconciliation"). Normally the result
//     is identical, so you never notice.
//  4. Other planes are drawn 100 ms in the past, blending between server updates.
import * as THREE from 'three';
import { PLANES, JET_GEOMETRY, DEFAULT_PLANE } from '/shared/planes.js';
import { SIM_DT, createPlane, copyPlane, stepPlane, planeWarning } from '/shared/flight.js';
import { Guns, gunMuzzle, bulletVelocity, segmentHitsSphere } from '/shared/guns.js';
import { BALLOON_RADIUS } from '/shared/balloons.js';
import { INTERP_DELAY, RESPAWN_TIME, POINTS, MODES } from '/shared/protocol.js';
import { buildJetModel, updateJetFlame, enginePosition, setJetColor, disposeModel } from './jetModel.js';
import { Tracers } from './weapons.js';
import { RemotePlayers } from './remotePlayers.js';
import { BalloonView } from './balloons.js';
import { MissileView } from './missiles.js';
import { Scoreboard } from './scoreboard.js';

const MOUSE_SENSITIVITY = 0.0022;
const CAMERA_DISTANCE = 22;
const CAMERA_HEIGHT = 5;
const SEND_EVERY = 2;          // send inputs every 2 steps (30 times a second)
const UP = new THREE.Vector3(0, 1, 0);
const q3 = (v) => Math.round(v * 1000) / 1000; // inputs are rounded so server & client use identical numbers

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _look = new THREE.Vector3();

export class NetGame {
  /** ctx = { scene, camera, effects, hud, input, map, terrain } */
  constructor(ctx, socket, welcome) {
    Object.assign(this, ctx);
    this.socket = socket;
    this.myId = welcome.id;
    this.code = welcome.code;
    this.planeKey = PLANES[welcome.plane] ? welcome.plane : DEFAULT_PLANE;
    this.stats = PLANES[this.planeKey];
    const me = welcome.roster.find((r) => r.id === this.myId);
    this.color = me?.color ?? 0xff5a36;

    this.model = buildJetModel(this.color, this.planeKey);
    this.model.visible = false;
    this.scene.add(this.model);

    this.plane = createPlane();   // predicted state (latest step)
    this.prev = createPlane();    // state one step earlier (for smooth drawing between steps)
    this.guns = new Guns(this.stats.gun);
    this.alive = false;
    this.life = 0;                // goes up by one every respawn
    this.health = 0;
    this.protected = false;
    this.ping = 0;

    this.seq = 0;
    this.pending = [];            // inputs the server hasn't confirmed yet
    this.outbox = [];             // inputs waiting to be sent
    this.acc = 0;
    this.steps = 0;
    this.smokeT = 0;

    this.aim = { yaw: 0, pitch: 0 };
    this.aimDir = new THREE.Vector3(0, 0, -1);
    this.camDir = new THREE.Vector3(0, 0, -1);
    this.renderPos = new THREE.Vector3();
    this.renderQuat = new THREE.Quaternion();
    this.visualOffset = new THREE.Vector3();
    this.serverOffset = null;     // serverTime - our clock (ms)

    this.deathPos = new THREE.Vector3();
    this.killerId = null;
    this.respawnAt = 0;
    this.deathText = '';

    this.remotes = new RemotePlayers(this.scene, this.hud.labelLayer);
    this.balloons = new BalloonView(this.scene);
    this.balloons.set(welcome.balloons);
    this.tracers = new Tracers(this.scene);
    this.missileView = new MissileView(this.scene);
    this.scoreboard = new Scoreboard();
    this.delayed = [];            // effects to show once "render time" catches up with them
    this.pings = new Map();
    this.weapons = { mi: 0, fc: 0, mr: 0, fr: 0, lk: null, lp: 0 };
    this.lockedBy = false;
    this.myTeam = null;
    this.room = welcome.room;
    this.roster = new Map();
    this.setRoster(welcome.roster);

    socket.on('snap', (s) => this.onSnapshot(s));
    socket.on('roster', (r) => this.setRoster(r));
    socket.on('room', (r) => this.setRoomState(r));
  }

  setRoomState(r) {
    const oldMap = this.room.map;
    this.room = r;
    if (r.map !== oldMap) this.onMapChange?.(r.map); // main.js rebuilds the scenery
    this.onRoomChange?.(r); // lets the menu update host controls
  }

  /** Switch to a different plane type (happens when we respawn with a new choice). */
  setPlane(planeKey) {
    if (!PLANES[planeKey] || planeKey === this.planeKey) return;
    this.planeKey = planeKey;
    this.stats = PLANES[planeKey];
    this.guns = new Guns(this.stats.gun);
    this.scene.remove(this.model);
    disposeModel(this.model);
    this.model = buildJetModel(this.color, planeKey);
    this.scene.add(this.model);
  }

  /** The scenery changed under us (host picked a new map). */
  setMap(map, terrain) {
    this.map = map;
    this.terrain = terrain;
  }

  get isHost() { return this.room.hostId === this.myId; }

  /** Run fn when the delayed "render time" reaches server time t (keeps effects in sync with what you see). */
  later(t, fn) { this.delayed.push({ t, fn }); }

  // ------------------------------------------------------------ server messages

  setRoster(list) {
    this.roster = new Map(list.map((r) => [r.id, r]));
    this.remotes.sync(list, this.myId);
    this.hud.setRoom(this.code, list.length);
    const me = this.roster.get(this.myId);
    if (me) {
      this.myTeam = me.team;
      this.color = me.color;
      setJetColor(this.model, me.color);
    }
  }

  nameOf(id) { return this.roster.get(id)?.name ?? 'Someone'; }
  serverNow() { return performance.now() + (this.serverOffset ?? 0); }

  onSnapshot(s) {
    const sample = s.t - performance.now();
    if (this.serverOffset === null) this.serverOffset = sample;
    else this.serverOffset += (sample - this.serverOffset) * 0.05;

    for (const e of s.e) this.onEvent(e, s.t);
    this.lockedBy = false;
    for (const p of s.p) {
      this.pings.set(p.i, p.pg);
      if (p.i === this.myId) this.onOwnState(p);
      else {
        this.remotes.push(s.t, p);
        if (p.lk === this.myId && p.lp > 0.15) this.lockedBy = true;
      }
    }
    if (s.m) this.missileView.push(s.t, s.m);
  }

  onOwnState(p) {
    this.health = p.h;
    const w = this.weapons;
    w.mi = p.mi; w.fc = p.fc; w.mr = p.mr; w.fr = p.fr; w.lk = p.lk; w.lp = p.lp;
    this.protected = p.pr === 1;
    this.ping = p.pg;
    while (this.pending.length && this.pending[0].s <= p.s) this.pending.shift();

    if (!p.a) {
      if (this.alive) { this.alive = false; this.model.visible = false; }
      return;
    }

    if (p.l !== this.life) {
      // We (re)spawned.
      this.setPlane(p.pk);
      this.life = p.l;
      this.alive = true;
      this.netToPlane(p, this.plane);
      this.replay();
      copyPlane(this.prev, this.plane);
      this.visualOffset.set(0, 0, 0);
      const f = this.plane.forward;
      this.aim.yaw = Math.atan2(-f.x, -f.z);
      this.aim.pitch = Math.asin(THREE.MathUtils.clamp(f.y, -1, 1));
      this.updateAimDir();
      this.camDir.copy(this.aimDir);
      this.guns.reset();
      this.hud.message('');
      return;
    }

    // Reconcile: take the server's truth, re-apply unconfirmed inputs, and smooth any difference.
    const before = _a.copy(this.plane.position);
    this.netToPlane(p, this.plane);
    this.replay();
    const delta = _b.copy(before).sub(this.plane.position);
    if (delta.lengthSq() > 30 * 30) this.visualOffset.set(0, 0, 0); // big desync: just snap
    else this.visualOffset.add(delta);
    this.prev.position.sub(delta);
  }

  netToPlane(p, plane) {
    plane.position.set(p.x, p.y, p.z);
    plane.quaternion.set(p.q[0], p.q[1], p.q[2], p.q[3]).normalize();
    plane.forward.set(0, 0, -1).applyQuaternion(plane.quaternion);
    plane.speed = p.v;
    plane.velocity.copy(plane.forward).multiplyScalar(p.v);
    plane.throttle = p.th;
    plane.boostFuel = p.bf;
    plane.boosting = p.bo === 1;
    plane.rates.pitch = p.rp;
    plane.rates.yaw = p.ry;
    plane.rates.roll = p.rr;
  }

  replay() {
    for (const inp of this.pending) {
      stepPlane(this.plane, this.stats, this.map, inp, SIM_DT, inp.l === this.life);
    }
  }

  positionOf(id) {
    if (id === this.myId) return this.alive ? this.renderPos : null;
    const r = this.remotes.get(id);
    return r && r.alive ? r.position : null;
  }

  onEvent(e, t) {
    const me = this.myId;
    switch (e.k) {
      case 's': { // someone fired
        if (e.id === me) break; // our own bullets were already drawn instantly
        const r = this.remotes.get(e.id);
        if (!r || !r.alive) break;
        gunMuzzle(r.position, r.quaternion, r.stats, e.s, _muzzle);
        bulletVelocity(r.forward, r.velocity, r.stats.gun, _vel);
        this.tracers.spawn(_muzzle, _vel, r.stats.gun.range / r.stats.gun.bulletSpeed, false);
        this.sound.gun(r.position);
        break;
      }
      case 'h': { // a plane was hit
        const pos = this.positionOf(e.id);
        if (pos) this.effects.spark(pos);
        if (e.by === me) { this.hud.hitMarker(false); this.sound.hit(); }
        if (e.id === me) { this.hud.damageFlash(); this.sound.ouch(); }
        break;
      }
      case 'kill': {
        const victim = this.nameOf(e.id), killer = this.nameOf(e.by);
        const pos = e.id === me ? (this.positionOf(me) ?? _a.set(e.x, e.y, e.z)).clone() : new THREE.Vector3(e.x, e.y, e.z);
        const boom = () => {
          const at = e.id === me ? pos : (this.positionOf(e.id) ?? pos).clone();
          this.effects.explosion(at, { size: 16, color: 0x555555, fragments: 22 });
          this.sound.explosion(e.id === me ? null : at, true);
        };
        if (e.id === me) boom(); else this.later(t, boom); // others are drawn 100 ms behind
        let text;
        if (e.how === 'gun') text = `${killer} shot down ${victim}`;
        else if (e.how === 'missile') text = `${killer} shot down ${victim} with a missile`;
        else if (e.how === 'forced') text = `${killer} forced ${victim} down`;
        else text = `${victim} crashed`;
        this.hud.feed(text, e.by === me || e.id === me);
        if (e.by === me && e.id !== me) {
          this.hud.hitMarker(true);
          this.sound.kill();
          this.hud.notice(`You shot down ${victim}!  +${POINTS.kill}`);
        }
        if (e.id === me) {
          this.alive = false;
          this.model.visible = false;
          this.deathPos.copy(pos);
          this.killerId = e.how === 'crash' ? null : e.by;
          this.respawnAt = performance.now() + RESPAWN_TIME * 1000;
          this.deathText = e.how === 'crash' ? 'You crashed' : `Shot down by ${killer}`;
        }
        break;
      }
      case 'bh': { // balloon hit
        const b = this.balloons.get(e.id);
        if (!b) break;
        if (e.by === me) { this.hud.hitMarker(e.pop); this.sound.hit(); }
        if (e.pop) {
          this.effects.explosion(b.group.position.clone(), { size: 9, color: b.data.color, fragments: 18, fire: false, smoke: false });
          this.sound.explosion(b.group.position, false);
          this.balloons.remove(e.id);
          if (e.by === me) this.hud.feed(`Balloon popped  +${POINTS.balloon}`);
        } else {
          this.effects.spark(b.group.position);
          this.balloons.flash(e.id);
        }
        break;
      }
      case 'wave':
        this.balloons.set(e.balloons);
        this.hud.feed('New balloon wave!');
        break;
      case 'ml': // missile launched
        if (e.by === me) { this.hud.notice('Missile away!'); this.sound.missileLaunch(); }
        else { const r = this.remotes.get(e.by); if (r) this.sound.missileLaunch(r.position); }
        break;
      case 'mx': // missile exploded
        this.later(t, () => {
          this.missileView.remove(e.id);
          const at = new THREE.Vector3(e.x, e.y, e.z);
          this.effects.explosion(at, { size: e.hit ? 12 : 7, color: 0x444444, fragments: 8 });
          this.sound.explosion(at, false);
        });
        break;
      case 'fl': // someone popped flares
        if (e.id === me) {
          if (this.alive) { this.effects.flareBurst(this.renderPos, this.plane.velocity); this.sound.flare(); }
        } else {
          this.later(t, () => {
            const r = this.remotes.get(e.id);
            if (r && r.alive) { this.effects.flareBurst(r.position, r.velocity); this.sound.flare(r.position); }
          });
        }
        break;
      case 'start':
        this.hud.feed(`New match: ${MODES[e.mode].name}!`, true);
        this.hud.notice(MODES[e.mode].name.toUpperCase());
        this.delayed.length = 0;
        for (const id of [...this.missileView.items.keys()]) this.missileView.remove(id);
        break;
      case 'end':
        this.hud.feed('Match over!', true);
        break;
      case 'join':
        if (e.id !== me) this.hud.feed(`${e.name} joined`);
        break;
      case 'leave':
        this.hud.feed(`${e.name} left`);
        break;
    }
  }

  // ------------------------------------------------------------ local simulation

  updateAimDir() {
    const cp = Math.cos(this.aim.pitch);
    this.aimDir.set(-Math.sin(this.aim.yaw) * cp, Math.sin(this.aim.pitch), -Math.cos(this.aim.yaw) * cp);
  }

  fixedStep() {
    const input = this.input;
    const inp = {
      s: ++this.seq, l: this.life,
      x: q3(this.aimDir.x), y: q3(this.aimDir.y), z: q3(this.aimDir.z),
      u: input.throttleUp ? 1 : 0, d: input.throttleDown ? 1 : 0,
      r: input.roll, b: input.boost ? 1 : 0, f: input.fire ? 1 : 0,
      m: input.missile ? 1 : 0, fl: input.flare ? 1 : 0
    };
    if (this.alive) {
      copyPlane(this.prev, this.plane);
      stepPlane(this.plane, this.stats, this.map, inp, SIM_DT, true);
      this.guns.update(SIM_DT, inp.f === 1, (side) => this.fireOwn(side));
    }
    this.pending.push(inp);
    if (this.pending.length > 300) this.pending.shift();
    this.outbox.push(inp);
    if (++this.steps % SEND_EVERY === 0) {
      this.socket.emit('in', this.outbox);
      this.outbox = [];
    }
  }

  fireOwn(side) {
    const g = this.stats.gun;
    gunMuzzle(this.plane.position, this.plane.quaternion, this.stats, side, _muzzle);
    bulletVelocity(this.plane.forward, this.plane.velocity, g, _vel);
    this.tracers.spawn(_muzzle, _vel, g.range / g.bulletSpeed, true);
    this.sound.gun();
  }

  tracerStop(from, to, tracer) {
    for (const r of this.remotes.players.values()) {
      if (r.team && r.team === this.myTeam) continue; // no friendly fire: bullets pass through
      if (r.alive && segmentHitsSphere(from, to, r.position, JET_GEOMETRY.hitRadius * r.stats.modelScale)) return true;
    }
    if (!tracer.own && this.alive && segmentHitsSphere(from, to, this.renderPos, JET_GEOMETRY.hitRadius * this.stats.modelScale)) return true;
    for (const b of this.balloons.items.values()) {
      if (segmentHitsSphere(from, to, b.group.position, BALLOON_RADIUS)) return true;
    }
    const ground = this.terrain.heightAt(to.x, to.z);
    if (to.y < this.map.waterLevel && ground < this.map.waterLevel) {
      this.effects.splash(_a.set(to.x, this.map.waterLevel, to.z));
      return true;
    }
    if (to.y < ground) {
      this.effects.smokePuff(to, { size: 0.8, life: 0.8, color: 0xc8b48a });
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ every frame

  update(dt) {
    const now = performance.now();
    const { dx, dy } = this.input.consumeMouse();
    if (this.alive) {
      this.aim.yaw -= dx * MOUSE_SENSITIVITY;
      this.aim.pitch = THREE.MathUtils.clamp(this.aim.pitch - dy * MOUSE_SENSITIVITY, -1.35, 1.35);
    }
    this.updateAimDir();

    this.acc += dt;
    let n = 0;
    while (this.acc >= SIM_DT && n < 15) { this.fixedStep(); this.acc -= SIM_DT; n++; }
    if (n >= 15) this.acc = 0;
    const alpha = this.acc / SIM_DT;

    // Our plane
    this.visualOffset.multiplyScalar(Math.exp(-8 * dt));
    if (this.alive) {
      this.renderPos.lerpVectors(this.prev.position, this.plane.position, alpha).add(this.visualOffset);
      this.renderQuat.slerpQuaternions(this.prev.quaternion, this.plane.quaternion, alpha);
      const floor = this.terrain.surfaceAt(this.renderPos.x, this.renderPos.z) + 1;
      if (this.renderPos.y < floor) this.renderPos.y = floor;
      this.model.position.copy(this.renderPos);
      this.model.quaternion.copy(this.renderQuat);
      this.model.visible = !(this.protected && Math.floor(now / 120) % 2 === 0);
      updateJetFlame(this.model, this.plane.throttle, this.plane.boosting);
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.025;
        this.effects.trail(enginePosition(this.renderPos, this.renderQuat, this.stats.modelScale),
          this.plane.boosting, this.health / this.stats.health);
      }
    }

    // Everyone and everything else, drawn slightly in the past
    const renderTime = this.serverNow() - INTERP_DELAY;
    while (this.delayed.length && this.delayed[0].t <= renderTime) this.delayed.shift().fn();
    this.remotes.update(dt, renderTime, this.camera, this.effects, now);
    this.missileView.update(dt, renderTime, this.effects);
    this.balloons.update(dt, renderTime / 1000);
    this.tracers.update(dt, (a, b, t) => this.tracerStop(a, b, t));

    this.updateCamera(dt);
    this.updateHud(dt, now);
    this.updateSound(dt);
  }

  updateSound(dt) {
    const s = this.sound;
    s.setListener(this.camera);
    s.engine(this.plane.throttle, this.plane.boosting, this.alive);
    const lp = this.alive ? this.weapons.lp : 0;
    s.setLock(lp >= 1 ? 'locked' : lp > 0 ? 'locking' : 'none');
    s.setWarning(this.hud.lastThreat || 'none');
    s.update(dt);
  }

  updateCamera(dt) {
    const camera = this.camera;
    if (!this.alive) {
      const killer = this.killerId ? this.remotes.get(this.killerId) : null;
      camera.lookAt(killer && killer.alive ? killer.position : this.deathPos); // kill cam
      return;
    }
    this.camDir.lerp(this.aimDir, 1 - Math.exp(-10 * dt)).normalize();
    camera.position.copy(this.renderPos)
      .addScaledVector(this.camDir, -CAMERA_DISTANCE * this.stats.modelScale)
      .addScaledVector(UP, CAMERA_HEIGHT);
    const floor = this.terrain.surfaceAt(camera.position.x, camera.position.z) + 2;
    if (camera.position.y < floor) camera.position.y = floor;
    camera.lookAt(_look.copy(this.renderPos).addScaledVector(this.camDir, 150));

    const targetFov = 70 + (this.plane.boosting ? 12 : 0);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-4 * dt));
      camera.updateProjectionMatrix();
    }
  }

  toScreen(worldPos) {
    const v = _a.copy(worldPos).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  }

  updateHud(dt, now) {
    const hud = this.hud;
    const me = this.roster.get(this.myId);
    const alive = this.alive;
    hud.setAim(alive ? this.toScreen(_b.copy(this.renderPos).addScaledVector(this.aimDir, 600)) : null);
    hud.setBoresight(alive ? this.toScreen(_b.copy(this.renderPos).addScaledVector(this.plane.forward, 600)) : null);

    if (!alive && this.respawnAt) {
      const left = Math.max(0, Math.ceil((this.respawnAt - now) / 1000));
      hud.message(`${this.deathText}\nRespawning in ${left}...`);
    }
    const warn = alive ? planeWarning(this.plane, this.map) : '';
    hud.warning(warn === 'boundary' ? 'LEAVING BATTLE AREA — TURNING BACK' : warn === 'ceiling' ? 'MAX ALTITUDE' : '');
    hud.setPing(this.ping);

    // Lock-on box, threat warnings, missiles & flares
    const w = this.weapons;
    const lockTarget = alive && w.lk ? this.remotes.get(w.lk) : null;
    hud.setLock(lockTarget && lockTarget.alive ? this.toScreen(lockTarget.position) : null, w.lp);
    const incoming = alive && this.missileView.countTargeting(this.myId) > 0;
    hud.setThreat(incoming ? 'missile' : alive && this.lockedBy ? 'lock' : '');
    hud.setWeapons(w.mi, this.stats.missiles, w.mr > 0, w.fc, this.stats.flares, w.fr > 0);

    // Match timer and scoreboard
    const serverNow = this.serverNow();
    const room = this.room;
    const ended = room.state === 'ended';
    hud.setMatch(MODES[room.mode].short, (room.endsAt - serverNow) / 1000, ended, room.teamKills);
    this.scoreboard.show(this.input.scoreboard || ended);
    this.scoreboard.render({ roster: this.roster, room, myId: this.myId, pings: this.pings, serverNow }, now);

    hud.update({
      score: me?.score ?? 0, kills: me?.kills ?? 0, deaths: me?.deaths ?? 0,
      balloons: this.balloons.count,
      speed: alive ? this.plane.speed : 0,
      altitude: alive ? this.renderPos.y : 0,
      health: alive ? this.health / this.stats.health : 0,
      throttle: this.plane.throttle,
      heat: this.guns.heat, overheated: this.guns.overheated,
      boost: this.plane.boostFuel / this.stats.boostFuel
    }, dt);
  }
}
