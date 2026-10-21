// Plan workspace for the Planner: the floor plan (or 3D model) fills the window, with drawing tools and design settings
// in a side panel that scrolls on its own. Nodes are moved, not copied, so every existing control keeps working.
const $ = (id) => document.getElementById(id);
function el(tag, attrs, ...kids) { const e = document.createElement(tag); Object.entries(attrs || {}).forEach(([k, v]) => { if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }); kids.forEach((c) => c && e.appendChild(c)); return e; }
export function setupPlanWorkspace() {
  const plan = $('plan'), v3d = $('v3d'), controls = document.querySelector('.app .controls'); if (!plan || !v3d || !controls) return null;
  const planCard = plan.closest('.card'), v3dCard = v3d.closest('.card'), moved = ['editBar', 'planTools', 'planHint', 'legend'].map($).filter(Boolean);
  const state = { open: false, view: 'plan', marks: new Map() };
  // ---------- overlay
  const tabEdit = el('button', { type: 'button', class: 'on', text: 'Drawing tools', onclick: () => sideTab('edit') }), tabDesign = el('button', { type: 'button', text: 'Design settings', onclick: () => sideTab('design') });
  const paneEdit = el('div', { class: 'pw-pane' }), paneDesign = el('div', { class: 'pw-pane', hidden: '' });
  const vPlan = el('button', { type: 'button', class: 'on', text: 'Floor plan', onclick: () => showView('plan') }), v3dB = el('button', { type: 'button', text: '3D model', onclick: () => showView('3d') });
  const sideB = el('button', { type: 'button', class: 'b', text: 'Hide panel', title: 'Give the plan the whole window', onclick: () => { ov.classList.toggle('pw-noside'); sideB.textContent = ov.classList.contains('pw-noside') ? 'Show panel' : 'Hide panel'; refit(); } });
  const fsB = el('button', { type: 'button', class: 'b', text: 'Full screen', onclick: () => fullScreen() }), winB = el('button', { type: 'button', class: 'b', text: 'New window', title: 'Open the planner in its own window, straight into this workspace', onclick: () => newWindow() });
  const main = el('div', { class: 'pw-main' }), note = el('div', { class: 'pw-note', hidden: '' });
  const ov = el('div', { class: 'pw', hidden: '', role: 'dialog', 'aria-label': 'Plan workspace' },
    el('div', { class: 'pw-top' }, el('b', { text: 'Plan workspace' }), el('div', { class: 'seg pw-seg' }, vPlan, v3dB), el('span', { class: 'pw-grow' }), sideB, fsB, winB, el('button', { type: 'button', class: 'b pw-close', text: 'Close  (Esc)', onclick: () => close() })),
    el('div', { class: 'pw-body' }, el('aside', { class: 'pw-side' }, el('div', { class: 'seg pw-tabs' }, tabEdit, tabDesign), paneEdit, paneDesign), main), note);
  document.body.appendChild(ov);
  // ---------- entry buttons on the cards
  const head = (card, label, fn, extra) => { const h2 = card.querySelector('h2'); if (!h2) return; const bar = el('div', { class: 'pw-entry' }, el('button', { type: 'button', class: 'b pri', text: label, onclick: fn }), extra || null); h2.insertAdjacentElement('afterend', bar); };
  head(planCard, 'Open plan workspace', () => open('plan'), el('button', { type: 'button', class: 'b', text: 'New window', title: 'Open the plan in its own browser window', onclick: () => newWindow() }));
  head(v3dCard, 'Expand 3D', () => open('3d'));
  // ---------- moving nodes in and out
  function park(node, into) { if (!state.marks.has(node)) { const m = document.createComment('pw'); node.parentNode.insertBefore(m, node); state.marks.set(node, m); } into.appendChild(node); }
  function unpark(node) { const m = state.marks.get(node); if (m && m.parentNode) { m.parentNode.insertBefore(node, m); m.remove(); } state.marks.delete(node); }
  const refit = () => setTimeout(() => { window.dispatchEvent(new Event('resize')); const f = $('pFit'); if (f && state.view === 'plan') f.click(); }, 30);
  function sideTab(k) { paneEdit.hidden = k !== 'edit'; paneDesign.hidden = k !== 'design'; tabEdit.classList.toggle('on', k === 'edit'); tabDesign.classList.toggle('on', k === 'design'); }
  function showView(k) {
    state.view = k; vPlan.classList.toggle('on', k === 'plan'); v3dB.classList.toggle('on', k === '3d');
    if (k === 'plan') { if (state.marks.has(v3d)) unpark(v3d); park(plan, main); } else { if (state.marks.has(plan)) unpark(plan); park(v3d, main); }
    ov.classList.toggle('pw-3d', k === '3d'); refit();
  }
  function open(k) {
    if (state.open) { showView(k); return; } state.open = true; moved.forEach((n) => park(n, paneEdit)); park(controls, paneDesign);
    ov.hidden = false; document.body.classList.add('planfocus'); showView(k || 'plan'); sideTab(k === '3d' ? 'design' : 'edit');
  }
  function close() {
    if (!state.open) return; if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    [...state.marks.keys()].forEach(unpark); state.open = false; ov.hidden = true; document.body.classList.remove('planfocus'); ov.classList.remove('pw-noside'); sideB.textContent = 'Hide panel'; refit();
  }
  function fullScreen() { const req = ov.requestFullscreen || ov.webkitRequestFullscreen; if (document.fullscreenElement) { document.exitFullscreen(); return; } if (!req) { flash('Full screen is not available here. The workspace already fills the window.'); return; } Promise.resolve(req.call(ov)).catch(() => flash('This page is not allowed to go full screen here. The workspace already fills the window.')); }
  function newWindow() {
    let w = null; try { w = window.open(location.href.split('#')[0] + '#planwindow', '_blank', 'width=1280,height=860'); } catch (e) { w = null; }
    if (!w) { open('plan'); flash('The browser blocked a new window, so the plan opened here, filling the window.'); } else flash('The plan opened in a new window. Both windows share the saved design.');
  }
  let flashT = null; function flash(t) { note.textContent = t; note.hidden = false; clearTimeout(flashT); flashT = setTimeout(() => { note.hidden = true; }, 4500); }
  document.addEventListener('keydown', (e) => { if (state.open && e.key === 'Escape' && !/INPUT|SELECT|TEXTAREA/.test((e.target && e.target.tagName) || '')) close(); });
  // another window changed the design: offer to reload this one
  window.addEventListener('storage', (e) => { if (e.key !== 'chp_state_v7' || document.getElementById('pwSync')) return; const bar = el('div', { id: 'pwSync', class: 'pw-sync' }, el('span', { text: 'This design was changed in another window.' }), el('button', { type: 'button', class: 'b pri', text: 'Reload to update', onclick: () => location.reload() }), el('button', { type: 'button', class: 'b', text: 'Dismiss', onclick: () => bar.remove() })); document.body.appendChild(bar); });
  if (location.hash === '#planwindow') setTimeout(() => open('plan'), 60);
  return { open, close, showView, get isOpen() { return state.open; }, overlay: ov };
}
