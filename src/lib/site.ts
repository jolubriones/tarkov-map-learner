/**
 * Canonical site URL used for SEO (canonical links, OG tags, sitemap).
 *
 * Set NEXT_PUBLIC_SITE_URL to the production domain before launch —
 * the fallback below is RFC-2606-reserved and must never go live.
 * (Inlined at build time like all NEXT_PUBLIC_* vars — rebuild after changing.)
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tarkov-map-learner.example.com'
).replace(/\/+$/, '');
