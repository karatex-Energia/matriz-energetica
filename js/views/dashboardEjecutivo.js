/**
 * js/views/dashboardEjecutivo.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dashboard Ejecutivo Integrado · Colortex SA · Matriz Energética
 *
 * Vista de síntesis para gerencia. Integra Gas Natural + EE + Producción.
 *
 * KPIs principales:
 *   · Costo energético total ARS + USD (Gas + EE)
 *   · Costo por metro producido (tintorería + estampado)
 *   · Participación Gas vs EE en el costo total
 *   · Consumo específico por energía y sector
 *   · Evolución histórica de costos específicos
 *   · Alertas de desvío respecto al mes anterior
 *
 * Dependencias: GasVsProdEngine, EEEngine, CONFIG
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

if (typeof Views === 'undefined') window.Views = {};

Views.DashboardEjecutivo = (() => {

  let _mes    = null;
  let _chartC = null;  // Costo específico histórico
  let _chartP = null;  // Participación energías
  let _chartE = null;  // Evolución costo total

  // ── HELPERS ──────────────────────────────────────────────────────────────────

  const MES_LBL = m => {
    if (!m) return '—';
    const mn = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const [y,mo] = m.split('-');
    return mn[parseInt(mo)-1]+' '+y;
  };

  const ARS  = (v,d=0) => v != null ? '$ '+Fmt.num(v,d) : '—';
  const USD  = (v,d=2) => v != null ? Fmt.num(v,d)+' USD' : '—';
  const PCT  = v => v != null ? Fmt.num(v,1)+'%' : '—';
  const MWH  = v => v != null ? Fmt.num(v,1)+' MWh' : '—';
  const M3   = v => v != null ? Fmt.num(v,0)+' m³' : '—';

  function destroyCharts() {
    [_chartC, _chartP, _chartE].forEach(c => { if (c) c.destroy(); });
    _chartC = _chartP = _chartE = null;
  }

  // ── CÁLCULO INTEGRADO ────────────────────────────────────────────────────────

  function calcEjecutivo(mes) {
    const desde = mes + '-01';
    const hasta = mes + '-31';
    const ta    = (typeof CONFIG !== 'undefined' && CONFIG.tarifas) ? CONFIG.tarifas : {};

    // Gas Natural
    const gasKpi  = GasVsProdEngine.calcKpi(desde, hasta, null);
    const prod    = GasVsProdEngine.calcProduccion(desde, hasta);

    // EE
    const eeKpi   = EEEngine.calcKpiMes(mes);

    if (!gasKpi && !eeKpi) return null;

    // ── Costos Gas (ARS)
    const gnARS       = ta.gnARS || 0;
    const usd         = ta.usd   || 1;
    const costoGas    = gasKpi ? gasKpi.gas.total_planta * gnARS : 0;
    const costoGasUSD = costoGas / usd;

    // ── Costos EE (ARS) — tarifa FD como referencia
    const tarFD       = ta.tarFD || 0;
    const costoEE     = eeKpi ? eeKpi.total_MWh * 1000 * tarFD : 0;
    const costoEEUSD  = costoEE / usd;

    // ── Costo total
    const costoTotal    = costoGas + costoEE;
    const costoTotalUSD = costoTotal / usd;

    // ── Producción total planta (metros: Tint + Estampado + mDbl)
    const metrosTotal = (prod.mTint || 0) + (prod.mEst || 0) + (prod.mDbl || 0);
    const kgTotal     = prod.KgEnc || 0;

    // ── Costo energético por metro (Gas + EE asignado a producción textil)
    const costoGasTint  = gasKpi ? gasKpi.gas.total_tint  * gnARS : 0;
    const costoGasEst   = gasKpi ? gasKpi.gas.total_estamp * gnARS : 0;
    const costoGasEnc   = gasKpi ? gasKpi.gas.total_enc   * gnARS : 0;
    const costoEETej    = eeKpi  ? eeKpi.tej_MWh  * 1000 * tarFD  : 0;
    const costoEETerm   = eeKpi  ? eeKpi.term_MWh * 1000 * tarFD  : 0;
    const costoEEHil    = eeKpi  ? eeKpi.hil_MWh  * 1000 * tarFD  : 0;

    // Costo total sectorial
    const costo_tint_total  = costoGasTint + costoEETej;
    const costo_estamp_total = costoGasEst;
    const costo_enc_total   = costoGasEnc;
    const costo_term_total  = costoEETerm;

    // Costo específico integrado por metro (Tintorería)
    const ce_m_tint = prod.mTint > 0 ? costo_tint_total / prod.mTint : null;
    const ce_m_est  = prod.mEst  > 0 ? costo_estamp_total / prod.mEst : null;
    const ce_m_dbl  = prod.mDbl  > 0 ? costo_term_total  / prod.mDbl  : null;
    const ce_kg_enc = prod.KgEnc > 0 ? costo_enc_total   / prod.KgEnc : null;

    // Participación energías
    const pct_gas = costoTotal > 0 ? costoGas / costoTotal * 100 : 0;
    const pct_ee  = costoTotal > 0 ? costoEE  / costoTotal * 100 : 0;

    // Pérdida caldera en ARS
    const costoPerdida = gasKpi ? gasKpi.gas.perdida_caldera * gnARS : 0;

    return {
      mes, desde, hasta,
      // Gas
      gasKpi, eeKpi, prod,
      // Costos
      costoGas, costoGasUSD,
      costoEE,  costoEEUSD,
      costoTotal, costoTotalUSD,
      costoGasTint, costoGasEst, costoGasEnc,
      costoEETej, costoEETerm, costoEEHil,
      costo_tint_total, costo_estamp_total, costo_enc_total, costo_term_total,
      costoPerdida,
      // CE integrado
      ce_m_tint, ce_m_est, ce_m_dbl, ce_kg_enc,
      ce_m_tint_usd: ce_m_tint != null ? ce_m_tint / usd : null,
      ce_m_est_usd:  ce_m_est  != null ? ce_m_est  / usd : null,
      ce_m_dbl_usd:  ce_m_dbl  != null ? ce_m_dbl  / usd : null,
      // Participación
      pct_gas, pct_ee,
      metrosTotal, kgTotal,
      // Tarifas usadas
      gnARS, tarFD, usd,
    };
  }

  // ── TENDENCIA EJECUTIVA ──────────────────────────────────────────────────────

  function calcTendenciaEjecutiva(nMeses = 6) {
    const mesesGas = GasVsProdEngine.getMesesDisponibles();
    const mesesEE  = EEEngine.getMesesDisponibles();
    const meses    = [...new Set([...mesesGas, ...mesesEE])].sort().slice(-nMeses);
    return meses.map(m => {
      const k = calcEjecutivo(m);
      return {
        mes: m,
        costoTotal:    k?.costoTotal    || 0,
        costoGas:      k?.costoGas      || 0,
        costoEE:       k?.costoEE       || 0,
        ce_m_tint:     k?.ce_m_tint     || null,
        ce_m_est:      k?.ce_m_est      || null,
        mTint:         k?.prod.mTint    || 0,
        mEst:          k?.prod.mEst     || 0,
        costoTotalUSD: k?.costoTotalUSD || 0,
        pct_gas:       k?.pct_gas       || 0,
        pct_ee:        k?.pct_ee        || 0,
      };
    });
  }

  // ── ALERTA DE DESVÍO ─────────────────────────────────────────────────────────

  function calcDesvio(actual, anterior, label) {
    if (actual == null || anterior == null || anterior === 0) return null;
    const d = ((actual - anterior) / anterior) * 100;
    return {
      label,
      actual, anterior,
      desvio: d,
      color: d > 5 ? 'var(--red)' : d < -5 ? 'var(--green)' : 'var(--orange)',
      icono: d > 5 ? '↑' : d < -5 ? '↓' : '→',
    };
  }

  // ── UI — SELECTOR ────────────────────────────────────────────────────────────

  function buildControles(meses) {
    const opts = meses.map(m =>
      `<option value="${m}" ${m===_mes?'selected':''}>${MES_LBL(m)}</option>`
    ).reverse().join('');

    return `
    <div class="seg-panel" style="padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span class="seg-lbl">PERÍODO</span>
      <select id="dej-mes" class="seg-btn" style="height:32px;padding:4px 10px;font-size:12px">
        ${opts}
      </select>
      <span style="margin-left:auto;display:flex;gap:6px">
        <span class="seg-btn" id="dej-prev">&#8249; Anterior</span>
        <span class="seg-btn" id="dej-next">Siguiente &#8250;</span>
        <span class="seg-btn" id="dej-export" style="background:var(--accent);color:#fff">&#11015; CSV</span>
      </span>
    </div>`;
  }

  // ── UI — KPI BANNER ──────────────────────────────────────────────────────────

  function buildBanner(k, kAnt) {
    if (!k) return `<div class="no-data-badge">⚠ Sin datos para el período seleccionado</div>`;

    // Desvíos vs mes anterior
    const dv_costo  = kAnt ? calcDesvio(k.costoTotal,  kAnt.costoTotal,  'Costo total')  : null;
    const dv_ce_tint= kAnt ? calcDesvio(k.ce_m_tint,   kAnt.ce_m_tint,   'CE Tintorería'): null;

    function desvBadge(dv) {
      if (!dv) return '';
      return `<span style="font-size:11px;color:${dv.color};margin-left:6px">
        ${dv.icono} ${Math.abs(dv.desvio).toFixed(1)}% vs ${MES_LBL(kAnt.mes)}
      </span>`;
    }

    return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:14px">

      <!-- Costo total -->
      <div class="kpi-card" style="border-color:var(--accent);grid-column:span 2">
        <div class="kpi-label">COSTO ENERGÉTICO TOTAL · ${MES_LBL(k.mes)}</div>
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
          <div class="kpi-val" style="color:var(--accent);font-size:28px">
            ${ARS(k.costoTotal, 0)}
          </div>
          ${desvBadge(dv_costo)}
        </div>
        <div style="display:flex;gap:16px;margin-top:4px;font-size:12px">
          <span style="color:var(--text3)">${USD(k.costoTotalUSD)}</span>
          <span style="color:#EAB308">Gas: ${ARS(k.costoGas,0)} (${PCT(k.pct_gas)})</span>
          <span style="color:#2D7EF7">EE: ${ARS(k.costoEE,0)} (${PCT(k.pct_ee)})</span>
        </div>
      </div>

      <!-- CE Tintorería integrado -->
      <div class="kpi-card" style="border-color:#EAB308">
        <div class="kpi-label">COSTO INTEGRADO · TINTORERÍA</div>
        <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">
          <div class="kpi-val" style="color:#EAB308">
            ${k.ce_m_tint != null ? ARS(k.ce_m_tint, 2) : '—'}
          </div>
          ${desvBadge(dv_ce_tint)}
        </div>
        <div class="kpi-sub">
          ${k.ce_m_tint != null ? USD(k.ce_m_tint_usd, 4) : 'Sin datos de producción'} / metro
        </div>
        <div class="kpi-sub" style="margin-top:2px">
          Gas: ${ARS(k.costoGasTint,0)} + EE: ${ARS(k.costoEETej,0)}
        </div>
      </div>

      <!-- CE Estampado -->
      <div class="kpi-card" style="border-color:#F97316">
        <div class="kpi-label">COSTO INTEGRADO · ESTAMPADO</div>
        <div class="kpi-val" style="color:#F97316">
          ${k.ce_m_est != null ? ARS(k.ce_m_est, 2) : '—'}
        </div>
        <div class="kpi-sub">
          ${k.ce_m_est != null ? USD(k.ce_m_est_usd, 4) : 'Sin datos de producción'} / metro
        </div>
      </div>

      <!-- CE Terminado -->
      <div class="kpi-card" style="border-color:#06B6D4">
        <div class="kpi-label">COSTO INTEGRADO · TERMINADO</div>
        <div class="kpi-val" style="color:#06B6D4">
          ${k.ce_m_dbl != null ? ARS(k.ce_m_dbl, 2) : '—'}
        </div>
        <div class="kpi-sub">
          ${k.ce_m_dbl != null ? USD(k.ce_m_dbl_usd, 4) : 'Sin datos de producción'} / metro doblado
        </div>
      </div>

      <!-- CE Encolado -->
      <div class="kpi-card" style="border-color:#22C55E">
        <div class="kpi-label">COSTO INTEGRADO · ENCOLADO</div>
        <div class="kpi-val" style="color:#22C55E">
          ${k.ce_kg_enc != null ? ARS(k.ce_kg_enc, 2) : '—'}
        </div>
        <div class="kpi-sub">
          ${k.ce_kg_enc != null ? USD(k.ce_kg_enc/k.usd, 4) : 'Sin datos de producción'} / kg
        </div>
      </div>

      <!-- Pérdida caldera -->
      <div class="kpi-card" style="border-color:#EF4444">
        <div class="kpi-label">COSTO PÉRDIDA CALDERA</div>
        <div class="kpi-val" style="color:#EF4444">${ARS(k.costoPerdida, 0)}</div>
        <div class="kpi-sub">${k.gasKpi ? M3(k.gasKpi.gas.perdida_caldera) : '—'} no aprovechados</div>
      </div>

    </div>`;
  }

  // ── UI — TABLA COMPARATIVA ───────────────────────────────────────────────────

  function buildTablaComparativa(k) {
    if (!k) return '';

    const filas = [
      { label:'Tintorería',  gas: k.costoGasTint,  ee: k.costoEETej,   total: k.costo_tint_total,  prod: k.prod.mTint, unit:'m',   color:'#EAB308' },
      { label:'Estampado',   gas: k.costoGasEst,   ee: 0,              total: k.costo_estamp_total, prod: k.prod.mEst,  unit:'m',   color:'#F97316' },
      { label:'Encolado',    gas: k.costoGasEnc,   ee: 0,              total: k.costo_enc_total,    prod: k.prod.KgEnc, unit:'kg',  color:'#22C55E' },
      { label:'Terminado',   gas: 0,               ee: k.costoEETerm,  total: k.costo_term_total,   prod: k.prod.mDbl,  unit:'m',   color:'#06B6D4' },
      { label:'Hilandería',  gas: 0,               ee: k.costoEEHil,   total: k.costoEEHil,         prod: k.prod.KgHil, unit:'kg',  color:'#A855F7' },
    ].map(f => {
      const ce = f.prod > 0 ? f.total / f.prod : null;
      return `<tr>
        <td style="color:${f.color};font-weight:600">${f.label}</td>
        <td style="text-align:right">${f.gas > 0 ? ARS(f.gas,0) : '—'}</td>
        <td style="text-align:right">${f.ee  > 0 ? ARS(f.ee, 0) : '—'}</td>
        <td style="text-align:right;font-weight:700">${ARS(f.total,0)}</td>
        <td style="text-align:right;color:var(--text3)">${f.prod > 0 ? Fmt.num(f.prod,0)+' '+f.unit : '—'}</td>
        <td style="text-align:right;color:${f.color}">${ce != null ? ARS(ce,2)+'/'+f.unit : '—'}</td>
        <td style="text-align:right;color:var(--text3)">${ce != null ? (ce/k.usd).toFixed(4)+' USD/'+f.unit : '—'}</td>
      </tr>`;
    }).join('');

    return `
    <div class="panel-section" style="margin-bottom:12px">
      <div class="panel-section-title">📋 CUADRO COMPARATIVO POR SECTOR — ${MES_LBL(k.mes)}</div>
      <table class="data-table" style="width:100%">
        <thead>
          <tr>
            <th>Sector</th>
            <th style="text-align:right">Costo Gas ARS</th>
            <th style="text-align:right">Costo EE ARS</th>
            <th style="text-align:right">Costo Total ARS</th>
            <th style="text-align:right">Producción</th>
            <th style="text-align:right">Costo esp. ARS/u</th>
            <th style="text-align:right">Costo esp. USD/u</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr style="font-weight:700;border-top:2px solid var(--border)">
            <td>TOTAL PLANTA</td>
            <td style="text-align:right">${ARS(k.costoGas,0)}</td>
            <td style="text-align:right">${ARS(k.costoEE,0)}</td>
            <td style="text-align:right">${ARS(k.costoTotal,0)}</td>
            <td style="text-align:right;color:var(--text3)">—</td>
            <td colspan="2" style="text-align:right;color:var(--text3)">${USD(k.costoTotalUSD)}</td>
          </tr>
        </tfoot>
      </table>
      <div style="font-size:10px;color:var(--text3);margin-top:6px">
        Tarifas: Gas ${k.gnARS} ARS/m³ · EE ${k.tarFD} ARS/kWh · USD ${Fmt.num(k.usd,0)} ARS/USD
      </div>
    </div>`;
  }

  // ── UI — GRÁFICOS ────────────────────────────────────────────────────────────

  function buildCharts() {
    return `
    <div style="display:grid;grid-template-columns:1fr 1fr 280px;gap:12px;margin-bottom:12px">
      <div class="panel-section">
        <div class="panel-section-title">📈 EVOLUCIÓN COSTO TOTAL (ARS)</div>
        <div style="position:relative;height:180px"><canvas id="dej-chart-e"></canvas></div>
      </div>
      <div class="panel-section">
        <div class="panel-section-title">📈 COSTO ESPECÍFICO INTEGRADO (ARS/m)</div>
        <div style="position:relative;height:180px"><canvas id="dej-chart-c"></canvas></div>
      </div>
      <div class="panel-section">
        <div class="panel-section-title">🥧 GAS vs EE</div>
        <div style="position:relative;height:160px;max-width:240px;margin:0 auto"><canvas id="dej-chart-p"></canvas></div>
      </div>
    </div>`;
  }

  function renderCharts(k, tend) {
    const opts = UI.chartOptions('ARS');

    // Evolución costo total
    const ctxE = document.getElementById('dej-chart-e');
    if (ctxE && tend.length) {
      if (_chartE) { _chartE.destroy(); _chartE = null; }
      _chartE = new Chart(ctxE, {
        type: 'bar',
        data: {
          labels: tend.map(t => MES_LBL(t.mes)),
          datasets: [
            { label:'Gas',  data: tend.map(t=>t.costoGas), backgroundColor:'rgba(234,179,8,.7)',  borderColor:'#EAB308', borderWidth:1, stack:'s' },
            { label:'EE',   data: tend.map(t=>t.costoEE),  backgroundColor:'rgba(45,126,247,.7)', borderColor:'#2D7EF7', borderWidth:1, stack:'s' },
          ],
        },
        options: {
          ...opts,
          plugins: { ...opts.plugins, legend:{ display:true, labels:{ color:'var(--text2)', boxWidth:10, font:{size:10} } } },
          scales: { x: opts.scales?.x||{}, y:{ stacked:true, ticks:{ color:'var(--text2)', font:{size:9} } } },
        },
      });
    }

    // Costo específico histórico
    const ctxC = document.getElementById('dej-chart-c');
    if (ctxC && tend.length) {
      if (_chartC) { _chartC.destroy(); _chartC = null; }
      _chartC = new Chart(ctxC, {
        type: 'line',
        data: {
          labels: tend.map(t => MES_LBL(t.mes)),
          datasets: [
            { label:'Tintorería ARS/m', data: tend.map(t=>t.ce_m_tint), borderColor:'#EAB308', backgroundColor:'transparent', tension:.3, pointRadius:4 },
            { label:'Estampado ARS/m',  data: tend.map(t=>t.ce_m_est),  borderColor:'#F97316', backgroundColor:'transparent', tension:.3, pointRadius:4 },
          ],
        },
        options: {
          ...opts,
          plugins: { ...opts.plugins, legend:{ display:true, labels:{ color:'var(--text2)', boxWidth:10, font:{size:10} } } },
        },
      });
    }

    // Donut Gas vs EE
    if (k) {
      const ctxP = document.getElementById('dej-chart-p');
      if (ctxP) {
        if (_chartP) { _chartP.destroy(); _chartP = null; }
        _chartP = new Chart(ctxP, {
          type: 'doughnut',
          data: {
            labels: ['Gas Natural','Energía Eléctrica'],
            datasets: [{
              data: [k.costoGas, k.costoEE],
              backgroundColor: ['rgba(234,179,8,.75)','rgba(45,126,247,.75)'],
              borderColor:     ['#EAB308','#2D7EF7'],
              borderWidth: 2,
            }],
          },
          options: {
            responsive:true, maintainAspectRatio:false,
            plugins: {
              legend:{ position:'bottom', labels:{ color:'var(--text2)', font:{size:10}, boxWidth:12 } },
              tooltip:{ callbacks:{ label: ctx => ` ${ctx.label}: ${ARS(ctx.raw,0)} (${PCT(ctx.raw/k.costoTotal*100)})` } },
            },
          },
        });
      }
    }
  }

  // ── RENDER ───────────────────────────────────────────────────────────────────

  function render() {
    const container = document.getElementById('view-dashboard-ejecutivo');
    if (!container) return;
    destroyCharts();

    const mesesGas = GasVsProdEngine.getMesesDisponibles();
    const mesesEE  = EEEngine.getMesesDisponibles();
    const meses    = [...new Set([...mesesGas,...mesesEE])].sort();

    if (!meses.length) {
      container.innerHTML = `<div class="no-data-badge" style="margin:32px auto">⚠ Sin datos disponibles</div>`;
      return;
    }

    if (!_mes || !meses.includes(_mes)) _mes = meses[meses.length-1];

    const k    = calcEjecutivo(_mes);
    const mesIdx = meses.indexOf(_mes);
    const kAnt = mesIdx > 0 ? calcEjecutivo(meses[mesIdx-1]) : null;
    const tend = calcTendenciaEjecutiva(8);

    container.innerHTML = `
      ${buildControles(meses)}
      ${buildBanner(k, kAnt)}
      ${buildCharts()}
      ${buildTablaComparativa(k)}
      <div style="font-size:10px;color:var(--text3);margin-top:8px;padding:0 4px">
        * Los costos son de referencia basados en tarifas configuradas. 
        Incluyen Gas Natural (consumo × gnARS) y EE (MWh × tarFD).
        No incluyen cargos fijos, impuestos ni penalizaciones.
      </div>
    `;

    // Bind eventos
    document.getElementById('dej-mes')?.addEventListener('change', e => { _mes = e.target.value; render(); });
    document.getElementById('dej-prev')?.addEventListener('click', () => {
      const i = meses.indexOf(_mes);
      if (i > 0) { _mes = meses[i-1]; render(); }
    });
    document.getElementById('dej-next')?.addEventListener('click', () => {
      const i = meses.indexOf(_mes);
      if (i < meses.length-1) { _mes = meses[i+1]; render(); }
    });

    document.getElementById('dej-export')?.addEventListener('click', () => {
      if (!k) { UI.notify('Sin datos para exportar','err'); return; }
      if (typeof ExcelExport !== 'undefined') {
        ExcelExport.exportarEjecutivo(k.mes);
      } else {
        // Fallback CSV
        const rows = [[`DASHBOARD EJECUTIVO — ${k.mes}`]];
        CsvExport._download(rows, `Karatex_Ejecutivo_${k.mes}.csv`);
      }
    });

    requestAnimationFrame(() => renderCharts(k, tend));
  }

  return { render };

})();
