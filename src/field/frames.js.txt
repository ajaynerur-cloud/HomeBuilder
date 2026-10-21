// Work planes. Each plane resolves to a frame: origin o, in-plane axes u and v, normal n (u x v = n).
import { num } from './expr.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a) => { const l = len(a); return l < 1e-12 ? [0, 0, 1] : [a[0] / l, a[1] / l, a[2] / l]; };
export { add, sub, mul };

export const WORLD = {
  xy: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
  xz: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0] },
  yz: { o: [0, 0, 0], u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] },
};
export function rotateAbout(p, axis, deg) {              // Rodrigues, axis must be a unit vector
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), k = axis, d = dot(k, p), x = cross(k, p);
  return [p[0] * c + x[0] * s + k[0] * d * (1 - c), p[1] * c + x[1] * s + k[1] * d * (1 - c), p[2] * c + x[2] * s + k[2] * d * (1 - c)];
}
export const toWorld = (f, x, y, z = 0) => [f.o[0] + f.u[0] * x + f.v[0] * y + f.n[0] * z, f.o[1] + f.u[1] * x + f.v[1] * y + f.n[1] * z, f.o[2] + f.u[2] * x + f.v[2] * y + f.n[2] * z];
export const toLocal = (f, p) => { const w = sub(p, f.o); return [dot(w, f.u), dot(w, f.v), dot(w, f.n)]; };

// planes: [{id, name, kind: xy|xz|yz|offset|rotate|points|free, base, offset, axis, angle, pts, origin, normal}]
export function resolvePlanes(planes, scope, errs) {
  const frames = {}, byId = {}; planes.forEach((p) => { byId[p.id] = p; });
  const get = (id, stack) => {
    if (frames[id]) return frames[id];
    const p = byId[id]; if (!p) throw new Error('Plane ' + id + ' not found');
    if (stack.includes(id)) throw new Error('Planes depend on each other in a loop');
    const st = stack.concat(id), N = (v, fb, l) => num(v, scope, fb, errs, (p.name || p.id) + ' ' + l);
    let f;
    if (WORLD[p.kind]) f = JSON.parse(JSON.stringify(WORLD[p.kind]));
    else if (p.kind === 'offset') { const b = get(p.base, st), d = N(p.offset, 0, 'offset'); f = { o: add(b.o, mul(b.n, d)), u: b.u, v: b.v, n: b.n }; }
    else if (p.kind === 'rotate') {
      const b = get(p.base, st), ax = p.axis === 'v' ? b.v : b.u, a = N(p.angle, 0, 'angle');
      f = { o: b.o, u: unit(rotateAbout(b.u, ax, a)), v: unit(rotateAbout(b.v, ax, a)), n: unit(rotateAbout(b.n, ax, a)) };
    } else if (p.kind === 'points') {
      const P = (p.pts || [[0, 0, 0], [1, 0, 0], [0, 1, 0]]).map((q) => q.map((c, i) => N(c, 0, 'point ' + i)));
      const u = unit(sub(P[1], P[0])), n = unit(cross(u, sub(P[2], P[0]))); f = { o: P[0], u, v: cross(n, u), n };
    } else { // free: origin and normal
      const o = (p.origin || [0, 0, 0]).map((c) => N(c, 0, 'origin')), n = unit((p.normal || [0, 0, 1]).map((c) => N(c, 0, 'normal')));
      const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], u = unit(cross(ref, n)); f = { o, u, v: cross(n, u), n };
    }
    frames[id] = f; return f;
  };
  planes.forEach((p) => { try { get(p.id, []); } catch (e) { if (errs) errs.push(e.message); frames[p.id] = JSON.parse(JSON.stringify(WORLD.xy)); } });
  return frames;
}
