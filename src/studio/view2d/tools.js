// Drawing and editing tools for the plan view.
import { resolveModel } from '../model/resolve.js';
import { modelOf } from '../model/resolve.js';
import * as GEN from '../model/generators.js';
import { dist, pointSeg, pointInRing, unit, sub, add, mul, perp } from '../model/geometry.js';
import { transformObjects, splitWall, deleteObjects } from '../model/transform.js';
import { moveObjects, setWallEnd, setBeamEnd } from '../model/edit.js';
import { parseLength, formatLength } from '../core/units.js';
import { valueOf } from '../core/params.js';
import { hitTest, boxSelect } from './hit.js';
import { detectRooms } from '../model/rooms.js';
import { KINDS } from '../model/schema.js';
import { stairGeom } from '../model/solids.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const r3 = (v) => Math.round(v * 1000) / 1000;

export function parseTyped(s, defUnit = 'ft') {
  s = String(s || '').trim(); if (!s) return null;
  const m = s.split('<');
  const L = parseLength(m[0], defUnit);
  if (isNaN(L)) return null;
  return { len: L, ang: m[1] !== undefined && m[1] !== '' ? parseFloat(m[1]) : null };
}

export function createTools(app) {
  const store = app.store, P = () => store.p, M = () => modelOf(store), level = () => store.p.activeLevel;
  const O = () => app.state.opts;
  const tools = {};
  const dyn = (v, s) => ({ len: v, text: s });
  const lenText = (l) => formatLength(l, store.p.display);

  // ---------------- select
  tools.select = {
    label: 'Select', hint: 'Click to select, drag a box to select many. Drag grips to stretch. Shift adds. Delete removes.', cursor: 'default',
    activate() { this.drag = null; }, deactivate() { this.drag = null; app.view2d.box = null; },
    down(e) {
      const v = app.view2d, sel = store.selection;
      // grips of the current selection
      const g = this.gripAt(e);
      if (g) { this.drag = { type: 'grip', grip: g, start: e.w, orig: clone(store.p), id: Math.random() }; return; }
      const id = v.pickBlockAt(e.px) || hitTest(M(), P(), level(), e.raw, v.cam.scale);
      if (id) {
        if (e.shift) store.toggle(id); else if (!sel.includes(id)) store.select([id]);
        if (store.selection.includes(id)) this.drag = { type: 'move', start: e.w, orig: clone(store.p), ids: store.selection.slice(), moved: false, id: Math.random() };
      } else { if (!e.shift) store.select([]); this.drag = { type: 'box', start: e.raw }; }
    },
    gripAt(e) {
      const sc = app.view2d.cam.scale, tol = 8 / sc, m = M();
      for (const id of store.selection) {
        const w = m.wallById[id];
        if (w) {
          if (dist(e.raw, w.a) < tol) return { kind: 'wallEnd', id, end: 'a' };
          if (dist(e.raw, w.b) < tol) return { kind: 'wallEnd', id, end: 'b' };
          const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]; if (dist(e.raw, mid) < tol) return { kind: 'wallMove', id };
        }
        const b = m.beams.find((x) => x.id === id);
        if (b) { if (dist(e.raw, b.a) < tol) return { kind: 'beamEnd', id, end: 'a' }; if (dist(e.raw, b.b) < tol) return { kind: 'beamEnd', id, end: 'b' }; }
        const o = m.openings.find((x) => x.id === id);
        if (o && dist(e.raw, o.c) < tol) return { kind: 'opening', id };
      }
      return null;
    },
    move(e) {
      const d = this.drag; if (!d) return;
      if (d.type === 'box') { app.view2d.box = [Math.min(d.start[0], e.raw[0]), Math.min(d.start[1], e.raw[1]), Math.max(d.start[0], e.raw[0]), Math.max(d.start[1], e.raw[1])]; app.view2d.boxCrossing = e.raw[0] < d.start[0]; return; }
      if (d.type === 'move') {
        const dx = e.w[0] - d.start[0], dy = e.w[1] - d.start[1];
        if (!d.moved && Math.hypot(dx, dy) * app.view2d.cam.scale < 4) return;
        d.moved = true; applyMove(d.orig, d.ids, dx, dy, d.id); return;
      }
      if (d.type === 'grip') applyGrip(d, e);
    },
    up(e) {
      const d = this.drag; this.drag = null; app.view2d.box = null;
      if (d && d.type === 'box') {
        const r = [Math.min(d.start[0], e.raw[0]), Math.min(d.start[1], e.raw[1]), Math.max(d.start[0], e.raw[0]), Math.max(d.start[1], e.raw[1])];
        if (r[2] - r[0] > 0.1 || r[3] - r[1] > 0.1) store.select(boxSelect(M(), P(), level(), r, e.raw[0] < d.start[0]), e.shift);
      }
    },
    key(k, ev) {
      if (k === 'Delete' || k === 'Backspace') { if (store.selection.length) { const ids = store.selection.slice(); store.transact('Delete', (p) => deleteObjects(p, ids)); } return true; }
      if (ev.ctrlKey && (k === 'a' || k === 'A')) { store.select(boxSelect(M(), P(), level(), [-1e6, -1e6, 1e6, 1e6], true)); return true; }
      if (ev.ctrlKey && (k === 'd' || k === 'D')) { if (store.selection.length) { const made = []; store.transact('Duplicate', (p) => { made.push(...transformObjects(p, store.selection, { type: 'move', dx: 1, dy: -1 }, true)); }); store.select(made); } return true; }
      if (k.startsWith('Arrow') && store.selection.length) {
        const s = app.view2d.step(), d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }[k];
        store.transact('Nudge', (p) => { moveWalls(p, M(), store.selection, d[0], d[1]); }, { coalesce: 'nudge' }); return true;
      }
      return false;
    },
  };

  function restore(p, orig) { KINDS.forEach((k) => { p[k] = clone(orig[k]); }); p.nextId = orig.nextId; }
  function moveWalls(p, m, ids, dx, dy) { moveObjects(p, m, ids, dx, dy, level()); }
  function applyMove(orig, ids, dx, dy, key) {
    const om = resolveModel(orig);
    store.transact('Move', (p) => { restore(p, orig); moveWalls(p, om, ids, dx, dy); }, { coalesce: 'drag' + key });
  }
  function applyGrip(d, e) {
    const g = d.grip, om = resolveModel(d.orig);
    if (g.kind === 'wallMove') { applyMove(d.orig, [g.id], e.w[0] - d.start[0], e.w[1] - d.start[1], d.id); return; }
    store.transact('Edit', (p) => {
      restore(p, d.orig);
      if (g.kind === 'wallEnd') {
        setWallEnd(p, om, g.id, g.end, e.w, level());
      } else if (g.kind === 'beamEnd') {
        setBeamEnd(p, g.id, g.end, e.w);
      } else if (g.kind === 'opening') {
        const o = om.openings.find((x) => x.id === g.id), w = om.wallById[o.wall], r = pointSeg(e.raw, w.a, w.b), pos = Math.max(o.w / 2 + 0.25, Math.min(w.len - o.w / 2 - 0.25, Math.round(r.t * w.len * 4) / 4));
        p.openings.find((x) => x.id === g.id).pos = r3(pos);
      }
    }, { coalesce: 'drag' + d.id });
  }

  // ---------------- walls and rectangles
  const wallOpts = () => ({ t: O().wallT, h: O().wallH });
  tools.wall = {
    label: 'Wall', hint: 'Click points to draw a chain of walls. Type a length, or length<angle, then Enter. Double-click or Esc to finish.', cursor: 'crosshair',
    activate() { this.start = null; this.first = null; this.n = 0; this.cur = null; app.view2d.typed = ''; },
    deactivate() { this.start = null; },
    from() { return this.start; },
    down(e) {
      if (!this.start) { this.start = e.w; this.first = e.w; this.n = 0; return; }
      this.add(e.w);
    },
    add(b) {
      const a = this.start; if (dist(a, b) < 0.05) return;
      store.transact('Wall', (p) => { GEN.addWall(p, a, b, wallOpts()); });
      this.n++; this.start = b;
      if (this.n >= 2 && dist(b, this.first) < 0.05) this.finish();
    },
    move(e) { this.cur = e.w; },
    dbl() { this.finish(); }, finish() { this.start = null; this.n = 0; app.view2d.typed = ''; },
    key(k, ev) {
      if (k === 'Escape' || (k === 'Enter' && !app.view2d.typed)) { if (this.start) { this.finish(); return true; } return false; }
      if (k === 'Enter' && this.start) {
        const t = parseTyped(app.view2d.typed, 'ft'); app.view2d.typed = ''; if (!t) return true;
        const dir = this.cur ? unit(sub(this.cur, this.start)) : [1, 0], a = t.ang === null ? Math.atan2(dir[1], dir[0]) : t.ang * Math.PI / 180;
        this.add([r3(this.start[0] + Math.cos(a) * t.len), r3(this.start[1] + Math.sin(a) * t.len)]); return true;
      }
      return false;
    },
    draw(g, S, V) {
      if (!this.start || !this.cur) return;
      const a = S(this.start), b = S(this.cur); g.strokeStyle = V.C.sel; g.lineWidth = Math.max(2, parseLength(O().wallT === '=wallOut' ? 0.75 : 0.375) * V.cam.scale); g.globalAlpha = 0.35; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.globalAlpha = 1;
      g.lineWidth = 1.2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      const l = dist(this.start, this.cur), ang = Math.atan2(this.cur[1] - this.start[1], this.cur[0] - this.start[0]) * 180 / Math.PI;
      g.fillStyle = V.C.sel; g.font = '12px sans-serif'; g.textAlign = 'left'; g.fillText(lenText(l) + '  ' + (Math.round(ang * 10) / 10) + '°', b[0] + 12, b[1] - 12); g.textAlign = 'center';
    },
  };
  tools.rect = {
    label: 'Room walls', hint: 'Click one corner, then the opposite corner, or type width,height then Enter. Draws four joined walls.', cursor: 'crosshair',
    activate() { this.start = null; this.cur = null; app.view2d.typed = ''; }, deactivate() { this.start = null; },
    from() { return this.start; },
    down(e) {
      if (!this.start) { this.start = e.w; return; }
      this.make(e.w);
    },
    make(b) { const a = this.start; if (Math.abs(a[0] - b[0]) < 0.3 || Math.abs(a[1] - b[1]) < 0.3) return; store.transact('Room walls', (p) => { GEN.addRect(p, a[0], a[1], b[0], b[1], wallOpts()); }); this.start = null; },
    move(e) { this.cur = e.w; },
    key(k) {
      if (k === 'Escape') { if (this.start) { this.start = null; return true; } return false; }
      if (k === 'Enter' && this.start) {
        const parts = String(app.view2d.typed || '').split(','), w = parseLength(parts[0]), h = parseLength(parts[1] === undefined ? parts[0] : parts[1]); app.view2d.typed = '';
        if (isNaN(w) || isNaN(h)) return true;
        const sx = this.cur && this.cur[0] < this.start[0] ? -1 : 1, sy = this.cur && this.cur[1] < this.start[1] ? -1 : 1; this.make([this.start[0] + sx * w, this.start[1] + sy * h]); return true;
      }
      return false;
    },
    draw(g, S, V) {
      if (!this.start || !this.cur) return; const a = S(this.start), b = S(this.cur);
      g.strokeStyle = V.C.sel; g.lineWidth = 1.4; g.setLineDash([6, 4]); g.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); g.setLineDash([]);
      g.fillStyle = V.C.sel; g.font = '12px sans-serif'; g.fillText(lenText(Math.abs(this.cur[0] - this.start[0])) + ' × ' + lenText(Math.abs(this.cur[1] - this.start[1])), (a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 10);
    },
  };
  tools.split = {
    label: 'Split wall', hint: 'Click a wall where it should be cut in two. Openings stay with their part.', cursor: 'crosshair',
    down(e) {
      const id = hitTest(M(), P(), level(), e.raw, app.view2d.cam.scale), w = id && M().wallById[id]; if (!w) return;
      const r = pointSeg(e.raw, w.a, w.b), at = e.snap && e.snap.type !== 'grid' ? pointSeg(e.w, w.a, w.b).t * w.len : Math.round(r.t * w.len * 4) / 4;
      let made = null; store.transact('Split wall', (p) => { made = splitWall(p, id, at); }); if (!made) app.toast('Too close to the end of the wall.');
    },
    move(e) { this.cur = e.raw; },
    draw(g, S, V) { if (!this.cur) return; const id = hitTest(M(), P(), level(), this.cur, V.cam.scale), w = id && M().wallById[id]; if (!w) return; const r = pointSeg(this.cur, w.a, w.b), s = S(r.q), n = perp(w.d); g.strokeStyle = V.C.sel; g.lineWidth = 2; g.beginPath(); g.moveTo(s[0] - n[0] * 12, s[1] + n[1] * 12); g.lineTo(s[0] + n[0] * 12, s[1] - n[1] * 12); g.stroke(); },
  };

  // ---------------- doors, windows, arches, ventilators
  function openingTool(kind, label) {
    return {
      label, hint: 'Move over a wall and click. F flips the swing, M mirrors the hinge. Type a width and press Enter to set it.', cursor: 'crosshair',
      activate() { this.cur = null; this.flip = false; this.mirror = false; app.view2d.typed = ''; },
      width() { const o = O(), v = kind === 'window' ? o.winW : kind === 'vent' ? 1.5 : kind === 'arch' ? o.archW : o.doorW; try { return valueOf(v, M().scope); } catch (e) { return 3; } },
      place(raw) {
        const m = M(), id = hitTest(m, P(), level(), raw, app.view2d.cam.scale * 0.6, 14), w = id && m.wallById[id]; if (!w) return null;
        const wd = Math.min(this.width(), w.len - 0.6); if (wd < 0.8) return null;
        const r = pointSeg(raw, w.a, w.b); let pos = Math.round(r.t * w.len * 4) / 4;
        pos = Math.max(wd / 2 + 0.3, Math.min(w.len - wd / 2 - 0.3, pos));
        const others = m.openings.filter((o) => o.wall === w.id).sort((a, b) => a.pos - b.pos);
        for (let i = 0; i < 3; i++) others.forEach((o) => { if (Math.abs(pos - o.pos) < (wd + o.w) / 2 + 0.2) pos = pos >= o.pos ? o.pos + (wd + o.w) / 2 + 0.25 : o.pos - (wd + o.w) / 2 - 0.25; });
        if (pos - wd / 2 < 0.25 || pos + wd / 2 > w.len - 0.25) return null;
        return { w, pos, wd };
      },
      move(e) { this.cur = e.raw; },
      down(e) {
        const pl = this.place(e.raw); if (!pl) { app.toast('Place it on a wall with free space.'); return; }
        const o = O(), spec = { kind, pos: pl.pos, flip: this.flip, mirror: this.mirror };
        if (kind === 'door') spec.w = o.doorW; else if (kind === 'window') spec.w = o.winW; else if (kind === 'arch') spec.w = o.archW; else spec.w = 1.5;
        store.transact(label, (p) => { GEN.addOpening(p, pl.w.id, spec); });
      },
      key(k) {
        if (k === 'f' || k === 'F') { this.flip = !this.flip; return true; }
        if (k === 'm' || k === 'M') { this.mirror = !this.mirror; return true; }
        if (k === 'Enter') { const v = parseLength(app.view2d.typed); app.view2d.typed = ''; if (!isNaN(v) && v > 0.5) { if (kind === 'door') O().doorW = v; else if (kind === 'window') O().winW = v; else if (kind === 'arch') O().archW = v; app.refreshOptions(); } return true; }
        return false;
      },
      draw(g, S, V) {
        if (!this.cur) return; const pl = this.place(this.cur); if (!pl) return;
        const { w, pos, wd } = pl, c = [w.a[0] + w.d[0] * pos, w.a[1] + w.d[1] * pos], hw = w.t / 2 + 0.05;
        const pts = [[c[0] - w.d[0] * wd / 2 + w.n[0] * hw, c[1] - w.d[1] * wd / 2 + w.n[1] * hw], [c[0] + w.d[0] * wd / 2 + w.n[0] * hw, c[1] + w.d[1] * wd / 2 + w.n[1] * hw], [c[0] + w.d[0] * wd / 2 - w.n[0] * hw, c[1] + w.d[1] * wd / 2 - w.n[1] * hw], [c[0] - w.d[0] * wd / 2 - w.n[0] * hw, c[1] - w.d[1] * wd / 2 - w.n[1] * hw]];
        g.fillStyle = V.C.sel; g.globalAlpha = 0.3; g.beginPath(); pts.forEach((p, i) => { const s = S(p); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); }); g.closePath(); g.fill(); g.globalAlpha = 1;
        g.font = '12px sans-serif'; const s = S(c); g.fillStyle = V.C.sel; g.fillText(lenText(wd), s[0], s[1] - 16);
      },
    };
  }
  tools.door = openingTool('door', 'Door'); tools.window = openingTool('window', 'Window'); tools.arch = openingTool('arch', 'Open arch'); tools.vent = openingTool('vent', 'Ventilator');

  // ---------------- point objects
  function pointTool(label, hint, make) {
    return { label, hint, cursor: 'crosshair', down(e) { store.transact(label, (p) => make(p, e.w)); }, move(e) { this.cur = e.w; }, draw(g, S, V) { if (!this.cur) return; const s = S(this.cur); g.strokeStyle = V.C.sel; g.lineWidth = 1.4; g.strokeRect(s[0] - 7, s[1] - 7, 14, 14); } };
  }
  tools.column = pointTool('Column', 'Click to place a column. Size and shape come from the options.', (p, pt) => GEN.addColumn(p, pt[0], pt[1], { b: O().colB, shape: O().colShape }));
  tools.footing = pointTool('Footing', 'Click to place an isolated footing under a column.', (p, pt) => GEN.addFooting(p, pt[0], pt[1], {}));
  tools.beam = {
    label: 'Beam', hint: 'Click the start and end of a beam. It sits at the top of the walls.', cursor: 'crosshair',
    activate() { this.start = null; }, from() { return this.start; },
    down(e) { if (!this.start) { this.start = e.w; return; } const a = this.start, b = e.w; if (dist(a, b) > 0.3) store.transact('Beam', (p) => GEN.addBeam(p, a, b, {})); this.start = null; },
    move(e) { this.cur = e.w; }, key(k) { if (k === 'Escape' && this.start) { this.start = null; return true; } return false; },
    draw(g, S, V) { if (!this.start || !this.cur) return; const a = S(this.start), b = S(this.cur); g.strokeStyle = V.C.sel; g.setLineDash([8, 3]); g.lineWidth = 1.6; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.setLineDash([]); g.fillStyle = V.C.sel; g.fillText(lenText(dist(this.start, this.cur)), b[0] + 20, b[1] - 10); },
  };
  tools.stair = {
    label: 'Stair', hint: 'Click the foot of the stair, then the direction it climbs. Type a width and press Enter to change it.', cursor: 'crosshair',
    activate() { this.start = null; }, from() { return this.start; },
    down(e) {
      if (!this.start) { this.start = e.w; return; }
      const a = this.start, d = unit(sub(e.w, a)), ang = Math.round(Math.atan2(d[1], d[0]) * 180 / Math.PI * 10) / 10;
      store.transact('Stair', (p) => GEN.addStair(p, a[0], a[1], ang, { width: O().stairW })); this.start = null;
    },
    move(e) { this.cur = e.w; },
    key(k) { if (k === 'Escape' && this.start) { this.start = null; return true; } if (k === 'Enter') { const v = parseLength(app.view2d.typed); app.view2d.typed = ''; if (!isNaN(v) && v > 1.5) { O().stairW = v; app.refreshOptions(); } return true; } return false; },
    draw(g, S, V) {
      if (!this.start || !this.cur) return; const a = S(this.start), b = S(this.cur); g.strokeStyle = V.C.sel; g.lineWidth = 1.6; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      const L = M().levelById[level()], gm = stairGeom({ rise: L.height, riser: 0.5417, tread: 0.8333 }); g.fillStyle = V.C.sel; g.fillText(gm.n + ' risers, run ' + lenText(gm.run), b[0] + 14, b[1] - 10);
    },
  };
  tools.roof = {
    label: 'Roof', hint: 'Click two opposite corners of the roof. Change type, pitch and overhang in Properties.', cursor: 'crosshair',
    activate() { this.start = null; }, from() { return this.start; },
    down(e) { if (!this.start) { this.start = e.w; return; } const a = this.start, b = e.w; if (Math.abs(a[0] - b[0]) > 1 && Math.abs(a[1] - b[1]) > 1) store.transact('Roof', (p) => GEN.addRoof(p, a[0], a[1], b[0], b[1], { type: O().roofType })); this.start = null; },
    move(e) { this.cur = e.w; }, key(k) { if (k === 'Escape' && this.start) { this.start = null; return true; } return false; },
    draw(g, S, V) { if (!this.start || !this.cur) return; const a = S(this.start), b = S(this.cur); g.strokeStyle = V.C.sel; g.setLineDash([10, 4, 2, 4]); g.lineWidth = 1.4; g.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); g.setLineDash([]); },
  };
  tools.room = {
    label: 'Room name', hint: 'Click inside a closed room to name it. Rooms exist wherever walls form a closed loop.', cursor: 'crosshair',
    down(e) {
      const rooms = detectRooms(M(), level()), r = rooms.find((x) => pointInRing(e.raw, x.ring) && !x.holes.some((h) => pointInRing(e.raw, h)));
      if (!r) { app.toast('Click inside a closed loop of walls.'); return; }
      if (r.label) { store.select([r.label.id]); return; }
      let id = null; store.transact('Room name', (p) => { id = GEN.addRoomLabel(p, r.inside[0], r.inside[1], O().roomName, O().roomType).id; }); store.select([id]);
    },
  };
  tools.dim = {
    label: 'Dimension', hint: 'Click two points, then click where the dimension line should sit.', cursor: 'crosshair',
    activate() { this.pts = []; }, from() { return this.pts[this.pts.length - 1]; },
    down(e) {
      this.pts.push(e.w);
      if (this.pts.length === 3) {
        const [a, b, c] = this.pts, d = unit(sub(b, a)), n = [-d[1], d[0]], off = r3((c[0] - a[0]) * n[0] + (c[1] - a[1]) * n[1]);
        store.transact('Dimension', (p) => GEN.addDim(p, a, b, off)); this.pts = [];
      }
    },
    move(e) { this.cur = e.w; }, key(k) { if (k === 'Escape' && this.pts.length) { this.pts = []; return true; } return false; },
    draw(g, S, V) { if (!this.pts.length || !this.cur) return; g.strokeStyle = V.C.sel; g.lineWidth = 1.2; g.beginPath(); const a = S(this.pts[0]); g.moveTo(a[0], a[1]); const b = S(this.pts[1] || this.cur); g.lineTo(b[0], b[1]); g.stroke(); g.fillStyle = V.C.sel; g.fillText(lenText(dist(this.pts[0], this.pts[1] || this.cur)), b[0] + 12, b[1] - 10); },
  };
  tools.measure = {
    label: 'Measure', hint: 'Click two points to read the distance and angle. Nothing is added to the drawing.', cursor: 'crosshair',
    activate() { this.pts = []; this.done = null; }, from() { return this.pts.length === 1 ? this.pts[0] : null; },
    down(e) { if (this.done) { this.done = null; this.pts = []; } this.pts.push(e.w); if (this.pts.length === 2) { this.done = this.pts.slice(); this.pts = []; const l = dist(this.done[0], this.done[1]); app.toast('Distance ' + lenText(l) + ' (' + formatLength(l, 'mm') + '), angle ' + (Math.round(Math.atan2(this.done[1][1] - this.done[0][1], this.done[1][0] - this.done[0][0]) * 1800 / Math.PI) / 10) + '°, dx ' + lenText(Math.abs(this.done[1][0] - this.done[0][0])) + ', dy ' + lenText(Math.abs(this.done[1][1] - this.done[0][1]))); } },
    move(e) { this.cur = e.w; },
    draw(g, S, V) { const a = this.done ? this.done[0] : this.pts[0], b = this.done ? this.done[1] : this.cur; if (!a || !b) return; const sa = S(a), sb = S(b); g.strokeStyle = V.C.snap; g.lineWidth = 1.6; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(sa[0], sa[1]); g.lineTo(sb[0], sb[1]); g.stroke(); g.setLineDash([]); g.fillStyle = V.C.snap; g.fillText(lenText(dist(a, b)), (sa[0] + sb[0]) / 2, (sa[1] + sb[1]) / 2 - 10); },
  };
  tools.text = {
    label: 'Text', hint: 'Click where the note should go.', cursor: 'crosshair',
    down(e) { const pt = e.w; app.ask({ title: 'Note', message: 'Text to place at this point', input: true, value: '', ok: 'Place' }, (t) => { if (t && String(t).trim()) store.transact('Text', (p) => GEN.addText(p, pt[0], pt[1], String(t).trim(), 0.6)); }); },
  };
  return tools;
}
export const TOOL_KEYS = { s: 'select', w: 'wall', r: 'rect', x: 'split', d: 'door', n: 'window', a: 'arch', c: 'column', b: 'beam', f: 'footing', t: 'stair', o: 'roof', m: 'room', i: 'dim', e: 'measure', y: 'text' };
