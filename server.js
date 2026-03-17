const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db', 'korpsinventar.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- DB SETUP ---
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Migration: add korps_id if missing (for existing databases)
try { db.exec('ALTER TABLE instruments ADD COLUMN korps_id TEXT'); } catch(e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS instruments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    condition TEXT,
    serial TEXT,
    purchase TEXT,
    notes TEXT,
    korps_id TEXT
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
    next_due TEXT
  );
  CREATE TABLE IF NOT EXISTS accessories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    stock INTEGER DEFAULT 0,
    min_level INTEGER DEFAULT 2,
    notes TEXT
  );
`);

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// --- INSTRUMENTS ---
app.get('/api/instruments', (req, res) => {
  res.json(db.prepare('SELECT * FROM instruments ORDER BY name').all());
});

app.post('/api/instruments', (req, res) => {
  const { name, category, condition, serial, purchase, notes, korps_id } = req.body;
  const id = uid();
  db.prepare('INSERT INTO instruments VALUES (?,?,?,?,?,?,?,?)').run(id, name, category, condition, serial, purchase, notes, korps_id||null);
  res.json({ id });
});

app.put('/api/instruments/:id', (req, res) => {
  const { name, category, condition, serial, purchase, notes, korps_id } = req.body;
  db.prepare('UPDATE instruments SET name=?,category=?,condition=?,serial=?,purchase=?,notes=?,korps_id=? WHERE id=?')
    .run(name, category, condition, serial, purchase, notes, korps_id||null, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/instruments/:id', (req, res) => {
  const id = req.params.id;
  db.prepare('DELETE FROM instruments WHERE id=?').run(id);
  db.prepare('DELETE FROM player_instruments WHERE instrument_id=?').run(id);
  db.prepare('DELETE FROM service WHERE inst_id=?').run(id);
  res.json({ ok: true });
});

// --- PLAYERS ---
app.get('/api/players', (req, res) => {
  const players = db.prepare('SELECT * FROM players ORDER BY name').all();
  const links = db.prepare('SELECT * FROM player_instruments').all();
  players.forEach(p => {
    p.instruments = links.filter(l => l.player_id === p.id).map(l => l.instrument_id);
  });
  res.json(players);
});

app.post('/api/players', (req, res) => {
  const { name, section, contact, instruments } = req.body;
  const id = uid();
  db.prepare('INSERT INTO players VALUES (?,?,?,?)').run(id, name, section, contact);
  const ins = db.prepare('INSERT INTO player_instruments VALUES (?,?)');
  (instruments || []).forEach(iid => ins.run(id, iid));
  res.json({ id });
});

app.put('/api/players/:id', (req, res) => {
  const { name, section, contact, instruments } = req.body;
  db.prepare('UPDATE players SET name=?,section=?,contact=? WHERE id=?').run(name, section, contact, req.params.id);
  db.prepare('DELETE FROM player_instruments WHERE player_id=?').run(req.params.id);
  const ins = db.prepare('INSERT INTO player_instruments VALUES (?,?)');
  (instruments || []).forEach(iid => ins.run(req.params.id, iid));
  res.json({ ok: true });
});

app.delete('/api/players/:id', (req, res) => {
  db.prepare('DELETE FROM players WHERE id=?').run(req.params.id);
  db.prepare('DELETE FROM player_instruments WHERE player_id=?').run(req.params.id);
  res.json({ ok: true });
});

// --- SERVICE ---
app.get('/api/service', (req, res) => {
  res.json(db.prepare('SELECT * FROM service ORDER BY date DESC').all());
});

app.post('/api/service', (req, res) => {
  const { date, inst_id, type, cost, by_whom, desc, next_due } = req.body;
  const id = uid();
  db.prepare('INSERT INTO service VALUES (?,?,?,?,?,?,?,?)').run(id, date, inst_id, type, cost, by_whom, desc, next_due);
  res.json({ id });
});

app.put('/api/service/:id', (req, res) => {
  const { date, inst_id, type, cost, by_whom, desc, next_due } = req.body;
  db.prepare('UPDATE service SET date=?,inst_id=?,type=?,cost=?,by_whom=?,desc=?,next_due=? WHERE id=?')
    .run(date, inst_id, type, cost, by_whom, desc, next_due, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/service/:id', (req, res) => {
  db.prepare('DELETE FROM service WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// --- ACCESSORIES ---
app.get('/api/accessories', (req, res) => {
  res.json(db.prepare('SELECT * FROM accessories ORDER BY name').all());
});

app.post('/api/accessories', (req, res) => {
  const { name, category, stock, min_level, notes } = req.body;
  const id = uid();
  db.prepare('INSERT INTO accessories VALUES (?,?,?,?,?,?)').run(id, name, category, stock, min_level, notes);
  res.json({ id });
});

app.put('/api/accessories/:id', (req, res) => {
  const { name, category, stock, min_level, notes } = req.body;
  db.prepare('UPDATE accessories SET name=?,category=?,stock=?,min_level=?,notes=? WHERE id=?')
    .run(name, category, stock, min_level, notes, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/accessories/:id', (req, res) => {
  db.prepare('DELETE FROM accessories WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Korpsinventar kjører på port ${PORT}`));
