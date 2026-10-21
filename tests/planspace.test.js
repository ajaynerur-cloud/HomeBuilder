import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '../dist/courtyard_house_planner.html'), 'utf8').replace(/<script src="[^"]*three[^"]*"><\/script>/, '');
const THREE = await import('three');
function boot(hash = '', popup = null) {
  const errs = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/' + hash, virtualConsole: vc, beforeParse(w) {
    w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder;
    class Stub { constructor(o) { this.domElement = (o && o.canvas) || w.document.createElement('canvas'); } setSize() {} setPixelRatio() {} setClearColor() {} render() {} dispose() {} }
    w.THREE = { ...THREE, WebGLRenderer: Stub }; w.scrollTo = () => {}; w.print = () => {}; w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
    w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, k) => (k === 'canvas' ? {} : () => undefined) }); };
    w.open = (u) => { w.__opened = u; return popup; };
  } });
  return { w: dom.window, d: dom.window.document, errs };
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
test('settings scroll on their own; plan workspace opens, keeps every control working, and restores the page', async (t) => {
  const { w, d, errs } = boot(); t.after(() => w.close()); await tick(700);
  const css = [...d.querySelectorAll('style')].map((s) => s.textContent).join(''); assert.match(css, /\.app \.controls\{max-height:calc\(100vh - 92px\);overflow-y:auto/, 'settings panel scrolls independently');
  const controls = d.querySelector('.app .controls'), parent0 = controls.parentNode, next0 = controls.nextSibling, editBar = d.getElementById('editBar'), editParent0 = editBar.parentNode;
  const openB = [...d.querySelectorAll('.pw-entry button')].find((b) => b.textContent === 'Open plan workspace'); assert.ok(openB, 'entry button on the plan card');
  click(w, openB); await tick(60); const ov = d.querySelector('.pw[aria-label="Plan workspace"]');
  assert.equal(ov.hidden, false); assert.ok(d.body.classList.contains('planfocus')); assert.ok(ov.querySelector('.pw-main #plan'), 'plan fills the workspace'); assert.ok(ov.querySelector('.pw-side #editBar'), 'drawing tools beside it'); assert.ok(ov.querySelector('.pw-side .controls'), 'design settings beside it');
  // a design change inside the workspace still re-draws the plan
  const before = d.getElementById('plan').innerHTML.length; const bed = [...ov.querySelectorAll('.controls button')].find((b) => b.textContent.trim() === '3' && b.closest('.seg')); click(w, bed); await tick(80);
  assert.notEqual(d.getElementById('plan').innerHTML.length, before, 'changing bedrooms in the side panel re-drew the plan');
  // plain wheel zooms inside the workspace
  const svg = d.querySelector('#plan svg'), vb0 = svg.getAttribute('viewBox'); svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });
  d.getElementById('plan').dispatchEvent(new w.WheelEvent('wheel', { deltaY: -100, clientX: 400, clientY: 300, bubbles: true, cancelable: true })); assert.notEqual(d.querySelector('#plan svg').getAttribute('viewBox'), vb0, 'wheel zoom without Ctrl');
  // switch to 3D and back
  click(w, [...ov.querySelectorAll('.pw-seg button')].find((b) => b.textContent === '3D model')); assert.ok(ov.querySelector('.pw-main #v3d')); assert.ok(!ov.querySelector('.pw-main #plan'));
  click(w, [...ov.querySelectorAll('.pw-seg button')].find((b) => b.textContent === 'Floor plan')); assert.ok(ov.querySelector('.pw-main #plan'));
  // Escape closes and everything goes back exactly where it was
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick(40);
  assert.equal(ov.hidden, true); assert.ok(!d.body.classList.contains('planfocus')); assert.equal(controls.parentNode, parent0); assert.equal(controls.nextSibling, next0); assert.equal(editBar.parentNode, editParent0); assert.ok(!d.querySelector('.pw-main #plan'));
  // new window: blocked popup falls back to the in-page workspace with a note
  click(w, [...d.querySelectorAll('.pw-entry button')].find((b) => b.textContent === 'New window')); await tick(20); assert.match(w.__opened, /#planwindow$/); assert.equal(ov.hidden, false); assert.match(d.querySelector('.pw-note').textContent, /blocked/);
  // switching to Ductile closes the workspace
  click(w, d.querySelector('#topnav [data-view="ductile"]')); await tick(60); assert.equal(ov.hidden, true); assert.equal(controls.parentNode, parent0);
  // another window saving the design offers a reload
  const se = new w.Event('storage'); Object.defineProperty(se, 'key', { value: 'chp_state_v7' }); w.dispatchEvent(se); assert.ok(d.getElementById('pwSync'), 'reload offer shown');
  assert.deepEqual(errs, []);
});
test('a page opened as the separate window starts in the plan workspace', async (t) => {
  const { w, d, errs } = boot('#planwindow'); t.after(() => w.close()); await tick(800);
  assert.equal(d.querySelector('.pw[aria-label="Plan workspace"]').hidden, false); assert.ok(d.querySelector('.pw-main #plan')); assert.deepEqual(errs, []);
});
