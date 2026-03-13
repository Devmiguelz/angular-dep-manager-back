# angular-dep-manager-stats

Backend de estadísticas para https://devmiguelz.github.io/angular-dep-manager/

---

## Archivos

| Archivo | Rol |
|---|---|
| `server.js` | API Express (sube esto a Render) |
| `package.json` | Dependencias del servidor |
| `stats.json` | Base de datos en disco (se crea automáticamente) |
| `stats-client.js` | Snippet para pegar en tu index.html |

---

## Deploy en Render

### Paso 1 — Repo GitHub
Crea un repo nuevo (puede ser privado) y sube `server.js`, `package.json` y `stats.json`.

### Paso 2 — Nuevo Web Service en Render
- render.com → **New** → **Web Service**
- Conecta el repo
- Configura:
  - **Runtime:** Node
  - **Build Command:** `npm install`
  - **Start Command:** `npm start`
  - **Plan:** Free (o Starter si no quieres cold starts)

### Paso 3 — Variables de entorno
En Render → Settings → **Environment Variables**:

| Variable | Valor ejemplo |
|---|---|
| `SECRET_KEY` | `m1Cl4v3S3cr3t4MuyLarga2024` |
| `ALLOWED_ORIGIN` | `https://devmiguelz.github.io` |

### Paso 4 — Copiar la URL
Render te asigna algo como: `https://angular-dep-stats.onrender.com`

---

## Integrar en index.html

1. Abre `stats-client.js`
2. Reemplaza las dos constantes al inicio:
   ```js
   const STATS_URL   = 'https://angular-dep-stats.onrender.com'; // tu URL de Render
   const _SECRET_KEY = 'm1Cl4v3S3cr3t4MuyLarga2024';             // tu SECRET_KEY
   ```
3. Pega el contenido completo de `stats-client.js` **al final** del `<script>` existente en tu `index.html`, justo antes de `</script>`

---

## Estadísticas que se trackean

| Métrica | Descripción |
|---|---|
| `visits` | Total de visitas a la página |
| `analysisRuns` | Veces que se presionó Analizar |
| `packageAnalyzed` | Suma total de paquetes procesados |
| `outdatedFound` | Suma total de paquetes desactualizados |
| `overridesDetected` | Suma total de overrides sugeridos |
| `auditFilesLoaded` | Veces que se cargó un npm audit.json |
| `exportsDownloaded` | Descargas de package.json |
| `exportsCopied` | Copias de package.json |
| `reportDownloaded` | Descargas de analysis-report.json |
| `reportCopied` | Copias del reporte |
| `byAngularVersion` | Distribución de versiones Angular analizadas |
| `byExportMode` | Qué modo de export usan (updated/latest/overrides) |
| `bySeverity` | Distribución de severidad de vulnerabilidades |

---

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/stats` | No | Lee las estadísticas públicas |
| `POST` | `/event` | `x-secret-key` header | Registra un evento |
| `GET` | `/health` | No | Health check para Render |

---

## Nota sobre persistencia

El `stats.json` **se borra con cada redeploy** en Render Free.  
Para persistencia real entre deploys, habilita un **Persistent Disk** en Render (desde $1/mes)  
o migra el almacenamiento a Supabase / PlanetScale.
