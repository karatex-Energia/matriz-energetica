/**
 * js/utils/csvExport.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Exportación CSV — Colortex SA · Matriz Energética
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const CsvExport = {

  exportarProduccion() {
    const rows = [['Fecha','Equipo','Sector','Tipo','Clasif.','Horas','CME','Consumo m³','PCI']];
    Repository.filterProd().forEach(r => {
      rows.push([r.f,r.eq,r.sec,r.tipo,r.cl,r.h,r.cme,r.c,r.pci]);
    });
    this._download(rows, `Colortex_GN_${this._hoy()}.csv`);
    UI.notify('✓ CSV exportado');
  },

  exportarDistribuidora() {
    const rows = [['Fecha','Nominado m³','Autorizado m³','Restringido m³','Disponible m³','Facturado m³','PCI','Obs']];
    AppState.db.dist.forEach(r => {
      rows.push([r.f,r.nom,r.aut,r.rest,r.disp,r.fact,r.pci,r.obs]);
    });
    this._download(rows, `Colortex_Distribuidora_${this._hoy()}.csv`);
    UI.notify('✓ CSV distribuidora exportado');
  },

  exportarLecturas() {
    const rows = [['ID','Fecha','Hora','Turno','Ubicación','Lectura m³','Supervisor','Obs']];
    AppState.db.lect.forEach(l => {
      rows.push([l.id,l.f,l.h,l.t,l.ub,l.c,l.sup||'',l.obs||'']);
    });
    this._download(rows, `Colortex_Lecturas_${this._hoy()}.csv`);
    UI.notify('✓ CSV lecturas exportado');
  },

  // ── GAS VS PRODUCCIÓN ──────────────────────────────────────────────────────

  exportarGasVsProd(desde, hasta, cl = null) {
    const k = GasVsProdEngine.calcKpi(desde, hasta, cl);
    if (!k) { UI.notify('Sin datos para exportar','err'); return; }
    const g = k.gas, p = k.prod, i = k.ind;
    const mes = desde.slice(0,7);
    const n = v => v != null ? (typeof v === 'number' ? v : v) : '—';
    const f2 = v => v != null ? v.toFixed(2) : '—';
    const f3 = v => v != null ? v.toFixed(3) : '—';
    const f4 = v => v != null ? v.toFixed(4) : '—';

    const rows = [
      [`ANÁLISIS GAS VS PRODUCCIÓN — ${mes}${cl?' ('+cl+')':''}`],[],
      ['SECTOR','Gas m³','Producción','Unidad','Consumo esp. m³/u','Costo esp. ARS/u','Costo esp. USD/u'],
      ['Tintorería', g.total_tint,  p.mTint, 'm',  f3(i.ce_tint),  f2(i.cse_tint_ars),  f4(i.cse_tint_usd)],
      ['Estampado',  g.total_estamp,p.mEst,  'm',  f3(i.ce_estmp), f2(i.cse_estmp_ars), f4(i.cse_estmp_usd)],
      ['Encolado',   g.total_enc,   p.KgEnc, 'kg', f3(i.ce_enc),   f2(i.cse_enc_ars),   f4(i.cse_enc_usd)],
      [],[`BALANCE CALDERA — Eficiencia ${(g.eficiencia_caldera*100).toFixed(0)}%`],
      ['Gas quemado m³','Gas útil m³','Pérdida m³','Vapor→Tint m³','Vapor→Enc m³'],
      [g.gas_caldera, g.gas_util_caldera, g.perdida_caldera, g.vapor_a_tint, g.vapor_a_enc],
      [],['COSTO TOTAL'],
      ['Total planta m³','Precio m³ ARS','USD ref.','Costo total ARS','Costo total USD'],
      [g.total_planta, n(i.precio_m3_ars), n(i.usd_rate), f2(i.costo_total_ars), f2(i.costo_total_usd)],
      [],['DETALLE POR EQUIPO'],
      ['Equipo','Sector','Tipo','Hs marcha','Gas m³','% Total'],
    ];

    Object.entries(g.detalle_equipos)
      .sort((a,b)=>b[1].c-a[1].c)
      .forEach(([eq,d])=>{
        const pct = g.total_planta>0?(d.c/g.total_planta*100).toFixed(1)+'%':'—';
        rows.push([eq, eq==='ZIMMER'?'ESTAMPADO':d.sec, d.tipo, d.hs.toFixed(1), d.c.toFixed(0), pct]);
      });

    const indRecs = (AppState.db.prodIndicadores||[]).filter(r=>r.f>=desde&&r.f<=hasta).sort((a,b)=>a.f.localeCompare(b.f));
    if (indRecs.length) {
      rows.push([],['INDICADORES DE PRODUCCIÓN'],['Fecha','m Tint','m Est','Kg Enc']);
      indRecs.forEach(r=>rows.push([r.f,r.mTint||0,r.mEst||0,r.KgEnc||0]));
    }

    this._download(rows, `Colortex_GasVsProd_${mes}.csv`);
    UI.notify(`✓ Gas vs Producción ${mes} exportado`,'',3000);
  },

  // ── ENERGÍA ELÉCTRICA ──────────────────────────────────────────────────────

  exportarEE(mes) {
    const k = EEEngine.calcKpiMes(mes);
    if (!k) { UI.notify('Sin datos EE para exportar','err'); return; }

    const rows = [
      [`ANÁLISIS ENERGÍA ELÉCTRICA — ${mes}`],[],
      ['RESUMEN POR SECTOR'],
      ['Sector','MWh','% Total'],
      ['Tejeduría',  k.tej_MWh,  k.pct_tej+'%'],
      ['Terminado',  k.term_MWh, k.pct_term+'%'],
      ['Hilandería', k.hil_MWh,  k.pct_hil+'%'],
      ['TOTAL',      k.total_MWh,'100%'],
      [],['MEDICIÓN'],
      ['Total trafos kWh','SMEC kWh','Error kWh','Error %'],
      [k.total_trafos, k.smec_kWh||'—', k.error_kWh, k.pct_error+'%'],
      [],['DETALLE POR TRANSFORMADOR'],
      ['Transformador','Sector','Medido kWh','Corrección kWh','Corregido kWh'],
    ];

    const cfg = AppState.db.ee_config||{};
    const tps = cfg.trafos_por_sector||{};
    const mix = tps.MIXTO_5||{trafo:'Transformador Nº 5'};
    const raw = (AppState.db.ee_trafos||[]).find(r=>r.mes===mes);

    Object.entries(k.trafos_corr).sort((a,b)=>(b[1]||0)-(a[1]||0)).forEach(([nombre,val])=>{
      const rv = raw?(raw.trafos[nombre]||0):0;
      const co = val-rv;
      let sec='—';
      if ((tps.TEJ||[]).includes(nombre)) sec='Tejeduría';
      else if ((tps.TERM||[]).includes(nombre)) sec='Terminado';
      else if ((tps.HIL||[]).includes(nombre)) sec='Hilandería';
      else if (nombre===mix.trafo) sec='Mixto';
      rows.push([nombre,sec,rv.toFixed(0),co.toFixed(0),val.toFixed(0)]);
    });

    if (k.comp) {
      rows.push([],['COMPRESORES']);
      rows.push(['Compresor','Red','Hs Carga','Hs Desc.','kWh Carga','kWh Desc.','kWh Total','m³ gen.']);
      k.comp.detalle.forEach(d=>{
        rows.push([d.n,d.sector,d.hs_carga,d.hs_desc,d.kWh_carga.toFixed(0),d.kWh_desc.toFixed(0),d.kWh_total.toFixed(0),d.m3.toFixed(0)]);
      });
    }

    this._download(rows, `Colortex_EE_${mes}.csv`);
    UI.notify(`✓ EE ${mes} exportado`,'',3000);
  },

  exportarProdIndicadores() {
    const rows = [
      ['INDICADORES DE PRODUCCIÓN'],
      ['Fecha','m Tint','m Est','Kg Enc','PAS tej pl','PAS tej ts','Kg Hil','m Dbl'],
    ];
    (AppState.db.prodIndicadores||[]).sort((a,b)=>a.f.localeCompare(b.f)).forEach(r=>{
      rows.push([r.f,r.mTint||0,r.mEst||0,r.KgEnc||0,r.PasTejPl||0,r.PasTejTs||0,r.KgHil||0,r.mDbl||0]);
    });
    this._download(rows, `Colortex_ProdIndicadores_${this._hoy()}.csv`);
    UI.notify('✓ Indicadores exportados','',3000);
  },

  // ── HELPERS ────────────────────────────────────────────────────────────────

  _hoy() { return new Date().toISOString().slice(0,10); },

  _download(rows, filename) {
    const csv  = rows.map(r=>Array.isArray(r)?r.join(';'):String(r)).join('\n');
    const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href=url; a.download=filename; a.click();
    URL.revokeObjectURL(url);
  },

};
