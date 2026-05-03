# NEXIA OS — AI HANDOFF v5.0
> Última atualização: 2026-04-30 | Sessão: v50 completa

---

## ⚠️ REGRAS ABSOLUTAS — LER ANTES DE QUALQUER COISA

1. **NÃO criar `.tsx`, `.jsx`, `.ts`** — projeto é HTML/JS/Node.js puro
2. **NÃO criar `src/`** — não existe build step
3. **NÃO adicionar Express** — server.js usa http nativo
4. **NÃO alterar response shapes das APIs** — frontend depende deles
5. **NÃO duplicar `nexia-design-system.css`**
6. **SEMPRE** adicionar nova rota no `ROUTES` do `server.js` ao criar nova página HTML
7. **SEMPRE** usar `authFetch()` com Bearer token — nunca chamar APIs sem auth
8. **SEMPRE** implementar fallback estático — página nunca quebra por erro de API
9. **SEMPRE** atualizar este arquivo após concluir qualquer tarefa

---

## ARQUITETURA

```
nexia-os/
├── server.js              ← HTTP nativo Node.js — serve estáticos + roteia APIs
├── package.json
├── render.yaml            ← deploy Render Free
├── index.html             ← Landing page (✅ cold start overlay aplicado)
├── login.html
├── nexia/
│   ├── nexia-design-system.css   ← design tokens (NÃO DUPLICAR)
│   ├── cortex-app.html           ← ✅ DOMPurify, /plans link, PWA manifest, 429 melhorado
│   ├── my-panel.html             ← ✅ KPIs reais (/api/kpi + /api/usage + /api/logs)
│   ├── tenant-hub.html           ← dashboard principal
│   ├── plans.html                ← ✅ NOVO — página de planos
│   ├── onboarding.html           ← ✅ NOVO — onboarding 4 steps
│   ├── nexia-manifest.json       ← ✅ NOVO — PWA manifest
│   ├── sentinel-dashboard.html
│   ├── flow.html
│   ├── architect.html
│   └── ... (demais páginas)
├── core/                  ← JS compartilhado (auth.js, config.js, etc.)
├── netlify/functions/     ← 43 handlers backend
│   ├── cortex-chat.js     ← ⚠️ CRÍTICO — 50+ providers IA
│   ├── firebase-init.js   ← Admin SDK init (OK — sem deprecated APIs)
│   └── ...
└── docs/
    ├── handoff.md         ← ESTE ARQUIVO
    └── architecture.md
```

---

## O QUE FOI APLICADO NA SESSÃO v50 (2026-04-30)

### Patches aplicados diretamente no projeto real:

| Arquivo | Patch | Bug resolvido |
|---------|-------|---------------|
| `server.js` | RATE_STORE + checkRateLimit + getUserPlan + rotas /plans /onboarding /manifest | BUG-001 |
| `index.html` | Cold start overlay — aparece após 800ms, some quando /api/firebase-config responde | BUG-006 |
| `nexia/my-panel.html` | **Reescrita completa** — KPIs reais via /api/kpi + /api/usage + /api/logs, Promise.allSettled, fallback inteligente | BUG-004/007 |
| `nexia/cortex-app.html` | DOMPurify CDN + sanitize + /plans link no pill + 429 melhorado com upgrade CTA + PWA manifest | BUG-003 |

### Arquivos novos criados:

| Arquivo | Descrição |
|---------|-----------|
| `nexia/plans.html` | Página de planos Free/Starter/Pro/Enterprise, toggle mensal/anual, FAQ |
| `nexia/onboarding.html` | Onboarding 4 steps, salva no Firestore users/{uid}, redirect para /nexia |
| `nexia/nexia-manifest.json` | PWA manifest com ícones SVG e shortcuts |

---

## COMO O SERVIDOR FUNCIONA

```
Request → server.js
  ├── OPTIONS → CORS headers (204)
  ├── /api/firebase-config → inline handler
  ├── /api/* → netlify/functions/{handler}.js
  └── /* → arquivo estático ou ROUTES[path]
```

**Deploy:** `npm install --omit=dev && node server.js` — sem build step.

---

## PADRÃO DE AUTH NAS PÁGINAS

```javascript
// Boot: espera Firebase inicializar (até 8s)
(function boot() {
  let attempts = 0;
  function check() {
    if (typeof firebase !== 'undefined' && firebase.apps?.length) {
      firebase.auth().onAuthStateChanged(async u => {
        if (!u) { window.location.href = '/login'; return; }
        // lógica da página
      });
    } else {
      if (++attempts > 80) { window.location.href = '/login?error=timeout'; return; }
      setTimeout(check, 100);
    }
  }
  check();
})();

// Fetch autenticado
async function authFetch(url, opts = {}) {
  let token = '';
  try { const u = firebase.auth().currentUser; if (u) token = await u.getIdToken(); } catch {}
  const headers = { 'Content-Type': 'application/json', ...(opts.headers||{}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);
  try { const res = await fetch(url, {...opts, headers, signal: ctrl.signal}); clearTimeout(timeout); return res; }
  catch(e) { clearTimeout(timeout); throw e; }
}
```

---

## DESIGN TOKENS (nexia-design-system.css)

```
--bg: #07090E | --bg2: #0A0D16 | --bg3: #0E1220
--blue: #0057FF | --cyan: #00E5FF | --green: #00D68F
--red: #FF3D71 | --purple: #9B5CF6 | --gold: #DAA520
--text: #F1F5F9 | --text2: #94A3B8 | --text3: #475569
--ff: 'Sora' | --ffm: 'JetBrains Mono'
```

---

## APIS PRINCIPAIS

| Endpoint | Handler | Response |
|----------|---------|----------|
| `POST /api/cortex` | cortex-chat.js | `{reply, type, actions, _meta}` ou SSE |
| `GET /api/firebase-config` | server.js inline | `{apiKey, authDomain, projectId, ...}` |
| `GET /api/usage` | usage.js | `{today:{calls,limit}, unlimited, plan}` |
| `POST /api/kpi` | kpi-engine.js | `{kpis:{activeAgents,activeFlows,totalCalls,uptime}}` |
| `GET /api/logs` | cortex-logs.js | `{logs:[{ts,level,message}]}` |

---

## ESTADO DOS BUGS

### ✅ RESOLVIDOS
- BUG-001: Rate limiting em memória
- BUG-003: XSS no cortex — DOMPurify
- BUG-004/007: my-panel com KPIs estáticos → reais
- BUG-006: Cold start sem loading screen
- BUG-002: Falso positivo (enableIndexedDbPersistence não existe no projeto real)

### 🟡 ABERTO (não crítico)
- Redirecionar para /onboarding no primeiro login:
  ```javascript
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists || !snap.data()?.onboardingDone) window.location.href = '/onboarding';
  ```
- checkRateLimit() do server.js não integrado ao cortex-chat.js (cortex já tem seu próprio rate limit interno)
- Histórico CORTEX multi-device (localStorage só funciona no mesmo device)

---

## ENV VARS OBRIGATÓRIAS NO RENDER

```
FIREBASE_SERVICE_ACCOUNT_BASE64
NEXIA_APP_URL
GROQ_API_KEY
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
```

Opcionais (mais providers = melhor fallback):
```
ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY
```
