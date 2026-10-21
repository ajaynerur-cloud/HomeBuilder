import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject } from '../src/studio/model/schema.js';
import { resolveModel } from '../src/studio/model/resolve.js';
import * as GEN from '../src/studio/model/generators.js';
import { footprints } from '../src/studio/model/walls.js';
import { detectRooms } from '../src/studio/model/rooms.js';
import * as S from '../src/studio/model/solids.js';
import { meshStats, ringArea, mpArea, polyMP, mpUnion } from '../src/studio/model/geometry.js';

function house() {
  const p = newProject('t');
  const ow = GEN.addRect(p, 0, 0, 20, 16, { t: '=wallOut' });          // outer
  const mid = GEN.addWall(p, [10, 0], [10, 16]);                       // partition
  GEN.addOpening(p, ow[0], { pos: 5, kind: 'window' });
  GEN.addOpening(p, ow[0], { pos: 15, kind: 'door' });
  GEN.addOpening(p, mid, { pos: 8, kind: 'door' });
  GEN.addRoomLabel(p, 5, 8, 'Living', 'living'); GEN.addRoomLabel(p, 15, 8, 'Bed', 'bed');
  return p;
}

test('model resolves parameters and expressions', () => {
  const p = house(); p.params.find((x) => x.name === 'storey').v = '=9+1.5';
  const m = resolveModel(p);
  assert.equal(m.walls.length, 5); assert.equal(m.walls[0].h, 10.5); assert.equal(m.walls[0].t, 0.75);
  assert.equal(m.errors.length, 0);
  p.walls[0].t = '=nope*2'; assert.ok(resolveModel(p).errors.length > 0);
});

test('corner joints are mitred and the wall ring closes', () => {
  const m = resolveModel(house()), fp = footprints(m.walls.filter((w) => w.t === 0.75));
  // outer perimeter area = (20+0.75)*(16+0.75) - (20-0.75)*(16-0.75)
  const mp = mpUnion([...fp.values()].map((r) => polyMP(r)));
  const exp = 20.75 * 16.75 - 19.25 * 15.25;
  assert.ok(Math.abs(mpArea(mp) - exp) < 1e-6, mpArea(mp) + ' vs ' + exp);
});

test('union wall solid is watertight with correct volume', () => {
  const m = resolveModel(house()), t = S.wallSolidsUnion(m, 'L0'), s = meshStats(t);
  assert.ok(s.watertight, JSON.stringify(s));
  const tm = 0.375, fpOuter = 20.75 * 16.75 - 19.25 * 15.25;
  // partition runs between the inner faces of the long walls: length 16-0.75, thickness 0.375
  const part = (16 - 0.75) * 0.375;
  const walls = (fpOuter + part) * 10;
  const open = (4 * 3.5 * 0.75) + (3 * 7 * 0.75) + (3 * 7 * 0.375);
  assert.ok(Math.abs(s.volume - (walls - open)) < 0.05, s.volume + ' vs ' + (walls - open));
});

test('rooms are found from walls and clear area is net of walls', () => {
  const m = resolveModel(house()), rooms = detectRooms(m, 'L0');
  assert.equal(rooms.length, 2);
  const names = rooms.map((r) => r.name).sort(); assert.deepEqual(names, ['Bed', 'Living']);
  const living = rooms.find((r) => r.name === 'Living');
  // clear: from 0.375 to 10-0.1875 in x, 0.375 to 15.625 in y
  assert.ok(Math.abs(living.net - (9.4375) * 15.25) < 1e-6, String(living.net));
  assert.ok(living.gross > living.net);
});

test('nested loops make a courtyard hole', () => {
  const p = newProject('c'); GEN.addRect(p, 0, 0, 30, 30, { t: 0.75 }); GEN.addRect(p, 10, 10, 20, 20, { t: 0.5 });
  const rooms = detectRooms(resolveModel(p), 'L0').sort((a, b) => b.gross - a.gross);
  assert.equal(rooms.length, 2);
  assert.ok(Math.abs(rooms[0].gross - (900 - 100)) < 1e-6, String(rooms[0].gross));
});

test('column, beam, footing, stair, slab, roofs are closed solids', () => {
  const m0 = resolveModel(house());
  const p = newProject('x'); GEN.addColumn(p, 0, 0); GEN.addColumn(p, 3, 3, { shape: 'round' }); GEN.addBeam(p, [0, 0], [10, 0]); GEN.addFooting(p, 0, 0);
  GEN.addSlab(p, [[0, 0], [10, 0], [10, 8], [0, 8]], { holes: [[[3, 3], [5, 3], [5, 5], [3, 5]]] }); GEN.addStair(p, 0, 0, 0, { rise: 10 });
  ['hip', 'gable', 'shed', 'flat'].forEach((ty) => GEN.addRoof(p, 0, 0, 20, 12, { type: ty }));
  GEN.addRoof(p, 0, 0, 12, 12, { type: 'hip' }); GEN.addRoof(p, 0, 0, 12, 20, { type: 'gable', ridge: 'y' }); GEN.addRoof(p, 0, 0, 12, 12, { type: 'shed', dir: 'e' });
  const m = resolveModel(p);
  const parts = S.buildParts(m, { union: true });
  assert.equal(parts.length, 2 + 1 + 1 + 1 + 1 + 7);
  parts.forEach((q) => { const s = meshStats(q.tris); assert.ok(s.watertight, q.name + ' ' + JSON.stringify(s)); assert.ok(s.volume > 0, q.name + ' volume ' + s.volume); });
  const hip = parts.find((q) => q.name === 'Roof r' + (m.roofs[0].id.slice(1))), s = meshStats(hip.tris);
  assert.ok(s.volume > 100);
});

test('per-wall solids for the viewer', () => {
  const m = resolveModel(house()), parts = S.buildParts(m, { union: false, panels: true });
  assert.equal(parts.filter((q) => q.kind === 'wall').length, 5);
  assert.equal(parts.filter((q) => q.kind === 'panel').length, 3);
  parts.filter((q) => q.kind === 'wall').forEach((q) => assert.ok(meshStats(q.tris).watertight, q.name));
});
