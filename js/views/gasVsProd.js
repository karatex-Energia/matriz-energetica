/**
 * js/views/gasVsProd.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vista — Análisis Gas vs Producción · Colortex SA · Matriz Energética
 *
 * Muestra para el período seleccionado:
 *   · KPI cards: consumo total, por sector, pérdida caldera
 *   · Consumo específico por sector [m³/unidad]
 *   · Costo específico por sector [ARS/unidad + USD/unidad]
 *   · Detalle por equipo
 *   · Gráfico tendencia histórica (consumo + CE)
 *   · Gráfico distribución sectorial (donut)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

if (typeof Views === 'undefined') window.Views = {};

Views.GasVsProd = (() => {

  let _mes    = null;
  let _cl     = 'REAL';
  let _chartT = null;
  let _chartD = null;

  // ── HELPERS ─────────────────────────────────────────────────────────────────

  const M3   = v => v != null ? Fmt.num(v, 0) + ' m³'  : '—';
  const ARS  = v => v != null ? '$ ' + Fmt.num(v, 0)   : '—';
  const USD  = v => v != null ? Fmt.num(v, 2) + ' USD'  : '—';
  const PCT  = v => v != null ? Fmt.num(v, 1) + '%'     : '—';

  const MES_LBL = m => {
    if (!m) return '—';
    const mn = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const [y, mo] = m.split('-');
    return mn[parseInt(mo) - 1] + ' ' + y;
  };

  // Primer y último día del mes
  function _rango(mes) {
    const [y, m] = mes.split('-').map(Number);
    const ultimo = new Date(y, m, 0).getDate();
    return {
      desde: `${mes}-01`,
      hasta: `${mes}-${String(ultimo).padStart(2, '0')}`,
    };
  }

  const COLORES = {
    tint:   { bg: 'rgba(45,126,247,.7)',  border: '#2D7EF7' },
    estamp: { bg: 'rgba(234,179,8,.7)',   border: '#EAB308' },
    enc:    { bg: 'rgba(34,197,94,.7)',   border: '#22C55E' },
    perd:   { bg: 'rgba(239,68,68,.5)',   border: '#EF4444' },
    ce:     { bg: 'rgba(168,85,247,.7)',  border: '#A855F7' },
  };

  function destroyCharts() {
    if (_chartT) { _chartT.destroy(); _chartT = null; }
    if (_chartD) { _chartD.destroy(); _chartD = null; }
  }

  // ── SELECTOR DE PERÍODO ──────────────────────────────────────────────────────

  function buildControles() {
    const meses = GasVsProdEngine.getMesesDisponibles();
    if (!_mes || !meses.includes(_mes)) _mes = GasVsProdEngine.getLastMes();

    const opts = meses.map(m =>
      `<option value="${m}" ${m === _mes ? 'selected' : ''}>${MES_LBL(m)}</option>`
    ).reverse().join('');

    return `
    <div class="seg-panel" style="padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span class="seg-lbl">PERÍODO</span>
      <select id="gvp-mes" class="seg-btn" style="height:32px;padding:4px 10px;font-size:12px">
        ${opts}
      </select>
      <span style="display:flex;gap:4px">
        <button class="seg-btn ${_cl==='PROYECTADA'?'active':''}" data-cl="PROYECTADA">Proyectado</button>
        <button class="seg-btn ${_cl==='REAL'?'active':''}"       data-cl="REAL">Real</button>
        <button class="seg-btn ${!_cl?'active':''}"               data-cl="">Ambos</button>
      </span>
      <span style="margin-left:auto;display:flex;gap:6px">
        <span class="seg-btn" id="gvp-prev">&#8249; Anterior</span>
        <span class="seg-btn" id="gvp-next">Siguiente &#8250;</span>
        <span class="seg-btn" id="gvp-export" style="background:var(--accent);color:#fff">&#11015; CSV</span>
      </span>
    </div>`;
  }

  // ── KPI CARDS ────────────────────────────────────────────────────────────────

  function buildKpiCards(k) {
    if (!k) return `<div class="no-data-badge">⚠ Sin datos para el período seleccionado</div>`;
    const g = k.gas;

    return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:12px">

      <div class="kpi-card" style="border-color:var(--accent)">
        <div class="kpi-label">TOTAL PLANTA</div>
        <div class="kpi-val" style="color:var(--accent)">${Fmt.num(g.total_planta,0)}</div>
        <div class="kpi-sub">m³ gas natural</div>
      </div>

      <div class="kpi-card" style="border-color:#2D7EF7">
        <div class="kpi-label">TINTORERÍA</div>
        <div class="kpi-val" style="color:#2D7EF7">${Fmt.num(g.total_tint,0)}</div>
        <div class="kpi-sub">m³ · ${PCT(g.pct_tint)} del total</div>
      </div>

      <div class="kpi-card" style="border-color:#EAB308">
        <div class="kpi-label">ESTAMPADO</div>
        <div class="kpi-val" style="color:#EAB308">${Fmt.num(g.total_estamp,0)}</div>
        <div class="kpi-sub">m³ · ${PCT(g.pct_estamp)} del total</div>
      </div>

      <div class="kpi-card" style="border-color:#22C55E">
        <div class="kpi-label">ENCOLADO</div>
        <div class="kpi-val" style="color:#22C55E">${Fmt.num(g.total_enc,0)}</div>
        <div class="kpi-sub">m³ · ${PCT(g.pct_enc)} del total</div>
      </div>

      <div class="kpi-card" style="border-color:#EF4444">
        <div class="kpi-label">PÉRDIDA CALDERA</div>
        <div class="kpi-val" style="color:#EF4444">${Fmt.num(g.perdida_caldera,0)}</div>
        <div class="kpi-sub">m³ · ${PCT(g.pct_perd)} · ef. ${(g.eficiencia_caldera*100).toFixed(0)}%</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">CONSUMO CALDERA</div>
        <div class="kpi-val">${Fmt.num(g.gas_caldera,0)}</div>
        <div class="kpi-sub">m³ · útil: ${Fmt.num(g.gas_util_caldera,0)} m³</div>
      </div>

    </div>`;
  }

  // ── INDICADORES CE / CSE ─────────────────────────────────────────────────────

  function buildIndicadores(k) {
    if (!k) return '';
    const { gas: g, prod: p, ind: i } = k;

    const hasProd = p.mTint > 0 || p.mEst > 0 || p.KgEnc > 0;

    function cardSector(label, color, gas_m3, prod_val, prod_unit, ce, cse_ars, cse_usd) {
      const sinProd = prod_val <= 0;
      return `
      <div class="kpi-card" style="border-color:${color};min-width:200px">
        <div class="kpi-label" style="color:${color}">${label}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px">
          <div>
            <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Gas consumido</div>
            <div style="font-size:16px;font-weight:700;color:var(--text)">${Fmt.num(gas_m3,0)} m³</div>
          </div>
          <div>
            <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Producción</div>
            <div style="font-size:16px;font-weight:700;color:var(--text)">${prod_val > 0 ? Fmt.num(prod_val,0) : '—'} <span style="font-size:11px;font-weight:400">${prod_unit}</span></div>
          </div>
        </div>
        <div style="border-top:1px solid var(--border);margin:8px 0"></div>
        <div>
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Consumo específico</div>
          <div style="font-size:18px;font-weight:700;color:${color}">
            ${sinProd ? '<span style="color:var(--text3);font-size:13px">Sin datos de producción</span>' : (ce != null ? ce.toFixed(3) + ' m³/' + prod_unit : '—')}
          </div>
        </div>
        ${!sinProd && cse_ars != null ? `
        <div style="margin-top:6px">
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Costo específico</div>
          <div style="font-size:16px;font-weight:700;color:var(--text)">$ ${Fmt.num(cse_ars,2)} ARS/${prod_unit}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:1px">${cse_usd != null ? cse_usd.toFixed(4) + ' USD/' + prod_unit : '—'}</div>
        </div>` : ''}
      </div>`;
    }

    return `
    <div class="panel-section" style="margin-bottom:12px">
      <div class="panel-section-title">📊 CONSUMO ESPECÍFICO Y COSTO ESPECÍFICO · ${MES_LBL(k.desde?.slice(0,7))}</div>
      ${!hasProd ? `<div class="no-data-badge" style="margin-bottom:8px">⚠ Sin datos de producción — cargalos en "Carga Producción" para ver los indicadores</div>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${cardSector('TINTORERÍA','#2D7EF7', g.total_tint,  p.mTint, 'm', i.ce_tint,  i.cse_tint_ars,  i.cse_tint_usd)}
        ${cardSector('ESTAMPADO', '#EAB308', g.total_estamp, p.mEst,  'm', i.ce_estmp, i.cse_estmp_ars, i.cse_estmp_usd)}
        ${cardSector('ENCOLADO',  '#22C55E', g.total_enc,   p.KgEnc, 'kg',i.ce_enc,   i.cse_enc_ars,   i.cse_enc_usd)}
      </div>
    </div>`;
  }

  // ── DETALLE CALDERA ──────────────────────────────────────────────────────────

  function buildCaldera(k) {
    if (!k) return '';
    const g = k.gas;
    return `
    <div class="panel-section" style="margin-bottom:12px">
      <div class="panel-section-title">🔥 BALANCE CALDERA · Eficiencia ${(g.eficiencia_caldera*100).toFixed(0)}%</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:12px">
        <div style="background:var(--bg3);padding:8px 12px;border-radius:6px">
          <div style="color:var(--text3);font-size:10px;text-transform:uppercase">Gas quemado</div>
          <div style="font-size:18px;font-weight:700">${M3(g.gas_caldera)}</div>
        </div>
        <div style="display:flex;align-items:center;color:var(--text3);font-size:18px">→</div>
        <div style="background:var(--bg3);padding:8px 12px;border-radius:6px">
          <div style="color:var(--text3);font-size:10px;text-transform:uppercase">Gas útil (vapor)</div>
          <div style="font-size:18px;font-weight:700;color:#22C55E">${M3(g.gas_util_caldera)}</div>
        </div>
        <div style="display:flex;align-items:center;color:var(--text3);font-size:18px">+</div>
        <div style="background:var(--bg3);padding:8px 12px;border-radius:6px">
          <div style="color:var(--text3);font-size:10px;text-transform:uppercase">Pérdida caldera</div>
          <div style="font-size:18px;font-weight:700;color:#EF4444">${M3(g.perdida_caldera)}</div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:4px;padding:0 8px;font-size:11px;color:var(--text2)">
          <span>⬆ Vapor a Tintorería: <b>${M3(g.vapor_a_tint)}</b> (${(g.pct_vapor_tint*100).toFixed(1)}%)</span>
          <span>⬆ Vapor a Encolado: <b>${M3(g.vapor_a_enc)}</b> (${(g.pct_vapor_enc*100).toFixed(1)}%)</span>
        </div>
      </div>
    </div>`;
  }

  // ── DETALLE POR EQUIPO ───────────────────────────────────────────────────────

  function buildDetalleEquipos(k) {
    if (!k) return '';
    const det = k.gas.detalle_equipos;
    const total = k.gas.total_planta;

    const filas = Object.entries(det)
      .sort((a, b) => b[1].c - a[1].c)
      .map(([eq, d]) => {
        const pct = total > 0 ? (d.c / total * 100).toFixed(1) : '0';
        const secColor = d.sec === 'TINTORERIA' ? '#2D7EF7'
          : d.sec === 'ENCOLADO' ? '#22C55E'
          : d.sec === 'SALA CALDERA' ? '#EF4444' : '#EAB308';
        return `<tr>
          <td>${eq}</td>
          <td style="text-align:center;font-size:11px;color:${secColor}">${eq === 'ZIMMER' ? 'ESTAMPADO' : d.sec}</td>
          <td style="text-align:center;font-size:11px;color:var(--text3)">${d.tipo}</td>
          <td style="text-align:right">${Fmt.num(d.hs, 1)}</td>
          <td style="text-align:right;font-weight:600">${Fmt.num(d.c, 0)}</td>
          <td style="text-align:right;color:var(--text3)">${pct}%</td>
        </tr>`;
      }).join('');

    return `
    <div class="panel-section" style="margin-bottom:12px">
      <div class="panel-section-title">🔧 DETALLE POR EQUIPO</div>
      <table class="data-table" style="width:100%">
        <thead>
          <tr>
            <th>Equipo</th>
            <th style="text-align:center">Sector</th>
            <th style="text-align:center">Tipo</th>
            <th style="text-align:right">Hs marcha</th>
            <th style="text-align:right">m³ gas</th>
            <th style="text-align:right">% total</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr style="font-weight:700;border-top:2px solid var(--border)">
            <td colspan="4">TOTAL PLANTA</td>
            <td style="text-align:right">${Fmt.num(k.gas.total_planta,0)}</td>
            <td style="text-align:right">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
  }

  // ── GRÁFICOS ─────────────────────────────────────────────────────────────────

  function buildCharts() {
    return `
    <div style="display:grid;grid-template-columns:1fr 280px;gap:12px;margin-bottom:12px">
      <div class="panel-section">
        <div class="panel-section-title">📈 TENDENCIA — CONSUMO GAS POR SECTOR (m³)</div>
        <div style="position:relative;height:200px"><canvas id="gvp-chart-tend"></canvas></div>
      </div>
      <div class="panel-section">
        <div class="panel-section-title">🥧 DISTRIBUCIÓN</div>
        <div style="position:relative;height:180px;max-width:260px;margin:0 auto"><canvas id="gvp-chart-donut"></canvas></div>
      </div>
    </div>`;
  }

  function renderCharts(k) {
    const tend = GasVsProdEngine.calcTendencia(8);

    // Tendencia
    const ctxT = document.getElementById('gvp-chart-tend');
    if (ctxT && tend.length) {
      if (_chartT) { _chartT.destroy(); _chartT = null; }
      const opts = UI.chartOptions('m³');
      _chartT = new Chart(ctxT, {
        type: 'bar',
        data: {
          labels: tend.map(t => MES_LBL(t.mes)),
          datasets: [
            { label: 'Tintorería', data: tend.map(t => t.tint_m3),   backgroundColor: COLORES.tint.bg,   borderColor: COLORES.tint.border,   borderWidth:1, stack:'s' },
            { label: 'Estampado',  data: tend.map(t => t.estamp_m3),  backgroundColor: COLORES.estamp.bg, borderColor: COLORES.estamp.border, borderWidth:1, stack:'s' },
            { label: 'Encolado',   data: tend.map(t => t.enc_m3),     backgroundColor: COLORES.enc.bg,    borderColor: COLORES.enc.border,    borderWidth:1, stack:'s' },
            { label: 'Pérdida',    data: tend.map(t => t.perdida_m3), backgroundColor: COLORES.perd.bg,   borderColor: COLORES.perd.border,   borderWidth:1, stack:'s' },
          ],
        },
        options: {
          ...opts,
          plugins: { ...opts.plugins, legend: { display:true, labels:{ color:'var(--text2)', boxWidth:12, font:{size:10} } } },
          scales: { x: opts.scales?.x||{}, y: { stacked:true, ticks:{ color:'var(--text2)', font:{size:10} } } },
        },
      });
    }

    // Donut
    if (k) {
      const ctxD = document.getElementById('gvp-chart-donut');
      if (ctxD) {
        if (_chartD) { _chartD.destroy(); _chartD = null; }
        _chartD = new Chart(ctxD, {
          type: 'doughnut',
          data: {
            labels: ['Tintorería','Estampado','Encolado','Pérdida caldera'],
            datasets: [{
              data: [k.gas.total_tint, k.gas.total_estamp, k.gas.total_enc, k.gas.perdida_caldera],
              backgroundColor: [COLORES.tint.bg, COLORES.estamp.bg, COLORES.enc.bg, COLORES.perd.bg],
              borderColor:     [COLORES.tint.border, COLORES.estamp.border, COLORES.enc.border, COLORES.perd.border],
              borderWidth: 2,
            }],
          },
          options: {
            responsive:true, maintainAspectRatio:false,
            plugins: {
              legend: { position:'bottom', labels:{ color:'var(--text2)', font:{size:10}, boxWidth:12 } },
              tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${Fmt.num(ctx.raw,0)} m³` } },
            },
          },
        });
      }
    }
  }

  // ── RENDER PRINCIPAL ─────────────────────────────────────────────────────────

  function render() {
    const container = document.getElementById('view-gvp');
    if (!container) return;

    destroyCharts();

    const meses = GasVsProdEngine.getMesesDisponibles();
    if (!meses.length) {
      container.innerHTML = `<div class="no-data-badge" style="margin:32px auto">⚠ Sin datos de producción disponibles</div>`;
      return;
    }

    if (!_mes) _mes = GasVsProdEngine.getLastMes();
    const { desde, hasta } = _rango(_mes);
    const k = GasVsProdEngine.calcKpi(desde, hasta, _cl || null);

    container.innerHTML = `
      ${buildControles()}
      ${buildKpiCards(k)}
      ${buildCharts()}
      ${buildIndicadores(k)}
      ${buildCaldera(k)}
      ${buildDetalleEquipos(k)}
    `;

    // Bind eventos
    document.getElementById('gvp-mes')?.addEventListener('change', e => { _mes = e.target.value; render(); });

    document.querySelectorAll('[data-cl]').forEach(btn => {
      btn.addEventListener('click', () => { _cl = btn.dataset.cl; render(); });
    });

    document.getElementById('gvp-export')?.addEventListener('click', () => {
      if (typeof ExcelExport !== 'undefined') {
        ExcelExport.exportarGasVsProd(desde, hasta, _cl || null);
      } else {
        CsvExport.exportarGasVsProd(desde, hasta, _cl || null);
      }
    });

    const mesesArr = meses;
    document.getElementById('gvp-prev')?.addEventListener('click', () => {
      const i = mesesArr.indexOf(_mes);
      if (i > 0) { _mes = mesesArr[i-1]; render(); }
    });
    document.getElementById('gvp-next')?.addEventListener('click', () => {
      const i = mesesArr.indexOf(_mes);
      if (i < mesesArr.length-1) { _mes = mesesArr[i+1]; render(); }
    });

    requestAnimationFrame(() => renderCharts(k));
  }

  return { render };

})();
