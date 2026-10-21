// Helpers that add objects to a project. The tools and the importer both use these.
import { PREFIX } from './schema.js';

export function nid(p, kind) { return PREFIX[kind] + (p.nextId++); }
const r3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);

export function addWall(p, a, b, o = {}) {
  const w = { id: nid(p, 'walls'), level: o.level || p.activeLevel, ax: r3(a[0]), ay: r3(a[1]), bx: r3(b[0]), by: r3(b[1]), t: o.t === undefined ? '=wallIn' : o.t, h: o.h === undefined ? '=storey' : o.h, base: o.base || 0, layer: 'A-WALL', mat: o.mat || 'brick' };
  p.walls.push(w); return w;
}
export function addRect(p, x0, y0, x1, y1, o = {}) {
  const [a, b, c, d] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  return [addWall(p, a, b, o), addWall(p, b, c, o), addWall(p, c, d, o), addWall(p, d, a, o)];
}
export function addOpening(p, wall, o = {}) {
  const kind = o.kind || 'door';
  const def = kind === 'window' ? { w: '=winW', h: '=winH', sill: '=winSill' } : kind === 'vent' ? { w: 1.5, h: 1.5, sill: 5.5 } : kind === 'arch' ? { w: 4, h: 7.5, sill: 0 } : { w: '=doorW', h: '=doorH', sill: 0 };
  const op = { id: nid(p, 'openings'), wall: wall.id || wall, pos: o.pos === undefined ? 0 : r3(o.pos), kind, w: o.w === undefined ? def.w : o.w, h: o.h === undefined ? def.h : o.h, sill: o.sill === undefined ? def.sill : o.sill, flip: !!o.flip, mirror: !!o.mirror };
  p.openings.push(op); return op;
}
export function addColumn(p, x, y, o = {}) { const c = { id: nid(p, 'columns'), level: o.level || p.activeLevel, x: r3(x), y: r3(y), b: o.b === undefined ? '=colB' : o.b, d: o.d, h: o.h, shape: o.shape || 'rect', rot: o.rot || 0, auto: !!o.auto }; p.columns.push(c); return c; }
export function addBeam(p, a, b, o = {}) { const e = { id: nid(p, 'beams'), level: o.level || p.activeLevel, ax: r3(a[0]), ay: r3(a[1]), bx: r3(b[0]), by: r3(b[1]), b: o.b === undefined ? '=beamB' : o.b, d: o.d === undefined ? '=beamD' : o.d, zTop: o.zTop, auto: !!o.auto }; p.beams.push(e); return e; }
export function addFooting(p, x, y, o = {}) { const f = { id: nid(p, 'footings'), level: o.level || p.activeLevel, x: r3(x), y: r3(y), size: o.size === undefined ? 3 : o.size, depth: o.depth === undefined ? 5 : o.depth, padT: o.padT === undefined ? 1 : o.padT, ped: o.ped === undefined ? 0.75 : o.ped, auto: !!o.auto }; p.footings.push(f); return f; }
export function addSlab(p, ring, o = {}) { const s = { id: nid(p, 'slabs'), level: o.level || p.activeLevel, ring: ring.map((q) => [r3(q[0]), r3(q[1])]), holes: o.holes || [], t: o.t === undefined ? '=slabT' : o.t, zTop: o.zTop || 0 }; p.slabs.push(s); return s; }
export function addRoof(p, x0, y0, x1, y1, o = {}) { const r = { id: nid(p, 'roofs'), level: o.level || p.activeLevel, x0: r3(x0), y0: r3(y0), x1: r3(x1), y1: r3(y1), type: o.type || 'hip', pitch: o.pitch === undefined ? 22 : o.pitch, over: o.over === undefined ? 2 : o.over, ridge: o.ridge || 'x', dir: o.dir || 's', t: o.t === undefined ? 0.5 : o.t }; p.roofs.push(r); return r; }
export function addStair(p, x, y, dir, o = {}) { const s = { id: nid(p, 'stairs'), level: o.level || p.activeLevel, x: r3(x), y: r3(y), dir: dir || 0, width: o.width === undefined ? 3.5 : o.width, riser: o.riser === undefined ? 0.5417 : o.riser, tread: o.tread === undefined ? 0.8333 : o.tread, rise: o.rise }; p.stairs.push(s); return s; }
export function addDim(p, a, b, off = 2, level) { const d = { id: nid(p, 'dims'), level: level || p.activeLevel, ax: r3(a[0]), ay: r3(a[1]), bx: r3(b[0]), by: r3(b[1]), off }; p.dims.push(d); return d; }
export function addText(p, x, y, text, size = 0.6, level) { const t = { id: nid(p, 'texts'), level: level || p.activeLevel, x: r3(x), y: r3(y), text, size }; p.texts.push(t); return t; }
export function addRoomLabel(p, x, y, name, type = 'room', level) { const m = { id: nid(p, 'rooms'), level: level || p.activeLevel, x: r3(x), y: r3(y), name, type }; p.rooms.push(m); return m; }
