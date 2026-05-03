# NEXIA OS — Arquitetura Real

## Visão Geral
Monolito Node.js que serve frontend estático + backend em um único processo.

## Fluxo de Request

```
Browser
  ↓
Render (HTTPS)
  ↓
server.js (Node HTTP nativo, porta $PORT)
  ├── GET /ces, /vp, /bezsan, /splash, /nexia/* → serve HTML de /dist/
  ├── GET /health → JSON de status
  ├── GET /api/firebase-config → config Firebase Web SDK
  └── POST /api/* → adapter → netlify/functions/{handler}.js
                                  ↓
                           Firebase Admin (Auth + Firestore)
                           + AI Providers (Groq, Gemini, etc.)
```

## Adapter Netlify ↔ Node

O server.js converte req/res Node HTTP para o formato de evento Netlify:
```js
event = {
  httpMethod, path, queryStringParameters,
  headers, body, isBase64Encoded
}
```
Cada handler exporta `exports.handler = async (event, context) => ({statusCode, headers, body})`.

## Cortex AI (cortex-chat.js)

Fallback chain automático:
1. Groq (primário — gratuito, rápido)
2. Gemini (fallback 1)
3. Cerebras (fallback 2)
4. OpenRouter (fallback 3)
5. SambaNova / Together / Mistral / Cohere (fallbacks adicionais)

Cada call usa `_fetchTimeout()` com AbortController (30s padrão, 60s para Gemini).

## Sentinel

- Cron interno: todo dia 05:00 BRT (08:00 UTC)
- Modo scan: testa todos os endpoints do sistema
- Modo heal: se score < threshold, aciona RENDER_DEPLOY_HOOK
- Modo PR: abre GitHub PR com fix se GITHUB_TOKEN configurado

## Multi-tenant

Estrutura Firestore: `tenants/{tenantId}/...`
- Planos: free / pro / enterprise
- Billing via MercadoPago (billing.js)
- Roles: master / admin / user

## Arquivos críticos (não quebrar)

| Arquivo | Tamanho | Importância |
|---------|---------|-------------|
| netlify/functions/cortex-chat.js | 56KB | CRÍTICO — 47 providers |
| netlify/functions/sentinel.js | ~20KB | CRÍTICO — monitoramento |
| netlify/functions/auth.js | ~11KB | CRÍTICO — autenticação |
| netlify/functions/billing.js | ~16KB | ALTO — pagamentos |
| netlify/functions/tenant-admin.js | ~20KB | ALTO — multi-tenant |
| server.js | ~8KB | CRÍTICO — servidor |
