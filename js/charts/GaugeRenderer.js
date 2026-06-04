/**
 * GaugeRenderer.js — Apache ECharts 5.x
 * Colortex SA · Matriz Energética
 *
 * % DENTRO del arco (detail del gauge).
 * Valor m³ centrado DEBAJO del contenedor, fuera del gauge.
 */
'use strict';

var GaugeRenderer = (function() {

  var _instances = {};

  /**
   * Gauge semicircular con % dentro del arco.
   * El valor m³ se inyecta como texto HTML debajo del div del gauge.
   */
  function draw(divId, valor, pct, color, isPlanta) {
    var el = document.getElementById(divId);
    if (!el || typeof echarts === 'undefined') return;

    if (_instances[divId]) {
      try { _instances[divId].dispose(); } catch(e) {}
      delete _instances[divId];
    }

    var dark   = AppState.darkMode;
    var bgArc  = dark ? '#2e3650' : '#dde2ef';
    var txtCol = dark ? '#e8ecf4' : '#1a2035';
    var subCol = dark ? '#8a94b0' : '#5a6490';

    var pctDisplay = Math.min(pct, 110);
    var pctLabel   = Fmt.num(pct, 0) + '%';
    var valLabel   = Fmt.num(valor) + ' m³';

    var lineW    = isPlanta ? 14 : 11;
    var radius   = isPlanta ? '85%' : '83%';
    var fSizePct = isPlanta ? 22 : 17;
    // El % va en el centro del semicírculo — offsetCenter Y ligeramente negativo
    // para que quede dentro del hueco del arco
    var offsetY  = isPlanta ? '-10%' : '-8%';

    var chart = echarts.init(el, null, { renderer: 'svg' });
    _instances[divId] = chart;

    chart.setOption({
      backgroundColor: 'transparent',
      series: [{
        type:       'gauge',
        startAngle: 180,
        endAngle:   0,
        min: 0,
        max: 110,
        radius:  radius,
        center:  ['50%', '78%'],   // centro bajo para dejar espacio al % arriba del eje
        splitNumber: 0,
        axisLine: {
          lineStyle: {
            width: lineW,
            color: [
              [Math.min(pctDisplay / 110, 1), color],
              [1, bgArc]
            ]
          }
        },
        axisTick:  { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer:   { show: false },
        anchor:    { show: false },
        title:     { show: false },
        detail: {
          show:           true,
          valueAnimation: false,
          offsetCenter:   ['0%', offsetY],
          fontSize:       fSizePct,
          fontWeight:     700,
          fontFamily:     'Calibri, Arial, sans-serif',
          color:          txtCol,
          formatter:      function() { return pctLabel; }
        },
        data: [{ value: pctDisplay }]
      }]
    });

    // Inyectar valor m³ como texto HTML centrado debajo del div del gauge
    var valDiv = el.nextElementSibling;
    if (!valDiv || !valDiv.classList.contains('gauge-val-label')) {
      valDiv = document.createElement('div');
      valDiv.className = 'gauge-val-label';
      el.parentNode.insertBefore(valDiv, el.nextSibling);
    }
    valDiv.style.cssText = 'text-align:center;font-family:Calibri,Arial,sans-serif;font-size:' +
      (isPlanta ? 12 : 10) + 'px;font-weight:600;color:' + subCol + ';margin-top:2px;';
    valDiv.textContent = valLabel;
  }

  function drawDoughnut(divId, labels, values, colors) {
    var el = document.getElementById(divId);
    if (!el || typeof echarts === 'undefined') return;
    if (el.offsetWidth === 0 || el.offsetHeight === 0) {
      setTimeout(function() { drawDoughnut(divId, labels, values, colors); }, 60);
      return;
    }

    if (_instances[divId]) {
      try { _instances[divId].dispose(); } catch(e) {}
      delete _instances[divId];
    }

    var dark  = AppState.darkMode;
    var ttBg  = dark ? '#1a1f2e' : '#fff';
    var ttBd  = dark ? '#3a4462' : '#c5cedf';
    var ttCol = dark ? '#a0a9c4' : '#3a4468';
    var p     = CONFIG.tarifas;

    var chart = echarts.init(el, null, { renderer: 'svg' });
    _instances[divId] = chart;

    var data = labels.map(function(lbl, i) {
      return {
        name:      lbl,
        value:     values[i],
        itemStyle: { color: colors[i], borderColor: '#fff', borderWidth: 2 }
      };
    });

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: ttBg,
        borderColor:     ttBd,
        textStyle:       { color: ttCol, fontFamily: 'Calibri, Arial', fontSize: 11 },
        formatter: function(params) {
          var cARS = params.value * p.gnARS;
          return '<b>' + params.name + '</b><br>' +
            Fmt.num(params.value) + ' m³ · ' + Fmt.num(params.percent, 1) + '%<br>' +
            Fmt.ars(cARS) + ' · ' + Fmt.usd(cARS / p.usd);
        }
      },
      series: [{
        type:              'pie',
        radius:            ['50%', '84%'],
        center:            ['50%', '50%'],
        avoidLabelOverlap: false,
        label:             { show: false },
        labelLine:         { show: false },
        emphasis: {
          scale:     true,
          scaleSize: 4,
          itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,.2)' }
        },
        data: data
      }]
    });
  }

  function destroyAll() {
    Object.keys(_instances).forEach(function(id) {
      try { _instances[id].dispose(); } catch(e) {}
    });
    _instances = {};
    // Limpiar val labels inyectados
    document.querySelectorAll('.gauge-val-label').forEach(function(el) { el.remove(); });
  }

  function resizeAll() {
    Object.keys(_instances).forEach(function(id) {
      try { _instances[id].resize(); } catch(e) {}
    });
  }

  return { draw: draw, drawDoughnut: drawDoughnut, destroyAll: destroyAll, resizeAll: resizeAll };

})();
