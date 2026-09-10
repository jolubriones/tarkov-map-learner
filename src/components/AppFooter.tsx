import DonateButton from './DonateButton';
import DonorRedeem from './DonorRedeem';
import { monetizationConfig } from '@/lib/monetization';

/**
 * Minimal app footer. Always renders (reserving footer space for future
 * links / disclosures such as an ad policy or privacy page); the support
 * and redeem links only appear once donations are configured.
 */
export default function AppFooter() {
  const donationsOn = monetizationConfig.donations.enabled;

  return (
    <footer className="w-full border-t border-zinc-900">
      <div className="mx-auto w-full max-w-xl px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-xs text-zinc-600 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <span>Tarkov Map Learner</span>
        {donationsOn && <DonateButton variant="link" />}
        <DonorRedeem />
      </div>
    </footer>
  );
}
