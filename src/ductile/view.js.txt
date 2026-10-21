// Ductile viewport: objects, edit overlays (cage, selection, creases), a direction gizmo, drawing previews, camera and picking.
export class DuctileView {
  constructor(host) {
    this.host = host; this.ok = false; const T = window.THREE; if (!T) return;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'dx-canvas'; this.canvas.tabIndex = 0; host.appendChild(this.canvas);
    try { this.r = new T.WebGLRenderer({ canvas: this.canvas, antialias: true }); } catch (e) { this.r = null; return; }
    this.T = T; this.ok = true; this.r.setPixelRatio && this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new T.Scene(); this.cam = new T.PerspectiveCamera(35, 1, 1, 1e7); this.cam.up.set(0, 0, 1);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x8a929c, 0.8)); const d1 = new T.DirectionalLight(0xffffff, 0.75); d1.position.set(1, -1.3, 2); this.scene.add(d1); const d2 = new T.DirectionalLight(0xffffff, 0.3); d2.position.set(-1.2, 1, 0.4); this.scene.add(d2);
    this.objs = new T.Group(); this.edit = new T.Group(); this.giz = new T.Group(); this.pre = new T.Group(); this.scene.add(this.objs, this.edit, this.giz, this.pre);
    this.meshes = new Map(); this.camS = { az: 0.7, el: 0.42, dist: 600, t: [0, 0, 60] }; this.setGrid(400);
    this.resize(); try { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); } catch (e) { /* old browsers */ }
  }
  setGrid(extent) { if (!this.T) return;
    const T = this.T; if (this.grid) { this.scene.remove(this.grid); this.grid.geometry.dispose(); this.grid.material.dispose(); }
    const step = Math.pow(10, Math.floor(Math.log10(Math.max(1, extent) / 4))), size = step * 40; this.gridStep = step;
    const g = new T.GridHelper(size, 40, 0x8c96a2, 0xc5cad0); g.rotation.x = Math.PI / 2; g.material.transparent = true; g.material.opacity = 0.5; this.grid = g; this.scene.add(g);
  }
  bg(c) { if (this.ok && this.r.setClearColor) this.r.setClearColor(new this.T.Color(c), 1); }
  resize() { if (!this.ok) return; const w = Math.max(60, this.host.clientWidth), h = Math.max(60, this.host.clientHeight); this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.render(); }
  updateCam() { const c = this.camS, ce = Math.cos(c.el); this.cam.position.set(c.t[0] + c.dist * ce * Math.sin(c.az), c.t[1] - c.dist * ce * Math.cos(c.az), c.t[2] + c.dist * Math.sin(c.el)); this.cam.lookAt(c.t[0], c.t[1], c.t[2]); this.cam.near = c.dist / 500; this.cam.far = c.dist * 200; this.cam.updateProjectionMatrix(); this.cam.updateMatrixWorld(); }
  render() { if (!this.ok) return; this.updateCam(); this.scaleGizmo(); this.r.render(this.scene, this.cam); }
  fit(mn, mx) { if (!this.ok) return; const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], r = Math.max(10, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2); this.camS.t = c; this.camS.dist = r / Math.tan(this.cam.fov * Math.PI / 360) * 1.25; this.setGrid(r * 2); this.render(); }
  view(name) { if (!this.ok) return; const v = { front: [0, 0.02], back: [Math.PI, 0.02], right: [Math.PI / 2, 0.02], left: [-Math.PI / 2, 0.02], top: [0, 1.5699], iso: [0.7, 0.42] }[name]; if (v) { this.camS.az = v[0]; this.camS.el = v[1]; this.render(); } }
  orbit(dx, dy) { if (!this.ok) return; this.camS.az -= dx * 0.007; this.camS.el = Math.min(1.5699, Math.max(-1.5, this.camS.el + dy * 0.007)); this.render(); }
  pan(dx, dy) { if (!this.ok) return; const T = this.T, k = 2 * this.camS.dist * Math.tan(this.cam.fov * Math.PI / 360) / Math.max(1, this.canvas.clientHeight || 500), R = new T.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 0), U = new T.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 1); for (let i = 0; i < 3; i++) this.camS.t[i] -= ([R.x, R.y, R.z][i] * dx - [U.x, U.y, U.z][i] * dy) * k; this.render(); }
  zoom(f) { if (!this.ok) return; this.camS.dist = Math.min(5e6, Math.max(1, this.camS.dist * f)); this.render(); }
  // ---------- objects
  setObject(o, soup, opts = {}) { if (!this.ok) return;
    const T = this.T; let m = this.meshes.get(o.id);
    if (!m) { m = new T.Mesh(new T.BufferGeometry(), new T.MeshStandardMaterial({ roughness: 0.55, metalness: 0.03, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })); m.userData.id = o.id; m.frustumCulled = false; this.meshes.set(o.id, m); this.objs.add(m); }
    m.geometry.setAttribute('position', new T.BufferAttribute(soup.pos, 3)); m.geometry.setAttribute('normal', new T.BufferAttribute(soup.nrm, 3)); m.geometry.computeBoundingSphere(); m.geometry.computeBoundingBox();
    m.material.color.set(o.color || '#dddddd'); m.material.emissive.set(opts.selected ? 0x4a1d08 : 0x000000); m.material.transparent = !!opts.xray; m.material.opacity = opts.xray ? 0.5 : 1; m.material.depthWrite = !opts.xray; m.visible = o.visible !== false;
  }
  dropMissing(ids) { if (!this.ok) return; this.meshes.forEach((m, id) => { if (!ids.has(id)) { this.objs.remove(m); m.geometry.dispose(); m.material.dispose(); this.meshes.delete(id); } }); }
  clear(g) { if (!this.ok || !g) return; while (g.children.length) { const c = g.children.pop(); c.geometry && c.geometry.dispose(); c.material && c.material.dispose(); } }
  // model edges and sketch lines for the exact Part workspace
  setLines(arr, color = 0x1d232b, opacity = 0.9, depth = true) { if (!this.ok) return; const T = this.T; if (!arr || !arr.length) return; const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(Float32Array.from(arr), 3)); const l = new T.LineSegments(g, new T.LineBasicMaterial({ color, transparent: true, opacity, depthTest: depth })); l.renderOrder = 3; this.edit.add(l); }
  setTris(arr, color, opacity = 0.45) { if (!this.ok) return; const T = this.T; if (!arr || !arr.length) return; const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(arr instanceof Float32Array ? arr : Float32Array.from(arr), 3)); const m = new T.Mesh(g, new T.MeshBasicMaterial({ color, transparent: true, opacity, side: T.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.renderOrder = 4; this.edit.add(m); }
  pickTri(id, cx, cy) { if (!this.ok) return -1; const m = this.meshes.get(id); if (!m || !m.visible) return -1; const h = this.ray(cx, cy).intersectObject(m, false)[0]; return h ? h.faceIndex : -1; }
  // ---------- edit overlay: cage edges, vertices, selection, creases
  drawEdit(cage, sel, mode, hoverEdge) { if (!this.ok) return;
    const T = this.T; this.clear(this.edit); if (!cage) return;
    const seen = new Set(), L = [], LC = [], LS = [];
    cage.F.forEach((f) => f.forEach((a, k) => { const b = f[(k + 1) % f.length], key = a < b ? a + '_' + b : b + '_' + a; if (seen.has(key)) return; seen.add(key); const arr = sel.edges.has(key) ? LS : (cage.C && cage.C[key]) ? LC : L; arr.push(...cage.V[a], ...cage.V[b]); }));
    const lines = (arr, color, w) => { if (!arr.length) return; const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(Float32Array.from(arr), 3)); const l = new T.LineSegments(g, new T.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: w })); l.renderOrder = 5; this.edit.add(l); };
    lines(L, 0x2b3440, 0.75); lines(LC, 0xc2185b, 1); lines(LS, 0xff7a1a, 1);
    if (mode === 'vert') { const P = [], PS = []; cage.V.forEach((v, i) => (sel.verts.has(i) ? PS : P).push(...v)); [[P, 0x1d232b, 5], [PS, 0xff7a1a, 8]].forEach(([arr, c, s]) => { if (!arr.length) return; const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(Float32Array.from(arr), 3)); const p = new T.Points(g, new T.PointsMaterial({ color: c, size: s, sizeAttenuation: false, depthTest: false })); p.renderOrder = 6; this.edit.add(p); }); }
    if (sel.faces.size) { const P = []; sel.faces.forEach((fi) => { const f = cage.F[fi]; if (!f) return; for (let q = 1; q < f.length - 1; q++) P.push(...cage.V[f[0]], ...cage.V[f[q]], ...cage.V[f[q + 1]]); }); const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(Float32Array.from(P), 3)); const m = new T.Mesh(g, new T.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.35, depthTest: false, side: T.DoubleSide })); m.renderOrder = 4; this.edit.add(m); }
    if (hoverEdge) lines(hoverEdge, 0x1e88e5, 1);
  }
  // cage triangles for face picking, with a triangle -> face map
  cagePick(cage) { if (!this.ok) return { mesh: null, map: [] }; const P = [], map = []; cage.F.forEach((f, fi) => { for (let q = 1; q < f.length - 1; q++) { P.push(...cage.V[f[0]], ...cage.V[f[q]], ...cage.V[f[q + 1]]); map.push(fi); } }); const g = new this.T.BufferGeometry(); g.setAttribute('position', new this.T.BufferAttribute(Float32Array.from(P), 3)); g.computeBoundingSphere(); const m = new this.T.Mesh(g, new this.T.MeshBasicMaterial({ side: this.T.DoubleSide })); m.updateMatrixWorld(); return { mesh: m, map }; }
  // ---------- gizmo: normal, X, Y, Z arrows and a free centre ring at the pivot
  drawGizmo(pivot, normal, active) { if (!this.ok) return;
    const T = this.T; this.clear(this.giz); this.gz = null; if (!pivot) return;
    const axes = [['n', normal, 0xff7a1a], ['x', [1, 0, 0], 0xe53935], ['y', [0, 1, 0], 0x43a047], ['z', [0, 0, 1], 0x1e88e5]].filter((a) => a[1]);
    axes.forEach(([k, d, c]) => { const g = new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(d[0], d[1], d[2])]); const l = new T.Line(g, new T.LineBasicMaterial({ color: c, depthTest: false, linewidth: 2 })); l.renderOrder = 20; this.giz.add(l); const cone = new T.Mesh(new T.ConeGeometry(0.06, 0.18, 12), new T.MeshBasicMaterial({ color: active === k ? 0xffffff : c, depthTest: false })); cone.position.set(d[0], d[1], d[2]); cone.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(d[0], d[1], d[2]).normalize()); cone.renderOrder = 21; this.giz.add(cone); });
    const ring = new T.Mesh(new T.SphereGeometry(0.07, 14, 10), new T.MeshBasicMaterial({ color: active === 'free' ? 0xff7a1a : 0xffffff, depthTest: false })); ring.renderOrder = 21; this.giz.add(ring);
    this.giz.position.set(pivot[0], pivot[1], pivot[2]); this.gz = { pivot, axes: axes.map(([k, d]) => ({ k, d })) }; this.scaleGizmo();
  }
  gizmoScale() { if (!this.gz) return 1; const p = this.gz.pivot, d = Math.hypot(this.cam.position.x - p[0], this.cam.position.y - p[1], this.cam.position.z - p[2]); return d * 0.16; }
  scaleGizmo() { if (this.gz) { const s = this.gizmoScale(); this.giz.scale.set(s, s, s); } }
  hitGizmo(cx, cy) { if (!this.ok) return null;
    if (!this.gz) return null; const s = this.gizmoScale(), p = this.gz.pivot, P = this.screen(p), r = this.canvas.getBoundingClientRect(), x = cx - r.left, y = cy - r.top; let best = null, bd = 12;
    if (Math.hypot(P[0] - x, P[1] - y) < 12) return 'free';
    this.gz.axes.forEach(({ k, d }) => { const E = this.screen([p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s]), dist = segDist(x, y, P[0], P[1], E[0], E[1]); if (dist < bd && Math.hypot(E[0] - P[0], E[1] - P[1]) > 8) { bd = dist; best = k; } });
    return best;
  }
  // ---------- previews (drawing, loop cuts)
  drawPreview(loops, color = 0x1e88e5) { if (!this.ok) return; const T = this.T; this.clear(this.pre); loops.forEach((pts) => { if (pts.length < 2) return; const g = new T.BufferGeometry().setFromPoints(pts.map((p) => new T.Vector3(p[0], p[1], p[2]))); const l = new (pts.closed ? T.LineLoop : T.Line)(g, new T.LineBasicMaterial({ color, depthTest: false })); l.renderOrder = 30; this.pre.add(l); }); }
  // ---------- picking helpers
  screen(p) { if (!this.ok) return [0, 0, 2]; const v = new this.T.Vector3(p[0], p[1], p[2]).project(this.cam), r = this.canvas.getBoundingClientRect(); return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height, v.z]; }
  ray(cx, cy) { const r = this.canvas.getBoundingClientRect(), rc = new this.T.Raycaster(); rc.setFromCamera({ x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1 }, this.cam); return rc; }
  pickObject(cx, cy) { if (!this.ok) return null; const h = this.ray(cx, cy).intersectObjects([...this.meshes.values()].filter((m) => m.visible), false)[0]; return h ? { id: h.object.userData.id, point: [h.point.x, h.point.y, h.point.z], normal: h.face ? [h.face.normal.x, h.face.normal.y, h.face.normal.z] : [0, 0, 1] } : null; }
  pickCage(pick, cx, cy) { if (!this.ok || !pick.mesh) return null; const h = this.ray(cx, cy).intersectObject(pick.mesh, false)[0]; return h ? { face: pick.map[h.faceIndex], point: [h.point.x, h.point.y, h.point.z] } : null; }
  // pointer ray against a plane (point, normal) or an axis line through a point
  onPlane(cx, cy, p, n) { if (!this.ok) return null; const T = this.T, pl = new T.Plane().setFromNormalAndCoplanarPoint(new T.Vector3(n[0], n[1], n[2]).normalize(), new T.Vector3(p[0], p[1], p[2])), o = new T.Vector3(); return this.ray(cx, cy).ray.intersectPlane(pl, o) ? [o.x, o.y, o.z] : null; }
  viewDir() { if (!this.ok) return [0, 1, 0]; const v = new this.T.Vector3(); this.cam.getWorldDirection(v); return [v.x, v.y, v.z]; }
  axisParam(cx, cy, p, a) { if (!this.ok) return null; const rc = this.ray(cx, cy).ray, o = rc.origin, d = rc.direction, A = new this.T.Vector3(a[0], a[1], a[2]).normalize(), w0 = new this.T.Vector3(o.x - p[0], o.y - p[1], o.z - p[2]), b = d.dot(A), dd = d.dot(w0), ee = A.dot(w0), den = 1 - b * b; if (Math.abs(den) < 1e-5) return null; return (ee - b * dd) / den; }
}
function segDist(px, py, ax, ay, bx, by) { const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)); return Math.hypot(px - ax - vx * t, py - ay - vy * t); }
export { segDist };
