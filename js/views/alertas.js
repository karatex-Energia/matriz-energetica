/**
 * js/views/alertas.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vista Alertas Configurables · Colortex SA · Matriz Energética
 *
 * Muestra todas las alertas activas con nivel, módulo, detalle y acción.
 * Permite configurar umbrales desde la UI.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

if (typeof Views === 'undefined') window.Views = {};

Views.Alertas = (() => {

  // ── PANEL DE ALERTAS ACTIVAS ──────────────────────────────────────────────────

  function buildAlertasPanel(alertas) {
    if (!alertas.length) return `
      <div style="
        background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);
        border-radius:10px;padding:20px 24px;text-align:center;color:#22C55E;
        font-family:var(--fontc);font-size:14px;font-weight:600;margin-bottom:14px
      ">
        ✅ Sin alertas activas — todos los indicadores dentro de parámetros
      </div>`;

    const cards = alertas.map(a => `
      <div style="
        background:var(--bg2);
        border:1.5px solid ${a.nivel.color};
        border-left:4px solid ${a.nivel.color};
        border-radius:9px;
        padding:12px 16px;
        margin-bottom:8px;
        display:grid;
        grid-template-columns:auto 1fr auto;
        gap:12px;
        align-items:start;
      ">
        <div style="font-size:20px;margin-top:2px">${a.nivel.icono}</div>
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
            <span style="
              font-family:var(--fontc);font-size:9px;font-weight:700;
              letter-spacing:1px;text-transform:uppercase;
              background:${a.nivel.color}22;color:${a.nivel.color};
              padding:2px 7px;border-radius:4px
            ">${a.nivel.label}</span>
            <span style="font-family:var(--fontc);font-size:10px;color:var(--text3)">${a.modulo}</span>
            ${a.fecha ? `<span style="font-family:var(--fontc);font-size:10px;color:var(--text3)">· ${a.fecha}</span>` : ''}
          </div>
          <div style="font-family:var(--fontc);font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">
            ${a.titulo}
          </div>
          <div style="font-size:11px;color:var(--text2);margin-bottom:6px">${a.detalle}</div>
          <div style="font-size:10px;color:var(--accent);font-family:var(--fontc)">
            💡 ${a.accion}
          </div>
        </div>
        <div style="font-size:10px;color:var(--text3);white-space:nowrap;font-family:monospace">
          ${a.id}
        </div>
      </div>`).join('');

    return cards;
  }

  // ── PANEL DE CONFIGURACIÓN ────────────────────────────────────────────────────

  function buildConfigPanel() {
    const a = (typeof CONFIG !== 'undefined' && CONFIG.alertas) ? CONFIG.alertas : {};

    return `
    <div class="panel-section" style="margin-top:14px">
      <div class="panel-section-title">⚙️ CONFIGURACIÓN DE UMBRALES DE ALERTA</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">

        <!-- Gas Natural -->
        <div style="background:var(--bg3);border-radius:8px;padding:12px 14px">
          <div style="font-family:var(--fontc);font-size:10px;font-weight:700;
               text-transform:uppercase;letter-spacing:.8px;color:#EAB308;margin-bottom:10px">
            🔥 Gas Natural
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label class="form-label">Días sin datos → alerta</label>
            <input type="number" id="al-gn-dias" class="form-input"
              value="${a.gn_dias_sin_datos ?? 1}" min="1" max="30" step="1">
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label class="form-label">CE máx. Tintorería (m³/m) — vacío = sin límite</label>
            <input type="number" id="al-gn-ce-tint" class="form-input"
              value="${a.gn_ce_tint_max ?? ''}" min="0" step="0.001" placeholder="sin límite">
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label class="form-label">CE máx. Estampado (m³/m)</label>
            <input type="number" id="al-gn-ce-est" class="form-input"
              value="${a.gn_ce_est_max ?? ''}" min="0" step="0.001" placeholder="sin límite">
          </div>
          <div class="form-group">
            <label class="form-label">CE máx. Encolado (m³/kg)</label>
            <input type="number" id="al-gn-ce-enc" class="form-input"
              value="${a.gn_ce_enc_max ?? ''}" min="0" step="0.001" placeholder="sin límite">
          </div>
        </div>

        <!-- Energía Eléctrica -->
        <div style="background:var(--bg3);border-radius:8px;padding:12px 14px">
          <div style="font-family:var(--fontc);font-size:10px;font-weight:700;
               text-transform:uppercase;letter-spacing:.8px;color:#2D7EF7;margin-bottom:10px">
            ⚡ Energía Eléctrica
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label class="form-label">Error SMEC máximo (%)</label>
            <input type="number" id="al-ee-smec" class="form-input"
              value="${a.ee_error_smec_max ?? 3.0}" min="0" max="20" step="0.5">
          </div>
          <div class="form-group">
            <label class="form-label">Meses sin datos → alerta</label>
            <input type="number" id="al-ee-meses" class="form-input"
              value="${a.ee_meses_sin_datos ?? 1}" min="1" max="12" step="1">
          </div>
        </div>

        <!-- Producción y Sistema -->
        <div style="background:var(--bg3);border-radius:8px;padding:12px 14px">
          <div style="font-family:var(--fontc);font-size:10px;font-weight:700;
               text-transform:uppercase;letter-spacing:.8px;color:#A855F7;margin-bottom:10px">
            🏭 Producción · 🖥️ Sistema
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label class="form-label">Días sin indicadores → alerta</label>
            <input type="number" id="al-prod-dias" class="form-input"
              value="${a.prod_dias_sin_datos ?? 2}" min="1" max="30" step="1">
          </div>
          <div class="form-group">
            <label class="form-label">Cola offline máx. sin alerta (registros)</label>
            <input type="number" id="al-queue-max" class="form-input"
              value="${a.queue_max ?? 10}" min="1" max="200" step="1">
          </div>
        </div>

      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="btn-secondary" id="al-reset">Restablecer defaults</button>
        <button class="btn-primary"   id="al-save">💾 Guardar umbrales</button>
      </div>
    </div>`;
  }

  // ── RESUMEN BADGE ─────────────────────────────────────────────────────────────

  /**
   * Genera un badge resumido para mostrar en topbar o sidebar.
   */
  function buildBadge() {
    const r = AlertEngine.resumen();
    if (r.total === 0) return '<span style="color:var(--green);font-size:11px">✅ Sin alertas</span>';

    const color = r.critico > 0 ? '#EF4444' : r.alto > 0 ? '#F97316' : '#EAB308';
    return `<span style="
      background:${color};color:#fff;
      border-radius:10px;padding:1px 8px;
      font-family:var(--fontc);font-size:10px;font-weight:700;
      cursor:pointer" id="badge-alertas"
    >${r.total} alerta${r.total>1?'s':''}</span>`;
  }

  // ── BIND ──────────────────────────────────────────────────────────────────────

  function bindConfig() {
    const num = (id, def = null) => {
      const v = parseFloat(document.getElementById(id)?.value);
      return isNaN(v) || document.getElementById(id)?.value === '' ? def : v;
    };

    document.getElementById('al-save')?.addEventListener('click', () => {
      if (!CONFIG.alertas) CONFIG.alertas = {};
      CONFIG.alertas.gn_dias_sin_datos   = num('al-gn-dias',   1);
      CONFIG.alertas.gn_ce_tint_max      = num('al-gn-ce-tint', null);
      CONFIG.alertas.gn_ce_est_max       = num('al-gn-ce-est',  null);
      CONFIG.alertas.gn_ce_enc_max       = num('al-gn-ce-enc',  null);
      CONFIG.alertas.ee_error_smec_max   = num('al-ee-smec',    3.0);
      CONFIG.alertas.ee_meses_sin_datos  = num('al-ee-meses',   1);
      CONFIG.alertas.prod_dias_sin_datos = num('al-prod-dias',  2);
      CONFIG.alertas.queue_max           = num('al-queue-max',  10);

      AppState.addAudit('CFG_ALERTAS', 'Umbrales de alerta actualizados');
      UI.notify('✓ Umbrales guardados — alertas recalculadas', '', 3500);
      render(); // Re-renderizar con nuevas alertas
    });

    document.getElementById('al-reset')?.addEventListener('click', () => {
      CONFIG.alertas = {};
      UI.notify('Umbrales restablecidos a valores por defecto', '', 3000);
      render();
    });

    // Navegar a módulo desde botón de acción en alerta
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof Router !== 'undefined') Router.navigate(btn.dataset.nav);
      });
    });
  }

  // ── RENDER ────────────────────────────────────────────────────────────────────

  function render() {
    const container = document.getElementById('view-alertas');
    if (!container) return;

    const r = AlertEngine.resumen();

    // Header con resumen
    const headerColor = r.critico > 0 ? '#EF4444' : r.alto > 0 ? '#F97316' : r.medio > 0 ? '#EAB308' : '#22C55E';
    const headerLabel = r.critico > 0 ? 'ALERTAS CRÍTICAS ACTIVAS'
      : r.alto > 0 ? 'ALERTAS IMPORTANTES ACTIVAS'
      : r.medio > 0 ? 'ALERTAS ACTIVAS' : 'SISTEMA OK';

    container.innerHTML = `
      <!-- Header resumen -->
      <div style="
        display:flex;align-items:center;gap:16px;
        margin-bottom:14px;flex-wrap:wrap
      ">
        <div>
          <div style="font-family:var(--fontc);font-size:11px;font-weight:700;
               letter-spacing:1px;text-transform:uppercase;color:${headerColor}">
            ${headerLabel}
          </div>
          <div style="font-family:var(--fontc);font-size:12px;color:var(--text2);margin-top:2px">
            ${r.total} alerta${r.total!==1?'s':''} activa${r.total!==1?'s':''}
            ${r.critico ? ` · ${r.critico} crítica${r.critico>1?'s':''}` : ''}
            ${r.alto    ? ` · ${r.alto} importante${r.alto>1?'s':''}` : ''}
            ${r.medio   ? ` · ${r.medio} media${r.medio>1?'s':''}` : ''}
          </div>
        </div>
        <span style="margin-left:auto;display:flex;gap:6px">
          <button class="seg-btn" id="al-refresh">&#8635; Recalcular</button>
        </span>
      </div>

      <!-- Alertas activas -->
      <div id="al-cards">
        ${buildAlertasPanel(r.alertas)}
      </div>

      <!-- Configuración de umbrales -->
      ${buildConfigPanel()}
    `;

    document.getElementById('al-refresh')?.addEventListener('click', render);
    bindConfig();
  }

  return { render, buildBadge };

})();
