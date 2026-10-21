// The profile / sketch editor: drag control points, double-click to add one, Delete to remove. Values stay numbers or expressions.
import { sampleCurve, offsetCurve, resolveProfile, val } from './gen.js';
import { scopeOf } from './model.js';

export class Profile2D {
  constructor(el, app) {
    this.el = el; this.app = app; this.cam = { x: 40, y: 80, s: 2 }; this.sel = -1; this.drag = null; this.pan = null; this.dirty = true; this.w = 400; this.h = 400; this.hover = -1;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'st-canvas'; this.canvas.tabIndex = 0; el.appendChild(this.canvas); this.g = this.canvas.getContext('2d');
    this.msg = document.createElement('div'); this.msg.className = 'fg-pmsg'; el.appendChild(this.msg);
    this.resize(); if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el); }
    this._bind(); this._loop = () => { if (this.dirty) { this.dirty = false; this.draw(); } this.raf = requestAnimationFrame(this._loop); }; if (typeof requestAnimationFrame !== 'undefined') this.raf = requestAnimationFrame(this._loop);
  }
  destroy() { if (this.raf) cancelAnimationFrame(this.raf); if (this.ro) this.ro.disconnect(); }
  resize() { const r = this.el.getBoundingClientRect(); this.w = Math.max(100, r.width || 400); this.h = Math.max(100, r.height || 400); const d = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2); this.canvas.width = Math.round(this.w * d); this.canvas.height = Math.round(this.h * d); this.canvas.style.width = this.w + 'px'; this.canvas.style.height = this.h + 'px'; this.dpr = d; this.dirty = true; }
  gen() { return this.app.body.gen; }
  kind() { const g = this.gen(); return g.type === 'vessel' ? 'vessel' : (g.type === 'extrude' ? 'sketch' : null); }
  pts() { const g = this.gen(); return this.kind() === 'vessel' ? g.profile : g.sketch; }
  resolved() { const { values } = scopeOf(this.app.project); return this.kind() === 'vessel' ? resolveProfile(this.pts(), values) : this.pts().map((c) => ({ x: val(c.x, values, 0), y: val(c.y, values, 0), corner: !!c.corner })); }
  toScreen(p) { return [this.w / 2 + (p[0] - this.cam.x) * this.cam.s, this.h / 2 - (p[1] - this.cam.y) * this.cam.s]; }
  toWorld(sx, sy) { return [this.cam.x + (sx - this.w / 2) / this.cam.s, this.cam.y - (sy - this.h / 2) / this.cam.s]; }
  fit() {
    const k = this.kind(); if (!k) return; const P = this.resolved(); if (!P.length) return;
    let x0 = Math.min(...P.map((p) => p.x)), x1 = Math.max(...P.map((p) => p.x)), y0 = Math.min(...P.map((p) => p.y)), y1 = Math.max(...P.map((p) => p.y)); if (k === 'vessel') x0 = -x1 * 0.2;
    const pw = Math.max(x1 - x0, 10) * 1.3, ph = Math.max(y1 - y0, 10) * 1.3; this.cam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s: Math.min(this.w / pw, this.h / ph) }; this.dirty = true;
  }
  hitPoint(sx, sy) { const P = this.resolved(); let best = -1, bd = 10; P.forEach((p, i) => { const s = this.toScreen([p.x, p.y]), d = Math.hypot(s[0] - sx, s[1] - sy); if (d < bd) { bd = d; best = i; } }); return best; }
  gridStep() { for (const s of [1, 2, 5, 10, 20, 50, 100]) if (s * this.cam.s >= 12) return s; return 200; }
  snap(v, e) { if (e && e.shiftKey) return Math.round(v * 100) / 100; const g = Math.max(1, this.gridStep() / (this.gridStep() >= 10 ? 5 : 1)); return Math.round(v / g) * g; }
  edit(fn, key) { this.app.store.transact('Edit profile', (p) => { const b = p.bodies.find((x) => x.id === p.active); fn(this.kind() === 'vessel' ? b.gen.profile : b.gen.sketch, b.gen); }, { coalesce: key }); }
  setPoint(i, x, y) { const num = (v) => Math.round(v * 100) / 100; this.edit((P) => { P[i].x = this.kind() === 'vessel' ? Math.max(0, num(x)) : num(x); P[i].y = num(y); }, 'pt' + i + this.app.project.active); }
  insertAt(sx, sy) {
    const P = this.resolved(), w = this.toWorld(sx, sy); if (P.length < 1) return; let bi = P.length - 1, bd = 1e18; const closed = this.kind() === 'sketch', n = P.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) { const a = P[i], b = P[(i + 1) % n], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((w[0] - a.x) * dx + (w[1] - a.y) * dy) / l2)) : 0, d = Math.hypot(a.x + dx * t - w[0], a.y + dy * t - w[1]); if (d < bd) { bd = d; bi = i; } }
    const a = P[bi], b = P[(bi + 1) % n], at = bd * this.cam.s < 20 ? [a.x + (b.x - a.x) * 0.5, a.y + (b.y - a.y) * 0.5] : w;
    this.edit((L) => { L.splice(bi + 1, 0, { x: this.snap(at[0]), y: this.snap(at[1]), corner: false }); }); this.sel = bi + 1;
  }
  removePoint(i) { const min = this.kind() === 'vessel' ? 2 : 3; if (this.pts().length <= min) { this.app.ui.toast('A ' + (this.kind() === 'vessel' ? 'profile needs at least 2 points.' : 'sketch needs at least 3 points.')); return; } this.edit((L) => { L.splice(i, 1); }); this.sel = -1; }
  draw() {
    const g = this.g; if (!g) return; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); const css = getComputedStyle(this.el), ink = css.getPropertyValue('--ink').trim() || '#222', line = css.getPropertyValue('--line').trim() || '#ddd', acc = css.getPropertyValue('--acc').trim() || '#2851A3', bg = css.getPropertyValue('--card').trim() || '#fff';
    g.fillStyle = bg; g.fillRect(0, 0, this.w, this.h); const k = this.kind();
    if (!k) { this.msg.textContent = 'This body has no editable profile. Add points with the Design tab, or use Push/Pull in 3D.'; this.msg.hidden = false; return; } this.msg.hidden = true;
    const step = this.gridStep(), tl = this.toWorld(0, 0), br = this.toWorld(this.w, this.h); g.lineWidth = 1; g.strokeStyle = line;
    for (let x = Math.floor(tl[0] / step) * step; x <= br[0]; x += step) { const s = this.toScreen([x, 0])[0]; g.globalAlpha = x % (step * 5) === 0 ? 0.9 : 0.4; g.beginPath(); g.moveTo(s, 0); g.lineTo(s, this.h); g.stroke(); }
    for (let y = Math.floor(br[1] / step) * step; y <= tl[1]; y += step) { const s = this.toScreen([0, y])[1]; g.globalAlpha = y % (step * 5) === 0 ? 0.9 : 0.4; g.beginPath(); g.moveTo(0, s); g.lineTo(this.w, s); g.stroke(); } g.globalAlpha = 1;
    const o = this.toScreen([0, 0]); g.strokeStyle = ink; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(o[0], 0); g.lineTo(o[0], this.h); g.stroke(); g.beginPath(); g.moveTo(0, o[1]); g.lineTo(this.w, o[1]); g.stroke(); g.globalAlpha = 1;
    const P = this.resolved(), { values } = scopeOf(this.app.project), gen = this.gen(), ctrl = P.map((p) => ({ x: p.x, y: p.y, corner: p.corner }));
    const path = (L, close, mirror) => { g.beginPath(); L.forEach((p, i) => { const s = this.toScreen([mirror ? -p[0] : p[0], p[1]]); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); }); if (close) g.closePath(); };
    if (ctrl.length >= 2) {
      const Q = sampleCurve(ctrl, { smooth: k === 'vessel' ? gen.smooth !== false : gen.smooth === true, samples: Math.round(val(gen.samples, values, 48)), closed: k === 'sketch' });
      g.lineWidth = 2; g.strokeStyle = ink;
      if (k === 'vessel') { g.globalAlpha = 0.25; path(Q, false, true); g.stroke(); g.globalAlpha = 1; path(Q, false); g.stroke(); const t = val(gen.thickness, values, 0); if (t > 0) { g.setLineDash([5, 4]); g.strokeStyle = acc; path(offsetCurve(Q, t), false); g.stroke(); g.setLineDash([]); } }
      else { path(Q, true); g.fillStyle = acc; g.globalAlpha = 0.08; g.fill(); g.globalAlpha = 1; g.stroke(); }
      Q.forEach((q) => { const s = this.toScreen(q); g.fillStyle = ink; g.globalAlpha = 0.35; g.fillRect(s[0] - 1.5, s[1] - 1.5, 3, 3); g.globalAlpha = 1; });
    }
    P.forEach((p, i) => { const s = this.toScreen([p.x, p.y]); g.fillStyle = i === this.sel ? acc : bg; g.strokeStyle = i === this.sel ? acc : ink; g.lineWidth = 1.8; if (p.corner) { g.beginPath(); g.moveTo(s[0], s[1] - 6); g.lineTo(s[0] + 6, s[1]); g.lineTo(s[0], s[1] + 6); g.lineTo(s[0] - 6, s[1]); g.closePath(); g.fill(); g.stroke(); } else { g.beginPath(); g.arc(s[0], s[1], 5, 0, Math.PI * 2); g.fill(); g.stroke(); } if (i === this.hover || i === this.sel) { g.fillStyle = ink; g.font = '11px sans-serif'; g.fillText((Math.round(p.x * 10) / 10) + ', ' + (Math.round(p.y * 10) / 10) + ' mm', s[0] + 9, s[1] - 9); } });
  }
  _bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      c.focus(); try { c.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ } const r = c.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (e.button === 1 || e.button === 2) { this.pan = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y }; return; }
      if (!this.kind()) return; const h = this.hitPoint(sx, sy); this.sel = h; if (h >= 0) this.drag = { i: h }; this.app.ui.refresh(); this.dirty = true;
    });
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (this.pan) { this.cam.x = this.pan.cx - (e.clientX - this.pan.x) / this.cam.s; this.cam.y = this.pan.cy + (e.clientY - this.pan.y) / this.cam.s; this.dirty = true; return; }
      if (this.drag) { const w = this.toWorld(sx, sy); this.setPoint(this.drag.i, this.snap(w[0], e), this.snap(w[1], e)); return; }
      const h = this.kind() ? this.hitPoint(sx, sy) : -1; if (h !== this.hover) { this.hover = h; this.dirty = true; }
    });
    c.addEventListener('pointerup', () => { this.drag = null; this.pan = null; });
    c.addEventListener('dblclick', (e) => { if (!this.kind()) return; const r = c.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top, h = this.hitPoint(sx, sy); if (h >= 0) { this.edit((L) => { L[h].corner = !L[h].corner; }); } else this.insertAt(sx, sy); });
    c.addEventListener('keydown', (e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel >= 0) { this.removePoint(this.sel); e.preventDefault(); } else if (e.key === 'c' && this.sel >= 0) { const i = this.sel; this.edit((L) => { L[i].corner = !L[i].corner; }); } else if (e.key === 'f' || e.key === 'Home') this.fit(); });
    c.addEventListener('wheel', (e) => { e.preventDefault(); const r = c.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, b = this.toWorld(sx, sy); this.cam.s = Math.max(0.2, Math.min(80, this.cam.s * Math.exp(-e.deltaY * 0.0015))); const a = this.toWorld(sx, sy); this.cam.x += b[0] - a[0]; this.cam.y += b[1] - a[1]; this.dirty = true; }, { passive: false });
  }
}
