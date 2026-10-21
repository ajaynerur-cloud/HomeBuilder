// Exact-surface kernel: OpenCascade (via replicad), shipped compressed inside the page and unpacked on first use.
import initOC from 'replicad-opencascadejs';
import * as R from 'replicad';
let ready = null;
async function gunzip(u8) {
  const DS = (typeof window !== 'undefined' && window.DecompressionStream) || globalThis.DecompressionStream; if (!DS) throw new Error('This browser cannot unpack the kernel (no DecompressionStream).');
  const RS = (typeof window !== 'undefined' && window.ReadableStream) || globalThis.ReadableStream;
  const src = new RS({ start(c) { c.enqueue(u8); c.close(); } }), rd = src.pipeThrough(new DS('gzip')).getReader(), parts = []; let n = 0;
  for (;;) { const { value, done } = await rd.read(); if (done) break; parts.push(value); n += value.length; }
  const out = new Uint8Array(n); let o = 0; parts.forEach((p) => { out.set(p, o); o += p.length; }); return out;
}
function b64(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
export function loadKernel(opt = {}) {
  if (ready) return ready;
  ready = (async () => {
    let wasm = opt.wasmBinary;
    if (!wasm) { const el = typeof document !== 'undefined' && document.getElementById('occt-wasm'); if (!el || !el.textContent.trim()) throw new Error('The exact kernel is not bundled in this build.'); wasm = await gunzip(b64(el.textContent.trim())); }
    const oc = await initOC({ wasmBinary: wasm, locateFile: (f) => 'https://ductile.local/' + f, print: () => {}, printErr: () => {} }); R.setOC(oc); return R;
  })();
  ready.catch(() => { ready = null; });
  return ready;
}
export { R };
