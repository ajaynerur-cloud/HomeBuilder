// Sketches: closed profiles (and open curves) drawn on a plane, in millimetres. They resolve to point loops.
import { num } from './expr.js';

const TAU = Math.PI * 2;
function rot2(pts, deg, cx = 0, cy = 0) { if (!deg) return pts; const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return pts.map((p) => [cx + (p[0] - cx) * c - (p[1] - cy) * s, cy + (p[0] - cx) * s + (p[1] - cy) * c]); }
function catmull(P, closed, per = 14) {
  const n = P.length, out = []; if (n < 2) return P.slice();
  const g = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]), last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((a) => 0.5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  if (!closed) out.push(P[n - 1].slice()); return out;
}
export const orient = (loop, ccw = true) => { let a = 0; for (let i = 0; i < loop.length; i++) { const p = loop[i], q = loop[(i + 1) % loop.length]; a += p[0] * q[1] - q[0] * p[1]; } return (a > 0) === ccw ? loop : loop.slice().reverse(); };
export const area2 = (loop) => { let a = 0; for (let i = 0; i < loop.length; i++) { const p = loop[i], q = loop[(i + 1) % loop.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

export const SKETCH_TYPES = [['circle', 'Circle'], ['ellipse', 'Ellipse'], ['rect', 'Rectangle'], ['superellipse', 'Rounded square or superellipse'], ['polygon', 'Regular polygon'], ['spline', 'Spline through points'], ['poly', 'Polyline']];

// returns { loop:[[x,y]...], closed }
export function resolveSketch(s, scope, errs) {
  const L = s.name || s.id, N = (v, fb, l) => num(v, scope, fb, errs, L + ' ' + l), seg = Math.max(12, Math.min(360, Math.round(N(s.seg, 96, 'segments'))));
  const ox = N(s.ox, 0, 'x'), oy = N(s.oy, 0, 'y'), rt = N(s.rot, 0, 'rotation');
  let pts, closed = true;
  if (s.type === 'circle') { const r = Math.max(0.01, N(s.r, 20, 'radius')); pts = Array.from({ length: seg }, (_, i) => [r * Math.cos(i * TAU / seg), r * Math.sin(i * TAU / seg)]); }
  else if (s.type === 'ellipse') { const a = Math.max(0.01, N(s.rx, 30, 'rx')), b = Math.max(0.01, N(s.ry, 20, 'ry')); pts = Array.from({ length: seg }, (_, i) => [a * Math.cos(i * TAU / seg), b * Math.sin(i * TAU / seg)]); }
  else if (s.type === 'superellipse') {
    const a = Math.max(0.01, N(s.rx, 30, 'rx')), b = Math.max(0.01, N(s.ry, 30, 'ry')), e = Math.max(0.5, N(s.n, 4, 'exponent')), sg = (x) => (x < 0 ? -1 : 1);
    pts = Array.from({ length: seg }, (_, i) => { const t = i * TAU / seg, c = Math.cos(t), si = Math.sin(t); return [a * sg(c) * Math.pow(Math.abs(c), 2 / e), b * sg(si) * Math.pow(Math.abs(si), 2 / e)]; });
  } else if (s.type === 'rect') {
    const w = Math.max(0.02, N(s.w, 40, 'width')) / 2, h = Math.max(0.02, N(s.h, 30, 'height')) / 2, cr = Math.max(0, Math.min(N(s.cr, 0, 'corner radius'), w, h)); pts = [];
    if (cr < 0.01) pts = [[-w, -h], [w, -h], [w, h], [-w, h]];
    else [[w - cr, h - cr, 0], [-w + cr, h - cr, 90], [-w + cr, -h + cr, 180], [w - cr, -h + cr, 270]].forEach(([cx, cy, a0]) => { for (let k = 0; k <= 10; k++) { const a = (a0 + k * 9) * Math.PI / 180; pts.push([cx + cr * Math.cos(a), cy + cr * Math.sin(a)]); } });
  } else if (s.type === 'polygon') { const n = Math.max(3, Math.round(N(s.sides, 6, 'sides'))), r = Math.max(0.01, N(s.r, 25, 'radius')); pts = Array.from({ length: n }, (_, i) => [r * Math.cos(i * TAU / n), r * Math.sin(i * TAU / n)]); }
  else if (s.type === 'spline' || s.type === 'poly') {
    closed = s.closed !== false && s.type !== 'poly' ? !!s.closed : !!s.closed;
    const P = (s.pts || []).map((q, i) => [N(q[0], 0, 'point ' + (i + 1) + ' x'), N(q[1], 0, 'point ' + (i + 1) + ' y')]);
    if (P.length < 2) { pts = P; } else pts = s.type === 'spline' ? catmull(P, closed, Math.max(4, Math.round(N(s.per, 14, 'detail')))) : P;
  } else pts = [];
  pts = rot2(pts, rt).map((p) => [p[0] + ox, p[1] + oy]);
  if (closed && pts.length >= 3) pts = orient(pts, true);
  return { loop: pts, closed };
}

// ---- 2D distance fields for loops (negative inside)
function segs(loops, closed) {
  const A = []; loops.forEach((lp) => { const n = lp.length; for (let i = 0; i < (closed ? n : n - 1); i++) { const p = lp[i], q = lp[(i + 1) % n]; A.push(p[0], p[1], q[0], q[1]); } }); return Float64Array.from(A);
}
export function exact2(loops, closed = true) {
  const S = segs(loops, closed), E = S.length / 4;
  return (x, y) => {
    let d2 = Infinity, inside = false;
    for (let i = 0; i < E; i++) {
      const ax = S[i * 4], ay = S[i * 4 + 1], bx = S[i * 4 + 2], by = S[i * 4 + 3], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let t = l2 < 1e-18 ? 0 : ((x - ax) * dx + (y - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + dx * t - x, ey = ay + dy * t - y, dd = ex * ex + ey * ey; if (dd < d2) d2 = dd;
      if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    }
    const d = Math.sqrt(d2); return closed && inside ? -d : d;
  };
}
// A sampled copy of the field for loops with many edges: much faster to query, accurate to a small fraction of a cell.
export function grid2(loops, closed = true, G = 192) {
  const ex = exact2(loops, closed); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  loops.forEach((lp) => lp.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }));
  const pad = Math.max(x1 - x0, y1 - y0) * 0.08 + 1e-6; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const nx = G, ny = G, sx = (x1 - x0) / nx, sy = (y1 - y0) / ny, D = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) D[j * (nx + 1) + i] = ex(x0 + i * sx, y0 + j * sy);
  const f = (x, y) => {
    let cx = x, cy = y, extra = 0;
    if (x < x0 || x > x1 || y < y0 || y > y1) { cx = Math.min(x1, Math.max(x0, x)); cy = Math.min(y1, Math.max(y0, y)); extra = Math.hypot(x - cx, y - cy); }
    const gx = (cx - x0) / sx, gy = (cy - y0) / sy, i = Math.min(nx - 1, Math.floor(gx)), j = Math.min(ny - 1, Math.floor(gy)), fx = gx - i, fy = gy - j, o = j * (nx + 1) + i;
    return (D[o] * (1 - fx) + D[o + 1] * fx) * (1 - fy) + (D[o + nx + 1] * (1 - fx) + D[o + nx + 2] * fx) * fy + extra;
  };
  f.bb = [x0, y0, x1, y1]; return f;
}
export function field2(loops, closed = true) { const E = loops.reduce((s, l) => s + l.length, 0); return E <= 64 ? exact2(loops, closed) : grid2(loops, closed); }
export function loopBox(loops) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; loops.forEach((lp) => lp.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); })); return [x0, y0, x1, y1]; }

// A hollow vase profile from an open outer curve: the wall is offset inwards along the normals, with a thicker floor.
export function vaseProfile(curve, wall, floor) {
  const n = curve.length, nrm = curve.map((p, i) => { const a = curve[Math.max(0, i - 1)], b = curve[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; });   // right-hand normal: outward when the curve runs bottom to top with the axis on its left
  const inner = curve.map((p, i) => [Math.max(0, p[0] - nrm[i][0] * wall), p[1] - nrm[i][1] * wall]), z0 = curve[0][1];
  const loop = curve.map((p) => p.slice());
  const top = inner[n - 1], ring = [];
  ring.push([0, z0]);                                           // axis at the very bottom
  curve.forEach((p) => ring.push(p));
  for (let i = n - 1; i >= 0; i--) { const q = inner[i]; if (q[1] >= z0 + floor - 1e-6) ring.push(q); else { ring.push([q[0], z0 + floor]); break; } }
  ring.push([0, z0 + floor]); void loop; void top;
  return ring;
}
