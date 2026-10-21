// A small 2D editor for a sketch: shows the profile on its plane and lets you drag the points of a spline or polyline.
export function drawSketch(canvas, loop, closed, pts, hot) {
  const g = canvas.getContext && canvas.getContext('2d'); if (!g) return null;
  const W = canvas.width, H = canvas.height; g.clearRect(0, 0, W, H);
  const all = (loop || []).concat((pts || []).map((p) => [p[0], p[1]])); let x0 = -50, y0 = -10, x1 = 50, y1 = 100;
  if (all.length) { x0 = Math.min(...all.map((p) => p[0])); x1 = Math.max(...all.map((p) => p[0])); y0 = Math.min(...all.map((p) => p[1])); y1 = Math.max(...all.map((p) => p[1])); }
  x0 = Math.min(x0, 0); y0 = Math.min(y0, 0); const span = Math.max(x1 - x0, y1 - y0, 20) * 1.2, k = Math.min(W, H) / span, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const S = (p) => [W / 2 + (p[0] - cx) * k, H / 2 - (p[1] - cy) * k];
  g.strokeStyle = 'rgba(128,128,128,.25)'; g.lineWidth = 1; const step = span > 200 ? 50 : span > 80 ? 20 : 10;
  for (let x = Math.floor((cx - span) / step) * step; x < cx + span; x += step) { const s = S([x, 0])[0]; g.beginPath(); g.moveTo(s, 0); g.lineTo(s, H); g.stroke(); }
  for (let y = Math.floor((cy - span) / step) * step; y < cy + span; y += step) { const s = S([0, y])[1]; g.beginPath(); g.moveTo(0, s); g.lineTo(W, s); g.stroke(); }
  g.strokeStyle = 'rgba(128,128,128,.6)'; const o = S([0, 0]); g.beginPath(); g.moveTo(o[0], 0); g.lineTo(o[0], H); g.moveTo(0, o[1]); g.lineTo(W, o[1]); g.stroke();
  if (loop && loop.length > 1) { g.strokeStyle = '#1f6fb5'; g.lineWidth = 2; g.beginPath(); loop.forEach((p, i) => { const s = S(p); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); }); if (closed) g.closePath(); g.stroke(); }
  (pts || []).forEach((p, i) => { const s = S(p); g.fillStyle = i === hot ? '#e24b4a' : '#fff'; g.strokeStyle = '#e24b4a'; g.lineWidth = 2; g.beginPath(); g.arc(s[0], s[1], 5, 0, Math.PI * 2); g.fill(); g.stroke(); });
  return { S, inv: (sx, sy) => [cx + (sx - W / 2) / k, cy - (sy - H / 2) / k], k };
}
