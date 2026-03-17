const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');

const app        = express();
const PORT       = process.env.PORT;
const SECRET_KEY = process.env.SECRET_KEY;
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGINS || 'https://devmiguelz.github.io').split(',').map(o => o.trim());

// ─── DB ───────────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : false
});

// Crear tablas si no existen
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stats (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '0'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS history (
      id         SERIAL PRIMARY KEY,
      type       TEXT NOT NULL,
      ts         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta       JSONB NOT NULL DEFAULT '{}'
    );
  `);

  // Insertar contadores base si no existen
  const counters = [
    'visits','analysisRuns','packageAnalyzed','outdatedFound',
    'overridesDetected','auditFilesLoaded','exportsDownloaded',
    'exportsCopied','reportDownloaded','reportCopied','lastSeen',
    'byAngularVersion','byExportMode','bySeverity'
  ];
  const defaults = {
    visits: 0, analysisRuns: 0, packageAnalyzed: 0, outdatedFound: 0,
    overridesDetected: 0, auditFilesLoaded: 0, exportsDownloaded: 0,
    exportsCopied: 0, reportDownloaded: 0, reportCopied: 0, lastSeen: null,
    byAngularVersion: {}, byExportMode: { updated: 0, latest: 0, overrides: 0 },
    bySeverity: { critical: 0, high: 0, moderate: 0, low: 0 }
  };
  for (const k of counters) {
    await pool.query(
      `INSERT INTO stats(key, value) VALUES($1, $2) ON CONFLICT(key) DO NOTHING`,
      [k, JSON.stringify(defaults[k])]
    );
  }
  console.log('DB initialized');
}

// ─── Helpers DB ───────────────────────────────────────────────────────────────
async function getStats() {
  const { rows } = await pool.query('SELECT key, value FROM stats');
  const s = {};
  for (const r of rows) s[r.key] = r.value;
  return s;
}

async function setStat(key, value) {
  await pool.query(
    `INSERT INTO stats(key, value) VALUES($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = $2`,
    [key, JSON.stringify(value)]
  );
}

async function incStat(key, by = 1) {
  await pool.query(
    `INSERT INTO stats(key, value) VALUES($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = (COALESCE(stats.value::numeric, 0) + $2)::jsonb`,
    [key, by]
  );
}

async function incJsonKey(statKey, subKey, by = 1) {
  // Incrementa stats[statKey][subKey] de forma atómica en JSONB
  await pool.query(
    `INSERT INTO stats(key, value) VALUES($1, jsonb_build_object($2::text, $3::numeric))
     ON CONFLICT(key) DO UPDATE
       SET value = jsonb_set(
         stats.value,
         ARRAY[$2::text],
         (COALESCE(stats.value->$2, '0')::numeric + $3)::text::jsonb
       )`,
    [statKey, subKey, by]
  );
}

async function addHistory(type, meta) {
  await pool.query(
    `INSERT INTO history(type, meta) VALUES($1, $2)`,
    [type, JSON.stringify(meta)]
  );
  // Mantener solo las últimas 200 entradas
  await pool.query(`
    DELETE FROM history WHERE id IN (
      SELECT id FROM history ORDER BY id DESC OFFSET 200
    )
  `);
}

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGIN.includes(origin)) return cb(null, true);
    cb(new Error('CORS blocked: ' + origin));
  }
}));
app.use(express.json());

// ─── Auth ─────────────────────────────────────────────────────────────────────
function auth(req, res) {
  if (req.headers['x-secret-key'] !== SECRET_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// ─── GET /stats ───────────────────────────────────────────────────────────────
app.get('/stats', async (_req, res) => {
  try {
    const s = await getStats();
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /stats/history ───────────────────────────────────────────────────────
app.get('/stats/history', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DATE(ts)::text AS date, COUNT(*)::int AS count
      FROM history
      WHERE type = 'analysis'
        AND ts >= NOW() - INTERVAL '60 days'
      GROUP BY DATE(ts)
      ORDER BY DATE(ts)
    `);
    res.json({ byDay: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /event ──────────────────────────────────────────────────────────────
app.post('/event', async (req, res) => {
  if (!auth(req, res)) return;

  const { type, meta = {} } = req.body;
  if (!type) return res.status(400).json({ error: 'Missing type' });

  try {
    switch (type) {

      case 'visit':
        await incStat('visits');
        break;

      case 'analysis':
        await incStat('analysisRuns');
        if (meta.totalPackages) await incStat('packageAnalyzed',   meta.totalPackages);
        if (meta.outdated)      await incStat('outdatedFound',      meta.outdated);
        if (meta.overrides)     await incStat('overridesDetected',  meta.overrides);
        if (meta.angularVersion) await incJsonKey('byAngularVersion', String(meta.angularVersion));
        if (meta.bySeverity) {
          for (const sev of ['critical','high','moderate','low']) {
            if (meta.bySeverity[sev]) await incJsonKey('bySeverity', sev, meta.bySeverity[sev]);
          }
        }
        break;

      case 'auditLoaded':
        await incStat('auditFilesLoaded');
        break;

      case 'export':
        if (meta.action === 'download') await incStat('exportsDownloaded');
        else                            await incStat('exportsCopied');
        if (meta.mode) await incJsonKey('byExportMode', meta.mode);
        break;

      case 'report':
        if (meta.action === 'download') await incStat('reportDownloaded');
        else                            await incStat('reportCopied');
        break;

      default:
        return res.status(400).json({ error: 'Unknown event type: ' + type });
    }

    await setStat('lastSeen', new Date().toISOString());
    await addHistory(type, meta);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /reset ──────────────────────────────────────────────────────────────
app.post('/reset', async (req, res) => {
  if (!auth(req, res)) return;
  try {
    const defaults = {
      visits: 0, analysisRuns: 0, packageAnalyzed: 0, outdatedFound: 0,
      overridesDetected: 0, auditFilesLoaded: 0, exportsDownloaded: 0,
      exportsCopied: 0, reportDownloaded: 0, reportCopied: 0, lastSeen: null,
      byAngularVersion: {}, byExportMode: { updated: 0, latest: 0, overrides: 0 },
      bySeverity: { critical: 0, high: 0, moderate: 0, low: 0 }
    };
    for (const [k, v] of Object.entries(defaults)) {
      await setStat(k, v);
    }
    await pool.query('DELETE FROM history');
    res.json({ ok: true, message: 'Stats reseteadas' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /audit ──────────────────────────────────────────────────────────────
app.post('/audit', async (req, res) => {
  if (!auth(req, res)) return;

  const { name, version, dependencies, devDependencies } = req.body;
  if (!dependencies && !devDependencies) {
    return res.status(400).json({ error: 'Missing dependencies' });
  }

  const requires = {};
  const deps = {};
  for (const [pkg, ver] of Object.entries(dependencies || {})) {
    requires[pkg] = ver;
    deps[pkg] = { version: ver.replace(/[\^~>=<]/g, '').trim() };
  }
  for (const [pkg, ver] of Object.entries(devDependencies || {})) {
    requires[pkg] = ver;
    deps[pkg] = { version: ver.replace(/[\^~>=<]/g, '').trim() };
  }

  const payload = {
    name:         name || 'project',
    version:      version || '0.0.0',
    requires,
    dependencies: deps
  };

  try {
    const npmRes = await fetch('https://registry.npmjs.org/-/npm/v1/security/audits/quick', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });
    if (!npmRes.ok) {
      return res.status(npmRes.status).json({ error: `npm audit respondió ${npmRes.status}` });
    }
    res.json(await npmRes.json());
  } catch (err) {
    res.status(502).json({ error: 'No se pudo contactar npm audit: ' + err.message });
  }
});

// ─── GET /health ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ─── Arranque ─────────────────────────────────────────────────────────────────
initDB()
  .then(() => app.listen(PORT, () => console.log(`Stats server running on :${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });