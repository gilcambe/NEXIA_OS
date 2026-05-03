'use strict';

// ── fetchWithTimeout helper ──
async function _fetchTimeout(url, opts = {}, ms = 30000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(tid); }
}

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  NEXIA OS — TENANT DOMAIN v1.0                                   ║
 * ║  Domínio customizado por tenant via Netlify API                  ║
 * ║  POST /api/tenant-domain                                         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

const { admin, db } = require('./firebase-init');
const { guard, HEADERS, makeHeaders } = require('./middleware');

const NETLIFY_TOKEN  = process.env.NETLIFY_API_TOKEN;
const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;

async function netlifyRequest(method, path, body) {
  if (!NETLIFY_TOKEN) throw new Error('NETLIFY_API_TOKEN não configurado');
  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${NETLIFY_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : null
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Netlify API ${res.status}`);
  return data;
}

exports.handler = async (event) => {
  const headers = makeHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  // FIX v20: guard contra db null quando Firebase não está configurado
  if (!db) return { statusCode: 503, headers: makeHeaders ? makeHeaders(event) : HEADERS, body: JSON.stringify({ ok: false, error: 'Firebase indisponível — configure FIREBASE_SERVICE_ACCOUNT.' }) };

    const g = await guard(event, 'tenant-domain');
  if (g) return g;

  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

  let _b;
  try { _b = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }
  const { action, tenantId, domain } = _b;
  if (!tenantId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'tenantId obrigatório' }) };

  try {
    // ── ADD DOMAIN ────────────────────────────────────────────────
    if (action === 'add') {
      if (!domain) return { statusCode: 400, headers, body: JSON.stringify({ error: 'domain obrigatório' }) };

      // Valida formato do domínio
      if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(domain)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Formato de domínio inválido' }) };
      }

      // Verifica se domínio já está em uso por outro tenant
      const existing = await db.collection('tenants').where('customDomain', '==', domain).limit(1).get();
      if (!existing.empty && existing.docs[0].id !== tenantId) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'Domínio já está em uso por outro tenant' }) };
      }

      let netlifyResult = null;
      if (NETLIFY_TOKEN && NETLIFY_SITE_ID) {
        netlifyResult = await netlifyRequest('POST', `/sites/${NETLIFY_SITE_ID}/domain_aliases`, { domain });
      }

      // Salva no Firestore
      await db.collection('tenants').doc(tenantId).update({
        customDomain: domain,
        domainStatus: 'pending_dns',
        domainAddedAt: admin.firestore.FieldValue.serverTimestamp(),
        domainNetlifyId: netlifyResult?.id || null
      });

      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          ok: true,
          domain,
          status: 'pending_dns',
          instructions: {
            type: 'CNAME',
            name: domain.startsWith('www.') ? 'www' : '@',
            value: `${NETLIFY_SITE_ID || 'nexia-os'}.onrender.com`,
            ttl: 3600,
            message: `Aponte o DNS do seu domínio conforme acima. A propagação leva até 24h. Use /api/tenant-domain com action:"verify" para verificar.`
          }
        })
      };
    }

    // ── VERIFY DNS ────────────────────────────────────────────────
    if (action === 'verify') {
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      const domain = tenantDoc.data()?.customDomain;
      if (!domain) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Tenant não tem domínio configurado' }) };

      let verified = false;
      let netlifyStatus = 'unknown';

      if (NETLIFY_TOKEN && NETLIFY_SITE_ID) {
        try {
          const aliases = await netlifyRequest('GET', `/sites/${NETLIFY_SITE_ID}/domain_aliases`);
          const found = aliases.find(a => a.domain === domain);
          verified = found?.verified === true;
          netlifyStatus = found?.last_error || (verified ? 'active' : 'pending');
        } catch (e) { netlifyStatus = 'Internal error'; }
      } else {
        // Fallback: tenta resolver DNS manualmente
        try {
          const dnsRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=CNAME`, {
            headers: { 'Accept': 'application/dns-json' }
          });
          const dns = await dnsRes.json();
          verified = dns.Answer?.some(a => a.data?.includes('onrender.com')) || false;
          netlifyStatus = verified ? 'active' : 'dns_not_propagated';
        } catch {}
      }

      if (verified) {
        await db.collection('tenants').doc(tenantId).update({
          domainStatus: 'active',
          domainVerifiedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      return {
        statusCode: 200, headers,
        body: JSON.stringify({ ok: true, domain, verified, status: netlifyStatus })
      };
    }

    // ── REMOVE DOMAIN ─────────────────────────────────────────────
    if (action === 'remove') {
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      const domain = tenantDoc.data()?.customDomain;
      const netlifyId = tenantDoc.data()?.domainNetlifyId;

      if (domain && NETLIFY_TOKEN && NETLIFY_SITE_ID && netlifyId) {
        await netlifyRequest('DELETE', `/sites/${NETLIFY_SITE_ID}/domain_aliases/${netlifyId}`).catch(() => {});
      }

      await db.collection('tenants').doc(tenantId).update({
        customDomain: admin.firestore.FieldValue.delete(),
        domainStatus: admin.firestore.FieldValue.delete(),
        domainNetlifyId: admin.firestore.FieldValue.delete()
      });

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, removed: domain || 'none' }) };
    }

    // ── GET STATUS ────────────────────────────────────────────────
    if (action === 'status') {
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      const data = tenantDoc.data() || {};
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          ok: true,
          customDomain: data.customDomain || null,
          domainStatus: data.domainStatus || 'none',
          domainVerifiedAt: data.domainVerifiedAt || null
        })
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'action inválida. Use: add, verify, remove, status' }) };

  } catch (err) {
    console.error('[TENANT-DOMAIN]', 'Internal error');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
