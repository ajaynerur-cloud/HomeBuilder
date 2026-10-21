// Kiln 3D view: shaded vessel with a lean heat map, water at the fill line, centre of mass, foot outline, section cut, picking.
const LIMIT_COL = [[0.36, 0.67, 0.42], [0.95, 0.75, 0.25], [0.86, 0.27, 0.27]];
export class KilnView {
  constructor(host) {
    this.host = host; this.ok = false; this.opts = { lean: false, water: true, cut: false, planes: true, com: true };
    const T = window.THREE; if (!T) return;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'kn-canvas'; this.canvas.tabIndex = 0; host.appendChild(this.canvas);
    try { this.r = new T.WebGLRenderer({ canvas: this.canvas, antialias: true }); } catch (e) { this.r = null; return; }
    this.T = T; this.ok = true; const r = this.r; r.setPixelRatio && r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.localClippingEnabled = true;
    this.scene = new T.Scene(); this.cam = new T.PerspectiveCamera(32, 1, 5, 5000); this.cam.up.set(0, 0, 1);
    this.scene.add(new T.HemisphereLight(0xffffff, 0x7d8896, 0.85)); const d1 = new T.DirectionalLight(0xffffff, 0.8); d1.position.set(150, -200, 260); this.scene.add(d1); const d2 = new T.DirectionalLight(0xffffff, 0.3); d2.position.set(-160, 140, 60); this.scene.add(d2);
    const g = new T.GridHelper(400, 40, 0x8a94a0, 0xc2c7ce); g.rotation.x = Math.PI / 2; g.material.transparent = true; g.material.opacity = 0.4; this.scene.add(g);
    this.clip = new T.Plane(new T.Vector3(0, 1, 0), 0);
    this.mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.04, side: T.DoubleSide }); this.geo = new T.BufferGeometry(); this.mesh = new T.Mesh(this.geo, this.mat); this.mesh.frustumCulled = false; this.scene.add(this.mesh);
    this.over = new T.Group(); this.scene.add(this.over);
    this.camS = { az: 0.62, el: 0.33, dist: 520, tx: 0, ty: 0, tz: 100 };
    this.resize(); try { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); } catch (e) { /* old browsers */ }
  }
  bg(color) { if (this.ok && this.r.setClearColor) this.r.setClearColor(new this.T.Color(color), 1); this.render(); }
  resize() { if (!this.ok) return; const w = Math.max(60, this.host.clientWidth), h = Math.max(60, this.host.clientHeight); this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.render(); }
  fit(H) { Object.assign(this.camS, { tx: 0, ty: 0, tz: H * 0.45, dist: Math.max(280, H * 2.4) }); this.render(); }
  updateCam() { const c = this.camS, ce = Math.cos(c.el); this.cam.position.set(c.tx + c.dist * ce * Math.sin(c.az), c.ty - c.dist * ce * Math.cos(c.az), c.tz + c.dist * Math.sin(c.el)); this.cam.lookAt(c.tx, c.ty, c.tz); this.cam.updateMatrixWorld(); }
  render() { if (!this.ok) return; this.updateCam(); this.r.render(this.scene, this.cam); }
  // e: engine result, a: analysis, limit: lean limit in degrees, extras: {planes:[z...], target, from}
  show(e, limit, extras = {}) {
    if (!this.ok) return; const T = this.T, sd = e.solid, nt = sd.nt, col = new Float32Array(nt * 9), outer = sd.outerTris * 3;
    for (let t = 0; t < nt * 3; t++) {
      const o = t * 3; let c = [0.93, 0.89, 0.82];
      if (t >= outer) c = [0.85, 0.79, 0.69];
      if (this.opts.lean && t < outer) { const lean = Math.asin(Math.min(1, Math.abs(sd.nrm[o + 2]))) * 180 / Math.PI, q = lean / (limit || 45); c = q < 0.75 ? LIMIT_COL[0] : q < 1 ? LIMIT_COL[1] : LIMIT_COL[2]; }
      col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2];
    }
    this.geo.setAttribute('position', new T.BufferAttribute(sd.pos, 3)); this.geo.setAttribute('normal', new T.BufferAttribute(sd.nrm, 3)); this.geo.setAttribute('color', new T.BufferAttribute(col, 3)); this.geo.computeBoundingSphere();
    this.mat.clippingPlanes = this.opts.cut ? [this.clip] : []; this.mat.needsUpdate = true;
    this.e = e; this.overlays(e, extras); this.render();
  }
  overlays(e, x) {
    const T = this.T, G = this.over; while (G.children.length) { const c = G.children.pop(); c.geometry && c.geometry.dispose(); c.material && c.material.dispose(); }
    const a = e.a, U = e.U, M = e.M, I = e.solid.inner;
    if (this.opts.water && a && a.capacity > 0) { // water surface at the fill line, shaped like the inner wall there
      let j = e.solid.floorRow; while (j < M && I[(j * U) * 3 + 2] < a.fillZ) j++; const pts = []; for (let i = 0; i < U; i++) { const q = (j * U + i) * 3; pts.push(new T.Vector2(I[q] * 0.995, I[q + 1] * 0.995)); }
      const sh = new T.Shape(pts), g = new T.ShapeGeometry(sh); g.translate(0, 0, a.fillZ); const m = new T.Mesh(g, new T.MeshBasicMaterial({ color: 0x3d8fd6, transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false })); G.add(m);
    }
    if (this.opts.com && a) { // centre of mass (filled) and the foot outline it must stay inside
      const s = new T.Mesh(new T.SphereGeometry(3.2, 16, 12), new T.MeshBasicMaterial({ color: 0x3d8fd6, depthTest: false })); s.position.set(a.comFilled[0], a.comFilled[1], a.comFilled[2]); s.renderOrder = 9; G.add(s);
      const s2 = new T.Mesh(new T.SphereGeometry(2.6, 16, 12), new T.MeshBasicMaterial({ color: 0x222222, depthTest: false })); s2.position.set(a.com[0], a.com[1], a.com[2]); s2.renderOrder = 9; G.add(s2);
      const fp = []; for (let i = 0; i <= U; i++) { const q = (i % U) * 3; fp.push(new T.Vector3(e.P[q], e.P[q + 1], 0.3)); } const fl = new T.Line(new T.BufferGeometry().setFromPoints(fp), new T.LineBasicMaterial({ color: 0x3d8fd6 })); G.add(fl);
      const drop = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(a.comFilled[0], a.comFilled[1], a.comFilled[2]), new T.Vector3(a.comFilled[0], a.comFilled[1], 0)]), new T.LineDashedMaterial({ color: 0x3d8fd6, dashSize: 3, gapSize: 2, depthTest: false })); drop.computeLineDistances(); drop.renderOrder = 8; G.add(drop);
    }
    if (this.opts.planes && x.planes) x.planes.forEach((p) => { const pts = []; for (let i = 0; i <= 72; i++) { const t = i / 72 * Math.PI * 2; pts.push(new T.Vector3(p.r * Math.cos(t), p.r * Math.sin(t), p.z)); } const l = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: p.sel ? 0xe8672c : 0x7a8ea8, transparent: true, opacity: p.sel ? 1 : 0.6, depthTest: false })); l.renderOrder = 6; G.add(l); });
    if (x.target && x.from) { const l = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(...x.from), new T.Vector3(...x.target)]), new T.LineBasicMaterial({ color: 0xe8672c, depthTest: false })); l.renderOrder = 11; G.add(l); const s = new T.Mesh(new T.SphereGeometry(3, 14, 10), new T.MeshBasicMaterial({ color: 0xe8672c, depthTest: false })); s.position.set(...x.target); s.renderOrder = 11; G.add(s); }
  }
  ndc(cx, cy) { const r = this.canvas.getBoundingClientRect(); return { x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1 }; }
  ray(cx, cy) { const rc = new this.T.Raycaster(); rc.setFromCamera(this.ndc(cx, cy), this.cam); return rc; }
  // surface hit on the outer skin -> grid coordinates (u around, v up), point and normal
  pick(cx, cy) {
    if (!this.ok || !this.e) return null; const hits = this.ray(cx, cy).intersectObject(this.mesh, false), e = this.e, outer = e.solid.outerTris;
    for (const h of hits) {
      if (h.faceIndex >= outer) continue; if (this.opts.cut && this.clip.distanceToPoint(h.point) < 0) continue;
      const p = this.geo.attributes.position, f = h.faceIndex, V = [0, 1, 2].map((k) => new this.T.Vector3(p.getX(f * 3 + k), p.getY(f * 3 + k), p.getZ(f * 3 + k))), q = h.point;
      const v0 = V[1].clone().sub(V[0]), v1 = V[2].clone().sub(V[0]), v2 = q.clone().sub(V[0]), d00 = v0.dot(v0), d01 = v0.dot(v1), d11 = v1.dot(v1), d20 = v2.dot(v0), d21 = v2.dot(v1), den = d00 * d11 - d01 * d01 || 1, w1 = (d11 * d20 - d01 * d21) / den, w2 = (d00 * d21 - d01 * d20) / den;
      const cell = f >> 1, j = Math.floor(cell / e.U), i = cell % e.U, cl = (x) => Math.min(1, Math.max(0, x)), [fu, fv] = (f & 1) === 0 ? [cl(w1 + w2), cl(w2)] : [cl(w1), cl(w1 + w2)];
      const n = h.face.normal; return { u: (i + fu) / e.U, v: (j + fv) / e.M, point: [q.x, q.y, q.z], normal: [n.x, n.y, n.z] };
    }
    return null;
  }
  // where the pointer ray meets a line (axis) or the view plane through a point
  dragTarget(cx, cy, from, axis) {
    const T = this.T, rc = this.ray(cx, cy), o = rc.ray.origin, d = rc.ray.direction, P = new T.Vector3(...from);
    if (!axis) { const n = new T.Vector3(); this.cam.getWorldDirection(n); const pl = new T.Plane().setFromNormalAndCoplanarPoint(n, P), out = new T.Vector3(); return rc.ray.intersectPlane(pl, out) ? [out.x, out.y, out.z] : from; }
    const A = new T.Vector3(...axis).normalize(), w0 = o.clone().sub(P), a = d.dot(d), b = d.dot(A), c = A.dot(A), dd = d.dot(w0), ee = A.dot(w0), den = a * c - b * b; if (Math.abs(den) < 1e-6) return from;
    const t = (a * ee - b * dd) / den; return [P.x + A.x * t, P.y + A.y * t, P.z + A.z * t];
  }
  orbit(dx, dy) { this.camS.az -= dx * 0.008; this.camS.el = Math.min(1.5, Math.max(-0.25, this.camS.el + dy * 0.008)); this.render(); }
  pan(dx, dy) { const T = this.T, k = 2 * this.camS.dist * Math.tan(this.cam.fov * Math.PI / 360) / Math.max(1, this.canvas.clientHeight || 400), R = new T.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 0), U = new T.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 1); this.camS.tx -= (R.x * dx - U.x * dy) * k; this.camS.ty -= (R.y * dx - U.y * dy) * k; this.camS.tz -= (R.z * dx - U.z * dy) * k; this.render(); }
  zoom(f) { this.camS.dist = Math.min(2000, Math.max(90, this.camS.dist * f)); this.render(); }
}
