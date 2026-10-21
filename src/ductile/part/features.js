// Parametric part: named parameters + an ordered feature history regenerated on the exact kernel.
import { valueOf, resolveParams } from '../../studio/core/params.js';
import { newSketch, solve, loops, sid, byId, DIMENSIONAL } from './sketch.js';
export const FEATURE_TYPES = { sketch: 'Sketch', extrude: 'Extrude', revolve: 'Revolve', loft: 'Loft', sweep: 'Sweep', surface: 'Surface', thicken: 'Thicken', shell: 'Shell', fillet: 'Fillet', chamfer: 'Chamfer' };
export const SURFACE_MODES = [['extrude', 'Extruded surface'], ['revolve', 'Revolved surface'], ['loft', 'Lofted surface'], ['sweep', 'Swept surface']];
export const OPS = [['join', 'Add'], ['cut', 'Cut'], ['intersect', 'Intersect']];
export const EDGE_SETS = [['picked', 'Picked edges'], ['all', 'All edges'], ['top', 'Top edges'], ['bottom', 'Bottom edges'], ['vertical', 'Vertical edges']];
export const OPEN_FACES = [['picked', 'Picked faces'], ['top', 'Top face'], ['bottom', 'Bottom face'], ['xmax', '+X face'], ['xmin', '−X face'], ['ymax', '+Y face'], ['ymin', '−Y face']];
export function newPart(name = 'Part') { return { kind: 'ductile-part', v: 1, name, params: [], features: [], rollback: null }; }
export function addFeature(part, type, props = {}) {
  const count = part.features.filter((f) => f.type === type).length + 1, f = Object.assign({ id: sid('f'), type, name: FEATURE_TYPES[type] + ' ' + count, suppressed: false }, defaults(type), props);
  const at = part.rollback == null ? part.features.length : part.rollback; part.features.splice(at, 0, f); if (part.rollback != null) part.rollback++; return f;
}
function defaults(t) { return { sketch: { sk: newSketch('XY', 0) }, extrude: { sketch: null, distance: '20', dir: 'normal', op: 'join' }, revolve: { sketch: null, axis: 'Z', angle: '360', op: 'join' }, loft: { sketches: [], ruled: false, op: 'join' }, sweep: { profile: null, path: null, op: 'join' }, shell: { thickness: '2', open: 'top', facePicks: [] }, fillet: { radius: '2', edges: 'all', picks: [] }, chamfer: { size: '1', edges: 'all', picks: [] }, surface: { mode: 'extrude', sketch: null, sketches: [], profile: null, path: null, distance: '30', angle: '360', axis: 'Z', ruled: false }, thicken: { surface: null, thickness: '2', op: 'join' } }[t]; }
export function scopeOf(part) { return resolveParams(part.params.map((p) => ({ name: p.name, v: p.v })), 'mm'); }
export const num = (v, scope) => valueOf(v, scope, 'mm');
// sketch geometry -> kernel drawing (closed profiles with holes) or an open path
function splineIds(s, fwd) { const ids = s.ref.pts.slice(); return fwd ? ids : ids.reverse(); }
function chainPts(sk, chain) { const pts = []; chain.forEach(({ s, fwd }) => { if (s.kind === 'spline') { splineIds(s, fwd).slice(0, -1).forEach((id) => { const q = byId(sk.points, id); pts.push([q.x, q.y]); }); return; } const a = byId(sk.points, fwd ? s.ra : s.rb); pts.push([a.x, a.y]); }); return pts; }
function arcMid(sk, arc) { const c = byId(sk.points, arc.c), a = byId(sk.points, arc.a), b = byId(sk.points, arc.b), r = Math.hypot(a.x - c.x, a.y - c.y), ta = Math.atan2(a.y - c.y, a.x - c.x); let sw = Math.atan2(b.y - c.y, b.x - c.x) - ta; while (sw <= 0) sw += Math.PI * 2; const tm = ta + sw / 2; return [c.x + r * Math.cos(tm), c.y + r * Math.sin(tm)]; }
function chainDrawing(R, sk, chain, close) {
  const p0 = byId(sk.points, chain[0].fwd ? chain[0].s.ra : chain[0].s.rb); let d = R.draw([p0.x, p0.y]);
  chain.forEach(({ s, fwd }, i) => { const e = byId(sk.points, fwd ? s.rb : s.ra), last = close && i === chain.length - 1;
    if (s.kind === 'spline') { splineIds(s, fwd).slice(1).forEach((id, k, arr) => { const q = byId(sk.points, id); if (last && k === arr.length - 1) d = d.smoothSplineTo([p0.x, p0.y]); else d = d.smoothSplineTo([q.x, q.y]); }); return; }
    if (last) { if (s.kind === 'arc') d = d.threePointsArcTo([p0.x, p0.y], arcMid(sk, s.ref)); return; } if (s.kind === 'arc') d = d.threePointsArcTo([e.x, e.y], arcMid(sk, s.ref)); else d = d.lineTo([e.x, e.y]); });
  return close ? d.close() : d.done();
}
const area = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
export function profileDrawing(R, sk) {
  const lp = loops(sk), items = [];
  lp.closed.forEach((ch) => { const pts = chainPts(sk, ch); items.push({ d: chainDrawing(R, sk, ch, true), poly: pts, area: area(pts), probe: pts[0] }); });
  lp.circles.forEach((c) => { const cc = byId(sk.points, c.c), poly = Array.from({ length: 24 }, (_, i) => [cc.x + c.r * Math.cos(i * Math.PI / 12), cc.y + c.r * Math.sin(i * Math.PI / 12)]); items.push({ d: R.drawCircle(c.r).translate(cc.x, cc.y), poly, area: Math.PI * c.r * c.r, probe: [cc.x + c.r, cc.y] }); });
  if (!items.length) throw new Error('The sketch has no closed profile.');
  items.sort((a, b) => b.area - a.area); let out = null; const outers = [];
  items.forEach((it) => { const host = outers.find((o) => inside(it.probe, o.poly)); if (host) host.d = host.d.cut(it.d); else outers.push(it); });
  outers.forEach((o) => { out = out ? out.fuse(o.d) : o.d; }); return out;
}
// for sweeps: outer profiles and their holes, swept separately and combined
export function profileParts(R, sk) {
  const lp = loops(sk), items = [];
  lp.closed.forEach((ch) => { const pts = chainPts(sk, ch); items.push({ d: chainDrawing(R, sk, ch, true), poly: pts, area: area(pts), probe: pts[0] }); });
  lp.circles.forEach((c) => { const cc = byId(sk.points, c.c), poly = Array.from({ length: 24 }, (_, i) => [cc.x + c.r * Math.cos(i * Math.PI / 12), cc.y + c.r * Math.sin(i * Math.PI / 12)]); items.push({ d: R.drawCircle(c.r).translate(cc.x, cc.y), poly, area: Math.PI * c.r * c.r, probe: [cc.x + c.r, cc.y] }); });
  items.sort((a, b) => b.area - a.area); const outers = [], inners = []; items.forEach((it) => { if (outers.some((o) => inside(it.probe, o.poly))) inners.push(it); else outers.push(it); });
  return { outers: outers.map((o) => o.d), inners: inners.map((o) => o.d) };
}
export function pathDrawing(R, sk) { const lp = loops(sk); if (lp.open.length) return chainDrawing(R, sk, lp.open[0], false); if (lp.closed.length) return chainDrawing(R, sk, lp.closed[0], true); throw new Error('The path sketch has no lines.'); }
const onPlane = (R, sk, scope, drawing) => drawing.sketchOnPlane(sk.plane, num(sk.offset, scope));
// surfaces are open: built straight from the wire with the kernel's prism and revolution, or as shells from loft and sweep
function wireOf(R, sk, scope) { const lp = loops(sk); if (lp.open.length) return onPlane(R, sk, scope, chainDrawing(R, sk, lp.open[0], false)).wire; if (lp.closed.length) return onPlane(R, sk, scope, chainDrawing(R, sk, lp.closed[0], true)).wire; if (lp.circles.length) { const c = lp.circles[0], cc = byId(sk.points, c.c); return onPlane(R, sk, scope, R.drawCircle(c.r).translate(cc.x, cc.y)).wire; } throw new Error('The sketch has no curves.'); }
function sketchSolidOrOpen(R, sk, scope) { const lp = loops(sk); if (lp.open.length) return onPlane(R, sk, scope, chainDrawing(R, sk, lp.open[0], false)); return onPlane(R, sk, scope, profileDrawing(R, sk)); }
function fixInside(R, s) { try { if (R.measureVolume(s) < 0) return R.cast(s.wrapped.Reversed()); } catch (e) { /* surfaces have no volume */ } return s; }
// geometric signatures: identify a face or edge on the very shape being modified (internal ids are not stable across copies)
const sigKey = (p, d) => p.map((v) => Math.round(v * 1e3)).join(',') + '|' + d.map((v) => Math.round(Math.abs(v) * 100)).join(',');
export function faceSig(f) { const c = f.center.toTuple(); let n = [0, 0, 1]; try { n = f.normalAt().toTuple(); } catch (e) { /* none */ } const l = Math.hypot(n[0], n[1], n[2]) || 1; return sigKey(c, n.map((v) => v / l)); }
export function edgeSig(e) { const m = e.pointAt(0.5).toTuple(); let t = [0, 0, 0]; try { t = e.tangentAt(0.5).toTuple(); } catch (x) { /* none */ } const l = Math.hypot(t[0], t[1], t[2]) || 1; return sigKey(m, t.map((v) => v / l)); }
// ---------- picked edges: remembered by geometry (midpoint relative to the part's box, direction, curve type), matched again after every rebuild
const bboxOf = (body) => body.boundingBox.bounds, normPt = (p, bb) => [0, 1, 2].map((k) => (p[k] - bb[0][k]) / Math.max(1e-6, bb[1][k] - bb[0][k]));
function edgeInfo(e, bb) { const m = e.pointAt(0.5).toTuple(); let t = [0, 0, 0]; try { t = e.tangentAt(0.5).toTuple(); } catch (x) { /* degenerate */ } const l = Math.hypot(t[0], t[1], t[2]) || 1; return { m, n: normPt(m, bb), t: t.map((v) => v / l), type: e.geomType }; }
const r5 = (a) => a.map((v) => +v.toFixed(5));
const edgeInfoPt = (e, u, bb) => normPt(e.pointAt(u).toTuple(), bb);
export function edgeRef(body, edge) { const bb = bboxOf(body), i = edgeInfo(edge, bb); return { m: i.m.map((v) => +v.toFixed(4)), n: r5(i.n), t: i.t.map((v) => +v.toFixed(4)), type: i.type, s: [0, 0.25, 0.5, 0.75, 1].map((u) => r5(normPt(edge.pointAt(u).toTuple(), bb))), len: +edge.length.toFixed(4) }; }
// distance (in the part's normalised box) from a point to a sampled curve, and that curve's direction there
function nearPoly(p, poly, live) { let bd = Infinity, dir = [0, 0, 0]; for (let k = 0; k < poly.length - 1; k++) { const a = poly[k], b = poly[k + 1], v = [0, 1, 2].map((c) => (b[c] - a[c]) * live[c]), w = [0, 1, 2].map((c) => (p[c] - a[c]) * live[c]), l2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2] || 1e-12, t = Math.max(0, Math.min(1, (w[0] * v[0] + w[1] * v[1] + w[2] * v[2]) / l2)), d = Math.hypot(w[0] - v[0] * t, w[1] - v[1] * t, w[2] - v[2] * t); if (d < bd) { bd = d; const l = Math.sqrt(l2); dir = v.map((x) => x / l); } } return { d: bd, dir }; }
export function matchEdges(body, refs) {
  const bb = bboxOf(body), edges = body.edges, infos = edges.map((e) => Object.assign(edgeInfo(e, bb), { sig: edgeSig(e), a: edgeInfoPt(e, 0, bb), b: edgeInfoPt(e, 1, bb) })), size = [0, 1, 2].map((k) => bb[1][k] - bb[0][k]), diag = Math.hypot(...size) || 1, hashes = new Set(), taken = new Set(), sigs = new Set(); let missing = 0, split = 0, reattached = 0;
  (refs || []).forEach((r) => {
    let best = -1, bs = Infinity;
    infos.forEach((q, i) => { if (taken.has(i)) return; const dn = Math.hypot(...[0, 1, 2].map((k) => (q.n[k] - r.n[k]) * (size[k] > 1e-6 ? 1 : 0))), da = Math.hypot(...[0, 1, 2].map((k) => q.m[k] - r.m[k])) / diag, dir = 1 - Math.abs(q.t[0] * r.t[0] + q.t[1] * r.t[1] + q.t[2] * r.t[2]); const sc = Math.min(dn, da) + dir * 0.3 + (q.type === r.type ? 0 : 0.5); if (sc < bs) { bs = sc; best = i; } });
    // the edge may have been split by a later change: take every piece lying along the original edge
    let pieces = [];
    if (r.s) infos.forEach((q, i) => { if (taken.has(i) || q.type !== r.type) return; const live = size.map((x) => (x > 1e-6 ? 1 : 0)), ends = [q.a, q.n, q.b]; const fit = ends.map((p) => nearPoly(p, r.s, live)); if (fit.every((f) => f.d < 0.012) && (q.type !== 'LINE' || Math.abs(fit[1].dir[0] * q.t[0] + fit[1].dir[1] * q.t[1] + fit[1].dir[2] * q.t[2]) > 0.98 || Math.hypot(...fit[1].dir) < 1e-9)) pieces.push(i); });
    const take = (i) => { taken.add(i); hashes.add(i); sigs.add(infos[i].sig); };
    if (pieces.length >= 2 || (pieces.length === 1 && !(best >= 0 && bs < 0.1))) { pieces.forEach(take); if (pieces.length >= 2) split++; }
    else if (best >= 0 && bs < 0.1) take(best);
    else { let alt = -1, ad = Infinity; infos.forEach((q, i) => { if (taken.has(i)) return; const d = Math.hypot(...[0, 1, 2].map((k) => q.n[k] - r.n[k])), dt = Math.abs(q.t[0] * r.t[0] + q.t[1] * r.t[1] + q.t[2] * r.t[2]); if (dt > 0.8 && d < 0.15 && d < ad) { ad = d; alt = i; } }); if (alt >= 0) { take(alt); reattached++; } else missing++; }
  });
  return { hashes, sigs, missing, split, reattached, found: taken.size };
}
// faces: centre (normalised), normal, surface type and normalised bounds; split faces keep every coplanar piece inside the original bounds
function faceInfo(f, bb) { const c = f.center.toTuple(); let n = [0, 0, 1]; try { n = f.normalAt().toTuple(); } catch (e) { /* no normal */ } const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map((v) => v / l); const fb = f.boundingBox.bounds; return { c, n: normPt(c, bb), nrm: n, type: f.geomType, box: [normPt(fb[0], bb), normPt(fb[1], bb)] }; }
export function faceRef(body, face) { const i = faceInfo(face, bboxOf(body)); return { n: r5(i.n), nrm: i.nrm.map((v) => +v.toFixed(5)), type: i.type, box: i.box.map(r5) }; }
export function matchFaces(body, refs) {
  const bb = bboxOf(body), faces = body.faces, infos = faces.map((f) => Object.assign(faceInfo(f, bb), { sig: faceSig(f) })), hashes = new Set(), taken = new Set(), sigs = new Set(); let missing = 0, split = 0, reattached = 0;
  (refs || []).forEach((r) => {
    let best = -1, bs = Infinity; infos.forEach((q, i) => { if (taken.has(i)) return; const sc = Math.hypot(...[0, 1, 2].map((k) => q.n[k] - r.n[k])) + (1 - (q.nrm[0] * r.nrm[0] + q.nrm[1] * r.nrm[1] + q.nrm[2] * r.nrm[2])) * 0.5 + (q.type === r.type ? 0 : 0.5); if (sc < bs) { bs = sc; best = i; } });
    const pieces = []; infos.forEach((q, i) => { if (taken.has(i) || q.type !== r.type) return; const dn = q.nrm[0] * r.nrm[0] + q.nrm[1] * r.nrm[1] + q.nrm[2] * r.nrm[2]; if (dn < 0.995) return; const inside = [0, 1, 2].every((k) => q.n[k] >= r.box[0][k] - 0.01 && q.n[k] <= r.box[1][k] + 0.01), off = Math.abs([0, 1, 2].reduce((s2, k) => s2 + (q.n[k] - r.n[k]) * r.nrm[k], 0)); if (inside && off < 0.01) pieces.push(i); });
    const take = (i) => { taken.add(i); hashes.add(i); sigs.add(infos[i].sig); };
    if (pieces.length >= 2) { pieces.forEach(take); split++; } else if (best >= 0 && bs < 0.1) take(best); else if (pieces.length === 1) take(pieces[0]);
    else { // the face changed kind (flat to curved and so on): re-attach to the face now in the same place, facing the same way
      let alt = -1, ad = Infinity; infos.forEach((q, i) => { if (taken.has(i)) return; const d = Math.hypot(...[0, 1, 2].map((k) => q.n[k] - r.n[k])), dn = q.nrm[0] * r.nrm[0] + q.nrm[1] * r.nrm[1] + q.nrm[2] * r.nrm[2]; if (dn > 0.8 && d < 0.25 && d < ad) { ad = d; alt = i; } });
      if (alt >= 0) { take(alt); reattached++; } else missing++;
    }
  });
  return { hashes, sigs, missing, split, reattached, found: taken.size };
}
// ---------- regenerate the whole history
export function regenerate(R, part, opt = {}) {
  const surfaces = new Map(), pr = scopeOf(part), scope = pr.values, errors = {}, warnings = {}, notes = {}, sketches = new Map(), stop = opt.stop != null ? opt.stop : part.rollback == null ? part.features.length : part.rollback; let body = null;
  Object.keys(pr.errors).forEach((k) => { errors['param:' + k] = pr.errors[k]; });
  const dimVal = (c) => num(c.value, scope), combine = (shape, op) => { if (!body || op === 'new') return shape; return op === 'cut' ? body.cut(shape) : op === 'intersect' ? body.intersect(shape) : body.fuse(shape); };
  const sketchOf = (id) => { const s = sketches.get(id); if (!s) throw new Error('Pick a sketch that comes earlier in the history.'); return s; };
  part.features.forEach((f, i) => {
    if (i >= stop || f.suppressed) return;
    try {
      if (f.type === 'sketch') { solve(f.sk, dimVal); sketches.set(f.id, f.sk); return; }
      if (f.type === 'extrude') { const sk = sketchOf(f.sketch), d = num(f.distance, scope); let sol = onPlane(R, sk, scope, profileDrawing(R, sk)); let s;
        if (f.dir === 'both') { s = sol.extrude(2 * d); const n = R.createNamedPlane(sk.plane, 0).zDir.toTuple(); s = s.translate([-n[0] * d, -n[1] * d, -n[2] * d]); } else s = sol.extrude(f.dir === 'reverse' ? -d : d);
        body = combine(s, f.op); return; }
      if (f.type === 'revolve') { const sk = sketchOf(f.sketch), ax = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[f.axis] || [0, 0, 1], ang = num(f.angle, scope); body = combine(onPlane(R, sk, scope, profileDrawing(R, sk)).revolve(ax, { angle: ang }), f.op); return; }
      if (f.type === 'loft') { const ss = (f.sketches || []).map(sketchOf); if (ss.length < 2) throw new Error('Pick two or more sketches to loft through.'); const sol = ss.map((sk) => onPlane(R, sk, scope, profileDrawing(R, sk))); body = combine(sol[0].loftWith(sol.slice(1), { ruled: !!f.ruled }), f.op); return; }
      if (f.type === 'sweep') { const prof = sketchOf(f.profile), path = sketchOf(f.path), parts = profileParts(R, prof); if (!parts.outers.length) throw new Error('The profile sketch has no closed shape.');
        const along = (dr) => onPlane(R, path, scope, pathDrawing(R, path)).sweepSketch((pl, o) => dr.sketchOnPlane(pl, o), { transitionMode: 'round' });
        let s = null; parts.outers.forEach((dr) => { const x = along(dr); s = s ? s.fuse(x) : x; }); parts.inners.forEach((dr) => { s = s.cut(along(dr)); }); body = combine(s, f.op); return; }
      if (f.type === 'surface') { const oc = R.getOC ? R.getOC() : null; let sf;
        if (f.mode === 'extrude') { const sk = sketchOf(f.sketch), d = num(f.distance, scope), n = R.createNamedPlane(sk.plane, 0).zDir.toTuple(); sf = R.cast(new oc.BRepPrimAPI_MakePrism(wireOf(R, sk, scope).wrapped, new oc.gp_Vec(n[0] * d, n[1] * d, n[2] * d), false, true).Shape()); }
        else if (f.mode === 'revolve') { const sk = sketchOf(f.sketch), ax = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[f.axis] || [0, 0, 1]; sf = R.cast(new oc.BRepPrimAPI_MakeRevol(wireOf(R, sk, scope).wrapped, new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(ax[0], ax[1], ax[2])), num(f.angle, scope) * Math.PI / 180, false).Shape()); }
        else if (f.mode === 'loft') { const ss = (f.sketches || []).map(sketchOf); if (ss.length < 2) throw new Error('Pick two or more sketches to loft through.'); const w = ss.map((sk) => sketchSolidOrOpen(R, sk, scope)); sf = w[0].loftWith(w.slice(1), { ruled: !!f.ruled }, true); }
        else { const prof = sketchOf(f.profile), path = sketchOf(f.path), lp = loops(prof); let pd;
          if (lp.open.length) { const ch = lp.open[0]; if (ch.length === 1 && ch[0].s.kind !== 'arc' && !(ch[0].s.kind === 'spline' && ch[0].s.ref.pts.length > 2)) { const A = byId(prof.points, ch[0].fwd ? ch[0].s.ra : ch[0].s.rb), B = byId(prof.points, ch[0].fwd ? ch[0].s.rb : ch[0].s.ra); const L = Math.hypot(B.x - A.x, B.y - A.y) || 1, nx = -(B.y - A.y) / L * 1e-5, ny = (B.x - A.x) / L * 1e-5; pd = R.draw([A.x, A.y]).lineTo([(A.x + B.x) / 2 + nx, (A.y + B.y) / 2 + ny]).lineTo([B.x, B.y]).done(); /* the kernel cannot sweep a single straight edge (or two exactly collinear ones), so the profile gets a 0.00001 mm kink at its midpoint: far below any manufacturing tolerance */ } else pd = chainDrawing(R, prof, ch, false); } else pd = profileDrawing(R, prof); sf = onPlane(R, path, scope, pathDrawing(R, path)).sweepSketch((pl, o) => pd.sketchOnPlane(pl, o), { transitionMode: 'round' }); }
        surfaces.set(f.id, sf); return; }
      if (f.type === 'thicken') { const oc = R.getOC(), ids = [...surfaces.keys()], id = f.surface && surfaces.has(f.surface) ? f.surface : ids[ids.length - 1]; if (!id) throw new Error('Needs a surface from an earlier feature.'); const t = num(f.thickness, scope), mk = new oc.BRepOffsetAPI_MakeThickSolid(); mk.MakeThickSolidBySimple(surfaces.get(id).wrapped, t); const sol = fixInside(R, R.cast(mk.Shape())); surfaces.delete(id); body = combine(sol, f.op); return; }
      if (!body) throw new Error('Needs a solid from an earlier feature.');
      const bb = body.boundingBox.bounds, [mn, mx] = bb;
      if (f.type === 'shell') { const t = num(f.thickness, scope); let sel = { top: (q) => q.inPlane('XY', mx[2]), bottom: (q) => q.inPlane('XY', mn[2]), xmax: (q) => q.inPlane('YZ', mx[0]), xmin: (q) => q.inPlane('YZ', mn[0]), ymax: (q) => q.inPlane('XZ', -mx[1]), ymin: (q) => q.inPlane('XZ', -mn[1]) }[f.open] || ((q) => q.inPlane('XY', mx[2]));
        let selFor = () => sel;
        if (f.open === 'picked') { const mt = matchFaces(body, f.facePicks); if (!mt.found) throw new Error((f.facePicks || []).length ? 'None of the picked faces are on the solid any more. Pick them again.' : 'No faces picked yet. Use Pick faces in the view.'); if (mt.reattached) notes[f.id] = mt.reattached + ' picked face' + (mt.reattached > 1 ? 's' : '') + ' changed shape (for example flat to curved) and ' + (mt.reattached > 1 ? 'were' : 'was') + ' re-attached to the face now in the same place.'; if (mt.missing) warnings[f.id] = mt.missing + ' of ' + f.facePicks.length + ' picked faces could not be found and ' + (mt.missing > 1 ? 'were' : 'was') + ' left closed. Pick again to fix this.'; selFor = (shape) => { const sg = matchFaces(shape, f.facePicks).sigs; return (q) => q.when(({ element }) => sg.has(faceSig(element))); }; } const v0 = R.measureVolume(body), size = (b) => { const q = b.boundingBox.bounds; return [0, 1, 2].map((k) => q[1][k] - q[0][k]); }, s0 = size(body);
        const ok = (b) => { try { const v = R.measureVolume(b), sz = size(b); return v < v0 * 0.995 && sz.every((x, k) => Math.abs(x - s0[k]) < Math.max(0.01, t * 0.05)); } catch (e) { return false; } };
        let res = null; for (const tt of [t, -t]) { try { const c = body.clone(), b = c.shell(tt, selFor(c)); if (ok(b)) { res = b; break; } } catch (e) { /* try the other side */ } }
        if (!res) for (const tt of [-t, t]) { try { const c = body.clone(), b = c.shell(tt, selFor(c)); if (R.measureVolume(b) < v0 * 0.995) { res = b; warnings[f.id] = 'The kernel could not offset this surface inward, so the wall was added outside: the part is ' + t + ' mm larger all round.'; break; } } catch (e) { /* none */ } }
        if (!res) throw new Error('The shell could not be made: the wall is too thick for this shape, or the open face was not found.'); body = res; return; }
      let edges = { all: undefined, top: (e) => e.inPlane('XY', mx[2]), bottom: (e) => e.inPlane('XY', mn[2]), vertical: (e) => e.ofCurveType('LINE').parallelTo('Z') }[f.edges];
      if (f.edges === 'picked') { const mt = matchEdges(body, f.picks); if (!mt.found) throw new Error((f.picks || []).length ? 'None of the picked edges are on the solid any more. Pick them again.' : 'No edges picked yet. Use Pick edges in the view.'); if (mt.reattached) notes[f.id] = mt.reattached + ' picked edge' + (mt.reattached > 1 ? 's' : '') + ' changed shape and ' + (mt.reattached > 1 ? 'were' : 'was') + ' re-attached to the edge now in the same place.'; if (mt.missing) warnings[f.id] = mt.missing + ' of ' + f.picks.length + ' picked edges could not be found and ' + (mt.missing > 1 ? 'were' : 'was') + ' skipped. Pick again to fix this.'; edges = (e) => e.when(({ element }) => mt.sigs.has(edgeSig(element))); }
      if (f.type === 'fillet') { body = body.fillet(num(f.radius, scope), edges); return; }
      if (f.type === 'chamfer') { body = body.chamfer(num(f.size, scope), edges); return; }
    } catch (e) { const msg = (e && e.message) || ''; errors[f.id] = !msg || /null function|signature mismatch|unreachable|out of bounds|Exception|RuntimeError/i.test(msg) || (e && e.constructor && /Exception/.test(e.constructor.name)) ? 'The kernel could not build this ' + FEATURE_TYPES[f.type].toLowerCase() + ' with these values (for example a fillet larger than the wall, or a cut that misses the body).' : msg; }
  });
  return { body, surfaces: [...surfaces.values()], errors, warnings, notes, scope, sketches };
}
// display and analysis
export function displaySoup(body, tol = 0.08) {
  const m = body.mesh({ tolerance: tol, angularTolerance: 12 }), V = m.vertices, N = m.normals, T = m.triangles, nt = T.length / 3, pos = new Float32Array(nt * 9), nrm = new Float32Array(nt * 9);
  for (let t = 0; t < nt * 3; t++) { const i = T[t]; pos[t * 3] = V[i * 3]; pos[t * 3 + 1] = V[i * 3 + 1]; pos[t * 3 + 2] = V[i * 3 + 2]; nrm[t * 3] = N[i * 3]; nrm[t * 3 + 1] = N[i * 3 + 1]; nrm[t * 3 + 2] = N[i * 3 + 2]; }
  let edges = [], groups = []; try { const me = body.meshEdges({ tolerance: tol, angularTolerance: 12 }); edges = me.lines; groups = me.edgeGroups; } catch (e) { /* edges optional */ }
  return { pos, nrm, nt, edges, groups, faceGroups: m.faceGroups || [] };
}
export function meshForSubdivision(body) { const m = body.mesh({ tolerance: 0.2, angularTolerance: 20 }), V = [], F = []; for (let i = 0; i < m.vertices.length; i += 3) V.push([m.vertices[i], m.vertices[i + 1], m.vertices[i + 2]]); for (let i = 0; i < m.triangles.length; i += 3) F.push([m.triangles[i], m.triangles[i + 1], m.triangles[i + 2]]); return { V, F, C: {} }; }
// ---------- production drawing: hidden-line views, overall dimensions, parameter table, title block (A3 landscape, mm)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function productionDrawing(R, part, body, opt = {}) {
  const [mn, mx] = body.boundingBox.bounds, size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]], W = 420, H = 297;
  const scales = [10, 5, 4, 2.5, 2, 1, 0.5, 0.4, 0.25, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001], sc = scales.find((s) => (size[0] + size[1]) * s <= 250 && (size[2] + size[1]) * s <= 170) || 0.001;
  const label = sc >= 1 ? sc + ':1' : '1:' + Math.round(1 / sc), out = [];
  const view = (name, cx, cy, dims, title) => {
    const pr = R.drawProjection(body, name), vb = pr.visible.toSVGViewBox().split(' ').map(Number), ox = vb[0] + vb[2] / 2, oy = vb[1] + vb[3] / 2, tf = 'translate(' + cx + ' ' + cy + ') scale(' + sc + ') translate(' + -ox + ' ' + -oy + ')';
    const paths = (d, cls) => d.toSVGPaths().flat().map((p) => '<path class="' + cls + '" d="' + p + '"/>').join('');
    out.push('<g transform="' + tf + '">' + paths(pr.hidden, 'h') + paths(pr.visible, 'v') + '</g>');
    const x0 = cx - vb[2] * sc / 2, x1 = cx + vb[2] * sc / 2, y0 = cy - vb[3] * sc / 2, y1 = cy + vb[3] * sc / 2;
    if (dims.w != null) { const y = y1 + 8; out.push('<path class="d" d="M' + x0 + ' ' + (y1 + 2) + 'V' + (y + 1.5) + 'M' + x1 + ' ' + (y1 + 2) + 'V' + (y + 1.5) + 'M' + x0 + ' ' + y + 'H' + x1 + '"/><text x="' + (cx) + '" y="' + (y - 1.2) + '" text-anchor="middle">' + dims.w.toFixed(2) + '</text>'); }
    if (dims.h != null) { const x = x0 - 8; out.push('<path class="d" d="M' + (x0 - 2) + ' ' + y0 + 'H' + (x - 1.5) + 'M' + (x0 - 2) + ' ' + y1 + 'H' + (x - 1.5) + 'M' + x + ' ' + y0 + 'V' + y1 + '"/><text x="' + (x - 1.4) + '" y="' + cy + '" text-anchor="middle" transform="rotate(-90 ' + (x - 1.4) + ' ' + cy + ')">' + dims.h.toFixed(2) + '</text>'); }
    out.push('<text x="' + cx + '" y="' + (y0 - 4) + '" text-anchor="middle" class="t">' + title + '</text>');
  };
  const fx = 30 + size[0] * sc / 2 + 20, fy = 40 + size[1] * sc + 25 + size[2] * sc / 2;
  view('front', fx, fy, { w: size[0], h: size[2] }, 'FRONT'); view('top', fx, fy - size[2] * sc / 2 - 25 - size[1] * sc / 2, { h: size[1] }, 'TOP'); view('right', fx + size[0] * sc / 2 + 30 + size[1] * sc / 2, fy, { w: size[1] }, 'RIGHT');
  // tables and title block
  let ty = 30; out.push('<text x="300" y="' + ty + '" class="t">PARAMETERS</text>'); ty += 5; part.params.forEach((p) => { out.push('<text x="300" y="' + ty + '">' + esc(p.name) + ' = ' + esc(p.v) + '</text>'); ty += 4.2; });
  ty += 4; out.push('<text x="300" y="' + ty + '" class="t">FEATURE HISTORY</text>'); ty += 5; part.features.forEach((f, i) => { out.push('<text x="300" y="' + ty + '"' + (f.suppressed ? ' fill="#888"' : '') + '>' + (i + 1) + '. ' + esc(f.name) + (f.suppressed ? ' (suppressed)' : '') + '</text>'); ty += 4.2; });
  const bx = 280, by = 247; out.push('<rect class="v" x="' + bx + '" y="' + by + '" width="130" height="40"/><path class="v" d="M' + bx + ' ' + (by + 14) + 'H' + (bx + 130) + 'M' + bx + ' ' + (by + 27) + 'H' + (bx + 130) + 'M' + (bx + 65) + ' ' + (by + 14) + 'V' + (by + 40) + '"/>');
  out.push('<text x="' + (bx + 3) + '" y="' + (by + 9) + '" class="big">DUCTILE</text><text x="' + (bx + 127) + '" y="' + (by + 9) + '" text-anchor="end" class="t">' + esc(part.name) + '</text>');
  out.push('<text x="' + (bx + 3) + '" y="' + (by + 22) + '">Scale ' + label + '   Units mm</text><text x="' + (bx + 68) + '" y="' + (by + 22) + '">Size ' + size.map((s) => s.toFixed(1)).join(' × ') + '</text>');
  out.push('<text x="' + (bx + 3) + '" y="' + (by + 35) + '">Third-angle projection</text><text x="' + (bx + 68) + '" y="' + (by + 35) + '">' + new Date(opt.date || Date.now()).toISOString().slice(0, 10) + '   Sheet 1/1 A3</text>');
  const css = '<style>.v{fill:none;stroke:#111;stroke-width:0.35;vector-effect:non-scaling-stroke}.h{fill:none;stroke:#555;stroke-width:0.2;stroke-dasharray:1.5 1;vector-effect:non-scaling-stroke}.d{fill:none;stroke:#1a1a1a;stroke-width:0.18}text{font-family:Helvetica,Arial,sans-serif;font-size:3px;fill:#111}.t{font-weight:700;font-size:3.4px}.big{font-weight:800;font-size:5px;letter-spacing:.5px}</style>';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 420 297">' + css + '<rect width="420" height="297" fill="#fff"/><rect class="v" x="10" y="10" width="400" height="277"/>' + out.join('') + '</svg>';
}
export { newSketch, solve, sid, DIMENSIONAL };
