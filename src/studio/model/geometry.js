// 2D geometry helpers and polygon booleans. Plan coordinates: x east, y north, feet.
import pc from 'polygon-clipping';
import earcut from 'earcut';

export const EPS = 1e-6;
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const mul = (a, k) => [a[0] * k, a[1] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export const len = (a) => Math.hypot(a[0], a[1]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const unit = (a) => { const l = len(a); return l < 1e-12 ? [1, 0] : [a[0] / l, a[1] / l]; };
export const perp = (a) => [-a[1], a[0]];
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const rot = (p, c, deg) => { const r = deg * Math.PI / 180, s = Math.sin(r), k = Math.cos(r), x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * k - y * s, c[1] + x * s + y * k]; };

export function pointSeg(p, a, b) {
  const ab = sub(b, a), l2 = dot(ab, ab);
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  const q = add(a, mul(ab, t));
  return { d: dist(p, q), t, q };
}

// Proper or touching intersection of segments ab and cd. Returns {p, t, u} or null.
export function segIntersect(a, b, c, d, tol = 1e-9) {
  const r = sub(b, a), s = sub(d, c), den = cross(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const qp = sub(c, a), t = cross(qp, s) / den, u = cross(qp, r) / den;
  if (t < -tol || t > 1 + tol || u < -tol || u > 1 + tol) return null;
  return { p: add(a, mul(r, t)), t, u };
}

// Intersection of two infinite lines p1+t*d1 and p2+u*d2
export function lineIntersect(p1, d1, p2, d2) {
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(p2, p1), d2) / den;
  return add(p1, mul(d1, t));
}

export const ringArea = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
export function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export const ringCentroid = (r) => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n], f = p[0] * q[1] - q[0] * p[1]; a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; }
  if (Math.abs(a) < 1e-9) return r[0];
  return [cx / (3 * a), cy / (3 * a)];
};
export const ringPerimeter = (r) => { let s = 0; for (let i = 0; i < r.length; i++) s += dist(r[i], r[(i + 1) % r.length]); return s; };

// ---- polygon booleans (multipolygon = [ [ring, hole...], ... ], rings may be closed or open)
export const open = (r) => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r);
export const mpUnion = (list) => { list = list.filter((m) => m && m.length); return list.length ? (list.length === 1 ? pc.union(list[0]) : pc.union(list[0], ...list.slice(1))) : []; };
export const mpDiff = (a, b) => (!a || !a.length ? [] : (!b || !b.length ? a : pc.difference(a, b)));
export const mpInter = (a, b) => (!a || !a.length || !b || !b.length ? [] : pc.intersection(a, b));
export const polyMP = (ring) => [[ring.map((p) => [p[0], p[1]])]];
export const mpArea = (mp) => { let a = 0; mp.forEach((poly) => poly.forEach((ring, i) => { const x = Math.abs(ringArea(open(ring))); a += i === 0 ? x : -x; })); return a; };
export function rectRing(cx, cy, hx, hy) { return [[cx - hx, cy - hy], [cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy]]; }
// Oriented rectangle: from point a along unit direction d for length L, half width h (centre-line at a)
export function orientedRect(a, d, from, to, h) {
  const n = perp(d);
  const p0 = add(a, mul(d, from)), p1 = add(a, mul(d, to));
  return [add(p0, mul(n, h)), add(p1, mul(n, h)), sub(p1, mul(n, h)), sub(p0, mul(n, h))];
}

// ---- triangle soup helpers: arrays of 9 numbers per triangle
export function addTri(out, a, b, c) { out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); }
export function addQuad(out, a, b, c, d) { addTri(out, a, b, c); addTri(out, a, c, d); }
export function addBox(out, x0, y0, z0, x1, y1, z1) {
  const A = [x0, y0, z0], B = [x1, y0, z0], C = [x1, y1, z0], D = [x0, y1, z0], E = [x0, y0, z1], F = [x1, y0, z1], G = [x1, y1, z1], H = [x0, y1, z1];
  addQuad(out, D, C, B, A); addQuad(out, E, F, G, H);
  addQuad(out, A, B, F, E); addQuad(out, B, C, G, F); addQuad(out, C, D, H, G); addQuad(out, D, A, E, H);
}
// Extrude a ring (any orientation) between z0 and z1. Convex or concave via earcut.
export function addPrism(out, ring, z0, z1) {
  ring = open(ring).map((p) => [p[0], p[1]]);
  if (ringArea(ring) < 0) ring.reverse();
  const flat = []; ring.forEach((p) => flat.push(p[0], p[1]));
  const idx = earcut(flat);
  for (let i = 0; i < idx.length; i += 3) {
    const a = ring[idx[i]], b = ring[idx[i + 1]], c = ring[idx[i + 2]];
    addTri(out, [a[0], a[1], z1], [b[0], b[1], z1], [c[0], c[1], z1]);
    addTri(out, [a[0], a[1], z0], [c[0], c[1], z0], [b[0], b[1], z0]);
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    addQuad(out, [a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]);
  }
}

// Caps for a multipolygon at height z (up = facing +z)
function capMP(out, mp, z, up) {
  mp.forEach((poly) => {
    const rings = poly.map(open); if (!rings[0] || rings[0].length < 3) return;
    const flat = [], holes = [], pts = [];
    rings.forEach((r, i) => { if (i > 0) holes.push(pts.length); r.forEach((p) => { flat.push(p[0], p[1]); pts.push(p); }); });
    const idx = earcut(flat, holes.length ? holes : undefined);
    for (let i = 0; i < idx.length; i += 3) {
      let a = pts[idx[i]], b = pts[idx[i + 1]], c = pts[idx[i + 2]];
      const ar = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if ((ar > 0) !== up) { const t = b; b = c; c = t; }
      addTri(out, [a[0], a[1], z], [b[0], b[1], z], [c[0], c[1], z]);
    }
  });
}
function sidesMP(out, mp, z0, z1) {
  mp.forEach((poly) => poly.forEach((ring0, ri) => {
    const ring = open(ring0).slice(); if (ring.length < 3) return;
    const ar = ringArea(ring);
    if ((ri === 0 && ar < 0) || (ri > 0 && ar > 0)) ring.reverse();   // material stays on the left of every edge
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      addQuad(out, [a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]);
    }
  }));
}
// Split triangles wherever another vertex sits on one of their edges, so neighbouring faces share every vertex (no T-junctions).
export function conformTris(tris, tol = 1e-6) {
  const q = 1e-6, kf = (x, y, z) => Math.round(x / q) + ',' + Math.round(y / q) + ',' + Math.round(z / q), cell = 2;
  const V = new Map();
  for (let i = 0; i < tris.length; i += 3) { const k = kf(tris[i], tris[i + 1], tris[i + 2]); if (!V.has(k)) V.set(k, [tris[i], tris[i + 1], tris[i + 2]]); }
  const grid = new Map(), ck = (x, y, z) => Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell);
  V.forEach((v) => { const k = ck(v[0], v[1], v[2]); (grid.get(k) || grid.set(k, []).get(k)).push(v); });
  function onEdge(a, b) {
    const res = [], x0 = Math.floor((Math.min(a[0], b[0]) - tol) / cell), x1 = Math.floor((Math.max(a[0], b[0]) + tol) / cell);
    const y0 = Math.floor((Math.min(a[1], b[1]) - tol) / cell), y1 = Math.floor((Math.max(a[1], b[1]) + tol) / cell);
    const z0 = Math.floor((Math.min(a[2], b[2]) - tol) / cell), z1 = Math.floor((Math.max(a[2], b[2]) + tol) / cell);
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    if (l2 < 1e-12) return res;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const L = grid.get(x + ',' + y + ',' + z); if (!L) continue;
      for (const v of L) {
        const t = ((v[0] - a[0]) * d[0] + (v[1] - a[1]) * d[1] + (v[2] - a[2]) * d[2]) / l2;
        if (t <= 1e-9 || t >= 1 - 1e-9) continue;
        const dx = a[0] + d[0] * t - v[0], dy = a[1] + d[1] * t - v[1], dz = a[2] + d[2] * t - v[2];
        if (dx * dx + dy * dy + dz * dz < tol * tol) res.push([t, v]);
      }
    }
    return res.sort((m, n) => m[0] - n[0]);
  }
  const out = [], stack = [];
  for (let i = 0; i < tris.length; i += 9) stack.push([[tris[i], tris[i + 1], tris[i + 2]], [tris[i + 3], tris[i + 4], tris[i + 5]], [tris[i + 6], tris[i + 7], tris[i + 8]]]);
  while (stack.length) {
    const T = stack.pop(); let split = false;
    for (let e = 0; e < 3 && !split; e++) {
      const A = T[e], B = T[(e + 1) % 3], C = T[(e + 2) % 3], pts = onEdge(A, B);
      if (!pts.length) continue;
      let prev = A;
      pts.forEach((pt) => { stack.push([prev, pt[1], C]); prev = pt[1]; });
      stack.push([prev, B, C]); split = true;
    }
    if (!split) out.push(T[0][0], T[0][1], T[0][2], T[1][0], T[1][1], T[1][2], T[2][0], T[2][1], T[2][2]);
  }
  return out;
}

// Stack of horizontal bands, each with its own plan shape. Internal caps are left out so the solid stays one surface.
export function extrudeBands(out, bands) {
  const raw = [];
  extrudeBandsRaw(raw, bands);
  const fixed = bands.length > 1 ? conformTris(raw) : raw;
  for (let i = 0; i < fixed.length; i++) out.push(fixed[i]);
}
function extrudeBandsRaw(out, bands) {
  bands.forEach((b, i) => {
    if (!b.mp.length) return;
    sidesMP(out, b.mp, b.z0, b.z1);
    const below = i > 0 && Math.abs(bands[i - 1].z1 - b.z0) < 1e-9 ? bands[i - 1].mp : null;
    const above = i + 1 < bands.length && Math.abs(bands[i + 1].z0 - b.z1) < 1e-9 ? bands[i + 1].mp : null;
    capMP(out, below ? mpDiff(b.mp, below) : b.mp, b.z0, false);
    capMP(out, above ? mpDiff(b.mp, above) : b.mp, b.z1, true);
  });
}
export function extrudeMP(out, mp, z0, z1) { extrudeBands(out, [{ mp, z0, z1 }]); }

// ---- mesh analysis
export function meshStats(tris, q = 1e-4) {
  const key = (x, y, z) => Math.round(x / q) + ',' + Math.round(y / q) + ',' + Math.round(z / q);
  const edges = new Map(); let vol = 0, degenerate = 0;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 9) {
    const v = [0, 3, 6].map((o) => [tris[i + o], tris[i + o + 1], tris[i + o + 2]]);
    for (const p of v) for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; }
    const ks = v.map((p) => key(p[0], p[1], p[2]));
    if (ks[0] === ks[1] || ks[1] === ks[2] || ks[0] === ks[2]) { degenerate++; continue; }
    vol += (v[0][0] * (v[1][1] * v[2][2] - v[2][1] * v[1][2]) - v[0][1] * (v[1][0] * v[2][2] - v[2][0] * v[1][2]) + v[0][2] * (v[1][0] * v[2][1] - v[2][0] * v[1][1])) / 6;
    for (let e = 0; e < 3; e++) {
      const a = ks[e], b = ks[(e + 1) % 3], k = a < b ? a + '|' + b : b + '|' + a, dir = a < b ? 1 : -1;
      const r = edges.get(k) || { n: 0, s: 0 }; r.n++; r.s += dir; edges.set(k, r);
    }
  }
  let open = 0, nonManifold = 0;
  edges.forEach((r) => { if (r.n === 1) open++; else if (r.n !== 2 || r.s !== 0) nonManifold++; });
  return { tris: tris.length / 9, volume: vol, bbox: [mn, mx], openEdges: open, nonManifold, degenerate, watertight: open === 0 && nonManifold === 0 };
}
export { earcut, pc };
