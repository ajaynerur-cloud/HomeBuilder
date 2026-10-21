// Catmull-Clark subdivision with creases: creased and open edges stay sharp, corners with three or more creases stay put.
import { ekey, avg, add, mul } from './mesh.js';
export function subdivide(m) {
  const V = m.V, F = m.F, C = m.C || {}, nV = V.length, fp = F.map((f) => avg(f.map((i) => V[i]))), E = new Map();
  F.forEach((f, fi) => f.forEach((a, k) => { const b = f[(k + 1) % f.length], key = ekey(a, b); let e = E.get(key); if (!e) { e = { a, b, faces: [], sharp: !!C[key] }; E.set(key, e); } e.faces.push(fi); }));
  const edges = [...E.values()]; edges.forEach((e, i) => { e.idx = nV + F.length + i; if (e.faces.length !== 2) e.sharp = true; e.pt = e.sharp ? avg([V[e.a], V[e.b]]) : avg([V[e.a], V[e.b], fp[e.faces[0]], fp[e.faces[1]]]); });
  const vF = V.map(() => []), vE = V.map(() => []); F.forEach((f, fi) => f.forEach((a) => vF[a].push(fi))); edges.forEach((e) => { vE[e.a].push(e); vE[e.b].push(e); });
  const NV = V.map((v, i) => {
    const sh = vE[i].filter((e) => e.sharp); if (!vE[i].length) return v.slice();
    if (sh.length >= 3) return v.slice();
    if (sh.length === 2) { const n1 = V[sh[0].a === i ? sh[0].b : sh[0].a], n2 = V[sh[1].a === i ? sh[1].b : sh[1].a]; return add(mul(v, 0.75), mul(add(n1, n2), 0.125)); }
    const n = vE[i].length; if (n < 3) return v.slice();
    const Fa = avg(vF[i].map((f) => fp[f])), Ra = avg(vE[i].map((e) => avg([V[e.a], V[e.b]]))); return mul(add(add(Fa, mul(Ra, 2)), mul(v, n - 3)), 1 / n);
  });
  const outV = NV.concat(fp, edges.map((e) => e.pt)), outF = [], outC = {};
  F.forEach((f, fi) => { const k = f.length; for (let q = 0; q < k; q++) { const a = f[q], nx = f[(q + 1) % k], pv = f[(q + k - 1) % k]; outF.push([a, E.get(ekey(a, nx)).idx, nV + fi, E.get(ekey(pv, a)).idx]); } });
  edges.forEach((e) => { if (C[ekey(e.a, e.b)]) { outC[ekey(e.a, e.idx)] = 1; outC[ekey(e.idx, e.b)] = 1; } });
  return { V: outV, F: outF, C: outC };
}
// split every polygon into quads around its centre without moving anything (keeps the shape, adds resolution)
export function linearSubdivide(m) {
  const V = m.V, F = m.F, nV = V.length, mids = new Map(), outV = V.map((v) => v.slice()), outF = [], C = m.C || {}, outC = {};
  const mid = (a, b) => { const k = ekey(a, b); if (!mids.has(k)) { mids.set(k, outV.length); outV.push(avg([V[a], V[b]])); if (C[k]) { outC[ekey(a, outV.length - 1)] = 1; outC[ekey(outV.length - 1, b)] = 1; } } return mids.get(k); };
  F.forEach((f) => { const c = outV.length; outV.push(avg(f.map((i) => V[i]))); const k = f.length; for (let q = 0; q < k; q++) { const a = f[q], nx = f[(q + 1) % k], pv = f[(q + k - 1) % k]; outF.push([a, mid(a, nx), c, mid(pv, a)]); } });
  return { V: outV, F: outF, C: outC };
}
