# Community ecosystem: questions by players, for players

The question pool is community-driven. Players submit questions through a
guided template, peers review them into the drill pool, and the same peers
police quality afterward via reports and corrections. No moderators in the
middle — the pool grows and heals itself.

> **Backend note:** this doc describes the rules and flows, which are
> identical on both backends. The hosted implementation (schema, RLS,
> RPCs, activation) lives in [`backend.md`](backend.md).

## The loop

```
SUBMIT (template: map + prompt + options + ANSWER + explanation)
  │  requires an account
  ▼
REVIEW ── 3 approvals ──▶ LIVE in the drill pool
  │         (3 rejections decline it)
  │  one review per player · no self-reviews ·
  │  rejections need a note
  ▼
DRILL ── spot something wrong? ──▶ REPORT ──▶ FLAGGED (still playable,
  │                                              marked "Under review")
  │                                              one report per player
  ▼
REVIEW (Flagged queue) ──┬──▶ PROPOSE A FIX ── 3 approvals ──▶ APPLIED
                         │      (itself peer-reviewed;          (live question
                         │       resolves all open reports)      updated-src)
                         └──▶ "LOOKS CORRECT" ×3 ──▶ flag cleared, reports dismissed
```

All thresholds live in `src/lib/community/config.ts` — raise them as the
community grows without touching UI code.

## Difficulty bins + ELO

Every question carries one of five bins, picked by its author and visible
everywhere (drill, preview, review queues):

| Bin | Meaning | Question rating |
|---|---|---|
| Timmy | Fresh-spawn basics for players who don't know the maps at all yet — everyone starts here | 300 |
| Essential | The bare minimum to enjoy Tarkov: know your spawn within seconds + the general direction of your extracts | 600 |
| Enlightened | Beyond the basics: more maps, boss/PMC spawns, special extracts (car, co-op, no-backpack…) | 1100 |
| Sherpa | Guide-tier: most hidden stash + quest locations | 1600 |
| Immortal | Every nook and cranny of the game | 2100 |

Bin choice is **required** on submit (no default — the author must place
their own question) and enforced by the same validation as everything
else. Mis-binned questions get disputed through the normal correction
flow: fixes can change the bin, and reviewers see old → new.

Drills run a **per-map ELO rating**, tuned for fun rather than purity.
Every map tracks its own rating: each answer is a match between that
map's rating and the question's bin rating (standard formula, integers,
floored at 100 per map):

- **Overall = played maps' blended average**: each map's weight ramps
  0 → 1 over its first 10 rated answers, so dabbling in a weak map
  bends the overall instead of cliff-diving it. Unplayed maps never
  drag it down, so specialists are never punished for maps they don't
  touch — and breadth shows as a visible "· N maps" count instead of
  a hidden tax.
- **Ranks sit on round numbers**: Timmy <600, Essential <1000,
  Enlightened <1500, Sherpa <2000, Immortal beyond. Hitting 600
  graduates you from Timmy; the answer card celebrates map rank-ups,
  the rank pill tracks overall.
- **Hot placement per map**: every map starts at 500 (Timmy) and its
  first 10 answers run at K=48 (then K=32) — fast placement, and
  underdog jackpots up to +48 for swinging at hard bins early.
- **Exploration is safe**: below 1000 a map's losses count half, and
  fresh maps start at 500 — trying a new map costs almost nothing.
- **Global streak juice**: +2 per consecutive win beyond the first
  (capped +10), surviving map switches; any loss resets it. The bonus
  amplifies earned gains only — grinding trivial wins pays just +1
  no matter the streak, so the flame is juice, not a farm.
- **No hollow wins**: victories always pay at least +1, and the
  displayed delta is honest (the floor eats the rest).
- **Flagged questions pause rating**: while a question is under
  community review, answers still cost lives and build streaks, but
  move no ELO — the app never bets your rating on a disputed answer.
- **Tabs share the rating**: a second tab's answers merge in per map
  (more answers wins; streaks take the max) instead of being
  overwritten — open drills side by side and neither loses progress.

Drills filter by bin and by map (multi-select chips, persisted); a map
pick with no questions yet renders an empty panel with a shortcut to
the submit tab. Profile shows the overall, lifetime answers, streak,
breadth, and a strongest-first per-map breakdown.

Legacy flat saves seed every map at the old rating, provisionally
(scale-1 saves shift +200 first, preserving rank) — overall continuity
on day one, per-map truth within ~10 answers each.

Like accounts, ELO is device-local until the hosted backend lands (then
it moves server-side per user); the math itself (`elo.ts`) is pure and
covered by `npm run test:community`.

## From submissions to the seed bank

Approvals publish to the *local* drill pool. Getting questions into the
*shared* bank is a maintainer flow, built around the fact that images
are the whole point of this app:

1. **Export** (Mine tab): approved submissions download as a versioned
   JSON manifest. Pending / rejected work never leaves the device here.
2. **Merge** (`npm run merge -- file.json`, `--dry-run` to preview):
   each draft is re-validated with the app's own template rules, then
   appended to `src/lib/mockData.ts` under a marker comment.
3. **Images get self-hosted on merge**: remote URLs are downloaded,
   sniffed (jpeg/png/gif/webp, ≤3MB), hashed for dupes, and stored as
   `public/images/<map>/<id>.<ext>`; the bank references that stable
   path. Link rot only has to survive from submit to merge. Audio
   clips ride the same flow (`public/audio/<map>/<id>.<ext>`,
   mp3/wav/ogg/webm/m4a).
4. **Validate + commit**: `npm run validate`, review the diff, commit.

Rules that keep the bank whole:

- Landmark questions **require** a photo — enforced at submit time,
  at merge time, and as a bank-validator error. Audio questions
  require a clip the same way; trivia needs no media at all.
- Stable per-map ids (`c-16`, `w-01`, …) are assigned at merge and
  never reused; prompts dedupe by exact match, images by hash.
- Nothing ships without a maintainer seeing the pixels — moderation
  by construction. (The pre-merge Pexels stand-ins and c-05's AI
  stand-in get replaced with real screenshots through this same flow.)
- After updating to a bank that merged your export, you'll see both
  your local copy and the new official copy (a known cosmetic dupe —
  there is no channel back to mark yours merged). Pull yours via
  Review → Mine → “Remove from pool” and the official one stands
  alone. Removing is author-only and never touches the bank.

## Rules that keep it honest

- **Accounts required** for submitting, reviewing, reporting, and fixing.
  Guests can drill and browse every queue (transparency), but every action
  is attributed.
- **One review per player** per submission/fix; **no self-reviews** —
  authors can't even report or keep-vote their own questions.
- **Rejections need a short note** so authors learn instead of guessing
  (enforced in the store, not just the UI), and “Something else” reports
  must describe the problem.
- **Flagged questions stay playable**, just visibly marked — and unrated
  while disputed. A single report can never grief content out of the pool:
  removal takes consensus via an approved fix (or the author's own
  “Remove from pool”), and bad reports get overruled by 3 “looks correct”
  votes.
- **Corrections are peer-reviewed too** (3 approvals to apply), on both
  official and community questions. Approving a fix patches the live
  question and resolves all its open reports at once.
- Submissions and fixes both require the **correct answer + explanation**,
  enforced by the same validation as the built-in bank (`correctAnswer`
  must be one of the options, compass values constrained, extract
  questions need a spawn).
- **Authors own their pending work**: edit a submission/fix any time
  before it's decided (existing reviews clear, since they judged the old
  version) or withdraw it entirely. Decided items are immutable history.
- **Duplicate detection assists, never blocks**: near-identical prompts
  across the live pool + pending queue surface as warnings to the author
  and to reviewers — humans still decide.
- Drills can be **filtered by difficulty bin** (persisted); ELO stakes
  still follow each question's bin.

## Where the code lives

| Area | Files |
|---|---|
| Thresholds | `src/lib/community/config.ts` |
| Data model | `src/lib/community/types.ts` |
| Template validation + examples | `src/lib/community/validation.ts` |
| Difficulty bins (meta + ratings) | `src/lib/community/difficulty.ts` |
| Map roster (ids are ELO storage keys) | `src/lib/community/maps.ts` |
| ELO rating (math + storage + ranks) | `src/lib/community/elo.ts` |
| Store (accounts, submissions, reviews, reports, fixes) | `src/lib/community/store.ts` |
| React bindings | `src/hooks/useCommunity.ts` |
| Submission template | `src/components/community/QuestionForm.tsx` |
| What-you-see preview | `src/components/community/QuestionPreview.tsx` |
| Submit tab | `src/components/community/SubmitPanel.tsx` |
| Review tab (New / Flagged / Fixes / Mine) | `src/components/community/ReviewQueue.tsx` |
| Report dialog (from drills) | `src/components/community/ReportDialog.tsx` |
| Account dialog | `src/components/community/AuthDialog.tsx` |
| In-app guide (ranks / submit / review / reports) | `src/components/community/GuideDialog.tsx` |
| Drill integration (pool, bin + map filters, badges, report button) | `src/app/page.tsx` |
| Logic tests (14 checks over the full loop) | `scripts/test-community.mjs` (`npm run test:community`) |

First run seeds demo content (a 2/3-approved submission, a flagged
question with a pending fix, an already-live community question) so every
queue is explorable immediately.

## Storage today: local-first (per device)

The app is a static export with no server, so the store persists to
`localStorage` (`tarkov-map-learner-community-v1`, cross-tab synced). Auth
is a stub in the same spirit as `src/lib/donor.ts` — username + a
non-cryptographic password hash. It exists so the account flows work end
to end; **never treat it as real security.**

Stored state is **versioned** (`COMMUNITY_STATE_VERSION`, currently 2)
and migrated on load — v1 saves predating difficulty bins get the
conservative `essential` default instead of crashing, and the community
can re-bin them via fixes. Bump + migrate on future schema changes;
never rename the storage key (that would orphan player data).

## Going multi-user: hosted backend (done)

The hosted backend is implemented and cut over by config: setting the
Supabase env vars switches the whole app at once. The rules in this doc
are identical on both backends — see [`backend.md`](backend.md) for the
schema, RLS, RPCs, and the activation checklist. `npm run test:backend`
asserts parity by running the same flow against every adapter.

Still on the ideas list: reputation — weighting reviews by
approved-submission count once the community is large enough for it to
matter.
