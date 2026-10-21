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
test('draw walls to a set length, measure, and construction marker points', async (t) => {
  const errs = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc, beforeParse(w) {
    w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder; class Stub { constructor(o) { this.domElement = (o && o.canvas) || w.document.createElement('canvas'); } setSize() {} setPixelRatio() {} setClearColor() {} render() {} dispose() {} }
    w.THREE = { ...THREE, WebGLRenderer: Stub }; w.scrollTo = () => {}; w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (tt, k) => (k === 'canvas' ? {} : k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true }); };
    const I = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return I; } }; w.SVGElement.prototype.getScreenCTM = () => I; w.SVGElement.prototype.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } });
  } });
  const w = dom.window, d = w.document, E = () => w.__ed, ST = () => w.__ed.ST; t.after(() => w.close()); await tick(800);
  const C = w.__core, pl = () => C.planFor(ST()), parts = () => pl().parts || pl().rooms.filter((r) => r.t !== 'court' && r.t !== 'corr' && !r.hidden), at = (fx, fy) => { const P = E().pv(); return [P.mx + fx * P.s, P.my === undefined ? P.mt + fy * P.s : 0]; };
  const down = (fx, fy) => { const [x, y] = at(fx, fy), tgt = d.querySelector('#plan svg') || d.getElementById('plan'); tgt.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button: 0 })); d.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: x, clientY: y })); };
  const move = (fx, fy) => { const [x, y] = at(fx, fy), tgt = d.querySelector('#plan svg'); tgt.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y })); };
  const mode = (v) => [...d.querySelectorAll('#segEdit button')].find((b) => b.getAttribute('data-v') === v).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  // lengths in feet-inches, decimals and metric
  const P = E().dtParse; assert.equal(P("10' 6\""), 10.5); assert.equal(P('10.5'), 10.5); assert.ok(Math.abs(P('3.2m') - 10.4987) < 1e-3); assert.equal(P('18in'), 1.5); assert.ok(isNaN(P('ten')));
  assert.ok([...d.querySelectorAll('#segEdit button')].some((b) => b.textContent === 'Draw wall') && [...d.querySelectorAll('#segEdit button')].some((b) => b.textContent === 'Marker points'));
  // pick a room and draw a short partial wall inside it by two clicks
  const room = parts().filter((q) => q.w >= 8 && q.h >= 6)[0]; assert.ok(room, 'a room to draw in'); const cost0 = E().costFor(pl(), ST(), ST().sys, ST().finish, ST().region).total, units0 = pl().units.length;
  mode('draw'); assert.equal(d.getElementById('dtRow').style.display, 'flex');
  const x0 = room.x + 2, y0 = room.y + room.h / 2; down(x0, y0); move(x0 + 4, y0 + 0.2); assert.ok(d.getElementById('dtools'), 'preview drawn'); down(x0 + 4, y0 + 0.2);
  assert.ok(pl().units.length > units0, 'wall units added'); const fw = (ST().edits.ops || []).filter((o) => o.t === 'fw'); assert.equal(fw.length, 1); assert.equal(fw[0].o, 'H'); assert.equal(fw[0].a1 - fw[0].a0, 4, 'four feet long');
  assert.ok(E().costFor(pl(), ST(), ST().sys, ST().finish, ST().region).total > cost0, 'the new wall is in the cost');
  // type a length after the first click
  down(x0, y0 + 2); const L = d.getElementById('dtLen'); move(x0 + 3, y0 + 2); L.value = "3' 6\""; L.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const fw2 = (ST().edits.ops || []).filter((o) => o.t === 'fw'); assert.equal(fw2.length, 2); assert.equal(fw2[1].a1 - fw2[1].a0, 3.5, 'typed 3 ft 6 in');
  // a wall right across a room becomes a split
  const rooms0 = pl().rooms.filter((r) => !r.hidden).length, big = parts().filter((q) => q.w >= 10 && q.h >= 6).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  E().dtCommitWall(E().dtSegment({ x: big.x, y: big.y + Math.round(big.h)/2 }, { x: big.x + big.w, y: big.y + Math.round(big.h)/2 }, null)); assert.ok(pl().rooms.filter((r) => !r.hidden).length > rooms0, 'room split into two');
  // markers: by click, by coordinates, by offset; walls snap to them
  mode('marker'); down(room.x + 1, room.y + 1); assert.equal(ST().markers.length, 1); assert.equal(ST().markers[0].n, 'A');
  d.getElementById('dtMx').value = "5'"; d.getElementById('dtMy').value = '6'; d.getElementById('dtAddXY').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); assert.equal(ST().markers.length, 2); assert.deepEqual([ST().markers[1].x, ST().markers[1].y], [5, 6]);
  d.getElementById('dtFrom').value = ST().markers[1].id; d.getElementById('dtDist').value = "10'"; d.getElementById('dtDir').value = 'E'; d.getElementById('dtAddOff').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); assert.deepEqual([ST().markers[2].x, ST().markers[2].y], [15, 6], 'marker C is 10 ft east of B');
  assert.ok(JSON.parse(w.localStorage.getItem('chp_state_v7')).markers.length === 3, 'markers saved with the design');
  // measure between B and C (clicks near them snap onto them)
  mode('measure'); down(5.15, 6.1); down(14.9, 5.9); assert.equal(E().DT.measures.length, 1); const ms = E().DT.measures[0]; assert.equal(Math.hypot(ms.b.x - ms.a.x, ms.b.y - ms.a.y), 10, 'snapped to the markers: exactly 10 ft'); assert.match(d.getElementById('dtRow').textContent, /10' 0"/);
  // undo removes the last wall
  const nOps = (ST().edits.ops || []).length; d.getElementById('edUndo').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); assert.ok(((ST().edits && ST().edits.ops) || []).length < nOps, 'undo');
  assert.deepEqual(errs, []);
});
