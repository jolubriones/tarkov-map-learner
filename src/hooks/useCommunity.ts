'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  backendKind,
  getBackend,
  type BackendKind,
  type CommunityBackend,
} from '@/lib/community/backend';
import type {
  CommunityUser,
  CorrectionProposal,
  FlaggedItem,
  LiveQuestion,
  QuestionReport,
  Submission,
} from '@/lib/community/types';

// ---------------------------------------------------------------------------
// Backend access.
// ---------------------------------------------------------------------------

/**
 * The active backend (local until hosted credentials exist). Null on the
 * very first render while the (possibly lazy) backend resolves.
 */
export function useBackend(): { backend: CommunityBackend | null; kind: BackendKind } {
  const [backend, setBackend] = useState<CommunityBackend | null>(null);
  const kind = backendKind();
  useEffect(() => {
    let on = true;
    getBackend().then((b) => {
      if (on) setBackend(b);
    });
    return () => {
      on = false;
    };
  }, []);
  return { backend, kind };
}

export interface BackendQuery<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * One backend read with loading/error states. Re-runs when the backend
 * emits (every mutation emits), so lists stay fresh with zero manual
 * invalidation. `fetch` must be referentially stable (module scope).
 */
export function useBackendQuery<T>(
  fetch: (backend: CommunityBackend) => Promise<T>
): BackendQuery<T> {
  const { backend } = useBackend();
  const [version, setVersion] = useState(0);
  // Last settled fetch; `loading` is derived so refetches keep stale data
  // visible instead of flashing empty lists (stale-while-revalidate).
  const [settled, setSettled] = useState<{ version: number; data: T | null; error: string | null }>({
    version: -1,
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!backend) return;
    return backend.subscribe(() => setVersion((v) => v + 1));
  }, [backend]);

  useEffect(() => {
    if (!backend) return;
    let cancelled = false;
    fetch(backend).then(
      (result) => {
        if (!cancelled) setSettled({ version, data: result, error: null });
      },
      (err: unknown) => {
        if (!cancelled) {
          setSettled({
            version,
            data: null,
            error: err instanceof Error ? err.message : 'Could not load.',
          });
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [backend, version, fetch]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const loading = backend == null || settled.version !== version;
  return {
    data: settled.data,
    loading,
    error: settled.version === version ? settled.error : null,
    refresh,
  };
}

/**
 * Async-action guard: `run` no-ops while a previous call is in flight and
 * exposes `busy` for button states. Components still null-check `backend`
 * (loading) before calling.
 */
export function useAsyncAction(): {
  busy: boolean;
  run: <T>(fn: () => Promise<T>) => Promise<T | null>;
} {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      if (busy) return null;
      setBusy(true);
      try {
        return await fn();
      } finally {
        setBusy(false);
      }
    },
    [busy]
  );
  return { busy, run };
}

/**
 * Failure result for "the backend singleton hasn't resolved yet" call
 * sites — reachable only when a user acts within milliseconds of load.
 */
export function backendNotReady(): { ok: false; error: string } {
  return { ok: false, error: 'Still loading — try again in a moment.' };
}

// ---------------------------------------------------------------------------
// Queries (all module-scope fetchers — stable for useBackendQuery).
// ---------------------------------------------------------------------------

const fetchLive = (b: CommunityBackend) => b.listLiveQuestions();
const fetchPendingSubs = (b: CommunityBackend) => b.listPendingSubmissions();
const fetchPendingFixes = (b: CommunityBackend) => b.listPendingCorrections();
const fetchFlagged = (b: CommunityBackend) => b.listFlaggedItems();
const fetchReviewCount = (b: CommunityBackend) => b.actionableReviewCount();
const fetchSessionUser = (b: CommunityBackend) => b.getSessionUser();
const fetchMyWork = (b: CommunityBackend) =>
  Promise.all([
    b.listMySubmissions(),
    b.listMyCorrections(),
    b.listMyReports(),
    b.countReviewsGiven(),
  ]).then(([submissions, corrections, reports, reviewsGiven]) => ({
    submissions,
    corrections,
    reports,
    reviewsGiven,
  }));

/** The live drill pool (official + approved community, corrections applied). */
export function useLivePool(): BackendQuery<LiveQuestion[]> {
  return useBackendQuery(fetchLive);
}

export function usePendingSubmissions(): BackendQuery<Submission[]> {
  return useBackendQuery(fetchPendingSubs);
}

export function usePendingCorrections(): BackendQuery<CorrectionProposal[]> {
  return useBackendQuery(fetchPendingFixes);
}

export function useFlaggedItems(): BackendQuery<FlaggedItem[]> {
  return useBackendQuery(fetchFlagged);
}

export function useReviewCount(): BackendQuery<number> {
  return useBackendQuery(fetchReviewCount);
}

export function useSessionUser(): BackendQuery<CommunityUser | null> {
  return useBackendQuery(fetchSessionUser);
}

export interface MyWork {
  submissions: Submission[];
  corrections: CorrectionProposal[];
  reports: QuestionReport[];
  reviewsGiven: number;
}

export function useMyWork(): BackendQuery<MyWork> {
  return useBackendQuery(fetchMyWork);
}
