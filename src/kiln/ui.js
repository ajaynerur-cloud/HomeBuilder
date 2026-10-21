// Kiln: constraint-driven vessel CAD. Feature tree, dimensioned profile sketch, intent drag, live engineering constraints, drawing and print export.
import { h, clear } from '../studio/ui/dom.js';
import { newKiln, resolve, CTYPES, MATERIALS, TEMPLATES, constraintStatus, migrate, isExpr, validName, kid } from './model.js';
import { evaluate, meshCheck } from './engine.js';
import { intentDrag, satisfy, step, freeVars } from './solver.js';
import { KilnView } from './view.js';
import { KilnSketch } from './sketch.js';
import { drawingSVG } from './drawing.js';
import { logoSVG } from './logo.js';
import { encodeSTL, encode3MF } from '../studio/io/meshio.js';
import { createZip } from '../studio/io/zip.js';
import { saveBytes } from '../studio/io/download.js';

const KEY = 'chp_kiln_v1', OPS = [['=', '='], ['<=', '≤'], ['>=', '≥']];
const DIRS = [['free', 'Free'], ['normal', 'Normal'], ['radial', 'Radial'], ['vertical', 'Vertical']];
const FULL = [96, 80], DRAG = [64, 48];

export function createKiln(root, deps = {}) {
  let doc = null; if (!deps.noSave) { try { const j = localStorage.getItem(KEY); if (j) doc = migrate(JSON.parse(j)); } catch (e) { /* storage blocked or empty */ } }
  if (!doc) doc = newKiln();
  const ui = { view: '3d', tool: 'intent', dir: 'free', tab: 'model', node: 'profile', sel: 2, rel: -1, drag: null, lastDeltas: null };
  let hist = [JSON.stringify(doc)], hi = 0, E = null, R = null, saveT = null;
  const app = {};

  // ---------- layout
  const logo = h('span', { class: 'kn-logo' }); logo.innerHTML = logoSVG(30);
  const nameIn = h('input', { class: 'kn-name', value: doc.name, 'aria-label': 'Project name', onchange: (e) => { doc.name = e.target.value.trim() || 'Untitled'; commit(); } });
  const undoB = h('button', { class: 'kn-btn ico', title: 'Undo', 'aria-label': 'Undo', text: '↶', onclick: () => restore(hi - 1) }), redoB = h('button', { class: 'kn-btn ico', title: 'Redo', 'aria-label': 'Redo', text: '↷', onclick: () => restore(hi + 1) });
  const solveB = h('button', { class: 'kn-btn pri', text: 'Solve', title: 'Bring the design inside every active constraint with the smallest change', onclick: () => solveNow() });
  const top = h('div', { class: 'kn-top' }, h('div', { class: 'kn-brand' }, logo, h('div', null, h('b', { text: 'Kiln' }), h('small', { text: 'constraint-driven vessel CAD' }))), nameIn, h('span', { class: 'kn-grow' }), undoB, redoB, solveB);
  const viewSeg = [['3d', '3D'], ['sketch', 'Sketch'], ['drawing', 'Drawing']].map(([k, l]) => h('button', { text: l, onclick: () => setView(k) }));
  const toolSeg = [['orbit', 'Orbit'], ['intent', 'Intent drag'], ['relief', 'Relief']].map(([k, l]) => h('button', { text: l, onclick: () => { ui.tool = k; syncBar(); } }));
  const dirSel = h('select', { class: 'kn-in', title: 'Drag direction', onchange: (e) => { ui.dir = e.target.value; } }, DIRS.map(([k, l]) => h('option', { value: k, text: l })));
  const togs = {}; const tog = (k, l) => (togs[k] = h('button', { class: 'kn-chip', text: l, onclick: () => { R.view.opts[k] = !R.view.opts[k]; syncBar(); rebuild(); } }));
  const bar = h('div', { class: 'kn-bar' }, h('div', { class: 'kn-seg' }, viewSeg), h('div', { class: 'kn-seg kn-3donly' }, toolSeg), h('span', { class: 'kn-3donly' }, dirSel), h('span', { class: 'kn-grow' }), h('span', { class: 'kn-3donly kn-togs' }, tog('lean', 'Lean map'), tog('water', 'Water'), tog('cut', 'Cut'), tog('planes', 'Planes')));
  const v3 = h('div', { class: 'kn-v3' }), vs = h('div', { class: 'kn-vs', hidden: true }), vd = h('div', { class: 'kn-vd', hidden: true });
  const hud = h('div', { class: 'kn-hud' }), intentEl = h('div', { class: 'kn-intent', hidden: true }), toastEl = h('div', { class: 'kn-toast' }), hint = h('div', { class: 'kn-hint' });
  const stage = h('div', { class: 'kn-stage' }, v3, vs, vd, hud, intentEl, hint, toastEl);
  const tabsEl = h('div', { class: 'kn-tabs', role: 'tablist' }), panel = h('div', { class: 'kn-panel' });
  const TABS = [['model', 'Model'], ['cons', 'Constraints'], ['ana', 'Analysis'], ['export', 'Export']], tabB = TABS.map(([k, l]) => h('button', { role: 'tab', text: l, onclick: () => { ui.tab = k; syncBar(); renderPanel(); } }));
  tabsEl.append(...tabB);
  const dlg = h('div', { class: 'kn-dlg', hidden: true });
  const appEl = h('div', { class: 'kn-app' }, top, h('div', { class: 'kn-body' }, h('div', { class: 'kn-main' }, bar, stage), h('div', { class: 'kn-side' }, tabsEl, panel)), dlg);
  root.appendChild(appEl);
  const view = new KilnView(v3), sketch = new KilnSketch(vs); R = { view, sketch };
  if (!view.ok) v3.appendChild(h('div', { class: 'kn-msg', text: 'WebGL is not available here. The sketch, drawing, analysis and export still work.' }));

  const css = () => { const s = getComputedStyle(appEl); const g = (n, d) => (s.getPropertyValue(n) || d).trim() || d; return { ink: g('--ink', '#222'), ink2: g('--ink2', '#777'), line: g('--line', '#ddd'), acc: '#e8672c', water: '#2f7fc4', card: g('--card', '#fff') }; };
  function toast(t) { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('on'), 4200); }
  function ask(o, cb) { clear(dlg); const inp = h('input', { class: 'kn-in', value: o.value || '', style: 'width:100%', onkeydown: (e) => { if (e.key === 'Enter') ok(); } }), close = () => { dlg.hidden = true; clear(dlg); }, ok = () => { const v = inp.value; close(); cb(v); };
    dlg.appendChild(h('div', { class: 'kn-card' }, h('b', { text: o.title }), o.message ? h('div', { class: 'kn-small', text: o.message }) : null, inp, h('div', { class: 'kn-row' }, h('button', { class: 'kn-btn pri', text: 'Apply', onclick: ok }), h('button', { class: 'kn-btn', text: 'Cancel', onclick: close })))); dlg.hidden = false; setTimeout(() => inp.focus(), 0); }

  // ---------- history
  function commit() { const s = JSON.stringify(doc); if (s !== hist[hi]) { hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 100) hist.shift(); hi = hist.length - 1; } syncBar(); if (!deps.noSave) { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, s); } catch (e) { /* ignore */ } }, 400); } }
  function restore(i) { if (i < 0 || i >= hist.length) return; hi = i; doc = JSON.parse(hist[hi]); nameIn.value = doc.name; ui.sel = Math.min(ui.sel, doc.profile.length - 1); syncBar(); rebuild(); renderPanel(); }

  // ---------- evaluation and drawing
  function limitLean() { const c = doc.constraints.find((x) => x.on && x.type === 'overhang'); return c ? c.value : 45; }
  function rebuild(q) {
    const res = resolve(doc), [U, M] = q === 'drag' ? DRAG : FULL; E = evaluate(res.D, U, M); E.Dpts = res.D.pts; E.errors = res.errors; E.D = res.D;
    const planes = res.D.pts.map((p, i) => ({ z: p.z, r: p.r, sel: i === ui.sel }));
    if (ui.view === '3d') view.show(E, limitLean(), { planes, target: ui.drag && ui.drag.target, from: ui.drag && ui.drag.from });
    if (ui.view === 'sketch') sketch.draw(doc, E, ui.sel, limitLean(), css());
    if (ui.view === 'drawing' && q !== 'drag') vd.innerHTML = drawingSVG(doc, E);
    renderHUD(); if (q !== 'drag') refreshLive();
  }
  function renderHUD() {
    clear(hud); const a = E.a;
    doc.constraints.filter((c) => c.on).forEach((c) => { const s = constraintStatus(c, a), T = CTYPES[c.type]; hud.appendChild(h('div', { class: 'kn-hchip ' + (s.ok ? 'ok' : 'bad'), title: T.label + ' ' + c.op + ' ' + c.value + ' ' + T.unit }, h('span', { text: T.label.replace('Tipping angle, filled', 'Tip').replace('Steepest wall lean', 'Lean').replace('Narrowest opening Ø', 'Neck Ø').replace('Rim opening Ø', 'Rim Ø') }), h('b', { text: T.fmt(s.v) }), h('i', { text: s.ok ? '✓' : '✗' }))); });
    if (E.errors && E.errors.length) hud.appendChild(h('div', { class: 'kn-hchip bad', text: E.errors[0] }));
  }
  function renderIntent(deltas, title) {
    if (!deltas || !deltas.length) { intentEl.hidden = true; return; }
    const top6 = deltas.filter((d) => Math.abs(d.d) > 0.01).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 6), mx = Math.max(0.2, ...top6.map((d) => Math.abs(d.d))); clear(intentEl);
    intentEl.appendChild(h('div', { class: 'kn-ititle', text: title || ('Intent drag: ' + deltas.filter((d) => Math.abs(d.d) > 0.01).length + ' dimensions moving together') }));
    top6.forEach((d) => intentEl.appendChild(h('div', { class: 'kn-irow' }, h('span', { text: d.label }), h('div', { class: 'kn-ibar' }, h('div', { class: d.d >= 0 ? 'pos' : 'neg', style: 'width:' + Math.round(Math.abs(d.d) / mx * 100) + '%' })))));
    intentEl.hidden = false;
  }
  function setView(k) { ui.view = k; v3.hidden = k !== '3d'; vs.hidden = k !== 'sketch'; vd.hidden = k !== 'drawing'; syncBar(); setTimeout(() => { if (k === '3d') view.resize(); rebuild(); }, 0); }
  function syncBar() {
    viewSeg.forEach((b, i) => b.classList.toggle('on', ['3d', 'sketch', 'drawing'][i] === ui.view)); toolSeg.forEach((b, i) => b.classList.toggle('on', ['orbit', 'intent', 'relief'][i] === ui.tool));
    appEl.classList.toggle('kn-not3d', ui.view !== '3d'); Object.keys(togs).forEach((k) => togs[k].classList.toggle('on', !!view.opts[k]));
    tabB.forEach((b, i) => b.classList.toggle('on', TABS[i][0] === ui.tab)); undoB.disabled = hi === 0; redoB.disabled = hi >= hist.length - 1;
    hint.textContent = ui.view === 'sketch' ? 'Drag a point; the solver keeps the constraints. Tap a dimension to set it.' : ui.view === 'drawing' ? '' : ui.tool === 'intent' ? 'Drag any point of the surface. Free dimensions move together; constraints hold.' : ui.tool === 'relief' ? 'Tap to place a relief, then drag it. Constraints still hold.' : 'Drag to orbit. Two fingers pan and zoom.';
  }

  // ---------- solving
  function solveNow(silent) {
    const r = satisfy(doc, { iters: 12, res: 40 }); rebuild(); const bad = doc.constraints.filter((c) => c.on && !constraintStatus(c, E.a).ok);
    commit(); renderPanel(); if (silent) return r;
    if (!r || !r.ok) toast(r ? r.reason : 'Nothing to solve.'); else if (bad.length) toast('Could not meet ' + bad.map((c) => CTYPES[c.type].label.toLowerCase()).join(', ') + '. Unlock more dimensions or relax a limit.'); else toast('All constraints met.');
    return r;
  }
  // ---------- 3D interaction: orbit, intent drag, relief
  const ptrs = new Map(); let pinch = null, raf = 0, pending = null;
  function dragAxis(hit) { if (ui.dir === 'vertical') return [0, 0, 1]; if (ui.dir === 'radial') { const l = Math.hypot(hit.point[0], hit.point[1]) || 1; return [hit.point[0] / l, hit.point[1] / l, 0]; } if (ui.dir === 'normal') return hit.normal; return null; }
  function beginIntent(e, hit, emphasis) { ui.drag = { u: hit.u, v: hit.v, from: hit.point, target: hit.point, axis: dragAxis(hit), emphasis, acc: {}, moved: false }; renderIntent([{ label: 'Waiting for drag', d: 0 }], 'Intent drag'); }
  function runDrag() {
    raf = 0; const d = ui.drag; if (!d || !pending) return; const { x, y } = pending; pending = null;
    d.target = view.dragTarget(x, y, d.from, d.axis); if (Math.hypot(d.target[0] - d.from[0], d.target[1] - d.from[1], d.target[2] - d.from[2]) < 0.3) return; d.moved = true;
    const r = intentDrag(doc, { u: d.u, v: d.v, target: d.target, w: 1.2 }, { res: 24, emphasis: d.emphasis });
    (r.deltas || []).forEach((q) => { d.acc[q.key] = d.acc[q.key] || { ...q, d: 0 }; d.acc[q.key].d += q.d; }); renderIntent(Object.values(d.acc)); rebuild('drag');
  }
  function endIntent() { const d = ui.drag; ui.drag = null; if (d && d.moved) { satisfy(doc, { iters: 4, res: 40 }); commit(); } rebuild(); renderPanel(); setTimeout(() => { if (!ui.drag) intentEl.hidden = true; }, 2600); }
  function onDown(e) {
    if (!view.ok) return; try { view.canvas.setPointerCapture(e.pointerId); } catch (x) { /* not supported */ } ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) { if (ui.drag) endIntent(); const a = [...ptrs.values()]; pinch = { d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), mx: (a[0][0] + a[1][0]) / 2, my: (a[0][1] + a[1][1]) / 2 }; return; }
    if ((ui.tool === 'intent' || ui.tool === 'relief') && e.button === 0) {
      const hit = view.pick(e.clientX, e.clientY);
      if (hit) {
        if (ui.tool === 'relief') { const f = { id: kid('f'), u: +hit.u.toFixed(4), v: +hit.v.toFixed(4), radius: 16, amount: 0.01, dir: 'normal', n: 1, fall: 'smooth', on: true }; doc.reliefs.push(f); ui.rel = doc.reliefs.length - 1; ui.node = 'relief'; beginIntent(e, hit, { ['f' + f.id]: 0.004 }); renderPanel(); }
        else beginIntent(e, hit, null);
        return;
      }
    }
    ui.orbit = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
  }
  function onMove(e) {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size === 2) { const a = [...ptrs.values()], d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]), mx = (a[0][0] + a[1][0]) / 2, my = (a[0][1] + a[1][1]) / 2; view.zoom(pinch.d / Math.max(10, d)); view.pan(mx - pinch.mx, my - pinch.my); Object.assign(pinch, { d, mx, my }); return; }
    if (ui.drag) { pending = { x: e.clientX, y: e.clientY }; if (!raf) raf = (window.requestAnimationFrame || setTimeout)(runDrag); return; }
    if (ui.orbit) { const dx = e.clientX - ui.orbit.x, dy = e.clientY - ui.orbit.y; ui.orbit.x = e.clientX; ui.orbit.y = e.clientY; if (ui.orbit.pan) view.pan(dx, dy); else view.orbit(dx, dy); }
  }
  function onUp(e) { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (ui.drag && !ptrs.size) { if (pending) runDrag(); endIntent(); } if (!ptrs.size) ui.orbit = null; }
  if (view.ok) { const c = view.canvas; c.addEventListener('pointerdown', onDown); c.addEventListener('pointermove', onMove); c.addEventListener('pointerup', onUp); c.addEventListener('pointercancel', onUp); c.addEventListener('contextmenu', (e) => e.preventDefault()); c.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false }); }

  // ---------- sketch interaction: drag points through the solver, tap dimensions to drive them
  let sk = null;
  const skPos = (e) => { const r = sketch.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  sketch.canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = skPos(e), dim = sketch.hitDim(x, y); if (dim) { editDim(dim); return; }
    const i = sketch.hitPoint(x, y); if (i < 0) return; ui.sel = i; ui.node = 'profile'; const p = doc.profile[i];
    const fr = !isExpr(p.r) && !p.lockR, fz = i > 0 && i < doc.profile.length - 1 && !isExpr(p.z) && !p.lockZ;
    if (!fr && !fz) { toast('Point ' + (i + 1) + ' is locked or driven by an equation. Change that in the Model tab.'); rebuild(); renderPanel(); return; }
    try { sketch.canvas.setPointerCapture(e.pointerId); } catch (x2) { /* ignore */ } sk = { i, fr, fz, acc: {}, moved: false }; rebuild(); renderPanel();
  });
  sketch.canvas.addEventListener('pointermove', (e) => {
    if (!sk) return; const [x, y] = skPos(e), g = sketch.g, goals = []; if (sk.fr) goals.push({ key: 'r' + sk.i, target: Math.max(4, g.R(x)), w: 6 }); if (sk.fz) goals.push({ key: 'z' + sk.i, target: g.Z(y), w: 6 });
    const r = step(doc, { varGoals: goals, res: 24, lambda: 0.08 }); sk.moved = true; (r.deltas || []).forEach((q) => { sk.acc[q.key] = sk.acc[q.key] || { ...q, d: 0 }; sk.acc[q.key].d += q.d; }); renderIntent(Object.values(sk.acc), 'Sketch drag: other dimensions adjust to hold the constraints'); rebuild('drag');
  });
  const skEnd = () => { if (!sk) return; const m = sk.moved; sk = null; if (m) { satisfy(doc, { iters: 3, res: 40 }); commit(); } rebuild(); renderPanel(); setTimeout(() => { intentEl.hidden = true; }, 2600); };
  sketch.canvas.addEventListener('pointerup', skEnd); sketch.canvas.addEventListener('pointercancel', skEnd);
  function editDim(kind) {
    const a = E.a, P = doc.profile, last = P.length - 1;
    const map = { height: { title: 'Height (mm)', val: a.height, apply: (v) => { const hp = doc.params.find((p) => p.name === 'H'); if (hp && P[last].z === '=H') { hp.v = String(v); hp.lock = true; } else { P[last].z = String(v); P[last].lockZ = true; } } },
      rim: { title: 'Rim opening, inside Ø (mm)', val: a.rimD, apply: (v) => { const r = v / 2 + (E.D.wall || 2); const rp = doc.params.find((p) => p.name === 'rimR'); if (rp && P[last].r === '=rimR') { rp.v = r.toFixed(2); rp.lock = true; } else { P[last].r = r.toFixed(2); P[last].lockR = true; } } },
      foot: { title: 'Foot Ø (mm)', val: a.baseD, apply: (v) => { P[0].r = (v / 2 / (a.baseD / 2 / E.Dpts[0].r)).toFixed(2); P[0].lockR = true; } },
      belly: { title: 'Widest Ø at point ' + ((sketch.bellyIndex || 0) + 1) + ' (mm)', val: 2 * E.Dpts[sketch.bellyIndex || 0].r, apply: (v) => { const i = sketch.bellyIndex || 0; P[i].r = (v / 2).toFixed(2); P[i].lockR = true; } } }[kind];
    if (!map) return;
    ask({ title: map.title, value: map.val.toFixed(1), message: 'This dimension will drive the model and be locked. The other free dimensions then move to keep the constraints.' }, (s) => { const v = parseFloat(s); if (!isFinite(v) || v <= 0) { toast('Enter a positive number.'); return; } map.apply(v); rebuild(); solveNow(true); toast(map.title.split(' (')[0] + ' set to ' + v + ' and locked. The rest of the vessel adapted.'); });
  }

  // ---------- panels
  function renderPanel() { clear(panel); ({ model: panelModel, cons: panelCons, ana: panelAna, export: panelExport })[ui.tab](); }
  function refreshLive() { if (ui.tab === 'cons' || ui.tab === 'ana') { const y = panel.scrollTop; renderPanel(); panel.scrollTop = y; } }
  const field = (label, get, set, opt = {}) => {
    const inp = h('input', { class: 'kn-in', value: String(get()), onchange: (e) => { const v = e.target.value.trim(); set(v === '' ? get() : (isExpr(v) ? v : (isFinite(+v) ? v : get()))); rebuild(); commit(); renderPanel(); } });
    const lock = opt.lock ? h('button', { class: 'kn-lock' + (opt.lock.get() ? ' on' : ''), title: opt.lock.get() ? 'Locked: the solver will not change this' : 'Free: the solver may change this', text: opt.lock.get() ? '🔒' : '🔓', onclick: () => { opt.lock.set(!opt.lock.get()); commit(); renderPanel(); } }) : null;
    return h('label', { class: 'kn-field' }, h('span', { text: label }), inp, lock || h('span'), isExpr(String(get())) ? h('em', { class: 'kn-f', text: 'ƒ' }) : null);
  };
  function panelModel() {
    const tree = h('div', { class: 'kn-tree' }), node = (k, label, sub, idx) => h('button', { class: 'kn-node' + (ui.node === k && (idx == null || ui.rel === idx) ? ' on' : ''), onclick: () => { ui.node = k; if (idx != null) ui.rel = idx; renderPanel(); } }, h('b', { text: label }), h('span', { text: sub }));
    tree.append(node('params', 'Parameters', doc.params.length + ' named values'), node('profile', 'Profile sketch', doc.profile.length + ' points'), node('section', 'Section planes', (+doc.section.sides >= 3 ? doc.section.sides + '-sided' : 'round') + ', twist ' + doc.section.twist + '°'));
    doc.reliefs.forEach((f, i) => tree.append(node('relief', 'Relief ' + (i + 1), (f.on === false ? 'suppressed, ' : '') + (+f.amount).toFixed(1) + ' mm ' + f.dir + (f.n > 1 ? ' ×' + f.n : ''), i)));
    tree.append(node('shell', 'Shell', 'wall ' + doc.shell.wall + ', floor ' + doc.shell.floor), node('material', 'Material and fill', doc.material + ', fill ' + Math.round(doc.fill * 100) + '%'));
    panel.append(h('div', { class: 'kn-small', text: 'Fields take a number or an equation such as =H*0.4. A 🔒 dimension is kept by the solver; equations are always driven.' }), tree);
    const ed = h('div', { class: 'kn-card' }); panel.appendChild(ed);
    if (ui.node === 'params') {
      ed.append(h('b', { text: 'Parameters' }));
      doc.params.forEach((p, i) => ed.append(h('div', { class: 'kn-prow' }, h('input', { class: 'kn-in nm', value: p.name, onchange: (e) => { const n = e.target.value.trim(); if (!validName(n)) { toast('Use letters, digits and _ for names.'); renderPanel(); return; } p.name = n; rebuild(); commit(); } }), h('input', { class: 'kn-in', value: String(p.v), onchange: (e) => { p.v = e.target.value.trim(); rebuild(); commit(); renderPanel(); } }), h('button', { class: 'kn-lock' + (p.lock ? ' on' : ''), text: p.lock ? '🔒' : '🔓', onclick: () => { p.lock = !p.lock; commit(); renderPanel(); } }), h('button', { class: 'kn-btn sm', text: '×', title: 'Delete', onclick: () => { doc.params.splice(i, 1); rebuild(); commit(); renderPanel(); } }))));
      ed.append(h('button', { class: 'kn-btn sm', text: 'Add parameter', onclick: () => { let n = 1; while (doc.params.some((p) => p.name === 'p' + n)) n++; doc.params.push({ name: 'p' + n, v: '10' }); commit(); renderPanel(); } }));
    } else if (ui.node === 'profile') {
      ed.append(h('b', { text: 'Profile sketch' }), h('div', { class: 'kn-small', text: 'Points from the foot (1) to the rim. Radius is to the outside of the wall.' }));
      doc.profile.forEach((p, i) => { const r = h('div', { class: 'kn-pt' + (i === ui.sel ? ' on' : ''), onclick: (ev) => { if (ev.target.tagName === 'DIV' || ev.target.tagName === 'B') { ui.sel = i; rebuild(); renderPanel(); } } }, h('b', { text: String(i + 1) }), field('z', () => p.z, (v) => { p.z = v; }, i === 0 ? {} : { lock: { get: () => !!p.lockZ, set: (b) => { p.lockZ = b; } } }), field('r', () => p.r, (v) => { p.r = v; }, { lock: { get: () => !!p.lockR, set: (b) => { p.lockR = b; } } })); ed.append(r); });
      ed.append(h('div', { class: 'kn-row' }, h('button', { class: 'kn-btn sm', text: 'Add point above selected', onclick: () => { const i = Math.min(ui.sel, doc.profile.length - 2), D = E.Dpts; doc.profile.splice(i + 1, 0, { z: ((D[i].z + D[i + 1].z) / 2).toFixed(1), r: ((D[i].r + D[i + 1].r) / 2).toFixed(1) }); ui.sel = i + 1; rebuild(); commit(); renderPanel(); } }), h('button', { class: 'kn-btn sm', text: 'Remove selected', disabled: ui.sel === 0 || ui.sel === doc.profile.length - 1 || doc.profile.length <= 3, onclick: () => { doc.profile.splice(ui.sel, 1); ui.sel = Math.max(1, ui.sel - 1); rebuild(); commit(); renderPanel(); } })));
    } else if (ui.node === 'section') {
      const s = doc.section; ed.append(h('b', { text: 'Section planes' }), h('div', { class: 'kn-small', text: 'The section is the shape cut at every height. Twist turns it from foot to rim.' }));
      ed.append(field('Polygon sides', () => s.sides, (v) => { s.sides = v; }), field('Corners 0..1', () => s.corners, (v) => { s.corners = v; }, { lock: { get: () => !!s.lockCorners, set: (b) => { s.lockCorners = b; } } }), field('Lobes', () => s.lobes, (v) => { s.lobes = v; }), field('Ripple depth', () => s.ripple, (v) => { s.ripple = v; }, { lock: { get: () => !!s.lockRipple, set: (b) => { s.lockRipple = b; } } }), field('Twist °', () => s.twist, (v) => { s.twist = v; }, { lock: { get: () => !!s.lockTwist, set: (b) => { s.lockTwist = b; } } }));
    } else if (ui.node === 'relief' && doc.reliefs[ui.rel]) {
      const f = doc.reliefs[ui.rel]; ed.append(h('b', { text: 'Relief ' + (ui.rel + 1) }), h('div', { class: 'kn-small', text: 'A local push or pull. With the Relief tool, drag it in the 3D view; its amount leads and the other dimensions keep the constraints.' }));
      ed.append(field('Amount mm', () => f.amount, (v) => { f.amount = v; }, { lock: { get: () => !!f.lock, set: (b) => { f.lock = b; } } }), field('Radius mm', () => f.radius, (v) => { f.radius = v; }), field('Repeat around', () => f.n || 1, (v) => { f.n = Math.max(1, Math.round(+v || 1)); }));
      ed.append(h('label', { class: 'kn-field' }, h('span', { text: 'Direction' }), h('select', { class: 'kn-in', onchange: (e) => { f.dir = e.target.value; rebuild(); commit(); } }, [['normal', 'Surface normal'], ['radial', 'Radial'], ['z', 'Vertical']].map(([k, l]) => h('option', { value: k, text: l, selected: f.dir === k }))), h('span')));
      ed.append(h('label', { class: 'kn-field' }, h('span', { text: 'Falloff' }), h('select', { class: 'kn-in', onchange: (e) => { f.fall = e.target.value; rebuild(); commit(); } }, [['smooth', 'Smooth'], ['plateau', 'Plateau'], ['linear', 'Linear'], ['spike', 'Spike']].map(([k, l]) => h('option', { value: k, text: l, selected: f.fall === k }))), h('span')));
      ed.append(h('div', { class: 'kn-row' }, h('button', { class: 'kn-btn sm', text: f.on === false ? 'Unsuppress' : 'Suppress', onclick: () => { f.on = f.on === false; rebuild(); commit(); renderPanel(); } }), h('button', { class: 'kn-btn sm danger', text: 'Delete', onclick: () => { doc.reliefs.splice(ui.rel, 1); ui.rel = -1; ui.node = 'profile'; rebuild(); commit(); renderPanel(); } })));
    } else if (ui.node === 'shell') {
      ed.append(h('b', { text: 'Shell' }), h('div', { class: 'kn-small', text: 'Converts the surface into a printable solid: the skin is offset inward, then the rim, floor and foot are closed.' }), field('Wall mm', () => doc.shell.wall, (v) => { doc.shell.wall = v; }), field('Floor mm', () => doc.shell.floor, (v) => { doc.shell.floor = v; }));
    } else {
      ed.append(h('b', { text: 'Material and fill' }), h('label', { class: 'kn-field' }, h('span', { text: 'Material' }), h('select', { class: 'kn-in', onchange: (e) => { doc.material = e.target.value; rebuild(); commit(); } }, Object.keys(MATERIALS).map((k) => h('option', { value: k, text: k + ' (' + MATERIALS[k] + ' g/cm³)', selected: doc.material === k }))), h('span')), field('Fill line 0..1', () => doc.fill, (v) => { doc.fill = Math.min(1, Math.max(0.05, +v || 0.85)); }));
    }
  }
  function panelCons() {
    panel.append(h('div', { class: 'kn-small', text: 'Constraints are part of the model. The solver keeps them during every drag and edit, and Solve pulls the design back inside them with the smallest change.' }));
    const a = E.a;
    doc.constraints.forEach((c, i) => {
      const T = CTYPES[c.type], st = constraintStatus(c, a);
      panel.append(h('div', { class: 'kn-con' + (c.on ? (st.ok ? ' ok' : ' bad') : ' off') },
        h('input', { type: 'checkbox', checked: !!c.on, 'aria-label': 'Active', onchange: (e) => { c.on = e.target.checked; commit(); rebuild(); renderPanel(); } }),
        h('span', { class: 'kn-cl', text: T.label }), h('select', { class: 'kn-in op', onchange: (e) => { c.op = e.target.value; commit(); rebuild(); renderPanel(); } }, OPS.map(([k, l]) => h('option', { value: k, text: l, selected: c.op === k }))),
        h('input', { class: 'kn-in val', value: String(c.value), onchange: (e) => { const v = parseFloat(e.target.value); if (isFinite(v)) c.value = v; commit(); rebuild(); renderPanel(); } }), h('span', { class: 'kn-cu', text: T.unit }),
        h('span', { class: 'kn-cv', text: T.fmt(st.v) + (c.on ? (st.ok ? ' ✓' : ' ✗') : '') }), h('button', { class: 'kn-btn sm', text: '×', title: 'Remove', onclick: () => { doc.constraints.splice(i, 1); commit(); rebuild(); renderPanel(); } })));
    });
    const add = h('select', { class: 'kn-in', onchange: (e) => { const t = e.target.value; if (!t) return; const T = CTYPES[t], v = T.get(a); doc.constraints.push({ id: kid('c'), type: t, op: t === 'overhang' || t === 'mass' ? '<=' : t === 'capacity' || t === 'height' ? '=' : '>=', value: +v.toFixed(t === 'capacity' ? 0 : 1), on: true }); commit(); rebuild(); renderPanel(); } }, h('option', { value: '', text: 'Add a constraint…' }), Object.keys(CTYPES).map((k) => h('option', { value: k, text: CTYPES[k].label })));
    panel.append(h('div', { class: 'kn-row' }, add, h('button', { class: 'kn-btn pri', text: 'Solve now', onclick: () => solveNow() })));
    panel.append(h('div', { class: 'kn-small', text: 'Free dimensions now: ' + freeVars(doc).map((v) => v.label).join(', ') + '.' }));
  }
  function panelAna() {
    const a = E.a, mc = meshCheck(E.solid.pos, E.solid.nt), rows = [['Capacity at fill line', Math.round(a.capacity) + ' ml'], ['Fill line height', a.fillZ.toFixed(1) + ' mm'], ['Mass, ' + doc.material, Math.round(a.mass) + ' g'], ['Material volume', (a.volume / 1000).toFixed(1) + ' cm³'],
      ['Height', a.height.toFixed(1) + ' mm'], ['Widest Ø', a.maxD.toFixed(1) + ' mm'], ['Foot Ø', a.baseD.toFixed(1) + ' mm'], ['Rim opening Ø', a.rimD.toFixed(1) + ' mm'], ['Narrowest opening Ø', a.neckD.toFixed(1) + ' mm'],
      ['Steepest wall lean', a.overhang.toFixed(1) + '°'], ['Tipping angle, empty', a.tipEmpty.toFixed(1) + '°'], ['Tipping angle, filled', a.tipFilled.toFixed(1) + '°'], ['Centre of mass height', a.com[2].toFixed(1) + ' mm'], ['Wall', E.D.wall.toFixed(2) + ' mm'],
      ['Solid is watertight', mc.watertight ? 'yes' : 'no: ' + mc.open + ' open edges'], ['Triangles', mc.tris.toLocaleString()]];
    panel.append(h('div', { class: 'kn-small', text: 'Live engineering values of the solid at full resolution.' }), h('div', { class: 'kn-stat' }, rows.map(([k, v]) => [h('span', { text: k }), h('b', { text: v })])));
    if (a.warn.clamped) panel.append(h('div', { class: 'kn-warn', text: 'The wall is thicker than the vessel is wide in places, so the inside was held open. Thin the wall or widen the neck.' }));
    if (a.warn.rimInverted) panel.append(h('div', { class: 'kn-warn', text: 'The rim folds over itself. Reduce the wall or the flare.' }));
  }
  function panelExport() {
    panel.append(h('div', { class: 'kn-small', text: 'The print pack is a zip with the STL and 3MF for your slicer, an A4 engineering drawing (SVG) and the design file. Units are millimetres, z up, foot flat on the bed.' }));
    panel.append(h('div', { class: 'kn-row' }, h('button', { class: 'kn-btn pri', text: 'Print pack (.zip)', onclick: exportPack }), h('button', { class: 'kn-btn', text: 'Drawing (.svg)', onclick: () => saveBytes(fileBase() + '-drawing.svg', 'image/svg+xml', drawingSVG(doc, full())) }), h('button', { class: 'kn-btn', text: 'Design (.json)', onclick: () => saveBytes(fileBase() + '.kiln.json', 'application/json', JSON.stringify(doc, null, 1)) })));
    const fi = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const o = JSON.parse(String(r.result)); if (o.v !== 1 || !o.profile) throw new Error('not a Kiln design'); doc = migrate(o); nameIn.value = doc.name; commit(); rebuild(); renderPanel(); toast('Design opened.'); } catch (x) { toast('Could not open it: ' + x.message); } }; r.readAsText(f); e.target.value = ''; } });
    panel.append(h('div', { class: 'kn-row' }, h('button', { class: 'kn-btn', text: 'Open design', onclick: () => fi.click() }), fi));
    if (deps.onSendMesh || deps.onSendProfile) panel.append(h('b', { text: 'Continue in another workspace' }), h('div', { class: 'kn-row' },
      deps.onSendProfile ? h('button', { class: 'kn-btn', text: 'Send to Part (exact revolve)', title: 'The profile becomes an exact revolved solid you can cut, fillet and draw', onclick: () => { const e = full(), pr = e.profile, n = 28, pts = []; for (let k = 0; k <= n; k++) { const j = Math.round(k * (pr.r.length - 1) / n); pts.push([pr.r[j], pr.z[j]]); } const sec = e.D, note = (sec.lobes && sec.ripple > 0.001) || Math.abs(sec.twist) > 0.5 || sec.corners > 0.01 || sec.sides >= 3 ? 'The section is made round: ripple, corners and twist stay in the Vessel workspace.' : ''; deps.onSendProfile(doc.name, pts, +e.D.wall.toFixed(2), note); } }) : null,
      deps.onSendMesh ? h('button', { class: 'kn-btn', text: 'Send to Subdivision', title: 'Copy the solid as a mesh to smooth, pattern or push', onclick: () => { const e = full(); deps.onSendMesh(doc.name, e.solid.pos.subarray(0, e.solid.nt * 9)); } }) : null));
    panel.append(h('b', { text: 'Start from a template' }), h('div', { class: 'kn-row' }, Object.keys(TEMPLATES).map((k) => h('button', { class: 'kn-btn sm', text: TEMPLATES[k].label, onclick: () => { doc = TEMPLATES[k].make(); nameIn.value = doc.name; ui.sel = 1; commit(); rebuild(); solveNow(true); view.fit(E.a.height); toast(TEMPLATES[k].label + ' loaded and solved.'); } }))));
  }
  const fileBase = () => (doc.name || 'kiln').replace(/[^\w\-]+/g, '_').toLowerCase();
  function full() { const res = resolve(doc), e = evaluate(res.D, FULL[0], FULL[1]); e.Dpts = res.D.pts; e.D = res.D; return e; }
  function packBytes() {
    const e = full(), tris = e.solid.pos.subarray(0, e.solid.nt * 9), mc = meshCheck(e.solid.pos, e.solid.nt);
    const zip = createZip([{ name: fileBase() + '.stl', data: encodeSTL(tris, 'Kiln ' + doc.name) }, { name: fileBase() + '.3mf', data: encode3MF([{ name: doc.name, tris, color: 0xe9e1d3 }], doc.name) }, { name: fileBase() + '-drawing.svg', data: drawingSVG(doc, e) }, { name: fileBase() + '.kiln.json', data: JSON.stringify(doc, null, 1) }]);
    return { zip, mc, e };
  }
  function exportPack() { const p = packBytes(); if (!p.mc.watertight) toast('Warning: the solid is not watertight.'); saveBytes(fileBase() + '-print-pack.zip', 'application/zip', p.zip); }

  // ---------- start
  syncBar(); rebuild(); renderPanel(); setTimeout(() => { view.bg(getComputedStyle(appEl).getPropertyValue('--kn-vp').trim() || '#ecebe6'); view.fit(E.a.height); rebuild(); }, 30);
  Object.defineProperties(app, Object.getOwnPropertyDescriptors({ get doc() { return doc; }, set doc(d) { doc = d; }, ui, view, sketch, rebuild, solveNow, commit, restore, setView, renderPanel, packBytes, get E() { return E; }, beginIntent, endIntent, runDragAt: (x, y) => { pending = { x, y }; runDrag(); } }));
  return { app, view, destroy() { clear(root); } };
}
