/**
 * js/engines/AlertEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de Alertas Configurables · Colortex SA · Matriz Energética
 *
 * Centraliza todas las alertas del sistema:
 *   · Gas Natural: restricción, subconsumo, sobreconsumo, días sin datos
 *   · EE: error de medición SMEC > umbral, días sin lecturas de trafos
 *   · Producción: CE/CSE supera umbral configurado por sector
 *   · Sistema: registros faltantes, cola offline con pendientes
 *
 * Las alertas son configurables desde CONFIG.alertas y desde la UI de Admin.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const AlertEngine = (() => {

  // ── CONFIGURACIÓN POR DEFECTO ────────────────────────────────────────────────

  function _cfg() {
    const a = (typeof CONFIG !== 'undefined' && CONFIG.alertas) ? CONFIG.alertas : {};
    return {
      // Gas Natural
      gn_dias_sin_datos:     a.gn_dias_sin_datos     ?? 1,     // días sin registros → alerta
      gn_ce_tint_max:        a.gn_ce_tint_max        ?? null,  // m³/m — null = sin límite
      gn_ce_enc_max:         a.gn_ce_enc_max         ?? null,  // m³/kg
      gn_ce_est_max:         a.gn_ce_est_max         ?? null,  // m³/m

      // EE
      ee_error_smec_max:     a.ee_error_smec_max     ?? 3.0,   // % — error medición máximo
      ee_meses_sin_datos:    a.ee_meses_sin_datos     ?? 1,    // meses sin trafos → alerta

      // Producción
      prod_dias_sin_datos:   a.prod_dias_sin_datos    ?? 2,    // días sin indicadores → alerta

      // Sistema
      queue_max:             a.queue_max              ?? 10,   // items en cola offline → alerta
    };
  }

  // ── NIVELES DE ALERTA ────────────────────────────────────────────────────────

  const NIVEL = {
    CRITICO: { id:'CRITICO', color:'#EF4444', icono:'🔴', label:'CRÍTICO' },
    ALTO:    { id:'ALTO',    color:'#F97316', icono:'🟠', label:'ALTO'    },
    MEDIO:   { id:'MEDIO',   color:'#EAB308', icono:'🟡', label:'MEDIO'   },
    INFO:    { id:'INFO',    color:'#2D7EF7', icono:'🔵', label:'INFO'    },
  };

  // ── HELPERS ──────────────────────────────────────────────────────────────────

  function _hoy()  { return new Date().toISOString().slice(0,10); }
  function _ayer() {
    const d = new Date(); d.setDate(d.getDate()-1);
    return d.toISOString().slice(0,10);
  }

  function _diasDesde(fecha) {
    if (!fecha) return 999;
    return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
  }

  // ── EVALUACIÓN DE ALERTAS ────────────────────────────────────────────────────

  /**
   * Evalúa todas las alertas configuradas y devuelve array de alertas activas.
   * @returns {Array<{id, nivel, titulo, detalle, accion}>}
   */
  function evaluar() {
    const alertas = [];
    const cfg     = _cfg();

    // ── GAS NATURAL ──────────────────────────────────────────────────────────────

    // 1. Restricción activa (heredado del sistema original)
    const dist = AppState.db.dist || [];
    const hoy  = _hoy();
    const ayer = _ayer();
    const ldHoy  = dist.find(d => d.f === hoy);
    const ldAyer = dist.find(d => d.f === ayer);
    const ldRef  = ldHoy || ldAyer;

    if (ldRef) {
      if (ldRef.rest > 0) {
        const pct = ldRef.aut > 0 ? (ldRef.rest / ldRef.aut * 100).toFixed(0) : '—';
        alertas.push({
          id:      'GN_RESTRICCION',
          nivel:   NIVEL.CRITICO,
          modulo:  'Gas Natural',
          titulo:  'Sistema opera con restricción',
          detalle: `Restringido: ${Fmt.num(ldRef.rest,0)} m³ (${pct}% del autorizado)`,
          accion:  'Revisar plan de producción y ajustar consumos',
          fecha:   ldRef.f,
        });
      }

      // 2. Sobreconsumo respecto a autorizado
      const prod = AppState.db.prod || [];
      const prodHoy = prod.filter(p => p.f === ldRef.f && p.cl === 'REAL');
      const consReal = prodHoy.reduce((a, p) => a + (p.c || 0), 0);

      if (ldRef.aut > 0 && consReal > ldRef.aut * 1.05) {
        alertas.push({
          id:      'GN_SOBRECONSUMO',
          nivel:   NIVEL.ALTO,
          modulo:  'Gas Natural',
          titulo:  'Sobreconsumo respecto al autorizado',
          detalle: `Consumo: ${Fmt.num(consReal,0)} m³ / Autorizado: ${Fmt.num(ldRef.aut,0)} m³ (+${((consReal/ldRef.aut-1)*100).toFixed(1)}%)`,
          accion:  'Verificar equipos en marcha y ajustar plan operativo',
          fecha:   ldRef.f,
        });
      }
    }

    // 3. Días sin datos de producción GN
    const prod = AppState.db.prod || [];
    if (prod.length > 0) {
      const ultFecha = prod.reduce((a, r) => r.f > a ? r.f : a, '');
      const diasSin  = _diasDesde(ultFecha);
      if (diasSin > cfg.gn_dias_sin_datos) {
        alertas.push({
          id:      'GN_SIN_DATOS',
          nivel:   diasSin > 3 ? NIVEL.ALTO : NIVEL.MEDIO,
          modulo:  'Gas Natural',
          titulo:  `Sin datos de producción hace ${diasSin} día${diasSin>1?'s':''}`,
          detalle: `Último registro: ${ultFecha || 'nunca'}`,
          accion:  'Cargar datos de producción en Formulario Producción',
          fecha:   ultFecha,
        });
      }
    } else {
      alertas.push({
        id:      'GN_SIN_DATOS_TOTAL',
        nivel:   NIVEL.INFO,
        modulo:  'Gas Natural',
        titulo:  'Sin registros de producción GN',
        detalle: 'No hay datos cargados en el sistema',
        accion:  'Comenzar a cargar datos en Formulario Producción',
      });
    }

    // 4. CE Tintorería supera umbral (si configurado y hay datos)
    if (cfg.gn_ce_tint_max) {
      const mesActual = new Date().toISOString().slice(0,7);
      const desde = mesActual + '-01';
      const hasta = mesActual + '-31';
      const gasKpi = GasVsProdEngine?.calcKpi?.(desde, hasta, null);
      if (gasKpi?.ind?.ce_tint != null && gasKpi.ind.ce_tint > cfg.gn_ce_tint_max) {
        alertas.push({
          id:      'GN_CE_TINT_ALTO',
          nivel:   NIVEL.MEDIO,
          modulo:  'Gas vs Producción',
          titulo:  'Consumo específico Tintorería supera umbral',
          detalle: `CE actual: ${gasKpi.ind.ce_tint.toFixed(3)} m³/m · Límite: ${cfg.gn_ce_tint_max} m³/m`,
          accion:  'Revisar eficiencia energética en Tintorería',
          fecha:   mesActual,
        });
      }
    }

    // ── ENERGÍA ELÉCTRICA ─────────────────────────────────────────────────────────

    // 5. Error de medición SMEC supera umbral
    const eeTrafos = AppState.db.ee_trafos || [];
    if (eeTrafos.length > 0) {
      const ultMes = eeTrafos.reduce((a, r) => r.mes > a ? r.mes : a, '');
      const kEE    = EEEngine?.calcTrafosCorregidos?.(ultMes);
      if (kEE && kEE.smec_kWh && Math.abs(kEE.pct_error) > cfg.ee_error_smec_max) {
        alertas.push({
          id:      'EE_ERROR_SMEC',
          nivel:   Math.abs(kEE.pct_error) > 5 ? NIVEL.ALTO : NIVEL.MEDIO,
          modulo:  'Energía Eléctrica',
          titulo:  `Error de medición EE supera ${cfg.ee_error_smec_max}%`,
          detalle: `Error: ${kEE.pct_error.toFixed(1)}% (${Fmt.num(kEE.error_kWh,0)} kWh) — mes ${ultMes}`,
          accion:  'Verificar calibración de medidores por trafo',
          fecha:   ultMes,
        });
      }

      // 6. Meses sin datos EE
      const mesActual = new Date().toISOString().slice(0,7);
      const hayMesActual = eeTrafos.some(r => r.mes === mesActual);
      if (!hayMesActual) {
        const mesAnterior = (() => {
          const d = new Date(); d.setMonth(d.getMonth()-1);
          return d.toISOString().slice(0,7);
        })();
        const hayAnterior = eeTrafos.some(r => r.mes === mesAnterior);
        if (!hayAnterior) {
          alertas.push({
            id:      'EE_SIN_DATOS',
            nivel:   NIVEL.MEDIO,
            modulo:  'Energía Eléctrica',
            titulo:  'Sin datos de trafos EE para el mes actual',
            detalle: `No hay lecturas de transformadores para ${mesActual}`,
            accion:  'Cargar lecturas en Carga EE → Transformadores',
            fecha:   mesActual,
          });
        }
      }
    }

    // ── PRODUCCIÓN ────────────────────────────────────────────────────────────────

    // 7. Días sin indicadores de producción
    const prodInd = AppState.db.prodIndicadores || [];
    if (prodInd.length > 0) {
      const ultFechaInd = prodInd.reduce((a, r) => r.f > a ? r.f : a, '');
      const diasSinInd  = _diasDesde(ultFechaInd);
      if (diasSinInd > cfg.prod_dias_sin_datos) {
        alertas.push({
          id:      'PROD_IND_SIN_DATOS',
          nivel:   diasSinInd > 5 ? NIVEL.ALTO : NIVEL.MEDIO,
          modulo:  'Producción',
          titulo:  `Sin indicadores de producción hace ${diasSinInd} día${diasSinInd>1?'s':''}`,
          detalle: `Último ingreso: ${ultFechaInd}. Los análisis Gas vs Prod y EE vs Prod no tienen datos.`,
          accion:  'Cargar indicadores en Carga Indicadores',
          fecha:   ultFechaInd,
        });
      }
    }

    // ── SISTEMA ───────────────────────────────────────────────────────────────────

    // 8. Cola offline con muchos pendientes
    if (typeof OfflineQueue !== 'undefined') {
      const n = OfflineQueue.count();
      if (n >= cfg.queue_max) {
        alertas.push({
          id:      'SYS_QUEUE_ALTA',
          nivel:   n > 50 ? NIVEL.ALTO : NIVEL.MEDIO,
          modulo:  'Sistema',
          titulo:  `${n} registros pendientes de sincronizar con SharePoint`,
          detalle: 'El sistema está operando sin conexión a SharePoint. Los datos están guardados localmente.',
          accion:  'Verificar conexión a internet y sincronizar desde el sidebar',
        });
      }
    }

    // Ordenar: CRITICO → ALTO → MEDIO → INFO
    const orden = { CRITICO:0, ALTO:1, MEDIO:2, INFO:3 };
    return alertas.sort((a,b) => orden[a.nivel.id] - orden[b.nivel.id]);
  }

  /**
   * Devuelve el conteo de alertas activas por nivel.
   */
  function resumen() {
    const alertas = evaluar();
    return {
      total:   alertas.length,
      critico: alertas.filter(a => a.nivel.id === 'CRITICO').length,
      alto:    alertas.filter(a => a.nivel.id === 'ALTO').length,
      medio:   alertas.filter(a => a.nivel.id === 'MEDIO').length,
      info:    alertas.filter(a => a.nivel.id === 'INFO').length,
      alertas,
    };
  }

  // ── API PÚBLICA ───────────────────────────────────────────────────────────────

  return {
    NIVEL,
    evaluar,
    resumen,
  };

})();
