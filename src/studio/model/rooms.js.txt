// Rooms come from the walls: split centre-lines at crossings, find closed faces, subtract wall thickness for the clear area.
import { segIntersect, pointSeg, ringArea, pointInRing, ringCentroid, ringPerimeter, mpUnion, mpDiff, mpArea, polyMP, open } from './geometry.js';
import { footprints } from './walls.js';

const K = (p) => Math.round(p[0] * 500) + ',' + Math.round(p[1] * 500);

export function planarFaces(walls) {
  // 1. split every centre-line at crossings and T touches
  const segs = walls.map((w) => ({ a: w.a, b: w.b, cuts: [0, 1] }));
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const s = segs[i], t = segs[j];
    const x = segIntersect(s.a, s.b, t.a, t.b, 1e-6);
    if (x) { s.cuts.push(x.t); t.cuts.push(x.u); continue; }
    // collinear overlaps and end-on-wall touches within tolerance
    [[s, t.a], [s, t.b]].forEach(([sg, p]) => { const r = pointSeg(p, sg.a, sg.b); if (r.d < 0.02) sg.cuts.push(r.t); });
    [[t, s.a], [t, s.b]].forEach(([sg, p]) => { const r = pointSeg(p, sg.a, sg.b); if (r.d < 0.02) sg.cuts.push(r.t); });
  }
  // 2. nodes and unique edges
  const nodes = new Map(), pts = [], edges = new Map();
  const nodeId = (p) => { const k = K(p); if (!nodes.has(k)) { nodes.set(k, pts.length); pts.push(p); } return nodes.get(k); };
  segs.forEach((s) => {
    const cs = [...new Set(s.cuts.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 1e6) / 1e6))].sort((a, b) => a - b);
    for (let i = 0; i + 1 < cs.length; i++) {
      const p = [s.a[0] + (s.b[0] - s.a[0]) * cs[i], s.a[1] + (s.b[1] - s.a[1]) * cs[i]], q = [s.a[0] + (s.b[0] - s.a[0]) * cs[i + 1], s.a[1] + (s.b[1] - s.a[1]) * cs[i + 1]];
      const u = nodeId(p), v = nodeId(q); if (u === v) continue;
      const k = u < v ? u + '|' + v : v + '|' + u; if (!edges.has(k)) edges.set(k, [u, v]);
    }
  });
  // 3. prune dangling edges
  const adj = pts.map(() => new Set());
  edges.forEach(([u, v]) => { adj[u].add(v); adj[v].add(u); });
  const queue = adj.map((s, i) => i).filter((i) => adj[i].size === 1);
  while (queue.length) { const u = queue.pop(); if (adj[u].size !== 1) continue; const v = [...adj[u]][0]; adj[u].delete(v); adj[v].delete(u); if (adj[v].size === 1) queue.push(v); }
  // 4. sort neighbours by angle and trace faces (interior on the left)
  const out = adj.map((s, u) => [...s].sort((a, b) => Math.atan2(pts[a][1] - pts[u][1], pts[a][0] - pts[u][0]) - Math.atan2(pts[b][1] - pts[u][1], pts[b][0] - pts[u][0])));
  const used = new Set(), faces = [];
  for (let u = 0; u < pts.length; u++) for (const v0 of out[u]) {
    if (used.has(u + '>' + v0)) continue;
    const ring = []; let a = u, b = v0, guard = 0;
    while (!used.has(a + '>' + b) && guard++ < 5000) {
      used.add(a + '>' + b); ring.push(a);
      const L = out[b], i = L.indexOf(a), c = L[(i - 1 + L.length) % L.length];
      a = b; b = c;
    }
    faces.push(ring.map((i) => pts[i]));
  }
  return faces;
}

export function detectRooms(model, levelId) {
  const walls = model.walls.filter((w) => w.level === levelId);
  if (walls.length < 3) return [];
  const faces = planarFaces(walls).map((r) => ({ ring: r, area: ringArea(r) })).filter((f) => f.area > 0.5);
  // faces nested inside another (not touching it) become holes of the bigger one
  faces.forEach((f) => { f.holes = []; });
  faces.forEach((g) => {
    let parent = null;
    faces.forEach((f) => {
      if (f === g || f.area <= g.area) return;
      const touching = g.ring.some((p) => f.ring.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01));
      if (!touching && g.ring.every((p) => pointInRing(p, f.ring)) && (!parent || f.area < parent.area)) parent = f;
    });
    if (parent) parent.holes.push(g.ring);
  });
  const fp = footprints(walls);
  const wallMP = mpUnion(walls.map((w) => polyMP(fp.get(w.id))));
  const labels = model.labels.filter((l) => l.level === levelId);
  return faces.map((f, i) => {
    const mp = [[f.ring.map((p) => [p[0], p[1]]), ...f.holes.map((h) => h.map((p) => [p[0], p[1]]))]];
    const net = mpDiff(mp, wallMP), netArea = mpArea(net);
    const gross = f.area - f.holes.reduce((s, h) => s + Math.abs(ringArea(h)), 0);
    const c = ringCentroid(f.ring);
    const lab = labels.find((l) => pointInRing(l.p, f.ring) && !f.holes.some((h) => pointInRing(l.p, h)));
    // a point guaranteed inside, for labels
    let inside = c; if (!pointInRing(c, f.ring) || f.holes.some((h) => pointInRing(c, h))) inside = netInside(net) || c;
    return { id: 'room' + levelId + '_' + i, level: levelId, ring: f.ring, holes: f.holes, gross, net: netArea, netMP: net, perimeter: ringPerimeter(f.ring), centroid: c, inside, label: lab || null, name: lab ? lab.name : '', type: lab ? lab.type : 'room' };
  });
}
function netInside(mp) {
  for (const poly of mp) { const r = open(poly[0]); if (r.length >= 3) { const c = ringCentroid(r); if (pointInRing(c, r)) return c; } }
  return null;
}
