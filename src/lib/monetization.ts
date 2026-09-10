/**
 * Central monetization configuration (display ads + donations).
 *
 * Everything is driven by `NEXT_PUBLIC_*` environment variables so ads or
 * donations can be switched on later without code changes. All features
 * default to OFF — the app renders exactly as before until configured.
 *
 * See `docs/monetization.md` for the enablement guide and `.env.example`
 * for the full variable list.
 */

export type AdProvider = 'adsense' | 'custom' | 'none';

export type AdFormat = 'banner' | 'rectangle' | 'responsive';

export interface AdSlotConfig {
  /** Stable slot key used by `<AdSlot slot="..." />`. */
  id: string;
  /** Human-readable description (docs + dev placeholder). */
  label: string;
  /** Intended creative shape. */
  format: AdFormat;
  /** Reserved container height (px) to avoid cumulative layout shift. */
  minHeight: number;
}

/**
 * Inventory of ad placements in the app. To add a new placement:
 * 1. Add an entry here.
 * 2. Drop `<AdSlot slot="<id>" />` at the placement.
 * 3. Document any new `NEXT_PUBLIC_AD_SLOT_*` variable in `.env.example`.
 */
export const AD_SLOTS: Record<string, AdSlotConfig> = {
  'below-content': {
    id: 'below-content',
    label: 'Below drill card',
    format: 'responsive',
    minHeight: 90,
  },
  'game-over': {
    id: 'game-over',
    label: 'Game-over screen',
    format: 'rectangle',
    minHeight: 250,
  },
};

export interface AdsConfig {
  enabled: boolean;
  provider: AdProvider;
  /** AdSense publisher ID (`ca-pub-...`). Required when provider is `adsense`. */
  adsenseClient: string | null;
  /** Slot key -> provider ad-unit/slot ID (e.g. AdSense `data-ad-slot`). */
  slotIds: Record<string, string | null>;
  /**
   * Render dashed placeholder boxes at every placement so layouts can be
   * previewed without a live ad provider. Never enable in production.
   */
  showPlaceholders: boolean;
}

export interface DonationsConfig {
  enabled: boolean;
  /** Destination URL (Ko-fi, Patreon, Buy Me a Coffee, GitHub Sponsors...). */
  url: string | null;
  /** Display name of the platform, e.g. `Ko-fi`. */
  platform: string;
  /** Short call-to-action label for the donate button. */
  message: string;
}

export interface MonetizationConfig {
  ads: AdsConfig;
  donations: DonationsConfig;
}

function readEnv(key: string): string | null {
  const value = process.env[key];
  return value && value.trim() !== '' ? value.trim() : null;
}

function readFlag(key: string): boolean {
  return readEnv(key)?.toLowerCase() === 'true';
}

function readProvider(): AdProvider {
  const value = readEnv('NEXT_PUBLIC_AD_PROVIDER')?.toLowerCase();
  return value === 'adsense' || value === 'custom' ? value : 'none';
}

const donationUrl = readEnv('NEXT_PUBLIC_DONATION_URL');

export const monetizationConfig: MonetizationConfig = {
  ads: {
    enabled: readFlag('NEXT_PUBLIC_ADS_ENABLED'),
    provider: readProvider(),
    adsenseClient: readEnv('NEXT_PUBLIC_ADSENSE_CLIENT'),
    slotIds: {
      'below-content': readEnv('NEXT_PUBLIC_AD_SLOT_BELOW_CONTENT'),
      'game-over': readEnv('NEXT_PUBLIC_AD_SLOT_GAME_OVER'),
    },
    showPlaceholders: readFlag('NEXT_PUBLIC_ADS_PLACEHOLDER'),
  },
  donations: {
    enabled: donationUrl !== null,
    url: donationUrl,
    platform: readEnv('NEXT_PUBLIC_DONATION_PLATFORM') ?? 'Ko-fi',
    message:
      readEnv('NEXT_PUBLIC_DONATION_MESSAGE') ?? 'Support Tarkov Map Learner',
  },
};
