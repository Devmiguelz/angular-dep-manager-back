# angular-dep-manager-stats

Backend de estadísticas para https://devmiguelz.github.io/angular-dep-manager/

---

## Archivos

| Archivo | Rol |
|---|---|
| `server.js` | API Express (sube esto a Render) |
| `package.json` | Dependencias del servidor |
| `.env` | Variables de entorno locales (no subir a Git) |
| `stats-client.js` | Snippet para pegar en tu index.html |

---

## Deploy en Render

### Paso 1 — Repo GitHub
Crea un repo nuevo (puede ser privado) y sube `server.js` y `package.json`.
> ⚠️ **No subas `.env`** — agrégalo a `.gitignore`.

### Paso 2 — Base de datos PostgreSQL
- Render → **New** → **PostgreSQL**
- Anota el **Internal Database URL** que Render te asigna

Las tablas (`stats` e `history`) se crean automáticamente al arrancar el servidor.

### Paso 3 — Nuevo Web Service en Render
- Render → **New** → **Web Service**
- Conecta el repo
- Configura:
  - **Runtime:** Node
  - **Build Command:** `npm install`
  - **Start Command:** `npm start`
  - **Plan:** Free (o Starter si no quieres cold starts)

### Paso 4 — Variables de entorno
En Render → Settings → **Environment Variables**:

| Variable | Valor ejemplo |
|---|---|
| `SECRET_KEY` | `m1Cl4v3S3cr3t4MuyLarga2024` |
| `ALLOWED_ORIGINS` | `https://devmiguelz.github.io` |
| `DATABASE_URL` | Internal URL de tu PostgreSQL en Render |

> Usa siempre la **conexión interna** de Render en producción — es más rápida y sin costo de egress.

### Paso 5 — Copiar la URL
Render te asigna algo como: `https://angular-dep-stats.onrender.com`

---

## Desarrollo local

Crea un archivo `.env` en la raíz del proyecto:

```env
PORT=3000
SECRET_KEY=m1Cl4v3S3cr3t4MuyLarga2024
ALLOWED_ORIGINS=https://devmiguelz.github.io
DATABASE_URL=postgresql://user:password@host/dbname
```

Para arrancar el servidor en local:

```bash
# Node 20+
node --env-file=.env server.js

# Node < 20 (requiere dotenv instalado)
npm install dotenv
# agregar require('dotenv').config(); al inicio de server.js
node server.js
```

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
| `GET` | `/stats/history` | No | Análisis agrupados por día (últimos 60 días) |
| `POST` | `/event` | `x-secret-key` header | Registra un evento |
| `POST` | `/reset` | `x-secret-key` header | Resetea todas las estadísticas |
| `POST` | `/audit` | `x-secret-key` header | Proxy hacia npm audit API |
| `GET` | `/health` | No | Health check para Render |

---

## Base de datos

El servidor crea automáticamente dos tablas al iniciar:

| Tabla | Descripción |
|---|---|
| `stats` | Clave/valor JSONB con todos los contadores |
| `history` | Últimas 200 entradas de eventos con timestamp |

La persistencia es total entre redeploys al usar PostgreSQL en Render.