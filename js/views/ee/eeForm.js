/**
 * js/views/ee/eeForm.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Formulario de carga de datos EE — Energía Eléctrica · Colortex SA
 *
 * Permite ingresar mensualmente:
 *   · Lecturas de medidor por trafo (kWh acumulado)
 *   · Lectura SMEC (medidor principal)
 *   · Horas de compresores (carga + descarga)
 *   · Días trabajados por sector (Term/Hil)
 *   · Horas de pozos de agua
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

if (typeof Views === 'undefined') window.Views = {};
if (!Views.EE) Views.EE = {};

Views.EE.Form = (() => {

  let _tab = 'trafos'; // 'trafos' | 'compresores' | 'agua'

  function buildTabs() {
    return `
    <div class="form-tabs" style="display:flex;gap:2px;border-bottom:2px solid var(--border);margin-bottom:16px">
      <button class="ftab ${_tab==='trafos'?'active':''}" data-tab="trafos">⚡ Transformadores</button>
      <button class="ftab ${_tab==='compresores'?'active':''}" data-tab="compresores">🔧 Compresores</button>
      <button class="ftab ${_tab==='agua'?'active':''}" data-tab="agua">💧 Agua</button>
    </div>`;
  }

  // ── FORMULARIO TRAFOS ────────────────────────────────────────────────────────

  function buildFormTrafos() {
    const now = new Date();
    const mesDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const trafosNombres = [1,2,3,4,5,6,7,8,9,10].map(n => `Transformador Nº ${n}`);

    const rows = trafosNombres.map(n => `
      <tr>
        <td style="font-size:12px">${n}</td>
        <td><input type="number" class="form-input trafo-kWh" data-trafo="${n}" step="1" min="0" placeholder="0" style="width:100%;text-align:right"></td>
      </tr>`).join('');

    return `
    <div class="form-card">
      <div class="form-card-title">CARGA DE LECTURAS — TRANSFORMADORES</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div class="form-group">
          <label class="form-label">MES</label>
          <input type="month" id="ee-trafos-mes" class="form-input" value="${mesDefault}">
        </div>
        <div class="form-group">
          <label class="form-label">SMEC — MEDIDOR PRINCIPAL (kWh)</label>
          <input type="number" id="ee-smec" class="form-input" step="1" min="0" placeholder="0">
        </div>
      </div>
      <table class="data-table" style="width:100%;margin-bottom:12px">
        <thead>
          <tr>
            <th>Transformador</th>
            <th style="text-align:right">Consumo mes (kWh)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-secondary" id="ee-trafos-clear">Limpiar</button>
        <button class="btn-primary" id="ee-trafos-save">💾 Guardar Trafos</button>
      </div>
    </div>`;
  }

  // ── FORMULARIO COMPRESORES ───────────────────────────────────────────────────

  function buildFormCompresores() {
    const now = new Date();
    const mesDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const cfg  = AppState.db.ee_compresores || { equipos: [] };
    const equi = cfg.equipos || [];

    const rows = equi.map(eq => `
      <tr>
        <td style="font-size:12px">${eq.n}</td>
        <td style="text-align:center;font-size:11px;color:var(--text3)">${eq.pot_carga}/${eq.pot_desc||0} kW</td>
        <td><input type="number" class="form-input comp-carga" data-id="${eq.id}" step="0.1" min="0" placeholder="0" style="width:100%;text-align:right"></td>
        <td><input type="number" class="form-input comp-desc"  data-id="${eq.id}" step="0.1" min="0" placeholder="0" style="width:100%;text-align:right"></td>
      </tr>`).join('');

    return `
    <div class="form-card">
      <div class="form-card-title">CARGA DE HORAS — COMPRESORES</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px">
        <div class="form-group">
          <label class="form-label">MES</label>
          <input type="month" id="ee-comp-mes" class="form-input" value="${mesDefault}">
        </div>
        <div class="form-group">
          <label class="form-label">DÍAS TRABAJADOS — TERMINADO</label>
          <input type="number" id="ee-dias-term" class="form-input" step="0.5" min="0" max="31" placeholder="22">
        </div>
        <div class="form-group">
          <label class="form-label">DÍAS TRABAJADOS — HILANDERÍA</label>
          <input type="number" id="ee-dias-hil" class="form-input" step="0.5" min="0" max="31" placeholder="27">
        </div>
      </div>
      <table class="data-table" style="width:100%;margin-bottom:12px">
        <thead>
          <tr>
            <th>Compresor</th>
            <th style="text-align:center">Pot. Carga/Desc. (kW)</th>
            <th style="text-align:right">Hs en Carga</th>
            <th style="text-align:right">Hs en Descarga</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-secondary" id="ee-comp-clear">Limpiar</button>
        <button class="btn-primary" id="ee-comp-save">💾 Guardar Compresores</button>
      </div>
    </div>`;
  }

  // ── FORMULARIO AGUA ──────────────────────────────────────────────────────────

  function buildFormAgua() {
    const now = new Date();
    const mesDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const cfg = AppState.db.ee_agua || { pozos: [] };

    const pozoRows = (cfg.pozos || []).map(p => `
      <tr>
        <td style="font-size:12px">${p.n}</td>
        <td style="text-align:center;font-size:11px;color:var(--text3)">${p.pot_kW} kW</td>
        <td><input type="number" class="form-input pozo-hs" data-id="${p.id}" step="0.1" min="0" placeholder="0" style="width:100%;text-align:right"></td>
      </tr>`).join('');

    const dist = cfg.distribucion || {};
    return `
    <div class="form-card">
      <div class="form-card-title">CARGA DE HORAS — AGUA DE PERFORACIÓN</div>
      <div class="form-group" style="margin-bottom:14px;max-width:220px">
        <label class="form-label">MES</label>
        <input type="month" id="ee-agua-mes" class="form-input" value="${mesDefault}">
      </div>
      <table class="data-table" style="width:100%;margin-bottom:12px">
        <thead>
          <tr>
            <th>Pozo</th>
            <th style="text-align:center">Potencia</th>
            <th style="text-align:right">Horas marcha</th>
          </tr>
        </thead>
        <tbody>${pozoRows}</tbody>
      </table>
      <div class="form-card" style="background:var(--bg3);border:none;margin-top:8px">
        <div class="form-card-title" style="margin-bottom:8px">DISTRIBUCIÓN POR SECTOR (% del consumo total)</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
          <div class="form-group">
            <label class="form-label">HILANDERÍA %</label>
            <input type="number" id="ee-agua-hil" class="form-input" step="0.5" min="0" max="100" value="${((dist.pct_hilanderia||0)*100).toFixed(1)}" placeholder="15">
          </div>
          <div class="form-group">
            <label class="form-label">TEJEDURÍA %</label>
            <input type="number" id="ee-agua-tej" class="form-input" step="0.5" min="0" max="100" value="${((dist.pct_tejeria||0)*100).toFixed(1)}" placeholder="15">
          </div>
          <div class="form-group">
            <label class="form-label">TERMINADO %</label>
            <input type="number" id="ee-agua-term" class="form-input" step="0.5" min="0" max="100" value="${((dist.pct_terminado||0)*100).toFixed(1)}" placeholder="70">
          </div>
        </div>
        <div id="ee-agua-pct-check" style="font-size:11px;color:var(--text3);margin-top:4px"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button class="btn-primary" id="ee-agua-save">💾 Guardar Agua</button>
      </div>
    </div>`;
  }

  // ── LÓGICA DE GUARDADO ───────────────────────────────────────────────────────

  function bindTrafos() {
    const saveBtn = document.getElementById('ee-trafos-save');
    if (!saveBtn) return;

    saveBtn.addEventListener('click', () => {
      // Validar
      if (typeof Validator !== 'undefined') {
        if (!Validator.mes('ee-trafos-mes', 'el mes')) return;
      }
      const mes  = document.getElementById('ee-trafos-mes')?.value;
      const smec = parseFloat(document.getElementById('ee-smec')?.value) || null;
      if (!mes) { UI.notify('Seleccioná el mes', 'err'); return; }

      const trafos = {};
      let total = 0;
      document.querySelectorAll('.trafo-kWh').forEach(inp => {
        const v = parseFloat(inp.value) || 0;
        if (v > 0) { trafos[inp.dataset.trafo] = v; total += v; }
      });

      if (total === 0) { UI.notify('Ingresá al menos un valor de trafo', 'err'); return; }

      // Upsert en db.ee_trafos
      const db = AppState.db.ee_trafos || [];
      const idx = db.findIndex(r => r.mes === mes);
      const rec = { mes, trafos, total_kWh: Math.round(total * 100) / 100, smec_kWh: smec };
      if (idx >= 0) db[idx] = rec; else db.push(rec);
      AppState.db.ee_trafos = db;
      AppState._persist && AppState._persist();

      UI.notify(`Trafos ${mes} guardados — ${(total/1000).toFixed(1)} MWh`, '', 4000);
      AppState.addAudit('EE_TRAFOS', `${mes} — ${(total/1000).toFixed(1)} MWh | SMEC: ${smec || '—'} kWh`);

      // Persistir en SharePoint
      if (typeof SPRepository !== 'undefined' && SPRepository.isOnline()) {
        SPRepository.saveEETrafos(mes, trafos, Math.round(total), smec);
      }
    });

    document.getElementById('ee-trafos-clear')?.addEventListener('click', () => {
      document.querySelectorAll('.trafo-kWh').forEach(i => i.value = '');
      document.getElementById('ee-smec').value = '';
    });
  }

  function bindCompresores() {
    const saveBtn = document.getElementById('ee-comp-save');
    if (!saveBtn) return;

    saveBtn.addEventListener('click', () => {
      const mes      = document.getElementById('ee-comp-mes')?.value;
      const dias_term = parseFloat(document.getElementById('ee-dias-term')?.value) || 0;
      const dias_hil  = parseFloat(document.getElementById('ee-dias-hil')?.value)  || 0;
      if (!mes) { UI.notify('Seleccioná el mes', 'err'); return; }

      const compresores = {};
      document.querySelectorAll('.comp-carga').forEach(inp => {
        const id = inp.dataset.id;
        compresores[id] = compresores[id] || { hs_carga: 0, hs_desc: 0 };
        compresores[id].hs_carga = parseFloat(inp.value) || 0;
      });
      document.querySelectorAll('.comp-desc').forEach(inp => {
        const id = inp.dataset.id;
        compresores[id] = compresores[id] || { hs_carga: 0, hs_desc: 0 };
        compresores[id].hs_desc = parseFloat(inp.value) || 0;
      });

      const db  = AppState.db.ee_compresores || { equipos: [], lecturas: [] };
      const idx = (db.lecturas || []).findIndex(r => r.mes === mes);
      const rec = {
        mes, dias_terminado: dias_term, dias_hilanderia: dias_hil,
        caudal_dem_tej: 17, caudal_dem_term: 17, caudal_dem_hil: 17,
        pct_rendimiento: 0.75,
        compresores,
      };
      if (idx >= 0) db.lecturas[idx] = rec; else db.lecturas.push(rec);
      AppState.db.ee_compresores = db;
      AppState._persist && AppState._persist();

      UI.notify(`Compresores ${mes} guardados`, '', 3500);
      AppState.addAudit('EE_COMP', `${mes} — Term: ${dias_term}d Hil: ${dias_hil}d`);
    });

    document.getElementById('ee-comp-clear')?.addEventListener('click', () => {
      document.querySelectorAll('.comp-carga,.comp-desc').forEach(i => i.value = '');
    });
  }

  function bindAgua() {
    const saveBtn = document.getElementById('ee-agua-save');
    if (!saveBtn) return;

    // Verificador de suma de %
    const checkPct = () => {
      const h = parseFloat(document.getElementById('ee-agua-hil')?.value) || 0;
      const t = parseFloat(document.getElementById('ee-agua-tej')?.value) || 0;
      const tr = parseFloat(document.getElementById('ee-agua-term')?.value) || 0;
      const sum = h + t + tr;
      const el = document.getElementById('ee-agua-pct-check');
      if (el) {
        el.textContent = `Suma: ${sum.toFixed(1)}% ${Math.abs(sum - 100) < 0.1 ? '✓' : '⚠ debe sumar 100%'}`;
        el.style.color = Math.abs(sum - 100) < 0.1 ? 'var(--green)' : 'var(--orange)';
      }
    };
    ['ee-agua-hil','ee-agua-tej','ee-agua-term'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', checkPct);
    });
    checkPct();

    saveBtn.addEventListener('click', () => {
      const mes = document.getElementById('ee-agua-mes')?.value;
      if (!mes) { UI.notify('Seleccioná el mes', 'err'); return; }

      const pct_hil  = (parseFloat(document.getElementById('ee-agua-hil')?.value)  || 0) / 100;
      const pct_tej  = (parseFloat(document.getElementById('ee-agua-tej')?.value)   || 0) / 100;
      const pct_term = (parseFloat(document.getElementById('ee-agua-term')?.value)  || 0) / 100;

      if (Math.abs(pct_hil + pct_tej + pct_term - 1) > 0.01) {
        UI.notify('Los % de distribución deben sumar 100%', 'err'); return;
      }

      // Guardar distribución global
      const dbA = AppState.db.ee_agua || { pozos: [], distribucion: {}, lecturas: [] };
      dbA.distribucion = { pct_hilanderia: pct_hil, pct_tejeria: pct_tej, pct_terminado: pct_term };

      // Guardar horas de pozos para el mes
      const lecRec = { mes };
      document.querySelectorAll('.pozo-hs').forEach(inp => {
        lecRec[inp.dataset.id + '_hs'] = parseFloat(inp.value) || 0;
      });
      const idx = (dbA.lecturas || []).findIndex(r => r.mes === mes);
      if (idx >= 0) dbA.lecturas[idx] = lecRec; else dbA.lecturas.push(lecRec);
      AppState.db.ee_agua = dbA;
      AppState._persist && AppState._persist();

      UI.notify(`Agua ${mes} guardada — Hil ${(pct_hil*100).toFixed(0)}% / Tej ${(pct_tej*100).toFixed(0)}% / Term ${(pct_term*100).toFixed(0)}%`, '', 4000);
    });
  }

  // ── RENDER ───────────────────────────────────────────────────────────────────

  function render() {
    const container = document.getElementById('view-ee-form');
    if (!container) return;

    container.innerHTML = `
      <div style="max-width:900px">
        <div class="panel-section-title" style="font-size:14px;margin-bottom:12px">⚡ CARGA DE DATOS — ENERGÍA ELÉCTRICA</div>
        ${buildTabs()}
        <div id="ee-form-content">
          ${_tab === 'trafos'      ? buildFormTrafos()       : ''}
          ${_tab === 'compresores' ? buildFormCompresores()  : ''}
          ${_tab === 'agua'        ? buildFormAgua()         : ''}
        </div>
      </div>`;

    // Bind tabs
    document.querySelectorAll('.ftab').forEach(btn => {
      btn.addEventListener('click', () => { _tab = btn.dataset.tab; render(); });
    });

    if (_tab === 'trafos')      bindTrafos();
    if (_tab === 'compresores') bindCompresores();
    if (_tab === 'agua')        bindAgua();
  }

  return { render };

})();
