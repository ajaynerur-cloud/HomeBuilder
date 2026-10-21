// Non-destructive field deformers. Each one moves vertices as a function of position, so topology and keys never change.
import { val } from './gen.js';
import { subdivide } from './mesh.js';

const smooth = (t) => t * t * (3 - 2 * t), clamp01 = (t) => Math.max(0, Math.min(1, t));
const ease = (t, kind) => (kind === 'smooth' ? smooth(clamp01(t)) : clamp01(t));
function bbox(m) { const mn = [1e18, 1e18, 1e18], mx = [-1e18, -1e18, -1e18]; m.v.forEach((v) => v.p.forEach((c, i) => { if (c < mn[i]) mn[i] = c; if (c > mx[i]) mx[i] = c; })); return { mn, mx }; }

export function sectionScale(shape, th, o) {
  const n = Math.max(2, Math.round(o.n));
  if (shape === 'polygon') { const a = 2 * Math.PI / n, d = ((((th % a) + a) % a) - a / 2); const s = Math.cos(Math.PI / n) / Math.cos(d); return 1 + (s - 1) * (1 - o.round); }
  if (shape === 'lobes') return 1 + o.depth * Math.cos(n * th);
  if (shape === 'super') { const p = Math.max(1.2, o.power), s = Math.pow(Math.pow(Math.abs(Math.cos(th)), p) + Math.pow(Math.abs(Math.sin(th)), p), -1 / p); return s; }
  return 1;
}

export const MOD_TYPES = {
  section: { label: 'Cross-section', defaults: { shape: 'polygon', n: 6, depth: 0.12, round: 0.2, power: 4, amount0: 1, amount1: 1 } },
  twist: { label: 'Twist', defaults: { deg: 90, easing: 'linear' } },
  taper: { label: 'Taper', defaults: { top: 0.7, bottom: 1, easing: 'linear' } },
  bend: { label: 'Bend', defaults: { deg: 30 } },
  ripple: { label: 'Ripple', defaults: { amp: 3, freq: 6, lobes: 0, phase: 0 } },
  scale: { label: 'Scale', defaults: { sx: 1, sy: 1, sz: 1 } },
  smooth: { label: 'Smooth (subdivide)', defaults: { level: 1 } },
};

export function applyMod(m, mod, scope) {
  const g = (k, fb) => val(mod[k], scope, fb);
  if (mod.type === 'smooth') { let r = m; for (let i = 0; i < Math.max(0, Math.min(3, Math.round(g('level', 1)))); i++) r = subdivide(r); return r; }
  const { mn, mx } = bbox(m), H = (mx[2] - mn[2]) || 1, cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2;
  m.v.forEach((v) => {
    const p = v.p, t = (p[2] - mn[2]) / H;
    if (mod.type === 'twist') { const a = g('deg', 0) * ease(t, mod.easing) * Math.PI / 180, x = p[0] - cx, y = p[1] - cy; p[0] = cx + x * Math.cos(a) - y * Math.sin(a); p[1] = cy + x * Math.sin(a) + y * Math.cos(a); }
    else if (mod.type === 'taper') { const k = g('bottom', 1) + (g('top', 1) - g('bottom', 1)) * ease(t, mod.easing); p[0] = cx + (p[0] - cx) * k; p[1] = cy + (p[1] - cy) * k; }
    else if (mod.type === 'scale') { p[0] = cx + (p[0] - cx) * g('sx', 1); p[1] = cy + (p[1] - cy) * g('sy', 1); p[2] = mn[2] + (p[2] - mn[2]) * g('sz', 1); }
    else if (mod.type === 'ripple') { const x = p[0] - cx, y = p[1] - cy, r = Math.hypot(x, y); if (r > 1e-9) { const th = Math.atan2(y, x), d = g('amp', 0) * Math.sin(2 * Math.PI * g('freq', 0) * t + Math.round(g('lobes', 0)) * th + g('phase', 0) * Math.PI / 180); p[0] += (x / r) * d; p[1] += (y / r) * d; } }
    else if (mod.type === 'section') {
      const x = p[0] - cx, y = p[1] - cy, r = Math.hypot(x, y); if (r > 1e-9) {
        const th = Math.atan2(y, x), o = { n: g('n', 6), depth: g('depth', 0.1), round: Math.max(0, Math.min(1, g('round', 0))), power: g('power', 4) };
        const amt = g('amount0', 1) + (g('amount1', 1) - g('amount0', 1)) * smooth(clamp01(t)), s = 1 + (sectionScale(mod.shape || 'polygon', th, o) - 1) * amt;
        p[0] = cx + x * s; p[1] = cy + y * s;
      }
    } else if (mod.type === 'bend') {
      const tot = g('deg', 0) * Math.PI / 180; if (Math.abs(tot) > 1e-6) { const R = H / tot, ph = tot * t, x = p[0] - cx; p[0] = cx + R - (R - x) * Math.cos(ph); p[2] = mn[2] + (R - x) * Math.sin(ph); }
    }
  });
  return m;
}
export function applyMods(m, mods, scope) { let r = m; (mods || []).forEach((mod) => { if (mod.on !== false) r = applyMod(r, mod, scope); }); return r; }
