// Edits shared by the 2D and 3D views: move a selection (joined walls follow) and stretch a wall end.
import { transformObjects } from './transform.js';
import { dist } from './geometry.js';
import { KINDS } from './schema.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

// m is the resolved model BEFORE the change. Walls that touch the ends of moved walls on the same level are stretched with them.
export function moveObjects(p, m, ids, dx, dy, levelId) {
  const set = new Set(ids), sw = m.walls.filter((w) => set.has(w.id)), ends = [];
  sw.forEach((w) => { ends.push(w.a, w.b); });
  transformObjects(p, ids, { type: 'move', dx, dy }, false);
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.02;
  m.walls.filter((w) => !set.has(w.id) && w.level === levelId).forEach((w) => {
    const sp = p.walls.find((x) => x.id === w.id);
    if (ends.some((e) => near(e, w.a))) { sp.ax = r3(w.a[0] + dx); sp.ay = r3(w.a[1] + dy); }
    if (ends.some((e) => near(e, w.b))) { sp.bx = r3(w.b[0] + dx); sp.by = r3(w.b[1] + dy); }
  });
}
// Moves one end of a wall to q, and the ends of the walls joined there
export function setWallEnd(p, om, id, end, q, levelId) {
  const w = om.wallById[id], old = end === 'a' ? w.a : w.b, sw = p.walls.find((x) => x.id === id);
  if (end === 'a') { sw.ax = r3(q[0]); sw.ay = r3(q[1]); } else { sw.bx = r3(q[0]); sw.by = r3(q[1]); }
  om.walls.filter((x) => x.id !== id && x.level === levelId).forEach((x) => {
    const o = p.walls.find((y) => y.id === x.id);
    if (dist(x.a, old) < 0.02) { o.ax = r3(q[0]); o.ay = r3(q[1]); }
    if (dist(x.b, old) < 0.02) { o.bx = r3(q[0]); o.by = r3(q[1]); }
  });
}
export function setBeamEnd(p, id, end, q) { const b = p.beams.find((x) => x.id === id); if (!b) return; if (end === 'a') { b.ax = r3(q[0]); b.ay = r3(q[1]); } else { b.bx = r3(q[0]); b.by = r3(q[1]); } }
// Put every object list back to a snapshot. Used while dragging, so each mouse move starts from the original and nothing piles up.
export function restoreKinds(p, orig) { KINDS.forEach((k) => { p[k] = JSON.parse(JSON.stringify(orig[k])); }); p.nextId = orig.nextId; }
