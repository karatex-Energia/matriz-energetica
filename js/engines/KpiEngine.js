/**
 * js/engines/KpiEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de KPIs — Colortex SA · Matriz Energética
 *
 * Responsabilidades EXCLUSIVAS:
 *   · Cálculo de KPIs de producción (programado vs real, desvíos, nominado)
 *   · Sistema de alertas operacionales A/B/C/D
 *   · Ranking de equipos por consumo
 *   · Estadísticas acumuladas del período
 *
 * NO contiene lógica de lectura de caudalímetros ni cálculo de tarifas.
 * Dependencias: Repository, AppState, CONFIG
 *
 * CORRECCIÓN DE BUG CRÍTICO (v8 original):
 *   - consDir/consInd/consMix y ldfYM se usaban antes de ser declaradas
 *     (var hoisting silencioso). En esta versión, toda declaración
 *     precede a su uso y se usan const/let.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const KpiEngine = (() => {

  // ── CÁLCULO DE KPIs DE PRODUCCIÓN ──────────────────────────────────────────

  /**
   * Calcula KPIs principales del período/día.
   *
   * Fórmulas:
   *   cP      = Σ(consumo PROYECTADA)
   *   cR      = Σ(consumo REAL)
   *   cPcorr  = cP × (pciVigente / pciRef)      — Volumen Corregido
   *   cRcorr  = cR × (pciVigente / pciRef)
   *   nom     = ceil(cPcorr / redondeo) × redondeo  — Nominado (redondeo configurable)
   *   dA      = cR - cP                           — Desvío Absoluto
   *   dR      = (cR - cP) / cP × 100              — Desvío Relativo %
   *
   * @param {Array}  data    - Registros de producción del período
   * @param {number} [pciVig] - PCI vigente del día (kcal/m³). Default: CONFIG.energia.pciRef
   * @returns {Object} KPIs calculados
   */
  function calcKPI(data, pciVig) {
    const pciRef = CONFIG.energia.pciRef;
    const pv     = pciVig || pciRef;
    const redond = CONFIG.operativo.redondeoNom;

    const prog = data.filter(r => r.cl === 'PROYECTADA');
    const real = data.filter(r => r.cl === 'REAL');

    const cP      = prog.reduce((a, r) => a + r.c, 0);
    const cR      = real.reduce((a, r) => a + r.c, 0);
    const hsProg  = prog.reduce((a, r) => a + r.h, 0);
    const hsReal  = real.reduce((a, r) => a + r.h, 0);

    const cPcorr = cP * (pv / pciRef);
    const cRcorr = cR * (pv / pciRef);
    // Redondeo al múltiplo de CONFIG.operativo.redondeoNom superior
    const nom    = Math.ceil(cPcorr / redond) * redond;

    const dA = cR - cP;
    const dR = cP ? (cR - cP) / cP * 100 : 0;

    return { cP, cR, cPcorr, cRcorr, nom, dA, dR, hsProg, hsReal, pciV: pv };
  }

  // ── SISTEMA DE ALERTAS OPERACIONALES ───────────────────────────────────────

  /**
   * Calcula las alertas operacionales activas para el día.
   *
   * Tipos de alerta:
   *   A — Sobreconsumo: consumo > autorizado (penalización por tramos FD/ID)
   *   B — Sobreconsumo restringido: consumo > límite operativo (1.5× GNL)
   *   C — Subconsumo sin restricción: consumo < 88% del autorizado (tarifa ID)
   *   D — Subconsumo con restricción: consumo < 88% del límite restringido (tarifa ID)
   *
   * @param {Object} ld         - Registro distribuidora del día
   * @param {number} consReal   - Consumo real del día (m³)
   * @returns {Array<{tipo, msg, det, col, costo, ars_m3, usd_m3}>}
   */
  function calcAlertas(ld, consReal) {
    const alertas = [];
    const p = CONFIG.tarifas;
    const lim = CONFIG.limites;

    if (!ld || !ld.aut) return alertas;

    const aut     = ld.aut;
    const nom_    = ld.nom || aut;                    // nominado del día
    const aut_ef  = (ld.aut_rev !== undefined && ld.aut_rev !== null) ? ld.aut_rev : aut;  // aut_rev si existe
    const hayRest_= aut_ef < nom_;                    // restricción = aut < nom
    const rest    = hayRest_ ? (nom_ - aut_ef) : 0;   // rest = nom - aut (diferencia)   // rest no puede exceder aut
    const hayRest = hayRest_;
    const limOper = Math.max(0, aut_ef - rest);     // siempre >= 0 (usa aut_ef)
    const limFD   = lim.fd;                         // CONFIG.limites.fd (no hardcodeado)

    // Costo GNL derivado (sin repetir cálculos)
    const gnlUSD_m3  = p.gnlUSD * CONFIG.energia.equivMmbtu;   // USD/m³
    const gnlARS_m3  = p.gnlARS;                                 // ARS/m³
    const gnlPenARS  = gnlARS_m3 * lim.factorPenGNL;            // ARS/m³ penalizado
    const gnlPenUSD  = gnlUSD_m3 * lim.factorPenGNL;

    // ── ALERTA A: Consumo > Autorizado ────────────────────────────────────────
    // Tramo FD (consumo ≤ limFD): tarifa FD
    // Tramo ID (consumo > limFD): tarifa ID
    if (aut > 0 && consReal > aut) {
      const excTotal = consReal - aut;
      const excFD    = Math.max(0, Math.min(excTotal, Math.max(0, limFD - Math.min(aut, limFD))));
      const excID    = Math.max(0, excTotal - excFD);
      const costoA   = (excFD * p.tarFD) + (excID * p.tarID);
      const ars_m3_A = excTotal > 0 ? costoA / excTotal : 0;

      let det = `Excedente: ${Fmt.num(excTotal, 2)} m³`;
      if (excFD > 0) det += ` | FD (≤${Fmt.num(limFD, 0)} m³): ${Fmt.num(excFD, 2)} m³ × ${Fmt.arsT(p.tarFD)}/m³`;
      if (excID > 0) det += ` | ID (>${Fmt.num(limFD, 0)} m³): ${Fmt.num(excID, 2)} m³ × ${Fmt.arsT(p.tarID)}/m³`;

      alertas.push({
        tipo: 'A',
        msg:  'SOBRECONSUMO — CONSUMO SUPERA VOLUMEN AUTORIZADO',
        det,
        col:  'r',
        costo:   costoA,
        ars_m3:  ars_m3_A,
        usd_m3:  ars_m3_A / p.usd,
      });
    }

    // ── ALERTA B: Consumo > Límite restringido (penalización 1.5× GNL) ───────
    if (hayRest && consReal > limOper) {
      const excRest = consReal - limOper;
      const costoB  = excRest * gnlPenARS;
      const subB    = consReal > aut
        ? 'Consumo supera el volumen autorizado'
        : 'Consumo supera volumen restringido';

      alertas.push({
        tipo: 'B',
        msg:  `SOBRECONSUMO RESTRINGIDO — ${subB}`,
        det:  `Excedente: ${Fmt.num(excRest, 2)} m³ (consumo ${Fmt.num(consReal, 2)} m³ − lím.oper. ${Fmt.num(limOper, 2)} m³ = aut ${Fmt.num(aut, 0)} − rest ${Fmt.num(rest, 0)})` +
              ` — Penalización 1.5× GNL · ${Fmt.arsT(gnlPenARS)}/m³ (${Fmt.num(gnlPenUSD, 4)} USD/m³ · ${Fmt.num(CONFIG.energia.equivMmbtu)} MMBTU/m³)`,
        col:  'r',
        costo:   costoB,
        ars_m3:  gnlPenARS,
        usd_m3:  gnlPenUSD,
      });
    }

    // ── ALERTA C: Subconsumo sin restricción (< 88% del autorizado) ──────────
    if (!hayRest && aut > 0 && consReal < aut * lim.minConsumo) {
      const defC   = aut * lim.minConsumo - consReal;
      const costoC = defC * p.tarID;

      alertas.push({
        tipo: 'C',
        msg:  `SUBCONSUMO — POR DEBAJO DEL ${Math.round((1 - lim.minConsumo) * 100)}% DEL VOLUMEN AUTORIZADO`,
        det:  `Déficit: ${Fmt.num(defC, 2)} m³ (mín. operativo: ${Fmt.num(aut * lim.minConsumo, 0)} m³) — Tarifa ID · ${Fmt.arsT(p.tarID)}/m³ (${Fmt.num(p.tarID / p.usd, 4)} USD/m³)`,
        col:  'o',
        costo:   costoC,
        ars_m3:  p.tarID,
        usd_m3:  p.tarID / p.usd,
      });
    }

    // ── ALERTA D: Subconsumo restringido (< 88% del límite restringido) ───────
    if (hayRest && limOper > 0 && consReal < limOper * lim.minConsumo) {
      const defD   = limOper * lim.minConsumo - consReal;
      const costoD = defD * p.tarID;

      alertas.push({
        tipo: 'D',
        msg:  `SUBCONSUMO RESTRINGIDO — POR DEBAJO DEL ${Math.round((1 - lim.minConsumo) * 100)}% DEL LÍMITE RESTRINGIDO`,
        det:  `Déficit restringido: ${Fmt.num(defD, 2)} m³ (mín. oper.: ${Fmt.num(limOper * lim.minConsumo, 0)} m³) — Tarifa ID · ${Fmt.arsT(p.tarID)}/m³ (${Fmt.num(p.tarID / p.usd, 4)} USD/m³)`,
        col:  'o',
        costo:   costoD,
        ars_m3:  p.tarID,
        usd_m3:  p.tarID / p.usd,
      });
    }

    return alertas;
  }

  // ── RANKING DE EQUIPOS ──────────────────────────────────────────────────────

  /**
   * Calcula el ranking de equipos por consumo real del período activo.
   * Incluye desvío real vs programado.
   * @returns {Array<{n, prog, real, hsProg, hsReal, tipo, sec, unid, desv}>}
   */
  function calcEquiposRanking() {
    const eqMap = {};

    Repository.filterProd(r => r.cl === 'REAL').forEach(r => {
      if (!eqMap[r.eq]) eqMap[r.eq] = { prog: 0, real: 0, hsProg: 0, hsReal: 0, tipo: r.tipo, sec: r.sec };
      eqMap[r.eq].real   += r.c;
      eqMap[r.eq].hsReal += r.h || 0;
    });

    Repository.filterProd(r => r.cl === 'PROYECTADA').forEach(r => {
      if (!eqMap[r.eq]) eqMap[r.eq] = { prog: 0, real: 0, hsProg: 0, hsReal: 0, tipo: r.tipo, sec: r.sec };
      eqMap[r.eq].prog   += r.c;
      eqMap[r.eq].hsProg += r.h || 0;
    });

    return Object.entries(eqMap).map(([n, v]) => {
      const li = Repository.getEquipo(n) || {};
      return {
        n,
        prog:    v.prog,
        real:    v.real,
        hsProg:  v.hsProg,
        hsReal:  v.hsReal,
        tipo:    v.tipo,
        sec:     v.sec,
        unid:    li.unid || '',
        desv:    v.prog ? (v.real - v.prog) / v.prog * 100 : 0,
      };
    }).sort((a, b) => b.real - a.real);
  }

  // ── ESTADÍSTICAS ACUMULADAS ─────────────────────────────────────────────────

  /**
   * Calcula estadísticas históricas acumuladas (para panel de indicadores).
   * @returns {Object} stats acumuladas
   */
  function calcEstadisticasAcumuladas() {
    const allDates = [...new Set(AppState.db.prod.map(r => r.f))].sort();

    const dProgV = allDates.map(d =>
      AppState.db.prod.filter(r => r.f === d && r.cl === 'PROYECTADA').reduce((a, r) => a + r.c, 0)
    ).filter(v => v > 0);

    const dRealV = allDates.map(d =>
      AppState.db.prod.filter(r => r.f === d && r.cl === 'REAL').reduce((a, r) => a + r.c, 0)
    ).filter(v => v > 0);

    const eqActivos  = calcEquiposRanking().filter(e => e.real > 0).length;
    const totalDist  = AppState.db.dist.reduce((a, r) => a + (r.aut || 0), 0);

    return {
      allDays:   allDates.length,
      dProgMax:  dProgV.length ? Math.max(...dProgV) : 0,
      dProgMin:  dProgV.length ? Math.min(...dProgV) : 0,
      dRealMax:  dRealV.length ? Math.max(...dRealV) : 0,
      dRealMin:  dRealV.length ? Math.min(...dRealV) : 0,
      eqActivos,
      totalDist,
    };
  }

  // ── API PÚBLICA ──────────────────────────────────────────────────────────────
  return {
    calcKPI,
    calcAlertas,
    calcEquiposRanking,
    calcEstadisticasAcumuladas,
  };

})();
