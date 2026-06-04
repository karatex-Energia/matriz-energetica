/**
 * js/views/resumenTurno.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Resumen de Turno Automático · Colortex SA · Matriz Energética
 *
 * Genera al cierre de cada turno (06h / 14h / 22h) un resumen con:
 *   · Consumo real vs proyectado del turno
 *   · Alertas activas en el turno
 *   · Lecturas de caudalímetro del turno
 *   · Balance de producción vs plan
 *   · Estado de SharePoint y cola offline
 *
 * El resumen se puede exportar como CSV o imprimir directamente.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

if (typeof Views === 'undefined') window.Views = {};

Views.ResumenTurno = (() => {

  let _fechaSel = null;
  let _turnoSel = null;

  // ── HELPERS ──────────────────────────────────────────────────────────────────

  const TURNOS = [
    { id:'T1', label:'Turno Mañana',  inicio:'06:00', fin:'14:00', hora_lect:'06:00' },
    { id:'T2', label:'Turno Tarde',   inicio:'14:00', fin:'22:00', hora_lect:'14:00' },
    { id:'T3', label:'Turno Noche',   inicio:'22:00', fin:'06:00', hora_lect:'22:00' },
  ];

  function _hoy() { return new Date().toISOString().slice(0,10); }

  function _turnoActual() {
    const h = new Date().getHours();
    if (h >= 6  && h < 14) return 'T1';
    if (h >= 14 && h < 22) return 'T2';
    return 'T3';
  }

  function _getTurno(id) {
    return TURNOS.find(t => t.id === id) || TURNOS[0];
  }

  // ── CÁLCULO DEL TURNO ────────────────────────────────────────────────────────

  function calcTurno(fecha, turnoId) {
    const turno   = _getTurno(turnoId);
    const prod    = AppState.db.prod || [];
    const lect    = AppState.db.lect || [];
    const dist    = AppState.db.dist || [];

    // Registros del día
    const prodDia = prod.filter(p => p.f === fecha);
    const lectDia = lect.filter(l => l.f === fecha);
    const distDia = dist.find(d => d.f === fecha);

    // Lectura del turno (por hora de inicio)
    const lectTurno = lectDia.filter(l => l.h === turno.hora_lect);

    // Consumo proyectado y real del día completo
    const consProy = prodDia.filter(p => p.cl === 'PROYECTADA').reduce((a,p) => a+(p.c||0), 0);
    const consReal = prodDia.filter(p => p.cl === 'REAL').reduce((a,p) => a+(p.c||0), 0);

    // Estimación del turno (1/3 del día para simplificar, o por horas)
    // Si hay proyectada por turno, usar esas; si no, prorratar
    const totalHsProy = prodDia.filter(p=>p.cl==='PROYECTADA').reduce((a,p)=>a+(p.h||0),0);
    const hsxTurno = 8; // 8 horas por turno
    const factorTurno = totalHsProy > 0 ? Math.min(1, hsxTurno / 24) : 1/3;

    const consPrTurno = consProy * factorTurno;
    const consRlTurno = consReal * factorTurno;

    // Desvío
    const desvioAbs = consRlTurno - consPrTurno;
    const desvioPct = consPrTurno > 0 ? (desvioAbs / consPrTurno * 100) : 0;

    // Alertas activas
    const alertas = typeof AlertEngine !== 'undefined' ? AlertEngine.evaluar() : [];

    // Equipos en marcha (REAL del día)
    const equiposReal = prodDia
      .filter(p => p.cl === 'REAL' && p.hr > 0)
      .sort((a,b) => (b.c||0)-(a.c||0));

    // Estado sistema
    const spOnline = typeof SPRepository !== 'undefined' && SPRepository.isOnline();
    const queueN   = typeof OfflineQueue !== 'undefined' ? OfflineQueue.count() : 0;

    return {
      fecha, turno,
      consProy, consReal, consPrTurno, consRlTurno,
      desvioAbs, desvioPct,
      distDia,
      lectTurno,
      equiposReal,
      alertas,
      spOnline, queueN,
      generado: new Date().toLocaleString('es-AR'),
    };
  }

  // ── UI ────────────────────────────────────────────────────────────────────────

  function buildControles() {
    const hoy    = _hoy();
    const tActual = _turnoActual();
    if (!_fechaSel) _fechaSel = hoy;
    if (!_turnoSel) _turnoSel = tActual;

    const turnoOpts = TURNOS.map(t =>
      `<option value="${t.id}" ${t.id===_turnoSel?'selected':''}>${t.label} (${t.inicio}–${t.fin})</option>`
    ).join('');

    return `
    <div class="seg-panel" style="padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span class="seg-lbl">FECHA</span>
      <input type="date" id="rt-fecha" class="seg-btn"
        value="${_fechaSel}" max="${hoy}"
        style="height:32px;padding:4px 10px;font-size:12px">
      <span class="seg-lbl">TURNO</span>
      <select id="rt-turno" class="seg-btn" style="height:32px;padding:4px 10px;font-size:12px">
        ${turnoOpts}
      </select>
      <span style="margin-left:auto;display:flex;gap:6px">
        <button class="seg-btn" id="rt-print" title="Imprimir">🖨️ Imprimir</button>
        <button class="seg-btn" id="rt-export" style="background:var(--accent);color:#fff">&#11015; CSV</button>
      </span>
    </div>`;
  }

  function buildResumen(k) {
    const desvColor = Math.abs(k.desvioPct) < 5 ? 'var(--green)'
      : Math.abs(k.desvioPct) < 15 ? 'var(--orange)' : 'var(--red)';
    const desvIco   = k.desvioAbs > 0 ? '↑' : k.desvioAbs < 0 ? '↓' : '→';

    return `
    <!-- Header del resumen -->
    <div style="
      background:linear-gradient(145deg,var(--bg2),var(--bg3));
      border:1px solid var(--border2);border-radius:10px;
      padding:16px 20px;margin-bottom:12px;
      display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px
    ">
      <div>
        <div style="font-family:var(--fontc);font-size:18px;font-weight:700;color:var(--text)">
          ${k.turno.label}
        </div>
        <div style="font-family:var(--fontc);font-size:12px;color:var(--text3);margin-top:2px">
          ${k.fecha} · ${k.turno.inicio} → ${k.turno.fin} · Generado: ${k.generado}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span style="
          padding:4px 10px;border-radius:6px;font-family:var(--fontc);
          font-size:11px;font-weight:700;
          background:${k.spOnline?'rgba(34,197,94,.1)':'rgba(239,68,68,.1)'};
          color:${k.spOnline?'#22C55E':'#EF4444'};
          border:1px solid ${k.spOnline?'rgba(34,197,94,.3)':'rgba(239,68,68,.3)'}
        ">${k.spOnline?'⬤ SP Online':'⬤ SP Offline'}</span>
        ${k.queueN > 0 ? `<span style="
          padding:4px 10px;border-radius:6px;font-family:var(--fontc);
          font-size:11px;font-weight:700;background:rgba(234,179,8,.1);
          color:#EAB308;border:1px solid rgba(234,179,8,.3)
        ">📤 ${k.queueN} pendientes</span>` : ''}
      </div>
    </div>

    <!-- KPI cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:12px">
      <div class="kpi-card" style="border-color:var(--accent)">
        <div class="kpi-label">CONSUMO PROYECTADO</div>
        <div class="kpi-val">${Fmt.num(k.consProy,0)}</div>
        <div class="kpi-sub">m³ día completo</div>
      </div>
      <div class="kpi-card" style="border-color:#22C55E">
        <div class="kpi-label">CONSUMO REAL</div>
        <div class="kpi-val" style="color:#22C55E">${Fmt.num(k.consReal,0)}</div>
        <div class="kpi-sub">m³ registrado</div>
      </div>
      <div class="kpi-card" style="border-color:${desvColor}">
        <div class="kpi-label">DESVÍO DÍA</div>
        <div class="kpi-val" style="color:${desvColor}">
          ${desvIco} ${Math.abs(k.desvioPct).toFixed(1)}%
        </div>
        <div class="kpi-sub">${k.desvioAbs >= 0 ? '+' : ''}${Fmt.num(k.desvioAbs,0)} m³</div>
      </div>
      ${k.distDia ? `
      <div class="kpi-card" style="border-color:#EAB308">
        <div class="kpi-label">AUTORIZADO HOY</div>
        <div class="kpi-val" style="color:#EAB308">${Fmt.num(k.distDia.aut||0,0)}</div>
        <div class="kpi-sub">m³ · ${k.distDia.rest>0?'⚠ RESTRICCIÓN':'Sin restricción'}</div>
      </div>` : ''}
      <div class="kpi-card">
        <div class="kpi-label">ALERTAS ACTIVAS</div>
        <div class="kpi-val" style="color:${k.alertas.length?'#EF4444':'#22C55E'}">
          ${k.alertas.length}
        </div>
        <div class="kpi-sub">${k.alertas.length?'Requieren atención':'Sistema OK'}</div>
      </div>
    </div>

    <!-- Alertas activas en el turno -->
    ${k.alertas.length ? `
    <div class="panel-section" style="margin-bottom:12px">
      <div class="panel-section-title">⚠ ALERTAS DEL TURNO</div>
      ${k.alertas.slice(0,5).map(a => `
        <div style="display:flex;gap:10px;align-items:center;padding:6px 0;
             border-bottom:1px solid var(--border);font-size:12px">
          <span>${a.nivel.icono}</span>
          <div>
            <span style="color:${a.nivel.color};font-weight:600">${a.titulo}</span>
            <span style="color:var(--text3);margin-left:8px">${a.detalle}</span>
          </div>
        </div>`).join('')}
    </div>` : ''}

    <!-- Lecturas del turno -->
    ${k.lectTurno.length ? `
    <div class="panel-section" style="margin-bottom:12px">
      <div class="panel-section-title">📡 LECTURAS CAUDALÍMETRO — ${k.turno.hora_lect}</div>
      <table class="data-table" style="width:100%">
        <thead><tr><th>Ubicación</th><th style="text-align:right">Caudal m³/h</th></tr></thead>
        <tbody>
          ${k.lectTurno.map(l => `
            <tr>
              <td>${l.ub}</td>
              <td style="text-align:right;font-weight:600">${Fmt.num(l.c,0)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : `
    <div class="panel-section" style="margin-bottom:12px">
      <div class="panel-section-title">📡 LECTURAS CAUDALÍMETRO — ${k.turno.hora_lect}</div>
      <div class="no-data-badge">Sin lecturas registradas para este turno</div>
    </div>`}

    <!-- Equipos en marcha -->
    ${k.equiposReal.length ? `
    <div class="panel-section" style="margin-bottom:12px">
      <div class="panel-section-title">🔧 EQUIPOS CON HORAS REALES — ${k.fecha}</div>
      <table class="data-table" style="width:100%">
        <thead>
          <tr>
            <th>Equipo</th>
            <th>Sector</th>
            <th style="text-align:right">Hs reales</th>
            <th style="text-align:right">Consumo m³</th>
          </tr>
        </thead>
        <tbody>
          ${k.equiposReal.map(p => `
            <tr>
              <td>${p.eq}</td>
              <td style="font-size:11px;color:var(--text3)">${p.sec}</td>
              <td style="text-align:right">${Fmt.num(p.hr||0,1)}</td>
              <td style="text-align:right;font-weight:600">${Fmt.num(p.c||0,0)}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr style="font-weight:700;border-top:2px solid var(--border)">
            <td colspan="3">TOTAL</td>
            <td style="text-align:right">${Fmt.num(k.consReal,0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>` : `
    <div class="panel-section" style="margin-bottom:12px">
      <div class="panel-section-title">🔧 EQUIPOS EN MARCHA</div>
      <div class="no-data-badge">Sin datos de horas reales para ${k.fecha}</div>
    </div>`}
    `;
  }

  // ── EXPORTAR CSV ──────────────────────────────────────────────────────────────

  function exportar(k) {
    const rows = [
      [`RESUMEN DE TURNO — ${k.turno.label}`],
      [`Fecha: ${k.fecha} · ${k.turno.inicio}–${k.turno.fin}`],
      [`Generado: ${k.generado}`],
      [],
      ['CONSUMO GAS NATURAL'],
      ['Proyectado día m³','Real día m³','Desvío m³','Desvío %'],
      [k.consProy.toFixed(0), k.consReal.toFixed(0),
       k.desvioAbs.toFixed(0), k.desvioPct.toFixed(1)+'%'],
      [],
    ];

    if (k.distDia) {
      rows.push(['DISTRIBUIDORA']);
      rows.push(['Autorizado m³','Restringido m³','Disponible m³']);
      rows.push([k.distDia.aut||0, k.distDia.rest||0, k.distDia.disp||0]);
      rows.push([]);
    }

    if (k.lectTurno.length) {
      rows.push([`LECTURAS CAUDALÍMETRO — ${k.turno.hora_lect}`]);
      rows.push(['Ubicación','Caudal m³/h']);
      k.lectTurno.forEach(l => rows.push([l.ub, l.c]));
      rows.push([]);
    }

    if (k.equiposReal.length) {
      rows.push(['EQUIPOS CON HORAS REALES']);
      rows.push(['Equipo','Sector','Hs reales','Consumo m³']);
      k.equiposReal.forEach(p => rows.push([p.eq, p.sec, p.hr||0, p.c||0]));
      rows.push([]);
    }

    if (k.alertas.length) {
      rows.push(['ALERTAS ACTIVAS']);
      rows.push(['Nivel','Módulo','Título','Detalle','Acción']);
      k.alertas.forEach(a => rows.push([a.nivel.label, a.modulo, a.titulo, a.detalle, a.accion]));
    }

    rows.push([]);
    rows.push([`Estado SP: ${k.spOnline?'Online':'Offline'} · Cola: ${k.queueN} pendientes`]);

    CsvExport._download(rows, `Karatex_Turno_${k.fecha}_${k.turno.id}.csv`);
    UI.notify(`✓ Resumen ${k.turno.label} ${k.fecha} exportado`, '', 3000);
  }

  // ── RENDER ────────────────────────────────────────────────────────────────────

  function render() {
    const container = document.getElementById('view-resumen-turno');
    if (!container) return;

    if (!_fechaSel) _fechaSel = _hoy();
    if (!_turnoSel) _turnoSel = _turnoActual();

    const k = calcTurno(_fechaSel, _turnoSel);

    container.innerHTML = `
      ${buildControles()}
      <div id="rt-body" style="margin-top:12px">
        ${buildResumen(k)}
      </div>
    `;

    // Bind
    document.getElementById('rt-fecha')?.addEventListener('change', e => {
      _fechaSel = e.target.value; render();
    });
    document.getElementById('rt-turno')?.addEventListener('change', e => {
      _turnoSel = e.target.value; render();
    });
    document.getElementById('rt-export')?.addEventListener('click', () => exportar(k));
    document.getElementById('rt-print')?.addEventListener('click', () => window.print());
  }

  return { render };

})();
