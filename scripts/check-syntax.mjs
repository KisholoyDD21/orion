// Syntax-checks every server, shared, and client JS file. Client files use absolute `/vendor/...` / `/shared/...`
// import specifiers meant for the browser, which `node --check` does not need to resolve (it only parses).
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIRS = ['server', 'shared', 'client/js'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}
let files = [];
for (const d of DIRS) { const abs = path.join(ROOT, d); try { walk(abs, files); } catch { /* directory optional */ } }
let failed = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { failed++; console.error(`SYNTAX ERROR: ${path.relative(ROOT, f)}\n${e.stderr?.toString() || e.message}`); }
}
console.log(`${files.length - failed}/${files.length} files OK`);
if (failed) process.exit(1);
