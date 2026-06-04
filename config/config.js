/**
 * config.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Configuración centralizada del sistema — Colortex SA · Matriz Energética
 *
 * ÚNICO LUGAR donde deben editarse:
 *   · Parámetros energéticos (PCI, equivalencias)
 *   · Tarifas y costos (FD, ID, GNL, cargos fijos)
 *   · Cotización USD/ARS
 *   · Límites operacionales
 *   · Franjas horarias y factores de distribución
 *   · Constantes del sistema
 *
 * NO mezclar lógica de negocio aquí. Solo constantes y valores configurables.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const CONFIG = Object.freeze({

  // ── SISTEMA ──────────────────────────────────────────────────────
  sistema: {
    nombre:    'Colortex SA',
    subTitulo: 'Matriz Energética Gas Natural 2026',
    version:   'v8.1',
    ciclo:     '06:00 → 06:00',   // Ciclo operativo diario (referencia)
    anio:      2026,
  },

  // ── PARÁMETROS ENERGÉTICOS ───────────────────────────────────────
  energia: {
    /**
     * PCI de referencia del gas natural (kcal/m³)
     * Usado para corrección de volúmenes nominados.
     * Fuente: ECOGAS / contrato de suministro.
     */
    pciRef: 9300,

    /**
     * Factor de equivalencia: 1 m³ GN = N MMBTU
     * Constante internacional: 1 m³ GN ≈ 0.036 MMBTU a PCI ref.
     */
    equivMmbtu: 0.036,
  },

  // ── TARIFAS (ARS por m³) ──────────────────────────────────────────
  tarifas: {
    /**
     * Tarifa FD (Firme Distribuible) — aplica hasta LIM_FD m³/día
     * = cargoM3FD / limFD = 12.500.000 / 16.000
     */
    tarFD: 781.25,

    /**
     * Tarifa ID (Interrumpible Distribuible) — aplica al excedente > LIM_FD
     * = cargoM3ID / limFD = 24.480.000 / 16.000
     */
    tarID: 1530.0,

    /**
     * Costo GN en ARS/m³ (precio promedio referencia interna)
     */
    gnARS: 42.5,

    /**
     * Costo GNL en ARS/m³ (Gas Natural Licuado — sustituto de emergencia)
     */
    gnlARS: 63.75,

    /**
     * Costo GNL en USD/MMBTU (referencia internacional)
     */
    gnlUSD: 23.712,

    /**
     * Cotización de referencia ARS/USD (actualizar mensualmente)
     */
    usd: 1460,
  },

  // ── CARGOS FIJOS MENSUALES (ARS) ─────────────────────────────────
  cargosFijos: {
    /**
     * Cargo fijo de distribución (ARS/mes)
     */
    cargoFijo: 1629426.85,

    /**
     * Cargo por reserva de capacidad FD (m³/día × 16.000 m³)
     */
    cargoReservaFD: 407590000,

    /**
     * Cargo por m³ contratados en tramo ID
     */
    cargoM3ID: 24480000,

    /**
     * Cargo por m³ contratados en tramo FD
     */
    cargoM3FD: 12500000,

    /**
     * Cargo transporte gasoducto Neuquén → Centrón (ARS/mes)
     */
    transpNQ: 30460000,

    /**
     * Cargo transporte gasoducto Norte → Centrón (ARS/mes)
     */
    transpNO: 26360000,
  },

  // ── LÍMITES OPERACIONALES ─────────────────────────────────────────
  limites: {
    /**
     * Límite de tramo FD: consumo diario hasta este valor → tarifa FD
     * Consumo diario por encima → tarifa ID
     * CRÍTICO: no hardcodear en otro lugar. Usar CONFIG.limites.fd
     */
    fd: 16000,   // m³/día

    /**
     * Umbral mínimo de consumo (% del autorizado).
     * Por debajo → alerta de subconsumo (Alertas C y D).
     * 0.88 = 88% (12% de tolerancia inferior).
     */
    minConsumo: 0.88,

    /**
     * Factor de penalización GNL por sobreconsumo restringido.
     * Penalización = consumo_excedente × tarifa_GNL × factorPen
     */
    factorPenGNL: 1.5,
  },

  // ── FRANJAS HORARIAS ──────────────────────────────────────────────
  franjas: {
    /**
     * Horas de inicio de cada turno operativo
     */
    horas: ['06:00', '14:00', '18:00', '22:00'],

    /**
     * Mapeo hora → nombre de turno
     */
    turnos: {
      '06:00': 'MAÑANA',
      '14:00': 'TARDE',
      '18:00': 'TARDE',
      '22:00': 'NOCHE',
    },

    /**
     * Factores de distribución horaria estimada del consumo diario.
     * Usados en el gráfico de franjas horarias del dashboard.
     * Deben sumar 1.0.
     * AVISO: son estimativos hasta integrar caudalímetros por turno.
     */
    factoresDist: {
      '06-14': 0.42,
      '14-18': 0.22,
      '18-22': 0.18,
      '22-06': 0.18,
    },
  },

  // ── DATOS OPERATIVOS ──────────────────────────────────────────────
  operativo: {
    /**
     * Ubicaciones de caudalímetros registradas en el sistema
     */
    ubicaciones: [
      'CABINA MEDICION',
      'CALDERA 10 Tn',
      'CALDERA 4,5 Tn',
      'ZIMMER',
      'RAMA01',
      'RAMA02',
      'RAMA03',
    ],

    /**
     * Clasificaciones de producción válidas
     */
    clasif: ['PROYECTADA', 'ESTIMADA', 'REAL'],

    /**
     * Umbral de detección de anomalías en lecturas caudalímetro.
     * Lecturas < (mediana × umbralAnomalia) se filtran como errores.
     */
    umbralAnomalia: 0.20,

    /**
     * Redondeo del volumen nominado (múltiplo de m³)
     */
    redondeoNom: 100,
  },

  // ── OBSERVACIONES PREDEFINIDAS ────────────────────────────────────
  observaciones: [
    'SIN NOVEDAD',
    'ARRANCA POR CAMBIO ESTRATEGICO DEL PLAN',
    'ARRANCA PRODUCCION EQUIPO SIN PROGRAMAR',
    'DEMORA DEL PROCESO ANTERIOR',
    'DETIENE PRODUCCION SIN CUMPLIR PROGRAMA',
    'FALTA DE HILADO',
    'FALTA DE PRODUCTO QUIMICO ENCOLADO',
    'FALTA DE PRODUCTOS QUIMICOS TINTORERIA',
    'FALTA DE TELA PARA EL PROCESO',
    'PARADA POR CAMBIO ESTRATEGICO DEL PLAN',
    'PARADA POR FALLA',
    'PARADA POR FALTA DE RECURSOS, REPUESTOS Y/O MO',
    'PARADA POR MANTENIMIENTO PROGRAMADO',
    'PARADA POR RESTRICCION DE CONSUMO ECOGAS',
    'PARADA POR ROTURA',
    'PARADA POR SOBRECONSUMO',
    'OTRAS',
  ],

  // ── USUARIOS / PERFILES ───────────────────────────────────────────
  /**
   * En una integración futura esto se reemplazará por autenticación
   * contra backend (JWT, OAuth). Por ahora: credenciales standalone.
   * NUNCA exponer este objeto en un sistema con backend real.
   */
  usuarios: {
    produccion: { pass: 'ktx-prd2026', label: 'Producción',        role: 'produccion' },
    pcp:        { pass: 'ktx-pcp2026', label: 'Oficina PCP',        role: 'pcp'        },
    ofitec:     { pass: 'ktx-tec2026', label: 'Oficina Técnica',    role: 'ofitec'     },
    jefe:       { pass: 'ktx-jre2026', label: 'Resp. de Energía',   role: 'jefe'       },
    gerencia:   { pass: 'ktx-grc2026', label: 'Gerencia',           role: 'gerencia'   },
  },

  // ── NAVEGACIÓN POR ROL ────────────────────────────────────────────
  // ── ANÁLISIS GAS VS PRODUCCIÓN ───────────────────────────────────
  gasVsProd: {
    /**
     * Eficiencia de la caldera (rendimiento térmico).
     * Rango típico: 0.75 - 0.85
     */
    eficiencia_caldera: 0.80,

    /**
     * Distribución del vapor útil de caldera entre sectores.
     * Basado en CME de equipos indirectos:
     *   Tintorería: 418 m³/h / 576 m³/h total = 72.6%
     *   Encolado:   158 m³/h / 576 m³/h total = 27.4%
     */
    pct_vapor_tint: 0.726,
    pct_vapor_enc:  0.274,
  },

  nav: {
    produccion: [
      { ic: '📊', lb: 'Dashboard',           v: 'dashboard'     },
      { ic: '🔍', lb: 'Consulta de Datos',   v: 'consulta'      },
      { ic: '📝', lb: 'Form. Producción',    v: 'form-prod'     },
      { ic: '🏭', lb: 'Carga Indicadores',   v: 'form-prod-ind' },
      { ic: '📋', lb: 'Resumen de Turno',    v: 'resumen-turno' },
    ],
    pcp: [
      { ic: '📊', lb: 'Dashboard',               v: 'dashboard'    },
      { ic: '🔍', lb: 'Consulta de Datos',       v: 'consulta'     },
      { ic: '⏱',  lb: 'Form. PCP — Hs. Reales', v: 'form-pcp'    },
      { ic: '📋', lb: 'Resumen de Turno',        v: 'resumen-turno'},
    ],
    ofitec: [
      { ic: '📊', lb: 'Dashboard',                 v: 'dashboard'    },
      { ic: '🔍', lb: 'Consulta de Datos',         v: 'consulta'     },
      { ic: '📡', lb: 'Form. Lecturas / Distrib.', v: 'form-ofitec'  },
      { ic: '⚡', lb: 'Carga EE',                  v: 'ee-form'      },
      { ic: '📋', lb: 'Resumen de Turno',          v: 'resumen-turno'},
    ],
    jefe: [
      { ic: '📊', lb: 'Dashboard',                 v: 'dashboard'          },
      { ic: '🔍', lb: 'Consulta de Datos',         v: 'consulta'           },
      { ic: '📝', lb: 'Form. Producción',          v: 'form-prod'          },
      { ic: '🏭', lb: 'Carga Indicadores',         v: 'form-prod-ind'      },
      { ic: '⏱',  lb: 'Form. PCP — Hs. Reales',  v: 'form-pcp'           },
      { ic: '📡', lb: 'Form. Lecturas / Distrib.', v: 'form-ofitec'        },
      { ic: '⚡', lb: 'Carga EE',                  v: 'ee-form'            },
      { ic: '📋', lb: 'Resumen de Turno',          v: 'resumen-turno'      },
      { ic: '🔥', lb: 'Gas vs Producción',         v: 'gvp'                },
      { ic: '⚡', lb: 'EE vs Producción',          v: 'ee-vs-prod'         },
      { ic: '🏆', lb: 'Dashboard Ejecutivo',       v: 'dashboard-ejecutivo'},
      { ic: '🔔', lb: 'Alertas',                   v: 'alertas'            },
      { ic: '⚙️', lb: 'Administración',            v: 'admin', sep: true   },
    ],
    gerencia: [
      { ic: '🏆', lb: 'Dashboard Ejecutivo',  v: 'dashboard-ejecutivo'},
      { ic: '📊', lb: 'Dashboard Gas',        v: 'dashboard'          },
      { ic: '🔥', lb: 'Gas vs Producción',    v: 'gvp'                },
      { ic: '⚡', lb: 'EE vs Producción',     v: 'ee-vs-prod'         },
      { ic: '📊', lb: 'Análisis EE',          v: 'ee-dashboard'       },
      { ic: '🔔', lb: 'Alertas',              v: 'alertas'            },
      { ic: '🔍', lb: 'Consulta de Datos',    v: 'consulta'           },
    ],
  },

});
