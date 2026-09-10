#!/usr/bin/env node
/**
 * Question-bank validator — so a broken bank can never ship.
 *
 *   npm run validate                    # integrity + live image checks
 *   npm run validate -- --skip-images   # integrity only (offline / flaky network)
 *   SKIP_IMAGE_CHECK=1 npm run validate # same, via env
 *
 * Runs automatically before every build (`prebuild` in package.json).
 *
 * Reads src/lib/mockData.ts by transpiling it with the project's own
 * TypeScript compiler (no new dependencies). Every exported array is
 * treated as a question bank and validated.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, transpileFiles } from './transpile.mjs';
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const DIFFICULTIES = ['essential', 'enlightened', 'sherpa', 'immortal'];
const IMAGE_TIMEOUT_MS = 10000;
const SKIP_IMAGES =
  process.argv.includes('--skip-images') ||
  process.env.SKIP_IMAGE_CHECK === '1';

/** Transpile + load every array exported from src/lib/mockData.ts. */
function loadBanks() {
  const t = transpileFiles(
    [
      ['src/lib/types.ts', 'types.js', []],
      ['src/lib/mockData.ts', 'mockData.js', []],
    ],
    'qbank-'
  );
  try {
    const mod = t.require('mockData.js');
    return Object.entries(mod).filter(([, value]) => Array.isArray(value));
  } finally {
    t.cleanup();
  }
}

/** Errors break the app; warnings are quality issues. Returns both lists. */
function validateBank(name, questions) {
  const errors = [];
  const warnings = [];
  const ids = new Set();

  questions.forEach((q, i) => {
    if (q === null || typeof q !== 'object') {
      errors.push(`${name}[${i}]: not an object`);
      return;
    }
    const where = q.id ?? `${name}[${i}]`;

    if (!q.id) {
      errors.push(`${name}[${i}]: missing id`);
    } else if (ids.has(q.id)) {
      errors.push(`${where}: duplicate id in ${name}`);
    } else {
      ids.add(q.id);
    }

    if (!q.prompt) errors.push(`${where}: missing prompt`);

    if (!Array.isArray(q.options) || q.options.length < 2) {
      errors.push(`${where}: needs 2+ options`);
    } else {
      if (!q.options.includes(q.correctAnswer)) {
        errors.push(`${where}: correctAnswer is not one of the options`);
      }
      if (new Set(q.options).size !== q.options.length) {
        warnings.push(`${where}: duplicate options`);
      }
    }

    if (
      q.type === 'compass_check' &&
      Array.isArray(q.options) &&
      !q.options.every((o) => COMPASS.includes(o))
    ) {
      errors.push(`${where}: invalid compass value`);
    }
    if (q.type === 'extract_logic' && !q.spawnLocation) {
      errors.push(`${where}: missing spawnLocation`);
    }

    if (!DIFFICULTIES.includes(q.difficulty)) {
      errors.push(`${where}: difficulty must be one of ${DIFFICULTIES.join(', ')}`);
    }

    if (!q.mapId) warnings.push(`${where}: missing mapId`);
    if (!q.explanation) warnings.push(`${where}: missing explanation`);
    if (!q.tip) warnings.push(`${where}: missing tip`);
    if (q.type === 'landmark_mc' && !q.imageUrl) {
      errors.push(`${where}: landmark without image — the picture is the question`);
    }
  });

  return { errors, warnings };
}

/** JPEG/PNG/GIF/WEBP magic bytes (photos only — same rule as the merge script). */
function sniffImageExt(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
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

/** True when the URL serves an image (follows redirects, 10s timeout). */
async function checkImageUrl(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });
  await res.arrayBuffer();
  return res.ok;
}

async function main() {
  const banks = loadBanks();
  if (banks.length === 0) {
    console.error('No question banks (exported arrays) in src/lib/mockData.ts');
    process.exitCode = 1;
    return;
  }

  const errors = [];
  const warnings = [];
  const globalIds = new Map(); // id -> bank name

  for (const [name, questions] of banks) {
    console.log(`\nBank ${name}: ${questions.length} questions`);
    const result = validateBank(name, questions);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    for (const q of questions) {
      if (q?.id) {
        if (globalIds.has(q.id)) {
          errors.push(
            `${q.id}: duplicate id across banks (${globalIds.get(q.id)} + ${name})`
          );
        } else {
          globalIds.set(q.id, name);
        }
      }
    }
  }

  if (SKIP_IMAGES) {
    console.log('\nSkipping image checks (--skip-images)');
  } else {
    console.log('\nChecking images…');
    for (const [, questions] of banks) {
      for (const q of questions) {
        if (!q?.imageUrl) continue;
        if (q.imageUrl.startsWith('/images/')) {
          const full = join(ROOT, 'public', q.imageUrl);
          if (!existsSync(full) || !statSync(full).isFile()) {
            errors.push(`${q.id}: self-hosted image missing (${q.imageUrl})`);
          } else if (!sniffImageExt(readFileSync(full))) {
            errors.push(`${q.id}: self-hosted file is not a photo (${q.imageUrl})`);
          } else {
            console.log(`  ok ${q.id} (self-hosted)`);
          }
          continue;
        }
        try {
          if (await checkImageUrl(q.imageUrl)) {
            console.log(`  ok ${q.id}`);
          } else {
            errors.push(`${q.id}: image unreachable (${q.imageUrl})`);
          }
        } catch (err) {
          errors.push(`${q.id}: image check failed (${err.cause?.code ?? err.name})`);
        }
      }
    }
  }

  for (const w of warnings) console.log(`  warn: ${w}`);
  for (const e of errors) console.error(`  error: ${e}`);

  const total = banks.reduce((n, [, qs]) => n + qs.length, 0);
  if (errors.length > 0) {
    console.error(
      `\nINVALID: ${total} questions, ${errors.length} error(s), ${warnings.length} warning(s)`
    );
    process.exitCode = 1;
  } else {
    console.log(
      `\nVALID: ${total} questions, 0 errors, ${warnings.length} warning(s)`
    );
  }
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  await main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

export { loadBanks, validateBank, checkImageUrl };
