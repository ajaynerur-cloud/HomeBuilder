// Draws the plan on a 2D canvas context. World: x east, y north, feet. Screen: y down.
import { footprints } from '../model/walls.js';
import { detectRooms } from '../model/rooms.js';
import { planWallMP } from '../io/dxf.js';
import { doorSwing } from '../model/symbols.js';
import { ringOfColumn, stairGeom } from '../model/solids.js';
import { open } from '../model/geometry.js';
import { visibleLayer } from './hit.js';
import { formatLength, fmtArea } from '../core/units.js';
import { gridStepFor } from './snap.js';
import { resolveFill } from '../model/materials.js';

// Camera: x, y is the plan point at the centre of the screen. rot turns the plan (degrees, anticlockwise on screen).
// tilt is the viewing angle above the floor: 90 is a straight plan, smaller values lean the plan back and show walls as blocks.
export function makeCamera() { return { x: 0, y: 0, scale: 12, rot: 0, tilt: 90 }; }
export const TILT_MIN = 25;
function frame(cam) {
  const r = (cam.rot || 0) * Math.PI / 180, t = Math.max(TILT_MIN, Math.min(90, cam.tilt === undefined ? 90 : cam.tilt)) * Math.PI / 180;
  return { c: Math.cos(r), s: Math.sin(r), k: Math.sin(t), up: Math.cos(t) };
}
export const isTilted = (cam) => (cam.tilt === undefined ? 90 : cam.tilt) < 88;
// z is a height above the floor of the level being drawn; it only matters when the view is tilted
export const toScreen = (cam, w, h, p, z = 0) => {
  const T = frame(cam), dx = p[0] - cam.x, dy = p[1] - cam.y, rx = dx * T.c - dy * T.s, ry = dx * T.s + dy * T.c;
  return [w / 2 + rx * cam.scale, h / 2 - ry * cam.scale * T.k - z * cam.scale * T.up];
};
export const toWorld = (cam, w, h, s) => {
  const T = frame(cam), rx = (s[0] - w / 2) / cam.scale, ry = -(s[1] - h / 2) / (cam.scale * T.k);
  return [cam.x + rx * T.c + ry * T.s, cam.y - rx * T.s + ry * T.c];
};
// plan-space unit vector that points towards the viewer (screen down)
export function towardViewer(cam) { const a = toWorld(cam, 100, 100, [50, 50]), b = toWorld(cam, 100, 100, [50, 60]), d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; }

const cacheKey = new WeakMap();
function cached(V, key, fn) {
  let c = cacheKey.get(V.store); if (!c || c.rev !== V.store.rev) { c = { rev: V.store.rev, map: {} }; cacheKey.set(V.store, c); }
  if (!(key in c.map)) c.map[key] = fn(); return c.map[key];
}
export const roomsOf = (V, level) => cached(V, 'rooms:' + level, () => detectRooms(V.model, level));
export const wallMPOf = (V, level) => cached(V, 'wmp:' + level, () => planWallMP(V.model, level));

export function drawPlan(g, V) {
  const { w, h, cam, model, project, level, C } = V, S = (p, z) => toScreen(cam, w, h, p, z), sc = cam.scale, mm = formatLength, tilted = isTilted(cam), LV = model.levelById[level] || { elev: 0 };
  const vis = (layer) => visibleLayer(project, layer), sel = new Set(V.selection || []), disp = project.display;
  g.save(); g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
  const path = (pts, close, z) => { g.beginPath(); pts.forEach((p, i) => { const s = S(p, z); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); }); if (close) g.closePath(); };
  // grid: lines are drawn between their end points, so they follow the rotation and the tilt
  if (V.showGrid) {
    const step = gridStepFor(sc), cs = [[0, 0], [w, 0], [0, h], [w, h]].map((q) => toWorld(cam, w, h, q));
    const x0 = Math.min(...cs.map((q) => q[0])), x1 = Math.max(...cs.map((q) => q[0])), y0 = Math.min(...cs.map((q) => q[1])), y1 = Math.max(...cs.map((q) => q[1]));
    g.lineWidth = 1;
    if ((x1 - x0) / step < 400 && (y1 - y0) / step < 400) {
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const major = Math.abs(x / (step * 5) - Math.round(x / (step * 5))) < 1e-6, a1 = S([x, y0]), b1 = S([x, y1]); g.strokeStyle = major ? C.gridMajor : C.grid; g.beginPath(); g.moveTo(a1[0], a1[1]); g.lineTo(b1[0], b1[1]); g.stroke(); }
      for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const major = Math.abs(y / (step * 5) - Math.round(y / (step * 5))) < 1e-6, a1 = S([x0, y]), b1 = S([x1, y]); g.strokeStyle = major ? C.gridMajor : C.grid; g.beginPath(); g.moveTo(a1[0], a1[1]); g.lineTo(b1[0], b1[1]); g.stroke(); }
    }
    const L = 10 / sc, o1 = S([-L, 0]), o2 = S([L, 0]), o3 = S([0, -L]), o4 = S([0, L]); g.strokeStyle = C.axis; g.beginPath(); g.moveTo(o1[0], o1[1]); g.lineTo(o2[0], o2[1]); g.moveTo(o3[0], o3[1]); g.lineTo(o4[0], o4[1]); g.stroke();
  }
  // level below as a light underlay
  const li = model.levels.findIndex((l) => l.id === level);
  if (V.showUnder && li > 0) {
    const lower = model.levels[li - 1].id;
    g.fillStyle = C.under; wallMPOf(V, lower).forEach((poly) => poly.forEach((r) => { path(open(r), true); g.fill('evenodd'); }));
  }
  // rooms
  if (vis('A-ROOM')) roomsOf(V, level).forEach((r) => {
    path(r.ring, true); r.holes.forEach((hh) => { hh.forEach((p, i) => { const s = S(p); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); }); g.closePath(); });
    g.fillStyle = r.type === 'court' ? C.court : (r.label ? C.room : C.roomOpen); g.fill('evenodd');
  });
  // slabs, roofs, footings, beams (below the walls)
  model.slabs.filter((s) => s.level === level && vis(s.layer)).forEach((s) => { g.strokeStyle = sel.has(s.id) ? C.sel : C.slab; g.lineWidth = sel.has(s.id) ? 2 : 1; g.setLineDash([6, 4]); path(s.ring, true); g.stroke(); (s.holes || []).forEach((hh) => { path(hh, true); g.stroke(); }); g.setLineDash([]); });
  model.roofs.filter((r) => r.level === level && vis(r.layer)).forEach((r) => {
    const o = r.over, X0 = r.x0 - o, X1 = r.x1 + o, Y0 = r.y0 - o, Y1 = r.y1 + o; g.strokeStyle = sel.has(r.id) ? C.sel : C.roof; g.lineWidth = sel.has(r.id) ? 2 : 1; g.setLineDash([10, 4, 2, 4]);
    const rz = tilted ? r.zBase - LV.elev : 0; path([[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]], true, rz); g.stroke(); g.setLineDash([]);
    if (r.type === 'gable' || r.type === 'hip') { const ax = r.type === 'hip' ? (X1 - X0 >= Y1 - Y0) : r.ridge !== 'y', ym = (Y0 + Y1) / 2, xm = (X0 + X1) / 2; path(ax ? [[X0, ym], [X1, ym]] : [[xm, Y0], [xm, Y1]], false, rz); g.stroke(); }
  });
  model.footings.filter((f) => f.level === level && vis(f.layer)).forEach((f) => { const hs = f.size / 2; g.strokeStyle = sel.has(f.id) ? C.sel : C.footing; g.lineWidth = sel.has(f.id) ? 2 : 1; g.setLineDash([4, 3]); path([[f.c[0] - hs, f.c[1] - hs], [f.c[0] + hs, f.c[1] - hs], [f.c[0] + hs, f.c[1] + hs], [f.c[0] - hs, f.c[1] + hs]], true); g.stroke(); g.setLineDash([]); });
  model.beams.filter((b) => b.level === level && vis(b.layer)).forEach((b) => {
    const d = [(b.b[0] - b.a[0]) / b.len, (b.b[1] - b.a[1]) / b.len], n = [-d[1] * b.w / 2, d[0] * b.w / 2];
    g.strokeStyle = sel.has(b.id) ? C.sel : C.beam; g.lineWidth = sel.has(b.id) ? 2 : 1; g.setLineDash([8, 3]);
    path([[b.a[0] + n[0], b.a[1] + n[1]], [b.b[0] + n[0], b.b[1] + n[1]]]); g.stroke(); path([[b.a[0] - n[0], b.a[1] - n[1]], [b.b[0] - n[0], b.b[1] - n[1]]]); g.stroke(); g.setLineDash([]);
  });
  // stairs
  model.stairs.filter((s) => s.level === level && vis(s.layer)).forEach((s) => {
    const gm = stairGeom(s), nrm = [-gm.d[1], gm.d[0]]; g.strokeStyle = sel.has(s.id) ? C.sel : C.stair; g.lineWidth = sel.has(s.id) ? 2 : 1;
    for (let i = 0; i <= gm.n - 1; i++) { const p = [s.p[0] + gm.d[0] * i * s.tread, s.p[1] + gm.d[1] * i * s.tread]; path([[p[0] - nrm[0] * s.width / 2, p[1] - nrm[1] * s.width / 2], [p[0] + nrm[0] * s.width / 2, p[1] + nrm[1] * s.width / 2]]); g.stroke(); }
    const e = [s.p[0] + gm.d[0] * gm.run, s.p[1] + gm.d[1] * gm.run]; path([s.p, e]); g.stroke();
    const ah = 0.9; path([e, [e[0] - gm.d[0] * ah + nrm[0] * ah * 0.4, e[1] - gm.d[1] * ah + nrm[1] * ah * 0.4]]); g.stroke(); path([e, [e[0] - gm.d[0] * ah - nrm[0] * ah * 0.4, e[1] - gm.d[1] * ah - nrm[1] * ah * 0.4]]); g.stroke();
  });
  // walls: poche from the union cut at 4 ft
  if (vis('A-WALL') && tilted) drawBlocks(g, V, S, path);
  else if (vis('A-WALL')) {
    g.fillStyle = C.wall; wallMPOf(V, level).forEach((poly) => { g.beginPath(); poly.forEach((r) => { open(r).forEach((p, i) => { const s = S(p); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); }); g.closePath(); }); g.fill('evenodd'); });
    g.strokeStyle = C.wallEdge; g.lineWidth = 1; wallMPOf(V, level).forEach((poly) => poly.forEach((r) => { path(open(r), true); g.stroke(); }));
  }
  // openings
  model.openings.filter((o) => o.level === level && vis(o.layer) && !tilted).forEach((o) => {
    const wl = model.wallById[o.wall], isel = sel.has(o.id), hw = wl.t / 2, a = (f) => [o.c[0] + wl.d[0] * f, o.c[1] + wl.d[1] * f];
    g.strokeStyle = isel ? C.sel : (o.kind === 'window' || o.kind === 'vent' ? C.glass : C.door); g.lineWidth = isel ? 2.2 : 1.2;
    if (o.kind === 'window' || o.kind === 'vent') { [-1, 0, 1].forEach((k) => { const off = k * hw * 0.6; path([[a(-o.w / 2)[0] + wl.n[0] * off, a(-o.w / 2)[1] + wl.n[1] * off], [a(o.w / 2)[0] + wl.n[0] * off, a(o.w / 2)[1] + wl.n[1] * off]]); g.stroke(); }); }
    else if (o.kind === 'arch') { g.setLineDash([5, 3]); path([[a(-o.w / 2)[0] + wl.n[0] * hw, a(-o.w / 2)[1] + wl.n[1] * hw], [a(o.w / 2)[0] + wl.n[0] * hw, a(o.w / 2)[1] + wl.n[1] * hw]]); g.stroke(); path([[a(-o.w / 2)[0] - wl.n[0] * hw, a(-o.w / 2)[1] - wl.n[1] * hw], [a(o.w / 2)[0] - wl.n[0] * hw, a(o.w / 2)[1] - wl.n[1] * hw]]); g.stroke(); g.setLineDash([]); }
    else {
      const sw = doorSwing(wl, o); path([sw.hinge, sw.open]); g.stroke();
      const sweep = ((sw.end - sw.start) % 360 + 360) % 360; g.beginPath();
      if (!tilted && !cam.rot) { const hs = S(sw.hinge); g.arc(hs[0], hs[1], sw.r * sc, -sw.start * Math.PI / 180, -sw.end * Math.PI / 180, true); g.stroke(); return; }
      for (let i = 0; i <= 18; i++) { const an = (sw.start + sweep * i / 18) * Math.PI / 180, q = S([sw.hinge[0] + Math.cos(an) * sw.r, sw.hinge[1] + Math.sin(an) * sw.r]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
      g.stroke();
    }
  });
  // columns
  model.columns.filter((c) => c.level === level && vis(c.layer)).forEach((c) => {
    g.fillStyle = sel.has(c.id) ? C.sel : C.column; if (c.shape === 'round') { const s = S(c.c); g.beginPath(); if (g.ellipse) g.ellipse(s[0], s[1], c.b / 2 * sc, c.b / 2 * sc * (tilted ? Math.sin(Math.max(TILT_MIN, cam.tilt) * Math.PI / 180) : 1), 0, 0, Math.PI * 2); else g.arc(s[0], s[1], c.b / 2 * sc, 0, Math.PI * 2); g.fill(); } else { path(ringOfColumn(c), true); g.fill(); }
  });
  // dimensions and text
  g.font = '11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  model.dims.filter((d) => d.level === level && vis(d.layer)).forEach((d) => {
    const dx = d.b[0] - d.a[0], dy = d.b[1] - d.a[1], l = Math.hypot(dx, dy) || 1, n = [-dy / l, dx / l], a = [d.a[0] + n[0] * d.off, d.a[1] + n[1] * d.off], b = [d.b[0] + n[0] * d.off, d.b[1] + n[1] * d.off];
    g.strokeStyle = sel.has(d.id) ? C.sel : C.dim; g.fillStyle = g.strokeStyle; g.lineWidth = 1; path([a, b]); g.stroke(); path([d.a, [a[0] + n[0] * 0.3, a[1] + n[1] * 0.3]]); g.stroke(); path([d.b, [b[0] + n[0] * 0.3, b[1] + n[1] * 0.3]]); g.stroke();
    const m = S([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), sa = S(a), sb = S(b); g.save(); g.translate(m[0], m[1]); let ang = Math.atan2(sb[1] - sa[1], sb[0] - sa[0]); if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI; g.rotate(ang); g.fillText(mm(l, disp), 0, -8); g.restore();
  });
  model.texts.filter((t) => t.level === level && vis(t.layer)).forEach((t) => { const s = S(t.p); g.fillStyle = sel.has(t.id) ? C.sel : C.text; g.font = Math.max(9, t.size * sc) + 'px sans-serif'; g.textAlign = 'left'; g.fillText(t.text, s[0], s[1]); g.textAlign = 'center'; });
  if (vis('A-ROOM')) {
    g.font = '12px sans-serif';
    roomsOf(V, level).forEach((r) => {
      const s = S(r.inside); if (s[0] < -50 || s[0] > w + 50 || s[1] < -50 || s[1] > h + 50) return;
      const lab = r.label, isel = lab && sel.has(lab.id);
      g.fillStyle = isel ? C.sel : C.text; g.font = 'bold 12px sans-serif'; g.fillText(r.name || (r.type === 'court' ? 'Open' : 'Room'), s[0], s[1] - 7);
      g.font = '11px sans-serif'; g.fillStyle = isel ? C.sel : C.textDim; g.fillText(fmtArea(r.net, disp), s[0], s[1] + 8);
    });
  }
  // selection outlines and grips
  if (sel.size) {
    const fp = footprints(model.walls.filter((x) => x.level === level));
    model.walls.filter((x) => sel.has(x.id) && x.level === level).forEach((x) => {
      g.strokeStyle = C.sel; g.lineWidth = 2; path(fp.get(x.id), true); g.stroke(); if (tilted) { path(fp.get(x.id), true, x.z1 - LV.elev); g.stroke(); }
      [x.a, x.b, [(x.a[0] + x.b[0]) / 2, (x.a[1] + x.b[1]) / 2]].forEach((p, i) => { const s = S(p); g.fillStyle = i === 2 ? C.gripMid : C.grip; g.strokeStyle = C.bg; g.lineWidth = 1; g.fillRect(s[0] - 4, s[1] - 4, 8, 8); g.strokeRect(s[0] - 4, s[1] - 4, 8, 8); });
    });
    model.openings.filter((x) => sel.has(x.id)).forEach((o) => { const s = S(o.c); g.fillStyle = C.grip; g.fillRect(s[0] - 4, s[1] - 4, 8, 8); });
    model.beams.filter((x) => sel.has(x.id)).forEach((b) => [b.a, b.b].forEach((p) => { const s = S(p); g.fillStyle = C.grip; g.fillRect(s[0] - 4, s[1] - 4, 8, 8); }));
  }
  // tool preview, snap marker
  if (V.preview) V.preview(g, S, V);
  if (V.box) { const a = S([V.box[0], V.box[1]]), b = S([V.box[2], V.box[3]]); g.strokeStyle = C.sel; g.fillStyle = C.selFill; g.setLineDash(V.boxCrossing ? [5, 3] : []); g.lineWidth = 1; g.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); g.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); g.setLineDash([]); }
  if (V.snap && V.snap.type !== 'free' && V.snap.type !== 'grid' && V.snap.type !== 'ortho') {
    const s = S(V.snap.p); g.strokeStyle = C.snap; g.lineWidth = 1.6; const k = 6;
    if (V.snap.type === 'end') g.strokeRect(s[0] - k, s[1] - k, 2 * k, 2 * k);
    else if (V.snap.type === 'mid') { g.beginPath(); g.moveTo(s[0], s[1] - k); g.lineTo(s[0] + k, s[1] + k); g.lineTo(s[0] - k, s[1] + k); g.closePath(); g.stroke(); }
    else if (V.snap.type === 'int') { g.beginPath(); g.moveTo(s[0] - k, s[1] - k); g.lineTo(s[0] + k, s[1] + k); g.moveTo(s[0] + k, s[1] - k); g.lineTo(s[0] - k, s[1] + k); g.stroke(); }
    else if (V.snap.type === 'cen') { g.beginPath(); g.arc(s[0], s[1], k, 0, Math.PI * 2); g.stroke(); }
    else { g.beginPath(); g.moveTo(s[0] - k, s[1]); g.lineTo(s[0], s[1] + k); g.lineTo(s[0] + k, s[1]); g.lineTo(s[0], s[1] - k); g.closePath(); g.stroke(); }
  }
  g.restore();
}


// ---- tilted view: walls and columns as shaded blocks, nearest drawn last
const BASE = { light: [214, 203, 178], dark: [176, 168, 150] };
function shade(rgb, f) { return 'rgb(' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * f)))).join(',') + ')'; }
function hexRGB(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
function blockList(V) {
  const { model, level, cam, project } = V, fp = footprints(model.walls.filter((x) => x.level === level)), L = model.levelById[level] || { elev: 0 }, mats = model.materials || [];
  const list = [], paint = (o, def) => { const r = resolveFill(mats, o.fill || o.fillA); return r ? hexRGB(r.hex) : def; };
  const dark = V.C && V.C.bg && V.C.bg.length === 7 && V.C.bg < '#808080';
  if (visibleLayer(project, 'A-WALL')) model.walls.filter((x) => x.level === level).forEach((x) => { const ring = fp.get(x.id); if (ring) list.push({ id: x.id, ring, z0: x.z0 - L.elev, z1: x.z1 - L.elev, rgb: paint(x, dark ? BASE.dark : BASE.light), wall: x }); });
  if (visibleLayer(project, 'S-COLS')) model.columns.filter((c) => c.level === level).forEach((c) => list.push({ id: c.id, ring: ringOfColumn(c), z0: 0, z1: c.z1 - L.elev, rgb: paint(c, [150, 156, 162]) }));
  const T = (p, z) => toScreen(cam, V.w, V.h, p, z);
  list.forEach((b) => { const cx = b.ring.reduce((s, p) => s + p[0], 0) / b.ring.length, cy = b.ring.reduce((s, p) => s + p[1], 0) / b.ring.length; b.depth = T([cx, cy], 0)[1]; });
  list.sort((a, b) => a.depth - b.depth);
  return list;
}
function drawBlocks(g, V, S, path) {
  const { cam, model, level, C } = V, view = towardViewer(cam), sel = new Set(V.selection || []), list = blockList(V), L = model.levelById[level] || { elev: 0 };
  const sun = [-0.5, 0.8], dark = C.bg < '#808080';
  list.forEach((b) => {
    const r = open(b.ring), area = r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2, sgn = area > 0 ? 1 : -1;
    for (let i = 0; i < r.length; i++) {
      const a = r[i], c = r[(i + 1) % r.length], dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1, n = [sgn * dy / l, -sgn * dx / l];
      if (n[0] * view[0] + n[1] * view[1] <= 0.01) continue;
      const f = 0.62 + 0.38 * Math.max(0, n[0] * sun[0] + n[1] * sun[1]);
      g.fillStyle = shade(b.rgb, f * (dark ? 0.85 : 1)); const q = [S(a, b.z0), S(c, b.z0), S(c, b.z1), S(a, b.z1)];
      g.beginPath(); q.forEach((s, k) => { if (k) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); }); g.closePath(); g.fill(); g.strokeStyle = C.wallEdge; g.lineWidth = 0.6; g.stroke();
    }
    g.fillStyle = shade(b.rgb, dark ? 1.0 : 1.12); path(r, true, b.z1); g.fill(); g.strokeStyle = sel.has(b.id) ? C.sel : C.wallEdge; g.lineWidth = sel.has(b.id) ? 2 : 0.8; g.stroke();
    // openings on the faces that look towards the viewer
    if (b.wall) model.openings.filter((o) => o.wall === b.id).forEach((o) => {
      const w = b.wall, side = (w.n[0] * view[0] + w.n[1] * view[1]) >= 0 ? 1 : -1, off = side * (w.t / 2 + 0.02);
      const P = (f, z) => S([o.c[0] + w.d[0] * f + w.n[0] * off, o.c[1] + w.d[1] * f + w.n[1] * off], z);
      const q = [P(-o.w / 2, o.z0 - L.elev), P(o.w / 2, o.z0 - L.elev), P(o.w / 2, o.z1 - L.elev), P(-o.w / 2, o.z1 - L.elev)];
      g.beginPath(); q.forEach((s, k) => { if (k) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); }); g.closePath();
      g.fillStyle = o.kind === 'door' ? 'rgba(107,68,35,0.92)' : (o.kind === 'arch' ? 'rgba(40,40,40,0.85)' : 'rgba(127,179,213,0.8)'); g.fill(); g.strokeStyle = sel.has(o.id) ? C.sel : C.wallEdge; g.lineWidth = sel.has(o.id) ? 2 : 0.7; g.stroke();
    });
  });
}
// The wall or column block under a screen point when the view is tilted (nearest first), else null
export function pickBlock(V, px) {
  if (!isTilted(V.cam)) return null;
  const view = towardViewer(V.cam), list = blockList(V).reverse(), inPoly = (pts, p) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if ((pts[i][1] > p[1]) !== (pts[j][1] > p[1]) && p[0] < (pts[j][0] - pts[i][0]) * (p[1] - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0]) c = !c; return c; };
  for (const b of list) {
    const r = open(b.ring), top = r.map((p) => toScreen(V.cam, V.w, V.h, p, b.z1)); if (inPoly(top, px)) return b.id;
    for (let i = 0; i < r.length; i++) {
      const a = r[i], c = r[(i + 1) % r.length], q = [toScreen(V.cam, V.w, V.h, a, b.z0), toScreen(V.cam, V.w, V.h, c, b.z0), toScreen(V.cam, V.w, V.h, c, b.z1), toScreen(V.cam, V.w, V.h, a, b.z1)];
      if (inPoly(q, px)) return b.id;
    }
  }
  void view; return null;
}
