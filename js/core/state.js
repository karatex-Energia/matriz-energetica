/**
 * js/core/state.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Estado global centralizado — Colortex SA · Matriz Energética
 *
 * ÚNICO objeto de estado de la aplicación. Toda mutación debe pasar por
 * los métodos de AppState. Ningún módulo externo modifica estado directamente.
 *
 * Flujo de datos:
 *   Formulario → AppState.mutate() → re-render vistas afectadas
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const AppState = (() => {

  // ── ESTADO PRIVADO ──────────────────────────────────────────────────────────
  let _state = {

    // ── BASE DE DATOS operativa ──
    db: {
      prod:        [],   // Registros de producción
      dist:        [],   // Datos distribuidora
      lect:        [],   // Lecturas caudalímetro
      equipos:     [],   // Equipos (siempre desde seed, nunca persiste)
      planHistory: [],   // Trazabilidad modificaciones PCP
      ee_trafos:     [],   // Lecturas mensuales EE por trafo
      ee_compresores: { equipos: [], lecturas: [] }, // Compresores aire comprimido
      ee_agua:       { pozos: [], distribucion: {}, lecturas: [] },
      ee_config:     {},    // Configuración trafos/sectores EE
    },

    // ── USUARIO ACTIVO ──
    currentUser: null,    // { pass, label, role }

    // ── FILTROS activos para dashboard y consulta ──
    filtros: {
      f:      '',    // fecha base (ISO YYYY-MM-DD)
      sec:    '',    // sector filtrado
      tipo:   '',    // tipo de consumo filtrado
      period: '',    // 'day' | 'week' | 'month' | 'year'
    },

    // ── VISTA ACTIVA ──
    vistaActiva: 'dashboard',

    // ── PREFERENCIAS UI ──
    darkMode: false,

    // ── AUDITORIA (en memoria, máx. 200 entradas) ──
    auditLog: [],

    // ── CHARTS ACTIVOS (para destroyChart antes de re-render) ──
    charts: {},
  };

  // ── HELPERS INTERNOS ────────────────────────────────────────────────────────

  /**
   * Guarda el estado serializable en localStorage.
   * Solo persiste: db, auditLog, darkMode.
   * Nunca persiste currentUser (sesión siempre comienza desde login).
   */
  function _persist() {
    try {
      const toSave = {
        db:       _state.db,
        auditLog: _state.auditLog,
        darkMode: _state.darkMode,
      };
      localStorage.setItem('CX_ME_STATE', JSON.stringify(toSave));
    } catch (e) {
      console.warn('[AppState] No se pudo persistir en localStorage:', e.message);
    }
  }

  /**
   * Restaura el estado desde localStorage.
   * Si no hay datos guardados, usa los datos seed cargados por DataLoader.
   */
  function _restore() {
    try {
      const raw = localStorage.getItem('CX_ME_STATE');
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (saved.db)       _state.db       = saved.db;
      if (saved.auditLog) _state.auditLog  = saved.auditLog;
      if (typeof saved.darkMode === 'boolean') _state.darkMode = saved.darkMode;
      return true;
    } catch (e) {
      console.warn('[AppState] No se pudo restaurar desde localStorage:', e.message);
      return false;
    }
  }

  // ── API PÚBLICA ──────────────────────────────────────────────────────────────
  return {

    // ────────────────────────────────────────────────────────────────
    // INICIALIZACIÓN
    // ────────────────────────────────────────────────────────────────

    /**
     * Inicializa el estado con los datasets seed.
     * Intenta restaurar desde localStorage primero.
     * @param {Object} seedData - { prod, dist, lect, equipos }
     */
    init(seedData) {
      const restored = _restore();
      if (!restored) {
        _state.db.prod = seedData.prod || [];
        _state.db.dist = seedData.dist || [];
        _state.db.lect = seedData.lect || [];
      }
      // Equipos siempre desde seed (nunca se persisten)
      _state.db.equipos = seedData.equipos || [];
      // EE: siempre desde seed JSON (no se persisten en localStorage)
      _state.db.ee_trafos      = seedData.ee_trafos      || [];
      _state.db.ee_compresores = seedData.ee_compresores || { equipos: [], lecturas: [] };
      _state.db.ee_agua        = seedData.ee_agua        || { pozos: [], distribucion: {}, lecturas: [] };
      _state.db.ee_config      = seedData.ee_config      || {};
      // planHistory siempre disponible
      if (!_state.db.planHistory) _state.db.planHistory = [];
      console.log('[AppState] Inicializado — prod:', _state.db.prod.length,
                  'dist:', _state.db.dist.length, 'lect:', _state.db.lect.length);
    },

    /**
     * Limpia el localStorage (para reset completo al cargar nuevos datos).
     */
    clearPersistence() {
      localStorage.removeItem('CX_ME_STATE');
    },

    // ────────────────────────────────────────────────────────────────
    // GETTERS — acceso de solo lectura
    // ────────────────────────────────────────────────────────────────

    get db()          { return _state.db; },
    get currentUser() { return _state.currentUser; },
    get filtros()     { return { ..._state.filtros }; },
    get vistaActiva() { return _state.vistaActiva; },
    get darkMode()    { return _state.darkMode; },
    get auditLog()    { return _state.auditLog; },
    get charts()      { return _state.charts; },

    // ────────────────────────────────────────────────────────────────
    // MUTACIONES — única forma de modificar el estado
    // ────────────────────────────────────────────────────────────────

    /**
     * Autentica al usuario.
     */
    login(user) {
      _state.currentUser = user;
    },

    /**
     * Cierra sesión. No modifica db ni filtros.
     */
    logout() {
      _state.currentUser = null;
    },

    /**
     * Actualiza uno o varios filtros del dashboard.
     * @param {Object} partial - { f, sec, tipo, period }
     */
    setFiltros(partial) {
      Object.assign(_state.filtros, partial);
    },

    /**
     * Cambia la vista activa.
     */
    setVista(vista) {
      _state.vistaActiva = vista;
    },

    /**
     * Alterna el tema visual.
     */
    toggleDarkMode() {
      _state.darkMode = !_state.darkMode;
      _persist();
      return _state.darkMode;
    },

    /**
     * Agrega un registro de producción y persiste en SharePoint.
     */
    addProdRecord(record) {
      if (typeof SPRepository !== 'undefined' && SPRepository.isOnline()) {
        SPRepository.saveProdRecord(record);
      } else {
        _state.db.prod.push(record);
        _persist();
      }
    },

    /**
     * Actualiza un registro de producción existente (por id `i`) y persiste.
     */
    updateProdRecord(id, changes) {
      const rec = _state.db.prod.find(r => r.i === id);
      if (!rec) return false;
      Object.assign(rec, changes);
      rec._edited = true;
      if (typeof SPRepository !== 'undefined' && SPRepository.isOnline()) {
        SPRepository.saveProdRecord(rec);
      } else {
        _persist();
      }
      return true;
    },

    /**
     * Guarda o actualiza datos de distribuidora para una fecha.
     */
    upsertDistRecord(record) {
      const existing = _state.db.dist.find(r => r.f === record.f);
      if (existing) {
        if (record.aut !== undefined && existing.aut !== record.aut && existing.aut_orig === undefined) {
          existing.aut_orig = existing.aut;
        }
        Object.assign(existing, record);
      } else {
        _state.db.dist.push(record);
      }
      if (typeof SPRepository !== 'undefined' && SPRepository.isOnline()) {
        SPRepository.saveDistRecord(existing || record);
      } else {
        _persist();
      }
    },

    /**
     * Agrega una entrada al historial de modificaciones del plan PCP.
     */
    addPlanHistory(entry) {
      if (!_state.db.planHistory) _state.db.planHistory = [];
      _state.db.planHistory.push(entry);
      _persist();
    },

    get planHistory() { return _state.db.planHistory || []; },

    /**
     * Exporta toda la base de datos a JSON descargable.
     * Incluye timestamp y versión para trazabilidad.
     */
    exportBackup() {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backup = {
        version:   'CX_ME_v1',
        exportado: new Date().toISOString(),
        usuario:   _state.currentUser?.label || 'desconocido',
        db:        _state.db,
        auditLog:  _state.auditLog,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `colortex_backup_${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return ts;
    },

    /**
     * Importa un backup JSON previamente exportado.
     * Valida la versión antes de restaurar.
     * @param {string} jsonText - Contenido del archivo JSON
     * @returns {{ ok: boolean, msg: string }}
     */
    /**
     * Aplica datos mergeados desde SyncEngine sin sobrescribir equipos.
     */
    applySync(mergedDb) {
      _state.db.prod        = mergedDb.prod        || _state.db.prod;
      _state.db.dist        = mergedDb.dist        || _state.db.dist;
      _state.db.lect        = mergedDb.lect        || _state.db.lect;
      _state.db.planHistory = mergedDb.planHistory || _state.db.planHistory;
      _persist();
    },

    importBackup(jsonText) {
      try {
        const data = JSON.parse(jsonText);
        if (data.version !== 'CX_ME_v1') return { ok: false, msg: 'Versión de backup incompatible.' };
        if (!data.db?.prod) return { ok: false, msg: 'Estructura de backup inválida.' };
        _state.db       = data.db;
        _state.auditLog = data.auditLog || [];
        _persist();
        return { ok: true, msg: `Backup restaurado — ${data.db.prod.length} registros de producción.` };
      } catch(e) {
        return { ok: false, msg: 'Error al leer el archivo: ' + e.message };
      }
    },

    /**
     * Actualiza solo el autorizado revisado (aut_rev) de un registro de distribuidora.
     * Preserva el aut original en aut_orig para trazabilidad.
     */
    upsertAutRev(fecha, autRev, usuario) {
      const existing = _state.db.dist.find(r => r.f === fecha);
      if (!existing) return false;
      // Guardar original la primera vez
      if (existing.aut_orig === undefined) existing.aut_orig = existing.aut;
      existing.aut_rev = autRev;
      existing.aut_rev_user = usuario || 'ofitec';
      existing.aut_rev_ts   = new Date().toISOString();
      _persist();
      return true;
    },

    /**
     * Agrega una lectura de caudalímetro y persiste.
     */
    addLectRecord(record) {
      _state.db.lect.push(record);
      _persist();
    },

    /**
     * Actualiza una lectura de caudalímetro existente.
     */
    updateLectRecord(id, valor) {
      const rec = _state.db.lect.find(r => r.id === id);
      if (!rec) return false;
      rec.c = Math.abs(+valor);
      rec._edited = true;
      _persist();
      return true;
    },

    /**
     * Actualiza los parámetros del sistema en CONFIG (no persiste al JSON).
     * Para persistencia real, requeriría backend.
     * @param {Object} params - clave/valor de CONFIG.tarifas y CONFIG.cargosFijos
     */
    updateParams(params) {
      // Shallow merge sobre las secciones modificables de CONFIG
      const editable = ['tarifas', 'cargosFijos', 'energia'];
      editable.forEach(section => {
        if (params[section]) {
          Object.assign(CONFIG[section], params[section]);
        }
      });
      // Persiste el override de params en localStorage
      try {
        localStorage.setItem('CX_ME_PARAMS', JSON.stringify(params));
      } catch(e) {}
      _persist();
    },

    /**
     * Actualiza el CME de un equipo en la lista.
     */
    updateEquipoCME(nombre, cme) {
      const eq = _state.db.equipos.find(e => e.n === nombre);
      if (eq) { eq.cme = +cme; _persist(); }
    },

    // ────────────────────────────────────────────────────────────────
    // AUDITORÍA
    // ────────────────────────────────────────────────────────────────

    /**
     * Agrega una entrada al log de auditoría.
     * @param {string} tipo - Categoría de la acción
     * @param {string} detalle - Descripción detallada
     */
    addAudit(tipo, detalle) {
      _state.auditLog.unshift({
        ts:      new Date().toLocaleString('es-AR'),
        user:    _state.currentUser ? _state.currentUser.label : '—',
        tipo,
        detalle,
      });
      if (_state.auditLog.length > 200) _state.auditLog.pop();
      // No persiste auditLog en cada entrada (performance); persiste en bulk al cerrar sesión
    },

    // ────────────────────────────────────────────────────────────────
    // CHARTS (gestión de instancias Chart.js)
    // ────────────────────────────────────────────────────────────────

    registerChart(id, instance) {
      _state.charts[id] = instance;
    },

    destroyChart(id) {
      if (_state.charts[id]) {
        _state.charts[id].destroy();
        delete _state.charts[id];
      }
    },

    destroyAllCharts() {
      Object.keys(_state.charts).forEach(id => this.destroyChart(id));
    },

    // ────────────────────────────────────────────────────────────────
    // SIGUIENTE ID disponible para registros
    // ────────────────────────────────────────────────────────────────

    nextProdId() {
      const ids = _state.db.prod.map(r => r.i);
      return ids.length ? Math.max(...ids) + 1 : 1;
    },

    nextLectId() {
      const ids = _state.db.lect.map(r => r.id);
      return ids.length ? Math.max(...ids) + 1 : 1;
    },

  };

})();
