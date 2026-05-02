/**
 * NEXIA OS — Firebase Resilience Layer
 * Elimina erros de console do Firebase offline.
 * Adicionar em todas as telas: <script src="../core/firebase-resilience.js"></script>
 */
(function() {
  'use strict';

  // Suprimir erros não críticos do Firebase no console
  const originalConsoleError = console.error;
  console.error = function(...args) {
    const msg = args.join(' ');
    // Suprimir erros conhecidos e não críticos
    if (
      msg.includes('Could not reach Cloud Firestore backend') ||
      msg.includes('Connection failed') ||
      msg.includes('offline mode') ||
      msg.includes('FirebaseError: [code=unavailable]') ||
      msg.includes('WebChannelConnection') ||
      msg.includes('Transport errored')
    ) {
      // Log silencioso para debugging interno
      if (window._nexiaDebug) console.warn('[NEXIA/Firebase] Offline:', msg.slice(0, 100));
      return;
    }
    originalConsoleError.apply(console, args);
  };

  // Habilitar persistência offline do Firestore quando disponível
  // BUG-002 FIX: enablePersistence() foi deprecated no Firebase 9+.
  // Usamos enableMultiTabIndexedDbPersistence (compat SDK) com fallback silencioso.
  window.enableFirestorePersistence = function(db) {
    if (!db) return;
    // Compat SDK (firebase-firestore-compat.js)
    if (typeof db.enableMultiTabIndexedDbPersistence === 'function') {
      db.enableMultiTabIndexedDbPersistence()
        .then(() => { if (window._nexiaDebug) console.log('[NEXIA] Firestore multi-tab persistence enabled'); })
        .catch(err => {
          // failed-precondition: outra tab com persistence exclusiva aberta → ok
          // unimplemented: browser não suporta IndexedDB → ok
          if (window._nexiaDebug) console.warn('[NEXIA] Persistence fallback:', err.code);
        });
    } else if (typeof db.enablePersistence === 'function') {
      // Fallback legacy
      db.enablePersistence({ synchronizeTabs: true })
        .catch(() => {});
    }
    // Modular SDK (v9+): persistence é configurada via initializeFirestore() na inicialização
  };

  // Wrapper de onSnapshot com retry automático
  window.nexiaSnapshot = function(ref, callback, errorCallback) {
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 5000;

    function subscribe() {
      return ref.onSnapshot(callback, (err) => {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(subscribe, retryDelay * retryCount);
        } else if (errorCallback) {
          errorCallback(err);
        }
      });
    }
    return subscribe();
  };

  // Status de conectividade
  window.nexiaOnline = navigator.onLine;
  window.addEventListener('online', () => {
    window.nexiaOnline = true;
    document.dispatchEvent(new Event('nexia:online'));
  });
  window.addEventListener('offline', () => {
    window.nexiaOnline = false;
    document.dispatchEvent(new Event('nexia:offline'));
  });

})();
