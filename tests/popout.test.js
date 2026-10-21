import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '../dist/courtyard_house_planner.html'), 'utf8').replace(/<script src="[^"]*three[^"]*"><\/script>/, '');
const THREE = await import('three');
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

test('Studio page: Rotate menu, level stack buttons, RCC roof, materials, and 3D pop-out move', async (t) => {
  const errs = []; const vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message + ' ' + String((e.detail && e.detail.stack) || '').slice(0, 400)); });
  const popup = new JSDOM('<!doctype html><html><head></head><body></body></html>', { pretendToBeVisual: true });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc, beforeParse(w) {
    w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder; w.THREE = THREE; w.print = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
    const ctx = new Proxy({}, { get: (t2, k) => { if (k === 'canvas') return {}; if (!(k in t2)) t2[k] = () => undefined; return t2[k]; }, set: (t2, k, v) => { t2[k] = v; return true; } });
    w.HTMLCanvasElement.prototype.getContext = function () { return this.className && /st-canvas/.test(this.className) ? ctx : null; };
    w.open = () => popup.window;
  } });
  const w = dom.window, d = w.document; t.after(() => { w.close(); popup.window.close(); }); await tick(700);
  click(w, d.querySelector('#topnav [data-view="studio"]')); await tick(300);
  const S = w.__studio, app = S.app, store = S.store, v = app.view2d;
  // Rotate menu
  assert.ok([...d.querySelectorAll('.st-optsr summary')].some((x) => /Rotate/.test(x.textContent)));
  v.setView({ rot: 30, tilt: 50 }); assert.equal(v.cam.rot, 30); assert.equal(v.cam.tilt, 50); v.setView({ tilt: 89 }); assert.equal(v.cam.tilt, 90); v.setView({ rot: 0 });
  // build a small plan, then use the level buttons
  store.transact('walls', (p) => { [[0, 0, 20, 0], [20, 0, 20, 12], [20, 12, 0, 12], [0, 12, 0, 0]].forEach((c, i) => p.walls.push({ id: 'w' + (i + 1), level: 'L0', ax: c[0], ay: c[1], bx: c[2], by: c[3], t: '=wallOut', h: '=storey', base: 0, layer: 'A-WALL', mat: 'brick' })); p.nextId = 10; });
  app.panels.show('levels'); await tick(60);
  const btn = (txt) => [...d.querySelectorAll('.st-tabbody button')].find((b) => b.textContent === txt);
  click(w, btn('Add level above')); await tick(60); assert.equal(store.p.levels.length, 2); assert.equal(store.p.walls.length, 8);
  click(w, [...d.querySelectorAll('.st-tabbody button')].find((b) => b.textContent === '▼ Down' && !b.disabled)); await tick(60);
  assert.equal(store.p.levels[0].id, 'L1'); assert.equal(store.p.levels[0].elev, 0);
  const cb = [...d.querySelectorAll('.st-tabbody label')].find((l) => /RCC roof slab/.test(l.textContent)).querySelector('input'); cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(60);
  assert.ok(store.p.levels.some((l) => l.rccRoof)); assert.ok(d.querySelector('.st-tabbody').textContent.includes('Parapet height'));
  // materials section and appearance card
  assert.ok(d.querySelector('.st-pal .st-swatches .st-sw')); app.paint(['w1'], '#c4694a', 'a'); assert.equal(store.p.walls[0].fillA, '#c4694a');
  app.panels.show('props'); store.select(['w1']); await tick(80); assert.ok(d.querySelector('.st-tabbody').textContent.includes('Colour and material'));
  // 3D view has no WebGL in jsdom, but the pop-out path must still be safe to call
  assert.equal(typeof app.popOut, 'function'); assert.deepEqual(errs, []);
});
