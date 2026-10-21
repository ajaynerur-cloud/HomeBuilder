// Starting shapes. Millimetres, z up, sitting on the ground.
const TAU = Math.PI * 2;
// box with nx, ny, nz segments: only the surface lattice, quads, shared vertices
export function box(w = 100, d = 100, h = 100, nx = 1, ny = 1, nz = 1) {
  const V = [], F = [], idx = new Map(), id = (i, j, k) => { const key = i + ',' + j + ',' + k; if (!idx.has(key)) { idx.set(key, V.length); V.push([-w / 2 + w * i / nx, -d / 2 + d * j / ny, h * k / nz]); } return idx.get(key); };
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { F.push([id(i, j, 0), id(i, j + 1, 0), id(i + 1, j + 1, 0), id(i + 1, j, 0)]); F.push([id(i, j, nz), id(i + 1, j, nz), id(i + 1, j + 1, nz), id(i, j + 1, nz)]); }
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) { F.push([id(i, 0, k), id(i + 1, 0, k), id(i + 1, 0, k + 1), id(i, 0, k + 1)]); F.push([id(i, ny, k), id(i, ny, k + 1), id(i + 1, ny, k + 1), id(i + 1, ny, k)]); }
  for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) { F.push([id(0, j, k), id(0, j, k + 1), id(0, j + 1, k + 1), id(0, j + 1, k)]); F.push([id(nx, j, k), id(nx, j + 1, k), id(nx, j + 1, k + 1), id(nx, j, k + 1)]); }
  return { V, F, C: {} };
}
export function cylinder(r = 50, h = 100, n = 12, rings = 1, capTop = true, capBottom = true, rTop = null) {
  const V = [], F = [];
  for (let k = 0; k <= rings; k++) { const t = k / rings, rr = rTop == null ? r : r + (rTop - r) * t; for (let i = 0; i < n; i++) { const a = TAU * i / n; V.push([rr * Math.cos(a), rr * Math.sin(a), h * t]); } }
  for (let k = 0; k < rings; k++) for (let i = 0; i < n; i++) { const i1 = (i + 1) % n; F.push([k * n + i, k * n + i1, (k + 1) * n + i1, (k + 1) * n + i]); }
  if (capBottom) { const f = []; for (let i = n - 1; i >= 0; i--) f.push(i); F.push(f); }
  if (capTop) { const f = []; for (let i = 0; i < n; i++) f.push(rings * n + i); F.push(f); }
  return { V, F, C: {} };
}
export function sphere(r = 50, level = 2) { const n = 1 << level, m = box(2, 2, 2, n, n, n); m.V = m.V.map((v) => { const p = [v[0], v[1], v[2] - 1], l = Math.hypot(...p) || 1; return [p[0] / l * r, p[1] / l * r, p[2] / l * r + r]; }); return m; }
export function torus(R = 50, r = 15, n = 16, s = 8) {
  const V = [], F = []; for (let i = 0; i < n; i++) for (let j = 0; j < s; j++) { const a = TAU * i / n, b = TAU * j / s; V.push([(R + r * Math.cos(b)) * Math.cos(a), (R + r * Math.cos(b)) * Math.sin(a), r + r * Math.sin(b)]); }
  for (let i = 0; i < n; i++) for (let j = 0; j < s; j++) { const i1 = (i + 1) % n, j1 = (j + 1) % s; F.push([i * s + j, i1 * s + j, i1 * s + j1, i * s + j1]); } return { V, F, C: {} };
}
export function plane(w = 100, d = 100) { return { V: [[-w / 2, -d / 2, 0], [w / 2, -d / 2, 0], [w / 2, d / 2, 0], [-w / 2, d / 2, 0]], F: [[0, 1, 2, 3]], C: {} }; }
export function polygonFace(pts) { return { V: pts.map((p) => p.slice()), F: [pts.map((_, i) => i)], C: {} }; }
export const PRIMS = {
  box: { label: 'Box', make: () => box(100, 100, 100) }, cylinder: { label: 'Cylinder', make: () => cylinder(50, 100, 12, 1) }, sphere: { label: 'Sphere', make: () => sphere(50, 2) },
  torus: { label: 'Torus', make: () => torus(50, 15) }, cone: { label: 'Cone', make: () => cylinder(50, 100, 12, 1, true, true, 4) }, plane: { label: 'Plane', make: () => plane(200, 200) },
  tube: { label: 'Open tube', make: () => cylinder(40, 120, 12, 3, false, true) },
};
