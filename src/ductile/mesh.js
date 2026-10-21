// Ductile mesh core: an editable polygon cage {V, F, C}. V: [[x,y,z]], F: [[i,j,k,...]] counter-clockwise from outside, C: crease edges {"a_b": 1}.
// Every operation edits in place and keeps the mesh closed and consistently oriented where it was before.
export const ekey = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]), unit = (a) => mul(a, 1 / (len(a) || 1)), lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const avg = (pts) => { const o = [0, 0, 0]; pts.forEach((p) => { o[0] += p[0]; o[1] += p[1]; o[2] += p[2]; }); return mul(o, 1 / (pts.length || 1)); };
export const clone = (m) => ({ V: m.V.map((v) => v.slice()), F: m.F.map((f) => f.slice()), C: { ...(m.C || {}) } });
export function faceNormal(V, f) { const n = [0, 0, 0]; for (let q = 0; q < f.length; q++) { const a = V[f[q]], b = V[f[(q + 1) % f.length]]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); } return unit(n); }
export const faceCenter = (V, f) => avg(f.map((i) => V[i]));
export function edgeMap(m) { const E = new Map(); m.F.forEach((f, fi) => f.forEach((a, k) => { const b = f[(k + 1) % f.length], key = ekey(a, b); let e = E.get(key); if (!e) { e = { a: Math.min(a, b), b: Math.max(a, b), faces: [] }; E.set(key, e); } e.faces.push(fi); })); return E; }
export function vertsOfFaces(m, faces) { const s = new Set(); faces.forEach((f) => m.F[f] && m.F[f].forEach((i) => s.add(i))); return [...s]; }
export function cleanup(m) {
  const used = new Map(), V = []; m.F.forEach((f) => f.forEach((i) => { if (!used.has(i)) { used.set(i, V.length); V.push(m.V[i]); } }));
  const C = {}; Object.keys(m.C || {}).forEach((k) => { const [a, b] = k.split('_').map(Number); if (used.has(a) && used.has(b)) C[ekey(used.get(a), used.get(b))] = m.C[k]; });
  m.F = m.F.map((f) => f.map((i) => used.get(i))); m.V = V; m.C = C; return used;
}
// ---------- transforms on a set of vertices, with optional soft falloff
export function softWeights(m, ids, radius) {
  const w = new Map(); ids.forEach((i) => w.set(i, 1)); if (!(radius > 0)) return w; const pts = ids.map((i) => m.V[i]);
  m.V.forEach((v, i) => { if (w.has(i)) return; let d = Infinity; pts.forEach((p) => { d = Math.min(d, len(sub(v, p))); }); if (d < radius) { const t = d / radius; w.set(i, 0.5 * (1 + Math.cos(Math.PI * t))); } });
  return w;
}
export function translate(m, w, D) { w.forEach((k, i) => { m.V[i] = add(m.V[i], mul(D, k)); }); }
export function scaleAbout(m, w, c, s) { w.forEach((k, i) => { const d = sub(m.V[i], c); m.V[i] = add(c, [d[0] * (1 + (s[0] - 1) * k), d[1] * (1 + (s[1] - 1) * k), d[2] * (1 + (s[2] - 1) * k)]); }); }
export function rotateAbout(m, w, c, axis, ang) {
  const u = unit(axis); w.forEach((k, i) => { const a = ang * k, v = sub(m.V[i], c), cs = Math.cos(a), sn = Math.sin(a), d = dot(u, v), cr = cross(u, v); m.V[i] = add(c, [v[0] * cs + cr[0] * sn + u[0] * d * (1 - cs), v[1] * cs + cr[1] * sn + u[1] * d * (1 - cs), v[2] * cs + cr[2] * sn + u[2] * d * (1 - cs)]); });
}
// ---------- push/pull: region extrude. Shared edges inside the region get no walls. A free-standing region gets a back cap so the result is closed.
export function extrude(m, faces, D) {
  const sel = new Set(faces), vs = vertsOfFaces(m, faces), map = new Map(), E = edgeMap(m), inSel = new Set();
  faces.forEach((f) => { const g = m.F[f]; g.forEach((a, k) => inSel.add(a + '>' + g[(k + 1) % g.length])); });
  let allOpen = true; const bnd = [];
  faces.forEach((f) => { const g = m.F[f]; g.forEach((a, k) => { const b = g[(k + 1) % g.length]; if (!inSel.has(b + '>' + a)) { bnd.push([a, b]); const e = E.get(ekey(a, b)); if (e.faces.some((x) => !sel.has(x))) allOpen = false; } }); });
  const cap = allOpen ? faces.map((f) => m.F[f].slice().reverse()) : null;
  vs.forEach((i) => { map.set(i, m.V.length); m.V.push(add(m.V[i], D || [0, 0, 0])); });
  const sides = bnd.map(([a, b]) => [a, b, map.get(b), map.get(a)]);
  bnd.forEach(([a, b]) => { if (m.C[ekey(a, b)]) m.C[ekey(map.get(a), map.get(b))] = m.C[ekey(a, b)]; });
  faces.forEach((f) => { m.F[f] = m.F[f].map((i) => map.get(i)); });
  m.F.push(...sides); if (cap) m.F.push(...cap);
  if (cap) fixOrientation(m);
  return faces.slice();
}
// ---------- inset: each face gets an inner face, offset inward by t along its own plane (exact for convex faces)
export function inset(m, faces, t) {
  const out = [];
  faces.forEach((fi) => {
    const f = m.F[fi], n = faceNormal(m.V, f), k = f.length, P = f.map((i) => m.V[i]), inner = [];
    for (let q = 0; q < k; q++) {
      const pv = P[(q + k - 1) % k], v = P[q], nx = P[(q + 1) % k], e1 = unit(sub(v, pv)), e2 = unit(sub(nx, v)), n1 = unit(cross(n, e1)), n2 = unit(cross(n, e2)), s = 1 + dot(n1, n2);
      const off = s > 1e-3 ? mul(add(n1, n2), t / s) : mul(n1, t); inner.push(m.V.length); m.V.push(add(v, off));
    }
    for (let q = 0; q < k; q++) { const q1 = (q + 1) % k; m.F.push([f[q], f[q1], inner[q1], inner[q]]); }
    m.F[fi] = inner; out.push(fi);
  });
  return out;
}
// ---------- loop cut: walk a ring of quads across an edge and split it at t
export function edgeRing(m, a, b) {
  const E = edgeMap(m), walk = (p, q, f0) => { const ring = [], faces = []; let f = f0, cur = [p, q]; const seen = new Set();
    while (f != null && !seen.has(f)) { seen.add(f); const F = m.F[f]; if (F.length !== 4) break; const i = F.indexOf(cur[0]), j = F.indexOf(cur[1]); let np, nq;
      if (F[(i + 1) % 4] === cur[1]) { np = F[(i + 3) % 4]; nq = F[(i + 2) % 4]; } else if (F[(j + 1) % 4] === cur[0]) { np = F[(i + 1) % 4]; nq = F[(j + 3) % 4]; } else break;
      faces.push(f); ring.push([np, nq]); const e = E.get(ekey(np, nq)); f = e ? e.faces.find((x) => x !== f) : null; cur = [np, nq]; if (ekey(np, nq) === ekey(a, b)) { ring.pop(); return { ring, faces, closed: true }; } }
    return { ring, faces, closed: false }; };
  const e = E.get(ekey(a, b)); if (!e) return null; const r1 = walk(a, b, e.faces[0]);
  if (r1.closed) return { edges: [[a, b]].concat(r1.ring), faces: r1.faces, closed: true };
  const r2 = e.faces[1] != null ? walk(a, b, e.faces[1]) : { ring: [], faces: [] };
  return { edges: r2.ring.slice().reverse().concat([[a, b]], r1.ring), faces: r2.faces.slice().reverse().concat(r1.faces), closed: false };
}
export function loopCut(m, a, b, t = 0.5) {
  const R = edgeRing(m, a, b); if (!R || !R.faces.length) return null; const mid = new Map();
  R.edges.forEach(([p, q]) => { const k = ekey(p, q); if (!mid.has(k)) { const id = m.V.length; m.V.push(lerp(m.V[p], m.V[q], t)); mid.set(k, { id, p, q }); if (m.C[k]) { m.C[ekey(p, id)] = m.C[k]; m.C[ekey(id, q)] = m.C[k]; delete m.C[k]; } } });
  const ringFaces = new Set(R.faces), insertInto = (fi) => { const F = m.F[fi], out = []; F.forEach((v, k) => { out.push(v); const w = F[(k + 1) % F.length], md = mid.get(ekey(v, w)); if (md) out.push(md.id); }); m.F[fi] = out; };
  const touched = new Set(); mid.forEach((md) => { m.F.forEach((F, fi) => { if (touched.has(fi)) return; for (let k = 0; k < F.length; k++) if (ekey(F[k], F[(k + 1) % F.length]) === ekey(md.p, md.q)) { touched.add(fi); break; } }); });
  touched.forEach((fi) => insertInto(fi));
  const newEdges = [];
  R.faces.forEach((fi) => { const F = m.F[fi], ids = F.map((v, k) => k).filter((k) => [...mid.values()].some((md) => md.id === F[k])); if (ids.length !== 2) return; const [i, j] = ids; const A = F.slice(i, j + 1), B = F.slice(j).concat(F.slice(0, i + 1)); m.F[fi] = A; m.F.push(B); newEdges.push([F[i], F[j]]); });
  return { edges: newEdges, verts: [...mid.values()].map((x) => x.id) };
}
export function edgeLoop(m, a, b) {
  const E = edgeMap(m), vf = m.V.map(() => []); m.F.forEach((f, fi) => f.forEach((v) => vf[v].push(fi)));
  const nbrs = (v) => { const s = new Set(); vf[v].forEach((fi) => { const f = m.F[fi], k = f.indexOf(v); s.add(f[(k + 1) % f.length]); s.add(f[(k + f.length - 1) % f.length]); }); return [...s]; };
  const go = (p, q) => { const out = []; let prev = p, cur = q; const seen = new Set([ekey(p, q)]);
    for (let it = 0; it < 4096; it++) { const ns = nbrs(cur); if (ns.length !== 4) break; const ef = new Set(E.get(ekey(prev, cur)).faces); const next = ns.find((w) => w !== prev && !E.get(ekey(cur, w)).faces.some((fi) => ef.has(fi))); if (next == null) break; const k = ekey(cur, next); if (seen.has(k)) break; seen.add(k); out.push([cur, next]); prev = cur; cur = next; }
    return out; };
  const f = go(a, b), out = [[a, b]].concat(f), seen = new Set(out.map(([p, q]) => ekey(p, q)));
  go(b, a).forEach(([p, q]) => { const k = ekey(p, q); if (!seen.has(k)) { seen.add(k); out.push([p, q]); } });
  return out;
}
// ---------- bridge two faces with a tube (makes handles and through-holes)
export function bridge(m, fa, fb) {
  const A = m.F[fa], B = m.F[fb]; if (!A || !B || A.length !== B.length) return 'Pick two faces with the same number of corners.';
  if (A.some((i) => B.includes(i))) return 'The faces touch. Pick faces that are apart.';
  const n = A.length, Br = B.slice().reverse(); let best = 0, bd = Infinity;
  for (let o = 0; o < n; o++) { let d = 0; for (let q = 0; q < n; q++) d += len(sub(m.V[A[q]], m.V[Br[(q + o) % n]])); if (d < bd) { bd = d; best = o; } }
  const Cc = []; for (let q = 0; q < n; q++) Cc.push(Br[(q + best) % n]);
  const sides = []; for (let q = 0; q < n; q++) { const q1 = (q + 1) % n; sides.push([A[q], A[q1], Cc[q1], Cc[q]]); }
  m.F = m.F.filter((f, i) => i !== fa && i !== fb).concat(sides); return null;
}
export function deleteFaces(m, faces) { const s = new Set(faces); m.F = m.F.filter((f, i) => !s.has(i)); cleanup(m); }
export function flipFaces(m, faces) { faces.forEach((f) => { m.F[f] = m.F[f].slice().reverse(); }); }
export function mergeVerts(m, ids) {
  if (ids.length < 2) return; const c = avg(ids.map((i) => m.V[i])), keep = ids[0], set = new Set(ids); m.V[keep] = c;
  m.F = m.F.map((f) => { const g = []; f.forEach((v) => { const w = set.has(v) ? keep : v; if (g[g.length - 1] !== w) g.push(w); }); if (g.length > 1 && g[0] === g[g.length - 1]) g.pop(); return g; }).filter((f) => f.length >= 3); cleanup(m);
}
// ---------- draw on a face: imprint a convex polygon into a planar face, so it can be pushed or pulled on its own
export function imprint(m, fi, poly) {
  const F = m.F[fi], n = faceNormal(m.V, F), c = avg(poly), ids = poly.map((p) => { m.V.push(p.slice()); return m.V.length - 1; });
  const u = unit(sub(m.V[F[1]], m.V[F[0]])), v = cross(n, u), ang = (p) => { const d = sub(p, c); return Math.atan2(dot(d, v), dot(d, u)); };
  // keep the inner loop wound like the face
  if (dot(faceNormal(m.V, ids), n) < 0) ids.reverse();
  const out = [...F], inn = [...ids], oa = out.map((i) => ang(m.V[i])), ia = inn.map((i) => ang(m.V[i]));
  const tris = [], start = (arr) => { let b = 0; arr.forEach((a, k) => { if (a < arr[b]) b = k; }); return b; };
  // walk both loops in angular order and stitch them
  const so = start(oa), si = start(ia), O = out.map((_, k) => out[(so + k) % out.length]), OA = O.map((i) => ang(m.V[i])), I = inn.map((_, k) => inn[(si + k) % inn.length]), IA = I.map((i) => ang(m.V[i]));
  if (F.length === 4 && poly.length === 4) { // quads map corner to corner, giving four clean quads
    const pairs = O.map((o) => { let b = 0, bd = Infinity; I.forEach((x, k) => { const d = len(sub(m.V[o], m.V[x])); if (d < bd) { bd = d; b = k; } }); return b; });
    const ok = new Set(pairs).size === 4 && pairs.every((p, k) => p === (pairs[0] + k) % 4);
    if (ok) { const ring = []; for (let k = 0; k < 4; k++) { const k1 = (k + 1) % 4; ring.push([O[k], O[k1], I[pairs[k1]], I[pairs[k]]]); } m.F[fi] = pairs.map((p) => I[p]); m.F.push(...ring); return fi; }
  }
  let a = 0, b = 0; const no = O.length, ni = I.length, unwrap = (x, base) => { while (x < base) x += Math.PI * 2; return x; };
  while (a < no || b < ni) {
    const ca = O[a % no], na = O[(a + 1) % no], cb = I[b % ni], nb = I[(b + 1) % ni];
    const advO = a < no && (b >= ni || unwrap(OA[(a + 1) % no], OA[0]) + (a + 1 === no ? Math.PI * 2 : 0) <= unwrap(IA[(b + 1) % ni], IA[0]) + (b + 1 === ni ? Math.PI * 2 : 0));
    if (advO) { tris.push([ca, na, cb]); a++; } else { tris.push([ca, nb, cb]); b++; }
  }
  m.F[fi] = I; m.F.push(...tris); return fi;
}
export function setCrease(m, edges, on) { edges.forEach(([a, b]) => { if (on) m.C[ekey(a, b)] = 1; else delete m.C[ekey(a, b)]; }); }
// a closed solid with negative volume is inside out: turn it the right way
export function signedVolume(m) { let v = 0; m.F.forEach((f) => { for (let q = 1; q < f.length - 1; q++) { const a = m.V[f[0]], b = m.V[f[q]], c = m.V[f[q + 1]]; v += dot(a, cross(b, c)) / 6; } }); return v; }
export function fixOrientation(m) { if (isClosed(m) && signedVolume(m) < 0) m.F = m.F.map((f) => f.slice().reverse()); return m; }
// closed-surface check on polygons
export function isClosed(m) { const E = new Map(); m.F.forEach((f) => f.forEach((a, k) => { const b = f[(k + 1) % f.length]; E.set(a + '>' + b, (E.get(a + '>' + b) || 0) + 1); })); for (const [k, c] of E) { const [a, b] = k.split('>'); if (c !== 1 || E.get(b + '>' + a) !== 1) return false; } return true; }
