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
test('glass house, outside block on sheets and plumbing, comparison view, uPVC windows and wood', async (t) => {
  const errs = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc, beforeParse(w) { w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder; class Stub { constructor(o) { this.domElement = (o && o.canvas) || w.document.createElement('canvas'); } setSize() {} setPixelRatio() {} setClearColor() {} render() {} dispose() {} } w.THREE = { ...THREE, WebGLRenderer: Stub }; w.scrollTo = () => {}; w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (tt, k) => (k === 'canvas' ? {} : k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true }); }; } });
  const w = dom.window, d = w.document, ST = () => w.__ed.ST, C = w.__core; t.after(() => w.close()); await tick(800);
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), total = () => C.costFor(C.planFor(ST()), ST(), ST().sys, ST().finish, ST().region).total, mat = () => d.getElementById('matCard').textContent;
  // ---- glass house
  click([...d.querySelectorAll('#segSys button')].find((b) => b.getAttribute('data-v') === 'brick')); await tick(60); const t0 = total();
  click(d.querySelector('#segWallOut [data-v="glass"]')); await tick(150);
  assert.equal(ST().wallOut, 'glass'); assert.notEqual(ST().sys, 'brick', 'switched to a column frame'); assert.ok(d.querySelector('#segSys [data-v="brick"]').disabled, 'load-bearing brick unavailable with glass');
  assert.match(d.getElementById('plan').innerHTML, /stroke="var\(--glass\)"/); assert.match(d.getElementById('bars').textContent, /Walls: glass outside/); assert.match(mat(), /Toughened glass 12 mm/); assert.match(mat(), /Aluminium frame/); assert.ok(total() > t0, 'glass costs more');
  const glassSheet = C.buildSheets(ST(), ST().sys, 150, 'T')[0].svg; assert.match(glassSheet, /12 MM GLASS OUTER/);
  click(d.querySelector('#segWallOut [data-v="brick"]')); await tick(100);
  // ---- outside block on the sheets and in plumbing
  ST().svc = { plumb: true, elec: false, tanks: true }; click([...d.querySelectorAll('#segExtra button')].find((b) => b.getAttribute('data-k') === 'wetOut')); await tick(300);
  const sheets = C.buildSheets(ST(), ST().sys, 150, 'T'), by = (id) => sheets.find((x) => x.id === id).svg;
  assert.match(by('A-1'), /BATH AND WC BLOCK/); assert.match(by('S-1'), /BATH BLOCK: 450 MM STRIP FOOTING/); assert.match(by('P-1'), /BATH AND WC BLOCK/); assert.match(by('A-1'), /MAIN ENTRANCE \(NORTH\)/);
  const sv = C.servicesData(C.planFor(ST()), ST()); assert.ok(sv.counts.wc >= 1 && sv.counts.shower >= 1, 'block fixtures in the plumbing'); assert.ok(sv.minX < C.planFor(ST()).outhouse.x0 + 0.01, 'plumbing reaches the block');
  // ---- comparison view
  const cmp = () => d.getElementById('cmpCard'); assert.ok(cmp().querySelector('table'), 'comparison table');
  const selB = (k, v) => { const s = cmp().querySelector('select[data-ck="' + k + '"]'); s.value = v; s.dispatchEvent(new w.Event('change', { bubbles: true })); };
  selB('wallIn', 'gyp'); await tick(60); const row = [...cmp().querySelectorAll('tr')].find((r) => /Gypsum boards/.test(r.textContent)); assert.ok(row, 'gypsum row appears for B');
  const cells = row.querySelectorAll('td'); assert.equal(cells[2].textContent, '0', 'A has none'); assert.ok(+cells[3].textContent.replace(/,/g, '') > 0, 'B has some'); assert.match(cells[4].className, /cmp-more/);
  const rate = row.querySelector('input[data-rk="gypsheet"]'), costB0 = cells[7].textContent; rate.value = '900'; rate.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(40);
  const row2 = [...cmp().querySelectorAll('tr')].find((r) => /Gypsum boards/.test(r.textContent)); assert.notEqual(row2.querySelectorAll('td')[7].textContent, costB0, 'price edit changes cost B'); assert.equal(ST().matRates.gypsheet, 900);
  assert.match(cmp().textContent, /Whole estimate/); assert.match(cmp().textContent, /Build time/);
  const sb = cmp().querySelector('select[data-cs="winFrame"]'); sb.value = 'upvc'; sb.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(40); assert.ok([...cmp().querySelectorAll('tr')].some((r) => /uPVC windows/.test(r.textContent)), 'uPVC windows compared');
  click(d.getElementById('cmpUse')); await tick(200); assert.equal(ST().wallIn, 'gyp'); assert.equal(ST().spec.winFrame, 'upvc');
  // ---- windows and wood
  assert.deepEqual([...d.querySelectorAll('#segWinF button')].map((b) => b.getAttribute('data-sv')), ['wood', 'upvc', 'alu', 'steel']); assert.equal(d.querySelector('#segWinF [data-sv="upvc"]').getAttribute('aria-pressed'), 'true');
  assert.match(mat(), /uPVC windows/); assert.match(d.getElementById('winHint').textContent, /uPVC frames/);
  click(d.querySelector('#segWinF [data-sv="wood"]')); await tick(100); click(d.querySelector('#segWood [data-sv="sal"]')); await tick(100); const tSal = total();
  click(d.querySelector('#segWood [data-sv="teak"]')); await tick(100); assert.ok(total() > tSal, 'teak costs more than sal'); assert.match(mat(), /Wood for window frames and shutters \(teak\)/); assert.match(mat(), /cft/);
  click(d.querySelector('#segMainD [data-sv="steel"]')); await tick(100); assert.match(mat(), /Steel safety main door/);
  assert.deepEqual(errs, []);
});
