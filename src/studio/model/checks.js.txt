// Design checks: geometry sanity, room sizes (NBC), openings, structure and printing.
import { detectRooms } from './rooms.js';
import { pointSeg, dist } from './geometry.js';
import { loadTakedown, beamChecks } from './structure.js';
import { formatLength } from '../core/units.js';

const NBC = { bed: [9.5, 2.4, 'bedroom'], living: [9.5, 2.4, 'living room'], dining: [9.5, 2.4, 'habitable room'], kitchen: [4.5, 1.8, 'kitchen'], bath: [1.8, 1.2, 'bathroom'], wc: [1.1, 0.9, 'WC'], bathwc: [2.8, 1.2, 'bath with WC'] };
export const ROOM_TYPES = [['room', 'Room'], ['bed', 'Bedroom'], ['living', 'Living'], ['dining', 'Dining'], ['kitchen', 'Kitchen'], ['bath', 'Bathroom'], ['wc', 'WC'], ['bathwc', 'Bath and WC'], ['store', 'Store'], ['pooja', 'Pooja'], ['corridor', 'Corridor'], ['court', 'Courtyard (open)']];

export function runChecks(model, mode = 'ftin') {
  const out = []; const add = (lvl, msg, ids) => out.push({ lvl, msg, ids: ids || [] });
  model.errors.slice(0, 6).forEach((e) => add('err', e));
  // walls
  const ws = model.walls;
  ws.forEach((w, i) => {
    if (w.h > (model.levelById[w.level].height + 0.01) + 6) add('warn', 'Wall ' + w.id + ' is much taller than its level.', [w.id]);
    for (let j = i + 1; j < ws.length; j++) {
      const v = ws[j]; if (v.level !== w.level) continue;
      const par = Math.abs(w.d[0] * v.d[1] - w.d[1] * v.d[0]) < 1e-4;
      if (par && pointSeg(v.a, w.a, w.b).d < 0.05 && pointSeg(v.b, w.a, w.b).d < 0.05) add('warn', 'Walls ' + w.id + ' and ' + v.id + ' overlap.', [w.id, v.id]);
    }
  });
  // openings
  const byWall = {};
  model.openings.forEach((o) => {
    const w = model.wallById[o.wall]; (byWall[w.id] = byWall[w.id] || []).push(o);
    if (o.pos - o.w / 2 < -0.01 || o.pos + o.w / 2 > w.len + 0.01) add('err', 'Opening ' + o.id + ' runs past the end of its wall.', [o.id]);
    else if (o.pos - o.w / 2 < 0.4 || w.len - (o.pos + o.w / 2) < 0.4) add('warn', 'Opening ' + o.id + ' is within 5 in of a wall end. Keep a solid return of 0.5 ft or more.', [o.id]);
    if (o.sill + o.h > w.h + 0.01) add('err', 'Opening ' + o.id + ' is taller than its wall.', [o.id]);
  });
  Object.keys(byWall).forEach((id) => { const L = byWall[id].sort((a, b) => a.pos - b.pos); for (let i = 0; i + 1 < L.length; i++) if (L[i].pos + L[i].w / 2 > L[i + 1].pos - L[i + 1].w / 2 + 0.01 && L[i].z0 < L[i + 1].z1 && L[i + 1].z0 < L[i].z1) add('err', 'Openings ' + L[i].id + ' and ' + L[i + 1].id + ' overlap.', [L[i].id, L[i + 1].id]); });
  // rooms
  model.levels.forEach((L) => {
    detectRooms(model, L.id).forEach((r) => {
      const label = r.name || 'Unnamed room', m2 = r.net * 0.09290304, rule = NBC[r.type];
      const ids = r.label ? [r.label.id] : [];
      if (!r.label) add('info', L.name + ': a closed room of ' + (Math.round(r.net * 10) / 10) + ' sq ft has no name. Use the Room tool to label it.', []);
      if (rule && m2 < rule[0] - 0.01) add(m2 < rule[0] * 0.8 ? 'err' : 'warn', L.name + ' ' + label + ': ' + m2.toFixed(1) + ' m² is below the NBC minimum of ' + rule[0] + ' m² for a ' + rule[2] + '.', ids);
      // access and light
      const touches = (o) => r.ring.some((p, i) => pointSeg(o.c, p, r.ring[(i + 1) % r.ring.length]).d < 0.2);
      const ops = model.openings.filter((o) => o.level === L.id && touches(o));
      if (r.type !== 'court' && !ops.some((o) => o.kind === 'door' || o.kind === 'arch')) add('err', L.name + ' ' + label + ' has no door or opening.', ids);
      if (rule && r.type !== 'court' && !ops.some((o) => o.kind === 'window' || o.kind === 'vent')) add('warn', L.name + ' ' + label + ' has no window or ventilator.', ids);
    });
  });
  // structure
  if (model.columns.length) {
    loadTakedown(model).forEach((c) => { if (!c.ok) add('warn', 'Column ' + c.id + ' (' + c.section + ' mm): ' + (c.slender > 12 ? 'slenderness ' + c.slender.toFixed(1) + ' is above 12' : 'load ' + Math.round(c.Pu) + ' kN needs about ' + c.suggest + ' mm square') + '.', [c.id]); });
    beamChecks(model).forEach((b) => { if (!b.ok) add('warn', 'Beam ' + b.id + ': span ' + b.span.toFixed(2) + ' m needs about ' + b.need + ' mm depth, has ' + b.depth + ' mm.', [b.id]); });
  } else if (model.walls.length > 3) add('info', 'No structural frame yet. Use Engineering, Generate frame, to add columns, beams and footings.');
  const order = { err: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.lvl] - order[b.lvl]);
}

export function printChecks(model, opts, parts) {
  const out = [], k = 304.8 / opts.scale;
  const thin = model.walls.filter((w) => w.t * k < opts.minMm - 1e-6);
  if (thin.length) out.push({ lvl: 'warn', msg: thin.length + ' wall' + (thin.length > 1 ? 's are' : ' is') + ' thinner than ' + opts.minMm + ' mm at 1:' + opts.scale + ' (thinnest ' + (Math.min(...thin.map((w) => w.t)) * k).toFixed(2) + ' mm). Turn on "Thicken thin walls" or print at a larger scale.' });
  const smallOpen = model.openings.filter((o) => Math.min(o.w, o.h) * k < 1.5);
  if (smallOpen.length) out.push({ lvl: 'info', msg: smallOpen.length + ' opening' + (smallOpen.length > 1 ? 's are' : ' is') + ' smaller than 1.5 mm at this scale and may not print.' });
  return out;
}
export { formatLength, dist };
