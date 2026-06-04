/**
 * js/engines/SyncEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Motor de Sincronización — Colortex SA · Matriz Energética
 *
 * Estrategia: archivo db.sync.json en el servidor actúa como fuente compartida.
 * Polling cada 30s para detectar cambios de otros usuarios.
 * En entorno local (localhost) usa localStorage como fallback.
 *
 * Merge optimista: los cambios locales tienen prioridad sobre los remotos
 * para el mismo registro (última escritura gana por timestamp).
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const SyncEngine = (() => {

  const SYNC_URL      = 'db.sync.json';
  const POLL_INTERVAL = 30000; // 30 segundos
  let   _pollTimer    = null;
  let   _lastSyncTs   = null;
  let   _syncEnabled  = false;
  let   _onConflict   = null;

  // ── DETECCIÓN DE ENTORNO ───────────────────────────────────────────────────

  function isLocalhost() {
    return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  }

  // ── LECTURA DEL ARCHIVO COMPARTIDO ────────────────────────────────────────

  async function fetchShared() {
    try {
      const r = await fetch(SYNC_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return null;
      const data = await r.json();
      return data;
    } catch(e) {
      return null;
    }
  }

  // ── ESCRITURA EN EL ARCHIVO COMPARTIDO ────────────────────────────────────
  // Requiere que IIS tenga WebDAV o un endpoint PUT habilitado.
  // En entorno local guarda en localStorage como simulación.

  async function pushShared(db) {
    const payload = {
      version:     'CX_ME_v1',
      lastWrite:   new Date().toISOString(),
      lastUser:    AppState.currentUser?.label || '—',
      db,
    };

    if (isLocalhost()) {
      // Modo local: guardar en localStorage con clave compartida simulada
      localStorage.setItem('CX_SYNC_SHARED', JSON.stringify(payload));
      return true;
    }

    try {
      const r = await fetch(SYNC_URL, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      return r.ok;
    } catch(e) {
      console.warn('[SyncEngine] No se pudo escribir en el servidor:', e.message);
      return false;
    }
  }

  // ── LECTURA LOCAL (localhost fallback) ────────────────────────────────────

  function readLocal() {
    try {
      const raw = localStorage.getItem('CX_SYNC_SHARED');
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  // ── MERGE DE DATOS ────────────────────────────────────────────────────────
  // Fusiona los registros remotos con los locales.
  // Lógica: si un registro existe en ambos, gana el que tenga mayor timestamp.
  // Si solo existe en uno, se agrega.

  function mergeDb(local, remote) {
    const merged = { ...local };

    ['prod', 'dist', 'lect'].forEach(tabla => {
      const localArr  = local[tabla]  || [];
      const remoteArr = remote[tabla] || [];
      const byId      = {};

      // Indexar locales
      localArr.forEach(r => { byId[r.i || r.id || r.f] = r; });

      // Fusionar remotos — si tiene timestamp mayor o no existe localmente, usar remoto
      remoteArr.forEach(r => {
        const key = r.i || r.id || r.f;
        const loc = byId[key];
        if (!loc) {
          byId[key] = r; // nuevo registro remoto
        } else if (r._ts && loc._ts && r._ts > loc._ts) {
          byId[key] = r; // remoto más reciente
        }
        // si local es más reciente o igual, mantener local
      });

      merged[tabla] = Object.values(byId);
    });

    // Equipos siempre desde local (no se sincronizan)
    merged.equipos     = local.equipos;
    merged.planHistory = [...(local.planHistory||[]), ...(remote.planHistory||[])
      .filter(rh => !(local.planHistory||[]).find(lh => lh.id === rh.id))];

    return merged;
  }

  // ── CICLO DE POLLING ──────────────────────────────────────────────────────

  async function poll() {
    const shared = isLocalhost() ? readLocal() : await fetchShared();
    if (!shared) return;

    // Si no cambió desde la última sincronización, ignorar
    if (shared.lastWrite === _lastSyncTs) return;
    _lastSyncTs = shared.lastWrite;

    // Comparar tamaños para detectar cambios relevantes
    const localProd  = AppState.db.prod.length;
    const remoteProd = shared.db?.prod?.length || 0;

    if (remoteProd === localProd) return; // sin cambios relevantes

    // Merge y aplicar
    const merged = mergeDb(AppState.db, shared.db || {});
    const added  = remoteProd - localProd;

    // Actualizar estado local con datos mergeados
    AppState.applySync(merged);

    // Notificar al usuario
    if (added > 0) {
      UI.notify(
        `↻ Sincronizado — ${added} registro(s) nuevo(s) de otro usuario · ${new Date(shared.lastWrite).toLocaleTimeString('es-AR')} · ${shared.lastUser}`,
        'warn', 5000
      );
    }
  }

  // ── API PÚBLICA ───────────────────────────────────────────────────────────

  /**
   * Inicia el motor de sincronización.
   */
  function start() {
    if (_syncEnabled) return;
    _syncEnabled = true;
    poll(); // primer check inmediato
    _pollTimer = setInterval(poll, POLL_INTERVAL);
    console.log('[SyncEngine] Polling iniciado cada', POLL_INTERVAL/1000, 's');
  }

  /**
   * Detiene el polling.
   */
  function stop() {
    _syncEnabled = false;
    clearInterval(_pollTimer);
  }

  /**
   * Llama a push después de cada guardado para actualizar el archivo compartido.
   */
  async function push() {
    const ok = await pushShared(AppState.db);
    if (!ok) console.warn('[SyncEngine] Push fallido — datos solo en localStorage');
    return ok;
  }

  /**
   * Fuerza una sincronización inmediata.
   */
  async function syncNow() {
    await poll();
    await push();
  }

  return { start, stop, push, syncNow };

})();
