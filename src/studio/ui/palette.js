// The colour and material palette. Swatches can be dragged onto a surface in the 3D view, or clicked to pick a brush.
// Imported .skm files and images appear under "Imported". The same palette is used in the side tab and in the 3D view.
import { h, clear } from './dom.js';
import { PALETTE, matFill, removeMaterial } from '../model/materials.js';
import { MATERIAL_ACCEPT } from '../io/skm.js';

const swatchStyle = (m) => (m.tex ? 'background-image:url(' + m.tex + ');background-size:cover;background-color:' + m.color : 'background:' + m.color);

export function buildPalette(app, opts = {}) {
  const store = app.store, st = app.state, el = h('div', { class: 'st-pal' + (opts.compact ? ' compact' : '') });
  const brush = () => (st.brush = st.brush || { fill: null, whole: false });
  let dragging = false;

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
  const file = h('input', { type: 'file', accept: MATERIAL_ACCEPT, multiple: true, hidden: true, onchange: (e) => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) app.importFiles(f); } });

  function refresh() {
    if (dragging) return; clear(el); const mats = store.p.materials || [], b = brush();
    el.appendChild(h('div', { class: 'st-small', text: 'Drag a swatch onto a wall in 3D. Or click a swatch, then click surfaces with the Paint tool. With something selected, a click colours the selection.' }));
    el.appendChild(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: b.whole, onchange: (e) => { b.whole = e.target.checked; } }), ' Paint both faces of a wall (otherwise only the face you click)'));
    el.appendChild(h('div', { class: 'st-swatches' }, PALETTE.map(([name, hex]) => swatch(hex, name, 'background:' + hex))));
    const cust = h('input', { type: 'color', class: 'st-color', value: /^#[0-9a-f]{6}$/i.test(b.fill || '') ? b.fill : '#d9c7a4', title: 'Any colour' });
    cust.addEventListener('change', () => pick(cust.value));
    el.appendChild(h('div', { class: 'st-row2' }, h('span', { text: 'Custom colour' }), cust, h('button', { class: 'st-btn', text: 'Default colour', title: 'Remove the colour from the selection', onclick: () => { if (store.selection.length && app.paint) app.paint(store.selection.slice(), null, 'all'); else app.toast('Select something first.'); } })));
    el.appendChild(h('b', { class: 'st-gap', text: 'Imported materials' }));
    el.appendChild(h('div', { class: 'st-swatches' }, mats.map((m) => swatch(matFill(m.id), m.name, swatchStyle(m)))));
    if (!mats.length) el.appendChild(h('div', { class: 'st-small', text: 'None yet. Import SketchUp materials (.skm) or images, or drop the files on the 3D view.' }));
    el.appendChild(h('div', { class: 'st-row2' }, h('button', { class: 'st-btn pri', text: 'Import .skm or image…', onclick: () => file.click() }), file));
    const cur = mats.find((m) => matFill(m.id) === b.fill);
    if (cur) {
      const num = (i) => h('input', { class: 'st-in sm', value: String(cur.tile[i]), onchange: (e) => { const v = parseFloat(e.target.value); if (!(v > 0)) { e.target.value = cur.tile[i]; return; } store.transact('Material size', (p) => { const m = p.materials.find((x) => x.id === cur.id); m.tile = m.tile.slice(); m.tile[i] = v; }, { coalesce: 'mt' + cur.id + i }); } });
      el.appendChild(h('div', { class: 'st-card' },
        h('div', { class: 'st-row2' }, h('input', { class: 'st-in', value: cur.name, onchange: (e) => store.transact('Rename material', (p) => { p.materials.find((x) => x.id === cur.id).name = e.target.value || cur.name; }) }), h('button', { class: 'st-btn danger sm', text: 'Remove', onclick: () => { b.fill = null; store.transact('Remove material', (p) => removeMaterial(p, cur.id)); } })),
        h('div', { class: 'st-row2' }, h('span', { text: 'One image covers' }), num(0), h('span', { text: '×' }), num(1), h('span', { class: 'st-unit', text: 'ft' }))));
    }
  }
  const unsub = store.on('change', () => { if (el.isConnected !== false) refresh(); });
  refresh();
  return { el, refresh, destroy: unsub };
}
