# SEO

What ships with the static export:

- Full metadata in `src/app/layout.tsx`: title template, description,
  keywords, canonical URL, robots directives, Open Graph + Twitter cards,
  favicon + Apple touch icon, and JSON-LD (`WebApplication`) structured data.
- `src/app/robots.ts` → `robots.txt` and `src/app/sitemap.ts` → `sitemap.xml`
  (both need `force-static` under `output: 'export'` — already set).
- Single `<h1>` per screen (question prompt / game-over title), descriptive
  image `alt` text, and reserved image aspect ratio (no layout shift).

## Before launch

- [ ] Set `NEXT_PUBLIC_SITE_URL` to the production domain and rebuild —
      canonical URLs, OG tags, and the sitemap all derive from it.
- [ ] Check social previews (X card validator, LinkedIn post inspector,
      iMessage) for `opengraph-image.png`.
- [ ] Submit `sitemap.xml` to Google Search Console and Bing Webmaster Tools.

## Regenerating the share image

`public/opengraph-image.png` (1200×630) is a committed static file. The
`opengraph-image.tsx` file convention was tried first, but under
`output: 'export'` it emits an extensionless URL most static hosts serve
as `application/octet-stream`, which social scrapers reject.

To regenerate after a rebrand:

1. Restore the generator from git history into `src/app/opengraph-image.tsx`.
2. `npm run build`, then copy `out/opengraph-image` over
   `public/opengraph-image.png`.
3. Delete the generator again and rebuild.
