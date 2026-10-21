import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import * as THREE from 'three';
globalThis.THREE = THREE;
import { inflateRaw, readZip } from '../src/studio/io/inflate.js';
import { createZip } from '../src/studio/io/zip.js';
import { parseSkm, parseMaterialXml } from '../src/studio/io/skm.js';
import { newProject } from '../src/studio/model/schema.js';
import { resolveModel } from '../src/studio/model/resolve.js';
import * as GEN from '../src/studio/model/generators.js';
import { setFill, addMaterial, removeMaterial, resolveFill } from '../src/studio/model/materials.js';
import { buildParts } from '../src/studio/model/solids.js';
import { meshStats } from '../src/studio/model/geometry.js';
import { takeoff } from '../src/studio/model/quantities.js';
import { loadTakedown } from '../src/studio/model/structure.js';
import { moveLevel, addLevel, deleteLevel } from '../src/studio/model/levels.js';
import { toScreen, toWorld } from '../src/studio/view2d/render2d.js';
import { buildGroup, boxUVs, splitWallFaces, View3D } from '../src/studio/view3d/view3d.js';
import { sunVector } from '../src/studio/view3d/lighting.js';
import { Store } from '../src/studio/core/store.js';

const opts = { levels: 'all', active: 'L0', cats: { walls: true, slabs: true, roofs: true, structure: true, stairs: true, panels: true }, mode: 'shaded' };
function lShape() { const p = newProject('t'); GEN.addRect(p, 0, 0, 24, 16, { t: '=wallOut' }); GEN.addRect(p, 24, 0, 40, 8, { t: '=wallOut' }); return p; }

test('inflate matches zlib, and readZip reads stored and deflated entries', () => {
  const data = Buffer.from(Array.from({ length: 40000 }, (_, i) => (i * 7 + (i >> 5)) & 255).concat(Array(5000).fill(65)));
  for (const lvl of [0, 1, 6, 9]) assert.deepEqual(Buffer.from(inflateRaw(zlib.deflateRawSync(data, { level: lvl }))), data);
  assert.deepEqual(Buffer.from(inflateRaw(zlib.deflateRawSync(Buffer.from('hello hello hello'), { strategy: zlib.constants.Z_FIXED }))), Buffer.from('hello hello hello'));
  const z = readZip(createZip([{ name: 'a/b.txt', data: 'stored text' }, { name: 'c.bin', data: new Uint8Array([1, 2, 3]) }]));
  assert.equal(new TextDecoder().decode(z[0].data()), 'stored text'); assert.deepEqual(Array.from(z[1].data()), [1, 2, 3]);
  // a hand-built deflated entry
  const raw = zlib.deflateRawSync(data), name = Buffer.from('big.bin'), crc = 0, lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(raw.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(raw.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); void crc;
  const off = lh.length + name.length + raw.length, end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(ch.length + name.length, 12); end.writeUInt32LE(off, 16);
  const e = readZip(new Uint8Array(Buffer.concat([lh, name, raw, ch, name, end])))[0]; assert.deepEqual(Buffer.from(e.data()), data);
  assert.throws(() => readZip(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24])));
});

test('SketchUp material (.skm) parsing: colour, name, opacity, texture, size', () => {
  const xml = '<?xml version="1.0"?><mat:material colorBlue="64" colorGreen="128" colorRed="255" name="Sandstone" trans="0.4" useTrans="1" hasTexture="1" xmlns:mat="x"><mat:texture width="48" height="24"/></mat:material>';
  const info = parseMaterialXml(xml); assert.equal(info.color, '#ff8040'); assert.equal(info.name, 'Sandstone'); assert.equal(info.opacity, 0.4); assert.deepEqual(info.tileIn, [48, 24]);
  const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), thumb = new Uint8Array([137, 80, 78, 71]);
  const m = parseSkm(createZip([{ name: 'document.xml', data: xml }, { name: 'thumbnail.png', data: thumb }, { name: 'references/tex.jpg', data: png }]), 'Sandstone.skm');
  assert.equal(m.name, 'Sandstone'); assert.equal(m.color, '#ff8040'); assert.equal(m.tex.mime, 'image/jpeg'); assert.equal(m.tex.bytes.length, png.length); assert.deepEqual(m.tile, [4, 2]);
  const plain = parseSkm(createZip([{ name: 'document.xml', data: '<mat:material colorBlue="64" colorGreen="64" colorRed="64" hasTexture="0" name="Silver"/>' }]), 'x.skm'); assert.equal(plain.tex, null); assert.equal(plain.color, '#404040');
  assert.throws(() => parseSkm(new Uint8Array([1, 2, 3, 4, 5, 6]), 'bad.skm'), /not look like/);
});

test('fills: colours, faces, library materials and cleanup', () => {
  const p = lShape(); const mat = addMaterial(p, { name: 'Brick', color: '#a04b3a', tex: 'data:image/png;base64,AA', tile: [2, 1] });
  assert.equal(setFill(p, ['w1'], '#112233', 'a'), 1); assert.equal(p.walls[0].fillA, '#112233'); assert.equal(p.walls[0].fill, undefined);
  setFill(p, ['w1'], 'm:' + mat.id, 'o'); assert.equal(p.walls[0].fill, 'm:' + mat.id); assert.equal(p.walls[0].fillA, '#112233');
  setFill(p, ['w1'], '#abcdef', 'all'); assert.equal(p.walls[0].fillA, undefined); assert.equal(p.walls[0].fill, '#abcdef');
  setFill(p, ['w2'], 'm:' + mat.id); const m = resolveModel(p); assert.equal(m.wallById.w2.fill, 'm:' + mat.id); assert.equal(resolveFill(m.materials, 'm:' + mat.id).mat.tile[0], 2);
  p.levels[0].rccRoof = true; setFill(p, ['autoroof-L0'], '#999999'); assert.equal(p.levels[0].fillRoof, '#999999');
  removeMaterial(p, mat.id); assert.equal(p.walls[1].fill, undefined); assert.equal(setFill(p, ['w2'], null), 1);
  const parts = buildParts(resolveModel({ ...p, walls: p.walls.map((w) => (w.id === 'w1' ? { ...w, fill: '#ff0000' } : w)) }), { union: false });
  assert.equal(parts.find((x) => x.id === 'w1').color, 0xff0000);
});

test('RCC roofs: rectangle roof and automatic roof are closed solids with a parapet; quantities and loads include them', () => {
  const p = lShape(); p.levels[0].rccRoof = true; GEN.addRoof(p, 50, 0, 60, 10, { type: 'rcc' });
  let m = resolveModel(p); const parts = buildParts(m, { union: false }).filter((x) => x.kind === 'roof');
  assert.equal(parts.length, 2); parts.forEach((x) => { const s = meshStats(x.tris); assert.ok(s.watertight, x.id); assert.ok(s.volume > 50); });
  const auto = meshStats(parts.find((x) => x.id === 'autoroof-L0').tris); const flatArea = 24 * 16 + 16 * 8; assert.ok(auto.volume > flatArea * 0.41 && auto.volume < flatArea * 0.41 + 300);
  assert.ok(Math.abs(auto.bbox[1][2] - auto.bbox[0][2] - 3.41) < 1e-3);
  const rows = takeoff(m), q = (n) => rows.find((r) => r.item === n);
  assert.ok(q('RCC roof slabs').qty > 0); assert.ok(q('Roof parapet').qty > 0); assert.ok(q('Terrace waterproofing and finish (RCC roofs)').qty > 0);
  assert.ok(q('Total concrete').qty >= q('RCC roof slabs').qty);
  p.levels[0].parapet = 0; m = resolveModel(p); assert.ok(meshStats(buildParts(m, {}).find((x) => x.id === 'autoroof-L0').tris).bbox[1][2] < 10.5);
  const q2 = new Store(JSON.parse(JSON.stringify(p))); GEN.addColumn(q2.p, 0, 0, { level: 'L0' }); const a = loadTakedown(resolveModel(q2.p))[0].Pk; q2.p.levels[0].rccRoof = false; q2.p.roofs = []; const b = loadTakedown(resolveModel(q2.p))[0].Pk; assert.ok(a > b);
  const r = resolveModel(p).roofs.find((x) => x.type === 'rcc'); assert.equal(r.pitch, 0); assert.equal(r.parapet, 3);
});

test('levels: copy up, basement, move up and down, renumbering, delete', () => {
  const p = lShape(); GEN.addOpening(p, p.walls[0], { pos: 6, kind: 'window' });
  addLevel(p, { copy: true }); addLevel(p, { copy: true }); assert.equal(p.walls.length, 24); assert.equal(p.openings.length, 3);
  addLevel(p, { where: 'below' }); const names = () => resolveModel(p).levels.map((l) => l.name + '@' + l.elev);
  assert.deepEqual(names(), ['Basement@-10', 'Ground floor@0', 'First floor@10', 'Second floor@20']);
  assert.ok(moveLevel(p, 'L1', 1)); assert.deepEqual(resolveModel(p).levels.map((l) => l.id), ['L3', 'L0', 'L2', 'L1']);
  assert.deepEqual(names(), ['Basement@-10', 'Ground floor@0', 'First floor@10', 'Second floor@20']);        // names follow the stack
  assert.equal(p.walls.filter((w) => w.level === 'L1').length, 8);                                              // contents travelled with the floor
  assert.equal(resolveModel(p).levelById.L1.elev, 20); assert.ok(!moveLevel(p, 'L1', 1)); assert.ok(moveLevel(p, 'L1', -1));
  addLevel(p, { where: 'above', ref: 'L0' }); assert.deepEqual(resolveModel(p).levels.map((l) => l.elev), [-10, 0, 10, 20, 30]);
  assert.ok(deleteLevel(p, 'L3')); assert.equal(p.openings.every((o) => p.walls.some((w) => w.id === o.wall)), true);
});

test('plan view rotation and tilt map points both ways', () => {
  for (const cam of [{ x: 5, y: 3, scale: 20 }, { x: 5, y: 3, scale: 20, rot: 37, tilt: 60 }, { x: -2, y: 8, scale: 7, rot: -140, tilt: 30 }]) {
    const pt = [8.2, -1.4], s = toScreen(cam, 800, 600, pt), w = toWorld(cam, 800, 600, s); assert.ok(Math.abs(w[0] - pt[0]) < 1e-9 && Math.abs(w[1] - pt[1]) < 1e-9);
  }
  const up = toScreen({ x: 0, y: 0, scale: 10, tilt: 50 }, 800, 600, [0, 0], 5); assert.ok(up[1] < 300);       // heights lift the point on screen
  const a = toScreen({ x: 0, y: 0, scale: 10, rot: 90 }, 800, 600, [1, 0]); assert.ok(Math.abs(a[0] - 400) < 1e-9 && a[1] < 300);   // east turns to the top
});

test('3D: painted faces split walls, textures get UVs, fills colour parts', () => {
  const p = lShape(); const mat = addMaterial(p, { name: 'T', color: '#885533', tile: [2, 2], tex: 'data:x' }); p.walls[0].fillA = '#ff0000'; p.walls[0].fillB = 'm:' + mat.id; p.walls[1].fill = '#00ff00';
  const m = resolveModel(p), g = buildGroup(m, p, { ...opts, tex: { get: () => null } }), w1 = g.children.filter((o) => o.isMesh && o.userData.id === 'w1');
  assert.equal(w1.length, 3); assert.deepEqual(w1.map((x) => x.userData.face).sort(), ['a', 'b', 'o']);
  assert.equal(w1.find((x) => x.userData.face === 'a').material.color.getHex(), 0xff0000);
  assert.equal(g.children.find((o) => o.isMesh && o.userData.id === 'w2').material.color.getHex(), 0x00ff00);
  const f = splitWallFaces(buildParts(m, { union: false }).find((x) => x.id === 'w1').tris, m.wallById.w1); assert.ok(f.a.length > 0 && f.b.length > 0 && f.o.length > 0);
  const uv = boxUVs([0, 0, 0, 4, 0, 0, 4, 0, 4], [2, 2]); assert.deepEqual(Array.from(uv), [0, 0, 2, 0, 2, 2]);
  const lin = buildGroup(m, p, { ...opts, linear: true, shadows: true, tex: { get: () => null } }).children.find((o) => o.isMesh);
  assert.ok(lin.material.isMeshStandardMaterial); assert.ok(lin.castShadow);
});

test('sun path: east at sunrise, south at noon, west at sunset', () => {
  const s6 = sunVector({ time: 6, north: 0 }), s12 = sunVector({ time: 12, north: 0 }), s18 = sunVector({ time: 18, north: 0 });
  assert.ok(s6.v[0] > 0.9); assert.ok(s12.v[1] < -0.3 && s12.el > 60); assert.ok(s18.v[0] < -0.9);
});

class Stub { constructor() { this.h = {}; this.clippingPlanes = []; this.shadowMap = { enabled: false }; this.domElement = { className: '', style: {}, addEventListener: (t, f) => { this.h[t] = f; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }) }; } setSize() {} setPixelRatio() {} setClearColor() {} getPixelRatio() { return 1; } render() { this.n = (this.n || 0) + 1; } dispose() {} }
test('3D lighting presets and editing modes on a stub renderer', async () => {
  const prev = globalThis.THREE; globalThis.THREE = { ...THREE, WebGLRenderer: Stub };
  try {
    const st = new Store(lShape()), toasts = [], app = { isDark: () => false, setLevel() {}, toast: (t) => toasts.push(t), state: { opts: { wallT: '=wallIn', wallH: '=storey' }, snap: { grid: true } }, paintHit(hit, fill) { return app.paint([hit.id], fill, 'all'); }, paint(ids, fill, side) { return st.transact('Paint', (p) => setFill(p, ids, fill, side)); } };
    const v = new View3D({ appendChild() {}, getBoundingClientRect: () => ({ width: 600, height: 400 }) }, st, app); assert.ok(v.ok);
    v.setPreset('day'); assert.ok(v.light.realistic); assert.ok(v.renderer.shadowMap.enabled); assert.ok(v.sunLight.castShadow); assert.ok(v.groundMesh.visible); assert.equal(v.opts.mode, 'shaded');
    v.setLight({ time: 8 }); const x8 = v.sunLight.position.x; v.setLight({ time: 16 }); assert.ok(v.sunLight.position.x < x8);
    v.setPreset('night'); assert.ok(v.lampGroup && v.lampGroup.children.length > 0); v.setPreset('basic'); assert.ok(!v.renderer.shadowMap.enabled); assert.ok(!v.lampGroup);
    assert.ok(v.group.children.find((o) => o.isMesh).material.isMeshLambertMaterial);
    // edit modes: delete a selected wall with the keyboard, draw a wall by clicking the floor, paint a wall
    v.edit.setMode('select'); st.select(['w1']); v.edit.key({ key: 'Delete', preventDefault() {}, target: {} }); assert.ok(!st.p.walls.some((w) => w.id === 'w1'));
    st.undo(); assert.ok(st.p.walls.some((w) => w.id === 'w1'));
    v.edit.setMode('wall'); assert.equal(v.edit.mode, 'wall'); v.view('top'); v.fit(); const cam = v.cameraNow(), scr = (x, y) => { const q = new THREE.Vector3(x, 0, -y).project(cam); return { clientX: (q.x + 1) / 2 * 600, clientY: (1 - q.y) / 2 * 400, button: 0, pointerId: 1 }; };
    const n0 = st.p.walls.length, H = v.renderer.h; H.pointerdown(scr(50, 0)); H.pointerup(scr(50, 0)); H.pointerdown(scr(50, 10)); H.pointerup(scr(50, 10)); assert.equal(st.p.walls.length, n0 + 1);
    v.edit.key({ key: 'Escape', preventDefault() {}, target: {} }); assert.equal(v.edit.mode, 'wall'); v.edit.key({ key: 'Escape', preventDefault() {}, target: {} }); assert.equal(v.edit.mode, 'select');
    v.edit.setMode('paint'); app.state.brush = { fill: '#123456' }; const hit = v.pickFull(scr(12, 0.2)); assert.ok(hit); H.pointerdown(scr(12, 0)); H.pointerup(scr(12, 0)); assert.ok(st.p.walls.some((w) => w.fill === '#123456' || w.fillA === '#123456'));
    v.edit.setMode('door'); v.edit.hover({ clientX: 300, clientY: 200 }); v.destroy();
  } finally { globalThis.THREE = prev; }
});

test('a floor added above an RCC roof sits on the slab; named, sized floors; parapet only on the top roof', () => {
  const p = lShape(); p.levels[0].rccRoof = true; p.levels[0].roofT = 0.5;
  addLevel(p, { name: 'Guest floor', height: 9 }); let m = resolveModel(p); const up = m.levels[1];
  assert.equal(up.name, 'Guest floor'); assert.equal(up.elev, 10.5); assert.equal(up.height, 9); assert.equal(p.levels[1].autoSlab, false);
  assert.equal(m.levels[0].parapetEff, 0);
  p.levels[1].rccRoof = true; m = resolveModel(p); assert.equal(m.levels[1].parapetEff, 3);
  const ids = buildParts(m, {}).map((x) => x.id); assert.ok(ids.includes('autoroof-L0') && !ids.includes('autoslab-L1'));
  p.levels[1].autoSlab = true; assert.ok(!buildParts(resolveModel(p), {}).some((x) => x.id === 'autoslab-L1'));   // no double slab on the RCC
  addLevel(p, { where: 'above', ref: 'L0', name: 'Mezzanine' }); assert.equal(resolveModel(p).levelById.L1.elev, 21); assert.equal(resolveModel(p).levels[1].name, 'Mezzanine'); assert.ok(resolveModel(p).levels.every((l, i, a) => !i || l.elev >= a[i - 1].top));
});

test('material import groups by zip or folder and keeps file names', async () => {
  const { importMaterials } = await import('../src/studio/io/skm.js');
  const skm = (n, c) => createZip([{ name: 'document.xml', data: '<mat:material colorBlue="' + c + '" colorGreen="10" colorRed="20" name="' + n + '" hasTexture="0"/>' }]);
  const asFile = (name, bytes, rel) => ({ name, webkitRelativePath: rel || '', arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  const coll = createZip([{ name: 'tiles/Marble.skm', data: skm('Marble', 200) }, { name: 'tiles/Granite.skm', data: skm('Granite', 90) }, { name: 'readme.txt', data: 'x' }]);
  const a = await importMaterials(asFile('Stone pack.zip', coll)); assert.deepEqual(a.map((m) => [m.name, m.file, m.group]), [['Marble', 'Marble.skm', 'Stone pack'], ['Granite', 'Granite.skm', 'Stone pack']]);
  const b = await importMaterials(asFile('Teak.skm', skm('Teak', 40), 'Wood/Teak.skm')); assert.equal(b[0].group, 'Wood'); assert.equal(b[0].file, 'Teak.skm');
  const c = await importMaterials(asFile('Loose.skm', skm('Loose', 5))); assert.equal(c[0].group, 'Imported files');
  const p = newProject('t'); [...a, ...b].forEach((m) => addMaterial(p, m)); assert.equal(p.materials[0].group, 'Stone pack'); assert.equal(p.materials[2].file, 'Teak.skm');
});
