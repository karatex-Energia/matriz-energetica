/**
 * js/utils/excelExport.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Exportación Excel (.xlsx) — Colortex SA · Matriz Energética
 * Usa SheetJS (XLSX) disponible desde CDN.
 *
 * Cada función genera un workbook con múltiples hojas formateadas.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const ExcelExport = (() => {

  // ── HELPERS ──────────────────────────────────────────────────────────────────

  function _wb()  { return XLSX.utils.book_new(); }
  function _hoy() { return new Date().toISOString().slice(0,10); }

  /**
   * Agrega una hoja al workbook con estilo básico.
   * @param {Object}   wb      - Workbook SheetJS
   * @param {string}   nombre  - Nombre de la hoja
   * @param {Array}    data    - Array de arrays (primera fila = cabecera)
   * @param {number[]} colWidths - Anchos de columna en caracteres
   */
  function _addSheet(wb, nombre, data, colWidths = []) {
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Anchos de columna
    if (colWidths.length) {
      ws['!cols'] = colWidths.map(w => ({ wch: w }));
    }

    XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31));
  }

  /**
   * Descarga el workbook como .xlsx.
   */
  function _save(wb, filename) {
    XLSX.writeFile(wb, filename);
  }

  // ── FORMATO DE VALORES ────────────────────────────────────────────────────────

  const N0  = v => v != null && !isNaN(v) ? Math.round(v)             : '';
  const N2  = v => v != null && !isNaN(v) ? parseFloat(v.toFixed(2))  : '';
  const N3  = v => v != null && !isNaN(v) ? parseFloat(v.toFixed(3))  : '';
  const N4  = v => v != null && !isNaN(v) ? parseFloat(v.toFixed(4))  : '';
  const PCT = v => v != null && !isNaN(v) ? parseFloat(v.toFixed(1))+'%' : '';

  // ── GAS VS PRODUCCIÓN ─────────────────────────────────────────────────────────

  function exportarGasVsProd(desde, hasta, cl = null) {
    const k = GasVsProdEngine.calcKpi(desde, hasta, cl);
    if (!k) { UI.notify('Sin datos para exportar','err'); return; }

    const g   = k.gas;
    const p   = k.prod;
    const i   = k.ind;
    const mes = desde.slice(0,7);
    const wb  = _wb();

    // ── Hoja 1: Resumen ejecutivo
    const resumen = [
      [`ANÁLISIS GAS NATURAL vs PRODUCCIÓN — ${mes}${cl?' ('+cl+')':''}`],
      [`Generado: ${new Date().toLocaleString('es-AR')} · Karatex SA`],
      [],
      ['CONSUMO Y COSTO POR SECTOR'],
      ['Sector','Gas m³','Prod.','Unidad','Cons. esp. m³/u','Costo esp. ARS/u','Costo esp. USD/u','Costo total ARS','Costo total USD'],
      ['Tintorería',  N0(g.total_tint),   N0(p.mTint),  'm',  N3(i.ce_tint),  N2(i.cse_tint_ars),  N4(i.cse_tint_usd),  N0(i.costo_tint_ars),  N2(i.costo_tint_usd)],
      ['Estampado',   N0(g.total_estamp), N0(p.mEst),   'm',  N3(i.ce_estmp), N2(i.cse_estmp_ars), N4(i.cse_estmp_usd), N0(i.costo_estmp_ars), N2(i.costo_estmp_usd)],
      ['Encolado',    N0(g.total_enc),    N0(p.KgEnc),  'kg', N3(i.ce_enc),   N2(i.cse_enc_ars),   N4(i.cse_enc_usd),   N0(i.costo_enc_ars),   N2(i.costo_enc_usd)],
      [],
      ['TOTAL PLANTA', N0(g.total_planta), '', '', '', '', '', N0(i.costo_total_ars), N2(i.costo_total_usd)],
      [],
      ['BALANCE CALDERA'],
      [`Eficiencia: ${(g.eficiencia_caldera*100).toFixed(0)}%`],
      ['Gas quemado m³','Gas útil m³','Pérdida m³','Vapor→Tintorería m³','Vapor→Encolado m³','Pérdida ARS'],
      [N0(g.gas_caldera), N0(g.gas_util_caldera), N0(g.perdida_caldera), N0(g.vapor_a_tint), N0(g.vapor_a_enc), N0(i.costo_total_ars ? (g.perdida_caldera/g.total_planta)*i.costo_total_ars : 0)],
      [],
      ['TARIFAS APLICADAS'],
      ['Precio GN ARS/m³','Tipo de cambio ARS/USD'],
      [i.precio_m3_ars, i.usd_rate],
    ];
    _addSheet(wb, 'Resumen', resumen, [16,12,12,8,18,18,18,16,14]);

    // ── Hoja 2: Detalle por equipo
    const detalle = [
      ['DETALLE DE CONSUMO POR EQUIPO'],
      [],
      ['Equipo','Sector analítico','Tipo consumo','Hs marcha','Gas m³','% del total planta'],
    ];
    const total = g.total_planta;
    Object.entries(g.detalle_equipos)
      .sort((a,b) => b[1].c - a[1].c)
      .forEach(([eq,d]) => {
        detalle.push([
          eq,
          eq === 'ZIMMER' ? 'ESTAMPADO' : d.sec,
          d.tipo,
          N2(d.hs),
          N0(d.c),
          total > 0 ? N2(d.c/total*100) : 0,
        ]);
      });
    detalle.push([]);
    detalle.push(['TOTAL','','', '', N0(total), 100]);
    _addSheet(wb, 'Por equipo', detalle, [22,14,14,12,12,16]);

    // ── Hoja 3: Indicadores de producción del período
    const indRecs = (AppState.db.prodIndicadores||[])
      .filter(r => r.f >= desde && r.f <= hasta)
      .sort((a,b) => a.f.localeCompare(b.f));

    const indProd = [
      ['INDICADORES DE PRODUCCIÓN — '+mes],
      [],
      ['Fecha','m Tintorería','m Estampado','Kg Encolado','PAS Tej Planos','PAS Tej Toallas','Kg Hilandería','m Doblado'],
      ...indRecs.map(r => [r.f, r.mTint||0, r.mEst||0, r.KgEnc||0, r.PasTejPl||0, r.PasTejTs||0, r.KgHil||0, r.mDbl||0]),
    ];
    if (indRecs.length) {
      const sums = [7,8,9,10,11,12,13].map(ci =>
        indRecs.reduce((a,r) => a + ([r.mTint,r.mEst,r.KgEnc,r.PasTejPl,r.PasTejTs,r.KgHil,r.mDbl][ci-7]||0), 0)
      );
      indProd.push(['TOTAL', ...sums]);
    }
    _addSheet(wb, 'Producción', indProd, [12,14,14,12,16,16,14,12]);

    // ── Hoja 4: Tendencia histórica
    const tend = GasVsProdEngine.calcTendencia(12);
    const tendSheet = [
      ['TENDENCIA HISTÓRICA — ÚLTIMOS 12 MESES'],
      [],
      ['Mes','Total m³','Tintorería m³','Estampado m³','Encolado m³','Caldera m³','Pérdida m³','m Tint','m Est','CE Tint m³/m','CE Est m³/m','CSE Tint ARS/m'],
      ...tend.map(t => [
        t.mes, N0(t.total_m3), N0(t.tint_m3), N0(t.estamp_m3), N0(t.enc_m3),
        N0(t.caldera_m3), N0(t.perdida_m3), N0(t.mTint), N0(t.mEst),
        N3(t.ce_tint), N3(t.ce_estmp), N2(t.cse_tint_ars),
      ]),
    ];
    _addSheet(wb, 'Tendencia', tendSheet, [10,12,14,14,12,12,12,10,10,14,14,16]);

    _save(wb, `Karatex_GasVsProd_${mes}.xlsx`);
    UI.notify(`✓ Excel Gas vs Prod ${mes} generado`, '', 3500);
  }

  // ── ENERGÍA ELÉCTRICA ─────────────────────────────────────────────────────────

  function exportarEE(mes) {
    const k = EEEngine.calcKpiMes(mes);
    if (!k) { UI.notify('Sin datos EE para exportar','err'); return; }
    const wb = _wb();

    // Hoja 1: Resumen sectorial
    const resumen = [
      [`ANÁLISIS ENERGÍA ELÉCTRICA — ${mes}`],
      [`Generado: ${new Date().toLocaleString('es-AR')} · Karatex SA`],
      [],
      ['CONSUMO POR SECTOR'],
      ['Sector','MWh','kWh','% Total'],
      ['Tejeduría',  N2(k.tej_MWh),  N0(k.tej_MWh*1000),  PCT(k.pct_tej)],
      ['Terminado',  N2(k.term_MWh), N0(k.term_MWh*1000), PCT(k.pct_term)],
      ['Hilandería', N2(k.hil_MWh),  N0(k.hil_MWh*1000),  PCT(k.pct_hil)],
      ['TOTAL',      N2(k.total_MWh),N0(k.total_MWh*1000),'100%'],
      [],
      ['MEDICIÓN SMEC'],
      ['Total trafos kWh','SMEC kWh','Error kWh','Error %'],
      [N0(k.total_trafos), k.smec_kWh?N0(k.smec_kWh):'Sin lectura', N0(k.error_kWh), PCT(k.pct_error)],
    ];
    _addSheet(wb, 'Resumen EE', resumen, [16,10,12,10]);

    // Hoja 2: Detalle por transformador
    const cfg = AppState.db.ee_config || {};
    const tps = cfg.trafos_por_sector || {};
    const mix = tps.MIXTO_5 || { trafo:'Transformador Nº 5' };
    const raw = (AppState.db.ee_trafos||[]).find(r => r.mes === mes);

    const trafos = [
      ['DETALLE POR TRANSFORMADOR — '+mes],
      [],
      ['Transformador','Sector','Factor corrección','Medido kWh','Corrección kWh','Corregido kWh','% Total'],
    ];

    const factores = { 'Transformador Nº 8': 160, 'Transformador Nº 9': 140 };
    const totalCorr = Object.values(k.trafos_corr).reduce((a,v)=>a+(v||0),0);

    Object.entries(k.trafos_corr).sort((a,b)=>(b[1]||0)-(a[1]||0)).forEach(([nombre,val])=>{
      const rv  = raw ? (raw.trafos[nombre]||0) : 0;
      const co  = val - rv;
      const fac = factores[nombre] || 320;
      let sec = '—';
      if ((tps.TEJ||[]).includes(nombre)) sec = 'Tejeduría';
      else if ((tps.TERM||[]).includes(nombre)) sec = 'Terminado';
      else if ((tps.HIL||[]).includes(nombre)) sec = 'Hilandería';
      else if (nombre === mix.trafo) sec = 'Mixto 60/30/10';
      trafos.push([nombre, sec, fac, N0(rv), N0(co), N0(val), totalCorr>0?N2(val/totalCorr*100):0]);
    });
    trafos.push([]);
    trafos.push(['TOTAL','','', N0(k.total_trafos), N0(k.error_kWh), N0(totalCorr), 100]);
    _addSheet(wb, 'Trafos', trafos, [22,16,14,14,14,14,10]);

    // Hoja 3: Compresores (si existen)
    if (k.comp && k.comp.detalle.length) {
      const comp = [
        ['COMPRESORES — AIRE COMPRIMIDO — '+mes],
        [],
        ['Compresor','Red','Pot carga kW','Pot desc kW','Hs carga','Hs desc','kWh carga','kWh desc','kWh total','m³ gen.'],
        ...k.comp.detalle.map(d=>[
          d.n, d.sector, '', '', d.hs_carga, d.hs_desc,
          N0(d.kWh_carga), N0(d.kWh_desc), N0(d.kWh_total), N0(d.m3),
        ]),
        [],
        ['Redistribución TEJ→TERM','','','','','','','', N0(k.comp.kWh_tej_a_term),''],
        ['Redistribución TEJ→HIL', '','','','','','','', N0(k.comp.kWh_tej_a_hil), ''],
      ];
      _addSheet(wb, 'Compresores', comp, [20,12,12,12,10,10,12,12,12,12]);
    }

    // Hoja 4: Tendencia EE
    const tend = EEEngine.calcTendencia(12);
    const tendSheet = [
      ['TENDENCIA HISTÓRICA EE — ÚLTIMOS 12 MESES'],
      [],
      ['Mes','Total MWh','Tejeduría MWh','Terminado MWh','Hilandería MWh','SMEC MWh'],
      ...tend.map(t=>[t.mes, N2(t.total_MWh), N2(t.tej_MWh), N2(t.term_MWh), N2(t.hil_MWh), t.smec_MWh?N2(t.smec_MWh):'—']),
    ];
    _addSheet(wb, 'Tendencia EE', tendSheet, [10,12,14,14,14,12]);

    _save(wb, `Karatex_EE_${mes}.xlsx`);
    UI.notify(`✓ Excel EE ${mes} generado`, '', 3500);
  }

  // ── DASHBOARD EJECUTIVO ───────────────────────────────────────────────────────

  function exportarEjecutivo(mes) {
    // Calcular usando la lógica del dashboard ejecutivo
    const desde = mes + '-01';
    const hasta = mes + '-31';
    const ta    = (typeof CONFIG !== 'undefined' && CONFIG.tarifas) ? CONFIG.tarifas : {};
    const gnARS = ta.gnARS || 0;
    const tarFD = ta.tarFD || 0;
    const usd   = ta.usd   || 1;

    const gasKpi = GasVsProdEngine.calcKpi(desde, hasta, null);
    const eeKpi  = EEEngine.calcKpiMes(mes);
    const prod   = GasVsProdEngine.calcProduccion(desde, hasta);

    if (!gasKpi && !eeKpi) { UI.notify('Sin datos ejecutivos para exportar','err'); return; }

    const costoGas   = gasKpi ? gasKpi.gas.total_planta * gnARS : 0;
    const costoEE    = eeKpi  ? eeKpi.total_MWh * 1000 * tarFD  : 0;
    const costoTotal = costoGas + costoEE;

    const costoGasTint = gasKpi ? gasKpi.gas.total_tint   * gnARS : 0;
    const costoGasEst  = gasKpi ? gasKpi.gas.total_estamp * gnARS : 0;
    const costoGasEnc  = gasKpi ? gasKpi.gas.total_enc    * gnARS : 0;
    const costoEETej   = eeKpi  ? eeKpi.tej_MWh  * 1000 * tarFD  : 0;
    const costoEETerm  = eeKpi  ? eeKpi.term_MWh * 1000 * tarFD  : 0;
    const costoEEHil   = eeKpi  ? eeKpi.hil_MWh  * 1000 * tarFD  : 0;

    const wb = _wb();

    // Hoja 1: Resumen ejecutivo
    const res = [
      [`DASHBOARD EJECUTIVO INTEGRADO — ${mes}`],
      [`Karatex SA · Generado: ${new Date().toLocaleString('es-AR')}`],
      [],
      ['COSTO ENERGÉTICO TOTAL'],
      ['Energía','Consumo','Unidad','Costo ARS','Costo USD','Participación %'],
      ['Gas Natural', N0(gasKpi?.gas.total_planta||0), 'm³', N0(costoGas), N2(costoGas/usd), costoTotal>0?N2(costoGas/costoTotal*100):0],
      ['Energía Eléctrica', N2(eeKpi?.total_MWh||0), 'MWh', N0(costoEE), N2(costoEE/usd), costoTotal>0?N2(costoEE/costoTotal*100):0],
      ['TOTAL', '', '', N0(costoTotal), N2(costoTotal/usd), 100],
      [],
      ['COSTO INTEGRADO POR SECTOR (Gas + EE)'],
      ['Sector','Producción','Unidad','Costo Gas ARS','Costo EE ARS','Costo Total ARS','Costo esp. ARS/u','Costo esp. USD/u'],
    ];

    const sectores = [
      { n:'Tintorería',  prod: prod.mTint,  u:'m',  gas:costoGasTint, ee:costoEETej  },
      { n:'Estampado',   prod: prod.mEst,   u:'m',  gas:costoGasEst,  ee:0           },
      { n:'Encolado',    prod: prod.KgEnc,  u:'kg', gas:costoGasEnc,  ee:0           },
      { n:'Terminado',   prod: prod.mDbl,   u:'m',  gas:0,            ee:costoEETerm },
      { n:'Hilandería',  prod: prod.KgHil,  u:'kg', gas:0,            ee:costoEEHil  },
    ];
    sectores.forEach(s => {
      const tot = s.gas + s.ee;
      const ce  = s.prod > 0 ? tot / s.prod : null;
      res.push([s.n, N0(s.prod), s.u, N0(s.gas), N0(s.ee), N0(tot), ce?N2(ce):'—', ce?N4(ce/usd):'—']);
    });

    res.push([]);
    res.push(['TARIFAS APLICADAS']);
    res.push(['Gas ARS/m³','EE ARS/kWh (tarFD)','Cambio ARS/USD']);
    res.push([gnARS, tarFD, usd]);
    _addSheet(wb, 'Ejecutivo', res, [14,12,8,16,14,16,16,16]);

    // Hoja 2: Tendencia histórica ejecutiva
    const mesesGas = GasVsProdEngine.getMesesDisponibles();
    const mesesEE  = EEEngine.getMesesDisponibles();
    const meses    = [...new Set([...mesesGas,...mesesEE])].sort().slice(-12);

    const tend = [
      ['TENDENCIA HISTÓRICA EJECUTIVA — ÚLTIMOS 12 MESES'],
      [],
      ['Mes','Costo Gas ARS','Costo EE ARS','Costo Total ARS','Costo Total USD','m Tint','CE Tint ARS/m'],
    ];
    meses.forEach(m => {
      const d2 = m+'-01', h2 = m+'-31';
      const gk = GasVsProdEngine.calcKpi(d2,h2,null);
      const ek = EEEngine.calcKpiMes(m);
      const pr = GasVsProdEngine.calcProduccion(d2,h2);
      const cg = gk ? gk.gas.total_planta*gnARS : 0;
      const ce2= ek ? ek.total_MWh*1000*tarFD   : 0;
      const ct = cg+ce2;
      const cgt= gk ? gk.gas.total_tint*gnARS+((ek?ek.tej_MWh*1000*tarFD:0)) : 0;
      const ceT= pr.mTint > 0 ? cgt/pr.mTint : null;
      tend.push([m, N0(cg), N0(ce2), N0(ct), N2(ct/usd), N0(pr.mTint), ceT?N2(ceT):'—']);
    });
    _addSheet(wb, 'Tendencia', tend, [10,16,14,16,14,10,14]);

    _save(wb, `Karatex_Ejecutivo_${mes}.xlsx`);
    UI.notify(`✓ Excel Ejecutivo ${mes} generado`, '', 3500);
  }

  // ── API PÚBLICA ───────────────────────────────────────────────────────────────

  return {
    exportarGasVsProd,
    exportarEE,
    exportarEjecutivo,
  };

})();
