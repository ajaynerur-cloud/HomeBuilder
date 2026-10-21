// Expressions for Field. Lengths are millimetres. compile() parses once and returns a fast closure, which matters for fields
// that are evaluated at every grid point (a radius that depends on height and angle, for example).
const UNIT = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
const rad = Math.PI / 180;
const F = {
  sin: (d) => Math.sin(d * rad), cos: (d) => Math.cos(d * rad), tan: (d) => Math.tan(d * rad), asin: (x) => Math.asin(x) / rad, acos: (x) => Math.acos(x) / rad,
  atan: (x) => Math.atan(x) / rad, atan2: (a, b) => Math.atan2(a, b) / rad, sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max, pow: Math.pow, exp: Math.exp, log: Math.log,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, mod: (a, b) => a - b * Math.floor(a / b), fract: (x) => x - Math.floor(x),
  mix: (a, b, t) => a + (b - a) * t, clamp: (x, a, b) => Math.min(b, Math.max(a, x)), smoothstep: (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); },
  if: (c, a, b) => (c ? a : b),
};
const CONST = { pi: Math.PI, tau: Math.PI * 2 };

function tokenize(src) {
  const t = []; let i = 0;
  while (i < src.length) {
    const c = src[i]; if (/\s/.test(c)) { i++; continue; }
    const rest = src.slice(i); let m;
    if ((m = /^(\d+\.?\d*|\.\d+)(mm|cm|ft|in|m)?(?![A-Za-z_0-9])/.exec(rest))) { t.push({ k: 'n', v: parseFloat(m[1]) * (m[2] ? UNIT[m[2]] : 1) }); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_][A-Za-z_0-9]*/.exec(rest))) { t.push({ k: 'id', v: m[0] }); i += m[0].length; continue; }
    if ((m = /^(<=|>=|==|!=|[-+*/%^(),<>])/.exec(rest))) { t.push({ k: 'op', v: m[0] }); i += m[0].length; continue; }
    throw new Error('Unexpected "' + c + '"');
  }
  return t;
}

export function compile(src) {
  const t = tokenize(String(src)), vars = new Set(); let p = 0;
  const isOp = (v) => t[p] && t[p].k === 'op' && t[p].v === v;
  function cmp() {
    let a = add();
    while (t[p] && t[p].k === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(t[p].v)) {
      const o = t[p++].v, l = a, r = add();
      a = o === '<' ? (s) => +(l(s) < r(s)) : o === '>' ? (s) => +(l(s) > r(s)) : o === '<=' ? (s) => +(l(s) <= r(s)) : o === '>=' ? (s) => +(l(s) >= r(s)) : o === '==' ? (s) => +(Math.abs(l(s) - r(s)) < 1e-9) : (s) => +(Math.abs(l(s) - r(s)) >= 1e-9);
    }
    return a;
  }
  function add() { let a = mul(); while (isOp('+') || isOp('-')) { const o = t[p++].v, l = a, r = mul(); a = o === '+' ? (s) => l(s) + r(s) : (s) => l(s) - r(s); } return a; }
  function mul() { let a = un(); while (isOp('*') || isOp('/') || isOp('%')) { const o = t[p++].v, l = a, r = un(); a = o === '*' ? (s) => l(s) * r(s) : o === '/' ? (s) => l(s) / r(s) : (s) => l(s) % r(s); } return a; }
  function un() { if (isOp('-')) { p++; const a = un(); return (s) => -a(s); } if (isOp('+')) { p++; return un(); } return pow(); }
  function pow() { const a = prim(); if (isOp('^')) { p++; const r = un(); return (s) => Math.pow(a(s), r(s)); } return a; }
  function prim() {
    const x = t[p++]; if (!x) throw new Error('Unexpected end');
    if (x.k === 'n') { const v = x.v; return () => v; }
    if (x.k === 'id') {
      if (isOp('(')) {
        p++; const args = [];
        if (!isOp(')')) { do { args.push(cmp()); if (isOp(',')) p++; else break; } while (true); }
        if (!isOp(')')) throw new Error('Missing )'); p++;
        const f = F[x.v]; if (!f) throw new Error('Unknown function ' + x.v);
        if (args.length === 1) { const a = args[0]; return (s) => f(a(s)); }
        if (args.length === 2) { const a = args[0], b = args[1]; return (s) => f(a(s), b(s)); }
        if (args.length === 3) { const a = args[0], b = args[1], c = args[2]; return (s) => f(a(s), b(s), c(s)); }
        return (s) => f(...args.map((g) => g(s)));
      }
      if (x.v in CONST) { const v = CONST[x.v]; return () => v; }
      vars.add(x.v); const name = x.v;
      return (s) => { const v = s[name]; if (v === undefined) throw new Error('Unknown name ' + name); return v; };
    }
    if (x.v === '(') { const a = cmp(); if (!isOp(')')) throw new Error('Missing )'); p++; return a; }
    throw new Error('Unexpected ' + x.v);
  }
  const fn = cmp();
  if (p < t.length) throw new Error('Unexpected ' + t[p].v);
  fn.vars = vars; return fn;
}

// A stored value: number, "12.5", "40mm", "=expr" or a bare expression. Returns a function(scope) -> number.
export function valueFn(v) {
  if (typeof v === 'number') return () => v;
  if (v === undefined || v === null || String(v).trim() === '') throw new Error('empty');
  let s = String(v).trim(); if (s[0] === '=') s = s.slice(1);
  const f = compile(s); return f;
}
export function num(v, scope, fallback, errs, label) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'number') return v;
  try { const r = valueFn(v)(scope || {}); if (!isFinite(r)) throw new Error('not a number'); return r; } catch (e) { if (errs) errs.push((label || 'value') + ': ' + e.message); return fallback; }
}
const NAME = /^[A-Za-z_][A-Za-z_0-9]*$/;
export const validName = (n) => NAME.test(n) && !(n in F) && !(n in CONST);

export function resolveParams(list) {
  const values = {}, errors = {}; let pending = (list || []).filter((p) => p && validName(p.name));
  (list || []).forEach((p) => { if (p && !validName(p.name)) errors[p.name || '?'] = 'Invalid name'; });
  for (let pass = 0; pass < 40 && pending.length; pass++) {
    const left = []; let progress = false;
    pending.forEach((p) => { try { const r = valueFn(p.v)(values); if (!isFinite(r)) throw new Error('not a number'); values[p.name] = r; progress = true; delete errors[p.name]; } catch (e) { errors[p.name] = e.message; left.push(p); } });
    pending = left; if (!progress) break;
  }
  return { values, errors };
}
