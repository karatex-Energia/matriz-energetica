/**
 * js/views/formProd.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vista Formulario Producción — Colortex SA · Matriz Energética
 *
 * Sin onclick inline. Toda interacción vía addEventListener.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

if (typeof Views === 'undefined') window.Views = {};

Views.FormProd = (() => {

  // ── TABLA DEL DÍA ────────────────────────────────────────────────────────────
  function buildTodayRows(fecha) {
    const rows = AppState.db.prod.filter(r => r.f === fecha);
    if (!rows.length) {
      return '<tr><td colspan="12" style="text-align:center;color:var(--text3);padding:14px">Sin registros para esta fecha</td></tr>';
    }
    return rows.map(r => {
      const cc = r.cl === 'REAL' ? 'cg' : r.cl === 'PROYECTADA' ? 'cb' : 'co';
      const ct = r.tipo === 'DIRECTO' ? 'cb' : r.tipo === 'MIXTO' ? 'co' : 'cgr';
      return `<tr>
        <td class="v">${r.eq}</td>
        <td>${r.sec}</td>
        <td><span class="chip ${ct}">${r.tipo}</span></td>
        <td style="font-size:10px">${r.unid || ''}</td>
        <td><span class="chip ${cc}">${r.cl}</span></td>
        <td>${Fmt.num(r.h, 2)} hs</td>
        <td>${Fmt.num(r.cme)} m³/h</td>
        <td>${Fmt.num((r.fc || 1) * 100, 0)}%</td>
        <td>${Fmt.num((r.ef || 1) * 100, 0)}%</td>
        <td class="v">${Fmt.num(r.c)} m³</td>
        <td>${Fmt.num(r.pci)}</td>
        <td style="font-size:10px;color:var(--text3)">${r.obs || '—'}</td>
      </tr>`;
    }).join('');
  }

  // ── AUTOFILL desde equipo seleccionado ──────────────────────────────────────
  function autoFill() {
    const eqName = document.getElementById('fp-eq').value;
    const eq     = Repository.getEquipo(eqName) || {};
    const fecha  = document.getElementById('fp-f').value || new Date().toISOString().slice(0, 10);
    const ld     = Repository.getDistForDate(fecha);

    document.getElementById('fp-sec').value  = eq.sec  || '';
    document.getElementById('fp-tipo').value = eq.tipo || '';
    document.getElementById('fp-unid').value = eq.unid || '';
    document.getElementById('fp-cme').value  = eq.cme  || '';
    document.getElementById('fp-pci').value  = ld.pci  || CONFIG.energia.pciRef;

    calcCons();
  }

  // ── CÁLCULO DE CONSUMO ESTIMADO ─────────────────────────────────────────────
  function calcCons() {
    const hs  = parseFloat(document.getElementById('fp-hs').value)  || 0;
    const cme = parseFloat(document.getElementById('fp-cme').value) || 0;
    const fc  = parseFloat(document.getElementById('fp-fc').value)  || 100;
    const ef  = parseFloat(document.getElementById('fp-ef').value)  || 100;
    const cons = cme * hs * (fc / 100) * (ef / 100);
    document.getElementById('fp-cons').value = hs > 0 ? `${Fmt.num(cons, 2)} m³` : '—';
  }

  // ── LIMPIAR FORMULARIO ────────────────────────────────────────────────────────
  function clearForm() {
    ['fp-eq', 'fp-cl', 'fp-obs'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['fp-sec', 'fp-tipo', 'fp-unid', 'fp-cme', 'fp-cons', 'fp-pci',
     'fp-hs',  'fp-fc',  'fp-ef'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  // ── GUARDAR REGISTRO ────────────────────────────────────────────────────────
  function save() {
    const f  = document.getElementById('fp-f').value;
    const eq = document.getElementById('fp-eq').value;
    const hs = parseFloat(document.getElementById('fp-hs').value);

    if (!f || !eq || isNaN(hs)) {
      UI.notify('Complete los campos obligatorios', 'err'); return;
    }
    if (hs < 0) {
      UI.notify('Las horas no pueden ser negativas', 'err'); return;
    }
    if (hs > 24) {
      UI.notify('Las horas por equipo no pueden superar 24 hs por ciclo operativo', 'err'); return;
    }

    // Verificar suma de horas del equipo en el día (incluyendo registros previos)
    const horasExistentes = AppState.db.prod
      .filter(r => r.f === f && r.eq === eq && r.cl === 'PROYECTADA')
      .reduce((a, r) => a + (r.h || 0), 0);
    const _clVal = document.getElementById('fp-cl')?.value;
    if (_clVal === 'PROYECTADA' && horasExistentes + hs > 24) {
      UI.notify(`Advertencia: el total de horas programadas para ${eq} el ${Fmt.date(f)} supera 24 hs (${Fmt.num(horasExistentes + hs, 1)} hs)`, 'warn');
    }

    // Validación de flujo
    try {
      const flowCheck = FlowEngine.canSave('prod', f);
      if (!flowCheck.ok) { UI.notify('Existen registros anteriores incompletos que deben completarse antes de guardar.', 'err'); return; }
    } catch(_e) {}

    const eqData = Repository.getEquipo(eq) || {};
    const fc     = (parseFloat(document.getElementById('fp-fc').value) || 100) / 100;
    const ef     = (parseFloat(document.getElementById('fp-ef').value) || 100) / 100;
    const cme    = eqData.cme || 0;
    const pci    = parseFloat(document.getElementById('fp-pci').value) || CONFIG.energia.pciRef;
    const cl     = document.getElementById('fp-cl').value || 'PROYECTADA';
    const obs    = document.getElementById('fp-obs').value || '';

    const record = {
      i:    AppState.nextProdId(),
      f, eq, cme,
      tipo: eqData.tipo || '',
      sec:  eqData.sec  || '',
      cl, h: hs, pci, fc, ef,
      c:    Math.round(cme * hs * fc * ef * 100) / 100,
      obs,
      unid: eqData.unid || '',
    };

    AppState.addProdRecord(record);
    AppState.addAudit('PROD', `Nuevo registro: ${eq} / ${f} / ${cl}`);
    UI.notify('✓ Registro guardado');
    clearForm();

    // Refrescar tabla del día
    const tbl = document.getElementById('fp-tbl');
    if (tbl) tbl.innerHTML = buildTodayRows(f);
  }

  // ── REFRESH TABLA (al cambiar fecha) ────────────────────────────────────────
  function refreshTable() {
    const f = document.getElementById('fp-f').value;
    const tbl = document.getElementById('fp-tbl');
    if (tbl && f) tbl.innerHTML = buildTodayRows(f);
    autoFill();
  }

  // ── RENDER PRINCIPAL ────────────────────────────────────────────────────────
  function render() {
    const today   = new Date().toISOString().slice(0, 10);
    const equipos = Repository.getAllEquipos();
    const eqOpts  = equipos.map(e => `<option value="${e.n}">${e.n}</option>`).join('');
    const obsOpts = CONFIG.observaciones.map(o => `<option value="${o}">${o}</option>`).join('');
    const clasifs = CONFIG.operativo.clasif.map(c => `<option>${c}</option>`).join('');

    // Validación de flujo — protegida
    let _blockBanner = '';
    try {
      if (typeof FlowEngine !== 'undefined') {
        const _fc = FlowEngine.canSave('prod', today);
        if (_fc.bloqueadoPor.length) {
          const items = _fc.bloqueadoPor.map(s =>
            '<li><strong>' + Fmt.date(s.fecha) + '</strong>: ' + (s.etapa1.pendientes.join(', ') || 'Datos incompletos') + '</li>'
          ).join('');
          _blockBanner = '<div style="background:rgba(239,68,68,.1);border:1.5px solid rgba(239,68,68,.4);border-radius:7px;padding:12px 14px;margin-bottom:10px;color:var(--red)"><div style="font-family:Calibri,var(--fontc);font-size:12px;font-weight:700;margin-bottom:6px">⛔ CARGA BLOQUEADA — REGISTROS ANTERIORES INCOMPLETOS</div><div style="font-size:11px;margin-bottom:6px">Existen datos obligatorios pendientes de carga correspondientes a períodos anteriores. Complete los registros pendientes antes de cargar un nuevo registro.</div><ul style="margin:0 0 0 16px;font-size:11px">' + items + '</ul></div>';
        }
      }
    } catch(_e) { _blockBanner = ''; }

    document.getElementById('view-form-prod').innerHTML = `
      <div class="pg-title">Formulario — Producción</div>
      <div class="pg-desc">Carga de horas máquina programadas y reales. Campos editables resaltados en amarillo.</div>
      ${_blockBanner}

      <div class="fcard">
        <div class="fcard-title">📝 DATOS DEL DÍA OPERATIVO</div>
        <div class="fgrid">
          <div class="fgrp"><div class="flabel">Fecha Operativa *</div><input type="date" class="fctl yel" id="fp-f" value="${today}"></div>
          <div class="fgrp"><div class="flabel">Equipo *</div><select class="fctl yel" id="fp-eq"><option value="">— Seleccionar —</option>${eqOpts}</select></div>
          <div class="fgrp"><div class="flabel">Clasificación *</div><select class="fctl yel" id="fp-cl">${clasifs}</select></div>
          <div class="fgrp"><div class="flabel">Sector (auto)</div><input type="text" class="fctl ro" id="fp-sec" readonly></div>
          <div class="fgrp"><div class="flabel">Tipo Consumo (auto)</div><input type="text" class="fctl ro" id="fp-tipo" readonly></div>
          <div class="fgrp"><div class="flabel">Unidad Productiva (auto)</div><input type="text" class="fctl ro" id="fp-unid" readonly></div>
          <div class="fgrp"><div class="flabel">CME m³/h (auto)</div><input type="text" class="fctl ro" id="fp-cme" readonly></div>
          <div class="fgrp"><div class="flabel">Horas Máquina *</div><input type="number" class="fctl yel" id="fp-hs" min="0" max="24" step="0.25"></div>
          <div class="fgrp"><div class="flabel">Factor de Carga %</div><input type="number" class="fctl yel" id="fp-fc" min="0" max="100" step="0.1" placeholder="100"></div>
          <div class="fgrp"><div class="flabel">Eficiencia %</div><input type="number" class="fctl yel" id="fp-ef" min="0" max="100" step="0.1" placeholder="100"></div>
          <div class="fgrp"><div class="flabel">PCI Vigente kcal/m³ (auto)</div><input type="text" class="fctl ro" id="fp-pci" readonly></div>
          <div class="fgrp"><div class="flabel">Consumo Estimado (calc.)</div><input type="text" class="fctl ro" id="fp-cons" readonly placeholder="—"></div>
          <div class="fgrp fspan"><div class="flabel">Observaciones</div><select class="fctl yel" id="fp-obs"><option value="">— Sin observaciones —</option>${obsOpts}</select></div>
        </div>
        <div class="factions">
          <button class="btn-sec" id="fp-clear">Limpiar</button>
          <button class="btn-pri" id="fp-save">✓ Guardar Registro</button>
        </div>
      </div>

      <div class="fcard">
        <div class="fcard-title">📋 REGISTROS DEL DÍA — ${Fmt.date(today)}</div>
        <div class="twrap">
          <table>
            <thead><tr>
              <th>Equipo</th><th>Sector</th><th>Tipo</th><th>Unid. Prod.</th><th>Clasif.</th>
              <th>Hs</th><th>CME</th><th>FC%</th><th>EF%</th><th>Consumo m³</th><th>PCI</th><th>Obs.</th>
            </tr></thead>
            <tbody id="fp-tbl">${buildTodayRows(today)}</tbody>
          </table>
        </div>
      </div>`;

    // ── Bind addEventListener (sin onclick inline)
    document.getElementById('fp-eq').addEventListener('change', autoFill);
    document.getElementById('fp-f').addEventListener('change', refreshTable);
    document.getElementById('fp-hs').addEventListener('input', calcCons);
    document.getElementById('fp-fc').addEventListener('input', calcCons);
    document.getElementById('fp-ef').addEventListener('input', calcCons);
    document.getElementById('fp-clear').addEventListener('click', clearForm);
    document.getElementById('fp-save').addEventListener('click', save);
  }

  return { render };

})();
