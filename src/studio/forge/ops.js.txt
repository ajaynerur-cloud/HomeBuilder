// Direct edits recorded by vertex key, so they replay after a parameter changes.
import { moveVerts, extrudeFaces, insetFace, deleteFaces, cleanup, faceNormal, faceArea, add, sub, mul, dot, cross, unit, len } from './mesh.js';

const OPS = ['extrude', 'move', 'scale', 'rotate', 'twist', 'inset', 'delete', 'soft'];
export { OPS };

function rodrigues(p, c, k, ang) {
  const v = sub(p, c), cs = Math.cos(ang), sn = Math.sin(ang), kv = cross(k, v), kd = dot(k, v);
  return add(c, add(add(mul(v, cs), mul(kv, sn)), mul(k, kd * (1 - cs))));
}
export const falloff = (u, kind) => { if (u >= 1) return 0; if (kind === 'linear') return 1 - u; if (kind === 'sharp') return Math.pow(1 - u, 3); return Math.pow(1 - u * u, 2); };

export function regionNormal(m, fis) { let n = [0, 0, 0]; fis.forEach((fi) => { n = add(n, mul(faceNormal(m, fi), faceArea(m, fi))); }); return unit(n); }

// Apply one op. Returns {ok, note, faces?} and changes the mesh in place.
export function applyOp(m, op) {
  const vi = m.keyIndex(), vs = (keys) => (keys || []).map((k) => vi.get(k)).filter((i) => i !== undefined);
  const fidx = () => m.faceIndex(), fs = (keysList) => { const fi = fidx(); return (keysList || []).map((ks) => fi.get(ks.slice().sort().join('|'))).filter((i) => i !== undefined); };
  switch (op.t) {
    case 'extrude': {
      const F = fs(op.faces); if (!F.length) return { ok: false, note: 'faces no longer exist' };
      const dir = op.dir && op.dir !== 'normal' ? unit(op.dir) : regionNormal(m, F), vec = mul(dir, op.dist);
      const r = extrudeFaces(m, F, vec, op.id || 'x'); if (op.merge !== false) cleanup(m); return { ok: true, faces: r.faces };
    }
    case 'move': { const V = vs(op.verts); if (!V.length) return { ok: false, note: 'points no longer exist' }; moveVerts(m, V, (p) => add(p, op.vec)); return { ok: true }; }
    case 'scale': {
      const V = vs(op.verts); if (!V.length) return { ok: false, note: 'points no longer exist' }; const c = op.pivot, f = op.f;
      moveVerts(m, V, (p) => op.radial ? [c[0] + (p[0] - c[0]) * f[0], c[1] + (p[1] - c[1]) * f[0], p[2]] : [c[0] + (p[0] - c[0]) * f[0], c[1] + (p[1] - c[1]) * f[1], c[2] + (p[2] - c[2]) * f[2]]); return { ok: true };
    }
    case 'rotate': { const V = vs(op.verts); if (!V.length) return { ok: false, note: 'points no longer exist' }; const k = unit(op.axis), a = op.deg * Math.PI / 180; moveVerts(m, V, (p) => rodrigues(p, op.pivot, k, a)); return { ok: true }; }
    case 'twist': {
      const V = vs(op.verts); if (!V.length) return { ok: false, note: 'points no longer exist' }; const k = unit(op.axis), co = V.map((i) => dot(sub(m.v[i].p, op.pivot), k)), lo = Math.min(...co), hi = Math.max(...co);
      moveVerts(m, V, (p, i) => { const c = dot(sub(p, op.pivot), k), t = hi - lo < 1e-9 ? 1 : (c - lo) / (hi - lo); return rodrigues(p, op.pivot, k, op.deg * t * Math.PI / 180); }); return { ok: true };
    }
    case 'inset': { let F = fs(op.faces); if (!F.length) return { ok: false, note: 'faces no longer exist' }; const keys = F.map((i) => m.faceKeys(i)); const out = []; keys.forEach((ks, n) => { const fi = m.faceIndex().get(ks.slice().sort().join('|')); if (fi !== undefined) insetFace(m, fi, op.d, (op.id || 'i') + n); }); return { ok: true }; }
    case 'delete': { const F = fs(op.faces); if (!F.length) return { ok: false, note: 'faces no longer exist' }; deleteFaces(m, F); return { ok: true }; }
    case 'soft': { const d = unit(op.dir); moveVerts(m, m.v.map((_, i) => i), (p) => { const u = len(sub(p, op.center)) / op.radius, w = falloff(u, op.falloff); return w > 0 ? add(p, mul(d, op.amount * w)) : p; }); return { ok: true }; }
    default: return { ok: false, note: 'unknown edit ' + op.t };
  }
}

export function replay(m, ops) {
  const notes = [];
  (ops || []).forEach((op) => { if (op.off) return; let r; try { r = applyOp(m, op); } catch (e) { r = { ok: false, note: e.message }; } if (!r.ok) notes.push({ id: op.id, t: op.t, note: r.note }); });
  return notes;
}
