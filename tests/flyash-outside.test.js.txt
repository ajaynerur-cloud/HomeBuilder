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
test('fly-ash brick walls, and the bath and WC in a separate block outside the house', async (t) => {
  const errs = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc, beforeParse(w) { w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder; class Stub { constructor(o) { this.domElement = (o && o.canvas) || w.document.createElement('canvas'); } setSize() {} setPixelRatio() {} setClearColor() {} render() {} dispose() {} } w.THREE = { ...THREE, WebGLRenderer: Stub }; w.scrollTo = () => {}; w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (tt, k) => (k === 'canvas' ? {} : k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true }); }; } });
  const w = dom.window, d = w.document, ST = () => w.__ed.ST, C = w.__core; t.after(() => w.close()); await tick(800);
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), total = () => C.costFor(C.planFor(ST()), ST(), ST().sys, ST().finish, ST().region).total, mat = () => d.getElementById('matCard').textContent;
  // fly-ash brick, outside and inside
  assert.deepEqual([...d.querySelectorAll('#segWallOut button')].map((b) => b.getAttribute('data-v')), ['brick', 'fly', 'aac', 'glass']); assert.deepEqual([...d.querySelectorAll('#segWallIn button')].map((b) => b.getAttribute('data-v')), ['brick', 'fly', 'aac', 'gyp', 'glass', 'wpc']);
  const t0 = total(); click(d.querySelector('#segWallOut [data-v="fly"]')); await tick(60); click(d.querySelector('#segWallIn [data-v="fly"]')); await tick(100);
  assert.ok(total() < t0, 'fly-ash is cheaper than clay brick'); assert.match(d.getElementById('bars').textContent, /Walls: fly-ash brick outside, fly-ash brick inside/);
  assert.match(mat(), /Fly-ash bricks, outer and courtyard walls/); assert.match(mat(), /Fly-ash 230 × 100 × 75 mm/); assert.match(mat(), /Fly-ash bricks, inner walls/);
  assert.ok(![...d.getElementById('matBrick').options].some((o) => o.value === 'fly'), 'clay size list leaves fly-ash out');
  // bath and WC outside
  const wet = [...d.querySelectorAll('#segExtra button')].find((b) => b.getAttribute('data-k') === 'wetOut'); assert.ok(wet, 'option offered'); click(wet); await tick(300);
  assert.equal(ST().wetOut, true); assert.equal(ST().att, 0); assert.ok(d.querySelector('#segAtt [data-v="1"]').disabled, 'attached baths off');
  const pl = C.planFor(ST()); assert.ok(!pl.rooms.some((r) => r.t === 'wet' && !r.hidden), 'no bath or WC indoors'); assert.ok(pl.rooms.some((r) => r.key === 'util'), 'wash and utility room'); assert.ok(pl.outhouse && pl.outhouse.x1 < 0, 'block on the west side');
  assert.match(d.getElementById('plan').innerHTML, /Bath and WC block, \d+ ft path/); assert.match(d.getElementById('wetNote').textContent, /west side/); assert.match(d.getElementById('bars').textContent, /Bath and WC block outside/);
  // with a west entrance the block moves to the south side
  click([...d.querySelectorAll('#segFace button')].find((b) => b.getAttribute('data-v') === 'W')); await tick(600); assert.match(d.getElementById('wetNote').textContent, /south side/); assert.ok(C.planFor(ST()).outhouse.x1 < 0, 'local west of a west-facing plan is true south');
  click([...d.querySelectorAll('#segFace button')].find((b) => b.getAttribute('data-v') === 'E')); await tick(600); assert.ok(C.planFor(ST()).outhouse.y0 > C.planFor(ST()).D, 'east entrance: block at the bottom, which is true west');
  // switching it off brings the baths back inside
  click(wet); await tick(300); assert.equal(ST().wetOut, false); assert.ok(C.planFor(ST()).rooms.some((r) => r.t === 'wet'), 'baths back indoors'); assert.ok(!/Bath and WC block/.test(d.getElementById('plan').innerHTML));
  assert.deepEqual(errs, []);
});
