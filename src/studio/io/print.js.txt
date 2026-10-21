// Print preparation: scale, thicken thin walls, base plate, part selection, watertight checks and bed fit.
import { resolveModel } from '../model/resolve.js';
import { buildParts, COLORS } from '../model/solids.js';
import { addBox, meshStats } from '../model/geometry.js';
import { printChecks } from '../model/checks.js';

const NICE = [20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
export const KINDS = { walls: 'wall', slabs: 'slab', roofs: 'roof', columns: 'column', beams: 'beam', footings: 'footing', stairs: 'stair', panels: 'panel' };

export function buildPrint(project, o = {}) {
  const opt = { ...project.print, include: { walls: true, slabs: true, roofs: true, columns: true, beams: true, footings: false, stairs: true, panels: false }, thicken: true, levels: null, merge: false, ...o };
  const model = resolveModel(project), k = 304.8 / opt.scale;               // mm per model foot
  const warnings = printChecks(model, { scale: opt.scale, minMm: opt.minMm });
  if (opt.thicken) { const tmin = opt.minMm / k; model.walls.forEach((w) => { if (w.t < tmin) w.t = tmin; }); }
  let parts = buildParts(model, { union: opt.unionWalls !== false, panels: !!opt.include.panels, levels: opt.levels || undefined });
  parts = parts.filter((p) => opt.include[Object.keys(KINDS).find((n) => KINDS[n] === p.kind)]);
  if (!parts.length) return { parts: [], stats: null, warnings: warnings.concat([{ lvl: 'err', msg: 'Nothing to print. Add walls or switch parts on.' }]) };
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  parts.forEach((p) => { for (let i = 0; i < p.tris.length; i += 3) for (let a = 0; a < 3; a++) { const v = p.tris[i + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; } });
  if (opt.base) {
    const m = opt.marginMm / k, th = opt.baseMm / k, b = []; addBox(b, mn[0] - m, mn[1] - m, mn[2] - th, mx[0] + m, mx[1] + m, mn[2]);
    parts.unshift({ kind: 'base', id: 'base', level: '', name: 'Base plate', color: COLORS.base, tris: b }); mn = [mn[0] - m, mn[1] - m, mn[2] - th]; mx = [mx[0] + m, mx[1] + m, mx[2]];
  }
  const out = parts.map((p) => { const t = new Array(p.tris.length); for (let i = 0; i < p.tris.length; i += 3) { t[i] = (p.tris[i] - mn[0]) * k; t[i + 1] = (p.tris[i + 1] - mn[1]) * k; t[i + 2] = (p.tris[i + 2] - mn[2]) * k; } return { ...p, tris: t }; });
  const stats = out.map((p) => ({ name: p.name, kind: p.kind, ...meshStats(p.tris, 1e-3) }));
  const dims = [(mx[0] - mn[0]) * k, (mx[1] - mn[1]) * k, (mx[2] - mn[2]) * k];
  const vol = stats.reduce((s, x) => s + x.volume, 0) / 1000, tris = stats.reduce((s, x) => s + x.tris, 0);
  const need = Math.max(dims[0] / opt.bedX, dims[1] / opt.bedY, dims[2] / opt.bedZ), fits = need <= 1;
  const fitScale = NICE.find((n) => n >= opt.scale * need) || Math.ceil(opt.scale * need);
  const bad = stats.filter((x) => !x.watertight);
  if (bad.length) warnings.push({ lvl: 'warn', msg: bad.length + ' part' + (bad.length > 1 ? 's are' : ' is') + ' not a closed solid (' + bad.slice(0, 3).map((x) => x.name).join(', ') + '). Slicers may repair this, but check the preview.' });
  if (!fits) warnings.push({ lvl: 'warn', msg: 'The model is ' + dims.map((d) => Math.round(d)).join(' × ') + ' mm, larger than the ' + opt.bedX + ' × ' + opt.bedY + ' × ' + opt.bedZ + ' mm bed. Print at 1:' + fitScale + ' or split it.' });
  return { parts: out, stats, totals: { dims, volumeCm3: vol, tris, weightG: vol * 1.24, fits, fitScale, watertight: !bad.length }, warnings, scale: opt.scale };
}
