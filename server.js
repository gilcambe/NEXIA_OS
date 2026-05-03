'use strict';
/**
 * NEXIA OS — Render Server v2.0 (100% autônomo — sem Netlify)
 * ─────────────────────────────────────────────────────────────
 * • Serve arquivos estáticos
 * • Carrega todas as functions de netlify/functions/ nativamente
 * • Adapter Netlify-event ↔ Node http (req/res)
 * • Cron interno do Sentinel (05:00 BRT = 08:00 UTC)
 *
 * Env vars necessárias no Render:
 *   FIREBASE_SERVICE_ACCOUNT_BASE64  — service account Firebase em base64
 *   NEXIA_APP_URL                    — URL pública do Render (ex: https://nexia.com.br)
 *   GROQ_API_KEY                     — pelo menos um provider de IA (gratuito)
 *   PORT                             — definido automaticamente pelo Render
 *
 * Opcionais (para Sentinel auto-heal completo):
 *   GITHUB_TOKEN + GITHUB_REPO       — abrir issues no GitHub
 *   ANTHROPIC_API_KEY                — usar Claude no Sentinel
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1MB — rejects oversized payloads

// ─── CORS ─────────────────────────────────────────────────────────
// Em produção usa NEXIA_APP_URL; em dev aceita qualquer origem
const ALLOWED_ORIGINS = (process.env.NEXIA_APP_URL || '')
  .split(',').map(u => u.trim()).filter(Boolean);

// FIX v54: CORS — fallback hardcoded para onrender.com quando NEXIA_APP_URL não configurado
// Isso fecha o wildcard (*) em produção sem quebrar o health check do Render.
const RENDER_FALLBACK_ORIGIN = 'https://nexia-os.onrender.com';
if (!ALLOWED_ORIGINS.length && process.env.NODE_ENV === 'production') {
  console.warn('[NEXIA SECURITY] NEXIA_APP_URL nao definido — usando fallback CORS: ' + RENDER_FALLBACK_ORIGIN);
  console.warn('[NEXIA SECURITY]    Configure NEXIA_APP_URL no Render Dashboard para customizar.');
  ALLOWED_ORIGINS.push(RENDER_FALLBACK_ORIGIN);
}

function getCorsOrigin(reqHeaders) {
  // Dev sem env: aceita tudo (localhost). Prod: sempre usa lista de origens permitidas.
  if (!ALLOWED_ORIGINS.length) return '*';
  const origin = (reqHeaders && (reqHeaders.origin || reqHeaders.Origin)) || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

// ─── RATE LIMITER ─────────────────────────────────────────────────
// Contagem mensal por uid — protege providers de IA pagos
const RATE_STORE = new Map(); // `${uid}:${monthKey}` → { count, reset }
const RATE_LIMITS = { free: 50, starter: 500, pro: 99999, enterprise: 99999 };

function checkRateLimit(uid, plan) {
  const now      = Date.now();
  const monthKey = new Date().toISOString().slice(0, 7); // "2026-04"
  const key      = `${uid}:${monthKey}`;
  if (!RATE_STORE.has(key)) {
    const d = new Date();
    RATE_STORE.set(key, { count: 0, reset: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() });
  }
  const entry = RATE_STORE.get(key);
  if (now > entry.reset) {
    const d = new Date();
    entry.count = 0;
    entry.reset = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  }
  const limit = RATE_LIMITS[plan] ?? RATE_LIMITS.free;
  if (entry.count >= limit) return { allowed: false, remaining: 0, limit };
  entry.count++;
  return { allowed: true, remaining: limit - entry.count, limit };
}

// Limpeza horária — evita memory leak em produção
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of RATE_STORE.entries()) {
    if (now > entry.reset) RATE_STORE.delete(key);
  }
}, 60 * 60 * 1000);

// ─── /api/firebase-config — serve Firebase client config from env vars ────
// Allows HTML pages to load config dynamically instead of hardcoding.
// SAFE: Firebase client config is public by design (Firebase SDK requirement).
function serveFirebaseConfig(res) {
  // SECURITY FIX: Hardcoded Firebase credentials removed.
  // FIREBASE_API_KEY obrigatória no Render → Environment → Variables.
  // Se ausente, retorna 503 — nunca expõe credencial no source code.
  if (!process.env.FIREBASE_API_KEY) {
    console.error('[NEXIA SECURITY] FIREBASE_API_KEY não configurada — /api/firebase-config retornando 503. Configure no Render Dashboard → Environment.');
    res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Firebase config unavailable. Contact the administrator.' }));
    return;
  }
  const cfg = {
    apiKey:            process.env.FIREBASE_API_KEY,
    authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || '',
    projectId:         process.env.FIREBASE_PROJECT_ID         || '',
    storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID|| '',
    appId:             process.env.FIREBASE_APP_ID             || '',
  };
  res.writeHead(200, {
    'Content-Type':  'application/json',
    'Cache-Control': 'public, max-age=300', // 5min cache — config raramente muda
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(cfg));
}



const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.txt':  'text/plain',
  '.xml':  'application/xml',
};

const ROUTES = {
  '/':                         '/index.html',
  '/login':                    '/login.html',
  '/ces':                      '/ces/ces-landing.html',
  '/ces/admin':                '/ces/ces-admin.html',
  '/ces/checkin':              '/ces/checkin.html',
  '/ces/executivo':            '/ces/ces-app-executivo.html',
  '/ces/landing':              '/ces/ces-landing.html',
  '/vp':                       '/viajante-pro/vp-landing.html',
  '/viajante-pro':             '/viajante-pro/vp-landing.html',
  '/vp/admin':                 '/viajante-pro/vp-admin.html',
  '/vp/guide':                 '/viajante-pro/vp-guide.html',
  '/vp/guia':                  '/viajante-pro/vp-guide.html',
  '/vp/landing':               '/viajante-pro/vp-landing.html',
  '/vp/passenger':             '/viajante-pro/vp-passenger.html',
  '/vp/passageiro':            '/viajante-pro/vp-passenger.html',
  '/bezsan':                   '/bezsan/bezsan-landing.html',
  '/bezsan/admin':             '/bezsan/bezsan-admin.html',
  '/bezsan/landing':           '/bezsan/bezsan-landing.html',
  '/splash':                   '/splash/splash-landing.html',
  '/splash/admin':             '/splash/splash-admin.html',
  '/splash/landing':           '/splash/splash-landing.html',
  '/nexia':                    '/nexia/tenant-hub.html',
  '/nexia/cortex-app':         '/nexia/cortex-app.html',
  '/nexia/cortex':             '/nexia/cortex-app.html',
  '/nexia/flow':               '/nexia/flow.html',
  '/nexia/pay':                '/nexia/nexia-pay.html',
  '/nexia/store':              '/nexia/nexia-store.html',
  '/nexia/pabx':               '/nexia/pabx-softphone.html',
  '/nexia/swarm':              '/nexia/swarm-control.html',
  '/nexia/swarm-control':      '/nexia/swarm-control.html',
  '/nexia/pki':                '/nexia/pki-scanner.html',
  '/nexia/pki-scanner':        '/nexia/pki-scanner.html',
  '/nexia/my-panel':           '/nexia/my-panel.html',
  '/nexia/architect':          '/nexia/architect.html',
  '/nexia/master-admin':       '/nexia/nexia-master-admin.html',
  '/nexia/qa-test-center':     '/nexia/qa-test-center.html',
  '/nexia/nexia-qa-center':    '/nexia/nexia-qa-center.html',
  '/nexia/studio':             '/nexia/studio.html',
  '/nexia/tenant-hub':         '/nexia/tenant-hub.html',
  '/nexia/sentinel-dashboard': '/nexia/sentinel-dashboard.html',
  '/nexia/sentinel':           '/nexia/sentinel-dashboard.html',
  '/nexia/social-media':       '/nexia/social-media-auto.html',
  '/nexia/social-media-auto':  '/nexia/social-media-auto.html',
  '/nexia/striker':            '/nexia/nexia-striker.html',
  '/nexia/autodemo':           '/nexia/nexia-autodemo.html',
  '/nexia/auto-demo':          '/nexia/nexia-autodemo.html',
  '/nexia/osint-query':        '/nexia/osint-query.html',
  '/nexia/strike-center':      '/nexia/strike-center.html',
  '/admin':                    '/nexia/nexia-master-admin.html',
  '/plans':                    '/nexia/plans.html',
  '/nexia/plans':              '/nexia/plans.html',
  '/onboarding':               '/nexia/onboarding.html',
  '/nexia/onboarding':         '/nexia/onboarding.html',
  '/nexia/nexia-manifest.json':'/nexia/nexia-manifest.json',
  '/privacidade':              '/privacidade.html',
  '/termos':                   '/termos.html',
  '/cookies':                  '/cookies.html',
  '/lgpd':                     '/lgpd.html',
  '/sitemap.xml':              '/sitemap.xml',
};

const API_ROUTES = {
  '/api/cortex':          'cortex-chat',
  '/api/ai-analysis':     'cortex-chat',
  '/api/auth':            'auth',
  '/api/memory':          'cortex-memory',
  '/api/rag':             'rag-engine',
  '/api/autodev':         'autodev-engine',
  '/api/models':          'multi-model-engine',
  '/api/swarm':           'swarm',
  '/api/agent-run':       'cortex-agent',
  '/api/agents':          'agents',
  '/api/actions':         'action-engine',
  '/api/logs':            'cortex-logs',
  '/api/events':          'event-processor',
  '/api/notifications':   'notifications',
  '/api/tenant':          'tenant-admin',
  '/api/crm':             'tenant-admin',
  '/api/usage':           'usage',
  '/api/billing':         'billing',
  '/api/observe':         'observability',
  '/api/observability':   'observability',
  '/api/learn':           'cortex-learn',
  '/api/pabx':            'pabx-handler',
  '/api/osint':           'osint-query',
  '/api/takedown':        'takedown-gen',
  '/api/payment':         'payment-engine',
  '/api/metrics':         'metrics-aggregator',
  '/api/architect':       'architect',
  '/api/whatsapp':        'whatsapp-business',
  '/api/nfe':             'nfe-engine',
  '/api/dynamic-pricing': 'dynamic-pricing',
  '/api/sentinel':        'sentinel-iot',
  '/api/sentinel-qa':     'sentinel',
  '/api/governance':      'middleware',
  '/api/tenant-domain':   'tenant-domain',
  '/api/dunning':         'dunning-scheduler',
  '/api/kpi':             'kpi-engine',
  '/api/churn':           'churn-predictor',
  '/api/sales':           'ai-sales-agent',
  '/api/financial':       'ai-financial',
  '/api/internal-agents': 'internal-agents',
  '/api/audit':           'audit-log',
  '/api/autocommit':      'autocommit',
  '/api/ads':             'ads-engine',
  '/api/recovery':        'account-recovery',
  '/api/strike':          'strike-engine',
};

// ─── HELPERS DE PLANO ────────────────────────────────────────────
async function getUserPlan(uid) {
  try {
    const firebaseInit = require('./netlify/functions/firebase-init');
    const fireDb = firebaseInit.db;
    if (!fireDb) return { plan: 'free' };
    const snap = await fireDb.collection('users').doc(uid).get();
    return { plan: snap.exists ? (snap.data().plan ?? 'free') : 'free' };
  } catch { return { plan: 'free' }; }
}

// ─── CARREGA TODAS AS FUNCTIONS ───────────────────────────────────
const FUNCTIONS_DIR = path.join(ROOT, 'netlify', 'functions');
const loadedFunctions = {};

function loadFunctions() {
  if (!fs.existsSync(FUNCTIONS_DIR)) {
    console.error('[FN] ERRO CRÍTICO: diretório não encontrado:', FUNCTIONS_DIR);
    console.error('[FN] Verifique se netlify/functions/ está commitado no repositório GitHub.');
    console.error('[FN] APIs estarão indisponíveis — apenas arquivos estáticos serão servidos.');
    return; // não crasha o servidor — static files ainda funcionam
  }
  const files = fs.readdirSync(FUNCTIONS_DIR)
    .filter(f => f.endsWith('.js') && !['firebase-init.js', 'middleware.js'].includes(f));
  for (const file of files) {
    const name = file.replace('.js', '');
    try {
      loadedFunctions[name] = require(path.join(FUNCTIONS_DIR, file));
      console.log('[FN] carregada:', name);
    } catch (e) {
      console.warn('[FN] FALHOU:', name, '-', e.message, e.stack ? e.stack.split('\n')[1] : '');
    }
  }
  console.log('[FN] Total:', Object.keys(loadedFunctions).length + '/' + files.length);
}

// ─── ADAPTER: Node req/res → Netlify event ────────────────────────
async function runFunction(fnName, req, res, body, isSchedule) {
  const fn = loadedFunctions[fnName];
  if (!fn || !fn.handler) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getCorsOrigin(req.headers) });
    res.end(JSON.stringify({ error: 'Function nao encontrada: ' + fnName }));
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const event = {
    httpMethod:            req.method,
    path:                  parsedUrl.pathname,
    queryStringParameters: parsedUrl.query || {},
    headers: {
      ...req.headers,
      ...(isSchedule ? { 'x-netlify-event': 'schedule' } : {}),
    },
    body:            body && body.length ? body.toString('utf8') : null,
    isBase64Encoded: false,
  };

  try {
    const result = await fn.handler(event, {});
    const status  = result.statusCode || 200;
    const headers = {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': getCorsOrigin(req.headers),
      'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type, Authorization, X-Tenant-Id',
      ...(result.headers || {}),
    };
    res.writeHead(status, headers);
    res.end(result.body || '');
  } catch (e) {
    console.error('[FN ERROR]', fnName, e.message, e.stack ? e.stack.split('\n').slice(0,3).join(' | ') : '');
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getCorsOrigin(req.headers) });
    res.end(JSON.stringify({ error: 'Function error', detail: e.message }));
  }
}

// ─── SERVE ARQUIVO ESTÁTICO ───────────────────────────────────────
function serveFile(filePath, res) {
  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error('not a file');
    const content  = fs.readFileSync(filePath);
    const cacheable = ['.css','.woff2','.svg','.png','.jpg','.ico','.woff','.ttf','.webp'].includes(ext);
    const isHtml = ext === '.html';
    res.writeHead(200, {
      'Content-Type':              mime,
      'Cache-Control':             cacheable ? 'public, max-age=31536000, immutable' : 'no-cache, must-revalidate',
      'X-Content-Type-Options':    'nosniff',
      'X-Frame-Options':           'SAMEORIGIN',
      'X-XSS-Protection':          '1; mode=block',
      'Referrer-Policy':           'strict-origin-when-cross-origin',
      'Permissions-Policy':        'geolocation=(), microphone=(), camera=()',
      'Access-Control-Allow-Origin': '*',
      ...(isHtml ? {
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
        'Content-Security-Policy':   "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://cdnjs.cloudflare.com https://fonts.googleapis.com https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; img-src 'self' data: https: blob:; connect-src 'self' https: wss:; frame-ancestors 'self';",
      } : {}),
    });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

function resolveFunctionName(pathname) {
  if (API_ROUTES[pathname]) return API_ROUTES[pathname];
  for (const [route, fn] of Object.entries(API_ROUTES)) {
    if (pathname.startsWith(route + '/')) return fn;
  }
  const m = pathname.match(/^\/.netlify\/functions\/([^/?]+)/);
  if (m) return m[1];
  return null;
}

// ─── SERVIDOR HTTP ────────────────────────────────────────────────
// ── OBSERVABILITY ──────────────────────────────────────────────────────────
const _obs = { reqs:0, errs:0, lats:[], byPath:{}, startedAt:Date.now() };
function _obsTrack(p,ms,st) {
  _obs.reqs++; _obs.lats.push(ms); if(_obs.lats.length>1000)_obs.lats.shift();
  if(!_obs.byPath[p])_obs.byPath[p]={count:0,errors:0,lats:[]};
  _obs.byPath[p].count++; _obs.byPath[p].lats.push(ms);
  if(st>=500){_obs.errs++;_obs.byPath[p].errors++;}
}
global._obsMetrics = _obs;
global._obsTrack   = _obsTrack;

const server = http.createServer((req, res) => {
  const _t0 = Date.now();
  res.on('finish', () => _obsTrack(req.url||'/', Date.now()-_t0, res.statusCode||200));
  const parsedUrl = url.parse(req.url);
  const pathname  = (parsedUrl.pathname || '/').replace(/\/\/+/g, '/').replace(/(.+)\/$/, '$1') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  getCorsOrigin(req.headers),
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Id',
      'Vary': 'Origin',
    });
    return res.end();
  }

  // ─── /health ── CI smoke test + uptime monitoring ─────────────────
  if (pathname === '/health') {
    const DIST_DIRS = ['nexia', 'core', 'netlify/functions', 'ces', 'viajante-pro', 'bezsan', 'splash'];
    const distStatus = DIST_DIRS.map(d => ({
      dir: d,
      ok:  fs.existsSync(path.join(ROOT, d)),
    }));
    const allOk = distStatus.every(d => d.ok);
    const body  = JSON.stringify({
      status:    allOk ? 'ok' : 'degraded',
      version:   require('./package.json').version || '0',
      uptime:    Math.floor(process.uptime()),
      functions: Object.keys(loadedFunctions).length,
      dist:      distStatus,
      timestamp: new Date().toISOString(),
    });
    res.writeHead(allOk ? 200 : 503, {
      'Content-Type':              'application/json',
      'Cache-Control':             'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(body);
  }

  if (pathname === '/api/firebase-config') {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': getCorsOrigin(req.headers), 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Id' }); return res.end(); }
    return serveFirebaseConfig(res);
  }

  if (pathname.startsWith('/api/') || pathname.startsWith('/.netlify/functions/')) {
    const chunks = [];
    let bodySize = 0;
    req.on('data', c => {
      bodySize += c.length;
      if (bodySize > MAX_BODY_SIZE) {
        res.writeHead(413, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': getCorsOrigin(req.headers) });
        res.end(JSON.stringify({ error: 'Payload muito grande. Limite: 1MB.' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const fnName = resolveFunctionName(pathname);
      runFunction(fnName, req, res, Buffer.concat(chunks), false);
    });
    req.on('error', () => { /* client disconnect */ });
    return;
  }

  if (serveFile(path.join(ROOT, pathname), res)) return;
  const mapped = ROUTES[pathname] || ROUTES[pathname + '/'];
  if (mapped && serveFile(path.join(ROOT, mapped), res)) return;
  if (serveFile(path.join(ROOT, pathname + '.html'), res)) return;
  serveFile(path.join(ROOT, 'index.html'), res);
});

// ─── CRON DO SENTINEL (substitui netlify schedule) ────────────────
// Roda às 05:00 BRT = 08:00 UTC
function scheduleSentinel() {
  const now  = new Date();
  const next = new Date(now);
  next.setUTCHours(8, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  const wait = next - now;
  console.log('[SENTINEL-CRON] Próxima execução em', Math.round(wait / 60000), 'min');

  setTimeout(async () => {
    console.log('[SENTINEL-CRON] Iniciando scan agendado...');
    const sentinel = loadedFunctions['sentinel'];
    if (!sentinel) { console.warn('[SENTINEL-CRON] Não carregado'); return scheduleSentinel(); }

    try {
      const scanEvent = {
        httpMethod: 'POST', path: '/api/sentinel-qa',
        queryStringParameters: {},
        headers: { 'x-netlify-event': 'schedule', 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'scan' }),
        isBase64Encoded: false,
      };
      const scanResult = await sentinel.handler(scanEvent, {});
      const report = JSON.parse(scanResult.body || '{}');
      console.log('[SENTINEL-CRON] OK:', report.okCount + '/' + report.totalEndpoints, '| Erros:', report.errorCount);

      if (report.errorCount > 0 && report.errors) {
        const healEvent = {
          httpMethod: 'POST', path: '/api/sentinel-qa',
          queryStringParameters: {},
          headers: { 'x-netlify-event': 'schedule', 'content-type': 'application/json' },
          body: JSON.stringify({
            mode: 'heal',
            issues: report.errors.map(e => ({ type: 'SCAN_FAIL', severity: 'CRITICAL', route: e.url, detail: e.error })),
          }),
          isBase64Encoded: false,
        };
        const healResult = await sentinel.handler(healEvent, {});
        const heal = JSON.parse(healResult.body || '{}');
        console.log('[SENTINEL-CRON] Heal: overrides aplicados:', heal.firestoreOverrides && heal.firestoreOverrides.applied);
      }
    } catch (e) {
      console.error('[SENTINEL-CRON] Erro:', e.message, e.stack ? e.stack.split('\n')[1] : '');
    }
    scheduleSentinel();
  }, wait);
}

// ─── KEEPALIVE — evita cold start no Render free tier ─────────────
// Faz self-ping a cada 10 minutos para manter o servidor acordado
// UptimeRobot (gratuito) faz ping externo a cada 5 min como backup
function startKeepalive() {
  const appUrl = process.env.NEXIA_APP_URL;
  if (!appUrl) {
    console.log('[KEEPALIVE] NEXIA_APP_URL não definido — self-ping desativado');
    return;
  }
  const INTERVAL_MS = 10 * 60 * 1000; // 10 minutos
  setInterval(async () => {
    try {
      const start = Date.now();
      const res   = await fetch(appUrl + '/api/sentinel-qa?action=ping', {
        method: 'GET',
        timeout: 15000,
        headers: { 'x-keepalive': '1' }
      });
      console.log('[KEEPALIVE] Ping OK —', res.status, Date.now() - start + 'ms');
    } catch (e) {
      console.warn('[KEEPALIVE] Ping falhou:', e.message);
    }
  }, INTERVAL_MS);
  console.log('[KEEPALIVE] Self-ping ativo — intervalo: 10min → URL:', appUrl);
}

// ─── START ────────────────────────────────────────────────────────
loadFunctions();
server.listen(PORT, () => {
  console.log('\n[NEXIA] Servidor iniciado na porta', PORT);
  console.log('[NEXIA] Functions ativas:', Object.keys(loadedFunctions).length);
  console.log('[NEXIA] URL:', process.env.NEXIA_APP_URL || 'http://localhost:' + PORT);
  startKeepalive();
  scheduleSentinel();
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
process.on('uncaughtException',  (err) => { console.error('[NEXIA] uncaughtException:', err.message, err.stack); });
process.on('unhandledRejection', (reason) => { console.error('[NEXIA] unhandledRejection:', reason); });
