// Runs the original planner's regression scripts against the built page. Build first: npm run build
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const dir = path.join(root, 'src', 'legacy');
const body = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
fs.writeFileSync(path.join(__dirname, 'app.js'), "\n(function(){\n'use strict';\n" + body + '})();\n');
const files = ['t2', 't4', 't12', 't16', 't18', 't19', 't20', 'ui3', 'ui4', 'ui5', 'ui6', 'ui8', 'ui10', 'ui11', 'ui12'];
let failed = 0;
for (const f of files) {
  try { execFileSync(process.execPath, [path.join(__dirname, f + '.cjs')], { cwd: __dirname, timeout: 240000, stdio: ['ignore', 'pipe', 'pipe'] }); console.log('ok   ' + f); }
  catch (e) { failed++; console.log('FAIL ' + f + '\n' + String((e.stdout || '') + (e.stderr || '')).split('\n').slice(-6).join('\n')); }
}
process.exit(failed ? 1 : 0);
