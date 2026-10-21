export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const k in props || {}) {
    const v = props[k];
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'value') e.value = v; else if (k === 'checked') e.checked = !!v;
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  kids.flat(2).forEach((c) => { if (c == null || c === false) return; e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
  return e;
}
export const clear = (e) => { while (e.firstChild) e.removeChild(e.firstChild); return e; };
export function table(cols, rows, opts = {}) {
  const t = h('table', { class: 'st-table' }), th = h('tr'); cols.forEach((c) => th.appendChild(h('th', { text: c.label, class: c.num ? 'num' : '' }))); t.appendChild(h('thead', {}, th));
  const tb = h('tbody'); rows.forEach((r) => { const tr = h('tr', { class: r._cls || '', onclick: opts.onRow ? () => opts.onRow(r) : null }); cols.forEach((c) => tr.appendChild(h('td', { class: c.num ? 'num' : '' }, typeof c.get === 'function' ? c.get(r) : r[c.key]))); tb.appendChild(tr); });
  t.appendChild(tb); return t;
}
