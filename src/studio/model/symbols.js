// Door swing geometry shared by the plan view and the DXF export.
import { add, mul, sub, cross } from './geometry.js';
export function doorSwing(w, o) {
  const s = o.flip ? -1 : 1, h = o.mirror ? o.pos + o.w / 2 : o.pos - o.w / 2, far = o.mirror ? o.pos - o.w / 2 : o.pos + o.w / 2;
  const H = add(w.a, mul(w.d, h)), J = add(w.a, mul(w.d, far)), Lf = add(H, mul(w.n, s * o.w));
  const a1 = Math.atan2(J[1] - H[1], J[0] - H[0]) * 180 / Math.PI, a2 = Math.atan2(Lf[1] - H[1], Lf[0] - H[0]) * 180 / Math.PI;
  const ccw = cross(sub(J, H), sub(Lf, H)) > 0;
  return { hinge: H, closed: J, open: Lf, r: o.w, start: ccw ? a1 : a2, end: ccw ? a2 : a1 };
}
