import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, resolveParams, num } from '../src/field/expr.js';
import { resolvePlanes, WORLD, dot } from '../src/field/frames.js';
import { resolveSketch, exact2, grid2, area2, vaseProfile } from '../src/field/sketch.js';
import * as S from '../src/field/sdf.js';
import { meshField, meshVolume, meshBounds, toTris } from '../src/field/mesher.js';
import { segment, boundaryLoops, faceRef, matchRegion, planeFrame, refineLoops } from '../src/field/faces.js';
import { meshStats } from '../src/studio/model/geometry.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' got ' + a + ' expected ' + b + ' +-' + tol);
const vol = (node, res = 64) => { const m = meshField(node.f, S.bbPad(node.bb, 4), res); return { m, v: meshVolume(m) }; };

test('expressions compile once and evaluate fast', () => {
  assert.equal(compile('2+3*4')({}), 14); assert.equal(compile('-(1+2)^2')({}), -9); assert.equal(compile('max(1,min(5,3))')({}), 3);
  close(compile('230mm + 1in')({}), 255.4, 1e-9); close(compile('sin(30)*2')({}), 1, 1e-12); assert.equal(compile('if(t>0.5, 10, 20)')({ t: 0.7 }), 10);
  close(compile('mix(10,20,0.25)')({}), 12.5, 1e-12); close(compile('smoothstep(0,1,0.5)')({}), 0.5, 1e-12);
  assert.throws(() => compile('1+')); assert.throws(() => compile('foo(1)')); assert.throws(() => compile('x')({})); assert.deepEqual([...compile('a*b+c').vars].sort(), ['a', 'b', 'c']);
  const f = compile('(r0 + 5*sin(3*a)) * (1 + 0.1*t)'), sc = { r0: 30, a: 0, t: 0 }; const t0 = Date.now(); let s = 0; for (let i = 0; i < 300000; i++) { sc.a = i; sc.t = (i % 100) / 100; s += f(sc); } assert.ok(Date.now() - t0 < 1500, 'fast enough: ' + (Date.now() - t0) + 'ms'); assert.ok(isFinite(s));
  const r = resolveParams([{ name: 'a', v: '=b*2' }, { name: 'b', v: 3 }, { name: 'x', v: '=y' }, { name: 'y', v: '=x' }]); assert.equal(r.values.a, 6); assert.ok(r.errors.x);
  assert.equal(num('=a+1', { a: 2 }, 0), 3);
});

test('planes: world, offset, rotated and through three points', () => {
  const sc = { d: 25, ang: 90 }, errs = [];
  const fr = resolvePlanes([{ id: 'a', kind: 'xy' }, { id: 'b', kind: 'offset', base: 'a', offset: '=d' }, { id: 'c', kind: 'rotate', base: 'a', axis: 'u', angle: '=ang' }, { id: 'd', kind: 'points', pts: [[0, 0, 0], [10, 0, 0], [0, 10, 10]] }, { id: 'e', kind: 'xz' }], sc, errs);
  assert.deepEqual(fr.b.o, [0, 0, 25]); assert.deepEqual(fr.b.n, [0, 0, 1]);
  close(fr.c.n[1], -1, 1e-9, 'rotated about u by 90 turns n to -y'); close(fr.c.v[2], 1, 1e-9);
  close(Math.hypot(...fr.d.n), 1, 1e-9); close(dot(fr.d.n, fr.d.u), 0, 1e-9); close(fr.d.n[1], -Math.SQRT1_2, 1e-9);
  assert.deepEqual(fr.e.n, [0, -1, 0]); assert.equal(errs.length, 0);
  const bad = resolvePlanes([{ id: 'p', kind: 'offset', base: 'q', offset: 1 }, { id: 'q', kind: 'offset', base: 'p', offset: 1 }], {}, errs); assert.ok(errs.length > 0 && bad.p);
});

test('sketches: circle, rounded rectangle, superellipse, spline', () => {
  const E = [], sc = { r: 20 }; let r = resolveSketch({ type: 'circle', r: '=r', seg: 180 }, sc, E);
  close(area2(r.loop), Math.PI * 400, 1000 * 0.001 * 6, 'circle area'); assert.ok(r.closed);
  r = resolveSketch({ type: 'rect', w: 40, h: 20, cr: 5 }, {}, E); close(area2(r.loop), 40 * 20 - (4 - Math.PI) * 25, 1.0, 'rounded rect');
  r = resolveSketch({ type: 'superellipse', rx: 20, ry: 20, n: 2, seg: 200 }, {}, E); close(area2(r.loop), Math.PI * 400, 4, 'n=2 is a circle');
  const sq = resolveSketch({ type: 'superellipse', rx: 20, ry: 20, n: 40, seg: 400 }, {}, E); assert.ok(area2(sq.loop) > 0.97 * 1600, 'high exponent is nearly a square');
  r = resolveSketch({ type: 'spline', closed: true, pts: [[0, 0], [20, 0], [20, 20], [0, 20]] }, {}, E); assert.ok(r.loop.length > 40); assert.ok(r.loop.some((p) => Math.hypot(p[0] - 20, p[1] - 20) < 0.01));
  const op = resolveSketch({ type: 'spline', closed: false, pts: [[10, 0], [14, 20], [10, 40]] }, {}, E); assert.equal(op.closed, false);
  const d = exact2([resolveSketch({ type: 'circle', r: 10, seg: 128 }, {}, E).loop]); close(d(0, 0), -10, 0.05); close(d(20, 0), 10, 0.01); const g = grid2([resolveSketch({ type: 'circle', r: 10, seg: 128 }, {}, E).loop]); close(g(3, 4), -5, 0.3); close(g(40, 0), 30, 0.5);
  const vp = vaseProfile([[30, 0], [40, 50], [25, 100]], 3, 5); assert.ok(area2(vp) !== 0); assert.equal(vp[0][0], 0);
});

test('prisms: normal and oblique extrusion keep volume = area x height; push-in subtracts', () => {
  const E = [], loop = resolveSketch({ type: 'circle', r: 20, seg: 160 }, {}, E).loop, fr = WORLD.xy;
  let { v } = vol(S.extrudeNode(fr, [loop], [0, 0, 1], 50)); close(v, Math.PI * 400 * 50, Math.PI * 400 * 50 * 0.02, 'cylinder');
  ({ v } = vol(S.extrudeNode(fr, [loop], [1, 0, 1], 50 * Math.SQRT2))); close(v, Math.PI * 400 * 50, Math.PI * 400 * 50 * 0.03, 'sheared cylinder keeps volume');
  ({ v } = vol(S.extrudeNode(fr, [loop], [0, 0, 1], 50, { twist: 120 }))); close(v, Math.PI * 400 * 50, Math.PI * 400 * 50 * 0.03, 'twisting a circle keeps volume');
  ({ v } = vol(S.extrudeNode(fr, [loop], [0, 0, 1], 50, { taper: 10 }))); assert.ok(v < Math.PI * 400 * 50 * 0.9 && v > 0, 'taper shrinks');
  ({ v } = vol(S.extrudeNode(fr, [loop], [0, 0, 1], 20, { sym: true }))); close(v, Math.PI * 400 * 40, Math.PI * 400 * 40 * 0.03, 'symmetric');
  assert.throws(() => S.extrudeNode(fr, [loop], [1, 0, 0], 10));
});

test('revolve, loft and surface equation build the expected solids', () => {
  const E = [], fr = WORLD.xz;
  // rectangle 10..30 x 0..40 revolved -> tube of volume pi*(30^2-10^2)*40
  const rect = [[10, 0], [30, 0], [30, 40], [10, 40]];
  let { v } = vol(S.revolveNode(fr, [rect], 'v', 360)); close(v, Math.PI * 800 * 40, Math.PI * 800 * 40 * 0.03, 'tube');
  ({ v } = vol(S.revolveNode(fr, [rect], 'v', 180))); close(v, Math.PI * 800 * 40 / 2, Math.PI * 800 * 40 * 0.04, 'half tube');
  // loft circle -> square -> circle on parallel planes
  const secs = [0, 30, 60].map((z, i) => ({ fr: { o: [0, 0, z], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] }, loops: [resolveSketch(i === 1 ? { type: 'rect', w: 40, h: 40 } : { type: 'circle', r: 20, seg: 128 }, {}, E).loop] }));
  const lo = S.loftNode(secs, true); ({ v } = vol(lo)); assert.ok(v > Math.PI * 400 * 60 * 0.9 && v < 1600 * 60 * 1.05, 'loft volume between circle and square prisms: ' + v);
  assert.ok(lo.f(0, 0, 30) < -15 && lo.f(19, 19, 30) < 0 && lo.f(19, 19, 0) > 0, 'square in the middle, round at the ends');
  assert.throws(() => S.loftNode([secs[0], { fr: { o: [0, 0, 10], u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0] }, loops: secs[0].loops }]));
  // surface equation: constant radius = cylinder, with a wall = tube with floor
  const mk = (wall, floor) => S.surfaceNode(WORLD.xy, { H: 100, rFn: () => 25, twFn: null, wall, floor, scope: {} });
  ({ v } = vol(mk(0, 0))); close(v, Math.PI * 625 * 100, Math.PI * 625 * 100 * 0.02, 'solid cylinder');
  ({ v } = vol(mk(3, 6))); const hollow = Math.PI * 625 * 100 - Math.PI * 22 * 22 * 94; close(v, hollow, hollow * 0.06, 'hollow vase wall 3 floor 6');
});

test('meshes are closed, manifold and accurate', () => {
  const sph = S.sphere([0, 0, 0], 30), { m, v } = vol(sph, 60), st = meshStats(toTris(m), 1e-5);
  assert.ok(st.watertight, JSON.stringify(st)); close(v, 4 / 3 * Math.PI * 27000, 4 / 3 * Math.PI * 27000 * 0.02, 'sphere volume'); assert.ok(st.volume > 0);
  const b = S.combine(S.box([0, 0, 0], [40, 40, 40]), S.sphere([20, 20, 20], 18), 'sub'); const mb = meshField(b.f, S.bbPad(b.bb, 4), 56); assert.ok(meshStats(toTris(mb), 1e-5).watertight, 'box with a bite is closed');
  const sh = S.shellNode(S.sphere([0, 0, 0], 30), 3); const ms = meshField(sh.f, S.bbPad(sh.bb, 4), 72); const ss = meshStats(toTris(ms), 1e-5); assert.ok(ss.watertight, 'hollow sphere has an inner and an outer closed surface');
  close(meshVolume(ms), 4 / 3 * Math.PI * (27000 - 27 * 27 * 27), 4 / 3 * Math.PI * 27000 * 0.1, 'shell volume');
  const [mn, mx] = meshBounds(m); close(mx[0] - mn[0], 60, 1.2);
});

test('faces: a box has six planar faces, a cylinder three, a sphere one curved face', () => {
  const bx = S.box([0, 0, 0], [40, 30, 20]), m = meshField(bx.f, S.bbPad(bx.bb, 4), 60), seg = segment(m);
  assert.equal(seg.regions.length, 6, 'box faces: ' + seg.regions.length); assert.ok(seg.regions.every((r) => r.planar));
  const top = seg.regions.find((r) => r.normal[2] > 0.99); close(top.area, 40 * 30, 40 * 30 * 0.06); close(top.centroid[2], 10, 0.5);
  const ref = faceRef(m, seg, top.id, planeFrame(top)); assert.ok(ref.loops2.length === 1 && ref.loops2[0].length <= 8, 'outline simplifies to a rectangle: ' + ref.loops2[0].length);
  const E = [], cyl = S.extrudeNode(WORLD.xy, [resolveSketch({ type: 'circle', r: 20, seg: 160 }, {}, E).loop], [0, 0, 1], 60), mc = meshField(cyl.f, S.bbPad(cyl.bb, 4), 64), sc = segment(mc);
  assert.equal(sc.regions.length, 3, 'cylinder faces: ' + sc.regions.length); assert.equal(sc.regions.filter((r) => r.planar).length, 2);
  const sp = S.sphere([0, 0, 0], 25), msph = meshField(sp.f, S.bbPad(sp.bb, 4), 48), ssg = segment(msph); assert.equal(ssg.regions.length, 1); assert.ok(!ssg.regions[0].planar);
  const found = matchRegion(seg, ref); assert.equal(found.region.id, top.id); assert.equal(matchRegion(segment(meshField(S.sphere([300, 0, 0], 20).f, [280, -20, -20, 320, 20, 20], 30)), ref), null);
});

test('push and pull a face in any direction changes the volume exactly as a sweep should', () => {
  const bx = S.box([0, 0, 0], [40, 30, 20]), m = meshField(bx.f, S.bbPad(bx.bb, 4), 60), seg = segment(m), top = seg.regions.find((r) => r.normal[2] > 0.99), fr = planeFrame(top);
  const info = faceRef(m, seg, top.id, fr), V0 = 40 * 30 * 20; info.loops2 = refineLoops(bx.f, fr, info.loops2, m.h);
  const pull = (hgt, dir, taper) => S.combine(bx, S.prismNode(fr, info.loops2, dir, hgt >= 0 ? -m.h * 1.5 : hgt, hgt >= 0 ? hgt : m.h * 1.5, { taper }), hgt >= 0 ? 'add' : 'sub');
  const volOf = (n) => { const b = S.bbPad(n.bb, 6), mm = meshField(n.f, b, 72); return { v: meshVolume(mm), st: meshStats(toTris(mm), 1e-5) }; };
  let r = volOf(pull(12, [0, 0, 1])); close(r.v, V0 + 1200 * 12, V0 * 0.03, 'pull out 12'); assert.ok(r.st.watertight);
  r = volOf(pull(-8, [0, 0, 1])); close(r.v, V0 - 1200 * 8, V0 * 0.03, 'push in 8'); assert.ok(r.st.watertight);
  r = volOf(pull(12, [1, 0, 1])); close(r.v, V0 + 1200 * 12, V0 * 0.04, 'pull along a slanted direction keeps volume area x height');
  const [mn, mx] = meshBounds(meshField(pull(12, [1, 0, 1]).f, S.bbPad(S.combine(bx, S.prismNode(fr, info.loops2, [1, 0, 1], 0, 12), 'add').bb, 6), 72)); assert.ok(mx[0] > 20 + 8, 'slanted pull leans over to +x: ' + mx[0]);
  r = volOf(pull(12, [0, 0, 1], 15)); assert.ok(r.v < V0 + 1200 * 12 && r.v > V0, 'draft angle reduces the pulled volume');
  // soft pull on a sphere: surface moves out along +x near the centre of the patch
  const sp = S.sphere([0, 0, 0], 25), pulled = S.softPullNode(sp, [25, 0, 0], 12, [1, 0, 0], 8, 0.5), mp = meshField(pulled.f, S.bbPad(pulled.bb, 4), 64), [pmn, pmx] = meshBounds(mp);
  close(pmx[0], 33, 1.2, 'bulged to 33'); close(pmn[0], -25, 1.0, 'far side untouched'); assert.ok(meshStats(toTris(mp), 1e-5).watertight);
});

test('warps and patterns', () => {
  const E = [], rect = S.extrudeNode(WORLD.xy, [resolveSketch({ type: 'rect', w: 30, h: 30 }, {}, E).loop], [0, 0, 1], 80);
  const tw = S.warpNode(rect, WORLD.xy, 'twist', 90 / 100), m = meshField(tw.f, S.bbPad(tw.bb, 4), 64); assert.ok(meshStats(toTris(m), 1e-5).watertight); close(meshVolume(m), 900 * 80, 900 * 80 * 0.04, 'twisting a square keeps its volume');
  const tp = S.warpNode(rect, WORLD.xy, 'taper', -0.004), vt = meshVolume(meshField(tp.f, S.bbPad(tp.bb, 6), 64)); assert.ok(vt < 900 * 80 && vt > 900 * 80 * 0.6, 'taper shrinks upwards');
  const pol = S.polarNode(S.sphere([30, 0, 0], 8), WORLD.xy, 6), mpol = meshField(pol.f, S.bbPad(pol.bb, 4), 60); assert.ok(meshStats(toTris(mpol), 1e-5).tris > 0); close(meshVolume(mpol), 6 * 4 / 3 * Math.PI * 512, 6 * 4 / 3 * Math.PI * 512 * 0.06, 'six spheres');
  const mir = S.mirrorNode(S.sphere([20, 0, 0], 8), WORLD.yz), vm = meshVolume(meshField(mir.f, S.bbPad(mir.bb, 4), 56)); close(vm, 2 * 4 / 3 * Math.PI * 512, 2 * 4 / 3 * Math.PI * 512 * 0.06);
  const lin = S.linearNode(S.sphere([0, 0, 0], 6), [20, 0, 0], 4), vl = meshVolume(meshField(lin.f, S.bbPad(lin.bb, 4), 72)); close(vl, 4 * 4 / 3 * Math.PI * 216, 4 * 4 / 3 * Math.PI * 216 * 0.07);
  const rip = S.warpNode(S.sphere([0, 0, 0], 20), WORLD.xy, 'ripple', 2, 10); assert.ok(rip.f(20, 0, 2.5) !== S.sphere([0, 0, 0], 20).f(20, 0, 2.5));
});
