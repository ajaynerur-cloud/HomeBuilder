// Turns a distance field into a closed triangle mesh with marching tetrahedra. Each cube is split the same way in every cell,
// so the surface is always watertight and manifold. Vertices are then moved onto the true surface for a smooth result.
const KUHN = [[0, 1, 2, 6], [0, 1, 5, 6], [0, 3, 2, 6], [0, 3, 7, 6], [0, 4, 5, 6], [0, 4, 7, 6]];
const CORNER = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];

export function meshField(f, bb, res = 64, o = {}) {
  const ext = [bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]], h = Math.max(...ext) / res;
  const nx = Math.max(2, Math.ceil(ext[0] / h)), ny = Math.max(2, Math.ceil(ext[1] / h)), nz = Math.max(2, Math.ceil(ext[2] / h));
  const sx = nx + 1, sy = ny + 1, sz = nz + 1, N = sx * sy * sz, V = new Float32Array(N), x0 = bb[0], y0 = bb[1], z0 = bb[2];
  let boundaryInside = false;
  // Sample in blocks of 4 cells. If the block's centre is far from the surface (more than 3 half-diagonals) the whole block is on one side.
  const B = 4, far = 3 * B * 0.87 * h;
  for (let bk = 0; bk < sz; bk += B) for (let bj = 0; bj < sy; bj += B) for (let bi = 0; bi < sx; bi += B) {
    const ek = Math.min(bk + B, sz - 1 + (bk + B >= sz ? 1 : 0)), ej = Math.min(bj + B, sy - 1 + (bj + B >= sy ? 1 : 0)), ei = Math.min(bi + B, sx - 1 + (bi + B >= sx ? 1 : 0));
    const cv = f(x0 + Math.min(nx, bi + B / 2) * h, y0 + Math.min(ny, bj + B / 2) * h, z0 + Math.min(nz, bk + B / 2) * h), skip = Math.abs(cv) > far && bi > 0 && bj > 0 && bk > 0 && bi + B < nx && bj + B < ny && bk + B < nz;
    for (let k = bk; k < ek; k++) for (let j = bj; j < ej; j++) for (let i = bi; i < ei; i++) {
      let v = skip ? cv : f(x0 + i * h, y0 + j * h, z0 + k * h); if (v === 0) v = 1e-7; V[(k * sy + j) * sx + i] = v;
      if (v < 0 && (i === 0 || j === 0 || k === 0 || i === nx || j === ny || k === nz)) boundaryInside = true;
    }
  }
  const pos = [], tri = [], edge = new Map();
  const P = (gi) => { const i = gi % sx, j = Math.floor(gi / sx) % sy, k = Math.floor(gi / (sx * sy)); return [x0 + i * h, y0 + j * h, z0 + k * h]; };
  const vert = (a, b) => {
    const key = a < b ? a * N + b : b * N + a; let id = edge.get(key); if (id !== undefined) return id;
    const fa = V[a], fb = V[b], t = Math.min(0.98, Math.max(0.02, fa / (fa - fb))), pa = P(a), pb = P(b);   // never land on a lattice point: keeps vertices distinct
    id = pos.length / 3; pos.push(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t); edge.set(key, id); return id;
  };
  const gi = new Int32Array(8), fv = new Float32Array(8);
  const emit = (a, b, c, inC, outC) => {
    const A = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]], B = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]], C = [pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]];
    const nx_ = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]), ny_ = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]), nz_ = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    const dot = nx_ * (outC[0] - inC[0]) + ny_ * (outC[1] - inC[1]) + nz_ * (outC[2] - inC[2]);
    if (dot >= 0) tri.push(a, b, c); else tri.push(a, c, b);
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let neg = 0; for (let c = 0; c < 8; c++) { const g = ((k + CORNER[c][2]) * sy + (j + CORNER[c][1])) * sx + (i + CORNER[c][0]); gi[c] = g; fv[c] = V[g]; if (fv[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    for (let t = 0; t < 6; t++) {
      const q = KUHN[t], ins = [], out = [];
      for (let m = 0; m < 4; m++) (fv[q[m]] < 0 ? ins : out).push(q[m]);
      if (!ins.length || !out.length) continue;
      const pt = (c) => { const g = gi[c]; return P(g); };
      const avg = (L) => { const s = [0, 0, 0]; L.forEach((c) => { const p = pt(c); s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }); return [s[0] / L.length, s[1] / L.length, s[2] / L.length]; };
      if (ins.length === 1) { const a = ins[0]; emit(vert(gi[a], gi[out[0]]), vert(gi[a], gi[out[1]]), vert(gi[a], gi[out[2]]), avg(ins), avg(out)); }
      else if (out.length === 1) { const a = out[0]; emit(vert(gi[a], gi[ins[0]]), vert(gi[a], gi[ins[1]]), vert(gi[a], gi[ins[2]]), avg(ins), avg(out)); }
      else {
        const [i0, i1] = ins, [o0, o1] = out, a = vert(gi[i0], gi[o0]), b = vert(gi[i0], gi[o1]), c = vert(gi[i1], gi[o1]), d = vert(gi[i1], gi[o0]);
        emit(a, b, c, avg(ins), avg(out)); emit(a, c, d, avg(ins), avg(out));
      }
    }
  }
  const P3 = Float64Array.from(pos);
  if (o.project !== false) {
    const e = h * 0.3, its = o.iters || (res >= 96 ? 1 : 2);
    for (let it = 0; it < its; it++) for (let v = 0; v < P3.length; v += 3) {
      const x = P3[v], y = P3[v + 1], z = P3[v + 2], d = f(x, y, z);
      const gx = (f(x + e, y, z) - d) / e, gy = (f(x, y + e, z) - d) / e, gz = (f(x, y, z + e) - d) / e, g2 = gx * gx + gy * gy + gz * gz;
      if (g2 < 1e-10) continue; const k = d / g2, dx = gx * k, dy = gy * k, dz = gz * k;
      if (dx * dx + dy * dy + dz * dz > (h * 0.75) * (h * 0.75)) continue;
      P3[v] = x - dx; P3[v + 1] = y - dy; P3[v + 2] = z - dz;
    }
  }
  return { V: P3, T: Uint32Array.from(tri), h, bb, open: boundaryInside, dims: [nx, ny, nz] };
}

export function toTris(m) { const o = new Array(m.T.length * 3); for (let i = 0; i < m.T.length; i++) { const v = m.T[i] * 3; o[i * 3] = m.V[v]; o[i * 3 + 1] = m.V[v + 1]; o[i * 3 + 2] = m.V[v + 2]; } return o; }
export function meshVolume(m) {
  let s = 0; for (let i = 0; i < m.T.length; i += 3) { const a = m.T[i] * 3, b = m.T[i + 1] * 3, c = m.T[i + 2] * 3, V = m.V; s += (V[a] * (V[b + 1] * V[c + 2] - V[c + 1] * V[b + 2]) - V[a + 1] * (V[b] * V[c + 2] - V[c] * V[b + 2]) + V[a + 2] * (V[b] * V[c + 1] - V[c] * V[b + 1])) / 6; } return s;
}
export function meshBounds(m) { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < m.V.length; i += 3) for (let a = 0; a < 3; a++) { const v = m.V[i + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; } return [mn, mx]; }
