// Sky Brawl server: serves the game files and runs multiplayer rooms.
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { Room } from './Room.js';
import { TICK_RATE, MAX_PLAYERS, ROOM_CODE_CHARS, ROOM_CODE_LENGTH, cleanName, cleanCode } from '../shared/protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const app = express();
// Hosting sites (like Render) ping this to check the server is alive.
app.get('/health', (req, res) => res.send('ok'));
app.use(express.static(path.join(root, 'client')));
// Code shared by client and server (plane stats, maps, flight model...).
app.use('/shared', express.static(path.join(root, 'shared')));
// Three.js straight from node_modules, so no CDN is needed.
app.use('/vendor/three', express.static(path.join(root, 'node_modules', 'three')));

// Tells the browser whether you added your own music (client/audio/music.mp3).
app.get('/api/custom-music', (req, res) => {
  res.json({ music: fs.existsSync(path.join(root, 'client', 'audio', 'music.mp3')) });
});

const server = http.createServer(app);
const io = new Server(server);

/** @type {Map<string, Room>} */
const rooms = new Map();

function makeCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  } while (rooms.has(code));
  return code;
}

io.on('connection', (socket) => {
  let room = null;
  let player = null;

  socket.on('create', (data, ack) => {
    if (typeof ack !== 'function') return;
    if (room) return ack({ ok: false, error: 'Already in a room' });
    room = new Room(makeCode(), io);
    rooms.set(room.code, room);
    player = room.addPlayer(socket, cleanName(data?.name), { plane: data?.plane, color: data?.color });
    console.log(`Room ${room.code} created by ${player.name}`);
    ack({ ok: true, welcome: room.welcome(player) });
  });

  socket.on('join', (data, ack) => {
    if (typeof ack !== 'function') return;
    if (room) return ack({ ok: false, error: 'Already in a room' });
    const r = rooms.get(cleanCode(data?.code));
    if (!r) return ack({ ok: false, error: 'No room with that code' });
    if (r.players.size >= MAX_PLAYERS) return ack({ ok: false, error: 'That room is full' });
    room = r;
    player = room.addPlayer(socket, cleanName(data?.name), { plane: data?.plane, color: data?.color });
    console.log(`${player.name} joined room ${room.code} (${room.players.size} players)`);
    ack({ ok: true, welcome: room.welcome(player) });
  });

  // Host-only controls (the room checks that the sender really is the host).
  socket.on('setMode', (mode) => { if (room && player) room.setMode(player, mode); });
  socket.on('restart', () => { if (room && player) room.restartMatch(player); });
  socket.on('setMap', (mapKey) => { if (room && player) room.setMap(player, mapKey); });
  // Anyone can change their own plane/colour.
  socket.on('loadout', (l) => { if (room && player) room.setLoadout(player, l); });

  socket.on('in', (inputs) => {
    if (room && player) room.onInputs(player, inputs);
  });

  socket.on('disconnect', () => {
    if (!room || !player) return;
    room.removePlayer(player);
    console.log(`${player.name} left room ${room.code}`);
    if (room.players.size === 0) {
      rooms.delete(room.code);
      console.log(`Room ${room.code} closed`);
    }
  });
});

// Measure each player's ping every 2 seconds (used for lag compensation).
setInterval(() => {
  for (const room of rooms.values()) {
    for (const p of room.players.values()) {
      const start = performance.now();
      p.socket.timeout(2000).emit('latency', () => {
        p.rtt = p.rtt * 0.7 + (performance.now() - start) * 0.3;
      });
    }
  }
}, 2000);

// Main game loop.
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min(now - last, 100);
  last = now;
  for (const room of rooms.values()) room.tick(dt);
}, 1000 / TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sky Brawl running at http://localhost:${PORT}`);
});
