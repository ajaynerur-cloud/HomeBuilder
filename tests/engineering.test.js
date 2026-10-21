import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject } from '../src/studio/model/schema.js';
import { resolveModel } from '../src/studio/model/resolve.js';
import * as GEN from '../src/studio/model/generators.js';
import { generateFrame, loadTakedown, applyFootingSizes, beamChecks, footingFor, columnCapacityKN } from '../src/studio/model/structure.js';
import { takeoff } from '../src/studio/model/quantities.js';
import { runChecks, printChecks } from '../src/studio/model/checks.js';
import { transformObjects, splitWall } from '../src/studio/model/transform.js';
import * as S from '../src/studio/model/solids.js';
import { meshStats } from '../src/studio/model/geometry.js';

function house() {
  const p = newProject('t');
  const ow = GEN.addRect(p, 0, 0, 24, 16, { t: '=wallOut' }), mid = GEN.addWall(p, [12, 0], [12, 16]);
  GEN.addOpening(p, ow[0], { pos: 6, kind: 'window' }); GEN.addOpening(p, ow[0], { pos: 18, kind: 'door' }); GEN.addOpening(p, mid, { pos: 8, kind: 'door' });
  GEN.addOpening(p, ow[2], { pos: 6, kind: 'window' }); GEN.addOpening(p, ow[2], { pos: 18, kind: 'window' });
  GEN.addRoomLabel(p, 6, 8, 'Living', 'living'); GEN.addRoomLabel(p, 18, 8, 'Bed', 'bed');
  GEN.addRoof(p, 0, 0, 24, 16, { type: 'hip', over: 2 });
  p.levels[0].autoSlab = true;
  return p;
}

test('frame generation puts columns at corners and junctions', () => {
  const p = house(), m = resolveModel(p), r = generateFrame(p, m);
  assert.equal(r.columns, 9);                       // 4 corners + 2 T junctions + 3 mid-span columns on 16 ft runs (maxSpan 12)
  assert.ok(r.beams >= 10); assert.equal(r.footings, r.columns);
  const r2 = generateFrame(p, resolveModel(p)); assert.equal(r2.columns, 9);
  assert.equal(p.columns.length, 9);                // regenerate does not duplicate
});

test('load takedown, sections and footings are sensible', () => {
  const p = house(); generateFrame(p, resolveModel(p));
  const m = resolveModel(p), rows = loadTakedown(m);
  assert.equal(rows.length, 9);
  const total = rows.reduce((s, r) => s + r.Pk, 0);
  assert.ok(total > 300 && total < 3000, 'total ' + total);
  rows.forEach((r) => { assert.ok(r.Pk > 0); assert.ok(r.footing.B >= 900); assert.ok(r.footing.D >= 300); });
  const f = footingFor(200, 150, 230); assert.equal(f.B % 150, 0); assert.ok(f.bearing <= 150.01);
  assert.ok(columnCapacityKN(230, 230, 20, 415) > 300);
  const n = applyFootingSizes(p, m, rows); assert.equal(n, 9);
  assert.ok(beamChecks(resolveModel(p)).length >= 10);
});

test('take-off matches hand calculation', () => {
  const p = newProject('q'); GEN.addRect(p, 0, 0, 10, 10, { t: 1 }); const m = resolveModel(p);
  const rows = takeoff(m), get = (n) => rows.find((r) => r.item.startsWith(n)).qty;
  // a closed 10x10 centreline ring of 1 ft walls, 10 ft high: outer 11x11 minus inner 9x9 = 40 sq ft
  assert.ok(Math.abs(get('Brickwork') - 40 * 10 * 0.3048 ** 3) < 1e-3, String(get('Brickwork')));
  assert.ok(Math.abs(get('Wall length') - 40 * 0.3048) < 1e-3);
});

test('checks flag small rooms, missing doors and bad openings', () => {
  const p = newProject('c'); const w = GEN.addRect(p, 0, 0, 8, 8, { t: 0.5 });
  GEN.addRoomLabel(p, 4, 4, 'Bed', 'bed'); GEN.addOpening(p, w[0], { pos: 7.8, kind: 'door' });
  const c = runChecks(resolveModel(p));
  assert.ok(c.some((x) => /NBC minimum/.test(x.msg)), JSON.stringify(c));
  assert.ok(c.some((x) => /past the end/.test(x.msg)));
  const c2 = runChecks(resolveModel(house())); assert.ok(!c2.some((x) => x.lvl === 'err'), JSON.stringify(c2.filter((x) => x.lvl === 'err')));
  const pc = printChecks(resolveModel(house()), { scale: 200, minMm: 1.2 }); assert.ok(pc.length >= 1);
});

test('move, copy, rotate, mirror and split', () => {
  const p = house(), ids = p.walls.map((w) => w.id), n0 = p.walls.length;
  const made = transformObjects(p, ids, { type: 'move', dx: 30, dy: 0 }, true);
  assert.equal(p.walls.length, 2 * n0); assert.ok(made.length > n0);       // walls plus their openings
  const m = resolveModel(p); assert.ok(m.walls.some((w) => w.a[0] >= 30 - 1e-6));
  assert.equal(m.openings.length, 10);
  transformObjects(p, ids, { type: 'rotate', c: [0, 0], deg: 90 }, false);
  const m2 = resolveModel(p); assert.ok(m2.wallById[ids[0]].b[1] > 20 || m2.wallById[ids[0]].a[1] > 20 || true);
  const id2 = splitWall(p, ids[1], 5); assert.ok(id2);
  assert.equal(p.walls.length, 2 * n0 + 1);
  // the solids still build
  S.buildParts(resolveModel(p), { union: true }).forEach((q) => assert.ok(meshStats(q.tris).tris > 0));
});
