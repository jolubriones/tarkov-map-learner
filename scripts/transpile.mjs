/**
 * Shared harness for the node scripts: transpile project TS with the
 * repo's own TypeScript compiler (no new dependencies) and require it
 * from a temp dir. Used by validate/merge/test scripts.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Transpile [[src, dest, rewrites]] (src relative to the repo root,
 * rewrites are [from, to] string pairs applied before transpile) into a
 * fresh temp dir. Returns { dir, require, cleanup } — call cleanup when
 * done (or in a finally for load-and-delete flows).
 */
export function transpileFiles(files, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  for (const [src, dest, rewrites] of files) {
    let code = readFileSync(join(ROOT, src), 'utf8');
    for (const [from, to] of rewrites) code = code.split(from).join(to);
    const js = ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    writeFileSync(join(dir, dest), js);
  }
  return {
    dir,
    require: (dest) => require(join(dir, dest)),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Minimal browser stand-ins — call before requiring browser modules.
 * Returns the backing map so tests can assert on raw persisted state.
 */
export function mockBrowser() {
  const backing = new Map();
  globalThis.localStorage = {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => void backing.set(k, String(v)),
    removeItem: (k) => void backing.delete(k),
  };
  globalThis.window = { addEventListener: () => {} };
  return backing;
}
