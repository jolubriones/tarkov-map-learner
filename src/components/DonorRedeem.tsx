'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Ticket, X } from 'lucide-react';
import { useDonorStatus } from '@/hooks/useDonorStatus';
import { monetizationConfig } from '@/lib/monetization';
import {
  AD_FREE_THRESHOLD_USD,
  clearDonorEntitlement,
  formatExpiry,
  redeemDonorCode,
} from '@/lib/donor';

/**
 * "Supporter code" trigger + redeem/manage dialog.
 * Hidden until donations are configured (or a code is already redeemed).
 */
export default function DonorRedeem() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const donor = useDonorStatus();
  const donationsOn = monetizationConfig.donations.enabled;

  if (!donationsOn && !donor) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-zinc-500 hover:text-amber-400 transition-colors"
      >
        Supporter code
      </button>
      {open && <DonorDialog onClose={close} />}
    </>
  );
}

function DonorDialog({ onClose }: { onClose: () => void }) {
  const donor = useDonorStatus();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await redeemDonorCode(code);
    setSubmitting(false);
    if (result.ok) {
      setCode('');
    } else {
      setError(result.error);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Supporter code"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-amber-400" />
            <h2 className="font-bold text-zinc-100">Supporter code</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {donor ? (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-zinc-300">
              Thanks for your ${donor.donatedUsd} donation — you&apos;re
              ad-free until{' '}
              <span className="font-bold text-amber-300">
                {formatExpiry(donor.expiresAt)}
              </span>
              .
            </p>
            <div className="flex gap-3">
              <button
                onClick={clearDonorEntitlement}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors"
              >
                Remove from this device
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-zinc-400">
              Donated ${AD_FREE_THRESHOLD_USD} or more? Enter your supporter
              code for 1 year of ad-free drills.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="e.g. TARKOV-XXXX-XXXX"
                aria-label="Supporter code"
                autoComplete="off"
                autoFocus
                maxLength={64}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-base sm:text-sm uppercase tracking-wider text-zinc-100 placeholder:normal-case placeholder:tracking-normal placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
              />
              {error && (
                <p role="alert" className="text-xs text-red-400">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className={`w-full py-2.5 rounded-xl font-bold text-sm transition-colors ${
                  submitting
                    ? 'bg-zinc-800 text-zinc-500 cursor-wait'
                    : 'bg-amber-600 hover:bg-amber-500 text-white'
                }`}
              >
                {submitting ? 'Checking…' : 'Redeem'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
