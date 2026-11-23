// Phase 3 test: missiles, flares, host-only mode switching, teams, match end.
// Run the server with a short match first:  MATCH_LENGTH=45 npm start
// then:  npm run test:combat
import { io } from 'socket.io-client';
import * as THREE from 'three';

const URL = process.env.URL || 'http://localhost:3000';
const SECONDS = Number(process.env.SECONDS || 60);

function bot(name) {
  const socket = io(URL, { transports: ['websocket'] });
  socket.on('latency', (ack) => ack());
  const b = { name, socket, id: null, seq: 0, life: 0, me: null, others: new Map(), missiles: [], events: [], roster: [], room: null };
  socket.on('snap', (s) => {
    for (const p of s.p) { if (p.i === b.id) { b.me = p; b.life = p.l; } else b.others.set(p.i, p); }
    b.missiles = s.m;
    b.events.push(...s.e);
  });
  socket.on('roster', (r) => { b.roster = r; });
  socket.on('room', (r) => { b.room = r; if (r.results) b.results = r.results; });
  return b;
}
const ask = (b, ev, data) => new Promise((res) => b.socket.timeout(5000).emit(ev, data, (err, r) => res(err ? { ok: false } : r)));
const send = (b, aim, k) => {
  const inp = (s) => ({ s, l: b.life, x: +aim.x.toFixed(3), y: +aim.y.toFixed(3), z: +aim.z.toFixed(3), u: k.u || 0, d: k.d || 0, r: 0, b: 0, f: k.f || 0, m: k.m || 0, fl: k.fl || 0 });
  b.socket.emit('in', [inp(++b.seq), inp(++b.seq)]);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (label, ok) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);

const hunter = bot('Hunter'), target = bot('Target');
// ROOM=ABCD sends the bots into an existing room (skips the host/mode checks).
const ROOM = process.env.ROOM;
const c = ROOM ? await ask(hunter, 'join', { code: ROOM, name: 'Hunter' }) : await ask(hunter, 'create', { name: 'Hunter' });
hunter.id = c.welcome.id;
hunter.room = c.welcome.room;
const j = await ask(target, 'join', { code: c.welcome.code, name: 'Target' });
target.id = j.welcome.id;
console.log('Room', c.welcome.code, '| mode:', c.welcome.room.mode);

if (!ROOM) {
// Non-host can't change mode
target.socket.emit('setMode', 'tdm');
await wait(400);
check('non-host cannot change mode', hunter.room.mode === 'ffa');

// Host switches to team deathmatch
hunter.socket.emit('setMode', 'tdm');
await wait(400);
const teams = hunter.roster.map((r) => r.team);
check('host switched to TDM', hunter.room.mode === 'tdm');
check(`players split into teams (${teams.join(', ')})`, teams.includes('red') && teams.includes('blue'));
check('match restarted (start event)', hunter.events.some((e) => e.k === 'start' && e.mode === 'tdm'));
}

// Fight: hunter locks + fires missiles, target pops flares against every second missile.
const fwd = new THREE.Vector3(), to = new THREE.Vector3(), aim = new THREE.Vector3();
let t = 0, maxLock = 0;
const flaredFor = new Set();
const timer = setInterval(() => {
  t += 1 / 30;
  const tm = target.me;
  aim.set(Math.sin(t * 0.25), 0, Math.cos(t * 0.25));
  if (tm && tm.y < 200) aim.y = 0.4;
  if (tm && tm.y > 400) aim.y = -0.3;
  let fl = 0;
  for (const [id, , , , tg] of target.missiles) {
    if (tg === target.id && id % 2 === 0 && !flaredFor.has(id)) { fl = 1; flaredFor.add(id); }
  }
  send(target, aim.normalize(), { d: 1, fl });

  const hm = hunter.me, o = hunter.others.get(target.id);
  let f = 0, m = 0;
  if (hm && o && o.a) {
    to.set(o.x, o.y, o.z);
    const dist = to.distanceTo(new THREE.Vector3(hm.x, hm.y, hm.z));
    to.addScaledVector(fwd.set(0, 0, -1).applyQuaternion(new THREE.Quaternion(...o.q)), o.v * (dist / 800 - 0.13));
    aim.copy(to).sub(new THREE.Vector3(hm.x, hm.y, hm.z)).normalize();
    if (hm.y < 120) aim.y = Math.max(aim.y, 0.4);
    const myFwd = fwd.set(0, 0, -1).applyQuaternion(new THREE.Quaternion(...hm.q));
    f = myFwd.angleTo(aim) < 0.08 && dist < 800 ? 1 : 0;
    m = 1; // hold right click: fires whenever the server says we're locked
    maxLock = Math.max(maxLock, hm.lp);
  } else aim.set(0, 0.1, -1).normalize();
  send(hunter, aim, { u: 1, f, m });
}, 1000 / 30);

await wait(SECONDS * 1000);
clearInterval(timer);

const ev = hunter.events;
const n = (k, f = () => true) => ev.filter((e) => e.k === k && f(e)).length;
console.log(`\nAfter ${SECONDS}s of fighting:`);
console.log('  highest lock progress :', maxLock);
console.log('  missiles launched     :', n('ml'));
console.log('  missile hits          :', n('mx', (e) => e.hit));
console.log('  flares popped         :', n('fl'));
console.log('  gun hits              :', n('h'));
console.log('  kills (gun / missile) :', n('kill', (e) => e.how === 'gun'), '/', n('kill', (e) => e.how === 'missile'));
check('lock-on reached 100%', maxLock >= 1);
check('missiles launched', n('ml') > 0);
check('flares popped', n('fl') > 0);
const ended = n('end') > 0;
console.log('  match ended           :', ended, ended ? 'winner: ' + JSON.stringify(hunter.results?.winner) : '(set MATCH_LENGTH shorter than the fight to test)');
if (ended) {
  check('results include both pilots', (hunter.results?.standings?.length ?? 0) === 2);
  check('next match started after results', n('start') >= 2);
}
hunter.socket.close();
target.socket.close();
setTimeout(() => process.exit(0), 300);
