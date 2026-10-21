// Print preparation for a Field mesh: scale, place on the bed, closed-solid check, overhangs, wall thickness and bed fit.
import { meshStats } from '../studio/model/geometry.js';
import { evaluate } from './model.js';
import { num } from './expr.js';
import { toTris, meshBounds } from './mesher.js';

const NICE = [10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200];
export function fieldPrint(project, mesh, o = {}) {
  const p = { ...project.print, ...o }, [mn, mx] = meshBounds(mesh), size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  const k = p.height > 0 ? p.height / size[2] : (p.scale > 0 ? 1 / p.scale : 1);
  const raw = toTris(mesh), tris = new Array(raw.length);
  for (let i = 0; i < raw.length; i += 3) { tris[i] = (raw[i] - mn[0]) * k; tris[i + 1] = (raw[i + 1] - mn[1]) * k; tris[i + 2] = (raw[i + 2] - mn[2]) * k; }
  const st = meshStats(tris, 1e-3), dims = size.map((v) => v * k), warnings = [];
  // overhangs: surface facing down more than 45 degrees, away from the build plate
  let total = 0, over = 0, zmin = mn[2];
  for (let i = 0; i < raw.length; i += 9) {
    const ux = raw[i + 3] - raw[i], uy = raw[i + 4] - raw[i + 1], uz = raw[i + 5] - raw[i + 2], vx = raw[i + 6] - raw[i], vy = raw[i + 7] - raw[i + 1], vz = raw[i + 8] - raw[i + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz), a = l / 2; if (l < 1e-12) continue;
    total += a; const cz = (raw[i + 2] + raw[i + 5] + raw[i + 8]) / 3;
    if (nz / l < -0.7071 && cz > zmin + 0.8 * (mesh.h || 1)) over += a;
  }
  const overFrac = total ? over / total : 0;
  // thinnest wall asked for by the features
  const ev = evaluate(project), walls = [];
  project.features.forEach((f) => { if (f.enabled === false) return; ['wall', 't'].forEach((key) => { if ((f.type === 'revolve' || f.type === 'loft' || f.type === 'surface' || f.type === 'shell') && f[key] !== undefined && f[key] !== '') { const v = num(f[key], ev.scope, 0); if (v > 0) walls.push(v); } }); });
  const wallMm = walls.length ? Math.min(...walls) * k : null;
  const need = Math.max(dims[0] / p.bedX, dims[1] / p.bedY, dims[2] / p.bedZ), fits = need <= 1, fitHeight = fits ? dims[2] : dims[2] / need;
  if (!st.watertight) warnings.push({ lvl: 'err', msg: 'The surface is not closed (' + st.openEdges + ' open edges). Increase the quality, or simplify a push or pull that cuts very thin features.' });
  if (wallMm !== null && wallMm < p.minWall) warnings.push({ lvl: 'warn', msg: 'The thinnest wall is ' + wallMm.toFixed(2) + ' mm at this size, below the ' + p.minWall + ' mm your printer can make. Make the wall thicker or print larger.' });
  if (!fits) warnings.push({ lvl: 'warn', msg: 'The model is ' + dims.map((d) => Math.round(d)).join(' × ') + ' mm, larger than the ' + p.bedX + ' × ' + p.bedY + ' × ' + p.bedZ + ' mm bed. Set the height to about ' + Math.floor(fitHeight) + ' mm or less.' });
  if (overFrac > 0.12) warnings.push({ lvl: 'info', msg: Math.round(overFrac * 100) + '% of the surface overhangs by more than 45°. Expect to need supports, or reshape the belly.' });
  if (mesh.h * k > 0.6) warnings.push({ lvl: 'info', msg: 'Surface detail is about ' + (mesh.h * k).toFixed(2) + ' mm. Use a finer quality for a smoother print.' });
  return { tris, parts: [{ name: project.name || 'Field model', kind: 'model', color: 0xb4573a, tris }], stats: st, dims, scaleK: k, volumeCm3: st.volume / 1000, weightG: (st.volume / 1000) * 1.24 * 0.5, overhang: overFrac, wallMm, fits, warnings, fitHeight };
}
export { NICE };
