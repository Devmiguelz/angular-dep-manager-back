const express = require('express');
const fs      = require('fs');
const path    = require('path');
const cors    = require('cors');

const app        = express();
const PORT       = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY   || 'dev-secret';
const ORIGIN     = process.env.ALLOWED_ORIGIN || 'https://devmiguelz.github.io';
const STATS_FILE = path.join(__dirname, 'stats.json');

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin.startsWith(ORIGIN)) return cb(null, true);
    cb(new Error('CORS blocked: ' + origin));
  }
}));
app.use(express.json());

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readStats() {
  try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); }
  catch { return defaultStats(); }
}

function defaultStats() {
  return {
    visits:            0,
    analysisRuns:      0,
    packageAnalyzed:   0,   // suma total de paquetes procesados
    outdatedFound:     0,   // suma total de paquetes desactualizados
    overridesDetected: 0,   // suma total de overrides sugeridos
    auditFilesLoaded:  0,   // veces que cargaron npm-audit.json
    exportsDownloaded: 0,
    exportsCopied:     0,
    reportDownloaded:  0,
    reportCopied:      0,
    // distribuciones para gráficas
    byAngularVersion:  {},  // { "17": 12, "18": 5 }
    byExportMode:      { updated: 0, latest: 0, overrides: 0 },
    bySeverity:        { critical: 0, high: 0, moderate: 0, low: 0 },
    // historial últimas 200 sesiones
    history:           []
  };
}

function writeStats(data) {
  fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
}

function auth(req, res) {
  if (req.headers['x-secret-key'] !== SECRET_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function inc(obj, key, by = 1) {
  obj[key] = (obj[key] || 0) + by;
}

// ─── GET /stats ───────────────────────────────────────────────────────────────
app.get('/stats', (_req, res) => {
  const { history, ...pub } = readStats();
  res.json(pub);
});

// ─── GET /stats/history — análisis agrupados por día (últimos 60 días) ────────
app.get('/stats/history', (_req, res) => {
  const { history = [] } = readStats();

  // Agrupar eventos tipo 'analysis' por día
  const counts = {};
  history
    .filter(e => e.type === 'analysis')
    .forEach(e => {
      const day = (e.ts || '').slice(0, 10);
      if (day) counts[day] = (counts[day] || 0) + 1;
    });

  // Devolver últimos 60 días con fecha + count
  const byDay = Object.entries(counts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-60);

  res.json({ byDay });
});

// ─── POST /event ──────────────────────────────────────────────────────────────
// Tipos: visit | analysis | auditLoaded | export | report
app.post('/event', (req, res) => {
  if (!auth(req, res)) return;

  const { type, meta = {} } = req.body;
  if (!type) return res.status(400).json({ error: 'Missing type' });

  const s = readStats();

  switch (type) {

    case 'visit':
      s.visits++;
      break;

    // meta: { project, totalPackages, outdated, angularVersion, hasAudit, overrides, bySeverity }
    case 'analysis':
      s.analysisRuns++;
      s.packageAnalyzed   += meta.totalPackages   || 0;
      s.outdatedFound     += meta.outdated         || 0;
      s.overridesDetected += meta.overrides        || 0;
      if (meta.angularVersion) inc(s.byAngularVersion, meta.angularVersion);
      if (meta.bySeverity) {
        ['critical','high','moderate','low'].forEach(sev => {
          if (meta.bySeverity[sev]) s.bySeverity[sev] += meta.bySeverity[sev];
        });
      }
      break;

    case 'auditLoaded':
      s.auditFilesLoaded++;
      break;

    // meta: { mode: 'updated'|'latest'|'overrides', action: 'download'|'copy' }
    case 'export':
      if (meta.action === 'download') s.exportsDownloaded++;
      else                            s.exportsCopied++;
      if (meta.mode) inc(s.byExportMode, meta.mode);
      break;

    // meta: { action: 'download'|'copy' }
    case 'report':
      if (meta.action === 'download') s.reportDownloaded++;
      else                            s.reportCopied++;
      break;

    default:
      return res.status(400).json({ error: 'Unknown event type: ' + type });
  }

  s.lastSeen = new Date().toISOString();

  // Historial (últimas 200 entradas)
  s.history = s.history || [];
  s.history.push({ type, ts: s.lastSeen, ...meta });
  if (s.history.length > 200) s.history = s.history.slice(-200);

  writeStats(s);
  res.json({ ok: true });
});

// ─── GET /health ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.listen(PORT, () => console.log(`Stats server running on :${PORT}`));