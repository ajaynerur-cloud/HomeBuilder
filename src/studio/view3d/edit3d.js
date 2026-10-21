// Direct editing in the 3D view. Modes: select (click, then drag to move, drag the blue and orange handles to stretch),
// wall (click points on the floor), door and window (click a wall), paint (click a surface with a colour picked).
import { modelOf, resolveModel } from '../model/resolve.js';
import * as GEN from '../model/generators.js';
import { snapPoint, gridStepFor, SNAP_DEFAULT } from '../view2d/snap.js';
import { moveObjects, setWallEnd, setBeamEnd, restoreKinds } from '../model/edit.js';
import { deleteObjects, transformObjects } from '../model/transform.js';
import { dist, dot } from '../model/geometry.js';
import { valueOf } from '../core/params.js';
import { formatLength } from '../core/units.js';

const T = () => (typeof window !== 'undefined' && window.THREE) || globalThis.THREE;
const clone = (o) => JSON.parse(JSON.stringify(o));
const r3 = (v) => Math.round(v * 1000) / 1000;
export const EDIT_MODES = [['select', 'Move'], ['wall', 'Wall'], ['door', 'Door'], ['window', 'Window'], ['paint', 'Paint']];
const HINT = {
  select: 'Click to select. Drag a selected object to move it. Drag the blue dots to stretch a wall or beam and the orange block to change a height. Drag to orbit, right-drag to pan.',
  wall: 'Click points on the floor to draw walls. Double-click, Enter or Esc to finish.',
  door: 'Click a wall to place a door. It opens towards the side you click.',
  window: 'Click a wall to place a window.',
  paint: 'Pick a colour or material in the palette, then click a surface. Walls take the colour on the face you click.',
};

export function createEdit3D(view, store, app) {
  const st = { mode: 'select', start: null, first: null, n: 0 };
  let handles = null, ghost = null, line = null, mark = null;
  const P = () => store.p, M = () => modelOf(store), level = () => store.p.activeLevel, O = () => (app.state && app.state.opts) || {};
  const levelZ = (id) => { const m = M(); return (m.levelById[id] || m.levels[0]).elev; };
  const plan = (v) => [v.x, -v.z];
  const flags = () => ({ ...((app.state && app.state.snap) || SNAP_DEFAULT), ortho: false });
  const status = (t) => { if (app.setStatus) app.setStatus(t); };
  const snap = (raw, at, from, exclude) => {
    const sc = view.pxPerFt(at), step = (app.state && app.state.snapStep) || gridStepFor(sc);
    const r = snapPoint(M(), level(), raw, { scale: sc, tol: 12, flags: flags(), from: from || null, gridStep: step, exclude: exclude || new Set() }); return [r3(r.p[0]), r3(r.p[1])];
  };

  // ---- overlay objects (handles, ghost, preview) live in the scene, not in the rebuilt model group
  const dot3 = (color, size, box) => { const THREE = T(), g = box ? new THREE.BoxGeometry(1.6, 1.6, 1.6) : new THREE.SphereGeometry(1, 14, 10), m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true })); m.renderOrder = 999; m.userData.size = size; return m; };
  function clearHandles() { if (handles) { view.scene.remove(handles); handles.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); handles = null; } }
  function refresh() {
    clearHandles(); if (!view.ok || st.mode !== 'select') { view.dirty = true; return; }
    const THREE = T(), m = M(), g = new THREE.Group(), sel = store.selection, add = (mesh, pos, h) => { mesh.position.set(pos[0], pos[2], -pos[1]); mesh.userData.h = { ...h, y: pos[2] }; g.add(mesh); };
    sel.forEach((id) => {
      const w = m.wallById[id];
      if (w) { add(dot3(0x1565c0, 1), [w.a[0], w.a[1], w.z1], { kind: 'wallEnd', id, end: 'a' }); add(dot3(0x1565c0, 1), [w.b[0], w.b[1], w.z1], { kind: 'wallEnd', id, end: 'b' }); if (sel.length === 1) add(dot3(0xff8f00, 1, true), [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2, w.z1 + 0.6], { kind: 'wallH', id }); }
      const b = m.beams.find((x) => x.id === id); if (b) { add(dot3(0x1565c0, 1), [b.a[0], b.a[1], b.z1], { kind: 'beamEnd', id, end: 'a' }); add(dot3(0x1565c0, 1), [b.b[0], b.b[1], b.z1], { kind: 'beamEnd', id, end: 'b' }); }
      const c = m.columns.find((x) => x.id === id); if (c && sel.length === 1) add(dot3(0xff8f00, 1, true), [c.c[0], c.c[1], c.z1 + 0.6], { kind: 'colH', id });
      const o = m.openings.find((x) => x.id === id); if (o) add(dot3(0x2e7d32, 1), [o.c[0], o.c[1], (o.z0 + o.z1) / 2], { kind: 'opening', id });
    });
    if (g.children.length) { handles = g; view.scene.add(g); } view.dirty = true;
  }
  function overlay() {
    const THREE = T(); if (line) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xd81b60, depthTest: false })); line.renderOrder = 998; line.visible = false; line.frustumCulled = false;
    mark = dot3(0xd81b60, 0.7); mark.visible = false; ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x2e7d32, transparent: true, opacity: 0.55, depthTest: false })); ghost.visible = false; ghost.renderOrder = 997;
    view.scene.add(line); view.scene.add(mark); view.scene.add(ghost);
  }
  function hidePreview() { if (line) { line.visible = false; mark.visible = false; ghost.visible = false; } view.dirty = true; }
  function setMode(m) {
    st.mode = m; st.start = null; st.first = null; st.n = 0; hidePreview(); view.setHover(null);
    if (view.canvas && view.canvas.style) view.canvas.style.cursor = { select: 'default', wall: 'crosshair', door: 'copy', window: 'copy', paint: 'cell' }[m] || 'default';
    refresh(); status(HINT[m]); view.emit('edit', m);
  }
  const finishWall = () => { st.start = null; st.first = null; st.n = 0; hidePreview(); };

  function hitHandle(e) {
    if (!handles) return null; view.rayAt(e);
    const hits = view.raycaster.intersectObjects(handles.children, false); return hits.length ? hits[0].object.userData.h : null;
  }
  function begin(d) { d.orig = clone(P()); d.om = resolveModel(d.orig); d.key = Math.random(); }

  // ---- pointer
  function down(e, d) {
    if (st.mode !== 'select' || e.altKey) return;
    const h = hitHandle(e); if (h) { d.mode = 'handle'; d.h = h; begin(d); return; }
    const hit = view.pickFull(e); if (!hit || !store.selection.includes(hit.id)) return;
    if (hit.kind === 'panel') { d.mode = 'handle'; d.h = { kind: 'opening', id: hit.id, y: hit.point.y }; begin(d); return; }
    d.mode = 'move'; d.ids = store.selection.slice(); d.planeY = hit.point.y; d.level = hit.level; begin(d);
    const g = view.groundHit(e, d.planeY); d.start = g ? snap(plan(g), g, null, new Set(d.ids)) : null;
  }
  function move(e, d) {
    if (!d.moved) return; const THREE = T();
    if (d.mode === 'move') {
      const g = view.groundHit(e, d.planeY); if (!g || !d.start) return; const cur = snap(plan(g), g, null, new Set(d.ids)), dx = cur[0] - d.start[0], dy = cur[1] - d.start[1];
      store.transact('Move', (p) => { restoreKinds(p, d.orig); moveObjects(p, d.om, d.ids, dx, dy, d.level); }, { coalesce: 'm3' + d.key }); return;
    }
    const h = d.h, om = d.om;
    if (h.kind === 'wallEnd' || h.kind === 'beamEnd') {
      const g = view.groundHit(e, h.y); if (!g) return; const q = snap(plan(g), g, null, new Set([h.id])), w = om.wallById[h.id];
      store.transact('Edit', (p) => { restoreKinds(p, d.orig); if (h.kind === 'wallEnd') setWallEnd(p, om, h.id, h.end, q, w.level); else setBeamEnd(p, h.id, h.end, q); }, { coalesce: 'h3' + d.key });
    } else if (h.kind === 'wallH' || h.kind === 'colH') {
      // a vertical plane through the handle, turned to face the camera
      const cam = view.cameraNow(), dir = new THREE.Vector3(); cam.getWorldDirection(dir); dir.y = 0; if (dir.lengthSq() < 1e-4) return; dir.normalize().negate();
      const obj = h.kind === 'wallH' ? om.wallById[h.id] : om.columns.find((x) => x.id === h.id); if (!obj) return;
      const at = h.kind === 'wallH' ? new THREE.Vector3((obj.a[0] + obj.b[0]) / 2, 0, -(obj.a[1] + obj.b[1]) / 2) : new THREE.Vector3(obj.c[0], 0, -obj.c[1]);
      const pl = new THREE.Plane(); pl.setFromNormalAndCoplanarPoint(dir, at); view.rayAt(e); const out = new THREE.Vector3(); if (!view.raycaster.ray.intersectPlane(pl, out)) return;
      const nh = Math.max(1, Math.round((out.y - obj.z0 - (h.kind === 'wallH' ? 0.6 : 0.6)) * 4) / 4);
      store.transact('Height', (p) => { restoreKinds(p, d.orig); (h.kind === 'wallH' ? p.walls : p.columns).find((x) => x.id === h.id).h = nh; }, { coalesce: 'h3' + d.key });
      status('Height ' + formatLength(nh, P().display));
    } else if (h.kind === 'opening') {
      const o = om.openings.find((x) => x.id === h.id), w = om.wallById[o.wall], g = view.groundHit(e, h.y); if (!g) return;
      const q = plan(g), along = dot([q[0] - w.a[0], q[1] - w.a[1]], w.d), pos = Math.max(o.w / 2 + 0.25, Math.min(w.len - o.w / 2 - 0.25, Math.round(along * 4) / 4));
      store.transact('Move opening', (p) => { restoreKinds(p, d.orig); p.openings.find((x) => x.id === h.id).pos = r3(pos); }, { coalesce: 'h3' + d.key });
    }
  }
  function up(e, d) { if (!d.moved) click(e); }

  // ---- click and hover per mode
  function click(e) {
    const m = st.mode;
    if (m === 'wall') return wallClick(e);
    if (m === 'door' || m === 'window') return openingClick(e, m);
    if (m === 'paint') return paintClick(e);
    const hit = view.pickFull(e);
    if (hit && hit.id) {
      if (/^auto(slab|roof)-/.test(hit.id)) { app.setLevel && app.setLevel(hit.level); if (app.toast) app.toast('This floor slab or RCC roof is set per level: open the Project tab, under Levels.'); if (app.panels) app.panels.show('levels'); return; }
      if (e.shiftKey || e.ctrlKey) store.toggle(hit.id); else store.select([hit.id]);
      if (hit.level && hit.level !== P().activeLevel && app.setLevel) app.setLevel(hit.level, true);
    } else if (!e.shiftKey) store.select([]);
  }
  function floorPoint(e) { const g = view.groundHit(e, levelZ(level())); return g ? { g, p: snap(plan(g), g, st.start) } : null; }
  function wallClick(e) {
    const f = floorPoint(e); if (!f) return;
    if (!st.start) { st.start = f.p; st.first = f.p; st.n = 0; return; }
    if (dist(st.start, f.p) < 0.05) return; const a = st.start, b = f.p;
    store.transact('Wall', (p) => { GEN.addWall(p, a, b, { t: O().wallT, h: O().wallH }); });
    st.n++; st.start = b; if (st.n >= 2 && dist(b, st.first) < 0.05) finishWall();
  }
  function openingPlace(hit, kind) {
    const m = M(), w = m.wallById[hit.id]; if (!w) return null;
    const width = valueOf(kind === 'door' ? (O().doorW === undefined ? '=doorW' : O().doorW) : (O().winW === undefined ? '=winW' : O().winW), m.scope);
    if (w.len < width + 0.5) return null;
    const along = dot([hit.point.x - w.a[0], -hit.point.z - w.a[1]], w.d), pos = Math.max(width / 2 + 0.25, Math.min(w.len - width / 2 - 0.25, Math.round(along * 4) / 4));
    return { w, width, pos, flip: hit.normal[0] * w.n[0] + hit.normal[1] * w.n[1] < 0 };
  }
  function openingClick(e, kind) {
    const hit = view.pickFull(e); if (!hit || hit.kind !== 'wall') { if (app.toast) app.toast('Click on a wall.'); return; }
    const pl = openingPlace(hit, kind); if (!pl) { if (app.toast) app.toast('That wall is too short.'); return; }
    let id = null;
    store.transact(kind === 'door' ? 'Door' : 'Window', (p) => { id = GEN.addOpening(p, pl.w.id, { kind, pos: pl.pos, w: kind === 'door' ? O().doorW : O().winW, flip: kind === 'door' && pl.flip }).id; });
    if (id) store.select([id]);
  }
  function paintClick(e) {
    const hit = view.pickFull(e), br = app.state && app.state.brush; if (!br || !br.fill) { if (app.toast) app.toast('Pick a colour or material in the palette first.'); return; }
    if (hit && app.paintHit) app.paintHit(hit, br.fill, e.altKey || br.whole);
  }
  function hover(e) {
    if (!view.ok || st.mode === 'select') return; overlay(); const THREE = T();
    if (st.mode === 'wall') {
      const f = floorPoint(e); if (!f) { hidePreview(); return; }
      mark.visible = true; mark.position.set(f.p[0], levelZ(level()) + 0.05, -f.p[1]); const sc = view.pxPerFt(f.g); mark.userData.size = 6 / sc;
      if (st.start) { const a = line.geometry.attributes.position, z = levelZ(level()) + 0.05; a.setXYZ(0, st.start[0], z, -st.start[1]); a.setXYZ(1, f.p[0], z, -f.p[1]); a.needsUpdate = true; line.visible = true; status('Length ' + formatLength(dist(st.start, f.p), P().display)); }
      view.dirty = true; return;
    }
    const hit = view.pickFull(e);
    if (st.mode === 'paint') { view.setHover(hit ? hit.id : null); return; }
    if (hit && hit.kind === 'wall') {
      const pl = openingPlace(hit, st.mode); if (!pl) { ghost.visible = false; return; }
      const m = M(), h = valueOf(st.mode === 'door' ? '=doorH' : '=winH', m.scope), sill = st.mode === 'door' ? 0 : valueOf('=winSill', m.scope), w = pl.w;
      ghost.visible = true; ghost.scale.set(pl.width, h, w.t + 0.25); ghost.rotation.set(0, Math.atan2(w.d[1], w.d[0]), 0);
      ghost.position.set(w.a[0] + w.d[0] * pl.pos, w.z0 + sill + h / 2, -(w.a[1] + w.d[1] * pl.pos)); ghost.material.color.setHex(st.mode === 'door' ? 0x8d5a2b : 0x2e86c1);
    } else ghost.visible = false;
    void THREE; view.dirty = true;
  }
  function dbl() { if (st.mode === 'wall') finishWall(); }

  // ---- keys
  function key(e) {
    const k = e.key, ctrl = e.ctrlKey || e.metaKey, tag = ((e.target || {}).tagName || '');
    if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
    const stop = () => { e.preventDefault(); };
    if (k === 'Escape') { if (st.start) finishWall(); else if (st.mode !== 'select') setMode('select'); else store.select([]); return stop(); }
    if (k === 'Enter' && st.start) { finishWall(); return stop(); }
    if (ctrl && (k === 'z' || k === 'Z')) { if (e.shiftKey) store.redo(); else store.undo(); return stop(); }
    if (ctrl && (k === 'y' || k === 'Y')) { store.redo(); return stop(); }
    if (k === 'Delete' || k === 'Backspace') { if (store.selection.length) { const ids = store.selection.slice(); store.transact('Delete', (p) => deleteObjects(p, ids)); } return stop(); }
    if (ctrl && (k === 'd' || k === 'D')) { if (store.selection.length) { const made = []; store.transact('Duplicate', (p) => { made.push(...transformObjects(p, store.selection, { type: 'move', dx: 1, dy: -1 }, true)); }); store.select(made); } return stop(); }
    if (k.startsWith('Arrow') && store.selection.length) {
      const s = (app.view2d && app.view2d.step && app.view2d.step()) || 0.5, dd = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }[k];
      store.transact('Nudge', (p) => { moveObjects(p, M(), store.selection, dd[0], dd[1], level()); }, { coalesce: 'nudge3' }); return stop();
    }
    if (!ctrl && (k === 'f' || k === 'F' || k === 'Home')) { view.fit(); return stop(); }
    const hot = { w: 'wall', d: 'door', n: 'window', p: 'paint', s: 'select', m: 'select' }[k.toLowerCase()];
    if (!ctrl && hot && k.length === 1) { setMode(hot); return stop(); }
  }

  // handles keep the same size on screen
  function beforeRender(cam) {
    const THREE = T(), k = 0.011;
    [handles, mark].forEach((o) => { if (!o) return; const each = (m) => { const d = view.s.ortho ? view.s.dist : cam.position.distanceTo(m.position); m.scale.setScalar(Math.max(0.02, d * k * (m.userData.size || 1))); }; if (o.isGroup) o.children.forEach(each); else each(o); });
    void THREE;
  }
  function destroy() { clearHandles(); [line, mark, ghost].forEach((o) => { if (o) view.scene.remove(o); }); }
  status(HINT.select);
  return { get mode() { return st.mode; }, setMode, down, move, up, click, hover, dbl, key, refresh, beforeRender, destroy, hint: HINT };
}
