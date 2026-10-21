// Parametric generators: a vessel (profile revolved around the vertical axis) and a sketch on a plane that is extruded.
import { valueOf } from '../core/params.js';
import { Mesh, fixOrientation, orientConsistently, sub, add, mul, cross, unit, dot } from './mesh.js';

export const val = (v, scope, fb) => { try { return valueOf(v, scope, 'mm'); } catch (e) { return fb; } };

// ---------- curves
function catmull(P, i, t, closed) {
  const n = P.length, g = (k) => (closed ? P[((k % n) + n) % n] : P[Math.max(0, Math.min(n - 1, k))]);
  const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2), t2 = t * t, t3 = t2 * t;
  return [0, 1].map((a) => 0.5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3));
}
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Points on the curve through control points {x,y,corner}. Control points stay as vertices. open: polyline or spline; closed: loop.
export function sampleCurve(ctrl, { smooth = true, samples = 40, closed = false } = {}) {
  const P = ctrl.map((c) => [c.x, c.y]), n = P.length; if (n < 2) return P;
  const segCount = closed ? n : n - 1; let total = 0; for (let i = 0; i < segCount; i++) total += d2(P[i], P[(i + 1) % n]);
  const out = [];
  for (let i = 0; i < segCount; i++) {
    const a = P[i], b = P[(i + 1) % n], L = d2(a, b), k = Math.max(1, Math.round(samples / segCount));   // same pieces per segment, so vertex keys stay put when a size changes
    const sharp = !smooth || ctrl[i].corner || ctrl[(i + 1) % n].corner || n < 3;
    for (let s = 0; s < k; s++) {
      const t = s / k;
      if (sharp && !(ctrl[i].corner === false && ctrl[(i + 1) % n].corner === false && smooth)) out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      else out.push(smoothPoint(P, ctrl, i, t, closed));
    }
  }
  if (!closed) out.push(P[n - 1]);
  return out;
}
// Catmull-Rom that treats corner points as breaks, so a sharp lip stays sharp
function smoothPoint(P, ctrl, i, t, closed) {
  const n = P.length, idx = (k) => (closed ? ((k % n) + n) % n : Math.max(0, Math.min(n - 1, k)));
  const bp = (k) => ctrl[idx(k)].corner;
  const Q = [idx(i - 1), idx(i), idx(i + 1), idx(i + 2)].map((k) => P[k]);
  if (bp(i)) Q[0] = [2 * Q[1][0] - Q[2][0], 2 * Q[1][1] - Q[2][1]];
  if (bp(i + 1)) Q[3] = [2 * Q[2][0] - Q[1][0], 2 * Q[2][1] - Q[1][1]];
  return catmull(Q, 1, t, false);
}

// Offset an open curve to its left by distance t (mitred, limited)
export function offsetCurve(Q, t) {
  const n = Q.length, out = [];
  const nrm = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
  for (let i = 0; i < n; i++) {
    const n1 = i > 0 ? nrm(Q[i - 1], Q[i]) : null, n2 = i < n - 1 ? nrm(Q[i], Q[i + 1]) : null;
    let nx, nz, k = 1;
    if (n1 && n2) { nx = n1[0] + n2[0]; nz = n1[1] + n2[1]; const l = Math.hypot(nx, nz); if (l < 1e-9) { nx = n1[0]; nz = n1[1]; } else { nx /= l; nz /= l; k = Math.min(2.5, 1 / Math.max(0.4, nx * n1[0] + nz * n1[1])); } }
    else { const m = n1 || n2; nx = m[0]; nz = m[1]; }
    out.push([Q[i][0] + nx * t * k, Q[i][1] + nz * t * k]);
  }
  return out;
}

// Near a sharp corner an offset curve can fold back on itself. Drop the points that run against the original direction.
function trimFolds(off, orig) {
  const out = [off[0]]; let last = 0;
  for (let i = 1; i < off.length; i++) {
    const a = out[out.length - 1], dx = off[i][0] - a[0], dz = off[i][1] - a[1], ox = orig[i][0] - orig[last][0], oz = orig[i][1] - orig[last][1];
    if (dx * ox + dz * oz > 1e-9 || i === off.length - 1) { out.push(off[i]); last = i; }
  }
  return out;
}

// ---------- vessel
export function resolveProfile(list, scope) { return (list || []).map((c) => ({ x: Math.max(0, val(c.x, scope, 0)), y: val(c.y, scope, 0), corner: !!c.corner })); }

export function vessel(spec, scope) {
  const N = Math.max(3, Math.round(val(spec.segments, scope, 64))), M = Math.max(8, Math.round(val(spec.samples, scope, 48)));
  const t = Math.max(0, val(spec.thickness, scope, 0)), sweep = Math.max(10, Math.min(360, val(spec.sweep, scope, 360))), closed360 = sweep >= 359.999;
  let pts = resolveProfile(spec.profile, scope); if (pts.length < 2) pts = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 40 }];
  if (pts[0].x > 1e-6) pts.unshift({ x: 0, y: pts[0].y, corner: true });
  const Q = sampleCurve(pts, { smooth: spec.smooth !== false, samples: M });
  const z0 = Math.min(...Q.map((q) => q[1])), eps = 1e-6; let poly;
  if (t > 1e-6) {
    const inner = trimFolds(offsetCurve(Q, t), Q), bt = Math.max(t * 0.25, val(spec.base, scope, t)), zf = z0 + bt, innerClipped = [];
    for (let i = 0; i < inner.length; i++) {
      if (inner[i][1] >= zf - 1e-9) { if (!innerClipped.length && i > 0) { const a = inner[i - 1], b = inner[i], u = (zf - a[1]) / ((b[1] - a[1]) || 1); innerClipped.push([a[0] + (b[0] - a[0]) * u, zf]); } innerClipped.push(inner[i]); }
    }
    if (innerClipped.length < 2) poly = Q.concat([[0, Q[Q.length - 1][1]]]);
    else { if (innerClipped[0][0] > eps) innerClipped.unshift([0, zf]); else innerClipped[0] = [0, zf]; poly = Q.concat(innerClipped.slice().reverse()); }
  } else { poly = Q.slice(); const last = poly[poly.length - 1]; if (last[0] > eps) poly.push([0, last[1]]); }
  // drop duplicate neighbours
  const clean = []; poly.forEach((p) => { const q = clean[clean.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7) clean.push(p); }); poly = clean;
  if (Math.hypot(poly[0][0] - poly[poly.length - 1][0], poly[0][1] - poly[poly.length - 1][1]) < 1e-7) poly.pop();
  const m = new Mesh(), P = poly.length, cols = closed360 ? N : N + 1, idx = [];
  for (let i = 0; i < P; i++) {
    idx.push([]);
    if (poly[i][0] < eps) { const v = m.addV([0, 0, poly[i][1]], 'p' + i); for (let j = 0; j < cols; j++) idx[i].push(v); }
    else for (let j = 0; j < cols; j++) { const th = (sweep * Math.PI / 180) * j / N; idx[i].push(m.addV([poly[i][0] * Math.cos(th), poly[i][0] * Math.sin(th), poly[i][1]], 'v' + i + '_' + (closed360 ? j % N : j))); }
  }
  for (let i = 0; i < P; i++) {
    const i2 = (i + 1) % P; if (poly[i][0] < eps && poly[i2][0] < eps) continue;
    for (let j = 0; j < N; j++) {
      const j2 = closed360 ? (j + 1) % N : j + 1, L = [idx[i][j], idx[i][j2], idx[i2][j2], idx[i2][j]].filter((v, k, a) => v !== a[(k + 1) % 4]);
      if (L.length >= 3) m.addF(L);
    }
  }
  if (!closed360) {
    const ring = (j) => { const L = []; for (let i = 0; i < P; i++) { const v = idx[i][j]; if (L[L.length - 1] !== v) L.push(v); } if (L[0] === L[L.length - 1]) L.pop(); return L; };
    m.addF(ring(0).reverse()); m.addF(ring(N));
  }
  orientConsistently(m); return fixOrientation(m);
}

// ---------- planes and sketch extrusion
export function planeBasis(pl, scope) {
  const kind = (pl && pl.kind) || 'XY', off = val(pl && pl.offset, scope, 0);
  let U, V;
  if (kind === 'XZ') { U = [1, 0, 0]; V = [0, 0, 1]; } else if (kind === 'YZ') { U = [0, 1, 0]; V = [0, 0, 1]; } else { U = [1, 0, 0]; V = [0, 1, 0]; }
  let N = cross(U, V); const origin = [0, 0, 0];
  if (kind === 'custom' || (pl && (pl.tiltX || pl.tiltY))) {
    const ax = (val(pl.tiltX, scope, 0)) * Math.PI / 180, ay = (val(pl.tiltY, scope, 0)) * Math.PI / 180;
    const rx = (p) => [p[0], p[1] * Math.cos(ax) - p[2] * Math.sin(ax), p[1] * Math.sin(ax) + p[2] * Math.cos(ax)], ry = (p) => [p[0] * Math.cos(ay) + p[2] * Math.sin(ay), p[1], -p[0] * Math.sin(ay) + p[2] * Math.cos(ay)];
    U = ry(rx(U)); V = ry(rx(V)); N = cross(U, V);
  }
  const o = pl && pl.origin ? pl.origin.map((v) => val(v, scope, 0)) : origin;
  return { U, V, N, o: add(o, mul(N, off)) };
}

function polygonOffset(R, d) {   // inward offset of a closed CCW ring by d (mitre)
  const n = R.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = R[(i - 1 + n) % n], p1 = R[i], p2 = R[(i + 1) % n];
    const e1 = unit([p1[0] - p0[0], p1[1] - p0[1], 0]), e2 = unit([p2[0] - p1[0], p2[1] - p1[1], 0]), n1 = [-e1[1], e1[0]], n2 = [-e2[1], e2[0]], den = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    const k = den > 0.15 ? d / den : d / 2; out.push([p1[0] + (n1[0] + n2[0]) * k, p1[1] + (n1[1] + n2[1]) * k]);
  }
  return out;
}
function ringArea(R) { let a = 0; for (let i = 0; i < R.length; i++) { const p = R[i], q = R[(i + 1) % R.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }

export function extrudeSketch(spec, scope) {
  const H = Math.max(0.1, val(spec.height, scope, 50)), S = Math.max(1, Math.round(val(spec.steps, scope, 24))), taper = val(spec.taper, scope, 1), twist = val(spec.twist, scope, 0), wall = Math.max(0, val(spec.thickness, scope, 0));
  let ctrl = (spec.sketch || []).map((c) => ({ x: val(c.x, scope, 0), y: val(c.y, scope, 0), corner: !!c.corner }));
  if (ctrl.length < 3) ctrl = [{ x: -20, y: -20, corner: true }, { x: 20, y: -20, corner: true }, { x: 20, y: 20, corner: true }, { x: -20, y: 20, corner: true }];
  if (ringArea(ctrl.map((c) => [c.x, c.y])) < 0) ctrl.reverse();
  const sopt = { smooth: spec.smooth === true, samples: Math.round(val(spec.samples, scope, 48)), closed: true };
  const R = sampleCurve(ctrl, sopt);
  const bx = [Math.min(...R.map((p) => p[0])), Math.max(...R.map((p) => p[0]))], by = [Math.min(...R.map((p) => p[1])), Math.max(...R.map((p) => p[1]))], c = [(bx[0] + bx[1]) / 2, (by[0] + by[1]) / 2];
  const B = planeBasis(spec.plane, scope), m = new Mesh();
  const at = (r, t, w) => { const sc = 1 + (taper - 1) * t, a = twist * t * Math.PI / 180, x = (r[0] - c[0]) * sc, y = (r[1] - c[1]) * sc; const u = c[0] + x * Math.cos(a) - y * Math.sin(a), v = c[1] + x * Math.sin(a) + y * Math.cos(a); return add(add(B.o, mul(B.U, u)), add(mul(B.V, v), mul(B.N, w))); };
  const n = R.length, ring = [];
  for (let k = 0; k <= S; k++) { ring.push(R.map((r, j) => m.addV(at(r, k / S, H * k / S), 'e' + k + '_' + j))); }
  for (let k = 0; k < S; k++) for (let j = 0; j < n; j++) m.addF([ring[k][j], ring[k][(j + 1) % n], ring[k + 1][(j + 1) % n], ring[k + 1][j]]);
  if (wall > 1e-6) {
    const ctrlI = polygonOffset(ctrl.map((c) => [c.x, c.y]), wall).map((p, i) => ({ x: p[0], y: p[1], corner: ctrl[i].corner })), Ri = sampleCurve(ctrlI, sopt), fl = Math.min(H * 0.8, Math.max(wall, val(spec.base, scope, wall))), Si = Math.max(1, Math.round(S * (H - fl) / H)), inner = [];
    for (let k = 0; k <= Si; k++) { const w = fl + (H - fl) * k / Si; inner.push(Ri.map((r, j) => m.addV(at(r, w / H, w), 'i' + k + '_' + j))); }
    for (let k = 0; k < Si; k++) for (let j = 0; j < n; j++) m.addF([inner[k][j], inner[k + 1][j], inner[k + 1][(j + 1) % n], inner[k][(j + 1) % n]]);
    for (let j = 0; j < n; j++) m.addF([ring[S][j], ring[S][(j + 1) % n], inner[Si][(j + 1) % n], inner[Si][j]]);
    m.addF(ring[0].slice().reverse()); m.addF(inner[0].slice());
  } else { m.addF(ring[0].slice().reverse()); m.addF(ring[S].slice()); }
  orientConsistently(m); return fixOrientation(m);
}

export function box(spec, scope) {
  const w = val(spec.w, scope, 40), d = val(spec.d, scope, 40), h = val(spec.h, scope, 40), m = new Mesh();
  const c = [[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0], [0, 0, h], [w, 0, h], [w, d, h], [0, d, h]].map((p, i) => m.addV([p[0] - w / 2, p[1] - d / 2, p[2]], 'b' + i));
  [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]].forEach((f) => m.addF(f.map((i) => c[i])));
  return fixOrientation(m);
}

export function bakedMesh(gen) { const m = new Mesh(); (gen.v || []).forEach((a) => m.addV(a.p, a.k)); (gen.f || []).forEach((f) => m.addF(f)); return m; }

export function generate(gen, scope) {
  if (gen.type === 'mesh') return bakedMesh(gen);
  if (gen.type === 'extrude') return extrudeSketch(gen, scope);
  if (gen.type === 'box') return box(gen, scope);
  return vessel(gen, scope);
}
export { sub, dot };
