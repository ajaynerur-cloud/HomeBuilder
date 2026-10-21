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
test('gypsum and AAC walls, and budget plans that bring 800 and 1,100 sq ft under 20 lakh', async (t) => {
  const errs = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc, beforeParse(w) { w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder; class Stub { constructor(o) { this.domElement = (o && o.canvas) || w.document.createElement('canvas'); } setSize() {} setPixelRatio() {} setClearColor() {} render() {} dispose() {} } w.THREE = { ...THREE, WebGLRenderer: Stub }; w.scrollTo = () => {}; w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (tt, k) => (k === 'canvas' ? {} : k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true }); }; } });
  const w = dom.window, d = w.document, ST = () => w.__ed.ST, lakhs = () => parseFloat(d.getElementById('tot').textContent.replace(/[^\d.]/g, '')); t.after(() => w.close()); await tick(800);
  const C = w.__core, total = (S) => C.costFor(C.planFor(S), S, S.sys, S.finish, S.region).total;
  // defaults keep brick walls and today's estimate
  assert.equal(ST().wallOut, 'brick'); assert.equal(ST().wallIn, 'brick'); assert.ok(Math.abs(total({ ...ST(), area: 800 }) / 1e5 - 23.2) < 0.06, 'default 800 sq ft estimate unchanged');
  assert.deepEqual([...d.querySelectorAll('#segWallOut button')].map((b) => b.getAttribute('data-v')), ['brick', 'fly', 'aac', 'glass']); assert.deepEqual([...d.querySelectorAll('#segWallIn button')].map((b) => b.getAttribute('data-v')), ['brick', 'fly', 'aac', 'gyp', 'glass', 'wpc']);
  // dry partitions work with every structure; with load-bearing brick a truss over each one is added
  click(w, [...d.querySelectorAll('#segSys button')].find((b) => b.getAttribute('data-v') === 'brick')); await tick(60);
  assert.ok(!d.querySelector('#segWallIn [data-v="gyp"]').disabled, 'gypsum allowed with load-bearing brick');
  click(w, d.querySelector('#segWallIn [data-v="gyp"]')); await tick(80); assert.equal(ST().wallIn, 'gyp'); assert.match(d.getElementById('bars').textContent, /Steel roof trusses over dry partitions/); assert.match(d.getElementById('wallsHint').textContent, /steel truss/);
  click(w, [...d.querySelectorAll('#segSys button')].find((b) => b.getAttribute('data-v') === 'ms')); await tick(60); assert.ok(!/trusses/.test(d.getElementById('bars').textContent));
  click(w, d.querySelector('#segWallIn [data-v="brick"]')); await tick(60); const before = total(ST());
  click(w, d.querySelector('#segWallOut [data-v="aac"]')); await tick(40); click(w, d.querySelector('#segWallIn [data-v="gyp"]')); await tick(80);
  assert.equal(ST().wallOut, 'aac'); assert.equal(ST().wallIn, 'gyp'); assert.ok(total(ST()) < before, 'AAC outside + gypsum inside is cheaper: ' + before + ' -> ' + total(ST())); assert.match(d.getElementById('tot').textContent, /lakh|L/i);
  assert.match(d.getElementById('meta').textContent, /gypsum boards/); assert.match(d.getElementById('meta').textContent, /AAC blocks/);
  assert.match(d.getElementById('bars').textContent, /Walls: AAC outside, gypsum board inside/); assert.match(d.getElementById('wallsHint').textContent, /moisture-resistant/i);
  // materials card follows the choices: MS frame, spacing, WPC thickness, brick size
  const mat = () => d.getElementById('matCard').textContent; assert.match(mat(), /Gypsum boards 1220 × 2440 × 12.5 mm/); assert.match(mat(), /MS square tube 40 × 40 × 2.0 mm/); assert.match(mat(), /Weld joints/);
  click(w, d.querySelector('#segWallIn [data-v="wpc"]')); await tick(80); const tube = d.getElementById('matTube'); tube.value = '25x25x1.6'; tube.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(60);
  const wpcSel = d.getElementById('matWpc'); wpcSel.value = '18'; wpcSel.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(60); const sp = d.getElementById('matSp'); sp.value = '400'; sp.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(60);
  assert.match(mat(), /WPC boards 1220 × 2440 × 18 mm/); assert.match(mat(), /MS square tube 25 × 25 × 1.6 mm/); assert.match(mat(), /at 400 mm centres/); assert.match(mat(), /stitch weld/); assert.ok(!/plaster and paint/i.test('') );
  click(w, d.querySelector('#segWallIn [data-v="brick"]')); await tick(60); click(w, d.querySelector('#segWallOut [data-v="brick"]')); await tick(60);
  const b1 = ST(), nConv = C.costFor(C.planFor(b1), b1, b1.sys, b1.finish, b1.region).mat.bricks; const bs = d.getElementById('matBrick'); bs.value = 'mod'; bs.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(60);
  assert.match(mat(), /Modular 190 × 90 × 90 mm/); assert.notEqual(C.costFor(C.planFor(ST()), ST(), ST().sys, ST().finish, ST().region).mat.bricks, nConv, 'brick size changes the count'); assert.match(mat(), /Cement \(50 kg bags\)/);
  click(w, d.querySelector('#segWallOut [data-v="aac"]')); await tick(40); click(w, d.querySelector('#segWallIn [data-v="gyp"]')); await tick(80);
  // jagali seating ledges are off by default
  assert.equal(ST().jag.ledges, false);
  // budget box, Fit my budget, apply
  assert.match(d.querySelector('.bud-st').textContent, /Over budget/); click(w, d.getElementById('budFit')); await tick(20);
  const plans = d.querySelectorAll('.bud-plan'); assert.ok(plans.length >= 1, 'plans offered'); click(w, plans[0].querySelector('button')); await tick(120);
  assert.ok(total(ST()) <= 20e5, 'applied plan is under 20 lakh: ' + total(ST())); assert.match(d.querySelector('.bud-st').textContent, /Under budget/);
  // one-click buttons for 800 and 1,100 sq ft
  for (const a of ['800', '1100']) { click(w, d.querySelector('.budget button[data-a="' + a + '"]')); await tick(160); assert.equal(ST().area, +a); assert.ok(total(ST()) <= 20e5, a + ' sq ft under 20 lakh: ' + total(ST())); assert.match(d.getElementById('budOut').textContent, /Applied the plan/); }
  // a budget too low says so plainly
  const bi = d.getElementById('budIn'); bi.value = '8'; bi.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(80); click(w, d.getElementById('budFit')); await tick(20); assert.match(d.getElementById('budOut').textContent, /Even the leanest choices/);
  assert.deepEqual(errs, []);
});
