/**
 * js/data/repository.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Repositorio de datos — Colortex SA · Matriz Energética
 *
 * Capa de acceso a datos: todas las consultas y filtros sobre DB.
 * NO contiene lógica de negocio energética ni de costos.
 * NO modifica el estado — solo lee.
 *
 * Dependencias: AppState (estado), CONFIG (constantes)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const Repository = (() => {

  // ── PRODUCCIÓN ──────────────────────────────────────────────────────────────

  /**
   * Devuelve la última fecha con registros de producción.
   * @returns {string} ISO YYYY-MM-DD o ''
   */
  function getLastProdDate() {
    const dates = [...new Set(AppState.db.prod.map(r => r.f))].sort();
    return dates[dates.length - 1] || '';
  }

  /**
   * Filtra registros de producción según los filtros activos en AppState.
   * @param {Function} [extraFilter] - Función adicional de filtrado (r => bool)
   * @returns {Array} registros filtrados
   */
  function filterProd(extraFilter) {
    const FIL = AppState.filtros;
    let data = AppState.db.prod;

    if (FIL.period === 'day' && FIL.f) {
      data = data.filter(r => r.f === FIL.f);

    } else if (FIL.period === 'week' && FIL.f) {
      const sd  = new Date(FIL.f + 'T12:00:00');
      const off = (sd.getDay() + 6) % 7;
      const wm  = new Date(sd); wm.setDate(sd.getDate() - off);
      const we  = new Date(wm); we.setDate(wm.getDate() + 6);
      const a = wm.toISOString().slice(0, 10);
      const b = we.toISOString().slice(0, 10);
      data = data.filter(r => r.f >= a && r.f <= b);

    } else if (FIL.period === 'month' && FIL.f) {
      const ym = FIL.f.slice(0, 7);
      data = data.filter(r => r.f.slice(0, 7) === ym);

    } else if (FIL.period === 'year' && FIL.f) {
      const yr = FIL.f.slice(0, 4);
      data = data.filter(r => r.f.slice(0, 4) === yr);
    }

    if (FIL.sec)  data = data.filter(r => r.sec  === FIL.sec);
    if (FIL.tipo) data = data.filter(r => r.tipo  === FIL.tipo);
    if (extraFilter) data = data.filter(extraFilter);

    return data;
  }

  /**
   * Devuelve registros de producción filtrados para una fecha específica.
   */
  function getProdForDate(fecha) {
    return AppState.db.prod.filter(r => r.f === fecha);
  }

  /**
   * Devuelve los registros de producción PROYECTADA del día sin par REAL.
   * Usado por formPCP para saber qué equipos necesitan horas reales.
   */
  function getProdSinReal(fecha) {
    const proy = AppState.db.prod.filter(r => r.f === fecha && r.cl === 'PROYECTADA');
    const real = AppState.db.prod.filter(r => r.f === fecha && r.cl === 'REAL').map(r => r.eq);
    return proy.filter(r => !real.includes(r.eq));
  }

  // ── DISTRIBUIDORA ───────────────────────────────────────────────────────────

  /**
   * Obtiene el registro de distribuidora para una fecha.
   * Si no existe exacto, retrocede al último registro con aut > 0.
   * @param {string} fecha - ISO YYYY-MM-DD
   * @returns {Object} registro de distribuidora
   */
  /**
   * Calcula el autorizado efectivo del día:
   * usa aut_rev si existe, sino aut original.
   */
  function autEfectivo(ld) {
    if (!ld) return 0;
    return (ld.aut_rev !== undefined && ld.aut_rev !== null) ? ld.aut_rev : (ld.aut || 0);
  }

  function getDistForDate(fecha) {
    const exact = AppState.db.dist.filter(r => r.f === fecha && r.aut > 0);
    if (exact.length) return exact[0];
    const earlier = AppState.db.dist
      .filter(r => r.f <= fecha && r.aut > 0)
      .sort((a, b) => b.f.localeCompare(a.f));
    return earlier[0] || { f: fecha, nom: 0, aut: 0, rest: 0, disp: 0, fact: 0, pci: CONFIG.energia.pciRef, obs: '' };
  }

  // ── LECTURAS CAUDALÍMETRO ───────────────────────────────────────────────────

  /**
   * Devuelve las lecturas válidas de CABINA MEDICION, filtradas por anomalías.
   * Anomalía: lectura < (mediana × umbral) indica otro caudalímetro u error.
   * @returns {Array} lecturas ordenadas por fecha/hora ASC
   */
  function getCabLecturas() {
    const all = AppState.db.lect
      .filter(l => l.ub === 'CABINA MEDICION' && l.c > 0)
      .sort((a, b) => {
        if (a.f !== b.f) return a.f < b.f ? -1 : 1;
        return a.h < b.h ? -1 : 1;
      });

    if (!all.length) return [];

    // Calcular mediana para detección de anomalías
    const vals = all.map(l => l.c).sort((a, b) => a - b);
    const mediana = vals[Math.floor(vals.length / 2)];
    const umbral  = mediana * CONFIG.operativo.umbralAnomalia;

    return all.filter(l => l.c >= umbral);
  }

  /**
   * Devuelve las últimas N lecturas (cualquier ubicación), ordenadas DESC.
   */
  function getRecentLecturas(n = 15) {
    return AppState.db.lect
      .slice()
      .sort((a, b) => b.f.localeCompare(a.f) || b.h.localeCompare(a.h))
      .slice(0, n);
  }

  // ── EQUIPOS ─────────────────────────────────────────────────────────────────

  /**
   * Busca un equipo por nombre en la lista de equipos.
   */
  function getEquipo(nombre) {
    return AppState.db.equipos.find(e => e.n === nombre) || null;
  }

  /**
   * Devuelve todos los equipos.
   */
  function getAllEquipos() {
    return AppState.db.equipos;
  }

  // ── STATUS DE DÍAS ──────────────────────────────────────────────────────────

  /**
   * Genera el estado de completitud de cada día registrado.
   * Usado en el panel de administración.
   * @returns {Array<{f, status, issues, ...}>}
   */
  function getDiasStatus() {
    const allDates = [...new Set(AppState.db.prod.map(r => r.f))].sort();

    return allDates.map(f => {
      const proy = AppState.db.prod.filter(r => r.f === f && r.cl === 'PROYECTADA');
      const real = AppState.db.prod.filter(r => r.f === f && r.cl === 'REAL');
      const dist = AppState.db.dist.find(r => r.f === f);
      const lect = AppState.db.lect.filter(r => r.f === f && r.ub === 'CABINA MEDICION');

      const eqsConProg   = proy.map(r => r.eq);
      const eqsSinReal   = eqsConProg.filter(eq => !real.find(r => r.eq === eq));

      let status = 'completo';
      const issues = [];

      if (!proy.length) {
        status = 'sin_datos';
        issues.push('SIN PROGRAMACIÓN');
      } else if (eqsSinReal.length) {
        status = 'incompleto';
        issues.push('SIN HS REALES: ' + eqsSinReal.join(', '));
      }
      if (!dist || !dist.aut) {
        status = status === 'completo' ? 'incompleto' : status;
        issues.push('SIN DATOS DISTRIBUIDORA');
      }
      if (!lect.length) {
        status = status === 'completo' ? 'incompleto' : status;
        issues.push('SIN LECTURAS CAUDALÍMETRO');
      }

      return {
        f,
        status,
        proy:        proy.length,
        real:        real.length,
        eqsTotal:    eqsConProg.length,
        eqsSinReal:  eqsSinReal.length,
        dist,
        lect:        lect.length,
        issues,
      };
    });
  }

  // ── DATOS PARA GRÁFICOS ─────────────────────────────────────────────────────

  /**
   * Agrega consumo por fecha (PROYECTADA y REAL) para el gráfico histórico.
   * @returns {{ allDates, cProg, cReal, cLbl }}
   */
  function getChartHistoricoData() {
    const allDates = [...new Set(AppState.db.prod.map(r => r.f))].sort();
    const cProg = allDates.map(d =>
      AppState.db.prod.filter(r => r.f === d && r.cl === 'PROYECTADA').reduce((a, r) => a + r.c, 0)
    );
    const cReal = allDates.map(d =>
      AppState.db.prod.filter(r => r.f === d && r.cl === 'REAL').reduce((a, r) => a + r.c, 0)
    );
    const cLbl = allDates.map(d => { const p = d.split('-'); return p[2] + '/' + p[1]; });
    return { allDates, cProg, cReal, cLbl };
  }

  /**
   * Devuelve datos de consumo por sector para los últimos 7 días.
   * @returns {{ last7, s7L, sTint, sEnc }}
   */
  function getChartSectorData() {
    const allDates = [...new Set(AppState.db.prod.map(r => r.f))].sort();
    const last7 = allDates.slice(-7);
    const s7L   = last7.map(d => { const p = d.split('-'); return p[2] + '/' + p[1]; });
    const sTint = last7.map(d =>
      AppState.db.prod.filter(r => r.f === d && r.cl === 'REAL' && r.sec === 'TINTORERIA').reduce((a, r) => a + r.c, 0)
    );
    const sEnc  = last7.map(d =>
      AppState.db.prod.filter(r => r.f === d && r.cl === 'REAL' && r.sec === 'ENCOLADO').reduce((a, r) => a + r.c, 0)
    );
    return { last7, s7L, sTint, sEnc };
  }

  /**
   * Devuelve datos de consumo por franja horaria para una semana.
   * Usa factores de distribución de CONFIG.
   * @param {Date[]} wkDates - Array de Date de los 7 días de la semana
   * @returns {Array} datasets para Chart.js stacked bar
   */
  function getChartFranjaData(wkDates) {
    const f = CONFIG.franjas.factoresDist;
    const wkLbl = wkDates.map(d => {
      const sp = d.split('-'); return sp[2] + '/' + sp[1];
    });
    const totalDia = d => AppState.db.prod
      .filter(r => r.f === d && r.cl === 'REAL')
      .reduce((a, r) => a + r.c, 0);

    return {
      wkLbl,
      datasets: [
        { label: '06–14h', data: wkDates.map(d => totalDia(d) * f['06-14']), backgroundColor: 'rgba(6,182,212,.75)', borderWidth: .5, borderColor: 'rgba(255,255,255,.15)' },
        { label: '14–18h', data: wkDates.map(d => totalDia(d) * f['14-18']), backgroundColor: 'rgba(45,126,247,.75)',  borderWidth: .5, borderColor: 'rgba(255,255,255,.15)' },
        { label: '18–22h', data: wkDates.map(d => totalDia(d) * f['18-22']), backgroundColor: 'rgba(34,197,94,.75)',   borderWidth: .5, borderColor: 'rgba(255,255,255,.15)' },
        { label: '22–06h', data: wkDates.map(d => totalDia(d) * f['22-06']), backgroundColor: 'rgba(168,85,247,.75)', borderWidth: .5, borderColor: 'rgba(255,255,255,.15)' },
      ],
    };
  }

  // ── API PÚBLICA ──────────────────────────────────────────────────────────────
  return {
    getLastProdDate,
    filterProd,
    getProdForDate,
    autEfectivo,
    getProdSinReal,
    getDistForDate,
    getCabLecturas,
    getRecentLecturas,
    getEquipo,
    getAllEquipos,
    getDiasStatus,
    getChartHistoricoData,
    getChartSectorData,
    getChartFranjaData,
  };

})();
