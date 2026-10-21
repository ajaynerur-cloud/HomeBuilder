// Turns the stored project (numbers, lengths, expressions) into plain numbers for drawing, solids and schedules.
import { resolveParams, num } from '../core/params.js';
import { dist, sub, unit, perp } from './geometry.js';

export function resolveModel(project) {
  const { values: scope, errors: perr } = resolveParams(project.params);
  const errors = Object.keys(perr).map((k) => 'Parameter ' + k + ': ' + perr[k]);
  const E = errors;
  const levels = project.levels.map((l, i) => {
    const elev = num(l.elev, scope, 0, E, l.name + ' elevation'), height = Math.max(1, num(l.height, scope, 10, E, l.name + ' height'));
    return {
      id: l.id, name: l.name, idx: i, elev, height, top: elev + height, autoSlab: !!l.autoSlab, slabT: Math.max(0.1, num(l.slabT, scope, 0.41, E, l.name + ' slab')),
      rccRoof: !!l.rccRoof, roofT: Math.max(0.2, num(l.roofT, scope, 0.41, E, l.name + ' roof slab')), parapet: Math.max(0, num(l.parapet, scope, 3, E, l.name + ' parapet')),
      parT: Math.max(0.1, num(l.parT, scope, 0.375, E, l.name + ' parapet thickness')), roofOver: Math.max(0, num(l.roofOver, scope, 0, E, l.name + ' roof overhang')), fillSlab: l.fillSlab, fillRoof: l.fillRoof,
    };
  });
  // A floor stacked on an RCC roof uses that slab as its floor (no second floor slab), and a parapet only belongs on the topmost roof.
  levels.forEach((l) => {
    l.belowRcc = levels.some((o) => o !== l && o.rccRoof && l.elev >= o.top - 0.05 && l.elev <= o.top + o.roofT + 0.05);
    l.slabOn = l.autoSlab && !l.belowRcc;
    l.parapetEff = levels.some((o) => o !== l && o.elev >= l.top - 0.05) ? 0 : l.parapet;
  });
  const lv = {}; levels.forEach((l) => { lv[l.id] = l; });
  const lvOf = (id) => lv[id] || levels[0];
  const walls = [];
  project.walls.forEach((w) => {
    const L = lvOf(w.level);
    const a = [num(w.ax, scope, 0, E, w.id), num(w.ay, scope, 0, E, w.id)], b = [num(w.bx, scope, 0, E, w.id), num(w.by, scope, 0, E, w.id)];
    const length = dist(a, b); if (length < 1e-4) return;
    const t = Math.max(0.05, num(w.t, scope, 0.375, E, w.id + ' thickness')), h = Math.max(0.5, num(w.h, scope, L.height, E, w.id + ' height'));
    const base = num(w.base, scope, 0, E, w.id), d = unit(sub(b, a));
    walls.push({ id: w.id, level: L.id, a, b, len: length, d, n: perp(d), t, h, z0: L.elev + base, z1: L.elev + base + h, layer: w.layer || 'A-WALL', mat: w.mat || 'brick', fill: w.fill, fillA: w.fillA, fillB: w.fillB });
  });
  const wallById = {}; walls.forEach((w) => { wallById[w.id] = w; });
  const openings = [];
  project.openings.forEach((o) => {
    const w = wallById[o.wall]; if (!w) return;
    const width = Math.max(0.2, num(o.w, scope, 3, E, o.id + ' width')), h = Math.max(0.2, num(o.h, scope, 7, E, o.id + ' height'));
    const sill = Math.max(0, num(o.sill, scope, 0, E, o.id + ' sill')), pos = num(o.pos, scope, w.len / 2, E, o.id + ' position');
    const c = [w.a[0] + w.d[0] * pos, w.a[1] + w.d[1] * pos];
    openings.push({ id: o.id, wall: w.id, level: w.level, kind: o.kind || 'door', pos, w: width, h, sill, c, z0: w.z0 + sill, z1: w.z0 + sill + h, flip: !!o.flip, mirror: !!o.mirror, fill: o.fill, layer: o.kind === 'window' || o.kind === 'vent' ? 'A-GLAZ' : 'A-DOOR' });
  });
  const columns = project.columns.map((c) => {
    const L = lvOf(c.level), b = Math.max(0.2, num(c.b, scope, 0.75, E, c.id)), d = Math.max(0.2, num(c.d === undefined || c.d === '' ? c.b : c.d, scope, b, E, c.id));
    return { id: c.id, level: L.id, c: [num(c.x, scope, 0, E, c.id), num(c.y, scope, 0, E, c.id)], b, d, shape: c.shape || 'rect', rot: c.rot || 0, z0: L.elev, z1: L.elev + Math.max(1, num(c.h, scope, L.height, E, c.id)), auto: !!c.auto, fill: c.fill, layer: 'S-COLS' };
  });
  const beams = project.beams.map((b) => {
    const L = lvOf(b.level), top = L.elev + num(b.zTop, scope, L.height, E, b.id), depth = Math.max(0.2, num(b.d, scope, 1, E, b.id));
    const a = [num(b.ax, scope, 0, E, b.id), num(b.ay, scope, 0, E, b.id)], e = [num(b.bx, scope, 0, E, b.id), num(b.by, scope, 0, E, b.id)];
    return { id: b.id, level: L.id, a, b: e, len: dist(a, e), w: Math.max(0.2, num(b.b, scope, 0.75, E, b.id)), depth, z1: top, z0: top - depth, auto: !!b.auto, fill: b.fill, layer: 'S-BEAM' };
  }).filter((b) => b.len > 1e-4);
  const footings = project.footings.map((f) => {
    const L = lvOf(f.level), size = Math.max(0.5, num(f.size, scope, 3, E, f.id)), depth = Math.max(0.5, num(f.depth, scope, 5, E, f.id));
    return { id: f.id, level: L.id, c: [num(f.x, scope, 0, E, f.id), num(f.y, scope, 0, E, f.id)], size, depth, padT: Math.min(depth, Math.max(0.3, num(f.padT, scope, 1, E, f.id))), ped: Math.max(0.3, num(f.ped, scope, 0.75, E, f.id)), top: L.elev, auto: !!f.auto, fill: f.fill, layer: 'S-FNDN' };
  });
  const slabs = project.slabs.map((s) => {
    const L = lvOf(s.level); return { id: s.id, level: L.id, ring: s.ring, holes: s.holes || [], t: Math.max(0.1, num(s.t, scope, L.slabT, E, s.id)), z1: L.elev + num(s.zTop, scope, 0, E, s.id), auto: !!s.auto, fill: s.fill, layer: 'A-SLAB' };
  }).map((s) => ({ ...s, z0: s.z1 - s.t }));
  const roofs = project.roofs.map((r) => {
    const L = lvOf(r.level), x0 = num(r.x0, scope, 0, E, r.id), y0 = num(r.y0, scope, 0, E, r.id), x1 = num(r.x1, scope, 10, E, r.id), y1 = num(r.y1, scope, 10, E, r.id), type = r.type || 'hip', rcc = type === 'rcc';
    return { id: r.id, level: L.id, x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), type, pitch: rcc ? 0 : Math.max(0, Math.min(60, num(r.pitch, scope, 22, E, r.id))), over: Math.max(0, num(r.over, scope, rcc ? 0.5 : 2, E, r.id)), ridge: r.ridge || 'x', dir: r.dir || 's', t: Math.max(0.2, num(r.t, scope, rcc ? 0.41 : 0.5, E, r.id)), parapet: rcc ? Math.max(0, num(r.parapet, scope, 3, E, r.id)) : 0, parT: Math.max(0.1, num(r.parT, scope, 0.375, E, r.id)), zBase: L.elev + num(r.zBase, scope, L.height, E, r.id), fill: r.fill, layer: 'A-ROOF' };
  });
  const stairs = project.stairs.map((s) => {
    const L = lvOf(s.level); const rise = Math.max(1, num(s.rise, scope, L.height, E, s.id));
    return { id: s.id, level: L.id, p: [num(s.x, scope, 0, E, s.id), num(s.y, scope, 0, E, s.id)], dir: s.dir || 0, width: Math.max(1.5, num(s.width, scope, 3.5, E, s.id)), rise, riser: Math.max(0.3, num(s.riser, scope, 0.5417, E, s.id)), tread: Math.max(0.5, num(s.tread, scope, 0.8333, E, s.id)), z0: L.elev, fill: s.fill, layer: 'A-STAIR' };
  });
  const dims = project.dims.map((d) => ({ id: d.id, level: d.level, a: [num(d.ax, scope, 0), num(d.ay, scope, 0)], b: [num(d.bx, scope, 0), num(d.by, scope, 0)], off: d.off === undefined ? 2 : +d.off, layer: 'A-DIMS' }));
  const texts = project.texts.map((t) => ({ id: t.id, level: t.level, p: [num(t.x, scope, 0), num(t.y, scope, 0)], text: t.text || '', size: t.size || 0.6, layer: 'A-ANNO' }));
  const labels = project.rooms.map((m) => ({ id: m.id, level: m.level, p: [num(m.x, scope, 0), num(m.y, scope, 0)], name: m.name || 'Room', type: m.type || 'room', layer: 'A-ROOM' }));
  const byId = {}; [walls, openings, columns, beams, footings, slabs, roofs, stairs].forEach((list) => list.forEach((o) => { byId[o.id] = o; }));
  return { scope, errors, levels, levelById: lv, walls, wallById, openings, columns, beams, footings, slabs, roofs, stairs, dims, texts, labels, layers: project.layers, site: project.site, materials: project.materials || [], byId };
}

const cache = new WeakMap();
export function modelOf(store) {
  const c = cache.get(store);
  if (c && c.rev === store.rev && c.p === store.p) return c.model;
  const model = resolveModel(store.p); cache.set(store, { rev: store.rev, p: store.p, model }); return model;
}
