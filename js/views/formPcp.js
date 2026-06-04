/**
 * js/views/formPcp.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vista Formulario PCP — Colortex SA · Matriz Energética
 *
 * Funcionalidades:
 *   · Carga de horas máquina reales
 *   · Modificación del plan: agregar, excluir y corregir equipos
 *   · Trazabilidad completa con plan original preservado
 *   · Validación de flujo operativo (FlowEngine)
 *
 * Sin onclick inline. Toda interacción vía addEventListener.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

if (typeof Views === 'undefined') window.Views = {};

Views.FormPcp = (() => {

  // ── BANNER DE BLOQUEO ───────────────────────────────────────────────────────
  function buildBlockBanner(bloqueadoPor) {
    if (!bloqueadoPor.length) return '';
    const items = bloqueadoPor.map(s => {
      const pends = s.etapa3.pendientes.map(p =>
        `<li style="margin:2px 0">${p}</li>`
      ).join('');
      return `<div style="margin-bottom:6px">
        <strong>${Fmt.date(s.fecha)}</strong>
        <ul style="margin:3px 0 0 14px;padding:0">${pends}</ul>
      </div>`;
    }).join('');

    return `<div style="background:rgba(239,68,68,.1);border:1.5px solid rgba(239,68,68,.4);
      border-radius:7px;padding:12px 14px;margin-bottom:10px;color:var(--red)">
      <div style="font-family:Calibri,var(--fontc);font-size:12px;font-weight:700;margin-bottom:6px">
        ⛔ CARGA BLOQUEADA — REGISTROS ANTERIORES INCOMPLETOS
      </div>
      <div style="font-size:11px;margin-bottom:8px">
        Existen datos obligatorios pendientes de carga correspondientes a períodos anteriores.
        Complete los registros pendientes para continuar.
      </div>
      ${items}
    </div>`;
  }

  // ── BANNER DE ADVERTENCIA (diferidos pendientes) ────────────────────────────
  function buildWarnBanner(status) {
    if (!status.diferido) return '';
    return `<div style="background:rgba(234,179,8,.07);border:1px solid rgba(234,179,8,.3);
      border-radius:6px;padding:9px 12px;margin-bottom:8px;color:var(--yellow);font-size:11px">
      ⚠ <strong>Dato diferido pendiente:</strong> El volumen autorizado de este día
      será informado por la distribuidora en D+1. No genera bloqueo.
    </div>`;
  }

  // ── TABLA DE HORAS REALES ────────────────────────────────────────────────────
  function buildEquiposTable(fecha) {
    const proyDia  = AppState.db.prod.filter(r => r.f === fecha && r.cl === 'PROYECTADA');
    const realDia  = AppState.db.prod.filter(r => r.f === fecha && r.cl === 'REAL');
    const obsOpts  = CONFIG.observaciones.map(o => `<option value="${o}">${o}</option>`).join('');

    if (!proyDia.length) {
      return `<div style="padding:14px;color:var(--text3);font-family:var(--fontc);font-size:11px;text-align:center">
        Sin equipos programados para ${Fmt.date(fecha)}. Seleccione otra fecha o cargue la planificación primero.
      </div>`;
    }

    const rows = proyDia.map((r, i) => {
      const li      = Repository.getEquipo(r.eq) || {};
      const existing = realDia.find(x => x.eq === r.eq);
      const hsVal   = existing ? existing.h : '';
      // Marcar campos pendientes
      const pend    = !existing || existing.h === undefined;
      const pendCls = pend ? 'border-color:var(--orange)' : '';

      return `
        <div style="display:grid;grid-template-columns:1.4fr .8fr 90px 90px 110px 180px;
          gap:6px;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-family:Calibri,var(--fontc);font-weight:700;color:var(--text);font-size:13px">
              ${r.eq}
              ${pend ? '<span style="font-size:9px;color:var(--orange);margin-left:5px">● PENDIENTE</span>' : ''}
            </div>
            <div style="font-size:10px;color:var(--text3)">${r.sec} · ${li.unid || r.tipo}</div>
          </div>
          <div>
            <div style="font-size:10px;color:var(--text3)">CME: ${Fmt.num(r.cme)} m³/h</div>
            <div style="font-size:10px;color:var(--text3)">PCI: ${Fmt.num(r.pci)}</div>
          </div>
          <div>
            <div class="flabel" style="margin-bottom:3px">HS PROG.</div>
            <div class="fctl ro" style="padding:5px 8px;font-size:12px">${Fmt.num(r.h, 2)}</div>
          </div>
          <div>
            <div class="flabel" style="margin-bottom:3px">CONS. PROG.</div>
            <div class="fctl ro" style="padding:5px 8px;font-size:12px">${Fmt.num(r.c, 0)} m³</div>
          </div>
          <div>
            <div class="flabel" style="margin-bottom:3px">HS REALES *</div>
            <input type="number" class="fctl yel pcp-hs" id="pcp-h${i}"
              min="0" max="48" step="0.25" style="padding:5px 8px;${pendCls}"
              value="${hsVal}"
              data-eq="${r.eq}" data-cme="${r.cme}" data-tipo="${r.tipo}"
              data-sec="${r.sec}" data-pci="${r.pci}" data-prog="${r.c}"
              data-idx="${i}">
          </div>
          <div>
            <div class="flabel" style="margin-bottom:3px">OBSERVACIONES</div>
            <select class="fctl" id="pcp-o${i}" style="padding:5px 8px;font-size:10px">
              <option value="">—</option>${obsOpts}
            </select>
          </div>
        </div>
        <div id="pcp-r${i}" style="font-family:var(--fontc);font-size:11px;
          padding:2px 0 4px 0;color:var(--text3)"></div>`;
    }).join('');

    return rows;
  }

  // ── TABLA DE EQUIPOS AGREGADOS (no planificados) ─────────────────────────────
  function buildAgregadosTable(fecha) {
    const equipos  = Repository.getAllEquipos();
    const proyDia  = AppState.db.prod.filter(r => r.f === fecha && r.cl === 'PROYECTADA').map(r => r.eq);
    const realDia  = AppState.db.prod.filter(r => r.f === fecha && r.cl === 'REAL');
    const agregados = realDia.filter(r => !proyDia.includes(r.eq));
    const eqOpts   = equipos.map(e => `<option value="${e.n}">${e.n}</option>`).join('');
    const obsOpts  = CONFIG.observaciones.map(o => `<option value="${o}">${o}</option>`).join('');

    const agregadosRows = agregados.length ? agregados.map(r => `
      <div style="display:grid;grid-template-columns:1fr 80px 80px 100px;gap:6px;
        align-items:center;padding:5px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:700;color:var(--text)">${r.eq}
          <span style="font-size:9px;color:var(--green);margin-left:4px">★ AGREGADO</span>
        </div>
        <div style="font-size:11px;color:var(--text2)">${Fmt.num(r.h, 2)} hs</div>
        <div style="font-size:11px;color:var(--text2)">${Fmt.num(r.c, 0)} m³</div>
        <button class="btn-sec pcp-rm-agregado" style="font-size:10px;padding:3px 8px"
          data-id="${r.i}">✕ Quitar</button>
      </div>`).join('') :
      '<div style="font-size:11px;color:var(--text3);padding:8px 0">Sin equipos agregados</div>';

    return `
      <div style="margin-bottom:10px">${agregadosRows}</div>
      <div style="font-family:Calibri,var(--fontc);font-size:11px;font-weight:700;
        color:var(--text2);margin-bottom:6px">AGREGAR EQUIPO NO PLANIFICADO</div>
      <div style="display:grid;grid-template-columns:1fr 100px 100px 180px auto;gap:6px;align-items:end">
        <div>
          <div class="flabel">Equipo</div>
          <select class="fctl yel" id="pcp-add-eq"><option value="">— Seleccionar —</option>${eqOpts}</select>
        </div>
        <div>
          <div class="flabel">Hs Reales</div>
          <input type="number" class="fctl yel" id="pcp-add-hs" min="0" max="48" step="0.25" placeholder="0">
        </div>
        <div>
          <div class="flabel">Consumo m³ (calc.)</div>
          <input type="text" class="fctl ro" id="pcp-add-cons" readonly placeholder="—">
        </div>
        <div>
          <div class="flabel">Observaciones</div>
          <select class="fctl" id="pcp-add-obs"><option value="">—</option>${obsOpts}</select>
        </div>
        <div>
          <button class="btn-pri" id="pcp-add-btn" style="white-space:nowrap">+ Agregar</button>
        </div>
      </div>`;
  }

  // ── TABLA DE HISTORIAL PCP ───────────────────────────────────────────────────
  function buildHistoryTable(fecha) {
    const history = AppState.planHistory.filter(h => h.fecha === fecha)
      .sort((a, b) => b.ts.localeCompare(a.ts));

    if (!history.length) return '<div style="font-size:11px;color:var(--text3);padding:8px 0">Sin modificaciones registradas</div>';

    const tipoLabel = { hs_real:'Hs Real', agregar:'Agregado', excluir:'Excluido', corregir:'Corrección' };
    const tipoColor = { hs_real:'var(--text2)', agregar:'var(--green)', excluir:'var(--red)', corregir:'var(--orange)' };

    return history.map(h => `
      <div style="display:grid;grid-template-columns:110px 120px 80px 1fr 120px;
        gap:6px;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);font-size:11px">
        <div style="color:var(--text3)">${h.ts.slice(0,16).replace('T',' ')}</div>
        <div style="font-weight:700;color:var(--text)">${h.equipo}</div>
        <div style="color:${tipoColor[h.tipo]||'var(--text2)'};font-weight:700">
          ${tipoLabel[h.tipo] || h.tipo}
        </div>
        <div style="color:var(--text2)">
          ${h.original ? `Orig: ${Fmt.num(h.original.h||0,2)}hs / ${Fmt.num(h.original.c||0,0)}m³ → ` : ''}
          Nuevo: ${Fmt.num(h.nuevo?.h||0,2)}hs / ${Fmt.num(h.nuevo?.c||0,0)}m³
        </div>
        <div style="color:var(--text3);font-size:10px">${h.label || h.usuario}</div>
      </div>`).join('');
  }

  // ── ACTUALIZACIÓN DINÁMICA POR FILA ─────────────────────────────────────────
  function updRow(i) {
    const inp  = document.getElementById(`pcp-h${i}`);
    if (!inp) return;
    const hs   = parseFloat(inp.value) || 0;
    const cme  = parseFloat(inp.dataset.cme) || 0;
    const prog = parseFloat(inp.dataset.prog) || 0;
    const cons = Math.round(hs * cme * 100) / 100;
    const desv = cons - prog;
    const el   = document.getElementById(`pcp-r${i}`);
    if (el) {
      el.style.color = desv > 100 ? 'var(--orange)' : desv < -100 ? 'var(--accent)' : 'var(--green)';
      el.textContent = `Consumo Real: ${Fmt.num(cons, 0)} m³  |  Desvío: ${desv >= 0 ? '+' : ''}${Fmt.num(desv, 0)} m³`;
    }
  }

  function bindRows(n) {
    for (let i = 0; i < n; i++) {
      const el = document.getElementById(`pcp-h${i}`);
      if (el) el.addEventListener('input', () => updRow(i));
    }
  }

  // ── CÁLCULO CONSUMO EQUIPO AGREGADO ─────────────────────────────────────────
  function calcAddCons() {
    const eqName = document.getElementById('pcp-add-eq')?.value;
    const hs     = parseFloat(document.getElementById('pcp-add-hs')?.value) || 0;
    const eq     = eqName ? Repository.getEquipo(eqName) : null;
    const cons   = eq ? Math.round(eq.cme * hs * 100) / 100 : 0;
    const el     = document.getElementById('pcp-add-cons');
    if (el) el.value = eq && hs > 0 ? `${Fmt.num(cons, 0)} m³` : '—';
  }

  // ── GUARDAR HORAS REALES ─────────────────────────────────────────────────────
  function save(n, fecha) {
    // Validación de flujo
    const flow = FlowEngine.canSave('pcp', fecha);
    if (!flow.ok) {
      UI.notify('Existen registros anteriores pendientes. Complete los datos requeridos.', 'err');
      return;
    }

    let saved = 0;
    for (let i = 0; i < n; i++) {
      const inp = document.getElementById(`pcp-h${i}`);
      if (!inp) continue;
      const hs = parseFloat(inp.value);
      if (isNaN(hs)) continue;
      if (hs < 0 || hs > 24) {
        UI.notify(`Horas inválidas para ${eq}: debe ser entre 0 y 24 hs`, 'err');
        return;
      }

      const eq  = inp.dataset.eq;
      const cme = parseFloat(inp.dataset.cme) || 0;
      const c   = Math.round(cme * hs * 100) / 100;
      const obs = document.getElementById(`pcp-o${i}`)?.value || '';

      const existing = AppState.db.prod.find(r => r.f === fecha && r.eq === eq && r.cl === 'REAL');
      if (existing) {
        const original = { h: existing.h, c: existing.c };
        AppState.updateProdRecord(existing.i, { h: hs, c, obs });
        FlowEngine.savePcpModification(fecha, eq, 'hs_real', { h: hs, c, obs }, original);
      } else {
        const eqData = Repository.getEquipo(eq) || {};
        AppState.addProdRecord({
          i: AppState.nextProdId(), f: fecha, eq, cme,
          tipo: inp.dataset.tipo, sec: inp.dataset.sec,
          cl: 'REAL', h: hs,
          pci: parseFloat(inp.dataset.pci) || CONFIG.energia.pciRef,
          fc: 1, ef: 1, c, obs,
        });
        FlowEngine.savePcpModification(fecha, eq, 'hs_real', { h: hs, c, obs }, null);
      }
      saved++;
    }

    UI.notifyGuardado('Horas reales PCP', { fecha, valor: saved, unidad: 'equipos' });
    if (typeof SyncEngine !== 'undefined') SyncEngine.push();
    UI.updateTopbar();
    reloadAll(fecha);
  }

  // ── AGREGAR EQUIPO NO PLANIFICADO ─────────────────────────────────────────────
  function addEquipo(fecha) {
    const flow = FlowEngine.canSave('pcp', fecha);
    if (!flow.ok) { UI.notify('Existen registros anteriores pendientes.', 'err'); return; }

    const eqName = document.getElementById('pcp-add-eq')?.value;
    const hs     = parseFloat(document.getElementById('pcp-add-hs')?.value);
    const obs    = document.getElementById('pcp-add-obs')?.value || '';

    if (!eqName) { UI.notify('Seleccione un equipo', 'err'); return; }
    if (isNaN(hs) || hs < 0) { UI.notify('Ingrese las horas reales', 'err'); return; }

    const eq = Repository.getEquipo(eqName);
    if (!eq) { UI.notify('Equipo no encontrado', 'err'); return; }

    const c = Math.round(eq.cme * hs * 100) / 100;
    const ld = Repository.getDistForDate(fecha);

    // Verificar si ya existe REAL para este equipo
    const existing = AppState.db.prod.find(r => r.f === fecha && r.eq === eqName && r.cl === 'REAL');
    if (existing) {
      AppState.updateProdRecord(existing.i, { h: hs, c, obs });
    } else {
      AppState.addProdRecord({
        i: AppState.nextProdId(), f: fecha, eq: eqName,
        cme: eq.cme, tipo: eq.tipo, sec: eq.sec,
        cl: 'REAL', h: hs,
        pci: ld?.pci || CONFIG.energia.pciRef,
        fc: 1, ef: 1, c, obs,
      });
    }

    FlowEngine.savePcpModification(fecha, eqName, 'agregar', { h: hs, c, obs }, null);
    UI.notify(`✓ ${eqName} agregado`);
    reloadAll(fecha);
  }

  // ── QUITAR EQUIPO AGREGADO ───────────────────────────────────────────────────
  function removeAgregado(id) {
    const rec = AppState.db.prod.find(r => r.i === id);
    if (!rec) return;
    FlowEngine.savePcpModification(rec.f, rec.eq, 'excluir', { h: 0, c: 0 }, { h: rec.h, c: rec.c });
    AppState.updateProdRecord(id, { h: 0, c: 0, obs: 'EXCLUIDO POR PCP' });
    UI.notify(`✓ ${rec.eq} excluido del día`);
    reloadAll(rec.f);
  }

  // ── RECARGAR TODO ────────────────────────────────────────────────────────────
  function reloadAll(fecha) {
    const proyDia = AppState.db.prod.filter(r => r.f === fecha && r.cl === 'PROYECTADA');
    const n = proyDia.length;

    const tbl = document.getElementById('pcp-table');
    if (tbl) { tbl.innerHTML = buildEquiposTable(fecha); bindRows(n); }

    const addTbl = document.getElementById('pcp-add-table');
    if (addTbl) { addTbl.innerHTML = buildAgregadosTable(fecha); bindAddListeners(fecha); }

    const hisTbl = document.getElementById('pcp-history');
    if (hisTbl) hisTbl.innerHTML = buildHistoryTable(fecha);

    // Rebind save button
    const btnSave = document.getElementById('pcp-save');
    if (btnSave) {
      const nb = btnSave.cloneNode(true);
      btnSave.parentNode.replaceChild(nb, btnSave);
      nb.id = 'pcp-save';
      nb.addEventListener('click', () => save(n, fecha));
    }

    // Rebind remove agregados
    document.querySelectorAll('.pcp-rm-agregado').forEach(btn => {
      btn.addEventListener('click', () => removeAgregado(parseInt(btn.dataset.id)));
    });
  }

  // ── BIND LISTENERS AGREGAR ───────────────────────────────────────────────────
  function bindAddListeners(fecha) {
    document.getElementById('pcp-add-eq')?.addEventListener('change', calcAddCons);
    document.getElementById('pcp-add-hs')?.addEventListener('input', calcAddCons);
    document.getElementById('pcp-add-btn')?.addEventListener('click', () => addEquipo(fecha));
    document.querySelectorAll('.pcp-rm-agregado').forEach(btn => {
      btn.addEventListener('click', () => removeAgregado(parseInt(btn.dataset.id)));
    });
  }

  // ── RENDER PRINCIPAL ────────────────────────────────────────────────────────
  function render() {
    const lastDate = Repository.getLastProdDate() || FlowEngine.hoy();
    const proyDia  = AppState.db.prod.filter(r => r.f === lastDate && r.cl === 'PROYECTADA');
    const n        = proyDia.length;

    // Validaciones de flujo
    const flow     = FlowEngine.canSave('pcp', lastDate);
    const status   = FlowEngine.getDayStatus(lastDate);

    const meta     = FlowEngine.getEstadoMeta(status.estado);

    document.getElementById('view-form-pcp').innerHTML = `
      <div class="pg-title">Formulario PCP — Horas Reales y Plan Operativo</div>
      <div class="pg-desc">Ingrese las horas máquina reales, corrija el plan y agregue o excluya equipos. Toda modificación queda registrada con trazabilidad completa.</div>

      ${buildBlockBanner(flow.bloqueadoPor)}
      ${buildWarnBanner(status)}

      <div class="fcard">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div class="fcard-title" style="margin:0">⏱ DÍA OPERATIVO</div>
          <div style="display:flex;gap:8px;align-items:center">
            <div style="background:${meta.bg};border-radius:4px;padding:3px 9px;
              font-family:Calibri,var(--fontc);font-size:10px;font-weight:700;color:${meta.color}">
              ${meta.label}
            </div>
            <input type="date" class="fctl yel" id="pcp-f" value="${lastDate}" style="width:155px">
            <button class="btn-sec" id="pcp-reload" style="font-size:11px">↺ Recargar</button>
          </div>
        </div>

        <!-- HORAS REALES -->
        <div style="font-family:Calibri,var(--fontc);font-size:11px;font-weight:700;
          color:var(--text2);margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border)">
          EQUIPOS PLANIFICADOS — INGRESO DE HORAS REALES
        </div>
        <div id="pcp-table">${buildEquiposTable(lastDate)}</div>

        <div class="factions" style="margin-top:10px">
          <button class="btn-pri" id="pcp-save">✓ Guardar Horas Reales</button>
        </div>
      </div>

      <!-- EQUIPOS AGREGADOS / EXCLUIDOS -->
      <div class="fcard">
        <div class="fcard-title">➕ MODIFICACIONES AL PLAN — EQUIPOS NO PLANIFICADOS</div>
        <div id="pcp-add-table">${buildAgregadosTable(lastDate)}</div>
      </div>

      <!-- HISTORIAL DE MODIFICACIONES -->
      <div class="fcard">
        <div class="fcard-title">📋 HISTORIAL DE MODIFICACIONES — ${Fmt.date(lastDate)}</div>
        <div id="pcp-history">${buildHistoryTable(lastDate)}</div>
      </div>`;

    // Bind
    bindRows(n);
    bindAddListeners(lastDate);

    document.getElementById('pcp-f').addEventListener('change', () => {
      const f = document.getElementById('pcp-f').value;
      reloadAll(f);
    });
    document.getElementById('pcp-reload').addEventListener('click', () => {
      const f = document.getElementById('pcp-f').value;
      reloadAll(f);
    });
    document.getElementById('pcp-save').addEventListener('click', () => {
      const f = document.getElementById('pcp-f').value;
      const proy = AppState.db.prod.filter(r => r.f === f && r.cl === 'PROYECTADA');
      save(proy.length, f);
    });
  }

  return { render };

})();
