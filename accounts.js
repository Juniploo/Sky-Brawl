// Player accounts: name + password, XP and unlocked planes.
// Uses Postgres when DATABASE_URL is set (Render), otherwise an in-memory store (local testing).
const crypto = require('crypto');
const PLANES = require('./public/planes.json');
const BY_ID = Object.fromEntries(PLANES.map(p => [p.id, p]));
const STARTERS = PLANES.filter(p => p.cost === 0).map(p => p.id);

const hash = (pass, salt) => crypto.scryptSync(pass, salt, 32).toString('hex');
const key = name => name.trim().toLowerCase();

function memoryStore() {
  const users = new Map(), byKey = new Map(), sessions = new Map(); let next = 1;
  return {
    async init() {},
    async create(name, salt, h) { if (byKey.has(key(name))) return null; const u = { id: next++, name, salt, hash: h, xp: 0, total_xp: 0, unlocked: [...STARTERS] }; users.set(u.id, u); byKey.set(key(name), u.id); return { ...u }; },
    async byName(name) { const id = byKey.get(key(name)); return id ? { ...users.get(id) } : null; },
    async byId(id) { const u = users.get(id); return u ? { ...u } : null; },
    async save(u) { const cur = users.get(u.id); if (cur) Object.assign(cur, { xp: u.xp, total_xp: u.total_xp, unlocked: [...u.unlocked] }); },
    async addSession(token, id) { sessions.set(token, id); },
    async session(token) { return sessions.get(token) || null; },
    async dropSession(token) { sessions.delete(token); },
  };
}
function pgStore(url) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, ssl: /render\.com/.test(url) && !/\.internal|dpg-[a-z0-9]+-a\//.test(url) ? { rejectUnauthorized: false } : false, max: 5 });
  const row = r => r && { ...r, unlocked: Array.isArray(r.unlocked) ? r.unlocked : JSON.parse(r.unlocked || '[]') };
  return {
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, name_key TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0, total_xp INTEGER NOT NULL DEFAULT 0, unlocked JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await pool.query(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    },
    async create(name, salt, h) {
      const r = await pool.query(`INSERT INTO users (name, name_key, salt, hash, unlocked) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name_key) DO NOTHING RETURNING *`, [name, key(name), salt, h, JSON.stringify(STARTERS)]);
      return row(r.rows[0]);
    },
    async byName(name) { return row((await pool.query('SELECT * FROM users WHERE name_key = $1', [key(name)])).rows[0]); },
    async byId(id) { return row((await pool.query('SELECT * FROM users WHERE id = $1', [id])).rows[0]); },
    async save(u) { await pool.query('UPDATE users SET xp = $2, total_xp = $3, unlocked = $4 WHERE id = $1', [u.id, u.xp, u.total_xp, JSON.stringify(u.unlocked)]); },
    async addSession(token, id) { await pool.query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, id]); },
    async session(token) { const r = await pool.query('SELECT user_id FROM sessions WHERE token = $1', [token]); return r.rows[0] ? r.rows[0].user_id : null; },
    async dropSession(token) { await pool.query('DELETE FROM sessions WHERE token = $1', [token]); },
  };
}

const store = process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : memoryStore();
const profile = u => ({ name: u.name, xp: u.xp, totalXp: u.total_xp, unlocked: u.unlocked });

module.exports = {
  PLANES, BY_ID, STARTERS, profile,
  usingDatabase: !!process.env.DATABASE_URL,
  init: () => store.init(),
  async register(name, pass) {
    name = String(name || '').trim();
    if (!/^[A-Za-z0-9_ -]{3,16}$/.test(name)) return { error: 'Names are 3 to 16 letters, numbers, spaces, - or _.' };
    if (String(pass || '').length < 4 || String(pass).length > 64) return { error: 'Passwords need at least 4 characters.' };
    const salt = crypto.randomBytes(16).toString('hex');
    const u = await store.create(name, salt, hash(String(pass), salt));
    if (!u) return { error: 'That name is taken. Pick another one or log in.' };
    const token = crypto.randomBytes(24).toString('hex'); await store.addSession(token, u.id);
    return { user: u, token };
  },
  async login(name, pass) {
    const u = await store.byName(String(name || ''));
    if (!u) return { error: 'Wrong name or password.' };
    const a = Buffer.from(hash(String(pass || ''), u.salt), 'hex'), b = Buffer.from(u.hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { error: 'Wrong name or password.' };
    const token = crypto.randomBytes(24).toString('hex'); await store.addSession(token, u.id);
    return { user: u, token };
  },
  async resume(token) { const id = typeof token === 'string' && token.length < 100 ? await store.session(token) : null; const u = id ? await store.byId(id) : null; return u ? { user: u } : { error: 'Please log in again.' }; },
  logout: token => store.dropSession(String(token || '')),
  // Unlock a plane: it must exist, not be owned, have one of its required planes, and you need enough XP
  async unlock(u, id) {
    const p = BY_ID[id];
    if (!p) return { error: 'Unknown plane.' };
    if (u.unlocked.includes(id)) return { error: 'You already have that plane.' };
    if (p.req.length && !p.req.some(r => u.unlocked.includes(r))) return { error: 'Unlock ' + p.req.map(r => BY_ID[r].short).join(' or ') + ' first.' };
    if (u.xp < p.cost) return { error: `You need ${p.cost - u.xp} more XP.` };
    u.xp -= p.cost; u.unlocked.push(id); await store.save(u);
    return { ok: true };
  },
  async award(u, xp) { u.xp += xp; u.total_xp += xp; await store.save(u); },
};
