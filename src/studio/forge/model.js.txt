// Forge project: parameters, bodies (generator + deformers + direct edits), printing settings.
import { resolveParams } from '../core/params.js';
import { generate } from './gen.js';
import { applyMods } from './mods.js';
import { replay } from './ops.js';
import { triangulateOriented } from './mesh.js';

export function scopeOf(project) { return resolveParams(project.params, 'mm'); }

export function buildBody(project, body, upTo) {
  const { values, errors } = scopeOf(project);
  let m = generate(body.gen, values); m = applyMods(m, body.mods, values);
  const ops = upTo === undefined ? body.ops : body.ops.slice(0, upTo), notes = replay(m, ops);
  return { mesh: m, notes, errors };
}
export function buildAll(project) { return project.bodies.filter((b) => b.visible !== false).map((b) => ({ body: b, ...buildBody(project, b) })); }
export const trisOf = (m) => triangulateOriented(m);

const P = (name, v, note) => ({ name, v, note });
export const TEMPLATES = {
  vase: () => ({ name: 'Vase', params: [P('H', 180, 'Height'), P('R0', 38, 'Base radius'), P('Rbelly', 58, 'Widest radius'), P('Rneck', 24, 'Neck radius'), P('Rtop', 34, 'Rim radius'), P('wall', 3, 'Wall thickness'), P('seg', 72, 'Segments around')], body: { name: 'Vase', gen: { type: 'vessel', profile: [{ x: 0, y: 0 }, { x: '=R0', y: 0, corner: true }, { x: '=Rbelly', y: '=H*0.32' }, { x: '=Rneck', y: '=H*0.8' }, { x: '=Rtop', y: '=H' }], segments: '=seg', samples: 56, smooth: true, thickness: '=wall', base: '=wall', sweep: 360 }, mods: [] } }),
  bowl: () => ({ name: 'Bowl', params: [P('R', 70, 'Radius'), P('depth', 55, 'Depth'), P('wall', 3, 'Wall'), P('seg', 72)], body: { name: 'Bowl', gen: { type: 'vessel', profile: [{ x: 0, y: 0 }, { x: '=R*0.45', y: 0 }, { x: '=R*0.85', y: '=depth*0.35' }, { x: '=R', y: '=depth' }], segments: '=seg', samples: 40, smooth: true, thickness: '=wall', base: '=wall', sweep: 360 }, mods: [] } }),
  tower: () => ({ name: 'Twisted tower', params: [P('W', 40, 'Half width'), P('H', 160, 'Height'), P('turn', 120, 'Twist (deg)')], body: { name: 'Tower', gen: { type: 'extrude', plane: { kind: 'XY', offset: 0 }, sketch: [{ x: '=-W', y: '=-W', corner: true }, { x: '=W', y: '=-W', corner: true }, { x: '=W', y: '=W', corner: true }, { x: '=-W', y: '=W', corner: true }], height: '=H', steps: 40, taper: 0.55, twist: '=turn', thickness: 0, smooth: false }, mods: [] } }),
  ripple: () => ({ name: 'Ribbed vase', params: [P('H', 150), P('R', 40), P('wall', 2.4), P('seg', 96)], body: { name: 'Ribbed vase', gen: { type: 'vessel', profile: [{ x: 0, y: 0 }, { x: '=R*0.8', y: 0, corner: true }, { x: '=R*1.25', y: '=H*0.4' }, { x: '=R*0.9', y: '=H*0.85' }, { x: '=R', y: '=H' }], segments: '=seg', samples: 60, smooth: true, thickness: '=wall', base: '=wall', sweep: 360 }, mods: [{ id: 'm1', type: 'ripple', on: true, amp: 2.2, freq: 5, lobes: 12, phase: 0 }, { id: 'm2', type: 'twist', on: true, deg: 45, easing: 'smooth' }] } }),
  box: () => ({ name: 'Block', params: [P('W', 60), P('D', 60), P('H', 60)], body: { name: 'Block', gen: { type: 'box', w: '=W', d: '=D', h: '=H' }, mods: [] } }),
};
export function newForge(kind = 'vase') {
  const t = (TEMPLATES[kind] || TEMPLATES.vase)();
  return { version: 1, kind: 'forge', name: t.name, nextId: 10, params: t.params, bodies: [{ id: 'b1', visible: true, ops: [], ...t.body }], active: 'b1', print: { scalePct: 100, base: false, baseMm: 1.6, minWall: 0.8, bedX: 220, bedY: 220, bedZ: 250, overhang: 45 } };
}
export function migrateForge(p) {
  if (!p || p.kind !== 'forge' || !Array.isArray(p.bodies)) throw new Error('This is not a Forge project file.');
  const d = newForge('box'); const o = { ...d, ...p }; o.print = { ...d.print, ...(p.print || {}) }; if (!Array.isArray(o.params)) o.params = d.params; o.bodies.forEach((b) => { b.ops = b.ops || []; b.mods = b.mods || []; }); if (!o.bodies.some((b) => b.id === o.active)) o.active = o.bodies[0].id; return o;
}
