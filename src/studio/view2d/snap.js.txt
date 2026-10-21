// Object snaps, grid, ortho and polar tracking for the plan view.
import { pointSeg, segIntersect, dist } from '../model/geometry.js';

export const SNAP_DEFAULT = { end: true, mid: true, int: true, cen: true, perp: true, near: false, grid: true, ortho: false, polar: true };
const BIAS = { end: 0, int: 0, cen: 0, mid: 3, perp: 6, polar: 5, near: 10, grid: 14 };
export const SNAP_NAMES = { end: 'Endpoint', mid: 'Midpoint', int: 'Intersection', cen: 'Centre', perp: 'Perpendicular', near: 'Nearest', grid: 'Grid', polar: 'Polar' };

export function gridStepFor(scale) {
  for (const s of [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100]) if (s * scale >= 14) return s;
  return 200;
}

export function snapPoint(model, levelId, raw, o) {
  const f = o.flags, tolW = o.tol / o.scale, from = o.from || null, ex = o.exclude || new Set();
  const walls = model.walls.filter((w) => w.level === levelId && !ex.has(w.id));
  let p = raw.slice(), axis = null;
  if (f.ortho && from) { axis = Math.abs(raw[0] - from[0]) >= Math.abs(raw[1] - from[1]) ? 'h' : 'v'; p = axis === 'h' ? [raw[0], from[1]] : [from[0], raw[1]]; }
  const onAxis = (c) => !axis || (axis === 'h' ? Math.abs(c[1] - from[1]) < tolW : Math.abs(c[0] - from[0]) < tolW);
  const fix = (c) => (axis === 'h' ? [c[0], from[1]] : axis === 'v' ? [from[0], c[1]] : c);
  const cands = [], add = (type, c, extra) => { if (onAxis(c)) cands.push({ type, p: fix(c), d: dist(fix(c), p) * o.scale + BIAS[type], ...(extra || {}) }); };
  const near = (c) => Math.abs(c[0] - p[0]) < tolW * 2 && Math.abs(c[1] - p[1]) < tolW * 2;
  if (f.end) {
    walls.forEach((w) => { if (near(w.a)) add('end', w.a, { id: w.id }); if (near(w.b)) add('end', w.b, { id: w.id }); });
    model.beams.filter((b) => b.level === levelId).forEach((b) => { if (near(b.a)) add('end', b.a); if (near(b.b)) add('end', b.b); });
    model.roofs.filter((r) => r.level === levelId).forEach((r) => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]].forEach((c) => { if (near(c)) add('end', c); }));
    model.slabs.filter((s) => s.level === levelId).forEach((s) => s.ring.forEach((c) => { if (near(c)) add('end', c); }));
  }
  if (f.cen) {
    model.columns.filter((c) => c.level === levelId && !ex.has(c.id)).forEach((c) => { if (near(c.c)) add('cen', c.c, { id: c.id }); });
    model.footings.filter((c) => c.level === levelId && !ex.has(c.id)).forEach((c) => { if (near(c.c)) add('cen', c.c, { id: c.id }); });
  }
  if (f.mid) walls.forEach((w) => { const m = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]; if (near(m)) add('mid', m, { id: w.id }); });
  if (f.int) {
    const loc = walls.filter((w) => pointSeg(p, w.a, w.b).d < tolW * 6);
    for (let i = 0; i < loc.length; i++) for (let j = i + 1; j < loc.length; j++) { const x = segIntersect(loc[i].a, loc[i].b, loc[j].a, loc[j].b); if (x && near(x.p)) add('int', x.p); }
  }
  if (f.perp && from) walls.forEach((w) => { const r = pointSeg(from, w.a, w.b); if (r.t > 0.001 && r.t < 0.999 && near(r.q)) add('perp', r.q, { id: w.id }); });
  if (f.near) walls.forEach((w) => { const r = pointSeg(p, w.a, w.b); if (r.d < tolW) add('near', r.q, { id: w.id }); });
  if (f.polar && from && !axis) {
    const dx = raw[0] - from[0], dy = raw[1] - from[1], l = Math.hypot(dx, dy);
    if (l > tolW * 2) { const a = Math.atan2(dy, dx) * 180 / Math.PI, t = Math.round(a / 15) * 15; if (Math.abs(a - t) <= 3) { const r = t * Math.PI / 180; cands.push({ type: 'polar', p: [from[0] + Math.cos(r) * l, from[1] + Math.sin(r) * l], d: l * Math.sin(Math.abs(a - t) * Math.PI / 180) * o.scale + BIAS.polar, angle: t }); } }
  }
  const ok = cands.filter((c) => c.d <= o.tol + BIAS[c.type]).sort((a, b) => a.d - b.d);
  if (ok.length) { const b = ok[0]; return { p: b.p, type: b.type, id: b.id, angle: b.angle }; }
  if (f.grid) { const g = o.gridStep || 1; let q = [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g]; if (axis === 'h') q = [q[0], from[1]]; else if (axis === 'v') q = [from[0], q[1]]; return { p: q, type: 'grid' }; }
  return { p, type: axis ? 'ortho' : 'free' };
}
