// Kiln mark: a vessel drawn as stacked section planes, with one orange constraint node pulling on the belly.
const W = [9, 5, 4.5, 8.5, 13, 15.5, 14.5, 11.5, 8], Y = [12, 17, 22, 27, 32, 37, 42, 47, 52];
export function logoSVG(size = 32, opts = {}) {
  const bg = opts.bg || '#1c1f24', ink = opts.ink || '#efe6d6', acc = opts.acc || '#e8672c';
  const lines = W.map((w, i) => '<line x1="' + (32 - w) + '" y1="' + Y[i] + '" x2="' + (32 + w) + '" y2="' + Y[i] + '"/>').join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="' + size + '" height="' + size + '" role="img" aria-label="Kiln">' +
    '<rect width="64" height="64" rx="15" fill="' + bg + '"/>' +
    '<g stroke="' + ink + '" stroke-width="2.7" stroke-linecap="round">' + lines + '</g>' +
    '<path d="M47.5 37 L56 37" stroke="' + acc + '" stroke-width="2.4" stroke-linecap="round"/><path d="M53 33.5 L57 37 L53 40.5" fill="none" stroke="' + acc + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="47.5" cy="37" r="4.4" fill="' + acc + '" stroke="' + bg + '" stroke-width="1.6"/></svg>';
}
