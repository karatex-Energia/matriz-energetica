/**
 * js/engines/EnergyEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor Energético — Colortex SA · Matriz Energética
 *
 * Responsabilidades EXCLUSIVAS:
 *   · Cálculo de consumo real desde lecturas de caudalímetro
 *   · Cálculo de consumo intradiario (avance del ciclo en curso)
 *   · Cálculo de volumen disponible operacional
 *   · Detección de anomalías en lecturas
 *
 * NO contiene lógica tarifaria ni de KPIs de producción.
 * Dependencias: Repository, AppState, CONFIG
 *
 * Ciclo operativo: 06:00 del día anterior → 06:00 del día corriente.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const EnergyEngine = (() => {

  // ── CONSUMO REAL DESDE CAUDALÍMETRO ────────────────────────────────────────

  /**
   * Calcula el consumo real del ciclo operativo para una fecha dada.
   *
   * Ciclo: 06:00 del día anterior → 06:00 del día solicitado.
   *
   * Método:
   *   consumo = lectura_06:00_fecha - lectura_06:00_ayer
   *
   * Fallback: si no hay lectura 06:00 exacta, usa la lectura disponible
   * más cercana al cierre/inicio del ciclo.
   *
   * @param {string} fecha - ISO YYYY-MM-DD
   * @returns {number|null} m³ consumidos o null si datos insuficientes
   */
  function getConsumoRealLectura(fecha) {
    const cab = Repository.getCabLecturas();

    // Lectura base: 06:00 del día anterior (inicio del ciclo)
    const ayer = new Date(fecha + 'T12:00:00');
    ayer.setDate(ayer.getDate() - 1);
    const ayerStr = ayer.toISOString().slice(0, 10);

    // Preferir lectura 06:00 exacta del día anterior
    const base06Ayer = cab.filter(l => l.f === ayerStr && l.h === '06:00');
    let base = base06Ayer.length ? base06Ayer[base06Ayer.length - 1] : null;

    // Fallback: última lectura anterior al 06:00 de hoy
    if (!base) {
      const prev = cab.filter(l => l.f < fecha || (l.f === fecha && l.h < '06:00'));
      base = prev.length ? prev[prev.length - 1] : null;
    }

    if (!base) return null;

    // Lectura cierre: 06:00 del día solicitado
    const lectDia = cab
      .filter(l => l.f === fecha)
      .sort((a, b) => a.h < b.h ? -1 : 1);

    if (!lectDia.length) return null;

    // Preferir la lectura 06:00 del día (= cierre del ciclo completo)
    const curr06 = lectDia.filter(l => l.h === '06:00');
    // Si no hay 06:00 (día en curso), usar la última lectura disponible
    const curr = curr06.length ? curr06[0] : lectDia[lectDia.length - 1];

    const consumo = curr.c - base.c;
    // Rechazar valores negativos (inconsistencia de datos)
    return consumo >= 0 ? consumo : null;
  }

  /**
   * Calcula el consumo acumulado intradiario del ciclo en curso.
   *
   * Usado en el topbar para mostrar el avance del día operativo actual.
   * Fórmula: última_lectura_del_día - lectura_06:00_del_día
   *
   * @param {string} fecha - ISO YYYY-MM-DD
   * @returns {number|null} m³ consumidos desde 06:00 hasta última lectura disponible
   */
  function getConsumoIntradiaHoy(fecha) {
    const cab = Repository.getCabLecturas();

    // Base del ciclo: lectura 06:00 del día
    const base06 = cab.filter(l => l.f === fecha && l.h === '06:00');
    const base = base06.length ? base06[base06.length - 1] : null;
    if (!base) return null;

    // Última lectura del día (la más reciente disponible)
    const lectDia = cab
      .filter(l => l.f === fecha)
      .sort((a, b) => a.h < b.h ? 1 : -1);  // DESC

    const ultima = lectDia.length ? lectDia[0] : null;
    if (!ultima) return null;

    const cons = ultima.c - base.c;
    return cons >= 0 ? cons : 0;
  }

  /**
   * Devuelve información de la última lectura de CABINA MEDICION para una fecha.
   * @returns {Object|null} registro de lectura o null
   */
  function getLastLecturaInfo(fecha) {
    const cab = Repository.getCabLecturas()
      .filter(l => l.f === fecha)
      .sort((a, b) => a.h < b.h ? 1 : -1);
    return cab.length ? cab[0] : null;
  }

  // ── VOLUMEN DISPONIBLE OPERACIONAL ──────────────────────────────────────────

  /**
   * Calcula el volumen disponible operacional para un día dado.
   *
   * Reglas:
   *   rest    = nom - aut  (si hay restricción, 0 si no)
   *   volDisp = aut  (con restricción)  |  nom  (sin restricción)
   *   disp    = volDisp - consumo  (nunca negativo)
   *   pct     = consumo / volDisp × 100  (capped at 999%)
   *
   * Fuente de consumo:
   *   - intraday=true:  lectura actual del día (topbar)
   *   - intraday=false: consumo del ciclo completo (dashboard KPIs)
   *   - Fallback:       suma de registros REAL de producción
   *
   * @param {Object} ld       - Registro distribuidora del día
   * @param {string} fecha    - ISO YYYY-MM-DD
   * @param {boolean} intraday - true para topbar (avance en curso)
   * @returns {{disp, cons, pct, volDisp, hayRest, aut, rest, nom}}
   */
  function getDisponibleActual(ld, fecha, intraday = false) {
    if (!ld || !ld.aut) {
      return { disp: 0, cons: 0, pct: 0, volDisp: 0, hayRest: false, aut: 0, rest: 0, nom: 0 };
    }

    const aut     = (ld.aut_rev !== undefined && ld.aut_rev !== null) ? ld.aut_rev : ld.aut;  // usa aut_rev si existe
    const nom     = ld.nom || ld.aut || 0;       // nominado del día (fallback: aut original)
    const hayRest = aut < nom;                    // restricción cuando aut < nom
    const rest    = hayRest ? (nom - aut) : 0;   // rest = nom - aut
    const volDisp = aut;                          // disponible = aut efectivo

    // Determinar consumo real
    let cons = intraday
      ? getConsumoIntradiaHoy(fecha)
      : getConsumoRealLectura(fecha);

    // Fallback a suma de registros REAL si no hay lecturas
    if (cons === null) {
      cons = AppState.db.prod
        .filter(r => r.f === fecha && r.cl === 'REAL')
        .reduce((a, r) => a + r.c, 0);
    }

    const disp = Math.max(0, volDisp - cons);
    const pct  = volDisp > 0 ? Math.min(cons / volDisp * 100, 999) : 0;

    return { disp, cons, pct, volDisp, hayRest, aut, rest, nom };
  }

  // ── API PÚBLICA ──────────────────────────────────────────────────────────────
  return {
    getConsumoRealLectura,
    getConsumoIntradiaHoy,
    getLastLecturaInfo,
    getDisponibleActual,
  };

})();
