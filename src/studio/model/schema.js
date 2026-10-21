// Project shape and defaults. Fields that can hold an expression are noted in the property panel.
export const LAYERS = [
  { id: 'A-WALL', name: 'Walls', color: '#3b3b3b' }, { id: 'A-DOOR', name: 'Doors', color: '#2e7d32' },
  { id: 'A-GLAZ', name: 'Windows', color: '#1565c0' }, { id: 'A-ROOM', name: 'Rooms', color: '#8d6e63' },
  { id: 'A-SLAB', name: 'Slabs', color: '#757575' }, { id: 'A-ROOF', name: 'Roofs', color: '#b4573a' },
  { id: 'A-STAIR', name: 'Stairs', color: '#6d4c41' }, { id: 'S-COLS', name: 'Columns', color: '#c62828' },
  { id: 'S-BEAM', name: 'Beams', color: '#ef6c00' }, { id: 'S-FNDN', name: 'Footings', color: '#455a64' },
  { id: 'A-DIMS', name: 'Dimensions', color: '#6a1b9a' }, { id: 'A-ANNO', name: 'Notes and text', color: '#00695c' },
].map((l) => ({ ...l, visible: true, locked: false }));

export const KINDS = ['walls', 'openings', 'columns', 'beams', 'footings', 'slabs', 'roofs', 'stairs', 'dims', 'texts', 'rooms'];
export const KIND_OF_PREFIX = { w: 'walls', o: 'openings', c: 'columns', b: 'beams', f: 'footings', s: 'slabs', r: 'roofs', t: 'stairs', d: 'dims', x: 'texts', m: 'rooms' };
export const PREFIX = { walls: 'w', openings: 'o', columns: 'c', beams: 'b', footings: 'f', slabs: 's', roofs: 'r', stairs: 't', dims: 'd', texts: 'x', rooms: 'm' };

export function defaultParams() {
  return [
    { name: 'wallOut', v: 0.75, note: 'Outer wall thickness (9 in)' },
    { name: 'wallIn', v: 0.375, note: 'Inner wall thickness (4.5 in)' },
    { name: 'storey', v: 10, note: 'Floor to floor height' },
    { name: 'doorW', v: 3, note: 'Door width' },
    { name: 'doorH', v: 7, note: 'Door height' },
    { name: 'winW', v: 4, note: 'Window width' },
    { name: 'winSill', v: 3, note: 'Window sill height' },
    { name: 'winH', v: 3.5, note: 'Window height' },
    { name: 'colB', v: '230mm', note: 'Column width' },
    { name: 'beamB', v: '230mm', note: 'Beam width' },
    { name: 'beamD', v: '300mm', note: 'Beam depth' },
    { name: 'slabT', v: '125mm', note: 'Slab thickness' },
  ];
}

export function newLevel(id, name, elev, extra) {
  // rccRoof: a flat RCC roof slab (with parapet) that follows the walls of this level, whatever their shape
  return { id, name, elev, height: '=storey', autoSlab: false, slabT: '=slabT', rccRoof: false, roofT: '=slabT', parapet: 3, parT: 0.375, roofOver: 0, ...(extra || {}) };
}

export function newProject(name = 'Untitled') {
  return {
    version: 1, name, display: 'ftin', nextId: 1,
    params: defaultParams(),
    levels: [newLevel('L0', 'Ground floor', 0)],
    activeLevel: 'L0',
    walls: [], openings: [], columns: [], beams: [], footings: [], slabs: [], roofs: [], stairs: [], dims: [], texts: [], rooms: [],
    layers: LAYERS.map((l) => ({ ...l })),
    materials: [],
    site: { sbc: 150, fck: 20, fy: 415, dlFloor: 4.5, llFloor: 2, dlRoof: 1.5, llRoof: 0.75, brick: 19, maxSpan: 12 },
    print: { scale: 100, minMm: 1.2, base: true, baseMm: 2, marginMm: 6, bedX: 220, bedY: 220, bedZ: 250, unionWalls: true, panels: false, roofSeparate: true },
  };
}

export function migrate(p) {
  const d = newProject(p && p.name);
  const out = { ...d, ...p };
  KINDS.forEach((k) => { if (!Array.isArray(out[k])) out[k] = []; });
  if (!Array.isArray(out.params) || !out.params.length) out.params = d.params;
  if (!Array.isArray(out.levels) || !out.levels.length) out.levels = d.levels;
  if (!Array.isArray(out.layers) || !out.layers.length) out.layers = d.layers;
  if (!Array.isArray(out.materials)) out.materials = [];
  LAYERS.forEach((l) => { if (!out.layers.some((x) => x.id === l.id)) out.layers.push({ ...l }); });
  out.site = { ...d.site, ...(p && p.site) };
  out.print = { ...d.print, ...(p && p.print) };
  if (!out.levels.some((l) => l.id === out.activeLevel)) out.activeLevel = out.levels[0].id;
  if (!(out.nextId > 0)) out.nextId = 1;
  return out;
}
