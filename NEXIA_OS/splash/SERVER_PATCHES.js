// ═══════════════════════════════════════════════════════════════════════
// NEXIA OS — server.js PATCHES
// Aplique estes patches no server.js de produção.
// Não é um arquivo separado — são blocos a inserir no server.js existente.
// ═══════════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────────
// PATCH 1: Rate limiter em memória para /api/cortex
// Inserir APÓS a seção "// ── CORS" e ANTES de "// ── Firebase Admin"
// ────────────────────────────────────────────────────────────────────

const RATE_STORE = new Map(); // uid → { count, reset }
const RATE_LIMITS = { free: 50, starter: 500, pro: 99999, enterprise: 99999 }; // por mês

function checkRateLimit(uid, plan) {
  const now = Date.now();
  const monthKey = new Date().toISOString().slice(0, 7); // "2026-04"
  const key = `${uid}:${monthKey}`;

  if (!RATE_STORE.has(key)) {
    RATE_STORE.set(key, { count: 0, reset: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime() });
  }

  const entry = RATE_STORE.get(key);

  // Reset se passou do mês
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime();
  }

  const limit = RATE_LIMITS[plan] ?? RATE_LIMITS.free;

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, limit };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, limit };
}

// Uso dentro de handleCortex, logo após verifyToken:
// const { plan } = await getUserPlan(uid);
// const rate = checkRateLimit(uid, plan);
// if (!rate.allowed) return fail(res, `Limite do plano ${plan} atingido (${rate.limit}/mês). Faça upgrade em /plans.`, req, 429);


// ────────────────────────────────────────────────────────────────────
// PATCH 2: Helper para buscar plano do usuário no Firestore
// Inserir após a função verifyToken
// ────────────────────────────────────────────────────────────────────

async function getUserPlan(uid) {
  if (!db) return { plan: 'free' };
  try {
    const snap = await db.collection('users').doc(uid).get();
    return { plan: snap.exists ? (snap.data().plan ?? 'free') : 'free' };
  } catch {
    return { plan: 'free' };
  }
}


// ────────────────────────────────────────────────────────────────────
// PATCH 3: Limpeza periódica do RATE_STORE (evita memory leak)
// Inserir no final do arquivo, antes de server.listen()
// ────────────────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of RATE_STORE.entries()) {
    if (now > entry.reset) RATE_STORE.delete(key);
  }
}, 60 * 60 * 1000); // limpa a cada hora


// ────────────────────────────────────────────────────────────────────
// PATCH 4: handleCortex com rate limit integrado
// Substitua o início de handleCortex por:
// ────────────────────────────────────────────────────────────────────

/*
async function handleCortex(req, res) {
  let uid, decoded;
  try { decoded = await verifyToken(req); uid = decoded.uid; }
  catch { return fail(res, 'Não autorizado', req, 401); }

  // Rate limiting por plano
  const { plan } = await getUserPlan(uid);
  const rate = checkRateLimit(uid, plan);
  if (!rate.allowed) {
    return fail(res, `Limite mensal do plano ${plan.toUpperCase()} atingido (${rate.limit} mensagens/mês). Faça upgrade em /plans.`, req, 429);
  }

  // ... resto do handleCortex existente ...
}
*/


// ────────────────────────────────────────────────────────────────────
// PATCH 5: Fix firebase.ts - substituir enableIndexedDbPersistence
// Arquivo: src/lib/firebase.ts
// ────────────────────────────────────────────────────────────────────

/*
// ANTES (deprecated):
import { getFirestore, Firestore, enableIndexedDbPersistence } from 'firebase/firestore';
const db = getFirestore(app);
enableIndexedDbPersistence(db).catch(() => {});

// DEPOIS (correto para Firestore v10+):
import { initializeFirestore, persistentLocalCache, Firestore } from 'firebase/firestore';

export const db: Firestore = initializeFirestore(app, {
  localCache: persistentLocalCache()
});
*/


// ────────────────────────────────────────────────────────────────────
// PATCH 6: Loading screen no index.html (anti cold-start UX)
// Adicionar dentro do <body> ANTES do <div id="root">
// ────────────────────────────────────────────────────────────────────

/*
<div id="splash" style="
  position:fixed;inset:0;background:#0B1120;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  font-family:'Plus Jakarta Sans',sans-serif;z-index:9999;transition:opacity 0.3s;
">
  <div style="
    width:44px;height:44px;border-radius:12px;background:#3B82F6;
    display:flex;align-items:center;justify-content:center;margin-bottom:16px;
  ">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="rgba(255,255,255,0.2)"/>
      <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z" fill="white"/>
    </svg>
  </div>
  <div style="color:#F1F5F9;font-size:16px;font-weight:800;letter-spacing:-0.02em;">NEXIA<span style="color:#3B82F6">OS</span></div>
  <div style="color:#6B7280;font-size:11px;margin-top:4px;">Inicializando sistema...</div>
</div>

<script>
  // Remove splash quando o React montar
  window.__hideSplash = function() {
    var el = document.getElementById('splash');
    if (el) { el.style.opacity = '0'; setTimeout(function(){ el.remove(); }, 300); }
  };
</script>
*/

// Em src/main.tsx, adicione ao final do ReactDOM.createRoot(...).render(...):
// window.__hideSplash?.();
