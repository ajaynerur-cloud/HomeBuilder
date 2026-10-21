import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { loadKernel } from '../src/ductile/part/kernel.js';
import { newPart, addFeature, regenerate, displaySoup, productionDrawing, meshForSubdivision } from '../src/ductile/part/features.js';
import { newSketch, sid } from '../src/ductile/part/sketch.js';
import { meshCheck } from '../src/kiln/engine.js';
const R = await loadKernel({ wasmBinary: fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url)) });
function rectSketch(plane, w, h, cx = 0, cy = 0, dims = true) {
  const sk = newSketch(plane, 0), P = [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]].map(([x, y]) => { const p = { id: sid('p'), x, y }; sk.points.push(p); return p.id; });
  const L = P.map((a, i) => { const l = { id: sid('l'), a, b: P[(i + 1) % 4] }; sk.lines.push(l); return l.id; });
  sk.cons.push({ id: sid('c'), type: 'horizontal', refs: [L[0]] }, { id: sid('c'), type: 'horizontal', refs: [L[2]] }, { id: sid('c'), type: 'vertical', refs: [L[1]] }, { id: sid('c'), type: 'vertical', refs: [L[3]] });
  if (dims) sk.cons.push({ id: 'dw', type: 'length', refs: [L[0]], value: '=W' }, { id: 'dh', type: 'length', refs: [L[1]], value: '=D' });
  return { sk, P, L };
}
const vol = (b) => R.measureVolume(b);
test('dimension-driven block with a cut hole, shell and fillet regenerates from parameters', () => {
  const part = newPart('Bracket'); part.params = [{ name: 'W', v: '80' }, { name: 'D', v: '50' }, { name: 'T', v: '12' }, { name: 'holeR', v: '8' }];
  const s1 = addFeature(part, 'sketch', { sk: rectSketch('XY', 80, 50).sk }); const e1 = addFeature(part, 'extrude', { sketch: s1.id, distance: '=T' });
  const hs = newSketch('XY', 0); hs.points.push({ id: 'hc', x: 0, y: 0 }); hs.circles.push({ id: 'h1', c: 'hc', r: 5 }); hs.cons.push({ id: 'hr', type: 'radius', refs: ['h1'], value: '=holeR' }, { id: 'hf', type: 'fix', refs: ['hc'], x0: 0, y0: 0 });
  const s2 = addFeature(part, 'sketch', { sk: hs }); addFeature(part, 'extrude', { sketch: s2.id, distance: '=T', op: 'cut' }); const fl = addFeature(part, 'fillet', { radius: '2', edges: 'top' });
  let g = regenerate(R, part); assert.deepEqual(g.errors, {}); const v1 = vol(g.body); const plain = 80 * 50 * 12 - Math.PI * 64 * 12; assert.ok(v1 < plain && v1 > plain * 0.97, 'volume ' + v1 + ' vs ' + plain);
  part.params[0].v = '120'; g = regenerate(R, part); const bb = g.body.boundingBox.bounds; assert.ok(Math.abs(bb[1][0] - bb[0][0] - 120) < 1e-6, 'width follows the parameter');
  fl.suppressed = true; g = regenerate(R, part); assert.ok(Math.abs(vol(g.body) - (120 * 50 * 12 - Math.PI * 64 * 12)) < 1, 'suppressing the fillet');
  part.rollback = 2; g = regenerate(R, part); assert.ok(Math.abs(vol(g.body) - 120 * 50 * 12) < 1e-3, 'rolled back before the hole'); part.rollback = null;
  const sh = addFeature(part, 'shell', { thickness: '3', open: 'top' }); fl.suppressed = false; fl.radius = '1'; part.features.splice(part.features.indexOf(sh), 1); part.features.splice(2, 0, sh);
  g = regenerate(R, part); assert.deepEqual(g.errors, {}, JSON.stringify(g.errors));
  const s = displaySoup(g.body); assert.ok(s.nt > 100); assert.ok(meshCheck(s.pos, s.nt).watertight, 'display mesh closed'); assert.ok(s.edges.length > 10);
  const svg = productionDrawing(R, part, g.body); const dom = new JSDOM(''); assert.equal(new dom.window.DOMParser().parseFromString(svg, 'image/svg+xml').getElementsByTagName('parsererror').length, 0); assert.match(svg, /FRONT/); assert.match(svg, /FEATURE HISTORY/); assert.match(svg, /class="h"/);
  const m = meshForSubdivision(g.body); assert.ok(m.F.length > 50);
});
test('revolve, loft, sweep, chamfer and an error that does not break the history', async () => {
  const p = newPart('Vessel'); const sk = newSketch('XZ', 0); const pts = [[0, 0], [30, 0], [36, 50], [22, 90], [26, 110], [0, 110]].map(([x, y]) => { const q = { id: sid('p'), x, y }; sk.points.push(q); return q.id; }); pts.forEach((a, i) => sk.lines.push({ id: sid('l'), a, b: pts[(i + 1) % pts.length] }));
  const s = addFeature(p, 'sketch', { sk }); addFeature(p, 'revolve', { sketch: s.id }); addFeature(p, 'shell', { thickness: '2', open: 'top' });
  let g = regenerate(R, p); assert.deepEqual(g.errors, {}, JSON.stringify(g.errors)); assert.ok(vol(g.body) > 1000);
  const q = newPart('Loft'); q.params = [{ name: 'W', v: '40' }, { name: 'D', v: '40' }]; const a = addFeature(q, 'sketch', { sk: rectSketch('XY', 40, 40).sk }); const cs = newSketch('XY', '60'); cs.points.push({ id: 'c0', x: 0, y: 0 }); cs.circles.push({ id: 'cc', c: 'c0', r: 15 }); const b = addFeature(q, 'sketch', { sk: cs });
  addFeature(q, 'loft', { sketches: [a.id, b.id] }); addFeature(q, 'chamfer', { size: '1', edges: 'bottom' }); g = regenerate(R, q); assert.deepEqual(g.errors, {}, JSON.stringify(g.errors)); assert.ok(Math.abs(g.body.boundingBox.bounds[1][2] - 60) < 1e-6);
  const w = newPart('Sweep'); const path = newSketch('XZ', 0); const pa = [[0, 0], [0, 40], [40, 40]].map(([x, y]) => { const r = { id: sid('p'), x, y }; path.points.push(r); return r.id; }); path.lines.push({ id: 'pl1', a: pa[0], b: pa[1] }, { id: 'pl2', a: pa[1], b: pa[2] });
  const prof = newSketch('XY', 0); prof.points.push({ id: 'o', x: 0, y: 0 }); prof.circles.push({ id: 'pc', c: 'o', r: 4 });
  const fp = addFeature(w, 'sketch', { sk: path }), fq = addFeature(w, 'sketch', { sk: prof }); addFeature(w, 'sweep', { profile: fq.id, path: fp.id }); g = regenerate(R, w); assert.deepEqual(g.errors, {}, JSON.stringify(g.errors)); assert.ok(vol(g.body) > 3000);
  const bad = addFeature(w, 'fillet', { radius: '50', edges: 'all' }); addFeature(w, 'chamfer', { size: '0.5', edges: 'all' }); g = regenerate(R, w); assert.ok(g.errors[bad.id], 'impossible fillet reported'); assert.ok(g.body, 'history continues after an error');
  const step = await g.body.blobSTEP(); assert.ok(step.size > 1000, 'STEP export');
});
import { edgeRef, matchEdges } from '../src/ductile/part/features.js';
test('picked edges: fillet exactly the chosen edges and keep them through parameter changes and new features', () => {
  const part = newPart('Picked'); part.params = [{ name: 'W', v: '80' }, { name: 'D', v: '50' }];
  const s1 = addFeature(part, 'sketch', { sk: rectSketch('XY', 80, 50).sk }); addFeature(part, 'extrude', { sketch: s1.id, distance: '12' });
  const fl = addFeature(part, 'fillet', { radius: '4', edges: 'picked', picks: [] });
  let g = regenerate(R, part, { stop: 2 }); const body0 = g.body, vert = body0.edges.filter((e) => e.geomType === 'LINE' && Math.abs(e.tangentAt(0.5).toTuple()[2]) > 0.99);
  assert.equal(vert.length, 4); fl.picks = vert.map((e) => edgeRef(body0, e));
  const round = 4 * (16 - Math.PI * 4) * 12; g = regenerate(R, part); assert.equal(Object.keys(g.errors).length, 0, JSON.stringify(g.errors)); assert.ok(Math.abs(vol(g.body) - (80 * 50 * 12 - round)) < 0.5, 'exactly four corner rounds');
  part.params[0].v = '130'; g = regenerate(R, part); assert.equal(Object.keys(g.warnings).length, 0, JSON.stringify(g.warnings)); assert.ok(Math.abs(vol(g.body) - (130 * 50 * 12 - round)) < 0.5, 'picks follow the wider part');
  const hs = newSketch('XY', 0); hs.points.push({ id: 'hc', x: 0, y: 0 }); hs.circles.push({ id: 'h1', c: 'hc', r: 8 }); const fh = addFeature(part, 'sketch', { sk: hs }); addFeature(part, 'extrude', { sketch: fh.id, distance: '12', op: 'cut' });
  const order = part.features.splice(part.features.length - 2, 2); part.features.splice(2, 0, ...order); g = regenerate(R, part);
  assert.equal(Object.keys(g.errors).length, 0, JSON.stringify(g.errors)); assert.ok(Math.abs(vol(g.body) - (130 * 50 * 12 - Math.PI * 64 * 12 - round)) < 0.5, 'a hole added earlier does not confuse the picks');
  const ch = addFeature(part, 'chamfer', { size: '2', edges: 'picked', picks: [] }); g = regenerate(R, part, { stop: part.features.length - 1 });
  const ymin = g.body.boundingBox.bounds[0][1], front = g.body.edges.find((e) => { const m = e.pointAt(0.5).toTuple(), t = e.tangentAt(0.5).toTuple(); return e.geomType === 'LINE' && Math.abs(m[2] - 12) < 1e-6 && Math.abs(m[1] - ymin) < 1e-6 && Math.abs(t[0]) > 0.99; }); assert.ok(front, 'front top edge');
  const v0 = vol(g.body); ch.picks = [edgeRef(g.body, front)]; g = regenerate(R, part); assert.equal(Object.keys(g.errors).length, 0); const removed = v0 - vol(g.body), loop = 2 * (130 - 8) + 2 * (50 - 8) + 2 * Math.PI * 4; assert.ok(removed > 0.95 * 2 * loop && removed < 2 * loop, 'one picked edge propagates along its tangent-connected loop: removed ' + removed);
  ch.picks = [{ m: [999, 999, 999], n: [5, 5, 5], t: [1, 0, 0], type: 'LINE' }]; g = regenerate(R, part); assert.match(g.errors[ch.id], /picked edges/);
});
import { faceRef, matchFaces } from '../src/ductile/part/features.js';
test('a picked edge that a later change splits in two keeps both pieces', () => {
  const part = newPart('Split'); part.params = [{ name: 'W', v: '80' }, { name: 'D', v: '50' }];
  const s1 = addFeature(part, 'sketch', { sk: rectSketch('XY', 80, 50).sk }); addFeature(part, 'extrude', { sketch: s1.id, distance: '12' });
  const ch = addFeature(part, 'chamfer', { size: '2', edges: 'picked', picks: [] });
  let g = regenerate(R, part, { stop: 2 }); const ymin = g.body.boundingBox.bounds[0][1], front = g.body.edges.find((e) => { const m = e.pointAt(0.5).toTuple(), t = e.tangentAt(0.5).toTuple(); return Math.abs(m[2] - 12) < 1e-6 && Math.abs(m[1] - ymin) < 1e-6 && Math.abs(t[0]) > 0.99; });
  ch.picks = [edgeRef(g.body, front)]; const L = front.length; g = regenerate(R, part); const v1 = vol(g.body); assert.ok(Math.abs(80 * 50 * 12 - v1 - 2 * L) < 0.5, 'one chamfered edge');
  // now insert a slot across the front, before the chamfer: it cuts the picked edge into two pieces
  const ss = newSketch('XZ', 0); const sp = [[-5, 6], [5, 6], [5, 20], [-5, 20]].map(([x, y]) => { const p = { id: sid('p'), x, y }; ss.points.push(p); return p.id; }); sp.forEach((a, i) => ss.lines.push({ id: sid('l'), a, b: sp[(i + 1) % 4] }));
  const fs2 = addFeature(part, 'sketch', { sk: ss }), fx = addFeature(part, 'extrude', { sketch: fs2.id, distance: '100', dir: 'both', op: 'cut' }); part.features.splice(part.features.indexOf(ch), 1); part.features.push(ch);
  g = regenerate(R, part, { stop: part.features.length - 1 }); const before = vol(g.body), pieces = g.body.edges.filter((e) => { const m = e.pointAt(0.5).toTuple(), t = e.tangentAt(0.5).toTuple(); return Math.abs(m[2] - 12) < 1e-6 && Math.abs(m[1] - ymin) < 1e-6 && Math.abs(t[0]) > 0.99; });
  assert.equal(pieces.length, 2, 'the slot split the front top edge');
  const mt = matchEdges(g.body, ch.picks); assert.equal(mt.found, 2); assert.equal(mt.sigs.size, 2); assert.equal(mt.split, 1); assert.equal(mt.missing, 0);
  g = regenerate(R, part); assert.equal(Object.keys(g.errors).length, 0, JSON.stringify(g.errors)); assert.equal(Object.keys(g.warnings).length, 0); assert.ok(Math.abs(before - vol(g.body) - 2 * (L - 10)) < 0.5, 'both pieces chamfered');
});
test('picked faces open a shell, follow parameter changes, and survive a split', () => {
  const part = newPart('Faces'); part.params = [{ name: 'W', v: '80' }, { name: 'D', v: '50' }];
  const s1 = addFeature(part, 'sketch', { sk: rectSketch('XY', 80, 50).sk }); addFeature(part, 'extrude', { sketch: s1.id, distance: '30' }); const sh = addFeature(part, 'shell', { thickness: '2', open: 'picked', facePicks: [] });
  let g = regenerate(R, part, { stop: 2 }); assert.match(regenerate(R, part).errors[sh.id], /No faces picked/);
  const top = g.body.faces.find((f) => f.normalAt().toTuple()[2] > 0.99), front = g.body.faces.find((f) => f.normalAt().toTuple()[1] < -0.99);
  sh.facePicks = [faceRef(g.body, top)]; g = regenerate(R, part); const oneOpen = vol(g.body); assert.ok(Math.abs(oneOpen - (80 * 50 * 30 - 76 * 46 * 28)) < 1, 'open top shell ' + oneOpen);
  sh.facePicks.push(faceRef(regenerate(R, part, { stop: 2 }).body, front)); g = regenerate(R, part); assert.equal(Object.keys(g.errors).length, 0, JSON.stringify(g.errors)); assert.ok(vol(g.body) < oneOpen, 'two open faces remove more');
  part.params[0].v = '120'; g = regenerate(R, part); assert.equal(Object.keys(g.warnings).length, 0, JSON.stringify(g.warnings)); const bb = g.body.boundingBox.bounds; assert.ok(Math.abs(bb[1][0] - bb[0][0] - 120) < 1e-6);
  sh.facePicks = [sh.facePicks[0]]; // only the top again; a groove across the top splits it into two faces
  const gs = newSketch('YZ', 0); const gp = [[-40, 26], [40, 26], [40, 40], [-40, 40]].map(([x, y]) => { const p = { id: sid('p'), x, y }; gs.points.push(p); return p.id; }); gp.forEach((a, i) => gs.lines.push({ id: sid('l'), a, b: gp[(i + 1) % 4] }));
  const fg = addFeature(part, 'sketch', { sk: gs }), fe = addFeature(part, 'extrude', { sketch: fg.id, distance: '4', dir: 'both', op: 'cut' }); part.features.splice(part.features.indexOf(sh), 1); part.features.push(sh);
  g = regenerate(R, part, { stop: part.features.length - 1 }); const tops = g.body.faces.filter((f) => f.normalAt().toTuple()[2] > 0.99 && Math.abs(f.center.toTuple()[2] - 30) < 1e-6); assert.equal(tops.length, 2, 'the groove split the top face');
  const mf = matchFaces(g.body, sh.facePicks); assert.equal(mf.found, 2, 'both halves matched'); assert.equal(mf.split, 1);
  g = regenerate(R, part); assert.equal(Object.keys(g.errors).length, 0, JSON.stringify(g.errors)); assert.ok(g.body.faces.length > 12, 'shelled with both top pieces open');
});
test('face picks on curved solids pick the right face (normals are normalised)', () => {
  const p = newPart('Turned'); const sk = newSketch('XZ', 0); const pts = [[0, 0], [34, 0], [44, 45], [26, 115], [30, 160], [0, 160]].map(([x, y]) => { const q = { id: sid('p'), x, y }; sk.points.push(q); return q.id; }); pts.forEach((a, i) => sk.lines.push({ id: sid('l'), a, b: pts[(i + 1) % pts.length] }));
  const s = addFeature(p, 'sketch', { sk }); addFeature(p, 'revolve', { sketch: s.id }); const sh = addFeature(p, 'shell', { thickness: '2', open: 'picked', facePicks: [] });
  const b = regenerate(R, p, { stop: 2 }).body, top = b.faces.find((f) => f.geomType === 'PLANE' && f.normalAt().toTuple()[2] > 0.99 && f.center.toTuple()[2] > 100); sh.facePicks = [faceRef(b, top)];
  const g = regenerate(R, p); assert.equal(Object.keys(g.errors).length, 0, JSON.stringify(g.errors)); sh.open = 'top'; const g2 = regenerate(R, p); assert.ok(Math.abs(vol(g.body) - vol(g2.body)) < 1e-3, 'same as opening the top preset');
});
test('a drastic redesign (flat top becomes curved) re-attaches picks and says so', () => {
  const p = newPart('Redesign'); const sk = newSketch('XZ', 0); const P = [[-40, 0], [40, 0], [40, 30], [-40, 30]].map(([x, y]) => { const q = { id: sid('p'), x, y }; sk.points.push(q); return q.id; });
  const L = P.map((a, i) => { const l = { id: sid('l'), a, b: P[(i + 1) % 4] }; sk.lines.push(l); return l; });
  const s = addFeature(p, 'sketch', { sk }); addFeature(p, 'extrude', { sketch: s.id, distance: '25', dir: 'both' });
  const sh = addFeature(p, 'shell', { thickness: '2', open: 'picked', facePicks: [] });
  let g = regenerate(R, p, { stop: 2 }); const top = g.body.faces.find((f) => f.geomType === 'PLANE' && f.normalAt().toTuple()[2] > 0.99); sh.facePicks = [faceRef(g.body, top)];
  g = regenerate(R, p); assert.equal(Object.keys(g.errors).length, 0); const flatVol = vol(g.body);
  // redesign: replace the straight top line by an arc, so the top face becomes a cylinder
  sk.lines.splice(sk.lines.indexOf(L[2]), 1); const c = { id: sid('p'), x: 0, y: -40 }; sk.points.push(c); sk.arcs.push({ id: sid('a'), c: c.id, a: P[2], b: P[3] });
  g = regenerate(R, p, { stop: 2 }); assert.ok(g.body.faces.some((f) => f.geomType !== 'PLANE' && f.center.toTuple()[2] > 25), 'the top is now curved');
  g = regenerate(R, p); assert.equal(Object.keys(g.errors).length, 0, JSON.stringify(g.errors)); assert.match(g.notes[sh.id], /re-attached/); assert.ok(!/could not be found/.test(g.warnings[sh.id] || ''), 'nothing lost'); assert.ok(vol(g.body) < 80 * 50 * 40 * 0.5, 'still shelled open at the top: ' + vol(g.body));
  // the same for an edge: pick the front top edge (a line), then it becomes an arc
  const p2 = newPart('EdgeRedesign'); const sk2 = newSketch('XZ', 0); const Q = [[-40, 0], [40, 0], [40, 30], [-40, 30]].map(([x, y]) => { const q = { id: sid('p'), x, y }; sk2.points.push(q); return q.id; }); const M2 = Q.map((a, i) => { const l = { id: sid('l'), a, b: Q[(i + 1) % 4] }; sk2.lines.push(l); return l; });
  const s2 = addFeature(p2, 'sketch', { sk: sk2 }); addFeature(p2, 'extrude', { sketch: s2.id, distance: '25', dir: 'both' }); const ch = addFeature(p2, 'chamfer', { size: '2', edges: 'picked', picks: [] });
  g = regenerate(R, p2, { stop: 2 }); const fe = g.body.edges.find((e) => { const m = e.pointAt(0.5).toTuple(), t = e.tangentAt(0.5).toTuple(); return Math.abs(m[2] - 30) < 1e-6 && m[1] < -24 && Math.abs(t[0]) > 0.99; }); ch.picks = [edgeRef(g.body, fe)];
  sk2.lines.splice(sk2.lines.indexOf(M2[2]), 1); const c2 = { id: sid('p'), x: 0, y: -40 }; sk2.points.push(c2); sk2.arcs.push({ id: sid('a'), c: c2.id, a: Q[2], b: Q[3] });
  g = regenerate(R, p2); assert.equal(Object.keys(g.errors).length, 0, JSON.stringify(g.errors)); assert.match(g.notes[ch.id] || '', /re-attached/);
});
test('drastic redesign: a flat top becomes a curved dome, picked face and edge re-attach with a note', () => {
  // the block is a side profile (front plane) extruded through its depth; its top line can be swapped for an arc
  const mk = (domed) => { const sk = newSketch('XZ', 0), P = (x, y) => { const q = { id: sid('p'), x, y }; sk.points.push(q); return q.id; }; const a = P(-40, 0), b = P(40, 0), c = P(40, 30), d = P(-40, 30); sk.lines.push({ id: 'l1', a, b }, { id: 'l2', a: b, b: c }, { id: 'l4', a: d, b: a });
    if (domed) { const cc = P(0, -40); sk.arcs.push({ id: 'arc', c: cc, a: c, b: d }); } else sk.lines.push({ id: 'l3', a: c, b: d }); return sk; };
  const part = newPart('Dome'); const fs3 = addFeature(part, 'sketch', { sk: mk(false) }); addFeature(part, 'extrude', { sketch: fs3.id, distance: '25', dir: 'both' });
  const ch = addFeature(part, 'chamfer', { size: '1.5', edges: 'picked', picks: [] }), sh = addFeature(part, 'shell', { thickness: '2', open: 'picked', facePicks: [] });
  let b = regenerate(R, part, { stop: 2 }).body; const ymin = b.boundingBox.bounds[0][1], topFront = b.edges.find((e) => { const m = e.pointAt(0.5).toTuple(); return Math.abs(m[2] - 30) < 1e-6 && Math.abs(m[1] - ymin) < 1e-6; }); ch.picks = [edgeRef(b, topFront)];
  b = regenerate(R, part, { stop: 3 }).body; const top = b.faces.find((f) => f.normalAt().toTuple()[2] > 0.99 && f.center.toTuple()[2] > 25); sh.facePicks = [faceRef(b, top)];
  let g = regenerate(R, part); assert.equal(Object.keys(g.errors).length, 0, JSON.stringify(g.errors)); const flatVol = vol(g.body);
  fs3.sk = mk(true); g = regenerate(R, part); // the redesign: flat top replaced by an arc, so the top face becomes curved and the top edge becomes an arc
  assert.equal(Object.keys(g.errors).length, 0, JSON.stringify(g.errors)); assert.ok(Object.values(g.warnings).every((w) => !/could not be found/.test(w)), 'no pick lost: ' + JSON.stringify(g.warnings));
  assert.match(g.notes[ch.id] || '', /re-attached/); assert.match(g.notes[sh.id] || '', /re-attached/); assert.ok(vol(g.body) > 0 && vol(g.body) !== flatVol, 'domed, chamfered and shelled');
});
test('splines, explicit cut, surfaces (extrude, revolve, loft, sweep) and thicken', async () => {
  const P = (sk, x, y) => { const q = { id: sid('p'), x, y }; sk.points.push(q); return q.id; };
  // closed profile: a line plus a spline back to the start
  const p1 = newPart('Spline'); let p2 = newPart('x'); const s = newSketch('XY', 0), a = P(s, 0, 0), b = P(s, 40, 0), m1 = P(s, 45, 20), m2 = P(s, 20, 35), c = P(s, -5, 18); s.lines.push({ id: 'l', a, b }); s.splines.push({ id: 'sp', pts: [b, m1, m2, c, a] });
  const fs1 = addFeature(p1, 'sketch', { sk: s }); addFeature(p1, 'extrude', { sketch: fs1.id, distance: '10' }); let g = regenerate(R, p1); assert.equal(Object.keys(g.errors).length, 0, JSON.stringify(Object.keys(g.errors).map((id) => { const f = [...p1.features, ...p2.features].find((x) => x.id === id); return f.type + ':' + f.mode; }))); assert.ok(vol(g.body) > 5000, 'spline profile extruded: ' + vol(g.body));
  // explicit cut through it
  const hs = newSketch('XY', 0); hs.points.push({ id: 'o', x: 20, y: 15 }); hs.circles.push({ id: 'k', c: 'o', r: 5 }); const fh = addFeature(p1, 'sketch', { sk: hs }); addFeature(p1, 'extrude', { sketch: fh.id, distance: '30', dir: 'both', op: 'cut', name: 'Cut 1' }); const v0 = vol(g.body); g = regenerate(R, p1); assert.ok(Math.abs(v0 - vol(g.body) - Math.PI * 25 * 10) < 1, 'hole cut');
  // surfaces from an open spline
  const wave = (plane) => { const k = newSketch(plane, 0), w = [P(k, 0, 0), P(k, 20, 15), P(k, 40, -5), P(k, 60, 10)]; k.splines.push({ id: sid('s'), pts: w }); return k; };
  p2 = newPart('Surfaces'); const fw = addFeature(p2, 'sketch', { sk: wave('XZ') }); const sx = addFeature(p2, 'surface', { mode: 'extrude', sketch: fw.id, distance: '40' });
  g = regenerate(R, p2); assert.equal(Object.keys(g.errors).length, 0, JSON.stringify(Object.keys(g.errors).map((id) => { const f = [...p1.features, ...p2.features].find((x) => x.id === id); return f.type + ':' + f.mode; }))); assert.equal(g.body, null, 'a surface is not a solid'); assert.equal(g.surfaces.length, 1); assert.equal(g.surfaces[0].constructor.name, 'Shell');
  const th = addFeature(p2, 'thicken', { thickness: '2' }); g = regenerate(R, p2); assert.equal(Object.keys(g.errors).length, 0, JSON.stringify(Object.keys(g.errors).map((id) => { const f = [...p1.features, ...p2.features].find((x) => x.id === id); return f.type + ':' + f.mode; }))); assert.ok(g.body && vol(g.body) > 5000, 'thickened into a solid with positive volume: ' + (g.body && vol(g.body))); assert.equal(g.surfaces.length, 0, 'the thickened surface is consumed');
  const rv = newSketch('XZ', 0), r1 = [P(rv, 20, 0), P(rv, 35, 40), P(rv, 18, 90), P(rv, 24, 110)]; rv.splines.push({ id: 'rs', pts: r1 }); const fr = addFeature(p2, 'sketch', { sk: rv }); addFeature(p2, 'surface', { mode: 'revolve', sketch: fr.id });
  const c1 = newSketch('XY', '120'); c1.points.push({ id: 'q', x: 0, y: 0 }); c1.circles.push({ id: 'qc', c: 'q', r: 15 }); const c2 = newSketch('XY', '170'); c2.points.push({ id: 'q2', x: 0, y: 0 }); c2.circles.push({ id: 'qc2', c: 'q2', r: 25 }); const f1 = addFeature(p2, 'sketch', { sk: c1 }), f2 = addFeature(p2, 'sketch', { sk: c2 }); addFeature(p2, 'surface', { mode: 'loft', sketches: [f1.id, f2.id] });
  const path = newSketch('YZ', 0), pp = [P(path, 0, 0), P(path, 30, 40), P(path, 60, 20)]; path.splines.push({ id: 'pp', pts: pp }); const prof = newSketch('XY', 0), q1 = P(prof, -5, 0), q2 = P(prof, 5, 0); prof.lines.push({ id: 'pl', a: q1, b: q2 }); const fp = addFeature(p2, 'sketch', { sk: path }), fq = addFeature(p2, 'sketch', { sk: prof }); addFeature(p2, 'surface', { mode: 'sweep', profile: fq.id, path: fp.id });
  g = regenerate(R, p2); assert.equal(Object.keys(g.errors).length, 0, JSON.stringify(Object.keys(g.errors).map((id) => { const f = [...p1.features, ...p2.features].find((x) => x.id === id); return f.type + ':' + f.mode; }))); assert.equal(g.surfaces.length, 3, 'revolved, lofted and swept surfaces'); assert.ok(g.surfaces.every((x) => x.faces.length >= 1));
  // a thickened surface can also cut the solid
  const fw2 = addFeature(p2, 'sketch', { sk: (() => { const k = newSketch('XY', '11'), w = [P(k, -10, -50), P(k, 30, 0), P(k, 70, 50)]; k.splines.push({ id: 'cut', pts: w }); return k; })() }); addFeature(p2, 'surface', { mode: 'extrude', sketch: fw2.id, distance: '-20' }); const before = vol(regenerate(R, p2).body);
  addFeature(p2, 'thicken', { thickness: '3', op: 'cut' }); g = regenerate(R, p2); assert.equal(Object.keys(g.errors).length, 0, JSON.stringify(Object.keys(g.errors).map((id) => { const f = [...p1.features, ...p2.features].find((x) => x.id === id); return f.type + ':' + f.mode; }))); assert.ok(vol(g.body) < before, 'thickened surface cut a slot');
  const comp = R.makeCompound([g.body, ...g.surfaces]); const st = await comp.blobSTEP(); assert.ok(st.size > 5000, 'STEP with solid and surfaces');
});
