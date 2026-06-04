/**
 * js/engines/TariffEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor Tarifario — Colortex SA · Matriz Energética
 *
 * Responsabilidades EXCLUSIVAS:
 *   · Cálculo de costos por tramos FD/ID
 *   · Cálculo de penalizaciones GNL (sobreconsumo / subconsumo)
 *   · Cálculo de cargos fijos mensuales
 *   · Costo consolidado planta (FD + ID + cargos)
 *   · Equivalencias energéticas (m³ ↔ MMBTU ↔ ARS ↔ USD)
 *
 * Toda referencia a tarifas usa CONFIG. Ningún valor hardcodeado aquí.
 * Dependencias: Repository, AppState, CONFIG
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const TariffEngine = (() => {

  // ── COSTOS POR TRAMOS FD/ID ─────────────────────────────────────────────────

  /**
   * Calcula el costo de consumo por tramos FD/ID para un conjunto de días.
   *
   * Regla:
   *   Consumo diario ≤ CONFIG.limites.fd → tarifa FD
   *   Consumo diario > CONFIG.limites.fd → excedente aplica tarifa ID
   *
   * @param {string[]} fechas - Array de fechas ISO YYYY-MM-DD
   * @returns {{ volFD, volID, costFD, costID, costTotal }}
   */
  function calcCostoTramos(fechas) {
    const p      = CONFIG.tarifas;
    const limFD  = CONFIG.limites.fd;
    let volFD = 0, volID = 0;

    fechas.forEach(d => {
      const dReal = AppState.db.prod
        .filter(r => r.f === d && r.cl === 'REAL')
        .reduce((a, r) => a + r.c, 0);

      volFD += Math.min(dReal, limFD);
      volID += Math.max(0, dReal - limFD);
    });

    return {
      volFD,
      volID,
      costFD:    volFD * p.tarFD,
      costID:    volID * p.tarID,
      costTotal: volFD * p.tarFD + volID * p.tarID,
    };
  }

  /**
   * Calcula el costo de tramos FD/ID para UN día.
   * @param {number} consReal - Consumo real del día (m³)
   * @returns {{ volFD_dia, volID_dia, costFD_dia, costID_dia, costTotal_dia }}
   */
  function calcCostoDia(consReal) {
    const p     = CONFIG.tarifas;
    const limFD = CONFIG.limites.fd;

    const volFD_dia  = Math.min(consReal, limFD);
    const volID_dia  = Math.max(0, consReal - limFD);

    return {
      volFD_dia,
      volID_dia,
      costFD_dia:    volFD_dia * p.tarFD,
      costID_dia:    volID_dia * p.tarID,
      costTotal_dia: volFD_dia * p.tarFD + volID_dia * p.tarID,
    };
  }

  // ── PENALIZACIONES GNL ──────────────────────────────────────────────────────

  /**
   * Calcula las penalizaciones GNL por exceso y déficit de consumo.
   *
   * @param {Object} ld       - Registro distribuidora
   * @param {number} consReal - Consumo real (m³)
   * @returns {{ exceso, deficit, penExcARS, penSubARS, penTotal }}
   */
  function calcPenalizaciones(ld, consReal) {
    const p = CONFIG.tarifas;
    const lim = CONFIG.limites;

    if (!ld || !ld.aut) {
      return { exceso: 0, deficit: 0, penExcARS: 0, penSubARS: 0, penTotal: 0 };
    }

    const aut     = ld.aut;
    const rest    = Math.min(ld.rest || 0, aut);
    const hayRest = rest > 0;
    const limOper = Math.max(0, aut - rest);

    const exceso  = Math.max(0, consReal - aut);
    const deficit = hayRest
      ? Math.max(0, limOper * lim.minConsumo - consReal)
      : Math.max(0, aut    * lim.minConsumo - consReal);

    const penExcARS = exceso  * lim.factorPenGNL * p.gnlARS;
    const penSubARS = deficit * p.tarID;   // Subconsumo a tarifa ID (no GNL)
    const penTotal  = penExcARS + penSubARS;

    return { exceso, deficit, penExcARS, penSubARS, penTotal };
  }

  // ── CARGOS FIJOS ───────────────────────────────────────────────────────────

  /**
   * Devuelve los cargos fijos mensuales desagregados.
   * @returns {{ cargoFijo, cargoReservaFD, cargoM3FD, cargoM3ID, transpNQ, transpNO, total }}
   */
  function getCargosDesagregados() {
    const cf = CONFIG.cargosFijos;
    const total = cf.cargoFijo + cf.cargoReservaFD + cf.cargoM3FD + cf.cargoM3ID + cf.transpNQ + cf.transpNO;
    return { ...cf, total };
  }

  /**
   * Devuelve los cargos fijos del consolidado (sin transporte).
   * Incluye: cargo fijo + reserva FD + cargo m³ FD + cargo m³ ID
   */
  function getCargosConsolidFD() {
    const cf = CONFIG.cargosFijos;
    return cf.cargoFijo + cf.cargoReservaFD + cf.cargoM3FD + cf.cargoM3ID;
  }

  // ── COSTO CONSOLIDADO PLANTA ────────────────────────────────────────────────

  /**
   * Calcula el costo consolidado total de la planta para un mes.
   *
   * Estructura:
   *   costConsolidFD_per = costFDtramo + cargosConsolidFD
   *   costConsolidID_per = costIDtramo
   *   costConsolid_per   = FD + ID (mes completo)
   *
   * @param {string} ym          - Año-Mes (YYYY-MM)
   * @param {number} consReal_dia - Consumo real del día seleccionado (para pct)
   * @returns {Object} breakdown consolidado
   */
  function calcCostoConsolidado(ym, consReal_dia) {
    // Fechas con registros REAL en el mes
    const fechasMes = [...new Set(
      AppState.db.prod
        .filter(r => r.cl === 'REAL' && r.f.slice(0, 7) === ym)
        .map(r => r.f)
    )].sort();

    const tramosMes = calcCostoTramos(fechasMes);
    const tramosDia = calcCostoDia(consReal_dia);
    const cargos    = getCargosConsolidFD();

    const costConsolidFD_per = tramosMes.costFD + cargos;
    const costConsolidID_per = tramosMes.costID;
    const costConsolid_per   = costConsolidFD_per + costConsolidID_per;
    const volMes             = tramosMes.volFD + tramosMes.volID;

    const pctFD = costConsolid_per ? costConsolidFD_per / costConsolid_per * 100 : 0;
    const pctID = costConsolid_per ? costConsolidID_per / costConsolid_per * 100 : 0;

    return {
      // Período (mes)
      volFD_per:           tramosMes.volFD,
      volID_per:           tramosMes.volID,
      volMes,
      costFDtramo_per:     tramosMes.costFD,
      costIDtramo_per:     tramosMes.costID,
      costConsolidFD_per,
      costConsolidID_per,
      costConsolid_per,
      pctFD,
      pctID,
      // Día
      volFD_dia:           tramosDia.volFD_dia,
      volID_dia:           tramosDia.volID_dia,
      costFDtramo_dia:     tramosDia.costFD_dia,
      costIDtramo_dia:     tramosDia.costID_dia,
      costConsolid_dia:    tramosDia.costTotal_dia,
    };
  }

  // ── EQUIVALENCIAS ─────────────────────────────────────────────────────────

  /**
   * Convierte m³ de GN a otras unidades.
   * @param {number} m3 - Volumen en m³
   * @returns {{ mmbtu, arsGN, arsGNL, usdGN, usdGNL }}
   */
  function convertirVolumen(m3) {
    const e = CONFIG.energia;
    const p = CONFIG.tarifas;
    const mmbtu  = m3 * e.equivMmbtu;
    return {
      mmbtu,
      arsGN:  m3 * p.gnARS,
      arsGNL: m3 * p.gnlARS,
      usdGN:  mmbtu * p.gnUSD || m3 * p.gnARS / p.usd,
      usdGNL: mmbtu * p.gnlUSD,
    };
  }

  // ── API PÚBLICA ──────────────────────────────────────────────────────────────
  return {
    calcCostoTramos,
    calcCostoDia,
    calcPenalizaciones,
    getCargosDesagregados,
    getCargosConsolidFD,
    calcCostoConsolidado,
    convertirVolumen,
  };

})();
