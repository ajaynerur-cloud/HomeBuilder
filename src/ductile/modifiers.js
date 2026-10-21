// Non-destructive modifier stack. Each modifier takes a polygon mesh {V, F, C} and returns a new one.
import { subdivide, linearSubdivide } from './subdiv.js';
import { ekey, sub, add, mul, cross, unit, len, faceNormal } from './mesh.js';
const TAU = Math.PI * 2, clamp = (x, a, b) => (x < a ? a : x > b ? b : x), frac = (x) => x - Math.floor(x);
function bbox(V) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; V.forEach((v) => { for (let c = 0; c < 3; c++) { if (v[c] < mn[c]) mn[c] = v[c]; if (v[c] > mx[c]) mx[c] = v[c]; } }); return { mn, mx, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] }; }
export function vertexNormals(m) { const N = m.V.map(() => [0, 0, 0]); m.F.forEach((f) => { for (let q = 1; q < f.length - 1; q++) { const a = m.V[f[0]], b = m.V[f[q]], c = m.V[f[q + 1]], n = cross(sub(b, a), sub(c, a)); [f[0], f[q], f[q + 1]].forEach((i) => { N[i][0] += n[0]; N[i][1] += n[1]; N[i][2] += n[2]; }); } }); return N.map(unit); }
const AXI = { x: 0, y: 1, z: 2 };
// pattern value 0..1 at (u, v)
const PATTERNS = {
  diamonds: { label: 'Faceted diamonds', f: (u, v) => { const s = frac(u + v) - 0.5, t = frac(u - v) - 0.5; return 1 - 2 * Math.max(Math.abs(s), Math.abs(t)); } },
  flutes: { label: 'Vertical flutes', f: (u, v, e) => Math.pow(Math.abs(Math.sin(Math.PI * u)), e) },
  rings: { label: 'Horizontal rings', f: (u, v, e) => Math.pow(Math.abs(Math.sin(Math.PI * v)), e) },
  spiral: { label: 'Spiral ribs', f: (u, v, e, tw) => Math.pow(Math.abs(Math.sin(Math.PI * (u + v * tw))), e) },
  quilt: { label: 'Soft quilt', f: (u, v) => (0.5 - 0.5 * Math.cos(TAU * frac(u + v))) * (0.5 - 0.5 * Math.cos(TAU * frac(u - v))) },
  waves: { label: 'Waves', f: (u, v) => 0.5 + 0.5 * Math.sin(TAU * u) * Math.cos(TAU * v) },
};
export const PATTERN_TYPES = Object.keys(PATTERNS).map((k) => [k, PATTERNS[k].label]);
export const MODS = {
  mirror: { label: 'Mirror', def: { axis: 'x' }, apply(m, p) {
    const a = AXI[p.axis] || 0, eps = 0.05, V = m.V.map((v) => { const w = v.slice(); if (Math.abs(w[a]) < eps) w[a] = 0; return w; }), onPlane = (f) => f.every((i) => V[i][a] === 0);
    const F0 = m.F.filter((f) => !onPlane(f)), n = V.length, map = V.map((v, i) => (v[a] === 0 ? i : -1)), outV = V.slice();
    V.forEach((v, i) => { if (map[i] < 0) { map[i] = outV.length; const w = v.slice(); w[a] = -w[a]; outV.push(w); } });
    const outF = F0.concat(F0.map((f) => f.map((i) => map[i]).reverse())), C = { ...m.C }; Object.keys(m.C || {}).forEach((k) => { const [x, y] = k.split('_').map(Number); if (x < n && y < n) C[ekey(map[x], map[y])] = 1; });
    return { V: outV, F: outF, C };
  } },
  smooth: { label: 'Smooth', def: { levels: 2 }, apply(m, p, q) { let r = m; const L = clamp(Math.round(p.levels), 0, 4) - (q === 'draft' && p.levels > 1 ? 1 : 0); for (let i = 0; i < L; i++) r = subdivide(r); return r; } },
  pattern: { label: 'Surface pattern', def: { kind: 'diamonds', map: 'cylinder', count: 16, rows: 9, cell: 25, depth: 3, round: 0.6, twist: 0.5 }, apply(m, p, q) {
    const b = bbox(m.V), H = Math.max(1e-6, b.mx[2] - b.mn[2]), R = Math.max(b.mx[0] - b.c[0], b.mx[1] - b.c[1]);
    const period = p.map === 'cylinder' ? Math.min(TAU * R / Math.max(1, p.count), H / Math.max(1, p.rows)) : p.cell;
    let r = m; const target = period / (q === 'draft' ? 3 : 5), cap = q === 'draft' ? 30000 : 70000;
    const avgEdge = (mm) => { let s = 0, n = 0; mm.F.slice(0, 400).forEach((f) => { for (let k = 0; k < f.length; k++) { s += len(sub(mm.V[f[k]], mm.V[f[(k + 1) % f.length]])); n++; } }); return s / (n || 1); };
    while (avgEdge(r) > target && r.F.length * 4 < cap) r = linearSubdivide(r);
    const N = vertexNormals(r), fn = (PATTERNS[p.kind] || PATTERNS.diamonds).f, e = clamp(p.round, 0.05, 4);
    r.V = r.V.map((v, i) => {
      let u, w;
      if (p.map === 'cylinder') { u = (Math.atan2(v[1] - b.c[1], v[0] - b.c[0]) / TAU + 1) * Math.round(p.count); w = (v[2] - b.mn[2]) / H * p.rows; }
      else if (p.map === 'front') { u = v[0] / p.cell; w = v[2] / p.cell; } else if (p.map === 'side') { u = v[1] / p.cell; w = v[2] / p.cell; } else { u = v[0] / p.cell; w = v[1] / p.cell; }
      const d = p.depth * fn(u, w, e, p.twist); return add(v, mul(N[i], d));
    });
    return r;
  } },
  rim: { label: 'Petal rim', def: { count: 10, amp: 8, start: 0.7, power: 2 }, apply(m, p) {
    const b = bbox(m.V), H = Math.max(1e-6, b.mx[2] - b.mn[2]);
    return { V: m.V.map((v) => { const h = (v[2] - b.mn[2]) / H, w = Math.pow(clamp((h - p.start) / Math.max(1e-6, 1 - p.start), 0, 1), p.power), dx = v[0] - b.c[0], dy = v[1] - b.c[1], rr = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx), d = p.amp * w * Math.cos(Math.round(p.count) * a); return [v[0] + dx / rr * d, v[1] + dy / rr * d, v[2]]; }), F: m.F, C: m.C };
  } },
  twist: { label: 'Twist', def: { angle: 90 }, apply(m, p) { const b = bbox(m.V), H = Math.max(1e-6, b.mx[2] - b.mn[2]); return { V: m.V.map((v) => { const t = (v[2] - b.mn[2]) / H * p.angle * Math.PI / 180, x = v[0] - b.c[0], y = v[1] - b.c[1]; return [b.c[0] + x * Math.cos(t) - y * Math.sin(t), b.c[1] + x * Math.sin(t) + y * Math.cos(t), v[2]]; }), F: m.F, C: m.C }; } },
  taper: { label: 'Taper', def: { top: 0.6 }, apply(m, p) { const b = bbox(m.V), H = Math.max(1e-6, b.mx[2] - b.mn[2]); return { V: m.V.map((v) => { const s = 1 + (p.top - 1) * (v[2] - b.mn[2]) / H; return [b.c[0] + (v[0] - b.c[0]) * s, b.c[1] + (v[1] - b.c[1]) * s, v[2]]; }), F: m.F, C: m.C }; } },
  array: { label: 'Array', def: { mode: 'linear', count: 3, dx: 150, dy: 0, dz: 0, angle: 360 }, apply(m, p) {
    const n = clamp(Math.round(p.count), 1, 200), V = [], F = [], C = {};
    for (let k = 0; k < n; k++) { const o = V.length, ang = p.mode === 'radial' ? (p.angle * Math.PI / 180) * k / (Math.abs(p.angle) >= 360 ? n : Math.max(1, n - 1)) : 0;
      m.V.forEach((v) => V.push(p.mode === 'radial' ? [v[0] * Math.cos(ang) - v[1] * Math.sin(ang), v[0] * Math.sin(ang) + v[1] * Math.cos(ang), v[2]] : [v[0] + p.dx * k, v[1] + p.dy * k, v[2] + p.dz * k]));
      m.F.forEach((f) => F.push(f.map((i) => i + o))); Object.keys(m.C || {}).forEach((key) => { const [a, b2] = key.split('_').map(Number); C[ekey(a + o, b2 + o)] = 1; }); }
    return { V, F, C };
  } },
  shell: { label: 'Shell', def: { thickness: 2 }, apply(m, p) {
    const N = vertexNormals(m), t = p.thickness, nV = m.V.length, inner = m.V.map((v, i) => sub(v, mul(N[i], t))), V = m.V.concat(inner), F = m.F.slice(), dir = new Set(), C = { ...m.C };
    m.F.forEach((f) => { F.push(f.map((i) => i + nV).reverse()); f.forEach((a, k) => dir.add(a + '>' + f[(k + 1) % f.length])); });
    m.F.forEach((f) => f.forEach((a, k) => { const b2 = f[(k + 1) % f.length]; if (!dir.has(b2 + '>' + a)) F.push([b2, a, a + nV, b2 + nV]); }));
    return { V, F, C };
  } },
};
export const MOD_ORDER = ['mirror', 'smooth', 'pattern', 'rim', 'twist', 'taper', 'array', 'shell'];
export function applyStack(cage, mods, quality) { let m = { V: cage.V, F: cage.F, C: cage.C || {} }; (mods || []).forEach((md) => { if (md.on === false || !MODS[md.type]) return; m = MODS[md.type].apply(m, md, quality); }); return m; }
export { bbox };
