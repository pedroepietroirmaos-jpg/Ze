const express = require('express');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1);

const WAIT_SECONDS = 10;
const KEY_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

let db = { keys: {} };
function saveDB(newDb) { db = newDb; }

function cleanupDB() {
  const agora = Date.now();
  const limite = agora - 7 * 24 * 60 * 60 * 1000;
  let mudou = false;
  for (const [k, v] of Object.entries(db.keys)) {
    if (new Date(v.expiresAt).getTime() < limite) { delete db.keys[k]; mudou = true; }
  }
  if (mudou) saveDB(db);
}
cleanupDB();
setInterval(cleanupDB, 60 * 60 * 1000);

const sessions = new Map();
setInterval(() => {
  const limite = Date.now() - 60 * 60 * 1000;
  for (const [t, s] of sessions) if (s.startedAt < limite) sessions.delete(t);
}, 10 * 60 * 1000);

const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const id = req.ip + req.path;
    const agora = Date.now();
    const lista = (hits.get(id) || []).filter((t) => agora - t < windowMs);
    if (lista.length >= max) return res.status(429).json({ ok: false, message: 'Muitas tentativas.' });
    lista.push(agora); hits.set(id, lista); next();
  };
}

function generateKey() {
  let key;
  do {
    let code = '';
    for (let i = 0; i < 6; i++) code += CHARSET[crypto.randomInt(CHARSET.length)];
    key = `Zenix-${code}`;
  } while (db.keys[key]);
  return key;
}

function remainingSeconds(session) {
  const elapsed = (Date.now() - session.startedAt) / 1000;
  return Math.max(0, Math.ceil(WAIT_SECONDS - elapsed));
}

// APIs
app.post('/api/start', rateLimit(10, 60 * 60 * 1000), (req, res) => {
  const token = crypto.randomBytes(16).toString('hex');
  sessions.set(token, { startedAt: Date.now(), key: null });
  res.json({ ok: true, token });
});

app.get('/api/status', (req, res) => {
  const session = sessions.get(req.query.t);
  if (!session) return res.status(403).json({ ok: false });
  res.json({ ok: true, remaining: remainingSeconds(session), total: WAIT_SECONDS });
});

app.get('/api/claim', (req, res) => {
  const session = sessions.get(req.query.t);
  if (!session) return res.status(403).json({ ok: false, message: 'Sessão inválida.' });
  const remaining = remainingSeconds(session);
  if (remaining > 0) return res.status(425).json({ ok: false, remaining });

  if (session.key && db.keys[session.key]) return res.json({ ok: true, key: session.key, expiresAt: db.keys[session.key].expiresAt });

  const agora = Date.now();
  const key = generateKey();
  db.keys[key] = { createdAt: new Date(agora).toISOString(), expiresAt: new Date(agora + KEY_TTL_MS).toISOString(), used: false, hwid: null };
  saveDB(db); session.key = key;
  res.json({ ok: true, key, expiresAt: db.keys[key].expiresAt });
});

function validateHandler(req, res) {
  const key = String(req.query.key || '').trim();
  const hwid = req.query.hwid ? String(req.query.hwid).trim().slice(0, 128) : null;
  if (!/^Zenix-[A-Z0-9]{6}$/.test(key)) return res.json({ valid: false, message: 'Formato de chave inválido.' });

  const entry = db.keys[key];
  if (!entry) return res.json({ valid: false, message: 'Chave não encontrada.' });
  if (Date.now() > new Date(entry.expiresAt).getTime()) return res.json({ valid: false, message: 'Esta chave expirou (3 dias). Pegue uma nova no site.' });

  if (hwid) {
    if (entry.hwid && entry.hwid !== hwid) return res.json({ valid: false, message: 'Chave vinculada a outro dispositivo.' });
    if (!entry.hwid) { entry.hwid = hwid; entry.used = true; saveDB(db); }
  }
  return res.json({ valid: true, message: 'Chave aceita!', expiresAt: entry.expiresAt });
}

app.post('/api/validate', rateLimit(60, 60 * 1000), validateHandler);
app.get('/api/validate', rateLimit(60, 60 * 1000), validateHandler);

// Necessário para a Vercel
module.exports = app;

if (require.main === module) {
  app.listen(3000, '0.0.0.0', () => console.log('Zenix rodando'));
}