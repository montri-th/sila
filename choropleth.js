/* Analytical colour classes from the exact LDS 0.9.7 records in reference/lds-analytical-subset.json.
 * Uses the approved 41-sample LUT class indices round(i*40/(n-1)) only; no runtime interpolation.
 * Same HEX on light and dark; only no-data, zero outline and suppressed cues follow the theme.
 */
(function (root) {
  'use strict';
  let records = null;
  const patterns = {};
  function load(json) { records = json && Array.isArray(json.scales) ? json.scales : null; return !!records; }
  function record(scaleId, theme = 'light') {
    if (!records) throw new Error('LDS analytical subset is not loaded');
    const r = records.find(s => s.scaleId === scaleId && s.theme === theme) || records.find(s => s.scaleId === scaleId);
    if (!r) throw new Error('Unknown analytical scale ' + scaleId);
    return r;
  }
  function classes(scaleId, n = 7) {
    const r = record(scaleId, 'light');
    if (r.classes && r.classes[String(n)]) return r.classes[String(n)].slice();
    return Array.from({length: n}, (_, i) => r.lut[Math.round(i * 40 / (n - 1))]);
  }
  const noData = (scaleId, theme) => record(scaleId, theme).noData;
  const zeroOutline = (scaleId, theme) => record(scaleId, theme).zeroOutline;
  /* 135° hatch on the theme no-data colour: a canvas fill that does not look like any class. */
  function hatch(theme, line) {
    const key = theme + (line || '');
    if (patterns[key]) return patterns[key];
    const doc = root.document; if (!doc) return null;
    const c = doc.createElement('canvas'); c.width = c.height = 8;
    const g = c.getContext('2d');
    g.fillStyle = noData('price', theme); g.fillRect(0, 0, 8, 8);
    g.strokeStyle = line || (theme === 'light' ? '#8C968F' : '#6B7872'); g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(6, 10); g.lineTo(10, 6); g.stroke();
    patterns[key] = g.createPattern(c, 'repeat');
    return patterns[key];
  }
  /* Two significant figures keeps legend thresholds exact and readable. */
  function nice(v) {
    if (!Number.isFinite(v) || v === 0) return v;
    const p = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1);
    return Math.round(v / p) * p;
  }
  /* Quantile thresholds on positive finite values; returns n-1 ascending unique cut points. */
  function quantileBreaks(values, n) {
    const v = values.filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
    if (v.length < n) return [...new Set(v.map(nice))].slice(0, n - 1);
    const cuts = [];
    for (let i = 1; i < n; i++) cuts.push(nice(v[Math.min(v.length - 1, Math.floor(i * v.length / n))]));
    return [...new Set(cuts)].filter(x => x > 0);
  }
  function classIndex(value, breaks) {
    let i = 0; while (i < breaks.length && value >= breaks[i]) i++;
    return i;
  }
  /* Diverging: a named neutral band |v| < neutral, then quantiles of |v| on each side. */
  function divergingBreaks(values, sideClasses, neutral) {
    const mags = values.filter(x => Number.isFinite(x) && Math.abs(x) >= neutral).map(Math.abs).sort((a, b) => a - b);
    const cuts = [];
    for (let i = 1; i < sideClasses; i++) cuts.push(nice(mags[Math.min(mags.length - 1, Math.floor(i * mags.length / sideClasses))] || neutral * (i + 1)));
    return [...new Set(cuts)].filter(x => x > neutral);
  }
  function divergingIndex(value, cuts, neutral, sideClasses) {
    if (Math.abs(value) < neutral) return sideClasses;            // neutral class in the middle
    let k = 0; while (k < cuts.length && Math.abs(value) >= cuts[k]) k++;
    return value < 0 ? sideClasses - 1 - k : sideClasses + 1 + k;   // 0..side-1 negative, side+1.. positive
  }
  root.SilaScales = Object.freeze({load, record, classes, noData, zeroOutline, hatch, quantileBreaks, classIndex, divergingBreaks, divergingIndex, nice, version: '1.0.0'});
})(typeof window === 'undefined' ? globalThis : window);
