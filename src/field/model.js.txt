// The Field project: parameters, planes, sketches and an ordered list of features that build one shape.
import { resolveParams, num, compile, valueFn } from './expr.js';
import { resolvePlanes, WORLD, unit, dot, sub, len } from './frames.js';
import { resolveSketch, vaseProfile } from './sketch.js';
import * as S from './sdf.js';
import { meshField, meshBounds } from './mesher.js';
import { segment, faceRef, matchRegion, planeFrame, refineLoops } from './faces.js';

export const FEATURES = [['extrude', 'Extrude / push-pull a sketch'], ['revolve', 'Revolve a profile'], ['loft', 'Loft through sketches'], ['surface', 'Surface equation r(a, z)'], ['shell', 'Shell (hollow out)'], ['pull', 'Push / pull a face'], ['warp', 'Twist, taper, bend, ripple'], ['mirror', 'Mirror'], ['pattern', 'Pattern']];

export function newField(name = 'Untitled') {
  return {
    version: 1, kind: 'field', name, nextId: 1, params: [], variants: [],
    planes: [{ id: 'pXZ', name: 'Front (XZ)', kind: 'xz' }, { id: 'pXY', name: 'Top (XY)', kind: 'xy' }, { id: 'pYZ', name: 'Right (YZ)', kind: 'yz' }],
    sketches: [], features: [], print: { height: 0, bedX: 220, bedY: 220, bedZ: 250, minWall: 1.2 },
  };
}
export const nid = (p, prefix) => prefix + (p.nextId++);

const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const pad = (bb, m) => [bb[0] - m, bb[1] - m, bb[2] - m, bb[3] + m, bb[4] + m, bb[5] + m];
const REF_RES = 56;

export function refMeshFor(body) {
  const ext = Math.max(body.bb[3] - body.bb[0], body.bb[4] - body.bb[1], body.bb[5] - body.bb[2]), h = ext / REF_RES;
  const mesh = meshField(body.f, pad(body.bb, h * 2.5), REF_RES), seg = segment(mesh);
  return { mesh, seg };
}

export function evaluate(project) {
  const errors = [], { values: scope, errors: pe } = resolveParams(project.params);
  Object.keys(pe).forEach((k) => errors.push('Parameter ' + k + ': ' + pe[k]));
  const frames = resolvePlanes(project.planes, scope, errors), sketches = {};
  project.sketches.forEach((s) => { const r = resolveSketch(s, scope, errors); sketches[s.id] = { id: s.id, name: s.name, plane: s.plane, frame: frames[s.plane] || WORLD.xy, loop: r.loop, closed: r.closed }; });
  let body = S.EMPTY; const steps = [], memo = { body: null, ref: null };
  const refOf = (b) => { if (memo.body !== b) { memo.body = b; memo.ref = refMeshFor(b); } return memo.ref; };
  const N = (v, fb, l, f) => num(v, scope, fb, errors, (f.name || f.id) + ' ' + l);
  const dirOf = (f, fr, normal) => { const m = f.dir || 'normal'; if (m === 'normal') return normal || fr.n; if (AX[m]) return AX[m]; const v = (f.vec || [0, 0, 1]).map((c, i) => N(c, i === 2 ? 1 : 0, 'direction', f)); return unit(v); };
  const sk = (id, closedOnly = true) => { const s = sketches[id]; if (!s) throw new Error('Sketch not found'); if (closedOnly && !s.closed) throw new Error('This sketch is an open curve; use it in a Revolve with a wall thickness'); if (s.loop.length < 3 && closedOnly) throw new Error('The sketch has fewer than 3 points'); return s; };
  const faceAt = (ref, b) => {
    if (!ref) throw new Error('Pick a face first');
    if (!b.bb) throw new Error('There is nothing to attach to yet');
    const { mesh, seg } = refOf(b), m = matchRegion(seg, ref); if (!m) throw new Error('The face this was attached to no longer exists. Pick it again.');
    const R = m.region, fr = planeFrame(R), info = faceRef(mesh, seg, R.id, fr); info.loops2 = refineLoops(b.f, fr, info.loops2, mesh.h); return { R, fr, info, mesh, seg };
  };
  project.features.forEach((f) => {
    if (f.enabled === false) return;
    const k = N(f.k, 0, 'blend', f), op = f.op || 'add';
    try {
      let nd = null, replace = null;
      if (f.type === 'extrude') {
        const s = sk(f.sketch), dir = dirOf(f, s.frame), dist = N(f.dist, 30, 'distance', f);
        nd = S.extrudeNode(s.frame, [s.loop], dir, dist, { taper: N(f.taper, 0, 'draft', f), twist: N(f.twist, 0, 'twist', f), sym: !!f.sym });
      } else if (f.type === 'revolve') {
        const s = sketches[f.sketch]; if (!s) throw new Error('Sketch not found'); const wall = N(f.wall, 0, 'wall', f), floor = N(f.floor, wall, 'floor', f);
        let loops;
        if (s.closed) loops = [s.loop];
        else if (wall > 0) loops = [vaseProfile(s.loop, wall, floor)];
        else { const a = s.loop[0], b = s.loop[s.loop.length - 1]; loops = [[[0, a[1]]].concat(s.loop, [[0, b[1]]])]; }
        nd = S.revolveNode(s.frame, loops, f.axis === 'u' ? 'u' : 'v', N(f.angle, 360, 'angle', f));
      } else if (f.type === 'loft') {
        const secs = (f.sketches || []).map((id) => { const s = sk(id); return { fr: s.frame, loops: [s.loop] }; });
        nd = S.loftNode(secs, f.smooth !== false);
        const wall = N(f.wall, 0, 'wall', f);
        if (wall > 0) {
          const base = secs[0].fr, tops = secs.map((q) => dot(sub(q.fr.o, base.o), base.n)), sN = Math.max(...tops), solid = nd, shell = S.shellNode(solid, wall), sp = sN - wall * 1.05;
          // open the top: remove the cavity's footprint from just under the top cap upwards
          const cut = (x, y, z) => { const s = dot([x - base.o[0], y - base.o[1], z - base.o[2]], base.n), v = solid.f(x - base.n[0] * (s - sp), y - base.n[1] * (s - sp), z - base.n[2] * (s - sp)); return Math.max(v + wall, -(s - sp)); };
          nd = S.node((x, y, z) => Math.max(shell.f(x, y, z), -cut(x, y, z)), solid.bb);
        }
      } else if (f.type === 'surface') {
        const fr = frames[f.plane] || WORLD.xy, H = Math.max(1, N(f.H, 150, 'height', f)), wall = N(f.wall, 0, 'wall', f), floor = N(f.floor, Math.max(wall, 0), 'floor', f);
        const rFn = valueFn(f.r || '30'), twFn = f.twist && String(f.twist).trim() ? valueFn(f.twist) : null;
        const test = Object.create(scope); Object.assign(test, { z: 0, t: 0, a: 0, H, tw: 0 }); rFn(test); if (twFn) twFn(test);
        nd = S.surfaceNode(fr, { H, rFn, twFn, wall, floor, scope });
      } else if (f.type === 'shell') {
        if (!body.bb) throw new Error('Nothing to shell yet'); const t = Math.max(0.05, N(f.t, 3, 'thickness', f)), cuts = [];
        (f.open || []).forEach((ref) => { const fa = faceAt(ref, body); cuts.push(S.prismNode(fa.fr, fa.info.loops2, fa.fr.n, -t * 1.6, fa.mesh.h * 2, {})); });
        replace = S.shellNode(body, t, cuts);
      } else if (f.type === 'pull') {
        if (!body.bb) throw new Error('Nothing to pull yet'); const fa = faceAt(f.face, body), dir = dirOf(f, fa.fr, fa.fr.n), dist = N(f.dist, 10, 'distance', f), cosn = dot(dir, fa.fr.n);
        const soft = f.hard === false || !fa.R.planar;
        if (soft) replace = S.softPullNode(body, fa.R.centroid, Math.max(N(f.radius, fa.R.radius, 'radius', f), fa.mesh.h * 2), dir, dist, N(f.soft, 0.5, 'softness', f));
        else {
          if (Math.abs(cosn) < 1e-3) throw new Error('That direction lies in the face plane. Choose another direction.');
          const hgt = dist * cosn, eps = fa.mesh.h * 1.5, tap = N(f.taper, 0, 'draft', f);
          if (hgt >= 0) replace = S.combine(body, S.prismNode(fa.fr, fa.info.loops2, dir, -eps, hgt, { taper: tap }), 'add', k);
          else replace = S.combine(body, S.prismNode(fa.fr, fa.info.loops2, dir, hgt, eps, { taper: tap }), 'sub', k);
        }
      } else if (f.type === 'warp') {
        if (!body.bb) throw new Error('Nothing to warp yet'); const fr = frames[f.plane] || WORLD.xy, a = N(f.amount, 0, 'amount', f), kind = f.kind || 'twist';
        const amt = kind === 'twist' ? a / 100 : kind === 'taper' ? a / 10000 : kind === 'bend' ? (a * Math.PI / 180) / 100 : a;
        replace = S.warpNode(body, fr, kind, amt, N(f.extra, 20, 'wavelength', f));
      } else if (f.type === 'mirror') { if (!body.bb) throw new Error('Nothing to mirror yet'); replace = S.mirrorNode(body, frames[f.plane] || WORLD.yz); }
      else if (f.type === 'pattern') {
        if (!body.bb) throw new Error('Nothing to repeat yet'); const cnt = Math.max(2, Math.min(64, Math.round(N(f.count, 4, 'count', f))));
        if (f.kind === 'linear') replace = S.linearNode(body, [N(f.vx, 40, 'x step', f), N(f.vy, 0, 'y step', f), N(f.vz, 0, 'z step', f)], cnt);
        else replace = S.polarNode(body, frames[f.plane] || WORLD.xy, cnt, N(f.angle, 360, 'angle', f));
      } else throw new Error('Unknown feature ' + f.type);
      if (replace) body = replace; else body = S.combine(body, nd, op, k);
      steps.push({ id: f.id, ok: true });
    } catch (e) { steps.push({ id: f.id, ok: false, error: e.message }); errors.push((f.name || f.id) + ': ' + e.message); }
  });
  return { scope, errors, frames, sketches, steps, body };
}

export function buildMesh(project, res = 72) {
  const ev = evaluate(project); if (!ev.body.bb || ev.body.empty) return { ev, mesh: null };
  let ext = Math.max(ev.body.bb[3] - ev.body.bb[0], ev.body.bb[4] - ev.body.bb[1], ev.body.bb[5] - ev.body.bb[2]), bb = pad(ev.body.bb, (ext / res) * 3);
  let mesh = meshField(ev.body.f, bb, res);
  if (mesh.open) { bb = pad(bb, ext * 0.12); mesh = meshField(ev.body.f, bb, res); }
  return { ev, mesh };
}

// ---- finding a face to attach a feature to
export function pickFace(project, uptoIndex, selector) {
  const sub2 = JSON.parse(JSON.stringify(project)); sub2.features = sub2.features.slice(0, uptoIndex);
  const ev = evaluate(sub2); if (!ev.body.bb) throw new Error('Nothing to pick from');
  const { mesh, seg } = refMeshFor(ev.body); let best = null, bs = -Infinity;
  seg.regions.forEach((R) => { const s = selector(R); if (s > bs) { bs = s; best = R; } });
  if (!best) throw new Error('No face found'); return faceRef(mesh, seg, best.id, planeFrame(best));
}
export const FACE = { top: (R) => R.normal[2] * 10 + R.centroid[2] * 0.001 - (R.planar ? 0 : 2), bottom: (R) => -R.normal[2] * 10 - R.centroid[2] * 0.001 - (R.planar ? 0 : 2), side: (R) => (R.planar ? 5 - Math.abs(R.normal[2]) * 9 + R.area * 1e-6 : -9) };

// ---- variants: named sets of parameter values, and a blend between two of them
export function numericParams(project) { const o = {}; project.params.forEach((p) => { const n = typeof p.v === 'number' ? p.v : (/^-?\d*\.?\d+$/.test(String(p.v)) ? parseFloat(p.v) : null); if (n !== null) o[p.name] = n; }); return o; }
export function captureVariant(project, name) { return { name, values: numericParams(project) }; }
export function applyValues(project, values) { project.params.forEach((p) => { if (values[p.name] !== undefined) p.v = values[p.name]; }); }
export function blendValues(a, b, t) { const o = {}; Object.keys(a).forEach((k) => { if (b[k] !== undefined) o[k] = a[k] + (b[k] - a[k]) * t; }); return o; }
export { meshBounds, len };
