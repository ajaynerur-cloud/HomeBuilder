export class Emitter {
  constructor() { this.h = {}; }
  on(ev, fn) { (this.h[ev] = this.h[ev] || new Set()).add(fn); return () => this.h[ev].delete(fn); }
  emit(ev, a) { (this.h[ev] ? [...this.h[ev]] : []).forEach((f) => f(a)); }
}
