// Studio: layout, toolbars and the glue between the store, the 2D view, the 3D view and the panels.
import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { buildPanels } from './panels.js';
import { Store } from '../core/store.js';
import { newProject } from '../model/schema.js';
import { modelOf } from '../model/resolve.js';
import { View2D } from '../view2d/view2d.js';
import { View3D } from '../view3d/view3d.js';
import { SNAP_DEFAULT } from '../view2d/snap.js';
import { loadSaved, save, serialize, parseProject } from '../io/project.js';
import { importPlan } from '../io/importPlanner.js';
import { buildDXF } from '../io/dxf.js';
import { takeoff, toCSV } from '../model/quantities.js';
import { saveBytes } from '../io/download.js';
import { TOOL_KEYS } from '../view2d/tools.js';

// The tool rail: one icon per tool, thin dividers between families
const RAIL = [
  [['select', 'Select']],
  [['wall', 'Wall'], ['rect', 'Room walls'], ['split', 'Split wall']],
  [['door', 'Door'], ['window', 'Window'], ['arch', 'Open arch'], ['vent', 'Ventilator']],
  [['column', 'Column'], ['beam', 'Beam'], ['footing', 'Footing']],
  [['stair', 'Stair'], ['roof', 'Roof'], ['room', 'Room name']],
  [['dim', 'Dimension'], ['measure', 'Measure'], ['text', 'Text']],
];
const KEY_OF = {}; Object.keys(TOOL_KEYS).forEach((k) => { KEY_OF[TOOL_KEYS[k]] = k.toUpperCase(); });
const SNAPS = [['grid', 'Grid'], ['end', 'Endpoint'], ['mid', 'Midpoint'], ['int', 'Crossing'], ['cen', 'Centre'], ['perp', 'Perpendicular'], ['near', 'Nearest on wall'], ['polar', 'Polar angles (15°)']];
const ROOM_TYPES = [['room', 'Room'], ['bed', 'Bedroom'], ['living', 'Living'], ['dining', 'Dining'], ['kitchen', 'Kitchen'], ['bath', 'Bathroom'], ['wc', 'WC'], ['bathwc', 'Bath and WC'], ['store', 'Store'], ['pooja', 'Pooja'], ['corridor', 'Corridor'], ['court', 'Courtyard (open)']];

// A dropdown made from <details>. items: [label, fn] or 'sep'. Closes after a choice.
function menu(label, items, cls) {
  const d = h('details', { class: 'st-menu ' + (cls || '') }), box = h('div', { class: 'st-menuitems' });
  items.forEach((it) => { if (it === 'sep') box.appendChild(h('div', { class: 'st-msep' })); else box.appendChild(h('button', { class: 'st-btn', text: it[0], onclick: () => { d.open = false; it[1](); } })); });
  d.appendChild(h('summary', { class: 'st-btn', text: label })); d.appendChild(box); return d;
}

export function createStudio(root, deps = {}) {
  const saved = deps.noSave ? null : loadSaved(), store = new Store(saved || newProject('My house'));
  const state = { tool: 'select', snap: { ...SNAP_DEFAULT }, showGrid: true, showUnder: true, snapStep: 0, opts: { wallT: '=wallIn', wallH: '=storey', doorW: '=doorW', winW: '=winW', archW: 4, colB: '=colB', colShape: 'rect', stairW: 3.5, roofType: 'hip', roomName: 'Room', roomType: 'room' } };
  const app = { store, state, view2d: null, view3d: null, panels: null }, els = {};
  app.isDark = () => { const t = document.documentElement.getAttribute('data-theme'); return t === 'dark' || (t !== 'light' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches); };
  let toastT = null;
  app.toast = (msg) => { els.toast.textContent = msg; els.toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => els.toast.classList.remove('on'), 5500); };
  app.setStatus = (t) => { if (els.hint) els.hint.textContent = t; };
  app.setCoords = (p, sn) => { if (els.coords) els.coords.textContent = 'x ' + p[0].toFixed(2) + '   y ' + p[1].toFixed(2) + '   ' + ({ end: 'Endpoint', mid: 'Midpoint', int: 'Crossing', cen: 'Centre', perp: 'Perpendicular', near: 'Nearest', grid: '', polar: 'Polar ' + ((sn && sn.angle) || 0) + '°', ortho: 'Ortho', free: '' }[sn ? sn.type : 'free'] || ''); };
  app.setTool = (id) => { state.tool = id; app.view2d.setTool(id); syncTools(); renderOptions(); if (id !== 'select' && store.selection.length) store.select([]); try { app.view2d.canvas.focus(); } catch (e) { /* not focusable */ } };
  app.setLevel = (id) => { store.setActive(id); syncLevel(); app.view2d.invalidate(); if (app.view3d && app.view3d.ok && app.view3d.opts.levels !== 'all') app.view3d.rebuild(); };
  app.syncSnap = () => { syncSnap(); app.view2d.invalidate(); };
  app.refreshOptions = () => renderOptions();
  // In-page dialog: sandboxed pages can block confirm() and prompt(), so the tool never relies on them.
  app.ask = (o, cb) => {
    const dlg = els.dlg; clear(dlg);
    const inp = o.input ? h('input', { class: 'st-in', value: o.value || '', style: 'width:100%', onkeydown: (e) => { if (e.key === 'Enter') yes(); } }) : null;
    const close = () => { dlg.hidden = true; clear(dlg); };
    const yes = () => { const v = inp ? inp.value : true; close(); cb(v); };
    dlg.appendChild(h('div', { class: 'st-card' }, h('b', { text: o.title || 'Please confirm' }), o.message ? h('div', { class: 'st-small', text: o.message }) : null, inp,
      h('div', { class: 'st-row2' }, h('button', { class: 'st-btn pri', text: o.ok || 'OK', onclick: yes }), h('button', { class: 'st-btn', text: o.cancel || 'Cancel', onclick: close }))));
    dlg.hidden = false; if (inp) setTimeout(() => inp.focus(), 0);
  };

  // ---------- top bar
  const nameIn = h('input', { class: 'st-name', value: store.p.name, title: 'Project name', onchange: (e) => store.transact('Rename project', (p) => { p.name = e.target.value.trim() || 'Untitled'; }) });
  const lvSel = h('select', { class: 'st-in', title: 'Active level', onchange: (e) => app.setLevel(e.target.value) });
  const unitSel = h('select', { class: 'st-in', title: 'Units shown', onchange: (e) => store.transact('Units', (p) => { p.display = e.target.value; }) }, [['ftin', 'ft-in'], ['ft', 'feet'], ['mm', 'mm'], ['m', 'metres']].map(([v, l]) => h('option', { value: v, text: l })));
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { store.replace(parseProject(String(r.result))); afterReplace(); app.toast('Opened ' + f.name); } catch (x) { app.toast(x.message); } }; r.readAsText(f); e.target.value = ''; } });
  const asProject = () => saveBytes((store.p.name || 'project').replace(/[^\w\-]+/g, '_') + '.studio.json', 'application/json', serialize(store.p));
  const newProj = () => { const go = () => { store.replace(newProject('My house')); afterReplace(); }; if (store.undoStack.length || store.p.walls.length) app.ask({ title: 'Start a new project?', message: 'Use Save first if you want to keep this one as a file. It stays in this browser until you change something.', ok: 'Start new' }, go); else go(); };
  const fileMenu = menu('File', [
    ['New', newProj], ['Open', () => file.click()], ['Save project (.json)', asProject], 'sep',
    ['Import from planner', () => importFromPlanner()], 'sep',
    ['Plan DXF, this level', () => saveBytes('plan_' + store.p.activeLevel + '.dxf', 'application/dxf', buildDXF(modelOf(store), { levels: [store.p.activeLevel] }))],
    ['Plan DXF, all levels', () => saveBytes('plan_all_levels.dxf', 'application/dxf', buildDXF(modelOf(store), { levels: store.p.levels.map((l) => l.id) }))],
    ['Quantities CSV', () => saveBytes('quantities.csv', 'text/csv', toCSV(takeoff(modelOf(store)), [{ label: 'Group', key: 'group' }, { label: 'Item', key: 'item' }, { label: 'Unit', key: 'unit' }, { label: 'Quantity', key: 'qty' }, { label: 'Note', key: 'note' }]))],
    ['3D print (STL, 3MF)…', () => app.panels.show('print')],
  ]);
  const undoBtn = h('button', { class: 'st-btn ico', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', text: '↶', onclick: () => store.undo() }), redoBtn = h('button', { class: 'st-btn ico', title: 'Redo (Ctrl+Y)', 'aria-label': 'Redo', text: '↷', onclick: () => store.redo() });
  els.undoBtn = undoBtn; els.redoBtn = redoBtn;
  const viewBtns = [['both', '2D + 3D'], ['only2d', '2D'], ['only3d', '3D']].map(([k, l]) => h('button', { class: 'st-seg1' + (k === 'both' ? ' on' : ''), text: l, onclick: () => setView(k) }));
  const sideBtn = h('button', { class: 'st-btn ico', title: 'Show or hide the side panel', 'aria-label': 'Side panel', onclick: () => { bodyEl.classList.toggle('noside'); setTimeout(() => { app.view2d.resize(); if (app.view3d.ok) app.view3d.resize(); }, 30); } }, icon('panel', 18));
  const top = h('div', { class: 'st-top' }, nameIn, fileMenu, undoBtn, redoBtn, h('span', { class: 'st-sep' }), lvSel, unitSel, h('span', { class: 'grow' }),
    h('div', { class: 'st-viewtog' }, viewBtns), h('button', { class: 'st-btn ico', title: 'Keys and help (?)', 'aria-label': 'Help', text: '?', onclick: () => { keysDlg.hidden = !keysDlg.hidden; } }), sideBtn, file);

  // ---------- tool rail
  const rail = h('div', { class: 'st-tools' }), toolBtns = {};
  RAIL.forEach((grp, i) => { if (i) rail.appendChild(h('div', { class: 'st-rsep' })); grp.forEach(([id, l]) => { const b = h('button', { class: 'st-tool', title: l + '  (' + KEY_OF[id] + ')', 'aria-label': l, onclick: () => app.setTool(id) }, icon(id)); toolBtns[id] = b; rail.appendChild(b); }); });
  function syncTools() { Object.keys(toolBtns).forEach((k) => toolBtns[k].classList.toggle('on', k === state.tool)); }

  // ---------- one slim options bar: tool options on the left, snaps and view on the right
  const optsEl = h('div', { class: 'st-opts' }), optsL = h('div', { class: 'st-optsl' }), optsR = h('div', { class: 'st-optsr' });
  optsEl.appendChild(optsL); optsEl.appendChild(optsR);
  const snapChecks = {};
  const snapMenu = h('details', { class: 'st-menu' }, h('summary', { class: 'st-btn', text: 'Snap' }), h('div', { class: 'st-menuitems' }, SNAPS.map(([k, l]) => { const c = h('input', { type: 'checkbox', onchange: () => { state.snap[k] = c.checked; syncSnap(); app.view2d.invalidate(); } }); snapChecks[k] = c; return h('label', { class: 'chk' }, c, ' ' + l); })));
  const orthoB = h('button', { class: 'st-btn tog', text: 'Ortho', title: 'Lock to horizontal or vertical (F8, or hold Shift)', onclick: () => { state.snap.ortho = !state.snap.ortho; syncSnap(); app.view2d.invalidate(); } });
  const gridC = h('input', { type: 'checkbox', onchange: () => { state.showGrid = gridC.checked; app.view2d.invalidate(); } }), underC = h('input', { type: 'checkbox', onchange: () => { state.showUnder = underC.checked; app.view2d.invalidate(); } });
  const viewMenu = h('details', { class: 'st-menu' }, h('summary', { class: 'st-btn', text: 'View' }), h('div', { class: 'st-menuitems' }, h('label', { class: 'chk' }, gridC, ' Grid lines (G)'), h('label', { class: 'chk' }, underC, ' Level below as underlay')));
  const fitB = h('button', { class: 'st-btn ico', title: 'Zoom to fit (Z)', 'aria-label': 'Zoom to fit', onclick: () => app.view2d.zoomExtents() }, icon('fit', 18));
  optsR.appendChild(snapMenu); optsR.appendChild(orthoB); optsR.appendChild(viewMenu); optsR.appendChild(fitB);
  function syncSnap() { SNAPS.forEach(([k]) => { snapChecks[k].checked = !!state.snap[k]; }); orthoB.classList.toggle('on', !!state.snap.ortho); gridC.checked = state.showGrid; underC.checked = state.showUnder; }
  function renderOptions() {
    clear(optsL); const o = state.opts, t = state.tool, tool = app.view2d && app.view2d.tool;
    optsL.appendChild(h('b', { class: 'st-toolname', text: (tool && tool.label) || 'Select' }));
    const txt = (label, key, w) => h('label', { class: 'st-opt' }, label, h('input', { class: 'st-in', style: 'width:' + (w || 84) + 'px', value: String(o[key]), onchange: (e) => { const v = e.target.value.trim(); o[key] = /^-?\d*\.?\d+$/.test(v) ? parseFloat(v) : v; } }));
    const sel = (label, key, list) => h('label', { class: 'st-opt' }, label, h('select', { class: 'st-in', onchange: (e) => { o[key] = e.target.value; } }, list.map(([v, l]) => h('option', { value: v, text: l, selected: o[key] === v }))));
    if (t === 'wall' || t === 'rect') {
      const std = ['=wallOut', '=wallIn', 0.5].includes(o.wallT);
      optsL.appendChild(h('label', { class: 'st-opt' }, 'Thickness', h('select', { class: 'st-in', onchange: (e) => { o.wallT = e.target.value === 'custom' ? 0.5 : (e.target.value === '0.5' ? 0.5 : e.target.value); renderOptions(); } }, [['=wallIn', 'Inner wall'], ['=wallOut', 'Outer wall'], ['0.5', 'Courtyard side'], ['custom', 'Custom']].map(([v, l]) => h('option', { value: v, text: l, selected: std ? String(o.wallT) === v : v === 'custom' })))));
      if (!std) optsL.appendChild(txt('Value', 'wallT', 80)); optsL.appendChild(txt('Height', 'wallH', 84));
    } else if (t === 'door') optsL.appendChild(txt('Width', 'doorW', 84));
    else if (t === 'window') optsL.appendChild(txt('Width', 'winW', 84));
    else if (t === 'arch') optsL.appendChild(txt('Width', 'archW', 84));
    else if (t === 'column') { optsL.appendChild(txt('Width', 'colB', 84)); optsL.appendChild(sel('Shape', 'colShape', [['rect', 'Rectangular'], ['round', 'Round']])); }
    else if (t === 'stair') optsL.appendChild(txt('Width', 'stairW', 70));
    else if (t === 'roof') optsL.appendChild(sel('Type', 'roofType', [['hip', 'Hip'], ['gable', 'Gable'], ['shed', 'Shed'], ['flat', 'Flat']]));
    else if (t === 'room') { optsL.appendChild(txt('Name', 'roomName', 120)); optsL.appendChild(sel('Type', 'roomType', ROOM_TYPES)); }
  }

  // ---------- views
  const v2 = h('div', { class: 'st-v2d' }), v3 = h('div', { class: 'st-v3d' }), views = h('div', { class: 'st-views both' }, v2, v3), bar3 = h('div', { class: 'st-bar3' });
  v3.appendChild(bar3);
  els.empty = h('div', { class: 'st-empty' }, h('b', { text: 'Start a plan' }), h('div', { class: 'st-small', text: 'Press W to draw walls, or R for a closed room. Type a length and press Enter for exact sizes.' }),
    h('div', { class: 'st-row2' }, h('button', { class: 'st-btn pri', text: 'Draw walls', onclick: () => app.setTool('wall') }), h('button', { class: 'st-btn', text: 'Import from planner', onclick: () => importFromPlanner() })));
  v2.appendChild(els.empty);
  function setView(k) { views.className = 'st-views ' + k; viewBtns.forEach((b, i) => b.classList.toggle('on', ['both', 'only2d', 'only3d'][i] === k)); setTimeout(() => { app.view2d.resize(); if (app.view3d && app.view3d.ok) { app.view3d.resize(); app.view3d.fit(); } }, 30); }
  function build3DBar() {
    const V = () => app.view3d, ok = () => V() && V().ok;
    const viewSel = h('select', { class: 'st-in', title: 'Standard views', onchange: (e) => { if (ok() && e.target.value) V().view(e.target.value); e.target.value = ''; } }, h('option', { value: '', text: 'View' }), [['iso', '3D view'], ['top', 'Top'], ['front', 'Front'], ['back', 'Back'], ['left', 'Left'], ['right', 'Right']].map(([v, l]) => h('option', { value: v, text: l })));
    bar3.appendChild(viewSel);
    bar3.appendChild(h('button', { class: 'st-btn tog', text: 'Ortho', title: 'Orthographic or perspective camera', onclick: (e) => { if (!ok()) return; V().setOrtho(!V().s.ortho); e.target.classList.toggle('on', V().s.ortho); } }));
    bar3.appendChild(h('select', { class: 'st-in', title: 'Display', onchange: (e) => ok() && V().setOpt('mode', e.target.value) }, [['edges', 'Shaded + edges'], ['shaded', 'Shaded'], ['wire', 'Wireframe'], ['xray', 'X-ray']].map(([v, l]) => h('option', { value: v, text: l }))));
    const pos = h('input', { type: 'range', min: 0, max: 30, step: 0.25, value: 8, disabled: true, class: 'st-range', title: 'Cut position' });
    const flip = h('input', { type: 'checkbox' }), ax = h('select', { class: 'st-in', title: 'Section cut' }, [['none', 'Off'], ['z', 'Plan cut (height)'], ['x', 'East-west cut'], ['y', 'North-south cut']].map(([v, l]) => h('option', { value: v, text: l })));
    const apply = () => { if (!ok()) return; const a = ax.value, box = V().extent(); const rng = a === 'z' ? [box.min.y, box.max.y] : a === 'x' ? [box.min.x, box.max.x] : [-box.max.z, -box.min.z]; if (a !== apply.last) { pos.min = Math.floor(rng[0]); pos.max = Math.ceil(rng[1]); pos.value = a === 'z' ? Math.min(rng[1], rng[0] + 4) : (rng[0] + rng[1]) / 2; apply.last = a; } pos.disabled = a === 'none'; V().setSection(a, parseFloat(pos.value), flip.checked); };
    ax.addEventListener('change', apply); pos.addEventListener('input', apply); flip.addEventListener('change', apply);
    bar3.appendChild(h('details', { class: 'st-menu' }, h('summary', { class: 'st-btn', text: 'Layers' }), h('div', { class: 'st-menuitems wide' },
      h('label', { class: 'st-opt' }, 'Levels', h('select', { class: 'st-in', onchange: (e) => ok() && V().setOpt('levels', e.target.value) }, [['all', 'All levels'], ['upto', 'This level and below'], ['active', 'This level only']].map(([v, l]) => h('option', { value: v, text: l })))),
      [['walls', 'Walls'], ['slabs', 'Slabs'], ['roofs', 'Roofs'], ['structure', 'Columns, beams, footings'], ['stairs', 'Stairs'], ['panels', 'Doors and glass']].map(([k, l]) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => ok() && V().setCat(k, e.target.checked) }), ' ' + l)))));
    bar3.appendChild(h('details', { class: 'st-menu' }, h('summary', { class: 'st-btn', text: 'Section' }), h('div', { class: 'st-menuitems wide' }, h('label', { class: 'st-opt' }, 'Cut', ax), pos, h('label', { class: 'chk' }, flip, ' Flip side'))));
    bar3.appendChild(h('button', { class: 'st-btn ico', title: 'Fit to view', 'aria-label': 'Fit to view', onclick: () => ok() && V().fit() }, icon('fit', 18)));
  }

  // ---------- status, panels, dialogs, layout
  els.hint = h('span', { class: 'grow st-hintbar' }); els.coords = h('span', { class: 'st-coords' }); els.toast = h('div', { class: 'st-toast' });
  els.dlg = h('div', { class: 'st-keys', hidden: true });
  const status = h('div', { class: 'st-status' }, els.hint, els.coords);
  const panels = buildPanels(app); app.panels = panels;
  const keysDlg = h('div', { class: 'st-keys', hidden: true, onclick: () => { keysDlg.hidden = true; } }, h('div', { class: 'st-card wide' }, h('b', { text: 'Keys' }),
    h('div', { class: 'st-small', text: 'Tools: S select, W wall, R room walls, X split, D door, N window, A arch, C column, B beam, F footing, T stair, O roof, M room name, I dimension, E measure, Y text.' }),
    h('div', { class: 'st-small', text: 'Z or Home zoom to fit. G grid. F3 grid snap. F8 ortho, or hold Shift while drawing. Space and drag, or middle mouse, pans. Wheel zooms. Esc cancels. Delete removes. Ctrl+Z undo, Ctrl+Y redo, Ctrl+D duplicate, Ctrl+A select all, arrow keys nudge.' }),
    h('div', { class: 'st-small', text: 'While drawing, type a length (12\'6", 3.5, 1200mm) and press Enter. Walls also take length<angle, room walls take width,height.' }),
    h('div', { class: 'st-small', text: 'In 3D: drag to orbit, right-drag or Shift-drag to pan, wheel to zoom, click to select.' })));
  const mainEl = h('div', { class: 'st-main' }, optsEl, views, status);
  const bodyEl = h('div', { class: 'st-body' }, rail, mainEl, h('div', { class: 'st-side' }, panels.el));
  root.appendChild(h('div', { class: 'st-app' }, top, bodyEl, els.toast, keysDlg, els.dlg));
  const closeMenus = (e) => { root.querySelectorAll('details.st-menu[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; }); };
  document.addEventListener('click', closeMenus);
  document.addEventListener('keydown', (e) => { if (e.key === '?' && !/INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || '') && !root.hidden) keysDlg.hidden = !keysDlg.hidden; });

  app.view2d = new View2D(v2, store, app); app.view3d = new View3D(v3, store, app); build3DBar();

  function syncLevel() { clear(lvSel); store.p.levels.forEach((l) => lvSel.appendChild(h('option', { value: l.id, text: l.name, selected: l.id === store.p.activeLevel }))); }
  function afterReplace() { nameIn.value = store.p.name; unitSel.value = store.p.display; syncLevel(); app.view2d.zoomExtents(); if (app.view3d.ok) { app.view3d.rebuild(); app.view3d.fit(); } panels.refresh(); syncEmpty(); }
  function syncEmpty() { els.empty.hidden = store.p.walls.length > 0 || store.p.columns.length > 0 || store.p.slabs.length > 0; }
  function importFromPlanner() {
    const ed = window.__ed, core = window.__core; if (!ed || !core) { app.toast('The planner is not loaded.'); return; }
    const go = () => {
      try {
        const res = importPlan(ed.planFor(ed.ST), ed.ST, core); store.replace(res.project); afterReplace();
        app.toast('Imported the planner layout: ' + res.project.walls.length + ' walls, ' + res.project.openings.length + ' openings.' + (res.skipped ? ' ' + res.skipped + ' openings could not be placed.' : '') + ' The planner roof became four roof wings you can edit.');
      } catch (e) { console.error(e); app.toast('Import failed: ' + e.message); }
    };
    if (store.p.walls.length) app.ask({ title: 'Replace the Studio project?', message: 'The current Studio drawing will be replaced by the planner layout, and Undo will not bring it back. Save first if you need it.', ok: 'Replace' }, go); else go();
  }
  let saveT = null;
  const onChange = () => {
    syncLevel(); nameIn.value = store.p.name; unitSel.value = store.p.display; undoBtn.disabled = !store.undoStack.length; redoBtn.disabled = !store.redoStack.length; syncEmpty();
    panels.refresh(); app.view2d.invalidate();
    if (!deps.noSave) { clearTimeout(saveT); saveT = setTimeout(() => save(store.p), 700); }
  };
  store.on('change', onChange); store.on('selection', () => { panels.refresh(); app.view2d.invalidate(); });
  syncLevel(); syncSnap(); syncTools(); app.view2d.setTool('select'); renderOptions(); syncEmpty(); unitSel.value = store.p.display; undoBtn.disabled = true; redoBtn.disabled = true;
  setTimeout(() => { app.view2d.resize(); app.view2d.zoomExtents(); if (app.view3d.ok) app.view3d.fit(); }, 50);
  return { store, app, destroy() { document.removeEventListener('click', closeMenus); app.view2d.destroy(); app.view3d.destroy(); clear(root); }, setView, importFromPlanner };
}
