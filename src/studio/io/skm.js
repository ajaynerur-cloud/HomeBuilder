// Material import. A SketchUp material (.skm) is a ZIP package with document.xml (colour, name, transparency),
// a texture image (jpg or png) and a small thumbnail. Plain images (jpg, png, webp, gif, bmp) work too.
import { readZip, isZip } from './inflate.js';

const IMG = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };
const ext = (n) => ((n || '').split('.').pop() || '').toLowerCase();
const base = (n) => (n || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
const hex2 = (v) => Math.max(0, Math.min(255, Math.round(+v || 0))).toString(16).padStart(2, '0');

function decodeText(u8) {
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8);
  return new TextDecoder('utf-8').decode(u8);
}
function attrs(tag) { const o = {}; tag.replace(/([\w:.-]+)\s*=\s*"([^"]*)"/g, (m, k, v) => { o[k.replace(/^.*:/, '')] = v; return m; }); return o; }

// Reads colour, name, opacity and the real-world size of one texture tile from document.xml
export function parseMaterialXml(xml) {
  const out = { name: '', color: null, opacity: 1, hasTexture: null, tileIn: null };
  const m = /<(?:[\w-]+:)?material\b([^>]*)>/i.exec(xml); if (!m) return out;
  const a = attrs(m[1]);
  if (a.name) out.name = a.name;
  if (a.colorRed !== undefined) out.color = '#' + hex2(a.colorRed) + hex2(a.colorGreen) + hex2(a.colorBlue);
  if (a.useTrans === '1' && a.trans !== undefined) out.opacity = Math.max(0.05, Math.min(1, parseFloat(a.trans)));
  if (a.hasTexture !== undefined) out.hasTexture = a.hasTexture === '1' || a.hasTexture === 'true';
  // texture size, when the file carries it (SketchUp keeps it in inches)
  const t = /<(?:[\w-]+:)?texture\b([^>]*)>/i.exec(xml);
  const ta = t ? attrs(t[1]) : a, w = parseFloat(ta.width || ta.texWidth || ta.textureWidth || ta.sizeX), h = parseFloat(ta.height || ta.texHeight || ta.textureHeight || ta.sizeY);
  if (w > 0 && h > 0) out.tileIn = [w, h];
  return out;
}

// bytes of a .skm  ->  {name, color, opacity, tex:{mime, bytes}|null, tile:[ftW, ftH]|null, source}
export function parseSkm(bytes, filename = '') {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (!isZip(bytes)) throw new Error('This does not look like a SketchUp material file (.skm is a ZIP package).');
  const entries = readZip(bytes);
  const xmls = entries.filter((e) => /\.xml$/i.test(e.name)).sort((a, b) => (/document\.xml$/i.test(a.name) ? -1 : 0) - (/document\.xml$/i.test(b.name) ? -1 : 0));
  let info = { name: '', color: null, opacity: 1, hasTexture: null, tileIn: null };
  for (const e of xmls) { const r = parseMaterialXml(decodeText(e.data())); if (r.name || r.color) { info = r; break; } }
  const images = entries.filter((e) => IMG[ext(e.name)] && !/thumb|preview/i.test(e.name)).sort((a, b) => b.size - a.size);
  let tex = null;
  if (images.length && info.hasTexture !== false) { const e = images[0]; tex = { mime: IMG[ext(e.name)], bytes: e.data() }; }
  if (!info.color && !tex) throw new Error('No colour or texture was found inside this material file.');
  const tile = info.tileIn ? info.tileIn.map((v) => Math.max(0.1, Math.min(100, v / 12))) : null;
  return { name: info.name || base(filename) || 'Material', color: info.color || '#c8c2b4', opacity: info.opacity, tex, tile, source: 'skm' };
}

export function bytesToDataURL(bytes, mime) {
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return 'data:' + mime + ';base64,' + btoa(s);
}

// Shrinks the texture so projects stay small, and reads its average colour for the swatch. Falls back to the raw image outside a browser.
export function prepareTexture(tex, maxPx = 512) {
  const raw = bytesToDataURL(tex.bytes, tex.mime);
  if (typeof Image === 'undefined' || typeof document === 'undefined') return Promise.resolve({ url: raw, avg: null });
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, maxPx / Math.max(img.width, img.height)), w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
        const s = document.createElement('canvas'); s.width = 8; s.height = 8; const sg = s.getContext('2d'); sg.drawImage(img, 0, 0, 8, 8); const d = sg.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } const nn = d.length / 4;
        resolve({ url: tex.mime === 'image/png' && k === 1 ? raw : c.toDataURL('image/jpeg', 0.86), avg: '#' + hex2(r / nn) + hex2(gg / nn) + hex2(b / nn) });
      } catch (e) { resolve({ url: raw, avg: null }); }
    };
    img.onerror = () => resolve({ url: raw, avg: null }); img.src = raw;
  });
}

// File (from an input or a drop)  ->  material ready for the library: {name, color, opacity, tex:dataURL|null, tile:[w,h]}
export async function importMaterialFile(file) {
  const e = ext(file.name), bytes = new Uint8Array(await file.arrayBuffer());
  let m;
  if (e === 'skm' || (isZip(bytes) && !IMG[e])) m = parseSkm(bytes, file.name);
  else if (IMG[e]) m = { name: base(file.name), color: '#c8c2b4', opacity: 1, tex: { mime: IMG[e], bytes }, tile: null, source: 'image' };
  else throw new Error('Choose a SketchUp material (.skm) or an image (.jpg, .png).');
  let url = null, color = m.color;
  if (m.tex) { const t = await prepareTexture(m.tex); url = t.url; if (t.avg && (m.source === 'image' || !m.color || m.color === '#c8c2b4')) color = t.avg; }
  return { name: m.name, color, opacity: m.opacity, tex: url, tile: m.tile || [4, 4] };
}
export const MATERIAL_ACCEPT = '.skm,.jpg,.jpeg,.png,.webp,.gif,.bmp';
