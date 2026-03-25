const express = require('express');
const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db', 'korpsinventar.db');

app.use(express.json());

const SESSION_DB_PATH = path.dirname(DB_PATH);
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: SESSION_DB_PATH }),
  secret: process.env.SESSION_SECRET || 'korpsinventar-hemmelighet-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// --- PERMISSIONS ---
const ALL_PERMS = [
  'instruments_read','instruments_write','instruments_delete',
  'players_read','players_write','players_delete','players_assign',
  'service_read','service_write','service_delete',
  'accessories_read','accessories_write','accessories_delete',
  'todos_read','todos_write','todos_delete',
  'workshops_admin','suppliers_admin','reports_read','users_admin'
];
const ROLE_PERMS = {
  admin: ALL_PERMS,
  user: [
    'instruments_read','instruments_write',
    'players_read','players_write','players_assign',
    'service_read','service_write',
    'accessories_read','accessories_write',
    'todos_read','todos_write',
    'reports_read'
  ]
};

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Ikke innlogget' });
  next();
}
function requirePerm(perm) {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Ikke innlogget' });
    const perms = req.session.permissions || [];
    if (!perms.includes(perm)) return res.status(403).json({ error: 'Ingen tilgang' });
    next();
  };
}

// --- MIGRATIONS FOR EXISTING DATABASES ---
try { db.exec('ALTER TABLE instruments ADD COLUMN korps_id TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE instruments ADD COLUMN next_check TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE accessories ADD COLUMN supplier TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE accessories ADD COLUMN barcode TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE accessories ADD COLUMN price REAL'); } catch(e) {}
try { db.exec('ALTER TABLE accessories ADD COLUMN invoice_no TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE accessories ADD COLUMN supplier_id TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE service ADD COLUMN date_finished TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE service ADD COLUMN workshop_id TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE service ADD COLUMN picked_up INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE service ADD COLUMN invoice_no TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE todos ADD COLUMN in_progress INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE todos ADD COLUMN assigned_to TEXT'); } catch(e) {}
try { db.exec("UPDATE todos SET type='general' WHERE type IS NULL"); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN disabled INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE users ADD COLUMN created_by TEXT'); } catch(e) {}
try { db.exec("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en'"); } catch(e) {}
try { db.exec('ALTER TABLE instruments ADD COLUMN registered_by TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE instruments ADD COLUMN supplier_id TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE instruments ADD COLUMN purchase_price REAL'); } catch(e) {}
try { db.exec('ALTER TABLE players ADD COLUMN registered_by TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE service ADD COLUMN registered_by TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE accessories ADD COLUMN registered_by TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE service ADD COLUMN delivered INTEGER DEFAULT 1'); } catch(e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS instruments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    condition TEXT,
    serial TEXT,
    purchase TEXT,
    notes TEXT,
    korps_id TEXT,
    next_check TEXT
  );
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    section TEXT,
    contact TEXT
  );
  CREATE TABLE IF NOT EXISTS player_instruments (
    player_id TEXT,
    instrument_id TEXT,
    PRIMARY KEY (player_id, instrument_id)
  );
  CREATE TABLE IF NOT EXISTS service (
    id TEXT PRIMARY KEY,
    date TEXT,
    inst_id TEXT,
    type TEXT,
    cost REAL,
    by_whom TEXT,
    desc TEXT,
    next_due TEXT,
    date_finished TEXT,
    workshop_id TEXT,
    picked_up INTEGER DEFAULT 0,
    invoice_no TEXT
  );
  CREATE TABLE IF NOT EXISTS accessories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    stock INTEGER DEFAULT 0,
    min_level INTEGER DEFAULT 2,
    notes TEXT,
    supplier TEXT,
    barcode TEXT,
    price REAL,
    invoice_no TEXT,
    supplier_id TEXT
  );
  CREATE TABLE IF NOT EXISTS workshops (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT,
    address TEXT,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT,
    address TEXT,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS acc_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    type TEXT,
    ref_id TEXT,
    note TEXT,
    created TEXT,
    created_by TEXT,
    done INTEGER DEFAULT 0,
    done_date TEXT,
    done_by TEXT,
    in_progress INTEGER DEFAULT 0,
    assigned_to TEXT
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    permissions TEXT,
    force_password_change INTEGER DEFAULT 0,
    disabled INTEGER DEFAULT 0,
    last_login TEXT,
    created TEXT,
    created_by TEXT,
    language TEXT DEFAULT 'en'
  );
`);

// Seed default admin user
if (!db.prepare("SELECT id FROM users WHERE username='admin'").get()) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (id,username,display_name,password_hash,role,permissions,force_password_change,disabled,last_login,created,created_by) VALUES (?,?,?,?,?,?,1,0,NULL,?,NULL)').run(
    uid(), 'admin', 'Administrator', hash, 'admin',
    JSON.stringify(ALL_PERMS), new Date().toISOString().slice(0, 10)
  );
}

// Seed default accessory categories
['Rørblad', 'Oljer og fett', 'Munnstykker', 'Stropper og etuier', 'Rengjøring', 'Notemateriell', 'Annet'].forEach(n => {
  try { db.prepare('INSERT OR IGNORE INTO acc_categories (id, name) VALUES (?,?)').run(uid(), n); } catch(e) {}
});

// --- INSTRUMENTS ---
app.get('/api/instruments', requirePerm('instruments_read'), (_req, res) => {
  res.json(db.prepare('SELECT * FROM instruments ORDER BY name').all());
});

app.post('/api/instruments', requirePerm('instruments_write'), (req, res) => {
  const { name, category, condition, serial, purchase, notes, korps_id, next_check, registered_by, supplier_id, purchase_price } = req.body;
  const id = uid();
  db.prepare('INSERT INTO instruments (id,name,category,condition,serial,purchase,notes,korps_id,next_check,registered_by,supplier_id,purchase_price) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, name, category, condition, serial, purchase, notes, korps_id||null, next_check||null, registered_by||null, supplier_id||null, purchase_price||null);
  res.json({ id });
});

app.put('/api/instruments/:id', requirePerm('instruments_write'), (req, res) => {
  const { name, category, condition, serial, purchase, notes, korps_id, next_check, registered_by, supplier_id, purchase_price } = req.body;
  db.prepare('UPDATE instruments SET name=?,category=?,condition=?,serial=?,purchase=?,notes=?,korps_id=?,next_check=?,registered_by=?,supplier_id=?,purchase_price=? WHERE id=?')
    .run(name, category, condition, serial, purchase, notes, korps_id||null, next_check||null, registered_by||null, supplier_id||null, purchase_price||null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/instruments/:id', requirePerm('instruments_delete'), (req, res) => {
  const id = req.params.id;
  db.prepare('DELETE FROM instruments WHERE id=?').run(id);
  db.prepare('DELETE FROM player_instruments WHERE instrument_id=?').run(id);
  db.prepare('DELETE FROM service WHERE inst_id=?').run(id);
  res.json({ ok: true });
});

// --- PLAYERS ---
app.get('/api/players', requirePerm('players_read'), (_req, res) => {
  const players = db.prepare('SELECT * FROM players ORDER BY name').all();
  const links = db.prepare('SELECT * FROM player_instruments').all();
  players.forEach(p => {
    p.instruments = links.filter(l => l.player_id === p.id).map(l => l.instrument_id);
  });
  res.json(players);
});

app.post('/api/players', requirePerm('players_write'), (req, res) => {
  const { name, section, contact, instruments, registered_by } = req.body;
  const id = uid();
  db.prepare('INSERT INTO players (id,name,section,contact,registered_by) VALUES (?,?,?,?,?)').run(id, name, section, contact, registered_by||null);
  // Enforce 1 instrument = 1 player: remove instrument from any other player before assigning
  const delFromOther = db.prepare('DELETE FROM player_instruments WHERE instrument_id=? AND player_id!=?');
  const ins = db.prepare('INSERT OR IGNORE INTO player_instruments VALUES (?,?)');
  (instruments || []).forEach(iid => { delFromOther.run(iid, id); ins.run(id, iid); });
  res.json({ id });
});

app.put('/api/players/:id', requirePerm('players_write'), (req, res) => {
  const { name, section, contact, instruments, registered_by } = req.body;
  db.prepare('UPDATE players SET name=?,section=?,contact=?,registered_by=? WHERE id=?').run(name, section, contact, registered_by||null, req.params.id);
  db.prepare('DELETE FROM player_instruments WHERE player_id=?').run(req.params.id);
  // Enforce 1 instrument = 1 player
  const delFromOther = db.prepare('DELETE FROM player_instruments WHERE instrument_id=? AND player_id!=?');
  const ins = db.prepare('INSERT INTO player_instruments VALUES (?,?)');
  (instruments || []).forEach(iid => { delFromOther.run(iid, req.params.id); ins.run(req.params.id, iid); });
  res.json({ ok: true });
});

app.delete('/api/players/:id', requirePerm('players_delete'), (req, res) => {
  db.prepare('DELETE FROM players WHERE id=?').run(req.params.id);
  db.prepare('DELETE FROM player_instruments WHERE player_id=?').run(req.params.id);
  res.json({ ok: true });
});

// --- SERVICE ---
app.get('/api/service', requirePerm('service_read'), (_req, res) => {
  res.json(db.prepare('SELECT * FROM service ORDER BY date DESC').all());
});

app.post('/api/service', requirePerm('service_write'), (req, res) => {
  const { date, inst_id, type, cost, by_whom, desc, next_due, date_finished, workshop_id, invoice_no, registered_by, delivered } = req.body;
  const id = uid();
  db.prepare('INSERT INTO service (id,date,inst_id,type,cost,by_whom,desc,next_due,date_finished,workshop_id,picked_up,invoice_no,registered_by,delivered) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?)')
    .run(id, date, inst_id, type, cost, by_whom||null, desc||null, next_due||null, date_finished||null, workshop_id||null, invoice_no||null, registered_by||null, delivered??0);
  res.json({ id });
});

app.put('/api/service/:id', requirePerm('service_write'), (req, res) => {
  const { date, inst_id, type, cost, by_whom, desc, next_due, date_finished, workshop_id, picked_up, invoice_no, registered_by, delivered } = req.body;
  db.prepare('UPDATE service SET date=?,inst_id=?,type=?,cost=?,by_whom=?,desc=?,next_due=?,date_finished=?,workshop_id=?,picked_up=?,invoice_no=?,registered_by=?,delivered=? WHERE id=?')
    .run(date, inst_id, type, cost, by_whom||null, desc||null, next_due||null, date_finished||null, workshop_id||null, picked_up??0, invoice_no||null, registered_by||null, delivered??1, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/service/:id', requirePerm('service_delete'), (req, res) => {
  db.prepare('DELETE FROM service WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/service/:id/pickup', requirePerm('service_write'), (req, res) => {
  db.prepare('UPDATE service SET picked_up=1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/service/:id/deliver', requirePerm('service_write'), (req, res) => {
  db.prepare('UPDATE service SET delivered=1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// --- WORKSHOPS ---
app.get('/api/workshops', requireAuth, (_req, res) => {
  res.json(db.prepare('SELECT * FROM workshops ORDER BY name').all());
});

app.post('/api/workshops', requirePerm('workshops_admin'), (req, res) => {
  const { name, contact, address, notes } = req.body;
  const id = uid();
  db.prepare('INSERT INTO workshops VALUES (?,?,?,?,?)').run(id, name, contact||null, address||null, notes||null);
  res.json({ id });
});

app.put('/api/workshops/:id', requirePerm('workshops_admin'), (req, res) => {
  const { name, contact, address, notes } = req.body;
  db.prepare('UPDATE workshops SET name=?,contact=?,address=?,notes=? WHERE id=?')
    .run(name, contact||null, address||null, notes||null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/workshops/:id', requirePerm('workshops_admin'), (req, res) => {
  db.prepare('DELETE FROM workshops WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// --- SUPPLIERS ---
app.get('/api/suppliers', requireAuth, (_req, res) => {
  res.json(db.prepare('SELECT * FROM suppliers ORDER BY name').all());
});

app.post('/api/suppliers', requirePerm('suppliers_admin'), (req, res) => {
  const { name, contact, address, notes } = req.body;
  const id = uid();
  db.prepare('INSERT INTO suppliers VALUES (?,?,?,?,?)').run(id, name, contact||null, address||null, notes||null);
  res.json({ id });
});

app.put('/api/suppliers/:id', requirePerm('suppliers_admin'), (req, res) => {
  const { name, contact, address, notes } = req.body;
  db.prepare('UPDATE suppliers SET name=?,contact=?,address=?,notes=? WHERE id=?')
    .run(name, contact||null, address||null, notes||null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/suppliers/:id', requirePerm('suppliers_admin'), (req, res) => {
  db.prepare('DELETE FROM suppliers WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// --- TODOS ---
app.get('/api/todos', requirePerm('todos_read'), (_req, res) => {
  res.json(db.prepare('SELECT * FROM todos ORDER BY created DESC').all());
});

app.post('/api/todos', requirePerm('todos_write'), (req, res) => {
  const { type, ref_id, note, created, created_by } = req.body;
  const id = uid();
  db.prepare('INSERT INTO todos (id,type,ref_id,note,created,created_by,done) VALUES (?,?,?,?,?,?,0)')
    .run(id, type, ref_id, note||null, created||null, created_by||null);
  res.json({ id });
});

app.put('/api/todos/:id', requirePerm('todos_write'), (req, res) => {
  const { note, created_by, assigned_to } = req.body;
  db.prepare('UPDATE todos SET note=?,created_by=?,assigned_to=? WHERE id=?').run(note||null, created_by||null, assigned_to||null, req.params.id);
  res.json({ ok: true });
});

app.post('/api/todos/:id/done', requirePerm('todos_write'), (req, res) => {
  const { done_date, done_by } = req.body;
  db.prepare('UPDATE todos SET done=1,done_date=?,done_by=? WHERE id=?').run(done_date||null, done_by||null, req.params.id);
  res.json({ ok: true });
});

app.post('/api/todos/:id/reopen', requirePerm('todos_write'), (req, res) => {
  db.prepare('UPDATE todos SET done=0,done_date=NULL,done_by=NULL,in_progress=0,assigned_to=NULL WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/todos/:id/start', requirePerm('todos_write'), (req, res) => {
  const { assigned_to } = req.body;
  db.prepare('UPDATE todos SET in_progress=1,assigned_to=? WHERE id=?').run(assigned_to||null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/todos/:id', requirePerm('todos_delete'), (req, res) => {
  db.prepare('DELETE FROM todos WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// --- SETTINGS ---
app.get('/api/settings', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

app.put('/api/settings', requireAuth, (req, res) => {
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const tx = db.transaction(data => {
    Object.entries(data).forEach(([k, v]) => upsert.run(k, v ?? ''));
  });
  tx(req.body);
  res.json({ ok: true });
});

// --- AUTH ---
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Feil brukernavn eller passord' });
  if (user.disabled) return res.status(401).json({ error: 'Denne brukeren er deaktivert' });
  const perms = user.permissions ? JSON.parse(user.permissions) : ROLE_PERMS[user.role] || [];
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.displayName = user.display_name;
  req.session.role = user.role;
  req.session.permissions = perms;
  req.session.forcePasswordChange = !!user.force_password_change;
  req.session.language = user.language || 'en';
  db.prepare('UPDATE users SET last_login=? WHERE id=?').run(new Date().toISOString().slice(0,10), user.id);
  res.json({ ok: true, forcePasswordChange: !!user.force_password_change });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.put('/api/auth/language', requireAuth, (req, res) => {
  const { language } = req.body;
  if (!['en', 'no'].includes(language)) return res.status(400).json({ error: 'Invalid language' });
  db.prepare('UPDATE users SET language=? WHERE id=?').run(language, req.session.userId);
  req.session.language = language;
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: 'Ikke innlogget' });
  res.json({
    id: req.session.userId,
    username: req.session.username,
    displayName: req.session.displayName,
    role: req.session.role,
    permissions: req.session.permissions,
    forcePasswordChange: req.session.forcePasswordChange,
    language: req.session.language || 'en'
  });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'Bruker ikke funnet' });
  if (!req.session.forcePasswordChange && !bcrypt.compareSync(currentPassword, user.password_hash))
    return res.status(401).json({ error: 'Feil nåværende passord' });
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'Nytt passord må være minst 6 tegn' });
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash=?,force_password_change=0 WHERE id=?').run(hash, req.session.userId);
  req.session.forcePasswordChange = false;
  res.json({ ok: true });
});

// --- USERS (admin only) ---
app.get('/api/users', requirePerm('users_admin'), (req, res) => {
  const users = db.prepare('SELECT id,username,display_name,role,permissions,force_password_change,disabled,last_login,created,created_by FROM users ORDER BY username').all();
  res.json(users);
});

app.post('/api/users', requirePerm('users_admin'), (req, res) => {
  const { username, display_name, password, role, permissions } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Brukernavn og passord er påkrevd' });
  if (password.length < 6) return res.status(400).json({ error: 'Passord må være minst 6 tegn' });
  const hash = bcrypt.hashSync(password, 10);
  const id = uid();
  const permsJson = permissions ? JSON.stringify(permissions) : JSON.stringify(ROLE_PERMS[role] || ROLE_PERMS.user);
  try {
    const createdBy = req.session.displayName || req.session.username || null;
    db.prepare('INSERT INTO users (id,username,display_name,password_hash,role,permissions,force_password_change,disabled,last_login,created,created_by) VALUES (?,?,?,?,?,?,1,0,NULL,?,?)').run(id, username, display_name||null, hash, role||'user', permsJson, new Date().toISOString().slice(0,10), createdBy);
    res.json({ id });
  } catch(e) {
    res.status(409).json({ error: 'Brukernavn er allerede i bruk' });
  }
});

app.put('/api/users/:id', requirePerm('users_admin'), (req, res) => {
  const { display_name, role, permissions, force_password_change, disabled } = req.body;
  const permsJson = permissions ? JSON.stringify(permissions) : null;
  const existing = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Bruker ikke funnet' });
  db.prepare('UPDATE users SET display_name=?,role=?,permissions=?,force_password_change=?,disabled=? WHERE id=?')
    .run(display_name||null, role||existing.role, permsJson||existing.permissions, force_password_change?1:0, disabled?1:0, req.params.id);
  res.json({ ok: true });
});

app.post('/api/users/:id/reset-password', requirePerm('users_admin'), (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Passord må være minst 6 tegn' });
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash=?,force_password_change=1 WHERE id=?').run(hash, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/users/:id', requirePerm('users_admin'), (req, res) => {
  if (req.params.id === req.session.userId) return res.status(400).json({ error: 'Kan ikke slette seg selv' });
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// --- ACC CATEGORIES ---
app.get('/api/acc-categories', requireAuth, (_req, res) => {
  res.json(db.prepare('SELECT * FROM acc_categories ORDER BY name').all());
});

app.post('/api/acc-categories', requirePerm('accessories_write'), (req, res) => {
  const { name } = req.body;
  const id = uid();
  try {
    db.prepare('INSERT INTO acc_categories (id, name) VALUES (?,?)').run(id, name);
    res.json({ id });
  } catch(e) {
    const existing = db.prepare('SELECT id FROM acc_categories WHERE name=?').get(name);
    res.json({ id: existing?.id });
  }
});

app.delete('/api/acc-categories/:id', requirePerm('accessories_delete'), (req, res) => {
  db.prepare('DELETE FROM acc_categories WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// --- ACCESSORIES ---
app.get('/api/accessories', requirePerm('accessories_read'), (_req, res) => {
  res.json(db.prepare('SELECT * FROM accessories ORDER BY name').all());
});

app.post('/api/accessories', requirePerm('accessories_write'), (req, res) => {
  const { name, category, stock, min_level, notes, barcode, price, invoice_no, supplier_id, registered_by } = req.body;
  const id = uid();
  db.prepare('INSERT INTO accessories (id,name,category,stock,min_level,notes,barcode,price,invoice_no,supplier_id,registered_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, name, category, stock, min_level, notes||null, barcode||null, price||null, invoice_no||null, supplier_id||null, registered_by||null);
  res.json({ id });
});

app.put('/api/accessories/:id', requirePerm('accessories_write'), (req, res) => {
  const { name, category, stock, min_level, notes, barcode, price, invoice_no, supplier_id, registered_by } = req.body;
  db.prepare('UPDATE accessories SET name=?,category=?,stock=?,min_level=?,notes=?,barcode=?,price=?,invoice_no=?,supplier_id=?,registered_by=? WHERE id=?')
    .run(name, category, stock, min_level, notes||null, barcode||null, price||null, invoice_no||null, supplier_id||null, registered_by||null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/accessories/:id', requirePerm('accessories_delete'), (req, res) => {
  db.prepare('DELETE FROM accessories WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// --- EXPORT ---
app.get('/api/export/:type/:format', requireAuth, async (req, res) => {
  const { type, format } = req.params;
  const today = new Date().toISOString().slice(0, 10);

  let rows = [];
  let sheetName = 'Data';

  if (type === 'instruments') {
    sheetName = 'Instrumenter';
    const instruments = db.prepare('SELECT * FROM instruments ORDER BY name').all();
    const players = db.prepare('SELECT * FROM players').all();
    const links = db.prepare('SELECT * FROM player_instruments').all();
    players.forEach(p => { p.instruments = links.filter(l => l.player_id === p.id).map(l => l.instrument_id); });

    rows.push(['Instrument-ID', 'Navn', 'Kategori', 'Stand', 'Serienummer', 'Kjøpsdato', 'Neste sjekk', 'Tildelt musiker', 'Merknader']);
    instruments.forEach(i => {
      const player = players.find(p => p.instruments.includes(i.id));
      rows.push([i.korps_id || '', i.name, i.category, i.condition, i.serial || '', i.purchase || '', i.next_check || '', player?.name || '', i.notes || '']);
    });

  } else if (type === 'players') {
    sheetName = 'Musikanter';
    const players = db.prepare('SELECT * FROM players ORDER BY name').all();
    const links = db.prepare('SELECT * FROM player_instruments').all();
    const instruments = db.prepare('SELECT * FROM instruments').all();

    rows.push(['Navn', 'Seksjon', 'Kontakt', 'Tildelte instrumenter (ID)', 'Tildelte instrumenter (navn)']);
    players.forEach(p => {
      const iids = links.filter(l => l.player_id === p.id).map(l => l.instrument_id);
      const insts = iids.map(iid => instruments.find(i => i.id === iid)).filter(Boolean);
      rows.push([p.name, p.section, p.contact || '', insts.map(i => i.korps_id || i.name).join('; '), insts.map(i => i.name).join('; ')]);
    });

  } else if (type === 'service') {
    sheetName = 'Servicelogg';
    const service = db.prepare('SELECT * FROM service ORDER BY date DESC').all();
    const instruments = db.prepare('SELECT * FROM instruments').all();
    const workshops = db.prepare('SELECT * FROM workshops').all();

    rows.push(['Innlevert dato', 'Ferdig dato', 'Instrument-ID', 'Instrument', 'Type', 'Beskrivelse', 'Utført av', 'Verksted', 'Status', 'Kostnad (kr)', 'Fakturanummer', 'Neste servicefrist']);
    service.forEach(s => {
      const inst = instruments.find(i => i.id === s.inst_id);
      const ws = workshops.find(w => w.id === s.workshop_id);
      const status = s.delivered === 0 ? 'Til levering' : !s.date_finished ? 'Under service' : (s.workshop_id && !s.picked_up) ? 'Til henting' : 'Ferdig';
      rows.push([s.date, s.date_finished || '', inst?.korps_id || '', inst?.name || '', s.type, s.desc || '', s.by_whom || '', ws?.name || '', status, s.cost || 0, s.invoice_no || '', s.next_due || '']);
    });

  } else if (type === 'accessories') {
    sheetName = 'Tilbehør';
    const accessories = db.prepare('SELECT * FROM accessories ORDER BY name').all();
    const suppliers = db.prepare('SELECT * FROM suppliers').all();

    rows.push(['Varenavn', 'Kategori', 'Leverandør', 'Strekkode', 'Pris (kr)', 'Fakturanummer', 'På lager', 'Minimum', 'Total verdi (kr)', 'Status', 'Merknader']);
    accessories.forEach(a => {
      const sup = suppliers.find(s => s.id === a.supplier_id);
      const status = a.stock === 0 ? 'Tomt' : a.stock <= a.min_level ? 'Lavt' : 'OK';
      const totalVal = (a.price || 0) * (a.stock || 0);
      rows.push([a.name, a.category, sup?.name || a.supplier || '', a.barcode || '', a.price || 0, a.invoice_no || '', a.stock, a.min_level, totalVal, status, a.notes || '']);
    });

  } else if (type === 'til-henting') {
    sheetName = 'Levering og henting';
    const service = db.prepare("SELECT * FROM service WHERE (delivered=0) OR (delivered=1 AND date_finished IS NOT NULL AND workshop_id IS NOT NULL AND picked_up=0) ORDER BY date").all();
    const instruments = db.prepare('SELECT * FROM instruments').all();
    const workshops = db.prepare('SELECT * FROM workshops').all();

    rows.push(['Status', 'Innlevert dato', 'Ferdig dato', 'Instrument-ID', 'Instrument', 'Type', 'Beskrivelse', 'Verksted', 'Kostnad (kr)']);
    service.forEach(s => {
      const inst = instruments.find(i => i.id === s.inst_id);
      const ws = workshops.find(w => w.id === s.workshop_id);
      const status = s.delivered === 0 ? 'Til levering' : 'Til henting';
      rows.push([status, s.date, s.date_finished || '', inst?.korps_id || '', inst?.name || '', s.type, s.desc || '', ws?.name || '', s.cost || 0]);
    });

  } else if (type === 'rapport-service') {
    sheetName = 'Servicerapport';
    const service = db.prepare('SELECT * FROM service').all();
    const workshops = db.prepare('SELECT * FROM workshops').all();

    const groups = {};
    service.forEach(s => {
      const ws = workshops.find(w => w.id === s.workshop_id);
      const key = ws ? ws.name : 'Intern service';
      if (!groups[key]) groups[key] = { count: 0, totalCost: 0 };
      groups[key].count += 1;
      groups[key].totalCost += s.cost || 0;
    });

    rows.push(['Verksted / Utfører', 'Antall servicer', 'Total kostnad (kr)']);
    let grandCount = 0, grandCost = 0;
    Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])).forEach(([name, g]) => {
      rows.push([name, g.count, g.totalCost]);
      grandCount += g.count;
      grandCost += g.totalCost;
    });
    rows.push(['TOTALT', grandCount, grandCost]);

  } else if (type === 'rapport-tilbehor') {
    sheetName = 'Tilbehørsrapport';
    const accessories = db.prepare('SELECT * FROM accessories').all();

    const groups = {};
    accessories.forEach(a => {
      const key = a.category || 'Ukategorisert';
      if (!groups[key]) groups[key] = { count: 0, totalStock: 0, totalValue: 0 };
      groups[key].count += 1;
      groups[key].totalStock += a.stock || 0;
      groups[key].totalValue += (a.price || 0) * (a.stock || 0);
    });

    rows.push(['Kategori', 'Antall varetyper', 'Totalt på lager', 'Total verdi (kr)']);
    let grandCount = 0, grandStock = 0, grandValue = 0;
    Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])).forEach(([name, g]) => {
      rows.push([name, g.count, g.totalStock, g.totalValue]);
      grandCount += g.count;
      grandStock += g.totalStock;
      grandValue += g.totalValue;
    });
    rows.push(['TOTALT', grandCount, grandStock, grandValue]);

  } else {
    return res.status(400).json({ error: 'Ukjent type' });
  }

  const filename = `korpsinventar_${type}_${today}`;

  if (format === 'csv') {
    const csv = rows.map(r => r.map(v => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.send('\uFEFF' + csv);

  } else if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet(sheetName);
    sheet.columns = rows[0].map((_, ci) => ({
      width: Math.min(50, Math.max(10, ...rows.map(r => String(r[ci] ?? '').length)))
    }));
    sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    res.send(buf);

  } else {
    res.status(400).json({ error: 'Ukjent format' });
  }
});

// --- IMPORT ---
app.post('/api/import/instruments', requirePerm('instruments_write'), (req, res) => {
  const { rows } = req.body;
  const ins = db.prepare('INSERT INTO instruments VALUES (?,?,?,?,?,?,?,?)');
  let imported = 0;
  for (const r of (rows || [])) {
    if (!r.name) continue;
    ins.run(uid(), r.name, r.category || 'Annet', r.condition || 'God', r.serial || null, r.purchase || null, r.notes || null, r.korps_id || null);
    imported++;
  }
  res.json({ imported });
});

app.post('/api/import/accessories', requirePerm('accessories_write'), (req, res) => {
  const { rows } = req.body;
  const ins = db.prepare('INSERT INTO accessories (id,name,category,stock,min_level,notes,price) VALUES (?,?,?,?,?,?,?)');
  let imported = 0;
  for (const r of (rows || [])) {
    if (!r.name) continue;
    ins.run(uid(), r.name, r.category || null, parseInt(r.stock) || 0, parseInt(r.min_level) || 2, r.notes || null, parseFloat(r.price) || null);
    imported++;
  }
  res.json({ imported });
});

app.post('/api/export/report', requireAuth, async (req, res) => {
  const { filename, headers, rows } = req.body;
  if (!headers || !rows) return res.status(400).json({ error: 'Mangler data' });
  const aoa = [headers, ...rows];
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Rapport');
  sheet.columns = headers.map((_, ci) => ({
    width: Math.min(50, Math.max(12, ...aoa.map(r => String(r[ci] ?? '').length)))
  }));
  sheet.addRows(aoa);
  sheet.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${(filename||'rapport').replace(/[^a-zA-Z0-9æøåÆØÅ._-]/g,'_')}.xlsx"`);
  res.send(buf);
});

app.listen(PORT, () => console.log(`Korpsinventar kjører på port ${PORT}`));
