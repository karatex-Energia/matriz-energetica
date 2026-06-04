/**
 * js/engines/EEEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de cálculo — Energía Eléctrica · Colortex SA · Matriz Energética
 *
 * Responsabilidades:
 *   · Cálculo de consumo por trafo (diferencia de lecturas × factor corrección)
 *   · Distribución del error de medición (trafo vs SMEC) proporcionalmente
 *   · Asignación de consumo por sector (TEJ / TERM / HIL)
 *   · Cálculo de consumo eléctrico de compresores (carga + descarga)
 *   · Distribución del consumo de compresores TEJ hacia TERM/HIL
 *   · Distribución del consumo de agua de perforación por sector
 *   · KPIs de EE mensuales y tendencia histórica
 *
 * Dependencias: AppState (para acceso a db.ee_*), CONFIG (constantes EE)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const EEEngine = (() => {

  // ── ACCESO A DATOS ──────────────────────────────────────────────────────────

  function _trafos()     { return AppState.db.ee_trafos     || []; }
  function _comp()       { return AppState.db.ee_compresores || { equipos: [], lecturas: [] }; }
  function _agua()       { return AppState.db.ee_agua        || { pozos: [], distribucion: {}, lecturas: [] }; }
  function _eecfg()      { return AppState.db.ee_config      || {}; }

  // ── HELPERS ─────────────────────────────────────────────────────────────────

  /**
   * Devuelve el registro de trafos para un mes dado (YYYY-MM).
   */
  function getTrafosForMes(mes) {
    return _trafos().find(r => r.mes === mes) || null;
  }

  /**
   * Devuelve la lectura de compresores para un mes dado.
   */
  function getCompresoresForMes(mes) {
    const d = _comp();
    return (d.lecturas || []).find(r => r.mes === mes) || null;
  }

  /**
   * Devuelve la lectura de agua para un mes dado.
   */
  function getAguaForMes(mes) {
    return (_agua().lecturas || []).find(r => r.mes === mes) || null;
  }

  /**
   * Lista de meses disponibles (con datos de trafos), ordenados ASC.
   */
  function getMesesDisponibles() {
    return _trafos().map(r => r.mes).sort();
  }

  /**
   * Último mes con datos.
   */
  function getLastMes() {
    const m = getMesesDisponibles();
    return m[m.length - 1] || null;
  }

  // ── CÁLCULO POR TRAFO ────────────────────────────────────────────────────────

  /**
   * Para un mes dado, calcula el consumo corregido por trafo:
   *   1. Consumo_trafo = kWh medido por trafo (ya calculado en el registro)
   *   2. Diferencia_total = SMEC - Σ(consumos trafos)
   *   3. Corrección_trafo = Diferencia_total × (consumo_trafo / Σ_consumos)
   *   4. Consumo_corregido = consumo_trafo + corrección_trafo
   *
   * @param {string} mes - YYYY-MM
   * @returns {Object|null} { trafos_corr, total_kWh, smec_kWh, error_kWh, pct_error }
   */
  function calcTrafosCorregidos(mes) {
    const rec = getTrafosForMes(mes);
    if (!rec) return null;

    const { trafos, total_kWh, smec_kWh } = rec;
    if (!smec_kWh || total_kWh === 0) {
      // Sin SMEC: usar trafos sin corrección
      return {
        trafos_corr: { ...trafos },
        total_kWh,
        smec_kWh: null,
        error_kWh: 0,
        pct_error: 0,
      };
    }

    const error = smec_kWh - total_kWh;
    const pct_error = total_kWh > 0 ? (error / total_kWh) * 100 : 0;

    const trafos_corr = {};
    for (const [nombre, val] of Object.entries(trafos)) {
      if (typeof val === 'number' && val > 0) {
        const corr = error * (val / total_kWh);
        trafos_corr[nombre] = Math.round((val + corr) * 100) / 100;
      } else {
        trafos_corr[nombre] = val || 0;
      }
    }

    return {
      trafos_corr,
      total_kWh,
      smec_kWh,
      error_kWh: Math.round(error * 100) / 100,
      pct_error: Math.round(pct_error * 100) / 100,
    };
  }

  // ── DISTRIBUCIÓN POR SECTOR ─────────────────────────────────────────────────

  /**
   * Asigna el consumo corregido de trafos a cada sector.
   * Usa la configuración de db.ee_config:
   *   - Trafos 1,2,3,4,6 → Tejeduría
   *   - Trafos 7,8,9     → Terminado
   *   - Trafo 10         → Hilandería
   *   - Trafo 5          → Mixto (60% Tej / 30% Term / 10% Hil)
   *
   * @param {Object} trafos_corr - { "Transformador Nº N": kWh, ... }
   * @returns {{ tej: number, term: number, hil: number }}
   */
  function calcSectoresTrafos(trafos_corr) {
    const cfg = _eecfg();
    const tps  = cfg.trafos_por_sector || {};
    const mix5 = tps.MIXTO_5 || { trafo: 'Transformador Nº 5', pct_tej: 0.60, pct_term: 0.30, pct_hil: 0.10 };

    let tej = 0, term = 0, hil = 0;

    // Trafos directos
    (tps.TEJ || []).forEach(tn => { tej  += (trafos_corr[tn] || 0); });
    (tps.TERM || []).forEach(tn => { term += (trafos_corr[tn] || 0); });
    (tps.HIL || []).forEach(tn => { hil  += (trafos_corr[tn] || 0); });

    // Trafo 5 mixto
    const v5 = trafos_corr[mix5.trafo] || 0;
    tej  += v5 * (mix5.pct_tej  || 0.60);
    term += v5 * (mix5.pct_term || 0.30);
    hil  += v5 * (mix5.pct_hil  || 0.10);

    return {
      tej:  Math.round(tej  * 100) / 100,
      term: Math.round(term * 100) / 100,
      hil:  Math.round(hil  * 100) / 100,
    };
  }

  // ── COMPRESORES ─────────────────────────────────────────────────────────────

  /**
   * Calcula el consumo eléctrico de compresores para un mes.
   *
   * Para cada compresor:
   *   kWh_carga    = hs_carga    × pot_carga
   *   kWh_descarga = hs_descarga × pot_desc
   *   kWh_total    = kWh_carga + kWh_descarga
   *   m3_generados = caudal_nominal × hs_carga × 60
   *
   * Grupos:
   *   TEJ (C01-C09) → kWh_tej, m3_tej
   *   HIL_TERM (C10-C11) → kWh_hil_term, m3_hil_term
   *
   * Distribución del aporte de TEJ a TERM/HIL:
   *   vol_term = dias_term × 24 × 60 × dem_term  (m³)
   *   vol_hil  = dias_hil  × 24 × 60 × dem_hil   (m³)
   *   vol_auto = m3_hil_term (autogenerado)
   *   vol_aport = max(0, (vol_term + vol_hil) - vol_auto)
   *   pct_term = vol_term / (vol_term + vol_hil)
   *   pct_hil  = vol_hil  / (vol_term + vol_hil)
   *   kWh_tej→term = kWh_tej_total × pct_term  (se resta de TEJ, suma a TERM)
   *   kWh_tej→hil  = kWh_tej_total × pct_hil   (se resta de TEJ, suma a HIL)
   *   (factor de rendimiento pct_rendimiento aplicado)
   *
   * @param {string} mes - YYYY-MM
   * @returns {Object|null}
   */
  function calcCompresores(mes) {
    const lectura = getCompresoresForMes(mes);
    const cfg     = _comp();
    if (!lectura) return null;

    const equipos = cfg.equipos || [];
    const comps   = lectura.compresores || {};
    const dias_term = lectura.dias_terminado  || 0;
    const dias_hil  = lectura.dias_hilanderia || 0;
    const dem_tej   = lectura.caudal_dem_tej   || 17;
    const dem_term  = lectura.caudal_dem_term  || 17;
    const dem_hil   = lectura.caudal_dem_hil   || 17;
    const pct_rend  = lectura.pct_rendimiento  || 0.75;

    // Calcular por compresor
    const detalle = [];
    let kWh_tej = 0, m3_tej = 0;
    let kWh_hil_term = 0, m3_hil_term = 0;

    for (const eq of equipos) {
      const lec = comps[eq.id] || { hs_carga: 0, hs_desc: 0 };
      const kWh_carga = lec.hs_carga * eq.pot_carga;
      const kWh_desc  = lec.hs_desc  * (eq.pot_desc || 0);
      const kWh_total = kWh_carga + kWh_desc;
      const m3        = eq.caudal * lec.hs_carga * 60;

      detalle.push({
        id: eq.id,
        n: eq.n,
        sector: eq.sector,
        hs_carga: lec.hs_carga,
        hs_desc:  lec.hs_desc,
        kWh_carga,
        kWh_desc,
        kWh_total,
        m3,
      });

      if (eq.sector === 'TEJ') {
        kWh_tej  += kWh_total;
        m3_tej   += m3;
      } else {
        kWh_hil_term += kWh_total;
        m3_hil_term  += m3;
      }
    }

    // Distribución del aporte TEJ → TERM/HIL
    const vol_term  = dias_term * 24 * 60 * dem_term;
    const vol_hil   = dias_hil  * 24 * 60 * dem_hil;
    const vol_total = vol_term + vol_hil;
    const vol_auto  = m3_hil_term;
    const vol_aport = Math.max(0, vol_total - vol_auto);

    let kWh_tej_a_term = 0, kWh_tej_a_hil = 0;

    if (vol_total > 0 && kWh_tej > 0) {
      const pct_term_dist = vol_term / vol_total;
      const pct_hil_dist  = vol_hil  / vol_total;
      // kWh equivalente del volumen aportado por TEJ
      const kWh_m3 = m3_tej > 0 ? kWh_tej / m3_tej : 0;
      const kWh_aport = vol_aport * kWh_m3 * pct_rend;
      kWh_tej_a_term = kWh_aport * pct_term_dist;
      kWh_tej_a_hil  = kWh_aport * pct_hil_dist;
    }

    return {
      detalle,
      kWh_tej,
      kWh_hil_term,
      m3_tej,
      m3_hil_term,
      kWh_tej_a_term: Math.round(kWh_tej_a_term * 100) / 100,
      kWh_tej_a_hil:  Math.round(kWh_tej_a_hil  * 100) / 100,
      vol_term,
      vol_hil,
      vol_auto,
      vol_aport: Math.round(vol_aport),
      dias_term,
      dias_hil,
    };
  }

  // ── AGUA DE PERFORACIÓN ─────────────────────────────────────────────────────

  /**
   * Calcula el consumo eléctrico de pozos de agua y lo distribuye por sector.
   *
   * kWh_pozoN = hs_marcha × pot_kW
   * kWh_total = Σ kWh_pozos
   * kWh_hil   = kWh_total × pct_hilanderia
   * kWh_tej   = kWh_total × pct_tejeria
   * kWh_term  = kWh_total × pct_terminado
   *
   * @param {string} mes - YYYY-MM
   * @returns {Object|null}
   */
  function calcAgua(mes) {
    const lectura = getAguaForMes(mes);
    const cfg     = _agua();
    if (!lectura) return null;

    const pozos  = cfg.pozos || [];
    const dist   = cfg.distribucion || { pct_hilanderia: 0.15, pct_tejeria: 0.15, pct_terminado: 0.70 };

    let kWh_total = 0;
    const detalle = [];
    for (const p of pozos) {
      const hs  = lectura[p.id + '_hs'] || 0;
      const kWh = hs * (p.pot_kW || 0);
      kWh_total += kWh;
      detalle.push({ id: p.id, n: p.n, hs, kWh });
    }

    return {
      detalle,
      kWh_total: Math.round(kWh_total * 100) / 100,
      kWh_hil:  Math.round(kWh_total * (dist.pct_hilanderia || 0) * 100) / 100,
      kWh_tej:  Math.round(kWh_total * (dist.pct_tejeria    || 0) * 100) / 100,
      kWh_term: Math.round(kWh_total * (dist.pct_terminado  || 0) * 100) / 100,
    };
  }

  // ── KPIs MENSUALES COMPLETOS ────────────────────────────────────────────────

  /**
   * Calcula el cuadro completo de KPIs de EE para un mes.
   * Integra trafos + compresores + agua.
   *
   * @param {string} mes - YYYY-MM
   * @returns {Object|null}
   */
  function calcKpiMes(mes) {
    const trafos_calc = calcTrafosCorregidos(mes);
    if (!trafos_calc) return null;

    const sec_trafos = calcSectoresTrafos(trafos_calc.trafos_corr);
    const comp       = calcCompresores(mes);   // puede ser null
    const agua       = calcAgua(mes);          // puede ser null

    // Consumo trafos por sector (base)
    let tej  = sec_trafos.tej;
    let term = sec_trafos.term;
    let hil  = sec_trafos.hil;

    // Ajuste compresores: reasignar desde TEJ hacia TERM/HIL
    if (comp) {
      tej  -= (comp.kWh_tej_a_term + comp.kWh_tej_a_hil);
      term += comp.kWh_tej_a_term;
      hil  += comp.kWh_tej_a_hil;
    }

    // Ajuste agua
    if (agua) {
      tej  += agua.kWh_tej;
      term += agua.kWh_term;
      hil  += agua.kWh_hil;
    }

    const total_planta = tej + term + hil;
    const smec = trafos_calc.smec_kWh || total_planta;

    return {
      mes,
      // Trafos
      trafos_corr:    trafos_calc.trafos_corr,
      total_trafos:   trafos_calc.total_kWh,
      smec_kWh:       trafos_calc.smec_kWh,
      error_kWh:      trafos_calc.error_kWh,
      pct_error:      trafos_calc.pct_error,
      // Sectores pre-ajuste
      trafos_tej:     sec_trafos.tej,
      trafos_term:    sec_trafos.term,
      trafos_hil:     sec_trafos.hil,
      // Compresores
      comp,
      // Agua
      agua,
      // Sectores finales
      tej_MWh:  Math.round(tej  / 1000 * 100) / 100,
      term_MWh: Math.round(term / 1000 * 100) / 100,
      hil_MWh:  Math.round(hil  / 1000 * 100) / 100,
      total_MWh: Math.round(total_planta / 1000 * 100) / 100,
      // % por sector
      pct_tej:  total_planta > 0 ? Math.round(tej  / total_planta * 10000) / 100 : 0,
      pct_term: total_planta > 0 ? Math.round(term / total_planta * 10000) / 100 : 0,
      pct_hil:  total_planta > 0 ? Math.round(hil  / total_planta * 10000) / 100 : 0,
    };
  }

  // ── TENDENCIA HISTÓRICA ─────────────────────────────────────────────────────

  /**
   * Devuelve array de KPIs por mes para el rango disponible.
   * Sólo usa datos de trafos (sin compresores ni agua — para histórico rápido).
   *
   * @param {number} [nMeses=12] - Últimos N meses
   * @returns {Array<{ mes, total_MWh, tej_MWh, term_MWh, hil_MWh }>}
   */
  function calcTendencia(nMeses = 12) {
    const meses = getMesesDisponibles().slice(-nMeses);
    return meses.map(mes => {
      const tc = calcTrafosCorregidos(mes);
      if (!tc) return { mes, total_MWh: 0, tej_MWh: 0, term_MWh: 0, hil_MWh: 0 };
      const sec = calcSectoresTrafos(tc.trafos_corr);
      const total = sec.tej + sec.term + sec.hil;
      return {
        mes,
        total_MWh: Math.round(total    / 1000 * 10) / 10,
        tej_MWh:   Math.round(sec.tej  / 1000 * 10) / 10,
        term_MWh:  Math.round(sec.term / 1000 * 10) / 10,
        hil_MWh:   Math.round(sec.hil  / 1000 * 10) / 10,
        smec_MWh:  tc.smec_kWh ? Math.round(tc.smec_kWh / 1000 * 10) / 10 : null,
      };
    });
  }

  // ── API PÚBLICA ──────────────────────────────────────────────────────────────

  return {
    getLastMes,
    getMesesDisponibles,
    getTrafosForMes,
    getCompresoresForMes,
    getAguaForMes,
    calcTrafosCorregidos,
    calcSectoresTrafos,
    calcCompresores,
    calcAgua,
    calcKpiMes,
    calcTendencia,
  };

})();
