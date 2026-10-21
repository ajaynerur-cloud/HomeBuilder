// Forge application logic: selection, tools and drags. No DOM here, so it can be tested without a browser.
import { Store } from '../core/store.js';
import { buildBody, newForge, TEMPLATES } from './model.js';
import { applyOp, regionNormal } from './ops.js';
import { faceNormal, faceCenter, edgeLoop, faceStrip, hash, add, sub, mul, dot, unit, len, triangulateOriented } from './mesh.js';
import { overhangInfo } from './print.js';
import { AXES } from './view.js';

export const TOOLS = [
  ['select', 'Select', 'Click a face, edge or point. Drag a box to select several. Alt-click an edge to select its loop.'],
  ['pull', 'Push / Pull', 'Drag a face to push or pull it along the direction chosen above. Type a distance and press Enter for an exact value.'],
  ['move', 'Move', 'Drag the selection in any direction: along its normal, an axis, or freely in the screen plane.'],
  ['scale', 'Scale', 'Drag sideways to scale the selection about its centre. Use Radial to swell a ring around the vertical axis.'],
  ['rotate', 'Rotate', 'Drag sideways to rotate the selection about the chosen axis.'],
  ['twist', 'Twist', 'Drag sideways to twist the selection, more at one end than the other.'],
  ['inset', 'Inset', 'Drag sideways to shrink a face into a smaller face with a border.'],
  ['sculpt', 'Sculpt', 'Drag on the surface to push or pull it with a smooth falloff. Radius is set above.'],
  ['delete', 'Delete face', 'Click a face to remove it. The body is then open until the hole is closed.'],
];
const r1 = (v) => Math.round(v * 100) / 100;

export class ForgeApp {
  constructor(project, opts = {}) {
    this.store = new Store(project || newForge('vase'));
    this.state = { tool: 'select', mode: 'face', dir: 'normal', custom: [0, 0, 1], radius: 25, falloff: 'smooth', scaleMode: 'uniform', smooth: false, edges: true, overhangView: false };
    this.sel = { faces: [], verts: [], edges: [] }; this.current = null; this.view = null; this.ui = { toast() {}, hud() {}, box() {}, refresh() {} }; this._fi = null;
    this.store.on('change', () => { this.rebuild(); this.ui.refresh(); });
    this.rebuild();
  }
  get project() { return this.store.p; }
  get body() { const p = this.store.p; return p.bodies.find((b) => b.id === p.active) || p.bodies[0]; }
  setView(v) { this.view = v; this.showCurrent(); }

  rebuild() {
    const p = this.store.p; this.cache = p.bodies.filter((b) => b.visible !== false).map((b) => ({ body: b, ...buildBody(p, b) }));
    this.current = this.cache.find((c) => c.body.id === this.body.id) || this.cache[0] || null; this._fi = null; this.pruneSelection(); this.showCurrent();
  }
  showCurrent() { if (this.view && this.view.ok) this.view.setBodies(this.cache || [], this.body.id); }
  faceIdx() { if (!this._fi && this.current) this._fi = this.current.mesh.faceIndex(); return this._fi || new Map(); }

  // ---------- selection (kept as keys, so it survives rebuilds)
  clearSel() { this.sel = { faces: [], verts: [], edges: [] }; this.repaint(); }
  repaint() { if (this.view && this.view.ok) this.view.paint(); this.ui.refresh(); }
  pruneSelection() {
    if (!this.current) { this.sel = { faces: [], verts: [], edges: [] }; return; }
    const m = this.current.mesh, ki = m.keyIndex(), fi = this.faceIdx();
    this.sel.verts = this.sel.verts.filter((k) => ki.has(k)); this.sel.edges = this.sel.edges.filter(([a, b]) => ki.has(a) && ki.has(b)); this.sel.faces = this.sel.faces.filter((ks) => fi.has(ks.slice().sort().join('|')));
  }
  selFaceSet() { const fi = this.faceIdx(), s = new Set(); this.sel.faces.forEach((ks) => { const i = fi.get(ks.slice().sort().join('|')); if (i !== undefined) s.add(i); }); return s; }
  overhangSet() { if (!this.state.overhangView || !this.current) return null; return new Set(overhangInfo(this.current.mesh, this.project.print.overhang || 45).faces); }
  selectFaces(fis, add) {
    const m = this.current.mesh, keys = fis.map((i) => m.faceKeys(i)), have = new Set(this.sel.faces.map((k) => k.slice().sort().join('|')));
    if (add) { keys.forEach((k) => { const h = k.slice().sort().join('|'); if (have.has(h)) this.sel.faces = this.sel.faces.filter((x) => x.slice().sort().join('|') !== h); else this.sel.faces.push(k); }); } else this.sel.faces = keys;
    this.sel.verts = []; this.sel.edges = []; this.repaint();
  }
  selectVerts(idx, add, edges) { const m = this.current.mesh, keys = idx.map((i) => m.v[i].k); this.sel.verts = add ? [...new Set([...this.sel.verts, ...keys])] : keys; this.sel.edges = edges || (add ? this.sel.edges : []); this.sel.faces = []; this.repaint(); }
  selectEdge(e, add) { const m = this.current.mesh; this.selectVerts([e.a, e.b], add, (add ? this.sel.edges : []).concat([[m.v[e.a].k, m.v[e.b].k]])); }
  selectLoop(e, add) {
    const m = this.current.mesh, r = edgeLoop(m, e.a, e.b), V = r.verts, ed = []; for (let i = 0; i + 1 < V.length; i++) ed.push([m.v[V[i]].k, m.v[V[i + 1]].k]); if (r.closed) ed.push([m.v[V[V.length - 1]].k, m.v[V[0]].k]);
    this.selectVerts(V, add, ed); return r;
  }
  selectStrip(fi, e, add) { const m = this.current.mesh, r = faceStrip(m, e.faces[0] === fi ? fi : e.faces[0], e.a, e.b); this.selectFaces(r.faces, add); return r; }
  selectAllFaces() { this.selectFaces(this.current.mesh.f.map((_, i) => i), false); }
  selVerts() {
    const m = this.current.mesh, ki = m.keyIndex(), set = new Set(this.sel.verts), fi = this.faceIdx();
    this.sel.faces.forEach((ks) => ks.forEach((k) => set.add(k))); return [...set].filter((k) => ki.has(k));
  }
  pivot() { const m = this.current.mesh, ki = m.keyIndex(), V = this.selVerts().map((k) => m.v[ki.get(k)].p); if (!V.length) return [0, 0, 0]; const mn = [1e18, 1e18, 1e18], mx = [-1e18, -1e18, -1e18]; V.forEach((p) => p.forEach((c, i) => { if (c < mn[i]) mn[i] = c; if (c > mx[i]) mx[i] = c; })); return [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2]; }
  dirVec() {
    const d = this.state.dir; if (AXES[d]) return AXES[d]; if (d === 'custom') return unit(this.state.custom);
    if (this.current && this.sel.faces.length) { const F = [...this.selFaceSet()]; if (F.length) return regionNormal(this.current.mesh, F); }
    return [0, 0, 1];
  }

  // ---------- tools
  setTool(t) { this.state.tool = t; this.cancelDrag(); this.ui.refresh(); }
  setMode(m) { this.state.mode = m; this.clearSel(); }
  cancelDrag() { if (this.view && this.view.ok) { this.view.setAxis(null); } this.ui.hud(null); this.ui.box(null); this.showCurrent(); }
  hoverAt(view, px, py) {
    if (this.state.tool === 'sculpt' || this.state.mode !== 'face' && this.state.tool === 'select') return;
    const h = view.pickFace(px, py), f = h ? h.face : null;
    if ((view.hover && view.hover.face) !== f) { view.hover = f === null ? null : { face: f }; view.paint(); }
  }
  makeOp(drag, px, py) {
    const st = this.state, dx = px - drag.px0, dy = py - drag.py0, v = this.view, tool = st.tool, id = 'o' + this.project.nextId;
    if (tool === 'pull') { const dir = drag.dir; let a = v.amountAlong(drag.pivot, dir, dx, dy); a = Math.round(a * 10) / 10; if (!a) return null; return { id, t: 'extrude', faces: this.sel.faces.map((k) => k.slice()), dist: a, dir: st.dir === 'normal' ? 'normal' : dir, merge: true }; }
    if (tool === 'move') {
      let vec; if (st.dir === 'free') { const a = v.planePoint(drag.pivot, drag.px0, drag.py0), b = v.planePoint(drag.pivot, px, py); vec = sub(b, a); } else { vec = mul(drag.dir, Math.round(v.amountAlong(drag.pivot, drag.dir, dx, dy) * 10) / 10); }
      vec = vec.map((x) => Math.round(x * 10) / 10); if (len(vec) < 1e-9) return null; return { id, t: 'move', verts: this.selVerts(), vec };
    }
    if (tool === 'scale') { const f = Math.round(Math.exp(dx / 150) * 1000) / 1000; if (Math.abs(f - 1) < 1e-3) return null; const sm = st.scaleMode; return { id, t: 'scale', verts: this.selVerts(), pivot: drag.pivot, radial: sm === 'radial', f: sm === 'x' ? [f, 1, 1] : sm === 'y' ? [1, f, 1] : sm === 'z' ? [1, 1, f] : [f, f, f] }; }
    if (tool === 'rotate' || tool === 'twist') { let deg = Math.round(dx * 0.5 * 10) / 10; if (!deg) return null; return { id, t: tool, verts: this.selVerts(), pivot: drag.pivot, axis: drag.dir, deg }; }
    if (tool === 'inset') { const mm = (2 * v.s.dist * Math.tan(18 * Math.PI / 180)) / v.h, d = Math.round(dx * mm * 10) / 10; if (!d) return null; return { id, t: 'inset', faces: this.sel.faces.map((k) => k.slice()), d }; }
    if (tool === 'sculpt') { const a = Math.round(v.amountAlong(drag.pivot, drag.dir, dx, dy) * 10) / 10; if (!a) return null; return { id, t: 'soft', center: drag.pivot, dir: drag.dir, radius: st.radius, amount: a, falloff: st.falloff }; }
    return null;
  }
  beginDrag(view, px, py, e) {
    const st = this.state, tool = st.tool; if (!this.current) return null;
    if (tool === 'select') {
      const m = this.current.mesh, add = e.shiftKey;
      if (st.mode === 'face') { const h = view.pickFace(px, py); if (h) { this.selectFaces([h.face], add); return null; } }
      else if (st.mode === 'vertex') { const h = view.pickVertex(px, py); if (h) { this.selectVerts([h.vert], add); return null; } }
      else if (st.mode === 'edge' || st.mode === 'loop' || st.mode === 'strip') {
        const h = view.pickEdge(px, py);
        if (h) { if (st.mode === 'loop' || e.ctrlKey) this.selectLoop(h, add); else if (st.mode === 'strip') this.selectStrip(h.faces[0], h, add); else this.selectEdge(h, add); return null; }
      }
      if (!add) this.clearSel(); return { type: 'box', px0: px, py0: py };
    }
    if (tool === 'sculpt') { const h = view.pickFace(px, py); if (!h) return null; const n = faceNormal(this.current.mesh, h.face); return { type: 'op', px0: px, py0: py, pivot: h.point, dir: st.dir === 'normal' ? n : this.dirVec(), moved: false }; }
    if (tool === 'delete') { const h = view.pickFace(px, py); if (h) { this.selectFaces([h.face], false); this.commit({ t: 'delete', faces: this.sel.faces.map((k) => k.slice()) }, 'Delete face'); } return null; }
    // tools that act on a selection: click an unselected face to pick it first
    const h = view.pickFace(px, py);
    if (h && (!this.sel.faces.length && !this.sel.verts.length || (st.mode === 'face' && !this.selFaceSet().has(h.face) && !this.sel.verts.length))) this.selectFaces([h.face], false);
    if (!this.sel.faces.length && !this.sel.verts.length) { this.ui.toast('Pick a face (or points) first, then drag.'); return null; }
    if ((tool === 'pull' || tool === 'inset') && !this.sel.faces.length) { this.ui.toast('This tool needs a face. Switch to face selection.'); return null; }
    return { type: 'op', px0: px, py0: py, pivot: this.pivot(), dir: this.dirVec(), moved: false };
  }
  moveDrag(view, drag, px, py, e) {
    if (drag.type === 'box') { this.ui.box([Math.min(drag.px0, px), Math.min(drag.py0, py), Math.max(drag.px0, px), Math.max(drag.py0, py)]); return; }
    let op = this.makeOp(drag, e && e.ctrlKey ? px : px, py); drag.op = op; if (!op) { this.showCurrent(); this.ui.hud(null); return; }
    const m = this.current.mesh.clone(), r = applyOp(m, op); if (!r.ok) { this.ui.hud(r.note); return; }
    const list = this.cache.map((c) => (c.body.id === this.body.id ? { body: c.body, mesh: m } : c)); view.setBodies(list, this.body.id);
    const span = Math.max(20, len(sub(view.bounds().mx, view.bounds().mn)) * 0.7); view.setAxis(drag.pivot, op.t === 'rotate' || op.t === 'twist' ? op.axis : drag.dir, span);
    this.ui.hud(this.describe(op), px, py);
  }
  endDrag(view, drag, px, py) {
    if (drag.type === 'box') {
      this.ui.box(null); const r = [Math.min(drag.px0, px), Math.min(drag.py0, py), Math.max(drag.px0, px), Math.max(drag.py0, py)];
      if (r[2] - r[0] > 4 || r[3] - r[1] > 4) { if (this.state.mode === 'face') this.selectFaces(view.boxFaces(...r), false); else this.selectVerts(view.boxVerts(...r), false); }
      return;
    }
    view.setAxis(null); this.ui.hud(null);
    if (drag.op && drag.moved) this.commit(drag.op, this.describe(drag.op)); else this.showCurrent();
  }
  describe(op) {
    const f = (x) => (x >= 0 ? '+' : '') + r1(x);
    if (op.t === 'extrude') return 'Pull ' + f(op.dist) + ' mm'; if (op.t === 'move') return 'Move ' + op.vec.map((x) => r1(x)).join(', ') + ' mm'; if (op.t === 'scale') return 'Scale ×' + r1(op.f[0] * 100) / 100 + (op.radial ? ' (radial)' : '');
    if (op.t === 'rotate') return 'Rotate ' + f(op.deg) + '°'; if (op.t === 'twist') return 'Twist ' + f(op.deg) + '°'; if (op.t === 'inset') return 'Inset ' + r1(op.d) + ' mm'; if (op.t === 'soft') return 'Sculpt ' + f(op.amount) + ' mm'; if (op.t === 'delete') return 'Delete face'; return op.t;
  }

  // ---------- commit and numeric entry
  commit(op, label) {
    const faces = op.faces, id = 'o' + this.project.nextId; let sel = null;
    if (op.t === 'extrude') sel = faces.map((ks) => ks.map((k) => id + ':' + k));
    else if (op.t === 'inset') sel = faces.map((ks, n) => ks.map((k) => id + n + ':' + k + '@' + hash(ks.slice().sort().join('|'))));
    const keepVerts = op.t === 'move' || op.t === 'scale' || op.t === 'rotate' || op.t === 'twist';
    this.store.transact(label || op.t, (p) => { op.id = 'o' + p.nextId++; (p.bodies.find((b) => b.id === p.active) || p.bodies[0]).ops.push(op); });
    if (sel) { this.sel = { faces: sel, verts: [], edges: [] }; this.pruneSelection(); } else if (op.t === 'delete') this.sel = { faces: [], verts: [], edges: [] };
    void keepVerts; this.repaint(); return op;
  }
  applyNumeric(text) {
    const tool = this.state.tool, nums = String(text || '').split(/[\s,;]+/).filter(Boolean).map(parseFloat); if (!nums.length || nums.some((x) => isNaN(x))) return { ok: false, msg: 'Type a number, or x,y,z for a move.' };
    if (!this.current) return { ok: false, msg: 'Nothing to edit.' }; const pivot = this.pivot(), dir = this.dirVec(), id = 'o' + this.project.nextId, st = this.state;
    if (tool !== 'sculpt' && !this.sel.faces.length && !this.sel.verts.length) return { ok: false, msg: 'Select something first.' };
    let op;
    if (tool === 'pull') { if (!this.sel.faces.length) return { ok: false, msg: 'Pull needs a face.' }; op = { id, t: 'extrude', faces: this.sel.faces.map((k) => k.slice()), dist: nums[0], dir: st.dir === 'normal' ? 'normal' : dir, merge: true }; }
    else if (tool === 'move') op = { id, t: 'move', verts: this.selVerts(), vec: nums.length >= 3 ? nums.slice(0, 3) : mul(dir, nums[0]) };
    else if (tool === 'scale') { const f = nums.length >= 3 ? nums.slice(0, 3) : [nums[0], nums[0], nums[0]], sm = st.scaleMode; op = { id, t: 'scale', verts: this.selVerts(), pivot, radial: sm === 'radial', f: nums.length >= 3 ? f : (sm === 'x' ? [nums[0], 1, 1] : sm === 'y' ? [1, nums[0], 1] : sm === 'z' ? [1, 1, nums[0]] : f) }; }
    else if (tool === 'rotate' || tool === 'twist') op = { id, t: tool, verts: this.selVerts(), pivot, axis: dir, deg: nums[0] };
    else if (tool === 'inset') { if (!this.sel.faces.length) return { ok: false, msg: 'Inset needs a face.' }; op = { id, t: 'inset', faces: this.sel.faces.map((k) => k.slice()), d: nums[0] }; }
    else return { ok: false, msg: 'Choose Push/Pull, Move, Scale, Rotate, Twist or Inset first.' };
    const probe = this.current.mesh.clone(), r = applyOp(probe, op); if (!r.ok) return { ok: false, msg: r.note };
    this.commit(op, this.describe(op)); return { ok: true, op };
  }
  deleteSelection() { if (!this.sel.faces.length) return false; this.commit({ t: 'delete', faces: this.sel.faces.map((k) => k.slice()) }, 'Delete faces'); return true; }

  // ---------- bodies and edits
  addBody(kind) {
    const t = (TEMPLATES[kind] || TEMPLATES.vase)(); let id = null;
    this.store.transact('Add body', (p) => { id = 'b' + p.nextId++; const used = new Set(p.params.map((x) => x.name)); const rename = {}; t.params.forEach((q) => { if (used.has(q.name)) { let n = 2; while (used.has(q.name + n)) n++; rename[q.name] = q.name + n; } });
      const fix = (v) => (typeof v === 'string' && v[0] === '=' ? v.replace(/[A-Za-z_][A-Za-z_0-9]*/g, (w) => rename[w] || w) : v); const js = JSON.stringify(t.body, (k, v) => fix(v)); const body = JSON.parse(js);
      t.params.forEach((q) => p.params.push({ ...q, name: rename[q.name] || q.name, v: fix(q.v) })); p.bodies.push({ id, visible: true, ops: [], ...body }); p.active = id; });
    this.clearSel(); return id;
  }
  setActive(id) { this.store.transact('Select body', (p) => { p.active = id; }); this.clearSel(); }
  removeBody(id) { if (this.project.bodies.length < 2) return false; this.store.transact('Delete body', (p) => { p.bodies = p.bodies.filter((b) => b.id !== id); if (p.active === id) p.active = p.bodies[0].id; }); this.clearSel(); return true; }
  bake() {
    const m = this.current.mesh.clone(), r = (x) => Math.round(x * 1e4) / 1e4;
    this.store.transact('Freeze', (p) => { const b = p.bodies.find((x) => x.id === p.active); b.gen = { type: 'mesh', v: m.v.map((v) => ({ k: v.k, p: v.p.map(r) })), f: m.f.map((f) => f.v.slice()) }; b.mods = []; b.ops = []; });
    this.clearSel();
  }
}
export { triangulateOriented, faceCenter, add };
