import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import * as M from '../src/studio/forge/mesh.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '../dist/courtyard_house_planner.html'), 'utf8').replace(/<script src="[^"]*three[^"]*"><\/script>/, '');
const THREE = await import('three');

function boot(stub) {
  const errs = [], saved = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message); }); vc.on('error', (e) => errs.push(String(e)));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc, beforeParse(w) { w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder;
    let T = THREE;
    if (stub) { class Stub { constructor() { this.domElement = w.document.createElement('canvas'); this.domElement.style.width = '600px'; } setSize() {} setPixelRatio() {} render() {} dispose() {} } T = { ...THREE, WebGLRenderer: Stub }; }
    w.THREE = T; w.print = () => {}; w.URL.createObjectURL = (b) => { saved.push(b); return 'blob:x'; }; w.URL.revokeObjectURL = () => {};
    const ctx = new Proxy({}, { get: (t, k) => { if (k === 'canvas') return {}; if (!(k in t)) t[k] = () => undefined; return t[k]; }, set: (t, k, v) => { t[k] = v; return true; } });
    w.HTMLCanvasElement.prototype.getContext = function () { return ctx; }; w.scrollTo = () => {};
  } });
  return { w: dom.window, d: dom.window.document, errs, saved };
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const ev = (w, el, type, x, y, extra = {}) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra }));
const key = (w, el, k, extra = {}) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
const vis = (d, sel) => d.querySelector('.fg-app .st-tabbody > div:not([hidden]) ' + sel), visAll = (d, sel) => [...d.querySelectorAll('.fg-app .st-tabbody > div:not([hidden]) ' + sel)];
const tabBtn = (d, name) => [...d.querySelectorAll('.fg-app .st-tabs button')].find((b) => b.textContent === name);

async function openForge(stub) { const b = boot(stub); await tick(700); click(b.w, b.d.querySelector('#topnav [data-view="ductile"]')); await tick(100); click(b.w, [...b.d.querySelectorAll('.dx-seg.ws button')].find((x) => x.textContent === 'Forge')); await tick(300); return b; }

test('Forge opens from its tab with a vase already built, and the other sections are untouched', async (t) => {
  const { w, d, errs } = await openForge(); t.after(() => w.close());
  assert.ok(d.querySelector('.fg-app')); assert.equal(d.querySelector('.app').hidden, true); assert.ok(w.__forge, 'forge started');
  assert.equal(d.querySelectorAll('.fg-app .st-tools .st-tool').length, 9); assert.deepEqual([...d.querySelectorAll('.fg-app .st-tabs button')].map((b) => b.textContent), ['Design', 'Parameters', 'Modifiers', 'Edits', 'Print']);
  const m = w.__forge.app.current.mesh; assert.ok(M.stats(m).watertight); assert.match(d.querySelector('.fg-app .st-status').textContent, /closed solid/);
  click(w, d.querySelector('#topnav [data-view="studio"]')); await tick(300); assert.ok(d.querySelector('.st-app:not(.fg-app)')); click(w, d.querySelector('#topnav [data-view="planner"]')); await tick(60); assert.equal(d.querySelector('.app').hidden, false);
  assert.deepEqual(errs, []);
});

test('parameters drive the shape; the profile is edited by dragging points; modifiers and edits are listed', async (t) => {
  const { w, d, errs } = await openForge(); t.after(() => w.close()); const F = w.__forge, app = F.app, store = F.store;
  click(w, tabBtn(d, 'Parameters')); await tick(60); const h0 = Math.max(...app.current.mesh.v.map((v) => v.p[2]));
  const row = [...d.querySelectorAll('.fg-app .st-table tbody tr')].find((tr) => tr.querySelector('input').value === 'H'), inp = row.children[1].querySelector('input'); inp.value = '260'; inp.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(40);
  assert.ok(Math.max(...app.current.mesh.v.map((v) => v.p[2])) > h0 + 70, 'taller after the parameter change');
  // profile editor: drag the rim point outwards, double-click to add, Delete to remove
  const P = F.prof; P.fit(); const n0 = app.body.gen.profile.length, rim = P.resolved()[n0 - 1], s = P.toScreen([rim.x, rim.y]); const cv = P.canvas;
  ev(w, cv, 'pointerdown', s[0], s[1]); ev(w, cv, 'pointermove', s[0] + 30, s[1]); ev(w, cv, 'pointerup', s[0] + 30, s[1]);
  const moved = P.resolved()[n0 - 1]; assert.ok(moved.x > rim.x + 3, 'rim moved out: ' + rim.x + ' -> ' + moved.x);
  const mid = P.toScreen([P.resolved()[2].x + 30, P.resolved()[2].y + 5]); ev(w, cv, 'dblclick', mid[0], mid[1]); assert.equal(app.body.gen.profile.length, n0 + 1);
  P.sel = 3; key(w, cv, 'Delete'); assert.equal(app.body.gen.profile.length, n0);
  assert.ok(M.stats(app.current.mesh).watertight);
  // modifiers
  click(w, tabBtn(d, 'Modifiers')); await tick(40); const sel = vis(d, 'select'); sel.value = 'twist'; click(w, visAll(d, 'button').find((b) => b.textContent === 'Add modifier')); await tick(40);
  assert.equal(app.body.mods.length, 1); assert.equal(app.body.mods[0].type, 'twist'); assert.ok(M.stats(app.current.mesh).watertight); const sm = vis(d, 'select'); sm.value = 'smooth'; click(w, visAll(d, 'button').find((b) => b.textContent === 'Add modifier')); await tick(80); assert.ok(M.stats(app.current.mesh).watertight);
  // design tab: wall thickness field takes an expression
  click(w, tabBtn(d, 'Design')); await tick(40); const wall = visAll(d, '.st-row').find((r) => r.textContent.indexOf('Wall thickness') === 0).querySelector('input'); wall.value = '=wall*2'; wall.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(40); assert.equal(app.body.gen.thickness, '=wall*2');
  assert.deepEqual(errs, []);
});

test('numeric push/pull, edit history, freeze, bodies and print export', async (t) => {
  const { w, d, errs, saved } = await openForge(); t.after(() => w.close()); const F = w.__forge, app = F.app, store = F.store;
  click(w, d.querySelector('.fg-app .st-tool[aria-label="Push / Pull"]')); assert.equal(app.state.tool, 'pull');
  const m0 = app.current.mesh, top = m0.f.map((f, i) => ({ i, z: Math.max(...f.v.map((v) => m0.v[v].p[2])), n: M.faceNormal(m0, i) })).filter((x) => x.n[2] > 0.9).sort((a, b) => b.z - a.z)[0].i;
  app.selectFaces([top], false); const num = d.querySelector('.fg-app .fg-num'); num.value = '14'; key(w, num, 'Enter'); await tick(60); assert.equal(app.body.ops.length, 1); assert.equal(num.value, '');
  num.value = 'oops'; key(w, num, 'Enter'); assert.match(d.querySelector('.fg-app .st-toast').textContent, /number/);
  click(w, tabBtn(d, 'Edits')); await tick(40); assert.match(d.querySelector('.fg-app .st-tabbody').textContent, /Pull \+14/);
  const cb = vis(d, 'input[type=checkbox]'); cb.checked = false; cb.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(30); const hOff = Math.max(...app.current.mesh.v.map((v) => v.p[2])); cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(30); assert.ok(Math.max(...app.current.mesh.v.map((v) => v.p[2])) > hOff + 12);
  click(w, visAll(d, 'button').find((b) => b.textContent === 'Freeze shape')); await tick(20); click(w, [...d.querySelectorAll('.fg-app .st-keys')].find((x) => !x.hidden && x.querySelector('.st-btn.pri')).querySelector('.st-btn.pri')); await tick(60);
  assert.equal(app.body.gen.type, 'mesh'); assert.equal(app.body.ops.length, 0);
  click(w, tabBtn(d, 'Design')); await tick(40); app.addBody('tower'); await tick(60); assert.equal(store.p.bodies.length, 2); assert.equal(app.body.gen.type, 'extrude');
  click(w, tabBtn(d, 'Print')); await tick(120); const txt = d.querySelector('.fg-app .st-tabbody').textContent; assert.match(txt, /Print preview/); assert.match(txt, /closed solid/);
  const btn = (n) => visAll(d, 'button').find((b) => b.textContent.indexOf(n) === 0); click(w, btn('STL')); click(w, btn('3MF')); click(w, btn('STL per body')); click(w, btn('OBJ')); await tick(40); assert.ok(saved.length >= 4); assert.ok(saved.every((b) => b.size > 100));
  const fm = [...d.querySelectorAll('.fg-app .st-top .st-menuitems .st-btn')]; click(w, fm.find((b) => /Save project/.test(b.textContent))); click(w, fm.find((b) => b.textContent === 'Export STL')); assert.ok(saved.length >= 6);
  click(w, fm.find((b) => b.textContent === 'New ribbed vase')); await tick(30); click(w, [...d.querySelectorAll('.fg-app .st-keys')].find((x) => !x.hidden && x.querySelector('.st-btn.pri')).querySelector('.st-btn.pri')); await tick(80); assert.equal(store.p.name, 'Ribbed vase'); assert.equal(app.body.mods.length, 2); assert.ok(M.stats(app.current.mesh).watertight);
  assert.deepEqual(errs, []);
});

test('the 3D viewport: pick, drag a pull in any direction, undo, and box select (stub renderer)', async (t) => {
  const { w, d, errs } = await openForge(true); t.after(() => w.close()); const F = w.__forge, app = F.app, view = F.view; assert.ok(view.ok, 'viewport created'); view.view('front'); view.fit();
  const cv = view.canvas, at = (x, y) => [x, y];
  ev(w, cv, 'pointerdown', 300, 200); ev(w, cv, 'pointerup', 300, 200); assert.equal(app.sel.faces.length, 1, 'clicked a face');
  click(w, d.querySelector('.fg-app .st-tool[aria-label="Move"]')); app.state.dir = 'free'; ev(w, cv, 'pointerdown', 300, 200); ev(w, cv, 'pointermove', 340, 170); assert.ok(!d.querySelector('.fg-hud').hidden, 'amount label shown while dragging'); ev(w, cv, 'pointerup', 340, 170);
  assert.equal(app.body.ops.filter((o) => o.t === 'move').length, 1); app.store.undo(); assert.equal(app.body.ops.length, 0);
  click(w, d.querySelector('.fg-app .st-tool[aria-label="Push / Pull"]')); app.state.dir = 'x'; ev(w, cv, 'pointerdown', 300, 200); ev(w, cv, 'pointermove', 360, 200); ev(w, cv, 'pointerup', 360, 200); assert.ok(app.body.ops.some((o) => o.t === 'extrude' && Array.isArray(o.dir)), 'pulled along X');
  click(w, d.querySelector('.fg-app .st-tool[aria-label="Select"]')); app.clearSel(); ev(w, cv, 'pointerdown', 5, 5); ev(w, cv, 'pointermove', 590, 390); assert.ok(!d.querySelector('.fg-box').hidden); ev(w, cv, 'pointerup', 590, 390); assert.ok(app.sel.faces.length > 10);
  key(w, cv, 'Delete'); await tick(40); assert.ok(app.body.ops.some((o) => o.t === 'delete')); key(w, cv, 'z', { ctrlKey: true }); await tick(30); assert.ok(!app.body.ops.some((o) => o.t === 'delete'));
  key(w, cv, 'g'); assert.equal(app.state.tool, 'move'); key(w, cv, 'p'); assert.equal(app.state.tool, 'pull');
  assert.deepEqual(errs, []);
});
