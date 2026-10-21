// Colours and materials. A "fill" is either a colour ('#c9a27a') or a library material ('m:k12').
// Walls can carry one fill per face: fill (both), fillA (left of start to end), fillB (right).
export const PALETTE = [
  ['Lime white', '#f3efe4'], ['Cream', '#eadfbf'], ['Butter yellow', '#f0d98a'], ['Peach', '#f0b99a'], ['Terracotta', '#c4694a'], ['Brick red', '#a04b3a'],
  ['Rose', '#d98c9a'], ['Sage', '#a9b99a'], ['Olive', '#7d8a5a'], ['Sky', '#9cc3dd'], ['Teal', '#4f8f95'], ['Navy', '#2f4a73'],
  ['Light grey', '#cfcfca'], ['Concrete', '#a8a8a2'], ['Charcoal', '#4a4d52'], ['Teak', '#8a5a34'], ['Walnut', '#5b3b27'], ['Black', '#1d1d1f'],
];
const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (s) => typeof s === 'string' && HEX.test(s);
export const matFill = (id) => 'm:' + id;
export const hexToInt = (hex) => parseInt(hex.slice(1), 16);
export const intToHex = (n) => '#' + (n & 0xffffff).toString(16).padStart(6, '0');

export function findMaterial(materials, fill) {
  if (typeof fill !== 'string' || fill.slice(0, 2) !== 'm:') return null;
  const id = fill.slice(2); return (materials || []).find((m) => m.id === id) || null;
}
// -> {hex, mat|null, opacity}; unknown fills resolve to null so the default colour is used
export function resolveFill(materials, fill) {
  if (isHex(fill)) return { hex: fill, mat: null, opacity: 1 };
  const m = findMaterial(materials, fill); if (m) return { hex: m.color || '#c8c2b4', mat: m, opacity: m.opacity || 1 };
  return null;
}
export function fillInt(materials, fill, fallback) { const r = resolveFill(materials, fill); return r ? hexToInt(r.hex) : fallback; }

export function addMaterial(p, m) {
  if (!Array.isArray(p.materials)) p.materials = [];
  const id = 'k' + (p.nextId++);
  const mat = { id, name: String(m.name || 'Material').slice(0, 60), color: isHex(m.color) ? m.color : '#c8c2b4', opacity: m.opacity > 0 && m.opacity <= 1 ? m.opacity : 1, tex: m.tex || null, file: m.file ? String(m.file).slice(0, 120) : '', group: m.group ? String(m.group).slice(0, 80) : '', tile: Array.isArray(m.tile) ? m.tile.map((v) => Math.max(0.1, +v || 4)) : [4, 4] };
  p.materials.push(mat); return mat;
}
export function removeMaterial(p, id) {
  p.materials = (p.materials || []).filter((m) => m.id !== id);
  const f = 'm:' + id, clean = (o) => { ['fill', 'fillA', 'fillB', 'fillSlab', 'fillRoof'].forEach((k) => { if (o[k] === f) delete o[k]; }); };
  ['walls', 'openings', 'columns', 'beams', 'footings', 'slabs', 'roofs', 'stairs', 'levels'].forEach((k) => (p[k] || []).forEach(clean));
}

const PAINTABLE = ['walls', 'openings', 'columns', 'beams', 'footings', 'slabs', 'roofs', 'stairs'];
// Paint objects. fill = null clears. side (walls only): 'a' left face, 'b' right face, 'o' top and ends, 'all' every face. Returns how many things changed.
export function setFill(p, ids, fill, side = 'all') {
  let n = 0; const set = (o, k) => { if (fill === null || fill === undefined) delete o[k]; else o[k] = fill; n++; };
  ids.forEach((id) => {
    const au = /^auto(slab|roof)-(.+)$/.exec(id);
    if (au) { const L = p.levels.find((l) => l.id === au[2]); if (L) set(L, au[1] === 'slab' ? 'fillSlab' : 'fillRoof'); return; }
    for (const k of PAINTABLE) {
      const o = (p[k] || []).find((x) => x.id === id); if (!o) continue;
      if (k === 'walls' && side === 'a') set(o, 'fillA');
      else if (k === 'walls' && side === 'b') set(o, 'fillB');
      else if (k === 'walls' && side === 'o') set(o, 'fill');                 // top and ends only: the painted faces stay as they are
      else { if (k === 'walls') { delete o.fillA; delete o.fillB; } set(o, 'fill'); }
      return;
    }
  });
  return n;
}
