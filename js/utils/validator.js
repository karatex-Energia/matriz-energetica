/**
 * js/utils/validator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Validación centralizada de formularios · Colortex SA · Matriz Energética
 *
 * Funciones:
 *   · Resalte visual de campos inválidos
 *   · Mensajes de error claros en español
 *   · Interpretación legible de errores SharePoint
 *   · Validadores reutilizables por tipo de campo
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const Validator = (() => {

  // ── ESTILOS DE CAMPO ────────────────────────────────────────────────────────

  const CSS_ERROR = 'border-color: var(--red) !important; box-shadow: 0 0 0 2px rgba(239,68,68,.15) !important;';
  const CSS_OK    = '';

  /**
   * Marca un campo como inválido con borde rojo y mensaje.
   */
  function markError(inputId, mensaje) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.style.cssText += CSS_ERROR;
    el.setAttribute('data-error', '1');

    // Agregar o actualizar mensaje de error debajo del campo
    let errEl = document.getElementById(inputId + '-err');
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.id = inputId + '-err';
      errEl.style.cssText = 'font-size:10px;color:var(--red);margin-top:2px;font-family:var(--fontc)';
      el.parentNode?.insertBefore(errEl, el.nextSibling);
    }
    errEl.textContent = '⚠ ' + mensaje;
  }

  /**
   * Limpia el estado de error de un campo.
   */
  function clearError(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.style.borderColor = '';
    el.style.boxShadow   = '';
    el.removeAttribute('data-error');
    const errEl = document.getElementById(inputId + '-err');
    if (errEl) errEl.remove();
  }

  /**
   * Limpia todos los errores de un formulario.
   */
  function clearAll(formIds = []) {
    formIds.forEach(id => clearError(id));
  }

  /**
   * Agrega listener para limpiar error al modificar el campo.
   */
  function autoClean(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener('input', () => clearError(inputId), { once: false });
    el.addEventListener('change', () => clearError(inputId), { once: false });
  }

  // ── VALIDADORES ─────────────────────────────────────────────────────────────

  /**
   * Valida que un campo de fecha no esté vacío.
   */
  function fecha(id, label = 'la fecha') {
    const el = document.getElementById(id);
    const v  = el?.value?.trim();
    if (!v) { markError(id, `Seleccioná ${label}`); return false; }
    clearError(id); return true;
  }

  /**
   * Valida que un campo de mes (YYYY-MM) no esté vacío.
   */
  function mes(id, label = 'el mes') {
    const el = document.getElementById(id);
    const v  = el?.value?.trim();
    if (!v) { markError(id, `Seleccioná ${label}`); return false; }
    clearError(id); return true;
  }

  /**
   * Valida que un número sea >= min y <= max.
   */
  function numero(id, label, { min = 0, max = Infinity, required = false } = {}) {
    const el = document.getElementById(id);
    const v  = parseFloat(el?.value);
    if (required && (el?.value === '' || el?.value == null)) {
      markError(id, `Ingresá ${label}`); return false;
    }
    if (el?.value !== '' && isNaN(v)) {
      markError(id, `${label} debe ser un número`); return false;
    }
    if (!isNaN(v) && v < min) {
      markError(id, `${label} no puede ser menor a ${min}`); return false;
    }
    if (!isNaN(v) && v > max) {
      markError(id, `${label} no puede superar ${max}`); return false;
    }
    clearError(id); return true;
  }

  /**
   * Valida que al menos un campo de un grupo tenga valor > 0.
   */
  function alMenosUno(ids, mensaje = 'Ingresá al menos un valor') {
    const alguno = ids.some(id => {
      const v = parseFloat(document.getElementById(id)?.value);
      return !isNaN(v) && v > 0;
    });
    if (!alguno) {
      UI.notify(mensaje, 'err');
      return false;
    }
    return true;
  }

  /**
   * Valida que la suma de campos porcentuales sea 100.
   */
  function sumaCien(ids, labels = [], tolerancia = 0.5) {
    const vals  = ids.map(id => parseFloat(document.getElementById(id)?.value) || 0);
    const suma  = vals.reduce((a, v) => a + v, 0);
    if (Math.abs(suma - 100) > tolerancia) {
      ids.forEach((id, i) => markError(id, `${labels[i] || 'Valor'}: suma actual ${suma.toFixed(1)}% (debe ser 100%)`));
      UI.notify(`Los porcentajes deben sumar 100% (suma actual: ${suma.toFixed(1)}%)`, 'err');
      return false;
    }
    ids.forEach(id => clearError(id));
    return true;
  }

  /**
   * Valida horas (0-744 = máximo mes completo).
   */
  function horas(id, label) {
    return numero(id, label, { min: 0, max: 744 });
  }

  // ── ERRORES SHAREPOINT ──────────────────────────────────────────────────────

  /**
   * Traduce un error de SharePoint a un mensaje legible en español.
   * @param {Error|string|Object} err
   * @returns {string}
   */
  function spError(err) {
    if (!err) return 'Error desconocido al comunicarse con SharePoint.';

    const msg = typeof err === 'string' ? err
      : err?.message || err?.error?.message?.value || JSON.stringify(err);

    // Mapeo de errores comunes
    const traducciones = [
      [/403|Forbidden|forbidden/i,          'Sin permisos para guardar en SharePoint. Verificá que tu sesión esté activa.'],
      [/401|Unauthorized|unauthorized/i,     'Sesión SharePoint expirada. Abrí SharePoint en el navegador y volvé a intentar.'],
      [/429|throttl/i,                       'SharePoint alcanzó el límite de solicitudes. Esperá unos segundos y volvé a intentar.'],
      [/404|Not Found/i,                     'Lista de SharePoint no encontrada. Verificá que las listas estén creadas.'],
      [/500|Internal Server/i,               'Error interno de SharePoint. Intentá nuevamente en unos minutos.'],
      [/network|fetch|Failed to fetch/i,     'Error de red. Verificá tu conexión a internet.'],
      [/timeout|ETIMEDOUT/i,                 'Tiempo de espera agotado. Verificá tu conexión y volvé a intentar.'],
      [/already exists|duplicate/i,          'Ya existe un registro con esos datos para esa fecha/mes.'],
      [/token|digest|FormDigest/i,           'Token de seguridad expirado. Recargá la página.'],
      [/quota|storage/i,                     'Cuota de almacenamiento de SharePoint alcanzada.'],
    ];

    for (const [patron, traduccion] of traducciones) {
      if (patron.test(msg)) return traduccion;
    }

    // Si no se reconoce, mostrar versión acortada del error original
    return `Error SharePoint: ${msg.slice(0, 120)}${msg.length > 120 ? '...' : ''}`;
  }

  /**
   * Muestra un error de SharePoint de forma amigable.
   * @param {Error|string} err
   * @param {string} contexto - ej: 'guardar producción'
   */
  function notifySPError(err, contexto = 'guardar') {
    const msg = spError(err);
    console.error(`[SP Error - ${contexto}]:`, err);
    UI.notify(`⚠ Error al ${contexto}: ${msg}`, 'err', 8000);
  }

  // ── VALIDACIÓN COMPLETA DE FORMULARIOS ─────────────────────────────────────

  /**
   * Valida el formulario de producción diaria (formProd).
   * @returns {boolean}
   */
  function formProd(fields) {
    let ok = true;
    if (!fecha('fp-fecha', 'la fecha')) ok = false;
    if (!fields?.equipo) { markError && UI.notify('Seleccioná el equipo', 'err'); ok = false; }
    if (!numero('fp-hs', 'las horas', { min: 0, max: 24 })) ok = false;
    return ok;
  }

  /**
   * Valida el formulario de indicadores de producción.
   * @returns {boolean}
   */
  function formProdInd() {
    let ok = true;
    if (!fecha('pi-fecha', 'la fecha')) ok = false;
    // Validar rangos de cada campo si tiene valor
    const campos = [
      { id:'pi-mTint',    label:'Metros Tintorería',   max: 999999 },
      { id:'pi-mEst',     label:'Metros Estampado',    max: 999999 },
      { id:'pi-KgEnc',    label:'Kg Encolado',         max: 999999 },
      { id:'pi-PasTejPl', label:'Pasadas Tej. Planos', max: 9999999 },
      { id:'pi-PasTejTs', label:'Pasadas Tej. Toallas',max: 9999999 },
      { id:'pi-KgHil',    label:'Kg Hilandería',       max: 999999 },
      { id:'pi-mDbl',     label:'Metros Doblados',     max: 999999 },
    ];
    campos.forEach(c => {
      const el = document.getElementById(c.id);
      if (el && el.value !== '') {
        if (!numero(c.id, c.label, { min: 0, max: c.max })) ok = false;
      }
    });
    return ok;
  }

  /**
   * Valida el formulario de EE — trafos.
   * @returns {boolean}
   */
  function formEETrafos(mesId = 'ee-trafos-mes') {
    let ok = true;
    if (!mes(mesId, 'el mes')) ok = false;
    const smec = parseFloat(document.getElementById('ee-smec')?.value);
    if (document.getElementById('ee-smec')?.value !== '' && (isNaN(smec) || smec < 0)) {
      markError('ee-smec', 'Valor SMEC inválido'); ok = false;
    } else {
      clearError('ee-smec');
    }
    return ok;
  }

  /**
   * Valida el formulario de distribuidora.
   * @returns {boolean}
   */
  function formDist(fechaId = 'df-fecha') {
    let ok = true;
    if (!fecha(fechaId, 'la fecha')) ok = false;
    ['df-nom','df-aut','df-rest','df-disp','df-fact'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value !== '') {
        if (!numero(id, id.replace('df-',''), { min: 0 })) ok = false;
      }
    });
    return ok;
  }

  // ── API PÚBLICA ─────────────────────────────────────────────────────────────

  return {
    markError,
    clearError,
    clearAll,
    autoClean,
    // Validadores
    fecha,
    mes,
    numero,
    horas,
    alMenosUno,
    sumaCien,
    // SP errors
    spError,
    notifySPError,
    // Form validators
    formProd,
    formProdInd,
    formEETrafos,
    formDist,
  };

})();
