// One game room. The server is the referee: it runs every plane's flight
// from the players' inputs, moves bullets and missiles, decides hits,
// health, kills, lock-ons, the match timer and who wins.
import * as THREE from 'three';
import { PLANES, DEFAULT_PLANE, JET_GEOMETRY, MISSILE, FLARE } from '../shared/planes.js';
import { MAPS, DEFAULT_MAP } from '../shared/maps.js';
import { createTerrain } from '../shared/terrain.js';
import { SIM_DT, createPlane, spawnPlane, stepPlane } from '../shared/flight.js';
import { Guns, gunMuzzle, bulletVelocity, segmentHitsSphere } from '../shared/guns.js';
import { makeBalloonWave, balloonPos, BALLOON_RADIUS } from '../shared/balloons.js';
import * as P from '../shared/protocol.js';

const terrains = new Map();
function terrainFor(mapKey) {
  if (!terrains.has(mapKey)) terrains.set(mapKey, createTerrain(MAPS[mapKey]));
  return terrains.get(mapKey);
}

const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;
const finite = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const DEG = Math.PI / 180;
const _tmp = new THREE.Vector3();
const _from = new THREE.Vector3();
const _hist = new THREE.Vector3();
const _to = new THREE.Vector3();
const _want = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ident = new THREE.Quaternion();

export class Room {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.mapKey = DEFAULT_MAP;
    this.map = MAPS[this.mapKey];
    this.terrain = terrainFor(this.mapKey);
    this.players = new Map();
    this.hostId = null;
    this.mode = P.DEFAULT_MODE;
    this.state = 'playing';                 // 'playing' | 'ended'
    this.endsAt = this.now() + P.MATCH_LENGTH * 1000;
    this.nextStartAt = 0;
    this.results = null;
    this.bullets = [];
    this.missiles = [];
    this.nextMissileId = 1;
    this.events = [];      // things that happened this tick, sent with the next snapshot
    this.balloons = [];
    this.nextBalloonId = 1;
    this.waveAt = 0;
    this.spawnWave();
  }

  now() { return performance.now(); }
  get teams() { return P.MODES[this.mode].teams; }

  // ---------------------------------------------------------------- players

  addPlayer(socket, name, loadout = {}) {
    const planeKey = PLANES[loadout.plane] ? loadout.plane : DEFAULT_PLANE;
    const stats = PLANES[planeKey];
    const p = {
      id: socket.id, socket, name, color: 0xffffff, team: null,
      chosenColor: P.PLAYER_COLORS.includes(loadout.color) ? loadout.color : null,
      planeKey, nextPlane: planeKey, stats,
      plane: createPlane(), guns: new Guns(stats.gun),
      alive: false, life: 0, health: 0, respawnAt: 0, protectedUntil: 0,
      missiles: 0, flares: 0, missileReadyAt: 0, flareReadyAt: 0,
      lockTarget: null, lockProgress: 0,
      kills: 0, deaths: 0, pops: 0,
      lastSeq: 0, history: [], rtt: 100,
      budget: 30, budgetTime: this.now(),
      lastAttacker: null, lastAttackTime: 0
    };
    this.players.set(p.id, p);
    if (!this.hostId) this.hostId = p.id;
    socket.join(this.code);
    if (this.teams) p.team = this.smallerTeam();
    this.assignColors();
    this.respawn(p);
    this.events.push({ k: 'join', id: p.id, name });
    this.sendRoster();
    return p;
  }

  removePlayer(p) {
    this.players.delete(p.id);
    p.socket.leave(this.code);
    if (this.hostId === p.id) this.hostId = this.players.keys().next().value ?? null;
    this.events.push({ k: 'leave', id: p.id, name: p.name });
    this.sendRoster();
    this.sendRoomState();
  }

  smallerTeam() {
    let red = 0, blue = 0;
    for (const p of this.players.values()) { if (p.team === 'red') red++; else if (p.team === 'blue') blue++; }
    return red <= blue ? 'red' : 'blue';
  }

  /** Player picked a plane/colour. Colour changes now; the plane on the next respawn. */
  setLoadout(p, loadout) {
    if (PLANES[loadout?.plane]) p.nextPlane = loadout.plane;
    if (P.PLAYER_COLORS.includes(loadout?.color)) p.chosenColor = loadout.color;
    this.assignColors();
    this.sendRoster();
  }

  /** FFA: your chosen colour (or a free one). TDM: shades of the team colour. */
  assignColors() {
    if (this.teams) {
      const n = { red: 0, blue: 0 };
      for (const p of this.players.values()) {
        const list = P.TEAMS[p.team].colors;
        p.color = list[n[p.team]++ % list.length];
      }
    } else {
      let i = 0;
      for (const p of this.players.values()) p.color = p.chosenColor ?? P.PLAYER_COLORS[i++ % P.PLAYER_COLORS.length];
    }
  }

  isEnemy(a, b) {
    return a !== b && (!this.teams || a.team !== b.team);
  }

  welcome(p) {
    return {
      id: p.id, code: this.code, map: this.mapKey, plane: p.planeKey,
      serverTime: this.now(), roster: this.roster(), room: this.roomState(), balloons: this.balloons
    };
  }

  roster() {
    return [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, color: p.color, team: p.team, plane: p.planeKey, nextPlane: p.nextPlane,
      kills: p.kills, deaths: p.deaths, pops: p.pops,
      score: p.kills * P.POINTS.kill + p.pops * P.POINTS.balloon,
      ping: Math.round(p.rtt),
      host: p.id === this.hostId
    }));
  }

  sendRoster() { this.io.to(this.code).emit('roster', this.roster()); }

  teamKills() {
    const t = { red: 0, blue: 0 };
    for (const p of this.players.values()) if (p.team) t[p.team] += p.kills;
    return t;
  }

  roomState() {
    return {
      mode: this.mode, map: this.mapKey, state: this.state, hostId: this.hostId,
      endsAt: Math.round(this.endsAt), nextStartAt: Math.round(this.nextStartAt),
      teamKills: this.teams ? this.teamKills() : null,
      results: this.results
    };
  }

  sendRoomState() { this.io.to(this.code).emit('room', this.roomState()); }

  // ---------------------------------------------------------------- host controls

  /** Only the host may change the mode; doing so starts a fresh match. */
  setMode(p, mode) {
    if (p.id !== this.hostId || !P.MODES[mode]) return false;
    this.mode = mode;
    this.startMatch();
    return true;
  }

  /** Only the host may change the map; doing so starts a fresh match there. */
  setMap(p, mapKey) {
    if (p.id !== this.hostId || !MAPS[mapKey] || mapKey === this.mapKey) return false;
    this.mapKey = mapKey;
    this.map = MAPS[mapKey];
    this.terrain = terrainFor(mapKey);
    this.balloons = [];
    this.spawnWave();
    this.startMatch();
    return true;
  }

  restartMatch(p) {
    if (p.id !== this.hostId) return false;
    this.startMatch();
    return true;
  }

  // ---------------------------------------------------------------- match flow

  startMatch() {
    const now = this.now();
    this.state = 'playing';
    this.endsAt = now + P.MATCH_LENGTH * 1000;
    this.results = null;
    this.bullets.length = 0;
    this.missiles.length = 0;
    // Teams: deal players out alternately so the teams are even.
    let i = 0;
    for (const p of this.players.values()) {
      p.team = this.teams ? (i++ % 2 === 0 ? 'red' : 'blue') : null;
      p.kills = p.deaths = p.pops = 0;
    }
    this.assignColors();
    for (const p of this.players.values()) this.respawn(p);
    this.events.push({ k: 'start', mode: this.mode, map: this.mapKey });
    this.sendRoster();
    this.sendRoomState();
  }

  endMatch() {
    const now = this.now();
    this.state = 'ended';
    this.nextStartAt = now + P.RESULTS_TIME * 1000;
    const standings = this.roster().sort((a, b) => b.kills - a.kills || b.score - a.score || a.deaths - b.deaths);
    let winner;
    if (this.teams) {
      const t = this.teamKills();
      winner = t.red === t.blue ? { draw: true } : { team: t.red > t.blue ? 'red' : 'blue' };
    } else {
      const top = standings[0];
      const tie = standings[1] && standings[1].kills === top.kills && standings[1].score === top.score;
      winner = !top || tie ? { draw: true } : { id: top.id, name: top.name };
    }
    this.results = { mode: this.mode, winner, teamKills: this.teams ? this.teamKills() : null, standings };
    this.missiles.length = 0;
    this.events.push({ k: 'end' });
    this.sendRoomState();
  }

  respawn(p) {
    // Pick the spawn point on the edge of the map that is furthest from enemies.
    // In team mode each team starts on its own side.
    const r = this.map.boundary * 0.8;
    let best = 0, bestScore = -Infinity;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const sx = Math.cos(a) * r, sz = Math.sin(a) * r;
      let nearest = 5000;
      for (const o of this.players.values()) {
        if (o === p || !o.alive || !this.isEnemy(p, o)) continue;
        nearest = Math.min(nearest, Math.hypot(o.plane.position.x - sx, o.plane.position.z - sz));
      }
      let score = nearest + Math.random() * 200;
      if (p.team === 'red') score -= Math.max(0, sx) * 2;  // red prefers the west (-x)
      if (p.team === 'blue') score += Math.min(0, sx) * 2; // blue prefers the east (+x)
      if (score > bestScore) { bestScore = score; best = a; }
    }
    // Spawn high enough to clear any mountains on the way toward the centre.
    const sx = Math.cos(best) * r, sz = Math.sin(best) * r;
    let clear = this.map.spawnHeight;
    for (let d = -200; d <= 900; d += 50) {
      const k = d / r;
      clear = Math.max(clear, this.terrain.surfaceAt(sx * (1 - k), sz * (1 - k)) + 80);
    }
    if (p.nextPlane !== p.planeKey) {
      p.planeKey = p.nextPlane;
      p.stats = PLANES[p.planeKey];
      p.guns = new Guns(p.stats.gun);
    }
    const pos = _tmp.set(sx, clear, sz);
    spawnPlane(p.plane, p.stats, pos, Math.atan2(pos.x, pos.z)); // facing the centre
    p.life++;
    p.alive = true;
    p.health = p.stats.health;
    p.protectedUntil = this.now() + P.SPAWN_PROTECTION * 1000;
    p.missiles = p.stats.missiles;
    p.flares = p.stats.flares;
    p.missileReadyAt = p.flareReadyAt = 0;
    p.lockTarget = null;
    p.lockProgress = 0;
    p.guns.reset();
    p.history.length = 0;
    p.lastAttacker = null;
  }

  // ---------------------------------------------------------------- inputs

  viewDelay(p) {
    // The shooter sees others ~this many ms in the past, so we check hits/locks there.
    return Math.min(P.MAX_LAG_COMP, p.rtt / 2 + P.INTERP_DELAY + 1000 / P.TICK_RATE);
  }

  onInputs(p, list) {
    if (!Array.isArray(list)) return;
    const now = this.now();
    // Allow ~60 inputs per second (plus a small burst) so nobody can speed-hack.
    p.budget = Math.min(30, p.budget + ((now - p.budgetTime) / 1000) * 62);
    p.budgetTime = now;
    const combat = this.state === 'playing';

    for (const raw of list.slice(0, 30)) {
      if (!raw || typeof raw.s !== 'number' || raw.s <= p.lastSeq) continue;
      p.lastSeq = raw.s;
      if (p.budget < 1) continue; // over budget: acknowledged but ignored
      p.budget -= 1;
      if (!p.alive) continue;

      const fresh = raw.l === p.life; // inputs from before the last respawn don't steer
      const input = {
        x: finite(raw.x), y: finite(raw.y), z: finite(raw.z, -1),
        u: raw.u ? 1 : 0, d: raw.d ? 1 : 0, b: raw.b ? 1 : 0,
        r: Math.max(-1, Math.min(1, finite(raw.r)))
      };
      stepPlane(p.plane, p.stats, this.map, input, SIM_DT, fresh);
      p.guns.update(SIM_DT, combat && fresh && !!raw.f, (side) => this.fireBullet(p, side));

      if (combat) {
        this.updateLock(p, now);
        if (fresh && raw.m) this.tryFireMissile(p, now);
        if (fresh && raw.fl) this.tryFlare(p, now);
      }

      const pos = p.plane.position;
      if (pos.y < this.terrain.surfaceAt(pos.x, pos.z) + 1.5) {
        this.killPlayer(p, null, 'crash');
      }
    }
  }

  fireBullet(p, side) {
    const g = p.stats.gun;
    const pos = gunMuzzle(p.plane.position, p.plane.quaternion, p.stats, side, new THREE.Vector3());
    const vel = bulletVelocity(p.plane.forward, p.plane.velocity, g, new THREE.Vector3());
    this.bullets.push({ owner: p, pos, vel, life: g.range / g.bulletSpeed, damage: g.damage, delay: this.viewDelay(p) });
    this.events.push({ k: 's', id: p.id, s: side });
  }

  // ---------------------------------------------------------------- lock-on & missiles

  /** Keep a target near your nose for MISSILE.lockTime seconds to lock on. */
  updateLock(p, now) {
    const viewTime = now - this.viewDelay(p);
    const angleTo = (q) => {
      const c = this.positionAt(q, viewTime, _to);
      const dist = c.distanceTo(p.plane.position);
      if (dist > MISSILE.lockRange) return Infinity;
      return p.plane.forward.angleTo(c.sub(p.plane.position).normalize());
    };
    const valid = (q) => q && q.alive && this.isEnemy(p, q) && now >= q.protectedUntil;

    let current = this.players.get(p.lockTarget);
    if (valid(current) && angleTo(current) < MISSILE.keepCone * DEG) {
      p.lockProgress = Math.min(1, p.lockProgress + SIM_DT / MISSILE.lockTime);
      return;
    }
    // Look for the enemy closest to the nose inside the lock cone.
    let best = null, bestAngle = MISSILE.lockCone * DEG;
    for (const q of this.players.values()) {
      if (!valid(q)) continue;
      const a = angleTo(q);
      if (a < bestAngle) { bestAngle = a; best = q; }
    }
    if (best && best.id === p.lockTarget) return;
    if (best) { p.lockTarget = best.id; p.lockProgress = 0; }
    else {
      p.lockProgress = Math.max(0, p.lockProgress - SIM_DT * 2);
      if (p.lockProgress === 0) p.lockTarget = null;
    }
  }

  tryFireMissile(p, now) {
    if (p.missiles <= 0 || now < p.missileReadyAt || p.lockProgress < 1) return;
    const target = this.players.get(p.lockTarget);
    if (!target || !target.alive) return;
    p.missiles--;
    p.missileReadyAt = now + MISSILE.cooldown * 1000;
    const pos = _tmp.set(0, -1.3, 0).multiplyScalar(p.stats.modelScale).applyQuaternion(p.plane.quaternion).add(p.plane.position);
    const m = {
      id: this.nextMissileId++, owner: p, targetId: target.id,
      pos: pos.clone(),
      dir: p.plane.forward.clone(),
      speed: p.plane.speed + 30,
      life: MISSILE.life,
      decoy: null
    };
    this.missiles.push(m);
    this.events.push({ k: 'ml', id: m.id, by: p.id, tg: target.id });
  }

  tryFlare(p, now) {
    if (p.flares <= 0 || now < p.flareReadyAt) return;
    p.flares--;
    p.flareReadyAt = now + FLARE.cooldown * 1000;
    // Every missile chasing us (and close enough) goes for the flare instead.
    for (const m of this.missiles) {
      if (m.targetId === p.id && m.pos.distanceTo(p.plane.position) < FLARE.decoyRange) {
        m.targetId = null;
        m.decoy = { pos: p.plane.position.clone(), vel: p.plane.velocity.clone().multiplyScalar(0.3) };
      }
    }
    // Popping flares also breaks enemies' lock-ons.
    for (const q of this.players.values()) {
      if (q.lockTarget === p.id) { q.lockTarget = null; q.lockProgress = 0; }
    }
    this.events.push({ k: 'fl', id: p.id });
  }

  updateMissiles(dt) {
    let w = 0;
    for (const m of this.missiles) {
      m.life -= dt;
      m.speed = Math.min(MISSILE.speed, m.speed + 250 * dt);
      let target = m.targetId ? this.players.get(m.targetId) : null;
      if (target && !target.alive) { target = null; m.targetId = null; }

      // Steer toward the target (with a little lead) or the flare it was fooled by.
      let aimAt = null;
      if (target) {
        const dist = m.pos.distanceTo(target.plane.position);
        aimAt = _want.copy(target.plane.position).addScaledVector(target.plane.velocity, (dist / MISSILE.speed) * 0.5);
      } else if (m.decoy) {
        m.decoy.vel.y -= 9.8 * dt;
        m.decoy.pos.addScaledVector(m.decoy.vel, dt);
        aimAt = _want.copy(m.decoy.pos);
      }
      if (aimAt) {
        aimAt.sub(m.pos).normalize();
        const angle = m.dir.angleTo(aimAt);
        if (target && angle > MISSILE.maxTrackAngle * DEG) {
          m.targetId = null; // target out-turned it
        } else if (angle > 1e-4) {
          _q.setFromUnitVectors(m.dir, aimAt);
          _ident.identity().slerp(_q, Math.min(1, (MISSILE.turnRate * dt) / angle));
          m.dir.applyQuaternion(_ident).normalize();
        }
      }

      _from.copy(m.pos);
      m.pos.addScaledVector(m.dir, m.speed * dt);

      let boom = false, hit = null;
      if (target && segmentHitsSphere(_from, m.pos, target.plane.position, MISSILE.proximity * target.stats.modelScale)) {
        boom = true; hit = target;
      } else if (m.decoy && m.pos.distanceTo(m.decoy.pos) < MISSILE.proximity) {
        boom = true;
      } else if (m.pos.y < this.terrain.surfaceAt(m.pos.x, m.pos.z) || m.life <= 0) {
        boom = true;
      }
      if (boom) {
        this.events.push({ k: 'mx', id: m.id, x: r2(m.pos.x), y: r2(m.pos.y), z: r2(m.pos.z), hit: hit ? 1 : 0 });
        if (hit && this.state === 'playing') {
          const owner = this.players.has(m.owner.id) ? m.owner : null;
          this.damagePlayer(hit, owner, MISSILE.damage, 'missile');
        }
        continue;
      }
      this.missiles[w++] = m;
    }
    this.missiles.length = w;
  }

  // ---------------------------------------------------------------- simulation

  /** Where player q was at server time t (from recorded history). */
  positionAt(q, t, out) {
    const h = q.history;
    if (h.length === 0 || t >= h[h.length - 1].t) return out.copy(q.plane.position);
    if (t <= h[0].t) return out.set(h[0].x, h[0].y, h[0].z);
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (t >= a.t) {
        const k = (t - a.t) / (b.t - a.t || 1);
        return out.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
      }
    }
    return out.copy(q.plane.position);
  }

  tick(dtMs) {
    const now = this.now();
    const dt = dtMs / 1000;

    for (const p of this.players.values()) {
      if (!p.alive) continue;
      p.history.push({ t: now, x: p.plane.position.x, y: p.plane.position.y, z: p.plane.position.z });
      while (p.history.length && p.history[0].t < now - 1000) p.history.shift();
    }

    // Bullets
    let w = 0;
    for (const b of this.bullets) {
      _from.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      if (b.life > 0 && !this.bulletHit(b, _from, now - b.delay)) this.bullets[w++] = b;
    }
    this.bullets.length = w;

    this.updateMissiles(dt);

    // Respawns, balloon waves, match timer
    for (const p of this.players.values()) {
      if (!p.alive && p.respawnAt && now >= p.respawnAt) {
        this.respawn(p);
        this.events.push({ k: 'spawn', id: p.id });
      }
    }
    if (this.balloons.length === 0 && this.waveAt && now >= this.waveAt) this.spawnWave();
    if (this.state === 'playing' && now >= this.endsAt) this.endMatch();
    else if (this.state === 'ended' && now >= this.nextStartAt) this.startMatch();

    this.broadcastSnapshot(now);
  }

  bulletHit(b, from, viewTime) {
    const owner = this.players.has(b.owner.id) ? b.owner : null;

    for (const bal of this.balloons) {
      if (segmentHitsSphere(from, b.pos, balloonPos(bal, viewTime / 1000, _hist), BALLOON_RADIUS)) {
        this.damageBalloon(bal, owner, b.damage);
        return true;
      }
    }
    if (this.state === 'playing') {
      for (const q of this.players.values()) {
        if (!q.alive || !this.isEnemy(b.owner, q) || viewTime < q.protectedUntil) continue;
        const center = this.positionAt(q, viewTime, _hist);
        if (segmentHitsSphere(from, b.pos, center, JET_GEOMETRY.hitRadius * q.stats.modelScale)) {
          this.damagePlayer(q, owner, b.damage, 'gun');
          return true;
        }
      }
    }
    if (b.pos.y < this.terrain.surfaceAt(b.pos.x, b.pos.z)) return true;
    return false;
  }

  damagePlayer(q, shooter, amount, how) {
    q.health -= amount;
    if (shooter) { q.lastAttacker = shooter.id; q.lastAttackTime = this.now(); }
    this.events.push({ k: 'h', id: q.id, by: shooter?.id ?? null });
    if (q.health <= 0) this.killPlayer(q, shooter, how);
  }

  killPlayer(victim, killer, how) {
    if (!victim.alive) return;
    const now = this.now();
    victim.alive = false;
    victim.health = 0;
    if (this.state === 'playing') victim.deaths++;
    victim.respawnAt = now + P.RESPAWN_TIME * 1000;
    if (!killer && how === 'crash' && victim.lastAttacker &&
        now - victim.lastAttackTime < P.FORCED_DOWN_WINDOW * 1000) {
      killer = this.players.get(victim.lastAttacker) ?? null;
      if (killer) how = 'forced';
    }
    if (killer && this.isEnemy(killer, victim) && this.state === 'playing') killer.kills++;
    const pos = victim.plane.position;
    this.events.push({ k: 'kill', id: victim.id, by: killer?.id ?? null, how, x: r2(pos.x), y: r2(pos.y), z: r2(pos.z) });
    this.sendRoster();
    if (this.teams) this.sendRoomState();
  }

  damageBalloon(bal, shooter, amount) {
    bal.hp -= amount;
    const pop = bal.hp <= 0;
    this.events.push({ k: 'bh', id: bal.id, by: shooter?.id ?? null, pop });
    if (!pop) return;
    this.balloons.splice(this.balloons.indexOf(bal), 1);
    if (shooter && this.state === 'playing') { shooter.pops++; this.sendRoster(); }
    if (this.balloons.length === 0) this.waveAt = this.now() + P.WAVE_DELAY * 1000;
  }

  spawnWave() {
    this.balloons = makeBalloonWave(this.map, this.terrain, this.nextBalloonId, this.map.balloons);
    this.nextBalloonId += this.balloons.length;
    this.waveAt = 0;
    this.events.push({ k: 'wave', balloons: this.balloons });
  }

  broadcastSnapshot(now) {
    const players = [];
    for (const p of this.players.values()) {
      const pl = p.plane;
      players.push({
        i: p.id, a: p.alive ? 1 : 0, l: p.life, pk: p.planeKey,
        x: r2(pl.position.x), y: r2(pl.position.y), z: r2(pl.position.z),
        q: [r4(pl.quaternion.x), r4(pl.quaternion.y), r4(pl.quaternion.z), r4(pl.quaternion.w)],
        v: r2(pl.speed), th: r4(pl.throttle), bf: r4(pl.boostFuel), bo: pl.boosting ? 1 : 0,
        rp: r4(pl.rates.pitch), ry: r4(pl.rates.yaw), rr: r4(pl.rates.roll),
        h: Math.max(0, Math.round(p.health)), s: p.lastSeq,
        pr: now < p.protectedUntil ? 1 : 0,
        pg: Math.round(p.rtt),
        // weapons
        mi: p.missiles, fc: p.flares,
        mr: Math.max(0, Math.round(p.missileReadyAt - now)), fr: Math.max(0, Math.round(p.flareReadyAt - now)),
        lk: p.lockTarget, lp: Math.round(p.lockProgress * 100) / 100
      });
    }
    const missiles = this.missiles.map((m) => [m.id, r2(m.pos.x), r2(m.pos.y), r2(m.pos.z), m.targetId]);
    this.io.to(this.code).emit('snap', { t: Math.round(now), p: players, m: missiles, e: this.events });
    this.events = [];
  }
}
