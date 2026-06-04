/**
 * Skill Seekers CRM — shared backend (no compiled dependencies)
 * --------------------------------------------------------------
 * One server + one data file that every device talks to, so the
 * whole team shares the same data. Built to deploy cleanly anywhere
 * (no native modules to compile).
 *
 * - Auth: hashed passwords (bcryptjs) + JWT tokens
 * - Storage: a single JSON file (db.json) holding all CRM keys
 */

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-env';
const DATA_DIR = process.env.DATA_DIR || (process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : __dirname);
const DB_FILE = path.join(DATA_DIR, 'db.json');
const ORIGIN = process.env.CRM_ORIGIN || '*';

try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { store: {}, auth: {} }; }
}
function writeDB(db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
let DB = readDB();
function persist() { writeDB(DB); }
function getKey(key) { return key in DB.store ? DB.store[key] : null; }
function setKey(key, value) { DB.store[key] = value; persist(); }

function seedAdmin() {
  if (Object.keys(DB.auth).length === 0) {
    DB.auth['admin'] = { name: 'Administrator', role: 'admin', hash: bcrypt.hashSync('admin123', 10) };
    const users = getKey('users') || [];
    if (!users.find(u => u.id === 'admin')) {
      users.push({ id: 'admin', name: 'Administrator', role: 'admin', pass: '\u2022\u2022\u2022\u2022\u2022\u2022' });
      DB.store['users'] = users;
    }
    persist();
    console.log('Seeded default admin: admin / admin123  (change after first login!)');
  }
}
seedAdmin();

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

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/login', (req, res) => {
  const { id, pass } = req.body || {};
  const u = DB.auth[String(id || '').trim()];
  if (!u || !bcrypt.compareSync(String(pass || ''), u.hash)) {
    return res.status(401).json({ error: 'Wrong login ID or password' });
  }
  const token = jwt.sign({ id: String(id).trim(), name: u.name, role: u.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: String(id).trim(), name: u.name, role: u.role } });
});

app.get('/api/data/:key', auth, (req, res) => {
  res.json({ value: getKey(req.params.key) });
});

app.put('/api/data/:key', auth, (req, res) => {
  const key = req.params.key;
  const value = req.body.value;
  if (key === 'users' && !['admin', 'leader'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  setKey(key, value);
  if (key === 'users' && Array.isArray(value)) syncAuthUsers(value);
  res.json({ ok: true });
});

function syncAuthUsers(users) {
  const seen = new Set();
  users.forEach(u => {
    seen.add(u.id);
    const sentPass = u.pass && u.pass !== '\u2022\u2022\u2022\u2022\u2022\u2022' ? u.pass : null;
    const existing = DB.auth[u.id];
    const hash = sentPass ? bcrypt.hashSync(String(sentPass), 10)
                          : (existing ? existing.hash : bcrypt.hashSync('changeme', 10));
    DB.auth[u.id] = { name: u.name || '', role: u.role || 'recruiter', hash };
  });
  Object.keys(DB.auth).forEach(id => { if (!seen.has(id)) delete DB.auth[id]; });
  persist();
}

app.get('/', (_req, res) => res.send('Skill Seekers CRM backend is running.'));
app.listen(PORT, () => console.log(`CRM backend listening on :${PORT}`));
