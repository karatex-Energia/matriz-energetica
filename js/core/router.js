/**
 * js/core/router.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Router de vistas — Colortex SA · Matriz Energética
 *
 * Maneja la navegación entre vistas y el despacho de renders.
 * Cada vista es un módulo independiente (Views.*).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const Router = (() => {

  /**
   * Navega a una vista, actualiza el estado y despacha el render.
   * @param {string} vista - ID de vista (dashboard, consulta, form-prod, etc.)
   */
  function navigate(vista) {
    AppState.setVista(vista);

    // Actualizar estado activo en nav
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.v === vista);
    });

    // Ocultar todas las vistas y mostrar la solicitada
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    const el = document.getElementById('view-' + vista);
    if (el) el.classList.add('active');

    // Despachar render de la vista
    renderView(vista);
  }

  /**
   * Despacha el render al módulo de vista correspondiente.
   * Cada módulo de Views expone una función render().
   */
  function renderView(vista) {
    AppState.destroyAllCharts();  // Destruir charts anteriores antes de re-render

    switch (vista) {
      case 'dashboard':      Views.Dashboard.render();     break;
      case 'consulta':       Views.Consulta.render();      break;
      case 'form-prod':      Views.FormProd.render();      break;
      case 'form-pcp':       Views.FormPcp.render();       break;
      case 'form-ofitec':    Views.FormOfiTec.render();    break;
      case 'admin':          Views.Admin.render();         break;
      case 'ee-dashboard':   Views.EE.Dashboard.render();  break;
      case 'ee-form':        Views.EE.Form.render();       break;
      case 'gvp':            Views.GasVsProd.render();     break;
      case 'form-prod-ind':  Views.FormProdInd.render();   break;
      case 'ee-vs-prod':              Views.EEVsProd.render();             break;
      case 'dashboard-ejecutivo':     Views.DashboardEjecutivo.render();   break;
      case 'alertas':                 Views.Alertas.render();              break;
      case 'resumen-turno':           Views.ResumenTurno.render();         break;
      default:
        console.warn('[Router] Vista no reconocida:', vista);
    }
  }

  return { navigate, renderView };

})();
