import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '../dist/courtyard_house_planner.html'), 'utf8').replace(/<script src="[^"]*three[^"]*"><\/script>/, '');
const THREE = await import('three');

function boot() {
  const errs = []; const vc = new VirtualConsole(); vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(e.message)) errs.push(e.message); }); vc.on('error', (e) => errs.push(String(e)));
  const saved = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc, beforeParse(w) { w.TextEncoder = globalThis.TextEncoder; w.TextDecoder = globalThis.TextDecoder;
    w.THREE = THREE; w.print = () => {}; w.URL.createObjectURL = (b) => { saved.push(b); return 'blob:x'; }; w.URL.revokeObjectURL = () => {};
    const ctx = new Proxy({}, { get: (t, k) => { if (k === 'canvas') return {}; if (!(k in t)) t[k] = () => undefined; return t[k]; }, set: (t, k, v) => { t[k] = v; return true; } });
    w.HTMLCanvasElement.prototype.getContext = function () { return this.className && /st-canvas/.test(this.className) ? ctx : null; };
    w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  } });
  return { dom, w: dom.window, d: dom.window.document, errs, saved };
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const ptr = (w, el, type, x, y, extra = {}) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra }));
const key = (w, el, k, extra = {}) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));

test('the planner is untouched and Studio opens from the new tab', async (t) => {
  const { w, d, errs } = boot(); t.after(() => w.close()); await tick(700);
  assert.ok(d.getElementById('topnav')); assert.ok(d.getElementById('area'), 'planner controls exist'); assert.ok(w.__ed && w.__core, 'planner hooks exist');
  assert.equal(d.querySelector('.app').hidden, false);
  click(w, d.querySelector('#topnav [data-view="studio"]')); await tick(300);
  assert.equal(d.querySelector('.app').hidden, true); assert.equal(d.getElementById('studioRoot').hidden, false);
  assert.ok(w.__studio, 'studio started'); assert.ok(d.querySelector('.st-app'));
  click(w, d.querySelector('#topnav [data-view="planner"]')); await tick(100); assert.equal(d.querySelector('.app').hidden, false);
  assert.deepEqual(errs, []);
});

test('draw walls, openings and rooms with pointer events', async (t) => {
  const { w, d, errs } = boot(); t.after(() => w.close()); await tick(700);
  click(w, d.querySelector('#topnav [data-view="studio"]')); await tick(300);
  const S = w.__studio, app = S.app, store = S.store, v = app.view2d, cv = v.canvas;
  store.replace(JSON.parse(JSON.stringify(store.p)));            // fresh undo history
  const at = (x, y) => { const s = v.toScreen([x, y]); return s; };
  app.state.snap.grid = true; v.cam = { x: 6, y: 5, scale: 20 };
  app.setTool('rect'); let s = at(0, 0); ptr(w, cv, 'pointerdown', s[0], s[1]); s = at(14, 10); ptr(w, cv, 'pointermove', s[0], s[1]); ptr(w, cv, 'pointerdown', s[0], s[1]); await tick(50);
  assert.equal(store.p.walls.length, 4);
  app.setTool('wall'); s = at(7, 0); ptr(w, cv, 'pointerdown', s[0], s[1]); s = at(7, 10); ptr(w, cv, 'pointermove', s[0], s[1]); ptr(w, cv, 'pointerdown', s[0], s[1]); key(w, cv, 'Escape'); await tick(50);
  assert.equal(store.p.walls.length, 5);
  // typed length: 5 then Enter
  s = at(0, 0); app.setTool('wall'); ptr(w, cv, 'pointerdown', s[0], s[1]); s = at(3, 0); ptr(w, cv, 'pointermove', s[0], s[1]); '4'.split('').forEach((k) => key(w, cv, k)); key(w, cv, 'Enter'); key(w, cv, 'Escape'); await tick(20);
  const last = store.p.walls[store.p.walls.length - 1]; assert.ok(last, JSON.stringify(last));
  store.undo(); assert.equal(store.p.walls.length, 5);
  // doors and windows
  app.setTool('door'); s = at(3.5, 0); ptr(w, cv, 'pointermove', s[0], s[1]); ptr(w, cv, 'pointerdown', s[0], s[1]);
  app.setTool('window'); s = at(10.5, 10); ptr(w, cv, 'pointermove', s[0], s[1]); ptr(w, cv, 'pointerdown', s[0], s[1]);
  assert.equal(store.p.openings.length, 2); assert.equal(store.p.openings[0].kind, 'door'); assert.equal(store.p.openings[1].kind, 'window');
  // room label
  app.setTool('room'); s = at(3, 5); ptr(w, cv, 'pointerdown', s[0], s[1]); assert.equal(store.p.rooms.length, 1);
  assert.ok(store.selection.length === 1); await tick(60);
  assert.ok(d.querySelector('.st-panels input'), 'properties panel shows fields');
  // select and delete
  app.setTool('select'); s = at(7, 5); ptr(w, cv, 'pointerdown', s[0], s[1]); ptr(w, cv, 'pointerup', s[0], s[1]); assert.deepEqual(Array.from(store.selection), ['w5']);
  key(w, cv, 'Delete'); assert.equal(store.p.walls.length, 4); store.undo(); assert.equal(store.p.walls.length, 5);
  // box select then move by drag
  s = at(-2, -2); ptr(w, cv, 'pointerdown', s[0], s[1]); s = at(16, 12); ptr(w, cv, 'pointermove', s[0], s[1]); ptr(w, cv, 'pointerup', s[0], s[1]); assert.ok(store.selection.length >= 5, String(store.selection.length));
  const before = JSON.stringify(store.p.walls[0]); key(w, cv, 'ArrowRight'); assert.notEqual(JSON.stringify(store.p.walls[0]), before);
  store.undo();
  // wall end grip drag stretches the joined wall too
  store.select(['w5']); s = at(7, 10); const s2 = at(7, 12); ptr(w, cv, 'pointerdown', s[0], s[1]); ptr(w, cv, 'pointermove', s2[0], s2[1]); ptr(w, cv, 'pointerup', s2[0], s2[1]);
  assert.equal(store.p.walls.find((x) => x.id === 'w5').by, 12);
  assert.equal(store.undoStack.filter((e) => e.label === 'Edit').length >= 1, true);
  assert.deepEqual(errs, []);
});

test('panels, engineering, schedules, checks and print export', async (t) => {
  const { w, d, errs, saved } = boot(); t.after(() => w.close()); await tick(700);
  click(w, d.querySelector('#topnav [data-view="studio"]')); await tick(300);
  const S = w.__studio, app = S.app, store = S.store;
  // build a house through the model API the tools use
  const GEN = null; void GEN;
  store.transact('Seed', (p) => {
    const ids = []; const W = (a, b, t) => { const id = 'w' + p.nextId++; p.walls.push({ id, level: 'L0', ax: a[0], ay: a[1], bx: b[0], by: b[1], t, h: '=storey', layer: 'A-WALL', mat: 'brick' }); return id; };
    const a = W([0, 0], [24, 0], '=wallOut'), b = W([24, 0], [24, 16], '=wallOut'), c = W([24, 16], [0, 16], '=wallOut'), e = W([0, 16], [0, 0], '=wallOut'), m = W([12, 0], [12, 16], '=wallIn');
    p.openings.push({ id: 'o' + p.nextId++, wall: a, pos: 6, kind: 'window', w: '=winW', h: '=winH', sill: '=winSill' }, { id: 'o' + p.nextId++, wall: a, pos: 18, kind: 'door', w: '=doorW', h: '=doorH', sill: 0 }, { id: 'o' + p.nextId++, wall: m, pos: 8, kind: 'door', w: '=doorW', h: '=doorH', sill: 0 }, { id: 'o' + p.nextId++, wall: c, pos: 6, kind: 'window', w: '=winW', h: '=winH', sill: '=winSill' });
    p.rooms.push({ id: 'm' + p.nextId++, level: 'L0', x: 6, y: 8, name: 'Living', type: 'living' }, { id: 'm' + p.nextId++, level: 'L0', x: 18, y: 8, name: 'Bed', type: 'bed' });
    p.roofs.push({ id: 'r' + p.nextId++, level: 'L0', x0: 0, y0: 0, x1: 24, y1: 16, type: 'hip', pitch: 22, over: 2 });
  });
  const P = app.panels;
  P.show('params'); store.transact('param', (p) => { p.params.find((x) => x.name === 'wallIn').v = 0.5; }); await tick(40);
  assert.equal(store.p.params.find((x) => x.name === 'wallIn').v, 0.5);
  assert.equal(S.store.p.walls.find((x) => x.id === 'w5').t, '=wallIn');         // linked to the parameter, not a copy
  P.show('levels'); click(w, [...d.querySelectorAll('.st-tabbody button')].find((b) => b.textContent === 'Add level above')); await tick(40);
  assert.equal(store.p.levels.length, 2); assert.equal(store.p.activeLevel, 'L1'); app.setLevel('L0');
  P.show('eng'); click(w, [...d.querySelectorAll('.st-tabbody button')].find((b) => b.textContent === 'Generate frame')); await tick(40);
  assert.ok(store.p.columns.length >= 8, String(store.p.columns.length)); assert.ok(store.p.footings.length >= 8);
  click(w, [...d.querySelectorAll('.st-tabbody button')].find((b) => b.textContent === 'Size footings from loads')); await tick(40);
  P.show('sched'); await tick(40); assert.ok(d.querySelector('.st-table')); ['Doors, windows', 'Structure', 'Quantities', 'Rooms'].forEach((n) => { click(w, [...d.querySelectorAll('.st-seg button')].find((b) => b.textContent === n)); assert.ok(d.querySelector('.st-tabbody .st-table, .st-hint')); });
  P.show('checks'); await tick(40); assert.ok(d.querySelector('.st-note, .st-card.ok'));
  P.show('print'); await tick(100); const txt = d.querySelector('.st-tabbody').textContent; assert.match(txt, /Print preview/); assert.match(txt, /closed solid|not closed/);
  const btn = (n) => [...d.querySelectorAll('.st-tabbody button')].find((b) => b.textContent.indexOf(n) === 0);
  click(w, btn('STL (one file)')); click(w, btn('3MF')); click(w, btn('STL, each part')); click(w, btn('OBJ')); await tick(50);
  assert.ok(saved.length >= 4, 'files produced: ' + saved.length); assert.ok(saved.every((b) => b.size > 100));
  // export menu
  const menuBtns = [...d.querySelectorAll('.st-menuitems .st-btn')]; click(w, menuBtns.find((b) => /DXF, this level/.test(b.textContent))); click(w, menuBtns.find((b) => /Quantities/.test(b.textContent))); await tick(30);
  assert.ok(saved.length >= 6);
  // 3D bar is wired without WebGL
  assert.ok(d.querySelector('.st-bar3 button')); assert.equal(app.view3d.ok, false);
  assert.deepEqual(errs, []);
});

test('import from planner brings the layout into Studio', async (t) => {
  const { w, d, errs } = boot(); t.after(() => w.close()); await tick(700);
  click(w, d.querySelector('#topnav [data-view="studio"]')); await tick(300);
  const S = w.__studio; w.confirm = () => true;
  S.importFromPlanner(); await tick(80);
  const p = S.store.p; assert.ok(p.walls.length > 25, String(p.walls.length)); assert.ok(p.openings.length >= 12); assert.ok(p.rooms.length >= 8); assert.ok(p.roofs.length >= 1); assert.ok(p.slabs.length === 1);
  const rooms = [...d.querySelectorAll('.st-tabbody')]; assert.ok(rooms.length);
  w.__studio.app.panels.show('sched'); await tick(60); assert.match(d.querySelector('.st-tabbody').textContent, /Master bedroom/);
  // the planner still works after the import
  // a second import asks first, using the in-page dialog (not confirm)
  const n0 = p.walls.length; S.importFromPlanner(); await tick(30);
  const dlg = [...d.querySelectorAll('.st-keys')].find((x) => !x.hidden && x.querySelector('.st-btn.pri')); assert.ok(dlg, 'dialog opened'); assert.equal(S.store.p.walls.length, n0);
  click(w, dlg.querySelector('.st-btn.pri')); await tick(60); assert.ok(S.store.p.walls.length > 25); assert.ok(dlg.hidden);
  const newBtn = [...d.querySelectorAll('.st-top .st-btn')].find((b) => b.textContent === 'New'); click(w, newBtn); await tick(20);
  const dlg2 = [...d.querySelectorAll('.st-keys')].find((x) => !x.hidden && x.querySelector('.st-btn.pri')); assert.ok(dlg2); click(w, dlg2.querySelector('.st-btn.pri')); await tick(40);
  assert.equal(S.store.p.walls.length, 0);
  const area = d.getElementById('area'); area.value = '900'; area.dispatchEvent(new w.Event('input', { bubbles: true })); await tick(300);
  assert.deepEqual(errs, []);
});

test('the uncluttered layout: icon rail, menus, empty state, six tabs, badge, side panel', async (t) => {
  const { w, d, errs } = boot(); t.after(() => w.close()); await tick(700);
  click(w, d.querySelector('#topnav [data-view="studio"]')); await tick(300);
  const S = w.__studio, app = S.app, store = S.store;
  // rail: one icon button per tool, no text labels
  const tools = [...d.querySelectorAll('.st-tools .st-tool')]; assert.equal(tools.length, 17);
  assert.ok(tools.every((b) => b.querySelector('svg') && b.textContent.trim() === '' && b.title), 'icons only, with tooltips');
  // few buttons in the top bar: menus hold the rest
  const topItems = [...d.querySelectorAll('.st-top > *')]; assert.ok(topItems.length <= 14, 'top bar items: ' + topItems.length);
  // empty state shows, then goes when something is drawn
  assert.equal(d.querySelector('.st-empty').hidden, false);
  store.transact('w', (p) => { p.walls.push({ id: 'w1', level: 'L0', ax: 0, ay: 0, bx: 10, by: 0, t: 0.5, h: 10 }); p.nextId = 2; }); await tick(40);
  assert.equal(d.querySelector('.st-empty').hidden, true);
  // menus open and close on an outside click
  const fileMenu = d.querySelector('.st-top .st-menu'); fileMenu.open = true; assert.ok(fileMenu.open);
  d.body.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); assert.equal(fileMenu.open, false);
  fileMenu.open = true; const items = [...fileMenu.querySelectorAll('.st-btn')].map((b) => b.textContent); ['New', 'Open', 'Import from planner'].forEach((x) => assert.ok(items.some((i) => i.indexOf(x) === 0), x));
  click(w, [...fileMenu.querySelectorAll('.st-btn')].find((b) => b.textContent === 'Save project (.json)')); assert.equal(fileMenu.open, false);
  // exactly six tabs, aliases still work, badge appears for a door-less room
  const tabs = [...d.querySelectorAll('.st-tabs button')]; assert.equal(tabs.length, 6); assert.deepEqual(tabs.map((b) => b.textContent.replace(/\d+$/, '')), ['Properties', 'Project', 'Schedules', 'Checks', 'Structure', 'Print']);
  app.panels.show('params'); assert.equal(app.panels.current, 'project'); assert.ok(d.querySelector('.st-sec[open] .st-table'));
  store.transact('box', (p) => { p.walls.push({ id: 'w9', level: 'L0', ax: 10, ay: 0, bx: 10, by: 8, t: 0.5, h: 10 }, { id: 'w10', level: 'L0', ax: 10, ay: 8, bx: 0, by: 8, t: 0.5, h: 10 }, { id: 'w11', level: 'L0', ax: 0, ay: 8, bx: 0, by: 0, t: 0.5, h: 10 }); p.rooms.push({ id: 'm20', level: 'L0', x: 5, y: 4, name: 'Bed', type: 'bed' }); p.nextId = 30; });
  await tick(900); assert.ok(d.querySelector('.st-tabs .badge'), 'check badge'); 
  // snap menu is wired to the state, side panel collapses
  const chk = d.querySelector('.st-optsr .st-menuitems input'); chk.checked = false; chk.dispatchEvent(new w.Event('change', { bubbles: true })); assert.equal(app.state.snap.grid, false);
  click(w, d.querySelector('.st-top .st-btn[aria-label="Side panel"]')); assert.ok(d.querySelector('.st-body').classList.contains('noside'));
  click(w, d.querySelector('.st-top .st-btn[aria-label="Side panel"]')); assert.ok(!d.querySelector('.st-body').classList.contains('noside'));
  // options bar shows the tool name and its options only
  app.setTool('wall'); assert.match(d.querySelector('.st-toolname').textContent, /Wall/); assert.ok(d.querySelector('.st-optsl select'));
  app.setTool('select'); assert.equal(d.querySelectorAll('.st-optsl select').length, 0);
  assert.deepEqual(errs, []);
});
