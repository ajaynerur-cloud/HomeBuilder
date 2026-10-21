// Named parameters and a small safe expression language (no eval).
import { parseLength } from './units.js';

const UNITS = { ft: { mm: 1 / 304.8, cm: 10 / 304.8, m: 1000 / 304.8, in: 1 / 12, ft: 1 }, mm: { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 } };
const FUNCS = {
  min: Math.min, max: Math.max, round: Math.round, floor: Math.floor, ceil: Math.ceil, abs: Math.abs, sqrt: Math.sqrt,
  sin: (d) => Math.sin(d * Math.PI / 180), cos: (d) => Math.cos(d * Math.PI / 180), tan: (d) => Math.tan(d * Math.PI / 180),
  atan2: (a, b) => Math.atan2(a, b) * 180 / Math.PI, pow: Math.pow, if: (c, a, b) => (c ? a : b),
};

function tokenize(src, UNIT) {
  const t = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    let m;
    if ((m = /^(\d+\.?\d*|\.\d+)(mm|cm|ft|in|m)?(?![A-Za-z_0-9])/.exec(src.slice(i)))) {
      t.push({ k: 'n', v: parseFloat(m[1]) * (m[2] ? UNIT[m[2]] : 1) }); i += m[0].length; continue;
    }
    if ((m = /^[A-Za-z_][A-Za-z_0-9]*/.exec(src.slice(i)))) { t.push({ k: 'id', v: m[0] }); i += m[0].length; continue; }
    if ((m = /^(<=|>=|==|!=|[-+*/%^(),<>])/.exec(src.slice(i)))) { t.push({ k: 'op', v: m[0] }); i += m[0].length; continue; }
    throw new Error('Unexpected "' + c + '"');
  }
  return t;
}

export function evaluate(src, scope = {}, units = 'ft') {
  const t = tokenize(String(src), UNITS[units] || UNITS.ft); let p = 0;
  const peek = () => t[p], next = () => t[p++];
  const isOp = (v) => t[p] && t[p].k === 'op' && t[p].v === v;
  function cmp() {
    let a = add();
    while (t[p] && t[p].k === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(t[p].v)) {
      const o = next().v, b = add();
      a = o === '<' ? +(a < b) : o === '>' ? +(a > b) : o === '<=' ? +(a <= b) : o === '>=' ? +(a >= b) : o === '==' ? +(Math.abs(a - b) < 1e-9) : +(Math.abs(a - b) >= 1e-9);
    }
    return a;
  }
  function add() { let a = mul(); while (isOp('+') || isOp('-')) { const o = next().v, b = mul(); a = o === '+' ? a + b : a - b; } return a; }
  function mul() { let a = pow(); while (isOp('*') || isOp('/') || isOp('%')) { const o = next().v, b = pow(); a = o === '*' ? a * b : o === '/' ? a / b : a % b; } return a; }
  function pow() { const a = un(); if (isOp('^')) { next(); return Math.pow(a, pow()); } return a; }
  function un() { if (isOp('-')) { next(); return -un(); } if (isOp('+')) { next(); return un(); } return prim(); }
  function prim() {
    const x = next();
    if (!x) throw new Error('Unexpected end');
    if (x.k === 'n') return x.v;
    if (x.k === 'id') {
      if (isOp('(')) {
        next(); const args = [];
        if (!isOp(')')) { do { args.push(cmp()); if (isOp(',')) next(); else break; } while (true); }
        if (!isOp(')')) throw new Error('Missing )'); next();
        const f = FUNCS[x.v]; if (!f) throw new Error('Unknown function ' + x.v);
        return f(...args);
      }
      if (x.v === 'pi') return Math.PI;
      if (Object.prototype.hasOwnProperty.call(scope, x.v)) { const v = scope[x.v]; if (typeof v === 'number' && isFinite(v)) return v; throw new Error(x.v + ' has no value'); }
      throw new Error('Unknown name ' + x.v);
    }
    if (x.v === '(') { const a = cmp(); if (!isOp(')')) throw new Error('Missing )'); next(); return a; }
    throw new Error('Unexpected ' + x.v);
  }
  const r = cmp();
  if (p < t.length) throw new Error('Unexpected ' + t[p].v);
  if (!isFinite(r)) throw new Error('Not a number');
  return r;
}

const NAME = /^[A-Za-z_][A-Za-z_0-9]*$/;
export const validName = (n) => NAME.test(n) && !FUNCS[n] && n !== 'pi';

// params: [{name, v, note}] where v is a number, a length ("230mm", "3'6\"") or an expression ("=wallOut/2")
export function valueOf(v, scope, units = 'ft') {
  if (typeof v === 'number') return v;
  if (v == null || v === '') throw new Error('empty');
  const s = String(v).trim();
  if (s[0] === '=') return evaluate(s.slice(1), scope, units);
  const n = parseLength(s, units === 'mm' ? 'mm' : 'ft') * (units === 'mm' ? 304.8 : 1);
  if (isNaN(n)) { try { return evaluate(s, scope, units); } catch (e) { throw new Error('Cannot read "' + s + '"'); } }
  return n;
}

export function resolveParams(list, units = 'ft') {
  const values = {}, errors = {}; let pending = (list || []).filter((p) => p && validName(p.name));
  (list || []).forEach((p) => { if (p && !validName(p.name)) errors[p.name || '?'] = 'Invalid name'; });
  for (let pass = 0; pass < 40 && pending.length; pass++) {
    const left = []; let progress = false;
    pending.forEach((p) => {
      try { values[p.name] = valueOf(p.v, values, units); progress = true; delete errors[p.name]; } catch (e) { errors[p.name] = e.message; left.push(p); }
    });
    pending = left; if (!progress) break;
  }
  pending.forEach((p) => { errors[p.name] = errors[p.name] || 'Cannot resolve'; });
  return { values, errors };
}

// Number for a model field: number, length text, or "=expression" (with parameters in scope)
export function num(v, scope, fallback, errors, label, units = 'ft') {
  if (v === undefined || v === null || v === '') return fallback;
  try { return valueOf(v, scope, units); } catch (e) { if (errors) errors.push((label || 'value') + ': ' + e.message); return fallback; }
}
