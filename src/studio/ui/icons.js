// Small line icons (24 px grid) for the tool rail. They take the text colour, so they follow light and dark themes.
const P = {
  select: '<path d="M6 3l12 8-5.2 1.3L10 18z"/>',
  wall: '<path d="M4 19L19 4" stroke-width="3.2"/>',
  rect: '<rect x="5" y="6" width="14" height="12" stroke-width="2.6"/>',
  split: '<path d="M3 12h7M14 12h7M12 5v14"/>',
  door: '<path d="M6 20V5M6 20h13M6 20A14 14 0 0 1 20 6"/>',
  window: '<rect x="4" y="7" width="16" height="10"/><path d="M12 7v10M4 12h16"/>',
  arch: '<path d="M5 20V11a7 7 0 0 1 14 0v9"/>',
  vent: '<rect x="8" y="8" width="8" height="8"/><path d="M8 12h8"/>',
  column: '<rect x="7" y="7" width="10" height="10" fill="currentColor" fill-opacity=".25"/>',
  beam: '<rect x="3" y="9" width="18" height="6"/>',
  footing: '<path d="M4 20h16M6 20v-4h12v4M10 16V6h4v10"/>',
  stair: '<path d="M4 20h5v-4h5v-4h6V8"/>',
  roof: '<path d="M3 13l9-8 9 8M6 11v8h12v-8"/>',
  room: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M8 11h8M8 14h5"/>',
  dim: '<path d="M4 7v10M20 7v10M4 12h16M8 9.5L4 12l4 2.5M16 9.5l4 2.5-4 2.5"/>',
  measure: '<path d="M3 16L16 3l5 5L8 21z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/>',
  text: '<path d="M5 6h14M12 6v13M9 19h6"/>',
  pull: '<path d="M5 19h14M7 19v-6h10v6M12 13V4M8 8l4-4 4 4"/>',
  move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  scale: '<path d="M4 20h6v-6M4 20l7-7M20 4h-6v6M20 4l-7 7"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5"/>',
  twist: '<path d="M6 5c9 0 9 7 0 7s-9 7 0 7"/><path d="M17 4v3M17 17v3"/>',
  inset: '<rect x="4" y="4" width="16" height="16"/><rect x="9" y="9" width="6" height="6"/>',
  sculpt: '<path d="M3 17c3-9 5-9 9-9s6 0 9 9M12 8V3M9 6l3-3 3 3"/>',
  delface: '<rect x="4" y="4" width="16" height="16"/><path d="M9 9l6 6M15 9l-6 6"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M15 4v16"/>',
};
export function icon(name, size = 20) {
  const s = document.createElement('span'); s.className = 'st-ico';
  s.innerHTML = '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  return s;
}
export const hasIcon = (n) => !!P[n];
