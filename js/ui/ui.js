/**
 * js/ui/ui.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo UI — Colortex SA · Matriz Energética
 *
 * Funciones de interfaz desacopladas de la lógica de negocio:
 *   · Notificaciones toast
 *   · Toggle de tema
 *   · Actualización del topbar
 *   · Opciones de Chart.js para tema actual
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const UI = (() => {

  // ── NOTIFICACIONES TOAST ───────────────────────────────────────────────────

  let _notifTimer = null;

  /**
   * Muestra una notificación toast.
   * @param {string}  msg  - Mensaje (acepta HTML simple)
   * @param {string}  [type] - '' | 'err'
   * @param {number}  [duration=3000]
   */
  function notify(msg, type = '', duration = 3500) {
    const el = document.getElementById('notif');
    if (!el) return;
    // Icono según tipo
    const icon = type === 'err' ? '✕' : type === 'warn' ? '⚠' : '✓';
    const iconStyle = type === 'err'
      ? 'background:var(--red);color:#fff'
      : type === 'warn'
        ? 'background:var(--orange);color:#fff'
        : 'background:var(--green);color:#fff';
    el.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;
      width:20px;height:20px;border-radius:50%;font-size:11px;font-weight:700;
      margin-right:8px;flex-shrink:0;${iconStyle}">${icon}</span>${msg}`;
    el.className = `notif show${type ? ' ' + type : ''}`;
    clearTimeout(_notifTimer);
    _notifTimer = setTimeout(() => { el.className = 'notif'; }, duration);
  }

  /**
   * Notificación de guardado exitoso con detalles del registro.
   * @param {string} entidad - 'Producción' | 'Distribuidora' | 'Lectura' | etc.
   * @param {Object} detalles - { fecha, equipo, valor, unidad }
   */
  function notifyGuardado(entidad, detalles = {}) {
    const ts  = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const det = detalles.fecha ? ` · ${Fmt.date(detalles.fecha)}` : '';
    const eq  = detalles.equipo ? ` · ${detalles.equipo}` : '';
    const val = detalles.valor !== undefined ? ` · ${Fmt.num(detalles.valor, detalles.decimals||0)} ${detalles.unidad||''}` : '';
    notify(`<strong>${entidad} guardado</strong>${det}${eq}${val}<span style="opacity:.6;margin-left:8px;font-size:10px">${ts}</span>`, '', 4000);
  }

  // ── TEMA VISUAL ────────────────────────────────────────────────────────────

  /**
   * Alterna entre tema oscuro y claro.
   */
  function toggleTheme() {
    const isDark = AppState.toggleDarkMode();
    document.body.classList.toggle('light', !isDark);
  }

  /**
   * Aplica el tema guardado en AppState al arranque.
   */
  function applyTheme() {
    document.body.classList.toggle('light', !AppState.darkMode);
  }

  // ── TOPBAR ─────────────────────────────────────────────────────────────────

  /**
   * Actualiza los valores del topbar (día, volumen disponible, consumido, alerta).
   * Se llama después de cualquier cambio en datos o filtros.
   */
  function updateTopbar() {
    // Fecha de referencia: última fecha con datos
    const ldf = Repository.getLastProdDate();
    const ld  = Repository.getDistForDate(ldf);

    // Consumo intradiario (avance del día corriente)
    const dispObj = EnergyEngine.getDisponibleActual(ld, ldf, true);

    // Elementos DOM
    const elDia   = document.getElementById('tb-dia');
    const elDisp  = document.getElementById('tb-vdisp');
    const elCons  = document.getElementById('tb-vcons');
    const elRest  = document.getElementById('tb-rest');

    if (elDia)  elDia.textContent  = ldf ? Fmt.date(ldf) : '—';
    if (elDisp) elDisp.textContent = ldf ? `${Fmt.num(dispObj.disp)} m³` : '—';
    if (elCons) elCons.textContent = ldf ? `${Fmt.num(dispObj.cons)} m³` : '—';

    if (elRest) {
      elRest.classList.toggle('show', dispObj.hayRest);
    }

    // Color disponible: verde si > 20% del límite, naranja si < 20%, rojo si < 0
    if (elDisp && dispObj.limOper > 0) {
      const pctDisp = dispObj.disp / dispObj.limOper * 100;
      elDisp.style.color = pctDisp > 20
        ? 'var(--accent)'
        : pctDisp > 5
          ? 'var(--orange)'
          : 'var(--red)';
      elDisp.style.borderColor = elDisp.style.color;
    }
  }

  // ── CHART OPTIONS FACTORY ──────────────────────────────────────────────────

  /**
   * Genera opciones base de Chart.js respetando el tema activo.
   * @param {string} unit   - Unidad del eje Y (ej: 'm³')
   * @param {boolean} legend - Mostrar leyenda
   * @returns {Object} opciones Chart.js
   */
  function mkChartOpts(unit, legend = false) {
    const dark   = AppState.darkMode;
    const tc     = dark ? '#7a84a0' : '#6a74a0';
    const gc     = dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)';
    const legC   = dark ? '#a0a9c4' : '#3a4468';
    const ttBg   = dark ? '#1a1f2e' : '#fff';
    const ttBord = dark ? '#3a4462' : '#c5cedf';
    const ttTit  = dark ? '#e8ecf4' : '#1a2035';

    return {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: !!legend,
          labels: { color: legC, font: { family: 'Calibri', size: 12 } },
        },
        tooltip: {
          backgroundColor: ttBg,
          borderColor: ttBord,
          borderWidth: 1,
          titleColor: ttTit,
          bodyColor: legC,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${Fmt.num(ctx.raw)} ${unit}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: tc, font: { family: 'Calibri', size: 11 } },
          grid:  { color: gc },
        },
        y: {
          ticks: { color: tc, font: { family: 'Calibri', size: 11 } },
          grid:  { color: gc },
          title: { display: true, text: unit, color: tc, font: { family: 'Calibri', size: 11 } },
        },
      },
    };
  }

  /**
   * Genera opciones para gráficos de barra apilada (franjas horarias).
   */
  function mkStackedChartOpts(unit) {
    const opts = mkChartOpts(unit, true);
    opts.scales.x.stacked = true;
    opts.scales.y.stacked = true;
    return opts;
  }

  // ── API PÚBLICA ──────────────────────────────────────────────────────────────
  return {
    notify,
    notifyGuardado,
    toggleTheme,
    applyTheme,
    updateTopbar,
    mkChartOpts,
    mkStackedChartOpts,
  };

})();
