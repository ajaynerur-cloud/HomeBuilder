// Builds the single-file web app (dist/) and the www/ folder used by Electron and Capacitor.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const legacyDir = path.join(root, 'src/legacy');
const legacyBody = fs.readdirSync(legacyDir).filter((f) => f.endsWith('.js')).sort()
  .map((f) => fs.readFileSync(path.join(legacyDir, f), 'utf8')).join('');
const legacy = "\n(function(){\n'use strict';\n" + legacyBody + '})();\n';

const css = ['legacy.css', 'shell.css', 'studio.css', 'kiln.css', 'ductile.css'].map((f) => {
  const p = path.join(root, 'src/styles', f);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}).join('\n');

const out = await build({
  entryPoints: [path.join(root, 'src/studio/main.js')],
  bundle: true, format: 'iife', globalName: 'ChpStudio', write: false,
  minify: !dev, target: ['es2020'], legalComments: 'none', logLevel: 'error', external: ['node:*', 'fs', 'path', 'module', 'url', 'crypto', 'worker_threads'], define: { 'import.meta.url': '"https://ductile.local/app.js"' },
});
const studio = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// the exact CAD kernel (OpenCascade, LGPL-2.1) travels gzip-compressed and base64-encoded inside the page
import zlib from 'node:zlib';
const wasmPath = path.join(root, 'node_modules/replicad-opencascadejs/dist/replicad_single.wasm');
const occt = fs.existsSync(wasmPath) ? '<script type="application/octet-stream" id="occt-wasm">' + zlib.gzipSync(fs.readFileSync(wasmPath), { level: 9 }).toString('base64') + '</script>' : '';
function make(threeTag) {
  return rd('src/index.template.html')
    .replace('{{CSS}}', () => css)
    .replace('{{THREE}}', () => threeTag)
    .replace('{{LEGACY_JS}}', () => legacy)
    .replace('{{STUDIO_JS}}', () => studio);
}
function withKernel(html) { const i = html.lastIndexOf('</body>'); return i < 0 ? html + occt : html.slice(0, i) + occt + '\n' + html.slice(i);
}

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/courtyard_house_planner.html'),
  withKernel(make('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>')));

fs.rmSync(path.join(root, 'www'), { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'www/vendor'), { recursive: true });
fs.copyFileSync(path.join(root, 'src/vendor/three.min.js'), path.join(root, 'www/vendor/three.min.js'));
fs.writeFileSync(path.join(root, 'www/index.html'), withKernel(make('<script src="vendor/three.min.js"></script>')));
console.log('Built dist/courtyard_house_planner.html and www/index.html' + (dev ? ' (dev)' : ''));
