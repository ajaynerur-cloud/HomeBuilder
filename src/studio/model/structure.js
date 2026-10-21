// Preliminary structural frame: columns, beams, footings, load takedown and sizing. A structural engineer must verify everything.
import { wallNodes } from './walls.js';
import { pointSeg, dot, dist, pointInRing, ringArea, polyMP, mpUnion } from './geometry.js';
import { footprints } from './walls.js';
import { detectRooms } from './rooms.js';
import { addColumn, addBeam, addFooting } from './generators.js';
import { wallSolidsUnion, autoSlabMP } from './solids.js';
import { meshStats } from './geometry.js';

const FT = 0.3048, SQFT = 0.09290304;

function columnPoints(model, levelId, maxSpan) {
  const walls = model.walls.filter((w) => w.level === levelId), nodes = wallNodes(walls), pts = [];
  const push = (p) => { if (!pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05)) pts.push([p[0], p[1]]); };
  nodes.forEach((nd) => {
    const E = nd.ends;
    if (E.length === 1) return push(nd.p);
    const straight = E.length === 2 && Math.abs(E[0].away[0] * E[1].away[1] - E[0].away[1] * E[1].away[0]) < 0.05 && dot(E[0].away, E[1].away) < 0;
    if (!straight) push(nd.p);
  });
  // wall ends that land on the middle of another wall also need a column
  walls.forEach((w) => [w.a, w.b].forEach((p) => push(p)));
  // intermediate columns along long spans
  walls.forEach((w) => {
    const on = pts.map((p) => ({ p, r: pointSeg(p, w.a, w.b) })).filter((x) => x.r.d < 0.05).sort((a, b) => a.r.t - b.r.t);
    for (let i = 0; i + 1 < on.length; i++) {
      const gap = (on[i + 1].r.t - on[i].r.t) * w.len;
      if (gap > maxSpan) {
        const n = Math.ceil(gap / maxSpan) - 1;
        for (let k = 1; k <= n; k++) { const t = on[i].r.t + (on[i + 1].r.t - on[i].r.t) * k / (n + 1); push([w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t]); }
      }
    }
  });
  return pts;
}

// Replace automatic columns, beams and footings. Hand-placed members are left alone.
export function generateFrame(project, model, opts = {}) {
  const maxSpan = opts.maxSpan || project.site.maxSpan || 12, levels = opts.levels || model.levels.map((l) => l.id);
  project.columns = project.columns.filter((c) => !(c.auto && levels.includes(c.level)));
  project.beams = project.beams.filter((b) => !(b.auto && levels.includes(b.level)));
  const lowest = model.levels[0].id;
  if (levels.includes(lowest) || opts.footings) project.footings = project.footings.filter((f) => !f.auto);
  let nc = 0, nb = 0, nf = 0;
  levels.forEach((lid) => {
    const walls = model.walls.filter((w) => w.level === lid); if (!walls.length) return;
    const pts = columnPoints(model, lid, maxSpan);
    pts.forEach((p) => { addColumn(project, p[0], p[1], { level: lid, auto: true }); nc++; });
    walls.forEach((w) => {
      const on = pts.map((p) => ({ p, t: pointSeg(p, w.a, w.b) })).filter((x) => x.t.d < 0.05).sort((a, b) => a.t.t - b.t.t);
      for (let i = 0; i + 1 < on.length; i++) { addBeam(project, on[i].p, on[i + 1].p, { level: lid, auto: true }); nb++; if (opts.plinth) addBeam(project, on[i].p, on[i + 1].p, { level: lid, auto: true, zTop: 0.0001 }); }
    });
    if (lid === lowest) pts.forEach((p) => { addFooting(project, p[0], p[1], { level: lid, auto: true }); nf++; });
  });
  return { columns: nc, beams: nb, footings: nf };
}

const ROUND = (v, step) => Math.ceil(v / step - 1e-9) * step;
export function columnCapacityKN(bmm, dmm, fck, fy) { const ac = bmm * dmm, asc = 0.008 * ac; return (0.4 * fck * (ac - asc) + 0.67 * fy * asc) / 1000; }
export function footingFor(Pk, sbc, colMm) {
  const area = (1.1 * Pk) / sbc, B = Math.max(900, ROUND(Math.sqrt(area) * 1000, 150));
  const proj = (B - colMm) / 2, D = Math.max(300, ROUND(proj * 0.6, 50));
  return { B, D, bearing: (1.1 * Pk) / ((B / 1000) * (B / 1000)) };
}

export function roomsNoCourt(model, levelId) { return detectRooms(model, levelId).filter((r) => r.type !== 'court'); }

export function loadTakedown(model) {
  const site = model.site, out = [], byLevel = {};
  const levels = model.levels.slice().sort((a, b) => b.elev - a.elev);                 // top to bottom
  levels.forEach((L) => {
    const cols = model.columns.filter((c) => c.level === L.id); byLevel[L.id] = cols.map((c) => ({ c, own: 0, total: 0, trib: 0 }));
    const rows = byLevel[L.id]; if (!rows.length) return;
    const nearest = (x, y) => { let best = null, bd = 1e9; rows.forEach((r) => { const d = Math.hypot(r.c.c[0] - x, r.c.c[1] - y); if (d < bd) { bd = d; best = r; } }); return best; };
    // floor and roof areas
    const q = (dl, ll) => (dl + ll);
    const hasSlab = L.slabOn || model.slabs.some((s) => s.level === L.id);
    if (hasSlab) {
      const polys = [];
      if (L.slabOn) roomsNoCourt(model, L.id).forEach((r) => polys.push({ ring: r.ring, holes: r.holes }));
      model.slabs.filter((s) => s.level === L.id).forEach((s) => polys.push({ ring: s.ring, holes: s.holes || [] }));
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; polys.forEach((p) => p.ring.forEach((v) => { x0 = Math.min(x0, v[0]); y0 = Math.min(y0, v[1]); x1 = Math.max(x1, v[0]); y1 = Math.max(y1, v[1]); }));
      for (let x = Math.floor(x0) + 0.5; x < x1; x += 1) for (let y = Math.floor(y0) + 0.5; y < y1; y += 1) {
        if (!polys.some((p) => pointInRing([x, y], p.ring) && !p.holes.some((h) => pointInRing([x, y], h)))) continue;
        const r = nearest(x, y); r.trib += SQFT; r.own += SQFT * q(site.dlFloor, site.llFloor);
      }
    }
    model.roofs.filter((r) => r.level === L.id).forEach((rf) => {
      const X0 = rf.x0 - rf.over, X1 = rf.x1 + rf.over, Y0 = rf.y0 - rf.over, Y1 = rf.y1 + rf.over, k = 1 / Math.cos(rf.pitch * Math.PI / 180);
      const self = rf.type === 'rcc' ? 25 * rf.t * FT : 0;                       // slab self weight, kN/m2 (25 kN/m3 concrete)
      for (let x = Math.floor(X0) + 0.5; x < X1; x += 1) for (let y = Math.floor(Y0) + 0.5; y < Y1; y += 1) {
        if (x < X0 || y < Y0) continue;
        const r = nearest(x, y); r.own += SQFT * (k * q(site.dlRoof, site.llRoof) + self); r.trib += SQFT;
      }
    });
    // the automatic RCC roof of this level: slab weight, finishes and live load share out to the nearest column
    if (L.rccRoof) {
      const a = autoSlabMP(model, L.id), polys = [];
      ((a && a.mp) || []).forEach((poly) => polys.push({ ring: poly[0], holes: poly.slice(1) }));
      if (polys.length) {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; polys.forEach((p) => p.ring.forEach((v) => { x0 = Math.min(x0, v[0]); y0 = Math.min(y0, v[1]); x1 = Math.max(x1, v[0]); y1 = Math.max(y1, v[1]); }));
        for (let x = Math.floor(x0) + 0.5; x < x1; x += 1) for (let y = Math.floor(y0) + 0.5; y < y1; y += 1) {
          if (!polys.some((p) => pointInRing([x, y], p.ring) && !p.holes.some((h) => pointInRing([x, y], h)))) continue;
          const r = nearest(x, y); r.trib += SQFT; r.own += SQFT * (25 * L.roofT * FT + q(site.dlRoof, site.llRoof));
        }
      }
    }
    // walls: weight shared between the columns on either end of each span
    model.walls.filter((w) => w.level === L.id).forEach((w) => {
      const on = rows.map((r) => ({ r, t: pointSeg(r.c.c, w.a, w.b) })).filter((x) => x.t.d < 0.06).sort((a, b) => a.t.t - b.t.t);
      if (on.length < 1) return;
      const ops = model.openings.filter((o) => o.wall === w.id).reduce((s, o) => s + o.w * o.h, 0);
      const net = Math.max(0, 1 - ops / (w.len * w.h)), tot = w.len * FT * w.t * FT * w.h * FT * site.brick * 1.1 * net;
      if (on.length === 1) { on[0].r.own += tot; return; }
      for (let i = 0; i + 1 < on.length; i++) { const part = tot * (on[i + 1].t.t - on[i].t.t); on[i].r.own += part / 2; on[i + 1].r.own += part / 2; }
    });
    model.beams.filter((b) => b.level === L.id).forEach((b) => {
      const wt = b.w * FT * b.depth * FT * b.len * FT * 25;
      [b.a, b.b].forEach((p) => { const r = nearest(p[0], p[1]); if (r && dist(r.c.c, p) < 0.3) r.own += wt / 2; });
    });
    rows.forEach((r) => { r.own += (r.c.shape === 'round' ? Math.PI * Math.pow(r.c.b * FT / 2, 2) : r.c.b * FT * r.c.d * FT) * (r.c.z1 - r.c.z0) * FT * 25; });
    // carry the loads of the level above down into the nearest column here
    const upper = levels.filter((l) => l.elev > L.elev && byLevel[l.id] && byLevel[l.id].length);
    rows.forEach((r) => { r.total = r.own; });
    upper.forEach((l) => byLevel[l.id].forEach((u) => {
      // only the immediate level above passes its total (it already holds levels above it)
      if (l.idx !== undefined && L.idx !== undefined && l.idx !== L.idx + 1) return;
      let best = null, bd = 1e9; rows.forEach((r) => { const d = Math.hypot(r.c.c[0] - u.c.c[0], r.c.c[1] - u.c.c[1]); if (d < bd) { bd = d; best = r; } });
      if (best && bd < 1.5) best.total += u.total;
    }));
  });
  const res = [];
  Object.keys(byLevel).forEach((lid) => byLevel[lid].forEach((r) => {
    const c = r.c, bmm = Math.round(c.b * 304.8), dmm = Math.round(c.d * 304.8), Pk = r.total, Pu = 1.5 * Pk;
    const cap = columnCapacityKN(bmm, dmm, site.fck, site.fy);
    let suggest = 230; for (const s of [230, 250, 300, 350, 400, 450, 500, 600]) { suggest = s; if (columnCapacityKN(s, s, site.fck, site.fy) * 0.8 >= Pu) break; }
    const slender = ((c.z1 - c.z0) * 304.8) / Math.min(bmm, dmm);
    const f = footingFor(Pk, site.sbc, Math.max(bmm, dmm));
    res.push({ id: c.id, level: lid, x: c.c[0], y: c.c[1], section: bmm + '×' + dmm, trib: r.trib, Pk, Pu, cap, util: Pu / cap, suggest, slender, ok: Pu <= 0.8 * cap && slender <= 12, footing: f });
  }));
  return res.sort((a, b) => a.level.localeCompare(b.level) || a.x - b.x || a.y - b.y);
}

export function applyFootingSizes(project, model, rows) {
  let n = 0;
  rows.forEach((r) => {
    const f = project.footings.find((x) => x.auto && Math.hypot(model.footings.find((m) => m.id === x.id).c[0] - r.x, model.footings.find((m) => m.id === x.id).c[1] - r.y) < 0.3);
    if (!f) return;
    f.size = Math.round(r.footing.B / 304.8 * 1000) / 1000; f.padT = Math.round(r.footing.D / 304.8 * 1000) / 1000; f.depth = Math.max(5, Math.round((r.footing.D / 304.8 + 3.5) * 100) / 100); n++;
  });
  return n;
}

export function beamChecks(model) {
  return model.beams.map((b) => {
    const L = b.len * FT, d = Math.round(b.depth * 304.8), need = Math.max(230, Math.ceil(((L * 1000) / 15) / 25) * 25);
    return { id: b.id, level: b.level, span: L, depth: d, need, ok: d >= need };
  });
}
export { meshStats, wallSolidsUnion, footprints, polyMP, mpUnion, ringArea };
