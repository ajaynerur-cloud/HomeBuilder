// Polygon mesh with keyed vertices. Keys stay the same when parameters change, so edits can be replayed.
import earcut from 'earcut';
import { meshStats } from '../model/geometry.js';

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a) => { const l = len(a); return l < 1e-12 ? [0, 0, 1] : [a[0] / l, a[1] / l, a[2] / l]; };

export function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

export class Mesh {
  constructor() { this.v = []; this.f = []; }
  clone() { const m = new Mesh(); m.v = this.v.map((a) => ({ k: a.k, p: a.p.slice() })); m.f = this.f.map((a) => ({ v: a.v.slice() })); return m; }
  addV(p, k) { this.v.push({ k, p: [p[0], p[1], p[2]] }); return this.v.length - 1; }
  addF(ids) { this.f.push({ v: ids.slice() }); return this.f.length - 1; }
  keyIndex() { const m = new Map(); this.v.forEach((a, i) => m.set(a.k, i)); return m; }
  faceKey(fi) { return this.f[fi].v.map((i) => this.v[i].k).sort().join('|'); }
  faceKeys(fi) { return this.f[fi].v.map((i) => this.v[i].k); }
  faceIndex() { const m = new Map(); this.f.forEach((_, i) => m.set(this.faceKey(i), i)); return m; }
}

export function faceNormal(m, fi) {
  const L = m.f[fi].v; let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < L.length; i++) { const a = m.v[L[i]].p, b = m.v[L[(i + 1) % L.length]].p; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
  return unit([nx, ny, nz]);
}
export function faceCenter(m, fi) { const L = m.f[fi].v, c = [0, 0, 0]; L.forEach((i) => { const p = m.v[i].p; c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }); return [c[0] / L.length, c[1] / L.length, c[2] / L.length]; }
export function faceArea(m, fi) {
  const L = m.f[fi].v; let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < L.length; i++) { const a = m.v[L[i]].p, b = m.v[L[(i + 1) % L.length]].p; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
  return Math.hypot(nx, ny, nz) / 2;
}

// Triangles (9 numbers each) and the face each came from
export function triangulate(m) {
  const tris = [], faceOf = [];
  const P = (i) => m.v[i].p;
  const tri = (a, b, c, f) => { const A = P(a), B = P(b), C = P(c); tris.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]); faceOf.push(f); };
  m.f.forEach((F, fi) => {
    const L = F.v, n = L.length;
    if (n < 3) return;
    if (n === 3) return tri(L[0], L[1], L[2], fi);
    if (n === 4) {
      const d1 = len(sub(P(L[0]), P(L[2]))), d2 = len(sub(P(L[1]), P(L[3])));
      if (d1 <= d2) { tri(L[0], L[1], L[2], fi); tri(L[0], L[2], L[3], fi); } else { tri(L[0], L[1], L[3], fi); tri(L[1], L[2], L[3], fi); }
      return;
    }
    const N = faceNormal(m, fi), ax = Math.abs(N[0]) > Math.abs(N[1]) && Math.abs(N[0]) > Math.abs(N[2]) ? 0 : (Math.abs(N[1]) > Math.abs(N[2]) ? 1 : 2), sgn = N[ax] < 0 ? -1 : 1;
    const flat = []; L.forEach((i) => { const p = P(i); const [u, v] = ax === 0 ? [p[1], p[2]] : ax === 1 ? [p[2], p[0]] : [p[0], p[1]]; flat.push(u, v); });
    const idx = earcut(flat);
    let T3 = [];
    for (let i = 0; i < idx.length; i += 3) T3.push([L[idx[i]], L[idx[i + 1]], L[idx[i + 2]]]);
    // earcut drops vertices that sit on a straight edge. Put them back so neighbouring faces still meet exactly.
    const usedV = new Set(); T3.forEach((t) => t.forEach((v) => usedV.add(v)));
    L.forEach((v) => {
      if (usedV.has(v)) return; const pv = P(v);
      for (let k = 0; k < T3.length; k++) {
        const t = T3[k];
        for (let e = 0; e < 3; e++) {
          const a = t[e], b = t[(e + 1) % 3], c = t[(e + 2) % 3], A = P(a), B = P(b), ab = sub(B, A), l2 = dot(ab, ab), u = l2 ? dot(sub(pv, A), ab) / l2 : -1;
          if (u > 1e-9 && u < 1 - 1e-9 && len(sub(add(A, mul(ab, u)), pv)) < 1e-6 * Math.max(1, Math.sqrt(l2))) { T3.splice(k, 1, [a, v, c], [v, b, c]); usedV.add(v); return; }
        }
      }
    });
    T3.forEach((t) => { if (sgn > 0 || ax === 1) { const q = sgn > 0 ? t : [t[0], t[2], t[1]]; tri(q[0], q[1], q[2], fi); } else tri(t[0], t[2], t[1], fi); });
  });
  return { tris, faceOf };
}

export function stats(m) { const t = triangulate(m); return meshStats(t.tris, 1e-4); }

// Orientation of triangles from the earcut path can differ from the face winding. Make every triangle follow the face normal.
export function triangulateOriented(m) {
  const T = triangulate(m), tris = T.tris;
  for (let t = 0; t < T.faceOf.length; t++) {
    const o = t * 9, N = faceNormal(m, T.faceOf[t]), a = [tris[o], tris[o + 1], tris[o + 2]], b = [tris[o + 3], tris[o + 4], tris[o + 5]], c = [tris[o + 6], tris[o + 7], tris[o + 8]];
    if (dot(cross(sub(b, a), sub(c, a)), N) < 0) { for (let k = 0; k < 3; k++) { const x = tris[o + 3 + k]; tris[o + 3 + k] = tris[o + 6 + k]; tris[o + 6 + k] = x; } }
  }
  return T;
}

export function signedVolume(m) { const t = triangulateOriented(m).tris; let v = 0; for (let i = 0; i < t.length; i += 9) v += (t[i] * (t[i + 4] * t[i + 8] - t[i + 7] * t[i + 5]) - t[i + 1] * (t[i + 3] * t[i + 8] - t[i + 6] * t[i + 5]) + t[i + 2] * (t[i + 3] * t[i + 7] - t[i + 6] * t[i + 4])) / 6; return v; }
export function fixOrientation(m) { if (signedVolume(m) < 0) m.f.forEach((F) => F.v.reverse()); return m; }

// Make every face wind the same way as its neighbours (breadth first over shared edges)
export function orientConsistently(m) {
  const E = edgeMap(m), seen = new Set(), adj = m.f.map(() => []);
  E.forEach((e) => { if (e.faces.length === 2) { adj[e.faces[0].f].push(e.faces[1].f); adj[e.faces[1].f].push(e.faces[0].f); } });
  const dirIn = (fi, a, b) => { const L = m.f[fi].v; for (let i = 0; i < L.length; i++) if (L[i] === a && L[(i + 1) % L.length] === b) return 1; return -1; };
  for (let s0 = 0; s0 < m.f.length; s0++) {
    if (seen.has(s0)) continue; seen.add(s0); const q = [s0];
    while (q.length) {
      const f = q.pop(), L = m.f[f].v;
      adj[f].forEach((g) => {
        if (seen.has(g)) return;
        const G = m.f[g].v; let shared = null;
        for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; if (G.includes(a) && G.includes(b)) { shared = [a, b]; break; } }
        if (shared && dirIn(g, shared[0], shared[1]) === 1) G.reverse();
        seen.add(g); q.push(g);
      });
    }
  }
  return m;
}
export function edgeMap(m) {
  const E = new Map();
  m.f.forEach((F, fi) => { const L = F.v; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length], k = a < b ? a + '|' + b : b + '|' + a; let e = E.get(k); if (!e) { e = { a: Math.min(a, b), b: Math.max(a, b), faces: [] }; E.set(k, e); } e.faces.push({ f: fi, fwd: a < b }); } });
  return E;
}
export function isClosed(m) { let ok = true; edgeMap(m).forEach((e) => { if (e.faces.length !== 2 || e.faces[0].fwd === e.faces[1].fwd) ok = false; }); return ok; }
export function vertexFaces(m) { const r = m.v.map(() => []); m.f.forEach((F, fi) => F.v.forEach((i) => r[i].push(fi))); return r; }

function removeFaces(m, set) { const map = new Map(); const nf = []; m.f.forEach((F, i) => { if (!set.has(i)) { map.set(i, nf.length); nf.push(F); } }); m.f = nf; return map; }
export function compact(m) {
  const used = new Set(); m.f.forEach((F) => F.v.forEach((i) => used.add(i)));
  const map = new Map(), nv = []; m.v.forEach((a, i) => { if (used.has(i)) { map.set(i, nv.length); nv.push(a); } });
  m.v = nv; m.f.forEach((F) => { F.v = F.v.map((i) => map.get(i)); }); return m;
}

// ---- edits (all work on a mesh in place)
export function moveVerts(m, ids, fn) { ids.forEach((i) => { const p = m.v[i].p, q = fn(p, i); p[0] = q[0]; p[1] = q[1]; p[2] = q[2]; }); }

// Extrude a region of faces by a vector. Old faces go, walls are added along the boundary.
export function extrudeFaces(m, fis, vec, tag) {
  if (!fis.length || len(vec) < 1e-9) return { faces: fis };
  const set = new Set(fis), dir = new Map();
  fis.forEach((fi) => { const L = m.f[fi].v; for (let i = 0; i < L.length; i++) dir.set(L[i] + '>' + L[(i + 1) % L.length], [L[i], L[(i + 1) % L.length]]); });
  const boundary = []; dir.forEach(([a, b]) => { if (!dir.has(b + '>' + a)) boundary.push([a, b]); });
  const used = new Set(); fis.forEach((fi) => m.f[fi].v.forEach((v) => used.add(v)));
  const nv = new Map(); used.forEach((v) => { nv.set(v, m.addV(add(m.v[v].p, vec), tag + ':' + m.v[v].k)); });
  const newTop = fis.map((fi) => m.addF(m.f[fi].v.map((v) => nv.get(v))));
  boundary.forEach(([a, b]) => m.addF([a, b, nv.get(b), nv.get(a)]));
  const map = removeFaces(m, set); const topNow = newTop.map((i) => i - [...set].filter((s) => s < i).length);
  compact(m); return { faces: topNow };
}

export function insetFace(m, fi, d, tag) {
  const L = m.f[fi].v, n = L.length, N = faceNormal(m, fi), key = hash(m.faceKey(fi)), nv = [];
  for (let i = 0; i < n; i++) {
    const p0 = m.v[L[(i - 1 + n) % n]].p, p1 = m.v[L[i]].p, p2 = m.v[L[(i + 1) % n]].p;
    const e1 = unit(sub(p1, p0)), e2 = unit(sub(p2, p1)), i1 = cross(N, e1), i2 = cross(N, e2), den = 1 + dot(i1, i2);
    const off = den > 0.15 ? mul(add(i1, i2), d / den) : mul(add(i1, i2), d / 2);
    nv.push(m.addV(add(p1, off), tag + ':' + m.v[L[i]].k + '@' + key));
  }
  const inner = m.addF(nv.slice());
  for (let i = 0; i < n; i++) m.addF([L[i], L[(i + 1) % n], nv[(i + 1) % n], nv[i]]);
  const map = removeFaces(m, new Set([fi])); compact(m); return { faces: [map.has(inner) ? map.get(inner) : inner - (inner > fi ? 1 : 0)] };
}

export function deleteFaces(m, fis) { removeFaces(m, new Set(fis)); compact(m); }

// ---- tidy: merge neighbouring flat faces, drop straight in-between vertices
export function cleanup(m, eps = 1e-6) {
  let changed = true, guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    const E = edgeMap(m);
    for (const e of E.values()) {
      if (e.faces.length !== 2) continue;
      const [A, B] = e.faces; if (A.f === B.f) continue;
      const na = faceNormal(m, A.f), nb = faceNormal(m, B.f); if (dot(na, nb) < 1 - 1e-9) continue;
      const pa = m.v[m.f[A.f].v[0]].p; if (m.f[B.f].v.some((i) => Math.abs(dot(sub(m.v[i].p, pa), na)) > eps)) continue;
      const FA = m.f[A.f].v, FB = m.f[B.f].v, shared = FA.filter((i) => FB.includes(i)); if (shared.length !== 2) continue;
      const ia = FA.findIndex((i, k) => FB.includes(i) && FB.includes(FA[(k + 1) % FA.length]));
      if (ia < 0) continue;
      const a = FA[ia], b = FA[(ia + 1) % FA.length];
      const rot = (L, s) => { const k = L.indexOf(s); return L.slice(k).concat(L.slice(0, k)); };
      const F1 = rot(FA, b), F2 = rot(FB, a);               // F1: b ... a   F2: a ... b
      const merged = F1.concat(F2.slice(1, F2.length - 1 + 0).filter((x) => x !== b));
      if (new Set(merged).size !== merged.length) continue;
      m.f[A.f].v = merged; removeFaces(m, new Set([B.f])); changed = true; break;
    }
  }
  // vertices that only join two faces along a straight line
  changed = true; guard = 0;
  while (changed && guard++ < 200) {
    changed = false; const VF = vertexFaces(m);
    for (let v = 0; v < m.v.length; v++) {
      if (VF[v].length !== 2) continue;
      let ok = true; const q = VF[v];
      for (const fi of q) { const L = m.f[fi].v; if (L.length <= 3) { ok = false; break; } const k = L.indexOf(v), p0 = m.v[L[(k - 1 + L.length) % L.length]].p, p1 = m.v[v].p, p2 = m.v[L[(k + 1) % L.length]].p; if (len(cross(sub(p1, p0), sub(p2, p1))) > eps * Math.max(1, len(sub(p2, p0)))) { ok = false; break; } }
      if (!ok) continue;
      q.forEach((fi) => { m.f[fi].v = m.f[fi].v.filter((i) => i !== v); }); changed = true; break;
    }
  }
  return compact(m);
}

// ---- Catmull-Clark subdivision
export function subdivide(m) {
  const E = edgeMap(m), VF = vertexFaces(m), out = new Mesh();
  const fp = m.f.map((_, fi) => faceCenter(m, fi)), ep = new Map(), P = (i) => m.v[i].p;
  E.forEach((e, k) => {
    const a = P(e.a), b = P(e.b); let q;
    if (e.faces.length === 2) q = mul(add(add(a, b), add(fp[e.faces[0].f], fp[e.faces[1].f])), 0.25); else q = mul(add(a, b), 0.5);
    ep.set(k, q);
  });
  const nbr = m.v.map(() => []); E.forEach((e) => { nbr[e.a].push(e); nbr[e.b].push(e); });
  const np = m.v.map((v, i) => {
    const fs = VF[i], es = nbr[i], bnd = es.filter((e) => e.faces.length === 1);
    if (!fs.length) return v.p;
    if (bnd.length >= 2) { let s = [0, 0, 0]; bnd.slice(0, 2).forEach((e) => { s = add(s, P(e.a === i ? e.b : e.a)); }); return mul(add(s, mul(v.p, 6)), 1 / 8); }
    const n = fs.length; let F = [0, 0, 0], R = [0, 0, 0];
    fs.forEach((f) => { F = add(F, fp[f]); }); F = mul(F, 1 / n);
    es.forEach((e) => { R = add(R, mul(add(P(e.a), P(e.b)), 0.5)); }); R = mul(R, 1 / es.length);
    return mul(add(add(F, mul(R, 2)), mul(v.p, n - 3)), 1 / n);
  });
  m.v.forEach((v, i) => out.addV(np[i], v.k));
  const fidx = m.f.map((_, fi) => out.addV(fp[fi], 'F' + hash(m.faceKey(fi))));
  const eidx = new Map(); E.forEach((e, k) => eidx.set(k, out.addV(ep.get(k), 'E' + hash([m.v[e.a].k, m.v[e.b].k].sort().join('|')))));
  const ek = (a, b) => eidx.get(a < b ? a + '|' + b : b + '|' + a);
  m.f.forEach((F, fi) => { const L = F.v, n = L.length; for (let i = 0; i < n; i++) out.addF([L[i], ek(L[i], L[(i + 1) % n]), fidx[fi], ek(L[(i - 1 + n) % n], L[i])]); });
  return out;
}

// ---- selection helpers for quad meshes
function vertNbrs(m) { const r = m.v.map(() => new Set()); m.f.forEach((F) => { const L = F.v; for (let i = 0; i < L.length; i++) { r[L[i]].add(L[(i + 1) % L.length]); r[L[(i + 1) % L.length]].add(L[i]); } }); return r; }
// Edge loop through the edge (a,b): keeps going straight through four-way vertices.
export function edgeLoop(m, a, b) {
  const nb = vertNbrs(m), E = edgeMap(m), seq = [a, b];
  function step(u, v) {
    if (nb[v].size !== 4) return null;
    const e = E.get(u < v ? u + '|' + v : v + '|' + u); if (!e) return null;
    const near = new Set([u]); e.faces.forEach((fc) => { const L = m.f[fc.f].v, k = L.indexOf(v); near.add(L[(k + 1) % L.length]); near.add(L[(k - 1 + L.length) % L.length]); });
    const next = [...nb[v]].filter((x) => !near.has(x)); return next.length === 1 ? next[0] : null;
  }
  let u = a, v = b, guard = 0;
  while (guard++ < 5000) { const w = step(u, v); if (w === null) break; if (w === seq[0]) return { verts: seq, closed: true }; seq.push(w); u = v; v = w; }
  u = b; v = a; const back = []; guard = 0;
  while (guard++ < 5000) { const w = step(u, v); if (w === null) break; back.push(w); u = v; v = w; }
  return { verts: back.reverse().concat(seq), closed: false };
}
// Strip of quads starting at a face and crossing the edge (a,b) of that face
export function faceStrip(m, fi, a, b) {
  const E = edgeMap(m), out = [fi]; let cur = fi, ea = a, eb = b, guard = 0;
  while (guard++ < 5000) {
    const e = E.get(ea < eb ? ea + '|' + eb : eb + '|' + ea); if (!e || e.faces.length !== 2) break;
    const nf = e.faces[0].f === cur ? e.faces[1].f : e.faces[0].f; if (nf === fi) return { faces: out, closed: true }; if (m.f[nf].v.length !== 4) break;
    out.push(nf); const L = m.f[nf].v, k = L.findIndex((x, i) => (x === ea && L[(i + 1) % 4] === eb) || (x === eb && L[(i + 1) % 4] === ea));
    ea = L[(k + 2) % 4]; eb = L[(k + 3) % 4]; cur = nf;
  }
  return { faces: out, closed: false };
}
