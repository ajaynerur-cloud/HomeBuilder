// Wall joints: mitred corners, butt joints and T junctions give each wall a footprint polygon.
import { lineIntersect, mul, add, sub, cross, dot, orientedRect } from './geometry.js';

const key = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000);

export function wallNodes(walls) {
  const nodes = new Map();
  walls.forEach((w) => {
    [['a', w.a, w.d], ['b', w.b, mul(w.d, -1)]].forEach(([end, p, away]) => {
      const k = key(p); if (!nodes.has(k)) nodes.set(k, { p, ends: [] });
      nodes.get(k).ends.push({ w, end, away });
    });
  });
  return nodes;
}

// Returns Map(wallId -> ring [startLeft, endLeft, endRight, startRight])
export function footprints(walls) {
  const nodes = wallNodes(walls), over = new Map();
  const setEnd = (w, end, left, right) => over.set(w.id + ':' + end, { left, right });
  nodes.forEach((nd) => {
    const E = nd.ends;
    if (E.length === 2) {
      const [e1, e2] = E, c = cross(e1.away, e2.away);
      if (Math.abs(c) < 0.26) return;             // straight on, or too sharp: square ends
      const side = (e, cc) => (cc > 0 ? 1 : -1) * (e.end === 'a' ? 1 : -1);
      const s1 = side(e1, c), s2 = side(e2, -c), h1 = e1.w.t / 2, h2 = e2.w.t / 2, N = nd.p;
      const I = lineIntersect(add(N, mul(e1.w.n, s1 * h1)), e1.w.d, add(N, mul(e2.w.n, s2 * h2)), e2.w.d);
      const O = lineIntersect(sub(N, mul(e1.w.n, s1 * h1)), e1.w.d, sub(N, mul(e2.w.n, s2 * h2)), e2.w.d);
      if (!I || !O) return;
      const lim = (h1 + h2) * 4;
      if (Math.hypot(I[0] - N[0], I[1] - N[1]) > lim || Math.hypot(O[0] - N[0], O[1] - N[1]) > lim) return;
      const put = (e, s) => { const L = s > 0 ? I : O, R = s > 0 ? O : I; setEnd(e.w, e.end, L, R); };
      put(e1, s1); put(e2, s2);
    } else if (E.length > 2) {
      // Y junction with no straight pair: reach into the gap by half the thickest neighbour
      const hasStraight = E.some((e1, i) => E.some((e2, j) => j > i && dot(e1.away, e2.away) < -0.99));
      if (hasStraight) return;
      E.forEach((e) => {
        const ext = Math.max(...E.filter((o) => o !== e).map((o) => o.w.t / 2));
        const P = e.end === 'a' ? sub(nd.p, mul(e.w.d, ext)) : add(nd.p, mul(e.w.d, ext));
        setEnd(e.w, e.end, add(P, mul(e.w.n, e.w.t / 2)), sub(P, mul(e.w.n, e.w.t / 2)));
      });
    }
  });
  const rings = new Map();
  walls.forEach((w) => {
    const h = w.t / 2, a = over.get(w.id + ':a'), b = over.get(w.id + ':b');
    const sL = a ? a.left : add(w.a, mul(w.n, h)), sR = a ? a.right : sub(w.a, mul(w.n, h));
    const eL = b ? b.left : add(w.b, mul(w.n, h)), eR = b ? b.right : sub(w.b, mul(w.n, h));
    rings.set(w.id, [sL, eL, eR, sR]);
  });
  return rings;
}

export function openingCut(w, o, over = 0.03) { return orientedRect(w.a, w.d, o.pos - o.w / 2, o.pos + o.w / 2, w.t / 2 + over); }
