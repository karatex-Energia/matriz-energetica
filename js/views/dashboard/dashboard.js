/**
 * js/views/dashboard/dashboard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vista Dashboard — Colortex SA · Matriz Energética
 *
 * Orquesta la construcción del dashboard completo:
 *   · Segmenters (filtros de período/sector/tipo)
 *   · Alertas operacionales A/B/C/D
 *   · Sección de costos (B1–B7)
 *   · KPI distribuidora
 *   · KPI día
 *   · KPI período
 *   · Gauges de consumo (planta + top 4 equipos)
 *   · Gráficos histórico, sector, evolución, franja
 *   · Ranking de equipos
 *   · Indicadores acumulados
 *   · Distribución por tipo y sector
 *
 * CORRECCIÓN DE BUGS CRÍTICOS del original:
 *   - consDir/consInd/consMix: ahora declaradas ANTES de su primer uso
 *   - ldfYM: declarada ANTES de dataMes
 *   - Usa const/let (no var) para evitar hoisting silencioso
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

// Namespace de vistas
if (typeof Views === 'undefined') window.Views = {};

Views.Dashboard = (() => {

  // ── HELPERS INTERNOS ────────────────────────────────────────────────────────

  function ndBadge(msg) {
    return `<span class="no-data-badge">⚠ ${msg}</span>`;
  }

  function setPeriod(p) {
    AppState.setFiltros({ period: p });
    if (p === 'day' && !AppState.filtros.f) {
      AppState.setFiltros({ f: Repository.getLastProdDate() });
    }
    render();
  }

  function navPeriod(period, dir) {
    const newF = DateHelpers.navPeriod(period, dir, AppState.filtros.f);
    AppState.setFiltros({ f: newF, period });
    render();
  }

  // ── SEGMENTERS ──────────────────────────────────────────────────────────────

  function buildSegmenters(pa, fv, sd, selY, selM, wLbl) {
    const mn = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const FIL = AppState.filtros;
    const CU  = AppState.currentUser;

    let periodPicker = '';
    if (pa === 'day' || !pa) {
      periodPicker = `<div class="seg-btn"><input type="date" value="${fv}" id="seg-date" class="seg-date-input"></div>`;
    } else if (pa === 'week') {
      periodPicker = `<span class="seg-btn" data-nav="week,-1">&#8249;</span><span class="seg-btn active" style="min-width:140px;text-align:center">${wLbl}</span><span class="seg-btn" data-nav="week,1">&#8250;</span><select class="seg-btn" id="seg-week-sel">${DateHelpers.buildWeekOpts(sd)}</select>`;
    } else if (pa === 'month') {
      periodPicker = `<span class="seg-btn" data-nav="month,-1">&#8249;</span><span class="seg-btn active" style="min-width:110px;text-align:center">${mn[selM]} ${selY}</span><span class="seg-btn" data-nav="month,1">&#8250;</span><select class="seg-btn" id="seg-month-sel">${DateHelpers.buildMonthOpts(selY, selM)}</select>`;
    } else if (pa === 'year') {
      periodPicker = `<span class="seg-btn" data-nav="year,-1">&#8249;</span><span class="seg-btn active">${selY}</span><span class="seg-btn" data-nav="year,1">&#8250;</span><select class="seg-btn" id="seg-year-sel">${DateHelpers.buildYearOpts(selY)}</select>`;
    }

    return `
      <div class="seg-panel">
        <div class="seg-row">
          <span class="seg-lbl">PERÍODO</span>
          <span class="seg-btn ${pa==='day'||!pa?'active':''}" data-period="day">DÍA</span>
          <span class="seg-btn ${pa==='week'?'active':''}" data-period="week">SEMANA</span>
          <span class="seg-btn ${pa==='month'?'active':''}" data-period="month">MES</span>
          <span class="seg-btn ${pa==='year'?'active':''}" data-period="year">AÑO</span>
          ${periodPicker}
          <span style="margin-left:auto;display:flex;gap:4px">
            <span class="seg-btn" id="seg-reset">&#8635; RESTABLECER</span>
            <span class="seg-btn" id="seg-export">&#11015; EXPORTAR</span>
            ${CU.role === 'jefe' ? '<span class="seg-btn" id="seg-print">IMPRIMIR</span>' : ''}
          </span>
        </div>
        <div class="seg-row" style="margin-top:4px">
          <span class="seg-lbl">SECTOR</span>
          <span class="seg-btn ${!FIL.sec?'active':''}" data-sec="">TODOS</span>
          <span class="seg-btn ${FIL.sec==='TINTORERIA'?'active':''}" data-sec="TINTORERIA">TINTORERÍA</span>
          <span class="seg-btn ${FIL.sec==='ENCOLADO'?'active':''}" data-sec="ENCOLADO">ENCOLADO</span>
          <span class="seg-lbl" style="margin-left:12px">TIPO</span>
          <span class="seg-btn ${!FIL.tipo?'active':''}" data-tipo="">TODOS</span>
          <span class="seg-btn ${FIL.tipo==='DIRECTO'?'active':''}" data-tipo="DIRECTO">DIRECTO</span>
          <span class="seg-btn ${FIL.tipo==='INDIRECTO'?'active':''}" data-tipo="INDIRECTO">INDIRECTO</span>
          <span class="seg-btn ${FIL.tipo==='MIXTO'?'active':''}" data-tipo="MIXTO">MIXTO</span>
        </div>
      </div>`;
  }

  // ── BIND DE EVENTOS EN SEGMENTERS ───────────────────────────────────────────

  function bindSegmenters() {
    // Botones de período
    document.querySelectorAll('[data-period]').forEach(el => {
      el.addEventListener('click', () => setPeriod(el.dataset.period));
    });

    // Navegación anterior/siguiente
    document.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', () => {
        const [period, dir] = el.dataset.nav.split(',');
        navPeriod(period, +dir);
      });
    });

    // Selector de fecha día
    const segDate = document.getElementById('seg-date');
    if (segDate) {
      segDate.addEventListener('change', () => {
        AppState.setFiltros({ f: segDate.value, period: 'day' });
        render(); UI.updateTopbar();
      });
    }

    // Selectores de semana/mes/año
    ['seg-week-sel','seg-month-sel','seg-year-sel'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          if (id === 'seg-year-sel') {
            AppState.setFiltros({ f: el.value + '-01-01', period: 'year' });
          } else {
            const period = id.includes('week') ? 'week' : 'month';
            AppState.setFiltros({ f: el.value, period });
          }
          render();
        });
      }
    });

    // Botones de sector
    document.querySelectorAll('[data-sec]').forEach(el => {
      el.addEventListener('click', () => { AppState.setFiltros({ sec: el.dataset.sec }); render(); });
    });

    // Botones de tipo
    document.querySelectorAll('[data-tipo]').forEach(el => {
      el.addEventListener('click', () => { AppState.setFiltros({ tipo: el.dataset.tipo }); render(); });
    });

    // Reset
    const btnReset = document.getElementById('seg-reset');
    if (btnReset) btnReset.addEventListener('click', () => {
      AppState.setFiltros({ f: '', sec: '', tipo: '', period: '' });
      render();
    });

    // Exportar
    const btnExport = document.getElementById('seg-export');
    if (btnExport) btnExport.addEventListener('click', () => CsvExport.exportarProduccion());

    // Imprimir
    const btnPrint = document.getElementById('seg-print');
    if (btnPrint) btnPrint.addEventListener('click', () => window.print());
  }

  // ── RENDER PRINCIPAL ────────────────────────────────────────────────────────

  function render() {
    const FIL = AppState.filtros;
    const p   = CONFIG.tarifas;
    const cf  = CONFIG.cargosFijos;

    // ── Fecha de referencia
    const ldf = FIL.f || Repository.getLastProdDate();
    const ld  = Repository.getDistForDate(ldf);
    const autOrig = ld.aut || 0;
    const aut     = Repository.autEfectivo(ld);           // usa aut_rev si existe, sino aut
    const pciV    = ld.pci || CONFIG.energia.pciRef;

    // ── Datos de producción del día
    const dDia    = Repository.getProdForDate(ldf);
    const sinProg = !dDia.filter(r => r.cl === 'PROYECTADA').length;
    const sinReal = !dDia.filter(r => r.cl === 'REAL').length;
    const sinDist = !ld || !ld.aut || ld.aut === 0;
    const sinLect = EnergyEngine.getConsumoRealLectura(ldf) === null;
    const tieneProb = sinProg || sinReal || sinDist || sinLect;

    // ── KPIs día (debe calcularse ANTES de usar kDia.nom)
    const kDia = KpiEngine.calcKPI(dDia, pciV);

    // ── Volúmenes nominado y disponible (ítems 12–15)
    // Regla: aut ≤ nom siempre. Si aut < nom → hay restricción. Si aut = nom → sin restricción.
    const nomVal0 = ld.nom || kDia.nom || 0;
    const nomVal  = nomVal0;
    const hayRest = aut < nomVal;                         // restricción = aut menor que nom
    const rest    = hayRest ? (nomVal - aut) : 0;         // rest = nom - aut
    const volDisp = aut;                                  // disponible = aut efectivo siempre

    // ── Consumo real y disponible
    const dispObj      = EnergyEngine.getDisponibleActual(ld, ldf);
    const consReal_lect = dispObj.cons;
    const disp         = dispObj.disp;
    const pctCons      = dispObj.pct;

    const dispDist = volDisp;
    // Vol disponible: usa consumo intradiario (última lectura del día) para tiempo real
    const consIntra = EnergyEngine.getConsumoIntradiaHoy(ldf) || consReal_lect || kDia.cR;
    const dispKPI   = Math.max(0, dispDist - consIntra);

    // ── KPI período
    const kPer = KpiEngine.calcKPI(Repository.filterProd(), pciV);

    // ── KPI mes completo (para consolidado)
    // CORRECCIÓN BUG: ldfYM declarada ANTES de dataMes
    const ldfYM  = ldf.slice(0, 7);
    const dataMes = AppState.db.prod.filter(r => r.f.slice(0, 7) === ldfYM);
    const kMes   = KpiEngine.calcKPI(dataMes, pciV);

    // ── Alertas (requiere saber si hay datos)
    const consParaAlertas = consReal_lect || kDia.cR;
    const sinConsReal     = consParaAlertas === 0 && sinLect && sinReal;
    const alertasArr      = sinConsReal ? [] : KpiEngine.calcAlertas(ld, consParaAlertas);

    // ── Costos
    // CORRECCIÓN: tipos filtrados por el mismo período que tramos FD/ID
    // filterProdMes: usa el período activo del segmentador; si no hay, usa el mes de ldf
    const _prodReal = FIL.period
      ? Repository.filterProd(r => r.cl === 'REAL')
      : AppState.db.prod.filter(r => r.cl === 'REAL' && r.f.slice(0,7) === ldfYM);
    const consDir = Math.round(_prodReal.filter(r => r.tipo === 'DIRECTO').reduce((a, r) => a + r.c, 0) * 100) / 100;
    const consInd = Math.round(_prodReal.filter(r => r.tipo === 'INDIRECTO').reduce((a, r) => a + r.c, 0) * 100) / 100;
    const consMix = Math.round(_prodReal.filter(r => r.tipo === 'MIXTO').reduce((a, r) => a + r.c, 0) * 100) / 100;
    const consTotalPlanta = consDir + consInd + consMix;

    // Consumo por sector
    const sectores = [...new Set(_prodReal.map(r => r.sec).filter(Boolean))].sort();
    const consPorSector = sectores.map(sec => ({
      sec,
      vol:  Math.round(_prodReal.filter(r => r.sec === sec).reduce((a,r) => a+r.c, 0) * 100) / 100,
    })).sort((a,b) => b.vol - a.vol);

    const pctDir = consTotalPlanta ? consDir / consTotalPlanta * 100 : 0;
    const pctInd = consTotalPlanta ? consInd / consTotalPlanta * 100 : 0;
    const pctMix = consTotalPlanta ? consMix / consTotalPlanta * 100 : 0;

    // Tramos FD/ID
    const fechasMes     = [...new Set(AppState.db.prod.filter(r => r.cl === 'REAL' && r.f.slice(0, 7) === ldfYM).map(r => r.f))].sort();
    const tramosMes     = TariffEngine.calcCostoTramos(fechasMes);
    const { volFD, volID, costFD: costFDtramo, costID: costIDtramo } = tramosMes;
    const consReal_     = consReal_lect || kDia.cR;
    const tramosDia     = TariffEngine.calcCostoDia(consReal_);
    const costGNtotal   = costFDtramo + costIDtramo;
    const costGNtotal_dia = tramosDia.costTotal_dia;

    // Penalizaciones
    const penObj  = TariffEngine.calcPenalizaciones(ld, consReal_);
    const exceso  = penObj.exceso;
    const deficit = penObj.deficit;
    const costGNLexc  = penObj.penExcARS;
    const costGNLsub  = penObj.penSubARS;
    const penTot      = penObj.penTotal;

    // Cargos fijos y consolidado
    const cargosConsolid    = cf.cargoFijo + cf.cargoReservaFD;
    const cargosFijos       = cf.cargoFijo + cf.cargoReservaFD + cf.cargoM3FD + cf.cargoM3ID;  // Sin transporte (ítem 8)
    const cargosFijosTotal  = cargosFijos + cf.transpNQ + cf.transpNO;                         // Con transporte (referencia)
    const consolidado    = TariffEngine.calcCostoConsolidado(ldfYM, consReal_);
    const volMes         = consolidado.volMes;
    const costConsolid_per = consolidado.costConsolid_per;
    const pctFD_consolid   = consolidado.pctFD;
    const pctID_consolid   = consolidado.pctID;

    // ── Datos de ranking y estadísticas
    const eqArr   = KpiEngine.calcEquiposRanking();
    const top4    = eqArr.slice(0, 4);
    const stats   = KpiEngine.calcEstadisticasAcumuladas();
    const totalDist = AppState.db.dist.reduce((a, r) => a + (r.aut || 0), 0);

    const plantaReal = Repository.filterProd(r => r.cl === 'REAL').reduce((a, r) => a + r.c, 0);
    const plantaProg = Repository.filterProd(r => r.cl === 'PROYECTADA').reduce((a, r) => a + r.c, 0);
    const plantaPct  = plantaProg ? plantaReal / plantaProg * 100 : 0;

    // ── Datos de gráficos
    const histData   = Repository.getChartHistoricoData();
    const sectData   = Repository.getChartSectorData();

    // Semana activa
    const pa  = FIL.period || 'day';
    const fv  = FIL.f || Repository.getLastProdDate();
    const sd  = fv ? new Date(fv + 'T12:00:00') : new Date();
    const selY = sd.getFullYear(), selM = sd.getMonth();
    const wRange = DateHelpers.getWeekRange(sd);
    const wLbl   = DateHelpers.weekLabel(sd);
    const wkDates = DateHelpers.getWeekDates(wRange.start.toISOString().slice(0, 10));
    const franjaData = Repository.getChartFranjaData(wkDates);

    // ── Desviación del día
    // Fuente primaria: lectura caudalímetro. Fallback: suma registros REAL producción.
    const cRealDia = consReal_lect || kDia.cR;
    const dA_ = cRealDia - kDia.cP;
    const dR_ = kDia.cP ? (cRealDia - kDia.cP) / kDia.cP * 100 : 0;

    // ══════════════════════════════════════════════════════════════════
    // CONSTRUIR HTML
    // ══════════════════════════════════════════════════════════════════

    // Alertas
    let alertHTML = '';
    if (sinConsReal && sinDist) {
      alertHTML = `<div class="alert-banner alert-o"><div class="alert-icon">⚠</div><div style="flex:1"><div class="alert-title" style="color:var(--yellow)">DATOS INSUFICIENTES — NO SE PUEDEN CALCULAR ALERTAS OPERACIONALES</div><div class="alert-det">Sin lecturas de caudalímetro y sin datos de distribuidora para ${Fmt.date(ldf)}.</div></div></div>`;
    } else if (sinConsReal) {
      alertHTML = `<div class="alert-banner alert-o"><div class="alert-icon">⚠</div><div style="flex:1"><div class="alert-title" style="color:var(--yellow)">SIN CONSUMO REAL — ALERTAS PENDIENTES</div><div class="alert-det">No se encontraron lecturas de caudalímetro ni producción real para ${Fmt.date(ldf)}.</div></div></div>`;
    }
    alertasArr.forEach(al => {
      const col = al.col === 'r' ? 'var(--red)' : 'var(--orange)';
      const cls = `alert-banner alert-${al.col === 'r' ? 'r' : 'o'}`;
      alertHTML += `<div class="${cls}"><div class="alert-icon">⚠</div><div style="flex:1"><div class="alert-title" style="color:${col}">ALERTA ${al.tipo} — ${al.msg}</div><div class="alert-det">${al.det}</div></div><div style="text-align:right;min-width:140px"><div style="font-family:var(--fontv),Arial;font-size:14px;font-weight:700;color:${col}">${Fmt.ars(al.costo)}</div><div style="font-family:var(--fontc);font-size:11px;color:${col};opacity:.8">${Fmt.usd(al.costo / p.usd)}</div></div></div>`;
    });

    // Segmenters
    const segHTML = buildSegmenters(pa, fv, sd, selY, selM, wLbl);

    // Costos
    const costoHTML = buildCostosHTML({ tieneProb, sinProg, sinReal, sinDist, sinLect, cf,
      costFDtramo, costIDtramo, volFD, volID, p,
      costGNLexc, costGNLsub, exceso, deficit, penTot,
      consDir, consInd, consMix, pctDir, pctInd, pctMix,
      cargosConsolid, cargosFijos, costConsolid_per, pctFD_consolid, pctID_consolid, volMes,
      consolidado, ldfYM });

    // Distribuidora
    const distHTML = buildDistribuidoraHTML({ ld, aut, rest, hayRest, volDisp, nomVal,
      dispDist, consReal_lect, kDia, pciV });

    // KPI día
    const kpiDiaHTML = buildKpiDiaHTML({ kDia, aut, rest, hayRest, volDisp, nomVal, consReal_lect,
      consIntra, dispDist, dispKPI, dA_, dR_, pciV, sinLect, sinReal, ld, p });

    // KPI período
    const kpiPerHTML = buildKpiPeriodoHTML({ kPer, totalDist, kMes });

    // Gauges
    const gaugesHTML = buildGaugesHTML({ plantaReal, plantaProg, plantaPct, top4 });

    // Charts
    const charts1 = `<div class="dash-section"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><div class="sec-hdr"><div class="sec-title">SEMANA OPERATIVA — REAL VS PROGRAMADO</div></div><div id="chart-hist" style="height:170px;width:100%"></div></div><div><div class="sec-hdr"><div class="sec-title">CONSUMO POR SECTOR — ÚLTIMOS 7 DÍAS</div></div><div id="chart-sector" style="height:170px;width:100%"></div></div></div></div>`;
    const charts2 = `<div class="dash-section"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><div class="sec-hdr"><div class="sec-title">MES EN CURSO — REAL VS PROGRAMADO</div></div><div id="chart-evol" style="height:170px;width:100%"></div></div><div><div class="sec-hdr"><div class="sec-title">CONSUMO POR FRANJA HORARIA · SEMANA ${wLbl}</div></div><div id="chart-franja" style="height:170px;width:100%"></div></div></div></div>`;

    // Ranking y bottom
    const bottomHTML = buildBottomHTML({ eqArr, stats, consDir, consInd, consMix, consPorSector, consTotalPlanta, p });

    // Comparación de períodos
    const compHTML = buildComparacionHTML();

    // ── Renderizar todo
    const container = document.getElementById('view-dashboard');
    // Panel de estado operativo — HTML estático (se rellena después)
    const flowPanelHTML = '<div class="dash-section" style="padding:10px 14px;margin-bottom:0"><div class="sec-hdr" style="margin-bottom:8px"><div class="sec-title">ESTADO OPERATIVO</div></div><div id="dash-flow-status" style="display:none"></div><div id="dash-flow-empty" style="font-family:var(--fontc);font-size:11px;color:var(--text3)">Sin datos de estado disponibles</div></div>';

    const alertBlock = alertHTML
      ? '<div class="dash-section" style="padding:0;margin-bottom:0"><div class="sec-hdr" style="padding:8px 14px 6px"><div class="sec-title">ALERTA OPERACIONAL</div></div>' + alertHTML + '</div>'
      : '';
    // Segmentador sticky — fuera del scroll, siempre visible
    var _segEl = document.getElementById('seg-sticky');
    if (_segEl) _segEl.innerHTML = segHTML;

    container.innerHTML = flowPanelHTML + alertBlock + costoHTML + distHTML + kpiDiaHTML + kpiPerHTML + gaugesHTML + charts1 + charts2 + bottomHTML + compHTML;

    // Rellenar panel de FlowEngine de forma segura (nunca rompe el render)
    try {
      const _flowEl = document.getElementById('dash-flow-status');
      if (_flowEl && typeof FlowEngine !== 'undefined') {
        const recent  = FlowEngine.getRecentDaysStatus(7);
        const pending = FlowEngine.getPendingDays();
        if (recent.length) {
          const chips = recent.map(s => {
            const m   = FlowEngine.getEstadoMeta(s.estado);
            const tip = s.pendientesInternos.length ? s.pendientesInternos.join(' · ') : (s.diferido ? 'Esperando dato externo (D+1)' : 'Día completo');
            return '<div title="' + tip + '" style="background:' + m.bg + ';border:1px solid ' + m.color + '33;border-radius:5px;padding:4px 9px;cursor:default;white-space:nowrap">' +
              '<div style="font-family:Calibri,var(--fontc);font-size:9px;font-weight:700;color:var(--text3)">' + s.fecha.slice(5).replace('-','/') + '</div>' +
              '<div style="font-family:Calibri,var(--fontc);font-size:9.5px;font-weight:700;color:' + m.color + ';margin-top:1px">' + m.label + '</div>' +
              '</div>';
          }).join('');
          const alertBanner = pending.length
            ? '<div style="background:rgba(234,179,8,.07);border:1px solid rgba(234,179,8,.25);border-radius:6px;padding:8px 12px;margin-top:6px;font-size:11px;color:var(--yellow)">⚠ <strong>' + pending.length + ' día(s) con datos internos pendientes.</strong> Los indicadores de esos días son parciales.</div>'
            : '';
          _flowEl.innerHTML =
            '<div style="font-family:Calibri,var(--fontc);font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px">ESTADO OPERATIVO — ÚLTIMOS 7 DÍAS</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap">' + chips + '</div>' + alertBanner;
          _flowEl.style.display = 'block';
        }
      }
    } catch(_e) { /* FlowEngine no disponible — ignorar silenciosamente */ }

    // ── Bind comparación de períodos
    var _cmpRun = document.getElementById('dash-cmp-run');
    var _cmpClr = document.getElementById('dash-cmp-clear');
    if (_cmpRun) _cmpRun.addEventListener('click', function() {
      if (typeof runDashComparacion === 'function') runDashComparacion();
    });
    if (_cmpClr) _cmpClr.addEventListener('click', function() {
      var el = document.getElementById('dash-cmp-result');
      if (el) el.innerHTML = '<div style="text-align:center;padding:30px;font-family:Calibri,var(--fontc);font-size:12px;color:var(--text3)">Seleccioná los períodos y presioná Comparar</div>';
    });
    if (typeof bindComparacionSegmenters === 'function') bindComparacionSegmenters();

    // ── Bind de eventos del segmenter (después de inyectar HTML)
    bindSegmenters();
    UI.updateTopbar();

    // Destruir gauges ECharts previos
    if (typeof GaugeRenderer !== 'undefined' && GaugeRenderer.destroyAll) GaugeRenderer.destroyAll();

    // ── Dibujar charts y gauges con defer para que el DOM esté completamente listo
    setTimeout(() => {
      drawChartsAndGauges({
        plantaReal, plantaPct, top4,
        histData, sectData, franjaData,
        consDir, consInd, consMix,
        wLbl
      });
      // Forzar resize de ECharts tras render (resuelve dona sector invisible)
      setTimeout(function() {
        if (typeof GaugeRenderer !== 'undefined' && GaugeRenderer.resizeAll) GaugeRenderer.resizeAll();
      }, 250);
    }, 150);
  }

  // ── SECCIÓN DISTRIBUIDORA ───────────────────────────────────────────────────

  function buildDistribuidoraHTML({ ld, aut, rest, hayRest, volDisp, nomVal, dispDist, consReal_lect, kDia, pciV }) {
    const p   = CONFIG.tarifas;
    const consR = consReal_lect || kDia.cR;
    const pct   = volDisp > 0 ? Math.min(consR / volDisp * 100, 999) : 0;
    const pbCls = pct > 100 ? 'pb-r' : pct > 80 ? 'pb-o' : 'pb-g';
    const pbW   = Math.min(100, pct);

    return `
      <div class="dash-section">
        <div class="sec-hdr"><div class="sec-title">DISTRIBUIDORA — CONTROL DIARIO</div></div>
        <div class="kg kg-6">
          <div class="kblock ${hayRest ? 'da' : ''}">
            <div class="klabel">NOMINADO</div>
            <div class="kval sm">${Fmt.num(nomVal)} m³</div>
            <div class="ksub">${Fmt.ars(nomVal * p.gnARS)}</div>
            <div class="ksub">${Fmt.usd(nomVal * p.gnARS / p.usd)}</div>
            <div class="ksub" style="font-size:10.5px;color:var(--text3)">PCI: ${Fmt.num(pciV)} kcal/m³</div>
          </div>
          <div class="kblock">
            <div class="klabel">AUTORIZADO</div>
            <div class="kval sm">${Fmt.num(aut)} m³</div>
            <div class="ksub">${Fmt.ars(aut * p.gnARS)}</div>
            <div class="ksub">${Fmt.usd(aut * p.gnARS / p.usd)}</div>
          </div>
          <div class="kblock ${hayRest ? 'da' : ''}">
            <div class="klabel">RESTRINGIDO</div>
            ${hayRest ? `
              <div class="kval sm" style="color:var(--red)">${Fmt.num(nomVal ? rest / nomVal * 100 : 0, 1)}%</div>
              <div class="ksub" style="color:var(--red)">${Fmt.ars(rest * p.gnARS)}</div>
              <div class="ksub" style="color:var(--red)">${Fmt.usd(rest * p.gnARS / p.usd)}</div>
              <div class="ksub" style="font-size:10.5px;color:var(--text3);margin-top:2px">Restricción activa · ${Fmt.num(rest)} m³</div>
            ` : `<div class="kval sm" style="color:var(--text3)">SIN RESTRICCIÓN</div>`}
          </div>
          <div class="kblock">
            <div class="klabel">LÍM. OPERATIVO</div>
            <div class="kval sm">${Fmt.num(volDisp)} m³</div>
            <div class="ksub">${Fmt.ars(volDisp * p.gnARS)}</div>
            <div class="ksub">${Fmt.usd(volDisp * p.gnARS / p.usd)}</div>
            <div class="pb-wrap" style="margin-top:4px"><div class="pb ${pbCls}" style="width:${pbW.toFixed(1)}%"></div></div>
            <div class="ksub" style="font-size:10.5px;color:var(--text3)">${Fmt.num(pct, 1)}% consumido</div>
          </div>
          <div class="kblock">
            <div class="klabel">CONSUMO REAL HOY</div>
            <div class="kval sm" style="color:var(--green)">${Fmt.num(consR)} m³</div>
            <div class="ksub">${Fmt.ars(consR * p.gnARS)}</div>
            <div class="ksub">${Fmt.usd(consR * p.gnARS / p.usd)}</div>
          </div>
          <div class="kblock">
            <div class="klabel">FACTURADO</div>
            <div class="kval sm">${Fmt.num(ld.fact || 0)} m³</div>
            <div class="ksub">${Fmt.ars((ld.fact || 0) * p.gnARS)}</div>
            <div class="ksub">${Fmt.usd((ld.fact || 0) * p.gnARS / p.usd)}</div>
          </div>
        </div>
        ${ld.obs ? `<div style="margin-top:6px;font-family:var(--fontc);font-size:10px;color:var(--text3);font-style:italic">📋 ${ld.obs}</div>` : ''}
      </div>`;
  }

  // ── KPI DÍA ─────────────────────────────────────────────────────────────────

  function buildKpiDiaHTML({ kDia, aut, rest, hayRest, volDisp, nomVal, consReal_lect, consIntra, dispDist, dispKPI, dA_, dR_, pciV, sinLect, sinReal, ld, p }) {
    const sinD = sinLect && sinReal;
    return `
      <div class="dash-section">
        <div class="sec-hdr"><div class="sec-title">KPI — DÍA OPERATIVO</div></div>
        <div class="kg kg-4">
          <div class="kblock">
            <div class="klabel" style="margin-bottom:5px">CONSUMO PROGRAMADO</div>
            <div class="kdual">
              <div class="kd"><div class="kval">${Fmt.num(kDia.cP)} m³</div><div class="ksub">BASE</div></div>
              <div class="kd-sep"></div>
              <div class="kd r"><div class="kval">${Fmt.num(kDia.cPcorr)} m³</div><div class="ksub">PCI CORR.</div></div>
            </div>
            <div class="ksub" style="margin-top:4px">${Fmt.ars(kDia.cP * p.gnARS)}</div>
            <div class="ksub">${Fmt.usd(kDia.cP * p.gnARS / p.usd)}</div>
          </div>
          <div class="kblock">
            <div class="klabel" style="margin-bottom:5px">VOL. NOMINADO / AUTORIZADO</div>
            <div class="kdual">
              <div class="kd"><div class="kval">${Fmt.num(kDia.nom)} m³</div><div class="ksub">NOMINADO</div></div>
              <div class="kd-sep"></div>
              <div class="kd r"><div class="kval">${Fmt.num(aut)} m³</div><div class="ksub">AUTORIZADO</div></div>
            </div>
            <div class="ksub" style="margin-top:4px">${Fmt.ars(aut * p.gnARS)}</div>
            <div class="ksub">${Fmt.usd(aut * p.gnARS / p.usd)}</div>
          </div>
          <div class="kblock hl">
            <div class="klabel" style="margin-bottom:5px">CONSUMO REAL ★</div>
            ${sinLect ? ndBadge('SIN LECTURA CAUDALÍM.') : ''}
            ${sinReal ? ndBadge('SIN PROD. REAL') : ''}
            <div class="kdual">
              <div class="kd"><div class="kval lg" style="color:var(--green)">${Fmt.num(consReal_lect || kDia.cR)} m³</div><div class="ksub">LECT. CAUDALÍM.</div></div>
              <div class="kd-sep"></div>
              <div class="kd r"><div class="kval" style="color:var(--green)">${Fmt.num(((consReal_lect || kDia.cR) * pciV / CONFIG.energia.pciRef).toFixed(0))} m³</div><div class="ksub">PCI CORR.</div></div>
            </div>
            <div class="ksub" style="margin-top:4px">${Fmt.ars((consReal_lect || kDia.cR) * p.gnARS)}</div>
            <div class="ksub">${Fmt.usd((consReal_lect || kDia.cR) * p.gnARS / p.usd)}</div>
          </div>
          <div class="kblock ${Math.abs(dR_) > 15 ? 'da' : Math.abs(dR_) > 8 ? 'wa' : ''}">
            <div class="kdual" style="margin-bottom:4px">
              <div class="kd">
                <div class="klabel" style="font-size:9px">DESVÍO ABSOLUTO</div>
                <div class="kval" style="color:${dA_ > 0 ? 'var(--orange)' : dA_ < 0 ? 'var(--accent)' : 'var(--green)'}">${dA_ >= 0 ? '+' : ''}${Fmt.num(dA_)} m³</div>
              </div>
              <div class="kd-sep"></div>
              <div class="kd r">
                <div class="klabel" style="font-size:9px">DESVÍO RELATIVO</div>
                <div class="kval" style="color:${dR_ > 0 ? 'var(--orange)' : dR_ < 0 ? 'var(--accent)' : 'var(--green)'}">${dR_ >= 0 ? '+' : ''}${Fmt.num(dR_, 1)}%</div>
              </div>
            </div>
            ${Math.abs(dA_) > 0 ? `
            <div class="ksub">${Fmt.ars(Math.abs(dA_) * p.gnARS)} costo neto desvío</div>
            <div class="ksub">${Fmt.usd(Math.abs(dA_) * p.gnARS / p.usd)}</div>
            ` : '<div class="ksub" style="color:var(--green)">Sin desvío</div>'}
          </div>
        </div>
        <div class="kg kg-4" style="margin-top:7px">
          ${hayRest
            ? `<div class="kblock da">
                <div class="klabel" style="color:var(--red)">VOL. RESTRINGIDO</div>
                <div class="kval" style="color:var(--red)">${Fmt.num(rest)} m³</div>
                <div class="ksub" style="color:var(--red)">${Fmt.ars(rest * p.gnARS)}</div>
                <div class="ksub" style="color:var(--red)">${Fmt.usd(rest * p.gnARS / p.usd)}</div>
                <div class="ksub" style="font-size:9px;color:var(--text3);margin-top:2px">Restricción activa · ${Fmt.num(nomVal ? rest / nomVal * 100 : 0, 1)}% del nominado</div>
               </div>`
            : `<div class="kblock"><div class="klabel">VOL. RESTRINGIDO</div><div class="kval" style="color:var(--text3)">SIN RESTRICCIÓN</div></div>`
          }
          <div class="kblock ${dispKPI < volDisp * 0.1 ? 'da' : dispKPI < volDisp * 0.25 ? 'wa' : ''}">
            <div class="klabel">VOL. DISPONIBLE${hayRest ? ' (RESTRICCIÓN ACTIVA)' : ''}</div>
            <div class="kval">${Fmt.num(dispKPI)} m³</div>
            <div class="ksub">${hayRest ? 'AUT.' : 'NOM.'} (${Fmt.num(volDisp, 0)}) − CONSUMIDO (${Fmt.num(consIntra, 0)})</div>
            <div class="ksub" style="font-size:9px;color:var(--text3)">Última lectura · tiempo real</div>
          </div>
          <div class="kblock">
            <div class="klabel">VOLUMEN FACTURADO</div>
            <div class="kval">${Fmt.num(ld.fact || aut)} m³</div>
            <div class="ksub">${Fmt.ars((ld.fact || aut) * p.gnARS)} · ${Fmt.usd((ld.fact || aut) * p.gnARS / p.usd)}</div>
          </div>
          <div class="kblock">
            <div class="klabel">PCI VIGENTE / REFERENCIA</div>
            <div class="kdual">
              <div class="kd"><div class="kval xs">${Fmt.num(pciV)}</div><div class="ksub" style="font-size:9px;color:var(--text3)">kcal/m³ VIG.</div></div>
              <div class="kd-sep"></div>
              <div class="kd r"><div class="kval xs">${Fmt.num(CONFIG.energia.pciRef)}</div><div class="ksub" style="font-size:9px;color:var(--text3)">kcal/m³ REF.</div></div>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ── KPI PERÍODO ──────────────────────────────────────────────────────────────

  function buildKpiPeriodoHTML({ kPer, totalDist, kMes }) {
    const sinPerProd = kPer.cP === 0 && kPer.cR === 0;
    const dAp = kPer.dA;
    return `
      <div class="dash-section">
        <div class="sec-hdr">
          <div class="sec-title">KPI — VALORES ACUMULADOS DEL PERÍODO</div>
          ${sinPerProd ? ndBadge('SIN DATOS DE PRODUCCIÓN PARA EL PERÍODO SELECCIONADO') : ''}
        </div>
        <div class="kg kg-4">
          <div class="kblock">
            <div class="klabel" style="margin-bottom:5px">CONS. PROGRAMADO ACUM.</div>
            <div class="kdual">
              <div class="kd"><div class="kval">${Fmt.num(kPer.cP)} m³</div><div class="ksub">BASE</div></div>
              <div class="kd-sep"></div>
              <div class="kd r"><div class="kval">${Fmt.num(kPer.cPcorr)} m³</div><div class="ksub">PCI CORR.</div></div>
            </div>
          </div>
          <div class="kblock">
            <div class="klabel" style="margin-bottom:5px">NOMINADO / AUT. PERÍODO</div>
            <div class="kdual">
              <div class="kd"><div class="kval">${Fmt.num(kPer.nom)} m³</div><div class="ksub">NOMINADO</div></div>
              <div class="kd-sep"></div>
              <div class="kd r"><div class="kval">${Fmt.num(totalDist)} m³</div><div class="ksub">AUT. TOTAL</div></div>
            </div>
          </div>
          <div class="kblock hl">
            <div class="klabel" style="margin-bottom:5px">CONS. REAL ACUMULADO</div>
            <div class="kdual">
              <div class="kd"><div class="kval lg" style="color:var(--green)">${Fmt.num(kPer.cR)} m³</div><div class="ksub">REAL</div></div>
              <div class="kd-sep"></div>
              <div class="kd r"><div class="kval" style="color:var(--green)">${Fmt.num(kPer.cRcorr)} m³</div><div class="ksub">PCI CORR.</div></div>
            </div>
          </div>
          <div class="kblock ${Math.abs(kPer.dR) > 15 ? 'da' : Math.abs(kPer.dR) > 8 ? 'wa' : ''}">
            <div class="klabel">DESVÍO ACUMULADO</div>
            <div class="kval" style="color:${dAp > 0 ? 'var(--orange)' : dAp < 0 ? 'var(--accent)' : 'var(--green)'}">${dAp >= 0 ? '+' : ''}${Fmt.num(dAp)} m³</div>
            <div class="ksub">${kPer.dR >= 0 ? '+' : ''}${Fmt.num(kPer.dR, 1)}%</div>
          </div>
        </div>
      </div>`;
  }

  // ── COSTOS ───────────────────────────────────────────────────────────────────

  function buildCostosHTML({ tieneProb, sinProg, sinReal, sinDist, sinLect, cf,
    costFDtramo, costIDtramo, volFD, volID, p,
    costGNLexc, costGNLsub, exceso, deficit, penTot,
    consDir, consInd, consMix, pctDir, pctInd, pctMix,
    cargosConsolid, cargosFijos, costConsolid_per, pctFD_consolid, pctID_consolid, volMes,
    consolidado, ldfYM }) {

    const limFD = CONFIG.limites.fd;

    // Costo real por tipo: proporcional a su participación en el total FD+ID
    const costTotal_tipos = costFDtramo + costIDtramo;
    const totalVol = consDir + consInd + consMix;
    const costDir = totalVol > 0 ? consDir / totalVol * costTotal_tipos : 0;
    const costInd = totalVol > 0 ? consInd / totalVol * costTotal_tipos : 0;
    const costMix = totalVol > 0 ? consMix / totalVol * costTotal_tipos : 0;

    return `
      <div class="dash-section cost-section">
        <div class="sec-hdr"><div class="sec-title">INDICADORES DE COSTO · PERÍODO SELECCIONADO</div></div>
        <div style="font-family:Calibri,var(--fontc);font-size:9.5px;color:var(--text3);margin-bottom:8px;line-height:1.4">
          Análisis de costos por tramo tarifario (CDR = ${Fmt.num(limFD, 0)} m³/día), tipo de consumo y cargos consolidados.
          Tarifa FD dentro de CDR · Tarifa ID por excedente · Penalización GNL (sobreconsumo) · Tarifa ID (subconsumo) · Cargos fijos.
        </div>
        ${tieneProb ? `<div style="background:rgba(234,179,8,.07);border:1px solid rgba(234,179,8,.25);border-radius:5px;padding:6px 10px;margin-bottom:6px;font-family:Calibri,var(--fontc);font-size:10px;color:var(--yellow)">⚠ CÁLCULOS PARCIALES — Datos faltantes: ${sinProg?'Sin programación · ':''}${sinReal?'Sin prod. real · ':''}${sinDist?'Sin distribuidora · ':''}${sinLect?'Sin lecturas caudalímetro':''}</div>` : ''}

        <!-- LAYOUT: bloques izquierda + cuadro tarifario derecha -->
        <div style="display:grid;grid-template-columns:1fr 240px;gap:8px;align-items:stretch">

          <!-- COLUMNA IZQUIERDA: 6 bloques + consolidado -->
          <div style="display:flex;flex-direction:column;gap:8px">

            <!-- Fila 1: Tramo GN + Penalización + Costo Consolidado Penalizado -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">

              <div class="kblock" style="padding:9px 11px">
                <div class="klabel" style="margin-bottom:4px">COSTO POR CONSUMO GN — POR TRAMO</div>
                <div class="ksub" style="font-size:8.5px;color:var(--text3);margin-bottom:5px">Tramo FD: consumo diario ≤ ${Fmt.num(limFD, 0)} m³ · Tramo ID: excedente</div>
                <div class="kdual">
                  <div class="kd">
                    <div style="font-family:Calibri,var(--fontc);font-size:8px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:2px">TRAMO FD (≤ ${Fmt.num(limFD,0)} m³/DÍA)</div>
                    <div class="kval sm">${Fmt.ars(costFDtramo)}</div>
                    <div class="ksub">${Fmt.usd(costFDtramo / p.usd)}</div>
                    <div class="ksub" style="font-size:9px;color:var(--text3)">${Fmt.num(volFD)} m³ × ${Fmt.arsT(p.tarFD)}/m³</div>
                  </div>
                  <div class="kd-sep"></div>
                  <div class="kd r">
                    <div style="font-family:Calibri,var(--fontc);font-size:8px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:2px">TRAMO ID (> ${Fmt.num(limFD,0)} m³/DÍA)</div>
                    <div class="kval sm" style="color:${volID > 0 ? 'var(--orange)' : 'var(--text2)'}">
                      ${Fmt.ars(costIDtramo)}
                    </div>
                    <div class="ksub">${Fmt.usd(costIDtramo / p.usd)}</div>
                    <div class="ksub" style="font-size:9px;color:var(--text3)">${Fmt.num(volID)} m³ × ${Fmt.arsT(p.tarID)}/m³</div>
                  </div>
                </div>
              </div>

              <div class="kblock ${penTot > 0 ? 'da' : ''}" style="padding:9px 11px">
                <div class="klabel" style="margin-bottom:4px;color:${penTot > 0 ? 'var(--red)' : ''}">PENALIZACIÓN — TARIFA GNL / TARIFA ID</div>
                <div class="kdual">
                  <div class="kd">
                    <div style="font-family:Calibri,var(--fontc);font-size:8px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:2px">SOBRECONSUMO</div>
                    <div class="kval sm" style="color:${exceso > 0 ? 'var(--red)' : 'var(--text2)'}">
                      ${Fmt.ars(costGNLexc)}
                    </div>
                    <div class="ksub">${Fmt.usd(costGNLexc / p.usd)}</div>
                    <div class="ksub" style="font-size:9px;color:var(--text3)">Exc: ${Fmt.num(exceso)} m³ × 1,5× GNL</div>
                  </div>
                  <div class="kd-sep"></div>
                  <div class="kd r">
                    <div style="font-family:Calibri,var(--fontc);font-size:8px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:2px">SUBCONSUMO</div>
                    <div class="kval sm" style="color:${deficit > 0 ? 'var(--orange)' : 'var(--text2)'}">
                      ${Fmt.ars(costGNLsub)}
                    </div>
                    <div class="ksub">${Fmt.usd(costGNLsub / p.usd)}</div>
                    <div class="ksub" style="font-size:9px;color:var(--text3)">Déf: ${Fmt.num(deficit)} m³ × Tarifa ID</div>
                  </div>
                </div>
              </div>

              <div class="kblock" style="padding:9px 11px">
                <div class="klabel" style="margin-bottom:4px">COSTO POR CONSUMO DIRECTO</div>
                <div class="kval sm">${Fmt.ars(costDir)}</div>
                <div class="ksub">${Fmt.usd(costDir / p.usd)}</div>
                <div class="ksub" style="font-size:10px;color:var(--text2)">${Fmt.num(consDir)} m³</div>
                <div class="pb-wrap" style="margin-top:5px"><div class="pb pb-b" style="width:${Math.min(100, pctDir).toFixed(1)}%"></div></div>
                <div class="ksub" style="font-size:10px;color:var(--text3);margin-top:2px">${Fmt.num(pctDir, 1)}% DEL TOTAL PLANTA</div>
              </div>
            </div>

            <!-- Fila 2: Indirecto + Mixto + Cargos Fijos -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">

              <div class="kblock" style="padding:9px 11px">
                <div class="klabel" style="margin-bottom:4px">COSTO POR CONSUMO INDIRECTO</div>
                <div class="kval sm">${Fmt.ars(costInd)}</div>
                <div class="ksub">${Fmt.usd(costInd / p.usd)}</div>
                <div class="ksub" style="font-size:10px;color:var(--text2)">${Fmt.num(consInd)} m³</div>
                <div class="pb-wrap" style="margin-top:5px"><div class="pb" style="width:${Math.min(100, pctInd).toFixed(1)}%;background:var(--purple)"></div></div>
                <div class="ksub" style="font-size:10px;color:var(--text3);margin-top:2px">${Fmt.num(pctInd, 1)}% DEL TOTAL PLANTA</div>
              </div>

              <div class="kblock" style="padding:9px 11px">
                <div class="klabel" style="margin-bottom:4px">COSTO POR CONSUMO MIXTO</div>
                <div class="kval sm">${Fmt.ars(costMix)}</div>
                <div class="ksub">${Fmt.usd(costMix / p.usd)}</div>
                <div class="ksub" style="font-size:10px;color:var(--text2)">${Fmt.num(consMix)} m³</div>
                <div class="pb-wrap" style="margin-top:5px"><div class="pb" style="width:${Math.min(100, pctMix).toFixed(1)}%;background:var(--orange)"></div></div>
                <div class="ksub" style="font-size:10px;color:var(--text3);margin-top:2px">${Fmt.num(pctMix, 1)}% DEL TOTAL PLANTA</div>
              </div>

              <div class="kblock" style="padding:9px 11px">
                <div class="klabel" style="margin-bottom:4px">CARGOS FIJOS TOTALES</div>
                <div class="kval sm">${Fmt.ars(cargosFijos)}</div>
                <div class="ksub">${Fmt.usd(cargosFijos / p.usd)}</div>
                <div class="ksub" style="font-size:9px;color:var(--text3)">CF + Reserva FD + Cargo m³ FD + Cargo m³ ID</div>
              </div>
            </div>

            <!-- Fila 3: Bloque consolidado ancho completo -->
            <div style="background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:11px 14px">
              <div style="font-family:Calibri,var(--fontc);font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">
                COSTO POR CONSUMO CONSOLIDADO TOTAL PLANTA — MES ${ldfYM}
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;align-items:start">
                <div>
                  <div style="font-family:Calibri,var(--fontc);font-size:8px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:3px">TARIFA FD</div>
                  <div class="kval sm">${Fmt.ars(consolidado.costConsolidFD_per)}</div>
                  <div class="ksub">${Fmt.usd(consolidado.costConsolidFD_per / p.usd)}</div>
                  <div class="ksub" style="font-size:9px;color:var(--text3)">${Fmt.num(consolidado.volFD_per)} m³</div>
                  <div style="margin-top:6px">
                    <div style="display:flex;justify-content:space-between;font-family:Calibri,var(--fontc);font-size:9px;font-weight:700;color:var(--text2);text-transform:uppercase">
                      <span>CONSUMO GAS — TARIFA FD</span><span>${Fmt.num(pctFD_consolid, 1)}%</span>
                    </div>
                    <div class="pb-wrap"><div class="pb pb-b" style="width:${Math.min(100, pctFD_consolid).toFixed(1)}%"></div></div>
                  </div>
                </div>
                <div>
                  <div style="font-family:Calibri,var(--fontc);font-size:8px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:3px">TARIFA ID</div>
                  <div class="kval sm" style="color:${consolidado.volID_per > 0 ? 'var(--orange)' : 'var(--text2)'}">
                    ${Fmt.ars(consolidado.costConsolidID_per)}
                  </div>
                  <div class="ksub">${Fmt.usd(consolidado.costConsolidID_per / p.usd)}</div>
                  <div class="ksub" style="font-size:9px;color:var(--text3)">${Fmt.num(consolidado.volID_per)} m³</div>
                  <div style="margin-top:6px">
                    <div style="display:flex;justify-content:space-between;font-family:Calibri,var(--fontc);font-size:9px;font-weight:700;color:var(--text2);text-transform:uppercase">
                      <span>CONSUMO GAS — TARIFA ID</span><span>${Fmt.num(pctID_consolid, 1)}%</span>
                    </div>
                    <div class="pb-wrap"><div class="pb pb-o" style="width:${Math.min(100, pctID_consolid).toFixed(1)}%"></div></div>
                  </div>
                </div>
                <div style="border-left:1px solid var(--border);padding-left:14px">
                  <div style="font-family:Calibri,var(--fontc);font-size:8px;font-weight:700;color:var(--accent);text-transform:uppercase;margin-bottom:3px">TOTAL PERÍODO</div>
                  <div class="kval lg">${Fmt.ars(costConsolid_per)}</div>
                  <div class="ksub">${Fmt.usd(costConsolid_per / p.usd)}</div>
                  <div class="ksub" style="font-size:9px;color:var(--text3)">${Fmt.num(volMes)} m³ · MES ${ldfYM}</div>
                  <div style="margin-top:6px">
                    <div style="font-family:Calibri,var(--fontc);font-size:8px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:2px">DÍA SELECCIONADO</div>
                    <div class="kval xs">${Fmt.ars(consolidado.costConsolid_dia)}</div>
                    <div class="ksub">${Fmt.usd(consolidado.costConsolid_dia / p.usd)}</div>
                    <div class="ksub" style="font-size:9px;color:var(--text3)">${Fmt.num(consolidado.volFD_dia + consolidado.volID_dia)} m³</div>
                  </div>
                </div>
              </div>
            </div>

          </div><!-- fin columna izquierda -->

          <!-- COLUMNA DERECHA: Cuadro Tarifario Vigente — altura completa -->
          <div style="background:linear-gradient(160deg,var(--bg3),var(--bg2));border:1px solid rgba(45,126,247,.3);border-radius:7px;padding:11px 12px;display:flex;flex-direction:column;align-self:stretch">
            <div style="font-family:Calibri,var(--fontc);font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid rgba(45,126,247,.2)">CUADRO TARIFARIO VIGENTE</div>

            <!-- TARIFAS en 2 columnas -->
            <div style="font-family:Calibri,var(--fontc);font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">TARIFAS</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:8px">
              <div style="background:rgba(45,126,247,.1);border-radius:5px;padding:7px 8px">
                <div style="font-family:Calibri,var(--fontc);font-size:8.5px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:3px">TARIFA FD / m³</div>
                <div style="font-family:var(--fontv),Arial;font-size:17px;font-weight:700;color:var(--accent);line-height:1.1">${Fmt.ars(p.tarFD)}</div>
                <div style="font-family:var(--fontc);font-size:10px;color:var(--text3);margin-top:2px">${Fmt.usd(p.tarFD / p.usd)}</div>
              </div>
              <div style="background:rgba(45,126,247,.07);border-radius:5px;padding:7px 8px">
                <div style="font-family:Calibri,var(--fontc);font-size:8.5px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:3px">TARIFA ID / m³</div>
                <div style="font-family:var(--fontv),Arial;font-size:17px;font-weight:700;color:var(--accent);line-height:1.1">${Fmt.ars(p.tarID)}</div>
                <div style="font-family:var(--fontc);font-size:10px;color:var(--text3);margin-top:2px">${Fmt.usd(p.tarID / p.usd)}</div>
              </div>
              <div style="background:rgba(249,115,22,.08);border-radius:5px;padding:7px 8px">
                <div style="font-family:Calibri,var(--fontc);font-size:8.5px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:3px">TARIFA GNL / m³</div>
                <div style="font-family:var(--fontv),Arial;font-size:17px;font-weight:700;color:var(--orange);line-height:1.1">${Fmt.ars(p.gnlARS)}</div>
                <div style="font-family:var(--fontc);font-size:10px;color:var(--text3);margin-top:2px">${Fmt.usd(p.gnlARS / p.usd)}</div>
              </div>
              <div style="background:rgba(34,197,94,.07);border:1px solid rgba(34,197,94,.2);border-radius:5px;padding:7px 8px">
                <div style="font-family:Calibri,var(--fontc);font-size:8.5px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:3px">USD BNA</div>
                <div style="font-family:var(--fontv),Arial;font-size:17px;font-weight:700;color:var(--green);line-height:1.1">${Fmt.ars(p.usd)}</div>
                <div style="font-family:var(--fontc);font-size:10px;color:var(--text3);margin-top:2px">ARS / USD</div>
              </div>
            </div>

            <!-- CARGOS Y TRANSPORTE — ancho completo, crece para llenar altura -->
            <div style="font-family:Calibri,var(--fontc);font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">CARGOS Y TRANSPORTE</div>
            <div style="background:rgba(45,126,247,.06);border-radius:5px;padding:8px 9px;flex:1">
              <div style="display:flex;flex-direction:column;gap:5px;height:100%">
                ${[
                  ['CARGO FIJO', cf.cargoFijo],
                  ['RESERVA FD', cf.cargoReservaFD],
                  ['CARGO m³ FD', cf.cargoM3FD],
                  ['CARGO m³ ID', cf.cargoM3ID],
                  ['TRANSP. NQ', cf.transpNQ],
                  ['TRANSP. NO', cf.transpNO],
                ].map(([lb, v], i, arr) => `
                  <div style="display:flex;justify-content:space-between;align-items:center;${i < arr.length-1 ? 'border-bottom:1px solid rgba(45,126,247,.1);padding-bottom:5px;' : ''}">
                    <span style="font-family:'Calibri',var(--fontc);font-size:11px;font-weight:500;color:var(--text3)">${lb}</span>
                    <span style="font-family:'Calibri',var(--fontc);font-size:11px;font-weight:600;color:var(--text)">${Fmt.ars(v)}</span>
                  </div>`).join('')}
              </div>
            </div>
          </div><!-- fin cuadro tarifario -->

        </div>
      </div>`;
  }


  // ── GAUGES ───────────────────────────────────────────────────────────────────

  function buildGaugesHTML({ plantaReal, plantaProg, plantaPct, top4 }) {
    const plantaBadge = plantaPct > 110 ? 'bg-r' : plantaPct < 70 ? 'bg-o' : 'bg-g';
    const plantaLabel = plantaPct > 110 ? 'SOBRE LÍMITE' : plantaPct < 70 ? 'BAJO LÍMITE' : 'NORMAL';

    let gaugesHTML = `
      <div class="dash-section">
        <div class="sec-hdr"><div class="sec-title">VELOCÍMETROS — CONSUMO REAL VS PROGRAMADO</div></div>
        <div style="display:grid;grid-template-columns:240px repeat(4,1fr);gap:6px;align-items:start">
          <div style="background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:10px 10px 8px;display:flex;flex-direction:column;align-items:center;grid-row:span 2">
            <div class="gauge-planta-lbl">PLANTA TOTAL</div>
            <div id="g-planta" style="width:220px;height:148px"></div>
            <span class="kbadge ${plantaBadge}" style="margin-top:4px">${plantaLabel}</span>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;width:100%;margin-top:7px">
              <div style="background:var(--bg2);border-radius:5px;padding:5px 4px;text-align:center">
                <div style="font-family:'Calibri',var(--fontc);font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase">REAL</div>
                <div style="font-family:'Calibri',var(--fontc);font-size:15px;font-weight:700;color:var(--green)">${Fmt.num(plantaReal)} m³</div>
              </div>
              <div style="background:var(--bg2);border-radius:5px;padding:5px 4px;text-align:center">
                <div style="font-family:'Calibri',var(--fontc);font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase">PROG.</div>
                <div style="font-family:'Calibri',var(--fontc);font-size:15px;font-weight:700;color:var(--text)">${Fmt.num(plantaProg)} m³</div>
              </div>
            </div>
            <div style="font-family:'Calibri',var(--fontc);font-size:12px;font-weight:700;color:${plantaReal - plantaProg >= 0 ? 'var(--orange)' : 'var(--accent)'};margin-top:5px">DESVÍO: ${plantaReal - plantaProg >= 0 ? '+' : ''}${Fmt.num(plantaReal - plantaProg)} m³</div>
          </div>`;

    top4.forEach((eq, i) => {
      const pct    = eq.prog ? eq.real / eq.prog * 100 : 0;
      const badge  = pct > 110 ? 'bg-r' : pct < 70 ? 'bg-o' : 'bg-g';
      const badgeTxt = pct > 110 ? 'SOBRE LÍMITE' : pct < 70 ? 'BAJO LÍMITE' : 'NORMAL';
      const dA_eq  = eq.real - eq.prog;
      const dCol   = dA_eq >= 0 ? 'var(--orange)' : 'var(--accent)';
      gaugesHTML += `
          <div style="display:flex;flex-direction:column;align-items:center;padding:8px 4px 6px">
            <div class="gauge-eq-lbl">${eq.n}</div>
            <div id="g-eq${i}" style="width:170px;height:124px"></div>
            <span class="kbadge ${badge}" style="margin-top:4px">${badgeTxt}</span>
            <div style="font-family:'Calibri',var(--fontc);font-size:11px;color:var(--text2);margin-top:5px;text-align:center;line-height:1.7">
              <span style="color:var(--text3)">REAL: </span><b style="color:var(--green);font-size:12px">${Fmt.num(eq.real)} m³</b>
              · <span style="color:var(--text3)">PROG: </span><b style="color:var(--text);font-size:12px">${Fmt.num(eq.prog)} m³</b><br>
              <span style="color:var(--text3)">DESVÍO: </span><span style="color:${dCol};font-size:12px;font-weight:700">${dA_eq >= 0 ? '+' : ''}${Fmt.num(dA_eq)} m³</span>
            </div>
          </div>`;
    });

    // Leyenda en fila 2, cols 2-6 — debajo de los 4 gauges
    gaugesHTML += '<div style="grid-column:2/6;padding-top:6px">' +
      '<div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;' +
      'padding:7px 14px;font-family:\'Calibri\',var(--fontc);font-size:11.5px;font-weight:700;' +
      'color:var(--text2);text-transform:uppercase;letter-spacing:.8px;text-align:center">' +
      'EQUIPOS CON MAYOR CONSUMO DEL PERÍODO</div></div>';
    return gaugesHTML + '</div></div>';
  }

  // ── RANKING Y BOTTOM ─────────────────────────────────────────────────────────

  function buildBottomHTML({ eqArr, stats, consDir, consInd, consMix, consPorSector, consTotalPlanta, p }) {
    const rankRows = eqArr.map((eq, i) => {
      const maxC  = eqArr[0] ? eqArr[0].real : 1;
      const w     = Math.min(100, eq.real / maxC * 100);
      const dC    = eq.desv > 0 ? 'bg-o' : eq.desv < -10 ? 'bg-b' : 'bg-g';
      const tC    = eq.tipo === 'DIRECTO' ? 'cb' : eq.tipo === 'MIXTO' ? 'co' : 'cgr';
      const sC    = eq.sec === 'TINTORERIA' ? 'cp' : 'cg';
      const bc    = eq.tipo === 'DIRECTO' ? '#2d7ef7' : eq.tipo === 'MIXTO' ? '#f97316' : '#a855f7';
      return `<div style="display:grid;grid-template-columns:16px 1fr 54px 60px 60px 42px;gap:5px;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)">
        <div style="font-family:var(--fontc);font-size:10px;color:var(--text3);text-align:right;font-weight:700">${i + 1}</div>
        <div>
          <div style="font-family:Calibri,var(--fontc);font-size:12px;font-weight:700;color:var(--text);text-transform:uppercase">${eq.n}</div>
          <div style="display:flex;gap:3px;margin-top:2px"><span class="chip ${sC}" style="font-size:8px">${eq.sec}</span><span class="chip ${tC}" style="font-size:8px">${eq.tipo}</span>${eq.unid ? `<span class="chip cgr" style="font-size:8px">${eq.unid}</span>` : ''}</div>
          <div style="height:3px;background:var(--border);border-radius:2px;margin-top:3px;overflow:hidden"><div style="height:100%;width:${w.toFixed(0)}%;background:${bc}"></div></div>
        </div>
        <div style="text-align:right;font-family:var(--fontc)"><div style="font-size:11px;font-weight:600;color:var(--text2)">${Fmt.num(eq.hsReal, 1)}</div><div style="font-size:8px;color:var(--text3);text-transform:uppercase">HS REAL</div></div>
        <div style="text-align:right;font-family:var(--fontc)"><div style="font-size:11px;color:var(--text)">${Fmt.num(eq.prog)} m³</div><div style="font-size:8px;color:var(--text3);text-transform:uppercase">PROG.</div></div>
        <div style="text-align:right;font-family:var(--fontc)"><div style="font-size:11px;font-weight:700;color:var(--text)">${Fmt.num(eq.real)} m³</div><div style="font-size:8px;color:var(--text3);text-transform:uppercase">REAL</div></div>
        <div style="text-align:right"><span class="kbadge ${dC}">${eq.desv >= 0 ? '+' : ''}${Fmt.num(eq.desv, 0)}%</span></div>
      </div>`;
    }).join('');

    const indAc = [
      ['PROG. MÁX. DÍA', `${Fmt.num(stats.dProgMax)} m³`],
      ['PROG. MÍN. DÍA', `${Fmt.num(stats.dProgMin)} m³`],
      ['REAL MÁX. DÍA',  `${Fmt.num(stats.dRealMax)} m³`],
      ['REAL MÍN. DÍA',  `${Fmt.num(stats.dRealMin)} m³`],
      ['DÍAS REGISTRADOS', String(stats.allDays)],
      ['EQUIPOS ACTIVOS',  String(stats.eqActivos)],
      ['REF. PCI',  `${CONFIG.energia.pciRef} kcal/m³`],
    ];
    const indAcRows = indAc.map(r =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)"><div style="font-family:Calibri,var(--fontc);font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase">${r[0]}</div><div style="font-family:var(--fontv),Arial;font-size:12px;font-weight:700;color:var(--text)">${r[1]}</div></div>`
    ).join('');

    return `
      <div style="display:grid;grid-template-columns:1fr 250px;gap:8px">
        <div class="dash-section">
          <div class="sec-hdr"><div class="sec-title">RANKING POR CONSUMO REAL · PERÍODO ACUMULADO</div></div>
          <div style="font-family:var(--fontc);font-size:9px;color:var(--text3);margin-bottom:5px;text-transform:uppercase">${eqArr.length} EQUIPOS · HS REAL / CONSUMO m³</div>
          ${rankRows}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div class="dash-section" style="flex:1"><div class="sec-hdr"><div class="sec-title">INDICADORES ACUMULADOS</div></div>${indAcRows}</div>
          <div class="dash-section">
            <div class="sec-hdr"><div class="sec-title">DISTRIBUCIÓN DE CONSUMO POR TIPO</div></div>
            <div style="display:grid;grid-template-columns:85px 1fr;gap:8px;align-items:center">
              <div id="chart-tipo" style="width:100px;height:100px"></div>
              <div style="display:flex;flex-direction:column;gap:5px">
                ${[
                  {lbl:'DIRECTO',   val:consDir, col:'rgba(45,126,247,.85)'},
                  {lbl:'INDIRECTO', val:consInd, col:'rgba(34,197,94,.85)'},
                  {lbl:'MIXTO',     val:consMix, col:'rgba(249,115,22,.85)'},
                ].filter(function(t){return t.val>0;}).sort(function(a,b){return b.val-a.val;}).map(function(t){
                  var cARS = t.val * p.gnARS;
                  return '<div style="display:flex;flex-direction:column;gap:1px;padding:4px 0;border-bottom:1px solid var(--border)">' +
                    '<div style="display:flex;align-items:center;gap:5px">' +
                      '<div style="width:8px;height:8px;border-radius:50%;background:' + t.col + ';flex-shrink:0"></div>' +
                      '<span style="font-family:Calibri,var(--fontc);font-size:10.5px;font-weight:700;color:var(--text2);text-transform:uppercase;flex:1">' + t.lbl + '</span>' +
                      '<span style="font-family:var(--fontv),Arial;font-size:12px;font-weight:700;color:var(--text)">' + Fmt.num(t.val) + ' m³</span>' +
                    '</div>' +
                    '<div style="display:flex;justify-content:flex-end;gap:8px;padding-left:13px">' +
                      '<span style="font-family:Calibri,var(--fontc);font-size:9.5px;color:var(--text3)">' + Fmt.ars(cARS) + '</span>' +
                      '<span style="font-family:Calibri,var(--fontc);font-size:9.5px;color:var(--text3)">' + Fmt.usd(cARS/p.usd) + '</span>' +
                    '</div>' +
                  '</div>';
                }).join('')}
              </div>
            </div>
          </div>
          
          <div class="dash-section" style="margin-top:0">
            <div class="sec-hdr"><div class="sec-title">DISTRIBUCIÓN DE CONSUMO POR SECTOR</div></div>
            <div style="display:flex;flex-direction:column;align-items:stretch;gap:8px">
              <div style="display:flex;justify-content:center"><div id="chart-tipo-sec" style="width:120px;height:120px"></div></div>
              <div style="display:flex;flex-direction:column;gap:5px">
                ${(consPorSector||[]).map(function(s,i) {
                  var cols = ['rgba(45,126,247,.9)','rgba(34,197,94,.9)','rgba(249,115,22,.9)','rgba(6,182,212,.9)','rgba(234,179,8,.9)'];
                  var col  = cols[i % cols.length];
                  var pct  = consTotalPlanta ? s.vol / consTotalPlanta * 100 : 0;
                  var cARS = s.vol * p.gnARS;
                  return '<div style="display:flex;flex-direction:column;gap:1px;padding:4px 0;border-bottom:1px solid var(--border)">' +
                    '<div style="display:flex;align-items:center;gap:5px">' +
                      '<div style="width:8px;height:8px;border-radius:50%;background:' + col + ';flex-shrink:0"></div>' +
                      '<span style="font-family:Calibri,var(--fontc);font-size:10.5px;font-weight:700;color:var(--text2);text-transform:uppercase;flex:1">' + s.sec + '</span>' +
                      '<span style="font-family:var(--fontv),Arial;font-size:12px;font-weight:700;color:var(--text)">' + Fmt.num(s.vol) + ' m³</span>' +
                    '</div>' +
                    '<div style="display:flex;justify-content:flex-end;gap:8px;padding-left:13px">' +
                      '<span style="font-family:Calibri,var(--fontc);font-size:9.5px;color:var(--text3)">' + Fmt.num(pct,1) + '% · ' + Fmt.ars(cARS) + ' · ' + Fmt.usd(cARS/p.usd) + '</span>' +
                    '</div>' +
                  '</div>';
                }).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ── CHARTS Y GAUGES ──────────────────────────────────────────────────────────

  function drawChartsAndGauges({ plantaReal, plantaPct, top4, histData, sectData, franjaData, consDir, consInd, consMix }) {
    // Gauges
    const gPlantaCol = plantaPct > 110 ? '#ef4444' : plantaPct < 70 ? '#f97316' : '#22c55e';
    GaugeRenderer.draw('g-planta', plantaReal, plantaPct, gPlantaCol, true);

    top4.forEach((eq, i) => {
      const pct = eq.prog ? eq.real / eq.prog * 100 : 0;
      const col = pct > 110 ? '#ef4444' : pct < 70 ? '#f97316' : '#22c55e';
      GaugeRenderer.draw(`g-eq${i}`, eq.real, pct, col, false);
    });

    // ── 4 GRÁFICOS — ECharts SVG (nítidos en cualquier resolución) ─────────────
    var _dark  = AppState.darkMode;
    var _tc    = _dark ? '#7a84a0' : '#6a74a0';
    var _gc    = _dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)';
    var _ttBg  = _dark ? '#1a1f2e' : '#fff';
    var _ttBd  = _dark ? '#3a4462' : '#c5cedf';
    var _ttCol = _dark ? '#a0a9c4' : '#3a4468';
    var _font  = { fontFamily: 'Calibri, Arial, sans-serif', fontSize: 11, color: _tc };

    function _ec(id) {
      var el = document.getElementById(id);
      if (!el || typeof echarts === 'undefined') return null;
      var inst = echarts.init(el, null, { renderer: 'svg' });
      AppState.registerChart(id, { destroy: function(){ try{ inst.dispose(); }catch(e){} } });
      return inst;
    }

    function _axisStyle() {
      return {
        axisLine:  { lineStyle: { color: _gc } },
        splitLine: { lineStyle: { color: _gc } },
        axisLabel: { fontFamily: 'Calibri, Arial, sans-serif', fontSize: 11, color: _tc },
      };
    }

    function _tooltip(fmt) {
      return {
        trigger: 'axis',
        backgroundColor: _ttBg,
        borderColor: _ttBd,
        borderWidth: 1,
        textStyle: { fontFamily: 'Calibri, Arial, sans-serif', fontSize: 11, color: _ttCol },
        formatter: fmt,
      };
    }

    // ── 1. SEMANA OPERATIVA — últimos 7 días, líneas ────────────────────────
    var ch1 = _ec('chart-hist');
    if (ch1) {
      // Tomar los últimos 7 puntos del histórico
      var _w7lbl  = histData.cLbl.slice(-7);
      var _w7prog = histData.cProg.slice(-7);
      var _w7real = histData.cReal.slice(-7);
      ch1.setOption({
        backgroundColor: 'transparent',
        legend: { data: ['PROGRAMADO','REAL'], top: 4, textStyle: _font, icon: 'roundRect', itemWidth: 14, itemHeight: 6 },
        tooltip: _tooltip(function(p) {
          return p[0].axisValue + '<br>' +
            p.map(function(s){ return s.marker + ' ' + s.seriesName + ': <b>' + Fmt.num(s.value) + ' m³</b>'; }).join('<br>');
        }),
        grid: { top: 38, bottom: 28, left: 48, right: 12 },
        xAxis: { type: 'category', data: _w7lbl,
          axisLabel: { fontFamily: 'Calibri, Arial, sans-serif', fontSize: 11, color: _tc },
          axisLine: { lineStyle: { color: _gc } }, splitLine: { show: false } },
        yAxis: { type: 'value',
          axisLabel: { fontFamily: 'Calibri, Arial, sans-serif', fontSize: 10, color: _tc,
            formatter: function(v){ return Fmt.num(v); } },
          splitLine: { lineStyle: { color: _gc } } },
        series: [
          { name: 'PROGRAMADO', type: 'line', data: _w7prog,
            lineStyle: { color: '#2d7ef7', width: 2.5 }, itemStyle: { color: '#2d7ef7' },
            areaStyle: { color: 'rgba(45,126,247,.06)' }, smooth: 0.3,
            symbol: 'circle', symbolSize: 6, label: { show: true, position: 'top',
              fontFamily: 'Calibri, Arial', fontSize: 10, color: '#2d7ef7',
              formatter: function(p){ return Fmt.num(p.value); } } },
          { name: 'REAL', type: 'line', data: _w7real,
            lineStyle: { color: '#22c55e', width: 2.5 }, itemStyle: { color: '#22c55e' },
            areaStyle: { color: 'rgba(34,197,94,.06)' }, smooth: 0.3,
            symbol: 'circle', symbolSize: 6, label: { show: true, position: 'bottom',
              fontFamily: 'Calibri, Arial', fontSize: 10, color: '#22c55e',
              formatter: function(p){ return Fmt.num(p.value); } } },
        ],
      });
    }

    // ── 2. SECTOR 7 DÍAS — barras agrupadas ─────────────────────────────────
    var ch2 = _ec('chart-sector');
    if (ch2) ch2.setOption({
      backgroundColor: 'transparent',
      legend: { data: ['TINTORERÍA','ENCOLADO'], top: 4, textStyle: _font, icon: 'roundRect', itemWidth: 14, itemHeight: 6 },
      tooltip: _tooltip(function(p) {
        return p[0].axisValue + '<br>' +
          p.map(function(s){ return s.marker + ' ' + s.seriesName + ': <b>' + Fmt.num(s.value) + ' m³</b>'; }).join('<br>');
      }),
      grid: { top: 38, bottom: 24, left: 42, right: 12 },
      xAxis: { type: 'category', data: sectData.s7L,
        axisLabel: { fontFamily: 'Calibri, Arial, sans-serif', fontSize: 10, color: _tc },
        axisLine: { lineStyle: { color: _gc } }, splitLine: { show: false } },
      yAxis: { type: 'value',
        axisLabel: { fontFamily: 'Calibri, Arial, sans-serif', fontSize: 10, color: _tc,
          formatter: function(v){ return Fmt.num(v); } },
        splitLine: { lineStyle: { color: _gc } } },
      series: [
        { name: 'TINTORERÍA', type: 'bar', data: sectData.sTint,
          itemStyle: { color: 'rgba(168,85,247,.75)', borderRadius: [3,3,0,0] }, barMaxWidth: 28 },
        { name: 'ENCOLADO', type: 'bar', data: sectData.sEnc,
          itemStyle: { color: 'rgba(45,126,247,.75)', borderRadius: [3,3,0,0] }, barMaxWidth: 28 },
      ],
    });

    // ── 3. MES EN CURSO — barras todos los días del mes ─────────────────────
    var ch3 = _ec('chart-evol');
    if (ch3) {
      // Filtrar datos del mes de la última fecha
      var _ldfYM = histData.cLbl.length ? histData.cLbl[histData.cLbl.length-1].slice(0,-3) : '';
      var _mesIdx = histData.cLbl.reduce(function(acc, lbl, i) {
        if (lbl.slice(0,-3) === _ldfYM || _ldfYM === '') acc.push(i);
        return acc;
      }, []);
      // Si hay pocos datos del mes actual, usar todos
      if (_mesIdx.length < 3) _mesIdx = histData.cLbl.map(function(_,i){ return i; });
      var _mesLbl  = _mesIdx.map(function(i){ return histData.cLbl[i]; });
      var _mesProg = _mesIdx.map(function(i){ return histData.cProg[i]; });
      var _mesReal = _mesIdx.map(function(i){ return histData.cReal[i]; });
      ch3.setOption({
        backgroundColor: 'transparent',
        legend: { data: ['PROGRAMADO','REAL'], top: 4, textStyle: _font, icon: 'roundRect', itemWidth: 14, itemHeight: 6 },
        tooltip: _tooltip(function(p) {
          return p[0].axisValue + '<br>' +
            p.map(function(s){ return s.marker + ' ' + s.seriesName + ': <b>' + Fmt.num(s.value) + ' m³</b>'; }).join('<br>');
        }),
        grid: { top: 38, bottom: 28, left: 48, right: 12 },
        xAxis: { type: 'category', data: _mesLbl,
          axisLabel: { fontFamily: 'Calibri, Arial, sans-serif', fontSize: 9, color: _tc, rotate: 35 },
          axisLine: { lineStyle: { color: _gc } }, splitLine: { show: false } },
        yAxis: { type: 'value',
          axisLabel: { fontFamily: 'Calibri, Arial, sans-serif', fontSize: 10, color: _tc,
            formatter: function(v){ return Fmt.num(v); } },
          splitLine: { lineStyle: { color: _gc } } },
        series: [
          { name: 'PROGRAMADO', type: 'bar', data: _mesProg,
            itemStyle: { color: 'rgba(45,126,247,.35)', borderColor: 'rgba(45,126,247,.7)', borderWidth: 1, borderRadius: [3,3,0,0] },
            barGap: '0%', barCategoryGap: '30%' },
          { name: 'REAL', type: 'bar', data: _mesReal,
            itemStyle: { color: 'rgba(249,115,22,.85)', borderRadius: [3,3,0,0] },
            barGap: '0%' },
        ],
      });
    }

    // ── 4. FRANJA HORARIA — barras apiladas ─────────────────────────────────
    var ch4 = _ec('chart-franja');
    if (ch4) {
      var _fSeries = franjaData.datasets.map(function(ds) {
        return {
          name: ds.label,
          type: 'bar',
          stack: 'franja',
          data: ds.data,
          itemStyle: { color: ds.backgroundColor || ds.borderColor },
          barMaxWidth: 36,
        };
      });
      ch4.setOption({
        backgroundColor: 'transparent',
        legend: { data: franjaData.datasets.map(function(d){ return d.label; }), top: 4,
          textStyle: _font, icon: 'roundRect', itemWidth: 14, itemHeight: 6 },
        tooltip: {
          trigger: 'axis', axisPointer: { type: 'shadow' },
          backgroundColor: _ttBg, borderColor: _ttBd, borderWidth: 1,
          textStyle: { fontFamily: 'Calibri, Arial, sans-serif', fontSize: 11, color: _ttCol },
          formatter: function(p) {
            return p[0].axisValue + '<br>' +
              p.map(function(s){ return s.marker + ' ' + s.seriesName + ': <b>' + Fmt.num(s.value) + ' m³</b>'; }).join('<br>');
          },
        },
        grid: { top: 38, bottom: 24, left: 42, right: 12 },
        xAxis: { type: 'category', data: franjaData.wkLbl,
          axisLabel: { fontFamily: 'Calibri, Arial, sans-serif', fontSize: 10, color: _tc },
          axisLine: { lineStyle: { color: _gc } }, splitLine: { show: false } },
        yAxis: { type: 'value',
          axisLabel: { fontFamily: 'Calibri, Arial, sans-serif', fontSize: 10, color: _tc,
            formatter: function(v){ return Fmt.num(v); } },
          splitLine: { lineStyle: { color: _gc } } },
        series: _fSeries,
      });
    }

    // Chart Tipo (donut)
    // Dona tipo — ECharts
    // Dona tipo — ordenada mayor a menor
    const _tipoRaw = [
      { lbl:'DIRECTO',   val:consDir, col:'rgba(45,126,247,.9)' },
      { lbl:'INDIRECTO', val:consInd, col:'rgba(34,197,94,.9)'  },
      { lbl:'MIXTO',     val:consMix, col:'rgba(249,115,22,.9)' },
    ].filter(t => t.val > 0).sort((a,b) => b.val - a.val);
    GaugeRenderer.drawDoughnut('chart-tipo',
      _tipoRaw.map(t => t.lbl),
      _tipoRaw.map(t => t.val),
      _tipoRaw.map(t => t.col)
    );

    // Dona sector — ECharts (ordenada mayor a menor)
    const _secD = [...new Set(AppState.db.prod.filter(r => r.cl === 'REAL').map(r => r.sec).filter(Boolean))]
      .map(sec => ({ sec, vol: AppState.db.prod.filter(r => r.cl === 'REAL' && r.sec === sec).reduce((a,r) => a+r.c, 0) }))
      .filter(s => s.vol > 0)
      .sort((a,b) => b.vol - a.vol);
    const _secColsD = ['rgba(45,126,247,.9)','rgba(34,197,94,.9)','rgba(249,115,22,.9)','rgba(6,182,212,.9)','rgba(234,179,8,.9)'];
    GaugeRenderer.drawDoughnut('chart-tipo-sec',
      _secD.map(s => s.sec),
      _secD.map(s => s.vol),
      _secD.map((s,i) => _secColsD[i % _secColsD.length])
    );

    // Chart Sector barra (ECharts)
    var ch6 = _ec('chart-sec');
    if (ch6) {
      var totT = Repository.filterProd(function(r){ return r.cl === 'REAL' && r.sec === 'TINTORERIA'; }).reduce(function(a,r){ return a+r.c; }, 0);
      var totE = Repository.filterProd(function(r){ return r.cl === 'REAL' && r.sec === 'ENCOLADO'; }).reduce(function(a,r){ return a+r.c; }, 0);
      ch6.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item', backgroundColor: _ttBg, borderColor: _ttBd, borderWidth: 1,
          textStyle: { fontFamily: 'Calibri, Arial, sans-serif', fontSize: 11, color: _ttCol },
          formatter: function(p){ return p.name + ': <b>' + Fmt.num(p.value) + ' m³</b>'; } },
        grid: { top: 8, bottom: 8, left: 80, right: 16, containLabel: false },
        xAxis: { type: 'value', axisLabel: { fontFamily: 'Calibri, Arial, sans-serif', fontSize: 10, color: _tc,
          formatter: function(v){ return Fmt.num(v); } }, splitLine: { lineStyle: { color: _gc } } },
        yAxis: { type: 'category', data: ['TINTORERÍA','ENCOLADO'],
          axisLabel: { fontFamily: 'Calibri, Arial, sans-serif', fontSize: 11, color: _tc },
          axisLine: { show: false }, axisTick: { show: false } },
        series: [{ type: 'bar', data: [
          { value: totT, itemStyle: { color: 'rgba(168,85,247,.8)', borderRadius: [0,4,4,0] } },
          { value: totE, itemStyle: { color: 'rgba(45,126,247,.8)',  borderRadius: [0,4,4,0] } },
        ], barMaxWidth: 28 }],
      });
    }
  }


  // ── API PÚBLICA ──────────────────────────────────────────────────────────────
  return { render };

})();
