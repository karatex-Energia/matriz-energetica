/**
 * js/utils/formatters.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Utilidades de formato — Colortex SA · Matriz Energética
 *
 * Funciones de formateo de números, fechas y valores monetarios.
 * Sin dependencias externas. Expone el objeto global `Fmt`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const Fmt = Object.freeze({

  /**
   * Formatea un número con separador de miles (locale es-AR).
   * @param {number|null} n - Valor a formatear
   * @param {number} [d=0]  - Decimales
   * @returns {string}
   */
  num(n, d = 0) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return (+n).toLocaleString('es-AR', {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  },

  /**
   * Formatea como ARS con símbolo HTML (span).
   */
  ars(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return `<span class="ars-sym">ARS</span>${this.num(n, 2)}`;
  },

  /**
   * Formatea como USD con símbolo HTML (span).
   */
  usd(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return `<span class="usd-sym">USD</span>${this.num(n, 2)}`;
  },

  /**
   * Formatea ARS como texto plano (sin HTML). Útil para tooltips.
   */
  arsT(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return `ARS ${this.num(n, 0)}`;
  },

  /**
   * Formatea una fecha ISO a formato legible (ej: "Lun 21/05/2026").
   */
  date(iso) {
    if (!iso) return '—';
    const p    = iso.split('-');
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dt   = new Date(+p[0], +p[1] - 1, +p[2]);
    return `${dias[dt.getDay()]} ${p[2]}/${p[1]}/${p[0]}`;
  },

  /**
   * Formatea fecha a DD/MM (para ejes de gráficos).
   */
  dateShort(iso) {
    if (!iso) return '';
    const p = iso.split('-');
    return `${p[2]}/${p[1]}`;
  },

});
