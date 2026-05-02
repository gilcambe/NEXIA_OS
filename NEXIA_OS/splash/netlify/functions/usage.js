/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  NEXIA OS — USAGE ANALYTICS v10.0  (NOVO)                   ║
 * ║  Tracking de consumo · Limites por plano · Dashboard        ║
 * ║  FASE 2: Controle de uso real por tenant/usuário            ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * GET  /api/usage?tenantId=x&days=7        → stats agregadas
 * POST /api/usage { action: "check", tenantId, userId }  → verifica limite
 * POST /api/usage { action: "reset", tenantId }          → reset (admin)
 */


const { admin, db } = require('./firebase-init');
const { guard, HEADERS, makeHeaders } = require('./middleware');


const PLAN_LIMITS = {
  free:       { maxCortexDay: 20,   maxRAGDocs: 5,    maxAgents: 3,   swarmEnabled: false, autodevEnabled: false },
  starter:    { maxCortexDay: 200,  maxRAGDocs: 50,   maxAgents: 10,  swarmEnabled: true,  autodevEnabled: false },
  pro:        { maxCortexDay: 1000, maxRAGDocs: 500,  maxAgents: -1,  swarmEnabled: true,  autodevEnabled: true  },
  enterprise: { maxCortexDay: -1,   maxRAGDocs: -1,   maxAgents: -1,  swarmEnabled: true,  autodevEnabled: true  }
};


// ── Busca stats de uso ─────────────────────────────────────────
async function getUsageStats(tenantId, days = 7) {
  if (!db) return { daily: [], totalCalls: 0, todayCalls: 0, plan: 'free', limits: PLAN_LIMITS.free, firebase: false };
  const since = new Date();
  since.setDate(since.getDate() - days);


  const snap = await db.collection('tenants').doc(tenantId)
    .collection('usage')
    .where('date', '>=', since.toISOString().split('T')[0])
    .orderBy('date', 'desc')
    .limit(days + 1)
    .get();


  const daily = snap.docs.map(d => ({ date: d.id, ...d.data() }));
  const totalCalls = daily.reduce((acc, d) => acc + (d.cortexCalls || 0), 0);
  const today = new Date().toISOString().split('T')[0];
  const todayData = daily.find(d => d.date === today);
  const todayCalls = todayData?.cortexCalls || 0;


  // Pega plano do tenant
  if (!db) return { tenantId, plan: 'free', limits: PLAN_LIMITS.free, today: { calls: 0, limit: 20, pct: 0 }, period: { days, totalCalls: 0, daily: [] }, features: { swarmEnabled: false, autodevEnabled: false }, firebase: false };
  const tenantDoc = await db.collection('tenants').doc(tenantId).get();
  const plan = tenantDoc.exists ? (tenantDoc.data().plan || 'free') : 'free';
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;


  return {
    tenantId, plan, limits,
    today: { calls: todayCalls, limit: limits.maxCortexDay, pct: limits.maxCortexDay > 0 ? Math.round(todayCalls / limits.maxCortexDay * 100) : 0 },
    period: { days, totalCalls, daily },
    features: {
      swarmEnabled: limits.swarmEnabled,
      autodevEnabled: limits.autodevEnabled,
      ragDocsLeft: limits.maxRAGDocs > 0 ? Math.max(0, limits.maxRAGDocs - (tenantDoc.data()?.ragDocsCount || 0)) : -1
    }
  };
}


// ── Verifica se pode chamar o Cortex ──────────────────────────
async function checkLimit(tenantId, userId, feature = 'cortex') {
  if (!db) return { ok: true, allowed: true, plan: 'free', limits: PLAN_LIMITS.free, calls: 0, firebase: false };
  const today = new Date().toISOString().split('T')[0];
  const [usageDoc, tenantDoc] = await Promise.all([
    db.collection('tenants').doc(tenantId).collection('usage').doc(today).get(),
    db.collection('tenants').doc(tenantId).get()
  ]);


  const plan   = tenantDoc.exists ? (tenantDoc.data().plan || 'free') : 'free';
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;


  if (feature === 'swarm' && !limits.swarmEnabled) {
    return { ok: false, reason: `Swarm não disponível no plano ${plan}. Faça upgrade para Starter.`, upgradeRequired: true };
  }
  if (feature === 'autodev' && !limits.autodevEnabled) {
    return { ok: false, reason: `AutoDev não disponível no plano ${plan}. Faça upgrade para Pro.`, upgradeRequired: true };
  }


  const todayCalls = usageDoc.exists ? (usageDoc.data()?.cortexCalls || 0) : 0;
  const maxDay = limits.maxCortexDay;


  if (maxDay > 0 && todayCalls >= maxDay) {
    return {
      ok: false,
      reason: `Limite diário atingido: ${todayCalls}/${maxDay} mensagens (plano ${plan}).`,
      upgradeRequired: true,
      current: todayCalls, max: maxDay, plan
    };
  }


  return { ok: true, remaining: maxDay > 0 ? maxDay - todayCalls : -1, plan };
}


exports.handler = async (event) => {
  const headers = makeHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  const guardErr = await guard(event, 'default');
  if (guardErr) return guardErr;


  try {
    if (event.httpMethod === 'GET') {
      const { tenantId, days = '7' } = event.queryStringParameters || {};
      if (!tenantId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'tenantId obrigatório' }) };
      const stats = await getUsageStats(tenantId, parseInt(days));
      return { statusCode: 200, headers, body: JSON.stringify(stats) };
    }


    let body;
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }
    const { action, tenantId, userId, feature } = body;


    if (action === 'check') {
      const result = await checkLimit(tenantId, userId, feature || 'cortex');
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }


    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ação não reconhecida' }) };
  } catch (err) {
    console.error('[USAGE] Error:', err.message);
    // Retorna dados zerados — não quebra o frontend
    return { statusCode: 200, headers, body: JSON.stringify({ daily: [], totalCalls: 0, todayCalls: 0, plan: 'free', limits: { maxCortexDay: 20, maxRAGDocs: 5, maxAgents: 3, swarmEnabled: false, autodevEnabled: false }, firebase: false, note: 'Dados indisponíveis temporariamente' }) };
  }
};


// Exporta checkLimit para uso direto (usado em cortex-chat, autodev, swarm)
module.exports.checkLimit = checkLimit;
module.exports.PLAN_LIMITS = PLAN_LIMITS;












