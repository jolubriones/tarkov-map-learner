# Questions: authoring & maintenance

Question banks live in `src/lib/mockData.ts` as plain TypeScript arrays
(currently `CUSTOMS_DRILL_QUESTIONS`). Types are in `src/lib/types.ts` —
three question kinds: `landmark_mc`, `compass_check`, `extract_logic`.

## Adding or editing a question

1. Copy a nearby question of the same `type` and change the fields.
   Keep `id` unique, make `correctAnswer` exactly one of `options`,
   and always write an `explanation` + `tip` (shown after answering).
2. For `landmark_mc`, set `imageUrl` to a stable, hotlinkable photo
   (Pexels URLs with `?auto=compress&cs=tinysrgb&w=800` work well).
   The UI hides broken images gracefully, but validation will fail —
   fix the URL instead of shipping without one.
3. Run `npm run validate`, then commit. Every `npm run build` validates
   first (`prebuild`), so a broken bank can never ship.

## What validation checks

Errors (block the build): missing id/prompt, fewer than 2 options,
`correctAnswer` not in `options`, duplicate ids (within and across
banks), invalid compass values, `extract_logic` without `spawnLocation`,
unreachable images.

Warnings (ship anyway): missing `explanation`/`tip`/`mapId`, duplicate
options, landmark without image.

No image-network access (sandboxed CI, offline)? Run with
`--skip-images` or `SKIP_IMAGE_CHECK=1` — integrity checks still run.

## Growing beyond one map

Add a second exported array (e.g. `SHORELINE_DRILL_QUESTIONS`) — the
validator picks up every exported array automatically, including
cross-bank id clashes. The drill page still needs wiring to offer map
choice; the bank format itself is ready.
