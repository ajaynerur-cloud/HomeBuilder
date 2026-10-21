// Levels: stack, reorder, insert above or below, and copy a floor's contents onto another.
import { resolveModel } from './resolve.js';
import { newLevel } from './schema.js';
import { nid } from './generators.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
const clone = (o) => JSON.parse(JSON.stringify(o));
const ORD = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];

// Keeps project.levels in order from the lowest floor to the highest
export function sortLevels(project) {
  const m = resolveModel(project), el = {}; m.levels.forEach((l) => { el[l.id] = l.elev; });
  project.levels = project.levels.map((l, i) => ({ l, i })).sort((a, b) => el[a.l.id] - el[b.l.id] || a.i - b.i).map((x) => x.l);
}

// dir +1 raises the floor by one place in the stack (it swaps with the floor above), -1 lowers it.
// Everything drawn on a floor travels with it. Gaps between floors are kept.
export function moveLevel(project, id, dir) {
  sortLevels(project);
  const i = project.levels.findIndex((l) => l.id === id), j = i + (dir > 0 ? 1 : -1);
  if (i < 0 || j < 0 || j >= project.levels.length) return false;
  const lo = Math.min(i, j), hi = Math.max(i, j), m = resolveModel(project), A = m.levelById[project.levels[lo].id], B = m.levelById[project.levels[hi].id];
  const gap = Math.max(0, B.elev - A.top);
  project.levels[hi].elev = r3(A.elev); project.levels[lo].elev = r3(A.elev + B.height + gap);
  const t = project.levels[lo]; project.levels[lo] = project.levels[hi]; project.levels[hi] = t;
  renumberLevels(project);
  return true;
}

// Floors with the standard names (Ground floor, First floor, Basement...) are renamed to match their place in the stack.
// Names you typed yourself are left alone.
const AUTO = /^(Ground|First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth) floor$|^Basement( \d+)?$|^Level \d+$/;
export function renumberLevels(project) {
  sortLevels(project);
  const m = resolveModel(project), el = {}; m.levels.forEach((l) => { el[l.id] = l.elev; });
  const below = project.levels.filter((l) => el[l.id] < -0.001), above = project.levels.filter((l) => el[l.id] >= -0.001);
  const set = (l, name) => { if (AUTO.test(l.name)) l.name = name; };
  above.forEach((l, k) => set(l, k === 0 ? 'Ground floor' : (k <= ORD.length ? ORD[k - 1] + ' floor' : 'Level ' + (k + 1))));
  below.slice().reverse().forEach((l, k) => set(l, k === 0 ? 'Basement' : 'Basement ' + (k + 1)));
}
function nameFor(project, where) {
  if (where === 'below') { const n = project.levels.filter((l) => /^basement/i.test(l.name)).length; return n ? 'Basement ' + (n + 1) : 'Basement'; }
  const n = project.levels.filter((l) => !/^basement/i.test(l.name)).length;      // floors at or above ground that already exist
  return n <= ORD.length ? ORD[n - 1] + ' floor' : 'Level ' + (n + 1);
}
const freeId = (project) => { let n = project.levels.length, id = 'L' + n; while (project.levels.some((x) => x.id === id)) id = 'L' + (++n); return id; };

// Adds a floor above or below `ref` (default: the top or the bottom floor). Floors above the new one move up so the stack stays whole.
// Below the lowest floor it becomes a basement and nothing moves. opts: {where:'above'|'below', ref, copy:boolean, name}
export function addLevel(project, opts = {}) {
  sortLevels(project);
  const where = opts.where === 'below' ? 'below' : 'above', m0 = resolveModel(project);
  const ref = (opts.ref && m0.levelById[opts.ref]) || (where === 'above' ? m0.levels[m0.levels.length - 1] : m0.levels[0]);
  const refRaw = project.levels.find((l) => l.id === ref.id), id = freeId(project);
  const h = opts.height !== undefined && opts.height !== '' ? opts.height : (opts.copy ? refRaw.height : '=storey');
  // a floor above an RCC roof sits on top of that slab and uses it as its floor, so it gets no floor slab of its own
  const onRcc = where === 'above' && ref.rccRoof;
  const lv = newLevel(id, (opts.name && String(opts.name).trim()) || nameFor(project, where), 0, { autoSlab: where === 'above' && !onRcc, height: h });
  const idx = project.levels.findIndex((l) => l.id === ref.id);
  let at;
  if (where === 'above') { lv.elev = r3(ref.top + (onRcc ? ref.roofT : 0)); at = idx + 1; } else if (idx === 0) { at = 0; } else { lv.elev = r3(ref.elev); at = idx; }
  project.levels.splice(at, 0, lv);
  const m1 = resolveModel(project), nl = m1.levelById[id];
  if (where === 'below' && at === 0) lv.elev = r3(ref.elev - nl.height);
  else project.levels.forEach((l, i) => { if (i > at) l.elev = r3(m1.levelById[l.id].elev + nl.height + (onRcc ? ref.roofT : 0)); });
  if (opts.copy) copyLevelContents(project, ref.id, id);
  renumberLevels(project);
  project.activeLevel = id;
  return id;
}

// Copies walls (with their openings), columns, beams, stairs and room names from one level to another.
export function copyLevelContents(project, fromId, toId) {
  const ids = {}, made = { walls: 0, openings: 0, columns: 0, beams: 0, stairs: 0, rooms: 0 };
  project.walls.filter((w) => w.level === fromId).slice().forEach((w) => { const c = clone(w); c.id = nid(project, 'walls'); c.level = toId; ids[w.id] = c.id; project.walls.push(c); made.walls++; });
  project.openings.filter((o) => ids[o.wall]).slice().forEach((o) => { const c = clone(o); c.id = nid(project, 'openings'); c.wall = ids[o.wall]; project.openings.push(c); made.openings++; });
  [['columns', 'columns'], ['beams', 'beams'], ['stairs', 'stairs'], ['rooms', 'rooms']].forEach(([kind, key]) => {
    project[kind].filter((o) => o.level === fromId).slice().forEach((o) => { const c = clone(o); c.id = nid(project, kind); c.level = toId; project[kind].push(c); made[key]++; });
  });
  return made;
}

// Delete a level and everything on it
export function deleteLevel(project, id) {
  const i = project.levels.findIndex((l) => l.id === id); if (i < 0 || project.levels.length < 2) return false;
  project.levels.splice(i, 1);
  ['walls', 'columns', 'beams', 'footings', 'slabs', 'roofs', 'stairs', 'dims', 'texts', 'rooms'].forEach((k) => { project[k] = project[k].filter((o) => o.level !== id); });
  const wallIds = new Set(project.walls.map((w) => w.id)); project.openings = project.openings.filter((o) => wallIds.has(o.wall));
  if (project.activeLevel === id) project.activeLevel = project.levels[0].id;
  renumberLevels(project);
  return true;
}
