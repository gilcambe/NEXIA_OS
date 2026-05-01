/**
 * NEXIA OS — Global i18n Engine v1.0
 * Reage ao evento nx:langchange do nexia-theme.js
 * Suporta data-i18n="key" em qualquer elemento
 * Funciona em todas as páginas nexia/
 */
(function () {
  'use strict';

  const I18N = {
    pt: {
      // Navegação / topbar
      logout: 'Sair', settings: 'Configurações', search: 'Buscar...',
      loading: 'Carregando...', save: 'Salvar', cancel: 'Cancelar',
      back: 'Voltar', confirm: 'Confirmar', delete: 'Excluir', edit: 'Editar',
      // Dashboard / my-panel
      goodMorning: 'Bom dia', goodAfternoon: 'Boa tarde', goodEvening: 'Boa noite',
      plan: 'Plano', upgrade: 'Fazer Upgrade', modules: 'Módulos',
      agents: 'Agentes', automations: 'Automações', apiCalls: 'Chamadas API',
      uptime: 'Uptime', usage: 'Uso', limit: 'Limite', unlimited: 'Ilimitado',
      recentActivity: 'Atividade Recente', noActivity: 'Nenhuma atividade recente',
      // Cortex
      newChat: 'Nova conversa', send: 'Enviar', thinking: 'Pensando...',
      typeMessage: 'Digite sua mensagem...', clearHistory: 'Limpar histórico',
      copyCode: 'Copiar código', copied: 'Copiado!',
      // Sentinel
      health: 'Saúde do Sistema', healthy: 'Saudável', degraded: 'Degradado',
      fullScan: 'Varredura Completa', autoHeal: 'Auto-Reparação', reload: 'Recarregar',
      routes: 'Rotas', functions: 'Funções', issues: 'Problemas', fixes: 'Correções',
      lastScan: 'Último scan', noIssues: 'Nenhum problema encontrado',
      // QA
      runTests: 'Rodar Testes', exportJson: 'Exportar JSON', aiAnalysis: 'Análise IA',
      testsOk: 'Testes OK', failed: 'Falhos', warnings: 'Avisos', totalChecks: 'Total de Checks',
      // Comum
      online: 'Online', offline: 'Offline', active: 'Ativo', inactive: 'Inativo',
      enable: 'Ativar', disable: 'Desativar', refresh: 'Atualizar',
      error: 'Erro', success: 'Sucesso', warning: 'Aviso', info: 'Informação',
      // Tenant
      newTenant: 'Novo Tenant', tenantControl: 'Controle de Tenants',
      billing: 'Cobrança', auditLog: 'Audit Log', osint: 'OSINT Hub',
      // Planos
      free: 'Gratuito', starter: 'Iniciante', pro: 'Pro', enterprise: 'Enterprise',
    },
    en: {
      logout: 'Sign Out', settings: 'Settings', search: 'Search...',
      loading: 'Loading...', save: 'Save', cancel: 'Cancel',
      back: 'Back', confirm: 'Confirm', delete: 'Delete', edit: 'Edit',
      goodMorning: 'Good morning', goodAfternoon: 'Good afternoon', goodEvening: 'Good evening',
      plan: 'Plan', upgrade: 'Upgrade', modules: 'Modules',
      agents: 'Agents', automations: 'Automations', apiCalls: 'API Calls',
      uptime: 'Uptime', usage: 'Usage', limit: 'Limit', unlimited: 'Unlimited',
      recentActivity: 'Recent Activity', noActivity: 'No recent activity',
      newChat: 'New chat', send: 'Send', thinking: 'Thinking...',
      typeMessage: 'Type your message...', clearHistory: 'Clear history',
      copyCode: 'Copy code', copied: 'Copied!',
      health: 'System Health', healthy: 'Healthy', degraded: 'Degraded',
      fullScan: 'Full Scan', autoHeal: 'Auto-Heal', reload: 'Reload',
      routes: 'Routes', functions: 'Functions', issues: 'Issues', fixes: 'Fixes',
      lastScan: 'Last scan', noIssues: 'No issues found',
      runTests: 'Run Tests', exportJson: 'Export JSON', aiAnalysis: 'AI Analysis',
      testsOk: 'Tests OK', failed: 'Failed', warnings: 'Warnings', totalChecks: 'Total Checks',
      online: 'Online', offline: 'Offline', active: 'Active', inactive: 'Inactive',
      enable: 'Enable', disable: 'Disable', refresh: 'Refresh',
      error: 'Error', success: 'Success', warning: 'Warning', info: 'Info',
      newTenant: 'New Tenant', tenantControl: 'Tenant Control',
      billing: 'Billing', auditLog: 'Audit Log', osint: 'OSINT Hub',
      free: 'Free', starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise',
    },
    es: {
      logout: 'Cerrar sesión', settings: 'Configuración', search: 'Buscar...',
      loading: 'Cargando...', save: 'Guardar', cancel: 'Cancelar',
      back: 'Volver', confirm: 'Confirmar', delete: 'Eliminar', edit: 'Editar',
      goodMorning: 'Buenos días', goodAfternoon: 'Buenas tardes', goodEvening: 'Buenas noches',
      plan: 'Plan', upgrade: 'Mejorar plan', modules: 'Módulos',
      agents: 'Agentes', automations: 'Automatizaciones', apiCalls: 'Llamadas API',
      uptime: 'Disponibilidad', usage: 'Uso', limit: 'Límite', unlimited: 'Ilimitado',
      recentActivity: 'Actividad Reciente', noActivity: 'Sin actividad reciente',
      newChat: 'Nueva conversación', send: 'Enviar', thinking: 'Pensando...',
      typeMessage: 'Escribe tu mensaje...', clearHistory: 'Limpiar historial',
      copyCode: 'Copiar código', copied: '¡Copiado!',
      health: 'Salud del Sistema', healthy: 'Saludable', degraded: 'Degradado',
      fullScan: 'Análisis Completo', autoHeal: 'Auto-Reparación', reload: 'Recargar',
      routes: 'Rutas', functions: 'Funciones', issues: 'Problemas', fixes: 'Correcciones',
      lastScan: 'Último análisis', noIssues: 'No se encontraron problemas',
      runTests: 'Ejecutar Pruebas', exportJson: 'Exportar JSON', aiAnalysis: 'Análisis IA',
      testsOk: 'Pruebas OK', failed: 'Fallidos', warnings: 'Advertencias', totalChecks: 'Total de Verificaciones',
      online: 'En línea', offline: 'Sin conexión', active: 'Activo', inactive: 'Inactivo',
      enable: 'Activar', disable: 'Desactivar', refresh: 'Actualizar',
      error: 'Error', success: 'Éxito', warning: 'Advertencia', info: 'Información',
      newTenant: 'Nuevo Tenant', tenantControl: 'Control de Tenants',
      billing: 'Facturación', auditLog: 'Registro de Auditoría', osint: 'Centro OSINT',
      free: 'Gratuito', starter: 'Inicial', pro: 'Pro', enterprise: 'Enterprise',
    }
  };

  function getLang() {
    return localStorage.getItem('nx_lang') || localStorage.getItem('nexia_lang') || 'pt';
  }

  function t(key, lang) {
    const l = lang || getLang();
    const dict = I18N[l] || I18N.pt;
    return dict[key] || I18N.pt[key] || key;
  }

  function applyTranslations(lang) {
    const l = lang || getLang();
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = t(key, l);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = val;
      } else if (el.tagName === 'BUTTON' || el.hasAttribute('data-i18n-html')) {
        el.innerHTML = val;
      } else {
        el.textContent = val;
      }
    });
    // Also update [data-i18n-title] for tooltips
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = t(el.getAttribute('data-i18n-title'), l);
    });
    // Update [data-i18n-placeholder]
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'), l);
    });
  }

  // React to nexia-theme.js lang change event
  window.addEventListener('nx:langchange', function (e) {
    applyTranslations(e.detail && e.detail.lang);
  });

  // Apply on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { applyTranslations(); });
  } else {
    applyTranslations();
  }

  // Public API
  window.NexiaI18n = { t, applyTranslations, getLang, I18N };

})();
