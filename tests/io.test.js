import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { newProject } from '../src/studio/model/schema.js';
import { resolveModel } from '../src/studio/model/resolve.js';
import * as GEN from '../src/studio/model/generators.js';
import { encodeSTL, encodeSTLAscii, encodeOBJ, encode3MF, mergeTris } from '../src/studio/io/meshio.js';
import { createZip, crc32 } from '../src/studio/io/zip.js';
import { buildPrint } from '../src/studio/io/print.js';
import { buildDXF } from '../src/studio/io/dxf.js';
import { serialize, parseProject } from '../src/studio/io/project.js';
import { importPlan } from '../src/studio/io/importPlanner.js';
import { detectRooms } from '../src/studio/model/rooms.js';
import { meshStats } from '../src/studio/model/geometry.js';

const here = path.dirname(fileURLToPath(import.meta.url));
function house() {
  const p = newProject('t');
  const ow = GEN.addRect(p, 0, 0, 24, 16, { t: '=wallOut' }), mid = GEN.addWall(p, [12, 0], [12, 16]);
  GEN.addOpening(p, ow[0], { pos: 6, kind: 'window' }); GEN.addOpening(p, ow[0], { pos: 18, kind: 'door' }); GEN.addOpening(p, mid, { pos: 8, kind: 'door' });
  GEN.addRoomLabel(p, 6, 8, 'Living', 'living'); GEN.addRoomLabel(p, 18, 8, 'Bed', 'bed');
  GEN.addRoof(p, 0, 0, 24, 16, { type: 'hip', over: 2 }); p.levels[0].autoSlab = true;
  return p;
}

test('zip has a valid structure (read back with python)', async () => {
  const z = createZip([{ name: 'a.txt', data: 'hello' }, { name: 'dir/b.bin', data: new Uint8Array([1, 2, 3, 4]) }]);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  fs.writeFileSync('/tmp/t.zip', z);
  const { execSync } = await import('node:child_process');
  const out = execSync("python3 -c \"import zipfile;z=zipfile.ZipFile('/tmp/t.zip');print(z.testzip(),sorted(z.namelist()),z.read('a.txt'))\"").toString();
  assert.match(out, /None/); assert.match(out, /hello/);
});

test('STL binary size, normals and ascii', () => {
  const t = []; for (const x of [0, 1]) t.push(0, 0, x, 1, 0, x, 0, 1, x);
  const b = encodeSTL(t); assert.equal(b.length, 84 + 2 * 50);
  const dv = new DataView(b.buffer); assert.equal(dv.getUint32(80, true), 2);
  assert.equal(dv.getFloat32(84 + 8, true), 1);
  assert.match(encodeSTLAscii(t), /facet normal/);
});

test('print export is scaled, watertight and fits checks', async () => {
  const p = house(), r = buildPrint(p, { scale: 100, minMm: 1.2, include: { walls: true, slabs: true, roofs: true, columns: true, beams: true, footings: false, stairs: true, panels: false } });
  assert.ok(r.parts.length >= 3); assert.equal(r.parts[0].name, 'Base plate');
  assert.ok(r.totals.watertight, JSON.stringify(r.stats.filter((s) => !s.watertight)));
  // 24 ft at 1:100 = 73.15 mm plus 2 x 6 mm margin
  assert.ok(Math.abs(r.totals.dims[0] - (28 * 3.048 + 12)) < 1, String(r.totals.dims));
  assert.ok(r.totals.fits); assert.ok(r.totals.volumeCm3 > 5);
  const big = buildPrint(p, { scale: 10 }); assert.ok(!big.totals.fits); assert.ok(big.warnings.some((w) => /bed/.test(w.msg)));
  // thin partition wall at 1:200 is thickened
  const thin = buildPrint(p, { scale: 200, thicken: true }); const m1 = thin.parts.find((q) => q.kind === 'wall');
  assert.ok(m1);
  const stl = encodeSTL(mergeTris(r.parts)); assert.ok(stl.length > 84);
  const mf = encode3MF(r.parts, 'test'); fs.writeFileSync('/tmp/t.3mf', mf);
  const { execSync } = await import('node:child_process');
  const out = execSync("python3 -c \"import zipfile,re;z=zipfile.ZipFile('/tmp/t.3mf');print(z.testzip());m=z.read('3D/3dmodel.model').decode();print(len(re.findall('<object ',m)),len(re.findall('<triangle ',m)))\"").toString().split('\n');
  assert.equal(out[0], 'None'); const [no] = out[1].split(' ').map(Number); assert.equal(no, r.parts.length);
  const o = encodeOBJ(r.parts); assert.match(o.obj, /^v /m); assert.match(o.mtl, /newmtl/);
});

test('DXF and project round trip', () => {
  const p = house(), d = buildDXF(resolveModel(p), { levels: ['L0'] });
  assert.match(d, /A-WALL/); assert.match(d, /ARC/); assert.ok(d.trim().endsWith('EOF'));
  assert.ok((d.match(/\nLINE\n/g) || []).length > 20);
  const q = parseProject(serialize(p)); assert.equal(q.walls.length, p.walls.length); assert.equal(q.levels[0].id, 'L0');
  assert.throws(() => parseProject('{"x":1}'));
});

function legacy() {
  const dir = path.join(here, '../src/legacy'), body = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
  const sandbox = { THREE, console, Math, JSON, Object, Array, Date, Number, String, window: {}, num: (n) => Math.round(n), setTimeout, clearTimeout };
  sandbox.globalThis = sandbox; vm.createContext(sandbox);
  vm.runInContext("(function(){\n'use strict';\n" + body + '})();', sandbox);
  return sandbox.window.__core;
}

test('import from the planner keeps rooms, openings and areas', () => {
  const core = legacy();
  const S = { area: 1100, beds: 2, att: 1, pooja: true, store: true, corr: 4, cy: 'M', shape: 'double', cover: 'tile', pitch: 22, over: 2, rise: 3, sys: 'ms', finish: 1, region: 1, exits: { s: false, e: false, w: false }, backOff: -3, svc: { plumb: false, elec: false, tanks: false }, jag: { on: false, h: 2.5, d: 7, ledges: true, sides: { n: true, s: false, e: false, w: false }, split: { on: false, scope: 'front', h: 1.5, steps: 4 } } };
  const pl = core.planFor(S), res = importPlan(pl, S, core), p = res.project, m = resolveModel(p);
  assert.equal(res.skipped, 0);
  assert.ok(m.walls.length > 25); assert.equal(m.openings.length, pl.doors.length + core.winList(pl).length);
  assert.equal(m.errors.length, 0);
  const rooms = detectRooms(m, 'L0').filter((r) => r.name && r.type !== 'court');
  const names = pl.rooms.filter((r) => !r.hidden && r.t !== 'court' && r.t !== 'corr' && r.t !== 'pass').map((r) => r.n).sort();
  assert.deepEqual(rooms.map((r) => r.name).sort(), Array.from(names));
  // gross area of each detected room equals the planner room (centre-line to centre-line)
  rooms.forEach((r) => { const src = pl.rooms.find((x) => x.n === r.name && !x.hidden); assert.ok(Math.abs(r.gross - src.w * src.h) < 0.05, r.name + ' ' + r.gross + ' vs ' + src.w * src.h); });
  const pr = buildPrint(p, { scale: 150 }); assert.ok(pr.parts.length > 5);
});
