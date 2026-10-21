// Final mesh -> triangles with auto-smooth normals (sharp above an angle), plus checks and file writers' input.
import { applyStack } from './modifiers.js';
import { sub, cross, unit, dot } from './mesh.js';
export function polysToSoup(m, opt = {}) {
  const V = m.V, F = m.F, cosT = Math.cos(((opt.flat ? 0 : (opt.angle == null ? 35 : opt.angle)) * Math.PI) / 180), FN = F.map((f) => { let n = [0, 0, 0]; for (let q = 1; q < f.length - 1; q++) { const c = cross(sub(V[f[q]], V[f[0]]), sub(V[f[q + 1]], V[f[0]])); n[0] += c[0]; n[1] += c[1]; n[2] += c[2]; } return n; });
  const FU = FN.map(unit), vf = V.map(() => []); F.forEach((f, fi) => f.forEach((v) => vf[v].push(fi)));
  let nt = 0; F.forEach((f) => { nt += Math.max(0, f.length - 2); });
  const pos = new Float32Array(nt * 9), nrm = new Float32Array(nt * 9); let t = 0;
  F.forEach((f, fi) => {
    const cn = f.map((v) => { if (opt.flat) return FU[fi]; const n = [0, 0, 0]; vf[v].forEach((g) => { if (dot(FU[g], FU[fi]) >= cosT) { n[0] += FN[g][0]; n[1] += FN[g][1]; n[2] += FN[g][2]; } }); return unit(n); });
    for (let q = 1; q < f.length - 1; q++) { [0, q, q + 1].forEach((k, s) => { const o = t * 9 + s * 3, p = V[f[k]], n = cn[k]; pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = p[2]; nrm[o] = n[0]; nrm[o + 1] = n[1]; nrm[o + 2] = n[2]; }); t++; }
  });
  return { pos, nrm, nt };
}
export function evaluateObject(o, quality) { const m = applyStack(o.cage, o.mods, quality), soup = polysToSoup(m, { flat: o.flat, angle: o.angle }); return { mesh: m, soup }; }
export function soupVolume(s) { let v = 0; const p = s.pos; for (let t = 0; t < s.nt; t++) { const o = t * 9; v += (p[o] * (p[o + 4] * p[o + 8] - p[o + 5] * p[o + 7]) - p[o + 1] * (p[o + 3] * p[o + 8] - p[o + 5] * p[o + 6]) + p[o + 2] * (p[o + 3] * p[o + 7] - p[o + 4] * p[o + 6])) / 6; } return v; }
