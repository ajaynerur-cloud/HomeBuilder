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
test('size changes redraw the plan for every entrance, and a size that cannot shrink says why and offers fixes', async (t) => {
  const errs = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc, beforeParse(w) { w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder; class Stub { constructor(o) { this.domElement = (o && o.canvas) || w.document.createElement('canvas'); } setSize() {} setPixelRatio() {} setClearColor() {} render() {} dispose() {} } w.THREE = { ...THREE, WebGLRenderer: Stub }; w.scrollTo = () => {}; w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (tt, k) => (k === 'canvas' ? {} : k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true }); }; } });
  const w = dom.window, d = w.document, ST = () => w.__ed.ST; t.after(() => w.close()); await tick(800);
  const plan = () => d.getElementById('plan').innerHTML, click = (sel, v) => [...d.querySelectorAll(sel + ' button')].find((b) => b.getAttribute('data-v') === v).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const foot = () => +d.getElementById('areaLine').textContent.match(/= ([\d,.]+) sq ft/)[1].replace(/,/g, '');
  for (const f of ['N', 'E', 'W']) {
    click('#segFace', f); await tick(150); click('#segSize', '1100'); await tick(200); const p1100 = plan(), f1100 = foot();
    click('#segSize', '1200'); await tick(200); assert.notEqual(plan(), p1100, f + ': 1,200 redraws the plan'); assert.ok(foot() > f1100 || f === 'W', f + ': bigger footprint');
    const sl = d.getElementById('area'); sl.value = '1400'; sl.dispatchEvent(new w.Event('input', { bubbles: true })); await tick(900); assert.ok(foot() >= 1390, f + ': slider to 1,400 redraws: ' + foot());
  }
  // north entrance at 800 sq ft: too small for a large courtyard and a 4 ft walkway, so the plan says so and offers what works
  click('#segFace', 'N'); await tick(150); click('#segSize', '800'); await tick(300);
  const note = d.getElementById('growNote'); assert.ok(note && note.style.display !== 'none', 'notice shown'); assert.match(note.textContent, /800 sq ft is too small/); assert.ok(d.getElementById('sizeHint').classList.contains('grown'));
  await tick(400); const opts = [...note.querySelectorAll('button[data-g]')]; assert.ok(opts.length >= 2, 'smaller options offered: ' + note.textContent);
  const before = plan(), f0 = foot(), btn = opts.find((b) => /No walkway|Medium courtyard/.test(b.textContent)), promised = +btn.textContent.match(/→ ([\d,.]+) sq ft/)[1].replace(/,/g, '');
  btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await tick(300);
  assert.notEqual(plan(), before, 'plan redrawn'); assert.ok(foot() < f0, 'smaller footprint'); assert.equal(foot(), promised, 'the button told the truth');
  // a size that fits hides the notice
  click('#segSize', '1200'); await tick(300); assert.equal(d.getElementById('growNote').style.display, 'none');
  assert.deepEqual(errs, []);
});
