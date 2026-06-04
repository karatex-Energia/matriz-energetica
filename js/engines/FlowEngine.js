/**
 * js/engines/FlowEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de Flujo Operativo — Colortex SA · Matriz Energética
 *
 * Gestiona la completitud de datos por día operativo, respetando:
 *   · Datos de disponibilidad inmediata (responsabilidad interna)
 *   · Datos de disponibilidad diferida (externos, D+1)
 *   · Secuencia de etapas por área responsable
 *   · Trazabilidad de modificaciones del plan
 *
 * ESTADOS DE UN DÍA OPERATIVO:
 *   sin_datos            → Sin ningún registro
 *   planificado          → Producción cargó PROYECTADA
 *   nominacion_disp      → + OfiTec cargó lectura 06:00 + PCI
 *   produccion_real      → + PCP cargó horas REAL de todos los equipos
 *   datos_ext_completos  → + OfiTec cargó aut > 0
 *   cerrado              → Todas las condiciones anteriores
 *
 * DIFERIMIENTO:
 *   aut del día D → no genera alerta hasta D+1 (disponibilidad externa)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const FlowEngine = (() => {

  // ── HELPERS ─────────────────────────────────────────────────────────────────

  function hoy() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDays(fecha, n) {
    const d = new Date(fecha + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function fechaVencimientoAut(fecha) {
    // El autorizado del día D se espera para D+1
    return addDays(fecha, 1);
  }

  function autDiferido(fecha) {
    // true si el aut de este día todavía no venció (aún es D o antes)
    return hoy() < fechaVencimientoAut(fecha);
  }

  // ── EVALUACIÓN DE UN DÍA ────────────────────────────────────────────────────

  /**
   * Evalúa el estado de completitud de un día operativo.
   * @param {string} fecha - YYYY-MM-DD
   * @returns {DayStatus}
   */
  function getDayStatus(fecha) {
    const db   = AppState.db;
    const proy = db.prod.filter(r => r.f === fecha && r.cl === 'PROYECTADA');
    const real = db.prod.filter(r => r.f === fecha && r.cl === 'REAL');
    const dist = db.dist.find(r => r.f === fecha) || null;
    const lect = db.lect.filter(r => r.f === fecha && r.ub === 'CABINA MEDICION' && r.c > 0);
    const lect06 = lect.find(l => l.h === '06:00');

    // ── Etapa 1: Planificación (Producción)
    const etapa1 = {
      nombre:      'Planificación',
      area:        'produccion',
      completa:    proy.length > 0,
      pendientes:  proy.length === 0 ? ['Sin equipos programados'] : [],
    };

    // ── Etapa 2: Nominación (OfiTec — inmediata)
    const sinLect06  = !lect06;
    const sinPci     = !dist || !dist.pci || dist.pci === 0;
    const etapa2Pend = [];
    if (sinLect06) etapa2Pend.push('Lectura caudalímetro 06:00');
    if (sinPci)    etapa2Pend.push('PCI vigente');

    const etapa2 = {
      nombre:     'Nominación',
      area:       'ofitec',
      completa:   etapa1.completa && etapa2Pend.length === 0,
      pendientes: etapa2Pend,
    };

    // ── Etapa 3: Producción Real (PCP)
    const eqsProg      = proy.map(r => r.eq);
    const eqsConReal   = real.map(r => r.eq);
    const eqsSinReal   = eqsProg.filter(eq => !eqsConReal.includes(eq));
    // Equipos agregados por PCP (no estaban en la planificación original)
    const eqsAgregados = real.filter(r => !eqsProg.includes(r.eq)).map(r => r.eq);

    const etapa3 = {
      nombre:       'Producción Real',
      area:         'pcp',
      completa:     etapa2.completa && eqsProg.length > 0 && eqsSinReal.length === 0,
      pendientes:   eqsSinReal.map(eq => `Hs reales pendientes: ${eq}`),
      eqsSinReal,
      eqsAgregados,
    };

    // ── Etapa 4: Datos externos (OfiTec — diferida)
    const autEf      = (dist && dist.aut_rev !== undefined) ? dist.aut_rev : (dist?.aut || 0);
    const sinAut     = autEf === 0;
    const diferido   = sinAut && autDiferido(fecha);  // todavía en plazo

    const etapa4 = {
      nombre:    'Datos externos',
      area:      'ofitec',
      completa:  !sinAut,
      diferido,
      pendientes: sinAut && !diferido ? ['Volumen autorizado (vencido)'] :
                  sinAut &&  diferido ? ['Volumen autorizado (pendiente diferido D+1)'] : [],
    };

    // ── Estado global
    let estado = 'sin_datos';
    if (etapa1.completa) estado = 'planificado';
    if (etapa2.completa) estado = 'nominacion_disp';
    if (etapa3.completa) estado = 'produccion_real';
    if (etapa3.completa && etapa4.completa) estado = 'cerrado';
    // Si solo falta el dato diferido, el día sigue siendo "produccion_real" no "bloqueado"

    // ── Pendientes internos (los que SÍ bloquean)
    const pendientesInternos = [
      ...etapa1.pendientes,
      ...etapa2.pendientes,
      ...etapa3.pendientes,
      ...(etapa4.pendientes.filter(p => !p.includes('diferido'))),
    ];

    return {
      fecha,
      estado,
      etapa1, etapa2, etapa3, etapa4,
      pendientesInternos,
      bloqueante:  pendientesInternos.length > 0,
      diferido:    etapa4.diferido,
      proy:        proy.length,
      real:        real.length,
      lect:        lect.length,
      lect06:      !!lect06,
      dist,
      eqsSinReal:  etapa3.eqsSinReal,
    };
  }

  // ── DÍAS PENDIENTES ─────────────────────────────────────────────────────────

  /**
   * Devuelve todos los días con pendientes internos (excluye diferidos en plazo).
   * Usado para el panel de estado del dashboard.
   */
  function getPendingDays() {
    const fechas = [...new Set(AppState.db.prod.map(r => r.f))].sort();
    return fechas
      .map(f => getDayStatus(f))
      .filter(s => s.bloqueante);
  }

  /**
   * Devuelve el estado de los últimos N días con datos.
   */
  function getRecentDaysStatus(n = 7) {
    const fechas = [...new Set(AppState.db.prod.map(r => r.f))].sort().slice(-n);
    return fechas.map(f => getDayStatus(f));
  }

  // ── VALIDACIÓN ANTES DE GUARDAR ─────────────────────────────────────────────

  /**
   * Verifica si se puede guardar en un formulario dado.
   * Evalúa días anteriores con pendientes internos.
   *
   * @param {'prod'|'pcp'|'ofitec'} formulario
   * @param {string} fechaNueva - Fecha que se intenta guardar
   * @returns {{ ok: boolean, bloqueadoPor: Array<DayStatus> }}
   */
  function canSave(formulario, fechaNueva) {
    const fechas = [...new Set(AppState.db.prod.map(r => r.f))].sort();
    const anterior = fechas.filter(f => f < fechaNueva);

    // Días anteriores con pendientes según el formulario actual
    const bloqueadoPor = anterior
      .map(f => getDayStatus(f))
      .filter(s => {
        if (!s.bloqueante) return false;
        // Filtrar por área responsable del formulario
        if (formulario === 'prod') {
          return s.etapa1.pendientes.length > 0;
        }
        if (formulario === 'pcp') {
          return s.etapa3.pendientes.length > 0;
        }
        if (formulario === 'ofitec') {
          // OfiTec es responsable de etapa2 (inmediata) y etapa4 (diferida vencida)
          const pend2 = s.etapa2.pendientes.length > 0;
          const pend4 = s.etapa4.pendientes.filter(p => !p.includes('diferido')).length > 0;
          return pend2 || pend4;
        }
        return false;
      });

    return {
      ok:          bloqueadoPor.length === 0,
      bloqueadoPor,
    };
  }

  // ── TRAZABILIDAD DE PLAN PCP ─────────────────────────────────────────────────

  /**
   * Guarda una modificación del plan con trazabilidad completa.
   * Preserva el plan original en db.planHistory.
   *
   * Tipos de modificación:
   *   'hs_real'    → actualización de horas reales
   *   'agregar'    → equipo no planificado incorporado
   *   'excluir'    → equipo planificado que no operó (h=0)
   *   'corregir'   → cambio en planificación PROYECTADA
   */
  function savePcpModification(fecha, equipo, tipo, datosNuevos, datosOriginales) {
    const user = AppState.currentUser;
    const entry = {
      id:        Date.now(),
      fecha,
      equipo,
      tipo,
      ts:        new Date().toISOString(),
      usuario:   user?.u || 'pcp',
      label:     user?.label || 'PCP',
      original:  datosOriginales || null,
      nuevo:     datosNuevos,
    };

    AppState.addPlanHistory(entry);
    AppState.addAudit('PCP_MOD',
      `[${tipo.toUpperCase()}] ${equipo} / ${fecha} — ${JSON.stringify(datosNuevos)} (usuario: ${entry.label})`
    );

    return entry;
  }

  // ── LABELS Y COLORES ────────────────────────────────────────────────────────

  const ESTADO_META = {
    sin_datos:          { label: 'SIN DATOS',        color: 'var(--text3)',   bg: 'rgba(100,100,100,.1)'  },
    planificado:        { label: 'PLANIFICADO',       color: 'var(--accent)',  bg: 'rgba(45,126,247,.1)'   },
    nominacion_disp:    { label: 'NOM. DISPONIBLE',   color: '#06b6d4',        bg: 'rgba(6,182,212,.1)'    },
    produccion_real:    { label: 'PROD. REAL',        color: 'var(--green)',   bg: 'rgba(34,197,94,.1)'    },
    datos_ext_completos:{ label: 'DATOS EXT. OK',     color: 'var(--green)',   bg: 'rgba(34,197,94,.12)'   },
    cerrado:            { label: 'CERRADO ✓',         color: '#ffffff',        bg: 'rgba(34,197,94,.35)'   },
  };

  function getEstadoMeta(estado) {
    return ESTADO_META[estado] || ESTADO_META.sin_datos;
  }

  // ── API PÚBLICA ──────────────────────────────────────────────────────────────

  return {
    getDayStatus,
    getPendingDays,
    getRecentDaysStatus,
    canSave,
    savePcpModification,
    getEstadoMeta,
    hoy,
    addDays,
  };

})();
