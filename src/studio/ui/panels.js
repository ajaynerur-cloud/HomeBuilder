import { h, clear, table } from './dom.js';
import { FIELDS, KIND_LABEL } from './fields.js';
import { modelOf } from '../model/resolve.js';
import { valueOf, validName } from '../core/params.js';
import { parseLength, formatLength, fmtArea, sqftToSqm } from '../core/units.js';
import { transformObjects, deleteObjects } from '../model/transform.js';
import { detectRooms } from '../model/rooms.js';
import { runChecks, printChecks, ROOM_TYPES } from '../model/checks.js';
import { generateFrame, loadTakedown, applyFootingSizes, beamChecks } from '../model/structure.js';
import { takeoff, toCSV } from '../model/quantities.js';
import { moveLevel, addLevel, deleteLevel } from '../model/levels.js';
import { buildPalette } from './palette.js';
import { resolveFill } from '../model/materials.js';
import { buildPrint } from '../io/print.js';
import { encodeSTL, encode3MF, encodeOBJ, mergeTris } from '../io/meshio.js';
import { createZip, utf8 } from '../io/zip.js';
import { buildDXF } from '../io/dxf.js';
import { saveBytes } from '../io/download.js';

const r1 = (v) => Math.round(v * 10) / 10;

function numField(label, value, on, opts = {}) {
  const i = h('input', { type: 'text', value: String(value), class: 'st-in', inputmode: 'decimal', title: opts.title || '' });
  i.addEventListener('change', () => on(i.value, i));
  return h('label', { class: 'st-row' }, h('span', { text: label }), i, opts.unit ? h('span', { class: 'st-unit', text: opts.unit }) : null);
}

export function buildPanels(app) {
  const store = app.store, P = () => store.p, M = () => modelOf(store), D = () => store.p.display;
  const root = h('div', { class: 'st-panels' }), tabsEl = h('div', { class: 'st-tabs', role: 'tablist' }), body = h('div', { class: 'st-tabbody' });
  root.appendChild(tabsEl); root.appendChild(body);
  const tabs = {};
  let current = 'props';
  const keep = (el) => el.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);


// colour and material of one object. Walls can be painted on one face only.
let paintFace = 'all';
function appearance(kind, o) {
  const m = M(), mats = P().materials || [], card = h('div', { class: 'st-card' }, h('b', { text: 'Colour and material' }));
  const cur = (key) => { const r = resolveFill(mats, o[key]); return r ? r.hex : null; };
  const key = () => (kind === 'walls' ? ({ all: 'fill', a: 'fillA', b: 'fillB' }[paintFace]) : 'fill');
  if (kind === 'walls') card.appendChild(h('label', { class: 'st-row' }, h('span', { text: 'Face' }), h('select', { class: 'st-in', onchange: (e) => { paintFace = e.target.value; panelsRefresh(); } }, [['all', 'Both faces'], ['a', 'Left face (looking from start to end)'], ['b', 'Right face']].map(([v, l]) => h('option', { value: v, text: l, selected: paintFace === v })))));
  const hex = cur(key()) || cur('fill') || '#d8cdb4';
  const ci = h('input', { type: 'color', class: 'st-color', value: hex, title: 'Pick a colour' }); ci.addEventListener('change', () => app.paint([o.id], ci.value, kind === 'walls' ? paintFace : 'all'));
  card.appendChild(h('label', { class: 'st-row' }, h('span', { text: 'Colour' }), ci, h('span', { class: 'st-unit', text: o[key()] ? (String(o[key()]).slice(0, 2) === 'm:' ? 'material' : o[key()]) : 'default' })));
  if (mats.length) card.appendChild(h('label', { class: 'st-row' }, h('span', { text: 'Material' }), h('select', { class: 'st-in', onchange: (e) => { if (e.target.value) app.paint([o.id], 'm:' + e.target.value, kind === 'walls' ? paintFace : 'all'); } }, h('option', { value: '', text: 'Choose…' }), mats.map((x) => h('option', { value: x.id, text: x.name, selected: o[key()] === 'm:' + x.id })))));
  card.appendChild(h('div', { class: 'st-row2' }, h('button', { class: 'st-btn', text: 'Default colour', onclick: () => app.paint([o.id], null, kind === 'walls' ? paintFace : 'all') }), h('button', { class: 'st-btn', text: 'More colours…', onclick: () => show('look') })));
  void m; return card;
}
function panelsRefresh() { refresh(); }

  // ---------- properties and modify
  tabs.props = { el: h('div'), render() {
    const el = clear(this.el), ids = store.selection, m = M(); if (!ids.length) {
      el.appendChild(h('p', { class: 'st-hint', text: 'Select something to edit it. Click an object in the plan or in 3D, or drag a box in the plan.' }));
      const lv = m.levelById[P().activeLevel]; el.appendChild(h('div', { class: 'st-card' }, h('b', { text: lv.name }), h('div', { class: 'st-small', text: 'Floor at ' + formatLength(lv.elev, D()) + ', height ' + formatLength(lv.height, D()) + '. ' + m.walls.filter((w) => w.level === lv.id).length + ' walls, ' + m.openings.filter((o) => o.level === lv.id).length + ' openings.' })));
      return;
    }
    if (ids.length > 1) {
      const by = {}; ids.forEach((id) => { const f = store.find(id); if (f) by[f.kind] = (by[f.kind] || 0) + 1; });
      el.appendChild(h('div', { class: 'st-card' }, h('b', { text: ids.length + ' objects selected' }), h('div', { class: 'st-small', text: Object.keys(by).map((k) => by[k] + ' ' + KIND_LABEL[k].toLowerCase() + (by[k] > 1 ? 's' : '')).join(', ') })));
    } else {
      const f = store.find(ids[0]); if (f) {
        const o = f.obj, scope = m.scope, card = h('div', { class: 'st-card' }, h('b', { text: KIND_LABEL[f.kind] + ' ' + o.id }));
        (FIELDS[f.kind] || []).filter((fd) => (!fd.only || o.type === fd.only) && (!fd.not || o.type !== fd.not)).forEach((fd) => {
          const raw = o[fd.k];
          if (fd.t === 'bool') { card.appendChild(h('label', { class: 'st-row chk' }, h('input', { type: 'checkbox', checked: !!raw, onchange: (e) => store.transact('Edit', (p) => { store.find(o.id).obj[fd.k] = e.target.checked; }) }), h('span', { text: fd.l }))); return; }
          if (fd.t === 'sel') { const s = h('select', { class: 'st-in', onchange: (e) => store.transact('Edit', (p) => { store.find(o.id).obj[fd.k] = e.target.value; }) }, fd.o.map((x) => h('option', { value: x[0], selected: String(raw) === x[0] || (raw === undefined && x[0] === fd.o[0][0]), text: x[1] }))); card.appendChild(h('label', { class: 'st-row' }, h('span', { text: fd.l }), s)); return; }
          const hint = (() => { if (fd.t !== 'len') return ''; try { return typeof raw === 'string' && raw[0] === '=' ? '= ' + formatLength(valueOf(raw, scope), D()) : (raw === undefined || raw === '' ? '' : formatLength(valueOf(raw, scope), D())); } catch (e) { return 'error'; } })();
          const i = h('input', { type: 'text', class: 'st-in', value: raw === undefined ? '' : String(raw), title: fd.t === 'len' ? 'A length (12.5, 12\'6", 3000mm) or an expression like =wallOut/2' : '' });
          i.addEventListener('change', () => {
            let v = i.value.trim();
            if (v === '') v = undefined; else if (fd.t === 'len') { if (v[0] !== '=') { const n = parseLength(v); if (isNaN(n)) { app.toast('Cannot read "' + v + '" as a length.'); i.value = raw === undefined ? '' : raw; return; } v = /^-?\d*\.?\d+$/.test(v) ? parseFloat(v) : v; } } else if (fd.t === 'num') { v = v[0] === '=' ? v : parseFloat(v); if (typeof v === 'number' && isNaN(v)) { app.toast('Enter a number.'); return; } }
            store.transact('Edit ' + fd.l, () => { const t = store.find(o.id); if (v === undefined) delete t.obj[fd.k]; else t.obj[fd.k] = v; }, { coalesce: o.id + fd.k });
          });
          card.appendChild(h('label', { class: 'st-row' }, h('span', { text: fd.l }), i, h('span', { class: 'st-unit', text: hint })));
        });
        if (f.kind === 'columns' && o.auto || f.kind === 'beams' && o.auto || f.kind === 'footings' && o.auto) card.appendChild(h('div', { class: 'st-small', text: 'Made by Generate frame. Editing it keeps the change until the next regenerate.' }));
        el.appendChild(card);
        if (['walls', 'openings', 'columns', 'beams', 'footings', 'slabs', 'roofs', 'stairs'].includes(f.kind)) el.appendChild(appearance(f.kind, o));
      }
    }
    // modify
    const sel = ids.slice(), b = app.view2d.bounds(sel), c = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0];
    let dx = '5', dy = '0', ang = '90', cp = false;
    const mod = h('details', { class: 'st-sec' }, h('summary', { text: 'Modify: move, copy, rotate, mirror' }));
    const run = (label, op, copy) => { let made = []; store.transact(label, (p) => { made = transformObjects(p, sel, op, copy); }); if (copy && made.length) store.select(made); };
    mod.appendChild(h('div', { class: 'st-row2' }, h('span', { text: 'Move by' }), h('input', { class: 'st-in sm', value: dx, onchange: (e) => { dx = e.target.value; } }), h('input', { class: 'st-in sm', value: dy, onchange: (e) => { dy = e.target.value; } }), h('button', { class: 'st-btn', text: 'Move', onclick: () => { const a = parseLength(dx), b2 = parseLength(dy); if (isNaN(a) || isNaN(b2)) return app.toast('Enter dx and dy.'); run('Move', { type: 'move', dx: a, dy: b2 }, false); } }), h('button', { class: 'st-btn', text: 'Copy', onclick: () => { const a = parseLength(dx), b2 = parseLength(dy); if (isNaN(a) || isNaN(b2)) return app.toast('Enter dx and dy.'); run('Copy', { type: 'move', dx: a, dy: b2 }, true); } })));
    mod.appendChild(h('div', { class: 'st-row2' }, h('span', { text: 'Rotate' }), h('input', { class: 'st-in sm', value: ang, onchange: (e) => { ang = e.target.value; } }), h('span', { class: 'st-unit', text: 'deg about centre' }), h('button', { class: 'st-btn', text: 'Rotate', onclick: () => run('Rotate', { type: 'rotate', c, deg: parseFloat(ang) || 0 }, false) }), h('button', { class: 'st-btn', text: 'Copy', onclick: () => run('Rotate copy', { type: 'rotate', c, deg: parseFloat(ang) || 0 }, true) })));
    mod.appendChild(h('div', { class: 'st-row2' }, h('span', { text: 'Mirror' }), h('button', { class: 'st-btn', text: 'Left-right', onclick: () => run('Mirror', { type: 'mirror', a: c, b: [c[0], c[1] + 1] }, false) }), h('button', { class: 'st-btn', text: 'Up-down', onclick: () => run('Mirror', { type: 'mirror', a: c, b: [c[0] + 1, c[1]] }, false) }), h('button', { class: 'st-btn', text: 'Copy left-right', onclick: () => run('Mirror copy', { type: 'mirror', a: c, b: [c[0], c[1] + 1] }, true) })));
    mod.appendChild(h('div', { class: 'st-row2' }, h('button', { class: 'st-btn', text: 'Zoom to selection', onclick: () => app.view2d.zoomExtents(sel) }), h('button', { class: 'st-btn danger', text: 'Delete', onclick: () => store.transact('Delete', (p) => deleteObjects(p, sel)) })));
    el.appendChild(mod);
  } };

  // ---------- parameters
  tabs.params = { el: h('div'), render() {
    if (keep(this.el)) return; const el = clear(this.el), m = M();
    el.appendChild(h('p', { class: 'st-hint', text: 'Name a value once and use it anywhere. In any length field type =name, for example =wallOut/2 or =storey-1. Change a parameter and everything that uses it updates.' }));
    const rows = P().params.map((p, i) => {
      const val = m.scope[p.name], err = m.errors.find((e) => e.indexOf('Parameter ' + p.name + ':') === 0);
      return h('tr', {}, h('td', {}, h('input', { class: 'st-in', value: p.name, onchange: (e) => { const n = e.target.value.trim(); if (!validName(n) || P().params.some((q, j) => j !== i && q.name === n)) { app.toast('Use letters, digits and _ and a name nobody else has.'); e.target.value = p.name; return; } store.transact('Rename parameter', (pp) => { pp.params[i].name = n; }); } })),
        h('td', {}, h('input', { class: 'st-in', value: String(p.v), onchange: (e) => { let v = e.target.value.trim(); if (/^-?\d*\.?\d+$/.test(v)) v = parseFloat(v); store.transact('Edit parameter', (pp) => { pp.params[i].v = v; }, { coalesce: 'param' + i }); } })),
        h('td', { class: err ? 'bad' : '' }, err ? 'error' : (val === undefined ? '–' : formatLength(val, D()))),
        h('td', {}, h('input', { class: 'st-in', value: p.note || '', onchange: (e) => store.transact('Edit note', (pp) => { pp.params[i].note = e.target.value; }, { coalesce: 'pn' + i }) })),
        h('td', {}, h('button', { class: 'st-btn sm', text: '×', title: 'Delete', onclick: () => store.transact('Delete parameter', (pp) => { pp.params.splice(i, 1); }) })));
    });
    const t = h('table', { class: 'st-table' }, h('thead', {}, h('tr', {}, ['Name', 'Value or =expression', 'Result', 'Note', ''].map((x) => h('th', { text: x })))), h('tbody', {}, rows));
    el.appendChild(h('div', { class: 'st-scroll' }, t));
    el.appendChild(h('div', { class: 'st-row2' }, h('button', { class: 'st-btn', text: 'Add parameter', onclick: () => store.transact('Add parameter', (pp) => { let n = 1; while (pp.params.some((q) => q.name === 'p' + n)) n++; pp.params.push({ name: 'p' + n, v: 1, note: '' }); }) })));
    if (m.errors.length) el.appendChild(h('div', { class: 'st-card bad' }, m.errors.slice(0, 6).map((e) => h('div', { text: e }))));
  } };

  // ---------- levels and layers
  let copyFloor = true;
  tabs.levels = { el: h('div'), render() {
    if (keep(this.el)) return; const el = clear(this.el), m = M(), lvs = P().levels;
    el.appendChild(h('b', { text: 'Levels' }));
    el.appendChild(h('div', { class: 'st-small', text: 'Top floor first. ▲ and ▼ move a floor up or down the stack, and everything drawn on it goes along. Copy puts a duplicate above or below.' }));
    const order = lvs.map((l, i) => i).sort((a, b) => m.levelById[lvs[b].id].elev - m.levelById[lvs[a].id].elev);
    const lenField = (l, i, label, key, def) => numField(label, l[key] === undefined ? def : l[key], (v, inp) => { const n = v.trim()[0] === '=' ? v.trim() : parseLength(v); if (typeof n === 'number' && isNaN(n)) { inp.value = l[key] === undefined ? def : l[key]; return app.toast('Enter a length.'); } store.transact('Level ' + label, (p) => { p.levels[i][key] = n; }); }, { unit: formatLength(m.levelById[l.id][key] === undefined ? 0 : m.levelById[l.id][key], D()) });
    order.forEach((i, pos) => {
      const l = lvs[i], ml = m.levelById[l.id], act = P().activeLevel === l.id, isTop = pos === 0, isBottom = pos === order.length - 1;
      el.appendChild(h('div', { class: 'st-card' + (act ? ' act' : '') },
        h('div', { class: 'st-row2' }, h('input', { class: 'st-in', value: l.name, onchange: (e) => store.transact('Rename level', (p) => { p.levels[i].name = e.target.value || l.name; }) }), h('button', { class: 'st-btn', text: act ? 'Active' : 'Make active', disabled: act, onclick: () => app.setLevel(l.id) })),
        h('div', { class: 'st-row2' },
          h('button', { class: 'st-btn', text: '▲ Up', title: 'Move this floor up one place in the stack', disabled: isTop, onclick: () => store.transact('Move floor up', (p) => { moveLevel(p, l.id, 1); }) }),
          h('button', { class: 'st-btn', text: '▼ Down', title: 'Move this floor down one place in the stack', disabled: isBottom, onclick: () => store.transact('Move floor down', (p) => { moveLevel(p, l.id, -1); }) }),
          h('button', { class: 'st-btn', text: 'Copy above', title: 'Duplicate this floor, with its walls and openings, directly above it', onclick: () => store.transact('Copy floor above', (p) => { addLevel(p, { where: 'above', ref: l.id, copy: true }); }) }),
          h('button', { class: 'st-btn', text: 'Copy below', onclick: () => store.transact('Copy floor below', (p) => { addLevel(p, { where: 'below', ref: l.id, copy: true }); }) })),
        numField('Floor elevation', l.elev, (v, inp) => { const n = v.trim()[0] === '=' ? v.trim() : parseLength(v); if (typeof n === 'number' && isNaN(n)) { inp.value = l.elev; return app.toast('Enter a length.'); } store.transact('Level elevation', (p) => { p.levels[i].elev = n; }); }, { unit: formatLength(ml.elev, D()) }),
        numField('Height', l.height, (v, inp) => { const n = v.trim()[0] === '=' ? v.trim() : parseLength(v); if (typeof n === 'number' && isNaN(n)) { inp.value = l.height; return app.toast('Enter a length.'); } store.transact('Level height', (p) => { p.levels[i].height = n; }); }, { unit: formatLength(ml.height, D()) }),
        h('label', { class: 'st-row chk' }, h('input', { type: 'checkbox', checked: l.autoSlab, onchange: (e) => store.transact('Floor slab', (p) => { p.levels[i].autoSlab = e.target.checked; }) }), h('span', { text: 'Floor slab under this level (from the rooms)' })),
        h('label', { class: 'st-row chk', title: 'A flat reinforced-concrete roof slab with a parapet that follows the outline of the walls on this level, courtyards left open.' }, h('input', { type: 'checkbox', checked: !!l.rccRoof, onchange: (e) => store.transact('RCC roof', (p) => { p.levels[i].rccRoof = e.target.checked; }) }), h('span', { text: 'RCC roof slab on top of this level' })),
        l.rccRoof ? h('div', { class: 'st-card sub' }, lenField(l, i, 'Roof slab thickness', 'roofT', '=slabT'), lenField(l, i, 'Parapet height', 'parapet', 3), lenField(l, i, 'Parapet thickness', 'parT', 0.375), lenField(l, i, 'Overhang beyond walls', 'roofOver', 0)) : null,
        lvs.length > 1 ? h('button', { class: 'st-btn danger sm', text: 'Delete level', onclick: () => app.ask({ title: 'Delete ' + l.name + '?', message: 'Everything drawn on this level is removed. You can still undo.', ok: 'Delete' }, () => store.transact('Delete level', (p) => { deleteLevel(p, l.id); })) }) : null));
    });
    el.appendChild(h('div', { class: 'st-card' },
      h('label', { class: 'st-row chk' }, h('input', { type: 'checkbox', checked: copyFloor, onchange: (e) => { copyFloor = e.target.checked; } }), h('span', { text: 'Copy the top floor when adding one above' })),
      h('div', { class: 'st-row2' },
        h('button', { class: 'st-btn pri', text: 'Add level above', onclick: () => store.transact('Add level', (p) => { addLevel(p, { where: 'above', copy: copyFloor }); }) }),
        h('button', { class: 'st-btn', text: 'Add basement below', onclick: () => store.transact('Add basement', (p) => { addLevel(p, { where: 'below' }); }) }))));
    el.appendChild(h('b', { class: 'st-gap', text: 'Layers' }));
    P().layers.forEach((l, i) => el.appendChild(h('div', { class: 'st-row2' }, h('span', { class: 'st-swatch', style: 'background:' + l.color }), h('span', { class: 'grow', text: l.name }),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: l.visible, onchange: (e) => store.transact('Layer', (p) => { p.layers[i].visible = e.target.checked; }) }), ' Show'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: l.locked, onchange: (e) => store.transact('Layer', (p) => { p.layers[i].locked = e.target.checked; }) }), ' Lock'))));
  } };

  // ---------- schedules
  let schedTab = 'rooms';
  const csvBtn = (name, cols, rows) => h('button', { class: 'st-btn', text: 'Download CSV', onclick: () => saveBytes(name + '.csv', 'text/csv', toCSV(rows, cols)) });
  tabs.sched = { el: h('div'), render() {
    const el = clear(this.el), m = M(), out = h('div'), d = D();
    el.appendChild(h('div', { class: 'st-seg' }, [['rooms', 'Rooms'], ['open', 'Doors, windows'], ['struct', 'Structure'], ['qty', 'Quantities']].map(([k, l]) => h('button', { class: schedTab === k ? 'on' : '', text: l, onclick: () => { schedTab = k; this.render(); } })))); el.appendChild(out);
    if (schedTab === 'rooms') {
      const rows = []; m.levels.forEach((L) => detectRooms(m, L.id).forEach((r) => rows.push({ level: L.name, name: r.name || '(unnamed)', type: (ROOM_TYPES.find((x) => x[0] === r.type) || [0, r.type])[1], net: r.net, gross: r.gross, per: r.perimeter, ids: r.label ? [r.label.id] : [], lv: L.id })));
      const cols = [{ label: 'Level', key: 'level' }, { label: 'Room', key: 'name' }, { label: 'Type', key: 'type' }, { label: 'Clear area sq ft', num: true, get: (r) => r1(r.net), key: 'net' }, { label: 'm²', num: true, get: (r) => r1(sqftToSqm(r.net)) }, { label: 'Centre-line sq ft', num: true, get: (r) => r1(r.gross), key: 'gross' }, { label: 'Perimeter', num: true, get: (r) => formatLength(r.per, d), key: 'per' }];
      out.appendChild(h('div', { class: 'st-scroll' }, table(cols, rows, { onRow: (r) => { if (r.ids.length) { app.setLevel(r.lv, true); store.select(r.ids); } } })));
      out.appendChild(h('div', { class: 'st-row2' }, csvBtn('rooms', cols.map((c) => ({ label: c.label, get: c.get || ((r) => r[c.key]) })), rows), h('button', { class: 'st-btn', text: 'Name every unnamed room', onclick: () => store.transact('Name rooms', (p) => { let n = 1; m.levels.forEach((L) => detectRooms(m, L.id).forEach((r) => { if (!r.label) { const id = 'm' + (p.nextId++); p.rooms.push({ id, level: L.id, x: Math.round(r.inside[0] * 1000) / 1000, y: Math.round(r.inside[1] * 1000) / 1000, name: 'Room ' + n++, type: 'room' }); } })); }) })));
    } else if (schedTab === 'open') {
      const rows = m.openings.map((o) => ({ id: o.id, kind: { door: 'Door', window: 'Window', arch: 'Arch', vent: 'Vent' }[o.kind], w: o.w, h: o.h, sill: o.sill, wall: o.wall, level: m.levelById[o.level].name }));
      const cols = [{ label: 'Mark', key: 'id' }, { label: 'Type', key: 'kind' }, { label: 'Width', get: (r) => formatLength(r.w, d), key: 'w' }, { label: 'Height', get: (r) => formatLength(r.h, d), key: 'h' }, { label: 'Sill', get: (r) => formatLength(r.sill, d), key: 'sill' }, { label: 'Wall', key: 'wall' }, { label: 'Level', key: 'level' }];
      out.appendChild(h('div', { class: 'st-scroll' }, table(cols, rows, { onRow: (r) => store.select([r.id]) })));
      const sum = {}; rows.forEach((r) => { const k = r.kind + ' ' + formatLength(r.w, d) + ' × ' + formatLength(r.h, d); sum[k] = (sum[k] || 0) + 1; });
      out.appendChild(h('div', { class: 'st-small', text: Object.keys(sum).map((k) => sum[k] + ' × ' + k).join('  ·  ') || 'No openings yet.' }));
      out.appendChild(csvBtn('openings', cols.map((c) => ({ label: c.label, get: c.get || ((r) => r[c.key]) })), rows));
    } else if (schedTab === 'struct') {
      if (!m.columns.length) out.appendChild(h('p', { class: 'st-hint', text: 'No columns yet. Open the Engineering tab and press Generate frame.' }));
      else {
        const rows = loadTakedown(m).map((r) => ({ ...r, _cls: r.ok ? '' : 'warnrow' }));
        const cols = [{ label: 'Col', key: 'id' }, { label: 'Level', key: 'level' }, { label: 'Section mm', key: 'section' }, { label: 'Trib. m²', num: true, get: (r) => r1(r.trib), key: 'trib' }, { label: 'Service kN', num: true, get: (r) => Math.round(r.Pk), key: 'Pk' }, { label: 'Ultimate kN', num: true, get: (r) => Math.round(r.Pu), key: 'Pu' }, { label: 'Use %', num: true, get: (r) => Math.round(r.util * 100), key: 'util' }, { label: 'Suggest mm', num: true, key: 'suggest' }, { label: 'Footing mm', get: (r) => r.footing.B + '×' + r.footing.B + '×' + r.footing.D, key: 'footing' }];
        out.appendChild(h('div', { class: 'st-scroll' }, table(cols, rows, { onRow: (r) => store.select([r.id]) })));
        const bc = beamChecks(m), bad = bc.filter((b) => !b.ok);
        out.appendChild(h('div', { class: 'st-small', text: 'Beams: ' + bc.length + ' checked, ' + bad.length + ' need more depth (span ÷ 15 rule). Loads: dead + live from Engineering settings. Preliminary only.' }));
        out.appendChild(csvBtn('structure', cols.map((c) => ({ label: c.label, get: c.get || ((r) => r[c.key]) })), rows));
      }
    } else {
      const rows = takeoff(m), cols = [{ label: 'Group', key: 'group' }, { label: 'Item', key: 'item' }, { label: 'Unit', key: 'unit' }, { label: 'Quantity', num: true, key: 'qty' }, { label: 'Note', key: 'note' }];
      out.appendChild(h('div', { class: 'st-scroll' }, table(cols, rows))); out.appendChild(csvBtn('quantities', cols, rows));
    }
  } };

  // ---------- checks
  tabs.checks = { el: h('div'), render() {
    const el = clear(this.el), c = runChecks(M(), D());
    el.appendChild(h('p', { class: 'st-hint', text: 'Checks run on the whole project. Click a line to select what it talks about. They guide the design and do not replace a code review.' }));
    if (!c.length) el.appendChild(h('div', { class: 'st-card ok', text: 'No issues found.' }));
    c.forEach((x) => el.appendChild(h('div', { class: 'st-note ' + x.lvl, onclick: () => { if (x.ids.length) { store.select(x.ids); app.view2d.zoomExtents(x.ids); } } }, h('span', { class: 'tag', text: { err: 'Error', warn: 'Warning', info: 'Note' }[x.lvl] }), ' ' + x.msg)));
  } };

  // ---------- engineering
  tabs.eng = { el: h('div'), render() {
    if (keep(this.el)) return; const el = clear(this.el), s = P().site, m = M();
    const setSite = (k) => (v) => { const n = parseFloat(v); if (isNaN(n)) return; store.transact('Site data', (p) => { p.site[k] = n; }, { coalesce: 'site' + k }); };
    el.appendChild(h('p', { class: 'st-hint', text: 'Preliminary structural design for a framed building: columns at wall junctions, beams on the walls, footings under columns. The loads and sizes are first estimates for discussion with the structural engineer.' }));
    const card = h('div', { class: 'st-card' }, h('b', { text: 'Design data' }));
    [['sbc', 'Safe bearing capacity', 'kN/m²'], ['fck', 'Concrete grade fck', 'N/mm²'], ['fy', 'Steel fy', 'N/mm²'], ['dlFloor', 'Floor dead load', 'kN/m²'], ['llFloor', 'Floor live load', 'kN/m²'], ['dlRoof', 'Roof dead load', 'kN/m²'], ['llRoof', 'Roof live load', 'kN/m²'], ['brick', 'Masonry unit weight', 'kN/m³'], ['maxSpan', 'Largest column spacing', 'ft']].forEach(([k, l, u]) => card.appendChild(numField(l, s[k], setSite(k), { unit: u })));
    el.appendChild(card);
    let plinth = false;
    el.appendChild(h('div', { class: 'st-card' }, h('b', { text: 'Frame' }),
      h('label', { class: 'st-row chk' }, h('input', { type: 'checkbox', onchange: (e) => { plinth = e.target.checked; } }), h('span', { text: 'Also add plinth beams' })),
      h('div', { class: 'st-row2' }, h('button', { class: 'st-btn', text: 'Generate frame', onclick: () => { let r; store.transact('Generate frame', (p) => { r = generateFrame(p, M(), { plinth }); }); app.toast('Added ' + r.columns + ' columns, ' + r.beams + ' beams, ' + r.footings + ' footings. Your own members were kept.'); } }),
        h('button', { class: 'st-btn', text: 'Size footings from loads', onclick: () => { let n = 0; store.transact('Size footings', (p) => { n = applyFootingSizes(p, M(), loadTakedown(M())); }); app.toast(n + ' footings sized for ' + s.sbc + ' kN/m² bearing.'); } }),
        h('button', { class: 'st-btn danger', text: 'Clear generated', onclick: () => store.transact('Clear frame', (p) => { p.columns = p.columns.filter((c) => !c.auto); p.beams = p.beams.filter((c) => !c.auto); p.footings = p.footings.filter((c) => !c.auto); }) }))));
    if (m.columns.length) {
      const rows = loadTakedown(m), tot = rows.reduce((a, r) => a + r.Pk, 0), worst = rows.slice().sort((a, b) => b.util - a.util)[0], bad = rows.filter((r) => !r.ok).length;
      el.appendChild(h('div', { class: 'st-card' }, h('b', { text: 'Summary' }), h('div', { class: 'st-small', text: m.columns.length + ' columns, ' + m.beams.length + ' beams, ' + m.footings.length + ' footings.' }), h('div', { class: 'st-small', text: 'Total service load ' + Math.round(tot) + ' kN. Highest column use ' + Math.round(worst.util * 100) + '% (' + worst.id + ', ' + worst.section + ' mm). ' + (bad ? bad + ' column' + (bad > 1 ? 's' : '') + ' need attention, see Checks.' : 'All columns pass the first check.') })));
    }
  } };

  // ---------- print
  let last = null, busy = false, scaleOpt = [20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 300];
  tabs.print = { el: h('div'), render() {
    if (keep(this.el) && this.el.querySelector('[data-keep]')) return; const el = clear(this.el), pr = P().print, S = (k) => (v) => { const n = parseFloat(v); if (isNaN(n)) return; store.transact('Print setting', (p) => { p.print[k] = n; }, { coalesce: 'pr' + k }); }, B = (k) => (e) => store.transact('Print setting', (p) => { p.print[k] = e.target.checked; });
    const inc = this.inc = this.inc || { walls: true, slabs: true, roofs: true, columns: true, beams: true, footings: false, stairs: true, panels: false };
    const lv = this.lv = this.lv || 'all';
    el.appendChild(h('p', { class: 'st-hint', text: 'Prepare a scaled, closed-solid model for 3D printing. Walls are merged into one solid per level, openings are cut through, and thin walls can be thickened to the smallest size your printer can make.' }));
    el.appendChild(h('div', { class: 'st-card' }, h('b', { text: 'Scale and printer' }),
      h('label', { class: 'st-row' }, h('span', { text: 'Scale 1 :' }), h('select', { class: 'st-in', 'data-keep': 1, onchange: (e) => S('scale')(e.target.value) }, scaleOpt.map((n) => h('option', { value: n, selected: n === pr.scale, text: n })))),
      numField('Smallest feature', pr.minMm, S('minMm'), { unit: 'mm' }), numField('Bed X', pr.bedX, S('bedX'), { unit: 'mm' }), numField('Bed Y', pr.bedY, S('bedY'), { unit: 'mm' }), numField('Bed height', pr.bedZ, S('bedZ'), { unit: 'mm' })));
    const parts = h('div', { class: 'st-card' }, h('b', { text: 'What to print' }));
    [['walls', 'Walls'], ['slabs', 'Slabs and floors'], ['roofs', 'Roofs'], ['columns', 'Columns'], ['beams', 'Beams'], ['footings', 'Footings'], ['stairs', 'Stairs'], ['panels', 'Door and window panels']].forEach(([k, l]) => parts.appendChild(h('label', { class: 'st-row chk' }, h('input', { type: 'checkbox', checked: inc[k], onchange: (e) => { inc[k] = e.target.checked; this.refreshStats(); } }), h('span', { text: l }))));
    parts.appendChild(h('label', { class: 'st-row chk' }, h('input', { type: 'checkbox', checked: pr.base, onchange: B('base') }), h('span', { text: 'Base plate' })));
    parts.appendChild(numField('Base thickness', pr.baseMm, S('baseMm'), { unit: 'mm' })); parts.appendChild(numField('Base margin', pr.marginMm, S('marginMm'), { unit: 'mm' }));
    parts.appendChild(h('label', { class: 'st-row chk' }, h('input', { type: 'checkbox', checked: pr.unionWalls !== false, onchange: B('unionWalls') }), h('span', { text: 'Merge walls into one solid per level' })));
    parts.appendChild(h('label', { class: 'st-row chk' }, h('input', { type: 'checkbox', checked: this.thick !== false, onchange: (e) => { this.thick = e.target.checked; this.refreshStats(); } }), h('span', { text: 'Thicken walls thinner than the smallest feature' })));
    parts.appendChild(h('label', { class: 'st-row' }, h('span', { text: 'Levels' }), h('select', { class: 'st-in', 'data-keep': 1, onchange: (e) => { this.lv = e.target.value; this.refreshStats(); } }, h('option', { value: 'all', selected: lv === 'all', text: 'All levels' }), P().levels.map((l) => h('option', { value: l.id, selected: lv === l.id, text: l.name })))));
    el.appendChild(parts);
    this.stats = h('div', { class: 'st-card' }); el.appendChild(this.stats);
    const dl = (kind) => () => {
      const r = this.compute(); if (!r || !r.parts.length) return app.toast('Nothing to export.');
      const base = (P().name || 'house').replace(/[^\w\-]+/g, '_') + '_1to' + r.scale;
      if (kind === 'stl') saveBytes(base + '.stl', 'model/stl', encodeSTL(mergeTris(r.parts), P().name));
      else if (kind === 'stlzip') saveBytes(base + '_parts.zip', 'application/zip', createZip(r.parts.map((p) => ({ name: p.name.replace(/[^\w\- ]+/g, '_') + '.stl', data: encodeSTL(p.tris, p.name) }))));
      else if (kind === '3mf') saveBytes(base + '.3mf', 'model/3mf', encode3MF(r.parts, P().name));
      else if (kind === 'obj') { const o = encodeOBJ(r.parts, base); saveBytes(base + '_obj.zip', 'application/zip', createZip([{ name: base + '.obj', data: o.obj }, { name: base + '.mtl', data: o.mtl }])); }
    };
    el.appendChild(h('div', { class: 'st-card' }, h('b', { text: 'Export' }), h('div', { class: 'st-row2 wrap' },
      h('button', { class: 'st-btn pri', text: 'STL (one file)', onclick: dl('stl') }), h('button', { class: 'st-btn', text: 'STL, each part (zip)', onclick: dl('stlzip') }), h('button', { class: 'st-btn', text: '3MF with colours', onclick: dl('3mf') }), h('button', { class: 'st-btn', text: 'OBJ (zip)', onclick: dl('obj') }))));
    this.refreshStats();
  }, compute() {
    const lv = this.lv || 'all'; try { return buildPrint(P(), { include: this.inc, thicken: this.thick !== false, levels: lv === 'all' ? null : [lv] }); } catch (e) { return null; }
  }, refreshStats() {
    if (!this.stats) return; clear(this.stats); const r = this.compute(); last = r;
    if (!r) { this.stats.appendChild(h('div', { class: 'bad', text: 'Could not prepare the model.' })); return; }
    this.stats.appendChild(h('b', { text: 'Print preview' }));
    if (r.totals) {
      const t = r.totals; this.stats.appendChild(h('div', { class: 'st-small', text: 'Size ' + t.dims.map((d) => Math.round(d)).join(' × ') + ' mm at 1:' + r.scale + '. ' + t.tris.toLocaleString() + ' triangles, ' + r1(t.volumeCm3) + ' cm³ of plastic (about ' + Math.round(t.weightG) + ' g solid). ' + (t.watertight ? 'Every part is a closed solid.' : 'Some parts are not closed.') + ' ' + (t.fits ? 'Fits the bed.' : 'Too big for the bed, try 1:' + t.fitScale + '.') }));
      this.stats.appendChild(h('div', { class: 'st-scroll small' }, table([{ label: 'Part', key: 'name' }, { label: 'Closed', get: (s) => (s.watertight ? 'yes' : 'no') }, { label: 'cm³', num: true, get: (s) => r1(s.volume / 1000) }, { label: 'Triangles', num: true, key: 'tris' }], r.stats)));
    }
    r.warnings.forEach((w) => this.stats.appendChild(h('div', { class: 'st-note ' + w.lvl }, h('span', { class: 'tag', text: w.lvl === 'err' ? 'Error' : (w.lvl === 'warn' ? 'Warning' : 'Note') }), ' ' + w.msg)));
  } };

  // colours and materials
  tabs.look = { el: h('div'), render() { if (!this.pal) { this.pal = buildPalette(app); this.el.appendChild(this.pal.el); } else this.pal.refresh(); } };

  // Parameters and levels live together on one Project tab
  tabs.project = { el: h('div'), render() { tabs.params.render(); tabs.levels.render(); tabs.look.render(); } };
  const secP = h('details', { class: 'st-sec', open: true }, h('summary', { text: 'Parameters' }), tabs.params.el);
  const secL = h('details', { class: 'st-sec', open: true }, h('summary', { text: 'Levels and layers' }), tabs.levels.el);
  const secM = h('details', { class: 'st-sec' }, h('summary', { text: 'Colours and materials' }), tabs.look.el);
  tabs.project.el.appendChild(secP); tabs.project.el.appendChild(secL); tabs.project.el.appendChild(secM);
  const visible = [['props', 'Properties'], ['project', 'Project'], ['sched', 'Schedules'], ['checks', 'Checks'], ['eng', 'Structure'], ['print', 'Print']];
  visible.forEach(([k, l]) => { const b = h('button', { role: 'tab', text: l, onclick: () => show(k) }); tabs[k].btn = b; tabsEl.appendChild(b); body.appendChild(tabs[k].el); tabs[k].el.hidden = k !== current; });
  function show(k) {
    if (k === 'params') { secP.open = true; k = 'project'; } else if (k === 'levels') { secL.open = true; k = 'project'; } else if (k === 'look') { secM.open = true; k = 'project'; }
    current = k; visible.forEach(([n]) => { tabs[n].el.hidden = n !== k; tabs[n].btn.setAttribute('aria-selected', String(n === k)); tabs[n].btn.classList.toggle('on', n === k); }); tabs[k].render();
  }
  let bt = null;
  function badge() {
    clearTimeout(bt);
    bt = setTimeout(() => {
      try { const c = runChecks(M(), D()), n = c.filter((x) => x.lvl !== 'info').length, b = tabs.checks.btn; b.textContent = 'Checks'; if (n) b.appendChild(h('span', { class: 'badge' + (c.some((x) => x.lvl === 'err') ? ' err' : ''), text: String(n) })); } catch (e) { /* ignore */ }
    }, 500);
  }
  let pending = false;
  function refresh() { if (pending) return; pending = true; badge(); (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout)(() => { pending = false; try { tabs[current].render(); } catch (e) { console.error(e); tabs[current].el.textContent = 'Error: ' + e.message; } }); }
  show('props');
  return { el: root, refresh, show, tabs, get current() { return current; } };
}
export { printChecks, buildDXF, utf8 };
