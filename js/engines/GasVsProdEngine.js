/**
 * js/engines/GasVsProdEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de cálculo — Análisis Gas vs Producción · Colortex SA
 *
 * Calcula para un período dado (día, semana, mes):
 *
 *   CONSUMO DE GAS POR SECTOR:
 *   · Tintorería  = Σ consumo equipos sector TINTORERIA (exc. ZIMMER)
 *   · Estampado   = consumo ZIMMER (gas directo)
 *   · Encolado    = Σ consumo equipos sector ENCOLADO
 *   · Caldera     = Σ consumo CALDERA 10Tn + CALDERA 4,5Tn
 *     → Gas útil  = consumo_caldera × eficiencia
 *     → Pérdida   = consumo_caldera × (1 - eficiencia)
 *     → Gas útil se distribuye a Tintorería y Encolado por prorrateo configurable
 *
 *   CONSUMO ESPECÍFICO (CE):
 *   · CE_Tintorería = (gas_tint + vapor_asignado_tint) / m_Tint  [m³/metro]
 *   · CE_Estampado  = gas_estampado                   / m_Est   [m³/metro]
 *   · CE_Encolado   = (gas_enc  + vapor_asignado_enc)  / Kg_Enc  [m³/kg]
 *
 *   COSTO ESPECÍFICO (CSE):
 *   · CSE = CE × precio_m3  [ARS/unidad] y [USD/unidad]
 *
 * Dependencias: AppState, CONFIG
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const GasVsProdEngine = (() => {

  // ── CONSTANTES DE SECTOR ─────────────────────────────────────────────────────

  const SECTOR = {
    TINT:     'TINTORERIA',
    ESTAMP:   'ESTAMPADO',    // analítico — equipos físicamente en Tintorería
    ENCOLADO: 'ENCOLADO',
    CALDERA:  'SALA CALDERA',
  };

  // Equipo que define el sector Estampado (físicamente en Tintorería)
  const EQUIPO_ESTAMPADO = 'ZIMMER';

  // Calderas que integran SALA CALDERA
  const EQUIPOS_CALDERA = ['CALDERA 10 Tn', 'CALDERA 4,5 Tn'];

  // ── CONFIGURACIÓN (valores por defecto, sobreescribibles desde CONFIG) ───────

  function _cfg() {
    const c  = (typeof CONFIG !== 'undefined' && CONFIG.gasVsProd) ? CONFIG.gasVsProd : {};
    const ta = (typeof CONFIG !== 'undefined' && CONFIG.tarifas)   ? CONFIG.tarifas   : {};
    return {
      eficiencia_caldera: c.eficiencia_caldera ?? 0.80,
      pct_vapor_tint:     c.pct_vapor_tint     ?? 0.726,
      pct_vapor_enc:      c.pct_vapor_enc      ?? 0.274,
      precio_m3_ars:      ta.gnARS             ?? 0,     // viene de CONFIG.tarifas.gnARS
      usd_rate:           ta.usd               ?? 1,     // viene de CONFIG.tarifas.usd
    };
  }

  // ── ACCESO A DATOS ───────────────────────────────────────────────────────────

  function _prod()      { return AppState.db.prod      || []; }
  function _prodInd()   { return AppState.db.prodIndicadores || []; }

  // ── FILTRO DE PERÍODO ────────────────────────────────────────────────────────

  /**
   * Filtra registros de producción por rango de fechas y clasificación.
   * @param {string} desde - YYYY-MM-DD
   * @param {string} hasta - YYYY-MM-DD
   * @param {string} [cl]  - 'PROYECTADA' | 'REAL' | null (ambas)
   */
  function _filtrarProd(desde, hasta, cl = null) {
    return _prod().filter(r => {
      if (r.f < desde || r.f > hasta) return false;
      if (cl && r.cl !== cl) return false;
      return true;
    });
  }

  function _filtrarProdInd(desde, hasta) {
    return _prodInd().filter(r => r.f >= desde && r.f <= hasta);
  }

  // ── CÁLCULO DE GAS POR SECTOR ────────────────────────────────────────────────

  /**
   * Calcula el consumo de gas por sector para un período.
   *
   * @param {string} desde - YYYY-MM-DD
   * @param {string} hasta - YYYY-MM-DD
   * @param {string} [cl]  - clasificación ('PROYECTADA'|'REAL'|null)
   * @returns {Object} consumos desagregados
   */
  function calcGasSectores(desde, hasta, cl = null) {
    const cfg  = _cfg();
    const recs = _filtrarProd(desde, hasta, cl);

    let gas_tint_directo = 0;  // equipos DIRECTO/MIXTO de Tintorería (exc. ZIMMER)
    let gas_tint_indir   = 0;  // equipos INDIRECTO de Tintorería
    let gas_estampado    = 0;  // ZIMMER
    let gas_encolado     = 0;  // ENCOLADO
    let gas_caldera      = 0;  // SALA CALDERA

    const detalle_equipos = {};

    for (const r of recs) {
      const c   = r.c || 0;
      const eq  = r.eq || '';
      const sec = r.sec || '';

      // Acumular detalle por equipo
      if (!detalle_equipos[eq]) detalle_equipos[eq] = { c: 0, hs: 0, sec, tipo: r.tipo };
      detalle_equipos[eq].c  += c;
      detalle_equipos[eq].hs += (r.hr || r.h || 0);

      // Clasificar
      if (EQUIPOS_CALDERA.includes(eq)) {
        gas_caldera += c;
      } else if (eq === EQUIPO_ESTAMPADO) {
        gas_estampado += c;
      } else if (sec === SECTOR.ENCOLADO) {
        gas_encolado += c;
      } else if (sec === SECTOR.TINT) {
        if (r.tipo === 'INDIRECTO') gas_tint_indir   += c;
        else                        gas_tint_directo += c;
      }
    }

    // Caldera → distribución de vapor
    const gas_util_caldera  = gas_caldera * cfg.eficiencia_caldera;
    const perdida_caldera   = gas_caldera * (1 - cfg.eficiencia_caldera);
    const vapor_a_tint      = gas_util_caldera * cfg.pct_vapor_tint;
    const vapor_a_enc       = gas_util_caldera * cfg.pct_vapor_enc;

    // Totales por sector (incluyendo aporte de vapor)
    const total_tint    = gas_tint_directo + gas_tint_indir + vapor_a_tint;
    const total_estamp  = gas_estampado;
    const total_enc     = gas_encolado + vapor_a_enc;
    const total_planta  = total_tint + total_estamp + total_enc + perdida_caldera;

    return {
      desde, hasta, cl,
      // Gas directo por sector (sin vapor)
      gas_tint_directo:  Math.round(gas_tint_directo),
      gas_tint_indir:    Math.round(gas_tint_indir),
      gas_estampado:     Math.round(gas_estampado),
      gas_encolado:      Math.round(gas_encolado),
      gas_caldera:       Math.round(gas_caldera),
      // Distribución caldera
      gas_util_caldera:  Math.round(gas_util_caldera),
      perdida_caldera:   Math.round(perdida_caldera),
      vapor_a_tint:      Math.round(vapor_a_tint),
      vapor_a_enc:       Math.round(vapor_a_enc),
      // Totales sectoriales (con vapor incorporado)
      total_tint:        Math.round(total_tint),
      total_estamp:      Math.round(total_estamp),
      total_enc:         Math.round(total_enc),
      total_planta:      Math.round(total_planta),
      perdida_abs:       Math.round(perdida_caldera),
      pct_tint:          total_planta > 0 ? +(total_tint   / total_planta * 100).toFixed(1) : 0,
      pct_estamp:        total_planta > 0 ? +(total_estamp / total_planta * 100).toFixed(1) : 0,
      pct_enc:           total_planta > 0 ? +(total_enc    / total_planta * 100).toFixed(1) : 0,
      pct_perd:          total_planta > 0 ? +(perdida_caldera / total_planta * 100).toFixed(1) : 0,
      // Detalle por equipo
      detalle_equipos,
      // Config usada
      eficiencia_caldera: cfg.eficiencia_caldera,
      pct_vapor_tint:     cfg.pct_vapor_tint,
      pct_vapor_enc:      cfg.pct_vapor_enc,
    };
  }

  // ── PRODUCCIÓN POR SECTOR ────────────────────────────────────────────────────

  /**
   * Suma la producción del período desde Prod_Indicadores.
   */
  function calcProduccion(desde, hasta) {
    const recs = _filtrarProdInd(desde, hasta);
    const prod = {
      mTint:    0,
      mEst:     0,
      KgEnc:    0,
      PasTejPl: 0,
      PasTejTs: 0,
      KgHil:    0,
      mDbl:     0,
      dias:     new Set(),
    };
    for (const r of recs) {
      prod.mTint    += r.mTint    || 0;
      prod.mEst     += r.mEst     || 0;
      prod.KgEnc    += r.KgEnc    || 0;
      prod.PasTejPl += r.PasTejPl || 0;
      prod.PasTejTs += r.PasTejTs || 0;
      prod.KgHil    += r.KgHil    || 0;
      prod.mDbl     += r.mDbl     || 0;
      prod.dias.add(r.f);
    }
    prod.dias = prod.dias.size;
    return prod;
  }

  // ── CONSUMO ESPECÍFICO ───────────────────────────────────────────────────────

  /**
   * Calcula consumo específico y costo específico por sector.
   *
   * @param {Object} gas  - resultado de calcGasSectores()
   * @param {Object} prod - resultado de calcProduccion()
   * @returns {Object} indicadores CE y CSE por sector
   */
  function calcIndicadores(gas, prod) {
    const cfg = _cfg();
    const p   = cfg.precio_m3_ars || 0;
    const fx  = cfg.usd_rate      || 1;

    // Consumo Específico [m³/unidad]
    const ce_tint  = prod.mTint  > 0 ? gas.total_tint  / prod.mTint  : null;
    const ce_estmp = prod.mEst   > 0 ? gas.total_estamp / prod.mEst  : null;
    const ce_enc   = prod.KgEnc  > 0 ? gas.total_enc   / prod.KgEnc  : null;

    // Costo Específico [ARS/unidad] y [USD/unidad]
    const cse_tint_ars  = ce_tint  != null ? ce_tint  * p       : null;
    const cse_estmp_ars = ce_estmp != null ? ce_estmp * p       : null;
    const cse_enc_ars   = ce_enc   != null ? ce_enc   * p       : null;
    const cse_tint_usd  = cse_tint_ars  != null ? cse_tint_ars  / fx : null;
    const cse_estmp_usd = cse_estmp_ars != null ? cse_estmp_ars / fx : null;
    const cse_enc_usd   = cse_enc_ars   != null ? cse_enc_ars   / fx : null;

    // Costo total por sector
    const costo_tint_ars  = gas.total_tint   * p;
    const costo_estmp_ars = gas.total_estamp  * p;
    const costo_enc_ars   = gas.total_enc    * p;
    const costo_total_ars = gas.total_planta * p;

    return {
      // Consumo específico [m³/unidad]
      ce_tint,  ce_estmp,  ce_enc,
      // Costo específico ARS
      cse_tint_ars,  cse_estmp_ars,  cse_enc_ars,
      // Costo específico USD
      cse_tint_usd,  cse_estmp_usd,  cse_enc_usd,
      // Costos totales
      costo_tint_ars,  costo_estmp_ars,  costo_enc_ars,  costo_total_ars,
      costo_tint_usd:  costo_tint_ars  / fx,
      costo_estmp_usd: costo_estmp_ars / fx,
      costo_enc_usd:   costo_enc_ars   / fx,
      costo_total_usd: costo_total_ars / fx,
      // Precio usado
      precio_m3_ars: p,
      usd_rate:      fx,
    };
  }

  // ── KPI COMPLETO ─────────────────────────────────────────────────────────────

  /**
   * Calcula el cuadro completo de KPIs Gas vs Producción para un período.
   *
   * @param {string} desde - YYYY-MM-DD
   * @param {string} hasta - YYYY-MM-DD
   * @param {string} [cl]  - 'PROYECTADA' | 'REAL' | null
   * @returns {Object|null}
   */
  function calcKpi(desde, hasta, cl = null) {
    if (!desde || !hasta) return null;

    const gas  = calcGasSectores(desde, hasta, cl);
    const prod = calcProduccion(desde, hasta);
    const ind  = calcIndicadores(gas, prod);

    return {
      desde, hasta, cl,
      gas,
      prod,
      ind,
    };
  }

  // ── TENDENCIA MENSUAL ────────────────────────────────────────────────────────

  /**
   * Calcula tendencia mes a mes para los últimos N meses disponibles.
   * Solo usa datos de gas (sin indicadores de producción para histórico rápido).
   *
   * @param {number} [nMeses=6]
   * @returns {Array}
   */
  function calcTendencia(nMeses = 6) {
    // Obtener meses únicos del dataset
    const mesesSet = new Set(_prod().map(r => r.f.slice(0, 7)));
    const meses    = [...mesesSet].sort().slice(-nMeses);

    return meses.map(mes => {
      const desde = mes + '-01';
      const hasta = mes + '-31';
      const gas   = calcGasSectores(desde, hasta);
      const prod  = calcProduccion(desde, hasta);
      const ind   = calcIndicadores(gas, prod);
      return {
        mes,
        total_m3:   gas.total_planta,
        tint_m3:    gas.total_tint,
        estamp_m3:  gas.total_estamp,
        enc_m3:     gas.total_enc,
        caldera_m3: gas.gas_caldera,
        perdida_m3: gas.perdida_caldera,
        mTint:      prod.mTint,
        mEst:       prod.mEst,
        KgEnc:      prod.KgEnc,
        ce_tint:    ind.ce_tint,
        ce_estmp:   ind.ce_estmp,
        ce_enc:     ind.ce_enc,
        cse_tint_ars:  ind.cse_tint_ars,
        cse_estmp_ars: ind.cse_estmp_ars,
        cse_enc_ars:   ind.cse_enc_ars,
      };
    });
  }

  // ── PERÍODOS DISPONIBLES ─────────────────────────────────────────────────────

  function getMesesDisponibles() {
    const s = new Set(_prod().map(r => r.f.slice(0, 7)));
    return [...s].sort();
  }

  function getDiasDisponibles(mes) {
    return [...new Set(
      _prod().filter(r => r.f.startsWith(mes)).map(r => r.f)
    )].sort();
  }

  function getLastMes() {
    const m = getMesesDisponibles();
    return m[m.length - 1] || null;
  }

  // ── FORMATO ──────────────────────────────────────────────────────────────────

  /**
   * Formatea un consumo específico con su unidad.
   * @param {number|null} val
   * @param {string} unidad - 'm³/metro' | 'm³/kg'
   */
  function fmtCE(val, unidad) {
    if (val == null) return '—';
    return val.toFixed(2) + ' m³/' + unidad;
  }

  /**
   * Formatea un costo específico en ARS con USD debajo.
   * @param {number|null} ars
   * @param {number|null} usd
   * @param {string} unidad
   */
  function fmtCSE(ars, usd, unidad) {
    if (ars == null) return { ars: '—', usd: '—' };
    return {
      ars: `$ ${Fmt.num(ars, 2)} ARS/${unidad}`,
      usd: `${usd.toFixed(3)} USD/${unidad}`,
    };
  }

  // ── API PÚBLICA ──────────────────────────────────────────────────────────────

  return {
    SECTOR,
    EQUIPO_ESTAMPADO,
    EQUIPOS_CALDERA,
    calcGasSectores,
    calcProduccion,
    calcIndicadores,
    calcKpi,
    calcTendencia,
    getMesesDisponibles,
    getDiasDisponibles,
    getLastMes,
    fmtCE,
    fmtCSE,
  };

})();
