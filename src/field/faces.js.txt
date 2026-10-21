// Faces of a mesh: smooth patches bounded by creases. Planar patches can be pushed and pulled exactly; curved ones can be pulled softly.
import { unit, cross, dot, sub, len } from './frames.js';

export function triData(m) {
  const n = m.T.length / 3, N = new Float64Array(n * 3), A = new Float64Array(n), V = m.V;
  for (let t = 0; t < n; t++) {
    const a = m.T[t * 3] * 3, b = m.T[t * 3 + 1] * 3, c = m.T[t * 3 + 2] * 3;
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); A[t] = l / 2;
    if (l > 1e-14) { nx /= l; ny /= l; nz /= l; } N[t * 3] = nx; N[t * 3 + 1] = ny; N[t * 3 + 2] = nz;
  }
  return { n, N, A };
}
export function adjacency(m) {
  const n = m.T.length / 3, nb = new Int32Array(n * 3).fill(-1), map = new Map();
  for (let t = 0; t < n; t++) for (let e = 0; e < 3; e++) {
    const a = m.T[t * 3 + e], b = m.T[t * 3 + (e + 1) % 3], key = a < b ? a + '_' + b : b + '_' + a, o = map.get(key);
    if (o === undefined) map.set(key, t * 3 + e); else { nb[t * 3 + e] = Math.floor(o / 3); nb[o] = t; }
  }
  return nb;
}

// Grow patches over triangles whose neighbours turn by less than `angle` degrees, then absorb slivers left by rounded creases.
export function segment(m, o = {}) {
  const angle = o.angle || 26, cosA = Math.cos(angle * Math.PI / 180), { n, N, A } = triData(m), nb = adjacency(m), reg = new Int32Array(n).fill(-1);
  let R = 0; const lists = [];
  for (let s = 0; s < n; s++) {
    if (reg[s] >= 0 || A[s] < 1e-12) continue; const id = R++, q = [s], L = []; reg[s] = id;
    while (q.length) {
      const t = q.pop(); L.push(t);
      for (let e = 0; e < 3; e++) { const u = nb[t * 3 + e]; if (u < 0 || reg[u] >= 0 || A[u] < 1e-12) continue; if (N[t * 3] * N[u * 3] + N[t * 3 + 1] * N[u * 3 + 1] + N[t * 3 + 2] * N[u * 3 + 2] >= cosA) { reg[u] = id; q.push(u); } }
    }
    lists.push(L);
  }
  // Zero-area triangles (left by the surface snapping) join whichever face their neighbours belong to.
  for (let changed = true; changed;) {
    changed = false;
    for (let t = 0; t < n; t++) if (reg[t] < 0) for (let e = 0; e < 3; e++) { const u = nb[t * 3 + e]; if (u >= 0 && reg[u] >= 0) { reg[t] = reg[u]; lists[reg[u]].push(t); changed = true; break; } }
  }
  // Thin strips and specks along creases are the rounded edges of the mesh, not faces: keep them out of the face list.
  const h0 = m.h || 1, minA = (o.minArea !== undefined ? o.minArea : Math.pow(h0 * 2.2, 2));
  const area = (L) => L.reduce((s, t) => s + A[t], 0);
  const perim = (L, r) => { let p = 0; L.forEach((t) => { for (let e = 0; e < 3; e++) { const u = nb[t * 3 + e]; if (u < 0 || reg[u] !== r) { const a = m.T[t * 3 + e] * 3, b = m.T[t * 3 + (e + 1) % 3] * 3; p += Math.hypot(m.V[a] - m.V[b], m.V[a + 1] - m.V[b + 1], m.V[a + 2] - m.V[b + 2]); } } }); return p; };
  lists.forEach((L, r) => { if (!L) return; const ar = area(L); if (ar < minA || (2 * ar) / Math.max(perim(L, r), 1e-9) < h0 * 1.8) lists[r] = null; });
  const out = [], remap = new Map();
  lists.forEach((L, r) => { if (L && L.length) { remap.set(r, out.length); out.push(L); } });
  const tri = new Int32Array(n).fill(-1);
  const regions = out.map((L, id) => {
    L.forEach((t) => { tri[t] = id; });
    let a = 0, cx = 0, cy = 0, cz = 0, nx = 0, ny = 0, nz = 0; const verts = new Set();
    L.forEach((t) => { const ar = A[t]; a += ar; nx += N[t * 3] * ar; ny += N[t * 3 + 1] * ar; nz += N[t * 3 + 2] * ar; for (let k = 0; k < 3; k++) { const v = m.T[t * 3 + k]; verts.add(v); cx += m.V[v * 3] * ar / 3; cy += m.V[v * 3 + 1] * ar / 3; cz += m.V[v * 3 + 2] * ar / 3; } });
    const c = [cx / a, cy / a, cz / a], nn = unit([nx, ny, nz]); let worst = 0, rad = 0, spread = 1;
    verts.forEach((v) => { const p = [m.V[v * 3], m.V[v * 3 + 1], m.V[v * 3 + 2]]; worst = Math.max(worst, Math.abs(dot(sub(p, c), nn))); rad = Math.max(rad, len(sub(p, c))); });
    let flat = 0, dev = 0; const c6 = Math.cos(6 * Math.PI / 180);
    L.forEach((t) => { const d = N[t * 3] * nn[0] + N[t * 3 + 1] * nn[1] + N[t * 3 + 2] * nn[2]; spread = Math.min(spread, d); if (d > c6) flat += A[t]; let px = 0, py = 0, pz = 0; for (let k = 0; k < 3; k++) { const v = m.T[t * 3 + k]; px += m.V[v * 3] / 3; py += m.V[v * 3 + 1] / 3; pz += m.V[v * 3 + 2] / 3; } dev += Math.abs((px - c[0]) * nn[0] + (py - c[1]) * nn[1] + (pz - c[2]) * nn[2]) * A[t]; });
    dev /= a;
    const h = m.h || 1;
    return { id, tris: L, area: a, centroid: c, normal: nn, planar: dev < Math.max(0.25 * h, rad * 0.004) && flat / a > 0.9, radius: rad, flatness: worst };
  });
  return { regions, tri };
}

// The mesh rounds every crease by about half a cell. Push each outline EDGE outwards, in the face plane, to where the real surface ends,
// then rebuild the corners from the shifted edges. Straight edges and sharp corners come back exactly.
export function refineLoops(f, fr, loops2, h) {
  const at = (x, y) => f(fr.o[0] + fr.u[0] * x + fr.v[0] * y - fr.n[0] * 0.75 * h, fr.o[1] + fr.u[1] * x + fr.v[1] * y - fr.n[1] * 0.75 * h, fr.o[2] + fr.u[2] * x + fr.v[2] * y - fr.n[2] * 0.75 * h);
  return loops2.map((lp) => {
    const n = lp.length; if (n < 3) return lp;
    const E = lp.map((p, i) => {
      const q = lp[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1e-9, nx = dy / l, ny = -dx / l, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      const step = h / 10; let prev = at(mx + nx * -1.5 * h, my + ny * -1.5 * h), best = null;
      for (let s = -1.5 * h + step; s <= 3 * h; s += step) { const cur = at(mx + nx * s, my + ny * s); if (prev < 0 && cur >= 0) { const c = s - step + (step * prev) / (prev - cur); if (best === null || Math.abs(c) < Math.abs(best)) best = c; } prev = cur; }
      const d = best === null ? 0 : best;
      return { p: [p[0] + nx * d, p[1] + ny * d], dx: dx / l, dy: dy / l };
    });
    return lp.map((q, i) => {
      const a = E[(i - 1 + n) % n], b = E[i], den = a.dx * b.dy - a.dy * b.dx;
      if (Math.abs(den) < 0.02) return [(a.p[0] + b.p[0]) / 2 + (lp[(i + 1) % n][0] - lp[(i + 1) % n][0]), (a.p[1] + b.p[1]) / 2];
      const t = ((b.p[0] - a.p[0]) * b.dy - (b.p[1] - a.p[1]) * b.dx) / den, r = [a.p[0] + a.dx * t, a.p[1] + a.dy * t];
      return Math.hypot(r[0] - q[0], r[1] - q[1]) > 3 * h ? q : r;
    });
  });
}

export function boundaryLoops(m, seg, regionId) {
  const nb = adjacency(m), next = new Map(), R = seg.regions[regionId];
  R.tris.forEach((t) => { for (let e = 0; e < 3; e++) { const u = nb[t * 3 + e]; if (u < 0 || seg.tri[u] !== regionId) { const a = m.T[t * 3 + e], b = m.T[t * 3 + (e + 1) % 3]; if (!next.has(a)) next.set(a, []); next.get(a).push(b); } } });
  const loops = [], used = new Set();
  next.forEach((outs, a0) => {
    outs.forEach((b0) => {
      if (used.has(a0 + '>' + b0)) return; const loop = [a0]; let a = a0, b = b0, guard = 0;
      while (guard++ < 100000) {
        used.add(a + '>' + b); if (b === a0) break; loop.push(b);
        const cand = (next.get(b) || []).filter((c) => !used.has(b + '>' + c)); if (!cand.length) break; a = b; b = cand[0];
      }
      if (loop.length >= 3) loops.push(loop);
    });
  });
  return loops.map((l) => l.map((v) => [m.V[v * 3], m.V[v * 3 + 1], m.V[v * 3 + 2]]));
}

export function simplifyClosed(P, tol) {
  const n = P.length; if (n <= 4) return P.slice();
  let i0 = 0, i1 = 0, best = -1; for (let i = 1; i < n; i++) { const d = Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]); if (d > best) { best = d; i1 = i; } }
  const dp = (a, b) => {
    const A = P[a], B = P[b % n]; let md = -1, mi = -1; const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) { const q = P[i % n], d = Math.abs((q[0] - A[0]) * dy - (q[1] - A[1]) * dx) / l; if (d > md) { md = d; mi = i; } }
    if (md > tol) return dp(a, mi).concat(dp(mi, b)); return [a];
  };
  const idx = dp(i0, i1).concat(dp(i1, i0 + n)).map((i) => i % n);
  const uniq = [...new Set(idx)]; return uniq.map((i) => P[i]);
}

// A stable description of a face: where it is, which way it points, and its outline. Used to find the "same" face after the model changes.
export function faceRef(m, seg, id, localFrame) {
  const R = seg.regions[id], loops = boundaryLoops(m, seg, id), h = m.h || 1;
  const fr = localFrame || planeFrame(R);
  const loops2 = loops.map((lp) => simplifyClosed(lp.map((p) => { const w = sub(p, fr.o); return [dot(w, fr.u), dot(w, fr.v)]; }), 0.6 * h));
  return { c: R.centroid.slice(), n: R.normal.slice(), area: R.area, radius: R.radius, planar: R.planar, frame: fr, loops2, cell: h };
}
export function planeFrame(R) {
  const n = R.normal, ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], u = unit(cross(ref, n)), v = cross(n, u); return { o: R.centroid.slice(), u, v, n };
}
export function matchRegion(seg, ref) {
  let best = null, bs = Infinity; const size = Math.max(ref.radius, ref.cell * 4);
  seg.regions.forEach((R) => {
    const s = len(sub(R.centroid, ref.c)) / size + (1 - dot(R.normal, ref.n)) * 3 + Math.abs(Math.log((R.area + 1e-9) / (ref.area + 1e-9))) * 0.35;
    if (s < bs) { bs = s; best = R; }
  });
  return best && bs < 2.5 ? { region: best, score: bs } : null;
}
