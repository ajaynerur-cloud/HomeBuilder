// Field viewport: shows the generated mesh, the work planes and sketches, lets you pick a face, and drag a face along its direction.
import { dot, cross, unit, sub, add, mul } from './frames.js';

const T = () => (typeof window !== 'undefined' && window.THREE) || globalThis.THREE;
const m3 = (p) => [p[0], p[2], -p[1]];                                  // Field (z up) to Three.js (y up)
function posArray(V) { const a = new Float32Array(V.length); for (let i = 0; i < V.length; i += 3) { a[i] = V[i]; a[i + 1] = V[i + 2]; a[i + 2] = -V[i + 1]; } return a; }

export class FieldView {
  constructor(el, app) {
    this.el = el; this.app = app; this.ok = false; this.dirty = true; this.s = { az: 0.8, el: 0.45, dist: 400, tx: 0, ty: 60, tz: 0 }; this.opts = { wire: false, planes: true, sketches: true };
    const THREE = T(), note = (t) => { const p = document.createElement('p'); p.className = 'st-msg'; p.textContent = t; el.appendChild(p); };
    if (!THREE) { note('The 3D view needs Three.js, which did not load.'); return; }
    try { this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); } catch (e) { note('The 3D view needs WebGL, which is not available here.'); return; }
    this.ok = true; this.scene = new THREE.Scene(); this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8576, 0.9));
    const dl = new THREE.DirectionalLight(0xffffff, 0.7); dl.position.set(120, 260, 160); this.scene.add(dl);
    this.cam = new THREE.PerspectiveCamera(36, 1, 0.5, 5000); this.renderer.setPixelRatio(Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2));
    this.canvas = this.renderer.domElement; this.canvas.className = 'st-canvas'; el.appendChild(this.canvas);
    this.grid = new THREE.GridHelper(600, 30, 0x888888, 0xcccccc); this.grid.material.transparent = true; this.grid.material.opacity = 0.35; this.scene.add(this.grid);
    this.raycaster = new THREE.Raycaster(); this.overlay = new THREE.Group(); this.scene.add(this.overlay);
    this._bind(); this.resize();
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el); }
    this._loop = () => { if (this.dirty) { this.dirty = false; this.render(); } this.raf = requestAnimationFrame(this._loop); };
    if (typeof requestAnimationFrame !== 'undefined') this.raf = requestAnimationFrame(this._loop);
  }
  destroy() { if (this.raf) cancelAnimationFrame(this.raf); if (this.ro) this.ro.disconnect(); if (this.renderer) this.renderer.dispose(); }
  resize() { if (!this.ok) return; const r = this.el.getBoundingClientRect(), w = Math.max(100, r.width || 600), h = Math.max(100, r.height || 400); this.renderer.setSize(w, h); this.w = w; this.h = h; this.dirty = true; }
  setMesh(mesh) {
    if (!this.ok) return; const THREE = T();
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh = null; }
    if (!mesh) { this.dirty = true; return; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(posArray(mesh.V), 3)); g.setIndex(new THREE.BufferAttribute(mesh.T, 1)); g.computeVertexNormals();
    this.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xd9c3a5, roughness: 0.55, metalness: 0.02, side: THREE.DoubleSide, wireframe: this.opts.wire })); this.scene.add(this.mesh);
    const bb = mesh.bb; this.grid.position.y = bb[2]; this.dirty = true;
  }
  setRef(ref) {
    if (!this.ok) return; const THREE = T(); this.ref = ref;
    if (this.pickMesh) { this.scene.remove(this.pickMesh); this.pickMesh.geometry.dispose(); this.pickMesh = null; }
    if (!ref) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(posArray(ref.mesh.V), 3)); g.setIndex(new THREE.BufferAttribute(ref.mesh.T, 1));
    this.pickMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })); this.scene.add(this.pickMesh);
  }
  // Highlight faces (region ids of the reference mesh) and optionally draw a push/pull arrow
  setHighlight(ids, arrow) {
    if (!this.ok) return; const THREE = T();
    if (this.hi) { this.scene.remove(this.hi); this.hi.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.hi = null; }
    if (!ids || !ids.length || !this.ref) { this.dirty = true; return; }
    this.hi = new THREE.Group(); const { mesh, seg } = this.ref, V = mesh.V, pos = [];
    ids.forEach((id) => { const R = seg.regions[id]; if (R) R.tris.forEach((t) => { for (let k = 0; k < 3; k++) { const v = mesh.T[t * 3 + k] * 3; pos.push(V[v], V[v + 2], -V[v + 1]); } }); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.computeVertexNormals();
    this.hi.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x2f7bd9, transparent: true, opacity: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, depthWrite: false })));
    if (arrow) { const d = unit(arrow.dir), o = m3(arrow.at), dd = m3(d); this.hi.add(new THREE.ArrowHelper(new THREE.Vector3(dd[0], dd[1], dd[2]), new THREE.Vector3(o[0], o[1], o[2]), Math.max(8, arrow.len), 0xe24b4a, Math.max(5, arrow.len * 0.18), Math.max(3, arrow.len * 0.1))); }
    this.scene.add(this.hi); this.dirty = true;
  }
  setOverlay(ev, project, sel) {
    if (!this.ok) return; const THREE = T();
    while (this.overlay.children.length) { const o = this.overlay.children.pop(); o.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); }); }
    const bb = (this.mesh && this.mesh.geometry.boundingBox) || null; void bb;
    const ext = (this.extentSize || 120), S = Math.max(60, ext * 0.7);
    if (this.opts.planes) project.planes.forEach((p) => {
      const f = ev.frames[p.id]; if (!f) return; const on = sel && sel.t === 'plane' && sel.id === p.id, c = [add(add(f.o, mul(f.u, -S)), mul(f.v, -S)), add(add(f.o, mul(f.u, S)), mul(f.v, -S)), add(add(f.o, mul(f.u, S)), mul(f.v, S)), add(add(f.o, mul(f.u, -S)), mul(f.v, S))].map(m3);
      const g = new THREE.BufferGeometry().setFromPoints(c.map((q) => new THREE.Vector3(q[0], q[1], q[2])));
      this.overlay.add(new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: on ? 0x2f7bd9 : 0x9aa3ab, transparent: true, opacity: on ? 1 : 0.45 })));
      const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...c[0], ...c[1], ...c[2], ...c[0], ...c[2], ...c[3]]), 3));
      this.overlay.add(new THREE.Mesh(q, new THREE.MeshBasicMaterial({ color: on ? 0x2f7bd9 : 0x9aa3ab, transparent: true, opacity: on ? 0.14 : 0.05, side: THREE.DoubleSide, depthWrite: false })));
    });
    if (this.opts.sketches) project.sketches.forEach((s) => {
      const r = ev.sketches[s.id]; if (!r || r.loop.length < 2) return; const f = r.frame, on = sel && sel.t === 'sketch' && sel.id === s.id;
      const pts = r.loop.map((p) => { const w = add(add(f.o, mul(f.u, p[0])), mul(f.v, p[1])), q = m3(w); return new THREE.Vector3(q[0], q[1], q[2]); });
      const g = new THREE.BufferGeometry().setFromPoints(pts); this.overlay.add(r.closed ? new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: on ? 0xe24b4a : 0x1f6fb5 })) : new THREE.Line(g, new THREE.LineBasicMaterial({ color: on ? 0xe24b4a : 0x1f6fb5 })));
    });
    this.dirty = true;
  }
  setOpt(k, v) { this.opts[k] = v; if (k === 'wire' && this.mesh) this.mesh.material.wireframe = v; this.dirty = true; }
  fit(bb) {
    if (!this.ok) return; bb = bb || (this.lastBB || [-60, -60, 0, 60, 60, 120]); this.lastBB = bb;
    const c = [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2], r = Math.max(Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) / 2, 10);
    const t = m3(c); this.s.tx = t[0]; this.s.ty = t[1]; this.s.tz = t[2]; this.s.dist = (r / Math.sin(18 * Math.PI / 180)) * 1.08; this.extentSize = r; this.dirty = true;
  }
  view(n) { const v = { top: [0, Math.PI / 2 - 0.001], front: [0, 0.0], right: [Math.PI / 2, 0.0], back: [Math.PI, 0.0], iso: [0.8, 0.45] }[n]; if (v) { this.s.az = v[0]; this.s.el = v[1]; this.dirty = true; } }
  camNow() { const s = this.s, c = this.cam; c.aspect = (this.w || 600) / (this.h || 400); c.position.set(s.tx + s.dist * Math.cos(s.el) * Math.sin(s.az), s.ty + s.dist * Math.sin(s.el), s.tz + s.dist * Math.cos(s.el) * Math.cos(s.az)); c.up.set(0, 1, 0); c.lookAt(s.tx, s.ty, s.tz); c.updateProjectionMatrix(); c.updateMatrixWorld(); return c; }
  render() { if (!this.ok) return; this.renderer.render(this.scene, this.camNow()); }
  ndc(ev) { const THREE = T(), r = this.canvas.getBoundingClientRect(); return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); }
  // face under the pointer: {id, point (Field coordinates)}
  pick(ev) {
    if (!this.pickMesh || !this.ref) return null; this.raycaster.setFromCamera(this.ndc(ev), this.camNow());
    const h = this.raycaster.intersectObject(this.pickMesh, false)[0]; if (!h) return null;
    const id = this.ref.seg.tri[h.faceIndex]; return { id, point: [h.point.x, -h.point.z, h.point.y] };
  }
  // pixels on screen covered by one millimetre along a direction at a point, as a 2D vector
  screenDir(at, dir) {
    const THREE = T(), cam = this.camNow(), a = m3(at), b = m3(add(at, unit(dir))), pa = new THREE.Vector3(a[0], a[1], a[2]).project(cam), pb = new THREE.Vector3(b[0], b[1], b[2]).project(cam);
    return [((pb.x - pa.x) / 2) * this.w, -((pb.y - pa.y) / 2) * this.h];
  }
  _bind() {
    const c = this.canvas; let d = null; c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      d = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, pan: e.button === 2 || e.button === 1 || e.shiftKey, moved: false, drag: null }; try { c.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
      if (e.button === 0 && !d.pan && this.app.dragStart) { const hit = this.pick(e), info = this.app.dragStart(hit); if (info) d.drag = info; }
    });
    c.addEventListener('pointermove', (e) => {
      if (!d) { if (this.app.hover) this.app.hover(this.pick(e)); return; }
      const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true; if (!d.moved) return;
      if (d.drag) { const sd = this.screenDir(d.drag.at, d.drag.dir), l2 = sd[0] * sd[0] + sd[1] * sd[1] || 1; this.app.dragMove(d.drag, ((e.clientX - d.sx) * sd[0] + (e.clientY - d.sy) * sd[1]) / l2); return; }
      const s = this.s;
      if (d.pan) { const k = (s.dist * Math.tan(18 * Math.PI / 180) * 2) / (this.h || 400), cam = this.camNow(), THREE = T(), right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1); s.tx -= (right.x * dx - up.x * dy) * k; s.ty -= (right.y * dx - up.y * dy) * k; s.tz -= (right.z * dx - up.z * dy) * k; }
      else { s.az -= dx * 0.008; s.el = Math.max(-1.5, Math.min(1.5, s.el + dy * 0.006)); }
      this.dirty = true;
    });
    c.addEventListener('pointerup', (e) => {
      if (d && d.drag && d.moved) this.app.dragEnd(d.drag);
      else if (d && !d.moved && e.button === 0) this.app.click(this.pick(e), e);
      d = null;
    });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.s.dist = Math.max(8, Math.min(4000, this.s.dist * Math.exp(e.deltaY * 0.0012))); this.dirty = true; }, { passive: false });
  }
}
export { cross, dot, sub };
