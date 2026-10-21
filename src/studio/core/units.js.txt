// Lengths are stored in feet. These helpers read and show lengths in ft-in, mm or m.
export const FT_MM = 304.8;
export const ftToMm = (ft) => ft * FT_MM;
export const mmToFt = (mm) => mm / FT_MM;
export const sqftToSqm = (a) => a * 0.09290304;

const UNIT_FT = { mm: 1 / FT_MM, cm: 10 / FT_MM, m: 1000 / FT_MM, in: 1 / 12, '"': 1 / 12, ft: 1, "'": 1 };

export function parseLength(input, defUnit = 'ft') {
  if (typeof input === 'number') return input;
  let s = String(input == null ? '' : input).trim().toLowerCase().replace(/[′’]/g, "'").replace(/[″”]/g, '"');
  if (!s) return NaN;
  let m = s.match(/^(-?)\s*(\d+(?:\.\d+)?)\s*'\s*-?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in)?(?:\s*(\d+)\s*\/\s*(\d+))?)?\s*$/);
  if (m) {
    let inch = m[3] ? parseFloat(m[3]) : 0;
    if (m[4] && m[5] && +m[5]) inch += +m[4] / +m[5];
    const v = parseFloat(m[2]) + inch / 12;
    return m[1] ? -v : v;
  }
  m = s.match(/^(-?\d*\.?\d+)\s*(mm|cm|m|in|ft|"|')?$/);
  if (m) return parseFloat(m[1]) * UNIT_FT[m[2] || defUnit];
  return NaN;
}

function frac(inch) {
  const r = Math.round(inch * 8) / 8;
  const w = Math.floor(r + 1e-9), f = Math.round((r - w) * 8);
  const names = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];
  return (w || !f ? String(w) : '') + names[f];
}

export function formatLength(ft, mode = 'ftin') {
  if (!isFinite(ft)) return '–';
  if (mode === 'mm') return Math.round(ft * FT_MM) + ' mm';
  if (mode === 'm') return (ft * 0.3048).toFixed(3) + ' m';
  if (mode === 'ft') return (Math.round(ft * 1000) / 1000) + ' ft';
  const neg = ft < 0, a = Math.abs(ft);
  let f = Math.floor(a + 1e-9), inch = (a - f) * 12;
  if (Math.round(inch * 8) / 8 >= 12) { f += 1; inch = 0; }
  const body = f + '′-' + frac(inch) + '″';
  return (neg ? '−' : '') + body;
}

export function fmtArea(sqft, mode = 'ftin') {
  return mode === 'mm' || mode === 'm' ? (sqft * 0.09290304).toFixed(2) + ' m²' : (Math.round(sqft * 10) / 10) + ' sq ft';
}
