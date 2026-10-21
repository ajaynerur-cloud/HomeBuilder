// The project lives here. Every edit goes through transact() so undo and redo always work.
import { Emitter } from './emitter.js';

export class Store extends Emitter {
  constructor(project) {
    super();
    this.p = project; this.undoStack = []; this.redoStack = []; this.rev = 0;
    this.selection = []; this.lastCoalesce = null; this.lastTime = 0;
  }
  get project() { return this.p; }
  nid(prefix) { return prefix + (this.p.nextId++); }
  transact(label, fn, opts = {}) {
    const before = JSON.stringify(this.p);
    fn(this.p);
    const after = JSON.stringify(this.p);
    if (before === after) return false;
    const now = Date.now();
    const merge = opts.coalesce && this.lastCoalesce === opts.coalesce && now - this.lastTime < 900 && this.undoStack.length;
    if (!merge) { this.undoStack.push({ label, snap: before }); if (this.undoStack.length > 150) this.undoStack.shift(); }
    this.lastCoalesce = opts.coalesce || null; this.lastTime = now;
    this.redoStack = []; this.rev++;
    this._prune();
    this.emit('change', { label });
    return true;
  }
  _prune() { const ids = new Set(this.allIds()); const keep = this.selection.filter((i) => ids.has(i)); if (keep.length !== this.selection.length) { this.selection = keep; this.emit('selection', keep); } }
  allIds() {
    const p = this.p, out = [];
    ['walls', 'openings', 'columns', 'beams', 'footings', 'slabs', 'roofs', 'stairs', 'dims', 'texts', 'rooms'].forEach((k) => (p[k] || []).forEach((o) => out.push(o.id)));
    return out;
  }
  undo() {
    const e = this.undoStack.pop(); if (!e) return false;
    this.redoStack.push({ label: e.label, snap: JSON.stringify(this.p) });
    this.p = JSON.parse(e.snap); this.rev++; this.lastCoalesce = null; this._prune(); this.emit('change', { label: 'Undo ' + e.label }); return true;
  }
  redo() {
    const e = this.redoStack.pop(); if (!e) return false;
    this.undoStack.push({ label: e.label, snap: JSON.stringify(this.p) });
    this.p = JSON.parse(e.snap); this.rev++; this.lastCoalesce = null; this._prune(); this.emit('change', { label: 'Redo ' + e.label }); return true;
  }
  replace(project) { this.p = project; this.undoStack = []; this.redoStack = []; this.rev++; this.selection = []; this.emit('change', { label: 'Open' }); this.emit('selection', []); }
  setActive(id) { if (this.p.activeLevel === id) return; this.p.activeLevel = id; this.rev++; this.emit('change', { label: 'Level', quiet: true }); }
  select(ids, add) {
    ids = [].concat(ids || []);
    this.selection = add ? [...new Set([...this.selection, ...ids])] : ids;
    this.emit('selection', this.selection);
  }
  toggle(id) { this.select(this.selection.includes(id) ? this.selection.filter((i) => i !== id) : [...this.selection, id]); }
  find(id) {
    const p = this.p;
    for (const k of ['walls', 'openings', 'columns', 'beams', 'footings', 'slabs', 'roofs', 'stairs', 'dims', 'texts', 'rooms']) {
      const o = (p[k] || []).find((x) => x.id === id); if (o) return { kind: k, obj: o };
    }
    return null;
  }
}
