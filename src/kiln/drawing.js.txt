// Engineering drawing, A4 landscape, millimetres: half-section elevation, top view, dimensions, constraint table, title block.
import { logoSVG } from './logo.js';
import { CTYPES, constraintStatus } from './model.js';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
export function drawingSVG(doc, e, opt = {}) {
  const a = e.a, U = e.U, M = e.M, P = e.P, I = e.solid.inner, j0 = e.solid.floorRow, H = a.height, R = a.maxD / 2;
  const scales = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10], sc = scales.find((s) => H / s <= 128 && (2 * R) / s <= 120) || 10, k = 1 / sc;
  const ox = 82, oy = 158; const X = (r) => ox + r * k, Y = (z) => oy - z * k;
  const out = [], T = (x, y, s, size = 3, anchor = 'middle', extra = '') => out.push('<text x="' + f1(x) + '" y="' + f1(y) + '" font-size="' + size + '" text-anchor="' + anchor + '" ' + extra + '>' + esc(s) + '</text>');
  const L = (x1, y1, x2, y2, cls = 'v') => out.push('<line class="' + cls + '" x1="' + f1(x1) + '" y1="' + f1(y1) + '" x2="' + f1(x2) + '" y2="' + f1(y2) + '"/>');
  // envelope silhouette (left half) and the true section at angle 0 (right half)
  const env = [], so = [], si = [];
  for (let j = 0; j <= M; j++) { let m = 0; for (let i = 0; i < U; i++) { const q = (j * U + i) * 3; m = Math.max(m, Math.hypot(P[q], P[q + 1])); } env.push([m, P[(j * U) * 3 + 2]]); const q = (j * U) * 3; so.push([Math.hypot(P[q], P[q + 1]), P[q + 2]]); if (j >= j0) si.push([Math.hypot(I[q], I[q + 1]), I[q + 2]]); }
  const path = (pts, fx) => pts.map((p, i) => (i ? 'L' : 'M') + f1(fx(p[0])) + ' ' + f1(Y(p[1]))).join(' ');
  out.push('<path class="v" d="' + path(env, (r) => X(-r)) + ' L' + f1(X(0)) + ' ' + f1(Y(env[M][1])) + '"/>');
  out.push('<path class="v" d="M' + f1(X(-env[0][0])) + ' ' + f1(Y(0)) + ' L' + f1(X(0)) + ' ' + f1(Y(0)) + '"/>');
  const wall = so.map((p) => [X(p[0]), Y(p[1])]).concat(si.slice().reverse().map((p) => [X(p[0]), Y(p[1])]), [[X(0), Y(e.solid.floorZ)], [X(0), Y(0)]]);
  out.push('<path class="cut" d="' + wall.map((p, i) => (i ? 'L' : 'M') + f1(p[0]) + ' ' + f1(p[1])).join(' ') + ' Z"/>');
  out.push('<path class="v" d="' + path(si, X) + '"/>');
  L(X(0), Y(-6), X(0), Y(H + 8), 'c');
  // fill line
  const fz = a.fillZ; let fr = 0; for (const p of si) if (p[1] <= fz) fr = p[0]; L(X(0), Y(fz), X(fr), Y(fz), 'w'); T(X(fr) + 2, Y(fz) - 1, 'Fill line, ' + Math.round(a.capacity) + ' ml', 2.6, 'start', 'fill="#1f6fb2"');
  // dimensions
  const dimV = (x, z1, z2, label) => { L(x, Y(z1), x, Y(z2), 'd'); L(x - 1.5, Y(z1), x + 1.5, Y(z1), 'd'); L(x - 1.5, Y(z2), x + 1.5, Y(z2), 'd'); T(x - 2, (Y(z1) + Y(z2)) / 2, label, 3, 'middle', 'transform="rotate(-90 ' + f1(x - 2) + ' ' + f1((Y(z1) + Y(z2)) / 2) + ')"'); };
  const dimH = (y, r, label) => { L(X(-r), y, X(r), y, 'd'); L(X(-r), y - 1.5, X(-r), y + 1.5, 'd'); L(X(r), y - 1.5, X(r), y + 1.5, 'd'); T(X(0) + 1, y - 1.2, label, 3, 'start'); };
  dimV(X(-R) - 10, 0, H, f1(H));
  dimH(Y(H) - 7, a.rimD / 2, 'Ø' + f1(a.rimD) + ' rim inside');
  dimH(Y(0) + 8, a.baseD / 2, 'Ø' + f1(a.baseD) + ' foot');
  let bz = 0, br = 0; env.forEach((p) => { if (p[0] > br) { br = p[0]; bz = p[1]; } }); L(X(-br), Y(bz), X(br), Y(bz), 'd'); T(X(-br) + 2, Y(bz) - 1.4, 'Ø' + f1(2 * br), 3, 'start');
  const wy = Y(H * 0.55); let wr = 0; for (const p of so) if (p[1] <= H * 0.55) wr = p[0]; L(X(wr) + 0.5, wy, X(wr) + 14, wy - 8, 'd'); T(X(wr) + 14.5, wy - 8.5, 'Wall ' + f1(a.wall) + ', floor ' + f1(e.solid.floorZ), 2.6, 'start');
  T(ox, 16, 'HALF SECTION A-A   SCALE 1:' + sc, 3.4, 'middle', 'font-weight="700"');
  // top view
  const tx = 222, ty = 62, ring = (j, arr, cls) => { const pts = []; for (let i = 0; i <= U; i++) { const q = (j * U + i % U) * 3; pts.push((i ? 'L' : 'M') + f1(tx + arr[q] * k) + ' ' + f1(ty - arr[q + 1] * k)); } out.push('<path class="' + cls + '" d="' + pts.join(' ') + '"/>'); };
  let bj = 0, bm = 0; for (let j = 0; j <= M; j++) { const q = (j * U) * 3; const r = Math.hypot(P[q], P[q + 1]); if (r > bm) { bm = r; bj = j; } }
  ring(bj, P, 'h'); ring(0, P, 'h'); ring(M, P, 'v'); ring(M, I, 'v');
  L(tx - R * k - 4, ty, tx + R * k + 4, ty, 'c'); L(tx, ty - R * k - 4, tx, ty + R * k + 4, 'c');
  T(tx, 16, 'TOP VIEW   SCALE 1:' + sc, 3.4, 'middle', 'font-weight="700"');
  // constraints table
  let cy = 104; T(170, cy, 'ENGINEERING CONSTRAINTS', 3, 'start', 'font-weight="700"'); cy += 5;
  (doc.constraints || []).filter((c) => c.on).forEach((c) => { const st = constraintStatus(c, a), Ty = CTYPES[c.type]; T(170, cy, Ty.label + ' ' + c.op.replace('<=', '≤').replace('>=', '≥') + ' ' + c.value + ' ' + Ty.unit, 2.7, 'start'); T(246, cy, Ty.fmt(st.v), 2.7, 'end'); T(250, cy, st.ok ? 'OK' : 'FAIL', 2.7, 'start', 'font-weight="700" fill="' + (st.ok ? '#2e7d32' : '#c62828') + '"'); cy += 4.4; });
  // title block
  const bx = 170, by = 160; out.push('<rect class="v" x="' + bx + '" y="' + by + '" width="117" height="40"/>'); L(bx, by + 14, bx + 117, by + 14, 'v'); L(bx + 58, by + 14, bx + 58, by + 40, 'v'); L(bx, by + 27, bx + 117, by + 27, 'v');
  out.push('<g transform="translate(' + (bx + 2) + ' ' + (by + 2) + ') scale(0.16)">' + logoSVG(64).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</g>');
  T(bx + 15, by + 7.2, 'KILN', 5, 'start', 'font-weight="800" letter-spacing="0.6"'); T(bx + 15, by + 11.5, 'constraint-driven vessel CAD', 2.4, 'start', 'fill="#555"');
  T(bx + 115, by + 7.2, doc.name || 'Untitled', 3.6, 'end', 'font-weight="700"'); T(bx + 115, by + 11.5, new Date(opt.date || Date.now()).toISOString().slice(0, 10), 2.4, 'end', 'fill="#555"');
  T(bx + 2, by + 19, 'Material', 2.2, 'start', 'fill="#555"'); T(bx + 2, by + 24, doc.material + ', ' + Math.round(a.mass) + ' g', 3, 'start');
  T(bx + 60, by + 19, 'Capacity at fill line', 2.2, 'start', 'fill="#555"'); T(bx + 60, by + 24, Math.round(a.capacity) + ' ml', 3, 'start');
  T(bx + 2, by + 32, 'Scale', 2.2, 'start', 'fill="#555"'); T(bx + 2, by + 37.5, '1:' + sc + '   Units: mm', 3, 'start');
  T(bx + 60, by + 32, 'Sheet', 2.2, 'start', 'fill="#555"'); T(bx + 60, by + 37.5, '1 of 1   A4', 3, 'start');
  const css = '<style>.v{fill:none;stroke:#111;stroke-width:0.35}.h{fill:none;stroke:#111;stroke-width:0.25;stroke-dasharray:1.6 1}.c{stroke:#555;stroke-width:0.18;stroke-dasharray:6 1.2 1 1.2}.d{stroke:#1a1a1a;stroke-width:0.18}.w{stroke:#1f6fb2;stroke-width:0.3;stroke-dasharray:2 1}.cut{fill:url(#hatch);stroke:#111;stroke-width:0.35}text{font-family:Helvetica,Arial,sans-serif;fill:#111}</style>';
  const defs = '<defs><pattern id="hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2" stroke="#333" stroke-width="0.25"/></pattern></defs>';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210">' + css + defs + '<rect x="0" y="0" width="297" height="210" fill="#fff"/><rect class="v" x="8" y="8" width="281" height="194"/>' + out.join('') + '</svg>';
}
