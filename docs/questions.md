# Questions: authoring & maintenance

> Players don't need this file — they submit through the in-app template
> and peer review does the rest. See [`community.md`](community.md). This
> doc covers the built-in (official) bank that ships with the app.

Question banks live in `src/lib/mockData.ts` as plain TypeScript arrays
(currently `CUSTOMS_DRILL_QUESTIONS`). Types are in `src/lib/types.ts` —
three question kinds: `landmark_mc`, `compass_check`, `extract_logic`.

## Adding or editing a question

1. Copy a nearby question of the same `type` and change the fields.
   Keep `id` unique, make `correctAnswer` exactly one of `options`,
   pick a `difficulty` bin (`timmy` | `essential` | `enlightened` |
   `sherpa` | `immortal` — see `community.md`), and always write an
   `explanation` +
   `tip` (shown after answering).
2. For `landmark_mc`, a photo is **required** — the picture is the
   question. Self-host it: drop the file in
   `public/images/<map>/` (jpeg/png/gif/webp, ≤3MB) and set
   `imageUrl` to that `/images/…` path. Remote URLs still validate
   (they must be reachable) but rot — prefer self-hosted, and never
   ship a landmark without an image (build error, not warning).
   For `audio_mc`, a clip is **required** — the sound is the
   question. Same deal: `public/audio/<map>/` (mp3/wav/ogg/webm/m4a,
   ≤3MB) referenced as `/audio/…`. `trivia_mc` needs no media.
3. Run `npm run validate`, then commit. Every `npm run build` validates
   first (`prebuild`), so a broken bank can never ship.

## What validation checks

Errors (block the build): missing id/prompt, unknown `type`, fewer
than 2 options, `correctAnswer` not in `options`, duplicate ids
(within and across banks), invalid compass values, `extract_logic`
without `spawnLocation`, missing/invalid `difficulty`, landmark
without image, audio without clip, and media problems
(missing/non-photo/non-audio self-hosted files, unreachable remotes).

Warnings (ship anyway): missing `explanation`/`tip`/`mapId`, duplicate
options.

No image-network access (sandboxed CI, offline)? Run with
`--skip-images` or `SKIP_IMAGE_CHECK=1` — integrity checks still run.

## Growing beyond one map

Add a second exported array (e.g. `SHORELINE_DRILL_QUESTIONS`) — the
validator picks up every exported array automatically, including
cross-bank id clashes, and the drill's map-filter chips + per-map ELO
key off `mapId`, so a new map lights up as soon as its questions land
(see `community.md` for the curator merge flow that assigns ids).
