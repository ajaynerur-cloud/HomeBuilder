// What is under the pointer on the plan. Returns the best object id or null.
import { pointSeg, pointInRing, dist } from '../model/geometry.js';
import { ringOfColumn, stairGeom } from '../model/solids.js';

export function visibleLayer(project, layerId) { const l = project.layers.find((x) => x.id === layerId); return !l || l.visible; }
export function lockedLayer(project, layerId) { const l = project.layers.find((x) => x.id === layerId); return !!(l && l.locked); }

export function hitTest(model, project, levelId, pt, scale, tolPx = 7) {
  const tol = tolPx / scale, cands = [];
  const on = (layer) => visibleLayer(project, layer) && !lockedLayer(project, layer);
  const add = (id, d, prio) => cands.push({ id, score: d / tol + prio * 0.02 });
  model.openings.filter((o) => o.level === levelId && on(o.layer)).forEach((o) => {
    const w = model.wallById[o.wall], r = pointSeg(pt, w.a, w.b), along = r.t * w.len;
    if (r.d <= w.t / 2 + tol && Math.abs(along - o.pos) <= o.w / 2 + tol) add(o.id, 0, 0);
  });
  model.columns.filter((c) => c.level === levelId && on(c.layer)).forEach((c) => { if (c.shape === 'round' ? dist(pt, c.c) <= c.b / 2 + tol : pointInRing(pt, ringOfColumn(c)) || dist(pt, c.c) < tol) add(c.id, 0, 1); });
  model.footings.filter((c) => c.level === levelId && on(c.layer)).forEach((f) => { if (Math.abs(pt[0] - f.c[0]) <= f.size / 2 && Math.abs(pt[1] - f.c[1]) <= f.size / 2) add(f.id, 0.5 * tol, 5); });
  model.stairs.filter((s) => s.level === levelId && on(s.layer)).forEach((s) => {
    const g = stairGeom(s), rel = [pt[0] - s.p[0], pt[1] - s.p[1]], along = rel[0] * g.d[0] + rel[1] * g.d[1], across = -rel[0] * g.d[1] + rel[1] * g.d[0];
    if (along >= -tol && along <= g.run + tol && Math.abs(across) <= s.width / 2 + tol) add(s.id, 0.5 * tol, 3);
  });
  model.beams.filter((b) => b.level === levelId && on(b.layer)).forEach((b) => { const r = pointSeg(pt, b.a, b.b); if (r.d <= Math.max(b.w / 2, tol)) add(b.id, r.d, 2); });
  model.walls.filter((w) => w.level === levelId && on(w.layer)).forEach((w) => { const r = pointSeg(pt, w.a, w.b); if (r.d <= Math.max(w.t / 2, tol)) add(w.id, r.d, 2); });
  model.labels.filter((l) => l.level === levelId && on(l.layer)).forEach((l) => { if (Math.abs(pt[0] - l.p[0]) < 2 + tol && Math.abs(pt[1] - l.p[1]) < 0.7 + tol) add(l.id, 0.3 * tol, 4); });
  model.texts.filter((t) => t.level === levelId && on(t.layer)).forEach((t) => { if (pt[0] >= t.p[0] - tol && pt[0] <= t.p[0] + t.text.length * t.size * 0.6 + tol && Math.abs(pt[1] - t.p[1]) < t.size + tol) add(t.id, 0.4 * tol, 4); });
  model.dims.filter((d) => d.level === levelId && on(d.layer)).forEach((d) => {
    const dx = d.b[0] - d.a[0], dy = d.b[1] - d.a[1], l = Math.hypot(dx, dy) || 1, n = [-dy / l, dx / l], a = [d.a[0] + n[0] * d.off, d.a[1] + n[1] * d.off], b = [d.b[0] + n[0] * d.off, d.b[1] + n[1] * d.off];
    const r = pointSeg(pt, a, b); if (r.d <= tol) add(d.id, r.d, 4);
  });
  model.roofs.filter((r) => r.level === levelId && on(r.layer)).forEach((r) => {
    const X0 = r.x0 - r.over, X1 = r.x1 + r.over, Y0 = r.y0 - r.over, Y1 = r.y1 + r.over;
    const edges = [[[X0, Y0], [X1, Y0]], [[X1, Y0], [X1, Y1]], [[X1, Y1], [X0, Y1]], [[X0, Y1], [X0, Y0]]];
    const d = Math.min(...edges.map((e) => pointSeg(pt, e[0], e[1]).d)); if (d <= tol) add(r.id, d, 6);
  });
  model.slabs.filter((s) => s.level === levelId && on(s.layer)).forEach((s) => { const e = s.ring.map((p, i) => pointSeg(pt, p, s.ring[(i + 1) % s.ring.length]).d); if (Math.min(...e) <= tol) add(s.id, Math.min(...e), 7); });
  cands.sort((a, b) => a.score - b.score);
  return cands.length ? cands[0].id : null;
}

// Objects inside (window) or touching (crossing) a rectangle.
export function boxSelect(model, project, levelId, r, crossing) {
  const [x0, y0, x1, y1] = r, ids = [], inside = (p) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
  const on = (layer) => visibleLayer(project, layer) && !lockedLayer(project, layer);
  const segHit = (a, b) => {
    if (inside(a) || inside(b)) return true;
    const E = [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]];
    return E.some((e) => { const d1 = (b[0] - a[0]) * (e[0][1] - a[1]) - (b[1] - a[1]) * (e[0][0] - a[0]), d2 = (b[0] - a[0]) * (e[1][1] - a[1]) - (b[1] - a[1]) * (e[1][0] - a[0]), d3 = (e[1][0] - e[0][0]) * (a[1] - e[0][1]) - (e[1][1] - e[0][1]) * (a[0] - e[0][0]), d4 = (e[1][0] - e[0][0]) * (b[1] - e[0][1]) - (e[1][1] - e[0][1]) * (b[0] - e[0][0]); return d1 * d2 < 0 && d3 * d4 < 0; });
  };
  const seg = (a, b) => (crossing ? segHit(a, b) : inside(a) && inside(b));
  model.walls.filter((w) => w.level === levelId && on(w.layer) && seg(w.a, w.b)).forEach((w) => ids.push(w.id));
  model.beams.filter((w) => w.level === levelId && on(w.layer) && seg(w.a, w.b)).forEach((w) => ids.push(w.id));
  model.columns.filter((c) => c.level === levelId && on(c.layer) && inside(c.c)).forEach((c) => ids.push(c.id));
  model.footings.filter((c) => c.level === levelId && on(c.layer) && inside(c.c)).forEach((c) => ids.push(c.id));
  model.stairs.filter((c) => c.level === levelId && on(c.layer) && inside(c.p)).forEach((c) => ids.push(c.id));
  model.labels.filter((c) => c.level === levelId && on(c.layer) && inside(c.p)).forEach((c) => ids.push(c.id));
  model.texts.filter((c) => c.level === levelId && on(c.layer) && inside(c.p)).forEach((c) => ids.push(c.id));
  model.openings.filter((o) => o.level === levelId && on(o.layer) && inside(o.c)).forEach((o) => ids.push(o.id));
  model.roofs.filter((c) => c.level === levelId && on(c.layer) && (crossing ? inside([c.x0, c.y0]) || inside([c.x1, c.y1]) : inside([c.x0, c.y0]) && inside([c.x1, c.y1]))).forEach((c) => ids.push(c.id));
  model.slabs.filter((s) => s.level === levelId && on(s.layer) && s.ring.every(inside)).forEach((s) => ids.push(s.id));
  model.dims.filter((c) => c.level === levelId && on(c.layer) && inside(c.a) && inside(c.b)).forEach((c) => ids.push(c.id));
  return ids;
}
