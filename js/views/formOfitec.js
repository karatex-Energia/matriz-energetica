/**
 * js/views/formOfitec.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vista Formulario Oficina Técnica — Colortex SA · Matriz Energética
 *
 * Gestiona: lecturas de caudalímetro y datos de distribuidora.
 *
 * CORRECCIÓN BUG ORIGINAL (línea 1418):
 *   El original inyectaba un <script> dentro de innerHTML que contenía
 *   addEventListener — los scripts inyectados vía innerHTML no se ejecutan
 *   en navegadores modernos. Aquí los listeners se asignan directamente.
 *
 * Sin onclick inline. Toda interacción vía addEventListener.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

if (typeof Views === 'undefined') window.Views = {};

Views.FormOfiTec = (() => {

  // ── CALCULAR DISPONIBLE Y RESTRINGIDO (reactivo) ────────────────────────────
  function calcDisp() {
    const nom     = parseFloat(document.getElementById('fd-nom')?.value) || 0;
    const autRev  = document.getElementById('fd-aut-rev')?.value.trim();
    const autBase = parseFloat(document.getElementById('fd-aut')?.value) || 0;
    const aut     = autRev !== '' ? (parseFloat(autRev) || autBase) : autBase;
    // Regla: aut ≤ nom siempre. Si aut < nom → restringido = aut. Si aut = nom → 0.
    const hayRest = nom > 0 && aut < nom;
    const rest    = hayRest ? (nom - aut) : 0;  // rest = nom - aut
    const disp    = aut;
    const elRest  = document.getElementById('fd-res-calc');
    const elDisp  = document.getElementById('fd-disp');
    if (elRest) elRest.value = Fmt.num(rest) + ' m³';
    if (elDisp) elDisp.value = Fmt.num(disp) + ' m³';
  }

  // ── TURNO AUTOMÁTICO ────────────────────────────────────────────────────────
  function autoTurno() {
    const h  = document.getElementById('ft-h')?.value || '';
    const el = document.getElementById('ft-t');
    if (el) el.value = CONFIG.franjas.turnos[h] || '';
  }

  // ── GUARDAR LECTURA ─────────────────────────────────────────────────────────
  function saveLectura() {
    const f  = document.getElementById('ft-f').value;
    const h  = document.getElementById('ft-h').value;
    const ub = document.getElementById('ft-ub').value;
    const c  = parseFloat(document.getElementById('ft-c').value);

    if (!f || !h || !ub || isNaN(c) || c < 0) {
      UI.notify('Complete todos los campos obligatorios. La lectura debe ser positiva.', 'err');
      return;
    }

    // Validación de flujo
    try {
      const flowCheck = FlowEngine.canSave('ofitec', f);
      if (!flowCheck.ok) { UI.notify('Existen registros anteriores incompletos que son requeridos para los cálculos del sistema.', 'err'); return; }
    } catch(_e) {}

    AppState.addLectRecord({
      id:  AppState.nextLectId(),
      f, h,
      t:   CONFIG.franjas.turnos[h] || '',
      ub,
      c:   Math.abs(c),
      sup: document.getElementById('ft-sup').value || '',
      obs: document.getElementById('ft-obs-l').value || '',
    });

    AppState.addAudit('LECTURA', `Caudalímetro: ${ub} / ${f} / ${h} = ${c} m³`);
    UI.notifyGuardado('Lectura caudalímetro', { fecha: f });
    if (typeof SyncEngine !== 'undefined') SyncEngine.push();
    UI.updateTopbar();
    render();  // re-render para actualizar la tabla
  }

  // ── GUARDAR AUTORIZADO REVISADO ─────────────────────────────────────────────
  function saveAutRev() {
    const f       = document.getElementById('fd-f').value;
    const autRev  = parseFloat(document.getElementById('fd-aut-rev').value);
    const nom     = parseFloat(document.getElementById('fd-nom').value) || 0;

    if (!f) { UI.notify('Ingrese la fecha', 'err'); return; }
    if (isNaN(autRev) || autRev < 0) { UI.notify('Ingrese un valor válido para el Autorizado Revisado', 'err'); return; }
    if (nom > 0 && autRev > nom) { UI.notify(`El Autorizado Revisado (${Fmt.num(autRev)} m³) no puede superar el Nominado (${Fmt.num(nom)} m³)`, 'err'); return; }

    const ok = AppState.upsertAutRev(f, autRev, AppState.currentUser?.u || 'ofitec');
    if (!ok) { UI.notify('No existe registro de distribuidora para esa fecha. Guarde primero los datos del día.', 'err'); return; }

    AppState.addAudit('AUT_REV', `Autorizado revisado: ${f} → ${Fmt.num(autRev)} m³ (usuario: ${AppState.currentUser?.label || 'ofitec'})`);
    UI.notify('✓ Autorizado revisado guardado — recalculando...');
    calcDisp();
    UI.updateTopbar();
  }

  // ── GUARDAR DISTRIBUIDORA ────────────────────────────────────────────────────
  function saveDist() {
    const f = document.getElementById('fd-f').value;
    if (!f) { UI.notify('Ingrese la fecha', 'err'); return; }

    // Validación de flujo (solo para datos internos — aut es diferido)
    const flowCheck = FlowEngine.canSave('ofitec', f);
    if (!flowCheck.ok) {
      UI.notify('Existen registros anteriores incompletos que son requeridos para los cálculos del sistema.', 'err');
      return;
    }

    const aut = Math.abs(parseFloat(document.getElementById('fd-aut').value) || 0);
    const res = Math.abs(parseFloat(document.getElementById('fd-res').value) || 0);

    const nom_d = Math.abs(parseFloat(document.getElementById('fd-nom').value) || 0);
    // Regla: aut ≤ nom. rest y disp se calculan automáticamente.
    const hayRest_d = nom_d > 0 && aut < nom_d;
    const rest_calc = hayRest_d ? (nom_d - aut) : 0;  // rest = nom - aut

    AppState.upsertDistRecord({
      f,
      nom:  nom_d,
      aut,
      rest: rest_calc,
      disp: aut,
      fact: Math.abs(parseFloat(document.getElementById('fd-fact').value) || 0),
      pci:  Math.abs(parseFloat(document.getElementById('fd-pci').value) || CONFIG.energia.pciRef),
      obs:  document.getElementById('fd-obs-d').value || '',
    });

    AppState.addAudit('DISTRIBUIDORA', `Datos actualizados: ${f} nom=${nom_d} aut=${aut} rest=${rest_calc}`);
    UI.notifyGuardado('Distribuidora', { fecha: f, valor: aut, unidad: 'm³ aut.' });
    if (typeof SyncEngine !== 'undefined') SyncEngine.push();
    UI.updateTopbar();
  }

  // ── TABLA HISTORIAL ─────────────────────────────────────────────────────────
  function buildLectRows() {
    const lects = Repository.getRecentLecturas(15);
    if (!lects.length) {
      return '<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:14px">Sin lecturas registradas</td></tr>';
    }
    return lects.map(l => `<tr>
      <td>${Fmt.date(l.f)}</td>
      <td class="v">${l.h}</td>
      <td><span class="chip cgr">${l.t}</span></td>
      <td>${l.ub}</td>
      <td class="v">${Fmt.num(l.c)} m³</td>
      <td>${l.sup || '—'}</td>
    </tr>`).join('');
  }

  // ── RENDER PRINCIPAL ────────────────────────────────────────────────────────
  function render() {
    const today  = new Date().toISOString().slice(0, 10);
    const obsOpts = CONFIG.observaciones.map(o => `<option value="${o}">${o}</option>`).join('');
    const ubOpts  = CONFIG.operativo.ubicaciones.map(u => `<option value="${u}">${u}</option>`).join('');
    const hOpts   = CONFIG.franjas.horas.map(h => `<option value="${h}">${h}</option>`).join('');

    // Calcular banner de flujo ANTES del template (nunca dentro de template literal)
    let _ofitecFlowBanner = '';
    try {
      const _fc = FlowEngine.canSave('ofitec', today);
      if (!_fc.ok) {
        _ofitecFlowBanner = '<div style="background:rgba(239,68,68,.1);border:1.5px solid rgba(239,68,68,.4);border-radius:7px;padding:11px 14px;margin-bottom:10px;color:var(--red);font-size:11px"><strong>⛔ Existen registros anteriores incompletos.</strong> Complete los datos pendientes antes de cargar nuevos registros.</div>';
      } else {
        const _pending = FlowEngine.getPendingDays();
        if (_pending.length) _ofitecFlowBanner = '<div style="background:rgba(234,179,8,.07);border:1px solid rgba(234,179,8,.3);border-radius:6px;padding:9px 12px;margin-bottom:8px;color:var(--yellow);font-size:11px">⚠ <strong>' + _pending.length + ' día(s) con datos pendientes</strong> de períodos anteriores.</div>';
      }
    } catch(_e) {}

    document.getElementById('view-form-ofitec').innerHTML = `
      <div class="pg-title">Formulario Oficina Técnica</div>
      <div class="pg-desc">Registro de lecturas de caudalímetros y datos de la distribuidora.</div>
      ${_ofitecFlowBanner}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">

        <!-- LECTURA CAUDALÍMETRO -->
        <div class="fcard">
          <div class="fcard-title">📡 LECTURA DE CAUDALÍMETRO</div>
          <div class="fgrid fg2" style="gap:8px">
            <div class="fgrp"><div class="flabel">Fecha *</div><input type="date" class="fctl yel" id="ft-f" value="${today}"></div>
            <div class="fgrp"><div class="flabel">Franja Horaria *</div><select class="fctl yel" id="ft-h"><option value="">—</option>${hOpts}</select></div>
            <div class="fgrp"><div class="flabel">Turno (auto)</div><input type="text" class="fctl ro" id="ft-t" readonly></div>
            <div class="fgrp"><div class="flabel">Ubicación del Medidor *</div><select class="fctl yel" id="ft-ub"><option value="">—</option>${ubOpts}</select></div>
            <div class="fgrp"><div class="flabel">Lectura Caudalímetro m³ *</div><input type="number" class="fctl yel" id="ft-c" placeholder="0" min="0" step="1"></div>
            <div class="fgrp"><div class="flabel">Supervisor</div><input type="text" class="fctl yel" id="ft-sup" placeholder="Nombre del supervisor"></div>
            <div class="fgrp fspan"><div class="flabel">Observaciones</div><select class="fctl yel" id="ft-obs-l"><option value="">— Sin observaciones —</option>${obsOpts}</select></div>
          </div>
          <div class="factions"><button class="btn-pri" id="ft-save">✓ Guardar Lectura</button></div>
        </div>

        <!-- DATOS DISTRIBUIDORA -->
        <div class="fcard">
          <div class="fcard-title">🏙 DATOS DISTRIBUIDORA</div>
          <div class="fgrid fg2" style="gap:8px">
            <div class="fgrp"><div class="flabel">Fecha *</div><input type="date" class="fctl yel" id="fd-f" value="${today}"></div>
            <div class="fgrp"><div class="flabel">PCI Vigente kcal/m³</div><input type="number" class="fctl yel" id="fd-pci" placeholder="${CONFIG.energia.pciRef}"></div>
            <div class="fgrp"><div class="flabel">Nominado m³</div><input type="number" class="fctl yel" id="fd-nom" placeholder="0" min="0"></div>
            <div class="fgrp"><div class="flabel">Autorizado m³</div><input type="number" class="fctl yel" id="fd-aut" placeholder="0" min="0"></div>
            <div class="fgrp"><div class="flabel" style="color:var(--orange);font-weight:700">Autorizado Revisado m³ <span style="font-size:9px;font-weight:400;color:var(--text3)">(ajuste intradiario)</span></div>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="number" class="fctl yel" id="fd-aut-rev" placeholder="— sin revisión —" min="0" style="border-color:var(--orange)">
                <button class="btn-sec" id="fd-aut-rev-save" style="white-space:nowrap;font-size:11px">✓ Guardar</button>
              </div>
            </div>
            <div class="fgrp"><div class="flabel">Restringido m³ (calc.)</div><input type="text" class="fctl ro" id="fd-res-calc" readonly></div>
            <div class="fgrp"><div class="flabel">Disponible m³ (calc.)</div><input type="text" class="fctl ro" id="fd-disp" readonly></div>
            <div class="fgrp"><div class="flabel">Facturado m³</div><input type="number" class="fctl yel" id="fd-fact" placeholder="0" min="0"></div>
            <div class="fgrp"><div class="flabel">Observaciones</div><select class="fctl yel" id="fd-obs-d"><option value="">—</option>${obsOpts}</select></div>
          </div>
          <div class="factions"><button class="btn-pri" id="fd-save">✓ Guardar Datos</button></div>
        </div>
      </div>

      <div class="sec-hdr" style="margin-bottom:6px"><div class="sec-title">HISTORIAL DE LECTURAS RECIENTES</div></div>
      <div class="twrap">
        <table>
          <thead><tr><th>Fecha</th><th>Hora</th><th>Turno</th><th>Ubicación</th><th>Caudalímetro</th><th>Supervisor</th></tr></thead>
          <tbody id="ft-tbl">${buildLectRows()}</tbody>
        </table>
      </div>`;

    // ── CORRECCIÓN BUG ORIGINAL (línea 1418):
    // Los listeners se asignan aquí directamente — no vía <script> en innerHTML
    document.getElementById('ft-h').addEventListener('change', autoTurno);
    document.getElementById('fd-nom').addEventListener('input', calcDisp);
    document.getElementById('fd-aut').addEventListener('input', calcDisp);
    document.getElementById('fd-aut-rev').addEventListener('input', calcDisp);
    document.getElementById('fd-aut-rev-save').addEventListener('click', saveAutRev);
    document.getElementById('ft-save').addEventListener('click', saveLectura);
    document.getElementById('fd-save').addEventListener('click', saveDist);
  }

  return { render };

})();
