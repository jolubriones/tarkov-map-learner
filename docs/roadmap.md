# Roadmap — where Tarkov Map Learner is going

Status: the Customs drill, all five question types, per-map ELO, and the
full community loop (submit → review → live → report → fix) are built
and shipped. The hosted backend is written and waiting on a free
afternoon to activate. Everything below is ordered by payoff, not by
promise — items move when they earn it.

## Next: hosted cutover

- Run `001` → `002` → `003` in the Supabase SQL editor, turn email
  confirmation off, set `NEXT_PUBLIC_SUPABASE_*` (see `backend.md`).
- Run `npm run test:backend` against hosted and watch the contract
  suite pass on both adapters.
- Flip the switch: real accounts, public queues, server-side consensus
  + ELO. Local stays as the offline fallback.

## Content: ten maps, not one

- Banks for the other nine maps (Woods, Shoreline, Interchange,
  Reserve, Lighthouse, Streets, Factory, Labs, Ground Zero) — mostly
  grown through community submissions + the curator
  (`npm run merge`) flow, not hand-written.
- A Timmy-binned starter set per map so new players graduate the way
  the ladder intends (Timmy → Essential in the first sessions).
- Real audio seed clips (boss voices, gun IDs) once the upload flow
  sees genuine clips; self-hosted landmark photos replacing the
  Pexels remotes in the built-in bank.

## Learning: from drills to mastery

- Wrong-answer review deck (spaced repetition on what you actually
  miss) instead of pure random runs.
- Guided paths per map: spawns → extracts → stashes → quests, with
  the ELO rank as the progress bar.
- Deeper extract-logic coverage (every spawn × every conditional
  extract) and compass drills for landmark-dense areas.

## Community: reputation + trust at scale

- Contributor profiles: live questions, fixes landed, reviews given.
- Review incentives that don't game the ELO (streaks for reviewing,
  never rating for it).
- Maintainer tooling on top of the seeded `maintainers` table: mod
  queue, status overrides, ban hammer with audit trail.
- Abuse hardening as population grows: tighter pending caps, review
  velocity limits, fingerprinting repeat offenders.

## Platform + reach

- PWA: installable, offline drills, cached media.
- Shareable drill links (view hash-routing exists; extend to
  bin/map filters).
- Internationalization — Tarkov is global; the drill pool will be
  eventually. Bins and ranks stay canonical; prompts translate.

## Monetization (sustain, never extract)

- Donor perks that stay cosmetic (badges exist; flair, themes).
- Ads only when traffic justifies them, never mid-drill.

## Explicit non-goals

- No pay-to-win: nothing purchasable touches ELO, ranks, or review
  weight.
- No scraped/auto-generated banks: every question is hand-made or
  peer-reviewed. Quality is the moat.
- Nothing cheating-adjacent: this is a learning tool. No live-raid
  assistance, no ESP-adjacent features, ever.
