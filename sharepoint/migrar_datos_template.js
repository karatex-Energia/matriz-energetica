/**
 * migrar_datos.js
 * ═══════════════════════════════════════════════════════════════════
 * Script de migración histórica — Colortex SA · Matriz Energética
 *
 * INSTRUCCIONES:
 *   1. Abrí Chrome/Edge con SharePoint abierto en:
 *      https://karatex.sharepoint.com/sites/MatrizEnergeticaIntegrada
 *   2. Presioná F12 → Consola
 *   3. Pegá TODO este script y presioná Enter
 *   4. Esperá hasta ver "✓ MIGRACIÓN COMPLETA"
 *
 * TIEMPO ESTIMADO: 3-5 minutos (804 registros en total)
 * ═══════════════════════════════════════════════════════════════════
 */

(async () => {

const SITE = 'https://karatex.sharepoint.com/sites/MatrizEnergeticaIntegrada';
const API  = `${SITE}/_api/web/lists/getbytitle`;

// ── TOKEN ──────────────────────────────────────────────────────────
const tr = await fetch(`${SITE}/_api/contextinfo`, {
  method: 'POST',
  headers: { 'Accept': 'application/json;odata=verbose' },
  credentials: 'include',
});
const token = (await tr.json()).d.GetContextWebInformation.FormDigestValue;
console.log('✓ Token obtenido');

// ── HELPERS ────────────────────────────────────────────────────────
async function crearItem(lista, datos) {
  const r = await fetch(`${API}('${lista}')/items`, {
    method: 'POST',
    headers: {
      'Accept':          'application/json;odata=verbose',
      'Content-Type':    'application/json;odata=verbose',
      'X-RequestDigest': token,
    },
    credentials: 'include',
    body: JSON.stringify({
      '__metadata': { 'type': `SP.Data.${lista}ListItem` },
      ...datos,
    }),
  });
  if (!r.ok && r.status !== 201) {
    const e = await r.json().catch(() => ({}));
    throw new Error(`${lista}: ${r.status} — ${e?.error?.message?.value || ''}`);
  }
  return await r.json();
}

async function migrarLista(nombre, registros, labelFn) {
  console.log(`\n► Migrando ${nombre} (${registros.length} registros)...`);
  let ok = 0, err = 0;
  for (let i = 0; i < registros.length; i++) {
    try {
      await crearItem(nombre, registros[i]);
      ok++;
      if (ok % 50 === 0 || ok === registros.length) {
        console.log(`  ${nombre}: ${ok}/${registros.length} ✓`);
      }
    } catch(e) {
      err++;
      console.warn(`  ✗ ${nombre}[${i}]: ${e.message}`);
    }
    // Pausa cada 20 registros para evitar throttling
    if (i > 0 && i % 20 === 0) await new Promise(r => setTimeout(r, 300));
  }
  console.log(`  ✓ ${nombre} completado — ${ok} OK / ${err} errores`);
  return { ok, err };
}

// ── DATOS A MIGRAR ─────────────────────────────────────────────────
// Los datos están embebidos directamente en este script
// para no depender de archivos externos

const DATOS = /*DATOS_JSON*/null;

if (!DATOS) {
  console.error('⚠ Este script requiere que el archivo datos_migracion.json');
  console.error('  sea cargado primero. Ver instrucciones en LEEME_MIGRACION.txt');
  return;
}

// ── EJECUCIÓN ──────────────────────────────────────────────────────
console.log('═══════════════════════════════════════');
console.log('  Colortex SA · Migración de datos');
console.log('═══════════════════════════════════════');

const total_inicio = Date.now();
const resultados = {};

resultados.GN_Produccion    = await migrarLista('GN_Produccion',    DATOS.GN_Produccion);
resultados.GN_Distribuidora = await migrarLista('GN_Distribuidora', DATOS.GN_Distribuidora);
resultados.GN_Lecturas      = await migrarLista('GN_Lecturas',      DATOS.GN_Lecturas);
resultados.EE_Trafos        = await migrarLista('EE_Trafos',        DATOS.EE_Trafos);
resultados.EE_Compresores   = await migrarLista('EE_Compresores',   DATOS.EE_Compresores);

const mins = ((Date.now() - total_inicio) / 60000).toFixed(1);
const totalOk  = Object.values(resultados).reduce((a, r) => a + r.ok,  0);
const totalErr = Object.values(resultados).reduce((a, r) => a + r.err, 0);

console.log('\n═══════════════════════════════════════');
console.log(`✓ MIGRACIÓN COMPLETA en ${mins} minutos`);
console.log(`  Registros migrados: ${totalOk}`);
console.log(`  Errores:            ${totalErr}`);
console.log('═══════════════════════════════════════');

})();
