// Constrained 2D sketch: points, lines, circles and arcs held by geometric and dimensional constraints, solved by damped least squares.
let n = 0; export const sid = (p) => p + (Date.now() % 1e7).toString(36) + (n++).toString(36);
export function newSketch(plane = 'XY', offset = 0) { return { plane, offset, points: [], lines: [], circles: [], arcs: [], splines: [], cons: [] }; }
export const CON_TYPES = {
  coincident: 'Coincident', horizontal: 'Horizontal', vertical: 'Vertical', parallel: 'Parallel', perpendicular: 'Perpendicular', equal: 'Equal', fix: 'Fixed', tangent: 'Tangent', onLine: 'Point on line', midpoint: 'Midpoint',
  length: 'Length', distance: 'Distance', hdist: 'Horizontal distance', vdist: 'Vertical distance', radius: 'Radius', angle: 'Angle',
};
export const DIMENSIONAL = new Set(['length', 'distance', 'hdist', 'vdist', 'radius', 'angle']);
const byId = (arr, id) => arr.find((e) => e.id === id);
// variables: every point's x and y, every circle's radius
function vars(sk) { const V = []; sk.points.forEach((p) => { V.push({ o: p, k: 'x' }, { o: p, k: 'y' }); }); sk.circles.forEach((c) => V.push({ o: c, k: 'r' })); return V; }
// residuals of every constraint; value(c) turns a dimension (number or expression) into a number
export function residuals(sk, value) {
  const P = (id) => byId(sk.points, id), L = (id) => byId(sk.lines, id), C = (id) => byId(sk.circles, id) || arcAsCircle(sk, id), out = [];
  const dir = (l) => { const a = P(l.a), b = P(l.b); return [b.x - a.x, b.y - a.y]; }, len = (d) => Math.hypot(d[0], d[1]) || 1e-12;
  sk.arcs.forEach((a) => { const c = P(a.c), s = P(a.a), e = P(a.b); out.push(Math.hypot(s.x - c.x, s.y - c.y) - Math.hypot(e.x - c.x, e.y - c.y)); });
  sk.cons.forEach((c) => {
    const r = c.refs, v = DIMENSIONAL.has(c.type) ? value(c) : 0;
    try {
      switch (c.type) {
        case 'coincident': { const a = P(r[0]), b = P(r[1]); out.push(a.x - b.x, a.y - b.y); break; }
        case 'horizontal': { const l = L(r[0]); out.push(P(l.a).y - P(l.b).y); break; }
        case 'vertical': { const l = L(r[0]); out.push(P(l.a).x - P(l.b).x); break; }
        case 'parallel': { const d1 = dir(L(r[0])), d2 = dir(L(r[1])); out.push((d1[0] * d2[1] - d1[1] * d2[0]) / (len(d1) * len(d2))); break; }
        case 'perpendicular': { const d1 = dir(L(r[0])), d2 = dir(L(r[1])); out.push((d1[0] * d2[0] + d1[1] * d2[1]) / (len(d1) * len(d2))); break; }
        case 'equal': { if (L(r[0]) && L(r[1])) out.push(len(dir(L(r[0]))) - len(dir(L(r[1])))); else out.push(C(r[0]).r - C(r[1]).r); break; }
        case 'fix': { const p = P(r[0]); out.push(p.x - c.x0, p.y - c.y0); break; }
        case 'onLine': { const p = P(r[0]), l = L(r[1]), a = P(l.a), d = dir(l); out.push((d[0] * (p.y - a.y) - d[1] * (p.x - a.x)) / len(d)); break; }
        case 'midpoint': { const p = P(r[0]), l = L(r[1]), a = P(l.a), b = P(l.b); out.push(p.x - (a.x + b.x) / 2, p.y - (a.y + b.y) / 2); break; }
        case 'tangent': { const l = L(r[0]), ci = C(r[1]), a = P(l.a), d = dir(l), cc = P(ci.c); out.push(Math.abs(d[0] * (cc.y - a.y) - d[1] * (cc.x - a.x)) / len(d) - ci.r); break; }
        case 'length': out.push(len(dir(L(r[0]))) - v); break;
        case 'distance': { const a = P(r[0]), b = P(r[1]); out.push(Math.hypot(b.x - a.x, b.y - a.y) - v); break; }
        case 'hdist': { const a = P(r[0]), b = P(r[1]); out.push(Math.abs(b.x - a.x) - v); break; }
        case 'vdist': { const a = P(r[0]), b = P(r[1]); out.push(Math.abs(b.y - a.y) - v); break; }
        case 'radius': out.push(C(r[0]).r - v); break;
        case 'angle': { const d1 = dir(L(r[0])), d2 = dir(L(r[1])); let g = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]) * 180 / Math.PI; g = Math.abs(g); out.push((Math.min(g, 180 - g) - Math.min(v, 180 - v)) * Math.PI / 180 * 10); break; }
      }
    } catch (e) { /* a reference was deleted: the constraint is ignored */ }
  });
  return out;
}
function arcAsCircle(sk, id) { const a = byId(sk.arcs, id); if (!a) return null; const c = byId(sk.points, a.c), s = byId(sk.points, a.a); return { c: a.c, r: Math.hypot(s.x - c.x, s.y - c.y) }; }
function solveLin(A, b) { const n2 = b.length, M = A.map((row, i) => row.concat([b[i]])); for (let c = 0; c < n2; c++) { let p = c; for (let r = c + 1; r < n2; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; const d = M[c][c] || 1e-12; for (let r = c + 1; r < n2; r++) { const f = M[r][c] / d; if (f) for (let k = c; k <= n2; k++) M[r][k] -= f * M[c][k]; } } const x = new Array(n2).fill(0); for (let r = n2 - 1; r >= 0; r--) { let s = M[r][n2]; for (let k = r + 1; k < n2; k++) s -= M[r][k] * x[k]; x[r] = s / (M[r][r] || 1e-12); } return x; }
// solve: constraints are hard (weight 1), drag goals {point, x, y} are soft
export function solve(sk, value, opt = {}) {
  const V = vars(sk), goals = opt.goals || [], nv = V.length; if (!nv) return { ok: true, err: 0 };
  const F = () => { const r = residuals(sk, value).map((x) => x * 40); goals.forEach((g) => { const p = byId(sk.points, g.point); if (p) r.push((p.x - g.x) * 0.6, (p.y - g.y) * 0.6); }); return r; };
  let lambda = 1e-3, f0 = F(), e0 = f0.reduce((s, x) => s + x * x, 0);
  for (let it = 0; it < (opt.iters || 60) && e0 > 1e-14; it++) {
    const x0 = V.map((v) => v.o[v.k]), J = [];
    for (let i = 0; i < nv; i++) { const h = 1e-6 * Math.max(1, Math.abs(x0[i])); V[i].o[V[i].k] = x0[i] + h; const fi = F(); V[i].o[V[i].k] = x0[i]; J.push(fi.map((y, k) => (y - f0[k]) / h)); }
    const A = [], b = []; for (let i = 0; i < nv; i++) { A.push([]); let s = 0; for (let k = 0; k < f0.length; k++) s -= J[i][k] * f0[k]; b.push(s); for (let j = 0; j < nv; j++) { let t = 0; for (let k = 0; k < f0.length; k++) t += J[i][k] * J[j][k]; A[i].push(t + (i === j ? lambda * (1 + t) + 1e-9 : 0)); } }
    const dx = solveLin(A, b); V.forEach((v, i) => { v.o[v.k] = x0[i] + dx[i]; }); const f1 = F(), e1 = f1.reduce((s, x) => s + x * x, 0);
    if (e1 < e0) { f0 = f1; e0 = e1; lambda = Math.max(1e-9, lambda * 0.3); } else { V.forEach((v, i) => { v.o[v.k] = x0[i]; }); lambda *= 10; if (lambda > 1e8) break; }
  }
  sk.circles.forEach((c) => { c.r = Math.abs(c.r); });
  const cr = residuals(sk, value), err = Math.sqrt(cr.reduce((s, x) => s + x * x, 0) / Math.max(1, cr.length));
  return { ok: err < 1e-5, err };
}
// degrees of freedom left = variables minus the rank of the constraint Jacobian
export function dof(sk, value) {
  const V = vars(sk), nv = V.length, r0 = residuals(sk, value), m = r0.length; if (!nv) return 0; if (!m) return nv;
  const J = []; for (let k = 0; k < m; k++) J.push(new Array(nv).fill(0));
  V.forEach((v, i) => { const x0 = v.o[v.k], h = 1e-6 * Math.max(1, Math.abs(x0)); v.o[v.k] = x0 + h; const ri = residuals(sk, value); v.o[v.k] = x0; for (let k = 0; k < m; k++) J[k][i] = (ri[k] - r0[k]) / h; });
  let rank = 0; const A = J.map((row) => row.slice()), used = new Array(m).fill(false);
  for (let c = 0; c < nv; c++) { let p = -1, best = 1e-7; for (let r = 0; r < m; r++) if (!used[r] && Math.abs(A[r][c]) > best) { best = Math.abs(A[r][c]); p = r; } if (p < 0) continue; used[p] = true; rank++; for (let r = 0; r < m; r++) if (r !== p) { const f = A[r][c] / A[p][c]; if (f) for (let k = c; k < nv; k++) A[r][k] -= f * A[p][k]; } }
  return nv - rank;
}
// closed loops for profiles (lines and arcs chained through points, coincident points merged) plus whole circles
export function loops(sk) {
  const par = {}; sk.points.forEach((p) => { par[p.id] = p.id; }); const find = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  sk.cons.filter((c) => c.type === 'coincident').forEach((c) => { const a = find(c.refs[0]), b = find(c.refs[1]); if (a && b) par[a] = b; });
  const segs = sk.lines.filter((l) => !l.construction).map((l) => ({ kind: 'line', a: find(l.a), b: find(l.b), ra: l.a, rb: l.b, ref: l })).concat(sk.arcs.filter((a) => !a.construction).map((a) => ({ kind: 'arc', a: find(a.a), b: find(a.b), ra: a.a, rb: a.b, ref: a })), (sk.splines || []).filter((sp) => !sp.construction && sp.pts.length >= 2).map((sp) => ({ kind: 'spline', a: find(sp.pts[0]), b: find(sp.pts[sp.pts.length - 1]), ra: sp.pts[0], rb: sp.pts[sp.pts.length - 1], ref: sp })));
  const used = new Set(), out = [], open = [];
  segs.forEach((s0, i0) => {
    if (used.has(i0)) return; const chain = [{ s: s0, fwd: true }]; used.add(i0); let end = s0.b, guard = 0;
    while (end !== s0.a && guard++ < 500) { const j = segs.findIndex((s, i) => !used.has(i) && (s.a === end || s.b === end)); if (j < 0) break; used.add(j); const fwd = segs[j].a === end; chain.push({ s: segs[j], fwd }); end = fwd ? segs[j].b : segs[j].a; }
    (end === s0.a ? out : open).push(chain);
  });
  return { closed: out, open, circles: sk.circles.filter((c) => !c.construction) };
}
export { byId };
