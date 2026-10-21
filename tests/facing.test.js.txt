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
test('entrance faces north, east or west (never south) and Vastu follows the true compass', async (t) => {
  const errs = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc, beforeParse(w) { w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder; class Stub { constructor(o) { this.domElement = (o && o.canvas) || w.document.createElement('canvas'); } setSize() {} setPixelRatio() {} setClearColor() {} render() {} dispose() {} } w.THREE = { ...THREE, WebGLRenderer: Stub }; w.scrollTo = () => {}; w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (tt, k) => (k === 'canvas' ? {} : k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true }); }; } });
  const w = dom.window, d = w.document, ST = () => w.__ed.ST, C = w.__core; t.after(() => w.close()); await tick(800);
  const btns = [...d.querySelectorAll('#segFace button')]; assert.deepEqual(btns.map((b) => b.getAttribute('data-v')), ['N', 'E', 'W'], 'no south entrance offered'); assert.equal(ST().facing, 'N');
  const northPlan = JSON.stringify(C.planFor(ST()).rooms.map((r) => [r.key, r.x, r.y, r.w, r.h]));
  assert.match(d.getElementById('faceHint').textContent, /South entrances are not offered/); assert.match(d.getElementById('planNote').textContent, /^North is up/);
  const sched = () => d.getElementById('sched').textContent;
  for (const f of ['E', 'W']) {
    btns.find((b) => b.getAttribute('data-v') === f).dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await tick(600);
    assert.equal(ST().facing, f); const dir = f === 'E' ? 'east' : 'west';
    assert.match(d.getElementById('planNote').textContent, new RegExp('entrance \\(' + dir + '\\) is at the top')); assert.match(d.getElementById('faceHint').textContent, new RegExp('Entrance in the ' + dir));
    // the plan's north arrow is turned
    assert.match(d.getElementById('plan').innerHTML, new RegExp('rotate\\(' + (f === 'E' ? '-90' : '90') + ' '), 'north arrow rotated');
    // side buttons name true directions; the back exit needs a north entrance
    const ex = d.querySelectorAll('#segExit button'); assert.equal(ex[0].textContent, 'Back exit (' + (f === 'E' ? 'west' : 'east') + ')'); assert.ok(ex[0].disabled);
    assert.equal(d.querySelectorAll('#jagSides button')[0].textContent, 'Front (' + dir + ')');
    // Vastu: pooja NE, kitchen SE, master SW, read off the schedule and the scorer
    const pl = C.planFor(ST()), vz = (key) => { const r = pl.rooms.find((q) => q.key === key); return r ? (C.vastuOf ? C.vastuOf(r, pl.W, pl.D) : null) : null; };
    assert.notEqual(JSON.stringify(pl.rooms.map((r) => [r.key, r.x, r.y, r.w, r.h])), northPlan, 'rooms rearranged');
    assert.match(sched(), /NE/); assert.match(sched(), /SE/);
    // drawings get a rotated north arrow too
    const sheets = C.buildSheets(ST(), ST().sys, 150, 'Test'); const svgAll = (Array.isArray(sheets) ? sheets : Object.values(sheets)).map((x) => (typeof x === 'string' ? x : x.svg || '')).join(''); assert.match(svgAll, new RegExp('rotate\\(' + (f === 'E' ? '-90' : '90') + ' '), 'sheet north arrow rotated');
  }
  // back to north restores the original plan exactly
  btns.find((b) => b.getAttribute('data-v') === 'N').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await tick(600);
  assert.equal(JSON.stringify(C.planFor(ST()).rooms.map((r) => [r.key, r.x, r.y, r.w, r.h])), northPlan, 'north layout unchanged');
  assert.equal(JSON.parse(w.localStorage.getItem('chp_state_v7')).facing, 'N');
  assert.deepEqual(errs, []);
});
