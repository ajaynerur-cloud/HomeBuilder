// Move, copy, rotate and mirror. Coordinates that were expressions become plain numbers.
import { resolveModel } from './resolve.js';
import { rot } from './geometry.js';
import { nid } from './generators.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
function reflect(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, fx = a[0] + dx * t, fy = a[1] + dy * t;
  return [2 * fx - p[0], 2 * fy - p[1]];
}

// op: {type:'move', dx, dy} | {type:'rotate', c:[x,y], deg} | {type:'mirror', a:[x,y], b:[x,y]}
export function transformObjects(project, ids, op, copy) {
  const m = resolveModel(project), ptf = (p) => (op.type === 'move' ? [p[0] + op.dx, p[1] + op.dy] : op.type === 'rotate' ? rot(p, op.c, op.deg) : reflect(p, op.a, op.b));
  const set = new Set(ids), made = [];
  const wallIds = new Set(project.walls.filter((w) => set.has(w.id)).map((w) => w.id));
  const idMap = {};
  const dup = (kind, o) => { if (!copy) return o; const c = JSON.parse(JSON.stringify(o)); c.id = nid(project, kind); project[kind].push(c); made.push(c.id); idMap[o.id] = c.id; return c; };
  project.walls.filter((w) => set.has(w.id)).slice().forEach((w) => {
    const mw = m.wallById[w.id]; if (!mw) return;
    const c = dup('walls', w), a = ptf(mw.a), b = ptf(mw.b);
    c.ax = r3(a[0]); c.ay = r3(a[1]); c.bx = r3(b[0]); c.by = r3(b[1]);
  });
  if (copy) project.openings.filter((o) => wallIds.has(o.wall)).slice().forEach((o) => { const c = JSON.parse(JSON.stringify(o)); c.id = nid(project, 'openings'); c.wall = idMap[o.wall]; if (op.type === 'mirror') c.flip = !c.flip; project.openings.push(c); made.push(c.id); });
  else if (op.type === 'mirror') project.openings.filter((o) => wallIds.has(o.wall)).forEach((o) => { o.flip = !o.flip; });
  project.columns.filter((c) => set.has(c.id)).slice().forEach((c) => { const mc = m.columns.find((x) => x.id === c.id), n = dup('columns', c), p = ptf(mc.c); n.x = r3(p[0]); n.y = r3(p[1]); if (op.type === 'rotate') n.rot = ((n.rot || 0) + op.deg) % 360; n.auto = false; });
  project.footings.filter((c) => set.has(c.id)).slice().forEach((c) => { const mc = m.footings.find((x) => x.id === c.id), n = dup('footings', c), p = ptf(mc.c); n.x = r3(p[0]); n.y = r3(p[1]); n.auto = false; });
  project.beams.filter((c) => set.has(c.id)).slice().forEach((c) => { const mc = m.beams.find((x) => x.id === c.id), n = dup('beams', c), a = ptf(mc.a), b = ptf(mc.b); n.ax = r3(a[0]); n.ay = r3(a[1]); n.bx = r3(b[0]); n.by = r3(b[1]); n.auto = false; });
  project.slabs.filter((c) => set.has(c.id)).slice().forEach((c) => { const n = dup('slabs', c); n.ring = c.ring.map((p) => ptf(p).map(r3)); n.holes = (c.holes || []).map((h) => h.map((p) => ptf(p).map(r3))); n.auto = false; });
  project.stairs.filter((c) => set.has(c.id)).slice().forEach((c) => {
    const mc = m.stairs.find((x) => x.id === c.id), n = dup('stairs', c), p = ptf(mc.p); n.x = r3(p[0]); n.y = r3(p[1]);
    if (op.type === 'rotate') n.dir = ((mc.dir + op.deg) % 360 + 360) % 360;
    else if (op.type === 'mirror') { const d = [Math.cos(mc.dir * Math.PI / 180), Math.sin(mc.dir * Math.PI / 180)], q = ptf([mc.p[0] + d[0], mc.p[1] + d[1]]); n.dir = Math.round(Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI * 100) / 100; }
  });
  project.roofs.filter((c) => set.has(c.id)).slice().forEach((c) => {
    const mc = m.roofs.find((x) => x.id === c.id), n = dup('roofs', c), a = ptf([mc.x0, mc.y0]), b = ptf([mc.x1, mc.y1]);
    n.x0 = r3(Math.min(a[0], b[0])); n.y0 = r3(Math.min(a[1], b[1])); n.x1 = r3(Math.max(a[0], b[0])); n.y1 = r3(Math.max(a[1], b[1]));
    if (op.type === 'rotate' && Math.round(op.deg / 90) % 2 !== 0) n.ridge = mc.ridge === 'x' ? 'y' : 'x';
  });
  [['dims', 'a', 'b'], ['texts', 'p'], ['rooms', 'p']].forEach(([kind]) => { void kind; });
  project.dims.filter((c) => set.has(c.id)).slice().forEach((c) => { const mc = m.dims.find((x) => x.id === c.id), n = dup('dims', c), a = ptf(mc.a), b = ptf(mc.b); n.ax = r3(a[0]); n.ay = r3(a[1]); n.bx = r3(b[0]); n.by = r3(b[1]); });
  project.texts.filter((c) => set.has(c.id)).slice().forEach((c) => { const mc = m.texts.find((x) => x.id === c.id), n = dup('texts', c), p = ptf(mc.p); n.x = r3(p[0]); n.y = r3(p[1]); });
  project.rooms.filter((c) => set.has(c.id)).slice().forEach((c) => { const mc = m.labels.find((x) => x.id === c.id), n = dup('rooms', c), p = ptf(mc.p); n.x = r3(p[0]); n.y = r3(p[1]); });
  return made;
}

// Cut a wall in two at a distance from its start. Openings move to the right piece.
export function splitWall(project, wallId, at) {
  const m = resolveModel(project), mw = m.wallById[wallId], w = project.walls.find((x) => x.id === wallId);
  if (!mw || at < 0.3 || at > mw.len - 0.3) return null;
  const p = [mw.a[0] + mw.d[0] * at, mw.a[1] + mw.d[1] * at], c = JSON.parse(JSON.stringify(w));
  c.id = nid(project, 'walls'); c.ax = r3(p[0]); c.ay = r3(p[1]); c.bx = w.bx; c.by = w.by; w.bx = r3(p[0]); w.by = r3(p[1]);
  project.walls.push(c);
  m.openings.filter((o) => o.wall === wallId).forEach((o) => {
    const so = project.openings.find((x) => x.id === o.id);
    if (o.pos - o.w / 2 >= at - 0.01) { so.wall = c.id; so.pos = r3(o.pos - at); }
    else if (o.pos + o.w / 2 > at + 0.01) { so.pos = r3(Math.min(o.pos, at - o.w / 2 - 0.01)); }
  });
  return c.id;
}
export function moveOpening(project, openingId, pos) { const o = project.openings.find((x) => x.id === openingId); if (o) o.pos = r3(pos); }

// Remove objects. Openings go with their walls.
export function deleteObjects(project, ids) {
  const set = new Set(ids), wallIds = new Set(project.walls.filter((w) => set.has(w.id)).map((w) => w.id));
  ['walls', 'columns', 'beams', 'footings', 'slabs', 'roofs', 'stairs', 'dims', 'texts', 'rooms'].forEach((k) => { project[k] = project[k].filter((o) => !set.has(o.id)); });
  project.openings = project.openings.filter((o) => !set.has(o.id) && !wallIds.has(o.wall));
}
