# Tarkov Map Learner

Fast-paced spatial memory drills for Escape from Tarkov (Customs).

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to run drills.
Edit `src/app/page.tsx` — the page auto-updates.

| Script        | What it does              |
| ------------- | ------------------------- |
| `npm run dev` | Start the dev server      |
| `npm run build` | Production build       |
| `npm run start` | Serve the production build |
| `npm run lint`  | Run ESLint             |

## SEO

Metadata, OG image, sitemap, and robots.txt ship with the static export.
Set `NEXT_PUBLIC_SITE_URL` before launch — see [`docs/seo.md`](docs/seo.md).

## Questions

Question banks live in `src/lib/mockData.ts` and are validated before
every build. See [`docs/questions.md`](docs/questions.md) to add or edit
questions.

## Monetization (ads & donations)

The app is monetization-ready: ad slots and donation buttons are placed but
disabled by default. Copy `.env.example` to `.env.local` and see
[`docs/monetization.md`](docs/monetization.md) to preview placements or
enable them.
