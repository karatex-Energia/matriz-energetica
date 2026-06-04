/**
 * js/views/dashboard/comparacion.js
 * Módulo de Comparación de Períodos — gráfico de barras agrupadas + segmentadores
 */
'use strict';

var _cmpChartA = null;
var _cmpChartB = null;

function buildComparacionHTML() {
  var fechas = Array.from(new Set(AppState.db.prod.map(function(r){ return r.f; }))).sort();
  if (fechas.length < 2) return '';
  var fMin = fechas[0];
  var fMax = fechas[fechas.length - 1];
  var fMed = fechas[Math.floor(fechas.length / 2)];

  return '<div class="dash-section">' +
    '<div class="sec-hdr">' +
      '<div class="sec-title">COMPARACIÓN DE PERÍODOS</div>' +
      '<div style="font-family:Calibri,var(--fontc);font-size:10px;color:var(--text3)">Seleccioná dos períodos y una dimensión para comparar visualmente</div>' +
    '</div>' +

    // Selectores de período
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">' +
      '<div class="kblock" style="padding:10px 12px">' +
        '<div class="klabel" style="margin-bottom:6px;color:var(--accent)">PERÍODO A</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
          '<div><div class="flabel">Desde</div>' +
            '<input type="date" class="fctl yel" id="cmp-a-desde" value="' + fMin + '" min="' + fMin + '" max="' + fMax + '"></div>' +
          '<div><div class="flabel">Hasta</div>' +
            '<input type="date" class="fctl yel" id="cmp-a-hasta" value="' + fMed + '" min="' + fMin + '" max="' + fMax + '"></div>' +
        '</div>' +
      '</div>' +
      '<div class="kblock" style="padding:10px 12px">' +
        '<div class="klabel" style="margin-bottom:6px;color:var(--text2)">PERÍODO B</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
          '<div><div class="flabel">Desde</div>' +
            '<input type="date" class="fctl" id="cmp-b-desde" value="' + fMed + '" min="' + fMin + '" max="' + fMax + '"></div>' +
          '<div><div class="flabel">Hasta</div>' +
            '<input type="date" class="fctl" id="cmp-b-hasta" value="' + fMax + '" min="' + fMin + '" max="' + fMax + '"></div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // Segmentadores de dimensión
'<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px;align-items:center">' +
      '<span style="font-family:Calibri,var(--fontc);font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;margin-right:2px">VER</span>' +
      ['consumo:m³','costos:ARS','horas:hs','desvio:desvío','equipos:equipos'].map(function(x){ var p=x.split(':'); return '<button class="cmp-pill" data-dim="'+p[0]+'" style="font-family:Calibri,var(--fontc);font-size:10px;padding:3px 10px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--text3);cursor:pointer">'+p[1]+'</button>'; }).join('') +
      '<div style="margin-left:auto;display:flex;gap:5px">' +
        '<button class="btn-pri" id="dash-cmp-run" style="padding:4px 12px;font-size:11px">&#9654;</button>' +
        '<button class="btn-sec" id="dash-cmp-clear" style="padding:4px 10px;font-size:11px">&#10005;</button>' +
      '</div>' +
    '</div>' +

    // Contenedor del gráfico
    '<div id="dash-cmp-result">' +
      '<div style="text-align:center;padding:30px;font-family:Calibri,var(--fontc);font-size:12px;color:var(--text3)">' +
        'Seleccioná los períodos y presioná Comparar' +
      '</div>' +
    '</div>' +
  '</div>';
}

function runDashComparacion() {
  var aD = (document.getElementById('cmp-a-desde') || {}).value;
  var aH = (document.getElementById('cmp-a-hasta') || {}).value;
  var bD = (document.getElementById('cmp-b-desde') || {}).value;
  var bH = (document.getElementById('cmp-b-hasta') || {}).value;
  var el = document.getElementById('dash-cmp-result');
  if (!aD || !aH || !bD || !bH || !el) return;

  // Leer dimensión activa
  var activeDim = 'consumo';
  document.querySelectorAll('[data-dim]').forEach(function(btn) {
    if (btn.classList.contains('active')) activeDim = btn.dataset.dim;
  });

  var prod = AppState.db.prod;
  var p    = CONFIG.tarifas;
  var cf   = CONFIG.cargosFijos;
  var limFD = CONFIG.limites.fd;

  function calcStats(fD, fH) {
    var arr  = prod.filter(function(r){ return r.f >= fD && r.f <= fH; });
    var real = arr.filter(function(r){ return r.cl === 'REAL'; });
    var proy = arr.filter(function(r){ return r.cl === 'PROYECTADA'; });
    var totR = real.reduce(function(a,r){ return a+r.c; },0);
    var totP = proy.reduce(function(a,r){ return a+r.c; },0);
    var totH = real.reduce(function(a,r){ return a+r.h; },0);
    var dir  = real.filter(function(r){ return r.tipo==='DIRECTO'; }).reduce(function(a,r){ return a+r.c; },0);
    var ind  = real.filter(function(r){ return r.tipo==='INDIRECTO'; }).reduce(function(a,r){ return a+r.c; },0);
    var mix  = real.filter(function(r){ return r.tipo==='MIXTO'; }).reduce(function(a,r){ return a+r.c; },0);
    // Costos
    var fechasDias = Array.from(new Set(real.map(function(r){ return r.f; }))).sort();
    var volFD=0, volID=0;
    fechasDias.forEach(function(d) {
      var cD = real.filter(function(r){ return r.f===d; }).reduce(function(a,r){ return a+r.c; },0);
      volFD += Math.min(cD,limFD); volID += Math.max(0,cD-limFD);
    });
    var costFD   = volFD * p.tarFD;
    var costID   = volID * p.tarID;
    var costCons = costFD + costID + cf.cargoFijo + cf.cargoReservaFD + cf.cargoM3FD + cf.cargoM3ID;
    // Equipos
    var equipos = Array.from(new Set(prod.map(function(r){ return r.eq; }))).sort();
    var eqData  = equipos.map(function(eq) {
      var rA = real.filter(function(r){ return r.eq===eq; }).reduce(function(a,r){ return a+r.c; },0);
      return { eq:eq, val:rA };
    }).filter(function(e){ return e.val>0; }).sort(function(a,b){ return b.val-a.val; }).slice(0,10);
    return { totR:totR, totP:totP, totH:totH, dir:dir, ind:ind, mix:mix,
             costFD:costFD, costID:costID, costCons:costCons,
             dA:totR-totP, dR:totP?(totR-totP)/totP*100:0, eqData:eqData };
  }

  var sA = calcStats(aD, aH);
  var sB = calcStats(bD, bH);

  var dark  = AppState.darkMode;
  var tc    = dark ? '#7a84a0' : '#6a74a0';
  var gc    = dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)';
  var ttBg  = dark ? '#1a1f2e' : '#fff';
  var ttBd  = dark ? '#3a4462' : '#c5cedf';
  var lblA  = 'A · ' + Fmt.date(aD) + '–' + Fmt.date(aH);
  var lblB  = 'B · ' + Fmt.date(bD) + '–' + Fmt.date(bH);

  // Datos según dimensión
  var labels, dataA, dataB, unit, title;

  if (activeDim === 'consumo') {
    labels = ['Real', 'Programado', 'Directo', 'Indirecto', 'Mixto'];
    dataA  = [sA.totR, sA.totP, sA.dir, sA.ind, sA.mix];
    dataB  = [sB.totR, sB.totP, sB.dir, sB.ind, sB.mix];
    unit   = 'm³'; title = 'CONSUMO m³ — A vs B';
  } else if (activeDim === 'costos') {
    labels = ['Costo FD', 'Costo ID', 'Consolidado'];
    dataA  = [sA.costFD, sA.costID, sA.costCons];
    dataB  = [sB.costFD, sB.costID, sB.costCons];
    unit   = 'ARS'; title = 'COSTOS ARS — A vs B';
  } else if (activeDim === 'horas') {
    labels = ['Hs Máquina Real'];
    dataA  = [sA.totH];
    dataB  = [sB.totH];
    unit   = 'hs'; title = 'HORAS MÁQUINA — A vs B';
  } else if (activeDim === 'desvio') {
    labels = ['Desvío Absoluto (m³)', 'Desvío Relativo (%)'];
    dataA  = [sA.dA, sA.dR];
    dataB  = [sB.dA, sB.dR];
    unit   = ''; title = 'DESVÍO — A vs B';
  } else {
    // Por equipo — top 10
    var allEq = Array.from(new Set(sA.eqData.map(function(e){ return e.eq; }).concat(sB.eqData.map(function(e){ return e.eq; })))).slice(0,10);
    labels = allEq;
    dataA  = allEq.map(function(eq){ var e=sA.eqData.find(function(x){ return x.eq===eq; }); return e?e.val:0; });
    dataB  = allEq.map(function(eq){ var e=sB.eqData.find(function(x){ return x.eq===eq; }); return e?e.val:0; });
    unit   = 'm³'; title = 'CONSUMO POR EQUIPO — A vs B';
  }

  // Tabla resumen debajo del gráfico
  var varRows = labels.map(function(lbl, i) {
    var vA = dataA[i] || 0;
    var vB = dataB[i] || 0;
    var d  = vA - vB;
    var pct = vB ? d/vB*100 : 0;
    var col = d===0 ? 'var(--text3)' : (d>0 ? 'var(--green)' : 'var(--red)');
    var dec = (unit==='ARS'||unit==='m³') ? 0 : 1;
    return '<tr>' +
      '<td style="padding:5px 8px;font-family:Calibri,var(--fontc);font-size:11px;color:var(--text2)">' + lbl + '</td>' +
      '<td style="padding:5px 8px;text-align:right;font-family:var(--fontc);font-size:11px;font-weight:700;color:var(--accent)">' + Fmt.num(vA,dec) + (unit?' '+unit:'') + '</td>' +
      '<td style="padding:5px 8px;text-align:right;font-family:var(--fontc);font-size:11px;color:var(--text)">' + Fmt.num(vB,dec) + (unit?' '+unit:'') + '</td>' +
      '<td style="padding:5px 8px;text-align:right;font-family:var(--fontc);font-size:11px;font-weight:700;color:' + col + '">' +
        (d>=0?'+':'') + Fmt.num(d,dec) + ' <span style="font-size:9.5px;opacity:.7">(' + (pct>=0?'+':'') + Fmt.num(pct,1) + '%)</span>' +
      '</td>' +
    '</tr>';
  }).join('');

  el.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 320px;gap:10px;align-items:start">' +
      '<div>' +
        '<canvas id="chart-cmp" height="' + (activeDim==='equipos'?200:160) + '"></canvas>' +
      '</div>' +
      '<div>' +
        '<div style="font-family:Calibri,var(--fontc);font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' + title + '</div>' +
        '<table style="width:100%;border-collapse:collapse">' +
          '<thead><tr style="background:var(--bg3)">' +
            '<th style="padding:5px 8px;text-align:left;font-family:Calibri,var(--fontc);font-size:9.5px;font-weight:700;color:var(--text3)">INDICADOR</th>' +
            '<th style="padding:5px 8px;text-align:right;font-family:Calibri,var(--fontc);font-size:9.5px;font-weight:700;color:var(--accent)">PER. A</th>' +
            '<th style="padding:5px 8px;text-align:right;font-family:Calibri,var(--fontc);font-size:9.5px;font-weight:700;color:var(--text3)">PER. B</th>' +
            '<th style="padding:5px 8px;text-align:right;font-family:Calibri,var(--fontc);font-size:9.5px;font-weight:700;color:var(--text3)">VAR. A vs B</th>' +
          '</tr></thead>' +
          '<tbody>' + varRows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';

  // Destruir chart anterior
  if (_cmpChartA) { try { _cmpChartA.destroy(); } catch(e){} _cmpChartA = null; }

  // Dibujar gráfico
  setTimeout(function() {
    var canvas = document.getElementById('chart-cmp');
    if (!canvas || typeof Chart === 'undefined') return;
    var isHoriz = activeDim === 'equipos';
    _cmpChartA = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: lblA,
            data:  dataA,
            backgroundColor: 'rgba(45,126,247,.75)',
            borderColor:     'rgba(45,126,247,1)',
            borderWidth: 1,
            borderRadius: 3,
          },
          {
            label: lblB,
            data:  dataB,
            backgroundColor: 'rgba(168,85,247,.6)',
            borderColor:     'rgba(168,85,247,1)',
            borderWidth: 1,
            borderRadius: 3,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        indexAxis: isHoriz ? 'y' : 'x',
        plugins: {
          legend: {
            display: true,
            labels: { color: tc, font: { family: 'Barlow Condensed', size: 11 } }
          },
          tooltip: {
            backgroundColor: ttBg,
            borderColor: ttBd,
            borderWidth: 1,
            titleColor: dark ? '#e8ecf4' : '#1a2035',
            bodyColor: tc,
            callbacks: {
              label: function(ctx) {
                return ctx.dataset.label + ': ' + Fmt.num(ctx.raw, unit==='ARS'?0:1) + (unit?' '+unit:'');
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: tc, font: { family: 'Barlow Condensed', size: 10 } },
            grid:  { color: gc }
          },
          y: {
            ticks: { color: tc, font: { family: 'Barlow Condensed', size: 10 } },
            grid:  { color: gc }
          }
        }
      }
    });
  }, 80);
}

function bindComparacionSegmenters() {
  document.querySelectorAll('.cmp-pill').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.cmp-pill').forEach(function(b){ b.style.background='transparent'; b.style.color='var(--text3)'; b.style.borderColor='var(--border)'; });
      btn.style.background='var(--accent)'; btn.style.color='#fff'; btn.style.borderColor='var(--accent)';
      // Re-correr si ya hay resultado visible
      if (document.getElementById('chart-cmp')) runDashComparacion();
    });
  });
}
