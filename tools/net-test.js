// Multiplayer smoke test: two bot pilots connect to a running server.
// "Hunter" chases and shoots "Target". Prints what the server reported.
// Usage:  npm start   (in one terminal)   then   npm run test:net
import { io } from 'socket.io-client';
import * as THREE from 'three';

const URL = process.env.URL || 'http://localhost:3000';
const SECONDS = Number(process.env.SECONDS || 40);

function bot(name) {
  const socket = io(URL, { transports: ['websocket'] });
  socket.on('latency', (ack) => ack());
  const b = { name, socket, id: null, seq: 0, life: 0, me: null, others: new Map(), events: [] };
  socket.on('snap', (s) => {
    for (const p of s.p) {
      if (p.i === b.id) { b.me = p; b.life = p.l; } else b.others.set(p.i, p);
    }
    b.events.push(...s.e);
  });
  return b;
}

const ask = (b, ev, data) => new Promise((res) => b.socket.timeout(5000).emit(ev, data, (err, r) => res(err ? { ok: false, error: 'timeout' } : r)));

function send(b, aim, fire, up = 0, down = 0) {
  const inp = (s) => ({ s, l: b.life, x: +aim.x.toFixed(3), y: +aim.y.toFixed(3), z: +aim.z.toFixed(3), u: up, d: down, r: 0, b: 0, f: fire ? 1 : 0 });
  b.socket.emit('in', [inp(++b.seq), inp(++b.seq)]);
}

const hunter = bot('Hunter');
const target = bot('Target <script>');

// ROOM=ABCD joins an existing room (e.g. yours) instead of creating one.
// HUNT=all makes the hunter chase the nearest pilot, not just the target bot.
const created = process.env.ROOM
  ? await ask(hunter, 'join', { code: process.env.ROOM, name: hunter.name })
  : await ask(hunter, 'create', { name: hunter.name });
if (!created.ok) throw new Error('create/join failed: ' + created.error);
hunter.id = created.welcome.id;
const code = created.welcome.code;
console.log('Room:', code);

const bad = await ask(target, 'join', { code: 'ZZZZ', name: 'x' });
console.log('Join wrong code ->', bad.ok ? 'UNEXPECTED OK' : `rejected ("${bad.error}")`);

const joined = await ask(target, 'join', { code: code.toLowerCase(), name: target.name });
if (!joined.ok) throw new Error('join failed: ' + joined.error);
target.id = joined.welcome.id;
console.log('Target joined as', JSON.stringify(joined.welcome.roster.find((r) => r.id === target.id).name),
  '| players:', joined.welcome.roster.length, '| balloons:', joined.welcome.balloons.length);

const fwd = new THREE.Vector3(), to = new THREE.Vector3(), aim = new THREE.Vector3();
let t = 0, firing = 0, minDist = Infinity;
const timer = setInterval(() => {
  t += 1 / 30;
  // Target: lazy circles at a safe height.
  const tm = target.me;
  aim.set(Math.sin(t * 0.3), 0, Math.cos(t * 0.3));
  if (tm && tm.y < 200) aim.y = 0.4;
  if (tm && tm.y > 400) aim.y = -0.3;
  send(target, aim.normalize(), false, 0, 1); // target flies slow

  // Hunter: chase the target, lead it a little, shoot when lined up.
  const hm = hunter.me;
  let other = hunter.others.get(target.id);
  if (process.env.HUNT === 'all' && hm) {
    let best = Infinity;
    for (const o of hunter.others.values()) {
      const d = Math.hypot(o.x - hm.x, o.y - hm.y, o.z - hm.z);
      if (o.a && d < best) { best = d; other = o; }
    }
  }
  let fire = false;
  if (hm && other && other.a) {
    to.set(other.x, other.y, other.z);
    const q = new THREE.Quaternion(...other.q);
    const dist = to.distanceTo(new THREE.Vector3(hm.x, hm.y, hm.z));
    minDist = Math.min(minDist, dist);
    // Lead: bullet flight time, minus the ~130 ms the server rewinds for lag compensation.
    to.addScaledVector(fwd.set(0, 0, -1).applyQuaternion(q), other.v * (dist / 800 - 0.13));
    aim.copy(to).sub(new THREE.Vector3(hm.x, hm.y, hm.z));
    aim.normalize();
    if (hm.y < 120) aim.y = Math.max(aim.y, 0.4);
    const myFwd = fwd.set(0, 0, -1).applyQuaternion(new THREE.Quaternion(...hm.q));
    fire = myFwd.angleTo(aim) < 0.08 && dist < 800;
  } else aim.set(0, 0.1, -1).normalize();
  if (fire) firing++;
  send(hunter, aim, fire, 1, 0); // hunter flies fast
}, 1000 / 30);

await new Promise((r) => setTimeout(r, SECONDS * 1000));
clearInterval(timer);

const ev = hunter.events;
const count = (k, f = () => true) => ev.filter((e) => e.k === k && f(e)).length;
console.log(`\nAfter ${SECONDS}s:`);
console.log('  closest approach :', Math.round(minDist), 'm');
console.log('  hunter fire-ticks:', firing);
console.log('  shots seen       :', count('s', (e) => e.id === hunter.id));
console.log('  hits by hunter   :', count('h', (e) => e.by === hunter.id));
console.log('  kills by hunter  :', count('kill', (e) => e.by === hunter.id));
console.log('  crashes          :', count('kill', (e) => e.how === 'crash'));
console.log('  respawns         :', count('spawn'));
console.log('  balloon hits     :', count('bh'));
console.log('  hunter ping (ms) :', hunter.me?.pg);
hunter.socket.close();
target.socket.close();
setTimeout(() => process.exit(0), 300);
