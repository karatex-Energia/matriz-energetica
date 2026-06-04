/**
 * js/views/formProdInd.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Formulario de carga diaria de indicadores de producción · Colortex SA
 *
 * Permite ingresar por fecha:
 *   Gas Natural:  mTint (metros Tintorería), mEst (metros Estampado),
 *                 KgEnc (kg Encolado)
 *   EE:           PasTejPl (pasadas Tej. Planos), PasTejTs (pasadas Tej. Toallas),
 *                 KgHil (kg Hilandería), mDbl (metros doblados Terminado)
 *
 * Guarda en AppState.db.prodIndicadores y persiste en SharePoint.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

if (typeof Views === 'undefined') window.Views = {};

Views.FormProdInd = (() => {

  // ── HELPERS ─────────────────────────────────────────────────────────────────

  function _hoy() {
    return new Date().toISOString().slice(0, 10);
  }

  function _getRegistro(fecha) {
    return (AppState.db.prodIndicadores || []).find(r => r.f === fecha) || null;
  }

  function _ultimosDias(n = 10) {
    const registros = (AppState.db.prodIndicadores || [])
      .sort((a, b) => b.f.localeCompare(a.f))
      .slice(0, n);
    return registros;
  }

  // ── TABLA HISTORIAL ──────────────────────────────────────────────────────────

  function buildHistorial() {
    const regs = _ultimosDias(10);
    if (!regs.length) return `
      <div class="no-data-badge" style="margin:12px 0">
        ⚠ Sin registros de producción cargados aún
      </div>`;

    const filas = regs.map(r => `
      <tr class="hist-row" data-f="${r.f}" style="cursor:pointer">
        <td>${r.f}</td>
        <td style="text-align:right">${r.mTint    ? Fmt.num(r.mTint,    0) : '—'}</td>
        <td style="text-align:right">${r.mEst     ? Fmt.num(r.mEst,     0) : '—'}</td>
        <td style="text-align:right">${r.KgEnc    ? Fmt.num(r.KgEnc,    0) : '—'}</td>
        <td style="text-align:right">${r.PasTejPl ? Fmt.num(r.PasTejPl, 0) : '—'}</td>
        <td style="text-align:right">${r.PasTejTs ? Fmt.num(r.PasTejTs, 0) : '—'}</td>
        <td style="text-align:right">${r.KgHil    ? Fmt.num(r.KgHil,    0) : '—'}</td>
        <td style="text-align:right">${r.mDbl     ? Fmt.num(r.mDbl,     0) : '—'}</td>
        <td style="text-align:center">
          <span class="seg-btn" style="font-size:10px;padding:2px 8px" data-edit="${r.f}">✏ Editar</span>
        </td>
      </tr>`).join('');

    return `
    <div class="panel-section" style="margin-top:14px">
      <div class="panel-section-title">📋 ÚLTIMOS REGISTROS</div>
      <table class="data-table" style="width:100%">
        <thead>
          <tr>
            <th>Fecha</th>
            <th style="text-align:right">m Tint</th>
            <th style="text-align:right">m Est</th>
            <th style="text-align:right">Kg Enc</th>
            <th style="text-align:right">PAS tej pl</th>
            <th style="text-align:right">PAS tej ts</th>
            <th style="text-align:right">Kg Hil</th>
            <th style="text-align:right">m Dbl</th>
            <th style="text-align:center">Acción</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
  }

  // ── FORMULARIO ───────────────────────────────────────────────────────────────

  function buildForm(fecha = null) {
    const f   = fecha || _hoy();
    const rec = _getRegistro(f) || {};

    return `
    <div class="form-card" style="max-width:680px">
      <div class="form-card-title">
        🏭 CARGA DE INDICADORES DE PRODUCCIÓN
        ${rec.f ? `<span style="color:var(--accent);font-size:11px;margin-left:8px">— Editando registro existente</span>` : ''}
      </div>

      <div class="form-group" style="margin-bottom:16px;max-width:200px">
        <label class="form-label">FECHA</label>
        <input type="date" id="pi-fecha" class="form-input" value="${f}" max="${_hoy()}">
      </div>

      <!-- GAS NATURAL -->
      <div style="background:rgba(234,179,8,.06);border:1px solid rgba(234,179,8,.3);
                  border-radius:8px;padding:12px 14px;margin-bottom:12px">
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#EAB308;
                    text-transform:uppercase;margin-bottom:10px">
          🔥 GAS NATURAL — Producción por sector
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">

          <div class="form-group">
            <label class="form-label">
              TINTORERÍA
              <span style="font-weight:400;color:var(--text3)"> m producidos</span>
            </label>
            <input type="number" id="pi-mTint" class="form-input"
              step="1" min="0" placeholder="0"
              value="${rec.mTint || ''}">
            <div style="font-size:10px;color:var(--text3);margin-top:3px">metros tintados</div>
          </div>

          <div class="form-group">
            <label class="form-label">
              ESTAMPADO
              <span style="font-weight:400;color:var(--text3)"> m producidos</span>
            </label>
            <input type="number" id="pi-mEst" class="form-input"
              step="1" min="0" placeholder="0"
              value="${rec.mEst || ''}">
            <div style="font-size:10px;color:var(--text3);margin-top:3px">metros estampados</div>
          </div>

          <div class="form-group">
            <label class="form-label">
              ENCOLADO
              <span style="font-weight:400;color:var(--text3)"> kg producidos</span>
            </label>
            <input type="number" id="pi-KgEnc" class="form-input"
              step="0.1" min="0" placeholder="0"
              value="${rec.KgEnc || ''}">
            <div style="font-size:10px;color:var(--text3);margin-top:3px">kilogramos</div>
          </div>

        </div>
      </div>

      <!-- ENERGÍA ELÉCTRICA -->
      <div style="background:rgba(45,126,247,.06);border:1px solid rgba(45,126,247,.3);
                  border-radius:8px;padding:12px 14px;margin-bottom:14px">
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#2D7EF7;
                    text-transform:uppercase;margin-bottom:10px">
          ⚡ ENERGÍA ELÉCTRICA — Producción por sector
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">

          <div class="form-group">
            <label class="form-label">
              TEJ. PLANOS
              <span style="font-weight:400;color:var(--text3)"> pasadas tejidas</span>
            </label>
            <input type="number" id="pi-PasTejPl" class="form-input"
              step="1" min="0" placeholder="0"
              value="${rec.PasTejPl || ''}">
            <div style="font-size:10px;color:var(--text3);margin-top:3px">PAS tej pl</div>
          </div>

          <div class="form-group">
            <label class="form-label">
              TEJ. TOALLAS
              <span style="font-weight:400;color:var(--text3)"> pasadas tejidas</span>
            </label>
            <input type="number" id="pi-PasTejTs" class="form-input"
              step="1" min="0" placeholder="0"
              value="${rec.PasTejTs || ''}">
            <div style="font-size:10px;color:var(--text3);margin-top:3px">PAS tej ts</div>
          </div>

          <div class="form-group">
            <label class="form-label">
              HILANDERÍA
              <span style="font-weight:400;color:var(--text3)"> kg hilados</span>
            </label>
            <input type="number" id="pi-KgHil" class="form-input"
              step="0.1" min="0" placeholder="0"
              value="${rec.KgHil || ''}">
            <div style="font-size:10px;color:var(--text3);margin-top:3px">kilogramos</div>
          </div>

          <div class="form-group">
            <label class="form-label">
              TERMINADO
              <span style="font-weight:400;color:var(--text3)"> metros doblados</span>
            </label>
            <input type="number" id="pi-mDbl" class="form-input"
              step="1" min="0" placeholder="0"
              value="${rec.mDbl || ''}">
            <div style="font-size:10px;color:var(--text3);margin-top:3px">m dbl</div>
          </div>

        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;align-items:center">
        <span id="pi-msg" style="font-size:11px;color:var(--text3)"></span>
        <button class="btn-secondary" id="pi-clear">Limpiar</button>
        <button class="btn-primary"   id="pi-save">💾 Guardar</button>
      </div>
    </div>`;
  }

  // ── PANEL CONFIGURACIÓN GAS VS PROD ─────────────────────────────────────────

  function buildConfigPanel() {
    const c = CONFIG.gasVsProd || {};
    const ef  = ((c.eficiencia_caldera || 0.80) * 100).toFixed(0);
    const pvt = ((c.pct_vapor_tint     || 0.726) * 100).toFixed(1);
    const pve = ((c.pct_vapor_enc      || 0.274) * 100).toFixed(1);

    return `
    <div class="form-card" style="max-width:500px;margin-top:14px">
      <div class="form-card-title">⚙️ CONFIGURACIÓN — GAS VS PRODUCCIÓN</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:12px">
        Precio m³ y tipo de cambio se toman de la configuración de tarifas existente
        (gnARS = $${CONFIG.tarifas?.gnARS || '—'}/m³ · USD = $${CONFIG.tarifas?.usd || '—'}).
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">EFICIENCIA CALDERA (%)</label>
          <input type="number" id="cfg-ef" class="form-input"
            step="1" min="70" max="95" value="${ef}">
          <div style="font-size:10px;color:var(--text3);margin-top:3px">Rango típico: 75 — 85%</div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;justify-content:flex-end;padding-bottom:4px">
          <div style="font-size:10px;color:var(--text3)">Distribución vapor:</div>
          <div style="font-size:11px">
            Tintorería: <b>${pvt}%</b> · Encolado: <b>${pve}%</b>
          </div>
          <div style="font-size:10px;color:var(--text3)">
            Basado en CME equipos indirectos (418/576 m³/h)
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">VAPOR → TINTORERÍA (%)</label>
          <input type="number" id="cfg-pvt" class="form-input"
            step="0.1" min="0" max="100" value="${pvt}">
        </div>

        <div class="form-group">
          <label class="form-label">VAPOR → ENCOLADO (%)</label>
          <input type="number" id="cfg-pve" class="form-input"
            step="0.1" min="0" max="100" value="${pve}" readonly
            style="background:var(--bg3);color:var(--text3)">
          <div style="font-size:10px;color:var(--text3);margin-top:3px">Calculado automáticamente</div>
        </div>
      </div>

      <div id="cfg-sum-check" style="font-size:11px;margin:6px 0;color:var(--text3)"></div>

      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-primary" id="cfg-save">💾 Guardar configuración</button>
      </div>
    </div>`;
  }

  // ── BIND EVENTOS ─────────────────────────────────────────────────────────────

  function bindForm() {
    // Auto-completar al cambiar fecha
    document.getElementById('pi-fecha')?.addEventListener('change', e => {
      const rec = _getRegistro(e.target.value);
      if (rec) {
        document.getElementById('pi-mTint').value    = rec.mTint    || '';
        document.getElementById('pi-mEst').value     = rec.mEst     || '';
        document.getElementById('pi-KgEnc').value    = rec.KgEnc    || '';
        document.getElementById('pi-PasTejPl').value = rec.PasTejPl || '';
        document.getElementById('pi-PasTejTs').value = rec.PasTejTs || '';
        document.getElementById('pi-KgHil').value    = rec.KgHil    || '';
        document.getElementById('pi-mDbl').value     = rec.mDbl     || '';
        document.getElementById('pi-msg').textContent = '⚠ Editando registro existente';
      } else {
        document.getElementById('pi-msg').textContent = '';
      }
    });

    // Guardar
    document.getElementById('pi-save')?.addEventListener('click', () => {
      // Validar con Validator centralizado
      if (typeof Validator !== 'undefined') {
        if (!Validator.fecha('pi-fecha', 'la fecha')) return;
        if (!Validator.formProdInd()) return;
      } else {
        if (!document.getElementById('pi-fecha')?.value) { UI.notify('Seleccioná una fecha', 'err'); return; }
      }
      const fecha = document.getElementById('pi-fecha')?.value;

      const rec = {
        f:        fecha,
        mTint:    parseFloat(document.getElementById('pi-mTint')?.value)    || 0,
        mEst:     parseFloat(document.getElementById('pi-mEst')?.value)     || 0,
        KgEnc:    parseFloat(document.getElementById('pi-KgEnc')?.value)    || 0,
        PasTejPl: parseFloat(document.getElementById('pi-PasTejPl')?.value) || 0,
        PasTejTs: parseFloat(document.getElementById('pi-PasTejTs')?.value) || 0,
        KgHil:    parseFloat(document.getElementById('pi-KgHil')?.value)    || 0,
        mDbl:     parseFloat(document.getElementById('pi-mDbl')?.value)     || 0,
        _u:       AppState.currentUser?.label || '',
      };

      const total = rec.mTint + rec.mEst + rec.KgEnc + rec.PasTejPl + rec.PasTejTs + rec.KgHil + rec.mDbl;
      if (total === 0) { UI.notify('Ingresá al menos un valor de producción', 'err'); return; }

      // Upsert en AppState
      if (!AppState.db.prodIndicadores) AppState.db.prodIndicadores = [];
      const idx = AppState.db.prodIndicadores.findIndex(r => r.f === fecha);
      if (idx >= 0) AppState.db.prodIndicadores[idx] = { ...AppState.db.prodIndicadores[idx], ...rec };
      else AppState.db.prodIndicadores.push(rec);

      // Persistir en SharePoint
      if (typeof SPRepository !== 'undefined' && SPRepository.isOnline()) {
        SPRepository.saveProdIndicadores(rec);
      }

      UI.notify(`✓ Producción ${fecha} guardada`, '', 3500);
      AppState.addAudit('PROD_IND', `${fecha} — Tint:${rec.mTint}m Est:${rec.mEst}m Enc:${rec.KgEnc}kg`);

      // Refrescar historial
      render();
    });

    // Limpiar
    document.getElementById('pi-clear')?.addEventListener('click', () => {
      ['pi-mTint','pi-mEst','pi-KgEnc','pi-PasTejPl','pi-PasTejTs','pi-KgHil','pi-mDbl']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      document.getElementById('pi-msg').textContent = '';
    });

    // Editar desde historial
    document.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const fecha = btn.dataset.edit;
        document.getElementById('pi-fecha').value = fecha;
        document.getElementById('pi-fecha').dispatchEvent(new Event('change'));
        document.getElementById('pi-fecha').scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  function bindConfig() {
    // Calcular Encolado automáticamente al cambiar Tintorería
    document.getElementById('cfg-pvt')?.addEventListener('input', e => {
      const pvt = parseFloat(e.target.value) || 0;
      const pve = Math.max(0, 100 - pvt);
      const el = document.getElementById('cfg-pve');
      if (el) el.value = pve.toFixed(1);
      const check = document.getElementById('cfg-sum-check');
      if (check) {
        const sum = pvt + pve;
        check.textContent = `Suma: ${sum.toFixed(1)}% ${Math.abs(sum - 100) < 0.1 ? '✓' : '⚠'}`;
        check.style.color = Math.abs(sum - 100) < 0.1 ? 'var(--green)' : 'var(--orange)';
      }
    });

    // Guardar config
    document.getElementById('cfg-save')?.addEventListener('click', () => {
      const ef  = parseFloat(document.getElementById('cfg-ef')?.value)  || 80;
      const pvt = parseFloat(document.getElementById('cfg-pvt')?.value) || 72.6;
      const pve = parseFloat(document.getElementById('cfg-pve')?.value) || 27.4;

      if (Math.abs(pvt + pve - 100) > 0.5) {
        UI.notify('Los % de vapor deben sumar 100%', 'err'); return;
      }

      CONFIG.gasVsProd.eficiencia_caldera = ef / 100;
      CONFIG.gasVsProd.pct_vapor_tint     = pvt / 100;
      CONFIG.gasVsProd.pct_vapor_enc      = pve / 100;

      UI.notify(`✓ Configuración guardada — Eficiencia: ${ef}% · Tint: ${pvt}% · Enc: ${pve}%`, '', 4000);
      AppState.addAudit('CFG_GVP', `Ef:${ef}% Tint:${pvt}% Enc:${pve}%`);
    });
  }

  // ── RENDER ───────────────────────────────────────────────────────────────────

  function render() {
    const container = document.getElementById('view-form-prod-ind');
    if (!container) return;

    container.innerHTML = `
      <div style="max-width:900px">
        <div class="panel-section-title" style="font-size:14px;margin-bottom:12px">
          🏭 CARGA DIARIA DE INDICADORES DE PRODUCCIÓN
        </div>
        ${buildForm()}
        ${buildHistorial()}
        ${buildConfigPanel()}
      </div>`;

    bindForm();
    bindConfig();
  }

  return { render };

})();
