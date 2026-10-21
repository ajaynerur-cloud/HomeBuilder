// The colour and material palette. Swatches can be dragged onto a surface in the 3D view, or clicked to pick a brush.
// Imported .skm files and images appear under "Imported". The same palette is used in the side tab and in the 3D view.
import { h, clear } from './dom.js';
import { PALETTE, matFill, removeMaterial } from '../model/materials.js';
import { MATERIAL_ACCEPT } from '../io/skm.js';

const swatchStyle = (m) => (m.tex ? 'background-image:url(' + m.tex + ');background-size:cover;background-color:' + m.color : 'background:' + m.color);

export function buildPalette(app, opts = {}) {
  const store = app.store, st = app.state, el = h('div', { class: 'st-pal' + (opts.compact ? ' compact' : '') });
  const brush = () => (st.brush = st.brush || { fill: null, whole: false });
  let dragging = false, query = '';

  const pick = (fill) => {
    brush().fill = fill; const v3 = app.view3d, inSelect = !v3 || !v3.ok || v3.edit.mode === 'select';
    if (inSelect && store.selection.length && app.paint) { app.paint(store.selection.slice(), fill, 'all'); app.toast('Colour applied to ' + store.selection.length + ' selected object' + (store.selection.length > 1 ? 's' : '') + '.'); }
    else if (v3 && v3.ok) { v3.edit.setMode('paint'); app.toast('Click a surface in 3D to paint it. Alt-click paints the whole wall.'); }
    refresh();
  };
  const swatch = (fill, name, style) => h('div', {
    class: 'st-sw' + (brush().fill === fill ? ' on' : ''), title: name + ' (drag onto a wall, or click)', style, draggable: 'true', role: 'button', tabindex: '0',
    onclick: () => pick(fill), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(fill); } },
    ondragstart: (e) => { dragging = true; brush().fill = fill; if (e.dataTransfer) { e.dataTransfer.setData('application/x-chp-fill', fill); e.dataTransfer.setData('text/plain', name); e.dataTransfer.effectAllowed = 'copy'; } },
    ondragend: () => { dragging = false; refresh(); },
  });
  const onFiles = (e) => { const f = Array.from(e.target.files || []).filter((x) => /\.(skm|zip|jpe?g|png|webp|gif|bmp)$/i.test(x.name)); e.target.value = ''; if (f.length) app.importFiles(f); };
  const file = h('input', { type: 'file', accept: MATERIAL_ACCEPT, multiple: true, hidden: true, onchange: onFiles });
  const folderIn = h('input', { type: 'file', multiple: true, hidden: true, onchange: onFiles }); folderIn.setAttribute('webkitdirectory', '');

  let refresh = null;
  function refreshImpl(keepFocus) {
    if (dragging) return; clear(el); const mats = store.p.materials || [], b = brush();
    el.appendChild(h('div', { class: 'st-small', text: 'Drag a swatch onto a wall in 3D. Or click a swatch, then click surfaces with the Paint tool. With something selected, a click colours the selection.' }));
    el.appendChild(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: b.whole, onchange: (e) => { b.whole = e.target.checked; } }), ' Paint both faces of a wall (otherwise only the face you click)'));
    el.appendChild(h('div', { class: 'st-swatches' }, PALETTE.map(([name, hex]) => swatch(hex, name, 'background:' + hex))));
    const cust = h('input', { type: 'color', class: 'st-color', value: /^#[0-9a-f]{6}$/i.test(b.fill || '') ? b.fill : '#d9c7a4', title: 'Any colour' });
    cust.addEventListener('change', () => pick(cust.value));
    el.appendChild(h('div', { class: 'st-row2' }, h('span', { text: 'Custom colour' }), cust, h('button', { class: 'st-btn', text: 'Default colour', title: 'Remove the colour from the selection', onclick: () => { if (store.selection.length && app.paint) app.paint(store.selection.slice(), null, 'all'); else app.toast('Select something first.'); } })));
    el.appendChild(h('b', { class: 'st-gap', text: 'Imported materials' + (mats.length ? ' (' + mats.length + ')' : '') }));
    const q = query.trim().toLowerCase(), shown = mats.filter((m) => !q || (m.name + ' ' + (m.file || '') + ' ' + (m.group || '')).toLowerCase().includes(q));
    if (mats.length > 3 || q) { const si = h('input', { class: 'st-in', type: 'search', placeholder: 'Search by name or file', value: query, 'aria-label': 'Search materials' }); si.addEventListener('input', () => { query = si.value; refresh(true); }); el.appendChild(si); }
    const groups = {}; shown.forEach((m) => { (groups[m.group || 'Imported files'] = groups[m.group || 'Imported files'] || []).push(m); });
    Object.keys(groups).sort().forEach((g) => {
      const items = groups[g], det = h('details', { class: 'st-matgroup', open: !!q || Object.keys(groups).length === 1 || items.some((m) => matFill(m.id) === b.fill) }, h('summary', { text: g + ' (' + items.length + ')' }));
      items.forEach((m) => det.appendChild(h('div', { class: 'st-matrow' + (b.fill === matFill(m.id) ? ' on' : '') }, swatch(matFill(m.id), m.name, swatchStyle(m)), h('span', { class: 'st-matname', title: m.file || m.name, onclick: () => pick(matFill(m.id)) }, h('b', { text: m.name }), m.file && m.file !== m.name ? h('small', { text: m.file }) : null))));
      el.appendChild(det);
    });
    if (mats.length && !shown.length) el.appendChild(h('div', { class: 'st-small', text: 'Nothing matches "' + query + '".' }));
    if (!mats.length) el.appendChild(h('div', { class: 'st-small', text: 'None yet. Import SketchUp materials (.skm), a zip of them, a folder, or images, or drop the files on the 3D view.' }));
    el.appendChild(h('div', { class: 'st-row2 wrap' }, h('button', { class: 'st-btn pri', text: 'Import files…', onclick: () => file.click() }), h('button', { class: 'st-btn', text: 'Import folder…', title: 'Every .skm and image in the folder; the folder name becomes the group', onclick: () => folderIn.click() }), file, folderIn));
    const cur = mats.find((m) => matFill(m.id) === b.fill);
    if (cur) {
      const num = (i) => h('input', { class: 'st-in sm', value: String(cur.tile[i]), onchange: (e) => { const v = parseFloat(e.target.value); if (!(v > 0)) { e.target.value = cur.tile[i]; return; } store.transact('Material size', (p) => { const m = p.materials.find((x) => x.id === cur.id); m.tile = m.tile.slice(); m.tile[i] = v; }, { coalesce: 'mt' + cur.id + i }); } });
      el.appendChild(h('div', { class: 'st-card' },
        h('div', { class: 'st-row2' }, h('input', { class: 'st-in', value: cur.name, onchange: (e) => store.transact('Rename material', (p) => { p.materials.find((x) => x.id === cur.id).name = e.target.value || cur.name; }) }), h('button', { class: 'st-btn danger sm', text: 'Remove', onclick: () => { b.fill = null; store.transact('Remove material', (p) => removeMaterial(p, cur.id)); } })),
        h('div', { class: 'st-row2' }, h('span', { text: 'One image covers' }), num(0), h('span', { text: '×' }), num(1), h('span', { class: 'st-unit', text: 'ft' }))));
    }
  }
  const afterSearch = () => { const si = el.querySelector('input[type=search]'); if (si && query) { si.focus(); si.setSelectionRange(si.value.length, si.value.length); } };
  const _r = refreshImpl; refresh = function (k) { _r(k); if (k) afterSearch(); };
  const unsub = store.on('change', () => { if (el.isConnected !== false) refresh(); });
  refresh();
  return { el, refresh, destroy: unsub };
}
