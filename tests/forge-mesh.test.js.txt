import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, valueOf } from '../src/studio/core/params.js';
import * as M from '../src/studio/forge/mesh.js';

function box(w = 10, d = 10, h = 10) {
  const m = new M.Mesh(), c = [[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0], [0, 0, h], [w, 0, h], [w, d, h], [0, d, h]].map((p, i) => m.addV(p, 'b' + i));
  [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]].forEach((f) => m.addF(f.map((i) => c[i])));
  return M.fixOrientation(m);
}

test('expressions can use millimetres as the base unit', () => {
  assert.equal(evaluate('30mm+2cm', {}, 'mm'), 50); assert.equal(evaluate('1in', {}, 'mm'), 25.4); assert.equal(valueOf('12', {}, 'mm'), 12); assert.equal(valueOf('=a*2', { a: 4 }, 'mm'), 8);
  assert.ok(Math.abs(evaluate('30mm', {}, 'ft') - 30 / 304.8) < 1e-9);       // Studio is unchanged
});

test('box: closed, volume, normals out, edges', () => {
  const m = box(); const s = M.stats(m); assert.ok(s.watertight); assert.equal(Math.round(s.volume), 1000); assert.ok(M.isClosed(m));
  assert.deepEqual(M.faceNormal(m, 1), [0, 0, 1]); assert.equal(M.faceArea(m, 0), 100); assert.equal(M.edgeMap(m).size, 12);
});

test('push/pull a face: extrude then tidy gives a clean box again', () => {
  const m = box(); const top = 1; const r = M.extrudeFaces(m, [top], [0, 0, 5], 'x1');
  assert.equal(m.f.length, 10); assert.equal(m.v.length, 12 - 4 + 4);        // old top verts become the wall base
  let s = M.stats(m); assert.ok(s.watertight, JSON.stringify(s)); assert.equal(Math.round(s.volume), 1500);
  M.cleanup(m); assert.equal(m.f.length, 6, 'faces after tidy: ' + m.f.length); s = M.stats(m); assert.ok(s.watertight); assert.equal(Math.round(s.volume), 1500);
  // pull inwards (push)
  const m2 = box(); M.extrudeFaces(m2, [1], [0, 0, -4], 'x2'); M.cleanup(m2); assert.equal(Math.round(M.stats(m2).volume), 600); assert.ok(M.stats(m2).watertight);
});

test('inset then pull makes a raised block; delete makes a hole', () => {
  const m = box(20, 20, 10); const r = M.insetFace(m, 1, 4, 'i1'); assert.equal(m.f.length, 10); assert.ok(M.stats(m).watertight);
  M.extrudeFaces(m, r.faces, [0, 0, 6], 'e1'); assert.ok(M.stats(m).watertight); assert.equal(Math.round(M.stats(m).volume), Math.round(20 * 20 * 10 + 12 * 12 * 6));
  const k = box(); M.deleteFaces(k, [0]); assert.equal(M.isClosed(k), false); assert.equal(M.stats(k).openEdges, 4);
});

test('Catmull-Clark smooths a cube into a closed, smaller, rounder shape', () => {
  const m = box(); const s1 = M.subdivide(m); assert.equal(s1.f.length, 24); assert.ok(M.stats(s1).watertight);
  const s2 = M.subdivide(s1); assert.equal(s2.f.length, 96); assert.ok(M.isClosed(s2)); assert.ok(M.stats(s2).volume < 500 && M.stats(s2).volume > 200);
});

test('edge loops and strips on a quad grid', () => {
  const m = M.subdivide(M.subdivide(box()));      // all quads, every interior vertex has 4 or 3 faces
  const E = M.edgeMap(m); let loop = null;
  for (const e of E.values()) { const r = M.edgeLoop(m, e.a, e.b); if (r.closed && r.verts.length >= 8) { loop = r; break; } }
  assert.ok(loop, 'found a closed loop'); const st = M.faceStrip(m, 0, m.f[0].v[0], m.f[0].v[1]); assert.ok(st.faces.length >= 4);
});
