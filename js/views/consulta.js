/**
 * js/views/consulta.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vista Consulta de Datos — Colortex SA · Matriz Energética
 * Versión mejorada: filtros avanzados, exportación selectiva, comparación de períodos
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

if (typeof Views === 'undefined') window.Views = {};

Views.Consulta = (() => {

  // ── HELPERS ─────────────────────────────────────────────────────────────────

  function getEquipos() {
    return [...new Set(AppState.db.prod.map(r => r.eq))].sort();
  }
  function getSectores() {
    return [...new Set(AppState.db.prod.map(r => r.sec).filter(Boolean))].sort();
  }
  function getFechas() {
    return [...new Set(AppState.db.prod.map(r => r.f))].sort();
  }

  // ── FILTROS ──────────────────────────────────────────────────────────────────

  function getFiltered() {
    const q      = document.getElementById('q-s')?.value.toLowerCase()     || '';
    const fDesde = document.getElementById('q-desde')?.value               || '';
    const fHasta = document.getElementById('q-hasta')?.value               || '';
    const fEq    = document.getElementById('q-eq')?.value                  || '';
    const fSec   = document.getElementById('q-sec')?.value                 || '';
    const fTipo  = document.getElementById('q-tipo')?.value                || '';
    const fCl    = document.getElementById('q-cl')?.value                  || '';

    return AppState.db.prod
      .filter(r => {
        if (fDesde && r.f < fDesde) return false;
        if (fHasta && r.f > fHasta) return false;
        if (fEq   && r.eq   !== fEq)   return false;
        if (fSec  && r.sec  !== fSec)  return false;
        if (fTipo && r.tipo !== fTipo) return false;
        if (fCl   && r.cl   !== fCl)   return false;
        if (q && !`${r.f} ${r.eq} ${r.sec} ${r.tipo} ${r.cl}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.f.localeCompare(a.f) || a.eq.localeCompare(b.eq));
  }

  // ── TABLA DE RESULTADOS ──────────────────────────────────────────────────────

  function buildRows(data) {
    if (!data.length) {
      return '<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:18px">Sin registros para los filtros seleccionados</td></tr>';
    }
    return data.map(r => {
      const cc = r.cl === 'REAL' ? 'cg' : r.cl === 'PROYECTADA' ? 'cb' : 'co';
      const ct = r.tipo === 'DIRECTO' ? 'cb' : r.tipo === 'MIXTO' ? 'co' : 'cgr';
      return `<tr>
        <td>${Fmt.date(r.f)}</td>
        <td class="v">${r.eq}</td>
        <td>${r.sec || '—'}</td>
        <td><span class="chip ${ct}">${r.tipo}</span></td>
        <td><span class="chip ${cc}">${r.cl}</span></td>
        <td class="v">${Fmt.num(r.h, 2)} hs</td>
        <td class="v">${Fmt.num(r.cme)} m³/h</td>
        <td class="v">${Fmt.num(r.c)} m³</td>
        <td>${Fmt.num(r.pci)}</td>
      </tr>`;
    }).join('');
  }

  // ── TOTALES ───────────────────────────────────────────────────────────────────

  function buildTotales(data) {
    const real  = data.filter(r => r.cl === 'REAL');
    const proy  = data.filter(r => r.cl === 'PROYECTADA');
    const totR  = real.reduce((a, r) => a + r.c, 0);
    const totP  = proy.reduce((a, r) => a + r.c, 0);
    const totHR = real.reduce((a, r) => a + r.h, 0);
    const dA    = totR - totP;
    const dR    = totP ? (dA / totP * 100) : 0;
    return `
      <div style="display:flex;gap:10px;flex-wrap:wrap;padding:8px 0;font-family:Calibri,var(--fontc);font-size:12px;border-top:1px solid var(--border);margin-top:6px">
        <span style="color:var(--text3)">Registros: <strong style="color:var(--text)">${data.length}</strong></span>
        <span style="color:var(--text3)">Cons. Real: <strong style="color:var(--green)">${Fmt.num(totR)} m³</strong></span>
        <span style="color:var(--text3)">Cons. Prog.: <strong style="color:var(--accent)">${Fmt.num(totP)} m³</strong></span>
        <span style="color:var(--text3)">Hs reales: <strong style="color:var(--text)">${Fmt.num(totHR, 1)} hs</strong></span>
        <span style="color:var(--text3)">Desvío: <strong style="color:${dA >= 0 ? 'var(--orange)' : 'var(--accent)'}">${dA >= 0 ? '+' : ''}${Fmt.num(dA)} m³ (${dA >= 0 ? '+' : ''}${Fmt.num(dR, 1)}%)</strong></span>
      </div>`;
  }

  // ── COMPARADOR DE PERÍODOS ────────────────────────────────────────────────────

  function buildComparador() {
    const fechas = getFechas();
    if (fechas.length < 2) return '';
    const fMin = fechas[0], fMax = fechas[fechas.length - 1];

    return `
      <div class="fcard" style="margin-bottom:8px">
        <div class="fcard-title">📊 COMPARACIÓN DE PERÍODOS</div>
        <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;margin-bottom:10px">
          <div>
            <div class="flabel">Período A</div>
            <div style="display:flex;gap:4px">
              <input type="date" class="fctl" id="cmp-a-desde" value="${fMin}" min="${fMin}" max="${fMax}" style="flex:1">
              <span style="align-self:center;color:var(--text3);font-size:11px">al</span>
              <input type="date" class="fctl" id="cmp-a-hasta" value="${fechas[Math.min(6, fechas.length-1)]}" min="${fMin}" max="${fMax}" style="flex:1">
            </div>
          </div>
          <div>
            <div class="flabel">Período B</div>
            <div style="display:flex;gap:4px">
              <input type="date" class="fctl" id="cmp-b-desde" value="${fechas[Math.max(0, fechas.length-8)]}" min="${fMin}" max="${fMax}" style="flex:1">
              <span style="align-self:center;color:var(--text3);font-size:11px">al</span>
              <input type="date" class="fctl" id="cmp-b-hasta" value="${fMax}" min="${fMin}" max="${fMax}" style="flex:1">
            </div>
          </div>
          <button class="btn-pri" id="cmp-run">Comparar</button>
        </div>
        <div id="cmp-result"></div>
      </div>`;
  }

  function runComparacion() {
    const aD = document.getElementById('cmp-a-desde')?.value;
    const aH = document.getElementById('cmp-a-hasta')?.value;
    const bD = document.getElementById('cmp-b-desde')?.value;
    const bH = document.getElementById('cmp-b-hasta')?.value;
    if (!aD || !aH || !bD || !bH) return;

    const prod = AppState.db.prod;
    const pA = prod.filter(r => r.f >= aD && r.f <= aH);
    const pB = prod.filter(r => r.f >= bD && r.f <= bH);

    function stats(arr) {
      const real = arr.filter(r => r.cl === 'REAL');
      const proy = arr.filter(r => r.cl === 'PROYECTADA');
      const totR = real.reduce((a, r) => a + r.c, 0);
      const totP = proy.reduce((a, r) => a + r.c, 0);
      const totH = real.reduce((a, r) => a + r.h, 0);
      const dA   = totR - totP;
      const dR   = totP ? dA / totP * 100 : 0;
      const dias  = [...new Set(arr.map(r => r.f))].length;
      return { totR, totP, totH, dA, dR, dias, arr };
    }

    const sA = stats(pA), sB = stats(pB);

    function diff(vA, vB) {
      const d = vA - vB;
      const pct = vB ? d / vB * 100 : 0;
      const col = d > 0 ? 'var(--green)' : d < 0 ? 'var(--red)' : 'var(--text3)';
      return `<span style="color:${col};font-size:10px">${d >= 0 ? '+' : ''}${Fmt.num(d)} (${pct >= 0 ? '+' : ''}${Fmt.num(pct, 1)}%)</span>`;
    }

    const rows = [
      ['Días con datos',      sA.dias,  sB.dias,  false],
      ['Consumo Real (m³)',   sA.totR,  sB.totR,  true],
      ['Consumo Prog. (m³)',  sA.totP,  sB.totP,  true],
      ['Hs máquina reales',   sA.totH,  sB.totH,  true],
      ['Desvío Absoluto m³',  sA.dA,    sB.dA,    false],
      ['Desvío Relativo %',   sA.dR,    sB.dR,    false],
    ];

    const rowsHtml = rows.map(([lbl, vA, vB, showDiff], i) => `
      <tr style="background:${i%2===0?'var(--bg2)':'var(--bg3)'}">
        <td style="padding:7px 10px;font-family:Calibri,var(--fontc);font-size:12px;color:var(--text2)">${lbl}</td>
        <td style="padding:7px 10px;font-family:Calibri,var(--fontc);font-size:13px;font-weight:700;color:var(--accent);text-align:right">${Fmt.num(vA, 1)}</td>
        <td style="padding:7px 10px;font-family:Calibri,var(--fontc);font-size:13px;font-weight:700;color:var(--text);text-align:right">${Fmt.num(vB, 1)}</td>
        <td style="padding:7px 10px;text-align:right">${showDiff ? diff(vA, vB) : '—'}</td>
      </tr>`).join('');

    // Comparación por equipo
    const equipos = [...new Set([...pA, ...pB].map(r => r.eq))].sort();
    const eqRows = equipos.map((eq, i) => {
      const rA = pA.filter(r => r.eq === eq && r.cl === 'REAL').reduce((a,r)=>a+r.c,0);
      const rB = pB.filter(r => r.eq === eq && r.cl === 'REAL').reduce((a,r)=>a+r.c,0);
      if (!rA && !rB) return '';
      return `<tr style="background:${i%2===0?'var(--bg2)':'var(--bg3)'}">
        <td style="padding:5px 10px;font-size:11px;color:var(--text2)">${eq}</td>
        <td style="padding:5px 10px;font-size:12px;font-weight:600;color:var(--accent);text-align:right">${Fmt.num(rA)} m³</td>
        <td style="padding:5px 10px;font-size:12px;font-weight:600;color:var(--text);text-align:right">${Fmt.num(rB)} m³</td>
        <td style="padding:5px 10px;text-align:right">${diff(rA, rB)}</td>
      </tr>`;
    }).join('');

    document.getElementById('cmp-result').innerHTML = `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;border-radius:6px;overflow:hidden">
          <thead><tr style="background:var(--accent)">
            <th style="padding:8px 10px;text-align:left;font-family:Calibri,var(--fontc);font-size:11px;font-weight:700;color:#fff">INDICADOR</th>
            <th style="padding:8px 10px;text-align:right;font-family:Calibri,var(--fontc);font-size:11px;font-weight:700;color:#fff">PERÍODO A · ${Fmt.date(aD)} – ${Fmt.date(aH)}</th>
            <th style="padding:8px 10px;text-align:right;font-family:Calibri,var(--fontc);font-size:11px;font-weight:700;color:#fff">PERÍODO B · ${Fmt.date(bD)} – ${Fmt.date(bH)}</th>
            <th style="padding:8px 10px;text-align:right;font-family:Calibri,var(--fontc);font-size:11px;font-weight:700;color:#fff">VARIACIÓN A vs B</th>
          </tr>${rowsHtml}</table>
      </div>
      ${eqRows ? `
      <div style="margin-top:10px;font-family:Calibri,var(--fontc);font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Consumo Real por Equipo</div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--bg3)">
          <th style="padding:5px 10px;text-align:left;font-size:10px;color:var(--text3)">EQUIPO</th>
          <th style="padding:5px 10px;text-align:right;font-size:10px;color:var(--accent)">PERÍODO A</th>
          <th style="padding:5px 10px;text-align:right;font-size:10px;color:var(--text3)">PERÍODO B</th>
          <th style="padding:5px 10px;text-align:right;font-size:10px;color:var(--text3)">VARIACIÓN</th>
        </tr>${eqRows}</table></div>` : ''}`;
  }

  // ── EXPORTACIÓN SELECTIVA ─────────────────────────────────────────────────────

  function exportFiltered() {
    const data = getFiltered();
    if (!data.length) { UI.notify('Sin datos para exportar con los filtros actuales', 'err'); return; }
    const header = 'Fecha,Equipo,Sector,Tipo,Clasificacion,Horas,CME,Consumo_m3,PCI\n';
    const rows   = data.map(r =>
      `${r.f},"${r.eq}","${r.sec||''}",${r.tipo},${r.cl},${r.h},${r.cme},${r.c},${r.pci}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `colortex_consulta_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    UI.notify(`✓ Exportados ${data.length} registros`);
  }

  // ── REFRESH DE TABLA ──────────────────────────────────────────────────────────

  function refreshTable() {
    const data = getFiltered();
    const tbody = document.getElementById('q-tbody');
    if (tbody) tbody.innerHTML = buildRows(data);
    const tot = document.getElementById('q-totales');
    if (tot) tot.innerHTML = buildTotales(data);
  }

  // ── RENDER PRINCIPAL ──────────────────────────────────────────────────────────

  function render() {
    const equipos  = getEquipos();
    const sectores = getSectores();
    const fechas   = getFechas();
    const fMin     = fechas[0] || '';
    const fMax     = fechas[fechas.length - 1] || '';

    const eqOpts  = ['', ...equipos].map(e  => `<option value="${e}">${e || 'Todos los equipos'}</option>`).join('');
    const secOpts = ['', ...sectores].map(s  => `<option value="${s}">${s || 'Todos los sectores'}</option>`).join('');
    const tipoOpts= [['','Todos'],['DIRECTO','Directo'],['INDIRECTO','Indirecto'],['MIXTO','Mixto']]
      .map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
    const clOpts  = [['','Todas'],['REAL','Real'],['PROYECTADA','Proyectada']]
      .map(([v,l]) => `<option value="${v}">${l}</option>`).join('');

    document.getElementById('view-consulta').innerHTML = `
      <div class="pg-title">Consulta de Datos</div>
      <div class="pg-desc">Búsqueda avanzada con filtros múltiples, totales automáticos, exportación selectiva y comparación de períodos.</div>

      ${buildComparador()}

      <div class="fcard">
        <div class="fcard-title">🔍 FILTROS</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:10px">
          <div>
            <div class="flabel">Texto libre</div>
            <input class="fctl" type="text" id="q-s" placeholder="Equipo, sector...">
          </div>
          <div>
            <div class="flabel">Desde</div>
            <input class="fctl" type="date" id="q-desde" min="${fMin}" max="${fMax}">
          </div>
          <div>
            <div class="flabel">Hasta</div>
            <input class="fctl" type="date" id="q-hasta" min="${fMin}" max="${fMax}">
          </div>
          <div>
            <div class="flabel">Equipo</div>
            <select class="fctl" id="q-eq">${eqOpts}</select>
          </div>
          <div>
            <div class="flabel">Sector</div>
            <select class="fctl" id="q-sec">${secOpts}</select>
          </div>
          <div>
            <div class="flabel">Tipo</div>
            <select class="fctl" id="q-tipo">${tipoOpts}</select>
          </div>
          <div>
            <div class="flabel">Clasificación</div>
            <select class="fctl" id="q-cl">${clOpts}</select>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-pri" id="q-apply">Aplicar filtros</button>
          <button class="btn-sec" id="q-clear">Limpiar</button>
          <button class="btn-sec" id="q-export">⬇ Exportar CSV filtrado</button>
          <span style="font-family:Calibri,var(--fontc);font-size:11px;color:var(--text3);margin-left:auto" id="q-count"></span>
        </div>
        <div id="q-totales"></div>
      </div>

      <div class="twrap">
        <table>
          <thead><tr>
            <th>Fecha</th><th>Equipo</th><th>Sector</th><th>Tipo</th><th>Clasif.</th>
            <th>Horas</th><th>CME</th><th>Consumo</th><th>PCI</th>
          </tr></thead>
          <tbody id="q-tbody"></tbody>
        </table>
      </div>`;

    // Bind filtros
    ['q-s','q-desde','q-hasta','q-eq','q-sec','q-tipo','q-cl'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', refreshTable);
      document.getElementById(id)?.addEventListener('input',  refreshTable);
    });
    document.getElementById('q-apply')?.addEventListener('click', refreshTable);
    document.getElementById('q-clear')?.addEventListener('click', () => {
      ['q-s','q-desde','q-hasta'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
      ['q-eq','q-sec','q-tipo','q-cl'].forEach(id => { const el = document.getElementById(id); if(el) el.selectedIndex = 0; });
      refreshTable();
    });
    document.getElementById('q-export')?.addEventListener('click', exportFiltered);
    document.getElementById('cmp-run')?.addEventListener('click', runComparacion);

    // Carga inicial
    refreshTable();
  }

  return { render };

})();
