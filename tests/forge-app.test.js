import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
globalThis.THREE = THREE;
import { ForgeApp } from '../src/studio/forge/app.js';
import { ForgeView } from '../src/studio/forge/view.js';
import { newForge } from '../src/studio/forge/model.js';
import * as M from '../src/studio/forge/mesh.js';

const zmax = (m) => Math.max(...m.v.map((v) => v.p[2])), zmin = (m) => Math.min(...m.v.map((v) => v.p[2]));
function topRim(app) { const m = app.current.mesh; const c = m.f.map((F, i) => ({ i, z: Math.max(...F.v.map((v) => m.v[v].p[2])), n: M.faceNormal(m, i) })).filter((x) => x.n[2] > 0.9).sort((a, b) => b.z - a.z); return c[0].i; }

test('numeric pull, move, scale, rotate, twist and inset commit keyed edits and undo cleanly', () => {
  const app = new ForgeApp(newForge('vase')); const h0 = zmax(app.current.mesh);
  app.state.tool = 'pull'; app.selectFaces([topRim(app)], false); const r = app.applyNumeric('15'); assert.ok(r.ok, r.msg);
  assert.ok(zmax(app.current.mesh) > h0 + 12); assert.equal(app.body.ops.length, 1); assert.equal(app.body.ops[0].t, 'extrude'); assert.ok(app.sel.faces.length === 1, 'new top face stays selected');
  assert.ok(M.stats(app.current.mesh).watertight);
  app.applyNumeric('-5'); assert.equal(app.body.ops.length, 2); app.store.undo(); assert.equal(app.body.ops.length, 1); app.store.redo(); assert.equal(app.body.ops.length, 2);
  // move a ring of vertices in any direction
  const m = app.current.mesh, ring = m.v.map((v, i) => ({ i, z: v.p[2] })).filter((x) => Math.abs(x.z - 60) < 8).map((x) => x.i);
  app.selectVerts(ring, false); app.state.tool = 'move'; app.state.dir = 'x'; assert.ok(app.applyNumeric('4').ok); app.state.dir = 'custom'; app.state.custom = [1, 1, 0]; assert.ok(app.applyNumeric('3').ok); assert.ok(app.applyNumeric('1,2,3').ok);
  app.state.tool = 'scale'; app.state.scaleMode = 'radial'; assert.ok(app.applyNumeric('1.2').ok); app.state.tool = 'rotate'; app.state.dir = 'z'; assert.ok(app.applyNumeric('20').ok); app.state.tool = 'twist'; assert.ok(app.applyNumeric('30').ok);
  assert.equal(app.body.ops.length, 8);
  // inset a quad then pull the inner face
  const q = app.current.mesh.f.findIndex((F, i) => F.v.length === 4 && M.faceNormal(app.current.mesh, i)[0] > 0.9); app.selectFaces([q], false); app.state.tool = 'inset'; assert.ok(app.applyNumeric('1').ok); assert.equal(app.sel.faces.length, 1);
  app.state.tool = 'pull'; assert.ok(app.applyNumeric('4').ok); assert.ok(M.stats(app.current.mesh).watertight, JSON.stringify(M.stats(app.current.mesh)));
  assert.equal(app.applyNumeric('abc').ok, false); app.clearSel(); assert.equal(app.applyNumeric('3').ok, false);
});

test('edits survive a parameter change; the history says what could not be applied', () => {
  const app = new ForgeApp(newForge('vase')); app.state.tool = 'pull'; app.selectFaces([topRim(app)], false); app.applyNumeric('10');
  app.store.transact('H', (p) => { p.params.find((x) => x.name === 'H').v = 240; }); assert.ok(zmax(app.current.mesh) > 249); assert.equal(app.current.notes.length, 0);
  app.store.transact('Seg', (p) => { p.params.find((x) => x.name === 'seg').v = 16; }); assert.ok(app.current.notes.length <= 1);
});

test('bodies: add, switch, delete; freeze keeps the shape and drops the parameters', () => {
  const app = new ForgeApp(newForge('vase')); const id = app.addBody('bowl'); assert.equal(app.project.bodies.length, 2); assert.equal(app.project.active, id); assert.ok(app.project.params.some((p) => p.name === 'wall2'), 'parameter names are kept unique');
  assert.ok(app.cache.length === 2); app.setActive('b1'); assert.equal(app.body.id, 'b1'); assert.equal(app.removeBody(id), true); assert.equal(app.removeBody('b1'), false);
  const v0 = M.stats(app.current.mesh).volume; app.state.tool = 'pull'; app.selectFaces([topRim(app)], false); app.applyNumeric('8'); const v1 = M.stats(app.current.mesh).volume; app.bake();
  assert.equal(app.body.ops.length, 0); assert.equal(app.body.gen.type, 'mesh'); assert.ok(Math.abs(M.stats(app.current.mesh).volume - v1) < 1); assert.ok(v1 > v0);
  app.store.transact('H', (p) => { p.params.find((x) => x.name === 'H').v = 300; }); assert.ok(Math.abs(M.stats(app.current.mesh).volume - v1) < 1, 'frozen shape ignores parameters');
});

test('the viewport picks faces, edges and vertices and a drag becomes a pull in any direction', () => {
  class Stub { constructor() { this.h = {}; this.domElement = { className: '', style: {}, addEventListener: (t, f) => { this.h[t] = f; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }; } setSize() {} setPixelRatio() {} render() {} dispose() {} }
  const prev = globalThis.THREE; globalThis.THREE = { ...THREE, WebGLRenderer: Stub };
  try {
    const app = new ForgeApp(newForge('vase')), el = { appendChild() {}, getBoundingClientRect: () => ({ width: 800, height: 600 }) }, view = new ForgeView(el, app);
    assert.ok(view.ok); app.setView(view); view.view('front'); view.fit(); view.render();
    const sc = view.toScreen([0, 0, 90]); void sc;
    const hit = view.pickFace(400, 300); assert.ok(hit, 'a ray through the middle of the vase hits it'); assert.ok(isFinite(hit.point[0]));
    const f = view.pickFace(400, 300).face; assert.ok(f >= 0);
    // select by clicking (select tool, face mode)
    const H = view.renderer.h; H.pointerdown({ clientX: 400, clientY: 300, button: 0, pointerId: 1 }); H.pointerup({ clientX: 400, clientY: 300, button: 0 }); assert.equal(app.sel.faces.length, 1);
    app.setMode('vertex'); assert.ok(view.pickVertex(400, 300, 400)); app.setMode('edge'); const e = view.pickEdge(400, 300, 400); assert.ok(e && e.faces.length === 2); app.selectLoop(e, false); assert.ok(app.sel.verts.length >= 4, 'loop of ' + app.sel.verts.length);
    // drag with the Move tool, free direction, then Push/Pull along the normal
    app.setMode('face'); app.selectFaces([f], false); app.state.tool = 'move'; app.state.dir = 'free';
    H.pointerdown({ clientX: 400, clientY: 300, button: 0, pointerId: 1 }); H.pointermove({ clientX: 440, clientY: 280 }); H.pointerup({ clientX: 440, clientY: 280, button: 0 }); assert.equal(app.body.ops.filter((o) => o.t === 'move').length, 1);
    const mv = app.body.ops.find((o) => o.t === 'move'); assert.ok(Math.hypot(...mv.vec) > 1);
    app.state.tool = 'pull'; app.state.dir = 'normal'; H.pointerdown({ clientX: 400, clientY: 300, button: 0, pointerId: 1 }); H.pointermove({ clientX: 400, clientY: 250 }); H.pointerup({ clientX: 400, clientY: 250, button: 0 });
    assert.ok(app.body.ops.some((o) => o.t === 'extrude'), 'pull committed'); assert.ok(M.stats(app.current.mesh).tris > 0);
    // sculpt and the box select
    app.state.tool = 'sculpt'; H.pointerdown({ clientX: 400, clientY: 320, button: 0, pointerId: 1 }); H.pointermove({ clientX: 440, clientY: 320 }); H.pointerup({ clientX: 440, clientY: 320, button: 0 }); assert.ok(app.body.ops.some((o) => o.t === 'soft'));
    app.state.tool = 'select'; app.clearSel(); H.pointerdown({ clientX: 10, clientY: 10, button: 0, pointerId: 1 }); H.pointermove({ clientX: 790, clientY: 590 }); H.pointerup({ clientX: 790, clientY: 590, button: 0 }); assert.ok(app.sel.faces.length > 20, 'box selected ' + app.sel.faces.length);
    app.state.tool = 'delete'; app.clearSel(); H.pointerdown({ clientX: 400, clientY: 300, button: 0, pointerId: 1 }); assert.ok(app.body.ops.some((o) => o.t === 'delete'));
    H.wheel({ deltaY: 200, preventDefault() {} }); H.pointerdown({ clientX: 100, clientY: 100, button: 2, pointerId: 1 }); H.pointermove({ clientX: 140, clientY: 90 }); H.pointerup({ clientX: 140, clientY: 90, button: 2 });
    app.state.overhangView = true; view.paint(); app.state.smooth = true; app.showCurrent(); app.state.edges = false; app.showCurrent(); view.destroy();
  } finally { globalThis.THREE = prev; }
});
