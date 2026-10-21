// Material take-off from the model. Quantities are indicative; rates and wastage are the estimator's job.
import { wallSolidsUnion, ringOfColumn, autoRoofMP, parapetMP } from './solids.js';
import { meshStats, ringArea, mpArea, open as openRing } from './geometry.js';
import { roomsNoCourt } from './structure.js';

const FT = 0.3048, F3 = FT * FT * FT, F2 = FT * FT;
const STEEL = { footing: 60, column: 150, beam: 120, slab: 80 };      // kg per m3 of concrete, typical

export function takeoff(model) {
  const rows = [], add = (group, item, unit, qty, note) => rows.push({ group, item, unit, qty: Math.round(qty * 1000) / 1000, note: note || '' });
  let vFoot = 0, vPed = 0, exc = 0, pcc = 0;
  model.footings.forEach((f) => {
    vFoot += f.size * f.size * f.padT * F3; vPed += f.ped * f.ped * (f.depth - f.padT) * F3;
    exc += Math.pow(f.size + 2, 2) * f.depth * F3; pcc += Math.pow(f.size + 1, 2) * 0.33 * F3;
  });
  let vCol = 0, vBeam = 0, beamLen = 0;
  model.columns.forEach((c) => { vCol += (c.shape === 'round' ? Math.PI * Math.pow(c.b / 2, 2) : c.b * c.d) * (c.z1 - c.z0) * F3; });
  model.beams.forEach((b) => { vBeam += b.w * b.depth * b.len * F3; beamLen += b.len * FT; });
  let vSlab = 0, aSlab = 0;
  model.slabs.forEach((s) => { const a = Math.abs(ringArea(s.ring)) - (s.holes || []).reduce((t, h) => t + Math.abs(ringArea(h)), 0); aSlab += a * F2; vSlab += a * s.t * F3; });
  model.levels.filter((l) => l.autoSlab).forEach((l) => { const a = roomsNoCourt(model, l.id).reduce((t, r) => t + r.gross, 0); aSlab += a * F2; vSlab += a * l.slabT * F3; });
  let vBrick = 0, wallLen = 0, plaster = 0;
  model.levels.forEach((l) => {
    const t = wallSolidsUnion(model, l.id); if (t.length) vBrick += meshStats(t).volume * F3;
  });
  model.walls.forEach((w) => {
    wallLen += w.len * FT; const ops = model.openings.filter((o) => o.wall === w.id).reduce((s, o) => s + o.w * o.h, 0);
    plaster += 2 * Math.max(0, w.len * w.h - ops) * F2;
  });
  const doors = model.openings.filter((o) => o.kind === 'door' || o.kind === 'arch'), wins = model.openings.filter((o) => o.kind === 'window' || o.kind === 'vent');
  let floor = 0; model.levels.forEach((l) => { roomsNoCourt(model, l.id).forEach((r) => { floor += r.net * F2; }); });
  let roofA = 0; model.roofs.forEach((r) => { roofA += ((r.x1 - r.x0 + 2 * r.over) * (r.y1 - r.y0 + 2 * r.over) * F2) / Math.cos(r.pitch * Math.PI / 180); });
  // RCC roofs: the slab (rectangle roofs and the automatic roof of a level) and the parapet that stands on it
  let rccA = 0, vRcc = 0, vPar = 0;
  model.roofs.filter((r) => r.type === 'rcc').forEach((r) => {
    const w = r.x1 - r.x0 + 2 * r.over, d = r.y1 - r.y0 + 2 * r.over; rccA += w * d * F2; vRcc += w * d * r.t * F3;
    vPar += Math.max(0, 2 * (w + d) - 4 * r.parT) * r.parT * r.parapet * F3;
  });
  model.levels.filter((l) => l.rccRoof).forEach((l) => {
    const a = autoRoofMP(model, l.id); if (!a || !a.mp.length) return;
    const area = mpArea(a.mp); rccA += area * F2; vRcc += area * l.roofT * F3; roofA += area * F2;
    const par = parapetMP(a.mp, l.parT); if (par.length) vPar += mpArea(par) * l.parapet * F3;
  });
  add('Earthwork', 'Excavation for footings', 'm³', exc);
  add('Earthwork', 'PCC 1:4:8 under footings (100 mm)', 'm³', pcc);
  add('Concrete', 'Footings and pedestals', 'm³', vFoot + vPed);
  add('Concrete', 'Columns', 'm³', vCol);
  add('Concrete', 'Beams', 'm³', vBeam, 'total length ' + (Math.round(beamLen * 10) / 10) + ' m');
  add('Concrete', 'Slabs', 'm³', vSlab, 'area ' + (Math.round(aSlab * 10) / 10) + ' m²');
  if (vRcc > 0) add('Concrete', 'RCC roof slabs', 'm³', vRcc, 'area ' + (Math.round(rccA * 10) / 10) + ' m²');
  const conc = vFoot + vPed + vCol + vBeam + vSlab + vRcc;
  add('Concrete', 'Total concrete', 'm³', conc);
  add('Steel', 'Reinforcement (estimate)', 'kg', (vFoot + vPed) * STEEL.footing + vCol * STEEL.column + vBeam * STEEL.beam + (vSlab + vRcc) * STEEL.slab, 'typical kg per m³ by member');
  add('Masonry', 'Brickwork net of openings', 'm³', vBrick);
  if (vPar > 0) add('Masonry', 'Roof parapet', 'm³', vPar, 'on the RCC roof edge');
  add('Masonry', 'Wall length', 'm', wallLen);
  add('Finishes', 'Plaster, both faces net of openings', 'm²', plaster);
  add('Finishes', 'Floor area (clear room area)', 'm²', floor);
  add('Finishes', 'Roof area (sloped)', 'm²', roofA);
  if (rccA > 0) add('Finishes', 'Terrace waterproofing and finish (RCC roofs)', 'm²', rccA);
  add('Openings', 'Doors and arches', 'nos', doors.length, 'area ' + (Math.round(doors.reduce((s, o) => s + o.w * o.h, 0) * F2 * 100) / 100) + ' m²');
  add('Openings', 'Windows and ventilators', 'nos', wins.length, 'area ' + (Math.round(wins.reduce((s, o) => s + o.w * o.h, 0) * F2 * 100) / 100) + ' m²');
  return rows;
}
export function toCSV(rows, cols) {
  const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [cols.map((c) => esc(c.label)).join(','), ...rows.map((r) => cols.map((c) => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))].join('\n');
}
export { ringOfColumn };
