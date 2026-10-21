// Kiln profile sketch: half-section with driving dimensions, lock glyphs, fill line, centre of mass and tipping angle.
import { isExpr } from './model.js';
export class KilnSketch {
  constructor(host) { this.host = host; this.canvas = document.createElement('canvas'); this.canvas.className = 'kn-canvas'; this.canvas.style.touchAction = 'none'; host.appendChild(this.canvas); this.hits = []; this.pts = []; }
  geom(e) {
    const w = this.host.clientWidth || 600, h = this.host.clientHeight || 420, a = e.a, H = Math.max(a.height, 10), R = a.maxD / 2 + 4;
    const s = Math.min((w - 150) / (2 * R), (h - 110) / H), cx = w / 2 + 20, by = h - 58;
    return { w, h, s, X: (r) => cx + r * s, Y: (z) => by - z * s, R: (x) => (x - cx) / s, Z: (y) => (by - y) / s, cx, by };
  }
  draw(doc, e, sel, limit, colors) {
    const c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1), g = this.geom(e); c.width = g.w * dpr; c.height = g.h * dpr; c.style.width = g.w + 'px'; c.style.height = g.h + 'px';
    const x = c.getContext('2d'); if (!x || !x.setTransform) return; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, g.w, g.h); this.hits = []; this.pts = [];
    const { ink, ink2, line, acc, water } = colors, a = e.a, U = e.U, M = e.M, P = e.P, I = e.solid.inner, j0 = e.solid.floorRow;
    // grid
    x.strokeStyle = line; x.lineWidth = 1; x.globalAlpha = 0.5; for (let z = 0; z <= a.height + 1; z += 20) { x.beginPath(); x.moveTo(g.X(-a.maxD / 2 - 4), g.Y(z)); x.lineTo(g.X(a.maxD / 2 + 4), g.Y(z)); x.stroke(); } x.globalAlpha = 1;
    // envelope (both sides, light) and the true wall section on the right
    const env = []; for (let j = 0; j <= M; j++) { let m = 0; for (let i = 0; i < U; i++) { const q = (j * U + i) * 3; m = Math.max(m, Math.hypot(P[q], P[q + 1])); } env.push([m, P[(j * U) * 3 + 2]]); }
    x.strokeStyle = ink2; x.lineWidth = 1.2; x.beginPath(); env.forEach((p, i) => (i ? x.lineTo(g.X(-p[0]), g.Y(p[1])) : x.moveTo(g.X(-p[0]), g.Y(p[1])))); x.stroke();
    const so = [], si = []; for (let j = 0; j <= M; j++) { const q = (j * U) * 3; so.push([Math.hypot(P[q], P[q + 1]), P[q + 2]]); if (j >= j0) si.push([Math.hypot(I[q], I[q + 1]), I[q + 2]]); }
    x.beginPath(); so.forEach((p, i) => (i ? x.lineTo(g.X(p[0]), g.Y(p[1])) : x.moveTo(g.X(p[0]), g.Y(p[1])))); si.slice().reverse().forEach((p) => x.lineTo(g.X(p[0]), g.Y(p[1]))); x.lineTo(g.X(0), g.Y(e.solid.floorZ)); x.lineTo(g.X(0), g.Y(0)); x.closePath();
    x.fillStyle = acc; x.globalAlpha = 0.16; x.fill(); x.globalAlpha = 1; x.strokeStyle = ink; x.lineWidth = 1.6; x.stroke();
    // lean check along the outer profile: red where it leans past the limit
    for (let j = 1; j < M; j++) { const q = (j * U) * 3, nz = Math.abs(e.N[q + 2]), lean = Math.asin(Math.min(1, nz)) * 180 / Math.PI; if (lean > limit) { x.strokeStyle = '#d64545'; x.lineWidth = 3.5; x.beginPath(); x.moveTo(g.X(so[j][0]), g.Y(so[j][1])); x.lineTo(g.X(so[j + 1][0]), g.Y(so[j + 1][1])); x.stroke(); } }
    // axis
    x.setLineDash([10, 3, 2, 3]); x.strokeStyle = ink2; x.lineWidth = 1; x.beginPath(); x.moveTo(g.X(0), g.Y(-8)); x.lineTo(g.X(0), g.Y(a.height + 12)); x.stroke(); x.setLineDash([]);
    // fill line
    let fr = 0; si.forEach((p) => { if (p[1] <= a.fillZ) fr = p[0]; }); x.setLineDash([5, 3]); x.strokeStyle = water; x.lineWidth = 1.5; x.beginPath(); x.moveTo(g.X(-fr), g.Y(a.fillZ)); x.lineTo(g.X(fr), g.Y(a.fillZ)); x.stroke(); x.setLineDash([]);
    x.fillStyle = water; x.font = '12px system-ui,sans-serif'; x.textAlign = 'left'; x.fillText(Math.round(a.capacity) + ' ml', g.X(fr) + 6, g.Y(a.fillZ) - 4);
    // centre of mass (filled) and tipping angle to the foot edge
    const cz = a.comFilled[2], footR = a.baseD / 2; x.fillStyle = water; x.beginPath(); x.arc(g.X(0), g.Y(cz), 5, 0, 6.283); x.fill();
    x.strokeStyle = water; x.lineWidth = 1; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(g.X(0), g.Y(cz)); x.lineTo(g.X(-footR), g.Y(0)); x.stroke(); x.setLineDash([]);
    x.fillText('tip ' + a.tipFilled.toFixed(1) + '°', g.X(-footR) + 4, g.Y(0) - 8);
    // control points of the sketch (right side)
    const pts = doc.profile, Dp = e.Dpts || [];
    x.strokeStyle = acc; x.lineWidth = 1; x.setLineDash([4, 4]); x.beginPath(); Dp.forEach((p, i) => (i ? x.lineTo(g.X(p.r), g.Y(p.z)) : x.moveTo(g.X(p.r), g.Y(p.z)))); x.stroke(); x.setLineDash([]);
    Dp.forEach((p, i) => {
      const px = g.X(p.r), py = g.Y(p.z), src = pts[i], drivenR = isExpr(src.r) || src.lockR, drivenZ = isExpr(src.z) || src.lockZ || i === 0, s = i === sel ? 7 : 5.5;
      x.fillStyle = i === sel ? acc : colors.card; x.strokeStyle = acc; x.lineWidth = 2;
      if (drivenR && drivenZ) { x.fillRect(px - s, py - s, 2 * s, 2 * s); x.strokeRect(px - s, py - s, 2 * s, 2 * s); } else { x.beginPath(); x.arc(px, py, s, 0, 6.283); x.fill(); x.stroke(); }
      if (drivenR !== drivenZ) { x.beginPath(); if (drivenZ) { x.moveTo(px - 10, py); x.lineTo(px + 10, py); } else { x.moveTo(px, py - 10); x.lineTo(px, py + 10); } x.stroke(); }
      if (isExpr(src.r) || isExpr(src.z)) { x.fillStyle = acc; x.font = 'italic 12px serif'; x.fillText('ƒ', px + 9, py - 7); }
      this.pts.push({ i, x: px, y: py });
    });
    // driving dimensions
    x.font = '12px system-ui,sans-serif'; x.strokeStyle = ink; x.fillStyle = ink; x.lineWidth = 1;
    const box = (label, tx, ty, kind, align = 'center') => { x.textAlign = align; const m = x.measureText(label).width + 10, bx = align === 'center' ? tx - m / 2 : align === 'right' ? tx - m : tx; x.fillStyle = colors.card; x.fillRect(bx, ty - 13, m, 18); x.strokeStyle = acc; x.strokeRect(bx, ty - 13, m, 18); x.fillStyle = ink; x.fillText(label, align === 'center' ? tx : align === 'right' ? tx - 5 : tx + 5, ty); this.hits.push({ kind, x: bx, y: ty - 13, w: m, h: 18 }); x.strokeStyle = ink; };
    const arrowsH = (y, r) => { x.beginPath(); x.moveTo(g.X(-r), y); x.lineTo(g.X(r), y); x.moveTo(g.X(-r), y - 5); x.lineTo(g.X(-r), y + 5); x.moveTo(g.X(r), y - 5); x.lineTo(g.X(r), y + 5); x.stroke(); };
    const hx = g.X(-a.maxD / 2) - 28; x.beginPath(); x.moveTo(hx, g.Y(0)); x.lineTo(hx, g.Y(a.height)); x.moveTo(hx - 5, g.Y(0)); x.lineTo(hx + 5, g.Y(0)); x.moveTo(hx - 5, g.Y(a.height)); x.lineTo(hx + 5, g.Y(a.height)); x.stroke(); box(a.height.toFixed(1), hx, (g.Y(0) + g.Y(a.height)) / 2 + 4, 'height');
    arrowsH(g.Y(a.height) - 18, a.rimD / 2); box('Ø' + a.rimD.toFixed(1) + ' rim', g.X(0), g.Y(a.height) - 24, 'rim');
    arrowsH(g.Y(0) + 22, a.baseD / 2); box('Ø' + a.baseD.toFixed(1) + ' foot', g.X(0), g.Y(0) + 40, 'foot');
    let bi = 0; Dp.forEach((p, i) => { if (p.r > Dp[bi].r) bi = i; }); const bp = Dp[bi]; if (bp) { x.beginPath(); x.moveTo(g.X(-bp.r), g.Y(bp.z)); x.lineTo(g.X(bp.r), g.Y(bp.z)); x.stroke(); box('Ø' + (2 * bp.r).toFixed(1), g.X(bp.r) + 12, g.Y(bp.z) + 4, 'belly', 'left'); this.bellyIndex = bi; }
    if (sel != null && Dp[sel]) { const p = Dp[sel]; x.fillStyle = ink2; x.textAlign = 'left'; x.fillText('r ' + p.r.toFixed(1) + '   z ' + p.z.toFixed(1), g.X(p.r) + 12, g.Y(p.z) + 18); }
    this.g = g;
  }
  hitPoint(px, py) { let best = -1, bd = 22; this.pts.forEach((p) => { const d = Math.hypot(p.x - px, p.y - py); if (d < bd) { bd = d; best = p.i; } }); return best; }
  hitDim(px, py) { const h = this.hits.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h); return h ? h.kind : null; }
}
