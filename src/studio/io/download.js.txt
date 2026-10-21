// Saves a file in a browser, in Electron (browser path), or on Android through Capacitor.
function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
export async function saveBytes(name, mime, data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const C = typeof window !== 'undefined' && window.Capacitor;
  if (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.Filesystem) {
    try {
      const r = await C.Plugins.Filesystem.writeFile({ path: name, data: b64(bytes), directory: 'CACHE' });
      if (C.Plugins.Share) await C.Plugins.Share.share({ title: name, url: r.uri, dialogTitle: 'Save or share' });
      return true;
    } catch (e) { /* fall through to the browser path */ }
  }
  // inside a published claude.ai page, files go through the viewer's save prompt
  const cl = typeof window !== 'undefined' && window.claude;
  if (cl && typeof cl.use === 'function') {
    try { const d = await cl.use('downloads'); if (d) { await d.save({ filename: name, data: bytes }); return true; } } catch (e) { if (e && e.code === 'declined') return false; /* other errors: try the browser path */ }
  }
  const blob = new Blob([bytes], { type: mime || 'application/octet-stream' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 500); return true;
}
