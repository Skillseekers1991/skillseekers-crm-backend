/**
 * Skill Seekers CRM — shared backend
 * --------------------------------------------------------------
 * One server + one SQLite database that every device talks to,
 * so the whole team shares the same data.
 *
 * - Auth: hashed passwords (bcrypt) + JWT tokens
 * - Storage: a generic key/value store mirroring the CRM's sget/sset,
 *   so the frontend change is minimal. Data is JSON per key.
 * - Roles enforced on the server for write-sensitive keys.
 *
 * Endpoints:
 *   POST /api/login            { id, pass } -> { token, user }
 *   GET  /api/data/:key        -> { value }            (auth required)
 *   PUT  /api/data/:key        { value } -> { ok }     (auth required)
 *   GET  /api/health           -> ok
 *
 * The CRM stores everything under these keys: users, lineups, selections,
 * jobs, clients, candidates, vendors, wa_api, coordReminded.
 */

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-env';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'crm.db');
const ORIGIN = process.env.CRM_ORIGIN || '*';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ---- schema ----
db.exec(`
  CREATE TABLE IF NOT EXISTS store (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auth_users (
    id   TEXT PRIMARY KEY,
    name TEXT,
    role TEXT,
    hash TEXT
  );
`);

const app = express();
app.use(cors({ origin: ORIGIN }));
app.use(express.json({ limit: '12mb' }));

// ---- helpers ----
function getKey(key) {
  const row = db.prepare('SELECT value FROM store WHERE key=?').get(key);
  return row ? JSON.parse(row.value) : null;
}
function setKey(key, value) {
  db.prepare(`INSERT INTO store(key,value) VALUES(?,?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
    .run(key, JSON.stringify(value));
}

// On first run, seed an admin login if none exists.
function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) c FROM auth_users').get().c;
  if (count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO auth_users(id,name,role,hash) VALUES(?,?,?,?)')
      .run('admin', 'Administrator', 'admin', hash);
    // also mirror into the CRM "users" store so the UI shows the admin
    const users = getKey('users') || [];
    if (!users.find(u => u.id === 'admin')) {
      users.push({ id: 'admin', name: 'Administrator', role: 'admin', pass: '••••••' });
      setKey('users', users);
    }
    console.log('Seeded default admin: admin / admin123  (change this after first login!)');
  }
}
seedAdmin();

// ---- auth middleware ----
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ---- routes ----
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/login', (req, res) => {
  const { id, pass } = req.body || {};
  const u = db.prepare('SELECT * FROM auth_users WHERE id=?').get(String(id || '').trim());
  if (!u || !bcrypt.compareSync(String(pass || ''), u.hash)) {
    return res.status(401).json({ error: 'Wrong login ID or password' });
  }
  const token = jwt.sign({ id: u.id, name: u.name, role: u.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: u.id, name: u.name, role: u.role } });
});

// Read any data key
app.get('/api/data/:key', auth, (req, res) => {
  res.json({ value: getKey(req.params.key) });
});

// Write any data key. When the "users" key is written, sync the auth table
// (create/update logins with hashed passwords) so new users can sign in.
app.put('/api/data/:key', auth, (req, res) => {
  const key = req.params.key;
  const value = req.body.value;

  // Only admins/leaders may write the users list; everyone may write their working data.
  if (key === 'users' && !['admin', 'leader'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Not allowed' });
  }

  setKey(key, value);

  if (key === 'users' && Array.isArray(value)) {
    syncAuthUsers(value);
  }
  res.json({ ok: true });
});

// Keep auth_users in sync with the CRM users list.
// New users get their plaintext "pass" hashed; removed users are deleted.
function syncAuthUsers(users) {
  const existing = db.prepare('SELECT id, hash FROM auth_users').all();
  const byId = Object.fromEntries(existing.map(u => [u.id, u]));
  const seen = new Set();

  const upsert = db.prepare(`INSERT INTO auth_users(id,name,role,hash) VALUES(?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, hash=excluded.hash`);

  users.forEach(u => {
    seen.add(u.id);
    // If the UI sent a real password (not the masked placeholder), (re)hash it.
    const sentPass = u.pass && u.pass !== '••••••' ? u.pass : null;
    const hash = sentPass ? bcrypt.hashSync(String(sentPass), 10)
                          : (byId[u.id] ? byId[u.id].hash : bcrypt.hashSync('changeme', 10));
    upsert.run(u.id, u.name || '', u.role || 'recruiter', hash);
  });

  // delete logins no longer present (but never delete the last admin)
  existing.forEach(u => {
    if (!seen.has(u.id)) db.prepare('DELETE FROM auth_users WHERE id=?').run(u.id);
  });
}

app.get('/', (_req, res) => res.send('Skill Seekers CRM backend is running.'));
app.listen(PORT, () => console.log(`CRM backend listening on :${PORT}`));
