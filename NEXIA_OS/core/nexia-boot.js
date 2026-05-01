/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  NEXIA OS — BOOT ENGINE v1.0                                        ║
 * ║  Ponto de entrada único para Firebase + Auth em TODAS as páginas.   ║
 * ║                                                                      ║
 * ║  REGRA DE ORO — NUNCA VIOLE:                                         ║
 * ║  Nenhuma página pode chamar firebase.auth() ou firebase.firestore()  ║
 * ║  diretamente. Sempre use NexiaBoot.ready(callback).                 ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * ORDEM DE CARREGAMENTO OBRIGATÓRIA no <head> de toda página protegida:
 *   1. firebase-app-compat.js      (CDN)
 *   2. firebase-auth-compat.js     (CDN)
 *   3. firebase-firestore-compat.js (CDN)
 *   4. /core/nexia-boot.js         ← este arquivo
 *   5. /core/auth.js               (usa NexiaBoot.ready internamente)
 *
 * USO NAS PÁGINAS:
 *   NexiaBoot.ready(function(firebase, db, auth) {
 *     // Aqui o Firebase já está inicializado e pronto.
 *     auth.onAuthStateChanged(function(user) { ... });
 *   });
 */
'use strict';

(function () {

  // ── Estado interno ───────────────────────────────────────────────────
  var _ready    = false;
  var _failed   = false;
  var _queue    = [];
  var _db       = null;
  var _auth     = null;
  var _app      = null;

  // ── Utilitário de log (só em localhost) ─────────────────────────────
  var _isLocal  = (typeof window !== 'undefined' &&
                   window.location.hostname === 'localhost');
  function _log(msg, type) {
    if (!_isLocal) return;
    var colors = { ok: '#00d68f', warn: '#ffaa00', err: '#ff3d71', info: '#00e5ff' };
    console.log('%c[NEXIA BOOT] ' + msg, 'color:' + (colors[type] || colors.info) + ';font-weight:bold');
  }

  // ── Flush da fila de callbacks ───────────────────────────────────────
  function _flush() {
    _queue.forEach(function (cb) {
      try { cb(_app, _db, _auth); } catch (e) { console.error('[NEXIA BOOT] callback error:', e); }
    });
    _queue = [];
  }

  // ── Banner de erro amigável (sem tela branca) ────────────────────────
  function _showError(msg) {
    if (typeof document === 'undefined') return;
    if (document.getElementById('nx-boot-error')) return;
    var inject = function () {
      if (!document.body) { setTimeout(inject, 50); return; }
      var el = document.createElement('div');
      el.id = 'nx-boot-error';
      el.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
        'background:#1a1a2e', 'color:#f1f5f9', 'font-size:14px',
        'padding:14px 20px', 'display:flex', 'align-items:center',
        'justify-content:space-between', 'border-bottom:2px solid #ff3d71',
        'font-family:sans-serif', 'box-shadow:0 2px 16px rgba(0,0,0,.6)'
      ].join(';');
      var safeMsg = (msg || 'Serviço temporariamente indisponível.').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      el.innerHTML = '<span>⚠️ ' + safeMsg + '</span>'
        + '<button onclick="location.reload()" style="background:#0057ff;color:#fff;border:none;'
        + 'border-radius:6px;padding:6px 16px;cursor:pointer;font-size:13px;margin-left:16px">'
        + 'Tentar novamente</button>';
      document.body.prepend(el);
    };
    inject();
  }

  // ── Inicialização do Firebase ────────────────────────────────────────
  function _initFirebase(cfg) {
    try {
      _app  = (firebase.apps && firebase.apps.length) ? firebase.app() : firebase.initializeApp(cfg);
      _db   = firebase.firestore();
      _auth = firebase.auth ? firebase.auth() : null;

      // Desabilita long-polling que causa travamentos de 30-60s
      try { _db.settings({ experimentalForceLongPolling: false, merge: true }); } catch (_) {}

      _ready = true;
      _log('Firebase OK · projeto: ' + (cfg.projectId || '?'), 'ok');
      _flush();
    } catch (e) {
      _failed = true;
      _log('Firebase initializeApp falhou: ' + e.message, 'err');
      _showError('Erro interno ao inicializar. Tente recarregar a página.');
      _flush(); // chama callbacks mesmo assim — cada um decide o que fazer
    }
  }

  // ── Busca config do servidor ─────────────────────────────────────────
  function _fetchConfig() {
    fetch('/api/firebase-config', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (cfg && cfg.apiKey) {
          _initFirebase(cfg);
        } else {
          _failed = true;
          _log('/api/firebase-config retornou config inválida', 'err');
          _showError('Serviço temporariamente indisponível. Tente novamente em alguns segundos.');
          _flush();
        }
      })
      .catch(function () {
        _failed = true;
        _log('/api/firebase-config falhou (sem rede?)', 'err');
        _showError('Não foi possível conectar ao servidor. Verifique sua conexão.');
        _flush();
      });
  }

  // ── Boot principal ───────────────────────────────────────────────────
  function _boot() {
    // Aguarda o SDK do Firebase estar disponível (carregado antes deste script)
    if (typeof firebase === 'undefined') {
      setTimeout(_boot, 50);
      return;
    }
    // Se já inicializado por outro script (ex: hot-reload), reusa
    if (firebase.apps && firebase.apps.length > 0) {
      try {
        _app  = firebase.app();
        _db   = firebase.firestore();
        _auth = firebase.auth ? firebase.auth() : null;
        _ready = true;
        _log('Firebase reutilizado (já inicializado)', 'info');
        _flush();
        return;
      } catch (_) {}
    }
    _fetchConfig();
  }

  // ── API pública ──────────────────────────────────────────────────────
  var NexiaBoot = {
    /**
     * Registra um callback que será chamado quando o Firebase estiver pronto.
     * Se já estiver pronto, chama imediatamente.
     *
     * @param {function} cb - function(app, db, auth) {}
     */
    ready: function (cb) {
      if (typeof cb !== 'function') return;
      if (_ready || _failed) {
        try { cb(_app, _db, _auth); } catch (e) { console.error('[NEXIA BOOT]', e); }
      } else {
        _queue.push(cb);
      }
    },

    /** Retorna true se o Firebase foi inicializado com sucesso */
    isReady:  function () { return _ready; },

    /** Retorna true se a inicialização falhou */
    hasFailed: function () { return _failed; },

    /** Acesso direto após boot (null antes de ready) */
    getApp:   function () { return _app; },
    getDb:    function () { return _db; },
    getAuth:  function () { return _auth; }
  };

  window.NexiaBoot = NexiaBoot;

  // Inicia automaticamente
  _boot();

})();
