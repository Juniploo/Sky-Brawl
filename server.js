// Sky Brawl game server: serves the game, runs parties and dogfight matches over WebSockets.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, players: players.size, parties: parties.size })); }
  const file = path.normalize(path.join(PUBLIC, url === '/' ? 'index.html' : url));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.glb' ? 'public, max-age=86400' : 'no-cache' });
    res.end(data);
  });
});

// ---------------- Game state
const JETS = ['f14', 'f15', 'f16', 'f22', 'f35'];
const MAPS = ['islands', 'canyon', 'alps', 'volcano', 'arctic', 'sky'];
const players = new Map();   // id -> player
const parties = new Map();   // code -> party
let nextId = 1;

const clean = (s, n) => String(s ?? '').replace(/[<>&"'`]/g, '').trim().slice(0, n);
const send = (p, msg) => { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); };
const broadcast = (party, msg, except) => { for (const id of party.members) { const p = players.get(id); if (p && p !== except) send(p, msg); } };
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c; do { c = Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (parties.has(c));
  return c;
}
function partyView(party) {
  return {
    code: party.code, host: party.host, state: party.state, settings: party.settings,
    members: party.members.map(id => { const p = players.get(id); return { id, name: p.name, jet: p.jet, team: p.team, ready: p.ready, kills: p.kills, deaths: p.deaths }; }),
    match: party.match ? { endsAt: party.match.endsAt, teamScore: party.match.teamScore } : null,
  };
}
const pushParty = party => broadcast(party, { t: 'party', party: partyView(party) });

function leaveParty(p) {
  const party = parties.get(p.party);
  if (!party) { p.party = null; return; }
  party.members = party.members.filter(id => id !== p.id);
  p.party = null; p.ready = false;
  if (!party.members.length) { parties.delete(party.code); return; }
  if (party.host === p.id) party.host = party.members[0];
  broadcast(party, { t: 'left', id: p.id });
  if (party.state === 'match' && party.members.length < 1) endMatch(party);
  pushParty(party);
}
function joinParty(p, party) {
  if (party.members.length >= 16) return send(p, { t: 'error', msg: 'That party is full (16 players).' });
  if (p.party) leaveParty(p);
  party.members.push(p.id); p.party = party.code; p.ready = false; p.kills = 0; p.deaths = 0;
  const counts = [0, 0]; for (const id of party.members) { const m = players.get(id); if (m && m !== p) counts[m.team]++; }
  p.team = counts[0] <= counts[1] ? 0 : 1;
  send(p, { t: 'joined', code: party.code });
  pushParty(party);
  if (party.state === 'match') { spawnInMatch(party, p); send(p, matchStartMsg(party)); }
}

// ---------------- Matches
function spawnPoint(party, p) {
  const r = () => (Math.random() - 0.5);
  if (party.settings.mode === 'tdm') {
    const side = p.team === 0 ? -1 : 1;
    return { x: r() * 2500, z: side * 5500 + r() * 800, heading: side < 0 ? 0 : Math.PI };
  }
  const a = Math.random() * Math.PI * 2, d = 4000 + Math.random() * 1500;
  return { x: Math.cos(a) * d, z: Math.sin(a) * d, heading: Math.atan2(-Math.cos(a), -Math.sin(a)) };
}
function spawnInMatch(party, p) {
  p.hp = 100; p.alive = true; p.respawnAt = 0; p.spawn = spawnPoint(party, p); p.state = null;
}
function matchStartMsg(party) {
  const spawns = {}; for (const id of party.members) { const m = players.get(id); if (m) spawns[id] = m.spawn; }
  return { t: 'match', settings: party.settings, endsAt: party.match.endsAt, spawns, now: Date.now() };
}
function startMatch(party) {
  party.state = 'match';
  party.match = { endsAt: Date.now() + party.settings.minutes * 60000, teamScore: [0, 0] };
  for (const id of party.members) { const p = players.get(id); p.kills = 0; p.deaths = 0; spawnInMatch(party, p); }
  broadcast(party, matchStartMsg(party));
  pushParty(party);
}
function endMatch(party) {
  if (party.state !== 'match') return;
  const ms = party.members.map(id => players.get(id)).filter(Boolean);
  let winner;
  if (party.settings.mode === 'tdm') { const [a, b] = party.match.teamScore; winner = a === b ? 'Draw' : (a > b ? 'Blue team' : 'Red team'); }
  else { const best = ms.slice().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0]; winner = best ? best.name : 'Nobody'; }
  broadcast(party, { t: 'end', winner, teamScore: party.match.teamScore, board: ms.map(p => ({ id: p.id, name: p.name, team: p.team, jet: p.jet, kills: p.kills, deaths: p.deaths })) });
  party.state = 'lobby'; party.match = null;
  for (const p of ms) { p.ready = false; p.alive = false; }
  pushParty(party);
}
function kill(party, victim, killer, weapon) {
  victim.alive = false; victim.hp = 0; victim.deaths++; victim.respawnAt = Date.now() + 5000;
  if (killer && killer !== victim) {
    killer.kills++;
    if (party.settings.mode === 'tdm') party.match.teamScore[killer.team]++;
  } else if (party.settings.mode === 'ffa') victim.kills = Math.max(0, victim.kills - 1);
  broadcast(party, { t: 'kill', victim: victim.id, killer: killer ? killer.id : null, weapon, teamScore: party.match.teamScore });
  pushParty(party);
  const limit = party.settings.scoreLimit;
  const top = party.settings.mode === 'tdm' ? Math.max(...party.match.teamScore) : Math.max(...party.members.map(id => players.get(id)?.kills || 0));
  if (top >= limit) setTimeout(() => endMatch(party), 2500);
}
const dist = (a, b) => Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]);

// ---------------- Messages
function onMessage(p, m) {
  const party = parties.get(p.party);
  switch (m.t) {
    case 'hello': p.name = clean(m.name, 16) || 'Pilot ' + p.id; if (JETS.includes(m.jet)) p.jet = m.jet; send(p, { t: 'welcome', id: p.id, name: p.name }); break;
    case 'create': {
      if (p.party) leaveParty(p);
      const code = newCode();
      const np = { code, host: p.id, members: [], state: 'lobby', settings: { mode: 'tdm', map: 'islands', scoreLimit: 10, minutes: 10 }, match: null };
      parties.set(code, np); joinParty(p, np); break;
    }
    case 'join': {
      const target = parties.get(clean(m.code, 5).toUpperCase());
      if (!target) return send(p, { t: 'error', msg: 'No party with that code. Check the code and try again.' });
      joinParty(p, target); break;
    }
    case 'leave': leaveParty(p); send(p, { t: 'joined', code: null }); break;
    case 'set':
      if (!party) return;
      if (JETS.includes(m.jet) && !(party.state === 'match' && p.alive)) p.jet = m.jet;
      if (m.team === 0 || m.team === 1) p.team = m.team;
      if (typeof m.ready === 'boolean') p.ready = m.ready;
      pushParty(party); break;
    case 'settings':
      if (!party || party.host !== p.id || party.state !== 'lobby') return;
      if (['tdm', 'ffa'].includes(m.mode)) party.settings.mode = m.mode;
      if (MAPS.includes(m.map)) party.settings.map = m.map;
      if ([5, 10, 15, 20, 30].includes(m.scoreLimit)) party.settings.scoreLimit = m.scoreLimit;
      if ([5, 10, 15, 20].includes(m.minutes)) party.settings.minutes = m.minutes;
      pushParty(party); break;
    case 'start':
      if (party && party.host === p.id && party.state === 'lobby') startMatch(party); break;
    case 'end':
      if (party && party.host === p.id) endMatch(party); break;
    case 'state':     // position update; relayed in the tick
      if (!party || party.state !== 'match' || !p.alive || !Array.isArray(m.p) || !Array.isArray(m.q)) return;
      p.state = { p: m.p.slice(0, 3).map(Number), q: m.q.slice(0, 4).map(Number), v: +m.v || 0, g: !!m.g, f: !!m.f, b: !!m.b, gr: !!m.gr, sw: +m.sw || 0, ms: Array.isArray(m.ms) ? m.ms.slice(0, 6) : [] };
      break;
    case 'hit': {     // shooter reports a hit; server checks it is plausible and applies damage
      if (!party || party.state !== 'match' || !p.alive) return;
      const v = players.get(m.target);
      if (!v || v.party !== p.party || !v.alive || v === p || !p.state || !v.state) return;
      if (party.settings.mode === 'tdm' && v.team === p.team) return;
      const range = m.weapon === 'missile' ? 9000 : 2000;
      if (dist(p.state, v.state) > range) return;
      const now = Date.now();
      if (m.weapon === 'gun') { if (now - (p.lastGunHit || 0) < 40) return; p.lastGunHit = now; }
      const dmg = m.weapon === 'missile' ? 65 : 4;
      v.hp = Math.max(0, v.hp - dmg); v.lastHitBy = p.id; v.lastHitAt = now;
      broadcast(party, { t: 'dmg', id: v.id, hp: v.hp, by: p.id, weapon: m.weapon });
      if (v.hp <= 0) kill(party, v, p, m.weapon);
      break;
    }
    case 'crash': {
      if (!party || party.state !== 'match' || !p.alive) return;
      const recent = p.lastHitAt && Date.now() - p.lastHitAt < 8000 ? players.get(p.lastHitBy) : null;
      kill(party, p, recent && recent.party === p.party ? recent : null, 'crash'); break;
    }
    case 'flare':
      if (party && party.state === 'match' && p.alive) broadcast(party, { t: 'flare', id: p.id }, p); break;
    case 'chat':
      if (!party) return;
      broadcast(party, { t: 'chat', id: p.id, name: p.name, text: clean(m.text, 140) }); break;
    case 'ping': send(p, { t: 'pong', c: m.c, s: Date.now() }); break;
  }
}

// ---------------- Tick: relay positions (20 Hz), respawns, match timer
setInterval(() => {
  const now = Date.now();
  for (const party of parties.values()) {
    if (party.state !== 'match') continue;
    const list = [];
    for (const id of party.members) {
      const p = players.get(id); if (!p) continue;
      if (!p.alive && p.respawnAt && now >= p.respawnAt) {
        spawnInMatch(party, p);
        broadcast(party, { t: 'respawn', id: p.id, spawn: p.spawn, jet: p.jet });
      }
      if (p.alive && p.state) list.push([p.id, p.jet, p.state.p, p.state.q, p.state.v, p.state.f, p.state.b, p.state.gr, p.state.sw, p.state.ms, p.hp]);
    }
    broadcast(party, { t: 'states', s: list, now });
    if (now >= party.match.endsAt) endMatch(party);
  }
}, 50);

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
wss.on('connection', ws => {
  const p = { id: nextId++, ws, name: 'Pilot', jet: 'f14', team: 0, ready: false, party: null, kills: 0, deaths: 0, hp: 100, alive: false, state: null, alivePing: Date.now() };
  players.set(p.id, p);
  ws.on('message', data => { p.alivePing = Date.now(); let m; try { m = JSON.parse(data); } catch { return; } if (m && typeof m.t === 'string') onMessage(p, m); });
  ws.on('close', () => { leaveParty(p); players.delete(p.id); });
  ws.on('error', () => {});
});
// Keep connections healthy through proxies
setInterval(() => { for (const ws of wss.clients) { if (ws.readyState === 1) ws.ping(); } }, 25000);

server.listen(PORT, '0.0.0.0', () => console.log('Sky Brawl server on port ' + PORT));
