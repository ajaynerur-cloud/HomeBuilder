// DXF (R12, millimetres) with proper layers. Walls come from the plan cut at 4 ft, so openings show as gaps.
import { footprints, openingCut } from '../model/walls.js';
import { mpUnion, mpDiff, polyMP, open, rot } from '../model/geometry.js';
import { doorSwing } from '../model/symbols.js';
import { detectRooms } from '../model/rooms.js';
import { ringOfColumn, stairGeom } from '../model/solids.js';
import { formatLength } from '../core/units.js';

const MM = 304.8, CUT = 4;
export function planWallMP(model, levelId, cut = CUT) {
  const walls = model.walls.filter((w) => w.level === levelId && w.z0 <= model.levelById[levelId].elev + cut && w.z1 >= model.levelById[levelId].elev + cut);
  if (!walls.length) return [];
  const fp = footprints(model.walls.filter((w) => w.level === levelId)), z = model.levelById[levelId].elev + cut;
  const cuts = model.openings.filter((o) => o.level === levelId && o.z0 <= z && o.z1 >= z).map((o) => polyMP(openingCut(model.wallById[o.wall], o)));
  return mpDiff(mpUnion(walls.map((w) => polyMP(fp.get(w.id)))), cuts.length ? mpUnion(cuts) : []);
}

export function buildDXF(model, opts = {}) {
  const levels = (opts.levels || [model.levels[0].id]), multi = levels.length > 1, L = [], used = new Set();
  const lay = (base, lid) => { const n = multi ? lid + '-' + base : base; used.add(n); return n; };
  const X = (v) => (v * MM).toFixed(2);
  const line = (l, a, b) => L.push('0\nLINE\n8\n' + l + '\n10\n' + X(a[0]) + '\n20\n' + X(a[1]) + '\n30\n0.0\n11\n' + X(b[0]) + '\n21\n' + X(b[1]) + '\n31\n0.0');
  const ring = (l, r) => { r = open(r); for (let i = 0; i < r.length; i++) line(l, r[i], r[(i + 1) % r.length]); };
  const text = (l, p, h, s) => L.push('0\nTEXT\n8\n' + l + '\n10\n' + X(p[0]) + '\n20\n' + X(p[1]) + '\n30\n0.0\n40\n' + (h * MM).toFixed(1) + '\n1\n' + String(s).replace(/[\r\n]/g, ' '));
  const arc = (l, c, r, a0, a1) => L.push('0\nARC\n8\n' + l + '\n10\n' + X(c[0]) + '\n20\n' + X(c[1]) + '\n30\n0.0\n40\n' + X(r) + '\n50\n' + a0.toFixed(3) + '\n51\n' + a1.toFixed(3));
  const circle = (l, c, r) => L.push('0\nCIRCLE\n8\n' + l + '\n10\n' + X(c[0]) + '\n20\n' + X(c[1]) + '\n30\n0.0\n40\n' + X(r));
  levels.forEach((lid) => {
    planWallMP(model, lid).forEach((poly) => poly.forEach((r) => ring(lay('A-WALL', lid), r)));
    model.openings.filter((o) => o.level === lid).forEach((o) => {
      const w = model.wallById[o.wall];
      if (o.kind === 'window' || o.kind === 'vent') [-0.1, 0, 0.1].forEach((f) => line(lay('A-GLAZ', lid), [o.c[0] - w.d[0] * o.w / 2 + w.n[0] * f, o.c[1] - w.d[1] * o.w / 2 + w.n[1] * f], [o.c[0] + w.d[0] * o.w / 2 + w.n[0] * f, o.c[1] + w.d[1] * o.w / 2 + w.n[1] * f]));
      else if (o.kind === 'door') { const s = doorSwing(w, o); line(lay('A-DOOR', lid), s.hinge, s.open); arc(lay('A-DOOR', lid), s.hinge, s.r, s.start, s.end); }
    });
    model.columns.filter((c) => c.level === lid).forEach((c) => { if (c.shape === 'round') circle(lay('S-COLS', lid), c.c, c.b / 2); else ring(lay('S-COLS', lid), ringOfColumn(c)); });
    model.beams.filter((b) => b.level === lid).forEach((b) => { const d = [(b.b[0] - b.a[0]) / b.len, (b.b[1] - b.a[1]) / b.len], n = [-d[1], d[0]], h = b.w / 2; [h, -h].forEach((s) => line(lay('S-BEAM', lid), [b.a[0] + n[0] * s, b.a[1] + n[1] * s], [b.b[0] + n[0] * s, b.b[1] + n[1] * s])); });
    model.footings.filter((f) => f.level === lid).forEach((f) => { const h = f.size / 2; ring(lay('S-FNDN', lid), [[f.c[0] - h, f.c[1] - h], [f.c[0] + h, f.c[1] - h], [f.c[0] + h, f.c[1] + h], [f.c[0] - h, f.c[1] + h]]); });
    model.slabs.filter((s) => s.level === lid).forEach((s) => { ring(lay('A-SLAB', lid), s.ring); (s.holes || []).forEach((h) => ring(lay('A-SLAB', lid), h)); });
    model.roofs.filter((r) => r.level === lid).forEach((r) => ring(lay('A-ROOF', lid), [[r.x0 - r.over, r.y0 - r.over], [r.x1 + r.over, r.y0 - r.over], [r.x1 + r.over, r.y1 + r.over], [r.x0 - r.over, r.y1 + r.over]]));
    model.stairs.filter((s) => s.level === lid).forEach((s) => {
      const g = stairGeom(s), n = [-g.d[1], g.d[0]];
      for (let i = 0; i <= g.n - 1; i++) { const p = [s.p[0] + g.d[0] * i * s.tread, s.p[1] + g.d[1] * i * s.tread]; line(lay('A-STAIR', lid), [p[0] - n[0] * s.width / 2, p[1] - n[1] * s.width / 2], [p[0] + n[0] * s.width / 2, p[1] + n[1] * s.width / 2]); }
      line(lay('A-STAIR', lid), s.p, [s.p[0] + g.d[0] * g.run, s.p[1] + g.d[1] * g.run]);
    });
    model.dims.filter((d) => d.level === lid).forEach((d) => {
      const dx = d.b[0] - d.a[0], dy = d.b[1] - d.a[1], l = Math.hypot(dx, dy) || 1, n = [-dy / l, dx / l], a = [d.a[0] + n[0] * d.off, d.a[1] + n[1] * d.off], b = [d.b[0] + n[0] * d.off, d.b[1] + n[1] * d.off];
      line(lay('A-DIMS', lid), a, b); line(lay('A-DIMS', lid), d.a, a); line(lay('A-DIMS', lid), d.b, b);
      text(lay('A-DIMS', lid), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.2], 0.4, formatLength(l, 'mm'));
    });
    model.texts.filter((t) => t.level === lid).forEach((t) => text(lay('A-ANNO', lid), t.p, t.size, t.text));
    detectRooms(model, lid).forEach((r) => { const nm = (r.name || 'ROOM').toUpperCase(); text(lay('A-ROOM', lid), [r.inside[0] - nm.length * 0.17, r.inside[1] + 0.2], 0.5, nm); text(lay('A-ROOM', lid), [r.inside[0] - 1.5, r.inside[1] - 0.6], 0.38, (Math.round(r.net * 0.09290304 * 100) / 100) + ' m2'); });
  });
  const colors = { 'A-WALL': 7, 'A-DOOR': 3, 'A-GLAZ': 5, 'A-ROOM': 2, 'A-SLAB': 8, 'A-ROOF': 1, 'A-STAIR': 6, 'S-COLS': 1, 'S-BEAM': 30, 'S-FNDN': 8, 'A-DIMS': 6, 'A-ANNO': 4 };
  let h = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLTYPE\n70\n1\n0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n0\nENDTAB\n';
  const names = [...used]; h += '0\nTABLE\n2\nLAYER\n70\n' + names.length + '\n';
  names.forEach((n) => { h += '0\nLAYER\n2\n' + n + '\n70\n0\n62\n' + (colors[n.replace(/^L\d+-/, '')] || 7) + '\n6\nCONTINUOUS\n'; });
  return h + '0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n' + L.join('\n') + '\n0\nENDSEC\n0\nEOF\n';
}
export { rot };
