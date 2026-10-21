// STL, OBJ and 3MF writers. Input parts hold triangles in millimetres (9 numbers per triangle).
import { createZip, utf8 } from './zip.js';

const norm = (t, i) => {
  const ux = t[i + 3] - t[i], uy = t[i + 4] - t[i + 1], uz = t[i + 5] - t[i + 2], vx = t[i + 6] - t[i], vy = t[i + 7] - t[i + 1], vz = t[i + 8] - t[i + 2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l];
};

export function mergeTris(parts) { const out = []; parts.forEach((p) => { for (let i = 0; i < p.tris.length; i++) out.push(p.tris[i]); }); return out; }

export function encodeSTL(tris, label = 'Courtyard Studio') {
  const n = tris.length / 9, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
  const h = utf8(label.slice(0, 79)); new Uint8Array(buf, 0, 80).set(h);
  dv.setUint32(80, n, true);
  for (let i = 0, o = 84; i < tris.length; i += 9, o += 50) {
    const nm = norm(tris, i); dv.setFloat32(o, nm[0], true); dv.setFloat32(o + 4, nm[1], true); dv.setFloat32(o + 8, nm[2], true);
    for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, tris[i + k], true);
    dv.setUint16(o + 48, 0, true);
  }
  return new Uint8Array(buf);
}
export function encodeSTLAscii(tris, name = 'studio') {
  const L = ['solid ' + name];
  for (let i = 0; i < tris.length; i += 9) {
    const n = norm(tris, i); L.push(' facet normal ' + n.map((v) => v.toExponential(6)).join(' '), '  outer loop');
    for (let k = 0; k < 3; k++) L.push('   vertex ' + [tris[i + k * 3], tris[i + k * 3 + 1], tris[i + k * 3 + 2]].map((v) => v.toExponential(6)).join(' '));
    L.push('  endloop', ' endfacet');
  }
  L.push('endsolid ' + name); return L.join('\n') + '\n';
}

function indexed(tris, q = 1e-4) {
  const map = new Map(), verts = [], idx = [];
  for (let i = 0; i < tris.length; i += 9) {
    const ids = [];
    for (let k = 0; k < 3; k++) {
      const x = tris[i + k * 3], y = tris[i + k * 3 + 1], z = tris[i + k * 3 + 2], key = Math.round(x / q) + ',' + Math.round(y / q) + ',' + Math.round(z / q);
      let id = map.get(key); if (id === undefined) { id = verts.length / 3; map.set(key, id); verts.push(x, y, z); } ids.push(id);
    }
    if (ids[0] !== ids[1] && ids[1] !== ids[2] && ids[0] !== ids[2]) idx.push(ids[0], ids[1], ids[2]);
  }
  return { verts, idx };
}
const hex = (c) => '#' + (c & 0xffffff).toString(16).padStart(6, '0').toUpperCase();
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

export function encodeOBJ(parts, name = 'studio') {
  const obj = ['# Courtyard Studio export, millimetres', 'mtllib ' + name + '.mtl'], mtl = []; let off = 0; const seen = new Set();
  parts.forEach((p) => {
    const m = 'm' + (p.color & 0xffffff).toString(16);
    if (!seen.has(m)) { seen.add(m); const c = [(p.color >> 16) & 255, (p.color >> 8) & 255, p.color & 255].map((v) => (v / 255).toFixed(4)); mtl.push('newmtl ' + m, 'Kd ' + c.join(' '), 'Ka 0 0 0', 'Ks 0 0 0', ''); }
    const { verts, idx } = indexed(p.tris);
    obj.push('o ' + p.name.replace(/\s+/g, '_'), 'usemtl ' + m);
    for (let i = 0; i < verts.length; i += 3) obj.push('v ' + verts[i].toFixed(4) + ' ' + verts[i + 1].toFixed(4) + ' ' + verts[i + 2].toFixed(4));
    for (let i = 0; i < idx.length; i += 3) obj.push('f ' + (idx[i] + 1 + off) + ' ' + (idx[i + 1] + 1 + off) + ' ' + (idx[i + 2] + 1 + off));
    off += verts.length / 3;
  });
  return { obj: obj.join('\n') + '\n', mtl: mtl.join('\n') };
}

export function encode3MF(parts, title = 'Courtyard Studio model') {
  const colors = [...new Set(parts.map((p) => p.color & 0xffffff))];
  const L = ['<?xml version="1.0" encoding="UTF-8"?>', '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel">',
    '<metadata name="Title">' + esc(title) + '</metadata><metadata name="Application">Courtyard Studio</metadata>', '<resources>', '<basematerials id="1">'];
  colors.forEach((c, i) => L.push('<base name="Colour ' + (i + 1) + '" displaycolor="' + hex(c) + '"/>'));
  L.push('</basematerials>');
  parts.forEach((p, i) => {
    const { verts, idx } = indexed(p.tris);
    L.push('<object id="' + (i + 2) + '" type="model" pid="1" pindex="' + colors.indexOf(p.color & 0xffffff) + '" name="' + esc(p.name) + '"><mesh><vertices>');
    for (let k = 0; k < verts.length; k += 3) L.push('<vertex x="' + verts[k].toFixed(4) + '" y="' + verts[k + 1].toFixed(4) + '" z="' + verts[k + 2].toFixed(4) + '"/>');
    L.push('</vertices><triangles>');
    for (let k = 0; k < idx.length; k += 3) L.push('<triangle v1="' + idx[k] + '" v2="' + idx[k + 1] + '" v3="' + idx[k + 2] + '"/>');
    L.push('</triangles></mesh></object>');
  });
  L.push('</resources><build>'); parts.forEach((p, i) => L.push('<item objectid="' + (i + 2) + '"/>')); L.push('</build></model>');
  return createZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>' },
    { name: '3D/3dmodel.model', data: L.join('\n') },
  ]);
}
