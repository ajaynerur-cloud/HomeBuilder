import test from 'node:test';
import assert from 'node:assert/strict';
import { preset, PRESETS } from '../src/field/presets.js';
import { evaluate, buildMesh, newField, pickFace, FACE, nid, captureVariant, applyValues, blendValues } from '../src/field/model.js';
import { meshVolume, meshBounds, toTris } from '../src/field/mesher.js';
import { meshStats } from '../src/studio/model/geometry.js';
import { fieldPrint } from '../src/field/print.js';
import { FieldStore, serializeField, parseField } from '../src/field/store.js';
import { encodeSTL, encode3MF } from '../src/studio/io/meshio.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' got ' + a + ' expected ' + b + ' +-' + tol);
const closed = (m) => { const s = meshStats(toTris(m), 1e-4); assert.ok(s.watertight, JSON.stringify(s)); return s; };

test('every preset evaluates without errors and meshes to a closed solid', () => {
  PRESETS.forEach(([k]) => {
    const p = preset(k), { ev, mesh } = buildMesh(p, 64);
    assert.deepEqual(ev.errors, [], k + ': ' + ev.errors.join('; ')); assert.ok(mesh, k); closed(mesh);
    assert.ok(ev.steps.every((s) => s.ok), k);
  });
});

test('revolved vase has the wall thickness and height it was given', () => {
  const p = preset('revolved'), { ev, mesh } = buildMesh(p, 80), [mn, mx] = meshBounds(mesh);
  close(mx[2] - mn[2], 180, 1.5, 'height'); close(mx[0], 62, 2.5, 'belly radius');
  const f = ev.body.f, z = 180 * 0.38; let rin = null, rout = null;
  for (let r = 0; r < 90; r += 0.02) { const a = f(r, 0, z), b = f(r + 0.02, 0, z); if (a >= 0 && b < 0 && rin === null) rin = r + 0.01; if (a < 0 && b >= 0) rout = r + 0.01; }
  close(rout - rin, 3.5, 0.9, 'wall near the belly'); assert.ok(f(0, 0, 100) > 0, 'hollow inside'); assert.ok(f(1, 0, 2) < 0, 'solid floor'); assert.ok(f(0, 0, 175) > 0, 'open top');
});

test('equation vase has lobes and twist', () => {
  const p = preset('lobed'), { ev, mesh } = buildMesh(p, 72), [mn, mx] = meshBounds(mesh);
  close(mx[2] - mn[2], 200, 2, 'height');
  const rAt = (a, z) => { for (let r = 80; r > 0; r -= 0.05) if (ev.body.f(r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180), z) < 0) return r; return 0; };
  let hi = 0, lo = 1e9; for (let a = 0; a < 360; a += 4) { const r = rAt(a, 100); hi = Math.max(hi, r); lo = Math.min(lo, r); } assert.ok(hi - lo > 6, 'lobe depth ' + (hi - lo));
  const p0 = JSON.parse(JSON.stringify(p)); p0.params.find((x) => x.name === 'twist').v = 0; const e0 = evaluate(p0);
  const peakAngle = (e, z) => { let ba = 0, br = 0; for (let a = -40; a <= 40; a += 1) { const r = (() => { for (let r = 80; r > 0; r -= 0.1) if (e.body.f(r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180), z) < 0) return r; return 0; })(); if (r > br) { br = r; ba = a; } } return ba; };
  assert.notEqual(peakAngle(e0, 150), peakAngle(ev, 150), 'twist turns the lobes with height');
});

test('lofted vase blends a circle, a squircle and an ellipse, and is open at the top', () => {
  const p = preset('lofted'), { ev, mesh } = buildMesh(p, 72); closed(mesh);
  const f = ev.body.f; assert.ok(f(0, 0, 180 * 0.34) > 0 && f(0, 0, 1.5) < 0 && f(0, 0, 178) > 0, 'floor, hollow, open top');
  const widthAt = (z) => { let w = 0; for (let r = 0; r < 90; r += 0.1) if (f(r, 0, z) < 0) w = r; return w; };
  assert.ok(widthAt(180 * 0.34) > widthAt(2) + 10, 'belly wider than base'); assert.ok(widthAt(180 * 0.7) < widthAt(180 * 0.34), 'neck narrower than belly');
  const diag = (z) => { let w = 0; for (let r = 0; r < 100; r += 0.1) if (f(r * Math.SQRT1_2, r * Math.SQRT1_2, z) < 0) w = r; return w; };
  assert.ok(diag(180 * 0.34) > widthAt(180 * 0.34) * 1.08, 'squircle belly is wider on the diagonal than on the axis');
});

test('a face reference follows the model when parameters change', () => {
  const p = preset('faceted'), top0 = p.features[1].open[0]; assert.ok(top0.c[2] > 150);
  let ev = evaluate(p); assert.deepEqual(ev.errors, []);
  assert.ok(ev.body.f(0, 0, 160) > 0, 'cavity is open at the top'); assert.ok(ev.body.f(0, 0, 3) < 0 || ev.body.f(0, 0, 2) < 0, 'floor present');
  p.params.find((x) => x.name === 'H').v = 230; ev = evaluate(p); assert.deepEqual(ev.errors, [], ev.errors.join(';'));
  assert.ok(ev.body.f(0, 0, 222) > 0, 'cavity still open at the new, taller top'); assert.ok(ev.body.f(0, 0, 3) < 0 || ev.body.f(0, 0, 2) < 0);
  const { mesh } = buildMesh(p, 64); closed(mesh); const [mn, mx] = meshBounds(mesh); close(mx[2] - mn[2], 230, 2.5);
});

test('push and pull as a feature: volume change, then the same feature after a parameter change', () => {
  const p = newField('box'); p.params.push({ name: 'W', v: 40 }, { name: 'D', v: 30 }, { name: 'T', v: 20 }, { name: 'push', v: 12 });
  p.sketches.push({ id: 'sk1', plane: 'pXY', name: 'Base', type: 'rect', w: '=W', h: '=D' });
  p.features.push({ id: 'ft1', type: 'extrude', name: 'Block', sketch: 'sk1', dir: 'normal', dist: '=T', op: 'add', enabled: true });
  const base = buildMesh(p, 72); const v0 = meshVolume(base.mesh); close(v0, 40 * 30 * 20, 40 * 30 * 20 * 0.03, 'block');
  const ref = pickFace(p, 1, FACE.top); p.features.push({ id: 'ft2', type: 'pull', name: 'Pull top', face: ref, dir: 'normal', dist: '=push', enabled: true });
  let r = buildMesh(p, 72); assert.deepEqual(r.ev.errors, [], r.ev.errors.join(';')); close(meshVolume(r.mesh), 40 * 30 * 32, 40 * 30 * 32 * 0.03, 'pulled 12'); closed(r.mesh);
  p.params.find((x) => x.name === 'push').v = -8; r = buildMesh(p, 72); close(meshVolume(r.mesh), 40 * 30 * 12, 40 * 30 * 12 * 0.04, 'pushed in 8'); closed(r.mesh);
  p.params.find((x) => x.name === 'push').v = 12; p.params.find((x) => x.name === 'W').v = 60; r = buildMesh(p, 72); assert.deepEqual(r.ev.errors, [], r.ev.errors.join(';'));
  close(meshVolume(r.mesh), 60 * 30 * 32, 60 * 30 * 32 * 0.04, 'face follows the wider block');
  // slanted direction with a vector
  const q = JSON.parse(JSON.stringify(p)); q.params.find((x) => x.name === 'W').v = 40; Object.assign(q.features[1], { dir: 'vector', vec: [1, 0, 1] }); q.features[1].dist = '=12*sqrt(2)';
  const s = buildMesh(q, 72); close(meshVolume(s.mesh), 40 * 30 * 32, 40 * 30 * 32 * 0.05, 'slanted pull'); assert.ok(meshBounds(s.mesh)[1][0] > 20 + 8, 'leans over');
  // lost reference reports a clear error
  const bad = JSON.parse(JSON.stringify(p)); bad.features[1].face.c = [500, 500, 500]; const e = evaluate(bad); assert.ok(e.errors.some((m) => /no longer exists/.test(m)), e.errors.join(';'));
});

test('variants capture, apply and blend parameters', () => {
  const p = preset('revolved'), a = captureVariant(p, 'tall'); p.params.find((x) => x.name === 'H').v = 120; const b = captureVariant(p, 'short');
  assert.equal(a.values.H, 180); assert.equal(b.values.H, 120);
  const mid = blendValues(a.values, b.values, 0.5); assert.equal(mid.H, 150); applyValues(p, mid);
  const { mesh } = buildMesh(p, 56), [mn, mx] = meshBounds(mesh); close(mx[2] - mn[2], 150, 1.5);
});

test('print preparation scales to a height, reports checks and exports', () => {
  const p = preset('lofted'), { mesh } = buildMesh(p, 72), r = fieldPrint(p, mesh, { height: 120 });
  close(r.dims[2], 120, 0.01); assert.ok(r.stats.watertight); assert.ok(r.fits); assert.ok(r.volumeCm3 > 20 && r.weightG > 5);
  close(r.wallMm, 3 * 120 / 180, 0.01); const thin = fieldPrint(p, mesh, { height: 20, minWall: 1.2 }); assert.ok(thin.warnings.some((w) => /thinnest wall/.test(w.msg)), 'wall warning at a small size');
  const big = fieldPrint(p, mesh, { height: 400 }); assert.ok(!big.fits && big.warnings.some((w) => /bed/.test(w.msg)));
  assert.ok(r.overhang >= 0 && r.overhang <= 1);
  const stl = encodeSTL(r.tris); assert.equal(stl.length, 84 + 50 * (r.tris.length / 9)); const mf = encode3MF(r.parts, 'vase'); assert.ok(mf.length > 1000);
});

test('store: undo, redo, save and load', () => {
  const st = new FieldStore(newField('t')); st.transact('add', (p) => { p.params.push({ name: 'a', v: 1 }); }); st.transact('edit', (p) => { p.params[0].v = 2; }, { coalesce: 'x' }); st.transact('edit', (p) => { p.params[0].v = 3; }, { coalesce: 'x' });
  assert.equal(st.p.params[0].v, 3); st.undo(); assert.equal(st.p.params[0].v, 1); st.undo(); assert.equal(st.p.params.length, 0); st.redo(); st.redo(); assert.equal(st.p.params[0].v, 3);
  const q = parseField(serializeField(preset('lobed'))); assert.equal(q.features.length, 1); assert.throws(() => parseField('{"kind":"x"}'));
  assert.equal(nid({ nextId: 5 }, 'ft'), 'ft5');
});
