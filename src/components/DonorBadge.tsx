'use client';

import { Crown } from 'lucide-react';
import { useDonorStatus } from '@/hooks/useDonorStatus';
import { formatExpiry } from '@/lib/donor';

/** "Supporter" pill — renders null until a donor code is redeemed. */
export default function DonorBadge({ className = '' }: { className?: string }) {
  const donor = useDonorStatus();
  if (!donor) return null;

  return (
    <span
      title={`Ad-free until ${formatExpiry(donor.expiresAt)}`}
      className={`inline-flex items-center gap-1 rounded-full border border-amber-700/60 bg-amber-950/60 px-2 py-0.5 text-[11px] font-bold text-amber-300 ${className}`}
    >
      <Crown className="w-3.5 h-3.5" />
      Supporter
    </span>
  );
}
