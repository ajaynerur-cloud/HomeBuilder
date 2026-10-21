// Project state with snapshot undo and redo.
import { Emitter } from '../studio/core/emitter.js';

export class FieldStore extends Emitter {
  constructor(project) { super(); this.p = project; this.undoStack = []; this.redoStack = []; this.rev = 0; this.sel = null; this.last = null; this.t = 0; }
  transact(label, fn, opts = {}) {
    const before = JSON.stringify(this.p); fn(this.p); const after = JSON.stringify(this.p);
    if (before === after) return false;
    const now = Date.now(), merge = opts.coalesce && this.last === opts.coalesce && now - this.t < 900 && this.undoStack.length;
    if (!merge) { this.undoStack.push({ label, snap: before }); if (this.undoStack.length > 120) this.undoStack.shift(); }
    this.last = opts.coalesce || null; this.t = now; this.redoStack = []; this.rev++; this.emit('change', { label }); return true;
  }
  undo() { const e = this.undoStack.pop(); if (!e) return false; this.redoStack.push({ label: e.label, snap: JSON.stringify(this.p) }); this.p = JSON.parse(e.snap); this.rev++; this.last = null; this.emit('change', { label: 'Undo ' + e.label }); return true; }
  redo() { const e = this.redoStack.pop(); if (!e) return false; this.undoStack.push({ label: e.label, snap: JSON.stringify(this.p) }); this.p = JSON.parse(e.snap); this.rev++; this.last = null; this.emit('change', { label: 'Redo ' + e.label }); return true; }
  replace(p) { this.p = p; this.undoStack = []; this.redoStack = []; this.rev++; this.sel = null; this.emit('change', { label: 'Open' }); this.emit('select', null); }
  select(s) { this.sel = s; this.emit('select', s); }
}
export const FIELD_KEY = 'chp_field_v1';
export function serializeField(p) { return JSON.stringify({ app: 'courtyard-field', ...p }, null, 1); }
export function parseField(text) { const o = JSON.parse(text); if (!o || o.kind !== 'field' || !Array.isArray(o.features)) throw new Error('This is not a Field project file.'); delete o.app; return o; }
export function loadField() { try { const t = localStorage.getItem(FIELD_KEY); return t ? parseField(t) : null; } catch (e) { return null; } }
export function saveField(p) { try { localStorage.setItem(FIELD_KEY, JSON.stringify(p)); return true; } catch (e) { return false; } }
