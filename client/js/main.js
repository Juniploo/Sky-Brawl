// Sky Brawl — entry point: sets up the 3D scene, the menus, and joins a room.
import * as THREE from 'three';
import { MAPS, DEFAULT_MAP } from '/shared/maps.js';
import { createTerrain } from '/shared/terrain.js';
import { cleanCode } from '/shared/protocol.js';
import { buildWorld } from './world.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { connect, createRoom, joinRoom } from './net.js';
import { NetGame } from './game.js';
import { SoundSystem } from './audio.js';
import { buildLoadoutPicker } from './loadout.js';

// ---------- 3D setup ----------
let map = MAPS[DEFAULT_MAP];
let terrain = createTerrain(map);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.5, 6000);
let world = buildWorld(scene, map, terrain);
const effects = new Effects(scene);
const hud = new Hud();
const input = new Input(renderer.domElement);
input.detectLockSupport();
const sound = new SoundSystem();

/** Swap the scenery to another map (host changed it, or we joined a room on another map). */
function loadMap(mapKey) {
  if (!MAPS[mapKey] || MAPS[mapKey] === map) return;
  world.dispose();
  map = MAPS[mapKey];
  terrain = createTerrain(map);
  world = buildWorld(scene, map, terrain);
  game?.setMap(map, terrain);
}

/** @type {NetGame|null} */
let game = null;
let socket = null;

// ---------- Menu ----------
const $ = (id) => document.getElementById(id);
const menuEl = $('menu'), pauseEl = $('pause');
const lockPrompt = $('lock-prompt');
const nameInput = $('name-input'), codeInput = $('code-input'), errorEl = $('menu-error');
const createBtn = $('create-btn'), joinBtn = $('join-btn');

nameInput.value = localStorage.getItem('skybrawl.name') ?? '';
const urlRoom = cleanCode(new URLSearchParams(location.search).get('room'));
if (urlRoom) codeInput.value = urlRoom;
(nameInput.value ? (urlRoom ? joinBtn : createBtn) : nameInput).focus();

// Plane + colour pickers (start menu and Esc menu share the saved choice).
const menuPicker = buildLoadoutPicker($('menu-loadout'));
const pausePicker = buildLoadoutPicker($('pause-loadout'), (loadout) => {
  socket?.emit('loadout', loadout);
  menuPicker.refresh();
});

async function enter(action) {
  const name = nameInput.value.trim();
  const code = cleanCode(codeInput.value);
  if (action === 'join' && code.length !== 4) { errorEl.textContent = 'Room codes have 4 letters'; return; }
  localStorage.setItem('skybrawl.name', name);
  errorEl.textContent = '';
  createBtn.disabled = joinBtn.disabled = true;
  input.requestLock(); // must happen during the click
  sound.start();       // browsers only allow audio after a click
  const loadout = menuPicker.value;
  try {
    socket ??= connect();
    const welcome = action === 'create' ? await createRoom(socket, name, loadout) : await joinRoom(socket, code, name, loadout);
    startGame(welcome);
  } catch (err) {
    errorEl.textContent = err.message;
    input.releaseLock();
  } finally {
    createBtn.disabled = joinBtn.disabled = false;
  }
}

createBtn.addEventListener('click', () => enter('create'));
joinBtn.addEventListener('click', () => enter('join'));
codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter('join'); });
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(codeInput.value ? 'join' : 'create'); });

function startGame(welcome) {
  loadMap(welcome.map);
  game = new NetGame({ scene, camera, effects, hud, input, map, terrain, sound }, socket, welcome);
  game.onRoomChange = updateHostUI;
  game.onMapChange = loadMap;
  pausePicker.refresh();
  socket.on('roster', () => setTimeout(updateHostUI)); // host may change when someone leaves
  menuEl.classList.add('hidden');
  hud.show(true);
  input.enabled = true;
  input.consumeMouse();
  history.replaceState(null, '', `/?room=${welcome.code}`);
  $('pause-code').textContent = welcome.code;
  $('invite-link').value = `${location.origin}/?room=${welcome.code}`;
  socket.on('disconnect', () => {
    input.enabled = false;
    input.releaseLock();
    pauseEl.classList.add('hidden');
    $('disconnected').classList.remove('hidden');
  });
}

// ---------- Pause / invite menu (the match keeps running) ----------
function pause() {
  if (!game || !pauseEl.classList.contains('hidden')) return;
  input.enabled = false;
  updateHostUI();
  pauseEl.classList.remove('hidden');
}
function resume() {
  pauseEl.classList.add('hidden');
  input.requestLock();
  input.consumeMouse();
  input.mouse.left = false;
  input.enabled = true;
}
input.onPauseRequest = pause;

// Host-only match settings in the Esc menu.
function updateHostUI() {
  if (!game) return;
  const host = game.isHost;
  for (const btn of document.querySelectorAll('.mode-btn')) {
    btn.classList.toggle('active', btn.dataset.mode === game.room.mode);
    btn.disabled = !host;
  }
  for (const btn of document.querySelectorAll('.map-btn')) {
    btn.classList.toggle('active', btn.dataset.map === game.room.map);
    btn.disabled = !host;
  }
  $('restart-btn').disabled = !host;
  const hostName = game.nameOf(game.room.hostId);
  $('host-note').textContent = host
    ? 'You are the host. Changing the mode or map starts a new match.'
    : `Only the host (${hostName}) can change these.`;
}
for (const btn of document.querySelectorAll('.mode-btn')) {
  btn.addEventListener('click', () => { if (game?.isHost && btn.dataset.mode !== game.room.mode) socket.emit('setMode', btn.dataset.mode); });
}
// One button per map, built from shared/maps.js.
for (const [key, m] of Object.entries(MAPS)) {
  const btn = document.createElement('button');
  btn.className = 'map-btn';
  btn.dataset.map = key;
  btn.textContent = m.name.toUpperCase();
  btn.title = m.description;
  btn.addEventListener('click', () => { if (game?.isHost && key !== game.room.map) socket.emit('setMap', key); });
  $('map-buttons').appendChild(btn);
}

// Volume sliders (saved between visits) and M to toggle music.
for (const slider of document.querySelectorAll('[data-vol]')) {
  slider.value = sound.volumes[slider.dataset.vol];
  slider.addEventListener('input', () => sound.setVolume(slider.dataset.vol, Number(slider.value)));
}
addEventListener('keydown', (e) => {
  if (e.code !== 'KeyM' || e.target instanceof HTMLInputElement) return;
  const vol = sound.toggleMusic();
  document.querySelector('[data-vol=music]').value = vol;
  hud.notice(vol > 0 ? 'Music on' : 'Music off');
});

$('restart-btn').addEventListener('click', () => { if (game?.isHost) socket.emit('restart'); });
$('resume-btn').addEventListener('click', resume);
$('leave-btn').addEventListener('click', () => { location.href = '/'; });
$('copy-btn').addEventListener('click', async () => {
  const link = $('invite-link');
  try { await navigator.clipboard.writeText(link.value); } catch { link.select(); document.execCommand('copy'); }
  $('copy-btn').textContent = 'COPIED!';
  setTimeout(() => { $('copy-btn').textContent = 'COPY'; }, 1500);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- Main loop ----------
let lastTime = performance.now();
let menuTime = 0;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  if (game) {
    game.update(dt);
    lockPrompt.classList.toggle('hidden', !input.needsLock);
    // Fallback for browsers that block mouse lock: hide the cursor so it still feels locked.
    document.body.classList.toggle('hide-cursor', input.enabled && input.lockBlocked);
  } else {
    // Slow cinematic orbit behind the menu.
    menuTime += dt;
    camera.position.set(Math.cos(menuTime * 0.05) * 900, 320, Math.sin(menuTime * 0.05) * 900);
    camera.lookAt(0, 60, 0);
  }
  effects.update(dt);
  world.update(dt, camera);
  renderer.render(scene, camera);
}
hud.warning('');
frame();

// Handy for debugging in the browser console.
window.skyBrawl = { get game() { return game; }, input };
