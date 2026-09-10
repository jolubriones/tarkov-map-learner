# Monetization: ads & donations

The app ships **monetization-ready but fully disabled**. Ad slots and
donation buttons are already placed in the UI — they render `null` (zero DOM,
zero layout impact) until you configure them. Turning either on later is a
config change, not a code change.

> `NEXT_PUBLIC_*` values are inlined at **build time**. After changing them,
> rebuild and redeploy.

## Slot inventory

| Placement | Component | Location |
|---|---|---|
| `below-content` | `<AdSlot slot="below-content" />` | Under the drill card (`src/app/page.tsx`) |
| `game-over` | `<AdSlot slot="game-over" />` | Game-over screen, above Try Again |
| Donate (icon) | `<DonateButton variant="icon" />` | Drill header, next to mute |
| Donate (CTA) | `<DonateButton variant="cta" />` | Game-over screen, below Try Again |
| Donate (link) | `<DonateButton variant="link" />` | App footer (`src/components/AppFooter.tsx`) |
| Supporter badge | `<DonorBadge />` | Drill info bar (active donors only) |
| Redeem dialog | `<DonorRedeem />` | Footer (once donations are on) |

The ad-slot registry lives in `src/lib/monetization.ts` (`AD_SLOTS`). Each
slot reserves a fixed `minHeight` so creatives never shift the drill UI (CLS).

## Previewing placements (no provider needed)

```bash
NEXT_PUBLIC_ADS_PLACEHOLDER=true npm run dev
```

Dashed boxes appear at every `<AdSlot />`, labelled with the slot key,
format, and reserved height. Never enable this in production.

## Option A — Donations (simplest)

Set one variable and redeploy:

```bash
NEXT_PUBLIC_DONATION_URL=https://ko-fi.com/your-page
NEXT_PUBLIC_DONATION_PLATFORM=Ko-fi              # shown on the CTA
NEXT_PUBLIC_DONATION_MESSAGE=Support this project # optional label
```

Works with Ko-fi, Patreon, Buy Me a Coffee, GitHub Sponsors, PayPal.me —
anything URL-based. All three `DonateButton` placements light up at once.

## Donor perks: $5+ → 1 year ad-free

Supporters who donate $5 or more can redeem a code for one year without ads:

1. Donor gives via `NEXT_PUBLIC_DONATION_URL`.
2. They receive a supporter code (manual for now — email it, or use your
   platform's post-donation message / Discord role).
3. They open the footer "Supporter code" link, redeem, and `<AdSlot />`
   hides every placement until the entitlement expires.
4. An amber "Supporter" pill appears in the drill info bar.

The rules live in `src/lib/donor.ts`:

- `AD_FREE_THRESHOLD_USD = 5`, `AD_FREE_DURATION_DAYS = 365`
- Entitlements persist in localStorage and self-expire (expired/corrupt
  entries are cleared on read). `useDonorStatus()` keeps the badge and
  ad slots reactive across tabs.

### Test codes (dev only)

```bash
NEXT_PUBLIC_DONOR_CODES=FRIEND:10,SMALL:2 npm run dev
```

Format is `CODE[:USD]` (amount defaults to $5). `FRIEND` redeems ad-free;
`SMALL` demonstrates the under-$5 rejection. These codes ship in the
client bundle — never treat them as real verification.

### Going live (checklist)

- [ ] Replace the `verifyDonorCode()` stub with a server-side check
      (Ko-fi verification API, Patreon API, or your own backend issuing
      single-use codes). Its `{ valid, donatedUsd }` return shape is the
      contract — only that function changes.
- [ ] Decide code distribution (receipt email, thank-you page, Discord).
- [ ] Keep the $5 / 1-year promise in sync: threshold + duration consts in
      `src/lib/donor.ts`, perk note via `NEXT_PUBLIC_DONATION_PERK_MESSAGE`.

## Option B — Google AdSense

1. Get approved and find your publisher ID (`ca-pub-...`) plus one ad-unit
   ID per placement.
2. Set:
   ```bash
   NEXT_PUBLIC_ADS_ENABLED=true
   NEXT_PUBLIC_AD_PROVIDER=adsense
   NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
   NEXT_PUBLIC_AD_SLOT_BELOW_CONTENT=1234567890
   NEXT_PUBLIC_AD_SLOT_GAME_OVER=0987654321
   ```
3. Rebuild and redeploy.

Notes:

- The AdSense script loads with `next/script strategy="lazyOnload"`, so it
  never blocks the drill. Identical script URLs are deduped automatically.
- The `game-over` slot only mounts when the game-over screen shows, which
  keeps ad requests tied to a natural content break.
- Active donors never see these placements (`<AdSlot />` returns `null`).

## Option C — Custom / house ads (no ad network)

Run your own promos, patch notes, or a donation nudge in any placement:

```bash
NEXT_PUBLIC_ADS_ENABLED=true
NEXT_PUBLIC_AD_PROVIDER=custom
```

```tsx
<AdSlot slot="below-content">
  <YourHouseCreative />
</AdSlot>
```

With `custom`, slots without children render nothing.

## Adding a new ad placement

1. Register it in `AD_SLOTS` (`src/lib/monetization.ts`) with a `minHeight`.
2. Add `<AdSlot slot="<id>" />` where it should appear.
3. Add the matching `NEXT_PUBLIC_AD_SLOT_<ID>` variable to
   `monetization.ts`, `.env.example`, and this doc.

## Before you launch ads (checklist)

- [ ] **Consent (GDPR/ePrivacy):** personalized ads need prior consent in
      the EU/UK. Plan a CMP (e.g. Google-certified Funding Choices) or a
      first-party consent banner that gates `<AdSlot />`, plus Google
      Consent Mode defaults. The single `AdSlot` component is the intended
      gating point — no page changes needed.
- [ ] **Privacy policy:** disclose the ad provider, cookies, and data use;
      link it from `AppFooter`.
- [ ] **Ad policy fit:** keep placements clear of answer buttons (no
      accidental clicks) and never show ads mid-question in a way that
      breaks the learning flow.
- [ ] **`ads.txt`:** serve the provider's `ads.txt` from `public/` when
      required.
- [ ] **Performance:** re-check Lighthouse/CWV after enabling; slots
      reserve space, but third-party scripts still cost JS time.

## File map

- `src/lib/monetization.ts` — env-driven config + slot registry
- `src/lib/donor.ts` — donor entitlements, redeem flow, verify stub
- `src/hooks/useDonorStatus.ts` — reactive donor-status hook
- `src/components/ads/AdSlot.tsx` — ad placement component (provider logic)
- `src/components/DonateButton.tsx` — donation entry points
- `src/components/DonorBadge.tsx` — supporter pill for active donors
- `src/components/DonorRedeem.tsx` — supporter-code redeem/manage dialog
- `src/components/AppFooter.tsx` — footer with conditional support link
- `.env.example` — all variables with defaults
