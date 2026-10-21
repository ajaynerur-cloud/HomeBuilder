// A small, dependency-free DEFLATE decoder (RFC 1951) and ZIP reader.
// SketchUp material files (.skm) are ZIP archives, so this is what lets Studio open them
// in a browser, in Electron and in the Android WebView without relying on newer APIs.

const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function huffman(lengths) {
  const count = new Uint16Array(16), symbol = new Uint16Array(lengths.length), offs = new Uint16Array(16);
  for (let i = 0; i < lengths.length; i++) count[lengths[i]]++;
  count[0] = 0;
  for (let i = 1; i < 15; i++) offs[i + 1] = offs[i] + count[i];
  for (let s = 0; s < lengths.length; s++) if (lengths[s]) symbol[offs[lengths[s]]++] = s;
  return { count, symbol };
}
let FIXED = null;
function fixedTables() {
  if (FIXED) return FIXED;
  const l = new Uint8Array(288); for (let i = 0; i < 144; i++) l[i] = 8; for (let i = 144; i < 256; i++) l[i] = 9; for (let i = 256; i < 280; i++) l[i] = 7; for (let i = 280; i < 288; i++) l[i] = 8;
  const d = new Uint8Array(30).fill(5); FIXED = { lit: huffman(l), dist: huffman(d) }; return FIXED;
}

export function inflateRaw(src, sizeHint) {
  let pos = 0, bitBuf = 0, bitCnt = 0, out = new Uint8Array(Math.max(1024, sizeHint || src.length * 4)), n = 0;
  const bit = () => { if (bitCnt === 0) { if (pos >= src.length) throw new Error('Unexpected end of compressed data.'); bitBuf = src[pos++]; bitCnt = 8; } const b = bitBuf & 1; bitBuf >>= 1; bitCnt--; return b; };
  const bits = (k) => { let v = 0; for (let i = 0; i < k; i++) v |= bit() << i; return v; };
  const decode = (h) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len <= 15; len++) { code |= bit(); const c = h.count[len]; if (code - c < first) return h.symbol[index + (code - first)]; index += c; first += c; first <<= 1; code <<= 1; }
    throw new Error('Corrupt compressed data.');
  };
  const put = (b) => { if (n >= out.length) { const g = new Uint8Array(out.length * 2); g.set(out); out = g; } out[n++] = b; };
  const codes = (lit, dist) => {
    for (;;) {
      let sym = decode(lit);
      if (sym < 256) put(sym);
      else if (sym === 256) return;
      else {
        sym -= 257; if (sym >= 29) throw new Error('Corrupt compressed data.');
        const len = LBASE[sym] + bits(LEXT[sym]), ds = decode(dist); if (ds >= 30) throw new Error('Corrupt compressed data.');
        const d = DBASE[ds] + bits(DEXT[ds]); if (d > n) throw new Error('Corrupt compressed data.');
        for (let i = 0; i < len; i++) put(out[n - d]);
      }
    }
  };
  let last = 0;
  do {
    last = bit(); const type = bits(2);
    if (type === 0) {
      bitCnt = 0; if (pos + 4 > src.length) throw new Error('Unexpected end of compressed data.');
      const len = src[pos] | (src[pos + 1] << 8); pos += 4; if (pos + len > src.length) throw new Error('Unexpected end of compressed data.');
      for (let i = 0; i < len; i++) put(src[pos++]);
    } else if (type === 1) { const f = fixedTables(); codes(f.lit, f.dist); }
    else if (type === 2) {
      const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4, lengths = new Uint8Array(320);
      const cl = new Uint8Array(19); for (let i = 0; i < ncode; i++) cl[CLORD[i]] = bits(3);
      const clh = huffman(cl); let i = 0;
      while (i < nlen + ndist) {
        const sym = decode(clh);
        if (sym < 16) lengths[i++] = sym;
        else {
          let prev = 0, rep;
          if (sym === 16) { if (i === 0) throw new Error('Corrupt compressed data.'); prev = lengths[i - 1]; rep = 3 + bits(2); } else if (sym === 17) rep = 3 + bits(3); else rep = 11 + bits(7);
          if (i + rep > nlen + ndist) throw new Error('Corrupt compressed data.');
          while (rep--) lengths[i++] = prev;
        }
      }
      codes(huffman(lengths.subarray(0, nlen)), huffman(lengths.subarray(nlen, nlen + ndist)));
    } else throw new Error('Corrupt compressed data.');
  } while (!last);
  return out.slice(0, n);
}

// Reads the entries of a ZIP archive. Returns [{name, size, data()}]; data() inflates on demand.
export function readZip(u8) {
  if (!(u8 instanceof Uint8Array)) u8 = new Uint8Array(u8);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.length < 22 || dv.getUint32(0, true) !== 0x04034b50 && dv.getUint32(0, true) !== 0x06054b50) throw new Error('This file is not a ZIP package.');
  let eocd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('The ZIP index is missing or damaged.');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder('utf-8'), out = [];
  for (let k = 0; k < count; k++) {
    if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('The ZIP index is damaged.');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue;
    out.push({
      name, size: usize, encrypted: !!(flags & 1),
      data() {
        if (flags & 1) throw new Error(name + ' is password protected.');
        if (dv.getUint32(lho, true) !== 0x04034b50) throw new Error('The ZIP entry ' + name + ' is damaged.');
        const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true), raw = u8.subarray(start, start + csize);
        if (method === 0) return raw.slice();
        if (method === 8) return inflateRaw(raw, usize);
        throw new Error('Unsupported ZIP compression (' + method + ').');
      },
    });
  }
  return out;
}
export const isZip = (u8) => u8.length > 3 && u8[0] === 0x50 && u8[1] === 0x4b && (u8[2] === 3 || u8[2] === 5);
