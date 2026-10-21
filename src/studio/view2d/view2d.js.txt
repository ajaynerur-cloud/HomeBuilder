// The plan canvas: camera, pointer input, snapping, tools and drawing.
import { modelOf } from '../model/resolve.js';
import { drawPlan, makeCamera, toScreen, toWorld } from './render2d.js';
import { snapPoint, gridStepFor, SNAP_NAMES } from './snap.js';
import { createTools, TOOL_KEYS } from './tools.js';
import { formatLength } from '../core/units.js';

const LIGHT = { bg: '#ffffff', grid: '#eef0f2', gridMajor: '#dfe3e7', axis: '#9aa3ab', wall: '#2b2b2b', wallEdge: '#111', room: 'rgba(160,140,110,0.10)', roomOpen: 'rgba(120,120,120,0.07)', court: 'rgba(120,170,90,0.20)', under: 'rgba(0,0,0,0.10)', text: '#222', textDim: '#666', sel: '#1565c0', selFill: 'rgba(21,101,192,0.10)', snap: '#d81b60', grip: '#1565c0', gripMid: '#26a69a', door: '#2e7d32', glass: '#1565c0', column: '#c62828', beam: '#ef6c00', footing: '#607d8b', slab: '#757575', roof: '#b4573a', stair: '#6d4c41', dim: '#6a1b9a' };
const DARK = { ...LIGHT, bg: '#14181d', grid: '#1c2127', gridMajor: '#262d35', axis: '#6b7680', wall: '#d9d4c7', wallEdge: '#f1ede2', room: 'rgba(200,180,140,0.10)', roomOpen: 'rgba(200,200,200,0.07)', court: 'rgba(120,180,90,0.22)', under: 'rgba(255,255,255,0.10)', text: '#e8e6e1', textDim: '#9aa3ab', sel: '#64b5f6', selFill: 'rgba(100,181,246,0.14)', snap: '#f48fb1', grip: '#64b5f6', door: '#81c784', glass: '#64b5f6', column: '#ef5350', beam: '#ffb74d', footing: '#90a4ae', slab: '#9e9e9e', stair: '#bcaaa4', dim: '#ce93d8' };

export class View2D {
  constructor(el, store, app) {
    this.el = el; this.store = store; this.app = app; this.cam = makeCamera(); this.typed = ''; this.box = null; this.snap = null; this.cursor = null;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'st-canvas'; this.canvas.tabIndex = 0; el.appendChild(this.canvas);
    this.dynEl = document.createElement('div'); this.dynEl.className = 'st-dyn'; this.dynEl.hidden = true; el.appendChild(this.dynEl);
    this.g = this.canvas.getContext('2d'); this.w = 600; this.h = 400; this.dpr = 1; this.dirty = true; this.pan = null; this.spaceDown = false;
    this.tools = createTools(app); this.toolId = 'select'; this.tool = this.tools.select;
    this._bind(); this.resize();
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el); }
    this.unsub = [store.on('change', () => this.invalidate()), store.on('selection', () => this.invalidate())];
    this._loop = () => { if (this.dirty) { this.dirty = false; this.draw(); } this.raf = requestAnimationFrame(this._loop); };
    if (typeof requestAnimationFrame !== 'undefined') this.raf = requestAnimationFrame(this._loop);
  }
  destroy() { if (this.raf) cancelAnimationFrame(this.raf); if (this.ro) this.ro.disconnect(); this.unsub.forEach((u) => u()); }
  invalidate() { this.dirty = true; }
  colors() { return this.app.isDark && this.app.isDark() ? DARK : LIGHT; }
  resize() {
    const r = this.el.getBoundingClientRect(); this.w = Math.max(100, r.width || 600); this.h = Math.max(100, r.height || 400); this.dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr); this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px'; this.invalidate();
  }
  step() { return this.app.state.snapStep || gridStepFor(this.cam.scale); }
  setTool(id) {
    if (this.tool && this.tool.deactivate) this.tool.deactivate();
    this.toolId = id; this.tool = this.tools[id] || this.tools.select; this.typed = ''; this.box = null;
    if (this.tool.activate) this.tool.activate(); this.canvas.style.cursor = this.tool.cursor || 'default'; this.app.setStatus(this.tool.hint || ''); this.invalidate();
  }
  toWorld(sx, sy) { return toWorld(this.cam, this.w, this.h, [sx, sy]); }
  toScreen(p) { return toScreen(this.cam, this.w, this.h, p); }
  evt(ev) {
    const r = this.canvas.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top, raw = this.toWorld(sx, sy), st = this.app.state;
    const flags = { ...st.snap }; if (ev.shiftKey && this.tool && this.tool.from) flags.ortho = !flags.ortho;
    if (this.toolId === 'select' && !(this.tool.drag && this.tool.drag.type !== 'box')) flags.ortho = false;
    const sn = snapPoint(modelOf(this.store), this.store.p.activeLevel, raw, { scale: this.cam.scale, tol: 12, flags, from: this.tool && this.tool.from ? this.tool.from() : null, gridStep: this.step(), exclude: new Set() });
    return { raw, w: [Math.round(sn.p[0] * 1000) / 1000, Math.round(sn.p[1] * 1000) / 1000], snap: sn, px: [sx, sy], shift: ev.shiftKey, ctrl: ev.ctrlKey || ev.metaKey, alt: ev.altKey, button: ev.button, detail: ev.detail };
  }
  _bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (ev) => {
      c.focus(); if (c.setPointerCapture) { try { c.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic */ } }
      if (ev.button === 1 || ev.button === 2 || this.spaceDown) { this.pan = { x: ev.clientX, y: ev.clientY, cx: this.cam.x, cy: this.cam.y }; c.style.cursor = 'grabbing'; return; }
      if (ev.button !== 0) return; const e = this.evt(ev); this.snap = e.snap; this.tool.down && this.tool.down(e); this.invalidate();
    });
    c.addEventListener('pointermove', (ev) => {
      if (this.pan) { this.cam.x = this.pan.cx - (ev.clientX - this.pan.x) / this.cam.scale; this.cam.y = this.pan.cy + (ev.clientY - this.pan.y) / this.cam.scale; this.invalidate(); return; }
      const e = this.evt(ev); this.snap = e.snap; this.cursor = e;
      this.app.setCoords(e.w, e.snap);
      this.tool.move && this.tool.move(e); this.positionDyn(e); this.invalidate();
    });
    c.addEventListener('pointerup', (ev) => {
      if (this.pan) { this.pan = null; c.style.cursor = this.tool.cursor || 'default'; return; }
      if (ev.button !== 0) return; const e = this.evt(ev); this.tool.up && this.tool.up(e); this.invalidate();
    });
    c.addEventListener('dblclick', (ev) => { const e = this.evt(ev); this.tool.dbl && this.tool.dbl(e); this.invalidate(); });
    c.addEventListener('wheel', (ev) => {
      ev.preventDefault(); const r = c.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top, before = this.toWorld(sx, sy);
      const k = Math.exp(-ev.deltaY * 0.0015); this.cam.scale = Math.max(0.5, Math.min(400, this.cam.scale * k));
      const after = this.toWorld(sx, sy); this.cam.x += before[0] - after[0]; this.cam.y += before[1] - after[1]; this.invalidate();
    }, { passive: false });
    c.addEventListener('keydown', (ev) => this.onKey(ev));
    c.addEventListener('keyup', (ev) => { if (ev.key === ' ') { this.spaceDown = false; c.style.cursor = this.tool.cursor || 'default'; } });
  }
  onKey(ev) {
    const k = ev.key, st = this.app.state;
    if (k === ' ') { this.spaceDown = true; this.canvas.style.cursor = 'grab'; ev.preventDefault(); return; }
    // typed values for dynamic input
    if (this.tool.from && /^[0-9.,<'"\-mfti ]$/.test(k) && !ev.ctrlKey && !ev.metaKey && (this.tool.from() || this.toolId.match(/door|window|arch|vent|stair/))) {
      if (!(this.toolId.match(/door|window|arch|vent/) && /[fm]/i.test(k))) { this.typed += k; this.showDyn(); ev.preventDefault(); return; }
    }
    if (this.toolId.match(/door|window|arch|vent|stair/) && /^[0-9.'"]$/.test(k)) { this.typed += k; this.showDyn(); ev.preventDefault(); return; }
    if (k === 'Backspace' && this.typed) { this.typed = this.typed.slice(0, -1); this.showDyn(); ev.preventDefault(); return; }
    if (this.tool.key && this.tool.key(k, ev)) { this.showDyn(); this.invalidate(); ev.preventDefault(); return; }
    if (k === 'Escape') { this.typed = ''; this.showDyn(); if (this.toolId !== 'select') { this.app.setTool('select'); } else this.store.select([]); ev.preventDefault(); return; }
    if ((ev.ctrlKey || ev.metaKey) && (k === 'z' || k === 'Z')) { ev.shiftKey ? this.store.redo() : this.store.undo(); ev.preventDefault(); return; }
    if ((ev.ctrlKey || ev.metaKey) && (k === 'y' || k === 'Y')) { this.store.redo(); ev.preventDefault(); return; }
    if (k === 'F3') { st.snap.grid = !st.snap.grid; this.app.syncSnap(); ev.preventDefault(); return; }
    if (k === 'F8') { st.snap.ortho = !st.snap.ortho; this.app.syncSnap(); ev.preventDefault(); return; }
    if (k === 'Home' || k === 'z' || k === 'Z') { this.zoomExtents(); ev.preventDefault(); return; }
    if (k === 'g' || k === 'G') { st.showGrid = !st.showGrid; this.invalidate(); return; }
    if ((k === 'Delete' || k === 'Backspace') && this.toolId !== 'select') { this.tools.select.key(k, ev); ev.preventDefault(); return; }
    if (!ev.ctrlKey && !ev.metaKey && TOOK(k)) { this.app.setTool(TOOL_KEYS[k.toLowerCase()]); ev.preventDefault(); }
  }
  showDyn() {
    if (!this.typed) { this.dynEl.hidden = true; return; }
    this.dynEl.hidden = false; this.dynEl.textContent = this.typed + '  ⏎';
  }
  positionDyn(e) { if (!this.dynEl.hidden) { this.dynEl.style.left = e.px[0] + 18 + 'px'; this.dynEl.style.top = e.px[1] + 18 + 'px'; } }
  bounds(ids) {
    const m = modelOf(this.store), lvl = this.store.p.activeLevel; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const add = (p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); };
    const want = (id) => !ids || ids.includes(id);
    m.walls.filter((w) => w.level === lvl && want(w.id)).forEach((w) => { add(w.a); add(w.b); });
    m.columns.filter((c) => c.level === lvl && want(c.id)).forEach((c) => add(c.c)); m.beams.filter((b) => b.level === lvl && want(b.id)).forEach((b) => { add(b.a); add(b.b); });
    m.footings.filter((f) => f.level === lvl && want(f.id)).forEach((f) => add(f.c)); m.slabs.filter((s) => s.level === lvl && want(s.id)).forEach((s) => s.ring.forEach(add));
    m.roofs.filter((r) => r.level === lvl && want(r.id)).forEach((r) => { add([r.x0, r.y0]); add([r.x1, r.y1]); }); m.stairs.filter((s) => s.level === lvl && want(s.id)).forEach((s) => add(s.p));
    m.labels.filter((l) => l.level === lvl && want(l.id)).forEach((l) => add(l.p));
    return x0 > x1 ? null : [x0, y0, x1, y1];
  }
  zoomExtents(ids) {
    const b = this.bounds(ids); if (!b) { this.cam = makeCamera(); this.invalidate(); return; }
    const pw = Math.max(b[2] - b[0], 4) * 1.15, ph = Math.max(b[3] - b[1], 4) * 1.15;
    this.cam = { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, scale: Math.max(0.5, Math.min(120, Math.min(this.w / pw, this.h / ph))) }; this.invalidate();
  }
  draw() {
    if (!this.g) return;
    const g = this.g, st = this.app.state, model = modelOf(this.store);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawPlan(g, { w: this.w, h: this.h, cam: this.cam, model, project: this.store.p, store: this.store, level: this.store.p.activeLevel, selection: this.store.selection, showGrid: st.showGrid, showUnder: st.showUnder, C: this.colors(), box: this.box, boxCrossing: this.boxCrossing, snap: this.snap, preview: this.tool.draw ? (g2, S, V) => this.tool.draw(g2, S, V) : null });
  }
}
const TOOK = (k) => !!TOOL_KEYS[(k || '').toLowerCase()] && k.length === 1;
export { SNAP_NAMES, formatLength };
