/**
 * js/data/offlineQueue.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cola de sincronización offline · Colortex SA · Matriz Energética
 *
 * Cuando SharePoint no está disponible, guarda las operaciones en una cola
 * persistida en localStorage. Cuando vuelve la conexión, las sincroniza
 * automáticamente en orden FIFO sin intervención del usuario.
 *
 * Integración: SPRepository llama a OfflineQueue.enqueue() cuando detecta
 * que SP no está disponible, y OfflineQueue.sync() se llama periódicamente.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const OfflineQueue = (() => {

  const STORAGE_KEY = 'CX_OFFLINE_QUEUE_v1';
  const MAX_ITEMS   = 500;
  const SYNC_INTERVAL_MS = 30000; // verificar cada 30 segundos

  let _syncing    = false;
  let _timer      = null;
  let _onStatusChange = null; // callback para actualizar UI

  // ── PERSISTENCIA ─────────────────────────────────────────────────────────────

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function _save(queue) {
    try {
      // Limitar tamaño máximo
      const q = queue.slice(-MAX_ITEMS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
    } catch (e) {
      console.warn('[OfflineQueue] No se pudo guardar la cola:', e.message);
    }
  }

  // ── API DE COLA ───────────────────────────────────────────────────────────────

  /**
   * Agrega una operación a la cola offline.
   * @param {string} tipo    - 'PROD' | 'DIST' | 'LECT' | 'EE_TRAFOS' | 'PROD_IND' | 'EE_COMP' | 'EE_AGUA'
   * @param {Object} payload - Datos a sincronizar
   */
  function enqueue(tipo, payload) {
    const queue = _load();
    queue.push({
      id:        Date.now() + '_' + Math.random().toString(36).slice(2,6),
      tipo,
      payload,
      ts:        new Date().toISOString(),
      intentos:  0,
      error:     null,
    });
    _save(queue);
    _notifyStatus();
    console.log(`[OfflineQueue] Encolado: ${tipo} — total: ${queue.length}`);
  }

  /**
   * Devuelve el número de items pendientes en la cola.
   */
  function count() {
    return _load().length;
  }

  /**
   * Devuelve todos los items de la cola.
   */
  function getAll() {
    return _load();
  }

  /**
   * Elimina un item de la cola por ID.
   */
  function remove(id) {
    const queue = _load().filter(i => i.id !== id);
    _save(queue);
  }

  /**
   * Limpia toda la cola (usar con cuidado).
   */
  function clear() {
    localStorage.removeItem(STORAGE_KEY);
    _notifyStatus();
  }

  // ── SINCRONIZACIÓN ────────────────────────────────────────────────────────────

  /**
   * Sincroniza la cola con SharePoint.
   * Procesa los items en orden FIFO, con máximo 3 intentos por item.
   * @returns {Promise<{ok: number, err: number}>}
   */
  async function sync() {
    if (_syncing) return { ok: 0, err: 0 };

    const queue = _load();
    if (!queue.length) return { ok: 0, err: 0 };

    // Verificar conexión antes de intentar
    const online = await SP.checkConnection();
    if (!online) return { ok: 0, err: 0 };

    _syncing = true;
    let ok = 0, err = 0;

    console.log(`[OfflineQueue] Sincronizando ${queue.length} items...`);
    UI.notify(`🔄 Sincronizando ${queue.length} registros pendientes...`, '', 4000);

    for (const item of queue) {
      try {
        await _procesarItem(item);
        remove(item.id);
        ok++;
      } catch (e) {
        item.intentos = (item.intentos || 0) + 1;
        item.error    = e.message;

        if (item.intentos >= 3) {
          // Descartar después de 3 intentos fallidos
          console.error(`[OfflineQueue] Descartando item ${item.id} tras 3 intentos:`, e);
          remove(item.id);
          err++;
        } else {
          // Actualizar con contador de intentos
          const q = _load();
          const idx = q.findIndex(i => i.id === item.id);
          if (idx >= 0) { q[idx] = item; _save(q); }
          err++;
        }
      }

      // Pequeña pausa entre items para no saturar SP
      await new Promise(r => setTimeout(r, 200));
    }

    _syncing = false;
    _notifyStatus();

    const remaining = count();
    if (ok > 0) {
      UI.notify(
        `✓ Sincronización completa — ${ok} registros guardados${err ? ` · ${err} errores` : ''}${remaining ? ` · ${remaining} pendientes` : ''}`,
        err ? '' : '',
        5000
      );
    }

    console.log(`[OfflineQueue] Sync completado — OK: ${ok} / ERR: ${err} / Pendientes: ${remaining}`);
    return { ok, err };
  }

  /**
   * Procesa un item individual según su tipo.
   */
  async function _procesarItem(item) {
    const p = item.payload;

    switch (item.tipo) {
      case 'PROD':
        await SP.createItem('GN_Produccion', p);
        break;

      case 'DIST':
        // Upsert: buscar si ya existe para esa fecha
        const existing = await SP.getItems('GN_Distribuidora', {
          filter: `Fecha eq '${p.Fecha}'`, select: 'Id', top: 1,
        });
        if (existing.length > 0) {
          await SP.updateItem('GN_Distribuidora', existing[0].Id, p);
        } else {
          await SP.createItem('GN_Distribuidora', p);
        }
        break;

      case 'LECT':
        await SP.createItem('GN_Lecturas', p);
        break;

      case 'EE_TRAFOS': {
        const ex = await SP.getItems('EE_Trafos', {
          filter: `Mes eq '${p.Mes}'`, select: 'Id', top: 1,
        });
        if (ex.length > 0) {
          await SP.updateItem('EE_Trafos', ex[0].Id, p);
        } else {
          await SP.createItem('EE_Trafos', p);
        }
        break;
      }

      case 'PROD_IND': {
        const ex2 = await SP.getItems('Prod_Indicadores', {
          filter: `Fecha eq '${p.Fecha}'`, select: 'Id', top: 1,
        });
        if (ex2.length > 0) {
          await SP.updateItem('Prod_Indicadores', ex2[0].Id, p);
        } else {
          await SP.createItem('Prod_Indicadores', p);
        }
        break;
      }

      case 'EE_COMP':
        await SP.createItem('EE_Compresores', p);
        break;

      case 'EE_AGUA': {
        const ex3 = await SP.getItems('EE_Agua', {
          filter: `Mes eq '${p.Mes}' and Pozo eq '${p.Pozo}'`, select: 'Id', top: 1,
        });
        if (ex3.length > 0) {
          await SP.updateItem('EE_Agua', ex3[0].Id, p);
        } else {
          await SP.createItem('EE_Agua', p);
        }
        break;
      }

      case 'AUDIT':
        await SP.createItem('Auditoria', p);
        break;

      default:
        throw new Error(`Tipo desconocido: ${item.tipo}`);
    }
  }

  // ── SINCRONIZACIÓN AUTOMÁTICA ─────────────────────────────────────────────────

  /**
   * Inicia la sincronización automática periódica.
   */
  function startAutoSync() {
    if (_timer) return;
    _timer = setInterval(async () => {
      if (count() > 0) {
        const online = await SP.checkConnection();
        if (online) await sync();
      }
    }, SYNC_INTERVAL_MS);
    console.log('[OfflineQueue] Auto-sync iniciado (cada 30s)');
  }

  function stopAutoSync() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  // ── NOTIFICACIÓN DE ESTADO ────────────────────────────────────────────────────

  function onStatusChange(cb) {
    _onStatusChange = cb;
  }

  function _notifyStatus() {
    if (typeof _onStatusChange === 'function') {
      _onStatusChange(count());
    }
    // Actualizar badge en sidebar si existe
    _updateSidebarBadge();
  }

  function _updateSidebarBadge() {
    const badge = document.getElementById('sb-sync-badge');
    const n = count();
    if (badge) {
      badge.textContent = n > 0 ? n : '';
      badge.style.display = n > 0 ? 'inline-flex' : 'none';
    }
    // Actualizar indicador de estado SP en topbar
    const spEl = document.getElementById('tb-sp-status');
    if (spEl && n > 0) {
      spEl.className = 'tb-sp-loading';
      spEl.title = `${n} registros pendientes de sincronizar`;
    }
  }

  // ── API PÚBLICA ───────────────────────────────────────────────────────────────

  return {
    enqueue,
    count,
    getAll,
    remove,
    clear,
    sync,
    startAutoSync,
    stopAutoSync,
    onStatusChange,
  };

})();
