// Kiln model: a feature tree of a vessel. Fields hold numbers or "=expressions" over named parameters.
import { valueOf, resolveParams, validName } from '../studio/core/params.js';

export const CTYPES = {
  capacity: { label: 'Capacity', unit: 'ml', scale: 8, get: (a) => a.capacity, fmt: (v) => Math.round(v) + ' ml' },
  height: { label: 'Height', unit: 'mm', scale: 1, get: (a) => a.height, fmt: (v) => v.toFixed(1) + ' mm' },
  rimD: { label: 'Rim opening Ø', unit: 'mm', scale: 1, get: (a) => a.rimD, fmt: (v) => v.toFixed(1) + ' mm' },
  neckD: { label: 'Narrowest opening Ø', unit: 'mm', scale: 1, get: (a) => a.neckD, fmt: (v) => v.toFixed(1) + ' mm' },
  baseD: { label: 'Foot Ø', unit: 'mm', scale: 1, get: (a) => a.baseD, fmt: (v) => v.toFixed(1) + ' mm' },
  maxD: { label: 'Widest Ø', unit: 'mm', scale: 1, get: (a) => a.maxD, fmt: (v) => v.toFixed(1) + ' mm' },
  overhang: { label: 'Steepest wall lean', unit: '°', scale: 1, margin: 1.4, get: (a) => a.overhang, fmt: (v) => v.toFixed(1) + '°' },
  tipFilled: { label: 'Tipping angle, filled', unit: '°', scale: 0.7, margin: 0.8, get: (a) => a.tipFilled, fmt: (v) => v.toFixed(1) + '°' },
  tipEmpty: { label: 'Tipping angle, empty', unit: '°', scale: 0.7, margin: 0.8, get: (a) => a.tipEmpty, fmt: (v) => v.toFixed(1) + '°' },
  mass: { label: 'Mass', unit: 'g', scale: 4, get: (a) => a.mass, fmt: (v) => Math.round(v) + ' g' },
};
export const MATERIALS = { PLA: 1.24, PETG: 1.27, ASA: 1.07, 'Ceramic (fired)': 2.3, 'Resin': 1.15 };
let seq = 0; export const kid = (p) => p + '_' + (Date.now() % 1e7).toString(36) + (seq++).toString(36);

export function newKiln() {
  return {
    v: 1, name: 'Kiln vessel', material: 'PLA', fill: 0.85,
    params: [{ name: 'H', v: '210', lock: true }, { name: 'rimR', v: '36' }, { name: 'wall', v: '2.4', lock: true }, { name: 'base', v: '3.2', lock: true }],
    profile: [{ z: '0', r: '34', lockZ: true }, { z: '34', r: '46' }, { z: '92', r: '56' }, { z: '148', r: '38' }, { z: '186', r: '24' }, { z: '=H', r: '=rimR', lockZ: true }],
    section: { sides: 0, corners: '0', lobes: 6, ripple: '0.06', twist: '60' },
    reliefs: [],
    shell: { wall: '=wall', floor: '=base' },
    constraints: [
      { id: 'c1', type: 'capacity', op: '=', value: 1200, on: true },
      { id: 'c2', type: 'overhang', op: '<=', value: 45, on: true },
      { id: 'c3', type: 'tipFilled', op: '>=', value: 12, on: true },
      { id: 'c4', type: 'rimD', op: '>=', value: 50, on: true },
      { id: 'c5', type: 'baseD', op: '>=', value: 60, on: true },
      { id: 'c6', type: 'mass', op: '<=', value: 320, on: false },
    ],
  };
}
export const TEMPLATES = {
  vase: { label: 'Twisted vase', make: () => newKiln() },
  carafe: { label: 'Carafe', make: () => Object.assign(newKiln(), { name: 'Carafe', params: [{ name: 'H', v: '240', lock: true }, { name: 'rimR', v: '20' }, { name: 'wall', v: '2.2', lock: true }, { name: 'base', v: '3', lock: true }],
    profile: [{ z: '0', r: '40', lockZ: true }, { z: '40', r: '50' }, { z: '105', r: '48' }, { z: '165', r: '24' }, { z: '210', r: '17' }, { z: '=H', r: '=rimR', lockZ: true }], section: { sides: 0, corners: '0', lobes: 0, ripple: '0', twist: '0' },
    constraints: [{ id: 'c1', type: 'capacity', op: '=', value: 1000, on: true }, { id: 'c2', type: 'overhang', op: '<=', value: 45, on: true }, { id: 'c3', type: 'tipFilled', op: '>=', value: 10, on: true }, { id: 'c4', type: 'neckD', op: '>=', value: 26, on: true }, { id: 'c5', type: 'baseD', op: '>=', value: 70, on: true }] }) },
  bud: { label: 'Bud vase', make: () => Object.assign(newKiln(), { name: 'Bud vase', params: [{ name: 'H', v: '150', lock: true }, { name: 'rimR', v: '12' }, { name: 'wall', v: '2', lock: true }, { name: 'base', v: '4', lock: true }],
    profile: [{ z: '0', r: '26', lockZ: true }, { z: '30', r: '32' }, { z: '75', r: '22' }, { z: '120', r: '10' }, { z: '=H', r: '=rimR', lockZ: true }], section: { sides: 6, corners: '0.7', lobes: 0, ripple: '0', twist: '40' },
    constraints: [{ id: 'c1', type: 'capacity', op: '=', value: 120, on: true }, { id: 'c2', type: 'overhang', op: '<=', value: 45, on: true }, { id: 'c3', type: 'tipFilled', op: '>=', value: 14, on: true }, { id: 'c4', type: 'neckD', op: '>=', value: 12, on: true }] }) },
  planter: { label: 'Planter', make: () => Object.assign(newKiln(), { name: 'Planter', params: [{ name: 'H', v: '130', lock: true }, { name: 'rimR', v: '75' }, { name: 'wall', v: '3', lock: true }, { name: 'base', v: '4', lock: true }],
    profile: [{ z: '0', r: '52', lockZ: true }, { z: '45', r: '62' }, { z: '95', r: '70' }, { z: '=H', r: '=rimR', lockZ: true }], section: { sides: 0, corners: '0.35', lobes: 12, ripple: '0.04', twist: '0' },
    constraints: [{ id: 'c1', type: 'capacity', op: '=', value: 1800, on: true }, { id: 'c2', type: 'overhang', op: '<=', value: 40, on: true }, { id: 'c3', type: 'tipFilled', op: '>=', value: 25, on: true }, { id: 'c4', type: 'maxD', op: '<=', value: 160, on: true }] }) },
};
export const isExpr = (v) => typeof v === 'string' && v.trim()[0] === '=';
// resolve the tree into numbers
export function resolve(doc) {
  const errors = []; const pr = resolveParams(doc.params.map((p) => ({ name: p.name, v: p.v })), 'mm'); Object.keys(pr.errors).forEach((k) => errors.push('Parameter ' + k + ': ' + pr.errors[k]));
  const S = pr.values, n = (v, label, fb) => { try { const x = valueOf(v, S, 'mm'); if (!isFinite(x)) throw new Error('not a number'); return x; } catch (e) { errors.push(label + ': ' + e.message); return fb; } };
  const pts = doc.profile.map((p, i) => ({ z: n(p.z, 'Point ' + (i + 1) + ' height', i * 30), r: Math.max(3, n(p.r, 'Point ' + (i + 1) + ' radius', 30)) }));
  for (let i = 1; i < pts.length; i++) if (pts[i].z <= pts[i - 1].z) { errors.push('Point ' + (i + 1) + ' is not above point ' + i + '.'); pts[i].z = pts[i - 1].z + 1; }
  const sec = doc.section;
  const D = {
    pts, sides: Math.round(n(sec.sides, 'Sides', 0)), corners: Math.min(1, Math.max(0, n(sec.corners, 'Corners', 0))), lobes: Math.round(n(sec.lobes, 'Lobes', 0)), ripple: Math.min(0.5, Math.max(0, n(sec.ripple, 'Ripple', 0))), twist: n(sec.twist, 'Twist', 0),
    wall: Math.max(0.4, n(doc.shell.wall, 'Wall', 2.4)), floor: Math.max(0.6, n(doc.shell.floor, 'Floor', 3)), fill: Math.min(1, Math.max(0.05, +doc.fill || 0.85)), density: MATERIALS[doc.material] || 1.24,
    reliefs: doc.reliefs.map((f) => ({ ...f, radius: n(f.radius, 'Relief radius', 15), amount: n(f.amount, 'Relief amount', 0) })),
  };
  return { D, scope: S, errors };
}
export function constraintStatus(c, a) {
  const T = CTYPES[c.type], v = T.get(a), tol = Math.max(T.scale * 0.6, Math.abs(c.value) * 0.01);
  const ok = c.op === '=' ? Math.abs(v - c.value) <= tol : c.op === '<=' ? v <= c.value + tol * 0.25 : v >= c.value - tol * 0.25;
  return { v, ok, tol };
}
export function migrate(o) { if (!o || o.v !== 1 || !Array.isArray(o.profile)) return newKiln(); const d = newKiln(); return Object.assign(d, o); }
export { validName };
