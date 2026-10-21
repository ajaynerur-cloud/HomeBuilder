// Forge: parametric vessel and sketch modelling with push/pull in any direction, for 3D printing.
import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { ForgeApp, TOOLS } from '../forge/app.js';
import { ForgeView } from '../forge/view.js';
import { Profile2D } from '../forge/profile.js';
import { newForge, TEMPLATES, migrateForge, scopeOf } from '../forge/model.js';
import { MOD_TYPES } from '../forge/mods.js';
import { validName, valueOf } from '../core/params.js';
import { buildPrint } from '../forge/print.js';
import { stats as meshStats } from '../forge/mesh.js';
import { encodeSTL, encode3MF, encodeOBJ, mergeTris } from '../io/meshio.js';
import { createZip } from '../io/zip.js';
import { saveBytes } from '../io/download.js';

const KEY = 'chp_forge_v1';
const TOOL_ICON = { select: 'select', pull: 'pull', move: 'move', scale: 'scale', rotate: 'rotate', twist: 'twist', inset: 'inset', sculpt: 'sculpt', delete: 'delface' };
const TOOL_KEY = { q: 'select', p: 'pull', g: 'move', s: 'scale', r: 'rotate', t: 'twist', i: 'inset', b: 'sculpt', x: 'delete' };
const KEYCAP = {}; Object.keys(TOOL_KEY).forEach((k) => { KEYCAP[TOOL_KEY[k]] = k.toUpperCase(); });
const NAMES = { vase: 'Vase', bowl: 'Bowl', ripple: 'Ribbed vase', tower: 'Twisted tower', box: 'Block' };
const parseVal = (s) => (s === '' ? undefined : (/^-?\d*\.?\d+$/.test(s) ? parseFloat(s) : s));
const r1 = (v) => Math.round(v * 10) / 10;

function menu(label, items) {
  const d = h('details', { class: 'st-menu' }), box = h('div', { class: 'st-menuitems' });
  items.forEach((it) => { if (it === 'sep') box.appendChild(h('div', { class: 'st-msep' })); else box.appendChild(h('button', { class: 'st-btn', text: it[0], onclick: () => { d.open = false; it[1](); } })); });
  d.appendChild(h('summary', { class: 'st-btn', text: label })); d.appendChild(box); return d;
}

export function createForge(root, deps = {}) {
  let saved = null; if (!deps.noSave) { try { const t = localStorage.getItem(KEY); if (t) saved = migrateForge(JSON.parse(t)); } catch (e) { saved = null; } }
  const app = new ForgeApp(saved || newForge('vase')), store = app.store, els = {};
  let toastT = null;
  const toast = (msg) => { els.toast.textContent = msg; els.toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => els.toast.classList.remove('on'), 5500); };
  app.ui = { toast, hud(text, x, y) { if (!text) { els.hud.hidden = true; return; } els.hud.hidden = false; els.hud.textContent = text; els.hud.style.left = (x || 20) + 14 + 'px'; els.hud.style.top = (y || 20) - 30 + 'px'; }, box(r) { if (!r) { els.box.hidden = true; return; } els.box.hidden = false; Object.assign(els.box.style, { left: r[0] + 'px', top: r[1] + 'px', width: r[2] - r[0] + 'px', height: r[3] - r[1] + 'px' }); }, refresh() { refresh(); } };
  app.ask = (o, cb) => { const dlg = els.dlg; clear(dlg); const close = () => { dlg.hidden = true; clear(dlg); }; dlg.appendChild(h('div', { class: 'st-card' }, h('b', { text: o.title }), o.message ? h('div', { class: 'st-small', text: o.message }) : null, h('div', { class: 'st-row2' }, h('button', { class: 'st-btn pri', text: o.ok || 'OK', onclick: () => { close(); cb(); } }), h('button', { class: 'st-btn', text: 'Cancel', onclick: close })))); dlg.hidden = false; };
  const edit = (label, fn, key) => store.transact(label, (p) => fn(p, p.bodies.find((b) => b.id === p.active) || p.bodies[0]), key ? { coalesce: key } : undefined);

  // ---------- top bar
  const nameIn = h('input', { class: 'st-name', value: store.p.name, title: 'Project name', onchange: (e) => store.transact('Rename', (p) => { p.name = e.target.value.trim() || 'Untitled'; }) });
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { store.replace(migrateForge(JSON.parse(String(r.result)))); app.clearSel(); app.rebuild(); afterReplace(); toast('Opened ' + f.name); } catch (x) { toast(x.message); } }; r.readAsText(f); e.target.value = ''; } });
  const startNew = (kind) => { const go = () => { store.replace(newForge(kind)); app.clearSel(); app.rebuild(); afterReplace(); }; if (store.undoStack.length) app.ask({ title: 'Start a new ' + NAMES[kind].toLowerCase() + '?', message: 'Use Save first if you want to keep this one as a file.', ok: 'Start new' }, go); else go(); };
  const printNow = (kind) => {
    const r = buildPrint(store.p); if (!r.parts.length) { toast('Nothing to export.'); return; } const base = (store.p.name || 'model').replace(/[^\w\-]+/g, '_') + '_' + (store.p.print.scalePct || 100) + 'pct';
    if (kind === 'stl') saveBytes(base + '.stl', 'model/stl', encodeSTL(mergeTris(r.parts), store.p.name));
    else if (kind === 'zip') saveBytes(base + '_bodies.zip', 'application/zip', createZip(r.parts.map((p) => ({ name: p.name.replace(/[^\w\- ]+/g, '_') + '.stl', data: encodeSTL(p.tris, p.name) }))));
    else if (kind === '3mf') saveBytes(base + '.3mf', 'model/3mf', encode3MF(r.parts, store.p.name));
    else if (kind === 'obj') { const o = encodeOBJ(r.parts, base); saveBytes(base + '_obj.zip', 'application/zip', createZip([{ name: base + '.obj', data: o.obj }, { name: base + '.mtl', data: o.mtl }])); }
  };
  const fileMenu = menu('File', [...Object.keys(NAMES).map((k) => ['New ' + NAMES[k].toLowerCase(), () => startNew(k)]), 'sep', ['Open', () => file.click()], ['Save project (.json)', () => saveBytes((store.p.name || 'forge').replace(/[^\w\-]+/g, '_') + '.forge.json', 'application/json', JSON.stringify(store.p, null, 1))], 'sep',
    ['Export STL', () => printNow('stl')], ['Export 3MF with colours', () => printNow('3mf')], ['Export STL per body (zip)', () => printNow('zip')], ['Export OBJ (zip)', () => printNow('obj')]]);
  const undoBtn = h('button', { class: 'st-btn ico', text: '↶', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: () => store.undo() }), redoBtn = h('button', { class: 'st-btn ico', text: '↷', title: 'Redo (Ctrl+Y)', 'aria-label': 'Redo', onclick: () => store.redo() });
  const viewBtns = [['both', 'Sketch + 3D'], ['only3d', '3D']].map(([k, l]) => h('button', { class: 'st-seg1' + (k === 'both' ? ' on' : ''), text: l, onclick: () => setViewMode(k) }));
  const sideBtn = h('button', { class: 'st-btn ico', title: 'Show or hide the side panel', 'aria-label': 'Side panel', onclick: () => { bodyEl.classList.toggle('noside'); setTimeout(() => { app.view.resize(); prof.resize(); }, 30); } }, icon('panel', 18));
  const top = h('div', { class: 'st-top' }, nameIn, fileMenu, undoBtn, redoBtn, h('span', { class: 'grow' }), h('div', { class: 'st-viewtog' }, viewBtns), h('button', { class: 'st-btn ico', text: '?', title: 'Keys and help', 'aria-label': 'Help', onclick: () => { keys.hidden = !keys.hidden; } }), sideBtn, file);

  // ---------- tool rail
  const rail = h('div', { class: 'st-tools' }), toolBtns = {};
  TOOLS.forEach(([id, label, hint], i) => { if (i === 1 || i === 7) rail.appendChild(h('div', { class: 'st-rsep' })); const b = h('button', { class: 'st-tool', title: label + '  (' + KEYCAP[id] + ')', 'aria-label': label, onclick: () => setTool(id) }, icon(TOOL_ICON[id])); toolBtns[id] = b; rail.appendChild(b); });
  function setTool(id) { app.setTool(id); Object.keys(toolBtns).forEach((k) => toolBtns[k].classList.toggle('on', k === id)); renderOpts(); els.hint.textContent = (TOOLS.find((t) => t[0] === id) || [])[2] || ''; try { app.view.canvas.focus(); } catch (e) { /* none */ } }

  // ---------- options bar
  const optsL = h('div', { class: 'st-optsl' }), optsR = h('div', { class: 'st-optsr' }), opts = h('div', { class: 'st-opts' }, optsL, optsR);
  const sel = (label, key, list, after) => h('label', { class: 'st-opt' }, label, h('select', { class: 'st-in', onchange: (e) => { app.state[key] = e.target.value; if (after) after(); renderOpts(); } }, list.map(([v, l]) => h('option', { value: v, text: l, selected: app.state[key] === v }))));
  const numIn = h('input', { class: 'st-in fg-num', placeholder: 'Type a value, Enter', title: 'Exact value for the current tool. Move also takes x,y,z.', onkeydown: (e) => { if (e.key === 'Enter') { const r = app.applyNumeric(numIn.value); if (r.ok) numIn.value = ''; else toast(r.msg); e.stopPropagation(); } else if (e.key === 'Escape') { numIn.value = ''; numIn.blur(); } e.stopPropagation(); } });
  function renderOpts() {
    clear(optsL); const t = app.state.tool, tool = TOOLS.find((x) => x[0] === t);
    optsL.appendChild(h('b', { class: 'st-toolname', text: tool ? tool[1] : '' }));
    optsL.appendChild(sel('Pick', 'mode', [['face', 'Faces'], ['edge', 'Edges'], ['vertex', 'Points'], ['loop', 'Edge loop'], ['strip', 'Face strip']], () => app.clearSel()));
    if (['pull', 'move', 'rotate', 'twist', 'sculpt'].includes(t)) {
      optsL.appendChild(sel('Direction', 'dir', [['normal', t === 'rotate' || t === 'twist' ? 'Normal (axis)' : 'Normal'], ['x', 'X'], ['y', 'Y'], ['z', 'Z (up)'], ...(t === 'move' ? [['free', 'Free (screen plane)']] : []), ['custom', 'Custom']]));
      if (app.state.dir === 'custom') optsL.appendChild(h('label', { class: 'st-opt' }, 'Vector', ...[0, 1, 2].map((i) => h('input', { class: 'st-in sm', value: String(app.state.custom[i]), onchange: (e) => { const v = parseFloat(e.target.value); app.state.custom[i] = isNaN(v) ? 0 : v; } }))));
    }
    if (t === 'scale') optsL.appendChild(sel('Scale', 'scaleMode', [['uniform', 'Uniform'], ['radial', 'Radial (around vertical axis)'], ['x', 'X only'], ['y', 'Y only'], ['z', 'Z only']]));
    if (t === 'sculpt') { optsL.appendChild(h('label', { class: 'st-opt' }, 'Radius', h('input', { class: 'st-in sm', value: String(app.state.radius), onchange: (e) => { const v = parseFloat(e.target.value); if (v > 0) app.state.radius = v; } }))); optsL.appendChild(sel('Falloff', 'falloff', [['smooth', 'Smooth'], ['linear', 'Linear'], ['sharp', 'Sharp']])); }
    if (!['select', 'sculpt', 'delete'].includes(t)) optsL.appendChild(numIn);
  }
  const fitB = h('button', { class: 'st-btn ico', title: 'Zoom to fit', 'aria-label': 'Fit', onclick: () => app.view.fit() }, icon('fit', 18));
  const dispMenu = h('details', { class: 'st-menu' }, h('summary', { class: 'st-btn', text: 'Display' }), h('div', { class: 'st-menuitems' },
    ...[['smooth', 'Smooth shading', false], ['edges', 'Show edges', true]].map(([k, l, d]) => { const c = h('input', { type: 'checkbox', checked: app.state[k] === undefined ? d : app.state[k], onchange: () => { app.state[k] = c.checked; app.showCurrent(); } }); return h('label', { class: 'chk' }, c, ' ' + l); }),
    (() => { const c = h('input', { type: 'checkbox', onchange: () => { app.state.overhangView = c.checked; app.view.paint(); } }); return h('label', { class: 'chk' }, c, ' Overhang view (red = needs support)'); })()));
  const orthoB = h('button', { class: 'st-btn tog', text: 'Ortho', title: 'Orthographic or perspective', onclick: () => { app.view.s.ortho = !app.view.s.ortho; orthoB.classList.toggle('on', app.view.s.ortho); app.view.dirty = true; } });
  const viewSel = h('select', { class: 'st-in', title: 'Standard views', onchange: (e) => { if (e.target.value) app.view.view(e.target.value); e.target.value = ''; } }, h('option', { value: '', text: 'View' }), [['iso', '3D view'], ['front', 'Front'], ['back', 'Back'], ['left', 'Left'], ['right', 'Right'], ['top', 'Top']].map(([v, l]) => h('option', { value: v, text: l })));
  optsR.appendChild(viewSel); optsR.appendChild(orthoB); optsR.appendChild(dispMenu); optsR.appendChild(fitB);

  // ---------- views
  const profEl = h('div', { class: 'fg-profile' }), v3 = h('div', { class: 'fg-3d' }), views = h('div', { class: 'fg-views' }, profEl, v3);
  els.hud = h('div', { class: 'fg-hud', hidden: true }); els.box = h('div', { class: 'fg-box', hidden: true }); v3.appendChild(els.hud); v3.appendChild(els.box);
  const profBar = h('div', { class: 'fg-pbar' }, h('b', { text: 'Profile' }), h('span', { class: 'st-small', text: 'drag points · double-click to add or toggle a corner · Delete removes' }), h('button', { class: 'st-btn sm', text: 'Fit', onclick: () => prof.fit() }));
  profEl.appendChild(profBar);
  function setViewMode(k) { views.className = 'fg-views ' + (k === 'both' ? '' : k); viewBtns.forEach((b, i) => b.classList.toggle('on', ['both', 'only3d'][i] === k)); setTimeout(() => { prof.resize(); app.view.resize(); app.view.fit(); }, 30); }
  els.hint = h('span', { class: 'grow st-hintbar' }); els.info = h('span', { class: 'st-coords' }); els.toast = h('div', { class: 'st-toast' }); els.dlg = h('div', { class: 'st-keys', hidden: true });
  const status = h('div', { class: 'st-status' }, els.hint, els.info);
  const keys = h('div', { class: 'st-keys', hidden: true, onclick: () => { keys.hidden = true; } }, h('div', { class: 'st-card wide' }, h('b', { text: 'How Forge works' }),
    h('div', { class: 'st-small', text: 'Shape comes from three layers that all stay live: the Design (profile curve or sketch on a plane, thickness, segments), the Modifiers (twist, taper, bend, ripple, cross-section, smooth), and your own direct edits (push/pull, move, scale, rotate, twist, inset, sculpt). Change a parameter and your edits are replayed onto the new shape.' }),
    h('div', { class: 'st-small', text: 'Tools: Q select, P push/pull, G move, S scale, R rotate, T twist, I inset, B sculpt, X delete face. Delete removes the selected faces. Ctrl+Z undo, Ctrl+Y redo.' }),
    h('div', { class: 'st-small', text: 'Direction: pull and move work along the face normal, X, Y, Z, a custom vector, or (move) freely in the screen plane. Type a number and press Enter for an exact distance.' }),
    h('div', { class: 'st-small', text: '3D: right-drag or Alt-drag orbits, middle-drag pans, wheel zooms. Edge loop picks a whole ring of a vase in one click.' })));
  const mainEl = h('div', { class: 'st-main' }, opts, views, status);

  // ---------- side panel
  const tabsEl = h('div', { class: 'st-tabs' }), tabBody = h('div', { class: 'st-tabbody' }), tabs = {}, order = [['design', 'Design'], ['params', 'Parameters'], ['mods', 'Modifiers'], ['history', 'Edits'], ['print', 'Print']];
  let current = 'design';
  const keepFocus = (el) => el.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  const scope = () => scopeOf(store.p).values;
  function field(label, raw, onCommit, o = {}) {
    let hint = ''; if (o.hint !== false) { try { hint = raw === undefined || raw === '' ? '' : (typeof raw === 'string' && raw[0] === '=' ? '= ' + r1(valueOf(raw, scope(), 'mm')) : (o.unit || '')); } catch (e) { hint = 'error'; } }
    const i = h('input', { class: 'st-in', value: raw === undefined ? '' : String(raw), title: o.title || 'A number in mm, or an expression like =H*0.4 that can use your parameters' }); i.addEventListener('change', () => onCommit(i.value.trim(), i));
    return h('label', { class: 'st-row' }, h('span', { text: label }), i, h('span', { class: 'st-unit', text: hint }));
  }
  const setGen = (k, label) => (v) => edit('Edit ' + (label || k), (p, b) => { const x = parseVal(v); if (x === undefined) delete b.gen[k]; else b.gen[k] = x; }, 'g' + k);
  const selField = (label, value, list, on) => h('label', { class: 'st-row' }, h('span', { text: label }), h('select', { class: 'st-in', onchange: (e) => on(e.target.value) }, list.map(([v, l]) => h('option', { value: v, text: l, selected: value === v }))), h('span'));
  const chk = (label, value, on) => h('label', { class: 'st-row chk' }, h('input', { type: 'checkbox', checked: !!value, onchange: (e) => on(e.target.checked) }), h('span', { text: label }));

  tabs.design = { el: h('div'), render() {
    if (keepFocus(this.el)) return; const el = clear(this.el), p = store.p, b = app.body, g = b.gen;
    const list = h('div', { class: 'st-card' }, h('b', { text: 'Bodies' }));
    p.bodies.forEach((x) => list.appendChild(h('div', { class: 'st-row2' }, h('input', { type: 'radio', name: 'fgbody', checked: x.id === p.active, onchange: () => app.setActive(x.id) }), h('input', { class: 'st-in grow', value: x.name, onchange: (e) => store.transact('Rename body', (q) => { q.bodies.find((y) => y.id === x.id).name = e.target.value || x.name; }) }),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: x.visible !== false, onchange: (e) => store.transact('Show body', (q) => { q.bodies.find((y) => y.id === x.id).visible = e.target.checked; }) }), ' Show'), p.bodies.length > 1 ? h('button', { class: 'st-btn sm danger', text: '×', title: 'Delete body', onclick: () => app.removeBody(x.id) }) : null)));
    const addSel = h('select', { class: 'st-in' }, Object.keys(NAMES).map((k) => h('option', { value: k, text: NAMES[k] })));
    list.appendChild(h('div', { class: 'st-row2' }, addSel, h('button', { class: 'st-btn', text: 'Add body', onclick: () => app.addBody(addSel.value) }))); el.appendChild(list);
    const card = h('div', { class: 'st-card' }, h('b', { text: { vessel: 'Vessel (profile revolved around the vertical axis)', extrude: 'Sketch on a plane, extruded', box: 'Block', mesh: 'Frozen mesh' }[g.type] || 'Body' }));
    if (g.type === 'vessel') {
      card.appendChild(field('Segments around', g.segments, setGen('segments'), { unit: '' })); card.appendChild(field('Samples along curve', g.samples, setGen('samples'), { unit: '' })); card.appendChild(field('Wall thickness', g.thickness, setGen('thickness', 'wall'), { unit: 'mm  (0 = solid)' })); card.appendChild(field('Base thickness', g.base, setGen('base'), { unit: 'mm' })); card.appendChild(field('Sweep angle', g.sweep, setGen('sweep'), { unit: 'deg (360 = full)' }));
      card.appendChild(chk('Smooth curve through the points', g.smooth !== false, (v) => edit('Smooth', (q, bb) => { bb.gen.smooth = v; })));
    } else if (g.type === 'extrude') {
      const pl = g.plane || { kind: 'XY' };
      card.appendChild(selField('Sketch plane', pl.kind || 'XY', [['XY', 'XY (floor)'], ['XZ', 'XZ (front)'], ['YZ', 'YZ (side)'], ['custom', 'Tilted']], (v) => edit('Plane', (q, bb) => { bb.gen.plane = { ...(bb.gen.plane || {}), kind: v }; })));
      card.appendChild(field('Plane offset', pl.offset, (v) => edit('Plane offset', (q, bb) => { bb.gen.plane = { ...(bb.gen.plane || { kind: 'XY' }), offset: parseVal(v) }; }, 'poff'), { unit: 'mm along its normal' }));
      if (pl.kind === 'custom') { card.appendChild(field('Tilt about X', pl.tiltX, (v) => edit('Tilt', (q, bb) => { bb.gen.plane = { ...bb.gen.plane, tiltX: parseVal(v) }; }, 'tx'), { unit: 'deg' })); card.appendChild(field('Tilt about Y', pl.tiltY, (v) => edit('Tilt', (q, bb) => { bb.gen.plane = { ...bb.gen.plane, tiltY: parseVal(v) }; }, 'ty'), { unit: 'deg' })); }
      [['height', 'Extrude height', 'mm'], ['steps', 'Steps', ''], ['taper', 'Taper (top scale)', '1 = none'], ['twist', 'Twist', 'deg over the height'], ['thickness', 'Wall thickness', 'mm (0 = solid)'], ['base', 'Base thickness', 'mm'], ['samples', 'Samples', '']].forEach(([k, l, u]) => card.appendChild(field(l, g[k], setGen(k, l), { unit: u })));
      card.appendChild(chk('Smooth curve through the points', g.smooth === true, (v) => edit('Smooth', (q, bb) => { bb.gen.smooth = v; })));
    } else if (g.type === 'box') { [['w', 'Width'], ['d', 'Depth'], ['h', 'Height']].forEach(([k, l]) => card.appendChild(field(l, g[k], setGen(k, l), { unit: 'mm' }))); }
    else card.appendChild(h('div', { class: 'st-small', text: 'This body was frozen from your edits. Parameters no longer change it. Add a new body to start another parametric shape.' }));
    el.appendChild(card);
    if (g.type === 'vessel' || g.type === 'extrude') {
      const pts = g.type === 'vessel' ? g.profile : g.sketch, tbl = h('div', { class: 'st-card' }, h('b', { text: g.type === 'vessel' ? 'Profile points (radius, height)' : 'Sketch points (x, y)' }));
      pts.forEach((pt, i) => tbl.appendChild(h('div', { class: 'fg-pt' }, h('span', { class: 'st-small', text: String(i + 1) }),
        ...['x', 'y'].map((k) => { const inp = h('input', { class: 'st-in', value: String(pt[k]), title: 'Number in mm or an expression like =R0*1.2' }); inp.addEventListener('change', () => edit('Edit point', (q, bb) => { const L = bb.gen.type === 'vessel' ? bb.gen.profile : bb.gen.sketch; L[i][k] = parseVal(inp.value.trim()) === undefined ? 0 : parseVal(inp.value.trim()); }, 'pt' + i + k)); return inp; }),
        h('label', { class: 'chk', title: 'Sharp corner' }, h('input', { type: 'checkbox', checked: !!pt.corner, onchange: (e) => edit('Corner', (q, bb) => { (bb.gen.type === 'vessel' ? bb.gen.profile : bb.gen.sketch)[i].corner = e.target.checked; }) }), ' sharp'),
        h('button', { class: 'st-btn sm', text: '×', title: 'Remove point', onclick: () => prof.removePoint(i) }))));
      tbl.appendChild(h('button', { class: 'st-btn', text: 'Add point', onclick: () => edit('Add point', (q, bb) => { const L = bb.gen.type === 'vessel' ? bb.gen.profile : bb.gen.sketch, last = L[L.length - 1]; const lx = parseFloat(last.x) || 0, ly = parseFloat(last.y) || 0; L.push({ x: Math.round(lx + 10), y: Math.round(ly + 10), corner: false }); }) }));
      el.appendChild(tbl);
    }
  } };

  tabs.params = { el: h('div'), render() {
    if (keepFocus(this.el)) return; const el = clear(this.el), { values, errors } = scopeOf(store.p);
    el.appendChild(h('p', { class: 'st-hint', text: 'Name a size once and use it anywhere with =name, for example =H*0.4 or =Rbelly-wall. Change it here and the shape, your modifiers and your edits update together. Sizes are in millimetres.' }));
    const rows = store.p.params.map((q, i) => h('tr', {}, h('td', {}, h('input', { class: 'st-in', value: q.name, onchange: (e) => { const n = e.target.value.trim(); if (!validName(n) || store.p.params.some((z, j) => j !== i && z.name === n)) { toast('Use letters, digits and _ and a name nobody else has.'); e.target.value = q.name; return; } store.transact('Rename parameter', (pp) => { pp.params[i].name = n; }); } })),
      h('td', {}, h('input', { class: 'st-in', value: String(q.v), onchange: (e) => { let v = e.target.value.trim(); if (/^-?\d*\.?\d+$/.test(v)) v = parseFloat(v); store.transact('Edit parameter', (pp) => { pp.params[i].v = v; }, { coalesce: 'p' + i }); } })),
      h('td', { class: errors[q.name] ? 'bad' : '' }, errors[q.name] ? 'error' : (values[q.name] === undefined ? '–' : r1(values[q.name]))), h('td', {}, h('input', { class: 'st-in', value: q.note || '', onchange: (e) => store.transact('Note', (pp) => { pp.params[i].note = e.target.value; }, { coalesce: 'n' + i }) })), h('td', {}, h('button', { class: 'st-btn sm', text: '×', onclick: () => store.transact('Delete parameter', (pp) => { pp.params.splice(i, 1); }) }))));
    el.appendChild(h('div', { class: 'st-scroll' }, h('table', { class: 'st-table' }, h('thead', {}, h('tr', {}, ['Name', 'Value or =expression', 'Result', 'Note', ''].map((x) => h('th', { text: x })))), h('tbody', {}, rows))));
    el.appendChild(h('div', { class: 'st-row2', style: 'margin-top:8px' }, h('button', { class: 'st-btn', text: 'Add parameter', onclick: () => store.transact('Add parameter', (pp) => { let n = 1; while (pp.params.some((z) => z.name === 'p' + n)) n++; pp.params.push({ name: 'p' + n, v: 10, note: '' }); }) })));
  } };

  tabs.mods = { el: h('div'), render() {
    if (keepFocus(this.el)) return; const el = clear(this.el), b = app.body;
    el.appendChild(h('p', { class: 'st-hint', text: 'Deformers act on the whole body, in order, and never change its faces. They move points as a function of position, so twist, taper, bend, ripple and cross-section can be mixed freely. Smooth rounds the shape by subdividing.' }));
    b.mods.forEach((m, i) => {
      const def = MOD_TYPES[m.type] || { label: m.type, defaults: {} }, card = h('div', { class: 'st-card' + (m.on === false ? ' off' : '') }, h('div', { class: 'st-row2' }, h('input', { type: 'checkbox', checked: m.on !== false, title: 'Enable', onchange: (e) => edit('Toggle modifier', (q, bb) => { bb.mods[i].on = e.target.checked; }) }), h('b', { class: 'grow', text: (i + 1) + '. ' + def.label }),
        h('button', { class: 'st-btn sm', text: '↑', disabled: i === 0, onclick: () => edit('Move modifier', (q, bb) => { const t = bb.mods[i - 1]; bb.mods[i - 1] = bb.mods[i]; bb.mods[i] = t; }) }), h('button', { class: 'st-btn sm', text: '↓', disabled: i === b.mods.length - 1, onclick: () => edit('Move modifier', (q, bb) => { const t = bb.mods[i + 1]; bb.mods[i + 1] = bb.mods[i]; bb.mods[i] = t; }) }), h('button', { class: 'st-btn sm danger', text: '×', onclick: () => edit('Delete modifier', (q, bb) => { bb.mods.splice(i, 1); }) })));
      Object.keys(def.defaults).forEach((k) => {
        if (k === 'shape') card.appendChild(selField('Shape', m.shape || 'polygon', [['polygon', 'Polygon'], ['lobes', 'Lobes'], ['super', 'Superellipse']], (v) => edit('Shape', (q, bb) => { bb.mods[i].shape = v; })));
        else if (k === 'easing') card.appendChild(selField('Easing', m.easing || 'linear', [['linear', 'Linear'], ['smooth', 'Smooth']], (v) => edit('Easing', (q, bb) => { bb.mods[i].easing = v; })));
        else card.appendChild(field(k, m[k], (v) => edit('Edit ' + def.label, (q, bb) => { const x = parseVal(v); bb.mods[i][k] = x === undefined ? def.defaults[k] : x; }, 'm' + i + k), { unit: '' }));
      });
      el.appendChild(card);
    });
    const add = h('select', { class: 'st-in' }, Object.keys(MOD_TYPES).map((k) => h('option', { value: k, text: MOD_TYPES[k].label })));
    el.appendChild(h('div', { class: 'st-row2' }, add, h('button', { class: 'st-btn pri', text: 'Add modifier', onclick: () => edit('Add modifier', (q, bb) => { bb.mods.push({ id: 'm' + q.nextId++, type: add.value, on: true, ...JSON.parse(JSON.stringify(MOD_TYPES[add.value].defaults)) }); }) })));
  } };

  tabs.history = { el: h('div'), render() {
    const el = clear(this.el), b = app.body, notes = (app.current && app.current.notes) || [];
    el.appendChild(h('p', { class: 'st-hint', text: 'Your direct edits, in order. Switch one off to see the shape without it, or delete it. If a parameter change removes a face an edit used, it is skipped and shown here.' }));
    if (!b.ops.length) el.appendChild(h('div', { class: 'st-card', text: 'No edits yet. Pick a face and use Push / Pull.' }));
    b.ops.forEach((op, i) => { const skipped = notes.find((n) => n.id === op.id); el.appendChild(h('div', { class: 'st-note ' + (skipped ? 'warn' : '') }, h('div', { class: 'st-row2' }, h('input', { type: 'checkbox', checked: !op.off, title: 'Apply this edit', onchange: (e) => edit('Toggle edit', (q, bb) => { bb.ops[i].off = !e.target.checked; }) }), h('span', { class: 'grow', text: (i + 1) + '. ' + app.describe(op) }), h('button', { class: 'st-btn sm danger', text: '×', onclick: () => edit('Delete edit', (q, bb) => { bb.ops.splice(i, 1); }) })), skipped ? h('div', { class: 'st-small', text: 'Skipped: ' + skipped.note }) : null)); });
    el.appendChild(h('div', { class: 'st-row2', style: 'margin-top:8px' }, h('button', { class: 'st-btn', text: 'Freeze shape', title: 'Turn the current result into a plain mesh. Parameters stop driving it.', onclick: () => app.ask({ title: 'Freeze this body?', message: 'The shape stays as it is now, but parameters, modifiers and the edit list no longer apply. Undo brings it back.', ok: 'Freeze' }, () => app.bake()) }), b.ops.length ? h('button', { class: 'st-btn danger', text: 'Clear all edits', onclick: () => edit('Clear edits', (q, bb) => { bb.ops = []; }) }) : null));
  } };

  let printMemo = null;
  tabs.print = { el: h('div'), render() {
    if (keepFocus(this.el) && this.el.querySelector('[data-keep]')) return; const el = clear(this.el), pr = store.p.print, S = (k) => (v) => { const n = parseFloat(v); if (isNaN(n)) return; store.transact('Print setting', (q) => { q.print[k] = n; }, { coalesce: 'pr' + k }); };
    el.appendChild(h('p', { class: 'st-hint', text: 'Sizes are in millimetres at 100%. The model is centred, sits on the bed, and every body is exported as a closed solid. Check Edits and the warnings below before slicing.' }));
    const num = (label, v, k, unit) => h('label', { class: 'st-row' }, h('span', { text: label }), h('input', { class: 'st-in', value: String(v), 'data-keep': 1, onchange: (e) => S(k)(e.target.value) }), h('span', { class: 'st-unit', text: unit || '' }));
    el.appendChild(h('div', { class: 'st-card' }, h('b', { text: 'Size and printer' }), num('Scale', pr.scalePct, 'scalePct', '%'), num('Smallest wall', pr.minWall, 'minWall', 'mm'), num('Bed X', pr.bedX, 'bedX', 'mm'), num('Bed Y', pr.bedY, 'bedY', 'mm'), num('Bed height', pr.bedZ, 'bedZ', 'mm'), num('Overhang limit', pr.overhang, 'overhang', 'deg from vertical... measured from the horizontal'),
      chk('Add a base plate', pr.base, (v) => store.transact('Print setting', (q) => { q.print.base = v; })), num('Base thickness', pr.baseMm, 'baseMm', 'mm')));
    const rec = buildPrint(store.p), card = h('div', { class: 'st-card' }, h('b', { text: 'Print preview' })); printMemo = rec;
    if (rec.totals) { const t = rec.totals; card.appendChild(h('div', { class: 'st-small', text: 'Size ' + t.dims.map((d) => Math.round(d)).join(' × ') + ' mm. ' + t.tris.toLocaleString() + ' triangles, ' + r1(t.volumeCm3) + ' cm³ (about ' + Math.round(t.weightG) + ' g solid). ' + (t.watertight ? 'Every body is a closed solid. ' : 'Some bodies are not closed. ') + (t.fits ? 'Fits the bed. ' : 'Too big for the bed. ') + Math.round(t.overhangPct) + '% of the surface overhangs.' })); }
    rec.warnings.forEach((w) => card.appendChild(h('div', { class: 'st-note ' + w.lvl }, h('span', { class: 'tag', text: w.lvl === 'err' ? 'Error' : (w.lvl === 'warn' ? 'Warning' : 'Note') }), ' ' + w.msg)));
    el.appendChild(card);
    el.appendChild(h('div', { class: 'st-card' }, h('b', { text: 'Export' }), h('div', { class: 'st-row2' }, h('button', { class: 'st-btn pri', text: 'STL', onclick: () => printNow('stl') }), h('button', { class: 'st-btn', text: '3MF with colours', onclick: () => printNow('3mf') }), h('button', { class: 'st-btn', text: 'STL per body (zip)', onclick: () => printNow('zip') }), h('button', { class: 'st-btn', text: 'OBJ (zip)', onclick: () => printNow('obj') }))));
  } };

  order.forEach(([k, l]) => { const b = h('button', { role: 'tab', text: l, onclick: () => showTab(k) }); tabs[k].btn = b; tabsEl.appendChild(b); tabBody.appendChild(tabs[k].el); tabs[k].el.hidden = k !== current; });
  function showTab(k) { current = k; order.forEach(([n]) => { tabs[n].el.hidden = n !== k; tabs[n].btn.classList.toggle('on', n === k); }); tabs[k].render(); }
  let pend = false;
  function refresh() {
    if (pend) return; pend = true;
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout)(() => {
      pend = false; undoBtn.disabled = !store.undoStack.length; redoBtn.disabled = !store.redoStack.length; if (document.activeElement !== nameIn) nameIn.value = store.p.name;
      try { tabs[current].render(); } catch (e) { console.error(e); tabs[current].el.textContent = 'Error: ' + e.message; }
      if (app.current) { const s = meshStats(app.current.mesh); els.info.textContent = app.current.mesh.f.length.toLocaleString() + ' faces · ' + (s.watertight ? 'closed solid' : 'open (' + s.openEdges + ' open edges)') + (app.sel.faces.length ? ' · ' + app.sel.faces.length + ' selected' : '') + (app.sel.verts.length ? ' · ' + app.sel.verts.length + ' points' : ''); }
      prof.dirty = true;
    });
  }
  const sidePanel = h('div', { class: 'st-side' }, h('div', { class: 'st-panels' }, tabsEl, tabBody));
  const bodyEl = h('div', { class: 'st-body' }, rail, mainEl, sidePanel);
  root.appendChild(h('div', { class: 'st-app fg-app' }, top, bodyEl, els.toast, keys, els.dlg));
  const closeMenus = (e) => { root.querySelectorAll('details.st-menu[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; }); };
  document.addEventListener('click', closeMenus);

  const view = new ForgeView(v3, app), prof = new Profile2D(profEl, app); app.setView(view); prof.app = app;
  if (view.ok) { view.fit(); view.canvas.tabIndex = 0; view.canvas.addEventListener('keydown', onKey); }
  function onKey(e) {
    const k = e.key;
    if (/^[0-9.\-,]$/.test(k) && !e.ctrlKey && !e.metaKey && numIn.isConnected) { numIn.focus(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.shiftKey ? store.redo() : store.undo(); e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'Y')) { store.redo(); e.preventDefault(); return; }
    if (k === 'Delete' || k === 'Backspace') { if (app.deleteSelection()) e.preventDefault(); return; }
    if (k === 'Escape') { app.clearSel(); app.cancelDrag(); return; }
    if (k === 'f' || k === 'F' || k === 'Home') { view.fit(); return; }
    if (!e.ctrlKey && !e.metaKey && TOOL_KEY[k.toLowerCase()]) { setTool(TOOL_KEY[k.toLowerCase()]); e.preventDefault(); }
  }
  function afterReplace() { nameIn.value = store.p.name; if (view.ok) view.fit(); prof.fit(); refresh(); }
  let saveT = null; store.on('change', () => { if (!deps.noSave) { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(store.p)); } catch (e) { /* storage full or blocked */ } }, 700); } });
  showTab('design'); setTool('select'); undoBtn.disabled = true; redoBtn.disabled = true; refresh();
  setTimeout(() => { prof.resize(); prof.fit(); view.resize(); if (view.ok) view.fit(); }, 60);
  return { app, store, view, prof, showTab, setTool, destroy() { document.removeEventListener('click', closeMenus); view.destroy(); prof.destroy(); clear(root); }, refresh };
}
