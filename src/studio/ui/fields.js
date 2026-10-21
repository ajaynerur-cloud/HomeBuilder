import { ROOM_TYPES } from '../model/checks.js';
const L = (k, l) => ({ k, l, t: 'len' });
export const KIND_LABEL = { walls: 'Wall', openings: 'Opening', columns: 'Column', beams: 'Beam', footings: 'Footing', slabs: 'Slab', roofs: 'Roof', stairs: 'Stair', dims: 'Dimension', texts: 'Text', rooms: 'Room name' };
export const FIELDS = {
  walls: [L('ax', 'Start x'), L('ay', 'Start y'), L('bx', 'End x'), L('by', 'End y'), L('t', 'Thickness'), L('h', 'Height'), L('base', 'Base offset'), { k: 'mat', l: 'Material', t: 'sel', o: [['brick', 'Brick'], ['block', 'Concrete block'], ['rcc', 'RCC'], ['stone', 'Stone'], ['timber', 'Timber']] }],
  openings: [{ k: 'kind', l: 'Type', t: 'sel', o: [['door', 'Door'], ['window', 'Window'], ['arch', 'Open arch'], ['vent', 'Ventilator']] }, L('pos', 'Position along wall'), L('w', 'Width'), L('h', 'Height'), L('sill', 'Sill height'), { k: 'flip', l: 'Swing to the other side', t: 'bool' }, { k: 'mirror', l: 'Hinge on the other side', t: 'bool' }],
  columns: [L('x', 'Centre x'), L('y', 'Centre y'), L('b', 'Width'), L('d', 'Depth'), L('h', 'Height'), { k: 'shape', l: 'Shape', t: 'sel', o: [['rect', 'Rectangular'], ['round', 'Round']] }, { k: 'rot', l: 'Rotation (deg)', t: 'num' }],
  beams: [L('ax', 'Start x'), L('ay', 'Start y'), L('bx', 'End x'), L('by', 'End y'), L('b', 'Width'), L('d', 'Depth'), L('zTop', 'Top above level')],
  footings: [L('x', 'Centre x'), L('y', 'Centre y'), L('size', 'Pad size'), L('depth', 'Depth below level'), L('padT', 'Pad thickness'), L('ped', 'Pedestal size')],
  slabs: [L('t', 'Thickness'), L('zTop', 'Top above level')],
  roofs: [L('x0', 'West x'), L('y0', 'South y'), L('x1', 'East x'), L('y1', 'North y'), { k: 'type', l: 'Type', t: 'sel', o: [['hip', 'Hip'], ['gable', 'Gable'], ['shed', 'Shed (single slope)'], ['flat', 'Flat']] }, { k: 'pitch', l: 'Pitch (deg)', t: 'num' }, L('over', 'Overhang'), { k: 'ridge', l: 'Gable ridge runs', t: 'sel', o: [['x', 'East to west'], ['y', 'North to south']] }, { k: 'dir', l: 'Shed falls towards', t: 'sel', o: [['s', 'South'], ['n', 'North'], ['e', 'East'], ['w', 'West']] }, L('t', 'Thickness'), L('zBase', 'Eave above level')],
  stairs: [L('x', 'Start x'), L('y', 'Start y'), { k: 'dir', l: 'Direction (deg)', t: 'num' }, L('width', 'Width'), L('riser', 'Riser'), L('tread', 'Tread'), L('rise', 'Total rise')],
  dims: [{ k: 'off', l: 'Offset', t: 'num' }],
  texts: [{ k: 'text', l: 'Text', t: 'txt' }, { k: 'size', l: 'Text height', t: 'num' }],
  rooms: [{ k: 'name', l: 'Name', t: 'txt' }, { k: 'type', l: 'Type', t: 'sel', o: ROOM_TYPES }],
};
