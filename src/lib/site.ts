/**
 * Canonical site URL used for SEO (canonical links, OG tags, sitemap).
 *
 * Set NEXT_PUBLIC_SITE_URL to the production domain before launch —
 * the fallback below is RFC-2606-reserved and must never go live.
 * (Inlined at build time like all NEXT_PUBLIC_* vars — rebuild after changing.)
 */
function readSiteUrl(): string {
  const raw = (
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tarkov-map-learner.example.com'
  ).replace(/\/+$/, '');
  try {
    new URL(raw);
  } catch {
    throw new Error(
      `Invalid NEXT_PUBLIC_SITE_URL: ${JSON.stringify(process.env.NEXT_PUBLIC_SITE_URL)}`
    );
  }
  return raw;
}

export const SITE_URL = readSiteUrl();
