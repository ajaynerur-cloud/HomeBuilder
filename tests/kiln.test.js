import test from 'node:test';
import assert from 'node:assert/strict';
import { newKiln, resolve, CTYPES, constraintStatus, TEMPLATES } from '../src/kiln/model.js';
import { evaluate, meshCheck, sampleGrid } from '../src/kiln/engine.js';
import { satisfy, intentDrag, step, freeVars } from '../src/kiln/solver.js';
import { drawingSVG } from '../src/kiln/drawing.js';
import { logoSVG } from '../src/kiln/logo.js';
import { JSDOM } from 'jsdom';

const allOk = (doc, a) => doc.constraints.filter((c) => c.on).every((c) => constraintStatus(c, a).ok);
const status = (doc, a) => doc.constraints.filter((c) => c.on).map((c) => c.type + ':' + constraintStatus(c, a).v.toFixed(1) + (constraintStatus(c, a).ok ? '' : '!')).join(' ');

test('analysis matches hand calculations for a cylinder', () => {
  const d = newKiln(); d.params = [{ name: 'H', v: '100' }]; d.profile = [{ z: '0', r: '40' }, { z: '50', r: '40' }, { z: '=H', r: '40' }]; d.section = { sides: 0, corners: '0', lobes: 0, ripple: '0', twist: '0' }; d.shell = { wall: '2', floor: '4' }; d.fill = 1;
  const e = evaluate(resolve(d).D, 96, 60), A = (R) => 0.5 * 96 * R * R * Math.sin(2 * Math.PI / 96);
  assert.ok(Math.abs(e.a.capacity - A(38) * 96 / 1000) < 0.01, 'capacity ' + e.a.capacity);
  assert.ok(Math.abs(e.a.volume - (A(40) * 100 - A(38) * 96)) / e.a.volume < 0.003, 'volume');
  assert.ok(Math.abs(e.a.tipEmpty - Math.atan2(40 * Math.cos(Math.PI / 96), e.a.com[2]) * 180 / Math.PI) < 0.2, 'tip ' + e.a.tipEmpty);
  assert.ok(Math.abs(e.a.rimD - 76) < 0.05 && Math.abs(e.a.baseD - 80) < 0.05 && e.a.overhang < 0.5);
  assert.ok(meshCheck(e.solid.pos, e.solid.nt).watertight);
});
test('expressions, locks and driven fields decide the free dimensions', () => {
  const d = newKiln(), keys = freeVars(d).map((v) => v.key);
  assert.ok(keys.includes('r1') && keys.includes('z2') && keys.includes('primR') && keys.includes('twist'));
  assert.ok(!keys.includes('z5') && !keys.includes('r5') && !keys.includes('pH'), 'rim is driven by =H and =rimR, H is locked');
  d.profile[1].lockR = true; d.section.lockTwist = true; const k2 = freeVars(d).map((v) => v.key); assert.ok(!k2.includes('r1') && !k2.includes('twist'));
  d.params[0].v = '230'; assert.equal(resolve(d).D.pts[5].z, 230);
  d.params.push({ name: 'belly', v: '=H*0.3' }); d.profile[2].r = '=belly'; assert.ok(Math.abs(resolve(d).D.pts[2].r - 69) < 1e-9); assert.ok(!freeVars(d).some((v) => v.key === 'r2'));
});
test('Solve meets every constraint for every template', () => {
  Object.keys(TEMPLATES).forEach((k) => { const d = TEMPLATES[k].make(); satisfy(d, { iters: 14, res: 40 }); const a = evaluate(resolve(d).D).a; assert.ok(allOk(d, a), k + ': ' + status(d, a)); assert.ok(meshCheck(...(() => { const e = evaluate(resolve(d).D); return [e.solid.pos, e.solid.nt]; })()).watertight, k + ' watertight'); });
});
test('intent drag moves the point and keeps capacity, lean and tipping', () => {
  const d = newKiln(); satisfy(d, { iters: 12, res: 40 });
  const e0 = evaluate(resolve(d).D, 24, 24), p0 = sampleGrid(e0.P, 24, 24, 0, 0.45 * 24), target = [p0[0] + 12, p0[1], p0[2] + 6];
  let r; for (let k = 0; k < 10; k++) r = intentDrag(d, { u: 0, v: 0.45, target });
  const e1 = evaluate(resolve(d).D, 24, 24), p1 = sampleGrid(e1.P, 24, 24, 0, 0.45 * 24);
  const before = Math.hypot(target[0] - p0[0], target[1] - p0[1], target[2] - p0[2]), after = Math.hypot(target[0] - p1[0], target[1] - p1[1], target[2] - p1[2]);
  assert.ok(after < before * 0.5, 'point followed the drag: ' + before.toFixed(1) + ' -> ' + after.toFixed(1));
  satisfy(d, { iters: 6, res: 40 }); const a = evaluate(resolve(d).D).a; assert.ok(allOk(d, a), status(d, a));
});
test('the solver refuses to break a hard limit even when dragged hard', () => {
  const d = newKiln(); satisfy(d, { iters: 12, res: 40 }); const e0 = evaluate(resolve(d).D, 24, 24), q = sampleGrid(e0.P, 24, 24, 6, 0.62 * 24);
  for (let k = 0; k < 12; k++) intentDrag(d, { u: 0.25, v: 0.62, target: [q[0] * 2, q[1] * 2, q[2] - 30] });
  satisfy(d, { iters: 8, res: 40 }); const a = evaluate(resolve(d).D).a; assert.ok(a.overhang <= 45.6, 'lean ' + a.overhang); assert.ok(allOk(d, a), status(d, a));
});
test('a relief drag leads with the relief amount', () => {
  const d = newKiln(); satisfy(d, { iters: 10, res: 40 }); d.reliefs.push({ id: 'f1', u: 0.1, v: 0.5, radius: 18, amount: 0.01, dir: 'normal', n: 6, fall: 'smooth', on: true });
  const e0 = evaluate(resolve(d).D, 24, 24), p0 = sampleGrid(e0.P, 24, 24, 0.1 * 24, 0.5 * 24), n = Math.hypot(p0[0], p0[1]);
  for (let k = 0; k < 6; k++) intentDrag(d, { u: 0.1, v: 0.5, target: [p0[0] + p0[0] / n * 8, p0[1] + p0[1] / n * 8, p0[2]] }, { emphasis: { ff1: 0.004 } });
  assert.ok(d.reliefs[0].amount > 3, 'relief amount ' + d.reliefs[0].amount);
});
test('sketch drag of one point is absorbed by other dimensions', () => {
  const d = newKiln(); satisfy(d, { iters: 10, res: 40 }); const r0 = +d.profile[2].r, cap0 = evaluate(resolve(d).D, 40, 40).a.capacity;
  for (let k = 0; k < 6; k++) step(d, { varGoals: [{ key: 'r2', target: r0 + 8, w: 6 }], res: 24, lambda: 0.08 });
  satisfy(d, { iters: 4, res: 40, pin: { r2: true } }); const a = evaluate(resolve(d).D, 40, 40).a;
  assert.ok(+d.profile[2].r > r0 + 4, 'point moved ' + r0 + ' -> ' + d.profile[2].r); assert.ok(Math.abs(a.capacity - cap0) / cap0 < 0.03, 'capacity held ' + cap0.toFixed(0) + ' -> ' + a.capacity.toFixed(0));
});
test('engineering drawing and logo are valid SVG', () => {
  const d = newKiln(), e = evaluate(resolve(d).D), svg = drawingSVG(d, e), dom = new JSDOM(''), p = new dom.window.DOMParser();
  const x = p.parseFromString(svg, 'image/svg+xml'); assert.equal(x.getElementsByTagName('parsererror').length, 0); assert.match(svg, /HALF SECTION/); assert.match(svg, /ENGINEERING CONSTRAINTS/); assert.match(svg, /KILN/);
  assert.equal(p.parseFromString(logoSVG(64), 'image/svg+xml').getElementsByTagName('parsererror').length, 0);
});
