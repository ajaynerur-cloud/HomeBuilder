// Field: layout and glue. A model tree on the left, the viewport in the middle, properties, variants and print on the right.
import { h, clear } from '../studio/ui/dom.js';
import { icon } from '../studio/ui/icons.js';
import { FieldStore, loadField, saveField, serializeField, parseField } from './store.js';
import { newField, nid, buildMesh, refMeshFor, evaluate, captureVariant, applyValues, blendValues, numericParams } from './model.js';
import { preset, PRESETS } from './presets.js';
import { SKETCH_TYPES } from './sketch.js';
import { faceRef, planeFrame, matchRegion } from './faces.js';
import { FieldView } from './view.js';
import { drawSketch } from './sketchEditor.js';
import { fieldPrint } from './print.js';
import { num, validName } from './expr.js';
import { encodeSTL, encode3MF, encodeOBJ } from '../studio/io/meshio.js';
import { createZip } from '../studio/io/zip.js';
import { saveBytes } from '../studio/io/download.js';
import { unit, dot } from './frames.js';

const QUALITY = { draft: 44, normal: 72, fine: 110, print: 160 };
const AXES = [['normal', 'Along the face or plane normal'], ['x', 'X axis'], ['y', 'Y axis'], ['z', 'Z axis'], ['vector', 'Custom direction']];
const OPS = [['add', 'Add to the shape'], ['sub', 'Cut from the shape'], ['int', 'Keep only the overlap']];
const fmt = (v) => (isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)) : '–');

function menu(label, items, cls) {
  const d = h('details', { class: 'st-menu ' + (cls || '') }), box = h('div', { class: 'st-menuitems' });
  items.forEach((it) => { if (it === 'sep') box.appendChild(h('div', { class: 'st-msep' })); else box.appendChild(h('button', { class: 'st-btn', text: it[0], onclick: () => { d.open = false; it[1](); } })); });
  d.appendChild(h('summary', { class: 'st-btn', text: label })); d.appendChild(box); return d;
}

export function createField(root, deps = {}) {
  const store = new FieldStore((deps.noSave ? null : loadField()) || preset('revolved'));
  const state = { quality: 'normal', sel: null, result: null, ref: null, faceSel: null, attach: null, drag: false, busy: false, ms: 0 };
  const els = {}, api = { store, state };
  let regenT = null, refT = null, saveT = null;
  const P = () => store.p;
  const scope = () => (state.result ? state.result.ev.scope : {});
  const find = (p, kind, id) => (kind === 'params' ? p.params[id] : p[kind].find((x) => x.id === id));
  const toast = (m) => { els.toast.textContent = m; els.toast.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => els.toast.classList.remove('on'), 5000); };
  api.toast = toast;

  // ---------- generation
  function run() {
    const t0 = Date.now(), res = state.drag ? QUALITY.draft : QUALITY[state.quality];
    let r = null; try { r = buildMesh(P(), res); } catch (e) { console.error(e); r = { ev: { scope: {}, errors: [e.message], steps: [], frames: {}, sketches: {}, body: { empty: true } }, mesh: null }; }
    state.result = r; state.ms = Date.now() - t0; state.ref = null; state.faceSel = state.faceSel && !r.mesh ? null : state.faceSel;
    if (view.ok) { view.setMesh(r.mesh); if (r.mesh && !state.fitted) { view.fit(r.mesh.bb); state.fitted = true; } view.setRef(null); view.setOverlay(r.ev, P(), state.sel); }
    const n = r.ev.errors.length; els.status.textContent = r.mesh ? ((r.mesh.T.length / 3 / 1000).toFixed(0) + 'k triangles, ' + state.ms + ' ms' + (n ? ', ' + n + ' problem' + (n > 1 ? 's' : '') : '')) : (n ? n + ' problem' + (n > 1 ? 's' : '') : 'Nothing to show yet');
    els.status.classList.toggle('bad', !!n); renderTree(); renderProps(); renderPrint(); refreshHighlight();
    clearTimeout(refT); if (!state.drag) refT = setTimeout(() => { ensureRef(); refreshHighlight(); }, 120);
  }
  function regen(fast) { clearTimeout(regenT); regenT = setTimeout(run, fast ? 5 : 50); }
  api.run = run;
  function ensureRef() { if (!state.ref && state.result && state.result.mesh && state.result.ev.body.bb) { try { state.ref = refMeshFor(state.result.ev.body); } catch (e) { state.ref = null; } if (view.ok) view.setRef(state.ref); } return state.ref; }
  api.ensureRef = ensureRef;
  function matchedIds() {
    const ref = ensureRef(), ids = []; if (!ref) return ids;
    const add = (f) => { if (f) { const m = matchRegion(ref.seg, f); if (m) ids.push(m.region.id); } };
    if (state.faceSel) ids.push(state.faceSel.id);
    const s = state.sel; if (s && s.t === 'feature') { const f = P().features.find((x) => x.id === s.id); if (f && f.type === 'pull') add(f.face); if (f && f.type === 'shell') (f.open || []).forEach(add); }
    return ids;
  }
  function featDir(f, region) {
    const m = f.dir || 'normal'; if (m === 'normal') return region ? region.normal : [0, 0, 1];
    if (m === 'x') return [1, 0, 0]; if (m === 'y') return [0, 1, 0]; if (m === 'z') return [0, 0, 1];
    return unit((f.vec || [0, 0, 1]).map((c, i) => num(c, scope(), i === 2 ? 1 : 0)));
  }
  function refreshHighlight() {
    if (!view.ok) return; const ids = matchedIds(), s = state.sel; let arrow = null;
    if (s && s.t === 'feature' && state.ref) { const f = P().features.find((x) => x.id === s.id); if (f && f.type === 'pull') { const m = matchRegion(state.ref.seg, f.face); if (m) { const d = num(f.dist, scope(), 0); arrow = { at: m.region.centroid, dir: featDir(f, m.region).map((v) => v * (d < 0 ? -1 : 1)), len: Math.abs(d) }; } } }
    view.setHighlight(ids, arrow);
  }
  api.refreshHighlight = refreshHighlight;
  function change(info) { clearTimeout(saveT); if (!deps.noSave) saveT = setTimeout(() => saveField(P()), 700); els.undo.disabled = !store.undoStack.length; els.redo.disabled = !store.redoStack.length; nameIn.value = P().name; regen(info && info.fast); }

  // ---------- fields
  const parseVal = (s, type) => { s = String(s).trim(); if (s === '') return undefined; if (type === 'txt') return s; return /^-?\d*\.?\d+$/.test(s) ? parseFloat(s) : s; };
  function setField(kind, id, key, val, fast) { store.transact('Edit ' + key, (p) => { const o = find(p, kind, id); if (!o) return; if (val === undefined) delete o[key]; else o[key] = val; }, { coalesce: kind + id + key }); void fast; }
  function field(label, kind, id, key, spec = {}) {
    const o = find(P(), kind, id), raw = o ? o[key] : undefined;
    if (spec.t === 'bool') return h('label', { class: 'st-row chk' }, h('input', { type: 'checkbox', checked: !!raw, onchange: (e) => { setField(kind, id, key, e.target.checked); } }), h('span', { text: label }));
    if (spec.t === 'sel') return h('label', { class: 'st-row' }, h('span', { text: label }), h('select', { class: 'st-in', onchange: (e) => setField(kind, id, key, e.target.value) }, spec.o.map(([v, l]) => h('option', { value: v, text: l, selected: String(raw === undefined ? spec.def : raw) === v }))));
    if (spec.t === 'area') { const ta = h('textarea', { class: 'st-in', rows: 3, style: 'width:100%;font-family:monospace' }); ta.value = raw === undefined ? '' : String(raw); ta.addEventListener('change', () => setField(kind, id, key, ta.value.trim() === '' ? undefined : ta.value.trim())); return h('div', { class: 'st-card' }, h('span', { class: 'st-small', text: label }), ta, spec.hint ? h('span', { class: 'st-small', text: spec.hint }) : null); }
    let hint = ''; if (spec.t !== 'txt' && raw !== undefined && raw !== '') { const v = num(raw, scope(), NaN); hint = isFinite(v) ? (typeof raw === 'string' ? '= ' + fmt(v) : '') + (spec.unit ? ' ' + spec.unit : '') : 'error'; } else if (spec.unit) hint = spec.unit;
    const i = h('input', { type: 'text', class: 'st-in', value: raw === undefined ? '' : String(raw), title: spec.tip || 'A number, a length such as 12mm, or an expression like =H*0.5' });
    i.addEventListener('change', () => { const v = parseVal(i.value, spec.t); if (v === undefined && !spec.optional) { toast('This value cannot be empty.'); i.value = raw === undefined ? '' : raw; return; } setField(kind, id, key, v); });
    return h('label', { class: 'st-row' }, h('span', { text: label }), i, h('span', { class: 'st-unit' + (hint === 'error' ? ' bad' : ''), text: hint }));
  }
  const planeOpts = () => P().planes.map((p) => [p.id, p.name]);
  const sketchOpts = () => P().sketches.map((s) => [s.id, s.name || s.id]);

  // ---------- adding things
  const sel = (t, id) => { state.sel = { t, id }; renderTree(); renderProps(); if (view.ok) view.setOverlay(state.result.ev, P(), state.sel); refreshHighlight(); };
  const add = {
    plane(kind) { let id; store.transact('Add plane', (p) => { id = nid(p, 'pl'); const base = { id, name: { offset: 'Offset plane', rotate: 'Rotated plane', points: 'Plane through 3 points', free: 'Plane' }[kind] }; if (kind === 'offset') Object.assign(base, { kind, base: 'pXY', offset: 50 }); else if (kind === 'rotate') Object.assign(base, { kind, base: 'pXY', axis: 'u', angle: 30 }); else if (kind === 'points') Object.assign(base, { kind, pts: [[0, 0, 0], [50, 0, 0], [0, 50, 30]] }); else Object.assign(base, { kind: 'free', origin: [0, 0, 0], normal: [0, 0, 1] }); p.planes.push(base); }); sel('plane', id); },
    sketch(type) {
      let id; const pl = state.sel && state.sel.t === 'plane' ? state.sel.id : 'pXY';
      store.transact('Add sketch', (p) => { id = nid(p, 'sk'); const D = { circle: { r: 30 }, ellipse: { rx: 40, ry: 25 }, rect: { w: 60, h: 40, cr: 6 }, superellipse: { rx: 35, ry: 35, n: 4 }, polygon: { sides: 6, r: 30 }, spline: { closed: false, per: 14, pts: [[20, 0], [32, 40], [22, 90]] }, poly: { closed: true, pts: [[-25, -20], [25, -20], [25, 20], [-25, 20]] } }[type]; p.sketches.push({ id, plane: pl, name: SKETCH_TYPES.find((x) => x[0] === type)[1] + ' ' + id.slice(2), type, ...D }); }); sel('sketch', id);
    },
    feature(type) {
      let id; const last = P().sketches[P().sketches.length - 1], lastId = last ? last.id : '';
      store.transact('Add feature', (p) => {
        id = nid(p, 'ft'); const base = { id, type, enabled: true, name: (FEATURE_NAMES[type] || type) + ' ' + id.slice(2) };
        if (type === 'extrude') Object.assign(base, { sketch: lastId, dir: 'normal', dist: 40, op: 'add' });
        else if (type === 'revolve') Object.assign(base, { sketch: lastId, axis: 'v', angle: 360, wall: 0, op: 'add' });
        else if (type === 'loft') Object.assign(base, { sketches: p.sketches.slice(-3).map((s) => s.id), smooth: true, wall: 0, op: 'add' });
        else if (type === 'surface') Object.assign(base, { plane: 'pXY', H: 150, r: '30 + 10 * sin(180 * t)', twist: '', wall: 0, op: 'add' });
        else if (type === 'shell') Object.assign(base, { t: 3, open: [] });
        else if (type === 'pull') Object.assign(base, { face: null, dir: 'normal', dist: 10, hard: true });
        else if (type === 'warp') Object.assign(base, { kind: 'twist', plane: 'pXY', amount: 30, extra: 20 });
        else if (type === 'mirror') Object.assign(base, { plane: 'pYZ' });
        else if (type === 'pattern') Object.assign(base, { kind: 'polar', plane: 'pXY', count: 6, angle: 360, vx: 40, vy: 0, vz: 0 });
        p.features.push(base);
      }); sel('feature', id);
    },
  };
  const FEATURE_NAMES = { extrude: 'Extrude', revolve: 'Revolve', loft: 'Loft', surface: 'Surface', shell: 'Shell', pull: 'Push / pull', warp: 'Warp', mirror: 'Mirror', pattern: 'Pattern' };
  const FEATURE_LIST = [['extrude', 'Extrude a sketch'], ['revolve', 'Revolve a profile'], ['loft', 'Loft through sketches'], ['surface', 'Surface from an equation'], ['shell', 'Hollow out (shell)'], ['pull', 'Push or pull a face'], ['warp', 'Twist, taper, bend, ripple'], ['mirror', 'Mirror'], ['pattern', 'Pattern']];

  // ---------- model tree (left)
  const tree = h('div', { class: 'fd-tree' });
  function renderTree() {
    const active = tree.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName) && !state.forceTree; if (active) return; state.forceTree = false;
    clear(tree); const p = P(), ev = state.result ? state.result.ev : { steps: [], scope: {}, errors: [] }, errs = {}; ev.steps.forEach((s) => { if (!s.ok) errs[s.id] = s.error; });
    // parameters
    const pbody = h('div', { class: 'fd-params' });
    p.params.forEach((q, i) => {
      const val = ev.scope[q.name], plain = typeof q.v === 'number', row = h('div', { class: 'fd-prow' },
        h('input', { class: 'st-in name', value: q.name, title: 'Parameter name', onchange: (e) => { const n = e.target.value.trim(); if (!validName(n) || p.params.some((x, j) => j !== i && x.name === n)) { toast('Use letters, digits and _, and a name that is not taken.'); e.target.value = q.name; return; } store.transact('Rename parameter', (pp) => { pp.params[i].name = n; }); } }),
        h('input', { class: 'st-in val', value: String(q.v), title: q.note || 'A number or an expression', onchange: (e) => { const v = parseVal(e.target.value, 'len'); if (v === undefined) return; store.transact('Edit parameter', (pp) => { pp.params[i].v = v; }, { coalesce: 'param' + i }); } }),
        h('span', { class: 'st-unit' + (val === undefined ? ' bad' : ''), text: val === undefined ? 'error' : (plain ? '' : '= ' + fmt(val)) }),
        h('button', { class: 'st-btn sm', text: '×', title: 'Delete', onclick: () => { state.forceTree = true; store.transact('Delete parameter', (pp) => { pp.params.splice(i, 1); }); } }));
      pbody.appendChild(row);
      if (plain && isFinite(q.v)) {
        const hi = q.v === 0 ? 100 : Math.abs(q.v) * 3, lo = q.v < 0 ? q.v * 3 : 0, sl = h('input', { type: 'range', class: 'fd-slide', min: lo, max: hi, step: Math.abs(hi) > 60 ? 1 : 0.1, value: q.v, title: 'Drag to explore: ' + q.name });
        sl.addEventListener('input', () => { state.drag = true; store.transact('Adjust ' + q.name, (pp) => { pp.params[i].v = parseFloat(sl.value); }, { coalesce: 'slide' + i }); });
        sl.addEventListener('change', () => { state.drag = false; regen(true); });
        pbody.appendChild(h('div', { class: 'fd-slrow' }, sl, h('span', { class: 'st-small', text: q.note || '' })));
      }
    });
    pbody.appendChild(h('button', { class: 'st-btn', text: 'Add parameter', onclick: () => { state.forceTree = true; store.transact('Add parameter', (pp) => { let n = 1; while (pp.params.some((x) => x.name === 'p' + n)) n++; pp.params.push({ name: 'p' + n, v: 10, note: '' }); }); } }));
    tree.appendChild(h('details', { class: 'st-sec', open: true }, h('summary', { text: 'Parameters' }), pbody));
    const item = (t, id, label, extra, bad) => h('div', { class: 'fd-item' + (state.sel && state.sel.t === t && state.sel.id === id ? ' on' : '') + (bad ? ' err' : ''), title: bad || '', onclick: (e) => { if (e.target.closest('button,input')) return; state.forceTree = true; sel(t, id); } }, extra || null, h('span', { class: 'grow', text: label }), bad ? h('span', { class: 'fd-dot', text: '!' }) : null);
    const planes = h('div'); p.planes.forEach((q) => planes.appendChild(item('plane', q.id, q.name, null)));
    tree.appendChild(h('details', { class: 'st-sec', open: true }, h('summary', { text: 'Planes' }), planes, menu('Add plane', [['Offset from a plane', () => add.plane('offset')], ['Rotated from a plane', () => add.plane('rotate')], ['Through three points', () => add.plane('points')], ['Origin and direction', () => add.plane('free')]])));
    const sk = h('div'); p.sketches.forEach((q) => sk.appendChild(item('sketch', q.id, q.name || q.id, null)));
    tree.appendChild(h('details', { class: 'st-sec', open: true }, h('summary', { text: 'Sketches' }), sk, menu('Add sketch', SKETCH_TYPES.map(([t, l]) => [l, () => add.sketch(t)]))));
    const fe = h('div');
    p.features.forEach((f, i) => fe.appendChild(item('feature', f.id, (i + 1) + '. ' + (f.name || f.type), h('input', { type: 'checkbox', checked: f.enabled !== false, title: 'Turn this step on or off', onchange: (e) => { setField('features', f.id, 'enabled', e.target.checked); } }), errs[f.id])));
    tree.appendChild(h('details', { class: 'st-sec', open: true }, h('summary', { text: 'Steps' }), fe, menu('Add step', FEATURE_LIST.map(([t, l]) => [l, () => add.feature(t)]))));
  }

  // ---------- properties (right)
  const props = h('div');
  function listEditor(f, key, label, options) {
    const cur = f[key] || [], box = h('div', { class: 'st-card' }, h('span', { class: 'st-small', text: label }));
    cur.forEach((id, i) => box.appendChild(h('div', { class: 'st-row2' }, h('select', { class: 'st-in', onchange: (e) => store.transact('Edit', (p) => { find(p, 'features', f.id)[key][i] = e.target.value; }) }, options().map(([v, l]) => h('option', { value: v, text: l, selected: v === id }))), h('button', { class: 'st-btn sm', text: '↑', onclick: () => store.transact('Order', (p) => { const a = find(p, 'features', f.id)[key]; if (i > 0) { const t = a[i]; a[i] = a[i - 1]; a[i - 1] = t; } }) }), h('button', { class: 'st-btn sm', text: '×', onclick: () => store.transact('Edit', (p) => { find(p, 'features', f.id)[key].splice(i, 1); }) }))));
    box.appendChild(h('button', { class: 'st-btn', text: 'Add', onclick: () => store.transact('Edit', (p) => { const o = options(); const a = find(p, 'features', f.id); a[key] = a[key] || []; a[key].push(o.length ? o[Math.min(a[key].length, o.length - 1)][0] : ''); }) })); return box;
  }
  function sketchPanel(s) {
    const box = h('div', { class: 'st-card' }), ev = state.result ? state.result.ev : null, r = ev && ev.sketches[s.id];
    const cv = h('canvas', { width: 300, height: 200, class: 'fd-sk' }); box.appendChild(cv); box.appendChild(h('span', { class: 'st-small', text: r ? 'Horizontal is the plane\'s first axis, vertical its second. ' + (s.type === 'spline' || s.type === 'poly' ? 'Drag the points, double-click a line to add one, Alt-click a point to remove it.' : '') : '' }));
    const pts = s.type === 'spline' || s.type === 'poly' ? (s.pts || []).map((q) => [num(q[0], scope(), 0), num(q[1], scope(), 0)]) : null; let map = null, hot = -1;
    const redraw = () => { map = drawSketch(cv, r ? r.loop : [], r ? r.closed : true, pts, hot); }; redraw();
    if (pts) {
      let dragI = -1;
      const at = (e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * (cv.width / (b.width || cv.width)), (e.clientY - b.top) * (cv.height / (b.height || cv.height))]; };
      cv.addEventListener('pointerdown', (e) => { if (!map) return; const [sx, sy] = at(e); dragI = pts.findIndex((q) => { const t = map.S(q); return Math.hypot(t[0] - sx, t[1] - sy) < 9; }); if (dragI >= 0 && e.altKey && pts.length > 2) { store.transact('Remove point', (p) => { find(p, 'sketches', s.id).pts.splice(dragI, 1); }); dragI = -1; return; } hot = dragI; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ } redraw(); });
      cv.addEventListener('pointermove', (e) => { if (dragI < 0 || !map) return; const [sx, sy] = at(e), q = map.inv(sx, sy); pts[dragI] = [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]; state.drag = true; store.transact('Move point', (p) => { find(p, 'sketches', s.id).pts[dragI] = [pts[dragI][0], pts[dragI][1]]; }, { coalesce: 'pt' + s.id }); });
      cv.addEventListener('pointerup', () => { if (dragI >= 0) { state.drag = false; regen(true); } dragI = -1; });
      cv.addEventListener('dblclick', (e) => { if (!map) return; const [sx, sy] = at(e), q = map.inv(sx, sy); let best = 0, bd = 1e9; pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length], d = Math.hypot((a[0] + b[0]) / 2 - q[0], (a[1] + b[1]) / 2 - q[1]); if (d < bd) { bd = d; best = i; } }); store.transact('Add point', (p) => { find(p, 'sketches', s.id).pts.splice(best + 1, 0, [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]); }); });
    }
    return box;
  }
  function renderProps() {
    if (props.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && !state.forceProps) return; state.forceProps = false;
    clear(props); const s = state.sel, p = P(); const ev = state.result ? state.result.ev : null;
    if (state.faceSel) props.appendChild(faceCard());
    if (!s) { props.appendChild(h('p', { class: 'st-hint', text: 'Pick something in the tree to edit it, or click a face in the view to push or pull it. Everything here is a function of the parameters, so changing a parameter rebuilds the shape.' })); return; }
    if (s.t === 'plane') {
      const q = p.planes.find((x) => x.id === s.id); if (!q) return; const card = h('div', { class: 'st-card' }, h('b', { text: 'Plane' }), field('Name', 'planes', q.id, 'name', { t: 'txt' }));
      if (q.kind === 'offset') card.append(field('Based on', 'planes', q.id, 'base', { t: 'sel', o: planeOpts().filter((o) => o[0] !== q.id) }), field('Distance along its normal', 'planes', q.id, 'offset', { unit: 'mm' }));
      else if (q.kind === 'rotate') card.append(field('Based on', 'planes', q.id, 'base', { t: 'sel', o: planeOpts().filter((o) => o[0] !== q.id) }), field('Turn about its', 'planes', q.id, 'axis', { t: 'sel', o: [['u', 'first axis'], ['v', 'second axis']], def: 'u' }), field('Angle', 'planes', q.id, 'angle', { unit: 'deg' }));
      else if (q.kind === 'points') (q.pts || []).forEach((pt, i) => card.append(h('div', { class: 'st-small', text: 'Point ' + (i + 1) }), ...['x', 'y', 'z'].map((a, k) => vecField(a, q, 'pts', i, k))));
      else if (q.kind === 'free') card.append(...['x', 'y', 'z'].map((a, k) => vecField('Origin ' + a, q, 'origin', null, k)), ...['x', 'y', 'z'].map((a, k) => vecField('Normal ' + a, q, 'normal', null, k)));
      else card.append(h('div', { class: 'st-small', text: 'A fixed world plane.' }));
      if (!['xy', 'xz', 'yz'].includes(q.kind)) card.append(h('button', { class: 'st-btn danger', text: 'Delete plane', onclick: () => { state.sel = null; state.forceTree = true; store.transact('Delete plane', (pp) => { pp.planes = pp.planes.filter((x) => x.id !== q.id); }); } }));
      props.appendChild(card);
    } else if (s.t === 'sketch') {
      const q = p.sketches.find((x) => x.id === s.id); if (!q) return; const card = h('div', { class: 'st-card' }, h('b', { text: 'Sketch' }), field('Name', 'sketches', q.id, 'name', { t: 'txt' }), field('On plane', 'sketches', q.id, 'plane', { t: 'sel', o: planeOpts() }), field('Shape', 'sketches', q.id, 'type', { t: 'sel', o: SKETCH_TYPES }));
      const F = (l, k, u) => field(l, 'sketches', q.id, k, { unit: u || 'mm', optional: true });
      if (q.type === 'circle') card.append(F('Radius', 'r')); else if (q.type === 'ellipse') card.append(F('Radius across', 'rx'), F('Radius up', 'ry'));
      else if (q.type === 'rect') card.append(F('Width', 'w'), F('Height', 'h'), F('Corner radius', 'cr'));
      else if (q.type === 'superellipse') card.append(F('Half width', 'rx'), F('Half height', 'ry'), F('Squareness (2 round, 4 rounded square)', 'n', ''));
      else if (q.type === 'polygon') card.append(F('Sides', 'sides', ''), F('Radius', 'r'));
      else { card.append(field('Closed loop', 'sketches', q.id, 'closed', { t: 'bool' })); if (q.type === 'spline') card.append(F('Smoothness (samples per segment)', 'per', '')); }
      card.append(F('Shift across', 'ox'), F('Shift up', 'oy'), F('Rotate', 'rot', 'deg'), F('Detail (segments)', 'seg', ''));
      if (q.type === 'spline' || q.type === 'poly') { (q.pts || []).forEach((pt, i) => card.append(h('div', { class: 'st-row2' }, h('span', { class: 'st-small', text: (i + 1) + '.' }), vecInline(q, 'pts', i, 0), vecInline(q, 'pts', i, 1), h('button', { class: 'st-btn sm', text: '×', onclick: () => { if ((q.pts || []).length > 2) store.transact('Remove point', (pp) => { find(pp, 'sketches', q.id).pts.splice(i, 1); }); } })))); card.append(h('button', { class: 'st-btn', text: 'Add point', onclick: () => store.transact('Add point', (pp) => { const a = find(pp, 'sketches', q.id).pts, l = a[a.length - 1] || [0, 0]; a.push([num(l[0], scope(), 0) + 10, num(l[1], scope(), 0) + 10]); }) })); }
      props.appendChild(sketchPanel(q)); card.append(h('button', { class: 'st-btn danger', text: 'Delete sketch', onclick: () => { state.sel = null; state.forceTree = true; store.transact('Delete sketch', (pp) => { pp.sketches = pp.sketches.filter((x) => x.id !== q.id); }); } })); props.appendChild(card);
    } else if (s.t === 'feature') {
      const f = p.features.find((x) => x.id === s.id); if (!f) return; const idx = p.features.indexOf(f), er = ev && ev.steps.find((x) => x.id === f.id);
      const card = h('div', { class: 'st-card' }, h('b', { text: (FEATURE_NAMES[f.type] || f.type) }), field('Name', 'features', f.id, 'name', { t: 'txt' }));
      if (er && !er.ok) card.append(h('div', { class: 'st-note err' }, h('span', { class: 'tag', text: 'Problem' }), ' ' + er.error));
      const F = (l, k, o) => field(l, 'features', f.id, k, o || {}), dirRows = () => { card.append(F('Direction', 'dir', { t: 'sel', o: AXES, def: 'normal' })); if (f.dir === 'vector') ['x', 'y', 'z'].forEach((a, k) => card.append(vecField('Direction ' + a, f, 'vec', null, k, 'features'))); };
      if (f.type === 'extrude') { card.append(F('Sketch', 'sketch', { t: 'sel', o: sketchOpts() })); dirRows(); card.append(F('Distance', 'dist', { unit: 'mm' }), F('Draft angle (taper)', 'taper', { unit: 'deg', optional: true }), F('Twist over the height', 'twist', { unit: 'deg', optional: true }), F('Both directions', 'sym', { t: 'bool' })); }
      else if (f.type === 'revolve') card.append(F('Profile sketch', 'sketch', { t: 'sel', o: sketchOpts() }), F('Axis', 'axis', { t: 'sel', o: [['v', 'Plane second axis (up)'], ['u', 'Plane first axis']], def: 'v' }), F('Angle', 'angle', { unit: 'deg' }), F('Wall thickness (open curve makes a hollow vase)', 'wall', { unit: 'mm', optional: true }), F('Floor thickness', 'floor', { unit: 'mm', optional: true }));
      else if (f.type === 'loft') { card.append(listEditor(f, 'sketches', 'Sketches, bottom to top (on parallel planes)', sketchOpts), F('Smooth between sketches', 'smooth', { t: 'bool' }), F('Wall thickness (makes it hollow with an open top)', 'wall', { unit: 'mm', optional: true })); }
      else if (f.type === 'surface') card.append(F('Base plane', 'plane', { t: 'sel', o: planeOpts() }), F('Height', 'H', { unit: 'mm' }), F('Radius r', 'r', { t: 'area', hint: 'Use z (height), t (0 to 1 up the height), a (angle in degrees), H, tw (twist) and your parameters. Example: (30 + 20*sin(180*t)) * (1 + 0.08*cos(5*a))' }), F('Twist (degrees at each height)', 'twist', { t: 'area', hint: 'For example: 90 * t' }), F('Wall thickness (hollow, open top)', 'wall', { unit: 'mm', optional: true }), F('Floor thickness', 'floor', { unit: 'mm', optional: true }));
      else if (f.type === 'shell') { card.append(F('Wall thickness', 't', { unit: 'mm' })); card.append(h('div', { class: 'st-small', text: 'Open faces: ' + ((f.open || []).length || 'none') + '. Click a face in the view, then press "Open this face".' })); (f.open || []).forEach((r, i) => card.append(h('div', { class: 'st-row2' }, h('span', { class: 'st-small', text: 'Face near (' + r.c.map(fmt).join(', ') + ')' }), h('button', { class: 'st-btn sm', text: '×', onclick: () => store.transact('Close face', (pp) => { find(pp, 'features', f.id).open.splice(i, 1); }) })))); }
      else if (f.type === 'pull') {
        card.append(h('div', { class: 'st-small', text: f.face ? 'Attached to a ' + (f.face.planar ? 'flat' : 'curved') + ' face near (' + f.face.c.map(fmt).join(', ') + '). Drag the highlighted face in the view, or type a distance.' : 'No face yet.' }));
        dirRows(); card.append(F('Distance (negative pushes in)', 'dist', { unit: 'mm' }), F('Flat faces: sharp sweep. Off: soft pull', 'hard', { t: 'bool' }), F('Draft angle', 'taper', { unit: 'deg', optional: true }), F('Soft pull radius', 'radius', { unit: 'mm', optional: true }), F('Soft pull falloff (0 to 2)', 'soft', { optional: true }), h('button', { class: 'st-btn', text: 'Attach to another face…', onclick: () => { state.attach = { fid: f.id, mode: 'face' }; toast('Click the face to attach to.'); } }));
      }
      else if (f.type === 'warp') card.append(F('Kind', 'kind', { t: 'sel', o: [['twist', 'Twist (degrees per 100 mm)'], ['taper', 'Taper (percent per 100 mm)'], ['bend', 'Bend (degrees per 100 mm)'], ['ripple', 'Ripple (amplitude mm)']], def: 'twist' }), F('Axis plane (axis is its normal)', 'plane', { t: 'sel', o: planeOpts() }), F('Amount', 'amount'), f.kind === 'ripple' ? F('Wavelength', 'extra', { unit: 'mm' }) : null);
      else if (f.type === 'mirror') card.append(F('Mirror in plane', 'plane', { t: 'sel', o: planeOpts() }));
      else if (f.type === 'pattern') card.append(F('Kind', 'kind', { t: 'sel', o: [['polar', 'Around an axis'], ['linear', 'In a line']], def: 'polar' }), f.kind === 'linear' ? null : F('Axis plane (axis is its normal)', 'plane', { t: 'sel', o: planeOpts() }), F('Copies', 'count', { unit: '' }), f.kind === 'linear' ? null : F('Angle covered', 'angle', { unit: 'deg' }), f.kind === 'linear' ? F('Step x', 'vx', { unit: 'mm' }) : null, f.kind === 'linear' ? F('Step y', 'vy', { unit: 'mm' }) : null, f.kind === 'linear' ? F('Step z', 'vz', { unit: 'mm' }) : null);
      if (['extrude', 'revolve', 'loft', 'surface'].includes(f.type)) card.append(F('Combine', 'op', { t: 'sel', o: OPS, def: 'add' }), F('Blend radius (smooth joins)', 'k', { unit: 'mm', optional: true }));
      if (f.type === 'pull') card.append(F('Blend radius', 'k', { unit: 'mm', optional: true }));
      card.append(h('div', { class: 'st-row2' }, h('button', { class: 'st-btn', text: 'Move up', disabled: idx === 0, onclick: () => { state.forceTree = true; store.transact('Reorder', (pp) => { const a = pp.features, i = a.findIndex((x) => x.id === f.id); if (i > 0) { const t = a[i]; a[i] = a[i - 1]; a[i - 1] = t; } }); } }), h('button', { class: 'st-btn', text: 'Move down', disabled: idx === p.features.length - 1, onclick: () => { state.forceTree = true; store.transact('Reorder', (pp) => { const a = pp.features, i = a.findIndex((x) => x.id === f.id); if (i < a.length - 1) { const t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; } }); } }), h('button', { class: 'st-btn danger', text: 'Delete step', onclick: () => { state.sel = null; state.forceTree = true; store.transact('Delete step', (pp) => { pp.features = pp.features.filter((x) => x.id !== f.id); }); } })));
      props.appendChild(card);
    }
  }
  function vecField(label, o, key, i, k, kind = o.kind !== undefined && o.type === undefined ? 'planes' : 'features') {
    const raw = i === null ? (o[key] || [])[k] : ((o[key] || [])[i] || [])[k], inp = h('input', { type: 'text', class: 'st-in', value: raw === undefined ? '' : String(raw) });
    inp.addEventListener('change', () => { const v = parseVal(inp.value, 'len'); store.transact('Edit', (p) => { const t = find(p, kind, o.id); if (i === null) { t[key] = t[key] || [0, 0, 0]; t[key][k] = v === undefined ? 0 : v; } else t[key][i][k] = v === undefined ? 0 : v; }, { coalesce: o.id + key + i + k }); });
    return h('label', { class: 'st-row' }, h('span', { text: label }), inp, h('span'));
  }
  function vecInline(q, key, i, k) {
    const raw = q[key][i][k], inp = h('input', { type: 'text', class: 'st-in sm', value: String(raw), title: k ? 'up' : 'across' });
    inp.addEventListener('change', () => { const v = parseVal(inp.value, 'len'); store.transact('Edit', (p) => { find(p, 'sketches', q.id)[key][i][k] = v === undefined ? 0 : v; }, { coalesce: q.id + 'pt' + i + k }); }); return inp;
  }

  // ---------- face card
  function faceCard() {
    const fs = state.faceSel, ref = state.ref, R = ref && ref.seg.regions[fs.id];
    const card = h('div', { class: 'st-card' }, h('b', { text: 'Selected face' }), h('div', { class: 'st-small', text: R ? (R.planar ? 'Flat' : 'Curved') + ' face, ' + Math.round(R.area).toLocaleString() + ' mm², pointing (' + R.normal.map((v) => v.toFixed(2)).join(', ') + ').' : 'Face selected.' }));
    const mk = (type, extra) => () => { let id; store.transact('Add ' + type, (p) => { id = nid(p, 'ft'); p.features.push({ id, type, enabled: true, name: type === 'pull' ? 'Push / pull' : 'Hollow, open face', ...extra(p) }); }); state.forceTree = true; state.forceProps = true; sel('feature', id); };
    card.append(h('div', { class: 'st-row2' },
      h('button', { class: 'st-btn pri', text: 'Push / pull', title: 'Add a push or pull step. Then drag the face.', onclick: mk('pull', () => ({ face: fs.ref, dir: 'normal', dist: 10, hard: !!(R && R.planar) })) }),
      h('button', { class: 'st-btn', text: 'Soft pull', title: 'Pull the surface smoothly, like clay', onclick: mk('pull', () => ({ face: fs.ref, dir: 'normal', dist: 10, hard: false })) }),
      h('button', { class: 'st-btn', text: 'Open this face', title: 'Hollow the shape and open this face', onclick: () => { const sh = P().features.filter((f) => f.type === 'shell'); if (sh.length) { store.transact('Open face', (p) => { const f = find(p, 'features', sh[sh.length - 1].id); f.open = f.open || []; f.open.push(fs.ref); }); state.forceProps = true; sel('feature', sh[sh.length - 1].id); } else mk('shell', (p) => ({ t: p.params.some((q) => q.name === 'wall') ? '=wall' : 3, open: [fs.ref] }))(); } }),
      h('button', { class: 'st-btn', text: 'Clear', onclick: () => { state.faceSel = null; state.forceProps = true; renderProps(); refreshHighlight(); } })));
    return card;
  }
  function attachTo(fid, mode, ref) { store.transact('Attach face', (p) => { const f = find(p, 'features', fid); if (mode === 'face') f.face = ref; else { f.open = f.open || []; f.open.push(ref); } }); state.attach = null; state.forceProps = true; }
  // viewport callbacks
  function clickFace(hit) {
    if (!hit || hit.id === undefined || hit.id < 0) { state.faceSel = null; state.forceProps = true; renderProps(); refreshHighlight(); return; }
    const ref = ensureRef(); if (!ref) return; const R = ref.seg.regions[hit.id]; if (!R) return;
    const fr = faceRef(ref.mesh, ref.seg, R.id, planeFrame(R));
    if (state.attach) { attachTo(state.attach.fid, state.attach.mode, fr); return; }
    state.faceSel = { id: R.id, ref: fr }; state.forceProps = true; renderProps(); refreshHighlight();
  }
  api.clickRegion = (id) => clickFace({ id });
  const viewApp = {
    click: (hit) => clickFace(hit),
    dragStart: (hit) => {
      if (!hit || hit.id === undefined || hit.id < 0) return null; const ref = ensureRef(); if (!ref) return null; let f = null;
      const s = state.sel; if (s && s.t === 'feature') f = P().features.find((x) => x.id === s.id && x.type === 'pull');
      if (f && f.face) { const m = matchRegion(ref.seg, f.face); if (!m || m.region.id !== hit.id) return null; return startDrag(f, m.region, hit.point); }
      if (state.faceSel && state.faceSel.id === hit.id) {
        const R = ref.seg.regions[hit.id]; let id; store.transact('Add push / pull', (p) => { id = nid(p, 'ft'); p.features.push({ id, type: 'pull', enabled: true, name: 'Push / pull', face: state.faceSel.ref, dir: 'normal', dist: 0, hard: !!R.planar }); });
        state.faceSel = null; state.forceTree = true; state.forceProps = true; sel('feature', id); return startDrag(P().features.find((x) => x.id === id), R, hit.point);
      }
      return null;
    },
    dragMove: (d, mm) => { state.drag = true; const v = Math.round((d.start + mm) * 2) / 2; store.transact('Push / pull', (p) => { find(p, 'features', d.fid).dist = v; }, { coalesce: 'drag' + d.fid }); },
    dragEnd: () => { state.drag = false; state.forceProps = true; regen(true); },
  };
  function startDrag(f, R, point) { const d0 = num(f.dist, scope(), 0); return { fid: f.id, at: R.centroid.slice(), dir: featDir(f, R), start: typeof f.dist === 'number' ? f.dist : d0 }; void point; }
  api.drag = viewApp;

  // ---------- variants and print tabs
  const variantsEl = h('div'), printEl = h('div');
  let morph = { a: 0, b: 1, t: 0 };
  function renderVariants() {
    clear(variantsEl); const p = P(), V = p.variants || [];
    variantsEl.appendChild(h('p', { class: 'st-hint', text: 'A variant remembers the numbers of all parameters. Save a few versions of your design, then slide between any two of them to explore the shapes in between.' }));
    const nm = h('input', { class: 'st-in', placeholder: 'Name for this version', style: 'flex:1' });
    variantsEl.appendChild(h('div', { class: 'st-row2' }, nm, h('button', { class: 'st-btn pri', text: 'Save current', onclick: () => { const v = captureVariant(P(), nm.value.trim() || 'Version ' + (V.length + 1)); store.transact('Save variant', (pp) => { pp.variants = pp.variants || []; pp.variants.push(v); }); renderVariants(); } })));
    V.forEach((v, i) => variantsEl.appendChild(h('div', { class: 'st-card' }, h('b', { text: v.name }), h('div', { class: 'st-small', text: Object.keys(v.values).map((k) => k + ' ' + fmt(v.values[k])).join('  ·  ') }),
      h('div', { class: 'st-row2' }, h('button', { class: 'st-btn', text: 'Use this', onclick: () => store.transact('Apply variant', (pp) => applyValues(pp, v.values)) }), h('button', { class: 'st-btn', text: 'Update from current', onclick: () => { const c = captureVariant(P(), v.name); store.transact('Update variant', (pp) => { pp.variants[i] = c; }); renderVariants(); } }), h('button', { class: 'st-btn danger', text: 'Delete', onclick: () => { store.transact('Delete variant', (pp) => { pp.variants.splice(i, 1); }); renderVariants(); } })))));
    if (V.length >= 2) {
      const opt = (sel0) => V.map((v, i) => h('option', { value: i, text: v.name, selected: i === sel0 })), sl = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: morph.t, class: 'fd-slide' });
      const apply = () => { const a = V[morph.a], b = V[morph.b]; if (!a || !b) return; store.transact('Morph', (pp) => applyValues(pp, blendValues(a.values, b.values, morph.t)), { coalesce: 'morph' }); };
      sl.addEventListener('input', () => { morph.t = parseFloat(sl.value); state.drag = true; apply(); }); sl.addEventListener('change', () => { state.drag = false; regen(true); });
      variantsEl.appendChild(h('div', { class: 'st-card' }, h('b', { text: 'Morph between two versions' }), h('div', { class: 'st-row2' }, h('select', { class: 'st-in', onchange: (e) => { morph.a = +e.target.value; } }, opt(morph.a)), h('span', { text: 'to' }), h('select', { class: 'st-in', onchange: (e) => { morph.b = +e.target.value; } }, opt(morph.b))), sl, h('div', { class: 'st-small', text: 'Slide to blend every numeric parameter. Undo returns to where you were.' })));
    }
  }
  const exportQ = { v: 'fine' };
  function renderPrint() {
    if (printEl.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) return;
    clear(printEl); const p = P(), pr = p.print, r = state.result;
    const setPr = (k) => (e) => { const v = parseFloat(e.target.value); if (isNaN(v)) return; store.transact('Print setting', (pp) => { pp.print[k] = v; }, { coalesce: 'pr' + k }); };
    const inp = (l, k, u) => h('label', { class: 'st-row' }, h('span', { text: l }), h('input', { class: 'st-in', value: String(pr[k]), onchange: setPr(k) }), h('span', { class: 'st-unit', text: u || 'mm' }));
    printEl.appendChild(h('p', { class: 'st-hint', text: 'Set the printed height and the printer limits. The shape is scaled, placed on the bed, and checked: closed surface, thin walls, overhangs and bed fit.' }));
    printEl.appendChild(h('div', { class: 'st-card' }, inp('Printed height (0 = as designed)', 'height'), inp('Bed X', 'bedX'), inp('Bed Y', 'bedY'), inp('Bed height', 'bedZ'), inp('Thinnest wall your printer can make', 'minWall'),
      h('label', { class: 'st-row' }, h('span', { text: 'Export quality' }), h('select', { class: 'st-in', onchange: (e) => { exportQ.v = e.target.value; renderPrint(); } }, [['normal', 'Normal'], ['fine', 'Fine'], ['print', 'Very fine (slow)']].map(([v, l]) => h('option', { value: v, text: l, selected: exportQ.v === v }))), h('span'))));
    if (r && r.mesh) {
      let pp = null; try { pp = fieldPrint(p, r.mesh); } catch (e) { pp = null; }
      if (pp) {
        printEl.appendChild(h('div', { class: 'st-card' }, h('b', { text: 'Preview of the print' }), h('div', { class: 'st-small', text: 'Size ' + pp.dims.map((d) => d.toFixed(1)).join(' × ') + ' mm. About ' + pp.volumeCm3.toFixed(1) + ' cm³ of plastic, around ' + Math.round(pp.weightG) + ' g at 50% fill. ' + (pp.stats.watertight ? 'The surface is closed.' : 'The surface is not closed.') + (pp.wallMm !== null ? ' Thinnest wall ' + pp.wallMm.toFixed(2) + ' mm.' : '') + ' ' + Math.round(pp.overhang * 100) + '% overhang.' })));
        pp.warnings.forEach((w) => printEl.appendChild(h('div', { class: 'st-note ' + w.lvl }, h('span', { class: 'tag', text: w.lvl === 'err' ? 'Problem' : (w.lvl === 'warn' ? 'Warning' : 'Note') }), ' ' + w.msg)));
      }
    }
    printEl.appendChild(h('div', { class: 'st-card' }, h('b', { text: 'Export for 3D printing' }), h('div', { class: 'st-row2' }, h('button', { class: 'st-btn pri', text: 'STL', onclick: () => doExport('stl') }), h('button', { class: 'st-btn', text: '3MF', onclick: () => doExport('3mf') }), h('button', { class: 'st-btn', text: 'OBJ (zip)', onclick: () => doExport('obj') }), h('button', { class: 'st-btn', text: 'Project file', onclick: () => saveBytes((p.name || 'field').replace(/[^\w\-]+/g, '_') + '.field.json', 'application/json', serializeField(p)) }))));
  }
  function doExport(kind) {
    els.status.textContent = 'Preparing the export…';
    setTimeout(() => {
      try {
        const res = QUALITY[exportQ.v] || 110, { mesh, ev } = buildMesh(P(), res); if (!mesh) { toast('Nothing to export yet.'); return; }
        const r = fieldPrint(P(), mesh), base = (P().name || 'field').replace(/[^\w\-]+/g, '_') + '_' + Math.round(r.dims[2]) + 'mm';
        if (!r.stats.watertight) toast('The surface has open edges. It was exported anyway; check it in your slicer.');
        if (kind === 'stl') saveBytes(base + '.stl', 'model/stl', encodeSTL(r.tris, P().name)); else if (kind === '3mf') saveBytes(base + '.3mf', 'model/3mf', encode3MF(r.parts, P().name));
        else { const o = encodeOBJ(r.parts, base); saveBytes(base + '_obj.zip', 'application/zip', createZip([{ name: base + '.obj', data: o.obj }, { name: base + '.mtl', data: o.mtl }])); }
        els.status.textContent = 'Exported ' + (r.tris.length / 9 / 1000).toFixed(0) + 'k triangles'; void ev; api.lastExport = r;
      } catch (e) { console.error(e); toast('Export failed: ' + e.message); }
    }, 20);
  }
  api.doExport = doExport;

  // ---------- top bar and layout
  const nameIn = h('input', { class: 'st-name', value: P().name, title: 'Project name', onchange: (e) => store.transact('Rename', (p) => { p.name = e.target.value.trim() || 'Untitled'; }) });
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { load(parseField(String(r.result))); toast('Opened ' + f.name); } catch (x) { toast(x.message); } }; r.readAsText(f); e.target.value = ''; } });
  function load(p) { state.sel = null; state.faceSel = null; state.fitted = false; state.forceTree = state.forceProps = true; store.replace(p); }
  const ask = (o, cb) => { const dlg = els.dlg; clear(dlg); const close = () => { dlg.hidden = true; clear(dlg); }; dlg.appendChild(h('div', { class: 'st-card' }, h('b', { text: o.title }), o.message ? h('div', { class: 'st-small', text: o.message }) : null, h('div', { class: 'st-row2' }, h('button', { class: 'st-btn pri', text: o.ok || 'OK', onclick: () => { close(); cb(); } }), h('button', { class: 'st-btn', text: 'Cancel', onclick: close })))); dlg.hidden = false; };
  const startFrom = (k) => () => { const go = () => load(preset(k)); if (store.undoStack.length) ask({ title: 'Start from this example?', message: 'Your current work stays saved in this browser until you change something. Use File, Save to keep it as a file.', ok: 'Start' }, go); else go(); };
  api.startFrom = (k) => load(preset(k));
  const undo = h('button', { class: 'st-btn ico', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', text: '↶', onclick: () => store.undo() }), redo = h('button', { class: 'st-btn ico', title: 'Redo (Ctrl+Y)', 'aria-label': 'Redo', text: '↷', onclick: () => store.redo() });
  els.undo = undo; els.redo = redo; els.status = h('span', { class: 'fd-status', text: '' }); els.toast = h('div', { class: 'st-toast' }); els.dlg = h('div', { class: 'st-keys', hidden: true });
  const qual = h('select', { class: 'st-in', title: 'Preview quality', onchange: (e) => { state.quality = e.target.value; regen(true); } }, [['draft', 'Draft'], ['normal', 'Normal'], ['fine', 'Fine'], ['print', 'Print']].map(([v, l]) => h('option', { value: v, text: l, selected: v === state.quality })));
  const top = h('div', { class: 'st-top' }, nameIn,
    menu('File', [['New (blank)', () => { const go = () => load(newField('Untitled')); if (store.undoStack.length) ask({ title: 'Start a blank project?', ok: 'Start' }, go); else go(); }], ['Open', () => file.click()], ['Save project', () => saveBytes((P().name || 'field').replace(/[^\w\-]+/g, '_') + '.field.json', 'application/json', serializeField(P()))], 'sep', ['Export STL', () => doExport('stl')], ['Export 3MF', () => doExport('3mf')], ['Export OBJ', () => doExport('obj')]]),
    menu('Start from', PRESETS.map(([k, l]) => [l, startFrom(k)])), undo, redo, h('span', { class: 'st-sep' }), qual, els.status, h('span', { class: 'grow' }), file);
  const vp = h('div', { class: 'fd-vp' }), bar = h('div', { class: 'st-bar3' });
  const tog = (label, key, on) => h('button', { class: 'st-btn tog' + (on ? ' on' : ''), text: label, onclick: (e) => { const v = !view.opts[key]; view.setOpt(key, v); e.target.classList.toggle('on', v); if (key !== 'wire' && state.result) view.setOverlay(state.result.ev, P(), state.sel); } });
  const sideTabs = h('div', { class: 'st-tabs' }), sideBody = h('div', { class: 'st-tabbody' }), panes = { props, variants: variantsEl, print: printEl };
  const showTab = (k) => { Object.keys(panes).forEach((n) => { panes[n].hidden = n !== k; }); Array.prototype.forEach.call(sideTabs.children, (b) => b.classList.toggle('on', b.getAttribute('data-k') === k)); if (k === 'variants') renderVariants(); if (k === 'print') renderPrint(); };
  [['props', 'Properties'], ['variants', 'Variants'], ['print', 'Print']].forEach(([k, l]) => { sideTabs.appendChild(h('button', { 'data-k': k, text: l, onclick: () => showTab(k) })); sideBody.appendChild(panes[k]); });
  const body = h('div', { class: 'fd-body' }, h('div', { class: 'fd-left' }, tree), vp, h('div', { class: 'st-side fd-right' }, h('div', { class: 'st-panels' }, sideTabs, sideBody)));
  root.appendChild(h('div', { class: 'st-app fd-app' }, top, body, els.toast, els.dlg));
  const view = new FieldView(vp, viewApp); api.view = view;
  [['Fit', () => view.fit(state.result && state.result.mesh ? state.result.mesh.bb : null)], ['3D', () => view.view('iso')], ['Top', () => view.view('top')], ['Front', () => view.view('front')], ['Right', () => view.view('right')]].forEach(([l, f]) => bar.appendChild(h('button', { class: 'st-btn', text: l, onclick: f })));
  bar.appendChild(tog('Wireframe', 'wire', false)); bar.appendChild(tog('Planes', 'planes', true)); bar.appendChild(tog('Sketches', 'sketches', true)); vp.appendChild(bar);
  showTab('props'); store.on('change', change); els.undo.disabled = true; els.redo.disabled = true;
  document.addEventListener('keydown', api.onKey = (e) => { if (root.hidden || /INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || '')) return; const k = e.key, mod = e.ctrlKey || e.metaKey; if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); } else if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); store.redo(); } else if (k === 'Escape') { state.faceSel = null; state.attach = null; state.forceProps = true; renderProps(); refreshHighlight(); } });
  run(); setTimeout(() => { if (view.ok) { view.resize(); if (state.result && state.result.mesh) view.fit(state.result.mesh.bb); } }, 50);
  api.destroy = () => { document.removeEventListener('keydown', api.onKey); clearTimeout(regenT); clearTimeout(refT); clearTimeout(saveT); view.destroy(); clear(root); };
  api.sel = sel; api.add = add;
  // for other workspaces: the current field as triangles
  api.meshTris = () => { const { mesh } = buildMesh(P(), QUALITY.normal); if (!mesh) return null; return fieldPrint(P(), mesh).tris; };
  return api;
}
