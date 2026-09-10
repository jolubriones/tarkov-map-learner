/**
 * Donor perks: supporters who donated $5+ enjoy 1 year of ad-free drills.
 *
 * How it works (no backend yet):
 * 1. Someone donates via the configured donation URL (Ko-fi, Patreon...).
 * 2. They receive a supporter code (manual for now — see docs/monetization.md).
 * 3. They redeem it in the app (<DonorRedeem />); the entitlement
 *    (code + donated amount + 1-year expiry) is stored in localStorage.
 * 4. <AdSlot /> hides every placement while an unexpired entitlement exists.
 *
 * Verification is currently a STUB (verifyDonorCode) that accepts test
 * codes from NEXT_PUBLIC_DONOR_CODES. Before launch, swap it for a real
 * server-side check — its async { valid, donatedUsd } shape is already
 * the API contract, so only that function needs to change.
 */

/** Minimum donation (USD) that unlocks the ad-free perk. */
export const AD_FREE_THRESHOLD_USD = 5;

/** How long one redemption stays ad-free. User-facing copy calls this "1 year". */
export const AD_FREE_DURATION_DAYS = 365;

const DONOR_STORAGE_KEY = 'tarkov-map-learner-storage_donor';

/** Dispatched on window when the entitlement changes (redeem/remove). */
export const DONOR_CHANGE_EVENT = 'tarkov-donor-change';

export interface DonorEntitlement {
  code: string;
  donatedUsd: number;
  redeemedAt: string; // ISO timestamp
  expiresAt: string; // ISO timestamp
}

/** Result contract for donor-code verification (stub today, API tomorrow). */
export interface DonorVerification {
  valid: boolean;
  donatedUsd?: number;
}

function notifyDonorChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(DONOR_CHANGE_EVENT));
}

/**
 * STUB: accept test codes from NEXT_PUBLIC_DONOR_CODES.
 * Format: "CODE[:USD],..." — e.g. "FRIEND:10,TESTER"
 * (bare codes default to the ad-free threshold).
 *
 * TODO(launch): replace with a server-side check (e.g. a Supabase Edge
 * Function, Cloudflare Worker, or your own backend endpoint verifying
 * against Ko-fi/Patreon records — this app is a static export, so it
 * cannot host Next.js API routes). Never trust client-computed amounts.
 */
async function verifyDonorCode(code: string): Promise<DonorVerification> {
  const entries = (process.env.NEXT_PUBLIC_DONOR_CODES ?? '').split(',');
  for (const entry of entries) {
    const [rawCode, rawAmount] = entry.split(':').map((part) => part.trim());
    if (!rawCode || rawCode.toUpperCase() !== code) continue;
    const amount =
      rawAmount === undefined || rawAmount === ''
        ? AD_FREE_THRESHOLD_USD
        : Number(rawAmount);
    return {
      valid: true,
      donatedUsd: Number.isFinite(amount) ? amount : AD_FREE_THRESHOLD_USD,
    };
  }
  return { valid: false };
}

export type RedeemResult =
  | { ok: true; entitlement: DonorEntitlement }
  | { ok: false; error: string };

export async function redeemDonorCode(rawCode: string): Promise<RedeemResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: 'Enter your supporter code.' };

  const verification = await verifyDonorCode(code);
  if (!verification.valid) {
    return { ok: false, error: 'Code not recognized. Check it and try again.' };
  }
  const donatedUsd = verification.donatedUsd ?? 0;
  if (donatedUsd < AD_FREE_THRESHOLD_USD) {
    return {
      ok: false,
      error: `Ad-free needs a $${AD_FREE_THRESHOLD_USD}+ donation — this code is $${donatedUsd}.`,
    };
  }

  const redeemedAt = new Date();
  const expiresAt = new Date(
    redeemedAt.getTime() + AD_FREE_DURATION_DAYS * 24 * 60 * 60 * 1000
  );
  const entitlement: DonorEntitlement = {
    code,
    donatedUsd,
    redeemedAt: redeemedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  try {
    localStorage.setItem(DONOR_STORAGE_KEY, JSON.stringify(entitlement));
  } catch {
    return { ok: false, error: 'Could not save this code on this device.' };
  }
  notifyDonorChange();
  return { ok: true, entitlement };
}

function removeStoredEntitlement(): void {
  try {
    localStorage.removeItem(DONOR_STORAGE_KEY);
  } catch {
    // Ignore — a stale entry simply reads as "not a donor" next time.
  }
}

/** Active entitlement, or null (also cleans up expired/corrupt entries). */
export function getDonorEntitlement(): DonorEntitlement | null {
  if (typeof window === 'undefined') return null;
  let parsed: Partial<DonorEntitlement> | null = null;
  try {
    const raw = localStorage.getItem(DONOR_STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw) as Partial<DonorEntitlement>;
  } catch {
    parsed = null;
  }
  const validShape =
    parsed !== null &&
    typeof parsed.code === 'string' &&
    typeof parsed.donatedUsd === 'number' &&
    typeof parsed.expiresAt === 'string' &&
    !Number.isNaN(Date.parse(parsed.expiresAt));
  if (!validShape || Date.parse((parsed as DonorEntitlement).expiresAt) <= Date.now()) {
    removeStoredEntitlement();
    return null;
  }
  return parsed as DonorEntitlement;
}

export function clearDonorEntitlement(): void {
  if (typeof window === 'undefined') return;
  removeStoredEntitlement();
  notifyDonorChange();
}

/** "Jun 12, 2027"-style date for the badge/dialog. */
export function formatExpiry(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
