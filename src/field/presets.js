// Starting points. Each builds a complete parametric project you can change.
import { newField, nid, pickFace, FACE } from './model.js';

function sketch(p, o) { const s = { id: nid(p, 'sk'), plane: 'pXZ', ...o }; p.sketches.push(s); return s; }
function feat(p, o) { const f = { id: nid(p, 'ft'), enabled: true, ...o }; p.features.push(f); return f; }
function par(p, list) { list.forEach(([name, v, note]) => p.params.push({ name, v, note })); }
function plane(p, o) { const q = { id: nid(p, 'pl'), ...o }; p.planes.push(q); return q; }

export const PRESETS = [['revolved', 'Vase from a profile curve'], ['lobed', 'Twisted lobed vase from an equation'], ['lofted', 'Vase lofted through shapes'], ['faceted', 'Faceted vase, then push and pull']];

export function preset(kind) {
  const p = newField(kind === 'revolved' ? 'Revolved vase' : kind === 'lobed' ? 'Lobed vase' : kind === 'lofted' ? 'Lofted vase' : 'Faceted vase');
  if (kind === 'revolved') {
    par(p, [['H', 180, 'Height'], ['baseR', 34, 'Base radius'], ['bellyR', 62, 'Belly radius'], ['neckR', 26, 'Neck radius'], ['rimR', 38, 'Rim radius'], ['wall', 3.5, 'Wall thickness'], ['floorT', 6, 'Floor thickness']]);
    const s = sketch(p, { name: 'Profile', type: 'spline', closed: false, per: 16, pts: [['=baseR', 0], ['=baseR+6', '=H*0.08'], ['=bellyR', '=H*0.38'], ['=neckR', '=H*0.78'], ['=rimR', '=H']] });
    feat(p, { name: 'Revolve profile', type: 'revolve', sketch: s.id, axis: 'v', angle: 360, wall: '=wall', floor: '=floorT', op: 'add' });
  } else if (kind === 'lobed') {
    par(p, [['H', 200, 'Height'], ['rBase', 32, 'Base radius'], ['rBelly', 56, 'Belly radius'], ['neck', 14, 'Neck narrowing'], ['lobes', 5, 'Number of lobes'], ['lobeAmp', 7, 'Lobe depth, percent'], ['twist', 90, 'Twist over the height, degrees'], ['wall', 3, 'Wall thickness'], ['floorT', 5, 'Floor thickness']]);
    feat(p, { name: 'Surface', type: 'surface', plane: 'pXY', H: '=H', r: '(rBase + (rBelly - rBase) * pow(sin(180*t), 1.4) - neck * pow(t, 4)) * (1 + lobeAmp/100 * cos(lobes*a))', twist: 'twist * t', wall: '=wall', floor: '=floorT', op: 'add' });
  } else if (kind === 'lofted') {
    par(p, [['H', 180, 'Height'], ['baseR', 36, 'Base radius'], ['bellyR', 58, 'Belly size'], ['neckR', 24, 'Neck radius'], ['rimR', 34, 'Rim radius'], ['sq', 3.2, 'Squareness of the belly (2 = round, 6 = nearly square)'], ['wall', 3, 'Wall thickness']]);
    const z = [0, 0.34, 0.7, 1].map((t, i) => plane(p, { name: 'Level ' + (i + 1), kind: 'offset', base: 'pXY', offset: t === 0 ? 0 : '=H*' + t }));
    const s = [
      sketch(p, { name: 'Base', plane: z[0].id, type: 'circle', r: '=baseR' }),
      sketch(p, { name: 'Belly', plane: z[1].id, type: 'superellipse', rx: '=bellyR', ry: '=bellyR', n: '=sq' }),
      sketch(p, { name: 'Neck', plane: z[2].id, type: 'ellipse', rx: '=neckR', ry: '=neckR*0.8' }),
      sketch(p, { name: 'Rim', plane: z[3].id, type: 'circle', r: '=rimR' }),
    ];
    feat(p, { name: 'Loft', type: 'loft', sketches: s.map((q) => q.id), smooth: true, wall: '=wall', op: 'add' });
  } else {
    par(p, [['H', 170, 'Height'], ['R', 42, 'Corner radius'], ['sides', 8, 'Number of sides'], ['twistDeg', 55, 'Twist over the height'], ['draft', 2.5, 'Taper angle'], ['wall', 3, 'Wall thickness']]);
    const t = plane(p, { name: 'Top (XY)', kind: 'xy' }); void t;
    const s = sketch(p, { name: 'Section', plane: 'pXY', type: 'polygon', sides: '=sides', r: '=R' });
    feat(p, { name: 'Extrude', type: 'extrude', sketch: s.id, dir: 'normal', dist: '=H', taper: '=draft', twist: '=twistDeg', op: 'add' });
    const top = pickFace(p, p.features.length, FACE.top);
    feat(p, { name: 'Hollow, open top', type: 'shell', t: '=wall', open: [top] });
  }
  return p;
}
