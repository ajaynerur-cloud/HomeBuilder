// Ductile mark: a block whose right face is being pulled out into a curve, with an orange pull handle.
export function logoSVG(size = 32, o = {}) {
  const bg = o.bg || '#16191e', ink = o.ink || '#eef1f4', acc = o.acc || '#ff7a1a';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="' + size + '" height="' + size + '" role="img" aria-label="Ductile">' +
    '<rect width="64" height="64" rx="15" fill="' + bg + '"/>' +
    '<path d="M14 24 L30 16 L46 24 L30 32 Z" fill="' + ink + '" opacity="0.95"/>' +
    '<path d="M14 24 L30 32 L30 50 L14 42 Z" fill="' + ink + '" opacity="0.62"/>' +
    '<path d="M30 32 L46 24 C55 30 55 44 46 50 L30 50 Z" fill="' + ink + '" opacity="0.38"/>' +
    '<path d="M44 38 L55 38" stroke="' + acc + '" stroke-width="2.6" stroke-linecap="round"/><path d="M52 34.2 L56 38 L52 41.8" fill="none" stroke="' + acc + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="43" cy="38" r="4.2" fill="' + acc + '" stroke="' + bg + '" stroke-width="1.6"/></svg>';
}
