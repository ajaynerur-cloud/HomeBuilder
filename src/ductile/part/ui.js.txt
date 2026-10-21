// Ductile Part: dimension-driven exact solids. Parameters, feature history, constrained sketches, production drawings, STEP.
import { h, clear } from '../../studio/ui/dom.js';
import { loadKernel } from './kernel.js';
import { newPart, addFeature, regenerate, displaySoup, productionDrawing, meshForSubdivision, FEATURE_TYPES, SURFACE_MODES, OPS, EDGE_SETS, OPEN_FACES, scopeOf, num, edgeRef, matchEdges, faceRef, matchFaces, faceSig, edgeSig } from './features.js';
import { newSketch, solve, dof, sid, byId, CON_TYPES, DIMENSIONAL } from './sketch.js';
import { validName } from '../../studio/core/params.js';
import { createZip } from '../../studio/io/zip.js';
import { saveBytes } from '../../studio/io/download.js';
import { DuctileView } from '../view.js';

const KEY = 'chp_ductile_part_v1';
const SK_TOOLS = [['select', 'Select'], ['line', 'Line'], ['spline', 'Spline'], ['rect', 'Rectangle'], ['circle', 'Circle'], ['arc', 'Arc'], ['dim', 'Dimension']];
const CONS = [['horizontal', 'H', 'Horizontal: one line'], ['vertical', 'V', 'Vertical: one line'], ['coincident', '•', 'Coincident: two points'], ['parallel', '∥', 'Parallel: two lines'], ['perpendicular', '⊥', 'Perpendicular: two lines'], ['equal', '=', 'Equal: two lines or two circles'], ['tangent', '◠', 'Tangent: a line and a circle'], ['midpoint', 'M', 'Midpoint: a point and a line'], ['onLine', '⟂•', 'Point on line'], ['fix', '⚓', 'Fix: points']];
const GLYPH = { horizontal: 'H', vertical: 'V', parallel: '∥', perpendicular: '⊥', equal: '=', tangent: '◠', midpoint: 'M', onLine: '·', fix: '⚓', coincident: '' };
function splinePts(sk, sp, per = 12) { const P = sp.pts.map((id) => byId(sk.points, id)).filter(Boolean).map((p) => [p.x, p.y]), out = []; if (P.length < 2) return P; for (let i = 0; i < P.length - 1; i++) { const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)]; for (let k = 0; k < per; k++) { const t = k / per, f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t); out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]); } } out.push(P[P.length - 1]); return out; }
function plane3(plane, off, u, v) { return plane === 'XZ' ? [u, -off, v] : plane === 'YZ' ? [off, u, v] : [u, v, off]; }

export function example(kind) {
  const part = newPart(), rect = (sk, w, h, dw, dh) => { const P = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => { const p = { id: sid('p'), x, y }; sk.points.push(p); return p.id; }); const L = P.map((a, i) => { const l = { id: sid('l'), a, b: P[(i + 1) % 4] }; sk.lines.push(l); return l.id; }); sk.cons.push({ id: sid('c'), type: 'horizontal', refs: [L[0]] }, { id: sid('c'), type: 'horizontal', refs: [L[2]] }, { id: sid('c'), type: 'vertical', refs: [L[1]] }, { id: sid('c'), type: 'vertical', refs: [L[3]] }, { id: sid('c'), type: 'length', refs: [L[0]], value: dw }, { id: sid('c'), type: 'length', refs: [L[1]], value: dh }, { id: sid('c'), type: 'midpoint', refs: [(() => { const o = { id: sid('p'), x: 0, y: 0 }; sk.points.push(o); sk.cons.push({ id: sid('c'), type: 'fix', refs: [o.id], x0: 0, y0: 0 }); return o.id; })(), (() => { const d = { id: sid('l'), a: P[0], b: P[2], construction: true }; sk.lines.push(d); return d.id; })()] }); return { P, L }; };
  const circle = (sk, x, y, r) => { const c = { id: sid('p'), x, y }; sk.points.push(c); sk.cons.push({ id: sid('c'), type: 'fix', refs: [c.id], x0: x, y0: y }); const ci = { id: sid('k'), c: c.id, r: 5 }; sk.circles.push(ci); sk.cons.push({ id: sid('c'), type: 'radius', refs: [ci.id], value: r }); };
  if (kind === 'vase') {
    part.name = 'Turned vase'; part.params = [{ name: 'H', v: '160' }, { name: 'wall', v: '2.2' }]; const sk = newSketch('XZ', 0); const pts = [[0, 0], [34, 0], [44, 45], [26, 115], [30, 160], [0, 160]].map(([x, y]) => { const q = { id: sid('p'), x, y }; sk.points.push(q); return q.id; }); pts.forEach((a, i) => sk.lines.push({ id: sid('l'), a, b: pts[(i + 1) % pts.length] }));
    sk.cons.push({ id: sid('c'), type: 'fix', refs: [pts[0]], x0: 0, y0: 0 }, { id: sid('c'), type: 'vdist', refs: [pts[0], pts[5]], value: '=H' }, { id: sid('c'), type: 'horizontal', refs: [sk.lines[0].id] }, { id: sid('c'), type: 'vertical', refs: [sk.lines[5].id] }, { id: sid('c'), type: 'horizontal', refs: [sk.lines[4].id] });
    const s = addFeature(part, 'sketch', { sk, name: 'Profile' }); addFeature(part, 'revolve', { sketch: s.id }); addFeature(part, 'shell', { thickness: '=wall', open: 'top' }); addFeature(part, 'fillet', { radius: '1', edges: 'bottom' }); return part;
  }
  if (kind === 'roof') { part.name = 'Wave roof (surface + thicken)'; part.params = [{ name: 'span', v: '120' }, { name: 'T', v: '3' }]; const k = newSketch('XZ', 0), ids = [[0, 20], [30, 34], [60, 22], [90, 36], [120, 24]].map(([x, y]) => { const q = { id: sid('p'), x, y }; k.points.push(q); return q.id; }); k.splines.push({ id: sid('s'), pts: ids }); const fs = addFeature(part, 'sketch', { sk: k, name: 'Roof curve' }); addFeature(part, 'surface', { mode: 'extrude', sketch: fs.id, distance: '-80', name: 'Roof surface' }); addFeature(part, 'thicken', { thickness: '=T', name: 'Roof shell' }); return part; }
  if (kind === 'svase') { part.name = 'Spline vase (surface + thicken)'; part.params = [{ name: 'wall', v: '2' }]; const k = newSketch('XZ', 0), ids = [[24, 0], [40, 30], [44, 70], [22, 120], [16, 150], [26, 170]].map(([x, y]) => { const q = { id: sid('p'), x, y }; k.points.push(q); return q.id; }); k.splines.push({ id: sid('s'), pts: ids }); const fs = addFeature(part, 'sketch', { sk: k, name: 'Side curve' }); addFeature(part, 'surface', { mode: 'revolve', sketch: fs.id, name: 'Vase surface' }); addFeature(part, 'thicken', { thickness: '=wall', name: 'Wall' }); const b = newSketch('XY', 0); b.points.push({ id: 'bo', x: 0, y: 0 }); b.circles.push({ id: 'bc', c: 'bo', r: 25 }); const fb = addFeature(part, 'sketch', { sk: b, name: 'Base' }); addFeature(part, 'extrude', { sketch: fb.id, distance: '3' }); return part; }
  if (kind === 'duct') { part.name = 'Square to round duct'; part.params = [{ name: 'W', v: '60' }, { name: 'D', v: '60' }, { name: 'R', v: '18' }, { name: 'L', v: '80' }]; const a = newSketch('XY', 0); rect(a, 60, 60, '=W', '=D'); const b = newSketch('XY', '=L'); circle(b, 0, 0, '=R'); const fa = addFeature(part, 'sketch', { sk: a, name: 'Square end' }), fb = addFeature(part, 'sketch', { sk: b, name: 'Round end' }); addFeature(part, 'loft', { sketches: [fa.id, fb.id] }); addFeature(part, 'shell', { thickness: '1.6', open: 'top' }); return part; }
  if (kind === 'pipe') { part.name = 'Bent pipe'; part.params = [{ name: 'r', v: '6' }]; const path = newSketch('XZ', 0); const pa = [[0, 0], [0, 50], [50, 50], [50, 90]].map(([x, y]) => { const r = { id: sid('p'), x, y }; path.points.push(r); return r.id; }); for (let i = 0; i < 3; i++) path.lines.push({ id: sid('l'), a: pa[i], b: pa[i + 1] }); const prof = newSketch('XY', 0); circle(prof, 0, 0, '=r'); circle(prof, 0, 0, '=r-1.5'); const fp = addFeature(part, 'sketch', { sk: path, name: 'Path' }), fq = addFeature(part, 'sketch', { sk: prof, name: 'Pipe section' }); addFeature(part, 'sweep', { profile: fq.id, path: fp.id }); return part; }
  part.name = 'Flanged bracket'; part.params = [{ name: 'W', v: '90' }, { name: 'D', v: '60' }, { name: 'T', v: '10' }, { name: 'holeR', v: '6' }, { name: 'edgeR', v: '4' }];
  const b = newSketch('XY', 0); rect(b, 90, 60, '=W', '=D'); const fb = addFeature(part, 'sketch', { sk: b, name: 'Base' }); addFeature(part, 'extrude', { sketch: fb.id, distance: '=T' }); addFeature(part, 'fillet', { radius: '=edgeR', edges: 'vertical', name: 'Corner rounds' });
  const boss = newSketch('XY', '=T'); circle(boss, 0, 0, '18'); const fbo = addFeature(part, 'sketch', { sk: boss, name: 'Boss' }); addFeature(part, 'extrude', { sketch: fbo.id, distance: '20' });
  const holes = newSketch('XY', 0); circle(holes, 0, 0, '9'); [[-32, -18], [32, -18], [-32, 18], [32, 18]].forEach(([x, y]) => circle(holes, x, y, '=holeR')); const fh = addFeature(part, 'sketch', { sk: holes, name: 'Holes' }); addFeature(part, 'extrude', { sketch: fh.id, distance: '60', op: 'cut' });
  addFeature(part, 'chamfer', { size: '1', edges: 'top' }); return part;
}

// a vessel profile (outer radius against height) becomes an exact revolve with a shell open at the top
export function partFromProfile(name, pts, wall) {
  const part = newPart(name), sk = newSketch('XZ', 0), H = pts[pts.length - 1][1], ids = [[0, 0]].concat(pts, [[0, H]]).map(([x, y]) => { const q = { id: sid('p'), x: +x.toFixed(3), y: +y.toFixed(3) }; sk.points.push(q); return q.id; });
  ids.forEach((a, i) => sk.lines.push({ id: sid('l'), a, b: ids[(i + 1) % ids.length] })); part.params = [{ name: 'wall', v: String(wall) }];
  const s = addFeature(part, 'sketch', { sk, name: 'Vessel profile' }); addFeature(part, 'revolve', { sketch: s.id }); addFeature(part, 'shell', { thickness: '=wall', open: 'top' }); return part;
}
export function createPart(host, deps = {}) {
  let part = deps.initial || null; if (!part && !deps.noSave) { try { const j = localStorage.getItem(KEY); if (j) { const o = JSON.parse(j); if (o.kind === 'ductile-part') part = o; } } catch (e) { /* none */ } }
  if (!part) part = example('bracket');
  let R = null, G = null, pick = null, soup = null, surfSoups = [], hover = -1, hist = [JSON.stringify(part)], hi = 0, sel = part.features.length ? part.features[part.features.length - 1].id : null, editing = null, saveT = null; const api = {};
  // ---------- layout
  const tb = h('div', { class: 'pt-bar' }), tree = h('div', { class: 'pt-tree' }), props = h('div', { class: 'pt-props' }), stage = h('div', { class: 'pt-stage' }), vpHost = h('div', { class: 'pt-vp' }), skHost = h('div', { class: 'pt-sk', hidden: true }), dwHost = h('div', { class: 'pt-dw', hidden: true }), msg = h('div', { class: 'pt-msg' }), toastEl = h('div', { class: 'dx-toast' });
  stage.append(vpHost, skHost, dwHost, msg, toastEl);
  const root = h('div', { class: 'pt-app' }, tb, h('div', { class: 'pt-body' }, h('div', { class: 'pt-left' }, h('div', { class: 'pt-h', text: 'History' }), tree), stage, props));
  host.appendChild(root); const view = new DuctileView(vpHost);
  const toast = (t) => { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('on'), 3800); };
  function commit() { const s = JSON.stringify(part); if (s !== hist[hi]) { hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 100) hist.shift(); hi = hist.length - 1; } if (!deps.noSave) { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, s); } catch (e) { /* full */ } }, 400); } renderBar(); }
  function restore(i) { if (i < 0 || i >= hist.length) return; hi = i; part = JSON.parse(hist[hi]); if (editing) editing = part.features.find((f) => f.id === editing.id) || null; rebuild(); renderAll(); }
  const feat = (id) => part.features.find((f) => f.id === id);

  // ---------- toolbar
  function renderBar() {
    clear(tb); const btn = (t, f, title, cls = '') => h('button', { class: 'dx-btn sm ' + cls, text: t, title: title || t, onclick: f });
    if (editing) { tb.append(h('b', { text: 'Sketch: ' + editing.name }), h('span', { class: 'pt-sep' }), sketchToolbar(), h('span', { class: 'dx-grow' }), btn('Finish sketch', () => finishSketch(), 'Return to the 3D model', 'pri')); return; }
    const skMenu = h('select', { class: 'dx-in', onchange: (e) => { if (e.target.value) { const f = addFeature(part, 'sketch', { sk: newSketch(e.target.value, 0) }); sel = f.id; commit(); renderAll(); openSketch(f); } e.target.value = ''; } }, h('option', { value: '', text: '+ New sketch on…' }), [['XY', 'Top plane (XY)'], ['XZ', 'Front plane (XZ)'], ['YZ', 'Side plane (YZ)']].map(([v, l]) => h('option', { value: v, text: l })));
    const grp = (label, ...items) => h('div', { class: 'pt-grp' }, h('div', { class: 'pt-grpl', text: label }), h('div', { class: 'pt-grpb' }, ...items));
    tb.append(grp('Sketch', skMenu),
      grp('Solid', btn('Extrude', () => newFeature('extrude')), btn('Cut', () => newFeature('cut'), 'Extrude a sketch as a cut through the solid'), btn('Revolve', () => newFeature('revolve')), btn('Loft', () => newFeature('loft')), btn('Sweep', () => newFeature('sweep'))),
      grp('Surface', ...SURFACE_MODES.map(([m, l]) => btn(l.split(' ')[0], () => newFeature('surface:' + m), l + ': an open surface (lines and splines need not be closed)')), btn('Thicken', () => newFeature('thicken'), 'Turn a surface into a solid wall that adds, cuts or intersects')),
      grp('Modify', btn('Shell', () => newFeature('shell')), btn('Fillet', () => newFeature('fillet')), btn('Chamfer', () => newFeature('chamfer'))),
      grp('Edit', btn('↶', () => restore(hi - 1), 'Undo'), btn('↷', () => restore(hi + 1), 'Redo')), h('span', { class: 'dx-grow' }),
      grp('Output', h('select', { class: 'dx-in', onchange: (e) => { if (e.target.value) { part = example(e.target.value); sel = part.features[part.features.length - 1].id; commit(); rebuild(); renderAll(); fit(); toast(part.name + ' loaded.'); } e.target.value = ''; } }, h('option', { value: '', text: 'Examples…' }), [['bracket', 'Flanged bracket'], ['vase', 'Turned vase (revolve)'], ['duct', 'Square to round duct (loft)'], ['pipe', 'Bent pipe (sweep)'], ['roof', 'Wave roof (surface + thicken)'], ['svase', 'Spline vase (surface + thicken)']].map(([v, l]) => h('option', { value: v, text: l }))),
        btn(dwHost.hidden ? 'Drawing' : '3D model', () => toggleDrawing(), 'Production drawing with hidden lines'), btn('Export (STEP, STL)', () => exportPack(), '', 'pri'), btn('Send to Subdivision', () => { if (G && G.body && deps.onSendMesh) { deps.onSendMesh(part.name, meshForSubdivision(G.body)); } }, 'Copy this solid into the subdivision workspace as a mesh')));
  }
  function newFeature(t) {
    const sks = part.features.filter((f) => f.type === 'sketch' && !f.suppressed), last = sks[sks.length - 1];
    const surfs = part.features.filter((f) => f.type === 'surface' && !f.suppressed); let type = t, props2 = {};
    if (t === 'cut') { type = 'extrude'; props2 = { sketch: last ? last.id : null, op: 'cut', dir: 'both', distance: '100', name: 'Cut ' + (part.features.filter((f) => /^Cut /.test(f.name)).length + 1) }; }
    else if (t.startsWith('surface:')) { type = 'surface'; const m = t.split(':')[1]; props2 = { mode: m, sketch: last ? last.id : null, sketches: sks.slice(-2).map((f) => f.id), path: sks.length > 1 ? sks[sks.length - 2].id : null, profile: last ? last.id : null, name: SURFACE_MODES.find((x) => x[0] === m)[1] + ' ' + (surfs.length + 1) }; }
    else if (t === 'thicken') props2 = { surface: surfs.length ? surfs[surfs.length - 1].id : null };
    else props2 = t === 'extrude' || t === 'revolve' ? { sketch: last ? last.id : null } : t === 'loft' ? { sketches: sks.slice(-2).map((f) => f.id) } : t === 'sweep' ? { path: sks.length > 1 ? sks[sks.length - 2].id : null, profile: last ? last.id : null } : {};
    const f = addFeature(part, type, props2); sel = f.id; commit(); rebuild(); renderAll();
  }

  // ---------- history tree and properties
  function renderAll() { renderBar(); renderTree(); renderProps(); }
  function renderTree() {
    clear(tree); const stop = part.rollback == null ? part.features.length : part.rollback;
    part.features.forEach((f, i) => {
      if (i === stop) tree.append(h('div', { class: 'pt-roll', text: 'End of history (rolled back)' }));
      const err = G && G.errors[f.id], warn = G && G.warnings && G.warnings[f.id], note = G && G.notes && G.notes[f.id];
      tree.append(h('div', { class: 'pt-node' + (f.id === sel ? ' on' : '') + (f.suppressed || i >= stop ? ' off' : '') + (err ? ' err' : warn ? ' warn' : note ? ' note' : ''), title: err || warn || note || '', onclick: () => { sel = f.id; renderTree(); renderProps(); }, ondblclick: () => { if (f.type === 'sketch') openSketch(f); } },
        h('span', { class: 'pt-ic', text: ({ sketch: '✎', extrude: f.op === 'cut' ? '⊟' : '▮', revolve: '◎', loft: '⧉', sweep: '∿', surface: '◇', thicken: '◆', shell: '▢', fillet: '◜', chamfer: '◸' })[f.type] }), h('span', { class: 'dx-grow', text: f.name }),
        h('button', { class: 'dx-btn xs', title: f.suppressed ? 'Unsuppress' : 'Suppress', text: f.suppressed ? '◌' : '●', onclick: (e) => { e.stopPropagation(); f.suppressed = !f.suppressed; commit(); rebuild(); renderAll(); } }),
        h('button', { class: 'dx-btn xs', title: 'Roll back to just after this feature', text: '⤓', onclick: (e) => { e.stopPropagation(); part.rollback = i + 1 >= part.features.length || part.rollback === i + 1 ? null : i + 1; commit(); rebuild(); renderAll(); } })));
    });
    if (stop === part.features.length) tree.append(h('div', { class: 'pt-roll end', text: 'End of history' }));
    const errs = G ? Object.keys(G.errors).filter((k) => k.startsWith('param:')) : []; errs.forEach((k) => tree.append(h('div', { class: 'pt-err', text: 'Parameter ' + k.slice(6) + ': ' + G.errors[k] })));
  }
  function exprField(label, get, set, hint) { return h('label', { class: 'pt-f' }, h('span', { text: label }), h('input', { class: 'dx-in', value: String(get()), title: hint || 'A number or an equation such as =W/2', onchange: (e) => { set(e.target.value.trim()); commit(); rebuild(); renderAll(); } })); }
  function selField(label, value, choices, set) { return h('label', { class: 'pt-f' }, h('span', { text: label }), h('select', { class: 'dx-in', onchange: (e) => { set(e.target.value); commit(); rebuild(); renderAll(); } }, choices.map(([v, l]) => h('option', { value: v, text: l, selected: String(value) === String(v) })))); }
  function renderProps() {
    clear(props);
    const P = h('div', { class: 'pt-sec' }, h('div', { class: 'pt-h', text: 'Parameters' }), h('div', { class: 'dx-small', text: 'Every dimension can use these names, for example =W/2 or =T+holeR.' }));
    part.params.forEach((p, i) => P.append(h('div', { class: 'pt-prow' }, h('input', { class: 'dx-in', value: p.name, onchange: (e) => { const n2 = e.target.value.trim(); if (!validName(n2)) { toast('Names use letters, digits and _.'); renderProps(); return; } p.name = n2; commit(); rebuild(); renderAll(); } }), h('input', { class: 'dx-in', value: p.v, onchange: (e) => { p.v = e.target.value.trim(); commit(); rebuild(); renderAll(); } }), h('span', { class: 'pt-val', text: G && G.scope[p.name] != null ? (+G.scope[p.name].toFixed(3)).toString() : '?' }), h('button', { class: 'dx-btn xs', text: '×', onclick: () => { part.params.splice(i, 1); commit(); rebuild(); renderAll(); } }))));
    P.append(h('button', { class: 'dx-btn sm', text: 'Add parameter', onclick: () => { let k = 1; while (part.params.some((p) => p.name === 'p' + k)) k++; part.params.push({ name: 'p' + k, v: '10' }); commit(); renderProps(); } })); props.append(P);
    const f = feat(sel); if (!f) return; const F = h('div', { class: 'pt-sec' }, h('div', { class: 'pt-h' }, h('input', { class: 'dx-in', value: f.name, onchange: (e) => { f.name = e.target.value || f.name; commit(); renderTree(); } })));
    const sks = part.features.filter((x) => x.type === 'sketch' && part.features.indexOf(x) < part.features.indexOf(f)).map((x) => [x.id, x.name]), skChoice = [['', '(pick a sketch)']].concat(sks);
    if (G && G.errors[f.id]) F.append(h('div', { class: 'pt-err', text: G.errors[f.id] })); if (G && G.warnings && G.warnings[f.id]) F.append(h('div', { class: 'pt-warn' }, G.warnings[f.id] + ' ', (f.type === 'fillet' || f.type === 'chamfer' || f.type === 'shell') ? h('button', { class: 'dx-btn sm', text: 'Re-pick now', onclick: () => startPick(f) }) : null)); if (G && G.notes && G.notes[f.id]) F.append(h('div', { class: 'pt-note', text: G.notes[f.id] }));
    if (f.type === 'sketch') { F.append(selField('Plane', f.sk.plane, [['XY', 'Top (XY)'], ['XZ', 'Front (XZ)'], ['YZ', 'Side (YZ)']], (v) => { f.sk.plane = v; }), exprField('Offset', () => f.sk.offset, (v) => { f.sk.offset = v; }), h('div', { class: 'dx-small', text: f.sk.points.length + ' points, ' + (f.sk.lines.length + f.sk.circles.length + f.sk.arcs.length) + ' curves, ' + f.sk.cons.length + ' constraints' }), h('button', { class: 'dx-btn pri', text: 'Edit sketch', onclick: () => openSketch(f) })); }
    if (f.type === 'extrude') F.append(selField('Sketch', f.sketch || '', skChoice, (v) => { f.sketch = v; }), exprField('Distance', () => f.distance, (v) => { f.distance = v; }), selField('Direction', f.dir, [['normal', 'Along the normal'], ['reverse', 'Reversed'], ['both', 'Both sides']], (v) => { f.dir = v; }), selField('Result', f.op, OPS, (v) => { f.op = v; }));
    if (f.type === 'revolve') F.append(selField('Sketch', f.sketch || '', skChoice, (v) => { f.sketch = v; }), selField('Axis', f.axis, [['Z', 'Z axis'], ['X', 'X axis'], ['Y', 'Y axis']], (v) => { f.axis = v; }), exprField('Angle °', () => f.angle, (v) => { f.angle = v; }), selField('Result', f.op, OPS, (v) => { f.op = v; }));
    if (f.type === 'loft') { F.append(h('div', { class: 'dx-small', text: 'Sections, in order:' })); sks.forEach(([id, nm]) => F.append(h('label', { class: 'pt-chk' }, h('input', { type: 'checkbox', checked: f.sketches.includes(id), onchange: (e) => { f.sketches = e.target.checked ? f.sketches.concat(id) : f.sketches.filter((x) => x !== id); f.sketches.sort((a, b) => part.features.findIndex((x) => x.id === a) - part.features.findIndex((x) => x.id === b)); commit(); rebuild(); renderAll(); } }), nm))); F.append(selField('Surfaces', f.ruled ? 'ruled' : 'smooth', [['smooth', 'Smooth'], ['ruled', 'Ruled (straight)']], (v) => { f.ruled = v === 'ruled'; }), selField('Result', f.op, OPS, (v) => { f.op = v; })); }
    if (f.type === 'sweep') F.append(selField('Profile', f.profile || '', skChoice, (v) => { f.profile = v; }), selField('Path', f.path || '', skChoice, (v) => { f.path = v; }), h('div', { class: 'dx-small', text: 'The profile is drawn around its own origin and travels along the path.' }), selField('Result', f.op, OPS, (v) => { f.op = v; }));
    if (f.type === 'surface') {
      F.append(selField('Kind', f.mode, SURFACE_MODES, (v) => { f.mode = v; }), h('div', { class: 'dx-small', text: 'Surfaces are open sheets. Lines, arcs and splines do not need to be closed. Thicken turns a surface into a solid.' }));
      if (f.mode === 'extrude') F.append(selField('Sketch', f.sketch || '', skChoice, (v) => { f.sketch = v; }), exprField('Distance', () => f.distance, (v) => { f.distance = v; }));
      if (f.mode === 'revolve') F.append(selField('Sketch', f.sketch || '', skChoice, (v) => { f.sketch = v; }), selField('Axis', f.axis, [['Z', 'Z axis'], ['X', 'X axis'], ['Y', 'Y axis']], (v) => { f.axis = v; }), exprField('Angle °', () => f.angle, (v) => { f.angle = v; }));
      if (f.mode === 'loft') { F.append(h('div', { class: 'dx-small', text: 'Sections, in order:' })); sks.forEach(([id, nm]) => F.append(h('label', { class: 'pt-chk' }, h('input', { type: 'checkbox', checked: (f.sketches || []).includes(id), onchange: (e) => { f.sketches = e.target.checked ? (f.sketches || []).concat(id) : f.sketches.filter((x) => x !== id); f.sketches.sort((a, b) => part.features.findIndex((x) => x.id === a) - part.features.findIndex((x) => x.id === b)); commit(); rebuild(); renderAll(); } }), nm))); }
      if (f.mode === 'sweep') F.append(selField('Profile', f.profile || '', skChoice, (v) => { f.profile = v; }), selField('Path', f.path || '', skChoice, (v) => { f.path = v; }));
    }
    if (f.type === 'thicken') { const surfs = part.features.filter((x) => x.type === 'surface' && part.features.indexOf(x) < part.features.indexOf(f)).map((x) => [x.id, x.name]); F.append(selField('Surface', f.surface || '', [['', '(the latest surface)']].concat(surfs), (v) => { f.surface = v || null; }), exprField('Thickness', () => f.thickness, (v) => { f.thickness = v; }), selField('Result', f.op, OPS, (v) => { f.op = v; })); }
    if (f.type === 'shell') {
      F.append(exprField('Thickness', () => f.thickness, (v) => { f.thickness = v; }), selField('Open face', f.open, OPEN_FACES, (v) => { f.open = v; if (v === 'picked') setTimeout(() => startPick(f), 0); }));
      if (f.open === 'picked') { const n2 = (f.facePicks || []).length; F.append(h('div', { class: 'dx-small', text: n2 ? n2 + ' face' + (n2 === 1 ? '' : 's') + ' left open.' : 'No faces picked yet.' }), pick && pick.fid === f.id ? h('div', { class: 'dx-row' }, h('button', { class: 'dx-btn pri', text: 'Done picking', onclick: endPick }), h('button', { class: 'dx-btn sm', text: 'Clear', onclick: () => { f.facePicks = []; commit(); rebuild(); renderProps(); } })) : h('button', { class: 'dx-btn pri', text: 'Pick faces in the view', onclick: () => startPick(f) })); }
    }
    if (f.type === 'fillet' || f.type === 'chamfer') {
      F.append(f.type === 'fillet' ? exprField('Radius', () => f.radius, (v) => { f.radius = v; }) : exprField('Size', () => f.size, (v) => { f.size = v; }), selField('Edges', f.edges, EDGE_SETS, (v) => { f.edges = v; if (v === 'picked') setTimeout(() => startPick(f), 0); }));
      if (f.edges === 'picked') { const n2 = (f.picks || []).length; F.append(h('div', { class: 'dx-small', text: n2 ? n2 + ' edge' + (n2 === 1 ? '' : 's') + ' picked.' : 'No edges picked yet.' }), pick && pick.fid === f.id ? h('div', { class: 'dx-row' }, h('button', { class: 'dx-btn pri', text: 'Done picking', onclick: endPick }), h('button', { class: 'dx-btn sm', text: 'Clear', onclick: () => { f.picks = []; commit(); rebuild(); renderProps(); } })) : h('button', { class: 'dx-btn pri', text: 'Pick edges in the view', onclick: () => startPick(f) })); }
    }
    const idx = part.features.indexOf(f);
    F.append(h('div', { class: 'dx-row' }, h('button', { class: 'dx-btn sm', text: '↑ Earlier', disabled: idx === 0, onclick: () => { part.features.splice(idx - 1, 0, part.features.splice(idx, 1)[0]); commit(); rebuild(); renderAll(); } }), h('button', { class: 'dx-btn sm', text: '↓ Later', disabled: idx === part.features.length - 1, onclick: () => { part.features.splice(idx + 1, 0, part.features.splice(idx, 1)[0]); commit(); rebuild(); renderAll(); } }), h('button', { class: 'dx-btn sm danger', text: 'Delete', onclick: () => { part.features.splice(idx, 1); sel = part.features[Math.max(0, idx - 1)] && part.features[Math.max(0, idx - 1)].id; commit(); rebuild(); renderAll(); } })));
    props.append(F);
    if (G && G.body) { let v = 0; try { v = R.measureVolume(G.body); } catch (e) { /* skip */ } const bb = G.body.boundingBox.bounds; props.append(h('div', { class: 'pt-sec' }, h('div', { class: 'pt-h', text: 'Solid' }), h('div', { class: 'dx-small', text: 'Exact B-rep solid: ' + G.body.faces.length + ' faces. Volume ' + (v / 1000).toFixed(2) + ' cm³. Size ' + [0, 1, 2].map((k) => (bb[1][k] - bb[0][k]).toFixed(2)).join(' × ') + ' mm.' }))); }
  }

  // ---------- edge picking: show the solid as it is just before the fillet, click edges to toggle them
  function startPick(f) {
    if (!R) return; const kind = f.type === 'shell' ? 'face' : 'edge'; pick = { fid: f.id, kind }; if (kind === 'face') { f.open = 'picked'; f.facePicks = f.facePicks || []; } else { f.edges = 'picked'; f.picks = f.picks || []; }
    sel = f.id; dwHost.hidden = true; rebuild(); renderAll(); toast('Click ' + (kind === 'face' ? 'faces to leave open' : 'edges') + ' to add or remove them. The model is shown as it is before this ' + FEATURE_TYPES[f.type].toLowerCase() + '. Press Done or Esc when finished.');
  }
  function endPick() { pick = null; hover = -1; commit(); rebuild(); renderAll(); }
  function pickedHashes() { if (!pick || !G || !G.body) return new Set(); const f = feat(pick.fid); if (!f) return new Set(); return pick.kind === 'face' ? matchFaces(G.body, f.facePicks).sigs : matchEdges(G.body, f.picks).sigs; }
  function faceAt(cx, cy) { if (!soup || !soup.faceGroups) return -1; const t = view.pickTri('part', cx, cy); if (t < 0) return -1; return soup.faceGroups.findIndex((g) => t >= g.start / 3 && t < (g.start + g.count) / 3); }
  function faceTris(fi) { const g = soup.faceGroups[fi]; return soup.pos.subarray(g.start * 3, (g.start + g.count) * 3); }
  function toggleFacePick(fi) {
    const f = feat(pick.fid), face = G.body.faces[fi]; if (!f || !face) return; const sg = faceSig(face), idx = (f.facePicks || []).findIndex((r) => matchFaces(G.body, [r]).sigs.has(sg));
    if (idx >= 0) f.facePicks.splice(idx, 1); else f.facePicks.push(faceRef(G.body, face));
    commit(); drawOverlay(); renderProps(); msg.textContent = f.facePicks.length + ' face' + (f.facePicks.length === 1 ? '' : 's') + ' left open by ' + f.name + '. Done or Esc to finish.';
  }
  function edgeAt(cx, cy) {
    if (!soup || !soup.groups || !soup.groups.length) return -1; const r = view.canvas.getBoundingClientRect(), px = cx - r.left, py = cy - r.top, L = soup.edges; let best = -1, bd = 8;
    soup.groups.forEach((g, gi) => { for (let k = g.start; k < g.start + g.count; k += 2) { const a = view.screen([L[k * 3], L[k * 3 + 1], L[k * 3 + 2]]), b = view.screen([L[k * 3 + 3], L[k * 3 + 4], L[k * 3 + 5]]); if (a[2] > 1 || b[2] > 1) continue; const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / l2)), d = Math.hypot(px - a[0] - vx * t, py - a[1] - vy * t); if (d < bd) { bd = d; best = gi; } } });
    return best;
  }
  function togglePick(gi) {
    const f = feat(pick.fid), edge = G.body.edges[gi]; if (!f || !edge) return; const sg = edgeSig(edge);
    const idx = (f.picks || []).findIndex((r) => matchEdges(G.body, [r]).sigs.has(sg));
    if (idx >= 0) f.picks.splice(idx, 1); else f.picks.push(edgeRef(G.body, edge));
    commit(); drawOverlay(); renderProps(); msg.textContent = f.picks.length + ' edge' + (f.picks.length === 1 ? '' : 's') + ' picked for ' + f.name + '. Done or Esc to finish.';
  }
  function groupLines(gi) { const g = soup.groups[gi], L = soup.edges; return Array.from(L.slice(g.start * 3, (g.start + g.count) * 3)); }
  function drawOverlay() {
    view.clear(view.edit); if (soup) view.setLines(soup.edges, 0x1d232b, pick ? 0.55 : 0.85); surfSoups.forEach((ss) => view.setLines(ss.edges, 0x1d4f80, 0.9));
    if (pick && soup && pick.kind === 'face' && soup.faceGroups) { const hs = pickedHashes(); soup.faceGroups.forEach((g, fi) => { const fc = G.body.faces[fi]; if (fc && hs.has(faceSig(fc))) view.setTris(faceTris(fi), 0xff7a1a, 0.55); }); if (hover >= 0 && soup.faceGroups[hover]) view.setTris(faceTris(hover), 0x1e88e5, 0.35); }
    else if (pick && soup && soup.groups) { const hs = pickedHashes(); soup.groups.forEach((g, gi) => { const e = G.body.edges[gi]; if (e && hs.has(edgeSig(e))) view.setLines(groupLines(gi), 0xff7a1a, 1, false); }); if (hover >= 0 && soup.groups[hover]) view.setLines(groupLines(hover), 0x1e88e5, 1, false); }
    if (!pick) drawSketchLines(); view.render();
  }
  // camera and picking in the 3D view
  let drag3 = null;
  view.canvas && view.canvas.addEventListener('pointerdown', (e) => { drag3 = { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey, moved: false }; try { view.canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
  view.canvas && view.canvas.addEventListener('pointermove', (e) => {
    if (drag3) { const dx = e.clientX - drag3.x, dy = e.clientY - drag3.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag3.moved = true; if (drag3.moved) { drag3.x = e.clientX; drag3.y = e.clientY; if (drag3.shift || drag3.b === 1) view.pan(dx, dy); else view.orbit(dx, dy); } return; }
    if (pick) { const gi = pick.kind === 'face' ? faceAt(e.clientX, e.clientY) : edgeAt(e.clientX, e.clientY); if (gi !== hover) { hover = gi; drawOverlay(); } }
  });
  view.canvas && view.canvas.addEventListener('pointerup', (e) => { const d = drag3; drag3 = null; if (d && !d.moved && d.b === 0 && pick) { if (pick.kind === 'face') { const fi = faceAt(e.clientX, e.clientY); if (fi >= 0) toggleFacePick(fi); } else { const gi = edgeAt(e.clientX, e.clientY); if (gi >= 0) togglePick(gi); } } });
  view.canvas && view.canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  view.canvas && view.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => { if (pick && e.key === 'Escape' && !host.closest('[hidden]')) endPick(); });

  // ---------- regenerate and display
  function rebuild() {
    if (!R) return; const t0 = performance.now(); const pi = pick ? part.features.findIndex((x) => x.id === pick.fid) : -1; if (pick && pi < 0) pick = null;
    G = regenerate(R, part, pick ? { stop: pi } : {}); soup = null;
    const keep = new Set(); if (G.body) { try { soup = displaySoup(G.body); view.setObject({ id: 'part', color: pick ? '#cdd5dc' : '#b9c3cc', visible: true }, soup, {}); keep.add('part'); } catch (e) { G.errors.display = 'Could not display the solid.'; } }
    surfSoups = []; (G.surfaces || []).forEach((sf, i) => { try { const ss = displaySoup(sf); view.setObject({ id: 'surf' + i, color: '#7fb0e0', visible: true }, ss, {}); keep.add('surf' + i); surfSoups.push(ss); } catch (e) { /* skip */ } }); view.dropMissing(keep);
    drawOverlay();
    view.render(); msg.textContent = pick ? 'Picking ' + (pick.kind === 'face' ? 'faces' : 'edges') + ': click to add or remove, Done or Esc to finish.' : 'Regenerated ' + part.features.length + ' features in ' + Math.round(performance.now() - t0) + ' ms' + (Object.keys(G.errors).length ? ', ' + Object.keys(G.errors).length + ' with problems' : '');
    if (!dwHost.hidden) drawDrawing();
  }
  function drawSketchLines() {
    if (!G) return; part.features.forEach((f, i) => { if (f.type !== 'sketch' || f.suppressed || (part.rollback != null && i >= part.rollback)) return; const off = (() => { try { return num(f.sk.offset, G.scope); } catch (e) { return 0; } })(), L = [], sk = f.sk; sk.lines.forEach((l) => { const a = byId(sk.points, l.a), b = byId(sk.points, l.b); if (a && b) L.push(...plane3(sk.plane, off, a.x, a.y), ...plane3(sk.plane, off, b.x, b.y)); }); (sk.splines || []).forEach((sp) => { const P = splinePts(sk, sp); for (let i = 0; i < P.length - 1; i++) L.push(...plane3(sk.plane, off, P[i][0], P[i][1]), ...plane3(sk.plane, off, P[i + 1][0], P[i + 1][1])); }); sk.circles.forEach((c) => { const cc = byId(sk.points, c.c); for (let k = 0; k < 48; k++) { const t0b = k / 48 * Math.PI * 2, t1 = (k + 1) / 48 * Math.PI * 2; L.push(...plane3(sk.plane, off, cc.x + c.r * Math.cos(t0b), cc.y + c.r * Math.sin(t0b)), ...plane3(sk.plane, off, cc.x + c.r * Math.cos(t1), cc.y + c.r * Math.sin(t1))); } }); view.setLines(L, f.id === sel ? 0xff7a1a : 0x2f7fc4, 0.9, false); });
  }
  const whole = () => (G && G.surfaces && G.surfaces.length ? R.makeCompound([...(G.body ? [G.body] : []), ...G.surfaces]) : G && G.body);
  function fit() { const w = G && whole(); if (w) { const [mn, mx] = w.boundingBox.bounds; view.fit(mn, mx); } }
  function drawDrawing() { dwHost.innerHTML = ''; const w = G && whole(); if (!w) { dwHost.textContent = 'Nothing to draw yet.'; return; } try { const svg = productionDrawing(R, part, w); dwHost.innerHTML = svg; dwHost.prepend(h('div', { class: 'dx-row pt-dwbar' }, h('button', { class: 'dx-btn sm', text: 'Download drawing (.svg)', onclick: () => saveBytes(base() + '-drawing.svg', 'image/svg+xml', svg) }))); } catch (e) { dwHost.textContent = 'Could not project the drawing: ' + (e.message || e); } }
  function toggleDrawing() { dwHost.hidden = !dwHost.hidden; if (!dwHost.hidden) drawDrawing(); renderBar(); }
  const base = () => (part.name || 'part').replace(/[^\w\-]+/g, '_').toLowerCase();
  const blobBytes = (b) => (b.arrayBuffer ? b.arrayBuffer().then((x) => new Uint8Array(x)) : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = rej; r.readAsArrayBuffer(b); }));
  async function packBytes() { const w = G && whole(); if (!w) throw new Error('Nothing to export yet.'); const step = await blobBytes(await w.blobSTEP()), stl = await blobBytes(await w.blobSTL({ tolerance: 0.05, angularTolerance: 10 })); return createZip([{ name: base() + '.step', data: step }, { name: base() + '.stl', data: stl }, { name: base() + '-drawing.svg', data: productionDrawing(R, part, w) }, { name: base() + '.part.json', data: JSON.stringify(part) }]); }
  async function exportPack() { try { saveBytes(base() + '-cad-pack.zip', 'application/zip', await packBytes()); } catch (e) { toast('Export failed: ' + (e.message || e)); } }

  // ---------- sketch editor
  const sc = { tool: 'line', sel: new Set(), chain: null, zoom: 3, ox: 0, oy: 0, drag: null, pend: [], hover: null };
  const skCanvas = h('canvas', { class: 'pt-skc' }); skHost.append(skCanvas); const dofEl = h('span', { class: 'pt-dof' });
  function sketchToolbar() { const wrap = h('div', { class: 'dx-row' }); wrap.append(h('div', { class: 'dx-seg sm' }, SK_TOOLS.map(([k, l]) => h('button', { class: sc.tool === k ? 'on' : '', text: l, onclick: () => { sc.tool = k; sc.chain = null; sc.pend = []; renderBar(); drawSketch(); } }))), h('span', { class: 'pt-sep' }), ...CONS.map(([k, g, t]) => h('button', { class: 'dx-btn sm', text: g, title: t, onclick: () => addCon(k) })), h('button', { class: 'dx-btn sm', text: 'Construction', title: 'Toggle construction geometry (not part of the profile)', onclick: toggleConstruction }), h('button', { class: 'dx-btn sm danger', text: 'Delete', onclick: deleteSel }), dofEl); return wrap; }
  function openSketch(f) { editing = f; sel = f.id; skHost.hidden = false; dwHost.hidden = true; sc.sel.clear(); sc.chain = null; fitSketch(); renderAll(); drawSketch(); }
  function finishSketch() { editing = null; skHost.hidden = true; commit(); rebuild(); renderAll(); }
  const SK = () => editing.sk, dimVal = (c) => num(c.value, (G && G.scope) || scopeOf(part).values);
  function fitSketch() { const sk = SK(), w = skHost.clientWidth || 800, hh = skHost.clientHeight || 500; if (!sk.points.length) { sc.zoom = 3; sc.ox = w / 2; sc.oy = hh / 2; return; } let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; sk.points.forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }); sk.circles.forEach((c) => { const p = byId(sk.points, c.c); x0 = Math.min(x0, p.x - c.r); x1 = Math.max(x1, p.x + c.r); y0 = Math.min(y0, p.y - c.r); y1 = Math.max(y1, p.y + c.r); }); sc.zoom = Math.min((w - 120) / Math.max(10, x1 - x0), (hh - 120) / Math.max(10, y1 - y0)); sc.ox = w / 2 - (x0 + x1) / 2 * sc.zoom; sc.oy = hh / 2 + (y0 + y1) / 2 * sc.zoom; }
  const toS = (x, y) => [sc.ox + x * sc.zoom, sc.oy - y * sc.zoom], toW = (px, py) => [(px - sc.ox) / sc.zoom, (sc.oy - py) / sc.zoom];
  const snapStep = () => { const s = 12 / sc.zoom, p = Math.pow(10, Math.floor(Math.log10(s))); return s / p < 2 ? p : s / p < 5 ? 2 * p : 5 * p; };
  function hit(px, py) {
    const sk = SK(); let best = null, bd = 9; sk.points.forEach((p) => { const s = toS(p.x, p.y), d = Math.hypot(s[0] - px, s[1] - py); if (d < bd) { bd = d; best = { kind: 'point', id: p.id }; } }); if (best) return best; bd = 7;
    sk.lines.forEach((l) => { const a = toS(...xy(l.a)), b = toS(...xy(l.b)), d = seg(px, py, a, b); if (d < bd) { bd = d; best = { kind: 'line', id: l.id }; } });
    sk.circles.forEach((c) => { const s = toS(...xy(c.c)), d = Math.abs(Math.hypot(px - s[0], py - s[1]) - c.r * sc.zoom); if (d < bd) { bd = d; best = { kind: 'circle', id: c.id }; } });
    sk.arcs.forEach((a) => { const s = toS(...xy(a.c)), r = Math.hypot(...[0, 1].map((k) => xy(a.a)[k] - xy(a.c)[k])) * sc.zoom, d = Math.abs(Math.hypot(px - s[0], py - s[1]) - r); if (d < bd) { bd = d; best = { kind: 'arc', id: a.id }; } });
    (sk.splines || []).forEach((sp) => { const P = splinePts(sk, sp).map((q) => toS(q[0], q[1])); for (let i = 0; i < P.length - 1; i++) { const d = seg(px, py, P[i], P[i + 1]); if (d < bd) { bd = d; best = { kind: 'spline', id: sp.id }; } } });
    const dm = sc.dimHits && sc.dimHits.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h); if (dm) return { kind: 'dim', id: dm.id }; return best;
  }
  const xy = (id) => { const p = byId(SK().points, id); return [p.x, p.y]; };
  const seg = (px, py, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / l2)); return Math.hypot(px - a[0] - vx * t, py - a[1] - vy * t); };
  function pointAt(px, py) { const hh = hit(px, py); if (hh && hh.kind === 'point') return hh.id; const st = snapStep(), [x, y] = toW(px, py), p = { id: sid('p'), x: Math.round(x / st) * st, y: Math.round(y / st) * st }; SK().points.push(p); return p.id; }
  function addLine(a, b) { const sk = SK(), l = { id: sid('l'), a, b }; sk.lines.push(l); const pa = byId(sk.points, a), pb = byId(sk.points, b), ang = Math.abs(Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180 / Math.PI) % 180; if (ang < 4 || ang > 176) sk.cons.push({ id: sid('c'), type: 'horizontal', refs: [l.id] }); else if (Math.abs(ang - 90) < 4) sk.cons.push({ id: sid('c'), type: 'vertical', refs: [l.id] }); return l.id; }
  function resolveSk(goals) { const r = solve(SK(), dimVal, goals ? { goals, iters: 25 } : {}); sc.ok = r.ok; return r; }
  function skDown(e) {
    const r = skCanvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top; if (e.button === 2 || e.button === 1) { sc.pan = { x: e.clientX, y: e.clientY }; return; }
    const sk = SK(), t = sc.tool;
    if (t === 'select') { const hh = hit(px, py); if (hh && hh.kind === 'dim') { editDim(hh.id); return; } if (!hh) { if (!e.shiftKey) sc.sel.clear(); drawSketch(); return; } const key = hh.kind + ':' + hh.id; if (e.shiftKey) { if (sc.sel.has(key)) sc.sel.delete(key); else sc.sel.add(key); } else if (!sc.sel.has(key)) { sc.sel.clear(); sc.sel.add(key); } if (hh.kind === 'point') sc.drag = { id: hh.id }; drawSketch(); return; }
    if (t === 'line') { const p = pointAt(px, py); if (sc.chain && sc.chain !== p) { addLine(sc.chain, p); resolveSk(); } sc.chain = p; commitSk(); return; }
    if (t === 'spline') { const p = pointAt(px, py); sc.pend.push(p); drawSketch(); return; }
    if (t === 'rect') { if (!sc.pend.length) { sc.pend = [toW(px, py)]; drawSketch(); return; } const st = snapStep(), [x0, y0] = sc.pend[0].map((v) => Math.round(v / st) * st), [x1, y1] = toW(px, py).map((v) => Math.round(v / st) * st); sc.pend = []; if (Math.abs(x1 - x0) < 1e-6 || Math.abs(y1 - y0) < 1e-6) return; const P = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => { const q = { id: sid('p'), x, y }; sk.points.push(q); return q.id; }); P.forEach((a, i) => addLine(a, P[(i + 1) % 4])); resolveSk(); commitSk(); return; }
    if (t === 'circle') { if (!sc.pend.length) { sc.pend = [pointAt(px, py)]; drawSketch(); return; } const c = sc.pend[0], [x, y] = toW(px, py), cp = byId(sk.points, c), rr = Math.hypot(x - cp.x, y - cp.y); sc.pend = []; if (rr > 1e-6) sk.circles.push({ id: sid('k'), c, r: +rr.toFixed(3) }); commitSk(); return; }
    if (t === 'arc') { sc.pend.push(sc.pend.length < 2 ? pointAt(px, py) : toW(px, py)); if (sc.pend.length < 3) { drawSketch(); return; } const [a, b, m] = sc.pend; sc.pend = []; const A = byId(sk.points, a), B = byId(sk.points, b), cc = circum([A.x, A.y], m, [B.x, B.y]); if (!cc) { toast('Those three points are in a line.'); return; } const cp = { id: sid('p'), x: cc[0], y: cc[1] }; sk.points.push(cp); const ccw = ((m[0] - A.x) * (B.y - A.y) - (m[1] - A.y) * (B.x - A.x)) < 0; sk.arcs.push(ccw ? { id: sid('a'), c: cp.id, a, b } : { id: sid('a'), c: cp.id, a: b, b: a }); commitSk(); return; }
    if (t === 'dim') { const hh = hit(px, py); if (!hh) return; if (hh.kind === 'dim') { editDim(hh.id); return; } sc.pend.push(hh); dimFromPicks(); }
  }
  function circum(a, b, c) { const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (Math.abs(d) < 1e-9) return null; const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d, uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d; return [ux, uy]; }
  function dimFromPicks() {
    const sk = SK(), P = sc.pend, a = P[0], b = P[1]; let c = null;
    if (P.length === 1 && a.kind === 'line') { const l = byId(sk.lines, a.id), A = xy(l.a), B = xy(l.b); c = { type: 'length', refs: [a.id], value: +Math.hypot(B[0] - A[0], B[1] - A[1]).toFixed(2) }; }
    else if (P.length === 1 && (a.kind === 'circle' || a.kind === 'arc')) { const r = a.kind === 'circle' ? byId(sk.circles, a.id).r : (() => { const ar = byId(sk.arcs, a.id), C = xy(ar.c), A = xy(ar.a); return Math.hypot(A[0] - C[0], A[1] - C[1]); })(); c = { type: 'radius', refs: [a.id], value: +r.toFixed(2) }; }
    else if (P.length === 2 && a.kind === 'point' && b.kind === 'point') { const A = xy(a.id), B = xy(b.id), dx = Math.abs(B[0] - A[0]), dy = Math.abs(B[1] - A[1]); c = dx < 1e-6 ? { type: 'vdist', refs: [a.id, b.id], value: +dy.toFixed(2) } : dy < 1e-6 ? { type: 'hdist', refs: [a.id, b.id], value: +dx.toFixed(2) } : { type: 'distance', refs: [a.id, b.id], value: +Math.hypot(dx, dy).toFixed(2) }; }
    else if (P.length === 2 && a.kind === 'line' && b.kind === 'line') { const d = (l) => { const L = byId(sk.lines, l), A = xy(L.a), B = xy(L.b); return [B[0] - A[0], B[1] - A[1]]; }, u = d(a.id), v = d(b.id); let g = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) * 180 / Math.PI); c = { type: 'angle', refs: [a.id, b.id], value: +g.toFixed(1) }; }
    else if (P.length < 2 && a.kind === 'point') { drawSketch(); return; }
    sc.pend = []; if (!c) { toast('Pick a line, a circle, two points or two lines.'); return; }
    c.id = sid('c'); sk.cons.push(c); resolveSk(); commitSk(); editDim(c.id);
  }
  function editDim(id) {
    const c = SK().cons.find((x) => x.id === id); if (!c) return; const box = h('div', { class: 'pt-dlg' }), inp = h('input', { class: 'dx-in', value: String(c.value) });
    const close = () => box.remove(), ok = () => { c.value = inp.value.trim(); close(); const r = resolveSk(); if (!r.ok) toast('That dimension conflicts with the others. Undo or remove a constraint.'); commitSk(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') close(); });
    box.append(h('div', { class: 'dx-card' }, h('b', { text: CON_TYPES[c.type] }), h('div', { class: 'dx-small', text: 'A number in mm (degrees for angles) or an equation using parameters, such as =W/2.' }), inp, h('div', { class: 'dx-row' }, h('button', { class: 'dx-btn pri', text: 'Apply', onclick: ok }), h('button', { class: 'dx-btn', text: 'Remove dimension', onclick: () => { SK().cons = SK().cons.filter((x) => x.id !== id); close(); commitSk(); } }), h('button', { class: 'dx-btn', text: 'Cancel', onclick: close }))));
    stage.append(box); setTimeout(() => { inp.focus(); inp.select && inp.select(); }, 0);
  }
  function addCon(type) {
    const sk = SK(), picks = [...sc.sel].map((k) => { const [kind, id] = k.split(':'); return { kind, id }; }), of = (k) => picks.filter((p) => p.kind === k).map((p) => p.id), pts = of('point'), lines = of('line'), circ = of('circle').concat(of('arc'));
    const push = (refs, extra = {}) => sk.cons.push(Object.assign({ id: sid('c'), type, refs }, extra)); let ok = true;
    if (type === 'horizontal' || type === 'vertical') { if (lines.length) lines.forEach((l) => push([l])); else ok = false; }
    else if (type === 'coincident') { if (pts.length >= 2) for (let i = 1; i < pts.length; i++) push([pts[0], pts[i]]); else ok = false; }
    else if (type === 'parallel' || type === 'perpendicular') { if (lines.length === 2) push(lines); else ok = false; }
    else if (type === 'equal') { if (lines.length === 2) push(lines); else if (circ.length === 2) push(circ); else ok = false; }
    else if (type === 'tangent') { if (lines.length === 1 && circ.length === 1) push([lines[0], circ[0]]); else ok = false; }
    else if (type === 'midpoint' || type === 'onLine') { if (pts.length === 1 && lines.length === 1) push([pts[0], lines[0]]); else ok = false; }
    else if (type === 'fix') { if (pts.length) pts.forEach((p) => { const q = byId(sk.points, p); push([p], { x0: q.x, y0: q.y }); }); else ok = false; }
    if (!ok) { toast(CONS.find((c) => c[0] === type)[2] + ' — select those first.'); return; }
    const r = resolveSk(); if (!r.ok) toast('Over-constrained: that conflicts with existing constraints.'); commitSk();
  }
  function toggleConstruction() { const sk = SK(); [...sc.sel].forEach((k) => { const [kind, id] = k.split(':'), arr = kind === 'line' ? sk.lines : kind === 'circle' ? sk.circles : kind === 'arc' ? sk.arcs : kind === 'spline' ? sk.splines : null; const o = arr && byId(arr, id); if (o) o.construction = !o.construction; }); commitSk(); }
  function deleteSel() {
    const sk = SK(), del = new Set([...sc.sel].map((k) => k.split(':')[1])); sk.lines = sk.lines.filter((l) => !del.has(l.id) && !del.has(l.a) && !del.has(l.b)); sk.circles = sk.circles.filter((c) => !del.has(c.id) && !del.has(c.c)); sk.arcs = sk.arcs.filter((a) => !del.has(a.id) && ![a.a, a.b, a.c].some((x) => del.has(x))); sk.splines = (sk.splines || []).filter((sp) => !del.has(sp.id) && !sp.pts.some((x) => del.has(x)));
    const used = new Set(); sk.lines.forEach((l) => { used.add(l.a); used.add(l.b); }); sk.circles.forEach((c) => used.add(c.c)); sk.arcs.forEach((a) => { used.add(a.a); used.add(a.b); used.add(a.c); }); (sk.splines || []).forEach((sp) => sp.pts.forEach((id) => used.add(id))); sk.points = sk.points.filter((p) => used.has(p.id));
    const alive = new Set([...sk.points.map((p) => p.id), ...sk.lines.map((l) => l.id), ...sk.circles.map((c) => c.id), ...sk.arcs.map((a) => a.id), ...(sk.splines || []).map((sp) => sp.id)]); sk.cons = sk.cons.filter((c) => c.refs.every((r) => alive.has(r)) && !del.has(c.id)); sc.sel.clear(); commitSk();
  }
  function commitSk() { commit(); drawSketch(); }
  function skMove(e) {
    const r = skCanvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top; sc.mouse = [px, py];
    if (sc.pan) { sc.ox += e.clientX - sc.pan.x; sc.oy += e.clientY - sc.pan.y; sc.pan = { x: e.clientX, y: e.clientY }; drawSketch(); return; }
    if (sc.drag) { const [x, y] = toW(px, py); resolveSk([{ point: sc.drag.id, x, y }]); sc.dragged = true; drawSketch(); return; }
    if (sc.chain || sc.pend.length) drawSketch();
  }
  function skUp() { sc.pan = null; if (sc.drag) { sc.drag = null; if (sc.dragged) { resolveSk(); commitSk(); } sc.dragged = false; } }
  skCanvas.addEventListener('pointerdown', skDown); skCanvas.addEventListener('pointermove', skMove); skCanvas.addEventListener('pointerup', skUp); skCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
  skCanvas.addEventListener('wheel', (e) => { e.preventDefault(); const r = skCanvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, [x, y] = toW(px, py), f = Math.exp(-e.deltaY * 0.0012); sc.zoom *= f; sc.ox = px - x * sc.zoom; sc.oy = py + y * sc.zoom; drawSketch(); }, { passive: false });
  function finishSpline() { const pts = sc.pend.filter((id, i, a) => i === 0 || id !== a[i - 1]); sc.pend = []; if (pts.length >= 2) { SK().splines = SK().splines || []; SK().splines.push({ id: sid('s'), pts }); commitSk(); } else drawSketch(); }
  skCanvas.addEventListener('dblclick', () => { sc.chain = null; if (sc.tool === 'spline') finishSpline(); else drawSketch(); });
  function drawSketch() {
    if (!editing) return; const sk = SK(), w = skHost.clientWidth || 800, hh = skHost.clientHeight || 500, dpr = Math.min(2, window.devicePixelRatio || 1); skCanvas.width = w * dpr; skCanvas.height = hh * dpr; skCanvas.style.width = w + 'px'; skCanvas.style.height = hh + 'px';
    const x = skCanvas.getContext('2d'); if (!x || !x.setTransform) return; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, hh);
    const st = snapStep() * 5; x.strokeStyle = 'rgba(120,130,140,.18)'; x.lineWidth = 1; const [wx0, wy1] = toW(0, 0), [wx1, wy0] = toW(w, hh); for (let gx = Math.floor(wx0 / st) * st; gx < wx1; gx += st) { const s = toS(gx, 0)[0]; x.beginPath(); x.moveTo(s, 0); x.lineTo(s, hh); x.stroke(); } for (let gy = Math.floor(wy0 / st) * st; gy < wy1; gy += st) { const s = toS(0, gy)[1]; x.beginPath(); x.moveTo(0, s); x.lineTo(w, s); x.stroke(); }
    x.strokeStyle = 'rgba(200,60,60,.55)'; const o = toS(0, 0); x.beginPath(); x.moveTo(o[0], 0); x.lineTo(o[0], hh); x.moveTo(0, o[1]); x.lineTo(w, o[1]); x.stroke();
    const S = (k) => sc.sel.has(k), col = (k, c) => (S(k) ? '#ff7a1a' : c);
    sk.lines.forEach((l) => { const a = toS(...xy(l.a)), b = toS(...xy(l.b)); x.setLineDash(l.construction ? [6, 4] : []); x.strokeStyle = col('line:' + l.id, l.construction ? '#7a8ea8' : '#1d232b'); x.lineWidth = S('line:' + l.id) ? 3 : 2; x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.stroke(); });
    sk.circles.forEach((c) => { const s = toS(...xy(c.c)); x.setLineDash(c.construction ? [6, 4] : []); x.strokeStyle = col('circle:' + c.id, c.construction ? '#7a8ea8' : '#1d232b'); x.lineWidth = S('circle:' + c.id) ? 3 : 2; x.beginPath(); x.arc(s[0], s[1], c.r * sc.zoom, 0, 6.2832); x.stroke(); });
    sk.arcs.forEach((a) => { const C = xy(a.c), A = xy(a.a), B = xy(a.b), s = toS(...C), r = Math.hypot(A[0] - C[0], A[1] - C[1]) * sc.zoom; x.setLineDash(a.construction ? [6, 4] : []); x.strokeStyle = col('arc:' + a.id, '#1d232b'); x.lineWidth = 2; x.beginPath(); x.arc(s[0], s[1], r, -Math.atan2(A[1] - C[1], A[0] - C[0]), -Math.atan2(B[1] - C[1], B[0] - C[0]), true); x.stroke(); });
    (sk.splines || []).forEach((sp) => { const P = splinePts(sk, sp); x.setLineDash(sp.construction ? [6, 4] : []); x.strokeStyle = col('spline:' + sp.id, sp.construction ? '#7a8ea8' : '#1d232b'); x.lineWidth = S('spline:' + sp.id) ? 3 : 2; x.beginPath(); P.forEach((q, i) => { const sq = toS(q[0], q[1]); if (i) x.lineTo(...sq); else x.moveTo(...sq); }); x.stroke(); });
    x.setLineDash([]); sk.points.forEach((p) => { const s = toS(p.x, p.y), fixed = sk.cons.some((c) => c.type === 'fix' && c.refs[0] === p.id); x.fillStyle = col('point:' + p.id, fixed ? '#2e7d32' : '#1d232b'); x.fillRect(s[0] - 3.5, s[1] - 3.5, 7, 7); });
    // constraint glyphs and dimensions
    x.font = '11px system-ui,sans-serif'; sc.dimHits = []; const used = {};
    sk.cons.forEach((c) => {
      const g = GLYPH[c.type]; if (g) { const l = byId(sk.lines, c.refs[0]); let at = null; if (l) { const a = xy(l.a), b = xy(l.b); at = toS((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); } else if (byId(sk.points, c.refs[0])) at = toS(...xy(c.refs[0])); if (at) { const k = Math.round(at[0]) + ',' + Math.round(at[1]), n2 = used[k] = (used[k] || 0) + 1; x.fillStyle = '#2f7fc4'; x.fillText(g, at[0] + 6 + (n2 - 1) * 11, at[1] - 6); } }
      if (DIMENSIONAL.has(c.type)) {
        let at = null; try { if (c.type === 'length') { const l = byId(sk.lines, c.refs[0]), a = xy(l.a), b = xy(l.b); at = toS((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); at = [at[0], at[1] + 16]; } else if (c.type === 'radius') { const cc = byId(sk.circles, c.refs[0]) || byId(sk.arcs, c.refs[0]); at = toS(...xy(cc.c)); at = [at[0] + 8, at[1] - 8]; } else if (c.type === 'angle') { const l = byId(sk.lines, c.refs[0]); at = toS(...xy(l.a)); at = [at[0] + 18, at[1] - 18]; } else { const a = xy(c.refs[0]), b = xy(c.refs[1]); at = toS((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); at = [at[0] + 10, at[1] - 10]; } } catch (e2) { return; }
        let v = '?'; try { v = (+dimVal(c).toFixed(2)).toString(); } catch (e3) { /* bad expression */ } const label = (c.type === 'radius' ? 'R' : c.type === 'angle' ? '∠' : '') + v + (c.type === 'angle' ? '°' : '') + (typeof c.value === 'string' && c.value.trim()[0] === '=' ? ' ƒ' : ''), tw = x.measureText(label).width + 10;
        x.fillStyle = 'rgba(255,255,255,.92)'; x.fillRect(at[0] - tw / 2, at[1] - 12, tw, 17); x.strokeStyle = '#ff7a1a'; x.strokeRect(at[0] - tw / 2, at[1] - 12, tw, 17); x.fillStyle = '#111'; x.textAlign = 'center'; x.fillText(label, at[0], at[1]); x.textAlign = 'left'; sc.dimHits.push({ id: c.id, x: at[0] - tw / 2, y: at[1] - 12, w: tw, h: 17 });
      }
    });
    // rubber band
    if (sc.mouse && (sc.chain || sc.pend.length)) { x.strokeStyle = '#ff7a1a'; x.setLineDash([4, 3]); x.beginPath(); const m = sc.mouse; if (sc.chain) { const a = toS(...xy(sc.chain)); x.moveTo(...a); x.lineTo(...m); } else if (sc.tool === 'rect') { const a = toS(...sc.pend[0]); x.rect(a[0], a[1], m[0] - a[0], m[1] - a[1]); } else if (sc.tool === 'circle') { const a = toS(...xy(sc.pend[0])); x.arc(a[0], a[1], Math.hypot(m[0] - a[0], m[1] - a[1]), 0, 6.2832); } else if (sc.tool === 'spline') { sc.pend.forEach((id, i) => { const a = toS(...xy(id)); if (i) x.lineTo(...a); else x.moveTo(...a); }); x.lineTo(...m); } x.stroke(); x.setLineDash([]); }
    let d = 0; try { d = dof(sk, dimVal); } catch (e4) { d = -1; } dofEl.textContent = sc.ok === false ? 'Conflicting constraints' : d === 0 ? 'Fully constrained' : d + ' degrees of freedom'; dofEl.className = 'pt-dof ' + (sc.ok === false ? 'bad' : d === 0 ? 'ok' : 'warn');
  }
  window.addEventListener('keydown', (e) => { if (!editing || host.closest('[hidden]') || /INPUT|SELECT|TEXTAREA/.test((e.target && e.target.tagName) || '')) return; if (e.key === 'Escape') { sc.chain = null; sc.pend = []; drawSketch(); } if (e.key === 'Enter' && sc.tool === 'spline') finishSpline(); if (e.key === 'Delete' || e.key === 'Backspace') deleteSel(); const m = { l: 'line', p: 'spline', r: 'rect', c: 'circle', a: 'arc', d: 'dim', s: 'select' }[e.key.toLowerCase()]; if (m && !e.ctrlKey && !e.metaKey) { sc.tool = m; sc.chain = null; sc.pend = []; renderBar(); drawSketch(); } });

  // ---------- start: load the kernel once
  msg.textContent = 'Loading the exact kernel (OpenCascade)…'; renderAll(); view.bg(getComputedStyle(root).getPropertyValue('--dx-vp').trim() || '#e9eaec');
  const started = (deps.kernel ? Promise.resolve(deps.kernel) : loadKernel(deps.kernelOpts)).then((k) => { R = k; rebuild(); renderAll(); fit(); }).catch((e) => { msg.textContent = 'The exact kernel could not start: ' + (e.message || e); });
  Object.defineProperties(api, Object.getOwnPropertyDescriptors({ finishSpline, startPick, endPick, togglePick, edgeAt, faceAt, toggleFacePick, get pick() { return pick; }, get soup() { return soup; }, get part() { return part; }, set part(p) { part = p; }, get G() { return G; }, started, rebuild, renderAll, openSketch, finishSketch, sc, addCon, dimFromPicks, editDim, packBytes, view, skCanvas, toS, toW, restore, commit, get hist() { return hist.length; }, newFeature, drawSketch, fit }));
  return { api, root, view, resize() { view.resize(); if (editing) drawSketch(); } };
}
