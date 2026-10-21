// The 3D view: builds Three.js meshes from the model, orbit controls, section plane, standard views and picking.
import { modelOf } from '../model/resolve.js';
import { buildParts } from '../model/solids.js';
import { visibleLayer } from '../view2d/hit.js';

const T = () => (typeof window !== 'undefined' && window.THREE) || globalThis.THREE;
export const CATS = { wall: 'walls', slab: 'slabs', roof: 'roofs', column: 'structure', beam: 'structure', footing: 'structure', stair: 'stairs', panel: 'panels' };

// Studio (x east, y north, z up) to Three.js (x, y up, z towards the viewer)
export function toThree(tris) {
  const a = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) { a[i] = tris[i]; a[i + 1] = tris[i + 2]; a[i + 2] = -tris[i + 1]; }
  return a;
}

// Meshes for every part. opts: {levels:'all'|'active'|'upto', active, cats:{walls:true,...}, mode:'shaded'|'edges'|'wire'|'xray'}
export function buildGroup(model, project, opts) {
  const THREE = T(), group = new THREE.Group(), activeIdx = model.levels.findIndex((l) => l.id === opts.active);
  const lvlOk = (id) => { if (opts.levels === 'all') return true; const i = model.levels.findIndex((l) => l.id === id); return opts.levels === 'active' ? i === activeIdx : i <= activeIdx; };
  buildParts(model, { union: false, panels: true, levels: model.levels.filter((l) => lvlOk(l.id)).map((l) => l.id) }).forEach((p) => {
    if (!opts.cats[CATS[p.kind]]) return;
    const src = model.walls.find((w) => w.id === p.id) || model.columns.find((w) => w.id === p.id);
    const layer = src ? src.layer : ({ slab: 'A-SLAB', roof: 'A-ROOF', stair: 'A-STAIR', beam: 'S-BEAM', footing: 'S-FNDN', panel: p.color === 0x7fb3d5 ? 'A-GLAZ' : 'A-DOOR', column: 'S-COLS', wall: 'A-WALL' }[p.kind]);
    if (!visibleLayer(project, layer)) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(toThree(p.tris), 3)); geo.computeVertexNormals();
    const glass = p.kind === 'panel' && p.color === 0x7fb3d5;
    const mat = new THREE.MeshLambertMaterial({ color: p.color, side: THREE.DoubleSide, wireframe: opts.mode === 'wire', transparent: opts.mode === 'xray' || glass, opacity: glass ? 0.45 : (opts.mode === 'xray' ? 0.3 : 1), depthWrite: !(opts.mode === 'xray' || glass) });
    const mesh = new THREE.Mesh(geo, mat); mesh.userData = { id: p.kind === 'panel' ? p.id.slice(2) : p.id, kind: p.kind, level: p.level, base: p.color };
    group.add(mesh);
    if (opts.mode === 'edges' || opts.mode === 'xray') {
      const ed = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), new THREE.LineBasicMaterial({ color: opts.dark ? 0xdddddd : 0x333333 }));
      ed.userData = { edgeOf: mesh.userData.id }; group.add(ed);
    }
  });
  return group;
}

export class View3D {
  constructor(el, store, app) {
    this.el = el; this.store = store; this.app = app; this.ok = false; this.dirty = true; this.group = null;
    this.s = { az: 0.7, el: 0.5, dist: 60, tx: 0, ty: 4, tz: 0, ortho: false };
    this.opts = { levels: 'all', cats: { walls: true, slabs: true, roofs: true, structure: true, stairs: true, panels: true }, mode: 'edges', section: { axis: 'none', pos: 4, flip: false } };
    const THREE = T();
    const note = (t) => { const p = document.createElement('p'); p.className = 'st-msg'; p.textContent = t; el.appendChild(p); };
    if (!THREE) { note('The 3D view needs Three.js, which did not load.'); return; }
    try { this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true }); } catch (e) { note('The 3D view needs WebGL, which is not available here.'); return; }
    this.ok = true; this.scene = new THREE.Scene(); this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8576, 0.85));
    const dl = new THREE.DirectionalLight(0xffffff, 0.65); dl.position.set(40, 80, 30); this.scene.add(dl);
    this.persp = new THREE.PerspectiveCamera(38, 1, 0.1, 2000); this.orthoCam = new THREE.OrthographicCamera(-10, 10, 10, -10, -2000, 2000);
    this.renderer.setPixelRatio(Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2)); this.canvas = this.renderer.domElement; this.canvas.className = 'st-canvas'; el.appendChild(this.canvas);
    this.ground = new THREE.GridHelper(200, 100, 0x888888, 0xcccccc); this.ground.material.opacity = 0.4; this.ground.material.transparent = true; this.scene.add(this.ground);
    this.plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 4); this.raycaster = new THREE.Raycaster();
    this._bind(); this.resize();
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el); }
    this.unsub = [store.on('change', () => this.rebuildSoon()), store.on('selection', () => this.paintSelection())];
    this.rebuild(); this.fit();
    this._loop = () => { if (this.dirty) { this.dirty = false; this.render(); } this.raf = requestAnimationFrame(this._loop); };
    if (typeof requestAnimationFrame !== 'undefined') this.raf = requestAnimationFrame(this._loop);
  }
  destroy() { if (this.raf) cancelAnimationFrame(this.raf); if (this.ro) this.ro.disconnect(); (this.unsub || []).forEach((u) => u()); if (this.renderer) this.renderer.dispose(); }
  rebuildSoon() { if (this._t) return; this._t = setTimeout(() => { this._t = null; this.rebuild(); }, 30); }
  resize() { if (!this.ok) return; const r = this.el.getBoundingClientRect(), w = Math.max(100, r.width || 600), h = Math.max(100, r.height || 400); this.renderer.setSize(w, h); this.w = w; this.h = h; this.dirty = true; }
  rebuild() {
    if (!this.ok) return; const THREE = T();
    if (this.group) { this.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    const model = modelOf(this.store);
    this.group = buildGroup(model, this.store.p, { ...this.opts, active: this.store.p.activeLevel, dark: this.app.isDark && this.app.isDark() });
    this.scene.add(this.group); this.applySection(); this.paintSelection(); this.dirty = true;
  }
  paintSelection() {
    if (!this.group) return; const sel = new Set(this.store.selection);
    this.group.children.forEach((o) => {
      if (o.isMesh) { o.material.emissive.setHex(sel.has(o.userData.id) ? 0x1565c0 : 0x000000); o.material.emissiveIntensity = sel.has(o.userData.id) ? 0.55 : 0; }
      else if (o.isLineSegments && o.userData.edgeOf) o.material.color.setHex(sel.has(o.userData.edgeOf) ? 0x1565c0 : (this.app.isDark && this.app.isDark() ? 0xdddddd : 0x333333));
    });
    this.dirty = true;
  }
  setOpt(k, v) { this.opts[k] = v; this.rebuild(); }
  setCat(c, on) { this.opts.cats[c] = on; this.rebuild(); }
  setSection(axis, pos, flip) { this.opts.section = { axis, pos, flip: !!flip }; this.applySection(); this.dirty = true; }
  applySection() {
    if (!this.ok) return; const THREE = T(), { axis, pos, flip } = this.opts.section, f = flip ? -1 : 1;
    if (axis === 'none') { this.renderer.clippingPlanes = []; return; }
    if (axis === 'z') { this.plane.normal.set(0, -f, 0); this.plane.constant = f * pos; }
    else if (axis === 'x') { this.plane.normal.set(-f, 0, 0); this.plane.constant = f * pos; }
    else { this.plane.normal.set(0, 0, f); this.plane.constant = f * pos; }
    this.renderer.clippingPlanes = [this.plane];
  }
  extent() {
    const THREE = T(), box = new THREE.Box3(); if (this.group) box.setFromObject(this.group);
    if (box.isEmpty()) { box.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 10, 10)); }
    return box;
  }
  fit() {
    if (!this.ok) return; const box = this.extent(), c = box.getCenter(new (T().Vector3)()), sz = box.getSize(new (T().Vector3)()), r = Math.max(sz.length() / 2, 4);
    this.s.tx = c.x; this.s.ty = c.y; this.s.tz = c.z; this.s.dist = (r / Math.sin(19 * Math.PI / 180)) * 1.05; this.dirty = true;
  }
  view(name) {
    const v = { top: [0, Math.PI / 2 - 0.001], front: [0, 0], right: [Math.PI / 2, 0], back: [Math.PI, 0], left: [-Math.PI / 2, 0], iso: [0.7, 0.5], 'iso2': [-2.4, 0.5] }[name]; if (!v) return;
    this.s.az = v[0]; this.s.el = v[1]; this.fit(); this.dirty = true;
  }
  setOrtho(on) { this.s.ortho = !!on; this.dirty = true; }
  cameraNow() {
    const s = this.s, THREE = T(), cam = s.ortho ? this.orthoCam : this.persp, aspect = (this.w || 600) / (this.h || 400);
    cam.position.set(s.tx + s.dist * Math.cos(s.el) * Math.sin(s.az), s.ty + s.dist * Math.sin(s.el), s.tz + s.dist * Math.cos(s.el) * Math.cos(s.az));
    cam.up.set(0, 1, 0); cam.lookAt(s.tx, s.ty, s.tz);
    if (s.ortho) { const half = s.dist * Math.tan(19 * Math.PI / 180); cam.left = -half * aspect; cam.right = half * aspect; cam.top = half; cam.bottom = -half; }
    else cam.aspect = aspect;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(); return cam;
  }
  render() { if (!this.ok) return; const cam = this.cameraNow(); this.renderer.render(this.scene, cam); }
  pick(ev) {
    const THREE = T(), r = this.canvas.getBoundingClientRect(), ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.cameraNow());
    const hits = this.raycaster.intersectObjects(this.group.children.filter((o) => o.isMesh), false);
    const sec = this.opts.section;
    for (const h of hits) { if (sec.axis !== 'none' && this.plane.distanceToPoint(h.point) < 0) continue; return h.object.userData; }
    return null;
  }
  _bind() {
    const c = this.canvas; let d = null;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => { d = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, pan: e.button === 2 || e.button === 1 || e.shiftKey, moved: false }; try { c.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ } });
    c.addEventListener('pointermove', (e) => {
      if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY;
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
      if (!d.moved) return; const s = this.s;
      if (d.pan) {
        const k = (s.dist * Math.tan(19 * Math.PI / 180) * 2) / (this.h || 400), cam = this.cameraNow(), right = new (T().Vector3)().setFromMatrixColumn(cam.matrixWorld, 0), up = new (T().Vector3)().setFromMatrixColumn(cam.matrixWorld, 1);
        s.tx -= (right.x * dx - up.x * dy) * k; s.ty -= (right.y * dx - up.y * dy) * k; s.tz -= (right.z * dx - up.z * dy) * k;
      } else { s.az -= dx * 0.008; s.el = Math.max(-1.5, Math.min(1.5, s.el + dy * 0.006)); }
      this.dirty = true;
    });
    c.addEventListener('pointerup', (e) => {
      if (d && !d.moved && e.button === 0 && this.group) {
        const hit = this.pick(e); if (hit && hit.id) { if (e.shiftKey || e.ctrlKey) this.store.toggle(hit.id); else this.store.select([hit.id]); if (hit.level && hit.level !== this.store.p.activeLevel) this.app.setLevel(hit.level, true); } else if (!e.shiftKey) this.store.select([]);
      }
      d = null;
    });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.s.dist = Math.max(3, Math.min(900, this.s.dist * Math.exp(e.deltaY * 0.0012))); this.dirty = true; }, { passive: false });
  }
}
