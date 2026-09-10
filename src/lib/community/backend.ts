'use client';

import type {
  ActionResult,
  CommunityUser,
  CorrectionProposal,
  FlaggedItem,
  IdResult,
  LiveQuestion,
  QuestionDraft,
  QuestionReport,
  ReportReason,
  ReviewDecision,
  Submission,
} from './types';
import type { EloResult, EloState } from './elo';
import type { QuestionDifficulty } from '@/lib/types';

import { createLocalBackend } from './localBackend';

export type BackendKind = 'local' | 'supabase';

/**
 * Which backend serves the community: hosted Supabase when credentials are
 * configured, otherwise the device-local adapter. Evaluated once per
 * process — env vars are build-time constants, so this cannot flip at
 * runtime.
 */
export function backendKind(): BackendKind {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return 'supabase';
  }
  return 'local';
}

export type AuthResult = { ok: true; user: CommunityUser } | { ok: false; error: string };
export type UrlResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * The community backend contract. Two implementations:
 *
 * - `localBackend` (this device): the original stub store — demo accounts,
 *   seeds, instant, offline. Ships as the default until hosted credentials
 *   exist.
 * - `supabaseBackend` (hosted): real accounts, public queues, server-side
 *   consensus + ELO. Activates the moment env credentials are set.
 *
 * Components talk only to this interface (via `getBackend()` + hooks), so
 * cutover is a config change, not a rewrite. Method semantics mirror the
 * original store actions 1:1, including error strings where practical.
 */
export interface CommunityBackend {
  readonly kind: BackendKind;

  // -- identity -----------------------------------------------------------
  getSessionUser(): Promise<CommunityUser | null>;
  /**
   * Hosted: email is required (Supabase Auth is email-based); the local
   * adapter ignores it and keeps username+password semantics. The signup
   * form always collects all three so the UX is identical.
   */
  signUp(
    username: string,
    email: string,
    password: string,
    displayName?: string
  ): Promise<AuthResult>;
  /** Hosted: email + password. Local: username + password (email ignored). */
  signIn(login: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  /** Local-only demo login; hosted always refuses (the button is hidden there). */
  signInDemo(): Promise<AuthResult>;

  // -- reads --------------------------------------------------------------
  /** Official bank ∪ approved community, corrections applied. */
  listLiveQuestions(): Promise<LiveQuestion[]>;
  listPendingSubmissions(): Promise<Submission[]>;
  listPendingCorrections(): Promise<CorrectionProposal[]>;
  listFlaggedItems(): Promise<FlaggedItem[]>;
  listMySubmissions(): Promise<Submission[]>;
  listMyCorrections(): Promise<CorrectionProposal[]>;
  listMyReports(): Promise<QuestionReport[]>;
  actionableReviewCount(): Promise<number>;
  /** Reviews cast by the session user across both queues (0 for guests). */
  countReviewsGiven(): Promise<number>;

  // -- submissions ----------------------------------------------------------
  submitQuestion(draft: QuestionDraft): Promise<IdResult>;
  editSubmission(id: string, draft: QuestionDraft): Promise<ActionResult>;
  withdrawSubmission(id: string): Promise<ActionResult>;
  removeSubmission(id: string): Promise<ActionResult>;
  reviewSubmission(id: string, decision: ReviewDecision, comment?: string): Promise<ActionResult>;

  // -- corrections ----------------------------------------------------------
  proposeCorrection(
    questionId: string,
    draft: QuestionDraft,
    reason: string
  ): Promise<IdResult>;
  editCorrection(id: string, draft: QuestionDraft, reason: string): Promise<ActionResult>;
  withdrawCorrection(id: string): Promise<ActionResult>;
  reviewCorrection(id: string, decision: ReviewDecision, comment?: string): Promise<ActionResult>;

  // -- reports --------------------------------------------------------------
  fileReport(questionId: string, reason: ReportReason, details?: string): Promise<ActionResult>;
  voteKeep(questionId: string): Promise<ActionResult>;

  // -- photos ---------------------------------------------------------------
  /**
   * Resize + store a landmark photo, returning the URL to put on the draft.
   * Local: resized data URL (browser-only). Hosted: Storage bucket URL.
   */
  uploadPhoto(file: Blob): Promise<UrlResult>;
  /**
   * Validate + store an audio ID clip, returning the URL to put on the
   * draft. Clips are kept as-is (no transcode): max 2MB / 2 minutes.
   * Local: data URL (browser-only). Hosted: Storage bucket URL.
   */
  uploadAudio(file: Blob): Promise<UrlResult>;

  // -- skill rating ---------------------------------------------------------
  readElo(): Promise<EloState>;
  answerRated(
    mapId: string,
    difficulty: QuestionDifficulty,
    correct: boolean
  ): Promise<EloResult>;

  // -- reactivity -----------------------------------------------------------
  /** Re-render hook. Local: store subscription. Hosted: emit-on-mutate. */
  subscribe(listener: () => void): () => void;
}

let cached: CommunityBackend | null = null;

/** Process-wide backend singleton (see `backendKind`). */
export async function getBackend(): Promise<CommunityBackend> {
  if (cached) return cached;
  if (backendKind() === 'supabase') {
    const { createSupabaseBackend } = await import('./supabaseBackend');
    cached = createSupabaseBackend();
  } else {
    cached = createLocalBackend();
  }
  return cached;
}
