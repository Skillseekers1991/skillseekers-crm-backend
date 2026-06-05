/**
 * Skill Seekers CRM — shared backend (Supabase Postgres storage)
 * --------------------------------------------------------------
 * Data lives in a free Supabase Postgres database, so it survives
 * any server restart/redeploy/sleep. No file on the server.
 *
 * - Auth: hashed passwords (bcryptjs) + JWT tokens
 * - Storage: two tables — store(key,value) and auth_users(id,name,role,hash)
 *
 * Needs ONE environment variable for the DB: DATABASE_URL
 * (the Supabase connection string). Plus JWT_SECRET and CRM_ORIGIN.
 */

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-env';
const ORIGIN = process.env.CRM_ORIGIN || '*';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Paste your Supabase connection string into Render env vars.');
}

// Supabase requires SSL
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ---- create tables on startup, then seed admin ----
async function init() {
  await pool.query(`CREATE TABLE IF NOT EXISTS store (
    key TEXT PRIMARY KEY,
    value JSONB
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS auth_users (
    id TEXT PRIMARY KEY,
    name TEXT,
    role TEXT,
    hash TEXT
  )`);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM auth_users');
  if (rows[0].c === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await pool.query('INSERT INTO auth_users(id,name,role,hash) VALUES($1,$2,$3,$4)',
      ['admin', 'Administrator', 'admin', hash]);
    // mirror into users store so the UI lists the admin
    const users = [{ id: 'admin', name: 'Administrator', role: 'admin', pass: '\u2022\u2022\u2022\u2022\u2022\u2022' }];
    await pool.query(`INSERT INTO store(key,value) VALUES('users',$1)
      ON CONFLICT(key) DO NOTHING`, [JSON.stringify(users)]);
    console.log('Seeded default admin: admin / admin123 (change after first login!)');
  }
  console.log('Database ready.');
}

async function getKey(key) {
  const { rows } = await pool.query('SELECT value FROM store WHERE key=$1', [key]);
  return rows.length ? rows[0].value : null;
}
async function setKey(key, value) {
  await pool.query(`INSERT INTO store(key,value) VALUES($1,$2)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [key, JSON.stringify(value)]);
}

const app = express();
app.use(cors({ origin: ORIGIN }));
app.use(express.json({ limit: '12mb' }));

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e.message) }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { id, pass } = req.body || {};
    const { rows } = await pool.query('SELECT * FROM auth_users WHERE id=$1', [String(id || '').trim()]);
    const u = rows[0];
    if (!u || !bcrypt.compareSync(String(pass || ''), u.hash)) {
      return res.status(401).json({ error: 'Wrong login ID or password' });
    }
    const token = jwt.sign({ id: u.id, name: u.name, role: u.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: u.id, name: u.name, role: u.role } });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.get('/api/data/:key', auth, async (req, res) => {
  try { res.json({ value: await getKey(req.params.key) }); }
  catch (e) { res.status(500).json({ error: String(e.message) }); }
});

app.put('/api/data/:key', auth, async (req, res) => {
  try {
    const key = req.params.key;
    const value = req.body.value;
    if (key === 'users' && !['admin', 'leader'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    await setKey(key, value);
    if (key === 'users' && Array.isArray(value)) await syncAuthUsers(value);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e.message) }); }
});

async function syncAuthUsers(users) {
  const { rows } = await pool.query('SELECT id, hash FROM auth_users');
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  const seen = new Set();
  for (const u of users) {
    seen.add(u.id);
    const sentPass = u.pass && u.pass !== '\u2022\u2022\u2022\u2022\u2022\u2022' ? u.pass : null;
    const hash = sentPass ? bcrypt.hashSync(String(sentPass), 10)
                          : (byId[u.id] ? byId[u.id].hash : bcrypt.hashSync('changeme', 10));
    await pool.query(`INSERT INTO auth_users(id,name,role,hash) VALUES($1,$2,$3,$4)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, hash=excluded.hash`,
      [u.id, u.name || '', u.role || 'recruiter', hash]);
  }
  for (const r of rows) { if (!seen.has(r.id)) await pool.query('DELETE FROM auth_users WHERE id=$1', [r.id]); }
}

app.get('/', (_req, res) => res.send('Skill Seekers CRM backend (Supabase) is running.'));

init()
  .then(() => app.listen(PORT, () => console.log(`CRM backend listening on :${PORT}`)))
  .catch(err => { console.error('Startup failed:', err); process.exit(1); });
