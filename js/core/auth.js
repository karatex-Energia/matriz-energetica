/**
 * js/core/auth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Autenticación y Navegación — Colortex SA · Matriz Energética
 *
 * Maneja: login, logout, construcción del menú de navegación,
 * cambio de vistas y el ciclo de render de vistas.
 *
 * Sin onclick inline. Toda interacción vía addEventListener.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const Auth = (() => {

  // ── PERFIL SELECCIONADO EN LOGIN ────────────────────────────────────────────
  let _selectedProfile = 'produccion';

  // ── LOGIN ──────────────────────────────────────────────────────────────────

  function doLogin() {
    const selEl  = document.getElementById('l-sel');
    const passEl = document.getElementById('l-pass');
    const errEl  = document.getElementById('l-err');

    if (selEl && selEl.value) _selectedProfile = selEl.value;

    const pass = passEl ? passEl.value : '';
    const user = CONFIG.usuarios[_selectedProfile];

    if (!_selectedProfile || !user) {
      if (errEl) errEl.textContent = 'Seleccione un perfil';
      return;
    }
    if (pass !== user.pass) {
      if (errEl) errEl.textContent = 'Contraseña incorrecta';
      return;
    }

    // Login exitoso
    AppState.login(user);
    if (errEl) errEl.textContent = '';

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('sb-role').textContent = user.label;

    buildNav();
    UI.updateTopbar();

    // Cargar datos desde SharePoint
    if (typeof SPRepository !== 'undefined') {
      UI.notify('Cargando datos desde SharePoint...', '', 3000);
      SPRepository.loadAll().then(() => {
        Router.navigate('dashboard');
      });
    } else {
      Router.navigate('dashboard');
    }
  }

  function doLogout() {
    AppState.logout();
    AppState.destroyAllCharts();

    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';

    const passEl = document.getElementById('l-pass');
    const selEl  = document.getElementById('l-sel');
    if (passEl) passEl.value = '';
    if (selEl)  selEl.value  = '';
  }

  // ── SELECCIÓN DE PERFIL EN PANTALLA LOGIN ───────────────────────────────────

  function selectProfile(profileKey, cardEl) {
    _selectedProfile = profileKey;
    document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('sel'));
    cardEl.classList.add('sel');
    const sel = document.getElementById('l-sel');
    if (sel) sel.value = profileKey;
  }

  // ── CONSTRUCCIÓN DEL MENÚ ───────────────────────────────────────────────────

  function buildNav() {
    const cu    = AppState.currentUser;
    if (!cu) return;
    const items = CONFIG.nav[cu.role] || [];
    const menu  = document.getElementById('nav-menu');
    if (!menu) return;

    let html = '<div class="nav-sec">NAVEGACIÓN</div>';
    items.forEach(it => {
      if (it.sep) html += '<div class="nav-sep"><div class="nav-sep-lbl">ADMINISTRACIÓN</div></div>';
      html += `<div class="nav-item" data-v="${it.v}"><span class="nav-icon">${it.ic}</span><span>${it.lb}</span></div>`;
    });
    menu.innerHTML = html;

    // Bind de clicks SIN onclick inline
    menu.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', () => Router.navigate(el.dataset.v));
    });
  }

  // ── INICIALIZACIÓN DE LISTENERS ─────────────────────────────────────────────

  function init() {
    // Botón login
    const btnLogin = document.querySelector('.btn-login');
    if (btnLogin) btnLogin.addEventListener('click', doLogin);

    // Enter en campo contraseña
    const passEl = document.getElementById('l-pass');
    if (passEl) passEl.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

    // Botón logout
    const btnLogout = document.querySelector('.btn-logout');
    if (btnLogout) btnLogout.addEventListener('click', doLogout);

    // Selector de perfil en login
    const selEl = document.getElementById('l-sel');
    if (selEl) selEl.addEventListener('change', () => { _selectedProfile = selEl.value; });

    // Tarjetas de perfil
    document.querySelectorAll('.profile-card').forEach(card => {
      card.addEventListener('click', () => {
        selectProfile(card.dataset.profile, card);
        // Sincronizar label panel derecho
        const nombres = {
          produccion:'Producción', pcp:'Oficina PCP', ofitec:'Oficina Técnica',
          jefe:'Responsable de Energía', gerencia:'Gerencia'
        };
        const lbl = document.getElementById('lr-perfil-nombre');
        if (lbl) lbl.textContent = nombres[card.dataset.profile] || card.dataset.profile;
        document.getElementById('l-pass')?.focus();
      });
    });

    // Reloj en footer del login
    function _updateClock() {
      const el = document.getElementById('ll-fecha-hora');
      if (!el) return;
      const now = new Date();
      el.textContent = now.toLocaleDateString('es-AR',{weekday:'short',day:'2-digit',month:'short'})
        + ' ' + now.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
    }
    _updateClock();
    setInterval(_updateClock, 1000);

    // Verificar conexión SP en pantalla de login
    (async () => {
      const dot = document.getElementById('ll-sp-dot');
      const txt = document.getElementById('ll-sp-txt');
      if (!dot || !txt) return;
      try {
        const r = await fetch(
          'https://karatex.sharepoint.com/sites/MatrizEnergeticaIntegrada/_api/contextinfo',
          { method:'POST', headers:{ Accept:'application/json;odata=verbose' }, credentials:'include' }
        );
        if (r.ok) {
          dot.style.color = '#22C55E'; txt.textContent = 'SharePoint conectado ✓';
        } else {
          dot.style.color = '#EF4444'; txt.textContent = 'Sin sesión SharePoint — abrí SP primero';
        }
      } catch {
        dot.style.color = '#EAB308'; txt.textContent = 'Red no disponible';
      }
    })();

    // Botón de tema
    const btnTheme = document.querySelector('.btn-theme');
    if (btnTheme) btnTheme.addEventListener('click', UI.toggleTheme);
  }

  // ── API PÚBLICA ──────────────────────────────────────────────────────────────
  return { init, doLogin, doLogout, selectProfile, buildNav };

})();
