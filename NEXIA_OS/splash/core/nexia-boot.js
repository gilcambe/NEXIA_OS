/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  NEXIA OS — BOOT ENGINE v2.0                                        ║
 * ║  Ponto de entrada ÚNICO para Firebase + Auth em TODAS as páginas.   ║
 * ║                                                                      ║
 * ║  REGRA DE OURO — NUNCA VIOLE:                                        ║
 * ║  Nenhuma página pode chamar firebase.auth() ou firebase.firestore()  ║
 * ║  diretamente. Sempre use NexiaBoot.ready(cb) ou NEXIA.onReady(cb).  ║
 * ║                                                                      ║
 * ║  COMPATIBILIDADE DUPLA:                                              ║
 * ║  Este arquivo expõe TANTO window.NexiaBoot QUANTO window.NEXIA.      ║
 * ║  auth.js, agent-factory.js e demais módulos continuam funcionando   ║
 * ║  sem nenhuma alteração.                                              ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * ORDEM DE CARREGAMENTO OBRIGATÓRIA no <head> de toda página protegida:
 *   1. firebase-app-compat.js       (CDN)
 *   2. firebase-auth-compat.js      (CDN)
 *   3. firebase-firestore-compat.js (CDN)
 *   4. /core/nexia-boot.js          ← ESTE ARQUIVO (substitui config.js)
 *   5. /core/auth.js                (usa NEXIA._ready internamente)
 *
 * NÃO carregue mais /core/config.js — nexia-boot.js já faz tudo.
 */
'use strict';

(function () {

  // ── Tenant Registry (mantido do config.js) ───────────────────────────
  var TENANT_REGISTRY = {
    'nexia':        { slug:'nexia',         name:'NEXIA CORPORATION',    theme:'dark',  role:'master', modules:['all'] },
    'viajante-pro': { slug:'viajante-pro',  name:'Viajante Pro Oficial', theme:'dark',  role:'tenant', modules:['turismo','financeiro','logistica'] },
    'ces':          { slug:'ces',           name:'CES Brasil 2027',      theme:'light', role:'tenant', modules:['eventos','matchmaking','compliance'] },
    'bezsan':       { slug:'bezsan',        name:'Bezsan Leilões',       theme:'dark',  role:'tenant', modules:['leiloes','financeiro'] },
    'splash':       { slug:'splash',        name:'Splash Eventos',       theme:'dark',  role:'tenant', modules:['eventos'] }
  };

  var PATH_MAP = [
    { pattern:/\/nexia\/|nexia-master|\/nexia$/i,     slug:'nexia' },
    { pattern:/\/viajante-pro\/|\/vp-|viajante_pro/i, slug:'viajante-pro' },
    { pattern:/\/ces\/|\/ces-|cesbrasil/i,            slug:'ces' },
    { pattern:/\/bezsan\/|bezsan-|\/bezsan$/i,        slug:'bezsan' },
    { pattern:/\/splash\/|splash-|\/splash$/i,        slug:'splash' }
  ];

  var SETTINGS = {
    version: '57.0.0',
    allowDebug: (typeof window !== 'undefined' && window.location.hostname === 'localhost'),
    swarmMaxAgents: 10,
    swarmTimeout: 30000
  };

  // ── Estado interno ───────────────────────────────────────────────────
  var _ready    = false;
  var _failed   = false;
  var _queue    = [];   // fila NexiaBoot.ready()
  var _nexiaQ   = [];   // fila NEXIA.onReady()
  var _db       = null;
  var _auth     = null;
  var _app      = null;
  var _tenant   = null;

  // ── Log ─────────────────────────────────────────────────────────────
  function _log(msg, type) {
    if (!SETTINGS.allowDebug) return;
    var c = { ok:'#00d68f', warn:'#ffaa00', err:'#ff3d71', info:'#00e5ff' };
    console.log('%c[NEXIA BOOT] ' + msg, 'color:' + (c[type] || c.info) + ';font-weight:bold');
  }

  // ── Banner de erro ───────────────────────────────────────────────────
  function _showError(msg) {
    if (typeof document === 'undefined') return;
    if (document.getElementById('nx-boot-error')) return;
    var inject = function () {
      if (!document.body) { setTimeout(inject, 50); return; }
      var el = document.createElement('div');
      el.id = 'nx-boot-error';
      el.style.cssText = [
        'position:fixed','top:0','left:0','right:0','z-index:99999',
        'background:#1a1a2e','color:#f1f5f9','font-size:14px',
        'padding:14px 20px','display:flex','align-items:center',
        'justify-content:space-between','border-bottom:2px solid #ff3d71',
        'font-family:sans-serif','box-shadow:0 2px 16px rgba(0,0,0,.6)'
      ].join(';');
      var safe = (msg || 'Serviço temporariamente indisponível.').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      el.innerHTML = '<span>⚠️ ' + safe + '</span>'
        + '<button onclick="location.reload()" style="background:#0057ff;color:#fff;border:none;'
        + 'border-radius:6px;padding:6px 16px;cursor:pointer;font-size:13px;margin-left:16px">'
        + 'Tentar novamente</button>';
      document.body.prepend(el);
    };
    inject();
  }

  // ── Detecta tenant pela URL ──────────────────────────────────────────
  function _detectTenant() {
    var path = (typeof window !== 'undefined') ? window.location.pathname.toLowerCase() : '';
    for (var i = 0; i < PATH_MAP.length; i++) {
      if (PATH_MAP[i].pattern.test(path)) {
        _tenant = Object.assign({}, TENANT_REGISTRY[PATH_MAP[i].slug]);
        return;
      }
    }
    _tenant = { slug:'guest', name:'Visitante', modules:[], role:'guest' };
  }

  // ── Flush das filas ──────────────────────────────────────────────────
  function _flush() {
    // Fila NexiaBoot.ready(fn(app, db, auth))
    _queue.forEach(function (cb) {
      try { cb(_app, _db, _auth); } catch (e) { console.error('[NEXIA BOOT] callback error:', e); }
    });
    _queue = [];

    // Fila NEXIA.onReady(fn())
    _nexiaQ.forEach(function (cb) {
      try { cb(); } catch (e) { console.error('[NEXIA BOOT] onReady error:', e); }
    });
    _nexiaQ = [];
  }

  // ── Inicializa Firebase ──────────────────────────────────────────────
  function _initFirebase(cfg) {
    try {
      _app  = (firebase.apps && firebase.apps.length) ? firebase.app() : firebase.initializeApp(cfg);
      _db   = firebase.firestore();
      _auth = firebase.auth ? firebase.auth() : null;

      try { _db.settings({ experimentalForceLongPolling: false, merge: true }); } catch (_) {}

      _detectTenant();
      _ready = true;

      // ── Popula window.NEXIA para compatibilidade com auth.js e demais módulos ──
      _syncNEXIA();

      _log('Firebase OK · ' + (cfg.projectId || '?') + ' · Tenant: ' + (_tenant ? _tenant.name : 'GUEST'), 'ok');
      _flush();
    } catch (e) {
      _failed = true;
      _log('Firebase initializeApp falhou: ' + e.message, 'err');
      _syncNEXIA();
      _showError('Erro interno ao inicializar. Tente recarregar a página.');
      _flush();
    }
  }

  // ── Sincroniza window.NEXIA ──────────────────────────────────────────
  // auth.js e outros módulos usam NEXIA._ready, NEXIA.auth, NEXIA.db, etc.
  // Esta função mantém window.NEXIA como alias vivo do estado do boot.
  function _syncNEXIA() {
    var NEXIA = window.NEXIA || {};

    NEXIA._ready           = _ready;
    NEXIA._failed          = _failed;
    NEXIA._readyCallbacks  = _nexiaQ; // compatibilidade
    NEXIA.app              = _app;
    NEXIA.db               = _db;
    NEXIA.auth             = _auth;
    NEXIA.currentTenant    = _tenant;
    NEXIA.version          = SETTINGS.version;

    // Métodos que auth.js e outros usam
    NEXIA.onReady = function (cb) {
      if (_ready || _failed) { try { cb(); } catch(e) {} }
      else { _nexiaQ.push(cb); }
    };

    NEXIA.log = function (msg, type) { _log(msg, type || 'info'); };

    NEXIA.setTenant = function (slug) {
      if (!TENANT_REGISTRY[slug]) { _log('Tenant desconhecido: ' + slug, 'warn'); return; }
      _tenant = Object.assign({}, TENANT_REGISTRY[slug]);
      NEXIA.currentTenant = _tenant;
    };

    NEXIA.getCollection = function (col) {
      var slug = _tenant && _tenant.slug;
      if (!slug || slug === 'guest') return _db.collection(col);
      return _db.collection('data').doc(slug).collection(col);
    };

    NEXIA.sanitize = function (s) {
      if (typeof s !== 'string') return '';
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;').replace(/'/g,'&#x27;').replace(/\//g,'&#x2F;');
    };

    NEXIA.getContactLink = async function (msg) {
      msg = msg || 'Olá! Quero conhecer o NEXIA OS';
      var FALLBACK = '5511944037259';
      var fallback = 'https://wa.me/' + FALLBACK + '?text=' + encodeURIComponent(msg);
      try {
        var slug = (_tenant && _tenant.slug) || 'nexia';
        var snap = await _db.collection('tenants').doc(slug).collection('config').doc('brand').get();
        var phone = snap.exists ? snap.data() && snap.data().whatsappPhone : null;
        if (phone) return 'https://wa.me/' + phone.replace(/\D/g,'') + '?text=' + encodeURIComponent(msg);
      } catch(e) {}
      return fallback;
    };

    window.NEXIA = NEXIA;
    window.NEXIA_SETTINGS = SETTINGS;
  }

  // ── Fetch config do servidor ─────────────────────────────────────────
  function _fetchConfig() {
    fetch('/api/firebase-config', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (cfg && cfg.apiKey) {
          _initFirebase(cfg);
        } else {
          _failed = true;
          _syncNEXIA();
          _log('/api/firebase-config retornou config inválida', 'err');
          _showError('Serviço temporariamente indisponível. Tente novamente em alguns segundos.');
          _flush();
        }
      })
      .catch(function () {
        _failed = true;
        _syncNEXIA();
        _log('/api/firebase-config falhou (sem rede?)', 'err');
        _showError('Não foi possível conectar ao servidor. Verifique sua conexão.');
        _flush();
      });
  }

  // ── Boot principal ───────────────────────────────────────────────────
  function _boot() {
    if (typeof firebase === 'undefined') { setTimeout(_boot, 50); return; }

    // Se config.js já rodou antes (carregamento duplo acidental), reutiliza
    if (window.NEXIA && window.NEXIA._ready && window.NEXIA.db) {
      _app   = window.NEXIA.app;
      _db    = window.NEXIA.db;
      _auth  = window.NEXIA.auth;
      _tenant = window.NEXIA.currentTenant;
      _ready = true;
      _log('Firebase reutilizado de window.NEXIA existente', 'info');
      _flush();
      return;
    }

    // Se Firebase já inicializado (ex: hot-reload)
    if (firebase.apps && firebase.apps.length > 0) {
      try {
        _app  = firebase.app();
        _db   = firebase.firestore();
        _auth = firebase.auth ? firebase.auth() : null;
        _detectTenant();
        _ready = true;
        _syncNEXIA();
        _log('Firebase reutilizado (já inicializado)', 'info');
        _flush();
        return;
      } catch (_) {}
    }

    _fetchConfig();
  }

  // ── Inicializa window.NEXIA como stub imediatamente ─────────────────
  // auth.js pode ser carregado logo após este script e vai checar NEXIA._ready.
  // Com o stub, NEXIA existe mas _ready é false — auth.js entra no loop de retry.
  _syncNEXIA();

  // ── API pública NexiaBoot ────────────────────────────────────────────
  var NexiaBoot = {
    ready: function (cb) {
      if (typeof cb !== 'function') return;
      if (_ready || _failed) {
        try { cb(_app, _db, _auth); } catch (e) { console.error('[NEXIA BOOT]', e); }
      } else {
        _queue.push(cb);
      }
    },
    isReady:   function () { return _ready; },
    hasFailed: function () { return _failed; },
    getApp:    function () { return _app; },
    getDb:     function () { return _db; },
    getAuth:   function () { return _auth; }
  };

  window.NexiaBoot = NexiaBoot;

  // Inicia
  _boot();

})();
