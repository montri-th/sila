/* Charts for the Sila officer site (revision 2.0). amCharts 5 (free licence: the amCharts link stays on every chart),
 * bundled in vendor/amcharts5/. Colours are passed in by the host from the LDS categorical series or analytical scales;
 * this module never invents a colour. Every chart carries its DATAVIZ-01 declaration (what is measured, unit, basis,
 * scope, time) in a caption the host renders next to it, and an accessible table alternative is offered by the host.
 * API: SilaCharts.render(el, spec, {theme, lang}) -> handle with dispose(); SilaCharts.disposeAll().
 * spec = {type: 'bars' | 'columns' | 'donut', items: [{id, label, value, color, ink?}], unit, format: 'money' | 'count' | 'percent',
 *         total?, valueLabel?: fn(value) -> string, emphasis?: id}
 */
(function (root) {
  'use strict';
  const live = new Map();
  const FONT_UI = '"Bai Jamjuree", sans-serif';
  const FONT_DATA = '"JetBrains Mono", "IBM Plex Sans Thai", monospace';
  const lib = () => root.SilaAm5 || null;
  const cssVar = (name, fallback) => { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; };
  const fmt = (v, format, lang) => {
    if (v == null || !Number.isFinite(v)) return '—';
    if (format === 'percent') return `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
    if (format === 'money') {
      const a = Math.abs(v);
      if (a >= 1e6) return `${(v / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${lang === 'en' ? 'M' : 'ล้าน'}`;
      return Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    return Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
  };
  /* Canvas text: digits stay in the data font, words stay in the UI font (Thai glyphs are not in JetBrains Mono),
     so axis and bar labels carry plain numbers and the unit is drawn once as a word. Money at or above one million is
     drawn in millions. Returns {divisor, decimals, unit}. */
  const unitFor = (spec, items, lang) => {
    const max = Math.max(0, ...items.map((it) => Math.abs(it.value)));
    if (spec.format === 'money') return max >= 1e6 ? { divisor: 1e6, decimals: 2, unit: lang === 'en' ? 'M THB' : 'ล้านบาท' } : { divisor: 1, decimals: 0, unit: lang === 'en' ? 'THB' : 'บาท' };
    if (spec.format === 'percent') return { divisor: 1, decimals: max >= 10 ? 0 : 1, unit: '%' };
    return { divisor: 1, decimals: 0, unit: spec.unit || '' };
  };

  function dispose(el) {
    const h = live.get(el);
    if (h) { try { h.root.dispose(); } catch (_) { /* already gone */ } live.delete(el); }
  }
  function disposeAll() { for (const el of [...live.keys()]) dispose(el); }
  /* Drop handles whose element left the document (the panel re-renders its HTML). */
  function prune() { for (const el of [...live.keys()]) if (!el.isConnected) dispose(el); }

  function render(el, spec, opts = {}) {
    const am = lib();
    if (!am || !el || !spec) return null;
    dispose(el);
    const { am5, am5xy, am5percent } = am;
    const lang = opts.lang || 'th', theme = opts.theme || 'dark';
    const ink = cssVar('--primary', theme === 'light' ? '#182327' : '#F1F4EF');
    const muted = cssVar('--secondary', theme === 'light' ? '#3D4744' : '#C4CECA');
    const hair = cssVar('--hairline', theme === 'light' ? '#DDE2DE' : '#26302F');
    const rootAm = am5.Root.new(el);
    rootAm.locale = lang === 'en' ? am.am5locales_en_US : am.am5locales_th_TH;
    rootAm.numberFormatter.set('numberFormat', '#,###.##');
    /* No Responsive theme: the host sizes every chart, and that theme moves axis labels inside the plot on short charts. */
    rootAm.interfaceColors.set('text', am5.color(ink));
    rootAm.interfaceColors.set('grid', am5.color(hair));
    rootAm.interfaceColors.set('background', am5.color(cssVar('--card', theme === 'light' ? '#FFFFFF' : '#1B2428')));
    const raw = (spec.items || []).map((it) => ({ ...it, category: it.label, value: Number(it.value) || 0 }));
    const u = unitFor(spec, raw, lang);
    const items = raw.map((it) => ({ ...it, raw: it.value, value: it.value / u.divisor }));
    const plain = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: u.decimals, maximumFractionDigits: u.decimals });
    const valueLabel = spec.valueLabel || ((v) => (spec.format === 'percent' ? `${plain(v)}%` : plain(v)));
    let handle = { root: rootAm, el, spec };
    if (spec.type === 'donut') {
      const chart = rootAm.container.children.push(am5percent.PieChart.new(rootAm, { layout: rootAm.verticalLayout, innerRadius: am5.percent(55), paddingTop: 4, paddingBottom: 4 }));
      const series = chart.series.push(am5percent.PieSeries.new(rootAm, { valueField: 'value', categoryField: 'category', alignLabels: false }));
      series.slices.template.setAll({ stroke: am5.color(cssVar('--card', '#1B2428')), strokeWidth: 1.5, templateField: 'sliceSettings', tooltipText: `{category}: {valueLabel}${u.unit && spec.format !== 'percent' ? ' ' + u.unit : ''}` });
      series.labels.template.setAll({ visible: false });
      series.ticks.template.setAll({ visible: false });
      series.data.setAll(items.map((it) => ({ ...it, valueLabel: valueLabel(it.value), sliceSettings: { fill: am5.color(it.color), stroke: am5.color(cssVar('--card', '#1B2428')) } })));
      const legend = chart.children.push(am5.Legend.new(rootAm, { centerX: am5.percent(50), x: am5.percent(50), layout: rootAm.gridLayout, marginTop: 4 }));
      legend.labels.template.setAll({ fontFamily: FONT_UI, fontSize: 12, fill: am5.color(ink) });
      legend.valueLabels.template.setAll({ fontFamily: FONT_DATA, fontSize: 12, fill: am5.color(muted) });
      legend.markers.template.setAll({ width: 12, height: 12 });
      legend.markerRectangles.template.setAll({ cornerRadiusTL: 3, cornerRadiusTR: 3, cornerRadiusBL: 3, cornerRadiusBR: 3 });
      legend.data.setAll(series.dataItems);
      handle.chart = chart;
    } else {
      const horizontal = spec.type !== 'columns';
      const chart = rootAm.container.children.push(am5xy.XYChart.new(rootAm, { panX: false, panY: false, wheelX: 'none', wheelY: 'none', layout: rootAm.verticalLayout, paddingLeft: 0, paddingRight: 8, paddingTop: 4, paddingBottom: 0 }));
      const catRenderer = horizontal ? am5xy.AxisRendererY.new(rootAm, { minGridDistance: 18, inversed: true, minorGridEnabled: false }) : am5xy.AxisRendererX.new(rootAm, { minGridDistance: 24 });
      catRenderer.grid.template.setAll({ visible: false });
      catRenderer.labels.template.setAll({ fontFamily: FONT_UI, fontSize: horizontal ? 12 : 11, fill: am5.color(ink), oversizedBehavior: horizontal ? 'truncate' : 'wrap', maxWidth: horizontal ? 128 : 96, textAlign: horizontal ? 'end' : 'center', paddingTop: horizontal ? 0 : 4 });
      const valRenderer = horizontal ? am5xy.AxisRendererX.new(rootAm, { minGridDistance: 56 }) : am5xy.AxisRendererY.new(rootAm, { minGridDistance: 28 });
      valRenderer.grid.template.setAll({ stroke: am5.color(hair), strokeOpacity: 1 });
      valRenderer.labels.template.setAll({ fontFamily: FONT_DATA, fontSize: 11, fill: am5.color(muted) });
      const catAxis = (horizontal ? chart.yAxes : chart.xAxes).push(am5xy.CategoryAxis.new(rootAm, { categoryField: 'category', renderer: catRenderer }));
      const valAxis = (horizontal ? chart.xAxes : chart.yAxes).push(am5xy.ValueAxis.new(rootAm, { min: 0, renderer: valRenderer, numberFormat: '#,###.##', extraMax: 0.18 }));
      if (u.unit) chart.children.unshift(am5.Label.new(rootAm, { text: u.unit, fontFamily: FONT_UI, fontSize: 11, fill: am5.color(muted), x: am5.percent(100), centerX: am5.percent(100), paddingBottom: 2 }));
      const series = chart.series.push(am5xy.ColumnSeries.new(rootAm, horizontal
        ? { xAxis: valAxis, yAxis: catAxis, valueXField: 'value', categoryYField: 'category' }
        : { xAxis: catAxis, yAxis: valAxis, valueYField: 'value', categoryXField: 'category' }));
      series.columns.template.setAll({ cornerRadiusTL: 3, cornerRadiusTR: 3, cornerRadiusBL: 3, cornerRadiusBR: 3, strokeOpacity: 0, templateField: 'columnSettings', tooltipText: `{category}: {valueLabel}${u.unit && spec.format !== 'percent' ? ' ' + u.unit : ''}`, height: horizontal ? am5.percent(62) : undefined, width: horizontal ? undefined : am5.percent(62) });
      series.bullets.push(() => am5.Bullet.new(rootAm, { locationX: horizontal ? 1 : 0.5, locationY: horizontal ? 0.5 : 1, sprite: am5.Label.new(rootAm, { text: '{valueLabel}', fontFamily: FONT_DATA, fontSize: 11, fill: am5.color(ink), centerY: horizontal ? am5.percent(50) : am5.percent(100), centerX: horizontal ? am5.percent(0) : am5.percent(50), dx: horizontal ? 4 : 0, dy: horizontal ? 0 : -2, populateText: true }) }));
      catAxis.data.setAll(items);
      series.data.setAll(items.map((it) => ({ ...it, valueLabel: valueLabel(it.value), columnSettings: { fill: am5.color(it.color), fillOpacity: spec.emphasis && spec.emphasis !== it.id ? 0.45 : 1 } })));
      handle.chart = chart; handle.series = series;
    }
    live.set(el, handle);
    return { dispose: () => dispose(el), root: rootAm };
  }

  root.SilaCharts = Object.freeze({ render, dispose, disposeAll, prune, format: fmt, unitFor, version: '1.0.1', available: () => !!lib() });
})(typeof window !== 'undefined' ? window : globalThis);
