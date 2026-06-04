/**
 * js/views/eeVsProd.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vista — Análisis EE vs Producción · Colortex SA · Matriz Energética
 *
 * Consumo específico [MWh/unidad] y costo específico [ARS/u + USD/u]
 * por sector eléctrico: Tejeduría (pl+ts), Hilandería, Terminado.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

if (typeof Views === 'undefined') window.Views = {};

Views.EEVsProd = (() => {

  let _mes    = null;
  let _chartT = null;

  const MES_LBL = m => {
    if (!m) return '—';
    const mn = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const [y,mo] = m.split('-');
    return mn[parseInt(mo)-1] + ' ' + y;
  };

  const COLORES = {
    tej:  '#2D7EF7',
    hil:  '#A855F7',
    term: '#06B6D4',
  };

  function destroyCharts() {
    if (_chartT) { _chartT.destroy(); _chartT = null; }
  }

  // ── CÁLCULO ──────────────────────────────────────────────────────────────────

  function calcKpi(mes) {
    const kEE = EEEngine.calcKpiMes(mes);
    if (!kEE) return null;

    // Datos de producción del mes
    const desde = mes + '-01';
    const hasta = mes + '-31';
    const prod  = GasVsProdEngine.calcProduccion(desde, hasta);

    // Tarifas para costo
    const ta   = (typeof CONFIG !== 'undefined' && CONFIG.tarifas) ? CONFIG.tarifas : {};
    // Costo EE: usar tarifa FD como referencia (ARS/kWh)
    const precioKWh = ta.tarFD || 0;
    const usd       = ta.usd   || 1;

    // Consumo específico [MWh/unidad]
    const tej_MWh  = kEE.tej_MWh;
    const hil_MWh  = kEE.hil_MWh;
    const term_MWh = kEE.term_MWh;

    // Tejeduría: PasTejPl + PasTejTs (total pasadas)
    const pasTej = (prod.PasTejPl || 0) + (prod.PasTejTs || 0);

    const ce_tej_pl  = prod.PasTejPl > 0 ? tej_MWh / prod.PasTejPl  : null; // MWh/PAS pl
    const ce_tej_ts  = prod.PasTejTs > 0 ? tej_MWh / prod.PasTejTs  : null; // MWh/PAS ts
    const ce_tej     = pasTej          > 0 ? tej_MWh / pasTej        : null; // MWh/PAS total
    const ce_hil     = prod.KgHil      > 0 ? hil_MWh / prod.KgHil   : null; // MWh/kg
    const ce_term    = prod.mDbl       > 0 ? term_MWh / prod.mDbl   : null; // MWh/m

    // Costo específico [ARS/unidad]
    const cse_tej_ars  = ce_tej  != null ? ce_tej  * 1000 * precioKWh : null;
    const cse_hil_ars  = ce_hil  != null ? ce_hil  * 1000 * precioKWh : null;
    const cse_term_ars = ce_term != null ? ce_term * 1000 * precioKWh : null;

    return {
      mes, kEE, prod,
      pasTej,
      ce_tej, ce_tej_pl, ce_tej_ts, ce_hil, ce_term,
      cse_tej_ars,  cse_tej_usd:  cse_tej_ars  != null ? cse_tej_ars  / usd : null,
      cse_hil_ars,  cse_hil_usd:  cse_hil_ars  != null ? cse_hil_ars  / usd : null,
      cse_term_ars, cse_term_usd: cse_term_ars != null ? cse_term_ars / usd : null,
      precioKWh, usd,
    };
  }

  // ── CONTROLES ────────────────────────────────────────────────────────────────

  function buildControles() {
    const meses = EEEngine.getMesesDisponibles();
    if (!_mes || !meses.includes(_mes)) _mes = EEEngine.getLastMes();
    const opts = meses.map(m =>
      `<option value="${m}" ${m===_mes?'selected':''}>${MES_LBL(m)}</option>`
    ).reverse().join('');

    return `
    <div class="seg-panel" style="padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span class="seg-lbl">PERÍODO</span>
      <select id="evp-mes" class="seg-btn" style="height:32px;padding:4px 10px;font-size:12px">
        ${opts}
      </select>
      <span style="margin-left:auto;display:flex;gap:6px">
        <span class="seg-btn" id="evp-prev">&#8249; Anterior</span>
        <span class="seg-btn" id="evp-next">Siguiente &#8250;</span>
        <span class="seg-btn" id="evp-export" style="background:var(--accent);color:#fff">&#11015; CSV</span>
      </span>
    </div>`;
  }

  // ── CARDS ────────────────────────────────────────────────────────────────────

  function cardSector(label, color, mwh, prodVal, prodUnit, ce, ceUnit, cseArs, cseUsd) {
    const sinProd = !prodVal || prodVal === 0;
    return `
    <div class="kpi-card" style="border-color:${color};min-width:210px">
      <div class="kpi-label" style="color:${color}">${label}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px">
        <div>
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase">Consumo EE</div>
          <div style="font-size:18px;font-weight:700">${mwh != null ? mwh.toFixed(1) : '—'} <span style="font-size:11px;font-weight:400">MWh</span></div>
        </div>
        <div>
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase">Producción</div>
          <div style="font-size:18px;font-weight:700">${prodVal > 0 ? Fmt.num(prodVal,0) : '—'} <span style="font-size:11px;font-weight:400">${prodUnit}</span></div>
        </div>
      </div>
      <div style="border-top:1px solid var(--border);margin:8px 0"></div>
      <div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase">Consumo específico</div>
        <div style="font-size:17px;font-weight:700;color:${color}">
          ${sinProd ? '<span style="color:var(--text3);font-size:12px">Sin datos de producción</span>'
            : ce != null ? ce.toFixed(4) + ' MWh/' + ceUnit : '—'}
        </div>
      </div>
      ${!sinProd && cseArs != null ? `
      <div style="margin-top:6px">
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase">Costo específico</div>
        <div style="font-size:15px;font-weight:700">$ ${Fmt.num(cseArs,2)} ARS/${ceUnit}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:1px">${cseUsd != null ? cseUsd.toFixed(5)+' USD/'+ceUnit : '—'}</div>
      </div>` : ''}
    </div>`;
  }

  // ── RENDER ───────────────────────────────────────────────────────────────────

  function render() {
    const container = document.getElementById('view-ee-vs-prod');
    if (!container) return;
    destroyCharts();

    const meses = EEEngine.getMesesDisponibles();
    if (!meses.length) {
      container.innerHTML = `<div class="no-data-badge" style="margin:32px auto">⚠ Sin datos EE disponibles</div>`;
      return;
    }
    if (!_mes) _mes = EEEngine.getLastMes();
    const k = calcKpi(_mes);

    const hasProd = k && (k.pasTej > 0 || k.prod.KgHil > 0 || k.prod.mDbl > 0);

    container.innerHTML = `
      ${buildControles()}

      ${!hasProd ? `<div class="no-data-badge" style="margin:10px 0">
        ⚠ Sin datos de producción para ${MES_LBL(_mes)} — cargalos en "Carga Indicadores"
      </div>` : ''}

      <!-- KPI cards sector -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0">
        ${k ? cardSector('TEJEDURÍA',  COLORES.tej,  k.kEE.tej_MWh,  k.pasTej,       'PAS', k.ce_tej,  'PAS', k.cse_tej_ars,  k.cse_tej_usd)  : ''}
        ${k ? cardSector('HILANDERÍA', COLORES.hil,  k.kEE.hil_MWh,  k.prod.KgHil,   'kg',  k.ce_hil,  'kg',  k.cse_hil_ars,  k.cse_hil_usd)  : ''}
        ${k ? cardSector('TERMINADO',  COLORES.term, k.kEE.term_MWh, k.prod.mDbl,    'm',   k.ce_term, 'm',   k.cse_term_ars, k.cse_term_usd) : ''}
      </div>

      <!-- Desglose Tejeduría Planos vs Toallas -->
      ${k && (k.prod.PasTejPl > 0 || k.prod.PasTejTs > 0) ? `
      <div class="panel-section" style="margin-bottom:12px">
        <div class="panel-section-title">🧵 TEJEDURÍA — DESGLOSE PLANOS vs TOALLAS</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:12px">
          <div style="background:var(--bg3);padding:8px 14px;border-radius:6px">
            <div style="color:var(--text3);font-size:10px;text-transform:uppercase">Planos</div>
            <div style="font-size:16px;font-weight:700">${Fmt.num(k.prod.PasTejPl,0)} PAS</div>
            <div style="color:#2D7EF7;font-weight:600">${k.ce_tej_pl != null ? k.ce_tej_pl.toFixed(4)+' MWh/PAS' : '—'}</div>
          </div>
          <div style="background:var(--bg3);padding:8px 14px;border-radius:6px">
            <div style="color:var(--text3);font-size:10px;text-transform:uppercase">Toallas</div>
            <div style="font-size:16px;font-weight:700">${Fmt.num(k.prod.PasTejTs,0)} PAS</div>
            <div style="color:#2D7EF7;font-weight:600">${k.ce_tej_ts != null ? k.ce_tej_ts.toFixed(4)+' MWh/PAS' : '—'}</div>
          </div>
          <div style="background:var(--bg3);padding:8px 14px;border-radius:6px">
            <div style="color:var(--text3);font-size:10px;text-transform:uppercase">Total</div>
            <div style="font-size:16px;font-weight:700">${Fmt.num(k.pasTej,0)} PAS</div>
            <div style="color:#2D7EF7;font-weight:600">${k.ce_tej != null ? k.ce_tej.toFixed(4)+' MWh/PAS' : '—'}</div>
          </div>
          <div style="font-size:11px;color:var(--text3);display:flex;align-items:center;padding:0 8px">
            Nota: el consumo EE de Tejeduría se distribuye equitativamente entre Planos y Toallas por pasada.
          </div>
        </div>
      </div>` : ''}

      <!-- Tendencia CE histórico -->
      <div class="panel-section" style="margin-bottom:12px">
        <div class="panel-section-title">📈 TENDENCIA CONSUMO ESPECÍFICO EE (MWh/unidad)</div>
        <div style="position:relative;height:200px"><canvas id="evp-chart-tend"></canvas></div>
      </div>

      <!-- Info precio -->
      ${k ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">
        Tarifa de referencia: ${k.precioKWh} ARS/kWh (tarFD) · Cambio: ${Fmt.num(k.usd,0)} ARS/USD
      </div>` : ''}
    `;

    // Bind eventos
    const sel = document.getElementById('evp-mes');
    if (sel) sel.addEventListener('change', () => { _mes = sel.value; render(); });

    document.getElementById('evp-prev')?.addEventListener('click', () => {
      const i = meses.indexOf(_mes);
      if (i > 0) { _mes = meses[i-1]; render(); }
    });
    document.getElementById('evp-next')?.addEventListener('click', () => {
      const i = meses.indexOf(_mes);
      if (i < meses.length-1) { _mes = meses[i+1]; render(); }
    });
    document.getElementById('evp-export')?.addEventListener('click', () => {
      if (k) {
        // Exportar via CsvExport extendido
        const rows = [
          [`ANÁLISIS EE VS PRODUCCIÓN — ${_mes}`],[],
          ['SECTOR','MWh','Producción','Unidad','CE MWh/u','CSE ARS/u','CSE USD/u'],
          ['Tejeduría',  k.kEE.tej_MWh,  k.pasTej,      'PAS', k.ce_tej !=null?k.ce_tej.toFixed(4):'—',  k.cse_tej_ars !=null?k.cse_tej_ars.toFixed(2):'—',  k.cse_tej_usd !=null?k.cse_tej_usd.toFixed(5):'—'],
          ['Hilandería', k.kEE.hil_MWh,  k.prod.KgHil,  'kg',  k.ce_hil !=null?k.ce_hil.toFixed(4):'—',  k.cse_hil_ars !=null?k.cse_hil_ars.toFixed(2):'—',  k.cse_hil_usd !=null?k.cse_hil_usd.toFixed(5):'—'],
          ['Terminado',  k.kEE.term_MWh, k.prod.mDbl,   'm',   k.ce_term!=null?k.ce_term.toFixed(4):'—', k.cse_term_ars!=null?k.cse_term_ars.toFixed(2):'—', k.cse_term_usd!=null?k.cse_term_usd.toFixed(5):'—'],
          [],[`Planos: ${k.prod.PasTejPl} PAS · CE: ${k.ce_tej_pl!=null?k.ce_tej_pl.toFixed(4):'—'} MWh/PAS`],
          [`Toallas: ${k.prod.PasTejTs} PAS · CE: ${k.ce_tej_ts!=null?k.ce_tej_ts.toFixed(4):'—'} MWh/PAS`],
        ];
        CsvExport._download(rows, `Colortex_EEVsProd_${_mes}.csv`);
        UI.notify(`✓ EE vs Prod ${_mes} exportado`,'',3000);
      }
    });

    // Tendencia histórica
    requestAnimationFrame(() => {
      const ctx = document.getElementById('evp-chart-tend');
      if (!ctx) return;
      if (_chartT) { _chartT.destroy(); _chartT = null; }

      const tend = EEEngine.getMesesDisponibles().slice(-8).map(m => {
        const k2 = calcKpi(m);
        return {
          mes: m,
          ce_tej:  k2?.ce_tej  || null,
          ce_hil:  k2?.ce_hil  || null,
          ce_term: k2?.ce_term || null,
        };
      });

      const opts = UI.chartOptions('MWh/u');
      _chartT = new Chart(ctx, {
        type: 'line',
        data: {
          labels: tend.map(t => MES_LBL(t.mes)),
          datasets: [
            { label:'Tejeduría MWh/PAS', data: tend.map(t=>t.ce_tej),  borderColor: COLORES.tej,  backgroundColor:'transparent', tension:.3, pointRadius:4 },
            { label:'Hilandería MWh/kg', data: tend.map(t=>t.ce_hil),  borderColor: COLORES.hil,  backgroundColor:'transparent', tension:.3, pointRadius:4 },
            { label:'Terminado MWh/m',   data: tend.map(t=>t.ce_term), borderColor: COLORES.term, backgroundColor:'transparent', tension:.3, pointRadius:4 },
          ],
        },
        options: {
          ...opts,
          plugins: { ...opts.plugins, legend:{ display:true, labels:{ color:'var(--text2)', boxWidth:12, font:{size:10} } } },
        },
      });
    });
  }

  return { render };

})();
