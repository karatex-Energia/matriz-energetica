/**
 * js/data/spRepository.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Repositorio SharePoint — Colortex SA · Matriz Energética
 *
 * Reemplaza el localStorage de repository.js por llamadas a SharePoint.
 * Mantiene la misma interfaz pública que AppState para compatibilidad
 * con todas las vistas y engines existentes.
 *
 * Estrategia:
 *   · Al iniciar: carga datos de SP en AppState.db (caché en memoria)
 *   · Al escribir: escribe en SP + actualiza AppState.db (optimista)
 *   · Si SP falla: notifica al usuario, datos quedan en memoria (no se pierden)
 *
 * Dependencias: SP (sharepoint.js), AppState, UI
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const SPRepository = (() => {

  let _initialized = false;
  let _online      = false;

  // ── MAPEO SP → AppState ──────────────────────────────────────────────────────
  // Convierte ítem SP al formato interno del sistema

  function _spToProd(item) {
    return {
      i:    item.Id,
      f:    SP.fromSPDate(item.Fecha),
      eq:   item.Equipo   || '',
      sec:  item.Sector   || '',
      tipo: item.TipoConsumo || '',
      cl:   item.Clasificacion || '',
      cme:  item.CME      || 0,
      hs:   item.HsProg   || 0,
      hr:   item.HsReal   || 0,
      c:    item.Consumo  || 0,
      obs:  item.Observacion || '',
      _u:   item.Usuario  || '',
      _ts:  item.Timestamp || '',
      _edited: item.Editado || false,
    };
  }

  function _prodToSP(rec, usuario) {
    return {
      Fecha:         SP.toSPDate(rec.f),
      Equipo:        rec.eq   || '',
      Sector:        rec.sec  || '',
      TipoConsumo:   rec.tipo || '',
      Clasificacion: rec.cl   || '',
      CME:           rec.cme  || 0,
      HsProg:        rec.hs   || 0,
      HsReal:        rec.hr   || 0,
      Consumo:       rec.c    || 0,
      Observacion:   rec.obs  || '',
      Usuario:       usuario  || AppState.currentUser?.label || '',
      Timestamp:     SP.nowISO(),
      Editado:       rec._edited || false,
    };
  }

  function _spToDist(item) {
    return {
      i:        item.Id,
      f:        SP.fromSPDate(item.Fecha),
      nom:      item.Nominado    || 0,
      aut:      item.Autorizado  || 0,
      aut_rev:  item.AutRev      || null,
      aut_orig: item.AutOrig     || null,
      rest:     item.Restringido || 0,
      disp:     item.Disponible  || 0,
      fact:     item.Facturado   || 0,
      pci:      item.PCI         || 9300,
      obs:      item.Observacion || '',
      aut_rev_user: item.AutRevUser || '',
      aut_rev_ts:   item.AutRevTs   || '',
    };
  }

  function _distToSP(rec) {
    return {
      Fecha:        SP.toSPDate(rec.f),
      Nominado:     rec.nom  || 0,
      Autorizado:   rec.aut  || 0,
      AutRev:       rec.aut_rev  !== undefined ? rec.aut_rev  : null,
      AutOrig:      rec.aut_orig !== undefined ? rec.aut_orig : null,
      Restringido:  rec.rest || 0,
      Disponible:   rec.disp || 0,
      Facturado:    rec.fact || 0,
      PCI:          rec.pci  || 9300,
      Observacion:  rec.obs  || '',
      AutRevUser:   rec.aut_rev_user || '',
      AutRevTs:     rec.aut_rev_ts   ? SP.toSPDate(rec.aut_rev_ts) : null,
    };
  }

  function _spToLect(item) {
    return {
      id:  item.Id,
      f:   SP.fromSPDate(item.Fecha),
      h:   item.Hora     || '',
      ub:  item.Ubicacion || '',
      c:   item.Caudal   || 0,
      _edited: item.Editado || false,
      _u:  item.Usuario  || '',
    };
  }

  function _lectToSP(rec) {
    return {
      Fecha:     SP.toSPDate(rec.f),
      Hora:      rec.h  || '',
      Ubicacion: rec.ub || '',
      Caudal:    rec.c  || 0,
      Editado:   rec._edited || false,
      Usuario:   AppState.currentUser?.label || '',
      Timestamp: SP.nowISO(),
    };
  }

  // ── CARGA INICIAL ────────────────────────────────────────────────────────────

  /**
   * Carga todos los datos de SharePoint en AppState.db.
   * Se llama una vez al iniciar la app (reemplaza el loadJSON del boot).
   */
  async function loadAll() {
    try {
      UI.notify('Conectando a SharePoint...', '', 3000);

      // Verificar sesión
      _online = await SP.checkConnection();
      if (!_online) {
        UI.notify('⚠ Sin conexión a SharePoint — trabajando sin datos', 'err', 6000);
        return false;
      }

      // Cargar en paralelo para mayor velocidad
      const [prod, dist, lect, eeT, eeC, eeA, prodInd] = await Promise.all([
        SP.getAllItems('GN_Produccion',   { orderby: 'Fecha asc' }),
        SP.getAllItems('GN_Distribuidora', { orderby: 'Fecha asc' }),
        SP.getAllItems('GN_Lecturas',      { orderby: 'Fecha asc,Hora asc' }),
        SP.getAllItems('EE_Trafos',        { orderby: 'Mes asc' }),
        SP.getAllItems('EE_Compresores',   { orderby: 'Mes asc' }),
        SP.getAllItems('EE_Agua',          { orderby: 'Mes asc' }),
        SP.getAllItems('Prod_Indicadores', { orderby: 'Fecha asc' }),
      ]);

      // Mapear al formato interno
      AppState.db.prod = prod.map(_spToProd);
      AppState.db.dist = dist.map(_spToDist);
      AppState.db.lect = lect.map(_spToLect);

      // EE: convertir a formato db.ee_*
      AppState.db.ee_trafos = eeT.map(item => ({
        mes:        item.Mes,
        trafos: {
          'Transformador Nº 1':  item.Trafo01 || 0,
          'Transformador Nº 2':  item.Trafo02 || 0,
          'Transformador Nº 3':  item.Trafo03 || 0,
          'Transformador Nº 4':  item.Trafo04 || 0,
          'Transformador Nº 5':  item.Trafo05 || 0,
          'Transformador Nº 6':  item.Trafo06 || 0,
          'Transformador Nº 7':  item.Trafo07 || 0,
          'Transformador Nº 8':  item.Trafo08 || 0,
          'Transformador Nº 9':  item.Trafo09 || 0,
          'Transformador Nº 10': item.Trafo10 || 0,
        },
        total_kWh: item.TotalKWh || 0,
        smec_kWh:  item.SmecKWh  || null,
        _spId:     item.Id,
      }));

      // Compresores: agrupar por mes
      const compMap = {};
      eeC.forEach(item => {
        if (!compMap[item.Mes]) {
          compMap[item.Mes] = {
            mes: item.Mes,
            dias_terminado:  item.DiasTerminado  || 0,
            dias_hilanderia: item.DiasHilanderia || 0,
            caudal_dem_tej: 17, caudal_dem_term: 17, caudal_dem_hil: 17,
            pct_rendimiento: 0.75,
            compresores: {},
          };
        }
        compMap[item.Mes].compresores[item.Compresor] = {
          hs_carga: item.HsCarga    || 0,
          hs_desc:  item.HsDescarga || 0,
          _spId:    item.Id,
        };
      });
      AppState.db.ee_compresores.lecturas = Object.values(compMap);

      // Agua: agrupar por mes
      const aguaMap = {};
      eeA.forEach(item => {
        if (!aguaMap[item.Mes]) aguaMap[item.Mes] = { mes: item.Mes };
        aguaMap[item.Mes][item.Pozo + '_hs'] = item.HsMarcha || 0;
        aguaMap[item.Mes]._pctHil  = item.PctHilanderia || 0;
        aguaMap[item.Mes]._pctTej  = item.PctTejeria    || 0;
        aguaMap[item.Mes]._pctTerm = item.PctTerminado  || 0;
      });
      AppState.db.ee_agua.lecturas = Object.values(aguaMap);

      // Prod_Indicadores: guardar en db.prodIndicadores
      AppState.db.prodIndicadores = prodInd.map(item => ({
        _spId:    item.Id,
        f:        SP.fromSPDate(item.Fecha),
        mTint:    item.mTint    || 0,
        mEst:     item.mEst     || 0,
        KgEnc:    item.KgEnc    || 0,
        PasTejPl: item.PasTejPl || 0,
        PasTejTs: item.PasTejTs || 0,
        KgHil:    item.KgHil    || 0,
        mDbl:     item.mDbl     || 0,
        _u:       item.Usuario  || '',
      }));

      console.log('[SPRepository] Cargado — prod:', AppState.db.prod.length,
        'dist:', AppState.db.dist.length, 'lect:', AppState.db.lect.length);

      UI.notify(`✓ SharePoint conectado — ${AppState.db.prod.length} registros cargados`, '', 4000);
      return true;

    } catch (e) {
      console.error('[SPRepository] Error en carga inicial:', e);
      const msg = typeof Validator !== 'undefined' ? Validator.spError(e) : e.message;
      UI.notify('⚠ Error al cargar SharePoint: ' + msg, 'err', 8000);
      return false;
    }
  }

  // ── ESCRITURA — PRODUCCIÓN ───────────────────────────────────────────────────

  async function saveProdRecord(rec) {
    // Optimista: agregar a AppState inmediatamente
    if (!rec.i) {
      rec.i = Date.now(); // ID temporal hasta que SP responda
      AppState.db.prod.push(rec);
    } else {
      const idx = AppState.db.prod.findIndex(r => r.i === rec.i);
      if (idx >= 0) AppState.db.prod[idx] = rec;
    }

    try {
      const spData = _prodToSP(rec);
      if (rec._spId) {
        await SP.updateItem('GN_Produccion', rec._spId, spData);
      } else {
        const created = await SP.createItem('GN_Produccion', spData);
        // Actualizar ID real
        const idx = AppState.db.prod.findIndex(r => r.i === rec.i);
        if (idx >= 0) {
          AppState.db.prod[idx].i    = created.Id;
          AppState.db.prod[idx]._spId = created.Id;
        }
      }
      await _auditLog('PROD_SAVE', `${rec.f} · ${rec.eq} · ${rec.cl} · ${rec.c} m³`);
    } catch (e) {
      console.error('[SPRepository] Error guardando producción:', e);
      // Encolar para sync posterior
      if (typeof OfflineQueue !== 'undefined') {
        OfflineQueue.enqueue('PROD', spData);
        UI.notify('⚠ Sin conexión SP — registro encolado para sincronización automática', '', 5000);
      } else {
        if (typeof Validator !== 'undefined') Validator.notifySPError(e, 'guardar producción');
        else UI.notify('⚠ Error al guardar en SharePoint — dato en memoria', 'err', 6000);
      }
    }
  }

  // ── ESCRITURA — DISTRIBUIDORA ────────────────────────────────────────────────

  async function saveDistRecord(rec) {
    // Upsert en AppState
    const idx = AppState.db.dist.findIndex(r => r.f === rec.f);
    if (idx >= 0) Object.assign(AppState.db.dist[idx], rec);
    else AppState.db.dist.push(rec);

    try {
      const spData = _distToSP(rec);
      if (rec._spId) {
        await SP.updateItem('GN_Distribuidora', rec._spId, spData);
      } else {
        // Buscar si ya existe en SP por fecha
        const existing = await SP.getItems('GN_Distribuidora', {
          filter: `Fecha eq '${SP.toSPDate(rec.f)}'`, select: 'Id', top: 1,
        });
        if (existing.length > 0) {
          rec._spId = existing[0].Id;
          await SP.updateItem('GN_Distribuidora', rec._spId, spData);
        } else {
          const created = await SP.createItem('GN_Distribuidora', spData);
          rec._spId = created.Id;
          const i = AppState.db.dist.findIndex(r => r.f === rec.f);
          if (i >= 0) AppState.db.dist[i]._spId = created.Id;
        }
      }
      await _auditLog('DIST_SAVE', `${rec.f} · Aut: ${rec.aut} · Rest: ${rec.rest}`);
    } catch (e) {
      console.error('[SPRepository] Error guardando distribuidora:', e);
      if (typeof OfflineQueue !== 'undefined') {
        OfflineQueue.enqueue('DIST', spData);
        UI.notify('⚠ Sin conexión SP — registro encolado para sincronización automática', '', 5000);
      } else {
        if (typeof Validator !== 'undefined') Validator.notifySPError(e, 'guardar distribuidora');
        else UI.notify('⚠ Error al guardar en SharePoint — dato en memoria', 'err', 6000);
      }
    }
  }

  // ── ESCRITURA — LECTURAS ─────────────────────────────────────────────────────

  async function saveLectRecord(rec) {
    AppState.db.lect.push(rec);
    try {
      const created = await SP.createItem('GN_Lecturas', _lectToSP(rec));
      const idx = AppState.db.lect.findIndex(r => r.id === rec.id);
      if (idx >= 0) {
        AppState.db.lect[idx].id    = created.Id;
        AppState.db.lect[idx]._spId = created.Id;
      }
      await _auditLog('LECT_SAVE', `${rec.f} ${rec.h} · ${rec.ub} · ${rec.c} m³/h`);
    } catch (e) {
      console.error('[SPRepository] Error guardando lectura:', e);
      if (typeof Validator !== 'undefined') Validator.notifySPError(e, 'guardar lectura');
      else UI.notify('⚠ Error al guardar en SharePoint — dato en memoria', 'err', 6000);
    }
  }

  // ── ESCRITURA — EE TRAFOS ────────────────────────────────────────────────────

  async function saveEETrafos(mes, trafos, totalKWh, smecKWh) {
    // Actualizar AppState
    const idx = AppState.db.ee_trafos.findIndex(r => r.mes === mes);
    const rec = {
      mes,
      trafos,
      total_kWh: totalKWh,
      smec_kWh:  smecKWh,
    };
    if (idx >= 0) AppState.db.ee_trafos[idx] = { ...AppState.db.ee_trafos[idx], ...rec };
    else AppState.db.ee_trafos.push(rec);

    try {
      const spData = {
        Mes:       mes,
        Trafo01:   trafos['Transformador Nº 1']  || 0,
        Trafo02:   trafos['Transformador Nº 2']  || 0,
        Trafo03:   trafos['Transformador Nº 3']  || 0,
        Trafo04:   trafos['Transformador Nº 4']  || 0,
        Trafo05:   trafos['Transformador Nº 5']  || 0,
        Trafo06:   trafos['Transformador Nº 6']  || 0,
        Trafo07:   trafos['Transformador Nº 7']  || 0,
        Trafo08:   trafos['Transformador Nº 8']  || 0,
        Trafo09:   trafos['Transformador Nº 9']  || 0,
        Trafo10:   trafos['Transformador Nº 10'] || 0,
        TotalKWh:  totalKWh || 0,
        SmecKWh:   smecKWh  || null,
        Usuario:   AppState.currentUser?.label || '',
        Timestamp: SP.nowISO(),
      };

      const existing = AppState.db.ee_trafos.find(r => r.mes === mes)?._spId;
      if (existing) {
        await SP.updateItem('EE_Trafos', existing, spData);
      } else {
        const created = await SP.createItem('EE_Trafos', spData);
        const i = AppState.db.ee_trafos.findIndex(r => r.mes === mes);
        if (i >= 0) AppState.db.ee_trafos[i]._spId = created.Id;
      }
      await _auditLog('EE_TRAFOS', `${mes} — ${(totalKWh/1000).toFixed(1)} MWh`);
    } catch (e) {
      console.error('[SPRepository] Error guardando trafos EE:', e);
      if (typeof Validator !== 'undefined') Validator.notifySPError(e, 'guardar trafos EE');
      else UI.notify('⚠ Error al guardar en SharePoint — dato en memoria', 'err', 6000);
    }
  }

  // ── ESCRITURA — PROD INDICADORES ─────────────────────────────────────────────

  async function saveProdIndicadores(rec) {
    const idx = (AppState.db.prodIndicadores || []).findIndex(r => r.f === rec.f);
    if (!AppState.db.prodIndicadores) AppState.db.prodIndicadores = [];
    if (idx >= 0) Object.assign(AppState.db.prodIndicadores[idx], rec);
    else AppState.db.prodIndicadores.push(rec);

    try {
      const spData = {
        Fecha:    SP.toSPDate(rec.f),
        mTint:    rec.mTint    || 0,
        mEst:     rec.mEst     || 0,
        KgEnc:    rec.KgEnc    || 0,
        PasTejPl: rec.PasTejPl || 0,
        PasTejTs: rec.PasTejTs || 0,
        KgHil:    rec.KgHil    || 0,
        mDbl:     rec.mDbl     || 0,
        Usuario:  AppState.currentUser?.label || '',
        Timestamp: SP.nowISO(),
      };

      if (rec._spId) {
        await SP.updateItem('Prod_Indicadores', rec._spId, spData);
      } else {
        const existing = await SP.getItems('Prod_Indicadores', {
          filter: `Fecha eq '${SP.toSPDate(rec.f)}'`, select: 'Id', top: 1,
        });
        if (existing.length > 0) {
          rec._spId = existing[0].Id;
          await SP.updateItem('Prod_Indicadores', rec._spId, spData);
        } else {
          const created = await SP.createItem('Prod_Indicadores', spData);
          rec._spId = created.Id;
        }
      }
      await _auditLog('PROD_IND', `${rec.f} · Tint:${rec.mTint} Est:${rec.mEst} Enc:${rec.KgEnc}`);
    } catch (e) {
      console.error('[SPRepository] Error guardando indicadores:', e);
      if (typeof Validator !== 'undefined') Validator.notifySPError(e, 'guardar indicadores');
      else UI.notify('⚠ Error al guardar en SharePoint — dato en memoria', 'err', 6000);
    }
  }

  // ── AUDITORÍA ────────────────────────────────────────────────────────────────

  async function _auditLog(tipo, detalle) {
    // Agregar a memoria
    AppState.addAudit(tipo, detalle);

    // Persistir en SP en background (no bloquea)
    SP.createItem('Auditoria', {
      Tipo:      tipo,
      Detalle:   detalle,
      Usuario:   AppState.currentUser?.label || '',
      Rol:       AppState.currentUser?.role  || '',
      Timestamp: SP.nowISO(),
    }).catch(e => console.warn('[SPRepository] Audit log failed:', e.message));
  }

  // ── ESTADO DE CONEXIÓN ───────────────────────────────────────────────────────

  function isOnline() { return _online; }

  // ── API PÚBLICA ──────────────────────────────────────────────────────────────

  return {
    loadAll,
    saveProdRecord,
    saveDistRecord,
    saveLectRecord,
    saveEETrafos,
    saveProdIndicadores,
    isOnline,
  };

})();
