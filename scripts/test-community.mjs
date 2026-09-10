#!/usr/bin/env node
/**
 * Community-ecosystem logic test — the self-sustaining loop, end to end.
 *
 *   npm run test:community
 *
 * Exercises the real store (`src/lib/community/store.ts`, transpiled with
 * the project's own TypeScript compiler like `validate-questions.mjs`)
 * against a mocked localStorage: accounts, submit → 3 approvals → pool,
 * reject ×3 → declined, report → flagged, fix ×3 → applied, keep ×3 →
 * flag cleared, plus every anti-abuse rule (no self-review, one
 * review/report/vote per player).
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

// Minimal browser stand-ins (defined before the store loads).
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => void backing.set(k, String(v)),
  removeItem: (k) => void backing.delete(k),
};
globalThis.window = { addEventListener: () => {} };

/** Transpile the store + its deps into one temp dir with flat requires. */
function loadStore() {
  const tmp = mkdtempSync(join(tmpdir(), 'community-test-'));
  try {
    const files = [
      ['src/lib/types.ts', 'libtypes.js', []],
      ['src/lib/mockData.ts', 'mockData.js', [["from './types'", "from './libtypes'"]]],
      ['src/lib/community/config.ts', 'cconfig.js', []],
      ['src/lib/community/types.ts', 'ctypes.js', [["'@/lib/types'", "'./libtypes'"]]],
      ['src/lib/community/difficulty.ts', 'cdifficulty.js', [["'@/lib/types'", "'./libtypes'"]]],
      ['src/lib/community/maps.ts', 'cmaps.js', []],
      [
        'src/lib/community/elo.ts',
        'celo.js',
        [
          ["from './difficulty'", "from './cdifficulty'"],
          ["from './maps'", "from './cmaps'"],
          ["'@/lib/types'", "'./libtypes'"],
        ],
      ],
      [
        'src/lib/community/validation.ts',
        'cvalidation.js',
        [
          ["from './config'", "from './cconfig'"],
          ["from './maps'", "from './cmaps'"],
          ["from './difficulty'", "from './cdifficulty'"],
          ["from './types'", "from './ctypes'"],
          ["'@/lib/types'", "'./libtypes'"],
        ],
      ],
      [
        'src/lib/community/store.ts',
        'cstore.js',
        [
          ["'@/lib/mockData'", "'./mockData'"],
          ["'@/lib/types'", "'./libtypes'"],
          ["from './config'", "from './cconfig'"],
          ["from './difficulty'", "from './cdifficulty'"],
          ["from './types'", "from './ctypes'"],
          ["from './validation'", "from './cvalidation'"],
        ],
      ],
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
      store: require(join(tmp, 'cstore.js')),
      elo: require(join(tmp, 'celo.js')),
      maps: require(join(tmp, 'cmaps.js')),
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const first = loadStore();
const store = first.store;
const elo = first.elo;
const maps = first.maps;

/** A freshly-required store module (new tmp paths = no require-cache hit). */
function reloadStore() {
  return loadStore().store;
}
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok ${name}`);
}

const DRAFT = {
  mapId: 'customs',
  type: 'extract_logic',
  difficulty: 'enlightened',
  prompt: 'You spawned at Test Spawn. Which guaranteed PMC extract is OPEN for you?',
  options: ['Test Spawn', 'ZB-1011', 'Crossroads', 'Dorms V-Ex'],
  correctAnswer: 'ZB-1011',
  spawnLocation: 'Test Spawn',
  explanation: 'Test spawns route east to the guaranteed ZB-1011 extract.',
  tip: 'Opposite-side rule.',
};

// 1 — seed content makes every queue explorable on first run.
check('seed: pending submissions, flagged question, pending fix', () => {
  const s = store.getState();
  assert.ok(store.pendingSubmissions(s).length >= 2, 'expected seeded pending submissions');
  assert.ok(store.isFlagged(s, 'c-12'), 'expected c-12 to be flagged by seed report');
  assert.ok(store.pendingCorrections(s).length >= 1, 'expected seeded pending fix');
});

// 2 — accounts.
check('auth: signup / duplicate / signin / bad password', () => {
  assert.equal(store.signUp('alice', 'secret12').ok, true);
  assert.equal(store.signUp('alice', 'otherpass').ok, false); // taken
  assert.equal(store.signUp('ab', 'secret12').ok, false); // too short
  store.signOut();
  assert.equal(store.signIn('alice', 'wrongpass').ok, false);
  assert.equal(store.signIn('alice', 'secret12').ok, true);
  assert.equal(store.getSessionUser(store.getState()).username, 'alice');
});

// 3 — submit requires an account + a valid draft.
check('submit: gated + validated', () => {
  store.signOut();
  assert.equal(store.submitQuestion(DRAFT).ok, false);
  store.signIn('alice', 'secret12');
  assert.equal(store.submitQuestion({ ...DRAFT, correctAnswer: '' }).ok, false);
  assert.equal(store.submitQuestion({ ...DRAFT, difficulty: undefined }).ok, false);
  assert.equal(store.submitQuestion({ ...DRAFT, difficulty: 'godlike' }).ok, false);
  assert.equal(store.submitQuestion({ ...DRAFT, type: 'landmark_mc' }).ok, false); // photo required
  assert.equal(
    store.submitQuestion({ ...DRAFT, type: 'landmark_mc', imageUrl: 'https://example.com/photo.jpg' }).ok,
    true
  );
  assert.equal(
    store.submitQuestion({ ...DRAFT, type: 'landmark_mc', imageUrl: '/images/customs/c-05.jpg' }).ok,
    true
  ); // self-hosted refs stay valid
  const res = store.submitQuestion(DRAFT);
  assert.equal(res.ok, true);
  globalThis.__subId = res.id;
  assert.equal(store.resolveQuestion(store.getState(), res.id), null); // not live yet
});

// 4 — three approvals publish; fourth reviewer / dupes / self-review blocked.
check('review: 3 approvals publish to the pool', () => {
  const id = globalThis.__subId;
  assert.match(store.reviewSubmission(id, 'approve').error ?? '', /own submission/);
  for (const [name, pass] of [['bob', 'secret12'], ['carol', 'secret12'], ['dave', 'secret12']]) {
    store.signUp(name, pass);
    assert.equal(store.reviewSubmission(id, 'approve').ok, true);
    assert.equal(store.reviewSubmission(id, 'approve').ok, false); // dup review
  }
  const sub = store.getState().submissions.find((s) => s.id === id);
  assert.equal(sub.status, 'approved');
  const live = store.resolveQuestion(store.getState(), id);
  assert.ok(live && live.source === 'community' && live.question.correctAnswer === 'ZB-1011');
  assert.ok(store.getLiveQuestions(store.getState()).some((q) => q.question.id === id));
  // The author's picked map flows through submit → publish untouched.
  store.signIn('alice', 'secret12');
  const w = store.submitQuestion({ ...DRAFT, mapId: 'woods', prompt: 'You spawned at Woods Test. Which extract is OPEN?' });
  assert.equal(w.ok, true);
  assert.equal(store.getState().submissions.find((s) => s.id === w.id).draft.mapId, 'woods');
  for (const name of ['bob', 'carol', 'dave']) {
    store.signIn(name, 'secret12');
    assert.equal(store.reviewSubmission(w.id, 'approve').ok, true);
  }
  assert.equal(store.resolveQuestion(store.getState(), w.id).question.mapId, 'woods');
  // Export carries approved work only (alice's two; bob has none approved).
  const aliceId = store.getState().users.find((u) => u.username === 'alice').id;
  const payload = store.buildExportPayload(store.getState(), aliceId);
  assert.equal(payload.format, 'tarkov-map-learner-export');
  assert.equal(payload.questions.length, 2);
  assert.deepEqual(
    payload.questions.map((q) => q.draft.mapId).sort(),
    ['customs', 'woods']
  );
  const bobId = store.getState().users.find((u) => u.username === 'bob').id;
  assert.equal(store.buildExportPayload(store.getState(), bobId).questions.length, 0);
});

// 5 — three rejections decline.
check('review: 3 rejections decline', () => {
  store.signIn('alice', 'secret12');
  const res = store.submitQuestion({ ...DRAFT, prompt: 'You spawned at Bad Spawn. Which extract is OPEN?' });
  assert.equal(res.ok, true);
  for (const name of ['bob', 'carol', 'dave']) {
    store.signIn(name, 'secret12');
    assert.equal(store.reviewSubmission(res.id, 'reject', 'needs work').ok, true);
  }
  assert.equal(store.getState().submissions.find((s) => s.id === res.id).status, 'rejected');
});

// 6 — report flags; dupe report blocked; 3 keep-votes clear the flag.
check('report + keep votes: flag then community overrule', () => {
  store.signIn('bob', 'secret12');
  assert.equal(store.fileReport('c-01', 'wrong-answer', 'testing').ok, true);
  assert.ok(store.isFlagged(store.getState(), 'c-01'));
  assert.equal(store.fileReport('c-01', 'other').ok, false); // dupe
  store.signIn('carol', 'secret12');
  assert.equal(store.voteKeep('c-01').ok, true);
  assert.equal(store.voteKeep('c-01').ok, false); // dupe vote
  store.signIn('dave', 'secret12');
  assert.equal(store.voteKeep('c-01').ok, true);
  store.signIn('alice', 'secret12');
  assert.equal(store.voteKeep('c-01').ok, true); // 3rd clears
  assert.ok(!store.isFlagged(store.getState(), 'c-01'));
  const reports = store.getState().reports.filter((r) => r.questionId === 'c-01');
  assert.ok(reports.length > 0 && reports.every((r) => r.status === 'dismissed'));
});

// 7 — corrections: validated, peer-reviewed, applied to live questions.
check('fix: 3 approvals patch the live question + resolve reports', () => {
  store.signIn('bob', 'secret12');
  assert.equal(store.fileReport('c-02', 'wrong-answer').ok, true);
  store.signIn('alice', 'secret12');
  const before = store.resolveQuestion(store.getState(), 'c-02').question;
  // No-op fix + short reason blocked.
  const noop = {
    mapId: 'customs', type: before.type, difficulty: before.difficulty, prompt: before.prompt,
    options: [...before.options], correctAnswer: before.correctAnswer,
    explanation: before.explanation ?? 'x', tip: before.tip,
  };
  // (draftsEqual is in validation; proposeCorrection enforces reason length)
  assert.equal(store.proposeCorrection('c-02', { ...noop, prompt: before.prompt + ' (fixed?)' }, 'short').ok, false);
  const fixed = { ...noop, mapId: 'woods', prompt: before.prompt + ' (fixed?)', explanation: 'A corrected explanation for testing.' };
  const res = store.proposeCorrection('c-02', fixed, 'testing the fix flow thoroughly');
  assert.equal(res.ok, true);
  assert.match(store.reviewCorrection(res.id, 'approve').error ?? '', /own fix/);
  for (const name of ['bob', 'carol', 'dave']) {
    store.signIn(name, 'secret12');
    assert.equal(store.reviewCorrection(res.id, 'approve').ok, true);
  }
  const after = store.resolveQuestion(store.getState(), 'c-02');
  assert.ok(after.overridden && after.question.prompt.endsWith('(fixed?)'));
  assert.equal(after.question.mapId, 'woods'); // fixes can re-map a misfiled question
  assert.ok(!store.isFlagged(store.getState(), 'c-02')); // reports auto-resolved
});

// 8 — demo account + persistence across reloads.
check('demo account + localStorage persistence', () => {
  assert.equal(store.signInDemo().ok, true);
  assert.equal(store.getSessionUser(store.getState()).username, 'demo');
  const raw = backing.get('tarkov-map-learner-community-v1');
  assert.ok(raw && JSON.parse(raw).version === store.COMMUNITY_STATE_VERSION, 'expected persisted versioned state');
});

// 9 — ELO: per-map ratings, played-maps overall, global streaks.
check('elo: per-map ratings, overall, streaks, migration', () => {
  // Fresh: every map starts 800/0, overall 800, zero breadth.
  const fresh = { ratings: {}, winStreak: 0 };
  assert.deepEqual(elo.mapRatingFor(fresh, 'woods'), { rating: 800, answered: 0 });
  assert.deepEqual(elo.overallRating(fresh), { rating: 800, mapsPlayed: 0, mapsEstablished: 0 });

  // A customs win moves customs only; woods stays untouched.
  let r = elo.applyEloAnswer(fresh, 'customs', 'essential', true);
  assert.equal(r.delta, 12);
  assert.equal(r.mapRating, 812);
  assert.equal(r.mapAnswered, 1);
  assert.equal(r.winStreak, 1);
  assert.equal(r.bonus, 0);
  assert.equal(r.overall.rating, 812);
  assert.equal(r.overall.mapsPlayed, 1);
  assert.deepEqual(elo.mapRatingFor(r.state, 'woods'), { rating: 800, answered: 0 });

  // Streaks are global: a woods win extends the customs streak.
  r = elo.applyEloAnswer(r.state, 'woods', 'essential', true);
  assert.equal(r.winStreak, 2);
  assert.equal(r.bonus, 2);
  assert.equal(r.delta, 14);
  assert.equal(r.overall.rating, 813);
  assert.equal(r.overall.mapsPlayed, 2);

  // Protection is per map: softened below 1000, full stakes at 1000+.
  const mixed = {
    ratings: { customs: { rating: 999, answered: 50 }, woods: { rating: 1000, answered: 50 } },
    winStreak: 0,
  };
  assert.equal(elo.applyEloAnswer(mixed, 'customs', 'enlightened', false).delta, -5);
  assert.equal(elo.applyEloAnswer(mixed, 'woods', 'enlightened', false).delta, -12);

  // A loss anywhere resets the global streak.
  const hot = { ratings: { customs: { rating: 1200, answered: 50 } }, winStreak: 3 };
  const cold = elo.applyEloAnswer(hot, 'woods', 'sherpa', false);
  assert.equal(cold.winStreak, 0);
  assert.equal(cold.bonus, 0);

  // Established maps rule the overall; dabbling doesn't dilute it.
  const specialist = {
    ratings: { customs: { rating: 2000, answered: 100 }, woods: { rating: 900, answered: 3 } },
    winStreak: 0,
  };
  assert.deepEqual(elo.overallRating(specialist), { rating: 2000, mapsPlayed: 2, mapsEstablished: 1 });
  const generalist = {
    ratings: { customs: { rating: 1600, answered: 20 }, woods: { rating: 1200, answered: 12 } },
    winStreak: 0,
  };
  assert.equal(elo.overallRating(generalist).rating, 1400);
  assert.equal(elo.totalAnswered(generalist), 32);
  assert.deepEqual(
    elo.playedMaps(generalist).map((m) => m.mapId),
    ['customs', 'woods']
  );

  // Round ranks and the per-map floor survive the split.
  assert.equal(elo.rankForRating(999).id, 'essential');
  assert.equal(elo.rankForRating(1000).id, 'enlightened');
  const floored = elo.applyEloAnswer(
    { ratings: { labs: { rating: 100, answered: 5 } }, winStreak: 0 },
    'labs',
    'essential',
    false
  );
  assert.equal(floored.mapRating, 100);
  assert.equal(floored.delta, 0);

  // Map labels never blank, even for unknown ids.
  assert.equal(maps.mapLabel('streets'), 'Streets of Tarkov');
  assert.equal(maps.mapLabel('foo-bar'), 'Foo Bar');

  // Scale-2 flat saves seed every map provisionally, streak kept.
  backing.set(
    'tarkov-map-learner-storage_elo',
    JSON.stringify({ rating: 1100, answered: 20, winStreak: 2, scale: 2 })
  );
  const migrated = elo.readElo();
  assert.equal(migrated.winStreak, 2);
  assert.deepEqual(migrated.ratings.customs, { rating: 1100, answered: 0 });
  assert.equal(Object.keys(migrated.ratings).length, 10);
  assert.equal(elo.overallRating(migrated).rating, 1100);
  assert.equal(elo.overallRating(migrated).mapsPlayed, 0);
  // Scale-1 flat shifts +200 first.
  backing.set('tarkov-map-learner-storage_elo', JSON.stringify({ rating: 900, answered: 20 }));
  assert.equal(elo.readElo().ratings.woods.rating, 1100);
  // Scale-3 passes through untouched.
  backing.set(
    'tarkov-map-learner-storage_elo',
    JSON.stringify({ ratings: { customs: { rating: 1234, answered: 40 } }, winStreak: 3, scale: 3 })
  );
  assert.deepEqual(elo.readElo(), {
    ratings: { customs: { rating: 1234, answered: 40 } },
    winStreak: 3,
    scale: 3,
  });
});

// 10 — integrity: no self-report/self-keep; notes enforced in store.
check('integrity: self-actions blocked, notes enforced', () => {
  const id = globalThis.__subId; // alice's approved submission
  store.signIn('alice', 'secret12');
  assert.match(store.fileReport(id, 'wrong-answer').error ?? '', /own question/);
  store.signIn('bob', 'secret12');
  assert.equal(store.fileReport(id, 'wrong-answer', 'testing self rules').ok, true);
  store.signIn('alice', 'secret12');
  assert.match(store.voteKeep(id).error ?? '', /own question/);
  store.signIn('carol', 'secret12');
  assert.equal(store.voteKeep(id).ok, true); // others unaffected
  store.signIn('alice', 'secret12');
  const r = store.submitQuestion({ ...DRAFT, prompt: 'You spawned at Note Test. Which extract is OPEN?' });
  assert.equal(r.ok, true);
  store.signIn('dave', 'secret12');
  assert.match(store.reviewSubmission(r.id, 'reject', '').error ?? '', /note/);
  assert.match(store.reviewSubmission(r.id, 'reject').error ?? '', /note/);
  assert.equal(store.reviewSubmission(r.id, 'reject', 'needs work').ok, true);
  assert.match(store.fileReport('c-03', 'other', '').error ?? '', /what the problem/);
  assert.match(store.fileReport('c-03', 'other').error ?? '', /what the problem/);
  assert.equal(store.fileReport('c-03', 'other', 'testing the other rule').ok, true);
});

// 11 — authors can edit (restarts review) or withdraw pending work.
check('author tools: edit restarts review, withdraw removes', () => {
  store.signIn('alice', 'secret12');
  const r = store.submitQuestion({ ...DRAFT, mapId: 'woods', prompt: 'You spawned at Edit Test. Which extract is OPEN?', difficulty: 'essential' });
  assert.equal(r.ok, true);
  store.signIn('bob', 'secret12');
  assert.equal(store.reviewSubmission(r.id, 'approve').ok, true);
  assert.match(store.editSubmission(r.id, DRAFT).error ?? '', /own submissions/);
  store.signIn('alice', 'secret12');
  assert.equal(store.editSubmission(r.id, { ...DRAFT, mapId: 'woods', prompt: 'You spawned at Edit Test. Which extract is OPEN?', difficulty: 'sherpa' }).ok, true);
  const sub = store.getState().submissions.find((s) => s.id === r.id);
  assert.equal(sub.draft.difficulty, 'sherpa');
  assert.equal(sub.draft.mapId, 'woods');
  assert.equal(sub.reviews.length, 0);
  assert.equal(store.withdrawSubmission(r.id).ok, true);
  assert.equal(store.getState().submissions.find((s) => s.id === r.id), undefined);
  assert.match(store.editSubmission(globalThis.__subId, DRAFT).error ?? '', /pending/);
  store.signIn('bob', 'secret12');
  const c = store.proposeCorrection('c-04', DRAFT, 'testing correction author tools here');
  assert.equal(c.ok, true);
  store.signIn('carol', 'secret12');
  assert.equal(store.reviewCorrection(c.id, 'approve').ok, true);
  store.signIn('bob', 'secret12');
  assert.equal(store.editCorrection(c.id, { ...DRAFT, mapId: 'woods', difficulty: 'immortal' }, 'updated reason for testing').ok, true);
  const fix = store.getState().corrections.find((x) => x.id === c.id);
  assert.equal(fix.reviews.length, 0);
  assert.equal(fix.reason, 'updated reason for testing');
  assert.equal(fix.draft.mapId, 'woods');
  assert.equal(store.withdrawCorrection(c.id).ok, true);
  assert.equal(store.getState().corrections.find((x) => x.id === c.id), undefined);
});

// 12 — duplicate detection surfaces exact + near matches (never blocks).
check('duplicates: exact + near matches surface, exclusions work', () => {
  const s = store.getState();
  const c03 = 'You spawned at Crossroads (Far West). Which guaranteed PMC extract is OPEN for you?';
  const hits = store.findDuplicates(s, c03);
  assert.ok(hits.some((h) => h.questionId === 'c-03' && h.source === 'official'));
  assert.equal(store.findDuplicates(s, c03, 'c-03').some((h) => h.questionId === 'c-03'), false);
  assert.equal(store.findDuplicates(s, 'Completely unrelated banana question here?').length, 0);
  assert.equal(store.findDuplicates(s, 'short').length, 0);
  assert.ok(store.findDuplicates(s, `${c03} today`).some((h) => h.questionId === 'c-03'));
  store.signIn('alice', 'secret12');
  const pd = store.submitQuestion({ ...DRAFT, prompt: 'You spawned at Dupe Test Zone. Which extract is OPEN for you today?' });
  assert.equal(pd.ok, true);
  const hits2 = store.findDuplicates(store.getState(), 'You spawned at Dupe Test Zone — which extract is OPEN for you today?!');
  assert.ok(hits2.some((h) => h.questionId === pd.id && h.source === 'pending'));
});

// 13 — v1 saves (pre-difficulty) migrate instead of crashing. LAST: re-seeds storage.
check('migration: v1 state backfills difficulty and stays playable', () => {
  backing.set('tarkov-map-learner-community-v1', JSON.stringify({
    version: 1,
    users: [{ id: 'u-mig', username: 'migrant', displayName: 'Migrant', passHash: 'seeded', createdAt: '2026-01-01T00:00:00.000Z' }],
    sessionUserId: null,
    submissions: [{
      id: 'u-migq', status: 'approved', authorId: 'u-mig', authorName: 'Migrant',
      createdAt: '2026-01-02T00:00:00.000Z', decidedAt: '2026-01-03T00:00:00.000Z', reviews: [],
      draft: { mapId: 'customs', type: 'landmark_mc', prompt: 'Migrated question?', options: ['A', 'B'], correctAnswer: 'A', explanation: 'An old explanation here.' },
    }],
    corrections: [], reports: [], keepVotes: {}, overrides: {},
  }));
  const fresh = reloadStore();
  const fs = fresh.getState();
  assert.equal(fs.version, 2);
  const live = fresh.resolveQuestion(fs, 'u-migq');
  assert.equal(live.question.difficulty, 'essential');
  assert.ok(fresh.getLiveQuestions(fs).some((q) => q.question.id === 'u-migq'));
  const r = elo.applyEloAnswer(
    { ratings: { customs: { rating: 600, answered: 0 } }, winStreak: 0 },
    live.question.mapId,
    live.question.difficulty,
    true
  );
  assert.equal(r.delta, 24); // provisional K=48 at 50/50
  assert.equal(JSON.parse(backing.get('tarkov-map-learner-community-v1')).version, 2);
});

console.log(`\nPASS: ${passed} community checks`);
