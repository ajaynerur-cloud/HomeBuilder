// Builds a Studio project from the courtyard planner's current plan.
// pl: plan from planFor(ST), S: planner state, core: window.__core from the planner.
import { newProject } from '../model/schema.js';
import { addWall, addOpening, addRoomLabel, addSlab, addRoof } from '../model/generators.js';

const typeOf = (r) => {
  if (r.t === 'court') return 'court'; if (r.t === 'corr') return 'corridor';
  if (r.key === 'living') return 'living';
  if (r.t === 'bed') return 'bed'; if (r.t === 'din') return 'dining'; if (r.t === 'kit') return 'kitchen';
  if (r.t === 'wet') return /\+/.test(r.n) ? 'bathwc' : (/wc/i.test(r.n) ? 'wc' : 'bath');
  if (r.t === 'store') return 'store'; if (r.t === 'pooja') return 'pooja'; return 'room';
};

export function importPlan(pl, S, core) {
  const p = newProject('Courtyard house (from planner)'), D = pl.D, fy = (y) => Math.round((D - y) * 1000) / 1000;
  p.levels[0].elev = pl.plinth; p.levels[0].name = 'Ground floor';
  const eave = 9;
  p.params.find((x) => x.name === 'storey').v = eave;
  const runs = core.wallRuns(pl), byRun = [];
  runs.forEach((r) => {
    const a = r.o === 'H' ? [r.a0, fy(r.pos)] : [r.pos, fy(r.a0)], b = r.o === 'H' ? [r.a1, fy(r.pos)] : [r.pos, fy(r.a1)];
    const w = addWall(p, a, b, { t: r.cls === 'out' ? '=wallOut' : (r.cls === 'ct' ? 0.5 : '=wallIn'), h: '=storey' });
    byRun.push({ run: r, wall: w });
  });
  const find = (o) => byRun.find((x) => x.run.o === o.o && Math.abs(x.run.pos - o.pos) < 1e-6 && x.run.a0 <= o.a0 + 1e-6 && x.run.a1 >= o.a1 - 1e-6);
  const swing = (x, o) => {
    // swing towards the room, not the corridor; into the smaller room when both are rooms
    const mid = (o.a0 + o.a1) / 2, off = 0.9, pa = o.o === 'H' ? [mid, o.pos - off] : [o.pos - off, mid], pb = o.o === 'H' ? [mid, o.pos + off] : [o.pos + off, mid];
    const ra = core.roomAt(pl, pa[0], pa[1]), rb = core.roomAt(pl, pb[0], pb[1]), ok = (r) => r && r.t !== 'corr' && r.t !== 'court';
    let intoB = true; // planner side B = larger planner y (south) / larger x (east)
    if (ok(ra) && !ok(rb)) intoB = false; else if (ok(ra) && ok(rb)) intoB = ra.w * ra.h >= rb.w * rb.h;
    // studio wall runs from a to b with left normal n; for H runs b is east so n points north (planner side A); for V runs b is south so n points east (planner side B)
    const leftIsA = o.o === 'H';
    return leftIsA ? intoB : !intoB;
  };
  const all = pl.doors.map((d) => ({ ...d, kind: d.k === 'main' ? 'door' : (d.k === 'open' ? 'arch' : 'door') })).concat(core.winList(pl).map((w) => ({ ...w, kind: w.k === 'vent' ? 'vent' : 'window' })));
  let skipped = 0;
  all.forEach((o) => {
    const x = find(o); if (!x) { skipped++; return; }
    const c = (o.a0 + o.a1) / 2, pos = c - x.run.a0, wd = o.a1 - o.a0;
    const op = { kind: o.kind, pos, w: wd };
    if (o.kind === 'door') { op.h = 7; op.sill = 0; op.flip = swing(x, o); }
    else if (o.kind === 'arch') { op.h = 7.5; op.sill = 0; }
    else if (o.kind === 'vent') { op.h = 1.5; op.sill = 5.5; } else { op.h = 3.5; op.sill = 3; }
    addOpening(p, x.wall, op);
  });
  pl.rooms.forEach((r) => {
    if (r.hidden || r.t === 'pass' || r.t === 'corr') return;
    // the planner leaves the corridor open to the courtyard, so they form one open region here
    if (r.t === 'court') { const cr = pl.center; addRoomLabel(p, cr.x + cr.w / 2, fy(cr.y + cr.h / 2), pl.corr ? 'Courtyard and corridor' : 'Courtyard', 'court'); return; }
    addRoomLabel(p, r.x + r.w / 2, fy(r.y + r.h / 2), r.n, typeOf(r));
  });
  // plinth: a slab under the footprint, open at the courtyard
  const C = pl.court;
  addSlab(p, [[0, 0], [pl.W, 0], [pl.W, D], [0, D]], { t: pl.plinth, holes: [[[C.x, fy(C.y + C.h)], [C.x + C.w, fy(C.y + C.h)], [C.x + C.w, fy(C.y)], [C.x, fy(C.y)]]] });
  // roof wings (the planner's ring roof is approximated by four rectangular wings)
  const shape = S.shape, over = Math.min(S.over || 2, 2), pitch = Math.min(S.pitch || 22, 35);
  if (shape === 'flat') addRoof(p, 0, 0, pl.W, D, { type: 'flat', over: 0.5, t: 0.5 });
  else {
    const wings = [
      { x0: 0, y0: fy(C.y), x1: pl.W, y1: D, out: 'n', ax: 'x' },                                    // north wing (planner y 0..C.y)
      { x0: 0, y0: 0, x1: pl.W, y1: fy(C.y + C.h), out: 's', ax: 'x' },                              // south wing
      { x0: 0, y0: fy(C.y + C.h), x1: C.x, y1: fy(C.y), out: 'w', ax: 'y' },                         // west wing
      { x0: C.x + C.w, y0: fy(C.y + C.h), x1: pl.W, y1: fy(C.y), out: 'e', ax: 'y' },                // east wing
    ];
    wings.forEach((w) => {
      if (shape === 'double') addRoof(p, w.x0, w.y0, w.x1, w.y1, { type: 'gable', ridge: w.ax, pitch, over: 0.5 });
      else {
        const fallOut = shape === 'outward' ? w.out : ({ n: 's', s: 'n', w: 'e', e: 'w' }[w.out]);
        const dir = shape === 'outward' ? ({ n: 'n', s: 's', w: 'w', e: 'e' }[fallOut]) : ({ n: 's', s: 'n', w: 'e', e: 'w' }[w.out]);
        addRoof(p, w.x0, w.y0, w.x1, w.y1, { type: 'shed', dir, pitch: Math.min(pitch, 20), over: 0.5 });
      }
    });
  }
  p.site.sbc = S.sbc || 150;
  return { project: p, skipped };
}
