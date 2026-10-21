import test from 'node:test';
import assert from 'node:assert/strict';
import { newSketch, solve, dof, loops, sid } from '../src/ductile/part/sketch.js';
const val = (c) => +c.value;
function rect(sk, x, y, w, h) { const p = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([a, b]) => { const q = { id: sid('p'), x: a, y: b }; sk.points.push(q); return q.id; }); const L = p.map((a, i) => { const l = { id: sid('l'), a, b: p[(i + 1) % 4] }; sk.lines.push(l); return l.id; }); sk.cons.push({ id: sid('c'), type: 'horizontal', refs: [L[0]] }, { id: sid('c'), type: 'horizontal', refs: [L[2]] }, { id: sid('c'), type: 'vertical', refs: [L[1]] }, { id: sid('c'), type: 'vertical', refs: [L[3]] }); return { p, L }; }
test('a rectangle with H/V constraints solves and counts its freedom', () => {
  const sk = newSketch(); const r = rect(sk, 0, 0, 40, 20); sk.points[1].y = 3; sk.points[2].x = 46; // disturb
  assert.ok(solve(sk, val).ok); assert.equal(dof(sk, val), 4, 'position x, y, width, height remain');
  sk.cons.push({ id: 'd1', type: 'length', refs: [r.L[0]], value: 60 }, { id: 'd2', type: 'length', refs: [r.L[1]], value: 25 }, { id: 'f', type: 'fix', refs: [r.p[0]], x0: 0, y0: 0 });
  assert.ok(solve(sk, val).ok); assert.equal(dof(sk, val), 0, 'fully constrained');
  const p2 = sk.points[2]; assert.ok(Math.abs(p2.x - 60) < 1e-6 && Math.abs(p2.y - 25) < 1e-6, JSON.stringify(p2));
  sk.cons.find((c) => c.id === 'd1').value = 80; solve(sk, val); assert.ok(Math.abs(sk.points[2].x - 80) < 1e-6, 'dimension drives the geometry');
});
test('dragging a point with the solver keeps constraints', () => {
  const sk = newSketch(); const r = rect(sk, 0, 0, 40, 20); sk.cons.push({ id: 'f', type: 'fix', refs: [r.p[0]], x0: 0, y0: 0 });
  solve(sk, val, { goals: [{ point: r.p[2], x: 70, y: 35 }] }); const [a, b, c, d] = r.p.map((id) => sk.points.find((p) => p.id === id));
  assert.ok(Math.abs(a.x) < 1e-6 && Math.abs(b.y - a.y) < 1e-6 && Math.abs(c.x - b.x) < 1e-6 && Math.abs(d.y - c.y) < 1e-6 && Math.abs(d.x - a.x) < 1e-6); assert.ok(c.x > 60 && c.y > 30, 'followed the drag');
});
test('circles, tangency, angle, equal and loops with holes', () => {
  const sk = newSketch(); const r = rect(sk, 0, 0, 50, 30); const cp = { id: 'cp', x: 25, y: 15 }; sk.points.push(cp); sk.circles.push({ id: 'c1', c: 'cp', r: 6 });
  sk.cons.push({ id: 'r', type: 'radius', refs: ['c1'], value: 9 }); solve(sk, val); assert.ok(Math.abs(sk.circles[0].r - 9) < 1e-6);
  sk.cons.push({ id: 't', type: 'tangent', refs: [r.L[0], 'c1'] }); solve(sk, val); assert.ok(Math.abs(cp.y - sk.points[0].y - 9) < 1e-5, 'circle sits on the bottom edge');
  const lp = loops(sk); assert.equal(lp.closed.length, 1); assert.equal(lp.closed[0].length, 4); assert.equal(lp.circles.length, 1);
  const s2 = newSketch(); const a = { id: 'a', x: 0, y: 0 }, b = { id: 'b', x: 10, y: 1 }, c = { id: 'c', x: 0, y: 0.5 }, d = { id: 'd', x: 3, y: 8 }; s2.points.push(a, b, c, d); s2.lines.push({ id: 'l1', a: 'a', b: 'b' }, { id: 'l2', a: 'c', b: 'd' });
  s2.cons.push({ id: 'h', type: 'horizontal', refs: ['l1'] }, { id: 'g', type: 'angle', refs: ['l1', 'l2'], value: 60 }, { id: 'e', type: 'equal', refs: ['l1', 'l2'] }, { id: 'co', type: 'coincident', refs: ['a', 'c'] });
  assert.ok(solve(s2, val).ok); const ang = Math.atan2(d.y - c.y, d.x - c.x) * 180 / Math.PI; assert.ok(Math.abs(Math.abs(ang) - 60) < 1e-3 || Math.abs(Math.abs(ang) - 120) < 1e-3, 'angle ' + ang); assert.ok(Math.abs(Math.hypot(d.x - c.x, d.y - c.y) - Math.hypot(b.x - a.x, b.y - a.y)) < 1e-6);
});
