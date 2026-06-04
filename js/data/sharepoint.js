/**
 * js/data/sharepoint.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Capa de acceso a SharePoint REST API — Colortex SA · Matriz Energética
 *
 * Responsabilidades:
 *   · Obtener y renovar el FormDigest (token CSRF) automáticamente
 *   · CRUD sobre listas SharePoint (GET, POST, MERGE, DELETE)
 *   · Caché local en memoria (60s) para lecturas del dashboard
 *   · Escritura optimista — UI actualiza inmediato, SP en background
 *   · Retry automático en caso de token expirado (1 reintento)
 *
 * Dependencias: ninguna (módulo autónomo)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const SP = (() => {

  const SITE = 'https://karatex.sharepoint.com/sites/MatrizEnergeticaIntegrada';
  const API  = `${SITE}/_api/web/lists/getbytitle`;

  // ── TOKEN CSRF ───────────────────────────────────────────────────────────────
  let _token    = null;
  let _tokenExp = 0;  // timestamp de expiración

  async function getToken() {
    const now = Date.now();
    if (_token && now < _tokenExp) return _token;

    const r = await fetch(`${SITE}/_api/contextinfo`, {
      method:  'POST',
      headers: { 'Accept': 'application/json;odata=verbose' },
      credentials: 'include',
    });
    if (!r.ok) throw new Error(`Token fetch failed: ${r.status}`);
    const d = await r.json();
    _token    = d.d.GetContextWebInformation.FormDigestValue;
    _tokenExp = now + 25 * 60 * 1000; // 25 min (expira a los 30)
    return _token;
  }

  // ── CACHÉ EN MEMORIA ─────────────────────────────────────────────────────────
  const _cache    = {};
  const CACHE_TTL = 60 * 1000; // 60 segundos

  function _cacheGet(key) {
    const e = _cache[key];
    if (!e) return null;
    if (Date.now() > e.exp) { delete _cache[key]; return null; }
    return e.data;
  }

  function _cacheSet(key, data) {
    _cache[key] = { data, exp: Date.now() + CACHE_TTL };
  }

  function _cacheInvalidate(lista) {
    Object.keys(_cache).forEach(k => { if (k.startsWith(lista)) delete _cache[k]; });
  }

  // ── HEADERS ──────────────────────────────────────────────────────────────────

  async function _readHeaders() {
    return {
      'Accept':       'application/json;odata=verbose',
      'Content-Type': 'application/json;odata=verbose',
      credentials:    'include',
    };
  }

  async function _writeHeaders() {
    const token = await getToken();
    return {
      'Accept':          'application/json;odata=verbose',
      'Content-Type':    'application/json;odata=verbose',
      'X-RequestDigest': token,
      credentials:       'include',
    };
  }

  // ── GET — leer ítems de una lista ────────────────────────────────────────────

  /**
   * Lee ítems de una lista con filtro OData opcional.
   * @param {string} lista   - Nombre de la lista SharePoint
   * @param {Object} opts    - { filter, select, orderby, top, skip }
   * @returns {Promise<Array>} array de ítems
   */
  async function getItems(lista, opts = {}) {
    const cacheKey = `${lista}::${JSON.stringify(opts)}`;
    const cached = _cacheGet(cacheKey);
    if (cached) return cached;

    let url = `${API}('${lista}')/items?`;
    if (opts.filter)  url += `$filter=${encodeURIComponent(opts.filter)}&`;
    if (opts.select)  url += `$select=${opts.select}&`;
    if (opts.orderby) url += `$orderby=${opts.orderby}&`;
    url += `$top=${opts.top || 5000}`;
    if (opts.skip)    url += `&$skip=${opts.skip}`;

    const headers = await _readHeaders();
    const r = await fetch(url, { headers, credentials: 'include' });
    if (!r.ok) throw new Error(`GET ${lista} failed: ${r.status}`);

    const d = await r.json();
    const items = d.d?.results || [];
    _cacheSet(cacheKey, items);
    return items;
  }

  /**
   * Lee TODOS los ítems paginando de a 5000 (para listas grandes).
   */
  async function getAllItems(lista, opts = {}) {
    let all = [];
    let skip = 0;
    while (true) {
      const batch = await getItems(lista, { ...opts, top: 5000, skip });
      all = all.concat(batch);
      if (batch.length < 5000) break;
      skip += 5000;
    }
    return all;
  }

  // ── POST — crear ítem ────────────────────────────────────────────────────────

  /**
   * Crea un ítem en una lista.
   * @param {string} lista  - Nombre de la lista
   * @param {Object} data   - Campos del ítem (sin __metadata)
   * @returns {Promise<Object>} ítem creado con ID asignado por SP
   */
  async function createItem(lista, data) {
    const headers = await _writeHeaders();
    const body = {
      '__metadata': { 'type': `SP.Data.${lista}ListItem` },
      ...data,
    };

    const r = await fetch(`${API}('${lista}')/items`, {
      method:  'POST',
      headers,
      body:    JSON.stringify(body),
      credentials: 'include',
    });

    if (r.status === 403) {
      // Token expirado — refrescar y reintentar
      _token = null;
      return createItem(lista, data);
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(`POST ${lista} failed: ${r.status} — ${err?.error?.message?.value || ''}`);
    }

    _cacheInvalidate(lista);
    const d = await r.json();
    return d.d;
  }

  // ── MERGE — actualizar ítem ──────────────────────────────────────────────────

  /**
   * Actualiza un ítem existente (solo los campos pasados).
   * @param {string} lista - Nombre de la lista
   * @param {number} id    - ID del ítem en SharePoint
   * @param {Object} data  - Campos a actualizar
   */
  async function updateItem(lista, id, data) {
    const headers = await _writeHeaders();
    const body = {
      '__metadata': { 'type': `SP.Data.${lista}ListItem` },
      ...data,
    };

    const r = await fetch(`${API}('${lista}')/items(${id})`, {
      method:  'POST',
      headers: { ...headers, 'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*' },
      body:    JSON.stringify(body),
      credentials: 'include',
    });

    if (r.status === 403) { _token = null; return updateItem(lista, id, data); }
    if (!r.ok && r.status !== 204) {
      const err = await r.json().catch(() => ({}));
      throw new Error(`MERGE ${lista}(${id}) failed: ${r.status} — ${err?.error?.message?.value || ''}`);
    }

    _cacheInvalidate(lista);
    return true;
  }

  // ── DELETE — eliminar ítem ───────────────────────────────────────────────────

  async function deleteItem(lista, id) {
    const headers = await _writeHeaders();
    const r = await fetch(`${API}('${lista}')/items(${id})`, {
      method:  'POST',
      headers: { ...headers, 'X-HTTP-Method': 'DELETE', 'IF-MATCH': '*' },
      credentials: 'include',
    });
    if (!r.ok && r.status !== 204) throw new Error(`DELETE ${lista}(${id}) failed: ${r.status}`);
    _cacheInvalidate(lista);
    return true;
  }

  // ── UPSERT — crear o actualizar por campo clave ──────────────────────────────

  /**
   * Crea un ítem si no existe, o actualiza si ya existe.
   * @param {string} lista      - Nombre de la lista
   * @param {string} campoLlave - Campo para buscar duplicado (ej: "Fecha", "Mes")
   * @param {string} valorLlave - Valor del campo clave
   * @param {Object} data       - Datos completos del ítem
   */
  async function upsertItem(lista, campoLlave, valorLlave, data) {
    // Buscar ítem existente
    let filterVal = valorLlave;
    // Para fechas: buscar por valor ISO
    const existing = await getItems(lista, {
      filter:  `${campoLlave} eq '${filterVal}'`,
      select:  'Id',
      top:     1,
    });

    if (existing.length > 0) {
      return updateItem(lista, existing[0].Id, data);
    } else {
      return createItem(lista, data);
    }
  }

  // ── HELPERS DE FORMATO ───────────────────────────────────────────────────────

  /**
   * Convierte fecha ISO YYYY-MM-DD a formato SP DateTime.
   */
  function toSPDate(isoDate) {
    if (!isoDate) return null;
    return isoDate.length === 10 ? isoDate + 'T00:00:00Z' : isoDate;
  }

  /**
   * Convierte SP DateTime a fecha ISO YYYY-MM-DD.
   */
  function fromSPDate(spDate) {
    if (!spDate) return '';
    return spDate.slice(0, 10);
  }

  /**
   * Timestamp actual en ISO para auditoría.
   */
  function nowISO() {
    return new Date().toISOString();
  }

  // ── VERIFICACIÓN DE CONEXIÓN ─────────────────────────────────────────────────

  /**
   * Verifica que la sesión SharePoint esté activa.
   * @returns {Promise<boolean>}
   */
  async function checkConnection() {
    try {
      await getToken();
      return true;
    } catch (e) {
      console.warn('[SP] Sin conexión a SharePoint:', e.message);
      return false;
    }
  }

  // ── API PÚBLICA ──────────────────────────────────────────────────────────────

  return {
    SITE,
    getItems,
    getAllItems,
    createItem,
    updateItem,
    deleteItem,
    upsertItem,
    toSPDate,
    fromSPDate,
    nowISO,
    checkConnection,
    invalidateCache: _cacheInvalidate,
  };

})();
