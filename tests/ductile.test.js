import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/ductile/mesh.js';
import { box, cylinder, sphere, torus, plane } from '../src/ductile/prims.js';
import { applyStack } from '../src/ductile/modifiers.js';
import { evaluateObject, soupVolume } from '../src/ductile/evaluate.js';
import { TEMPLATES, fromTemplate } from '../src/ductile/doc.js';
import { meshCheck } from '../src/kiln/engine.js';

const solid = (cage, mods = []) => { const e = evaluateObject({ cage, mods }); return { ...meshCheck(e.soup.pos, e.soup.nt), vol: soupVolume(e.soup), nt: e.soup.nt }; };
const faceDir = (m, axis, sign) => m.F.findIndex((f) => M.faceNormal(m.V, f)[axis] * sign > 0.9);
test('push and pull a free face makes a closed block, in either direction', () => {
  const p = plane(100, 60); M.extrude(p, [0], [0, 0, 40]); let s = solid(p); assert.ok(s.watertight); assert.ok(Math.abs(s.vol - 240000) < 1e-3);
  const q = plane(100, 60); M.extrude(q, [0], [0, 0, -40]); s = solid(q); assert.ok(s.watertight && s.vol > 0, 'pushed down still the right way out');
});
test('extrude a face in any direction, inset and push in, loop cut: still closed', () => {
  const b = box(); const t = faceDir(b, 2, 1); M.extrude(b, [t], [25, -10, 60]); assert.ok(solid(b).watertight);
  const sd = faceDir(b, 1, -1); M.inset(b, [sd], 15); M.extrude(b, [sd], [0, 30, 0]); const s = solid(b); assert.ok(s.watertight && s.vol < 1.6e6);
  const r = M.loopCut(b, b.F[0][0], b.F[0][1], 0.3); assert.ok(r && r.edges.length >= 1); assert.ok(solid(b).watertight);
  const seg = box(100, 100, 100, 1, 1, 3); const before = seg.F.length; M.loopCut(seg, seg.F[2][1], seg.F[2][2], 0.5); assert.ok(seg.F.length > before); assert.ok(solid(seg, [{ type: 'smooth', levels: 2 }]).watertight);
});
test('bridge two faces makes a through hole (genus one) and stays closed', () => {
  const p = box(80, 80, 12), t = faceDir(p, 2, 1), b = faceDir(p, 2, -1); M.inset(p, [t, b], 25); assert.equal(M.bridge(p, t, b), null); assert.ok(M.isClosed(p));
  const E = M.edgeMap(p); assert.equal(p.V.length - E.size + p.F.length, 0, 'Euler characteristic 0 = one hole');
  assert.ok(solid(p, [{ type: 'smooth', levels: 2 }]).watertight);
});
test('draw a rectangle on a face (quad and general), then push it', () => {
  const w = box(400, 200, 300), f = faceDir(w, 1, -1); M.imprint(w, f, [[-60, -100, 60], [60, -100, 60], [60, -100, 200], [-60, -100, 200]]); M.extrude(w, [f], [0, 30, 0]); assert.ok(M.isClosed(w)); assert.ok(solid(w).watertight);
  const tri = { V: [[0, 0, 0], [200, 0, 0], [100, 0, 170]], F: [[0, 1, 2]], C: {} }; M.extrude(tri, [0], [0, 50, 0]); const tf = tri.F.findIndex((g) => g.length === 3 && M.faceNormal(tri.V, g)[1] > 0.9);
  M.imprint(tri, tf, [[80, 50, 30], [120, 50, 30], [120, 50, 70], [80, 50, 70]]); assert.ok(M.isClosed(tri)); const s = solid(tri); assert.ok(s.watertight && s.vol > 0);
});
test('creases keep edges sharp through smoothing', () => {
  const a = box(100, 100, 100), b = box(100, 100, 100); M.edgeMap(b).forEach((e) => M.setCrease(b, [[e.a, e.b]], true));
  const va = solid(a, [{ type: 'smooth', levels: 3 }]).vol, vb = solid(b, [{ type: 'smooth', levels: 3 }]).vol; assert.ok(va < 0.75e6, 'unsharpened box rounds off'); assert.ok(Math.abs(vb - 1e6) < 1, 'fully creased box keeps its volume ' + vb);
});
test('mirror, smooth, pattern, rim, twist, taper, array and shell give closed solids', () => {
  const half = box(100, 200, 80, 1, 3, 1); half.V = half.V.map((v) => [v[0] + 50, v[1], v[2]]); M.deleteFaces(half, half.F.map((f, i) => i).filter((i) => half.F[i].every((k) => Math.abs(half.V[k][0]) < 1e-6)));
  assert.ok(solid(half, [{ type: 'mirror', axis: 'x' }, { type: 'smooth', levels: 2 }]).watertight, 'half model mirrored');
  const vase = cylinder(50, 160, 12, 4, false, true);
  [['diamonds'], ['flutes'], ['spiral'], ['quilt'], ['waves'], ['rings']].forEach(([k]) => assert.ok(solid(vase, [{ type: 'smooth', levels: 2 }, { type: 'pattern', kind: k, map: 'cylinder', count: 14, rows: 8, depth: 3, round: 0.6, twist: 0.5 }, { type: 'shell', thickness: 2 }]).watertight, k));
  assert.ok(solid(vase, [{ type: 'smooth', levels: 2 }, { type: 'rim', count: 9, amp: 8, start: 0.7, power: 2 }, { type: 'shell', thickness: 2 }]).watertight);
  assert.ok(solid(box(100, 100, 300, 1, 1, 8), [{ type: 'taper', top: 0.6 }, { type: 'twist', angle: 80 }]).watertight);
  const arr = solid(box(50, 50, 50), [{ type: 'array', mode: 'linear', count: 4, dx: 80, dy: 0, dz: 0 }]); assert.ok(arr.watertight && Math.abs(arr.vol - 4 * 125000) < 1);
  const ring = box(50, 50, 50); ring.V = ring.V.map((v) => [v[0] + 120, v[1], v[2]]); const rs = solid(ring, [{ type: 'array', mode: 'radial', count: 6, angle: 360 }]); assert.ok(rs.watertight && Math.abs(rs.vol - 6 * 125000) < 1, 'six blocks around the axis');
  assert.ok(solid(plane(100, 100), [{ type: 'pattern', kind: 'quilt', map: 'top', cell: 25, depth: 4, round: 1 }, { type: 'shell', thickness: 3 }]).watertight, 'patterned panel');
});
test('every example scene evaluates to closed solids', () => {
  Object.keys(TEMPLATES).forEach((k) => { const d = fromTemplate(k); d.objects.forEach((o) => { const e = evaluateObject(o), c = meshCheck(e.soup.pos, e.soup.nt); assert.ok(c.watertight, k + '/' + o.name + ' open ' + c.open); assert.ok(soupVolume(e.soup) > 0, k + ' volume'); }); });
});
test('edge loops, merge and orientation repair', () => {
  const b = box(100, 100, 100, 1, 1, 3), L = M.edgeLoop(b, b.F[2][3], b.F[2][2]); assert.equal(L.length, 4, 'a loop around the middle of the box');
  const c = box(); c.F = c.F.map((f) => f.slice().reverse()); assert.ok(M.signedVolume(c) < 0); M.fixOrientation(c); assert.ok(M.signedVolume(c) > 0);
  const m = box(100, 100, 100, 2, 1, 1); const top = m.V.map((v, i) => i).filter((i) => m.V[i][2] > 99 && Math.abs(m.V[i][0]) < 1); M.mergeVerts(m, top); assert.ok(M.isClosed(m), 'merging the top centre line makes a roof ridge and stays closed');
});
