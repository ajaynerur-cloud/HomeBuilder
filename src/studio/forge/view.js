// The Forge viewport: draws the mesh, picks faces, edges and vertices, and turns mouse drags into pulls in any direction.
import { triangulateOriented, faceNormal, faceCenter, edgeMap, edgeLoop, faceStrip, hash, add, sub, mul, dot, cross, unit, len, vertexFaces } from './mesh.js';
import { applyOp, regionNormal } from './ops.js';

const T = () => (typeof window !== 'undefined' && window.THREE) || globalThis.THREE;
const C_BASE = [0.78, 0.76, 0.72], C_SEL = [0.13, 0.45, 0.85], C_HOV = [0.62, 0.78, 0.95], C_OVER = [0.9, 0.35, 0.3], C_OTHER = [0.6, 0.6, 0.62];
export const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

export class ForgeView {
  constructor(el, app) {
    this.el = el; this.app = app; this.ok = false; this.dirty = true; this.s = { az: 0.6, el: 0.35, dist: 500, t: [0, 0, 80], ortho: false }; this.drag = null; this.hover = null;
    const THREE = T();
    const note = (txt) => { const p = document.createElement('p'); p.className = 'st-msg'; p.textContent = txt; el.appendChild(p); };
    if (!THREE) { note('The 3D view needs Three.js, which did not load.'); return; }
    try { this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); } catch (e) { note('The 3D view needs WebGL, which is not available here.'); return; }
    this.ok = true; this.scene = new THREE.Scene(); this.scene.add(new THREE.HemisphereLight(0xffffff, 0x888078, 0.9)); const dl = new THREE.DirectionalLight(0xffffff, 0.7); dl.position.set(200, 400, 300); this.scene.add(dl);
    this.persp = new THREE.PerspectiveCamera(36, 1, 1, 20000); this.orthoCam = new THREE.OrthographicCamera(-100, 100, 100, -100, -20000, 20000);
    this.renderer.setPixelRatio(Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2)); this.canvas = this.renderer.domElement; this.canvas.className = 'st-canvas'; el.appendChild(this.canvas);
    this.grid = new THREE.GridHelper(600, 60, 0x999999, 0xdddddd); this.grid.material.transparent = true; this.grid.material.opacity = 0.5; this.scene.add(this.grid);
    this.group = new THREE.Group(); this.scene.add(this.group); this.over = new THREE.Group(); this.scene.add(this.over);
    this.raycaster = new THREE.Raycaster(); this.bodies = []; this.resize();
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el); }
    this._bind();
    this._loop = () => { if (this.dirty) { this.dirty = false; this.render(); } this.raf = requestAnimationFrame(this._loop); };
    if (typeof requestAnimationFrame !== 'undefined') this.raf = requestAnimationFrame(this._loop);
  }
  destroy() { if (this.raf) cancelAnimationFrame(this.raf); if (this.ro) this.ro.disconnect(); if (this.renderer) this.renderer.dispose(); }
  resize() { if (!this.ok) return; const r = this.el.getBoundingClientRect(); this.w = Math.max(100, r.width || 600); this.h = Math.max(100, r.height || 400); this.renderer.setSize(this.w, this.h); this.dirty = true; }
  // Studio and Forge both keep z up. Three.js has y up.
  tv(p) { return [p[0], p[2], -p[1]]; }
  cameraNow() {
    const s = this.s, cam = s.ortho ? this.orthoCam : this.persp, aspect = this.w / this.h, tg = this.tv(s.t);
    cam.position.set(tg[0] + s.dist * Math.cos(s.el) * Math.sin(s.az), tg[1] + s.dist * Math.sin(s.el), tg[2] + s.dist * Math.cos(s.el) * Math.cos(s.az)); cam.up.set(0, 1, 0); cam.lookAt(tg[0], tg[1], tg[2]);
    if (s.ortho) { const half = s.dist * Math.tan(18 * Math.PI / 180); cam.left = -half * aspect; cam.right = half * aspect; cam.top = half; cam.bottom = -half; } else cam.aspect = aspect;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(); return cam;
  }
  render() { if (!this.ok) return; this.renderer.render(this.scene, this.cameraNow()); }
  // projection helpers used by picking and by the drag maths
  toScreen(p, cam) { const THREE = T(), v = new THREE.Vector3(...this.tv(p)).project(cam || this.cameraNow()); return [(v.x + 1) / 2 * this.w, (1 - v.y) / 2 * this.h, v.z]; }
  ray(px, py) { const THREE = T(), cam = this.cameraNow(); this.raycaster.setFromCamera(new THREE.Vector2(px / this.w * 2 - 1, -(py / this.h) * 2 + 1), cam); const r = this.raycaster.ray, o = r.origin, d = r.direction; return { o: [o.x, -o.z, o.y], d: [d.x, -d.z, d.y] }; }   // in model coordinates

  // ---- mesh display
  setBodies(list, activeId) {
    if (!this.ok) return; const THREE = T();
    this.group.children.slice().forEach((c) => { this.group.remove(c); if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
    this.bodies = [];
    list.forEach(({ body, mesh }) => {
      const T3 = triangulateOriented(mesh), n = T3.tris.length / 9, pos = new Float32Array(T3.tris.length), col = new Float32Array(T3.tris.length), nor = new Float32Array(T3.tris.length);
      for (let i = 0; i < T3.tris.length; i += 3) { pos[i] = T3.tris[i]; pos[i + 1] = T3.tris[i + 2]; pos[i + 2] = -T3.tris[i + 1]; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      const smooth = this.app.state.smooth, vn = smooth ? this.vertexNormals(mesh) : null;
      for (let t = 0; t < n; t++) { const fn = faceNormal(mesh, T3.faceOf[t]); for (let k = 0; k < 3; k++) { const o = t * 9 + k * 3; let q = fn; if (vn) { const key = T3.tris.slice(o, o + 3); void key; } nor[o] = q[0]; nor[o + 1] = q[2]; nor[o + 2] = -q[1]; } }
      if (smooth) this.smoothNormals(mesh, T3, nor);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), obj = new THREE.Mesh(geo, mat);
      obj.userData = { id: body.id }; this.group.add(obj);
      let edges = null;
      if (this.app.state.edges !== false) {
        const E = edgeMap(mesh), pts = []; E.forEach((e) => { const a = mesh.v[e.a].p, b = mesh.v[e.b].p; pts.push(a[0], a[2], -a[1], b[0], b[2], -b[1]); });
        const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3)); edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: mesh.f.length > 6000 ? 0.12 : 0.4 })); this.group.add(edges);
      }
      this.bodies.push({ id: body.id, mesh, T3, obj, geo, col, edges, active: body.id === activeId });
    });
    this.paint(); this.dirty = true;
  }
  vertexNormals(m) { return null; }
  smoothNormals(m, T3, nor) {
    const acc = m.v.map(() => [0, 0, 0]); m.f.forEach((F, fi) => { const n = faceNormal(m, fi); F.v.forEach((v) => { acc[v][0] += n[0]; acc[v][1] += n[1]; acc[v][2] += n[2]; }); });
    // triangles carry positions only, so look vertices up by position
    const key = (x, y, z) => Math.round(x * 1e4) + ',' + Math.round(y * 1e4) + ',' + Math.round(z * 1e4), map = new Map(); m.v.forEach((v, i) => map.set(key(...v.p), i));
    for (let t = 0; t < T3.faceOf.length; t++) for (let k = 0; k < 3; k++) { const o = t * 9 + k * 3, i = map.get(key(T3.tris[o], T3.tris[o + 1], T3.tris[o + 2])); if (i === undefined) continue; const n = unit(acc[i]); nor[o] = n[0]; nor[o + 1] = n[2]; nor[o + 2] = -n[1]; }
  }
  active() { return this.bodies.find((b) => b.active); }
  paint() {
    const sel = this.app.selFaceSet(), hov = this.hover && this.hover.face, over = this.app.overhangSet();
    this.bodies.forEach((b) => {
      const col = b.col; for (let t = 0; t < b.T3.faceOf.length; t++) {
        const f = b.T3.faceOf[t]; let c = b.active ? C_BASE : C_OTHER;
        if (b.active) { if (over && over.has(f)) c = C_OVER; if (hov === f) c = C_HOV; if (sel.has(f)) c = C_SEL; }
        for (let k = 0; k < 3; k++) { col[t * 9 + k * 3] = c[0]; col[t * 9 + k * 3 + 1] = c[1]; col[t * 9 + k * 3 + 2] = c[2]; }
      }
      b.geo.attributes.color.needsUpdate = true;
    });
    this.paintOverlay(); this.dirty = true;
  }
  paintOverlay() {
    if (!this.ok) return; const THREE = T(); this.over.children.slice().forEach((c) => { this.over.remove(c); if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
    const b = this.active(); if (!b) return; const m = b.mesh, ki = m.keyIndex(), sv = this.app.sel.verts.map((k) => ki.get(k)).filter((i) => i !== undefined);
    if (sv.length) { const pts = []; sv.forEach((i) => { const p = m.v[i].p; pts.push(p[0], p[2], -p[1]); }); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3)); this.over.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x1f6fd9, size: 6, sizeAttenuation: false, depthTest: false }))); }
    const se = this.app.sel.edges; if (se.length) { const pts = []; se.forEach(([a, c]) => { const i = ki.get(a), j = ki.get(c); if (i === undefined || j === undefined) return; const p = m.v[i].p, q = m.v[j].p; pts.push(p[0], p[2], -p[1], q[0], q[2], -q[1]); }); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3)); this.over.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1f6fd9, depthTest: false }))); }
    if (this.axisLine) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.axisLine.flatMap((p) => this.tv(p))), 3)); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xe0561b, depthTest: false })); this.over.add(l); }
  }
  setAxis(pivot, dir, span) { this.axisLine = pivot && dir ? [add(pivot, mul(dir, -span)), add(pivot, mul(dir, span))] : null; this.paintOverlay(); this.dirty = true; }

  // ---- views
  bounds() { const b = this.active(); const mn = [1e18, 1e18, 1e18], mx = [-1e18, -1e18, -1e18]; (b ? [b] : this.bodies).forEach((x) => x.mesh.v.forEach((v) => v.p.forEach((c, i) => { if (c < mn[i]) mn[i] = c; if (c > mx[i]) mx[i] = c; }))); if (mn[0] > mx[0]) return { mn: [-50, -50, 0], mx: [50, 50, 100] }; return { mn, mx }; }
  fit() { if (!this.ok) return; const { mn, mx } = this.bounds(), c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], r = Math.max(len(sub(mx, mn)) / 2, 10); this.s.t = c; this.s.dist = r / Math.sin(18 * Math.PI / 180) * 1.1; this.dirty = true; }
  view(name) { const v = { top: [0, Math.PI / 2 - 0.001], front: [0, 0], right: [Math.PI / 2, 0], back: [Math.PI, 0], left: [-Math.PI / 2, 0], iso: [0.6, 0.35] }[name]; if (!v) return; this.s.az = v[0]; this.s.el = v[1]; this.fit(); }

  // ---- picking
  pickFace(px, py) {
    const THREE = T(), b = this.active(); if (!b) return null; const cam = this.cameraNow();
    this.raycaster.setFromCamera(new THREE.Vector2(px / this.w * 2 - 1, -(py / this.h) * 2 + 1), cam);
    const hit = this.raycaster.intersectObject(b.obj, false)[0]; if (!hit) return null;
    const f = b.T3.faceOf[hit.faceIndex], p = hit.point; return { face: f, point: [p.x, -p.z, p.y], dist: hit.distance };
  }
  pickVertex(px, py, tol = 10) {
    const b = this.active(); if (!b) return null; const cam = this.cameraNow(), m = b.mesh, hit = this.pickFace(px, py); let best = null, bd = tol;
    const VF = m.v.length < 40000 ? null : null; void VF;
    m.v.forEach((v, i) => { const s = this.toScreen(v.p, cam), d = Math.hypot(s[0] - px, s[1] - py); if (d < bd) { if (hit) { const hs = this.toScreen(hit.point, cam); if (s[2] > hs[2] + 0.002) return; } bd = d; best = i; } });
    return best === null ? null : { vert: best };
  }
  pickEdge(px, py, tol = 8) {
    const b = this.active(); if (!b) return null; const cam = this.cameraNow(), m = b.mesh, E = edgeMap(m), S = m.v.map((v) => this.toScreen(v.p, cam)); let best = null, bd = tol; const hit = this.pickFace(px, py), hs = hit ? this.toScreen(hit.point, cam)[2] : 2;
    E.forEach((e) => {
      const A = S[e.a], B = S[e.b], dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((px - A[0]) * dx + (py - A[1]) * dy) / l2)) : 0, d = Math.hypot(A[0] + dx * t - px, A[1] + dy * t - py);
      if (d < bd && (A[2] + (B[2] - A[2]) * t) < hs + 0.002) { bd = d; best = e; }
    });
    return best ? { a: best.a, b: best.b, faces: best.faces.map((x) => x.f) } : null;
  }
  boxFaces(x0, y0, x1, y1) {
    const b = this.active(); if (!b) return []; const cam = this.cameraNow(), m = b.mesh, out = [], ro = this.ray(this.w / 2, this.h / 2).d;
    m.f.forEach((F, fi) => { const c = faceCenter(m, fi), s = this.toScreen(c, cam); if (s[0] >= x0 && s[0] <= x1 && s[1] >= y0 && s[1] <= y1 && dot(faceNormal(m, fi), ro) < 0.2) out.push(fi); });
    return out;
  }
  boxVerts(x0, y0, x1, y1) { const b = this.active(); if (!b) return []; const cam = this.cameraNow(), out = []; b.mesh.v.forEach((v, i) => { const s = this.toScreen(v.p, cam); if (s[0] >= x0 && s[0] <= x1 && s[1] >= y0 && s[1] <= y1) out.push(i); }); return out; }

  // ---- drag maths: how far did the pointer move along a direction in the model?
  pxPerUnit(pivot, dir) {
    const cam = this.cameraNow(), a = this.toScreen(pivot, cam), b = this.toScreen(add(pivot, dir), cam), l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > 1e-3) return { k: l, dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] };
    const half = this.s.dist * Math.tan(18 * Math.PI / 180); return { k: this.h / (2 * half), dir: [0, -1] };
  }
  amountAlong(pivot, dir, dx, dy) { const u = this.pxPerUnit(pivot, dir); return (dx * u.dir[0] + dy * u.dir[1]) / u.k; }
  planePoint(pivot, px, py) {   // pointer on the plane through pivot that faces the camera
    const r = this.ray(px, py), cam = this.cameraNow(), n = this.ray(this.w / 2, this.h / 2).d, den = dot(r.d, n); void cam;
    if (Math.abs(den) < 1e-9) return pivot; const t = dot(sub(pivot, r.o), n) / den; return add(r.o, mul(r.d, t));
  }

  _bind() {
    const c = this.canvas, app = this.app; let nav = null;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      try { c.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
      const r = c.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      if (e.button === 2 || e.button === 1 || e.altKey) { nav = { x: e.clientX, y: e.clientY, pan: e.button === 1 || (e.button === 2 && e.shiftKey) }; return; }
      if (e.button !== 0) return; this.drag = app.beginDrag(this, px, py, e); if (this.drag) this.drag.moved = false;
    });
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      if (nav) { const dx = e.clientX - nav.x, dy = e.clientY - nav.y; nav.x = e.clientX; nav.y = e.clientY; const s = this.s; if (nav.pan) { const cam = this.cameraNow(), k = (s.dist * Math.tan(18 * Math.PI / 180) * 2) / this.h, right = new (T().Vector3)().setFromMatrixColumn(cam.matrixWorld, 0), up = new (T().Vector3)().setFromMatrixColumn(cam.matrixWorld, 1); const d3 = [(-right.x * dx + up.x * dy) * k, (right.z * dx - up.z * dy) * k, (-right.y * dx + up.y * dy) * k]; s.t = [s.t[0] + d3[0], s.t[1] + d3[1], s.t[2] + d3[2]]; } else { s.az -= dx * 0.008; s.el = Math.max(-1.5, Math.min(1.5, s.el + dy * 0.006)); } this.dirty = true; return; }
      if (this.drag) { this.drag.moved = true; app.moveDrag(this, this.drag, px, py, e); return; }
      app.hoverAt(this, px, py);
    });
    c.addEventListener('pointerup', (e) => {
      const r = c.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      if (nav) { nav = null; return; }
      if (this.drag) { const d = this.drag; this.drag = null; app.endDrag(this, d, px, py, e); }
    });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.s.dist = Math.max(10, Math.min(8000, this.s.dist * Math.exp(e.deltaY * 0.0012))); this.dirty = true; }, { passive: false });
  }
}
export { regionNormal, applyOp, hash, vertexFaces, cross, edgeLoop, faceStrip };
