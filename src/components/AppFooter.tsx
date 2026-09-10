import React from 'react';
import DonateButton from './DonateButton';
import { monetizationConfig } from '@/lib/monetization';

/**
 * Minimal app footer. Always renders (reserving footer space for future
 * links / disclosures such as an ad policy or privacy page); the support
 * link only appears once donations are configured.
 */
export default function AppFooter() {
  const donationsOn = monetizationConfig.donations.enabled;

  return (
    <footer className="w-full border-t border-zinc-900">
      <div
        className={`mx-auto w-full max-w-xl px-4 py-4 text-xs text-zinc-600 ${
          donationsOn ? 'flex items-center justify-between gap-4' : 'text-center'
        }`}
      >
        <span>Tarkov Map Learner</span>
        {donationsOn && <DonateButton variant="link" />}
      </div>
    </footer>
  );
}
