/**
 * js/views/admin.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Vista Administración — Colortex SA · Matriz Energética
 *
 * Solo accesible por rol 'jefe'. Incluye:
 *   · Panel de completitud de registros por fecha
 *   · Edición de parámetros del sistema
 *   · Edición de CME por equipo
 *   · Edición de registros de producción históricos
 *   · Edición de datos de distribuidora
 *   · Edición de lecturas de caudalímetro
 *   · Log de auditoría
 *
 * Sin onclick inline. Toda interacción vía addEventListener.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

if (typeof Views === 'undefined') window.Views = {};

Views.Admin = (() => {

  // ── TABLA ESTADO DÍAS ─────────────────────────────────────────────────────────
  function buildDiasRows() {
    const dias = Repository.getDiasStatus();
    return dias.map(d => {
      const dot = d.status === 'completo'
        ? '<span class="complete-dot"></span>'
        : d.status === 'incompleto'
          ? '<span class="incomplete-dot"></span>'
          : '<span class="missing-dot"></span>';
      const badge = d.status === 'completo'
        ? '<span class="chip cg">COMPLETO</span>'
        : d.status === 'incompleto'
          ? '<span class="chip co">INCOMPLETO</span>'
          : '<span class="chip cgr">SIN DATOS</span>';
      const issues = d.issues.length
        ? `<div style="font-size:9.5px;color:var(--orange);margin-top:2px">${d.issues.join(' · ')}</div>`
        : '';
      return `<tr>
        <td>${dot}${Fmt.date(d.f)}</td>
        <td>${badge}${issues}</td>
        <td class="v" style="text-align:center">${d.proy}</td>
        <td class="v" style="text-align:center">${d.real}</td>
        <td class="v" style="text-align:center">${d.dist && d.dist.aut ? '<span class="chip cg">SÍ</span>' : '<span class="chip cgr">—</span>'}</td>
        <td class="v" style="text-align:center">${d.lect ? `<span class="chip cg">${d.lect}</span>` : '<span class="chip cgr">—</span>'}</td>
        <td><button class="btn-sec ad-ver-fecha" data-fecha="${d.f}" style="padding:3px 8px;font-size:10px">VER FECHA</button></td>
      </tr>`;
    }).join('');
  }

  // ── TABLA DISTRIBUIDORA ────────────────────────────────────────────────────────
  function buildDistRows() {
    return AppState.db.dist
      .slice()
      .sort((a, b) => b.f.localeCompare(a.f))
      .map(d => `<tr>
        <td>${Fmt.date(d.f)}</td>
        <td><input type="number" class="ad-dist-input" data-f="${d.f}" data-k="nom"  value="${d.nom}"  min="0" style="width:75px;padding:3px 5px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px"></td>
        <td><input type="number" class="ad-dist-input" data-f="${d.f}" data-k="aut"  value="${d.aut}"  min="0" style="width:75px;padding:3px 5px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px"></td>
        <td><input type="number" class="ad-dist-input" data-f="${d.f}" data-k="rest" value="${d.rest}" min="0" style="width:75px;padding:3px 5px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px"></td>
        <td><input type="number" class="ad-dist-input" data-f="${d.f}" data-k="fact" value="${d.fact}" min="0" style="width:75px;padding:3px 5px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px"></td>
        <td><input type="number" class="ad-dist-input" data-f="${d.f}" data-k="pci"  value="${d.pci}"  min="0" style="width:75px;padding:3px 5px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px"></td>
        <td><span class="audit-badge">${d._edited ? 'EDITADO' : '—'}</span></td>
      </tr>`)
      .join('');
  }

  // ── TABLA LECTURAS ────────────────────────────────────────────────────────────
  function buildLectRows() {
    return AppState.db.lect.slice(0, 10).map(l => `<tr>
      <td>${Fmt.date(l.f)}</td>
      <td>${l.h}</td>
      <td>${l.ub}</td>
      <td><input type="number" class="ad-lect-input" data-id="${l.id}" value="${l.c}" min="0" step="1" style="width:100px;padding:3px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--fontc);font-size:11px"></td>
      <td><span class="audit-badge" id="ad-lect-st-${l.id}">${l._edited ? 'EDITADO' : '—'}</span></td>
    </tr>`).join('');
  }

  // ── TABLA CME POR EQUIPO ─────────────────────────────────────────────────────
  function buildCmeRows() {
    return Repository.getAllEquipos().map(e => `<tr>
      <td class="v">${e.n}</td>
      <td><span class="chip ${e.sec === 'TINTORERIA' ? 'cp' : 'cg'}">${e.sec}</span></td>
      <td><span class="chip ${e.tipo === 'DIRECTO' ? 'cb' : e.tipo === 'MIXTO' ? 'co' : 'cgr'}">${e.tipo}</span></td>
      <td style="font-size:10px;color:var(--text3)">${e.unid}</td>
      <td><input type="number" class="ad-cme-input" data-eq="${e.n}" value="${e.cme}" min="1" step="1" style="width:70px;padding:3px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--fontc);font-size:11px"></td>
    </tr>`).join('');
  }

  // ── CARGAR TABLA DE EDICIÓN DE PRODUCCIÓN ────────────────────────────────────
  function loadProdEdit(fecha) {
    const rows = AppState.db.prod
      .filter(r => r.f === fecha)
      .sort((a, b) => a.cl.localeCompare(b.cl) || a.eq.localeCompare(b.eq));

    const container = document.getElementById('ad-prod-table');
    if (!container) return;

    if (!rows.length) {
      container.innerHTML = '<div style="color:var(--text3);font-family:var(--fontc);font-size:11px;padding:8px 0">Sin registros para esta fecha.</div>';
      return;
    }

    const trs = rows.map(r => {
      const cc = r.cl === 'REAL' ? 'cg' : r.cl === 'PROYECTADA' ? 'cb' : 'co';
      const ct = r.tipo === 'DIRECTO' ? 'cb' : r.tipo === 'MIXTO' ? 'co' : 'cgr';
      return `<tr>
        <td class="v">${r.eq}</td>
        <td>${r.sec}</td>
        <td><span class="chip ${ct}">${r.tipo}</span></td>
        <td><span class="chip ${cc}">${r.cl}</span></td>
        <td><input type="number" class="ad-prod-input" data-id="${r.i}" data-k="h"
          value="${r.h}" min="0" max="48" step="0.25"
          style="width:65px;padding:3px 5px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px"></td>
        <td><input type="number" class="ad-prod-input" data-id="${r.i}" data-k="cme"
          value="${r.cme}" min="0" step="1"
          style="width:55px;padding:3px 5px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px"></td>
        <td><input type="number" class="ad-prod-input" data-id="${r.i}" data-k="fc"
          value="${Fmt.num((r.fc || 1) * 100, 0)}" min="0" max="200" step="1" data-pct="1"
          style="width:50px;padding:3px 5px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px"></td>
        <td><input type="number" class="ad-prod-input" data-id="${r.i}" data-k="ef"
          value="${Fmt.num((r.ef || 1) * 100, 0)}" min="0" max="100" step="1" data-pct="1"
          style="width:50px;padding:3px 5px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px"></td>
        <td style="color:var(--green);font-weight:600;font-family:var(--fontc)" id="ad-cons-${r.i}">${Fmt.num(r.c)} m³</td>
        <td><input type="number" class="ad-prod-input" data-id="${r.i}" data-k="pci"
          value="${r.pci}" min="0" step="1"
          style="width:65px;padding:3px 5px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px"></td>
        <td><span class="audit-badge" id="ad-st-${r.i}">${r._edited ? 'EDITADO' : '—'}</span></td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="twrap">
        <table>
          <thead><tr>
            <th>EQUIPO</th><th>SECTOR</th><th>TIPO</th><th>CLASIF.</th>
            <th>HORAS</th><th>CME</th><th>FC%</th><th>EF%</th><th>CONSUMO m³</th><th>PCI</th><th>ESTADO</th>
          </tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>`;

    // Bind change en los inputs de producción
    container.querySelectorAll('.ad-prod-input').forEach(el => {
      el.addEventListener('change', () => {
        const id   = +el.dataset.id;
        const key  = el.dataset.k;
        const isPct = el.dataset.pct === '1';
        const val  = isPct ? +el.value / 100 : +el.value;

        const rec = AppState.db.prod.find(r => r.i === id);
        if (!rec) return;
        rec[key] = val;
        rec.c = Math.round(rec.cme * rec.h * (rec.fc || 1) * (rec.ef || 1) * 100) / 100;
        rec._edited = true;

        const consEl = document.getElementById(`ad-cons-${id}`);
        if (consEl) consEl.textContent = `${Fmt.num(rec.c)} m³`;
        const stEl = document.getElementById(`ad-st-${id}`);
        if (stEl) stEl.textContent = 'EDITADO';

        AppState.addAudit('ADMIN_PROD', `Editado ID ${id}: ${key}=${val}`);
      });
    });
  }

  // ── TABLA AUDITORÍA ──────────────────────────────────────────────────────────
  function buildAuditTable() {
    const logs = (AppState.db.auditLog || AppState.auditLog || []).slice().reverse().slice(0, 100);
    if (!logs.length) return `<div class="no-data-badge">Sin registros de auditoría aún</div>`;

    const filas = logs.map(l => `
      <tr>
        <td style="white-space:nowrap">${l.ts ? l.ts.slice(0,16).replace('T',' ') : '—'}</td>
        <td><span class="chip cg" style="font-size:9px">${l.tipo || '—'}</span></td>
        <td style="font-size:11px;color:var(--text2)">${l.det || l.detalle || '—'}</td>
        <td style="font-size:11px;color:var(--text3)">${l.user || l.usuario || '—'}</td>
      </tr>`).join('');

    return `
    <div class="twrap" style="max-height:300px;overflow-y:auto">
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Tipo</th>
            <th>Detalle</th>
            <th>Usuario</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
  }

  // ── RENDER PRINCIPAL ────────────────────────────────────────────────────────
  function render() {
    const cu = AppState.currentUser;
    if (!cu || cu.role !== 'jefe') {
      document.getElementById('view-admin').innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--text3)">
          ACCESO RESTRINGIDO — Solo el Responsable de Energía puede acceder a esta sección.
        </div>`;
      return;
    }

    const p  = CONFIG.tarifas;
    const cf = CONFIG.cargosFijos;
    const eq = CONFIG.energia;

    const allDates   = [...new Set(AppState.db.prod.map(r => r.f))].sort().reverse();
    const fechaOpts  = allDates.map(f => `<option value="${f}">${Fmt.date(f)}</option>`).join('');
    const auditLog   = AppState.auditLog;

    document.getElementById('view-admin').innerHTML = `
      <div class="pg-title">Administración — Responsable de Energía</div>
      <div class="pg-desc">Edición de registros históricos, parámetros del sistema y auditoría. Todos los cambios quedan registrados.</div>

      <!-- S1: Estado de registros -->
      <div class="dash-section" style="margin-bottom:10px">
        <div class="sec-hdr">
          <div class="sec-title">ESTADO DE REGISTROS POR FECHA</div>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="font-family:var(--fontc);font-size:10px;color:var(--text3)"><span class="complete-dot"></span>COMPLETO</span>
            <span style="font-family:var(--fontc);font-size:10px;color:var(--text3)"><span class="incomplete-dot"></span>INCOMPLETO</span>
            <span style="font-family:var(--fontc);font-size:10px;color:var(--text3)"><span class="missing-dot"></span>SIN DATOS</span>
          </div>
        </div>
        <div class="twrap">
          <table>
            <thead><tr><th>FECHA</th><th>ESTADO</th><th>PROG.</th><th>REAL</th><th>DISTRIB.</th><th>LECT.</th><th>ACCIÓN</th></tr></thead>
            <tbody>${buildDiasRows()}</tbody>
          </table>
        </div>
      </div>

      <!-- S2: Parámetros -->
      <div class="dash-section" style="margin-bottom:10px">
        <div class="sec-hdr"><div class="sec-title">PARÁMETROS DEL SISTEMA</div><span class="audit-badge">SOLO JEFE</span></div>
        <div class="fgrid" style="gap:10px;margin-bottom:12px">
          <div class="fgrp"><div class="flabel">PCI REFERENCIA kcal/m³</div><input type="number" class="fctl yel" id="ap-pci" value="${eq.pciRef}" step="1" min="1"></div>
          <div class="fgrp"><div class="flabel">COTIZACIÓN USD (ARS/USD)</div><input type="number" class="fctl yel" id="ap-usd" value="${p.usd}" step="1" min="1"></div>
          <div class="fgrp"><div class="flabel">CARGO FIJO ARS</div><input type="number" class="fctl yel" id="ap-cf" value="${cf.cargoFijo}" step="0.01" min="0"></div>
          <div class="fgrp"><div class="flabel">TARIFA FD ARS/m³</div><input type="number" class="fctl yel" id="ap-tarFD" value="${p.tarFD}" step="0.01" min="0"></div>
          <div class="fgrp"><div class="flabel">TARIFA ID ARS/m³</div><input type="number" class="fctl yel" id="ap-tarID" value="${p.tarID}" step="0.01" min="0"></div>
          <div class="fgrp"><div class="flabel">COSTO GN ARS/m³</div><input type="number" class="fctl yel" id="ap-gnARS" value="${p.gnARS}" step="0.01" min="0"></div>
          <div class="fgrp"><div class="flabel">COSTO GNL ARS/m³</div><input type="number" class="fctl yel" id="ap-gnlARS" value="${p.gnlARS}" step="0.01" min="0"></div>
          <div class="fgrp"><div class="flabel">COSTO GNL USD/MMBTU</div><input type="number" class="fctl yel" id="ap-gnlUSD" value="${p.gnlUSD}" step="0.001" min="0"></div>
          <div class="fgrp"><div class="flabel">EQUIV. m³ → MMBTU</div><input type="number" class="fctl yel" id="ap-equiv" value="${eq.equivMmbtu}" step="0.001" min="0"></div>
        </div>
        <div class="sec-title" style="margin:10px 0 8px">CARGOS FIJOS Y DE TRANSPORTE (ARS)</div>
        <div class="fgrid" style="gap:10px;margin-bottom:12px">
          <div class="fgrp"><div class="flabel">CARGO RESERVA FD (16.000 m³/DÍA) ARS</div><input type="number" class="fctl yel" id="ap-reservaFD" value="${cf.cargoReservaFD}" step="1" min="0"></div>
          <div class="fgrp"><div class="flabel">CARGO m³ FD ARS</div><input type="number" class="fctl yel" id="ap-cargom3FD" value="${cf.cargoM3FD}" step="1" min="0"></div>
          <div class="fgrp"><div class="flabel">CARGO m³ ID ARS</div><input type="number" class="fctl yel" id="ap-cargom3ID" value="${cf.cargoM3ID}" step="1" min="0"></div>
          <div class="fgrp"><div class="flabel">CARGO TRANSP. NEUQUÉN–CENTRÓN ARS</div><input type="number" class="fctl yel" id="ap-transpNQ" value="${cf.transpNQ}" step="1" min="0"></div>
          <div class="fgrp"><div class="flabel">CARGO TRANSP. NORTE–CENTRÓN ARS</div><input type="number" class="fctl yel" id="ap-transpNO" value="${cf.transpNO}" step="1" min="0"></div>
        </div>
        <div class="factions"><button class="btn-pri" id="ap-save">✓ GUARDAR PARÁMETROS</button></div>
      </div>

      <!-- S2b: Gas vs Producción -->
      <div class="dash-section" style="margin-bottom:10px">
        <div class="sec-hdr"><div class="sec-title">PARÁMETROS — GAS VS PRODUCCIÓN</div><span class="audit-badge">SOLO JEFE</span></div>
        <div class="fgrid" style="gap:10px;margin-bottom:8px">
          <div class="fgrp">
            <div class="flabel">EFICIENCIA CALDERA (%)</div>
            <input type="number" class="fctl yel" id="ap-ef-caldera"
              value="${((CONFIG.gasVsProd?.eficiencia_caldera||0.80)*100).toFixed(0)}"
              step="1" min="70" max="95">
            <div style="font-size:10px;color:var(--text3);margin-top:3px">Rango típico: 75 — 85%</div>
          </div>
          <div class="fgrp">
            <div class="flabel">VAPOR → TINTORERÍA (%)</div>
            <input type="number" class="fctl yel" id="ap-vapor-tint"
              value="${((CONFIG.gasVsProd?.pct_vapor_tint||0.726)*100).toFixed(1)}"
              step="0.1" min="0" max="100">
          </div>
          <div class="fgrp">
            <div class="flabel">VAPOR → ENCOLADO (% autom.)</div>
            <input type="number" class="fctl" id="ap-vapor-enc"
              value="${((CONFIG.gasVsProd?.pct_vapor_enc||0.274)*100).toFixed(1)}"
              readonly style="background:var(--bg3);color:var(--text3)">
          </div>
        </div>
        <div id="ap-gvp-check" style="font-size:11px;margin-bottom:8px;color:var(--text3)"></div>
        <div class="factions"><button class="btn-pri" id="ap-gvp-save">✓ GUARDAR GAS vs PROD</button></div>
      </div>

      <!-- S_AUDIT: Log de Auditoría -->
      <div class="dash-section" style="margin-bottom:10px">
        <div class="sec-hdr">
          <div class="sec-title">LOG DE AUDITORÍA</div>
          <button class="btn-sec" id="audit-export" style="font-size:10px;padding:4px 10px">&#11015; CSV</button>
        </div>
        <div id="audit-table-wrap">${buildAuditTable()}</div>
      </div>

      <!-- S3: CME -->
      <div class="dash-section" style="margin-bottom:10px">
        <div class="sec-hdr"><div class="sec-title">CONSUMO MEDIO ESTIMADO POR EQUIPO (m³/h)</div><span class="audit-badge">SOLO JEFE</span></div>
        <div class="twrap">
          <table>
            <thead><tr><th>EQUIPO</th><th>SECTOR</th><th>TIPO</th><th>UNIDAD PRODUCTIVA</th><th>CME m³/h</th></tr></thead>
            <tbody>${buildCmeRows()}</tbody>
          </table>
        </div>
        <div class="factions"><button class="btn-pri" id="cme-save">✓ GUARDAR CME</button></div>
      </div>

      <!-- S4: Edición producción -->
      <div class="dash-section" style="margin-bottom:10px">
        <div class="sec-hdr"><div class="sec-title">EDICIÓN — BD PRODUCCIÓN</div><span class="audit-badge">SOLO JEFE</span></div>
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-end">
          <div class="fgrp" style="min-width:180px">
            <div class="flabel">Seleccionar Fecha</div>
            <select class="fctl" id="ad-fecha-prod" style="max-width:200px">${fechaOpts}</select>
          </div>
          <button class="btn-sec" id="ad-prod-load">&#8635; CARGAR</button>
        </div>
        <div id="ad-prod-table"></div>
      </div>

      <!-- S5: Edición distribuidora -->
      <div class="dash-section" style="margin-bottom:10px">
        <div class="sec-hdr"><div class="sec-title">EDICIÓN — DATOS DISTRIBUIDORA</div><span class="audit-badge">SOLO JEFE</span></div>
        <div class="twrap">
          <table>
            <thead><tr><th>FECHA</th><th>NOMINADO m³</th><th>AUTORIZADO m³</th><th>RESTRINGIDO m³</th><th>FACTURADO m³</th><th>PCI kcal/m³</th><th>ESTADO</th></tr></thead>
            <tbody>${buildDistRows()}</tbody>
          </table>
        </div>
        <div class="factions"><button class="btn-pri" id="dist-save">✓ GUARDAR DISTRIBUIDORA</button></div>
      </div>

      <!-- S6: Edición lecturas -->
      <div class="dash-section" style="margin-bottom:10px">
        <div class="sec-hdr"><div class="sec-title">EDICIÓN — LECTURAS CAUDALÍMETRO (ÚLTIMAS 10)</div><span class="audit-badge">SOLO JEFE</span></div>
        <div class="twrap">
          <table>
            <thead><tr><th>FECHA</th><th>HORA</th><th>UBICACIÓN</th><th>LECTURA m³</th><th>ESTADO</th></tr></thead>
            <tbody>${buildLectRows()}</tbody>
          </table>
        </div>
      </div>

      <!-- S7: Auditoría -->
      <div class="dash-section">
        <div class="sec-hdr"><div class="sec-title">REGISTRO DE AUDITORÍA</div></div>
        <div id="ad-audit-log">
          ${auditLog.length
            ? auditLog.slice(0, 20).map(a => `
              <div style="display:flex;gap:10px;padding:5px 0;border-bottom:1px solid var(--border);font-family:var(--fontc);font-size:11px">
                <span style="color:var(--text3);min-width:130px">${a.ts}</span>
                <span class="audit-badge">${a.tipo}</span>
                <span style="color:var(--text2);flex:1">${a.detalle}</span>
                <span style="color:var(--text3)">${a.user}</span>
              </div>`).join('')
            : '<div style="color:var(--text3);font-family:var(--fontc);font-size:11px;padding:10px 0">Sin registros aún.</div>'}
        </div>
      </div>`;

    // ── BIND ADDEVENTLISTENER (sin onclick inline) ──────────────────────────

    // Ir a fecha desde panel de estado
    document.querySelectorAll('.ad-ver-fecha').forEach(btn => {
      btn.addEventListener('click', () => {
        AppState.setFiltros({ f: btn.dataset.fecha, period: 'day' });
        Router.navigate('dashboard');
      });
    });

    // Cargar edición de producción
    const adProdSel  = document.getElementById('ad-fecha-prod');
    const adProdLoad = document.getElementById('ad-prod-load');
    if (adProdLoad) {
      adProdLoad.addEventListener('click', () => loadProdEdit(adProdSel.value));
    }
    if (adProdSel) {
      adProdSel.addEventListener('change', () => loadProdEdit(adProdSel.value));
    }

    // Guardar parámetros
    document.getElementById('ap-save')?.addEventListener('click', () => {
      const params = {
        energia: {
          pciRef:     +document.getElementById('ap-pci').value,
          equivMmbtu: +document.getElementById('ap-equiv').value,
        },
        tarifas: {
          usd:    +document.getElementById('ap-usd').value,
          tarFD:  +document.getElementById('ap-tarFD').value,
          tarID:  +document.getElementById('ap-tarID').value,
          gnARS:  +document.getElementById('ap-gnARS').value,
          gnlARS: +document.getElementById('ap-gnlARS').value,
          gnlUSD: +document.getElementById('ap-gnlUSD').value,
        },
        cargosFijos: {
          cargoFijo:     +document.getElementById('ap-cf').value,
          cargoReservaFD: +document.getElementById('ap-reservaFD').value,
          cargoM3FD:     +document.getElementById('ap-cargom3FD').value,
          cargoM3ID:     +document.getElementById('ap-cargom3ID').value,
          transpNQ:      +document.getElementById('ap-transpNQ').value,
          transpNO:      +document.getElementById('ap-transpNO').value,
        },
      };
      AppState.updateParams(params);
      AppState.addAudit('PARAMS', 'Parámetros del sistema actualizados');
      UI.notify('✓ Parámetros guardados');
    });

    // Guardar CME
    document.getElementById('cme-save')?.addEventListener('click', () => {
      let n = 0;
      document.querySelectorAll('.ad-cme-input').forEach(el => {
        AppState.updateEquipoCME(el.dataset.eq, el.value);
        n++;
      });
      AppState.addAudit('CME', `CME actualizado: ${n} equipos`);
      UI.notify(`✓ CME guardado (${n} equipos)`);
    });

    // Guardar distribuidora inline
    document.getElementById('dist-save')?.addEventListener('click', () => {
      document.querySelectorAll('.ad-dist-input').forEach(el => {
        const rec = AppState.db.dist.find(r => r.f === el.dataset.f);
        if (rec) { rec[el.dataset.k] = +el.value; rec._edited = true; }
      });
      AppState.addAudit('ADMIN_DIST', 'Distribuidora editada inline');
      UI.notify('✓ Distribuidora guardada');
    });

    // Guardar lecturas inline
    document.querySelectorAll('.ad-lect-input').forEach(el => {
      el.addEventListener('change', () => {
        const ok = AppState.updateLectRecord(+el.dataset.id, el.value);
        if (ok) {
          const st = document.getElementById(`ad-lect-st-${el.dataset.id}`);
          if (st) st.textContent = 'EDITADO';
          AppState.addAudit('ADMIN_LECT', `Lectura ID ${el.dataset.id} editada a ${el.value} m³`);
        }
      });
    });

    // Cargar primera fecha por defecto
    if (allDates[0]) loadProdEdit(allDates[0]);

    // ── Gas vs Prod: auto-calcular Encolado al cambiar Tintorería
    document.getElementById('ap-vapor-tint')?.addEventListener('input', e => {
      const pvt = parseFloat(e.target.value) || 0;
      const pve = Math.max(0, 100 - pvt);
      const elEnc = document.getElementById('ap-vapor-enc');
      if (elEnc) elEnc.value = pve.toFixed(1);
      const chk = document.getElementById('ap-gvp-check');
      if (chk) {
        const ok = Math.abs(pvt + pve - 100) < 0.1;
        chk.textContent = `Suma: ${(pvt+pve).toFixed(1)}% ${ok?'✓':'⚠ debe sumar 100%'}`;
        chk.style.color = ok ? 'var(--green)' : 'var(--orange)';
      }
    });

    // ── Gas vs Prod: guardar
    document.getElementById('ap-gvp-save')?.addEventListener('click', () => {
      const ef  = parseFloat(document.getElementById('ap-ef-caldera')?.value) || 80;
      const pvt = parseFloat(document.getElementById('ap-vapor-tint')?.value) || 72.6;
      const pve = parseFloat(document.getElementById('ap-vapor-enc')?.value)  || 27.4;
      if (Math.abs(pvt + pve - 100) > 0.5) {
        UI.notify('Los % de vapor deben sumar 100%', 'err'); return;
      }
      if (!CONFIG.gasVsProd) CONFIG.gasVsProd = {};
      CONFIG.gasVsProd.eficiencia_caldera = ef  / 100;
      CONFIG.gasVsProd.pct_vapor_tint     = pvt / 100;
      CONFIG.gasVsProd.pct_vapor_enc      = pve / 100;
      AppState.addAudit('CFG_GVP', `Ef:${ef}% Tint:${pvt}% Enc:${pve}%`);
      UI.notify(`✓ Gas vs Prod guardado — Ef: ${ef}% · Tint: ${pvt}% · Enc: ${pve}%`, '', 4000);
      // Refrescar tabla auditoría
      const wrap = document.getElementById('audit-table-wrap');
      if (wrap) wrap.innerHTML = buildAuditTable();
    });

    // ── Exportar auditoría
    document.getElementById('audit-export')?.addEventListener('click', () => {
      const logs = (AppState.db.auditLog || AppState.auditLog || []).slice().reverse();
      const rows = [
        ['AUDITORÍA — Colortex SA · Matriz Energética'],
        ['Timestamp', 'Tipo', 'Detalle', 'Usuario'],
        ...logs.map(l => [
          l.ts ? l.ts.slice(0,16).replace('T',' ') : '—',
          l.tipo || l.type || '—',
          l.det  || l.detalle || '—',
          l.user || l.usuario || '—',
        ]),
      ];
      CsvExport._download(rows, `Colortex_Auditoria_${new Date().toISOString().slice(0,10)}.csv`);
      UI.notify('✓ Auditoría exportada', '', 3000);
    });
  }

  return { render };

})();
