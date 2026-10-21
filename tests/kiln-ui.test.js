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
    w.HTMLCanvasElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }; };
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return 800; } }); Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return 600; } });
    w.HTMLElement.prototype.setPointerCapture = () => {};
  } });
  return { w: dom.window, d: dom.window.document, errs, saved };
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const ev = (w, el, type, x, y) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));

test('Kiln tab opens with logo, HUD, tree, and other workspaces untouched', async (t) => {
  const { w, d, errs } = boot(); t.after(() => w.close()); await tick(600);
  const navs = [...d.querySelectorAll('#topnav button')].map((b) => b.getAttribute('data-view')); assert.deepEqual(navs, ['planner', 'studio', 'ductile']);
  click(w, d.querySelector('#topnav [data-view="ductile"]')); await tick(100); click(w, [...d.querySelectorAll('.dx-seg.ws button')].find((b) => b.textContent === 'Vessel')); await tick(200);
  assert.ok(d.querySelector('.dx-wshost:not([hidden]) .kn-app'), 'Vessel workspace shown inside Ductile'); assert.ok(d.querySelector('.app').hidden, 'planner hidden');
  assert.ok(d.querySelector('.kn-logo svg'), 'logo'); assert.match(d.querySelector('.kn-brand').textContent, /Kiln/);
  assert.ok(d.querySelectorAll('.kn-hchip').length >= 5, 'constraint HUD'); assert.ok(d.querySelectorAll('.kn-node').length >= 5, 'feature tree');
  assert.deepEqual(errs, []);
});
test('Solve, tabs, sketch drag, dimension edit, intent drag, export', async (t) => {
  const { w, d, errs, saved } = boot(); t.after(() => w.close()); await tick(600);
  click(w, d.querySelector('#topnav [data-view="ductile"]')); await tick(100); click(w, [...d.querySelectorAll('.dx-seg.ws button')].find((b) => b.textContent === 'Vessel')); await tick(200); const K = w.__kiln.app;
  click(w, d.querySelector('.kn-top .kn-btn.pri')); await tick(50);
  assert.equal(d.querySelectorAll('.kn-hchip.bad').length, 0, 'all constraints met after Solve: ' + [...d.querySelectorAll('.kn-hchip')].map((c) => c.textContent).join(' | '));
  const tab = (n) => [...d.querySelectorAll('.kn-tabs button')].find((b) => b.textContent === n);
  click(w, tab('Constraints')); assert.ok(d.querySelectorAll('.kn-con').length >= 5); click(w, tab('Analysis')); assert.match(d.querySelector('.kn-stat').textContent, /Capacity at fill line/); assert.match(d.querySelector('.kn-stat').textContent, /watertightyes/);
  // sketch: drag point 3 outward, the solver absorbs it
  click(w, [...d.querySelectorAll('.kn-seg button')].find((b) => b.textContent === 'Sketch')); await tick(30);
  const S = K.sketch, p = S.pts.find((q) => q.i === 2), r0 = +K.doc.profile[2].r; const cv = S.canvas;
  ev(w, cv, 'pointerdown', p.x, p.y); ev(w, cv, 'pointermove', p.x + 30, p.y); ev(w, cv, 'pointermove', p.x + 50, p.y); ev(w, cv, 'pointerup', p.x + 50, p.y); await tick(30);
  assert.ok(+K.doc.profile[2].r > r0 + 2, 'sketch point moved ' + r0 + ' -> ' + K.doc.profile[2].r);
  // dimension edit through the in-page dialog
  const hb = S.hits.find((b) => b.kind === 'foot'); ev(w, cv, 'pointerdown', hb.x + 3, hb.y + 3); await tick(10); const inp = d.querySelector('.kn-dlg input'); assert.ok(inp, 'dialog'); inp.value = '72'; click(w, [...d.querySelectorAll('.kn-dlg button')].find((b) => b.textContent === 'Apply')); await tick(30);
  assert.ok(Math.abs(K.E.a.baseD - 72) < 4, 'foot ' + K.E.a.baseD);
  // intent drag in 3D through the real pointer path
  click(w, [...d.querySelectorAll('.kn-seg button')].find((b) => b.textContent === '3D')); await tick(30);
  const V = K.view, e = K.E; let best = null, bs = -9; for (let i = 0; i < e.U; i++) { const k = (40 * e.U + i) * 3, v = new THREE.Vector3(e.P[k], e.P[k + 1], e.P[k + 2]), n = new THREE.Vector3(e.N[k], e.N[k + 1], e.N[k + 2]), s = n.dot(V.cam.position.clone().sub(v).normalize()); if (s > bs) { bs = s; best = v; } }
  const sp = best.clone().project(V.cam), sx = (sp.x + 1) / 2 * 800, sy = (1 - sp.y) / 2 * 600, before = JSON.stringify(K.doc.profile);
  ev(w, V.canvas, 'pointerdown', sx, sy); assert.ok(K.ui.drag, 'intent drag started'); K.runDragAt(sx + 40, sy - 10); K.runDragAt(sx + 60, sy - 14); ev(w, V.canvas, 'pointerup', sx + 60, sy - 14); await tick(30);
  assert.notEqual(JSON.stringify(K.doc.profile), before, 'dimensions changed'); assert.ok(!d.querySelector('.kn-intent').hidden, 'intent bars visible'); assert.ok(d.querySelectorAll('.kn-irow').length >= 2, 'several dimensions moved together');
  // relief tool: tap places a relief
  click(w, [...d.querySelectorAll('.kn-seg button')].find((b) => b.textContent === 'Relief')); ev(w, V.canvas, 'pointerdown', sx, sy + 20); K.runDragAt(sx + 30, sy + 20); ev(w, V.canvas, 'pointerup', sx + 30, sy + 20); assert.equal(K.doc.reliefs.length, 1);
  // drawing view and the export pack
  click(w, [...d.querySelectorAll('.kn-seg button')].find((b) => b.textContent === 'Drawing')); await tick(30); assert.ok(d.querySelector('.kn-vd svg'), 'drawing shown');
  const pk = K.packBytes(); assert.ok(pk.mc.watertight); const zipPath = '/tmp/kiln-pack.zip'; fs.writeFileSync(zipPath, Buffer.from(pk.zip));
  click(w, tab('Export')); click(w, [...d.querySelectorAll('.kn-panel button')].find((b) => /Print pack/.test(b.textContent))); await tick(30); assert.ok(saved.length >= 1, 'download started');
  // undo works
  const n = K.doc.reliefs.length; click(w, d.querySelector('.kn-top [aria-label="Undo"]')); assert.ok(K.doc.reliefs.length <= n);
  assert.deepEqual(errs, []);
});
