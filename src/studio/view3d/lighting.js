// Lighting for the 3D view: presets, a sun that follows the time of day, soft shadows, tone mapping, ground and sky.
// "basic" is the original flat look. The other presets switch the scene to physically based materials with a
// linear colour workflow so the result reads as a render rather than a diagram.
import { detectRooms } from '../model/rooms.js';

export const PRESETS = {
  basic: { label: 'Basic (flat)', realistic: false, mode: 'edges', time: 13, north: 0, sun: 0.65, ambient: 0.85, shadows: false, exposure: 1, sky: ['#0d0f12', '#0d0f12'], ground: 'none', grid: true, lamps: false, moon: false, sunColor: '#ffffff', skyLight: '#ffffff', groundLight: '#8a8576' },
  day: { label: 'Sunny day', realistic: true, mode: 'shaded', time: 13, north: 0, sun: 2.1, ambient: 0.75, shadows: true, exposure: 0.95, sky: ['#5f9bd8', '#d9e9f6'], ground: 'grass', grid: false, lamps: false, moon: false, sunColor: '#fff3df', skyLight: '#cfe3ff', groundLight: '#8b8f6a' },
  golden: { label: 'Golden hour', realistic: true, mode: 'shaded', time: 17.4, north: 0, sun: 2.6, ambient: 0.55, shadows: true, exposure: 1.05, sky: ['#6e8fc4', '#f7c58f'], ground: 'grass', grid: false, lamps: false, moon: false, sunColor: '#ffae63', skyLight: '#f2c9a0', groundLight: '#7a6a4c' },
  overcast: { label: 'Overcast', realistic: true, mode: 'shaded', time: 12, north: 0, sun: 0.55, ambient: 1.6, shadows: true, exposure: 1, sky: ['#a9b3bd', '#e1e5e9'], ground: 'paving', grid: false, lamps: false, moon: false, sunColor: '#f2f4f6', skyLight: '#eef1f4', groundLight: '#9a9c9e' },
  night: { label: 'Night with lamps', realistic: true, mode: 'shaded', time: 22, north: 0, sun: 0.45, ambient: 0.28, shadows: true, exposure: 1.25, sky: ['#04060c', '#18233d'], ground: 'paving', grid: false, lamps: true, moon: true, sunColor: '#8fa8ff', skyLight: '#5c70a8', groundLight: '#1a1d26' },
};
export const defaultLight = (preset = 'basic') => ({ preset, quality: 'normal', ...JSON.parse(JSON.stringify(PRESETS[preset])) });
const T = () => (typeof window !== 'undefined' && window.THREE) || globalThis.THREE;
const deg = Math.PI / 180;

// Direction towards the sun in plan coordinates (x east, y north, z up). Sunrise is in the east and sunset in the west.
export function sunVector(L) {
  let az, el;
  if (L.moon) { az = 215; el = 38; } else { const t = Math.max(6, Math.min(18, L.time)); az = 90 + ((t - 6) / 12) * 180; el = 4 + 62 * Math.sin(Math.PI * (t - 6) / 12); }
  az += L.north || 0;
  const a = az * deg, e = el * deg; return { v: [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)], az, el };
}
export const clockText = (h) => { const m = Math.round(h * 60), H = Math.floor(m / 60) % 24, M = m % 60; return (H % 12 || 12) + ':' + String(M).padStart(2, '0') + (H < 12 ? ' am' : ' pm'); };

// Colours are sRGB hex strings. With the linear workflow they are converted when they are used.
export function colour(hex, linear) { const c = new (T().Color)(hex); if (linear && c.convertSRGBToLinear) c.convertSRGBToLinear(); return c; }

// Sets up renderer, lights, ground and sky on a View3D (view.scene, view.renderer, view.light).
export function applyLight(view) {
  const THREE = T(), L = view.light, S = view.scene, R = view.renderer; if (!THREE || !S || !R) return;
  const lin = !!L.realistic, hi = L.quality === 'high';
  // renderer
  R.outputEncoding = lin ? THREE.sRGBEncoding : THREE.LinearEncoding;
  R.toneMapping = lin ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping; R.toneMappingExposure = L.exposure || 1;
  if (R.shadowMap) { R.shadowMap.enabled = !!L.shadows; R.shadowMap.type = THREE.PCFSoftShadowMap; R.shadowMap.needsUpdate = true; }
  if (R.setPixelRatio) R.setPixelRatio(Math.min((view.win && view.win.devicePixelRatio) || 1, hi ? 3 : 2));
  // lights
  if (!view.hemi) { view.hemi = new THREE.HemisphereLight(0xffffff, 0x8a8576, 0.85); S.add(view.hemi); }
  if (!view.sunLight) { view.sunLight = new THREE.DirectionalLight(0xffffff, 0.65); S.add(view.sunLight); S.add(view.sunLight.target); }
  view.hemi.color.copy(colour(L.skyLight, lin)); view.hemi.groundColor.copy(colour(L.groundLight, lin)); view.hemi.intensity = L.ambient;
  const sun = view.sunLight, sv = sunVector(L), box = view.extent(), c = box.getCenter(new THREE.Vector3()), r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 8);
  const d = L.preset === 'basic' ? [40, 80, 30] : null;   // the flat look keeps its fixed light
  sun.color.copy(colour(L.sunColor, lin)); sun.intensity = L.sun;
  if (d) sun.position.set(d[0], d[1], d[2]); else sun.position.set(c.x + sv.v[0] * r * 3 + 1, c.y + sv.v[2] * r * 3 + 1, c.z - sv.v[1] * r * 3);
  sun.target.position.copy(c); sun.target.updateMatrixWorld && sun.target.updateMatrixWorld();
  sun.castShadow = !!L.shadows && L.sun > 0.01;
  if (sun.shadow) {
    const sh = sun.shadow, k = r * 1.35; sh.mapSize.set(hi ? 4096 : 2048, hi ? 4096 : 2048);
    sh.camera.left = -k; sh.camera.right = k; sh.camera.top = k; sh.camera.bottom = -k; sh.camera.near = 0.5; sh.camera.far = r * 8; sh.camera.updateProjectionMatrix();
    sh.bias = -0.0003; sh.normalBias = Math.max(0.03, r * 0.002); sh.radius = hi ? 3 : 2;
    if (sh.map) { sh.map.dispose(); sh.map = null; }
  }
  // ground and grid
  if (!view.groundMesh) {
    view.groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x7d9461, roughness: 1, metalness: 0 }));
    view.groundMesh.rotation.x = -Math.PI / 2; view.groundMesh.position.y = -0.03; S.add(view.groundMesh);
    view.shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.35 }));
    view.shadowCatcher.rotation.x = -Math.PI / 2; view.shadowCatcher.position.y = -0.02; S.add(view.shadowCatcher);
  }
  const size = Math.max(200, r * 12), G = view.groundMesh, SC = view.shadowCatcher;
  G.scale.set(size, size, 1); SC.scale.set(size, size, 1); G.position.x = SC.position.x = c.x; G.position.z = SC.position.z = c.z;
  G.visible = L.ground === 'grass' || L.ground === 'paving'; G.material.color.copy(colour(L.ground === 'paving' ? '#9a988f' : '#5f7a48', lin)); G.material.needsUpdate = true;
  SC.visible = !G.visible && !!L.shadows;
  G.receiveShadow = true; SC.receiveShadow = true;
  if (view.ground) { view.ground.visible = !!L.grid; view.ground.position.x = c.x; view.ground.position.z = c.z; }
  // sky: a gradient behind the transparent canvas
  if (view.canvas && view.canvas.style) view.canvas.style.background = 'linear-gradient(to bottom,' + L.sky[0] + ' 0%,' + L.sky[1] + ' 100%)';
  if (R.setClearColor) R.setClearColor(0x000000, 0);
  applyLamps(view); view.dirty = true;
}

// Ceiling lamps in the biggest rooms, for the night preset. Point lights with shadows, so light stays inside its room.
export function applyLamps(view) {
  const THREE = T(), L = view.light; if (!THREE || !view.scene) return;
  if (view.lampGroup) { view.scene.remove(view.lampGroup); view.lampGroup = null; }
  if (!L.lamps || !view.model) return;
  const g = new THREE.Group(), m = view.model, lin = !!L.realistic, rooms = [];
  m.levels.forEach((lv) => { if (view.opts.levels === 'active' && lv.id !== view.store.p.activeLevel) return; detectRooms(m, lv.id).forEach((r) => { if (r.type !== 'court') rooms.push({ r, z: lv.elev + lv.height - 1.2 }); }); });
  rooms.sort((a, b) => b.r.net - a.r.net).slice(0, 4).forEach((o) => {
    const p = new THREE.PointLight(colour('#ffd7a0', lin), 1.6, Math.max(14, Math.sqrt(o.r.net) * 3.2), 1.5);
    p.position.set(o.r.inside[0], o.z, -o.r.inside[1]); p.castShadow = !!L.shadows; if (p.shadow) { p.shadow.mapSize.set(512, 512); p.shadow.bias = -0.002; }
    g.add(p);
  });
  view.lampGroup = g; view.scene.add(g);
}
