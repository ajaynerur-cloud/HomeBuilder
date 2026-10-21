// Ductile: a direct solid modeller for the desktop. Push and pull any face in any direction, draw on any face, smooth, pattern, mirror, shell.
import { h, clear } from '../studio/ui/dom.js';
import * as M from './mesh.js';
import { MODS, MOD_ORDER, PATTERN_TYPES, bbox } from './modifiers.js';
import { evaluateObject, soupVolume } from './evaluate.js';
import { newDoc, makeObject, mod, TEMPLATES, fromTemplate, PRIMS, polygonFace } from './doc.js';
import { DuctileView, segDist } from './view.js';
import { logoSVG } from './logo.js';
import { meshCheck } from '../kiln/engine.js';
import { encodeSTL, encode3MF, encodeOBJ } from '../studio/io/meshio.js';
import { createZip } from '../studio/io/zip.js';
import { saveBytes } from '../studio/io/download.js';
import { createPart, partFromProfile } from './part/ui.js';
import { createKiln } from '../kiln/ui.js';
import { createForge } from '../studio/ui/forge.js';
import { createField } from '../field/ui.js';
import { triangulateOriented } from '../studio/forge/mesh.js';

const KEY = 'chp_ductile_v1';
const TOOLS = [['select', 'Select', 'Q'], ['move', 'Move', 'G'], ['push', 'Push / pull', 'E'], ['rotate', 'Rotate', 'R'], ['scale', 'Scale', 'S'], ['inset', 'Inset', 'I'], ['loop', 'Loop cut', 'L'], ['rect', 'Rectangle', 'D'], ['poly', 'Polygon', 'P']];
const ICON = {
  select: 'M6 3l12 8-5.2 1.3L10 18z', move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3', push: 'M4 15h9v5H4zM13 17.5h7M17 14.5l3 3-3 3M8.5 15V6M5.5 9l3-3 3 3', rotate: 'M19 12a7 7 0 1 1-2-4.9M19 4v4h-4',
  scale: 'M4 20V10h10v10zM14 10l6-6M15 4h5v5', inset: 'M3 5h18v14H3zM8 9h8v6H8z', loop: 'M3 6h18v12H3zM12 3v18', rect: 'M4 6h16v12H4zM4 6l0 0', poly: 'M5 18l2-11 8-3 4 9-6 7z',
};
const AXES = [['auto', 'Auto'], ['n', 'Normal'], ['x', 'X'], ['y', 'Y'], ['z', 'Z'], ['free', 'Free']];
const PARAM = { levels: ['Levels', 1, 0, 4], axis: ['Axis'], kind: ['Pattern'], map: ['Mapping'], count: ['Count', 1, 1, 200], rows: ['Rows', 1, 1, 200], cell: ['Cell size', 1, 1, 1e5], depth: ['Depth', 0.1, -1e4, 1e4], round: ['Roundness', 0.05, 0.05, 4], twist: ['Spiral turns', 0.05, -20, 20],
  amp: ['Amplitude', 0.5, -1e4, 1e4], start: ['Starts at', 0.01, 0, 0.99], power: ['Curve', 0.1, 0.2, 6], angle: ['Angle °', 1, -3600, 3600], top: ['Top scale', 0.01, 0, 10], mode: ['Mode'], dx: ['Step X', 1, -1e6, 1e6], dy: ['Step Y', 1, -1e6, 1e6], dz: ['Step Z', 1, -1e6, 1e6], thickness: ['Thickness', 0.1, -1e4, 1e4] };
const CHOICES = { axis: [['x', 'X'], ['y', 'Y'], ['z', 'Z']], kind: PATTERN_TYPES, map: [['cylinder', 'Around Z (vessels, columns)'], ['front', 'Front plane (XZ)'], ['side', 'Side plane (YZ)'], ['top', 'Top plane (XY)']], mode: [['linear', 'Linear'], ['radial', 'Radial around Z']] };
const AXV = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

export function createDuctile(root, deps = {}) {
  let doc = null; if (!deps.noSave) { try { const j = localStorage.getItem(KEY); if (j) { const o = JSON.parse(j); if (o && o.kind === 'ductile') doc = o; } } catch (e) { /* storage blocked */ } }
  const firstRun = !doc; if (!doc) doc = newDoc();
  const st = { active: null, mode: 'object', sel: { objects: new Set(), verts: new Set(), edges: new Set(), faces: new Set() }, tool: 'select', axis: 'auto', soft: 0, snap: 0, modal: null, draw: null, hover: null, typed: '' };
  const cache = new Map(); let hist = [JSON.stringify(doc)], hi = 0, saveT = null, pickCache = null;
  const app = {};

  // ---------- layout
  const logo = h('span', { class: 'dx-logo' }); logo.innerHTML = logoSVG(30);
  const menu = (label, items) => { const d = h('details', { class: 'dx-menu' }), box = h('div', { class: 'dx-menuitems' }); items.forEach((it) => { if (it === '-') box.appendChild(h('div', { class: 'dx-msep' })); else if (typeof it === 'string') box.appendChild(h('div', { class: 'dx-mhead', text: it })); else box.appendChild(h('button', { text: it[0], onclick: () => { d.open = false; it[1](); } })); }); d.append(h('summary', { text: label }), box); return d; };
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => openFile(e) });
  const fileMenu = menu('File', [['New empty scene', () => loadDoc(newDoc(), 'New scene.')], ['Open…', () => fileIn.click()], ['Save design (.json)', () => saveBytes(base() + '.ductile.json', 'application/json', JSON.stringify(doc))], '-', ['Export print pack (STL, 3MF, OBJ)', () => exportPack()], '-', 'Start from an example', ...Object.keys(TEMPLATES).map((k) => [TEMPLATES[k].label, () => loadDoc(fromTemplate(k), TEMPLATES[k].label + ' loaded.')])]);
  const addMenu = menu('Add', Object.keys(PRIMS).map((k) => [PRIMS[k].label, () => addPrim(k)]));
  const viewMenu = menu('View', [['Frame all  (F)', () => frame()], ['Iso view', () => view.view('iso')], ['Front', () => view.view('front')], ['Right', () => view.view('right')], ['Top', () => view.view('top')], ['Back', () => view.view('back')]]);
  const undoB = h('button', { class: 'dx-btn ico', text: '↶', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: () => restore(hi - 1) }), redoB = h('button', { class: 'dx-btn ico', text: '↷', title: 'Redo (Ctrl+Y)', 'aria-label': 'Redo', onclick: () => restore(hi + 1) });
  const modeSeg = [['object', 'Object'], ['vert', 'Vertex'], ['edge', 'Edge'], ['face', 'Face']].map(([k, l]) => h('button', { text: l, title: { object: 'Tab', vert: '1', edge: '2', face: '3' }[k], onclick: () => setMode(k) }));
  const nameIn = h('input', { class: 'dx-name', value: doc.name, 'aria-label': 'Scene name', onchange: (e) => { doc.name = e.target.value.trim() || 'Untitled'; commit(); } });
  const WS = [['sub', 'Subdivision', 'Push and pull cage modelling with smoothing, patterns and modifiers'], ['part', 'CAD (exact)', 'Sketches with lines, splines, arcs and constraints; extrude, cut, revolve, loft, sweep; surfaces and thicken; fillets, shells, drawings, STEP. Dimension-driven solids on an exact CAD kernel: sketches, history, booleans, fillets, drawings, STEP'], ['vessel', 'Vessel', 'Vessels with engineering constraints: capacity, stability, printability, intent drag'], ['forge', 'Forge', 'Sketch and push or pull vessels with modifiers and edits, for printing'], ['field', 'Field', 'Density-field modelling: smooth blends, shells and lattices that stay watertight']];
  const wsSeg = WS.map(([k, l, t]) => h('button', { text: l, title: t, onclick: () => setWorkspace(k) }));
  const subOnly = h('span', { class: 'dx-subonly' });
  const top = h('div', { class: 'dx-top' }, h('div', { class: 'dx-brand' }, logo, h('div', null, h('b', { text: 'Ductile' }), h('small', { text: 'shape anything, directly' }))), h('div', { class: 'dx-seg ws' }, wsSeg), subOnly, fileMenu, addMenu, viewMenu, undoB, redoB, nameIn, h('span', { class: 'dx-grow' }), h('div', { class: 'dx-seg', title: 'Selection mode' }, modeSeg), h('button', { class: 'dx-btn ico', text: '?', title: 'Keys', onclick: () => { keys.hidden = !keys.hidden; } }), fileIn);
  const toolB = {}; const rail = h('div', { class: 'dx-rail' }, TOOLS.map(([k, l, key], i) => { const b = h('button', { class: 'dx-tool', title: l + '  (' + key + ')', 'aria-label': l, onclick: () => setTool(k) }); b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + ICON[k] + '"/></svg>'; b.appendChild(h('span', { text: l.split(' ')[0] })); toolB[k] = b; return [i === 1 || i === 5 || i === 7 ? h('div', { class: 'dx-rsep' }) : null, b]; }));
  const axisSeg = AXES.map(([k, l]) => h('button', { text: l, onclick: () => { st.axis = k; syncBar(); if (st.modal) modalMove(st.modal.lastX, st.modal.lastY); } }));
  const softIn = h('input', { class: 'dx-in sm', type: 'number', min: 0, step: 1, value: 0, title: 'Soft selection radius: nearby points follow with a smooth falloff', onchange: (e) => { st.soft = Math.max(0, +e.target.value || 0); } });
  const snapSel = h('select', { class: 'dx-in', title: 'Snap step', onchange: (e) => { st.snap = +e.target.value; } }, [[0, 'Off'], [0.5, '0.5 mm'], [1, '1 mm'], [5, '5 mm'], [10, '10 mm'], [50, '50 mm'], [100, '100 mm'], [500, '500 mm'], [1000, '1 m']].map(([v, l]) => h('option', { value: v, text: l })));
  const typedEl = h('span', { class: 'dx-typed' });
  const opts = h('div', { class: 'dx-opts' }, h('span', { class: 'dx-lbl', text: 'Direction' }), h('div', { class: 'dx-seg sm' }, axisSeg), h('span', { class: 'dx-lbl', text: 'Soft' }), softIn, h('span', { class: 'dx-lbl', text: 'Snap' }), snapSel, h('span', { class: 'dx-grow' }), typedEl);
  const vp = h('div', { class: 'dx-vp' }), status = h('div', { class: 'dx-status' }), hintEl = h('span', { class: 'dx-grow' }), infoEl = h('span', { class: 'dx-info' }); status.append(hintEl, infoEl);
  const toastEl = h('div', { class: 'dx-toast' }), boxEl = h('div', { class: 'dx-box', hidden: true });
  const side = h('div', { class: 'dx-side' });
  const keys = h('div', { class: 'dx-keys', hidden: true, onclick: () => { keys.hidden = true; } }, h('div', { class: 'dx-card' }, h('b', { text: 'Keys' }),
    h('p', { text: 'Tools: Q select, G move, E push or pull, R rotate, S scale, I inset, L loop cut, D rectangle, P polygon. Tab switches object and edit; 1 vertex, 2 edge, 3 face.' }),
    h('p', { text: 'While moving: X, Y, Z or N lock the direction, F frees it. Type a number and press Enter for an exact value. Esc or right click cancels.' }),
    h('p', { text: 'Rectangle: click two corners on the ground or on any face, or type width,depth and press Enter. Then push or pull it.' }),
    h('p', { text: 'Camera: right drag orbits, Shift + right drag pans, wheel zooms, Alt + left drag also orbits. F frames everything.' }),
    h('p', { text: 'Edit: A all or nothing, Alt + click an edge selects its loop, B bridges two faces, M merges points, Shift+E creases edges, X deletes, Shift+D duplicates an object, Ctrl+Z and Ctrl+Y undo and redo.' })));
  const welcome = h('div', { class: 'dx-welcome', hidden: true });
  const desk = h('div', { class: 'dx-desk', hidden: true }, h('div', { class: 'dx-card' }, h('b', { text: 'Ductile is a desktop modeller' }), h('p', { text: 'It is built for a mouse and keyboard on a larger screen. Open this page on a computer for the best experience.' }), h('button', { class: 'dx-btn pri', text: 'Open anyway', onclick: () => { desk.hidden = true; } })));
  const bodyEl = h('div', { class: 'dx-body' }, rail, h('div', { class: 'dx-main' }, opts, h('div', { class: 'dx-stage' }, vp, boxEl, toastEl, welcome), status), side), partHost = h('div', { class: 'dx-parthost dx-wshost', hidden: true }), vesselHost = h('div', { class: 'dx-wshost', hidden: true }), forgeHost = h('div', { class: 'dx-wshost', hidden: true }), fieldHost = h('div', { class: 'dx-wshost', hidden: true }), wsToast = h('div', { class: 'dx-toast dx-wstoast' });
  const appEl = h('div', { class: 'dx-app' }, top, bodyEl, partHost, vesselHost, forgeHost, fieldHost, wsToast, keys, desk);
  let partWs = null, vesselWs = null, forgeWs = null, fieldWs = null, ws = 'sub';
  const wsNote = (t) => { wsToast.textContent = t; wsToast.classList.add('on'); clearTimeout(wsNote.t); wsNote.t = setTimeout(() => wsToast.classList.remove('on'), 4200); };
  // any triangle list -> an editable cage (exact weld on float32 bits)
  function soupToCage(tris) { const f32 = tris instanceof Float32Array ? tris : Float32Array.from(tris), map = new Map(), V = [], F = []; for (let t = 0; t < f32.length / 9; t++) { const ids = []; for (let k = 0; k < 3; k++) { const o = t * 9 + k * 3, key = f32[o] + ',' + f32[o + 1] + ',' + f32[o + 2]; let id = map.get(key); if (id === undefined) { id = V.length; map.set(key, id); V.push([f32[o], f32[o + 1], f32[o + 2]]); } ids.push(id); } if (ids[0] !== ids[1] && ids[1] !== ids[2] && ids[0] !== ids[2]) F.push(ids); } return { V, F, C: {} }; }
  function receiveMesh(name, cage, from) { const o = makeObject(name + ' (from ' + from + ')', cage, { color: '#b9c3cc', angle: 30 }); placeNew(o); doc.objects.push(o); st.active = o.id; st.mode = 'object'; clearSel(); commit(); setWorkspace('sub'); refresh(); renderSide(); frame(); toast('Copied here from ' + from + ' as a mesh. Smooth, pattern or push it like any object.'); }
  function ensurePart(initial) { if (!partWs) partWs = createPart(partHost, { noSave: deps.noSave, kernelOpts: deps.kernelOpts, initial, onSendMesh: (name, cage) => receiveMesh(name, cage, 'Part') }); else if (initial) partWs.api.started.then(() => { partWs.api.part = initial; partWs.api.commit(); partWs.api.rebuild(); partWs.api.renderAll(); partWs.api.fit(); }); return partWs; }
  function setWorkspace(k) {
    ws = k; wsSeg.forEach((b, i) => b.classList.toggle('on', WS[i][0] === k)); bodyEl.hidden = k !== 'sub'; partHost.hidden = k !== 'part'; vesselHost.hidden = k !== 'vessel'; forgeHost.hidden = k !== 'forge'; fieldHost.hidden = k !== 'field'; appEl.classList.toggle('dx-partmode', k !== 'sub');
    if (k === 'part') { if (!partWs) ensurePart(); else partWs.resize(); }
    else if (k === 'vessel') {
      if (!vesselWs) { vesselWs = createKiln(vesselHost, { noSave: deps.noSave, onSendMesh: (name, tris) => receiveMesh(name, soupToCage(tris), 'Vessel'), onSendProfile: (name, pts, wall, note) => { ensurePart(partFromProfile(name, pts, wall)); setWorkspace('part'); wsNote('Sent to Part as an exact revolved solid with a ' + wall + ' mm shell.' + (note ? ' ' + note : '')); } }); window.__kiln = vesselWs; }
      else { vesselWs.view.resize(); vesselWs.app.rebuild(); }
    }
    else if (k === 'forge') {
      if (!forgeWs) { forgeWs = createForge(forgeHost, {}); window.__forge = forgeWs; forgeHost.prepend(h('div', { class: 'dx-wsbar' }, h('span', { class: 'dx-small', text: 'Forge results can continue in other workspaces:' }), h('button', { class: 'dx-btn sm', text: 'Send to Subdivision', onclick: () => { try { const m = forgeWs.app.current.mesh, t = triangulateOriented(m); receiveMesh('Forge model', soupToCage(t.tris), 'Forge'); } catch (e) { wsNote('Could not copy the Forge model: ' + (e.message || e)); } } }))); }
      else { if (forgeWs.view.resize) forgeWs.view.resize(); if (forgeWs.prof && forgeWs.prof.resize) forgeWs.prof.resize(); }
    }
    else if (k === 'field') {
      if (!fieldWs) { fieldWs = createField(fieldHost, {}); window.__field = fieldWs; fieldHost.prepend(h('div', { class: 'dx-wsbar' }, h('span', { class: 'dx-small', text: 'Field results can continue in other workspaces:' }), h('button', { class: 'dx-btn sm', text: 'Send to Subdivision', onclick: () => { try { const t = fieldWs.meshTris(); if (!t || !t.length) { wsNote('Nothing to send yet.'); return; } receiveMesh('Field model', soupToCage(t), 'Field'); } catch (e) { wsNote('Could not send: ' + (e.message || e)); } } }))); }
      else if (fieldWs.view && fieldWs.view.resize) fieldWs.view.resize();
    }
    else { view.resize(); refresh(); }
  }
  root.appendChild(appEl);
  const view = new DuctileView(vp); if (!view.ok) vp.appendChild(h('div', { class: 'dx-msg', text: 'WebGL is not available here, so the 3D view cannot start.' }));
  try { const narrow = Math.min(window.innerWidth || 1200, (window.screen && window.screen.width) || 1200) < 900, coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches; desk.hidden = !(narrow || coarse); } catch (e) { /* no matchMedia */ }

  // ---------- helpers
  const obj = (id) => doc.objects.find((o) => o.id === id), act = () => obj(st.active);
  const base = () => (doc.name || 'ductile').replace(/[^\w\-]+/g, '_').toLowerCase();
  function toast(t) { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('on'), 3600); }
  function commit() { const s = JSON.stringify(doc); if (s !== hist[hi]) { hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 120) hist.shift(); hi = hist.length - 1; } syncBar(); if (!deps.noSave) { clearTimeout(saveT); saveT = setTimeout(() => { try { if (s.length < 4e6) localStorage.setItem(KEY, s); } catch (e) { /* full */ } }, 500); } }
  function restore(i) { if (i < 0 || i >= hist.length || st.modal) return; hi = i; doc = JSON.parse(hist[hi]); nameIn.value = doc.name; cache.clear(); pickCache = null; if (!obj(st.active)) { st.active = null; setMode('object'); } clearSel(); refresh(); renderSide(); syncBar(); }
  function loadDoc(d, msg) { doc = d; nameIn.value = d.name; cache.clear(); pickCache = null; st.active = d.objects[0] ? d.objects[0].id : null; st.mode = 'object'; clearSel(); if (st.active) st.sel.objects.add(st.active); commit(); refresh(); frame(); renderSide(); welcome.hidden = true; if (msg) toast(msg); }
  function clearSel() { st.sel.verts.clear(); st.sel.edges.clear(); st.sel.faces.clear(); if (st.mode === 'object') st.sel.objects = new Set(st.active ? [st.active] : []); }
  function dirty(id) { cache.delete(id); if (id === st.active) pickCache = null; }
  function evalObj(o, q) { let c = cache.get(o.id); if (!c || c.q !== q) { const e = evaluateObject(o, q); c = { q, soup: e.soup, mesh: e.mesh }; cache.set(o.id, c); } return c; }

  // ---------- selection geometry
  function selVerts() { const o = act(); if (!o) return []; const c = o.cage, s = new Set(); if (st.mode === 'vert') st.sel.verts.forEach((i) => s.add(i)); else if (st.mode === 'edge') st.sel.edges.forEach((k) => k.split('_').forEach((x) => s.add(+x))); else if (st.mode === 'face') st.sel.faces.forEach((f) => c.F[f] && c.F[f].forEach((i) => s.add(i))); return [...s].filter((i) => i < c.V.length); }
  function selNormal() {
    const o = act(); if (!o || st.mode === 'object') return [0, 0, 1]; const c = o.cage; let fs = [...st.sel.faces];
    if (st.mode !== 'face') { const vs = new Set(selVerts()); fs = c.F.map((f, i) => i).filter((i) => c.F[i].some((v) => vs.has(v))); }
    const n = [0, 0, 0]; fs.forEach((f) => { const fn = M.faceNormal(c.V, c.F[f]); n[0] += fn[0]; n[1] += fn[1]; n[2] += fn[2]; }); return M.len(n) > 1e-9 ? M.unit(n) : [0, 0, 1];
  }
  function objBox(ids) { const mn = [1e18, 1e18, 1e18], mx = [-1e18, -1e18, -1e18]; ids.forEach((id) => { const o = obj(id); if (!o) return; o.cage.V.forEach((v) => { for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } }); }); return { mn, mx }; }
  function pivot() { if (st.mode === 'object') { if (!st.sel.objects.size) return null; const b = objBox([...st.sel.objects]); return [(b.mn[0] + b.mx[0]) / 2, (b.mn[1] + b.mx[1]) / 2, (b.mn[2] + b.mx[2]) / 2]; } const vs = selVerts(), o = act(); return vs.length ? M.avg(vs.map((i) => o.cage.V[i])) : null; }
  const hasSel = () => (st.mode === 'object' ? st.sel.objects.size > 0 : selVerts().length > 0);

  // ---------- refresh scene
  function refresh(q) {
    const ids = new Set(); doc.objects.forEach((o) => { ids.add(o.id); const c = evalObj(o, q === 'draft' && o.id === st.active ? 'draft' : 'full'); view.setObject(o, c.soup, { selected: st.mode === 'object' && st.sel.objects.has(o.id), xray: st.mode !== 'object' && o.id === st.active }); });
    view.dropMissing(ids); const o = act();
    view.drawEdit(st.mode !== 'object' && o ? o.cage : null, st.sel, st.mode, st.hover && st.hover.preview);
    const showG = ['select', 'move', 'push', 'rotate', 'scale'].includes(st.tool) && hasSel() && !st.draw;
    view.drawGizmo(showG ? pivot() : null, st.mode !== 'object' ? selNormal() : null, st.modal && st.modal.axisKey);
    if (st.draw) view.drawPreview([st.draw.preview || []]); else if (!(st.hover && st.hover.preview)) view.drawPreview([]);
    view.render(); status1(); welcome.hidden = doc.objects.length > 0 || !firstRunShown;
  }
  function status1() {
    const o = act(); let info = doc.objects.length + ' object' + (doc.objects.length === 1 ? '' : 's');
    if (o) { const c = cache.get(o.id); if (c) info += '  ·  ' + o.name + ': ' + c.soup.nt.toLocaleString() + ' triangles'; }
    if (st.mode !== 'object') info += '  ·  ' + (st.mode === 'vert' ? st.sel.verts.size + ' points' : st.mode === 'edge' ? st.sel.edges.size + ' edges' : st.sel.faces.size + ' faces') + ' selected';
    infoEl.textContent = info;
    hintEl.textContent = st.modal ? modalHint() : st.draw ? (st.draw.kind === 'rect' ? 'Click the opposite corner, or type width,depth and press Enter. Esc cancels.' : 'Click points. Enter or double click closes the polygon. Esc cancels.') : ({
      select: 'Click to select, drag on empty space to box select. Drag the gizmo arrows to move along them.', move: 'Drag the selection or a gizmo arrow. Or press G and move the mouse.', push: 'Press on any face and drag to push or pull it. Press X, Y, Z, N or F while dragging to change the direction, or type a distance.',
      rotate: 'Drag to rotate around the view, or drag a gizmo arrow to rotate around that axis.', scale: 'Drag to scale from the pivot. Use a gizmo arrow to scale along one axis.', inset: 'Press on a face and drag inward to inset it.', loop: 'Hover an edge to preview, click to cut a new edge loop across it.', rect: 'Click the first corner on the ground or on any flat face.', poly: 'Click the first point on the ground or on any flat face.' })[st.tool];
    typedEl.textContent = st.typed ? 'Typed: ' + st.typed : '';
  }
  function modalHint() { const m = st.modal; return { move: 'Moving', extrude: 'Pushing / pulling', rotate: 'Rotating', scale: 'Scaling', inset: 'Inset' }[m.kind] + ' ' + (m.value != null ? fmt(m.value) + (m.kind === 'rotate' ? '°' : m.kind === 'scale' ? '×' : ' mm') : '') + '  ·  direction ' + (m.axisKey || 'free') + '  ·  click or Enter to finish, Esc to cancel, X Y Z N F to change direction'; }
  function syncBar() {
    modeSeg.forEach((b, i) => b.classList.toggle('on', ['object', 'vert', 'edge', 'face'][i] === st.mode)); Object.keys(toolB).forEach((k) => toolB[k].classList.toggle('on', k === st.tool));
    axisSeg.forEach((b, i) => b.classList.toggle('on', AXES[i][0] === st.axis)); undoB.disabled = hi === 0; redoB.disabled = hi >= hist.length - 1; status1();
  }
  function frame() { if (!doc.objects.length) { view.fit([-100, -100, 0], [100, 100, 100]); return; } const b = objBox(doc.objects.filter((o) => o.visible !== false).map((o) => o.id)); view.fit(b.mn, b.mx); }

  // ---------- modes, tools, objects
  function setMode(m) {
    if (st.modal) return; if (m !== 'object' && !act()) { const first = [...st.sel.objects][0] || (doc.objects[0] && doc.objects[0].id); if (!first) { toast('Add or draw an object first.'); return; } st.active = first; }
    const prev = st.mode; st.mode = m;
    clearSel(); refresh(); renderSide(); syncBar();
  }
  function setTool(t) { if (st.modal) return; st.tool = t; st.draw = null; st.hover = null; if ((t === 'inset' || t === 'loop') && st.mode === 'object' && act()) setMode(t === 'loop' ? 'edge' : 'face'); refresh(); syncBar(); }
  function addPrim(k) { const o = makeObject(PRIMS[k].label, PRIMS[k].make(), { mods: k === 'sphere' || k === 'torus' ? [mod('smooth', { levels: 2 })] : [] }); placeNew(o); doc.objects.push(o); st.active = o.id; st.mode = 'object'; clearSel(); commit(); refresh(); renderSide(); if (doc.objects.length === 1) frame(); toast(PRIMS[k].label + ' added. Press E and drag a face to push or pull it.'); }
  function placeNew(o) { if (doc.objects.length === 0) return; const b = objBox(doc.objects.map((x) => x.id)), ob = bbox(o.cage.V), dx = b.mx[0] - ob.mn[0] + (b.mx[0] - b.mn[0]) * 0.15 + 20; o.cage.V = o.cage.V.map((v) => [v[0] + dx, v[1], v[2]]); }
  function duplicate() { const out = []; st.sel.objects.forEach((id) => { const o = obj(id); if (!o) return; const c = JSON.parse(JSON.stringify(o)); c.id = makeObject('x', { V: [], F: [], C: {} }).id; c.name = o.name + ' copy'; doc.objects.push(c); out.push(c.id); }); if (out.length) { st.sel.objects = new Set(out); st.active = out[0]; commit(); refresh(); renderSide(); startModal('move', { drag: false }); } }
  function deleteSel() {
    if (st.mode === 'object') { if (!st.sel.objects.size) return; doc.objects = doc.objects.filter((o) => !st.sel.objects.has(o.id)); st.sel.objects.clear(); st.active = doc.objects[0] ? doc.objects[0].id : null; cache.clear(); commit(); refresh(); renderSide(); return; }
    const o = act(); if (!o) return; const c = o.cage;
    if (st.mode === 'face') M.deleteFaces(c, [...st.sel.faces]); else { const vs = new Set(selVerts()); M.deleteFaces(c, c.F.map((f, i) => i).filter((i) => c.F[i].some((v) => vs.has(v)))); }
    if (!c.F.length) { doc.objects = doc.objects.filter((x) => x.id !== o.id); st.active = null; st.mode = 'object'; }
    clearSel(); dirty(o.id); commit(); refresh(); renderSide(); toast('Deleted. Open edges stay open; add a Shell modifier or bridge to close them.');
  }

  // ---------- modal transforms: the heart of push/pull in any direction
  function startModal(kind, o = {}) {
    if (st.modal) return; const objMode = st.mode === 'object', ids = objMode ? [...st.sel.objects] : (act() ? [st.active] : []); if (!ids.length || !hasSel()) { toast('Select something first.'); return; }
    const before = ids.map((id) => ({ id, cage: M.clone(obj(id).cage) }));
    if (kind === 'extrude') { if (objMode || st.mode !== 'face' || !st.sel.faces.size) { if (st.mode === 'edge' || st.mode === 'vert') { toast('Push and pull works on faces. Switch to face mode (3).'); return; } toast('Pick a face to push or pull.'); return; } M.extrude(act().cage, [...st.sel.faces], [0, 0, 0]); }
    let insetFaces = null; if (kind === 'inset') { if (st.mode !== 'face' || !st.sel.faces.size) { toast('Pick faces to inset.'); return; } insetFaces = [...st.sel.faces]; }
    const p = pivot(), n = objMode ? [0, 0, 1] : selNormal(), weights = new Map();
    ids.forEach((id) => { const c = obj(id).cage; if (objMode) weights.set(id, new Map(c.V.map((v, i) => [i, 1]))); else weights.set(id, M.softWeights(c, selVerts(), st.soft)); });
    const axisKey = o.axis || (st.axis !== 'auto' ? st.axis : (kind === 'extrude' ? 'n' : kind === 'move' ? 'free' : kind === 'rotate' ? (objMode ? 'z' : 'n') : null));
    st.modal = { kind, ids, before, start: ids.map((id) => ({ id, cage: M.clone(obj(id).cage) })), pivot: p, normal: n, weights, axisKey, drag: !!o.drag, x0: o.x, y0: o.y, lastX: o.x, lastY: o.y, value: 0, insetFaces };
    st.typed = ''; if (o.x == null && st.mouse) { st.modal.x0 = st.mouse[0]; st.modal.y0 = st.mouse[1]; st.modal.lastX = st.mouse[0]; st.modal.lastY = st.mouse[1]; }
    syncBar(); refresh('draft');
  }
  function axisVec(k, n) { return k === 'n' ? n : AXV[k] || null; }
  function modalMove(x, y) {
    const m = st.modal; if (!m || x == null) return; m.lastX = x; m.lastY = y; const typed = st.typed !== '' && isFinite(parseFloat(st.typed)) ? parseFloat(st.typed) : null;
    m.start.forEach((s) => { const o = obj(s.id); o.cage = M.clone(s.cage); });
    const ax = axisVec(m.axisKey, m.normal), P = view.screen(m.pivot), r = view.canvas.getBoundingClientRect(), sx = x - r.left, sy = y - r.top, sx0 = m.x0 - r.left, sy0 = m.y0 - r.top;
    if (m.kind === 'move' || m.kind === 'extrude') {
      let D;
      if (ax) { const a0 = view.axisParam(m.x0, m.y0, m.pivot, ax), a1 = view.axisParam(x, y, m.pivot, ax); let t = typed != null ? typed : (a0 == null || a1 == null ? 0 : a1 - a0); if (st.snap && typed == null) t = Math.round(t / st.snap) * st.snap; m.value = t; D = M.mul(M.unit(ax), t); }
      else { const vd = view.viewDir(), p0 = view.onPlane(m.x0, m.y0, m.pivot, vd), p1 = view.onPlane(x, y, m.pivot, vd); D = p0 && p1 ? M.sub(p1, p0) : [0, 0, 0]; if (st.snap) D = D.map((c) => Math.round(c / st.snap) * st.snap); if (typed != null && M.len(D) > 1e-9) D = M.mul(M.unit(D), typed); m.value = M.len(D); }
      m.ids.forEach((id) => M.translate(obj(id).cage, m.weights.get(id), D));
    } else if (m.kind === 'rotate') {
      let ang = Math.atan2(sy - P[1], sx - P[0]) - Math.atan2(sy0 - P[1], sx0 - P[0]); let deg = -ang * 180 / Math.PI; if (typed != null) deg = typed; else if (st.snap) deg = Math.round(deg / 5) * 5; m.value = deg;
      let A = ax ? M.unit(ax) : M.mul(view.viewDir(), -1); if (!ax) { const vd = view.viewDir(); A = [-vd[0], -vd[1], -vd[2]]; }
      m.ids.forEach((id) => M.rotateAbout(obj(id).cage, m.weights.get(id), m.pivot, A, deg * Math.PI / 180));
    } else if (m.kind === 'scale') {
      const d0 = Math.max(4, Math.hypot(sx0 - P[0], sy0 - P[1])), d1 = Math.hypot(sx - P[0], sy - P[1]); let f = typed != null ? typed : d1 / d0; if (st.snap && typed == null) f = Math.round(f * 20) / 20; m.value = f;
      const s = ax && m.axisKey !== 'n' ? [m.axisKey === 'x' ? f : 1, m.axisKey === 'y' ? f : 1, m.axisKey === 'z' ? f : 1] : [f, f, f];
      m.ids.forEach((id) => M.scaleAbout(obj(id).cage, m.weights.get(id), m.pivot, s));
    } else if (m.kind === 'inset') {
      const wpp = 2 * view.camS.dist * Math.tan(view.cam.fov * Math.PI / 360) / Math.max(1, view.canvas.clientHeight || 500); let t = typed != null ? typed : Math.max(0, (Math.hypot(sx0 - P[0], sy0 - P[1]) - Math.hypot(sx - P[0], sy - P[1])) * wpp); if (st.snap && typed == null) t = Math.round(t / st.snap) * st.snap; m.value = t;
      if (t > 1e-6) M.inset(act().cage, m.insetFaces, t);
    }
    m.ids.forEach((id) => dirty(id)); refresh('draft');
  }
  function confirmModal() {
    const m = st.modal; if (!m) return; if (m.lastX != null) modalMove(m.lastX, m.lastY);
    if ((m.kind === 'extrude' || m.kind === 'move') && Math.abs(m.value || 0) < 1e-6 && m.kind === 'extrude') { cancelModal(); return; }
    m.ids.forEach((id) => { M.fixOrientation(obj(id).cage); dirty(id); }); st.modal = null; st.typed = ''; commit(); refresh(); renderSide(); syncBar();
  }
  function cancelModal() { const m = st.modal; if (!m) return; m.before.forEach((b) => { obj(b.id).cage = b.cage; dirty(b.id); }); st.modal = null; st.typed = ''; refresh(); syncBar(); }

  // ---------- picking in edit mode
  function cagePickOf(o) { if (!pickCache || pickCache.id !== o.id) pickCache = { id: o.id, p: view.cagePick(o.cage) }; return pickCache.p; }
  function pickComp(x, y) {
    const o = act(); if (!o) return null; const c = o.cage, r = view.canvas.getBoundingClientRect(), px = x - r.left, py = y - r.top;
    if (st.mode === 'vert') { let best = -1, bd = 12, bz = 9; c.V.forEach((v, i) => { const s = view.screen(v), d = Math.hypot(s[0] - px, s[1] - py); if (d < bd || (d < 12 && Math.abs(d - bd) < 2 && s[2] < bz)) { bd = d; best = i; bz = s[2]; } }); return best >= 0 ? { vert: best } : null; }
    if (st.mode === 'edge') { const seen = new Set(); let best = null, bd = 9; c.F.forEach((f) => f.forEach((a, k) => { const b = f[(k + 1) % f.length], key = M.ekey(a, b); if (seen.has(key)) return; seen.add(key); const A = view.screen(c.V[a]), B = view.screen(c.V[b]), d = segDist(px, py, A[0], A[1], B[0], B[1]); if (d < bd) { bd = d; const t = Math.max(0.1, Math.min(0.9, ((px - A[0]) * (B[0] - A[0]) + (py - A[1]) * (B[1] - A[1])) / (((B[0] - A[0]) ** 2 + (B[1] - A[1]) ** 2) || 1))); best = { edge: key, a, b, t }; } })); return best; }
    const hit = view.pickCage(cagePickOf(o), x, y); return hit ? { face: hit.face, point: hit.point } : null;
  }
  function toggle(set, k, add) { if (add) { if (set.has(k)) set.delete(k); else set.add(k); } else { set.clear(); set.add(k); } }
  // face of any object under the cursor (used by push/pull and drawing)
  function faceUnder(x, y) {
    const hitO = view.pickObject(x, y); const order = hitO ? [obj(hitO.id)].concat(doc.objects.filter((o) => o.id !== hitO.id)) : doc.objects;
    for (const o of order) { if (!o || o.visible === false) continue; const pk = o.id === st.active ? cagePickOf(o) : view.cagePick(o.cage), h2 = view.pickCage(pk, x, y); if (h2) return { o, face: h2.face, point: h2.point }; }
    return null;
  }

  // ---------- drawing on the ground or on any flat face
  function drawPlaneAt(x, y) {
    const fu = faceUnder(x, y);
    if (fu) { const c = fu.o.cage, f = c.F[fu.face], n = M.faceNormal(c.V, f), flat = f.every((i) => Math.abs(M.dot(M.sub(c.V[i], c.V[f[0]]), n)) < 1e-3 * (1 + M.len(M.sub(c.V[f[1]], c.V[f[0]])))); if (flat) { const u = M.unit(M.sub(c.V[f[1]], c.V[f[0]])), v = M.cross(n, u); return { o: fu.o, face: fu.face, p: fu.point, n, u, v }; } }
    const g = view.onPlane(x, y, [0, 0, 0], [0, 0, 1]); return g ? { o: null, face: -1, p: g, n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] } : null;
  }
  const snapPt = (pl, p) => { if (!st.snap) return p; const d = M.sub(p, pl.p0 || pl.p), a = Math.round(M.dot(d, pl.u) / st.snap) * st.snap, b = Math.round(M.dot(d, pl.v) / st.snap) * st.snap; return M.add(pl.p0 || pl.p, M.add(M.mul(pl.u, a), M.mul(pl.v, b))); };
  function rectPts(pl, a, b) { const d = M.sub(b, a), du = M.dot(d, pl.u), dv = M.dot(d, pl.v); return [a, M.add(a, M.mul(pl.u, du)), M.add(a, M.add(M.mul(pl.u, du), M.mul(pl.v, dv))), M.add(a, M.mul(pl.v, dv))]; }
  function finishDraw(pts) {
    const d = st.draw; st.draw = null; if (!pts || pts.length < 3) { refresh(); return; }
    const area = M.len(pts.slice(1).reduce((acc, p, i) => { if (i === pts.length - 2) return acc; return M.add(acc, M.cross(M.sub(p, pts[0]), M.sub(pts[i + 2], pts[0]))); }, [0, 0, 0])); if (area < 1e-6) { toast('That shape has no area.'); refresh(); return; }
    if (d.plane.o) {
      const o = d.plane.o, c = o.cage, f = c.F[d.plane.face], n = d.plane.n, inside = (p) => { for (let k = 0; k < f.length; k++) { const a = c.V[f[k]], b = c.V[f[(k + 1) % f.length]]; if (M.dot(M.cross(M.sub(b, a), M.sub(p, a)), n) < -1e-6) return false; } return true; };
      const convex = pts.every((p, k) => M.dot(M.cross(M.sub(pts[(k + 1) % pts.length], p), M.sub(pts[(k + 2) % pts.length], pts[(k + 1) % pts.length])), n) * Math.sign(M.dot(M.cross(M.sub(pts[1], pts[0]), M.sub(pts[2], pts[1])), n) || 1) >= -1e-6);
      if (!pts.every(inside)) { toast('Draw inside one flat face. Loop cut first to split a face.'); refresh(); return; } if (!convex) { toast('Shapes drawn on a face must be convex.'); refresh(); return; }
      M.imprint(c, d.plane.face, pts); st.active = o.id; st.mode = 'face'; clearSel(); st.sel.faces.add(d.plane.face); dirty(o.id); st.tool = 'push'; commit(); refresh(); renderSide(); syncBar(); toast('Drawn on the face. Now push or pull it (drag it, or press E).');
    } else {
      const o = makeObject(d.kind === 'rect' ? 'Block' : 'Shape', polygonFace(pts), { flat: true }); if (M.faceNormal(o.cage.V, o.cage.F[0])[2] < 0) o.cage.F[0].reverse();
      doc.objects.push(o); st.active = o.id; st.mode = 'face'; clearSel(); st.sel.faces.add(0); st.tool = 'push'; commit(); refresh(); renderSide(); syncBar(); toast('Shape drawn on the ground. Drag it up to give it height.');
    }
  }

  // ---------- pointer
  let down = null, cam = null;
  const onDown = (e) => {
    if (!view.ok) return; view.canvas.focus(); st.mouse = [e.clientX, e.clientY];
    if (e.button === 2 || e.button === 1 || (e.button === 0 && e.altKey && st.tool !== 'select')) { if (st.modal && e.button === 2) { cancelModal(); return; } cam = { x: e.clientX, y: e.clientY, pan: e.shiftKey }; try { view.canvas.setPointerCapture(e.pointerId); } catch (x2) { /* ignore */ } return; }
    if (e.button !== 0) return; try { view.canvas.setPointerCapture(e.pointerId); } catch (x2) { /* ignore */ }
    if (st.modal) { confirmModal(); return; }
    if (st.tool === 'rect' || st.tool === 'poly') {
      if (!st.draw) { const pl = drawPlaneAt(e.clientX, e.clientY); if (!pl) return; pl.p0 = pl.o ? pl.p : snapPt({ ...pl, p0: [0, 0, 0] }, pl.p); st.draw = { kind: st.tool, plane: pl, pts: [pl.p0], preview: [pl.p0] }; refresh(); return; }
      const d = st.draw, p = view.onPlane(e.clientX, e.clientY, d.plane.p0, d.plane.n); if (!p) return; const q = snapPt(d.plane, p);
      if (d.kind === 'rect') { finishDraw(rectPts(d.plane, d.pts[0], q)); return; }
      if (d.pts.length >= 3 && Math.hypot(...view.screen(q).slice(0, 2).map((c, i) => c - view.screen(d.pts[0])[i])) < 10) { finishDraw(d.pts); return; }
      d.pts.push(q); refresh(); return;
    }
    if (st.tool === 'loop') { const pc = st.mode === 'edge' || st.mode === 'face' || st.mode === 'vert' ? (st.mode === 'edge' ? pickComp(e.clientX, e.clientY) : null) : null; const hv = st.hover; if (hv && hv.edge) { const o = act(), r = M.loopCut(o.cage, hv.a, hv.b, hv.t); if (!r) { toast('No ring of four-sided faces to cut across here.'); return; } st.mode = 'edge'; clearSel(); r.edges.forEach(([a, b]) => st.sel.edges.add(M.ekey(a, b))); st.hover = null; dirty(o.id); commit(); refresh(); renderSide(); syncBar(); toast('Loop cut. Move it (G) or push it.'); } else toast('Hover an edge of the object in edit mode.'); return; }
    // gizmo handles start an exact-direction drag
    const gk = view.hitGizmo(e.clientX, e.clientY);
    if (gk && hasSel() && !(gk === 'free' && st.tool === 'push')) { const kind = st.tool === 'push' ? (st.mode === 'face' ? 'extrude' : 'move') : st.tool === 'rotate' ? 'rotate' : st.tool === 'scale' ? 'scale' : 'move'; startModal(kind, { axis: gk, drag: true, x: e.clientX, y: e.clientY }); return; }
    if (st.tool === 'push') { const fu = faceUnder(e.clientX, e.clientY); if (fu) { st.active = fu.o.id; st.mode = 'face'; clearSel(); st.sel.faces.add(fu.face); syncBar(); startModal('extrude', { drag: true, x: e.clientX, y: e.clientY }); return; } }
    if (st.tool === 'inset' && st.mode === 'face') { const pc = pickComp(e.clientX, e.clientY); if (pc && pc.face != null) { if (!st.sel.faces.has(pc.face)) { st.sel.faces.clear(); st.sel.faces.add(pc.face); } startModal('inset', { drag: true, x: e.clientX, y: e.clientY }); return; } }
    if ((st.tool === 'rotate' || st.tool === 'scale') && hasSel()) { startModal(st.tool, { drag: true, x: e.clientX, y: e.clientY }); return; }
    down = { x: e.clientX, y: e.clientY, shift: e.shiftKey, alt: e.altKey, moved: false };
  };
  const onMove = (e) => {
    st.mouse = [e.clientX, e.clientY];
    if (cam) { const dx = e.clientX - cam.x, dy = e.clientY - cam.y; cam.x = e.clientX; cam.y = e.clientY; if (cam.pan || e.shiftKey) view.pan(dx, dy); else view.orbit(dx, dy); return; }
    if (st.modal) { modalMove(e.clientX, e.clientY); return; }
    if (st.draw) { const d = st.draw, p = view.onPlane(e.clientX, e.clientY, d.plane.p0, d.plane.n); if (p) { const q = snapPt(d.plane, p); d.preview = d.kind === 'rect' ? Object.assign(rectPts(d.plane, d.pts[0], q), { closed: true }) : d.pts.concat([q]); if (d.kind === 'rect') { const r = rectPts(d.plane, d.pts[0], q); st.typed = st.typed; hintEl.textContent = 'Rectangle ' + fmt(M.len(M.sub(r[1], r[0]))) + ' × ' + fmt(M.len(M.sub(r[3], r[0]))) + ' mm. Click to finish, or type width,depth and Enter.'; } view.drawPreview([d.preview]); view.render(); } return; }
    if (st.tool === 'loop' && act() && st.mode !== 'object') { const save = st.mode; st.mode = 'edge'; const pc = pickComp(e.clientX, e.clientY); st.mode = save; if (pc && pc.edge) { const o = act(), R = M.edgeRing(o.cage, pc.a, pc.b); if (R) { const pv = R.edges.map(([p, q]) => M.lerp(o.cage.V[p], o.cage.V[q], pc.t)); st.hover = { ...pc, preview: null }; view.drawPreview([R.closed ? Object.assign(pv, { closed: true }) : pv], 0xff7a1a); view.render(); } } else if (st.hover) { st.hover = null; view.drawPreview([]); view.render(); } return; }
    if (down) { if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true;
      if (down.moved && st.tool === 'move' && hasSel() && !down.boxing) { const pc = st.mode === 'object' ? view.pickObject(down.x, down.y) : pickComp(down.x, down.y); const onSel = st.mode === 'object' ? pc && st.sel.objects.has(pc.id) : pc && ((pc.face != null && st.sel.faces.has(pc.face)) || (pc.vert != null && st.sel.verts.has(pc.vert)) || (pc.edge && st.sel.edges.has(pc.edge))); if (onSel) { const d0 = down; down = null; startModal('move', { drag: true, x: d0.x, y: d0.y, axis: st.axis !== 'auto' ? st.axis : 'free' }); modalMove(e.clientX, e.clientY); return; } }
      if (down.moved) { down.boxing = true; const r = view.canvas.getBoundingClientRect(); boxEl.hidden = false; Object.assign(boxEl.style, { left: Math.min(down.x, e.clientX) - r.left + 'px', top: Math.min(down.y, e.clientY) - r.top + 'px', width: Math.abs(e.clientX - down.x) + 'px', height: Math.abs(e.clientY - down.y) + 'px' }); } }
  };
  const onUp = (e) => {
    if (cam) { cam = null; return; }
    if (st.modal && st.modal.drag) { confirmModal(); return; }
    if (!down) return; const d = down; down = null; boxEl.hidden = true;
    if (d.boxing) { boxSelect(d, e); return; }
    clickSelect(e.clientX, e.clientY, d.shift, d.alt);
  };
  function clickSelect(x, y, add, alt) {
    if (st.mode === 'object') { const p = view.pickObject(x, y); if (p) { toggle(st.sel.objects, p.id, add); st.active = p.id; } else if (!add) st.sel.objects.clear(); refresh(); renderSide(); return; }
    const pc = pickComp(x, y); if (!pc) { if (!add) { st.sel.verts.clear(); st.sel.edges.clear(); st.sel.faces.clear(); } refresh(); renderSide(); return; }
    if (pc.vert != null) toggle(st.sel.verts, pc.vert, add); else if (pc.edge) { if (alt) { const L = M.edgeLoop(act().cage, pc.a, pc.b); if (!add) st.sel.edges.clear(); L.forEach(([a, b]) => st.sel.edges.add(M.ekey(a, b))); } else toggle(st.sel.edges, pc.edge, add); } else if (pc.face != null) toggle(st.sel.faces, pc.face, add);
    refresh(); renderSide(); syncBar();
  }
  function boxSelect(d, e) {
    const r = view.canvas.getBoundingClientRect(), x0 = Math.min(d.x, e.clientX) - r.left, x1 = Math.max(d.x, e.clientX) - r.left, y0 = Math.min(d.y, e.clientY) - r.top, y1 = Math.max(d.y, e.clientY) - r.top, inR = (p) => { const s = view.screen(p); return s[0] >= x0 && s[0] <= x1 && s[1] >= y0 && s[1] <= y1 && s[2] < 1; };
    if (!d.shift) { st.sel.verts.clear(); st.sel.edges.clear(); st.sel.faces.clear(); if (st.mode === 'object') st.sel.objects.clear(); }
    if (st.mode === 'object') doc.objects.forEach((o) => { const b = bbox(o.cage.V); if (inR(b.c)) st.sel.objects.add(o.id); });
    else { const c = act().cage; if (st.mode === 'vert') c.V.forEach((v, i) => { if (inR(v)) st.sel.verts.add(i); }); else if (st.mode === 'edge') c.F.forEach((f) => f.forEach((a, k) => { const b = f[(k + 1) % f.length]; if (inR(c.V[a]) && inR(c.V[b])) st.sel.edges.add(M.ekey(a, b)); })); else c.F.forEach((f, i) => { if (inR(M.faceCenter(c.V, f))) st.sel.faces.add(i); }); }
    refresh(); renderSide(); syncBar();
  }
  if (view.ok) { const c = view.canvas; c.addEventListener('pointerdown', onDown); c.addEventListener('pointermove', onMove); c.addEventListener('pointerup', onUp); c.addEventListener('contextmenu', (e) => e.preventDefault()); c.addEventListener('dblclick', () => { if (st.draw && st.draw.kind === 'poly') finishDraw(st.draw.pts); }); c.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false }); }

  // ---------- keyboard
  const onKey = (e) => {
    if (root.hidden || ws !== 'sub') return; const tg = (e.target && e.target.tagName) || ''; if (/INPUT|SELECT|TEXTAREA/.test(tg)) return; const k = e.key, kl = k.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && kl === 'z') { e.preventDefault(); e.shiftKey ? restore(hi + 1) : restore(hi - 1); return; } if ((e.ctrlKey || e.metaKey) && kl === 'y') { e.preventDefault(); restore(hi + 1); return; }
    if (st.modal) {
      if (k === 'Escape') { cancelModal(); return; } if (k === 'Enter') { confirmModal(); return; }
      if ('xyzn'.includes(kl) && kl.length === 1) { st.modal.axisKey = st.modal.axisKey === kl ? 'free' : kl; modalMove(st.modal.lastX, st.modal.lastY); syncBar(); return; } if (kl === 'f') { st.modal.axisKey = null; modalMove(st.modal.lastX, st.modal.lastY); return; }
      if (/^[0-9.\-]$/.test(k)) { st.typed += k; modalMove(st.modal.lastX, st.modal.lastY); status1(); return; } if (k === 'Backspace') { st.typed = st.typed.slice(0, -1); modalMove(st.modal.lastX, st.modal.lastY); status1(); return; }
      return;
    }
    if (st.draw) {
      if (k === 'Escape') { st.draw = null; st.typed = ''; refresh(); return; }
      if (/^[0-9.,\-]$/.test(k)) { st.typed += k; status1(); return; } if (k === 'Backspace') { st.typed = st.typed.slice(0, -1); status1(); return; }
      if (k === 'Enter') { const d = st.draw; if (d.kind === 'rect' && st.typed) { const [w, dd] = st.typed.split(',').map(parseFloat); st.typed = ''; if (isFinite(w) && isFinite(dd)) { const a = d.pts[0], b = M.add(a, M.add(M.mul(d.plane.u, w), M.mul(d.plane.v, dd))); finishDraw(rectPts(d.plane, a, b)); } return; } if (d.kind === 'poly') { st.typed = ''; finishDraw(d.pts); } return; }
      return;
    }
    if (k === 'Tab') { e.preventDefault(); setMode(st.mode === 'object' ? 'face' : 'object'); return; }
    if (k === '1' || k === '2' || k === '3') { setMode(['vert', 'edge', 'face'][+k - 1]); return; } if (k === '4') { setMode('object'); return; }
    if (e.shiftKey && kl === 'd') { if (st.mode === 'object') duplicate(); return; } if (e.shiftKey && kl === 'e') { creaseSel(); return; } if (e.shiftKey && kl === 'a') { addMenu.open = true; return; }
    const mapT = { q: 'select', l: 'loop', d: 'rect', p: 'poly' }; if (mapT[kl]) { setTool(mapT[kl]); return; }
    if (kl === 'g') { startModal('move'); return; } if (kl === 'e') { if (st.mode === 'face' && st.sel.faces.size) startModal('extrude'); else setTool('push'); return; } if (kl === 'r') { if (hasSel()) startModal('rotate'); else setTool('rotate'); return; } if (kl === 's') { if (hasSel()) startModal('scale'); else setTool('scale'); return; } if (kl === 'i') { if (st.mode === 'face' && st.sel.faces.size) startModal('inset'); else setTool('inset'); return; }
    if (kl === 'a') { selectAll(); return; } if (kl === 'x' || k === 'Delete') { deleteSel(); return; } if (kl === 'f') { frame(); return; } if (kl === 'b') { bridgeSel(); return; } if (kl === 'm') { mergeSel(); return; }
    if (k === 'Escape') { st.sel.verts.clear(); st.sel.edges.clear(); st.sel.faces.clear(); refresh(); renderSide(); }
  };
  window.addEventListener('keydown', onKey);
  function selectAll() { if (st.mode === 'object') { const all = st.sel.objects.size === doc.objects.length; st.sel.objects = new Set(all ? [] : doc.objects.map((o) => o.id)); } else { const c = act().cage; if (st.mode === 'vert') { const all = st.sel.verts.size === c.V.length; st.sel.verts = new Set(all ? [] : c.V.map((v, i) => i)); } else if (st.mode === 'edge') { const E = M.edgeMap(c), all = st.sel.edges.size === E.size; st.sel.edges = new Set(all ? [] : [...E.keys()]); } else { const all = st.sel.faces.size === c.F.length; st.sel.faces = new Set(all ? [] : c.F.map((f, i) => i)); } } refresh(); renderSide(); syncBar(); }
  function creaseSel() { const o = act(); if (!o || st.mode !== 'edge' || !st.sel.edges.size) { toast('Select edges (mode 2) to crease them.'); return; } const keys2 = [...st.sel.edges], on = !keys2.every((k) => o.cage.C[k]); M.setCrease(o.cage, keys2.map((k) => k.split('_').map(Number)), on); dirty(o.id); commit(); refresh(); toast(on ? 'Creased: these edges stay sharp when smoothed.' : 'Crease removed.'); }
  function bridgeSel() { const o = act(); if (!o || st.mode !== 'face' || st.sel.faces.size !== 2) { toast('Select exactly two faces to bridge.'); return; } const [a, b] = [...st.sel.faces], err = M.bridge(o.cage, a, b); if (err) { toast(err); return; } st.sel.faces.clear(); dirty(o.id); commit(); refresh(); renderSide(); toast('Bridged: a tunnel now joins the two faces.'); }
  function mergeSel() { const o = act(); if (!o || st.mode === 'object') return; const vs = selVerts(); if (vs.length < 2) { toast('Select two or more points to merge.'); return; } M.mergeVerts(o.cage, vs); clearSel(); dirty(o.id); commit(); refresh(); renderSide(); }

  // ---------- side panel: scene, object, modifiers, edit operations
  function renderSide() {
    clear(side); const o = act();
    const list = h('div', { class: 'dx-list' }); doc.objects.forEach((x) => list.append(h('div', { class: 'dx-item' + (x.id === st.active ? ' on' : '') + (st.sel.objects.has(x.id) ? ' sel' : ''), onclick: () => { if (st.modal) return; st.active = x.id; if (st.mode === 'object') st.sel.objects = new Set([x.id]); else clearSel(); refresh(); renderSide(); }, ondblclick: () => { st.active = x.id; setMode('face'); } },
      h('button', { class: 'dx-eye', title: x.visible === false ? 'Show' : 'Hide', text: x.visible === false ? '◌' : '●', onclick: (e) => { e.stopPropagation(); x.visible = x.visible === false; commit(); refresh(); renderSide(); } }), h('span', { text: x.name }), h('i', { text: (x.mods || []).filter((m2) => m2.on !== false).map((m2) => MODS[m2.type].label.split(' ')[0]).join(' · ') }))));
    side.append(h('div', { class: 'dx-sec' }, h('div', { class: 'dx-h' }, h('b', { text: 'Scene' }), h('span', { class: 'dx-grow' }), addMenuSmall()), doc.objects.length ? list : h('div', { class: 'dx-small', text: 'Empty. Draw a rectangle (D) on the ground, add a shape, or open an example from the File menu.' })));
    if (!o) return;
    const b = bbox(o.cage.V), size = [b.mx[0] - b.mn[0], b.mx[1] - b.mn[1], b.mx[2] - b.mn[2]];
    const sizeIn = (k) => h('input', { class: 'dx-in', type: 'number', value: +size[k].toFixed(2), title: 'Type an exact size; the object scales about its centre', onchange: (e) => { const v = +e.target.value; if (!(v > 0) || size[k] < 1e-9) return; const s = [1, 1, 1]; s[k] = v / size[k]; M.scaleAbout(o.cage, new Map(o.cage.V.map((_, i) => [i, 1])), k === 2 ? [b.c[0], b.c[1], b.mn[2]] : b.c, s); dirty(o.id); commit(); refresh(); renderSide(); } });
    side.append(h('div', { class: 'dx-sec' }, h('div', { class: 'dx-h' }, h('b', { text: 'Object' })),
      h('div', { class: 'dx-row' }, h('input', { class: 'dx-in grow', value: o.name, onchange: (e) => { o.name = e.target.value.trim() || 'Object'; commit(); renderSide(); } }), h('input', { class: 'dx-color', type: 'color', value: o.color, onchange: (e) => { o.color = e.target.value; dirty(o.id); commit(); refresh(); } })),
      h('div', { class: 'dx-grid3' }, h('label', null, 'W', sizeIn(0)), h('label', null, 'D', sizeIn(1)), h('label', null, 'H', sizeIn(2))),
      h('div', { class: 'dx-row' }, h('select', { class: 'dx-in', onchange: (e) => { o.flat = e.target.value === 'flat'; dirty(o.id); commit(); refresh(); } }, [['smooth', 'Smooth shading'], ['flat', 'Flat facets']].map(([k, l]) => h('option', { value: k, text: l, selected: (o.flat ? 'flat' : 'smooth') === k }))),
        h('button', { class: 'dx-btn sm', text: 'Drop to ground', onclick: () => { M.translate(o.cage, new Map(o.cage.V.map((_, i) => [i, 1])), [0, 0, -b.mn[2]]); dirty(o.id); commit(); refresh(); renderSide(); } }))));
    // modifiers
    const ms = h('div', { class: 'dx-sec' }, h('div', { class: 'dx-h' }, h('b', { text: 'Modifiers' }), h('span', { class: 'dx-small', text: 'non-destructive, top to bottom' })));
    (o.mods || []).forEach((md, i) => {
      const card = h('div', { class: 'dx-mod' + (md.on === false ? ' off' : '') }, h('div', { class: 'dx-mh' }, h('input', { type: 'checkbox', checked: md.on !== false, onchange: (e) => { md.on = e.target.checked; dirty(o.id); commit(); refresh(); renderSide(); } }), h('b', { text: MODS[md.type].label }), h('span', { class: 'dx-grow' }),
        h('button', { class: 'dx-btn xs', text: '↑', title: 'Move up', disabled: i === 0, onclick: () => { o.mods.splice(i - 1, 0, o.mods.splice(i, 1)[0]); dirty(o.id); commit(); refresh(); renderSide(); } }), h('button', { class: 'dx-btn xs', text: '↓', title: 'Move down', disabled: i === o.mods.length - 1, onclick: () => { o.mods.splice(i + 1, 0, o.mods.splice(i, 1)[0]); dirty(o.id); commit(); refresh(); renderSide(); } }), h('button', { class: 'dx-btn xs', text: '×', title: 'Remove', onclick: () => { o.mods.splice(i, 1); dirty(o.id); commit(); refresh(); renderSide(); } })));
      const grid = h('div', { class: 'dx-params' });
      Object.keys(MODS[md.type].def).forEach((k) => {
        if (md.type === 'pattern' && ((md.map === 'cylinder' && k === 'cell') || (md.map !== 'cylinder' && (k === 'count' || k === 'rows'))) ) return; if (md.type === 'pattern' && k === 'twist' && md.kind !== 'spiral') return; if (md.type === 'array' && md.mode === 'radial' && /^d[xyz]$/.test(k)) return; if (md.type === 'array' && md.mode !== 'radial' && k === 'angle') return;
        const P = PARAM[k] || [k], ch = CHOICES[k];
        const input = ch ? h('select', { class: 'dx-in', onchange: (e) => { md[k] = e.target.value; dirty(o.id); commit(); refresh(); renderSide(); } }, ch.map(([v, l]) => h('option', { value: v, text: l, selected: md[k] === v })))
          : h('input', { class: 'dx-in', type: 'number', step: P[1], min: P[2], max: P[3], value: md[k], oninput: (e) => { const v = parseFloat(e.target.value); if (!isFinite(v)) return; md[k] = v; dirty(o.id); refresh('draft'); }, onchange: () => { dirty(o.id); commit(); refresh(); } });
        grid.append(h('label', null, h('span', { text: P[0] }), input));
      });
      card.append(grid); ms.append(card);
    });
    const addSel = h('select', { class: 'dx-in', onchange: (e) => { const t = e.target.value; if (!t) return; o.mods = o.mods || []; const m2 = mod(t); const order = (x) => MOD_ORDER.indexOf(x.type); let at = o.mods.length; while (at > 0 && order(o.mods[at - 1]) > order(m2)) at--; o.mods.splice(at, 0, m2); dirty(o.id); commit(); refresh(); renderSide(); } }, h('option', { value: '', text: 'Add a modifier…' }), MOD_ORDER.map((k) => h('option', { value: k, text: MODS[k].label })));
    ms.append(addSel, h('div', { class: 'dx-row' }, h('button', { class: 'dx-btn sm', text: 'Apply stack to cage', title: 'Bake the modifiers into editable geometry', disabled: !(o.mods || []).length, onclick: () => { const c = evalObj(o, 'full').mesh; if (c.F.length > 40000) { toast('Too dense to edit by hand (' + c.F.length.toLocaleString() + ' faces). Lower smoothing or pattern first.'); return; } o.cage = M.clone(c); o.mods = []; clearSel(); dirty(o.id); commit(); refresh(); renderSide(); toast('Modifiers applied. The result is now the editable cage.'); } })));
    side.append(ms);
    if (st.mode !== 'object') {
      side.append(h('div', { class: 'dx-sec' }, h('div', { class: 'dx-h' }, h('b', { text: 'Edit' }), h('span', { class: 'dx-small', text: o.cage.V.length + ' points, ' + o.cage.F.length + ' faces' })),
        h('div', { class: 'dx-ops' }, [['Push / pull (E)', () => startModal('extrude')], ['Move (G)', () => startModal('move')], ['Inset (I)', () => startModal('inset')], ['Bridge (B)', bridgeSel], ['Merge (M)', mergeSel], ['Crease (Shift+E)', creaseSel], ['Flip faces', () => { if (st.mode === 'face') { M.flipFaces(o.cage, [...st.sel.faces]); dirty(o.id); commit(); refresh(); } }], ['Delete (X)', deleteSel]].map(([l, f]) => h('button', { class: 'dx-btn sm', text: l, onclick: f }))),
        h('div', { class: 'dx-small', text: M.isClosed(o.cage) ? 'Closed solid.' : 'Open surface. Add a Shell modifier to print it, or bridge the openings.' })));
    }
    const c = cache.get(o.id); if (c) { const mc = meshCheck(c.soup.pos, c.soup.nt); side.append(h('div', { class: 'dx-sec' }, h('div', { class: 'dx-h' }, h('b', { text: 'Print check' })), h('div', { class: 'dx-small', text: (mc.watertight ? 'Watertight' : 'Not watertight: ' + mc.open + ' open edges') + ', ' + (Math.abs(soupVolume(c.soup)) / 1000).toFixed(1) + ' cm³, ' + c.soup.nt.toLocaleString() + ' triangles.' }))); }
  }
  function addMenuSmall() { return h('select', { class: 'dx-in sm', onchange: (e) => { if (e.target.value) addPrim(e.target.value); e.target.value = ''; } }, h('option', { value: '', text: '+ Add' }), Object.keys(PRIMS).map((k) => h('option', { value: k, text: PRIMS[k].label }))); }

  // ---------- welcome, files, export
  let firstRunShown = firstRun;
  function renderWelcome() {
    clear(welcome); welcome.append(h('div', { class: 'dx-wcard' }, h('div', { class: 'dx-wlogo' }), h('b', { text: 'Start shaping' }), h('p', { text: 'Draw a rectangle on the ground (D) and drag it up, add a shape, or open an example built with the same tools.' }), h('button', { class: 'dx-btn', text: 'Need sketches, splines, extrude, cut, loft, sweep or surfaces? Open CAD (exact)', onclick: () => { welcome.hidden = true; setWorkspace('part'); } }),
      h('div', { class: 'dx-wgrid' }, Object.keys(TEMPLATES).map((k) => h('button', { class: 'dx-btn', text: TEMPLATES[k].label, onclick: () => loadDoc(fromTemplate(k), TEMPLATES[k].label + ' loaded. Double click it in the scene list to edit its cage.') }))),
      h('div', { class: 'dx-row' }, h('button', { class: 'dx-btn pri', text: 'Draw a rectangle', onclick: () => { welcome.hidden = true; firstRunShown = false; setTool('rect'); } }), h('button', { class: 'dx-btn', text: 'Start with a box', onclick: () => { welcome.hidden = true; firstRunShown = false; addPrim('box'); } }))));
    welcome.querySelector('.dx-wlogo').innerHTML = logoSVG(54);
  }
  function openFile(e) { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const o = JSON.parse(String(r.result)); if (o.kind !== 'ductile') throw new Error('not a Ductile scene'); loadDoc(o, 'Opened ' + f.name); } catch (x) { toast('Could not open it: ' + x.message); } }; r.readAsText(f); e.target.value = ''; }
  function packBytes() {
    const parts = doc.objects.filter((o) => o.visible !== false).map((o) => { const c = evalObj(o, 'full'); return { name: o.name, tris: c.soup.pos.subarray(0, c.soup.nt * 9), color: parseInt((o.color || '#cccccc').slice(1), 16) }; });
    const all = new Float32Array(parts.reduce((s, p) => s + p.tris.length, 0)); let off = 0; parts.forEach((p) => { all.set(p.tris, off); off += p.tris.length; });
    const objx = encodeOBJ(parts, base());
    return createZip([{ name: base() + '.stl', data: encodeSTL(all, 'Ductile ' + doc.name) }, { name: base() + '.3mf', data: encode3MF(parts, doc.name) }, { name: base() + '.obj', data: objx.obj }, { name: base() + '.mtl', data: objx.mtl }, { name: base() + '.ductile.json', data: JSON.stringify(doc) }]);
  }
  function exportPack() { if (!doc.objects.length) { toast('Nothing to export yet.'); return; } saveBytes(base() + '-print-pack.zip', 'application/zip', packBytes()); }

  // ---------- start
  wsSeg[0].classList.add('on'); renderWelcome(); syncBar(); refresh(); renderSide(); setTimeout(() => { view.bg(getComputedStyle(appEl).getPropertyValue('--dx-vp').trim() || '#e9eaec'); frame(); refresh(); }, 30);
  if (!firstRun) welcome.hidden = true;
  Object.defineProperties(app, Object.getOwnPropertyDescriptors({ get doc() { return doc; }, setWorkspace, get ws() { return ws; }, get vessel() { return vesselWs; }, get forge() { return forgeWs; }, get part() { return partWs; }, st, view, refresh, loadDoc, setMode, setTool, startModal, modalMove, confirmModal, cancelModal, restore, commit, packBytes, addPrim, selectAll, bridgeSel, creaseSel, renderSide, get hist() { return hist.length; }, evalObj, finishDraw, faceUnder, onKey }));
  return { app, view, destroy() { window.removeEventListener('keydown', onKey); clear(root); } };
}
