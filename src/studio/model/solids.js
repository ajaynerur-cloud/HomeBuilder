// Solid geometry for the 3D view and for printing. Everything is triangles in studio coordinates (x east, y north, z up).
import { addBox, addPrism, addTri, extrudeBands, extrudeMP, mpUnion, mpDiff, mpInter, polyMP, rectRing, orientedRect, rot, ringArea, open as openRing, meshStats, unit, sub } from './geometry.js';
import { fillInt } from './materials.js';
import { footprints, openingCut } from './walls.js';
import { detectRooms } from './rooms.js';

export const COLORS = { wall: 0xd8cdb4, slab: 0xb9b4a6, roof: 0xb4573a, column: 0x9aa0a6, beam: 0x8d6e63, footing: 0x7a7a7a, rcc: 0xa9a9a3, door: 0x6b4423, glass: 0x7fb3d5, stair: 0xc9c2b0, base: 0x555555 };
const E = 1e-6;

// members: [{mp, z0, z1}], cuts: [{mp, z0, z1}]  ->  stacked bands with openings cut out
export function bandSolid(members, cuts) {
  if (!members.length) return [];
  let zs = [];
  members.forEach((m) => zs.push(m.z0, m.z1));
  const lo = Math.min(...members.map((m) => m.z0)), hi = Math.max(...members.map((m) => m.z1));
  cuts.forEach((c) => zs.push(Math.max(lo, Math.min(hi, c.z0)), Math.max(lo, Math.min(hi, c.z1))));
  zs = [...new Set(zs.map((z) => Math.round(z * 1e5) / 1e5))].sort((a, b) => a - b);
  const bands = [], memo = new Map();
  for (let i = 0; i + 1 < zs.length; i++) {
    const z0 = zs[i], z1 = zs[i + 1];
    const cov = members.filter((m) => m.z0 <= z0 + E && m.z1 >= z1 - E); if (!cov.length) continue;
    const cut = cuts.filter((c) => c.z0 <= z0 + E && c.z1 >= z1 - E);
    const sig = cov.map((m) => members.indexOf(m)).join(',') + '/' + cut.map((c) => cuts.indexOf(c)).join(',');
    let mp = memo.get(sig);
    if (!mp) { mp = mpDiff(mpUnion(cov.map((m) => m.mp)), cut.length ? mpUnion(cut.map((c) => c.mp)) : []); memo.set(sig, mp); }
    bands.push({ mp, z0, z1 });
  }
  const out = []; extrudeBands(out, bands); return out;
}

function wallMembers(model, levelId, only) {
  const walls = model.walls.filter((w) => w.level === levelId);
  const fp = footprints(walls), W = only ? walls.filter((w) => w.id === only) : walls;
  const members = W.map((w) => ({ mp: polyMP(fp.get(w.id)), z0: w.z0, z1: w.z1 }));
  const cuts = model.openings.filter((o) => W.some((w) => w.id === o.wall) && o.kind !== 'none').map((o) => ({ mp: polyMP(openingCut(model.wallById[o.wall], o)), z0: o.z0, z1: o.z1 }));
  return { members, cuts };
}
export function wallSolidsUnion(model, levelId) { const { members, cuts } = wallMembers(model, levelId); return bandSolid(members, cuts); }
export function wallSolid(model, wall) { const { members, cuts } = wallMembers(model, wall.level, wall.id); return bandSolid(members, cuts); }

export function ringOfColumn(c) {
  if (c.shape === 'round') { const r = c.b / 2, n = 20, pts = []; for (let i = 0; i < n; i++) { const a = i * 2 * Math.PI / n; pts.push([c.c[0] + r * Math.cos(a), c.c[1] + r * Math.sin(a)]); } return pts; }
  const hx = c.b / 2, hy = c.d / 2;
  return [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map((p) => rot([c.c[0] + p[0], c.c[1] + p[1]], c.c, c.rot || 0));
}
export function columnSolid(c) { const o = []; addPrism(o, ringOfColumn(c), c.z0, c.z1); return o; }
export function beamSolid(b) { const o = []; addPrism(o, orientedRect(b.a, unit(sub(b.b, b.a)), 0, b.len, b.w / 2), b.z0, b.z1); return o; }
export function footingSolid(f) {
  const h = f.size / 2, p = f.ped / 2, z0 = f.top - f.depth, z1 = z0 + f.padT, o = [];
  extrudeBands(o, [{ mp: polyMP([[f.c[0] - h, f.c[1] - h], [f.c[0] + h, f.c[1] - h], [f.c[0] + h, f.c[1] + h], [f.c[0] - h, f.c[1] + h]]), z0, z1 },
    { mp: polyMP([[f.c[0] - p, f.c[1] - p], [f.c[0] + p, f.c[1] - p], [f.c[0] + p, f.c[1] + p], [f.c[0] - p, f.c[1] + p]]), z0: z1, z1: f.top }]);
  return o;
}
export function slabSolid(s) {
  const mp = [[s.ring.map((p) => [p[0], p[1]]), ...(s.holes || []).map((h) => h.map((p) => [p[0], p[1]]))]];
  const o = []; extrudeMP(o, mp, s.z0, s.z1); return o;
}
export function stairGeom(s) {
  const n = Math.max(2, Math.round(s.rise / s.riser)), r = s.rise / n, run = (n - 1) * s.tread, d = [Math.cos(s.dir * Math.PI / 180), Math.sin(s.dir * Math.PI / 180)];
  return { n, r, run, d };
}
export function stairSolid(s) {
  const g = stairGeom(s), bands = [];
  for (let j = 1; j < g.n; j++) bands.push({ mp: polyMP(orientedRect(s.p, g.d, (j - 1) * s.tread, g.run, s.width / 2)), z0: s.z0 + (j - 1) * g.r, z1: s.z0 + j * g.r });
  const o = []; extrudeBands(o, bands); return o;
}

// ---- roofs: closed convex solids
function polyhedron(out, V, F) {
  const c = V.reduce((a, v) => [a[0] + v[0] / V.length, a[1] + v[1] / V.length, a[2] + v[2] / V.length], [0, 0, 0]);
  F.forEach((f) => {
    const P = f.map((i) => V[i]);
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
    const fc = P.reduce((a, v) => [a[0] + v[0] / P.length, a[1] + v[1] / P.length, a[2] + v[2] / P.length], [0, 0, 0]);
    const out3 = nx * (fc[0] - c[0]) + ny * (fc[1] - c[1]) + nz * (fc[2] - c[2]);
    const Q = out3 < 0 ? P.slice().reverse() : P;
    for (let i = 1; i + 1 < Q.length; i++) addTri(out, Q[0], Q[i], Q[i + 1]);
  });
}

// ---- RCC (flat reinforced concrete) roofs: a slab of any plan shape with a parapet round the edge.
// Every edge of the outline is thickened by a rectangle, and every corner by a square. Unioning those gives an outline offset
// (works for rectilinear plans and for courtyard holes, which shrink by the same amount).
function boundaryBand(mp, w) {
  const parts = [];
  mp.forEach((poly) => poly.forEach((ring) => {
    const r = openRing(ring), n = r.length;
    for (let i = 0; i < n; i++) {
      const a = r[i], b = r[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1e-6) continue;
      parts.push(polyMP(orientedRect(a, unit(sub(b, a)), 0, l, w))); parts.push(polyMP(rectRing(a[0], a[1], w, w)));
    }
  }));
  return mpUnion(parts);
}
export function offsetMP(mp, d) { return d > 1e-6 && mp && mp.length ? mpUnion([mp, boundaryBand(mp, d)]) : mp; }
export function parapetMP(mp, pt) { return mp && mp.length ? mpInter(mp, boundaryBand(mp, pt)) : []; }
// slab from z0 up by t, parapet of height ph and thickness pt standing on the slab edge
export function rccRoofSolid(mp, z0, t, ph, pt) {
  const bands = [{ mp, z0, z1: z0 + t }];
  if (ph > 0.01) { const par = parapetMP(mp, pt); if (par.length) bands.push({ mp: par, z0: z0 + t, z1: z0 + t + ph }); }
  const out = []; extrudeBands(out, bands); return out;
}
export function roofSolid(r) {
  const X0 = r.x0 - r.over, X1 = r.x1 + r.over, Y0 = r.y0 - r.over, Y1 = r.y1 + r.over, z = r.zBase, et = Math.min(r.t, 0.5), tn = Math.tan(r.pitch * Math.PI / 180);
  const Lx = X1 - X0, Ly = Y1 - Y0, out = [];
  if (r.type === 'rcc') return rccRoofSolid(polyMP([[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]]), z, r.t, r.parapet, r.parT);
  if (r.type === 'flat' || r.pitch < 0.5) { addBox(out, X0, Y0, z, X1, Y1, z + r.t); return out; }
  const b = [[X0, Y0, z], [X1, Y0, z], [X1, Y1, z], [X0, Y1, z]], e = b.map((p) => [p[0], p[1], z + et]);
  if (r.type === 'shed') {
    const run = (r.dir === 'n' || r.dir === 's') ? Ly : Lx, rise = run * tn;
    const hi = (p) => (r.dir === 's' ? p[1] === Y1 : r.dir === 'n' ? p[1] === Y0 : r.dir === 'e' ? p[0] === X0 : p[0] === X1);
    const top = e.map((p) => [p[0], p[1], p[2] + (hi(p) ? rise : 0)]);
    polyhedron(out, [...b, ...top], [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]); return out;
  }
  const alongX = r.type === 'hip' ? Lx >= Ly : r.ridge !== 'y', span = alongX ? Ly : Lx, rz = z + et + (span / 2) * tn;
  let V, F;
  if (r.type === 'gable') {
    const ym = (Y0 + Y1) / 2, xm = (X0 + X1) / 2;
    const r0 = alongX ? [X0, ym, rz] : [xm, Y0, rz], r1 = alongX ? [X1, ym, rz] : [xm, Y1, rz];
    V = [...b, ...e, r0, r1];
    F = alongX ? [[0, 1, 2, 3], [4, 5, 9, 8], [7, 6, 9, 8], [0, 3, 7, 8, 4], [1, 2, 6, 9, 5], [0, 1, 5, 4], [3, 2, 6, 7]].filter((f) => f.length) : [[0, 1, 2, 3], [4, 7, 9, 8], [5, 6, 9, 8], [0, 1, 5, 8, 4], [3, 2, 6, 9, 7], [0, 3, 7, 4], [1, 2, 6, 5]];
    if (alongX) F = [[0, 1, 2, 3], [4, 5, 9, 8], [7, 6, 9, 8], [0, 3, 7, 8, 4], [1, 2, 6, 9, 5]];
    else F = [[0, 1, 2, 3], [4, 7, 9, 8], [5, 6, 9, 8], [0, 1, 5, 8, 4], [3, 2, 6, 9, 7]];
    // eave faces on the long sides are included in the slope polygons above via the vertical rim
    const rim = alongX ? [[0, 1, 5, 4], [3, 2, 6, 7]] : [[0, 3, 7, 4], [1, 2, 6, 5]];
    F = alongX ? [[0, 1, 2, 3], [4, 5, 9, 8], [7, 6, 9, 8], [0, 3, 7, 8, 4], [1, 2, 6, 9, 5], ...rim] : [[0, 1, 2, 3], [4, 7, 9, 8], [5, 6, 9, 8], [0, 1, 5, 8, 4], [3, 2, 6, 9, 7], ...rim];
    // rim faces coincide with the slope edge only along e-edges; slopes above start at the e-edge, so keep rims separate
    F = alongX ? [[0, 1, 2, 3], [0, 1, 5, 4], [3, 2, 6, 7], [4, 5, 9, 8], [7, 6, 9, 8], [0, 3, 7, 8, 4], [1, 2, 6, 9, 5]] : [[0, 1, 2, 3], [0, 3, 7, 4], [1, 2, 6, 5], [4, 7, 9, 8], [5, 6, 9, 8], [0, 1, 5, 8, 4], [3, 2, 6, 9, 7]];
    polyhedron(out, V, F); return out;
  }
  // hip
  const lr = Math.max(0, (alongX ? Lx : Ly) - span), mid = (alongX ? (X0 + X1) : (Y0 + Y1)) / 2, cm = (alongX ? (Y0 + Y1) : (X0 + X1)) / 2;
  const R0 = alongX ? [mid - lr / 2, cm, rz] : [cm, mid - lr / 2, rz], R1 = alongX ? [mid + lr / 2, cm, rz] : [cm, mid + lr / 2, rz];
  if (lr < 1e-6) {
    V = [...b, ...e, R0];
    F = [[0, 1, 2, 3], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 8], [5, 6, 8], [6, 7, 8], [7, 4, 8]];
  } else {
    V = [...b, ...e, R0, R1];
    F = alongX
      ? [[0, 1, 2, 3], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 9, 8], [7, 6, 9, 8], [4, 7, 8], [5, 6, 9]]
      : [[0, 1, 2, 3], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 7, 9, 8], [5, 6, 9, 8], [4, 5, 8], [7, 6, 9]];
  }
  polyhedron(out, V, F); return out;
}

export function autoSlabMP(model, levelId) {
  const L = model.levelById[levelId];
  const walls = model.walls.filter((w) => w.level === levelId); if (walls.length < 3) return [];
  const fp = footprints(walls);
  const rooms = detectRooms(model, levelId).filter((r) => r.type !== 'court');
  const mp = mpUnion([...rooms.map((r) => [[r.ring.map((p) => [p[0], p[1]]), ...r.holes.map((h) => h.map((p) => [p[0], p[1]]))]]), ...walls.map((w) => polyMP(fp.get(w.id)))]);
  return { mp, L };
}

// The RCC roof of a level: the plan of the level (rooms and walls, courtyards left open) plus the overhang
export function autoRoofMP(model, levelId) {
  const a = autoSlabMP(model, levelId); if (!a || !a.mp || !a.mp.length) return null;
  return { mp: offsetMP(a.mp, a.L.roofOver), L: a.L };
}

// All solid parts of the model.  opts: {union:boolean (merge walls per level), panels:boolean, levels:[ids]}
export function buildParts(model, opts = {}) {
  const parts = [], union = !!opts.union, lvlOk = (id) => !opts.levels || opts.levels.includes(id), mats = model.materials || [];
  const col = (o, def) => fillInt(mats, o && o.fill, def);
  model.levels.filter((l) => lvlOk(l.id)).forEach((L) => {
    if (union) { const t = wallSolidsUnion(model, L.id); if (t.length) parts.push({ kind: 'wall', id: 'walls-' + L.id, level: L.id, name: L.name + ' walls', color: COLORS.wall, tris: t }); }
    else model.walls.filter((w) => w.level === L.id).forEach((w) => { const t = wallSolid(model, w); if (t.length) parts.push({ kind: 'wall', id: w.id, ref: w.id, level: L.id, name: 'Wall ' + w.id, color: col(w, COLORS.wall), tris: t }); });
    if (L.autoSlab) {
      const a = autoSlabMP(model, L.id);
      if (a && a.mp && a.mp.length) { const t = []; extrudeMP(t, a.mp, L.elev - L.slabT, L.elev); parts.push({ kind: 'slab', id: 'autoslab-' + L.id, level: L.id, name: L.name + ' floor slab', color: fillInt(mats, L.fillSlab, COLORS.slab), tris: t }); }
    }
    if (L.rccRoof) {
      const a = autoRoofMP(model, L.id);
      if (a && a.mp.length) parts.push({ kind: 'roof', id: 'autoroof-' + L.id, level: L.id, name: L.name + ' RCC roof', color: fillInt(mats, L.fillRoof, COLORS.rcc), tris: rccRoofSolid(a.mp, L.top, L.roofT, L.parapet, L.parT) });
    }
  });
  model.slabs.filter((s) => lvlOk(s.level)).forEach((s) => parts.push({ kind: 'slab', id: s.id, ref: s.id, level: s.level, name: 'Slab ' + s.id, color: col(s, COLORS.slab), tris: slabSolid(s) }));
  model.roofs.filter((r) => lvlOk(r.level)).forEach((r) => parts.push({ kind: 'roof', id: r.id, ref: r.id, level: r.level, name: (r.type === 'rcc' ? 'RCC roof ' : 'Roof ') + r.id, color: col(r, r.type === 'rcc' ? COLORS.rcc : COLORS.roof), tris: roofSolid(r) }));
  model.columns.filter((c) => lvlOk(c.level)).forEach((c) => parts.push({ kind: 'column', id: c.id, ref: c.id, level: c.level, name: 'Column ' + c.id, color: col(c, COLORS.column), tris: columnSolid(c) }));
  model.beams.filter((b) => lvlOk(b.level)).forEach((b) => parts.push({ kind: 'beam', id: b.id, ref: b.id, level: b.level, name: 'Beam ' + b.id, color: col(b, COLORS.beam), tris: beamSolid(b) }));
  model.footings.filter((f) => lvlOk(f.level)).forEach((f) => parts.push({ kind: 'footing', id: f.id, ref: f.id, level: f.level, name: 'Footing ' + f.id, color: col(f, COLORS.footing), tris: footingSolid(f) }));
  model.stairs.filter((s) => lvlOk(s.level)).forEach((s) => parts.push({ kind: 'stair', id: s.id, ref: s.id, level: s.level, name: 'Stair ' + s.id, color: col(s, COLORS.stair), tris: stairSolid(s) }));
  if (opts.panels) {
    model.openings.filter((o) => lvlOk(o.level) && (o.kind === 'door' || o.kind === 'window' || o.kind === 'vent')).forEach((o) => {
      const w = model.wallById[o.wall], t = o.kind === 'door' ? 0.12 : 0.07, ring = orientedRect(o.c, w.d, -o.w / 2 + 0.02, o.w / 2 - 0.02, t / 2), tr = [];
      addPrism(tr, ring.map((p) => [p[0] - w.d[0] * 0, p[1]]), o.z0 + 0.02, o.z1 - 0.02);
      parts.push({ kind: 'panel', sub: o.kind === 'door' ? 'door' : 'glass', id: 'p-' + o.id, ref: o.id, level: o.level, name: (o.kind === 'door' ? 'Door ' : 'Window ') + o.id, color: col(o, o.kind === 'door' ? COLORS.door : COLORS.glass), tris: tr });
    });
  }
  return parts;
}
export { meshStats, ringArea, openRing };
