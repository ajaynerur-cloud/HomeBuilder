// Print preparation for Forge: scaling, flat base, overhang report, thin wall hint, closed-solid check, bed fit.
import { triangulateOriented, faceNormal, faceArea } from './mesh.js';
import { buildAll, scopeOf } from './model.js';
import { meshStats } from '../model/geometry.js';
import { val } from './gen.js';

export function overhangInfo(m, angleDeg) {
  const lim = -Math.sin(angleDeg * Math.PI / 180); let zmin = 1e18; m.v.forEach((v) => { if (v.p[2] < zmin) zmin = v.p[2]; });
  let total = 0, over = 0; const faces = [];
  m.f.forEach((F, fi) => { const a = faceArea(m, fi), n = faceNormal(m, fi); total += a; const base = F.v.every((i) => m.v[i].p[2] < zmin + 0.01); if (n[2] < lim && !base) { over += a; faces.push(fi); } });
  return { percent: total ? (100 * over) / total : 0, area: over, faces };
}

export function buildPrint(project, o = {}) {
  const pr = { ...project.print, ...o }, k = (pr.scalePct || 100) / 100, bodies = buildAll(project), parts = [], warnings = [];
  if (!bodies.length) return { parts: [], totals: null, warnings: [{ lvl: 'err', msg: 'Nothing to print.' }] };
  let mn = [1e18, 1e18, 1e18], mx = [-1e18, -1e18, -1e18], over = { percent: 0, area: 0 }, area = 0;
  bodies.forEach(({ mesh }) => mesh.v.forEach((v) => v.p.forEach((c, i) => { if (c < mn[i]) mn[i] = c; if (c > mx[i]) mx[i] = c; })));
  bodies.forEach(({ body, mesh }) => {
    const T = triangulateOriented(mesh), t = new Array(T.tris.length);
    for (let i = 0; i < t.length; i += 3) { t[i] = (T.tris[i] - (mn[0] + mx[0]) / 2) * k; t[i + 1] = (T.tris[i + 1] - (mn[1] + mx[1]) / 2) * k; t[i + 2] = (T.tris[i + 2] - mn[2]) * k; }
    parts.push({ kind: 'body', id: body.id, name: body.name, color: 0xb9b4a6, tris: t });
    const oi = overhangInfo(mesh, pr.overhang || 45); over.area += oi.area; mesh.f.forEach((_, fi) => { area += faceArea(mesh, fi); });
  });
  const dims = [(mx[0] - mn[0]) * k, (mx[1] - mn[1]) * k, (mx[2] - mn[2]) * k];
  if (pr.base) { const th = pr.baseMm, w = dims[0] + 6, d = dims[1] + 6, b = []; const A = [-w / 2, -d / 2, -th], B = [w / 2, d / 2, 0]; const bx = (x0, y0, z0, x1, y1, z1) => { const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]; [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]].forEach((f) => { const q = f.map((i) => P[i]); b.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]); }); }; bx(A[0], A[1], A[2], B[0], B[1], B[2]); parts.unshift({ kind: 'base', id: 'base', name: 'Base plate', color: 0x555555, tris: b }); }
  const stats = parts.map((p) => ({ name: p.name, ...meshStats(p.tris, 1e-3) })), vol = stats.reduce((s, x) => s + x.volume, 0) / 1000, bad = stats.filter((s) => !s.watertight);
  over.percent = area ? (100 * over.area) / area : 0;
  const need = Math.max(dims[0] / pr.bedX, dims[1] / pr.bedY, dims[2] / pr.bedZ), fits = need <= 1;
  if (bad.length) warnings.push({ lvl: 'warn', msg: bad.length + ' part' + (bad.length > 1 ? 's are' : ' is') + ' not a closed solid: ' + bad.map((b) => b.name).join(', ') + '. This can happen after deleting faces or pulling a face through the body.' });
  if (!fits) warnings.push({ lvl: 'warn', msg: 'The model is ' + dims.map((d) => Math.round(d)).join(' × ') + ' mm, larger than the bed. Scale it to ' + Math.floor(100 / need) + '% or less.' });
  const { values } = scopeOf(project), g = project.bodies.find((b) => b.id === project.active) || project.bodies[0];
  const wall = g && g.gen && g.gen.type !== 'box' ? val(g.gen.thickness, values, 0) * k : 0;
  if (wall > 0 && wall < (pr.minWall || 0.8)) warnings.push({ lvl: 'warn', msg: 'The wall prints at ' + wall.toFixed(2) + ' mm, thinner than your ' + pr.minWall + ' mm minimum. Raise the wall thickness or the scale.' });
  if (over.percent > 8) warnings.push({ lvl: 'info', msg: Math.round(over.percent) + '% of the surface overhangs more than ' + (pr.overhang || 45) + '°. Turn on Overhang view to see where supports or a gentler curve would help.' });
  return { parts, stats, totals: { dims, volumeCm3: vol, weightG: vol * 1.24, tris: stats.reduce((s, x) => s + x.tris, 0), watertight: !bad.length, fits, overhangPct: over.percent }, warnings };
}
