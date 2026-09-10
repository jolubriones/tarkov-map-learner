# Backend: local now, hosted when ready

The community runs behind the `CommunityBackend` contract
(`src/lib/community/backend.ts`). Two implementations, one selected by
environment — cutover is a config change, not a rewrite.

## The seam

| | `localBackend` (default) | `supabaseBackend` (one env var away) |
|---|---|---|
| Accounts | username + password on this device | Supabase Auth (email + password) |
| Questions | localStorage stub + seeds | Postgres, public to every user |
| Photos | resized data URLs on the draft | Storage bucket (`question-images`) |
| Consensus | store functions | RLS policies + transition triggers |
| ELO | localStorage math | `answer_rated` RPC (same math) |
| Works offline | yes | no (drills fall back to unrated practice) |

Selection lives in `backendKind()`: both `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` set → hosted, otherwise local. The app
never half-migrates — one backend serves everything per deployment.

## Schema

`supabase/migrations/001_community.sql` is the whole hosted backend:
tables, row-level-security, consensus triggers, the ELO RPC, and Storage
policies. It mirrors `config.ts` / `difficulty.ts` deliberately — the
database is the final authority once the app points at it. Consensus
thresholds live in a `community_config` table so they stay tunable
without a migration, exactly like the local `COMMUNITY_CONFIG`.

Rules enforced where they belong:

- **Database** (never trust the client): required fields, length bounds,
  answer-in-options, landmark-needs-photo, extract-needs-spawn,
  one-review-per-user, no self-review/report/vote, reject-note length,
  pending caps, rating bounds. Status transitions run in triggers —
  atomic and race-free by construction.
- **App** (semantic, review-caught): compass option sets, duplicate
  options, prompt quality. Abuse here just meets peer review, which is
  the system working as designed.

## Your 30 minutes (whenever — nothing needed until then)

1. Create a free Supabase project.
2. Paste `supabase/migrations/001_community.sql` into the SQL editor, run.
3. Add the two `NEXT_PUBLIC_*` values to `.env.local` (see `.env.example`).
4. `npm install` (pulls the Supabase client) and restart dev.
5. Insert your user id into `maintainers` after first signup (SQL in the
   migration comments).
6. Run the smoke checklist in `docs/launch.md` (two accounts, real flow).

Until then the app runs exactly as today — every change so far is
additive. Deleting the local adapter is a scheduled follow-up *after*
hosted proves itself in production, not before.
