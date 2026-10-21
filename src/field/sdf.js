// Shapes as signed distance functions: f(x,y,z) < 0 inside, > 0 outside, in millimetres.
// Booleans become min and max, offsets and shells become additions, and "push a face in any direction" becomes a swept prism.
import { field2, loopBox } from './sketch.js';
import { dot, cross, unit, len, add, sub, mul, toWorld } from './frames.js';

const INF = 1e9, rad = Math.PI / 180;
export const node = (f, bb) => ({ f, bb });
export const EMPTY = { f: () => INF, bb: null, empty: true };
export const bbUnion = (a, b) => (!a ? b : !b ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5])]);
export const bbPad = (b, m) => (b ? [b[0] - m, b[1] - m, b[2] - m, b[3] + m, b[4] + m, b[5] + m] : b);
export function bbPoints(P) { let b = null; P.forEach((p) => { b = bbUnion(b, [p[0], p[1], p[2], p[0], p[1], p[2]]); }); return b; }
export const bbCenter = (b) => [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];

export function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
export const smax = (a, b, k) => -smin(-a, -b, k);

export function combine(a, b, op, k = 0) {
  if (a.empty) return op === 'add' ? b : a;
  if (op === 'add') return node((x, y, z) => smin(a.f(x, y, z), b.f(x, y, z), k), bbUnion(a.bb, b.bb));
  if (op === 'sub') return node((x, y, z) => smax(a.f(x, y, z), -b.f(x, y, z), k), a.bb);
  return node((x, y, z) => smax(a.f(x, y, z), b.f(x, y, z), k), a.bb && b.bb ? [Math.max(a.bb[0], b.bb[0]), Math.max(a.bb[1], b.bb[1]), Math.max(a.bb[2], b.bb[2]), Math.min(a.bb[3], b.bb[3]), Math.min(a.bb[4], b.bb[4]), Math.min(a.bb[5], b.bb[5])] : a.bb);
}

// ---- primitives (mostly for tests and quick shapes)
export const sphere = (c, r) => node((x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r, [c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r]);
export const box = (c, s) => node((x, y, z) => { const qx = Math.abs(x - c[0]) - s[0] / 2, qy = Math.abs(y - c[1]) - s[1] / 2, qz = Math.abs(z - c[2]) - s[2] / 2; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0); }, [c[0] - s[0] / 2, c[1] - s[1] / 2, c[2] - s[2] / 2, c[0] + s[0] / 2, c[1] + s[1] / 2, c[2] + s[2] / 2]);

// ---- prism: a loop on a plane swept along any direction between two heights measured along the plane normal.
// o: {taper (deg), twist (deg over the height)}.  Sweeping along a slanted direction shears the section, so volume = area x height.
export function prismNode(fr, loops, dir, lo, hi, o = {}) {
  const d = unit(dir); let cosn = dot(d, fr.n);
  if (Math.abs(cosn) < 1e-3) throw new Error('The direction lies in the plane, so the face cannot be swept.');
  const dd = cosn < 0 ? mul(d, -1) : d; cosn = Math.abs(cosn);                // always sweep "upwards" relative to the normal
  const sdf2 = field2(loops, true), tt = Math.tan((o.taper || 0) * rad), tw = (o.twist || 0) * rad, H = hi - lo || 1;
  let cx = 0, cy = 0, n = 0; loops.forEach((lp) => lp.forEach((p) => { cx += p[0]; cy += p[1]; n++; })); cx /= n || 1; cy /= n || 1;
  const [ox, oy, oz] = fr.o, [ux, uy, uz] = fr.u, [vx, vy, vz] = fr.v, [nx, ny, nz] = fr.n, [dx, dy, dz] = dd, inv = 1 / cosn;
  const f = (x, y, z) => {
    const wx = x - ox, wy = y - oy, wz = z - oz, hN = wx * nx + wy * ny + wz * nz, s = hN * inv;
    const qx = wx - dx * s, qy = wy - dy * s, qz = wz - dz * s;
    let a = qx * ux + qy * uy + qz * uz, b = qx * vx + qy * vy + qz * vz;
    if (tw) { const t = Math.min(1, Math.max(0, (hN - lo) / H)), ang = -tw * t, c = Math.cos(ang), si = Math.sin(ang), ra = a - cx, rb = b - cy; a = cx + ra * c - rb * si; b = cy + ra * si + rb * c; }
    let d2 = sdf2(a, b); if (tt) d2 += tt * Math.abs(hN > 0 ? hN : 0) * 1;       // draft: the section shrinks with height
    return Math.max(d2 * cosn, lo - hN, hN - hi);
  };
  const [x0, y0, x1, y1] = loopBox(loops), P = [];
  let corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  if (tw) { let R0 = 0; loops.forEach((lp) => lp.forEach((p) => { R0 = Math.max(R0, Math.hypot(p[0] - cx, p[1] - cy)); })); corners = [[cx - R0, cy - R0], [cx + R0, cy - R0], [cx + R0, cy + R0], [cx - R0, cy + R0]]; }
  corners.forEach(([a, b]) => { [lo, hi].forEach((h) => { const base = toWorld(fr, a, b, 0); P.push(add(base, mul(dd, h * inv))); }); });
  return node(f, bbPoints(P));
}
// Extrusion by a signed distance along a direction (the distance is measured along that direction).
export function extrudeNode(fr, loops, dir, dist, o = {}) {
  const d = unit(dir), L = Math.abs(dist), s = dist < 0 ? -1 : 1, dd = mul(d, s), cosn = dot(dd, fr.n), h = L * Math.abs(cosn);
  const up = cosn >= 0;                                                         // does the sweep go along +normal?
  let lo, hi; if (o.sym) { lo = -h; hi = h; } else if (up) { lo = 0; hi = h; } else { lo = -h; hi = 0; }
  return prismNode(fr, loops, dd, lo, hi, o);
}

// ---- revolve a profile (x = radius, y = height along the axis) about the plane's v axis (or u axis)
export function revolveNode(fr, loops, axis, angleDeg = 360) {
  const sdf = field2(loops, true), ad = axis === 'u' ? fr.u : fr.v, e1 = axis === 'u' ? fr.v : fr.u, e2 = fr.n, A = Math.min(360, Math.max(1, angleDeg)) * rad, full = A >= 2 * Math.PI - 1e-6;
  const [ox, oy, oz] = fr.o;
  const f = (x, y, z) => {
    const wx = x - ox, wy = y - oy, wz = z - oz, a = wx * ad[0] + wy * ad[1] + wz * ad[2];
    const rx = wx - ad[0] * a, ry = wy - ad[1] * a, rz = wz - ad[2] * a, rho = Math.sqrt(rx * rx + ry * ry + rz * rz);
    const d = axis === 'u' ? sdf(a, rho) : sdf(rho, a);
    if (full) return d;
    let phi = Math.atan2(rx * e2[0] + ry * e2[1] + rz * e2[2], rx * e1[0] + ry * e1[1] + rz * e1[2]); if (phi < 0) phi += 2 * Math.PI;
    const wd = phi <= A ? -Math.min(phi, A - phi) * rho : Math.min(phi - A, 2 * Math.PI - phi) * rho;
    return Math.max(d, wd);
  };
  const [x0, y0, x1, y1] = loopBox(loops), R = Math.max(Math.abs(x0), Math.abs(x1), axis === 'u' ? Math.abs(y0) : 0, axis === 'u' ? Math.abs(y1) : 0), lo = axis === 'u' ? x0 : y0, hi = axis === 'u' ? x1 : y1, P = [];
  [-R, R].forEach((p) => [-R, R].forEach((q) => [lo, hi].forEach((s) => P.push(add(add(add(fr.o, mul(e1, p)), mul(e2, q)), mul(ad, s))))));
  return node(f, bbPoints(P));
}

// ---- loft: the section shapes are blended as distance fields along the plane normal (sections must be on parallel planes)
export function loftNode(secs, smooth = true) {
  if (secs.length < 2) throw new Error('A loft needs at least two sketches.');
  const base = secs[0].fr, n0 = base.n;
  const S = secs.map((s) => {
    if (Math.abs(dot(s.fr.n, n0)) < 0.999) throw new Error('Loft sketches must be on parallel planes.');
    const sh = dot(sub(s.fr.o, base.o), n0), loops = s.loops.map((lp) => lp.map((p) => { const w = sub(toWorld(s.fr, p[0], p[1], 0), base.o); return [dot(w, base.u), dot(w, base.v)]; }));
    return { s: sh, f: field2(loops, true), loops };
  }).sort((a, b) => a.s - b.s);
  const N = S.length, s0 = S[0].s, sN = S[N - 1].s, [ox, oy, oz] = base.o;
  const f = (x, y, z) => {
    const wx = x - ox, wy = y - oy, wz = z - oz, s = wx * n0[0] + wy * n0[1] + wz * n0[2], X = wx * base.u[0] + wy * base.u[1] + wz * base.u[2], Y = wx * base.v[0] + wy * base.v[1] + wz * base.v[2];
    const sc = Math.min(sN, Math.max(s0, s)); let i = 0; while (i < N - 2 && sc > S[i + 1].s) i++;
    const h = S[i + 1].s - S[i].s || 1, t = (sc - S[i].s) / h, a = S[i].f(X, Y), b = S[i + 1].f(X, Y);
    let v;
    if (!smooth || N === 2) v = a + (b - a) * t;
    else {
      const pa = i > 0 ? S[i - 1].f(X, Y) : null, pb = i + 2 < N ? S[i + 2].f(X, Y) : null;
      const ma = (pa === null ? (b - a) / h : (b - pa) / (S[i + 1].s - S[i - 1].s)) * h, mb = (pb === null ? (b - a) / h : (pb - a) / (S[i + 2].s - S[i].s)) * h;
      const t2 = t * t, t3 = t2 * t; v = (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * ma + (-2 * t3 + 3 * t2) * b + (t3 - t2) * mb;
    }
    return Math.max(v, s0 - s, s - sN);
  };
  let bb = null; S.forEach((q) => { const [x0, y0, x1, y1] = loopBox(q.loops); [[x0, y0], [x1, y1]].forEach(([a, b]) => { [s0, sN].forEach((h) => { const p = toWorld(base, a, b, 0); bb = bbUnion(bb, bbPoints([add(p, mul(n0, S[0].s === h ? 0 : 0))])); }); }); });
  const all = []; S.forEach((q) => { const [x0, y0, x1, y1] = loopBox(q.loops); [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(([a, b]) => all.push(add(toWorld(base, a, b, 0), mul(n0, q.s)))); });
  return node(f, bbPoints(all));
}

// ---- surface function: radius r(a, z) around the plane normal, with optional twist, wall and floor (a vase from an equation)
export function surfaceNode(fr, p) {
  const { H, rFn, twFn, wall, floor, scope } = p, sc = Object.create(scope), [ox, oy, oz] = fr.o, dz = Math.max(H / 400, 1e-3);
  const radius = (a, z) => { sc.z = z; sc.t = z / H; sc.H = H; sc.a = a; sc.tw = twFn ? twFn(sc) : 0; sc.a = a - sc.tw; const r = rFn(sc); return r > 0 ? r : 0; };
  const f = (x, y, z) => {
    const wx = x - ox, wy = y - oy, wz = z - oz, h = wx * fr.n[0] + wy * fr.n[1] + wz * fr.n[2], X = wx * fr.u[0] + wy * fr.u[1] + wz * fr.u[2], Y = wx * fr.v[0] + wy * fr.v[1] + wz * fr.v[2];
    const rho = Math.hypot(X, Y), a = Math.atan2(Y, X) / rad, zc = Math.min(H, Math.max(0, h)), r = radius(a, zc);
    const outer = Math.max(rho - r, -h, h - H);
    if (wall <= 0) return outer;
    // the wall follows the slope so its thickness is measured across the surface; far from the wall the plain offset is enough
    let rw = wall; if (Math.abs(rho - r) < wall * 2.5) { const dr = (radius(a, Math.min(H, zc + dz)) - r) / dz; rw = wall * Math.sqrt(1 + dr * dr); }
    const inner = Math.max(rho - (r - rw), floor - h);
    return Math.max(outer, -inner);
  };
  let rm = 1; for (let k = 0; k <= 16; k++) for (let a = 0; a < 360; a += 10) rm = Math.max(rm, radius(a, (H * k) / 16));
  const R = rm * 1.03 + 1, P = []; [-R, R].forEach((p) => [-R, R].forEach((q) => [0, H].forEach((s) => P.push(add(add(add(fr.o, mul(fr.u, p)), mul(fr.v, q)), mul(fr.n, s))))));
  return node(f, bbPoints(P));
}

// ---- operations on a whole body
export function shellNode(body, t, cuts = []) {
  let f = (x, y, z) => { const v = body.f(x, y, z); return Math.max(v, -(v + t)); };
  const core = f; cuts.forEach((c) => { const prev = f; f = (x, y, z) => Math.max(prev(x, y, z), -c.f(x, y, z)); }); void core;
  return node(f, body.bb);
}
export function offsetNode(body, d) { return node((x, y, z) => body.f(x, y, z) - d, body.bb ? [body.bb[0] - Math.max(d, 0), body.bb[1] - Math.max(d, 0), body.bb[2] - Math.max(d, 0), body.bb[3] + Math.max(d, 0), body.bb[4] + Math.max(d, 0), body.bb[5] + Math.max(d, 0)] : null); }

// Soft pull: move the material near a point along any direction, with a smooth falloff.
export function softPullNode(body, c, R, dir, dist, soft = 0.5) {
  const d = unit(dir), r1 = R * (1 + Math.max(0, soft) * 1.5);
  const w = (x, y, z) => { const t = Math.hypot(x - c[0], y - c[1], z - c[2]) / r1; if (t >= 1) return 0; const s = 1 - t * t; return s * s * s; };
  // The weight is evaluated where the material comes from, so the middle of the patch moves by exactly `dist`.
  const f = (x, y, z) => { let k = dist * w(x, y, z); for (let i = 0; i < 3; i++) k = dist * w(x - d[0] * k, y - d[1] * k, z - d[2] * k); return body.f(x - d[0] * k, y - d[1] * k, z - d[2] * k); };
  return node(f, bbPad(body.bb, Math.abs(dist) * 1.2));
}

// Domain warps about the axis through the plane origin along its normal
export function warpNode(body, fr, kind, amount, extra = 0) {
  const [ox, oy, oz] = fr.o, [nx, ny, nz] = fr.n, [ux, uy, uz] = fr.u, [vx, vy, vz] = fr.v;
  const local = (x, y, z) => { const wx = x - ox, wy = y - oy, wz = z - oz; return [wx * ux + wy * uy + wz * uz, wx * vx + wy * vy + wz * vz, wx * nx + wy * ny + wz * nz]; };
  const world = (a, b, s) => [ox + ux * a + vx * b + nx * s, oy + uy * a + vy * b + ny * s, oz + uz * a + vz * b + nz * s];
  let f, grow = 1.0;
  if (kind === 'twist') { const k = amount * rad; f = (x, y, z) => { const [a, b, s] = local(x, y, z), t = -k * s, c = Math.cos(t), si = Math.sin(t), p = world(a * c - b * si, a * si + b * c, s); return body.f(p[0], p[1], p[2]); }; grow = 1.1; }
  else if (kind === 'taper') { const r = amount; f = (x, y, z) => { const [a, b, s] = local(x, y, z), g = Math.max(0.05, 1 + r * s), p = world(a / g, b / g, s); return body.f(p[0], p[1], p[2]) * g; }; grow = 1 + Math.abs(r) * 400; }
  else if (kind === 'bend') {
    const kap = amount;
    f = (x, y, z) => {
      const [a, b, s] = local(x, y, z); if (Math.abs(kap) < 1e-9) return body.f(x, y, z);
      const R = 1 / kap, dx = R - a, ang = Math.atan2(s, dx), r = Math.hypot(dx, s) * Math.sign(R), p = world(R - r, b, R * ang); return body.f(p[0], p[1], p[2]);
    }; grow = 1.6;
  } else if (kind === 'ripple') { const lam = extra || 20; f = (x, y, z) => { const [, , s] = local(x, y, z); return body.f(x, y, z) - amount * Math.sin(2 * Math.PI * s / lam); }; grow = 1.0; }
  else throw new Error('Unknown warp ' + kind);
  let bb = body.bb;
  if (bb) {
    const corners = []; [0, 3].forEach((i) => [1, 4].forEach((j) => [2, 5].forEach((k) => corners.push([bb[i], bb[j], bb[k]]))));
    const axial = corners.map((c) => dot(sub(c, fr.o), fr.n)), s0 = Math.min(...axial), s1 = Math.max(...axial);
    const R = Math.max(...corners.map((c) => { const w = sub(c, fr.o), a = dot(w, fr.n); return len(sub(w, mul(fr.n, a))); }));
    const zAxis = Math.abs(fr.n[2]) > 0.95, lat = (k) => (zAxis ? [fr.o[0] - R * k, fr.o[1] - R * k, bb[2], fr.o[0] + R * k, fr.o[1] + R * k, bb[5]] : bbPad(bb, R * (k - 1) + 1));
    if (kind === 'twist') bb = zAxis ? lat(1.02) : bbPad(bb, R);
    else if (kind === 'taper') { const F = Math.max(1 / Math.max(0.05, 1 + amount * s0), 1 / Math.max(0.05, 1 + amount * s1), 1); bb = zAxis ? lat(F * 1.02) : bbPad(bb, R * F); }
    else if (kind === 'ripple') bb = bbPad(bb, Math.abs(amount) + 1);
    else { const m = Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]); bb = bbPad(bb, m * 0.6); }
  }
  return node(f, bb);
}
export function mirrorNode(body, fr) {
  const [ox, oy, oz] = fr.o, n = fr.n;
  const f = (x, y, z) => { const d = (x - ox) * n[0] + (y - oy) * n[1] + (z - oz) * n[2]; return Math.min(body.f(x, y, z), body.f(x - 2 * d * n[0], y - 2 * d * n[1], z - 2 * d * n[2])); };
  let bb = body.bb; if (bb) { const P = []; [0, 3].forEach((i) => [1, 4].forEach((j) => [2, 5].forEach((k) => { const p = [bb[i], bb[j], bb[k]], d = dot(sub(p, fr.o), n); P.push(p, sub(p, mul(n, 2 * d))); }))); bb = bbPoints(P); }
  return node(f, bb);
}
export function polarNode(body, fr, count, angleDeg = 360) {
  const n = Math.max(2, Math.round(count)), full = angleDeg >= 359.99, step = (full ? 360 : angleDeg / Math.max(1, n - 1)) / n * (full ? 1 : n) / (full ? 1 : 1), [ox, oy, oz] = fr.o;
  const delta = (full ? 360 / n : angleDeg / Math.max(1, n - 1)) * rad;
  const rotp = (x, y, z, a) => { const wx = x - ox, wy = y - oy, wz = z - oz, h = wx * fr.n[0] + wy * fr.n[1] + wz * fr.n[2], a0 = wx * fr.u[0] + wy * fr.u[1] + wz * fr.u[2], b0 = wx * fr.v[0] + wy * fr.v[1] + wz * fr.v[2], c = Math.cos(a), s = Math.sin(a); const A = a0 * c - b0 * s, B = a0 * s + b0 * c; return [ox + fr.u[0] * A + fr.v[0] * B + fr.n[0] * h, oy + fr.u[1] * A + fr.v[1] * B + fr.n[1] * h, oz + fr.u[2] * A + fr.v[2] * B + fr.n[2] * h]; };
  let f;
  if (full) f = (x, y, z) => { const wx = x - ox, wy = y - oy, wz = z - oz, a0 = wx * fr.u[0] + wy * fr.u[1] + wz * fr.u[2], b0 = wx * fr.v[0] + wy * fr.v[1] + wz * fr.v[2], k = Math.round(Math.atan2(b0, a0) / delta); let m = Infinity; for (let j = -1; j <= 1; j++) { const p = rotp(x, y, z, -(k + j) * delta); const v = body.f(p[0], p[1], p[2]); if (v < m) m = v; } return m; };
  else f = (x, y, z) => { let m = Infinity; for (let j = 0; j < n; j++) { const p = rotp(x, y, z, -j * delta); const v = body.f(p[0], p[1], p[2]); if (v < m) m = v; } return m; };
  void step;
  let bb = body.bb; if (bb) { const c = bbCenter(bb), R = Math.hypot(Math.max(Math.abs(bb[0] - ox), Math.abs(bb[3] - ox)), Math.max(Math.abs(bb[1] - oy), Math.abs(bb[4] - oy))); bb = [ox - R, oy - R, bb[2], ox + R, oy + R, bb[5]]; if (Math.abs(fr.n[2]) < 0.9) bb = bbPad(body.bb, len(sub(c, fr.o)) + R); }
  return node(f, bb);
}
export function linearNode(body, vec, count) {
  const n = Math.max(2, Math.round(count)); const f = (x, y, z) => { let m = Infinity; for (let j = 0; j < n; j++) { const v = body.f(x - vec[0] * j, y - vec[1] * j, z - vec[2] * j); if (v < m) m = v; } return m; };
  const e = [vec[0] * (n - 1), vec[1] * (n - 1), vec[2] * (n - 1)]; let bb = body.bb; if (bb) bb = [Math.min(bb[0], bb[0] + e[0]), Math.min(bb[1], bb[1] + e[1]), Math.min(bb[2], bb[2] + e[2]), Math.max(bb[3], bb[3] + e[0]), Math.max(bb[4], bb[4] + e[1]), Math.max(bb[5], bb[5] + e[2])];
  return node(f, bb);
}
export { cross };
