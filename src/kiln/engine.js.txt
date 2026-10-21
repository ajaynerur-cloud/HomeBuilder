// Kiln engine: profile sketch -> section planes -> surface -> relief features -> shell solid -> engineering analysis.
// Units: millimetres, z up. Pure functions, no DOM.
const TAU = Math.PI * 2, D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---------- profile: Catmull-Rom through the sketch points, resampled by arc length
function crPoint(P, i, u) {
  const n = P.length, a = P[Math.max(0, i - 1)], b = P[i], c = P[Math.min(n - 1, i + 1)], d = P[Math.min(n - 1, i + 2)];
  const f = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  return [f(a.r, b.r, c.r, d.r), f(a.z, b.z, c.z, d.z)];
}
export function profileRows(pts, M) {
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 40; k++) dense.push(crPoint(pts, i, k / 40));
  dense.push([pts[pts.length - 1].r, pts[pts.length - 1].z]);
  const L = [0]; for (let i = 1; i < dense.length; i++) L.push(L[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const tot = L[L.length - 1] || 1, r = new Float64Array(M + 1), z = new Float64Array(M + 1); let k = 0;
  for (let j = 0; j <= M; j++) { const s = tot * j / M; while (k < L.length - 2 && L[k + 1] < s) k++; const t = (s - L[k]) / ((L[k + 1] - L[k]) || 1); r[j] = Math.max(2, dense[k][0] + (dense[k + 1][0] - dense[k][0]) * t); z[j] = dense[k][1] + (dense[k + 1][1] - dense[k][1]) * t; }
  z[0] = pts[0].z; z[M] = pts[pts.length - 1].z; return { r, z, length: tot };
}
export function sectionRadius(th, r, sq, rp, lobes, sides) {
  let rr;
  if (sides >= 3) { const seg = TAU / sides, ph = ((th % seg) + seg) % seg - seg / 2; rr = r * ((1 - sq) + sq * Math.cos(Math.PI / sides) / Math.cos(ph)); }
  else { const n = 2 + sq * 6, c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th)); rr = r / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n); }
  return rr * (1 + rp * Math.cos(lobes * th));
}
export function baseGrid(D, U, M) {
  const pr = profileRows(D.pts, M), pos = new Float64Array(U * (M + 1) * 3), H = Math.max(1, D.pts[D.pts.length - 1].z);
  for (let j = 0; j <= M; j++) { const tw = D.twist * D2R * (pr.z[j] / H); for (let i = 0; i < U; i++) { const th = TAU * i / U, rr = sectionRadius(th, pr.r[j], D.corners, D.ripple, D.lobes, D.sides), k = (j * U + i) * 3; pos[k] = rr * Math.cos(th + tw); pos[k + 1] = rr * Math.sin(th + tw); pos[k + 2] = pr.z[j]; } }
  return { pos, pr };
}
export function gridNormals(pos, U, M) {
  const N = new Float64Array(pos.length);
  for (let j = 0; j <= M; j++) for (let i = 0; i < U; i++) {
    const a = (j * U + (i + 1) % U) * 3, b = (j * U + (i + U - 1) % U) * 3, c = (Math.min(M, j + 1) * U + i) * 3, d = (Math.max(0, j - 1) * U + i) * 3, k = (j * U + i) * 3;
    const ux = pos[a] - pos[b], uy = pos[a + 1] - pos[b + 1], uz = pos[a + 2] - pos[b + 2], vx = pos[c] - pos[d], vy = pos[c + 1] - pos[d + 1], vz = pos[c + 2] - pos[d + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) { const h = Math.hypot(pos[k], pos[k + 1]) || 1; nx = pos[k] / h; ny = pos[k + 1] / h; nz = 0; } else { nx /= l; ny /= l; nz /= l; }
    N[k] = nx; N[k + 1] = ny; N[k + 2] = nz;
  }
  return N;
}
export function sampleGrid(arr, U, M, ci, cj) {
  let i0 = Math.floor(ci); const fi = ci - i0; i0 = ((i0 % U) + U) % U; const i1 = (i0 + 1) % U, j0 = clamp(Math.floor(cj), 0, M - 1), fj = clamp(cj - j0, 0, 1), j1 = j0 + 1, o = [0, 0, 0];
  for (let c = 0; c < 3; c++) { const a = arr[(j0 * U + i0) * 3 + c], b = arr[(j0 * U + i1) * 3 + c], d = arr[(j1 * U + i0) * 3 + c], e = arr[(j1 * U + i1) * 3 + c]; o[c] = (a * (1 - fi) + b * fi) * (1 - fj) + (d * (1 - fi) + e * fi) * fj; }
  return o;
}
// ---------- relief features: local push/pull, resolution independent (u around, v up the profile, both 0..1)
const FALL = { smooth: (t) => 0.5 * (1 + Math.cos(Math.PI * t)), plateau: (t) => (t < 0.45 ? 1 : 0.5 * (1 + Math.cos(Math.PI * (t - 0.45) / 0.55))), linear: (t) => 1 - t, spike: (t) => (1 - t) ** 3 };
const unit3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const rotZ = (a, g) => { const c = Math.cos(g), s = Math.sin(g); return [a[0] * c - a[1] * s, a[0] * s + a[1] * c, a[2]]; };
export function reliefFrame(f, base, bn, U, M, k) {
  const N = Math.max(1, f.n | 0), g = TAU * k / N, c0 = sampleGrid(base, U, M, f.u * U, f.v * M), n0 = unit3(sampleGrid(bn, U, M, f.u * U, f.v * M)), c = rotZ(c0, g);
  let dir;
  if (f.dir === 'radial') { const h = Math.hypot(c[0], c[1]) || 1; dir = [c[0] / h, c[1] / h, 0]; } else if (f.dir === 'z') dir = [0, 0, 1]; else if (f.dir === 'free') dir = rotZ(unit3(f.vec || [0, 0, 1]), g); else dir = rotZ(n0, g);
  return { c, dir };
}
export function applyReliefs(D, base, bn, U, M) {
  const out = Float64Array.from(base), V = U * (M + 1);
  (D.reliefs || []).forEach((f) => {
    if (f.on === false || !(f.radius > 0) || !f.amount) return;
    const fall = FALL[f.fall] || FALL.smooth, R = f.radius, R2 = R * R, N = Math.max(1, f.n | 0);
    for (let k = 0; k < N; k++) {
      const fr = reliefFrame(f, base, bn, U, M, k), c = fr.c, d = fr.dir;
      for (let q = 0; q < V; q++) { const x = base[q * 3] - c[0], y = base[q * 3 + 1] - c[1], z = base[q * 3 + 2] - c[2], d2 = x * x + y * y + z * z; if (d2 >= R2) continue; const w = fall(Math.sqrt(d2) / R) * f.amount; out[q * 3] += d[0] * w; out[q * 3 + 1] += d[1] * w; out[q * 3 + 2] += d[2] * w; }
    }
  });
  for (let i = 0; i < U; i++) out[i * 3 + 2] = D.pts[0].z;
  return out;
}
// ---------- shell: offset inward by the wall, close rim, floor and foot. Outer skin triangles come first, in cell order.
export function buildSolid(U, M, P, N, wall, floor, outerOnly) {
  const V = U * (M + 1), maxT = 4 * U * M + 4 * U + 8, pos = new Float32Array(maxT * 9), nrm = new Float32Array(maxT * 9), warn = { clamped: false, rimInverted: false };
  const X = new Float64Array((2 * V + 2) * 3), NN = new Float64Array((2 * V + 2) * 3); X.set(P); NN.set(N); let nt = 0;
  const put = (a, b, c, smooth) => {
    const o = nt * 9, ids = [a, b, c]; let fx = 0, fy = 0, fz = 0;
    if (!smooth) { const ax = X[b * 3] - X[a * 3], ay = X[b * 3 + 1] - X[a * 3 + 1], az = X[b * 3 + 2] - X[a * 3 + 2], bx = X[c * 3] - X[a * 3], by = X[c * 3 + 1] - X[a * 3 + 1], bz = X[c * 3 + 2] - X[a * 3 + 2]; fx = ay * bz - az * by; fy = az * bx - ax * bz; fz = ax * by - ay * bx; const l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l; }
    for (let q = 0; q < 3; q++) { const id = ids[q] * 3; pos[o + q * 3] = X[id]; pos[o + q * 3 + 1] = X[id + 1]; pos[o + q * 3 + 2] = X[id + 2]; nrm[o + q * 3] = smooth ? NN[id] : fx; nrm[o + q * 3 + 1] = smooth ? NN[id + 1] : fy; nrm[o + q * 3 + 2] = smooth ? NN[id + 2] : fz; }
    nt++;
  };
  const vi = (i, j) => j * U + (i % U);
  for (let j = 0; j < M; j++) for (let i = 0; i < U; i++) { const a = vi(i, j), b = vi(i + 1, j), c = vi(i + 1, j + 1), d = vi(i, j + 1); put(a, b, c, true); put(a, c, d, true); }
  const outerTris = nt;
  if (outerOnly) return { pos: pos.subarray(0, nt * 9), nrm: nrm.subarray(0, nt * 9), nt, outerTris, warn, inner: null, floorRow: 0 };
  const z0 = P[2], inner = (idx) => V + idx;
  for (let q = 0; q < V; q++) {
    const s = q * 3, o = inner(q) * 3; let x = P[s] - N[s] * wall, y = P[s + 1] - N[s + 1] * wall; const z = P[s + 2] - N[s + 2] * wall, rho = Math.hypot(x, y);
    if (rho < 1) { warn.clamped = true; if (rho > 1e-9) { x /= rho; y /= rho; } else { x = 1; y = 0; } }
    X[o] = x; X[o + 1] = y; X[o + 2] = z; NN[o] = -N[s]; NN[o + 1] = -N[s + 1]; NN[o + 2] = -N[s + 2];
  }
  const fz = z0 + floor; let j0 = M - 1;
  for (let j = 0; j < M; j++) { let ok = true; for (let i = 0; i < U; i++) if (X[inner(j * U + i) * 3 + 2] < fz) { ok = false; break; } if (ok) { j0 = j; break; } }
  for (let i = 0; i < U; i++) { X[inner(j0 * U + i) * 3 + 2] = fz; X[inner(M * U + i) * 3 + 2] = P[(M * U + i) * 3 + 2]; }
  const cb = 2 * V, cf = 2 * V + 1; let bx = 0, by = 0, fx = 0, fy = 0;
  for (let i = 0; i < U; i++) { bx += P[i * 3]; by += P[i * 3 + 1]; fx += X[inner(j0 * U + i) * 3]; fy += X[inner(j0 * U + i) * 3 + 1]; }
  X[cb * 3] = bx / U; X[cb * 3 + 1] = by / U; X[cb * 3 + 2] = z0; X[cf * 3] = fx / U; X[cf * 3 + 1] = fy / U; X[cf * 3 + 2] = fz;
  for (let i = 0; i < U; i++) put(cb, vi(i + 1, 0), vi(i, 0), false);
  for (let i = 0; i < U; i++) { const o0 = vi(i, M), o1 = vi(i + 1, M), i0 = inner(o0), i1 = inner(o1); put(o0, o1, i1, false); put(o0, i1, i0, false); if (Math.hypot(X[i0 * 3], X[i0 * 3 + 1]) >= Math.hypot(P[o0 * 3], P[o0 * 3 + 1])) warn.rimInverted = true; }
  for (let j = j0; j < M; j++) for (let i = 0; i < U; i++) { const a = inner(vi(i, j)), b = inner(vi(i + 1, j)), c = inner(vi(i + 1, j + 1)), d = inner(vi(i, j + 1)); put(a, c, b, true); put(a, d, c, true); }
  for (let i = 0; i < U; i++) put(cf, inner(vi(i, j0)), inner(vi(i + 1, j0)), false);
  return { pos: pos.subarray(0, nt * 9), nrm: nrm.subarray(0, nt * 9), nt, outerTris, warn, inner: X.subarray(V * 3, 2 * V * 3), floorRow: j0, floorZ: fz };
}
// ---------- engineering analysis
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  p.forEach((q) => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const softMin = (arr, k) => { const m = Math.min(...arr); let s = 0; arr.forEach((v) => { s += Math.exp(-k * (v - m)); }); return m - Math.log(s) / k; };
const softMax = (arr, k) => -softMin(arr.map((v) => -v), k);
export function analyse(D, U, M, P, N, sd) {
  const a = { height: 0, warn: sd.warn };
  let zmax = -1e9; for (let q = 2; q < P.length; q += 3) zmax = Math.max(zmax, P[q]); a.height = zmax - D.pts[0].z;
  // widest and foot diameters
  let maxR = 0, maxRow = 0; for (let j = 0; j <= M; j++) { let rr = 0; for (let i = 0; i < U; i++) { const k = (j * U + i) * 3; rr += Math.hypot(P[k], P[k + 1]); } rr /= U; if (rr > maxR) { maxR = rr; maxRow = j; } }
  let footMin = 1e9; for (let i = 0; i < U; i++) footMin = Math.min(footMin, Math.hypot(P[i * 3], P[i * 3 + 1])); a.baseD = 2 * footMin;
  let maxD = 0; for (let q = 0; q < P.length; q += 3) maxD = Math.max(maxD, 2 * Math.hypot(P[q], P[q + 1])); a.maxD = maxD;
  // steepest wall lean = how far the wall leans from vertical, either way (what a printer feels), ignoring the flat foot and rim
  const leans = []; let lean = 0;
  for (let j = 1; j < M; j++) { let lr = 0; for (let i = 0; i < U; i++) { const k = (j * U + i) * 3; lr = Math.max(lr, Math.asin(clamp(Math.abs(N[k + 2]), 0, 1)) * R2D); } leans.push(lr); lean = Math.max(lean, lr); }
  a.overhang = lean; a.overhangSoft = leans.length ? softMax(leans, 0.35) : 0;
  // solid volume and centre of mass (tetrahedra from the origin)
  let V = 0, cx = 0, cy = 0, cz = 0; const p = sd.pos;
  for (let t = 0; t < sd.nt; t++) { const o = t * 9, v = (p[o] * (p[o + 4] * p[o + 8] - p[o + 5] * p[o + 7]) - p[o + 1] * (p[o + 3] * p[o + 8] - p[o + 5] * p[o + 6]) + p[o + 2] * (p[o + 3] * p[o + 7] - p[o + 4] * p[o + 6])) / 6; V += v; cx += v * (p[o] + p[o + 3] + p[o + 6]) / 4; cy += v * (p[o + 1] + p[o + 4] + p[o + 7]) / 4; cz += v * (p[o + 2] + p[o + 5] + p[o + 8]) / 4; }
  a.volume = V; a.com = V > 0 ? [cx / V, cy / V, cz / V] : [0, 0, 0]; a.mass = V / 1000 * D.density;
  // capacity: inner cavity from the floor up to the fill line, ring by ring
  const I = sd.inner, j0 = sd.floorRow, ring = (j) => { let A = 0, sx = 0, sy = 0, mz = 0; for (let i = 0; i < U; i++) { const k = (j * U + i) * 3, k2 = (j * U + (i + 1) % U) * 3, c = I[k] * I[k2 + 1] - I[k2] * I[k + 1]; A += c; sx += (I[k] + I[k2]) * c; sy += (I[k + 1] + I[k2 + 1]) * c; mz += I[k + 2]; } A /= 2; return { A: Math.abs(A), x: A ? sx / (6 * A) : 0, y: A ? sy / (6 * A) : 0, z: mz / U }; };
  const rings = []; for (let j = j0; j <= M; j++) rings.push(ring(j));
  const topZ = rings[rings.length - 1].z, fillZ = sd.floorZ + clamp(D.fill, 0, 1) * Math.max(0, topZ - sd.floorZ); let cap = 0, wx = 0, wy = 0, wz = 0;
  for (let k = 0; k < rings.length - 1; k++) {
    const r0 = rings[k], r1 = rings[k + 1]; if (r0.z >= fillZ) break; let z1 = r1.z, A1 = r1.A; if (z1 > fillZ) { const t = (fillZ - r0.z) / ((r1.z - r0.z) || 1); A1 = r0.A + (r1.A - r0.A) * t; z1 = fillZ; }
    const dz = z1 - r0.z; if (dz <= 0) continue; const dv = 0.5 * (r0.A + A1) * dz; cap += dv; wx += dv * (r0.x + r1.x) / 2; wy += dv * (r0.y + r1.y) / 2; wz += dv * (r0.z + z1) / 2;
  }
  a.capacity = cap / 1000; a.fillZ = fillZ; const wc = cap > 0 ? [wx / cap, wy / cap, wz / cap] : [0, 0, fillZ], mw = cap / 1000;
  a.comFilled = [(a.com[0] * a.mass + wc[0] * mw) / (a.mass + mw || 1), (a.com[1] * a.mass + wc[1] * mw) / (a.mass + mw || 1), (a.com[2] * a.mass + wc[2] * mw) / (a.mass + mw || 1)];
  // openings
  let rim = 1e9; for (let i = 0; i < U; i++) { const k = (M * U + i) * 3; rim = Math.min(rim, Math.hypot(I[k], I[k + 1])); } a.rimD = 2 * rim;
  let neck = 1e9; for (let j = Math.max(maxRow, j0); j <= M; j++) for (let i = 0; i < U; i++) { const k = (j * U + i) * 3; neck = Math.min(neck, Math.hypot(I[k], I[k + 1])); } a.neckD = 2 * neck;
  // tipping angle: how far it can lean before the centre of mass passes the edge of the foot
  const H = hull(Array.from({ length: U }, (_, i) => [P[i * 3], P[i * 3 + 1]]));
  const tip = (c) => { const d = []; for (let e = 0; e < H.length; e++) { const p0 = H[e], p1 = H[(e + 1) % H.length], ex = p1[0] - p0[0], ey = p1[1] - p0[1], l = Math.hypot(ex, ey) || 1; d.push((ex * (c[1] - p0[1]) - ey * (c[0] - p0[0])) / l); } const h = Math.max(1, c[2] - D.pts[0].z); return [Math.atan2(Math.min(...d), h) * R2D, Math.atan2(softMin(d, 0.8), h) * R2D]; };
  [a.tipEmpty, a.tipEmptySoft] = tip(a.com); [a.tipFilled, a.tipFilledSoft] = tip(a.comFilled);
  a.wall = D.wall;
  return a;
}
// one call: design -> geometry -> solid -> analysis
export function evaluate(D, U = 96, M = 80, opt = {}) {
  const b = baseGrid(D, U, M), bn = gridNormals(b.pos, U, M), P = applyReliefs(D, b.pos, bn, U, M), N = gridNormals(P, U, M);
  const sd = buildSolid(U, M, P, N, D.wall, D.floor, false), an = opt.noAnalysis ? null : analyse(D, U, M, P, N, sd);
  return { U, M, base: b.pos, bn, P, N, solid: sd, a: an, profile: b.pr };
}
// mesh checks for the print panel (exact weld on float32 bits)
export function meshCheck(pos, nt) {
  const n = nt * 3, f = pos instanceof Float32Array ? pos : Float32Array.from(pos), u = new Uint32Array(f.buffer, f.byteOffset, n * 3); let cap = 1; while (cap < n * 2) cap <<= 1;
  const table = new Int32Array(cap).fill(-1), first = new Int32Array(n), idx = new Int32Array(n); let m = 0;
  for (let q = 0; q < n; q++) { const x = u[q * 3], y = u[q * 3 + 1], z = u[q * 3 + 2]; let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & (cap - 1);
    for (;;) { const e = table[h]; if (e < 0) { table[h] = m; first[m] = q; idx[q] = m++; break; } const r = first[e]; if (u[r * 3] === x && u[r * 3 + 1] === y && u[r * 3 + 2] === z) { idx[q] = e; break; } h = (h + 1) & (cap - 1); } }
  const E = new Map(); let deg = 0;
  for (let t = 0; t < nt; t++) { const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2]; if (a === b || b === c || a === c) { deg++; continue; } [[a, b], [b, c], [c, a]].forEach(([p, q]) => { const k = p * 4194304 + q; E.set(k, (E.get(k) || 0) + 1); }); }
  let open = 0, nm = 0; E.forEach((c, k) => { const p = Math.floor(k / 4194304), q = k - p * 4194304; if (c !== 1) nm++; if (E.get(q * 4194304 + p) !== 1) open++; });
  return { watertight: open === 0 && nm === 0 && deg === 0, open, nonManifold: nm, degenerate: deg, verts: m, tris: nt };
}
export { FALL, TAU, D2R, R2D, clamp };
