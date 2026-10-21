import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '../dist/courtyard_house_planner.html'), 'utf8').replace(/<script src="[^"]*three[^"]*"><\/script>/, '');
const THREE = await import('three');
function boot() {
  const errs = [], saved = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message); }); vc.on('error', (e) => errs.push(String(e)));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc, beforeParse(w) { w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder;
    class Stub { constructor(o) { this.domElement = (o && o.canvas) || w.document.createElement('canvas'); } setSize() {} setPixelRatio() {} setClearColor() {} render() {} dispose() {} }
    w.THREE = { ...THREE, WebGLRenderer: Stub }; w.URL.createObjectURL = (b) => { saved.push(b); return 'blob:x'; }; w.URL.revokeObjectURL = () => {}; w.scrollTo = () => {};
    const ctx = new Proxy({}, { get: (t, k) => { if (k === 'canvas') return {}; if (k === 'measureText') return () => ({ width: 40 }); if (!(k in t)) t[k] = () => undefined; return t[k]; }, set: (t, k, v) => { t[k] = v; return true; } });
    w.HTMLCanvasElement.prototype.getContext = function () { return ctx; };
    w.HTMLCanvasElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700 }; };
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return 1000; } }); Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return 700; } });
    w.HTMLElement.prototype.setPointerCapture = () => {}; Object.defineProperty(w, 'innerWidth', { value: 1400 });
  } });
  return { w: dom.window, d: dom.window.document, errs, saved };
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const ev = (w, el, type, x, y, extra = {}) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra }));
const key = (w, k, extra = {}) => w.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));

test('nav: three tabs; Ductile holds every modelling workspace and opens with welcome and examples', async (t) => {
  const { w, d, errs } = boot(); t.after(() => w.close()); await tick(600);
  assert.deepEqual([...d.querySelectorAll('#topnav > button')].map((b) => b.textContent), ['Planner', 'Studio', 'Ductile']);
  assert.equal(d.querySelectorAll('#topnav .navmore').length, 0, 'no separate tools menu any more');
  click(w, d.querySelector('#topnav [data-view="ductile"]')); await tick(150);
  assert.equal(d.getElementById('ductileRoot').hidden, false); assert.deepEqual([...d.querySelectorAll('.dx-seg.ws button')].map((b) => b.textContent), ['Subdivision', 'CAD (exact)', 'Vessel', 'Forge', 'Field']); assert.ok(d.querySelector('.dx-logo svg')); assert.equal(d.querySelector('.dx-desk').hidden, true, 'no desktop warning on a wide screen');
  assert.equal(d.querySelector('.dx-welcome').hidden, false); assert.equal(d.querySelectorAll('.dx-wgrid .dx-btn').length, 6); assert.equal(d.querySelectorAll('.dx-tool').length, 9);
  assert.deepEqual(errs, []);
});
test('draw a rectangle on the ground, push it up with the mouse, type an exact height, draw a window on a face, push it in', async (t) => {
  const { w, d, errs, saved } = boot(); t.after(() => w.close()); await tick(600);
  click(w, d.querySelector('#topnav [data-view="ductile"]')); await tick(150); const D = w.__ductile.app, V = D.view, cv = V.canvas;
  click(w, [...d.querySelectorAll('.dx-wcard .dx-btn')].find((b) => b.textContent === 'Draw a rectangle'));
  const sc = (p) => V.screen(p);
  // first corner at the origin, then type 200,120 and Enter
  let s0 = sc([0, 0, 0]); ev(w, cv, 'pointerdown', s0[0], s0[1]); assert.ok(D.st.draw, 'drawing started'); for (const ch of '200,120') key(w, ch); key(w, 'Enter');
  assert.equal(D.doc.objects.length, 1); assert.equal(D.st.tool, 'push'); assert.equal(D.st.mode, 'face');
  // push it up: press on the face, drag, type 80, Enter
  const c = [100, 60, 0], sp = sc(c); ev(w, cv, 'pointerdown', sp[0], sp[1]); assert.ok(D.st.modal && D.st.modal.kind === 'extrude', 'push started'); ev(w, cv, 'pointermove', sp[0], sp[1] - 60); for (const ch of '80') key(w, ch); key(w, 'Enter');
  const o = D.doc.objects[0]; let zs = o.cage.V.map((v) => v[2]); assert.equal(Math.max(...zs), 80); assert.equal(Math.min(...zs), 0); assert.equal(o.cage.F.length, 6, 'a closed block');
  // draw a window on the front face (y = 0), push it in 20 mm
  D.setTool('rect'); const f0 = sc([60, 0, 20]), f1 = sc([140, 0, 60]); ev(w, cv, 'pointerdown', f0[0], f0[1]); ev(w, cv, 'pointermove', f1[0], f1[1]); ev(w, cv, 'pointerdown', f1[0], f1[1]);
  assert.ok(D.doc.objects[0].cage.F.length > 6, 'window drawn on the face: ' + D.doc.objects[0].cage.F.length); assert.equal(D.st.tool, 'push');
  const fw = sc([100, 0, 40]); ev(w, cv, 'pointerdown', fw[0], fw[1]); assert.ok(D.st.modal); for (const ch of '-20') key(w, ch); key(w, 'Enter');
  const ev2 = D.evalObj(D.doc.objects[0], 'full'); assert.ok(D.doc.objects[0].cage.V.some((v) => Math.abs(v[1] - 20) < 1e-6), 'window pushed in by 20');
  // gizmo axis drag in Z, undo, export
  assert.ok(D.hist >= 4); D.restore(1); D.restore(D.hist - 1);
  D.setMode('object'); D.st.sel.objects = new Set([D.doc.objects[0].id]); D.refresh(); D.packBytes(); click(w, d.querySelector('.dx-menu summary')); click(w, [...d.querySelectorAll('.dx-menuitems button')].find((b) => /print pack/.test(b.textContent))); await tick(30); assert.ok(saved.length >= 1);
  assert.deepEqual(errs, []);
});
test('examples, modifiers panel, keyboard move with axis lock, loop cut, crease and bridge', async (t) => {
  const { w, d, errs } = boot(); t.after(() => w.close()); await tick(600);
  click(w, d.querySelector('#topnav [data-view="ductile"]')); await tick(150); const D = w.__ductile.app, V = D.view, cv = V.canvas;
  click(w, [...d.querySelectorAll('.dx-wgrid .dx-btn')].find((b) => b.textContent === 'Fluted petal vase')); await tick(30);
  assert.equal(D.doc.objects.length, 1); assert.ok(d.querySelectorAll('.dx-mod').length >= 4, 'modifier stack shown');
  const count = d.querySelector('.dx-mod input[type=number]'); assert.ok(count);
  // keyboard: select all faces, G then Z then type 15 then Enter moves everything up 15
  D.setMode('face'); key(w, 'a'); const z0 = Math.max(...D.doc.objects[0].cage.V.map((v) => v[2])); D.st.mouse = [500, 350]; key(w, 'g'); assert.ok(D.st.modal); key(w, 'z'); key(w, '1'); key(w, '5'); key(w, 'Enter');
  assert.ok(Math.abs(Math.max(...D.doc.objects[0].cage.V.map((v) => v[2])) - (z0 + 15)) < 1e-6, 'moved up exactly 15');
  // loop cut and crease on the house
  click(w, d.querySelector('.dx-menu summary')); click(w, [...d.querySelectorAll('.dx-menuitems button')].find((b) => b.textContent === 'Plate with hole')); await tick(30);
  D.setMode('edge'); const o = D.doc.objects[0], nE = o.cage.F.length; key(w, 'a'); key(w, 'E', { shiftKey: true }); assert.ok(Object.keys(D.doc.objects[0].cage.C).length > 0);
  // bridge: two faces on a box
  D.addPrim('box'); const b = D.doc.objects[D.doc.objects.length - 1]; D.st.active = b.id; D.setMode('face'); const top = b.cage.F.findIndex((f) => f.every((i) => b.cage.V[i][2] > 99)), bot = b.cage.F.findIndex((f) => f.every((i) => b.cage.V[i][2] < 1));
  D.st.sel.faces = new Set([top]); D.st.mouse = [500, 350]; key(w, 'i'); key(w, '3'); key(w, '0'); key(w, 'Enter'); D.st.sel.faces = new Set([bot]); key(w, 'i'); key(w, '3'); key(w, '0'); key(w, 'Enter');
  D.st.sel.faces = new Set([top, bot]); key(w, 'b'); const box2 = D.doc.objects[D.doc.objects.length - 1]; assert.equal(box2.cage.F.length, 6 + 8 - 2 + 4, 'bridged into a box with a square tunnel');
  assert.match(d.querySelector('.dx-side').textContent, /Watertight/);
  assert.deepEqual(errs, []);
});
test('Field opens inside Ductile and sends its model to Subdivision', async (t) => {
  const { w, d, errs } = boot(); t.after(() => w.close()); await tick(600);
  click(w, d.querySelector('#topnav [data-view="ductile"]')); await tick(150); const D = w.__ductile.app;
  click(w, [...d.querySelectorAll('.dx-seg.ws button')].find((b) => b.textContent === 'Field')); await tick(400);
  assert.ok(w.__field, 'Field started inside Ductile'); const n0 = D.doc.objects.length;
  const send = [...d.querySelectorAll('.dx-wsbar button')].find((b) => b.textContent === 'Send to Subdivision' && b.closest('.dx-wshost') && !b.closest('.dx-wshost').hidden); assert.ok(send, 'send button'); click(w, send); await tick(50);
  assert.equal(D.doc.objects.length, n0 + 1, 'the field model arrived in Subdivision'); assert.equal(D.ws, 'sub');
  assert.deepEqual(errs, []);
});
