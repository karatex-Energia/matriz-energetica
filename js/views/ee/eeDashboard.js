/**
 * js/views/ee/eeDashboard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vista Dashboard — Energía Eléctrica · Colortex SA · Matriz Energética
 *
 * Módulo: análisis mensual de consumo eléctrico por sector (TEJ/TERM/HIL)
 * Incluye: trafos corregidos, distribución compresores, agua de perforación,
 *          tendencia histórica, detalle por trafo, KPIs comparativos.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

if (typeof Views === 'undefined') window.Views = {};
if (!Views.EE) Views.EE = {};

Views.EE.Dashboard = (() => {

  let _mesActivo = null;
  let _chartTend = null;
  let _chartSec  = null;

  // ── HELPERS ─────────────────────────────────────────────────────────────────

  const MWH  = v => v != null ? (v/1000).toFixed(1) + ' MWh' : '—';
  const KWH  = v => v != null ? Fmt.num(v, 0) + ' kWh' : '—';
  const PCT  = v => v != null ? Fmt.num(v, 1) + '%' : '—';
  const MES_LBL = m => {
    if (!m) return '—';
    const mn = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const [y, mo] = m.split('-');
    return mn[parseInt(mo) - 1] + ' ' + y;
  };

  const COLORES = {
    tej:  { bg: 'rgba(45,126,247,.75)',  border: '#2D7EF7' },
    term: { bg: 'rgba(6,182,212,.75)',   border: '#06B6D4' },
    hil:  { bg: 'rgba(168,85,247,.75)', border: '#A855F7' },
    smec: { bg: 'rgba(234,179,8,.4)',    border: '#EAB308' },
  };

  function destroyCharts() {
    if (_chartTend) { _chartTend.destroy(); _chartTend = null; }
    if (_chartSec)  { _chartSec.destroy();  _chartSec  = null; }
  }

  // ── SELECTOR DE MES ─────────────────────────────────────────────────────────

  function buildMesSel() {
    const meses = EEEngine.getMesesDisponibles();
    if (!_mesActivo || !meses.includes(_mesActivo)) {
      _mesActivo = EEEngine.getLastMes();
    }
    const opts = meses.map(m =>
      `<option value="${m}" ${m === _mesActivo ? 'selected' : ''}>${MES_LBL(m)}</option>`
    ).reverse().join('');
    return `
      <div class="seg-panel" style="padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span class="seg-lbl">PERÍODO</span>
        <select id="ee-mes-sel" class="seg-btn" style="height:32px;padding:4px 10px;font-size:12px">
          ${opts}
        </select>
        <span style="margin-left:auto;display:flex;gap:6px">
          <span class="seg-btn" id="ee-prev">&#8249; Anterior</span>
          <span class="seg-btn" id="ee-next">Siguiente &#8250;</span>
        </span>
        <span class="seg-btn" id="ee-export" style="background:var(--accent);color:#fff">&#11015; CSV</span>
        <span class="seg-btn" id="ee-refresh" style="background:var(--accent);color:#fff">&#8635; ACTUALIZAR</span>
      </div>`;
  }

  // ── KPI CARDS ───────────────────────────────────────────────────────────────

  function buildKpiCards(k) {
    if (!k) return `<div class="no-data-badge">⚠ Sin datos para el período seleccionado</div>`;

    const errColor = Math.abs(k.pct_error) > 3 ? 'var(--red)' : Math.abs(k.pct_error) > 1 ? 'var(--orange)' : 'var(--green)';

    return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:12px">

      <div class="kpi-card" style="border-color:var(--accent)">
        <div class="kpi-label">SMEC TOTAL</div>
        <div class="kpi-val" style="color:var(--accent)">${k.smec_kWh ? MWH(k.smec_kWh) : '—'}</div>
        <div class="kpi-sub">${k.smec_kWh ? KWH(k.smec_kWh) : 'Sin lectura SMEC'}</div>
      </div>

      <div class="kpi-card" style="border-color:#2D7EF7">
        <div class="kpi-label">TEJEDURÍA</div>
        <div class="kpi-val" style="color:#2D7EF7">${MWH(k.tej_MWh * 1000)}</div>
        <div class="kpi-sub">${PCT(k.pct_tej)} del total</div>
      </div>

      <div class="kpi-card" style="border-color:#06B6D4">
        <div class="kpi-label">TERMINADO</div>
        <div class="kpi-val" style="color:#06B6D4">${MWH(k.term_MWh * 1000)}</div>
        <div class="kpi-sub">${PCT(k.pct_term)} del total</div>
      </div>

      <div class="kpi-card" style="border-color:#A855F7">
        <div class="kpi-label">HILANDERÍA</div>
        <div class="kpi-val" style="color:#A855F7">${MWH(k.hil_MWh * 1000)}</div>
        <div class="kpi-sub">${PCT(k.pct_hil)} del total</div>
      </div>

      <div class="kpi-card" style="border-color:${errColor}">
        <div class="kpi-label">ERROR MEDICIÓN</div>
        <div class="kpi-val" style="color:${errColor}">${PCT(k.pct_error)}</div>
        <div class="kpi-sub">${KWH(k.error_kWh)}</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">TOTAL PLANTA</div>
        <div class="kpi-val">${k.total_MWh.toFixed(1)} MWh</div>
        <div class="kpi-sub">${KWH(k.total_MWh * 1000)}</div>
      </div>

    </div>`;
  }

  // ── DETALLE TRAFOS ───────────────────────────────────────────────────────────

  function buildTrafosTable(k) {
    if (!k) return '';
    const cfg = AppState.db.ee_config || {};
    const tps = cfg.trafos_por_sector || {};
    const mix = tps.MIXTO_5 || { trafo: 'Transformador Nº 5', pct_tej: 0.60, pct_term: 0.30, pct_hil: 0.10 };

    function getSector(nombre) {
      if ((tps.TEJ  || []).includes(nombre)) return '<span style="color:#2D7EF7">TEJ</span>';
      if ((tps.TERM || []).includes(nombre)) return '<span style="color:#06B6D4">TERM</span>';
      if ((tps.HIL  || []).includes(nombre)) return '<span style="color:#A855F7">HIL</span>';
      if (nombre === mix.trafo) return `<span style="color:#EAB308">MIX ${(mix.pct_tej*100).toFixed(0)}/${(mix.pct_term*100).toFixed(0)}/${(mix.pct_hil*100).toFixed(0)}</span>`;
      return '—';
    }

    const total_corr = Object.values(k.trafos_corr).reduce((a, v) => a + (v || 0), 0);

    const rows = Object.entries(k.trafos_corr)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .map(([nombre, val]) => {
        const raw = (AppState.db.ee_trafos || []).find(r => r.mes === k.mes);
        const raw_val = raw ? (raw.trafos[nombre] || 0) : 0;
        const corr = val - raw_val;
        const pct = total_corr > 0 ? (val / total_corr * 100).toFixed(1) : '0';
        return `<tr>
          <td>${nombre}</td>
          <td style="text-align:right">${getSector(nombre)}</td>
          <td style="text-align:right">${Fmt.num(raw_val, 0)}</td>
          <td style="text-align:right;color:${corr >= 0 ? 'var(--green)' : 'var(--red)'}">${corr >= 0 ? '+' : ''}${Fmt.num(corr, 0)}</td>
          <td style="text-align:right;font-weight:600">${Fmt.num(val, 0)}</td>
          <td style="text-align:right;color:var(--text3)">${pct}%</td>
        </tr>`;
      }).join('');

    return `
    <div class="panel-section" style="margin-bottom:12px">
      <div class="panel-section-title">⚡ DETALLE POR TRANSFORMADOR · ${MES_LBL(k.mes)}</div>
      <table class="data-table" style="width:100%">
        <thead>
          <tr>
            <th>Transformador</th>
            <th style="text-align:right">Sector</th>
            <th style="text-align:right">Medido kWh</th>
            <th style="text-align:right">Corrección</th>
            <th style="text-align:right">Corregido kWh</th>
            <th style="text-align:right">% Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="font-weight:700;border-top:2px solid var(--border)">
            <td colspan="2">TOTAL PLANTA</td>
            <td style="text-align:right">${KWH(k.total_trafos)}</td>
            <td style="text-align:right;color:${k.error_kWh >= 0 ? 'var(--green)' : 'var(--red)'}">
              ${k.error_kWh >= 0 ? '+' : ''}${KWH(k.error_kWh)}
            </td>
            <td style="text-align:right">${KWH(Math.round(total_corr))}</td>
            <td style="text-align:right">100%</td>
          </tr>
          ${k.smec_kWh ? `<tr style="color:var(--accent)">
            <td colspan="2">SMEC (medidor principal)</td>
            <td colspan="3" style="text-align:right">${KWH(k.smec_kWh)}</td>
            <td style="text-align:right">${PCT(k.pct_error)} error</td>
          </tr>` : ''}
        </tfoot>
      </table>
    </div>`;
  }

  // ── DETALLE COMPRESORES ──────────────────────────────────────────────────────

  function buildCompresoresSection(k) {
    if (!k || !k.comp) return `
    <div class="panel-section" style="margin-bottom:12px">
      <div class="panel-section-title">🔧 COMPRESORES — AIRE COMPRIMIDO</div>
      <div class="no-data-badge">⚠ Sin datos de compresores para este período — ingresá las horas en el formulario</div>
    </div>`;

    const c = k.comp;
    const rows = c.detalle.map(d => `
      <tr>
        <td>${d.n}</td>
        <td style="text-align:center">${d.sector === 'TEJ' ? '<span style="color:#2D7EF7">Tejeduría</span>' : '<span style="color:#A855F7">Hil/Term</span>'}</td>
        <td style="text-align:right">${Fmt.num(d.hs_carga, 0)}</td>
        <td style="text-align:right">${Fmt.num(d.hs_desc,  0)}</td>
        <td style="text-align:right">${KWH(d.kWh_carga)}</td>
        <td style="text-align:right">${KWH(d.kWh_desc)}</td>
        <td style="text-align:right;font-weight:600">${KWH(d.kWh_total)}</td>
        <td style="text-align:right">${Fmt.num(d.m3, 0)}</td>
      </tr>`).join('');

    return `
    <div class="panel-section" style="margin-bottom:12px">
      <div class="panel-section-title">🔧 COMPRESORES — AIRE COMPRIMIDO · ${MES_LBL(k.mes)}</div>
      <table class="data-table" style="width:100%;margin-bottom:8px">
        <thead>
          <tr>
            <th>Compresor</th>
            <th style="text-align:center">Red</th>
            <th style="text-align:right">Hs Carga</th>
            <th style="text-align:right">Hs Desc.</th>
            <th style="text-align:right">kWh Carga</th>
            <th style="text-align:right">kWh Desc.</th>
            <th style="text-align:right">kWh Total</th>
            <th style="text-align:right">m³ gen.</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--text2);margin-top:6px">
        <span>➡ kWh TEJ reasignados a TERM: <b>${KWH(c.kWh_tej_a_term)}</b></span>
        <span>➡ kWh TEJ reasignados a HIL: <b>${KWH(c.kWh_tej_a_hil)}</b></span>
        <span>| Vol. aportado TEJ→HIL+TERM: <b>${Fmt.num(c.vol_aport, 0)} m³</b></span>
        <span>| Días Term: <b>${c.dias_term}</b> · Días Hil: <b>${c.dias_hil}</b></span>
      </div>
    </div>`;
  }

  // ── GRÁFICO TENDENCIA HISTÓRICA ──────────────────────────────────────────────

  function buildTendenciaChart(tend) {
    return `
    <div class="panel-section" style="margin-bottom:12px">
      <div class="panel-section-title">📈 TENDENCIA HISTÓRICA — CONSUMO EE POR SECTOR (MWh)</div>
      <div style="position:relative;height:220px">
        <canvas id="ee-chart-tend"></canvas>
      </div>
    </div>`;
  }

  function renderTendenciaChart(tend) {
    const ctx = document.getElementById('ee-chart-tend');
    if (!ctx) return;
    if (_chartTend) { _chartTend.destroy(); _chartTend = null; }

    const labels  = tend.map(t => MES_LBL(t.mes));
    const opts    = UI.chartOptions('MWh');

    _chartTend = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Tejeduría',  data: tend.map(t => t.tej_MWh),  backgroundColor: COLORES.tej.bg,  borderColor: COLORES.tej.border,  borderWidth: 1, stack: 'sec' },
          { label: 'Terminado',  data: tend.map(t => t.term_MWh), backgroundColor: COLORES.term.bg, borderColor: COLORES.term.border, borderWidth: 1, stack: 'sec' },
          { label: 'Hilandería', data: tend.map(t => t.hil_MWh),  backgroundColor: COLORES.hil.bg,  borderColor: COLORES.hil.border,  borderWidth: 1, stack: 'sec' },
          { label: 'SMEC',       data: tend.map(t => t.smec_MWh), backgroundColor: 'transparent',   borderColor: COLORES.smec.border, borderWidth: 2, type: 'line', stack: null, tension: 0.3, pointRadius: 3 },
        ],
      },
      options: {
        ...opts,
        plugins: { ...opts.plugins, legend: { display: true, labels: { color: 'var(--text2)', boxWidth: 12, font: { size: 10 } } } },
        scales: { x: opts.scales?.x || {}, y: { ...opts.scales?.y, stacked: true, ticks: { color: 'var(--text2)', font: { size: 10 } } } },
      },
    });
  }

  // ── GRÁFICO SECTORES (DONUT) ─────────────────────────────────────────────────

  function buildSecChart() {
    return `
    <div class="panel-section" style="margin-bottom:12px">
      <div class="panel-section-title">🥧 DISTRIBUCIÓN POR SECTOR</div>
      <div style="position:relative;height:180px;max-width:280px;margin:0 auto">
        <canvas id="ee-chart-sec"></canvas>
      </div>
    </div>`;
  }

  function renderSecChart(k) {
    const ctx = document.getElementById('ee-chart-sec');
    if (!ctx || !k) return;
    if (_chartSec) { _chartSec.destroy(); _chartSec = null; }

    _chartSec = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Tejeduría', 'Terminado', 'Hilandería'],
        datasets: [{
          data: [k.tej_MWh, k.term_MWh, k.hil_MWh],
          backgroundColor: [COLORES.tej.bg, COLORES.term.bg, COLORES.hil.bg],
          borderColor:     [COLORES.tej.border, COLORES.term.border, COLORES.hil.border],
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: 'var(--text2)', font: { size: 10 }, boxWidth: 12 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw.toFixed(1)} MWh (${PCT(ctx.raw / k.total_MWh * 100)})` } },
        },
      },
    });
  }

  // ── RENDER PRINCIPAL ─────────────────────────────────────────────────────────

  function render() {
    const container = document.getElementById('view-ee-dashboard');
    if (!container) return;

    destroyCharts();

    const meses = EEEngine.getMesesDisponibles();
    if (!meses.length) {
      container.innerHTML = `<div class="no-data-badge" style="margin:32px auto">⚠ Sin datos de energía eléctrica disponibles</div>`;
      return;
    }

    if (!_mesActivo) _mesActivo = EEEngine.getLastMes();
    const k    = EEEngine.calcKpiMes(_mesActivo);
    const tend = EEEngine.calcTendencia(18);

    container.innerHTML = `
      ${buildMesSel()}
      <div style="display:grid;grid-template-columns:1fr 280px;gap:12px;align-items:start">
        <div>
          ${buildKpiCards(k)}
          ${buildTendenciaChart(tend)}
          ${buildTrafosTable(k)}
          ${buildCompresoresSection(k)}
        </div>
        <div>
          ${buildSecChart()}
        </div>
      </div>
    `;

    // Bind eventos
    const sel = document.getElementById('ee-mes-sel');
    if (sel) sel.addEventListener('change', () => { _mesActivo = sel.value; render(); });

    const prev = document.getElementById('ee-prev');
    if (prev) prev.addEventListener('click', () => {
      const i = meses.indexOf(_mesActivo);
      if (i > 0) { _mesActivo = meses[i - 1]; render(); }
    });

    const next = document.getElementById('ee-next');
    if (next) next.addEventListener('click', () => {
      const i = meses.indexOf(_mesActivo);
      if (i < meses.length - 1) { _mesActivo = meses[i + 1]; render(); }
    });

    const refresh = document.getElementById('ee-refresh');
    if (refresh) refresh.addEventListener('click', render);

    const exportBtn = document.getElementById('ee-export');
    if (exportBtn) exportBtn.addEventListener('click', () => {
      if (typeof ExcelExport !== 'undefined') ExcelExport.exportarEE(_mesActivo);
      else CsvExport.exportarEE(_mesActivo);
    });

    // Renderizar charts (después de que el DOM esté listo)
    requestAnimationFrame(() => {
      renderTendenciaChart(tend);
      renderSecChart(k);
    });
  }

  return { render };

})();
