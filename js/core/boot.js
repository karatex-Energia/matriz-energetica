/**
 * js/core/boot.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Arranque de la aplicación — Colortex SA · Matriz Energética
 *
 * Secuencia de inicialización:
 *   1. Cargar datasets JSON (seed data)
 *   2. Inicializar AppState con datos
 *   3. Aplicar tema guardado
 *   4. Vincular listeners de auth
 *   5. Listo para recibir login
 *
 * Compatibilidad standalone: usa XMLHttpRequest con fallback a datos inline
 * si el sistema de archivos no permite fetch (file:// protocol).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

(function boot() {

  /**
   * Carga un archivo JSON con soporte para file:// y http://.
   * @param {string} url
   * @returns {Promise<any>}
   */
  function loadJSON(url) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'json';
      xhr.onload  = () => xhr.status === 200 || xhr.status === 0
        ? resolve(xhr.response)
        : reject(new Error(`HTTP ${xhr.status}: ${url}`));
      xhr.onerror = () => reject(new Error(`Error de red: ${url}`));
      xhr.send();
    });
  }

  /**
   * Inicializa la aplicación con los datos cargados.
   */
  function initApp(seedData) {
    // 0. Limpiar localStorage si tiene formato incompatible con versión actual
    try {
      const raw = localStorage.getItem('CX_ME_STATE');
      if (raw) {
        const saved = JSON.parse(raw);
        // Si el estado guardado tiene planHistory fuera de db, es formato viejo — limpiar
        if (saved.planHistory !== undefined && (!saved.db || saved.db.planHistory === undefined)) {
          console.warn('[Boot] Estado incompatible detectado — limpiando localStorage');
          localStorage.removeItem('CX_ME_STATE');
        }
        // Si db no tiene equipos, también limpiar
        if (saved.db && saved.db.equipos === undefined) {
          console.warn('[Boot] Estado sin equipos detectado — limpiando localStorage');
          localStorage.removeItem('CX_ME_STATE');
        }
      }
    } catch(e) {
      localStorage.removeItem('CX_ME_STATE');
    }

    // 1. Inicializar estado con seed data
    AppState.init(seedData);

    // 2. Restaurar parámetros editados por el usuario (si existen)
    try {
      const savedParams = localStorage.getItem('CX_ME_PARAMS');
      if (savedParams) {
        AppState.updateParams(JSON.parse(savedParams));
      }
    } catch (e) {}

    // 3. Aplicar tema guardado
    UI.applyTheme();

    // 4. Inicializar listeners de autenticación
    Auth.init();

    console.log('[Boot] Sistema listo —', CONFIG.sistema.nombre, CONFIG.sistema.version);
  }

  /**
   * Arranca la carga de datos al cargar el DOM.
   * Modo SharePoint: carga desde SP en lugar de JSON estáticos.
   */
  // ── Splash screen helpers ─────────────────────────────────────────────────
  function splashMsg(msg, pct) {
    const el = document.getElementById('splash-msg');
    const pr = document.getElementById('splash-progress');
    if (el) el.textContent = msg;
    if (pr) pr.style.width = pct + '%';
  }

  function splashHide() {
    const sp = document.getElementById('splash-screen');
    if (!sp) return;
    sp.classList.add('fade-out');
    setTimeout(() => { sp.style.display = 'none'; }, 450);
  }

  function showOfflineBanner() {
    const b = document.getElementById('offline-banner');
    if (b) b.style.display = 'block';
    const retry = document.getElementById('offline-retry');
    if (retry) retry.addEventListener('click', () => location.reload());
  }

  document.addEventListener('DOMContentLoaded', async () => {

    splashMsg('Cargando configuración...', 15);

    // Solo cargar equipos y config EE desde JSON estáticos (no cambian)
    let equipos    = [];
    let ee_config  = {};
    let ee_compresores_cfg = { equipos: [], lecturas: [] };
    let ee_agua_cfg        = { pozos: [], distribucion: {}, lecturas: [] };

    try {
      equipos           = await loadJSON('data/db.equipos.json');
      ee_config         = await loadJSON('data/db.ee_config.json').catch(() => ({}));
      const _eeComp     = await loadJSON('data/db.ee_compresores.json').catch(() => ({ equipos: [], lecturas: [] }));
      const _eeAgua     = await loadJSON('data/db.ee_agua.json').catch(()  => ({ pozos: [], distribucion: {}, lecturas: [] }));
      ee_compresores_cfg.equipos          = _eeComp.equipos || [];
      ee_compresores_cfg.lecturas         = [];
      ee_agua_cfg.pozos                   = _eeAgua.pozos        || [];
      ee_agua_cfg.distribucion            = _eeAgua.distribucion || {};
    } catch(e) {
      console.warn('[Boot] Error cargando config estática:', e.message);
    }

    // Inicializar con seed vacío — SP llenará los datos
    initApp({
      prod: [], dist: [], lect: [],
      equipos,
      ee_trafos:      [],
      ee_compresores: ee_compresores_cfg,
      ee_agua:        ee_agua_cfg,
      ee_config,
    });

    // Cargar datos desde SharePoint (después de que Auth esté listo)
    Auth._onLoginSuccess = async () => {
      splashMsg('Conectando a SharePoint...', 60);
      const ok = await SPRepository.loadAll();
      splashMsg('Iniciando vistas...', 85);
      if (!ok) showOfflineBanner();
      splashMsg('Listo', 100);
      setTimeout(() => splashHide(), 300);
      Router.navigate('dashboard');
      UI.updateTopbar();
      // Mostrar estado en sidebar después del login
      setTimeout(() => {
        if (typeof _updateSBStatus === 'function') _updateSBStatus();
      }, 500);
    };

    splashMsg('Sistema listo', 100);
    setTimeout(() => splashHide(), 300);

    // ── Pestañas de energía (Gas / Eléctrica)
      document.querySelectorAll('.etab').forEach(function(btn) {
        btn.addEventListener('click', function() {
          console.log('[ETAB] click en:', btn.dataset.etab, '| disabled:', btn.disabled);
          document.querySelectorAll('.etab').forEach(function(b){ b.classList.remove('active'); });
          btn.classList.add('active');
          var tab = btn.dataset.etab;
          var container = document.getElementById('view-dashboard');
          console.log('[ETAB] container encontrado:', !!container, '| display:', container ? container.style.display : 'N/A');
          console.log('[ETAB] views activas:', document.querySelectorAll('.view.active').length);

          var _segSticky = document.getElementById('seg-sticky');

          if (tab === 'gas') {
            // Gas natural — mostrar segmentador y renderizar dashboard
            if (_segSticky) _segSticky.style.display = '';
            if (typeof Router !== 'undefined') Router.navigate('dashboard');
          } else {
            // Módulos en construcción — ocultar segmentador y mostrar banner
            if (_segSticky) _segSticky.style.display = 'none';
            var _msgs = {
              elec:  ['ENERGÍA ELÉCTRICA',  'Medidores, demanda máxima, factor de potencia, costos tarifarios eléctricos y análisis integrado GN + EE.'],
              aire:  ['AIRE COMPRIMIDO',     'Monitoreo de compresores, consumo específico por equipo, presión de red y costos operativos.'],
              vapor: ['VAPOR',               'Balance de generación, distribución y consumo de vapor por proceso productivo.'],
              solar: ['ENERGÍA SOLAR',       'Generación fotovoltaica, inyección a red y análisis de autosuficiencia energética.'],
            };
            var bm = _msgs[tab] || [tab.toUpperCase(), 'Módulo en desarrollo.'];
            if (container) {
              // Destruir instancias ECharts previas para evitar conflictos
              if (typeof GaugeRenderer !== 'undefined' && GaugeRenderer.destroyAll) GaugeRenderer.destroyAll();
              if (typeof AppState !== 'undefined' && AppState.destroyAllCharts) AppState.destroyAllCharts();
              document.querySelectorAll('.view').forEach(function(el){ el.classList.remove('active'); });
              container.classList.add('active');
              container.innerHTML =
                '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:380px;gap:16px;padding:40px">' +
                  '<div style="font-size:40px;opacity:.25">🔧</div>' +
                  '<div style="font-family:Calibri,var(--fontc);font-size:20px;font-weight:700;color:var(--text);letter-spacing:.5px">' + bm[0] + '</div>' +
                  '<div style="background:rgba(234,179,8,.07);border:1px solid rgba(234,179,8,.22);border-radius:8px;padding:14px 28px;max-width:520px;text-align:center">' +
                    '<div style="font-family:Calibri,var(--fontc);font-size:12px;font-weight:700;color:var(--yellow);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">⚠ Módulo en construcción</div>' +
                    '<div style="font-family:Calibri,var(--fontc);font-size:11px;color:var(--text3);line-height:1.6">' + bm[1] + '</div>' +
                  '</div>' +
                  '<div style="font-family:Calibri,var(--fontc);font-size:10px;color:var(--text3)">Integración en progreso · Colortex SA · Gestión Energética Integrada</div>' +
                '</div>';
            }
          }
        });
      });

      // ── Sincronización multi-usuario
      if (typeof SyncEngine !== 'undefined') SyncEngine.start();

      // ── Indicador de estado SharePoint
      function updateSPStatus() {
        const el = document.getElementById('tb-sp-status');
        if (!el) return;
        if (typeof SPRepository === 'undefined') {
          el.className = 'tb-sp-offline'; el.title = 'SharePoint no disponible'; return;
        }
        if (SPRepository.isOnline()) {
          el.className = 'tb-sp-online';  el.title = 'SharePoint conectado';
        } else {
          el.className = 'tb-sp-offline'; el.title = 'Sin conexión a SharePoint';
        }
      }
      updateSPStatus();
      // Verificar cada 2 minutos
      setInterval(updateSPStatus, 120000);

      // ── Botones EE del topbar
      const _btnEeDash = document.getElementById('tb-btn-ee-dash');
      const _btnEeForm = document.getElementById('tb-btn-ee-form');
      if (_btnEeDash) _btnEeDash.addEventListener('click', () => {
        document.querySelectorAll('.tb-ee-btn').forEach(b => b.classList.remove('active'));
        _btnEeDash.classList.add('active');
        Router.navigate('ee-dashboard');
      });
      if (_btnEeForm) _btnEeForm.addEventListener('click', () => {
        document.querySelectorAll('.tb-ee-btn').forEach(b => b.classList.remove('active'));
        _btnEeForm.classList.add('active');
        Router.navigate('ee-form');
      });

      const _btnGvp = document.getElementById('tb-btn-gvp');
      if (_btnGvp) _btnGvp.addEventListener('click', () => {
        document.querySelectorAll('.tb-ee-btn').forEach(b => b.classList.remove('active'));
        _btnGvp.classList.add('active');
        Router.navigate('gvp');
      });

      // ── Iniciar cola offline y auto-sync
      if (typeof OfflineQueue !== 'undefined') {
        OfflineQueue.startAutoSync();
        OfflineQueue.onStatusChange(n => _updateSBStatus());
      }

      // ── Actualizar estado del sidebar
      function _updateSBStatus() {
        const sbStatus = document.getElementById('sb-status');
        if (sbStatus) sbStatus.style.display = 'block';

        // SP dot
        const spDot = document.getElementById('sb-sp-dot');
        if (spDot) {
          const online = typeof SPRepository !== 'undefined' && SPRepository.isOnline();
          spDot.style.color = online ? '#22C55E' : '#EF4444';
          spDot.textContent = online ? '⬤ Online' : '⬤ Offline';
        }

        // Queue count
        const qCount = document.getElementById('sb-queue-count');
        const n = typeof OfflineQueue !== 'undefined' ? OfflineQueue.count() : 0;
        if (qCount) {
          qCount.textContent = n;
          qCount.style.color = n > 0 ? 'var(--orange)' : 'var(--text3)';
        }

        // Sync button
        const syncWrap = document.getElementById('sb-sync-wrap');
        if (syncWrap) syncWrap.style.display = n > 0 ? 'block' : 'none';

        // Último registro GN
        const lastProd = document.getElementById('sb-last-prod');
        if (lastProd) {
          const prods = AppState.db.prod || [];
          const ult = prods.reduce((a, r) => (!a || r.f > a) ? r.f : a, null);
          lastProd.textContent = ult ? ult.slice(5).split('-').reverse().join('/') : '—';
        }

        // Último registro EE
        const lastEE = document.getElementById('sb-last-ee');
        if (lastEE) {
          const trafos = AppState.db.ee_trafos || [];
          const ult = trafos.reduce((a, r) => (!a || r.mes > a) ? r.mes : a, null);
          lastEE.textContent = ult || '—';
        }
      }

      // Sync manual desde sidebar
      document.getElementById('sb-sync-now')?.addEventListener('click', async () => {
        if (typeof OfflineQueue !== 'undefined') {
          await OfflineQueue.sync();
          _updateSBStatus();
        }
      });

      // Actualizar status cada 60 segundos
      setInterval(_updateSBStatus, 60000);

      // ── Atajos de teclado globales
      document.addEventListener('keydown', e => {
        // Escape → limpiar foco / cerrar modales
        if (e.key === 'Escape') {
          document.activeElement?.blur();
        }

        // Alt + flechas → navegar entre fechas en dashboards
        if (e.altKey && e.key === 'ArrowLeft') {
          const prev = document.getElementById('gvp-prev') ||
                       document.getElementById('ee-prev')  ||
                       document.getElementById('dej-prev');
          prev?.click();
        }
        if (e.altKey && e.key === 'ArrowRight') {
          const next = document.getElementById('gvp-next') ||
                       document.getElementById('ee-next')  ||
                       document.getElementById('dej-next');
          next?.click();
        }

        // Enter en campo de contraseña → login
        if (e.key === 'Enter' && document.getElementById('l-pass') === document.activeElement) {
          document.querySelector('.btn-login')?.click();
        }

        // Ctrl+S → guardar formulario activo
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          const saveBtn =
            document.getElementById('pi-save')     ||
            document.getElementById('ee-trafos-save') ||
            document.getElementById('ee-comp-save')   ||
            document.getElementById('ap-save');
          if (saveBtn && saveBtn.offsetParent !== null) {
            saveBtn.click();
            saveBtn.style.transform = 'scale(.97)';
            setTimeout(() => saveBtn.style.transform = '', 150);
          }
        }

        // Alt+D → ir a dashboard
        if (e.altKey && e.key === 'd') {
          e.preventDefault();
          if (typeof Router !== 'undefined') Router.navigate('dashboard');
        }
      });

      // ── Sidebar toggle
      const _sb  = document.querySelector('.sidebar');
      const _btn = document.getElementById('btn-sb-toggle');
      if (_sb && _btn) {
        if (localStorage.getItem('CX_SB_COLLAPSED') === '1') {
          _sb.classList.add('collapsed');
          _btn.textContent = '⇒';
        }
        _btn.addEventListener('click', () => {
          _sb.classList.toggle('collapsed');
          const col = _sb.classList.contains('collapsed');
          _btn.textContent = col ? '⇒' : '⇐';
          localStorage.setItem('CX_SB_COLLAPSED', col ? '1' : '0');
        });
      }

  });

})();
