// Kiln solver. The design is a point in a space of free dimensions (sketch radii and heights, section values, relief amounts,
// unlocked parameters). Intent drag asks for one surface point to move; a damped Gauss-Newton step finds the smallest change of
// all free dimensions that moves it there while every active engineering constraint is held.
import { resolve, CTYPES, isExpr } from './model.js';
import { evaluate, sampleGrid, clamp } from './engine.js';

const isNum = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isExpr(v) && isFinite(+v));
const asNum = (v) => +v;
// free dimensions of a document. Each one knows how to read and write itself.
export function freeVars(doc, opt = {}) {
  const V = [], P = doc.profile, pin = opt.pin || {};
  P.forEach((p, i) => {
    if (isNum(p.r) && !p.lockR && !pin['r' + i]) V.push({ key: 'r' + i, label: 'Radius at point ' + (i + 1), group: 'Sketch', scale: 6, lo: 4, hi: 140, get: () => asNum(p.r), set: (x) => { p.r = +x.toFixed(3); } });
    if (i > 0 && i < P.length - 1 && isNum(p.z) && !p.lockZ && !pin['z' + i]) V.push({ key: 'z' + i, label: 'Height of point ' + (i + 1), group: 'Sketch', scale: 6, lo: -1e9, hi: 1e9, zIndex: i, get: () => asNum(p.z), set: (x) => { p.z = +x.toFixed(3); } });
  });
  const s = doc.section;
  if (isNum(s.corners) && !s.lockCorners) V.push({ key: 'corners', label: 'Corners', group: 'Section', scale: 0.12, lo: 0, hi: 1, get: () => asNum(s.corners), set: (x) => { s.corners = +x.toFixed(4); } });
  if (isNum(s.ripple) && !s.lockRipple) V.push({ key: 'ripple', label: 'Ripple depth', group: 'Section', scale: 0.03, lo: 0, hi: 0.3, get: () => asNum(s.ripple), set: (x) => { s.ripple = +x.toFixed(4); } });
  if (isNum(s.twist) && !s.lockTwist) V.push({ key: 'twist', label: 'Twist', group: 'Section', scale: 20, lo: -360, hi: 360, get: () => asNum(s.twist), set: (x) => { s.twist = +x.toFixed(2); } });
  doc.reliefs.forEach((f, i) => { if (f.on !== false && isNum(f.amount) && !f.lock) V.push({ key: 'f' + f.id, label: 'Relief ' + (i + 1), group: 'Relief', scale: 5, lo: -40, hi: 60, get: () => asNum(f.amount), set: (x) => { f.amount = +x.toFixed(3); } }); });
  doc.params.forEach((p) => { if (!p.lock && !pin['p' + p.name] && isNum(p.v)) V.push({ key: 'p' + p.name, label: 'Parameter ' + p.name, group: 'Parameters', scale: 6, lo: 0.1, hi: 1e4, get: () => asNum(p.v), set: (x) => { p.v = +x.toFixed(3); } }); });
  // keep sketch points in order
  V.forEach((v) => { if (v.zIndex !== undefined) { const i = v.zIndex; v.bounds = () => { const zs = resolve(doc).D.pts; return [zs[i - 1].z + 3, zs[i + 1].z - 3]; }; } });
  return V;
}
// residual vector for the current document state
function residuals(doc, goals, res, pinVals) {
  const { D } = resolve(doc), e = evaluate(D, res, res), r = [], a = e.a;
  goals.forEach((g) => {
    if (g.kind === 'point') { const p = sampleGrid(e.P, e.U, e.M, g.u * e.U, g.v * e.M); for (let c = 0; c < 3; c++) if (g.mask[c]) r.push((p[c] - g.target[c]) * g.w); }
    else if (g.kind === 'var') r.push((g.v.get() - g.target) / g.v.scale * g.w);
    else if (g.kind === 'con') { const T = CTYPES[g.c.type], v = T.get(a); if (g.c.op === '=') r.push((v - g.c.value) / T.scale * g.w); else if (g.active) r.push((v - g.limit) / T.scale * g.w); else r.push(0); }
  });
  return { r, a };
}
function solveSym(A, b) { // Gaussian elimination with partial pivoting
  const n = b.length, M = A.map((row, i) => row.concat([b[i]]));
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c] || 1e-12; for (let r = c + 1; r < n; r++) { const f = M[r][c] / d; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
  const x = new Array(n).fill(0); for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / (M[r][r] || 1e-12); } return x;
}
const norm2 = (r) => r.reduce((s, x) => s + x * x, 0);
// one damped Gauss-Newton step with an active set for the inequality constraints
export function step(doc, opt) {
  const res = opt.res || 24, vars = freeVars(doc, opt), lambda = opt.lambda == null ? 0.15 : opt.lambda, emph = opt.emphasis || {};
  if (!vars.length) return { ok: false, reason: 'Everything is locked or driven by an equation.', vars };
  const goals = [];
  if (opt.point) goals.push({ kind: 'point', u: opt.point.u, v: opt.point.v, target: opt.point.target, mask: opt.point.mask || [1, 1, 1], w: opt.point.w || 1 });
  (opt.varGoals || []).forEach((g) => { const v = vars.find((x) => x.key === g.key) || g.v; if (v) goals.push({ kind: 'var', v, target: g.target, w: g.w || 4 }); });
  const base = residuals(doc, [], res).a, cons = (doc.constraints || []).filter((c) => c.on);
  cons.forEach((c) => { const T = CTYPES[c.type], v = T.get(base), w = opt.conW || 3, m = T.margin != null ? T.margin : T.scale * 0.35;
    if (c.op === '=') goals.push({ kind: 'con', c, w }); else { const viol = c.op === '<=' ? v > c.value - m : v < c.value + m; goals.push({ kind: 'con', c, w, active: viol, limit: c.op === '<=' ? c.value - m : c.value + m }); } });
  const x0 = vars.map((v) => v.get()), f0 = residuals(doc, goals, res).r, n = vars.length, m = f0.length, J = [];
  for (let i = 0; i < n; i++) { const h = vars[i].scale * 0.04; vars[i].set(x0[i] + h); const fi = residuals(doc, goals, res).r; vars[i].set(x0[i]); J.push(fi.map((y, k) => (y - f0[k]) / 0.04)); }
  const A = [], b = [];
  for (let i = 0; i < n; i++) { A.push([]); let s = 0; for (let k = 0; k < m; k++) s -= J[i][k] * f0[k]; b.push(s); for (let j = 0; j < n; j++) { let t = 0; for (let k = 0; k < m; k++) t += J[i][k] * J[j][k]; A[i].push(t + (i === j ? (emph[vars[i].key] != null ? emph[vars[i].key] : lambda) : 0)); } }
  const dx = solveSym(A, b), e0 = norm2(f0); let tau = 1, e1 = Infinity, applied = null;
  for (let tries = 0; tries < 4; tries++) {
    vars.forEach((v, i) => { let x = x0[i] + clamp(dx[i] * tau, -2.5, 2.5) * v.scale; let [lo, hi] = v.bounds ? v.bounds() : [v.lo, v.hi]; lo = Math.max(lo, v.lo); hi = Math.min(hi, v.hi); v.set(clamp(x, lo, hi)); });
    e1 = norm2(residuals(doc, goals, res).r); if (e1 <= e0 || tries === 3) { applied = vars.map((v, i) => ({ key: v.key, label: v.label, group: v.group, d: (v.get() - x0[i]) / v.scale, value: v.get() })); if (e1 > e0) { vars.forEach((v, i) => v.set(x0[i])); applied = null; } break; }
    tau *= 0.5;
  }
  return { ok: true, before: e0, after: e1, deltas: applied || [], vars };
}
// keep moving one surface point toward a target (called on every pointer move)
export function intentDrag(doc, point, opt = {}) { let last = null, acc = {}; const iters = opt.iters || 1; for (let i = 0; i < iters; i++) { last = step(doc, { ...opt, point }); (last.deltas || []).forEach((d) => { acc[d.key] = acc[d.key] || { ...d, d: 0 }; acc[d.key].d += d.d; acc[d.key].value = d.value; }); } return { ...last, deltas: Object.values(acc) }; }
// pull the design back inside every active constraint with the smallest change
export function satisfy(doc, opt = {}) {
  let r = null; const its = opt.iters || 10;
  for (let i = 0; i < its; i++) { r = step(doc, { ...opt, lambda: opt.lambda == null ? 0.05 : opt.lambda, res: opt.res || 32 }); if (!r.ok || r.after < 1e-4 || (r.before - r.after) < 1e-5) break; }
  return r;
}
export { isNum };
