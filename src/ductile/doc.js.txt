// Ductile document: objects, each a cage plus a modifier stack. Templates are built with the same operations a user would do.
import * as M from './mesh.js';
import { box, cylinder, sphere, torus, plane, polygonFace, PRIMS } from './prims.js';
import { MODS } from './modifiers.js';
let seq = 0; const uid = (p) => p + (Date.now() % 1e8).toString(36) + (seq++).toString(36);
export function newDoc(name = 'Untitled') { return { v: 1, kind: 'ductile', name, objects: [] }; }
export function makeObject(name, cage, extra = {}) { return Object.assign({ id: uid('o'), name, cage, mods: [], color: '#e6e0d6', flat: false, angle: 35, visible: true }, extra); }
export function mod(type, params = {}) { return Object.assign({ id: uid('m'), type, on: true }, JSON.parse(JSON.stringify(MODS[type].def)), params); }
const faceWhere = (m, test) => m.F.findIndex((f) => test(M.faceNormal(m.V, f), M.faceCenter(m.V, f)));
// rings of a cylinder cage scaled to a profile: rows[k] = [radius, height]
function shapeRings(m, n, rows) { rows.forEach(([r, z], k) => { for (let i = 0; i < n; i++) { const v = m.V[k * n + i], a = Math.atan2(v[1], v[0]); m.V[k * n + i] = [r * Math.cos(a), r * Math.sin(a), z]; } }); return m; }
export const TEMPLATES = {
  diamond: { label: 'Faceted diamond vase', make() {
    const n = 12, c = shapeRings(cylinder(60, 180, n, 4, false, true), n, [[44, 0], [58, 45], [62, 95], [58, 145], [52, 185]]);
    return { name: 'Faceted diamond vase', objects: [makeObject('Vase', c, { color: '#f1efea', flat: true, mods: [mod('smooth', { levels: 2 }), mod('pattern', { kind: 'diamonds', count: 15, rows: 9, depth: 5, round: 1 }), mod('shell', { thickness: 2 })] })] };
  } },
  fluted: { label: 'Fluted petal vase', make() {
    const n = 16, c = shapeRings(cylinder(40, 200, n, 6, false, true), n, [[28, 0], [50, 28], [52, 70], [30, 118], [15, 158], [17, 185], [34, 212]]);
    return { name: 'Fluted petal vase', objects: [makeObject('Vase', c, { color: '#5f8257', mods: [mod('smooth', { levels: 2 }), mod('pattern', { kind: 'flutes', count: 22, rows: 1, depth: 2.6, round: 0.45 }), mod('rim', { count: 11, amp: 9, start: 0.84, power: 1.4 }), mod('shell', { thickness: 2 })] })] };
  } },
  house: { label: 'Gable house', make() {
    const b = box(9000, 6000, 3000), top = faceWhere(b, (n) => n[2] > 0.9), f = b.F[top];
    let ea = null; for (let k = 0; k < 4; k++) { const a = f[k], c = f[(k + 1) % 4]; if (Math.abs(b.V[a][0] - b.V[c][0]) < 1) { ea = [a, c]; break; } }
    const cut = M.loopCut(b, ea[0], ea[1], 0.5); const ridge = cut.verts.filter((i) => b.V[i][2] > 2999); M.translate(b, new Map(ridge.map((i) => [i, 1])), [0, 0, 2300]);
    const front = faceWhere(b, (n, c) => n[1] < -0.9); M.imprint(b, front, [[-900, -3000, 0], [300, -3000, 0], [300, -3000, 2200], [-900, -3000, 2200]]); M.extrude(b, [front], [0, 120, 0]);
    const back = faceWhere(b, (n) => n[1] > 0.9); M.imprint(b, back, [[-2500, 3000, 900], [2500, 3000, 900], [2500, 3000, 2300], [-2500, 3000, 2300]]); M.extrude(b, [back], [0, -150, 0]);
    const slab = box(11000, 8000, 250); slab.V = slab.V.map((v) => [v[0], v[1], v[2] - 250]);
    return { name: 'Gable house', objects: [makeObject('House', b, { color: '#e3ddd2', flat: true }), makeObject('Plinth', slab, { color: '#b9b4ab', flat: true })] };
  } },
  tower: { label: 'Twisted tower', make() {
    const b = box(24000, 24000, 96000, 1, 1, 24);
    return { name: 'Twisted tower', objects: [makeObject('Tower', b, { color: '#cfd8df', flat: true, mods: [mod('taper', { top: 0.7 }), mod('twist', { angle: 75 })] })] };
  } },
  plate: { label: 'Plate with hole', make() {
    const p = box(120, 80, 14), t = faceWhere(p, (n) => n[2] > 0.9), bt = faceWhere(p, (n) => n[2] < -0.9), outer = [...p.F[t], ...p.F[bt]];
    const loopT = p.F[t].slice(), loopB = p.F[bt].slice(); M.inset(p, [t, bt], 28); M.bridge(p, t, bt);
    [loopT, loopB].forEach((L) => L.forEach((a, k) => M.setCrease(p, [[a, L[(k + 1) % L.length]]], true)));
    loopT.forEach((a) => { const b2 = loopB.find((x) => Math.abs(p.V[x][0] - p.V[a][0]) < 1e-6 && Math.abs(p.V[x][1] - p.V[a][1]) < 1e-6); if (b2 != null) M.setCrease(p, [[a, b2]], true); });
    return { name: 'Plate with hole', objects: [makeObject('Plate', p, { color: '#9aa7b4', mods: [mod('smooth', { levels: 3 })] })] };
  } },
  car: { label: 'Car body blockout', make() {
    // half body: x from the centre line out, y along the car, two rows high. Mirror makes the other half.
    const L = 4300, W = 900, b = box(W, L, 1000, 1, 6, 2); b.V = b.V.map((v) => [v[0] + W / 2, v[1], v[2] + 330]);
    const prof = [[620, 800], [760, 860], [1000, 960], [1430, 1330], [1440, 1340], [1080, 1120], [940, 1000]]; // [top z, mid-height z] at 7 stations, nose to tail
    b.V = b.V.map((v) => { const s = Math.round((v[1] + L / 2) / (L / 6)), top = v[2] > 1000, mid = v[2] > 600 && !top, x = v[0];
      let z = v[2], nx = x; if (top) { z = prof[s][0]; if (x > 1) nx = s >= 2 && s <= 5 ? 640 : 820; } else if (mid) { z = prof[s][1] * 0.62; if (x > 1) nx = 900; } else { z = 330; if (x > 1) nx = 860; } return [nx, v[1] * (top && (s === 0 || s === 6) ? 0.97 : 1), z]; });
    const cl = b.F.map((f, i) => i).filter((i) => b.F[i].every((k) => Math.abs(b.V[k][0]) < 1e-6)); M.deleteFaces(b, cl);
    const objs = [makeObject('Body', b, { color: '#c8462c', mods: [mod('mirror', { axis: 'x' }), mod('smooth', { levels: 2 })] })];
    [-1350, 1350].forEach((y) => { [-1, 1].forEach((sx) => { const w = cylinder(330, 230, 24, 1); w.V = w.V.map((v) => [v[2] - 115 + sx * 790, v[0] + y, v[1] + 330]); objs.push(makeObject('Wheel', w, { color: '#2a2c30', angle: 40 })); }); });
    return { name: 'Car body blockout', objects: objs };
  } },
};
export function fromTemplate(k) { const t = TEMPLATES[k].make(); const d = newDoc(t.name); d.objects = t.objects; return d; }
export { PRIMS, box, cylinder, sphere, torus, plane, polygonFace };
