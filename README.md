# Tarkov Map Learner

Fast-paced spatial memory drills for Escape from Tarkov (Customs).

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to run drills.
Edit `src/app/page.tsx` — the page auto-updates.

| Script                 | What it does                                   |
| ---------------------- | ---------------------------------------------- |
| `npm run dev`          | Start the dev server                           |
| `npm run build`        | Validate the bank, then production build       |
| `npm run start`        | Serve the production build                     |
| `npm run lint`         | Run ESLint                                     |
| `npm run validate`     | Check the built-in question bank               |
| `npm run test:community` | Run the community/ELO logic suite            |
| `npm run merge -- file` | Merge a player export into the bank (curator) |

## SEO

Metadata, OG image, sitemap, and robots.txt ship with the static export.
Set `NEXT_PUBLIC_SITE_URL` before launch — see [`docs/seo.md`](docs/seo.md).

## Questions

The drill pool is community-driven: signed-in players submit questions
through a guided template, peers review them into the pool (3 approvals),
and reports + corrections keep quality high afterward. Drills also track
a persistent ELO skill rating across four difficulty bins
(Essential → Immortal). See
[`docs/community.md`](docs/community.md) for the full ecosystem.

The built-in bank lives in `src/lib/mockData.ts` and is validated before
every build. See [`docs/questions.md`](docs/questions.md) to add or edit
built-in questions.

## Monetization (ads & donations)

The app is monetization-ready: ad slots and donation buttons are placed but
disabled by default. Copy `.env.example` to `.env.local` and see
[`docs/monetization.md`](docs/monetization.md) to preview placements or
enable them.
