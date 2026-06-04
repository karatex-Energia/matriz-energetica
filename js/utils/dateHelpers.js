/**
 * js/utils/dateHelpers.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Utilidades de fechas y períodos — Colortex SA · Matriz Energética
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const DateHelpers = Object.freeze({

  /**
   * Calcula el número de semana ISO del año.
   */
  getWeekNum(d) {
    const onejan = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  },

  /**
   * Devuelve el lunes y domingo de la semana que contiene `d`.
   */
  getWeekRange(d) {
    const off   = (d.getDay() + 6) % 7;
    const start = new Date(d); start.setDate(d.getDate() - off);
    const end   = new Date(start); end.setDate(start.getDate() + 6);
    return { start, end };
  },

  /**
   * Genera los 7 días de una semana a partir de su lunes.
   * @returns {string[]} Array de ISO dates
   */
  getWeekDates(mondayDate) {
    const dates = [];
    const wd = new Date(mondayDate);
    for (let i = 0; i < 7; i++) {
      dates.push(wd.toISOString().slice(0, 10));
      wd.setDate(wd.getDate() + 1);
    }
    return dates;
  },

  /**
   * Construye las opciones HTML para el selector de semanas.
   */
  buildWeekOpts(sd) {
    const dates = [...new Set(AppState.db.prod.map(r => r.f))].sort();
    const seen  = {};
    const wn    = this.getWeekNum(sd);

    return dates.map(d => {
      const dt = new Date(d + 'T12:00:00');
      const w  = this.getWeekNum(dt);
      const yr = dt.getFullYear();
      const k  = `${yr}-${w}`;
      if (seen[k]) return '';
      seen[k] = 1;
      const sel = (w === wn && yr === sd.getFullYear()) ? ' selected' : '';
      return `<option value="${d}"${sel}>S${w} ${yr}</option>`;
    }).filter(Boolean).join('');
  },

  /**
   * Construye las opciones HTML para el selector de meses.
   */
  buildMonthOpts(selY, selM) {
    const ym  = [...new Set(AppState.db.prod.map(r => r.f.slice(0, 7)))].sort();
    const mn  = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    return ym.map(s => {
      const y = +s.slice(0, 4), m = +s.slice(5, 7) - 1;
      const sel = (y === selY && m === selM) ? ' selected' : '';
      return `<option value="${s}-01"${sel}>${mn[m]} ${y}</option>`;
    }).join('');
  },

  /**
   * Construye las opciones HTML para el selector de años.
   */
  buildYearOpts(selY) {
    return [...new Set(AppState.db.prod.map(r => r.f.slice(0, 4)))]
      .sort()
      .map(y => `<option${y === String(selY) ? ' selected' : ''}>${y}</option>`)
      .join('');
  },

  /**
   * Navega el período en la dirección dada.
   * @param {string} period - 'week' | 'month' | 'year'
   * @param {number} dir    - +1 / -1
   * @param {string} base   - Fecha base ISO
   * @returns {string} nueva fecha ISO
   */
  navPeriod(period, dir, base) {
    const d = new Date((base || new Date().toISOString().slice(0, 10)) + 'T12:00:00');
    if (period === 'week')  d.setDate(d.getDate() + dir * 7);
    if (period === 'month') d.setMonth(d.getMonth() + dir);
    if (period === 'year')  d.setFullYear(d.getFullYear() + dir);
    return d.toISOString().slice(0, 10);
  },

  /**
   * Etiqueta de semana legible: "S19 (12/05–18/05)".
   */
  weekLabel(sd) {
    const wn = this.getWeekNum(sd);
    const { start, end } = this.getWeekRange(sd);
    return `S${wn} (${start.getDate()}/${start.getMonth()+1}–${end.getDate()}/${end.getMonth()+1})`;
  },

});
