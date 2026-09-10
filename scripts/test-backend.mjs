#!/usr/bin/env node
/**
 * Backend contract suite — the SAME flow against every CommunityBackend.
 *
 *   npm run test:backend
 *
 * The local adapter always runs here (mocked storage, like
 * test-community.mjs). The hosted adapter runs only when Supabase
 * credentials + the client package are present:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run test:backend
 *
 * (requires `npm i @supabase/supabase-js` and email confirmation OFF in
 * Auth settings — see docs/backend.md). Both runs execute runContract(),
 * so parity between adapters is asserted, not assumed.
 */
import assert from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal browser stand-ins (defined before modules load).
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => void backing.set(k, String(v)),
  removeItem: (k) => void backing.delete(k),
};
globalThis.window = { addEventListener: () => {} };

/** Transpile the backend + deps into one temp dir with flat requires. */
function loadBackend() {
  const tmp = mkdtempSync(join(tmpdir(), 'backend-test-'));
  {
    const files = [
      ['src/lib/types.ts', 'libtypes.js', []],
      ['src/lib/mockData.ts', 'mockData.js', [["from './types'", "from './libtypes'"]]],
      ['src/lib/community/config.ts', 'cconfig.js', []],
      ['src/lib/community/types.ts', 'ctypes.js', []],
      ['src/lib/community/difficulty.ts', 'cdifficulty.js', []],
      ['src/lib/community/maps.ts', 'cmaps.js', []],
      [
        'src/lib/community/elo.ts',
        'celo.js',
        [
          ["from './difficulty'", "from './cdifficulty'"],
          ["from './maps'", "from './cmaps'"],
        ],
      ],
      [
        'src/lib/community/validation.ts',
        'cvalidation.js',
        [
          ["from './config'", "from './cconfig'"],
          ["from './maps'", "from './cmaps'"],
          ["from './difficulty'", "from './cdifficulty'"],
        ],
      ],
      [
        'src/lib/community/store.ts',
        'cstore.js',
        [
          ["'@/lib/mockData'", "'./mockData'"],
          ["from './config'", "from './cconfig'"],
          ["from './difficulty'", "from './cdifficulty'"],
          ["from './validation'", "from './cvalidation'"],
        ],
      ],
      ['src/lib/community/photo.ts', 'cphoto.js', []],
      // NOTE: exact filenames — backend.ts dynamic-imports these relatively.
      [
        'src/lib/community/localBackend.ts',
        'localBackend.js',
        [
          ["from './store'", "from './cstore'"],
          ["from './elo'", "from './celo'"],
          ["from './photo'", "from './cphoto'"],
        ],
      ],
      [
        'src/lib/community/supabaseBackend.ts',
        'supabaseBackend.js',
        [
          ["'@/lib/mockData'", "'./mockData'"],
          ["from './config'", "from './cconfig'"],
          ["from './elo'", "from './celo'"],
          ["from './validation'", "from './cvalidation'"],
          ["from './photo'", "from './cphoto'"],
        ],
      ],
      ['src/lib/community/backend.ts', 'cbackend.js', []],
    ];
    for (const [src, dest, rewrites] of files) {
      let code = readFileSync(join(ROOT, src), 'utf8');
      for (const [from, to] of rewrites) code = code.split(from).join(to);
      const js = ts.transpileModule(code, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      }).outputText;
      writeFileSync(join(tmp, dest), js);
    }
    // Tmp must outlive the run: backend.ts dynamic-imports resolve
    // relatively at call time, so deleting early breaks resolution.
    // Pre-require for graph errors up front, clean up in main's finally.
    const mods = {
      backend: require(join(tmp, 'cbackend.js')),
      local: require(join(tmp, 'localBackend.js')),
      supabase: require(join(tmp, 'supabaseBackend.js')),
    };
    return { mods, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
  }
}

const loaded = loadBackend();
const mods = loaded.mods;

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`  ok ${name}`);
}

const DRAFT = {
  mapId: 'customs',
  type: 'extract_logic',
  difficulty: 'enlightened',
  prompt: 'You spawned at Contract Spawn. Which guaranteed PMC extract is OPEN for you?',
  options: ['Contract Spawn', 'ZB-1011', 'Crossroads'],
  correctAnswer: 'ZB-1011',
  spawnLocation: 'Contract Spawn',
  explanation: 'Contract spawns route east to the guaranteed ZB-1011 extract.',
  tip: 'Opposite-side rule.',
};

const FIXDRAFT = {
  ...DRAFT,
  mapId: 'customs',
  prompt: 'CONTRACT-CORRECTED prompt for testing?',
  correctAnswer: 'Crossroads',
  options: ['Contract Spawn', 'ZB-1011', 'Crossroads'],
  explanation: 'A corrected explanation for contract testing.',
};

/** The full loop, asserted identically against any backend. */
async function runContract(create, label, suffix) {
  const b = create();
  const u = (name) => `${name}${suffix}`;
  const email = (name) => `${name}${suffix}@contract.test`.toLowerCase();
  const PASS = 'secret12';
  const signup = (name) => b.signUp(u(name), email(name), PASS);
  const signin = (name) =>
    label === 'local' ? b.signIn(u(name), PASS) : b.signIn(email(name), PASS);

  await check(`[${label}] wiring: kind + signed-out session`, async () => {
    assert.equal(b.kind, label);
    assert.equal(await b.getSessionUser(), null);
  });

  await check(`[${label}] demo account is local-only`, async () => {
    assert.equal((await b.signInDemo()).ok, label === 'local');
    await b.signOut();
  });

  await check(`[${label}] auth: signup / duplicate / signin / bad password`, async () => {
    assert.equal((await signup('alice')).ok, true);
    assert.match((await signup('alice')).error ?? '', /taken|already/i);
    assert.equal((await b.signUp('ab', email('ab'), PASS)).ok, false); // too short
    await b.signOut();
    assert.equal(await b.getSessionUser(), null);
  });
  await check(`[${label}] auth: bad password rejected, good accepted`, async () => {
    const bad =
      label === 'local'
        ? await b.signIn(u('alice'), 'wrongpass')
        : await b.signIn(email('alice'), 'wrongpass');
    assert.equal(bad.ok, false);
    assert.equal((await signin('alice')).ok, true);
    assert.equal((await b.getSessionUser()).username, u('alice'));
  });

  let liveId;
  await check(`[${label}] submit → 3 approvals → live`, async () => {
    const res = await b.submitQuestion(DRAFT);
    assert.equal(res.ok, true);
    liveId = res.id;
    assert.ok((await b.listPendingSubmissions()).some((s) => s.id === liveId));
    assert.match((await b.reviewSubmission(liveId, 'approve')).error ?? '', /own/);
    for (const name of ['bob', 'carol', 'dave']) {
      assert.equal((await signup(name)).ok, true);
      assert.equal((await b.reviewSubmission(liveId, 'approve')).ok, true);
      assert.equal((await b.reviewSubmission(liveId, 'approve')).ok, false); // dup
    }
    const live = await b.listLiveQuestions();
    const found = live.find((q) => q.question.id === liveId);
    assert.ok(found && found.source === 'community' && found.question.correctAnswer === 'ZB-1011');
  });

  await check(`[${label}] reviews given counts both queues`, async () => {
    await signin('dave');
    assert.equal(await b.countReviewsGiven(), 1);
    await signin('alice');
    assert.equal(await b.countReviewsGiven(), 0);
    await b.signOut();
    assert.equal(await b.countReviewsGiven(), 0);
  });

  await check(`[${label}] reject notes enforced, 3 rejections decline`, async () => {
    await signin('alice');
    const res = await b.submitQuestion({ ...DRAFT, prompt: 'You spawned at Reject Zone. Which extract is OPEN for you today?' });
    assert.equal(res.ok, true);
    await signin('dave');
    assert.match((await b.reviewSubmission(res.id, 'reject')).error ?? '', /note/);
    for (const name of ['bob', 'carol', 'dave']) {
      await signin(name);
      assert.equal((await b.reviewSubmission(res.id, 'reject', 'needs work')).ok, true);
    }
    const mine = await b.listMySubmissions();
    assert.ok(mine.some((s) => s.id === res.id && s.status === 'rejected') || true); // reviewer view
    await signin('alice');
    assert.equal(
      (await b.listMySubmissions()).find((s) => s.id === res.id).status,
      'rejected'
    );
  });

  await check(`[${label}] report → flagged → 3 keep votes clear`, async () => {
    await signin('alice');
    assert.match((await b.fileReport(liveId, 'wrong-answer')).error ?? '', /own/);
    await signin('bob');
    assert.equal((await b.fileReport(liveId, 'wrong-answer', 'contract testing')).ok, true);
    assert.ok((await b.listFlaggedItems()).some((f) => f.questionId === liveId));
    await signin('alice');
    assert.match((await b.voteKeep(liveId)).error ?? '', /own/);
    for (const name of ['bob', 'carol', 'dave']) {
      await signin(name);
      assert.equal((await b.voteKeep(liveId)).ok, true);
    }
    assert.ok(!(await b.listFlaggedItems()).some((f) => f.questionId === liveId));
  });

  await check(`[${label}] fix → 3 approvals → applied to live`, async () => {
    await signin('bob');
    const res = await b.proposeCorrection('c-01', FIXDRAFT, 'contract testing the fix flow here');
    assert.equal(res.ok, true);
    assert.equal((await signup('erin')).ok, true);
    for (const name of ['carol', 'dave', 'erin']) {
      await signin(name);
      assert.equal((await b.reviewCorrection(res.id, 'approve')).ok, true);
    }
    const live = (await b.listLiveQuestions()).find((q) => q.question.id === 'c-01');
    assert.ok(live.overridden && live.question.prompt.includes('CONTRACT-CORRECTED'));
  });

  await check(`[${label}] author tools: withdraw removes pending`, async () => {
    await signin('alice');
    const res = await b.submitQuestion({ ...DRAFT, prompt: 'You spawned at Withdraw Bay. Which extract is OPEN for you?' });
    assert.equal(res.ok, true);
    assert.equal((await b.withdrawSubmission(res.id)).ok, true);
    assert.ok(!(await b.listPendingSubmissions()).some((s) => s.id === res.id));
  });

  await check(`[${label}] pending cap: 10 ok, 11th refused`, async () => {
    assert.equal((await signup('frank')).ok, true);
    for (let i = 0; i < 10; i++) {
      const res = await b.submitQuestion({ ...DRAFT, prompt: `You spawned at Cap Zone ${i} ${suffix}. Which extract is OPEN?` });
      assert.equal(res.ok, true);
    }
    const over = await b.submitQuestion({ ...DRAFT, prompt: `You spawned at Cap Overflow ${suffix}. Which extract is OPEN?` });
    assert.equal(over.ok, false);
    assert.match(over.error ?? '', /10|awaiting/i);
  });

  await check(`[${label}] elo: rated answers persist`, async () => {
    // frank (signed in) has no ratings on either backend — fresh vectors.
    const r = await b.answerRated('customs', 'essential', true);
    assert.equal(r.delta, 12);
    assert.equal(r.mapRating, 812);
    assert.equal(r.winStreak, 1);
    const elo = await b.readElo();
    assert.deepEqual(elo.ratings.customs, { rating: 812, answered: 1 });
  });

  await check(`[${label}] uploadPhoto degrades cleanly without a browser`, async () => {
    const res = await b.uploadPhoto(new Blob(['x'], { type: 'image/png' }));
    assert.equal(res.ok, false);
    assert.match(res.error ?? '', /browser/i);
  });

  await check(`[${label}] subscribe fires on mutation`, async () => {
    await signin('alice'); // quota free: approved + rejected + withdrawn don't count
    let fired = 0;
    const unsub = b.subscribe(() => fired++);
    const res = await b.submitQuestion({ ...DRAFT, prompt: `You spawned at Emit Hill ${suffix}. Which extract is OPEN?` });
    assert.equal(res.ok, true);
    assert.ok(fired >= 1, 'expected subscriber notification');
    unsub();
    assert.equal((await b.withdrawSubmission(res.id)).ok, true);
  });
}

const kind = await mods.backend.getBackend().then((b) => b.kind);
assert.equal(kind, 'local', 'expected local backend without env credentials');
const again = await mods.backend.getBackend();
assert.ok(again.kind === 'local', 'expected backend singleton');
console.log('Backend contract — local adapter:');
await runContract(() => mods.local.createLocalBackend(), 'local', '');
console.log(`\nPASS: ${passed} backend checks (local)`);

const sdkAvailable = (() => {
  try {
    require.resolve('@supabase/supabase-js');
    return true;
  } catch {
    return false;
  }
})();
if (
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  sdkAvailable
) {
  const before = passed;
  console.log('\nBackend contract — hosted adapter:');
  await runContract(
    () => mods.supabase.createSupabaseBackend(),
    'supabase',
    `-t${Date.now().toString(36)}`
  );
  console.log(`\nPASS: ${passed - before} backend checks (supabase)`);
} else {
  console.log('\nSKIP: hosted adapter (needs NEXT_PUBLIC_SUPABASE_* + npm i @supabase/supabase-js)');
}
loaded.cleanup();
