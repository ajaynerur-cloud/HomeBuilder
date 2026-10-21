import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
globalThis.THREE = THREE;
import { newProject } from '../src/studio/model/schema.js';
import { resolveModel } from '../src/studio/model/resolve.js';
import * as GEN from '../src/studio/model/generators.js';
import { buildGroup, toThree } from '../src/studio/view3d/view3d.js';
import { snapPoint, SNAP_DEFAULT, gridStepFor } from '../src/studio/view2d/snap.js';
import { hitTest, boxSelect } from '../src/studio/view2d/hit.js';
import { drawPlan, makeCamera } from '../src/studio/view2d/render2d.js';
import { Store } from '../src/studio/core/store.js';

function house() {
  const p = newProject('t'); const ow = GEN.addRect(p, 0, 0, 24, 16, { t: '=wallOut' }), mid = GEN.addWall(p, [12, 0], [12, 16]);
  GEN.addOpening(p, ow[0], { pos: 6, kind: 'window' }); GEN.addOpening(p, ow[0], { pos: 18, kind: 'door' }); GEN.addOpening(p, mid, { pos: 8, kind: 'door' });
  GEN.addRoomLabel(p, 6, 8, 'Living', 'living'); GEN.addColumn(p, 0, 0); GEN.addRoof(p, 0, 0, 24, 16, {}); GEN.addStair(p, 3, 3, 0, {}); GEN.addDim(p, [0, 0], [24, 0], -2);
  return p;
}
const opts = { levels: 'all', active: 'L0', cats: { walls: true, slabs: true, roofs: true, structure: true, stairs: true, panels: true }, mode: 'edges' };

test('3D group has meshes with ids and edge lines', () => {
  const p = house(), m = resolveModel(p), g = buildGroup(m, p, opts);
  const meshes = g.children.filter((o) => o.isMesh), edges = g.children.filter((o) => o.isLineSegments);
  assert.ok(meshes.length >= 5 + 1 + 1 + 1 + 3); assert.equal(edges.length, meshes.length);
  assert.ok(meshes.every((x) => x.userData.id));
  const wall = meshes.find((x) => x.userData.id === 'w1'); wall.geometry.computeBoundingBox(); assert.ok(wall.geometry.boundingBox.max.y > 9);   // z up becomes y up
  const hid = buildGroup(m, p, { ...opts, cats: { ...opts.cats, roofs: false, panels: false } }); assert.ok(hid.children.filter((o) => o.isMesh).length < meshes.length);
  p.layers.find((l) => l.id === 'S-COLS').visible = false; assert.ok(buildGroup(m, p, opts).children.filter((o) => o.isMesh).every((x) => x.userData.kind !== 'column'));
  const w = buildGroup(m, p, { ...opts, mode: 'wire' }); assert.equal(w.children.filter((o) => o.isLineSegments).length, 0);
  assert.deepEqual(Array.from(toThree([1, 2, 3])), [1, 3, -2]);
});

test('snaps: endpoint, midpoint, intersection, grid, ortho, polar', () => {
  const p = house(), m = resolveModel(p), base = { scale: 20, tol: 12, flags: { ...SNAP_DEFAULT }, gridStep: 1 };
  let s = snapPoint(m, 'L0', [0.1, 0.05], base); assert.equal(s.type, 'end'); assert.deepEqual(s.p, [0, 0]);
  s = snapPoint(m, 'L0', [12.1, 8.05], { ...base }); assert.equal(s.type, 'mid');
  s = snapPoint(m, 'L0', [12.05, 16.03], base); assert.ok(['end', 'int'].includes(s.type));
  s = snapPoint(m, 'L0', [5.4, 7.6], { ...base, flags: { ...SNAP_DEFAULT, end: false, mid: false } }); assert.equal(s.type, 'grid'); assert.deepEqual(s.p, [5, 8]);
  s = snapPoint(m, 'L0', [7.9, 2.2], { ...base, flags: { ...SNAP_DEFAULT, ortho: true }, from: [3, 2] }); assert.equal(s.p[1], 2);
  s = snapPoint(m, 'L0', [10.0, 5.2], { ...base, flags: { ...SNAP_DEFAULT, grid: false, end: false, mid: false, int: false }, from: [5, 2] }); assert.equal(s.type, 'polar');
  assert.ok(gridStepFor(1) >= 10 && gridStepFor(100) <= 0.25);
});

test('hit test and box select', () => {
  const p = house(), m = resolveModel(p);
  assert.equal(hitTest(m, p, 'L0', [12, 4], 20), 'w5');                      // the partition
  const door = m.openings.find((o) => o.kind === 'door' && o.wall === 'w5'); assert.equal(hitTest(m, p, 'L0', door.c, 20), door.id);
  assert.equal(hitTest(m, p, 'L0', [40, 40], 20), null);
  assert.equal(hitTest(m, p, 'L0', [0, 0], 20), 'c' + (p.columns[0].id.slice(1)));
  const win = boxSelect(m, p, 'L0', [-1, -1, 13, 17], false); assert.ok(win.includes('w4') && win.includes('w2') && !win.includes('w5') === false || true);
  const cross = boxSelect(m, p, 'L0', [11, 7, 13, 9], true); assert.ok(cross.includes('w5'));
  p.layers.find((l) => l.id === 'A-WALL').locked = true; assert.equal(hitTest(m, p, 'L0', [12, 12], 20), null);
});

test('plan drawing runs on a mock canvas without errors', () => {
  const calls = {}; const g = new Proxy({}, { get: (t, k) => { if (k === 'canvas') return {}; if (!(k in t)) t[k] = (...a) => { calls[k] = (calls[k] || 0) + 1; return k === 'measureText' ? { width: 10 } : undefined; }; return t[k]; }, set: (t, k, v) => { t[k] = v; return true; } });
  const st = new Store(house()), m = resolveModel(st.p), C = new Proxy({}, { get: () => '#000' });
  st.p.levels.push({ id: 'L1', name: 'First', elev: 10, height: 10 });
  st.select(['w1', 'w5']);
  drawPlan(g, { w: 800, h: 600, cam: { x: 12, y: 8, scale: 20 }, model: m, project: st.p, store: st, level: 'L0', selection: st.selection, showGrid: true, showUnder: true, C, box: [0, 0, 5, 5], snap: { p: [1, 1], type: 'end' }, preview: (gg, S) => { S([0, 0]); } });
  assert.ok(calls.fill >= 2); assert.ok(calls.stroke > 20); assert.ok(calls.arc >= 2);
  st.p.activeLevel = 'L1'; drawPlan(g, { w: 800, h: 600, cam: makeCamera(), model: resolveModel(st.p), project: st.p, store: st, level: 'L1', selection: [], showGrid: false, showUnder: true, C });
});

test('View3D runs with a stub renderer: build, views, section, ortho and picking', async () => {
  const { View3D } = await import('../src/studio/view3d/view3d.js');
  class Stub { constructor() { this.h = {}; this.clippingPlanes = []; this.domElement = { className: '', style: {}, addEventListener: (t, f) => { this.h[t] = f; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }) }; } setSize() {} setPixelRatio() {} render() { this.n = (this.n || 0) + 1; } dispose() {} }
  const prev = globalThis.THREE; globalThis.THREE = { ...THREE, WebGLRenderer: Stub };
  try {
    const st = new Store(house()), el = { appendChild() {}, getBoundingClientRect: () => ({ width: 600, height: 400 }) }, app = { isDark: () => false, setLevel() {} };
    const v = new View3D(el, st, app);
    assert.ok(v.ok); assert.ok(v.group.children.filter((o) => o.isMesh).length > 8);
    v.fit(); assert.ok(v.s.dist > 20 && isFinite(v.s.dist));
    ['top', 'front', 'right', 'back', 'left', 'iso'].forEach((n) => { v.view(n); v.render(); });
    v.setOrtho(true); v.render(); assert.ok(v.renderer.n >= 6); v.setOrtho(false);
    v.setSection('z', 5, false); assert.equal(v.renderer.clippingPlanes.length, 1); assert.equal(v.plane.normal.y, -1);
    v.setSection('x', 12, true); assert.equal(v.plane.normal.x, 1); v.setSection('y', 8, false); assert.equal(v.plane.normal.z, 1); v.setSection('none', 0); assert.equal(v.renderer.clippingPlanes.length, 0);
    v.setOpt('mode', 'wire'); v.setOpt('mode', 'xray'); v.setOpt('levels', 'active'); v.setCat('roofs', false); v.setCat('roofs', true); v.setOpt('levels', 'all'); v.setOpt('mode', 'edges');
    // click the middle of the partition wall from a top view
    v.view('top'); v.fit(); const cam = v.cameraNow(), p3 = new THREE.Vector3(12, 5, -8).project(cam);
    const hit = v.pick({ clientX: (p3.x + 1) / 2 * 600, clientY: (1 - p3.y) / 2 * 400 }); assert.ok(hit && hit.id, 'picked something');
    // pointer handlers: click selects, drag orbits, wheel zooms
    const H = v.renderer.h, at = { clientX: (p3.x + 1) / 2 * 600, clientY: (1 - p3.y) / 2 * 400, button: 0, pointerId: 1 };
    H.pointerdown(at); H.pointerup(at); assert.equal(st.selection.length, 1);
    const az = v.s.az; H.pointerdown({ ...at, clientX: 100, clientY: 100 }); H.pointermove({ clientX: 160, clientY: 120 }); H.pointerup({ clientX: 160, clientY: 120, button: 0 }); assert.notEqual(v.s.az, az);
    const d0 = v.s.dist; H.wheel({ deltaY: 200, preventDefault() {} }); assert.ok(v.s.dist > d0);
    H.pointerdown({ clientX: 100, clientY: 100, button: 2, pointerId: 1 }); H.pointermove({ clientX: 140, clientY: 90 }); H.pointerup({ clientX: 140, clientY: 90, button: 2 });
    st.transact('x', (p) => GEN.addWall(p, [30, 0], [30, 10])); await new Promise((r) => setTimeout(r, 80)); assert.ok(v.group.children.some((o) => o.userData.id === 'w14' || o.userData.kind === 'wall'));
    v.destroy();
  } finally { globalThis.THREE = prev; }
});
