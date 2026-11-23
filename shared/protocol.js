// Game-wide multiplayer settings shared by browser and server.

export const TICK_RATE = 30;          // server updates per second
export const INTERP_DELAY = 100;      // ms: other planes are drawn this far in the past, for smoothness
export const MAX_LAG_COMP = 350;      // ms: most the server will rewind time when checking a hit
export const MAX_PLAYERS = 10;
export const RESPAWN_TIME = 3;        // seconds
export const SPAWN_PROTECTION = 2;    // seconds of invulnerability after spawning
export const WAVE_DELAY = 5;          // seconds before a new balloon wave
export const FORCED_DOWN_WINDOW = 6;  // seconds: crash shortly after being shot = kill for the shooter

export const POINTS = { kill: 100, balloon: 10 };

// Each player in a room gets the first free colour.
export const PLAYER_COLORS = [
  0xff5a36, 0x3a86ff, 0x2ec27e, 0xffbe0b, 0x9b5de5,
  0xff4f9a, 0x00c2c7, 0xf5f5f5, 0x8ac926, 0x6d4c41
];

export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I mix-ups
export const ROOM_CODE_LENGTH = 4;

export function cleanName(name) {
  const n = String(name ?? '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16);
  return n || 'Pilot';
}

export function cleanCode(code) {
  return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

export const colorToCss = (c) => '#' + c.toString(16).padStart(6, '0');

// ---------- Matches & modes ----------
// Seconds per match (5 minutes). The server can override it for testing: MATCH_LENGTH=60 npm start
export const MATCH_LENGTH = Number(globalThis.process?.env?.MATCH_LENGTH) || 300;
export const RESULTS_TIME = 10;   // seconds the results screen shows before the next match

export const MODES = {
  ffa: { name: 'Free-for-all', short: 'FFA', teams: false },
  tdm: { name: 'Team Deathmatch', short: 'TDM', teams: true }
};
export const DEFAULT_MODE = 'ffa';

export const TEAMS = {
  red:  { name: 'Red',  css: '#ff4d4d', colors: [0xff4040, 0xd62f2f, 0xff7a5c, 0xb81d1d, 0xff9b7a] },
  blue: { name: 'Blue', css: '#4d8dff', colors: [0x3a86ff, 0x2a5fd6, 0x6fa8ff, 0x1d44b8, 0x8fc0ff] }
};
