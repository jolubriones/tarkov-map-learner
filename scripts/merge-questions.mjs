#!/usr/bin/env node
/**
 * Merge community exports into the seed bank — the curation step.
 *
 *   npm run merge -- path/to/export.json            # merge into src/lib/mockData.ts
 *   npm run merge -- path/to/export.json --dry-run  # validate + report, change nothing
 *
 * Each entry is re-validated with the app's own template rules (same
 * module the form uses, transpiled like the test harness), then:
 *   - remote images are downloaded, sniffed (jpeg/png/gif/webp only),
 *     hashed for dupes, and self-hosted under public/images/<map>/;
 *   - exact-prompt dupes are skipped with a note, never merged twice;
 *   - stable per-map ids are assigned (<prefix>-NN, continuing the bank);
 *   - entries are appended to the bank file under a marker comment.
 *
 * Images are the whole point of this app, so the bank never keeps a
 * remote URL it doesn't have to: anything merged gets a permanent
 * self-hosted copy. Nothing here publishes by itself — review the diff
 * and run `npm run validate` before committing.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const IMAGE_TIMEOUT_MS = 15000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MARKER = '// --- Community-merged questions (scripts/merge-questions.mjs) ---';
/** Stable id prefixes per map — assigned ids are never reused. */
const ID_PREFIX = {
  customs: 'c',
  woods: 'w',
  shoreline: 'sh',
  interchange: 'i',
  reserve: 'r',
  lighthouse: 'lh',
  streets: 'st',
  factory: 'f',
  labs: 'lb',
  'ground-zero': 'gz',
};

function usage(exit = 0) {
  console.log(
    'usage: node scripts/merge-questions.mjs <export.json> [--dry-run] [--bank <ts>] [--public <dir>]'
  );
  process.exit(exit);
}

const argv = process.argv.slice(2);
const manifestPath = argv.find((a) => !a.startsWith('--'));
const DRY_RUN = argv.includes('--dry-run');
const flagValue = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
};
if (!manifestPath) usage(1);
const BANK_PATH = join(ROOT, flagValue('--bank') ?? 'src/lib/mockData.ts');
const PUBLIC_DIR = join(ROOT, flagValue('--public') ?? 'public');

/** Transpile the app's own validation module (single source of truth). */
function loadValidation() {
  const tmp = mkdtempSync(join(tmpdir(), 'merge-'));
  try {
    const files = [
      ['src/lib/types.ts', 'libtypes.js', []],
      ['src/lib/community/config.ts', 'cconfig.js', []],
      ['src/lib/community/difficulty.ts', 'cdifficulty.js', [["'@/lib/types'", "'./libtypes'"]]],
      ['src/lib/community/maps.ts', 'cmaps.js', []],
      [
        'src/lib/community/types.ts',
        'ctypes.js',
        [
          ["from './difficulty'", "from './cdifficulty'"],
          ["'@/lib/types'", "'./libtypes'"],
        ],
      ],
      [
        'src/lib/community/validation.ts',
        'cvalidation.js',
        [
          ["from './config'", "from './cconfig'"],
          ["from './difficulty'", "from './cdifficulty'"],
          ["from './maps'", "from './cmaps'"],
          ["from './types'", "from './ctypes'"],
          ["'@/lib/types'", "'./libtypes'"],
        ],
      ],
      ['src/lib/mockData.ts', 'bank.js', []],
    ];
    for (const [src, dest, rewrites] of files) {
      let code = readFileSync(join(ROOT, src), 'utf8');
      for (const [from, to] of rewrites) code = code.split(from).join(to);
      const js = ts.transpileModule(code, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      }).outputText;
      writeFileSync(join(tmp, dest), js);
    }
    return {
      validation: require(join(tmp, 'cvalidation.js')),
      bank: Object.values(require(join(tmp, 'bank.js')))
        .filter(Array.isArray)
        .flat(),
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** JPEG/PNG/GIF/WEBP magic bytes → extension, else null (photos only). */
function sniffImageExt(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf.length > 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return 'png';
  if (buf.length > 4 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38)
    return 'gif';
  if (
    buf.length > 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp';
  return null;
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** Fetch a remote image with a timeout, content-type check, and size cap. */
async function fetchImage(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`not an image (${contentType || 'missing content-type'})`);
  }
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error(`over ${MAX_IMAGE_BYTES} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** sha256 → '/images/…' path for everything already self-hosted. */
function hashPublicImages() {
  const hashes = new Map();
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && sniffImageExt(readFileSync(full))) {
        hashes.set(sha256(readFileSync(full)), `/${relative(PUBLIC_DIR, full)}`);
      }
    }
  };
  walk(join(PUBLIC_DIR, 'images'));
  return hashes;
}

const normalizePrompt = (prompt) => prompt.trim().replace(/\s+/g, ' ').toLowerCase();

async function main() {
  if (!existsSync(manifestPath)) {
    console.error(`manifest not found: ${manifestPath}`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.format !== 'tarkov-map-learner-export' || !Array.isArray(manifest.questions)) {
    console.error('not a question-export manifest (bad format or missing questions[])');
    process.exit(1);
  }
  const { validation, bank } = loadValidation();
  const bankPrompts = new Set(bank.map((q) => normalizePrompt(q.prompt)));
  const imageHashes = hashPublicImages();
  const nextId = {};
  for (const q of bank) {
    const match = /^([a-z]+)-(\d+)$/.exec(q.id);
    if (match) nextId[match[1]] = Math.max(nextId[match[1]] ?? 0, Number(match[2]));
  }

  const merged = [];
  const skipped = [];
  for (const [index, entry] of manifest.questions.entries()) {
    const tag = entry.submissionId ?? `#${index}`;
    const draft = entry.draft;
    if (!draft || typeof draft !== 'object') {
      skipped.push(`${tag}: entry has no draft`);
      continue;
    }
    const errors = validation.validateDraft(draft);
    const problems = Object.values(errors);
    if (problems.length > 0) {
      skipped.push(`${tag}: invalid draft — ${problems.join('; ')}`);
      continue;
    }
    if (bankPrompts.has(normalizePrompt(draft.prompt))) {
      skipped.push(`${tag}: exact prompt already in the bank`);
      continue;
    }
    const prefix = ID_PREFIX[draft.mapId];
    if (!prefix) {
      skipped.push(`${tag}: unknown map ${JSON.stringify(draft.mapId)}`);
      continue;
    }

    // Images: remote URLs get downloaded + self-hosted; existing
    // /images/… paths are verified and kept (or deduped by hash).
    // (Skips below `continue` before the id counter advances.)
    const id = `${prefix}-${String((nextId[prefix] ?? 0) + 1).padStart(2, '0')}`;
    let imageUrl;
    const ref = draft.imageUrl?.trim();
    if (ref) {
      if (ref.startsWith('/images/')) {
        const full = join(PUBLIC_DIR, ref);
        if (!existsSync(full) || !statSync(full).isFile()) {
          skipped.push(`${tag}: local image missing: ${ref}`);
          continue;
        }
        const bytes = readFileSync(full);
        if (!sniffImageExt(bytes)) {
          skipped.push(`${tag}: local file is not a photo: ${ref}`);
          continue;
        }
        imageUrl = imageHashes.get(sha256(bytes)) ?? ref;
      } else {
        if (DRY_RUN) {
          console.log(`  would fetch image for ${tag}: ${ref.slice(0, 80)}`);
          continue;
        }
        let bytes;
        try {
          bytes = await fetchImage(ref);
        } catch (error) {
          skipped.push(`${tag}: image fetch failed — ${error.message}`);
          continue;
        }
        const ext = sniffImageExt(bytes);
        if (!ext) {
          skipped.push(`${tag}: downloaded file is not a photo (jpeg/png/gif/webp only)`);
          continue;
        }
        const hash = sha256(bytes);
        const dupe = imageHashes.get(hash);
        if (dupe) {
          imageUrl = dupe;
          console.log(`  reusing existing image for ${tag}: ${dupe}`);
        } else {
          const relPath = `/images/${draft.mapId}/${id}.${ext}`;
          const dest = join(PUBLIC_DIR, relPath);
          mkdirSync(dirname(dest), { recursive: true });
          try {
            writeFileSync(dest, bytes, { flag: 'wx' });
          } catch {
            skipped.push(`${tag}: ${relPath} already exists — clean up and retry`);
            continue;
          }
          imageHashes.set(hash, relPath);
          imageUrl = relPath;
        }
      }
    }

    nextId[prefix] = (nextId[prefix] ?? 0) + 1;
    bankPrompts.add(normalizePrompt(draft.prompt));
    merged.push(validation.draftToQuestion({ ...draft, ...(imageUrl ? { imageUrl } : {}) }, id));
    console.log(`  + ${id} (${draft.mapId}, ${draft.type}): ${draft.prompt.slice(0, 70)}`);
  }

  for (const note of skipped) console.log(`  - skip: ${note}`);
  if (DRY_RUN) {
    console.log(`\ndry run: ${merged.length} would merge, ${skipped.length} skipped, nothing written`);
    return;
  }
  if (merged.length > 0) {
    const source = readFileSync(BANK_PATH, 'utf8');
    const tail = source.lastIndexOf('];');
    if (tail === -1) {
      console.error(`could not find the bank array in ${BANK_PATH}`);
      process.exit(1);
    }
    const entries = merged
      .map((q) =>
        JSON.stringify(q, null, 2)
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n')
      )
      .join(',\n');
    const block = source.includes(MARKER) ? entries : `${MARKER}\n${entries}`;
    writeFileSync(BANK_PATH, `${source.slice(0, tail).replace(/\s+$/, '')},\n${block}\n];\n`);
    console.log(`\nwrote ${merged.length} question(s) to ${relative(ROOT, BANK_PATH)}`);
  } else {
    console.log('\nnothing to merge');
  }
  if (skipped.length > 0) console.log(`${skipped.length} skipped (see notes above)`);
  console.log('next: npm run validate, review the diff, commit.');
}

await main();
