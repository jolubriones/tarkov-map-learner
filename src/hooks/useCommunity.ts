'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  getSessionUser,
  getState,
  subscribe,
  emptyState,
  getLiveQuestions,
  type LiveQuestion,
} from '@/lib/community/store';
import type { CommunityState, CommunityUser } from '@/lib/community/types';

/**
 * Reactive community state.
 *
 * useSyncExternalStore gives us all three behaviors we need: the server
 * snapshot matches the SSR prerender (no hydration mismatch), the client
 * snapshot loads real storage after hydration, and every store mutation
 * (or cross-tab write) re-renders via `subscribe`.
 */
const serverSnapshot: CommunityState = emptyState();

function getServerSnapshot(): CommunityState {
  return serverSnapshot;
}

function getClientSnapshot(): CommunityState {
  return getState();
}

export function useCommunity(): {
  state: CommunityState;
  user: CommunityUser | null;
} {
  const state = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const user = useMemo(() => getSessionUser(state), [state]);
  return { state, user };
}

/** The live drill pool (official + approved community, corrections applied). */
export function useLiveQuestions(state: CommunityState): LiveQuestion[] {
  return useMemo(() => getLiveQuestions(state), [state]);
}
