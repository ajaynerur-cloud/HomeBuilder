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
const ev = (w, el, type, x, y, extra = {}) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra }));
test('Part workspace: exact kernel from the page, history, sketch constraints, parameters, drawing, STEP export', async (t) => {
  const errs = [], saved = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc, beforeParse(w) {
    class Stub { constructor(o) { this.domElement = (o && o.canvas) || w.document.createElement('canvas'); } setSize() {} setPixelRatio() {} setClearColor() {} render() {} dispose() {} }
    w.THREE = { ...THREE, WebGLRenderer: Stub }; w.URL.createObjectURL = (b) => { saved.push(b); return 'blob:x'; }; w.URL.revokeObjectURL = () => {}; w.scrollTo = () => {};
    w.DecompressionStream = globalThis.DecompressionStream; w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder; w.ReadableStream = globalThis.ReadableStream; w.performance = globalThis.performance;
    const ctx = new Proxy({}, { get: (tt, k) => { if (k === 'canvas') return {}; if (k === 'measureText') return () => ({ width: 30 }); if (!(k in tt)) tt[k] = () => undefined; return tt[k]; }, set: (tt, k, v) => { tt[k] = v; return true; } });
    w.HTMLCanvasElement.prototype.getContext = function () { return ctx; }; w.HTMLCanvasElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 900, height: 600, right: 900, bottom: 600 }; };
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return 900; } }); Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return 600; } }); w.HTMLElement.prototype.setPointerCapture = () => {}; Object.defineProperty(w, 'innerWidth', { value: 1400 });
  } });
  const w = dom.window, d = w.document; t.after(() => w.close()); await tick(500);
  click(w, d.querySelector('#topnav [data-view="ductile"]')); await tick(100); if (!w.__ductile) console.log('DBG root', d.getElementById('ductileRoot').textContent.slice(0, 300), errs); const D = w.__ductile.app;
  click(w, [...d.querySelectorAll('.dx-seg.ws button')].find((b) => /CAD/.test(b.textContent))); const P = D.part.api; await P.started;
  assert.ok(P.G && P.G.body, 'kernel unpacked from the page and the bracket regenerated: ' + d.querySelector('.pt-msg').textContent); assert.equal(Object.keys(P.G.errors).length, 0, JSON.stringify(P.G.errors)); assert.equal(d.querySelectorAll('.pt-node').length, P.part.features.length);
  const f0 = P.G.body.faces.length; P.part.params.find((p) => p.name === 'W').v = '130'; P.rebuild(); const bb = P.G.body.boundingBox.bounds; assert.ok(Math.abs(bb[1][0] - bb[0][0] - 130) < 1e-6, 'parameter drives the solid');
  // new sketch on top plane, draw a rectangle with the mouse, dimension it, extrude it as a cut
  const sel = [...d.querySelectorAll('.pt-bar select')][0]; sel.value = 'XY'; sel.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(10);
  assert.ok(!d.querySelector('.pt-sk').hidden, 'sketch editor open'); const cv = P.skCanvas; P.sc.tool = 'rect';
  const A = P.toS(-20, -10), B = P.toS(20, 10); ev(w, cv, 'pointerdown', A[0], A[1]); ev(w, cv, 'pointermove', B[0], B[1]); ev(w, cv, 'pointerdown', B[0], B[1]);
  const sk = P.part.features[P.part.features.length - 1].sk; assert.equal(sk.lines.length, 4); assert.equal(sk.cons.filter((c) => c.type === 'horizontal' || c.type === 'vertical').length, 4, 'auto H and V');
  assert.match(d.querySelector('.pt-dof').textContent, /4 degrees of freedom/);
  P.sc.tool = 'dim'; P.sc.pend = [{ kind: 'line', id: sk.lines[0].id }]; P.dimFromPicks(); const inp = d.querySelector('.pt-dlg input'); inp.value = '=W/4'; click(w, [...d.querySelectorAll('.pt-dlg button')].find((b) => b.textContent === 'Apply'));
  const p0 = sk.points[0], p1 = sk.points[1]; assert.ok(Math.abs(Math.abs(p1.x - p0.x) - 32.5) < 1e-4, 'dimension =W/4 drives the line: ' + (p1.x - p0.x));
  click(w, [...d.querySelectorAll('.pt-bar button')].find((b) => b.textContent === 'Finish sketch')); await tick(10);
  click(w, [...d.querySelectorAll('.pt-bar button')].find((b) => b.textContent === 'Extrude')); const ex = P.part.features[P.part.features.length - 1]; ex.op = 'cut'; ex.distance = '100'; ex.dir = 'both'; P.rebuild(); P.renderAll();
  assert.equal(Object.keys(P.G.errors).length, 0, JSON.stringify(P.G.errors)); assert.ok(P.G.body.faces.length > f0, 'the cut changed the solid');
  // drawing and export
  click(w, [...d.querySelectorAll('.pt-bar button')].find((b) => b.textContent === 'Drawing')); assert.ok(d.querySelector('.pt-dw svg'), 'production drawing shown'); assert.match(d.querySelector('.pt-dw').innerHTML, /FEATURE HISTORY/);
  const zip = await P.packBytes(); fs.writeFileSync('/tmp/part-pack.zip', Buffer.from(zip));
  // send to subdivision
  click(w, [...d.querySelectorAll('.pt-bar button')].find((b) => /Send to Subdivision/.test(b.textContent))); assert.ok(D.doc.objects.some((o) => /from Part/.test(o.name)), 'mesh copy arrived in the subdivision workspace');
  assert.deepEqual(errs, []);
});

test('edge picking: orbit, click an edge, fillet only that edge', async (t) => {
  const errs = [], saved = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc, beforeParse(w) {
    class Stub { constructor(o) { this.domElement = (o && o.canvas) || w.document.createElement('canvas'); } setSize() {} setPixelRatio() {} setClearColor() {} render() {} dispose() {} }
    w.THREE = { ...THREE, WebGLRenderer: Stub }; w.URL.createObjectURL = (b) => { saved.push(b); return 'blob:x'; }; w.URL.revokeObjectURL = () => {}; w.scrollTo = () => {};
    w.DecompressionStream = globalThis.DecompressionStream; w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder; w.ReadableStream = globalThis.ReadableStream; w.performance = globalThis.performance;
    const ctx = new Proxy({}, { get: (tt, k) => { if (k === 'canvas') return {}; if (k === 'measureText') return () => ({ width: 30 }); if (!(k in tt)) tt[k] = () => undefined; return tt[k]; }, set: (tt, k, v) => { tt[k] = v; return true; } });
    w.HTMLCanvasElement.prototype.getContext = function () { return ctx; }; w.HTMLCanvasElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 900, height: 600, right: 900, bottom: 600 }; };
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return 900; } }); Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return 600; } }); w.HTMLElement.prototype.setPointerCapture = () => {}; Object.defineProperty(w, 'innerWidth', { value: 1400 });
  } });
  const w = dom.window, d = w.document; t.after(() => w.close()); await tick(500);
  click(w, d.querySelector('#topnav [data-view="ductile"]')); await tick(100); const D = w.__ductile.app;
  click(w, [...d.querySelectorAll('.dx-seg.ws button')].find((b) => /CAD/.test(b.textContent))); const P = D.part.api; await P.started; P.fit();
  const V = P.view, cv = V.canvas, az0 = V.camS.az; ev(w, cv, 'pointerdown', 300, 300); ev(w, cv, 'pointermove', 340, 310); ev(w, cv, 'pointermove', 380, 320); ev(w, cv, 'pointerup', 380, 320); assert.notEqual(V.camS.az, az0, 'left drag orbits');
  const fl = P.part.features.find((f) => f.type === 'fillet'); fl.edges = 'picked'; fl.picks = []; P.startPick(fl); assert.ok(P.pick, 'pick mode'); assert.match(d.querySelector('.pt-msg').textContent, /Picking edges/);
  assert.ok(P.soup.groups.length > 8, 'edges shown before the fillet'); const vol0 = P.G.body.edges.length;
  // pick the first vertical straight edge: project its midpoint and click there without moving
  const gi = P.G.body.edges.findIndex((e) => e.geomType === 'LINE' && Math.abs(e.tangentAt(0.5).toTuple()[2]) > 0.99); const m = P.G.body.edges[gi].pointAt(0.5).toTuple(), sp = V.screen(m);
  assert.equal(P.edgeAt(sp[0], sp[1]), gi, 'the click finds that edge');
  ev(w, cv, 'pointerdown', sp[0], sp[1]); ev(w, cv, 'pointerup', sp[0], sp[1]); assert.equal(fl.picks.length, 1, 'picked one edge');
  ev(w, cv, 'pointerdown', sp[0], sp[1]); ev(w, cv, 'pointerup', sp[0], sp[1]); assert.equal(fl.picks.length, 0, 'second click unpicks it');
  ev(w, cv, 'pointerdown', sp[0], sp[1]); ev(w, cv, 'pointerup', sp[0], sp[1]); assert.equal(fl.picks.length, 1);
  click(w, [...d.querySelectorAll('.pt-props button')].find((b) => b.textContent === 'Done picking')); assert.equal(P.pick, null);
  assert.equal(Object.keys(P.G.errors).length, 0, JSON.stringify(P.G.errors)); const onePick = P.G.body.faces.length; fl.suppressed = true; P.rebuild(); const none = P.G.body.faces.length; fl.suppressed = false; fl.edges = 'vertical'; P.rebuild(); const four = P.G.body.faces.length; fl.edges = 'picked'; P.rebuild();
  assert.equal(onePick, none + 1, 'one picked edge adds exactly one rounded face'); assert.ok(four > onePick, 'rounding all vertical corners changes more than one picked edge');
  assert.deepEqual(errs, []);
});

test('face picking: click faces to leave open in a shell', async (t) => {
  const errs = [], saved = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc, beforeParse(w) {
    class Stub { constructor(o) { this.domElement = (o && o.canvas) || w.document.createElement('canvas'); } setSize() {} setPixelRatio() {} setClearColor() {} render() {} dispose() {} }
    w.THREE = { ...THREE, WebGLRenderer: Stub }; w.URL.createObjectURL = (b) => { saved.push(b); return 'blob:x'; }; w.URL.revokeObjectURL = () => {}; w.scrollTo = () => {};
    w.DecompressionStream = globalThis.DecompressionStream; w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder; w.ReadableStream = globalThis.ReadableStream; w.performance = globalThis.performance;
    const ctx = new Proxy({}, { get: (tt, k) => { if (k === 'canvas') return {}; if (k === 'measureText') return () => ({ width: 30 }); if (!(k in tt)) tt[k] = () => undefined; return tt[k]; }, set: (tt, k, v) => { tt[k] = v; return true; } });
    w.HTMLCanvasElement.prototype.getContext = function () { return ctx; }; w.HTMLCanvasElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 900, height: 600, right: 900, bottom: 600 }; };
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return 900; } }); Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return 600; } }); w.HTMLElement.prototype.setPointerCapture = () => {}; Object.defineProperty(w, 'innerWidth', { value: 1400 });
  } });
  const w = dom.window, d = w.document; t.after(() => w.close()); await tick(500);
  click(w, d.querySelector('#topnav [data-view="ductile"]')); await tick(100); const D = w.__ductile.app;
  click(w, [...d.querySelectorAll('.dx-seg.ws button')].find((b) => /CAD/.test(b.textContent))); const P = D.part.api; await P.started;
  const sel = [...d.querySelectorAll('.pt-bar select')].find((x) => /Examples/.test(x.textContent)); sel.value = 'vase'; sel.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(20); P.fit();
  const sh = P.part.features.find((f) => f.type === 'shell'); P.startPick(sh); assert.equal(P.pick.kind, 'face'); assert.ok(P.soup.faceGroups.length >= 3, 'faces of the turned solid');
  // aim at the flat top face: project its centre, ask the view which face is there, click it
  const ti = P.G.body.faces.findIndex((f) => f.geomType === 'PLANE' && f.normalAt().toTuple()[2] > 0.99 && f.center.toTuple()[2] > 100); assert.ok(ti >= 0, 'top face exists');
  const V = P.view; V.camS.el = 1.2; V.render(); const c = P.G.body.faces[ti].center.toTuple(), sp = V.screen(c); assert.equal(P.faceAt(sp[0], sp[1]), ti, 'the click lands on the top face');
  ev(w, V.canvas, 'pointerdown', sp[0], sp[1]); ev(w, V.canvas, 'pointerup', sp[0], sp[1]); assert.equal(sh.facePicks.length, 1, 'picked the top face');
  click(w, [...d.querySelectorAll('.pt-props button')].find((b) => b.textContent === 'Done picking')); assert.equal(P.pick, null);
  assert.equal(Object.keys(P.G.errors).length, 0, JSON.stringify(P.G.errors)); const pickedVol = P.G.R ? 0 : 0;
  const facesPicked = P.G.body.faces.length; sh.open = 'top'; P.rebuild(); assert.equal(P.G.body.faces.length, facesPicked, 'same result as the top-face preset'); sh.open = 'picked'; P.rebuild();
  assert.deepEqual(errs, []);
});

test('one tool: Vessel to Part (exact revolve), Vessel and Forge to Subdivision, old links open workspaces', async (t) => {
  const errs = [], saved = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc, beforeParse(w) {
    class Stub { constructor(o) { this.domElement = (o && o.canvas) || w.document.createElement('canvas'); } setSize() {} setPixelRatio() {} setClearColor() {} render() {} dispose() {} }
    w.THREE = { ...THREE, WebGLRenderer: Stub }; w.URL.createObjectURL = (b) => { saved.push(b); return 'blob:x'; }; w.URL.revokeObjectURL = () => {}; w.scrollTo = () => {};
    w.DecompressionStream = globalThis.DecompressionStream; w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder; w.ReadableStream = globalThis.ReadableStream; w.performance = globalThis.performance;
    const ctx = new Proxy({}, { get: (tt, k) => { if (k === 'canvas') return {}; if (k === 'measureText') return () => ({ width: 30 }); if (!(k in tt)) tt[k] = () => undefined; return tt[k]; }, set: (tt, k, v) => { tt[k] = v; return true; } });
    w.HTMLCanvasElement.prototype.getContext = function () { return ctx; }; w.HTMLCanvasElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 900, height: 600, right: 900, bottom: 600 }; };
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return 900; } }); Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return 600; } }); w.HTMLElement.prototype.setPointerCapture = () => {}; Object.defineProperty(w, 'innerWidth', { value: 1400 });
  } });
  const w = dom.window, d = w.document; t.after(() => w.close()); await tick(500);
  click(w, d.querySelector('#topnav [data-view="ductile"]')); await tick(100); const D = w.__ductile.app;
  click(w, [...d.querySelectorAll('.dx-seg.ws button')].find((b) => b.textContent === 'Vessel')); await tick(100); assert.equal(D.ws, 'vessel'); assert.ok(w.__kiln, 'Vessel workspace started');
  click(w, [...d.querySelectorAll('.kn-tabs button')].find((b) => b.textContent === 'Export')); click(w, [...d.querySelectorAll('.kn-panel button')].find((b) => /Send to Part/.test(b.textContent)));
  assert.equal(D.ws, 'part'); const P = D.part.api; await P.started; await tick(50);
  assert.equal(JSON.stringify(P.part.features.map((f) => f.type)), '["sketch","revolve","shell"]'); assert.equal(Object.keys(P.G.errors).length, 0, JSON.stringify(P.G.errors)); assert.ok(P.G.body, 'exact revolved vessel');
  click(w, [...d.querySelectorAll('.dx-seg.ws button')].find((b) => b.textContent === 'Vessel')); click(w, [...d.querySelectorAll('.kn-panel button')].find((b) => /Send to Subdivision/.test(b.textContent)));
  assert.equal(D.ws, 'sub'); assert.ok(D.doc.objects.some((o) => /from Vessel/.test(o.name)), 'vessel mesh arrived');
  click(w, [...d.querySelectorAll('.dx-seg.ws button')].find((b) => b.textContent === 'Forge')); await tick(200); assert.ok(w.__forge, 'Forge workspace started');
  click(w, [...d.querySelectorAll('.dx-wsbar button')].find((b) => /Send to Subdivision/.test(b.textContent))); assert.equal(D.ws, 'sub'); const fo = D.doc.objects.find((o) => /from Forge/.test(o.name)); assert.ok(fo && fo.cage.F.length > 50, 'forge mesh arrived');
  w.location.hash = '#kiln'; click(w, d.querySelector('#topnav [data-view="planner"]')); assert.equal(d.querySelectorAll('#topnav [data-view="kiln"]').length, 0, 'Kiln is no longer a separate tab');
  assert.deepEqual(errs, []);
});

test('ribbon, spline tool, surface from the spline, thicken, cut, and the surface examples', async (t) => {
  const errs = [], saved = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message); });
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc, beforeParse(w) {
    class Stub { constructor(o) { this.domElement = (o && o.canvas) || w.document.createElement('canvas'); } setSize() {} setPixelRatio() {} setClearColor() {} render() {} dispose() {} }
    w.THREE = { ...THREE, WebGLRenderer: Stub }; w.URL.createObjectURL = (b) => { saved.push(b); return 'blob:x'; }; w.URL.revokeObjectURL = () => {}; w.scrollTo = () => {};
    w.DecompressionStream = globalThis.DecompressionStream; w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder; w.ReadableStream = globalThis.ReadableStream; w.performance = globalThis.performance;
    const ctx = new Proxy({}, { get: (tt, k) => { if (k === 'canvas') return {}; if (k === 'measureText') return () => ({ width: 30 }); if (!(k in tt)) tt[k] = () => undefined; return tt[k]; }, set: (tt, k, v) => { tt[k] = v; return true; } });
    w.HTMLCanvasElement.prototype.getContext = function () { return ctx; }; w.HTMLCanvasElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 900, height: 600, right: 900, bottom: 600 }; };
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return 900; } }); Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return 600; } }); w.HTMLElement.prototype.setPointerCapture = () => {}; Object.defineProperty(w, 'innerWidth', { value: 1400 });
  } });
  const w = dom.window, d = w.document; t.after(() => w.close()); await tick(500);
  click(w, d.querySelector('#topnav [data-view="ductile"]')); await tick(100); const D = w.__ductile.app;
  click(w, [...d.querySelectorAll('.dx-seg.ws button')].find((b) => /CAD/.test(b.textContent))); const P = D.part.api; await P.started;
  const groups = [...d.querySelectorAll('.pt-grpl')].map((x) => x.textContent); assert.deepEqual(groups, ['Sketch', 'Solid', 'Surface', 'Modify', 'Edit', 'Output']);
  const btns = [...d.querySelectorAll('.pt-bar button')].map((b) => b.textContent); ['Extrude', 'Cut', 'Revolve', 'Loft', 'Sweep', 'Extruded', 'Revolved', 'Lofted', 'Swept', 'Thicken', 'Shell', 'Fillet', 'Chamfer'].forEach((n) => assert.ok(btns.includes(n), n + ' on the ribbon'));
  // a new front-plane sketch with a spline drawn by clicking, finished with a double click
  const sel = [...d.querySelectorAll('.pt-bar select')][0]; sel.value = 'XZ'; sel.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(10);
  const cv = P.skCanvas; P.sc.tool = 'spline'; [[0, 20], [30, 34], [60, 22], [90, 36]].forEach(([x, y]) => { const s2 = P.toS(x, y); ev(w, cv, 'pointerdown', s2[0], s2[1]); }); cv.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
  const sk = P.part.features[P.part.features.length - 1].sk; assert.equal(sk.splines.length, 1, 'spline created'); assert.equal(sk.splines[0].pts.length, 4);
  click(w, [...d.querySelectorAll('.pt-bar button')].find((b) => b.textContent === 'Finish sketch')); await tick(10);
  const n0 = P.part.features.length; click(w, [...d.querySelectorAll('.pt-bar button')].find((b) => b.textContent === 'Extruded')); const sf = P.part.features[n0]; assert.equal(sf.type, 'surface'); sf.distance = '-60'; P.rebuild(); P.renderAll();
  click(w, [...d.querySelectorAll('.pt-bar button')].find((b) => b.textContent === 'Thicken')); assert.equal(Object.keys(P.G.errors).length, 0, JSON.stringify(P.G.errors));
  click(w, [...d.querySelectorAll('.pt-bar button')].find((b) => b.textContent === 'Cut')); const cut = P.part.features[P.part.features.length - 1]; assert.equal(cut.op, 'cut'); assert.match(cut.name, /^Cut/);
  for (const ex of ['roof', 'svase']) { const s3 = [...d.querySelectorAll('.pt-bar select')].find((x) => /Examples/.test(x.textContent)); s3.value = ex; s3.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(20); assert.equal(Object.keys(P.G.errors).length, 0, ex + ' ' + JSON.stringify(P.G.errors)); assert.ok(P.G.body, ex + ' made a solid'); }
  assert.deepEqual(errs, []);
});
