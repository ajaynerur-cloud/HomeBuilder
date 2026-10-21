// The 3D view: builds Three.js meshes from the model (colours, textures, painted wall faces), lights them,
// and handles the camera, section plane, picking, drag-and-drop painting and direct editing (see edit3d.js).
import { modelOf } from '../model/resolve.js';
import { buildParts } from '../model/solids.js';
import { visibleLayer } from '../view2d/hit.js';
import { resolveFill } from '../model/materials.js';
import { applyLight, applyLamps, colour, defaultLight, PRESETS } from './lighting.js';
import { createEdit3D } from './edit3d.js';

const T = () => (typeof window !== 'undefined' && window.THREE) || globalThis.THREE;
export const CATS = { wall: 'walls', slab: 'slabs', roof: 'roofs', column: 'structure', beam: 'structure', footing: 'structure', stair: 'stairs', panel: 'panels' };
const LIGHT_KEY = 'chp_studio_light';

// Studio (x east, y north, z up) to Three.js (x, y up, z towards the viewer)
export function toThree(tris) {
  const a = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) { a[i] = tris[i]; a[i + 1] = tris[i + 2]; a[i + 2] = -tris[i + 1]; }
  return a;
}

// Texture coordinates by box projection. Vertical faces run along the face and up; horizontal faces follow x and y. tile = size of one image in feet.
export function boxUVs(tris, tile) {
  const n = tris.length / 9, out = new Float32Array(n * 6), tw = (tile && tile[0]) || 4, th = (tile && tile[1]) || 4;
  for (let i = 0; i < n; i++) {
    const o = i * 9, ux = tris[o + 3] - tris[o], uy = tris[o + 4] - tris[o + 1], uz = tris[o + 5] - tris[o + 2], vx = tris[o + 6] - tris[o], vy = tris[o + 7] - tris[o + 1], vz = tris[o + 8] - tris[o + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const hl = Math.hypot(nx, ny) || 1, tx = -ny / hl, ty = nx / hl;
    for (let k = 0; k < 3; k++) {
      const x = tris[o + k * 3], y = tris[o + k * 3 + 1], z = tris[o + k * 3 + 2];
      if (Math.abs(nz) > 0.7) { out[i * 6 + k * 2] = x / tw; out[i * 6 + k * 2 + 1] = y / th; } else { out[i * 6 + k * 2] = (x * tx + y * ty) / tw; out[i * 6 + k * 2 + 1] = z / th; }
    }
  }
  return out;
}
// Splits a wall's triangles into the face on its left (a), the face on its right (b) and everything else (o: ends, top, reveals)
export function splitWallFaces(tris, wall) {
  const A = [], B = [], O = [];
  for (let i = 0; i < tris.length; i += 9) {
    const ux = tris[i + 3] - tris[i], uy = tris[i + 4] - tris[i + 1], uz = tris[i + 5] - tris[i + 2], vx = tris[i + 6] - tris[i], vy = tris[i + 7] - tris[i + 1], vz = tris[i + 8] - tris[i + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1, dn = (nx * wall.n[0] + ny * wall.n[1]) / l, t = tris.slice(i, i + 9);
    (dn > 0.7 ? A : dn < -0.7 ? B : O).push(...t);
  }
  return { a: A, b: B, o: O };
}

// Loads and caches textures for library materials. A texture is only handed out once its image has loaded; until then the material's colour is used.
export class TexCache {
  constructor(onLoad) { this.map = new Map(); this.onLoad = onLoad; this.linear = false; }
  get(mat) {
    if (!mat || !mat.tex || typeof Image === 'undefined') return null;
    const THREE = T(), key = mat.id + ':' + (this.linear ? 'l' : 's') + ':' + mat.tex.length; let e = this.map.get(key);
    if (!e) {
      const img = new Image(), t = new THREE.Texture(img); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (this.linear) t.encoding = THREE.sRGBEncoding;
      e = { t, loaded: false }; img.onload = () => { e.loaded = true; t.needsUpdate = true; if (this.onLoad) this.onLoad(); }; img.src = mat.tex; this.map.set(key, e);
    }
    return e.loaded ? e.t : null;
  }
  dispose() { this.map.forEach((e) => e.t.dispose()); this.map.clear(); }
}

const ROUGH = { wall: 0.92, slab: 0.95, roof: 0.88, column: 0.95, beam: 0.95, footing: 1, stair: 0.9, panel: 0.6 };
function material(THREE, o) {
  const glass = o.glass, par = { color: o.map ? 0xffffff : o.color, side: THREE.DoubleSide, wireframe: o.mode === 'wire', transparent: o.mode === 'xray' || glass || o.opacity < 1, opacity: glass ? 0.4 : (o.mode === 'xray' ? 0.3 : o.opacity), depthWrite: !(o.mode === 'xray' || glass || o.opacity < 1) };
  if (o.map) par.map = o.map;
  if (o.linear) { par.roughness = glass ? 0.06 : (ROUGH[o.kind] || 0.9); par.metalness = 0; return new THREE.MeshStandardMaterial(par); }
  return new THREE.MeshLambertMaterial(par);
}
const rgb = (hex, linear) => { const c = new (T().Color)(hex); if (linear && c.convertSRGBToLinear) c.convertSRGBToLinear(); return c; };

// Meshes for every part. opts: {levels:'all'|'active'|'upto', active, cats:{walls:true,...}, mode:'shaded'|'edges'|'wire'|'xray',
//   linear:boolean (physically based materials, linear colour), shadows:boolean, tex:TexCache}
export function buildGroup(model, project, opts) {
  const THREE = T(), group = new THREE.Group(), activeIdx = model.levels.findIndex((l) => l.id === opts.active), lin = !!opts.linear, mats = model.materials || [];
  const lvlOk = (id) => { if (opts.levels === 'all') return true; const i = model.levels.findIndex((l) => l.id === id); return opts.levels === 'active' ? i === activeIdx : i <= activeIdx; };
  buildParts(model, { union: false, panels: true, levels: model.levels.filter((l) => lvlOk(l.id)).map((l) => l.id) }).forEach((p) => {
    if (!opts.cats[CATS[p.kind]]) return;
    const src = model.byId && model.byId[p.ref || p.id], auto = /^auto(slab|roof)-(.+)$/.exec(p.id), lv = auto ? model.levelById[auto[2]] : null;
    const layer = src ? src.layer : ({ slab: 'A-SLAB', roof: 'A-ROOF', stair: 'A-STAIR', beam: 'S-BEAM', footing: 'S-FNDN', panel: p.sub === 'glass' ? 'A-GLAZ' : 'A-DOOR', column: 'S-COLS', wall: 'A-WALL' }[p.kind]);
    if (!visibleLayer(project, layer)) return;
    // one mesh per fill: walls with painted faces become up to three meshes, everything else one
    let groups = [{ tris: p.tris, fill: src ? src.fill : (lv ? (auto[1] === 'slab' ? lv.fillSlab : lv.fillRoof) : undefined), face: 'o' }];
    if (p.kind === 'wall' && src && (src.fillA || src.fillB)) { const f = splitWallFaces(p.tris, src); groups = [{ tris: f.a, fill: src.fillA || src.fill, face: 'a' }, { tris: f.b, fill: src.fillB || src.fill, face: 'b' }, { tris: f.o, fill: src.fill, face: 'o' }].filter((g) => g.tris.length); }
    groups.forEach((gr) => {
      const fr = resolveFill(mats, gr.fill), tex = fr && fr.mat && opts.tex ? opts.tex.get(fr.mat) : null, glass = p.sub === 'glass';
      const base = fr ? parseInt(fr.hex.slice(1), 16) : p.color, geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(toThree(gr.tris), 3)); if (tex) geo.setAttribute('uv', new THREE.BufferAttribute(boxUVs(gr.tris, fr.mat.tile), 2)); geo.computeVertexNormals();
      const mat = material(THREE, { color: rgb(base, lin), map: tex, opacity: fr ? fr.opacity : 1, glass, kind: p.kind, mode: opts.mode, linear: lin });
      const mesh = new THREE.Mesh(geo, mat); mesh.userData = { id: p.kind === 'panel' ? p.id.slice(2) : p.id, kind: p.kind, level: p.level, base, face: gr.face };
      if (opts.shadows && !glass && opts.mode !== 'xray') { mesh.castShadow = true; mesh.receiveShadow = true; mat.shadowSide = THREE.BackSide; }   // solids are closed, so back faces into the shadow map avoids acne
      group.add(mesh);
      if (opts.mode === 'edges' || opts.mode === 'xray') {
        const ed = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), new THREE.LineBasicMaterial({ color: rgb(opts.dark ? 0xdddddd : 0x333333, lin) }));
        ed.userData = { edgeOf: mesh.userData.id }; group.add(ed);
      }
    });
  });
  return group;
}

function loadLight() {
  try { const t = localStorage.getItem(LIGHT_KEY); if (t) { const o = JSON.parse(t); if (o && PRESETS[o.preset] && o.sky) return { ...defaultLight(o.preset), ...o }; } } catch (e) { /* no storage */ }
  return defaultLight('day');
}
const saveLight = (L) => { try { localStorage.setItem(LIGHT_KEY, JSON.stringify(L)); } catch (e) { /* no storage */ } };

export class View3D {
  constructor(el, store, app) {
    this.el = el; this.store = store; this.app = app; this.ok = false; this.dirty = true; this.group = null; this.model = null; this.cbs = {}; this.hoverId = null;
    this.s = { az: 0.7, el: 0.5, dist: 60, tx: 0, ty: 4, tz: 0, ortho: false };
    this.light = loadLight();
    this.opts = { levels: 'all', cats: { walls: true, slabs: true, roofs: true, structure: true, stairs: true, panels: true }, mode: this.light.mode || 'edges', section: { axis: 'none', pos: 4, flip: false } };
    const THREE = T();
    const note = (t) => { const p = document.createElement('p'); p.className = 'st-msg'; p.textContent = t; el.appendChild(p); };
    if (!THREE) { note('The 3D view needs Three.js, which did not load.'); return; }
    try { this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { note('The 3D view needs WebGL, which is not available here.'); return; }
    this.ok = true; this.scene = new THREE.Scene(); this.win = this.hostWin();
    this.persp = new THREE.PerspectiveCamera(38, 1, 0.1, 3000); this.orthoCam = new THREE.OrthographicCamera(-10, 10, 10, -10, -3000, 3000);
    this.renderer.setPixelRatio(Math.min((this.win && this.win.devicePixelRatio) || 1, 2)); this.canvas = this.renderer.domElement; this.canvas.className = 'st-canvas'; this.canvas.tabIndex = 0; el.appendChild(this.canvas);
    this.ground = new THREE.GridHelper(200, 100, 0x888888, 0xcccccc); this.ground.material.opacity = 0.4; this.ground.material.transparent = true; this.scene.add(this.ground);
    this.plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 4); this.raycaster = new THREE.Raycaster();
    this.tex = new TexCache(() => this.rebuildSoon()); this.tex.linear = !!this.light.realistic;
    this.edit = createEdit3D(this, store, app);
    this._bind(); this.resize(); this.observe();
    this.unsub = [store.on('change', () => this.rebuildSoon()), store.on('selection', () => { this.paintSelection(); this.edit.refresh(); })];
    this.rebuild(); this.fit(); this.startLoop();
  }
  on(name, fn) { (this.cbs[name] = this.cbs[name] || []).push(fn); return () => { this.cbs[name] = this.cbs[name].filter((f) => f !== fn); }; }
  emit(name, v) { (this.cbs[name] || []).forEach((f) => f(v)); }
  hostWin() { const d = this.el && this.el.ownerDocument; return (d && d.defaultView) || (typeof window !== 'undefined' ? window : null); }
  startLoop() {
    this._dead = false;
    this._loop = () => { if (this._dead) return; if (this.dirty) { this.dirty = false; this.render(); } this.rafId = this._raf(this._loop); };
    this.rafId = this._raf(this._loop);
  }
  _raf(cb) { const w = this.win; if (w && w.requestAnimationFrame) return w.requestAnimationFrame(cb); return typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(cb) : null; }
  stopLoop() { this._dead = true; const w = this.win; if (this.rafId && w && w.cancelAnimationFrame) w.cancelAnimationFrame(this.rafId); else if (this.rafId && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.rafId); this.rafId = null; }
  observe() {
    const W = this.win, RO = (W && W.ResizeObserver) || (typeof ResizeObserver !== 'undefined' ? ResizeObserver : null);
    if (RO) { this.ro = new RO(() => this.resize()); this.ro.observe(this.el); }
    if (W && W.addEventListener) { this._rz = () => this.resize(); W.addEventListener('resize', this._rz); this._rzWin = W; }
  }
  unobserve() { if (this.ro) { this.ro.disconnect(); this.ro = null; } if (this._rzWin && this._rz) this._rzWin.removeEventListener('resize', this._rz); this._rz = null; this._rzWin = null; }
  // Move the whole view into another container, for example a pop-out window. The scene, the WebGL context and the selection all stay.
  setHost(el) {
    if (!this.ok) return; this.stopLoop(); this.unobserve(); this.el = el; this.win = this.hostWin(); this.observe(); this.resize(); applyLight(this); this.startLoop(); this.dirty = true;
    setTimeout(() => { this.resize(); this.dirty = true; }, 60);
  }
  destroy() {
    this.stopLoop(); this.unobserve(); (this.unsub || []).forEach((u) => u()); if (this.edit) this.edit.destroy(); if (this.tex) this.tex.dispose(); if (this.renderer) this.renderer.dispose();
  }
  rebuildSoon() { if (this._t) return; this._t = setTimeout(() => { this._t = null; this.rebuild(); }, 30); }
  resize() { if (!this.ok) return; const r = this.el.getBoundingClientRect(), w = Math.max(100, r.width || 600), h = Math.max(100, r.height || 400); this.renderer.setSize(w, h); this.w = w; this.h = h; this.dirty = true; }
  rebuild() {
    if (!this.ok) return;
    if (this.group) { this.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    const model = modelOf(this.store); this.model = model; this.tex.linear = !!this.light.realistic;
    this.group = buildGroup(model, this.store.p, { ...this.opts, active: this.store.p.activeLevel, dark: this.app.isDark && this.app.isDark(), linear: !!this.light.realistic, shadows: !!this.light.shadows, tex: this.tex });
    this.scene.add(this.group); applyLight(this); this.applySection(); this.paintSelection(); this.edit.refresh(); this.dirty = true;
  }
  // Lighting. patch: any of the fields in lighting.js. Changing the material model or shadows rebuilds the meshes.
  setLight(patch) {
    const prev = this.light, next = { ...prev, ...patch }; this.light = next; let rebuild = prev.realistic !== next.realistic || prev.shadows !== next.shadows;
    if (patch.mode && patch.mode !== this.opts.mode) { this.opts.mode = patch.mode; rebuild = true; this.emit('opts'); }
    saveLight(next); if (!this.ok) return; if (rebuild) this.rebuild(); else { applyLight(this); this.paintSelection(); } this.dirty = true; this.emit('light', next);
  }
  setPreset(name) { const P = PRESETS[name]; if (P) this.setLight({ ...JSON.parse(JSON.stringify(P)), preset: name, quality: this.light.quality }); }
  paintSelection() {
    if (!this.group) return; const sel = new Set(this.store.selection), lin = !!this.light.realistic, hov = this.hoverId, dark = this.app.isDark && this.app.isDark();
    const selC = rgb(0x1565c0, lin), hovC = rgb(0xff9800, lin), none = rgb(0x000000, lin), edgeC = rgb(dark ? 0xdddddd : 0x333333, lin);
    this.group.children.forEach((o) => {
      if (o.isMesh) { const on = sel.has(o.userData.id), hv = hov && o.userData.id === hov; o.material.emissive.copy(on ? selC : (hv ? hovC : none)); o.material.emissiveIntensity = on ? 0.55 : (hv ? 0.4 : 0); }
      else if (o.isLineSegments && o.userData.edgeOf) o.material.color.copy(sel.has(o.userData.edgeOf) ? selC : edgeC);
    });
    this.dirty = true;
  }
  setHover(id) { if (this.hoverId === id) return; this.hoverId = id; this.paintSelection(); }
  setOpt(k, v) { this.opts[k] = v; this.rebuild(); }
  setCat(c, on) { this.opts.cats[c] = on; this.rebuild(); }
  setSection(axis, pos, flip) { this.opts.section = { axis, pos, flip: !!flip }; this.applySection(); this.dirty = true; }
  applySection() {
    if (!this.ok) return; const { axis, pos, flip } = this.opts.section, f = flip ? -1 : 1;
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
    const s = this.s, cam = s.ortho ? this.orthoCam : this.persp, aspect = (this.w || 600) / (this.h || 400);
    cam.position.set(s.tx + s.dist * Math.cos(s.el) * Math.sin(s.az), s.ty + s.dist * Math.sin(s.el), s.tz + s.dist * Math.cos(s.el) * Math.cos(s.az));
    cam.up.set(0, 1, 0); cam.lookAt(s.tx, s.ty, s.tz);
    if (s.ortho) { const half = s.dist * Math.tan(19 * Math.PI / 180); cam.left = -half * aspect; cam.right = half * aspect; cam.top = half; cam.bottom = -half; }
    else cam.aspect = aspect;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(); return cam;
  }
  render() { if (!this.ok) return; const cam = this.cameraNow(); this.edit.beforeRender(cam); this.renderer.render(this.scene, cam); }
  // A picture of the current view, drawn over the sky. factor 2 doubles the resolution.
  snapshot(factor = 2) {
    if (!this.ok) return null; const R = this.renderer, w = this.w, h = this.h, pr = R.getPixelRatio ? R.getPixelRatio() : 1;
    try {
      R.setPixelRatio(1); R.setSize(w * factor, h * factor, false); this.edit.beforeRender(this.cameraNow()); R.render(this.scene, this.cameraNow());
      const doc = this.el.ownerDocument || document, c = doc.createElement('canvas'); c.width = w * factor; c.height = h * factor; const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, c.height); grad.addColorStop(0, this.light.sky[0]); grad.addColorStop(1, this.light.sky[1]); g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height); g.drawImage(this.canvas, 0, 0);
      return c.toDataURL('image/png');
    } finally { R.setPixelRatio(pr); R.setSize(w, h); this.dirty = true; }
  }
  // Pixels per foot at a world point, for snapping tolerances
  pxPerFt(point) {
    const cam = this.cameraNow(), h = this.h || 400;
    if (this.s.ortho) return h / (2 * this.s.dist * Math.tan(19 * Math.PI / 180));
    return h / (2 * Math.max(0.5, cam.position.distanceTo(point)) * Math.tan(cam.fov * Math.PI / 360));
  }
  rayAt(ev) {
    const THREE = T(), r = this.canvas.getBoundingClientRect(), ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.cameraNow()); return this.raycaster.ray;
  }
  // The point where the pointer ray meets the horizontal plane at height y (Three.js y, which is the plan's z)
  groundHit(ev, y) { const THREE = T(); this.rayAt(ev); const out = new THREE.Vector3(); return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), out) ? out : null; }
  // Nearest part under the pointer, with the hit point and the face normal in plan coordinates
  pickFull(ev) {
    if (!this.group) return null; const THREE = T(); this.rayAt(ev);
    const hits = this.raycaster.intersectObjects(this.group.children.filter((o) => o.isMesh), false), sec = this.opts.section;
    for (const h of hits) {
      if (sec.axis !== 'none' && this.plane.distanceToPoint(h.point) < 0) continue;
      const n = h.face ? h.face.normal.clone() : new THREE.Vector3(0, 1, 0); if (n.dot(this.raycaster.ray.direction) > 0) n.negate();
      return { ...h.object.userData, point: h.point.clone(), normal: [n.x, -n.z, n.y], dist: h.distance };
    }
    return null;
  }
  pick(ev) { return this.pickFull(ev); }
  _bind() {
    const c = this.canvas; let d = null;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      if (c.focus) { try { c.focus({ preventScroll: true }); } catch (x) { /* not focusable */ } }
      d = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, pan: e.button === 2 || e.button === 1 || e.shiftKey, moved: false, mode: null };
      if (e.button === 0 && !d.pan) this.edit.down(e, d);
      try { c.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
    });
    c.addEventListener('pointermove', (e) => {
      if (!d) { this.edit.hover(e); return; }
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
      if (d.mode) { this.edit.move(e, d); return; }
      const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY;
      if (!d.moved) return; const s = this.s;
      if (d.pan) {
        const k = (s.dist * Math.tan(19 * Math.PI / 180) * 2) / (this.h || 400), cam = this.cameraNow(), right = new (T().Vector3)().setFromMatrixColumn(cam.matrixWorld, 0), up = new (T().Vector3)().setFromMatrixColumn(cam.matrixWorld, 1);
        s.tx -= (right.x * dx - up.x * dy) * k; s.ty -= (right.y * dx - up.y * dy) * k; s.tz -= (right.z * dx - up.z * dy) * k;
      } else { s.az -= dx * 0.008; s.el = Math.max(-1.5, Math.min(1.5, s.el + dy * 0.006)); }
      this.dirty = true;
    });
    c.addEventListener('pointerup', (e) => {
      if (d && d.mode) this.edit.up(e, d);
      else if (d && !d.moved && e.button === 0 && this.group) this.edit.click(e);
      d = null;
    });
    c.addEventListener('dblclick', (e) => this.edit.dbl(e));
    c.addEventListener('keydown', (e) => this.edit.key(e));
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.s.dist = Math.max(3, Math.min(900, this.s.dist * Math.exp(e.deltaY * 0.0012))); this.dirty = true; }, { passive: false });
    // drag a colour or material from the palette onto a surface, or drop a .skm or image file on it
    const wants = (e) => { const t = (e.dataTransfer && e.dataTransfer.types) || []; return Array.prototype.some.call(t, (x) => x === 'application/x-chp-fill' || x === 'Files'); };
    c.addEventListener('dragover', (e) => { if (!wants(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; const hit = this.pickFull(e); this.setHover(hit ? hit.id : null); });
    c.addEventListener('dragleave', () => this.setHover(null));
    c.addEventListener('drop', (e) => {
      e.preventDefault(); this.setHover(null); const dt = e.dataTransfer; if (!dt) return; const hit = this.pickFull(e), fill = dt.getData('application/x-chp-fill');
      if (dt.files && dt.files.length) { if (this.app.dropFiles) this.app.dropFiles(Array.from(dt.files), hit, e); } else if (fill && this.app.dropFill) this.app.dropFill(hit, fill, e);
    });
  }
}
export { applyLamps, colour };
