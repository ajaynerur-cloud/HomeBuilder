import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLength, formatLength } from '../src/studio/core/units.js';
import { evaluate, resolveParams, num } from '../src/studio/core/params.js';
import { Store } from '../src/studio/core/store.js';
import * as G from '../src/studio/model/geometry.js';

test('units parse and format', () => {
  assert.equal(parseLength("12'6\""), 12.5);
  assert.equal(parseLength("12'-6\""), 12.5);
  assert.equal(parseLength('12.5'), 12.5);
  assert.ok(Math.abs(parseLength('230mm') - 0.7546) < 1e-3);
  assert.ok(Math.abs(parseLength('3.048m') - 10) < 1e-6);
  assert.equal(parseLength("-3'"), -3);
  assert.ok(isNaN(parseLength('abc')));
  assert.equal(formatLength(12.5), '12′-6″');
  assert.equal(formatLength(0.75), '0′-9″');
  assert.equal(formatLength(10, 'mm'), '3048 mm');
});

test('expressions and parameters', () => {
  assert.equal(evaluate('2+3*4'), 14);
  assert.equal(evaluate('2^3^2'), 512);
  assert.equal(evaluate('-(1+2)*3'), -9);
  assert.equal(evaluate('max(1,min(5,3))+round(2.6)'), 6);
  assert.ok(Math.abs(evaluate('230mm') - 0.7546) < 1e-3);
  assert.equal(evaluate('if(2>1,10,20)'), 10);
  assert.equal(evaluate('w/2', { w: 9 }), 4.5);
  assert.throws(() => evaluate('foo+1'));
  assert.throws(() => evaluate('1+'));
  assert.throws(() => evaluate('constructor'));
  const r = resolveParams([{ name: 'a', v: '=b*2' }, { name: 'b', v: 3 }, { name: 'c', v: '=a+b' }, { name: 'x', v: '=y' }, { name: 'y', v: '=x' }]);
  assert.equal(r.values.a, 6); assert.equal(r.values.c, 9);
  assert.ok(r.errors.x && r.errors.y);
  assert.equal(num('=a*2', { a: 4 }, 0), 8);
  assert.equal(num(undefined, {}, 7), 7);
});

test('store undo redo and coalesce', () => {
  const s = new Store({ nextId: 1, walls: [] });
  s.transact('add', (p) => p.walls.push({ id: s.nid('w') }));
  s.transact('add', (p) => p.walls.push({ id: s.nid('w') }));
  assert.equal(s.project.walls.length, 2);
  s.undo(); assert.equal(s.project.walls.length, 1);
  s.redo(); assert.equal(s.project.walls.length, 2);
  s.select(['w1', 'w2']); s.transact('del', (p) => { p.walls = p.walls.filter((w) => w.id !== 'w1'); });
  assert.deepEqual(s.selection, ['w2']);
  s.transact('t', (p) => { p.walls[0].t = 1; }, { coalesce: 'k' });
  s.transact('t', (p) => { p.walls[0].t = 2; }, { coalesce: 'k' });
  const n = s.undoStack.length; s.undo();
  assert.equal(s.undoStack.length, n - 1); assert.equal(s.project.walls[0].t, undefined);
});

test('geometry basics', () => {
  assert.equal(G.ringArea([[0, 0], [2, 0], [2, 3], [0, 3]]), 6);
  assert.ok(G.pointInRing([1, 1], [[0, 0], [2, 0], [2, 3], [0, 3]]));
  const x = G.segIntersect([0, 0], [2, 2], [0, 2], [2, 0]); assert.deepEqual(x.p.map((v) => Math.round(v)), [1, 1]);
  assert.equal(G.segIntersect([0, 0], [1, 0], [0, 1], [1, 1]), null);
  const u = G.mpUnion([G.polyMP([[0, 0], [2, 0], [2, 2], [0, 2]]), G.polyMP([[1, 0], [3, 0], [3, 2], [1, 2]])]);
  assert.equal(G.mpArea(u), 6);
  const d = G.mpDiff(G.polyMP([[0, 0], [4, 0], [4, 4], [0, 4]]), G.polyMP([[1, 1], [2, 1], [2, 2], [1, 2]]));
  assert.equal(G.mpArea(d), 15);
});

test('extrusions are closed solids with positive volume', () => {
  const t = []; G.addBox(t, 0, 0, 0, 2, 3, 4);
  let s = G.meshStats(t); assert.ok(s.watertight); assert.ok(Math.abs(s.volume - 24) < 1e-9);
  const p = []; G.addPrism(p, [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]], 0, 3);   // L shape
  s = G.meshStats(p); assert.ok(s.watertight, JSON.stringify(s)); assert.ok(Math.abs(s.volume - 36) < 1e-9);
  const hole = G.mpDiff(G.polyMP([[0, 0], [6, 0], [6, 6], [0, 6]]), G.polyMP([[2, 2], [4, 2], [4, 4], [2, 4]]));
  const b = []; G.extrudeMP(b, hole, 0, 2); s = G.meshStats(b);
  assert.ok(s.watertight, JSON.stringify(s)); assert.ok(Math.abs(s.volume - 64) < 1e-6);
  const bands = []; const lo = G.mpDiff(G.polyMP([[0, 0], [6, 0], [6, 1], [0, 1]]), []);
  const mid = G.mpDiff(lo, G.polyMP([[2, -1], [3, -1], [3, 2], [2, 2]]));
  const e = []; G.extrudeBands(e, [{ mp: lo, z0: 0, z1: 1 }, { mp: mid, z0: 1, z1: 2 }, { mp: lo, z0: 2, z1: 3 }]);
  s = G.meshStats(e); assert.ok(Math.abs(s.volume - (6 * 3 - 1 * 1)) < 1e-6, String(s.volume));
});
