import { useEffect, useState } from 'react';
import {
  DONOR_CHANGE_EVENT,
  getDonorEntitlement,
  type DonorEntitlement,
} from '@/lib/donor';

/**
 * Reactive donor entitlement. Re-reads storage when a code is
 * redeemed/removed in this tab (DONOR_CHANGE_EVENT) or another tab (`storage`).
 */
export function useDonorStatus(): DonorEntitlement | null {
  const [entitlement, setEntitlement] = useState(() => getDonorEntitlement());

  useEffect(() => {
    const sync = () => setEntitlement(getDonorEntitlement());
    window.addEventListener(DONOR_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(DONOR_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return entitlement;
}
