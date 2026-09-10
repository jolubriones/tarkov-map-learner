'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Script from 'next/script';
import { AD_SLOTS, monetizationConfig } from '@/lib/monetization';
import { useDonorStatus } from '@/hooks/useDonorStatus';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

interface AdSlotProps {
  /** Slot key from the `AD_SLOTS` inventory in `src/lib/monetization.ts`. */
  slot: string;
  className?: string;
  /**
   * House creative rendered when `NEXT_PUBLIC_AD_PROVIDER=custom`.
   * Lets you run your own promos (or a donation nudge) in ad placements
   * without a third-party network.
   */
  children?: ReactNode;
}

/**
 * Reserved display-ad placement.
 *
 * - Renders `null` (zero DOM / layout impact) until ads are enabled.
 * - Reserves `minHeight` space when active so ads don't shift the drill UI.
 * - Donors with an active $5+ entitlement always browse ad-free.
 * - Supports Google AdSense today; `custom` renders first-party creative
 *   passed as `children`. New providers plug in here without touching pages.
 */
export default function AdSlot({ slot, className = '', children }: AdSlotProps) {
  const slotConfig = AD_SLOTS[slot];
  const { enabled, provider, adsenseClient, slotIds, showPlaceholders } =
    monetizationConfig.ads;
  const providerSlotId = slotConfig ? (slotIds[slotConfig.id] ?? null) : null;
  const donor = useDonorStatus();
  // Guard against double ad requests (StrictMode mounts effects twice in dev).
  const pushedRef = useRef(false);

  useEffect(() => {
    if (
      pushedRef.current ||
      donor !== null ||
      !enabled ||
      provider !== 'adsense' ||
      !adsenseClient ||
      !providerSlotId
    ) {
      return;
    }
    pushedRef.current = true;
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      // Ads are best-effort — never break the drill over an ad error.
    }
  }, [donor, enabled, provider, adsenseClient, providerSlotId, slot]);

  if (!slotConfig) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[ads] Unknown ad slot "${slot}". Add it to AD_SLOTS first.`);
    }
    return null;
  }

  // Donors ($5+, unexpired entitlement) browse ad-free.
  if (donor) return null;

  // Dev preview: dashed boxes showing where ads will land.
  if (showPlaceholders && (!enabled || provider === 'none')) {
    return (
      <div
        data-ad-placement={slot}
        data-ad-preview="true"
        aria-hidden="true"
        style={{ minHeight: slotConfig.minHeight }}
        className={`flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/60 px-4 py-3 text-center ${className}`}
      >
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">
          Ad · {slotConfig.label}
        </span>
        <span className="text-[11px] text-zinc-600">
          slot=&quot;{slotConfig.id}&quot; · {slotConfig.format} · reserves{' '}
          {slotConfig.minHeight}px
        </span>
      </div>
    );
  }

  if (!enabled) return null;

  if (provider === 'custom') {
    if (!children) return null;
    return (
      <div
        data-ad-placement={slot}
        style={{ minHeight: slotConfig.minHeight }}
        className={`overflow-hidden ${className}`}
      >
        {children}
      </div>
    );
  }

  if (provider === 'adsense') {
    if (!adsenseClient || !providerSlotId) return null;
    return (
      <div
        data-ad-placement={slot}
        style={{ minHeight: slotConfig.minHeight }}
        className={`overflow-hidden ${className}`}
      >
        <Script
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
          strategy="lazyOnload"
          crossOrigin="anonymous"
        />
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={adsenseClient}
          data-ad-slot={providerSlotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    );
  }

  return null;
}
