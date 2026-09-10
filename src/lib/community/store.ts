import { CUSTOMS_DRILL_QUESTIONS } from '@/lib/mockData';
import type { Question } from '@/lib/types';
import { COMMUNITY_CONFIG as C } from './config';
import {
  type ActionResult,
  type CommunityState,
  type CommunityUser,
  type CorrectionProposal,
  type QuestionDraft,
  type QuestionExport,
  type QuestionReport,
  type ReportReason,
  type Review,
  type Submission,
  type SubmitResult,
} from './types';
import { draftToQuestion, isDraftValid } from './validation';
import { isDifficulty } from './difficulty';

/**
 * Community store — localStorage-backed persistence for the whole
 * community ecosystem (accounts, submissions, reviews, reports, fixes).
 *
 * Why local-first: the app is a static export with no server, so this
 * ships the full loop today (per-device) with the exact shapes a hosted
 * backend will use — see `docs/community.md` for the Supabase migration
 * that turns these same actions into real multi-user state.
 *
 * Auth is a STUB in the same spirit as `src/lib/donor.ts`: username +
 * password hashed with a non-cryptographic hash, session in the same
 * localStorage record. Never treat it as real security — it exists so
 * the account flows (own your submissions, one review/report per user,
 * no self-review) work end to end before hosted auth lands.
 */

const STORAGE_KEY = 'tarkov-map-learner-community-v1';

/**
 * Persisted-schema version. v1 → v2 backfilled `difficulty` on every
 * stored draft (see migrateToV2). Bump + migrate on schema changes —
 * never rename STORAGE_KEY itself (that would orphan player data).
 */
export const COMMUNITY_STATE_VERSION = 2;

/** A live drill question plus its community provenance. */
export interface LiveQuestion {
  question: Question;
  source: 'official' | 'community';
  authorName?: string;
  submissionId?: string;
  /** True when a community correction replaced the original. */
  overridden: boolean;
  flagged: boolean;
  openReportCount: number;
}

export interface FlaggedItem {
  questionId: string;
  live: LiveQuestion;
  reports: QuestionReport[];
  keepVotes: { userId: string; userName: string; createdAt: string }[];
  corrections: CorrectionProposal[];
}

// ---------------------------------------------------------------------------
// Persistence + subscription
// ---------------------------------------------------------------------------

type Listener = () => void;

const listeners = new Set<Listener>();
let cached: CommunityState | null = null;
let storageHooked = false;

export function emptyState(): CommunityState {
  return {
    version: COMMUNITY_STATE_VERSION,
    users: [],
    sessionUserId: null,
    submissions: [],
    corrections: [],
    reports: [],
    keepVotes: {},
    overrides: {},
  };
}

function persist(state: CommunityState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked/full — the ecosystem still works in memory for
    // this session, it just won't survive a reload.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function hookStorage(): void {
  if (storageHooked || typeof window === 'undefined') return;
  storageHooked = true;
  // Cross-tab sync: another tab's write reloads us and re-renders.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    cached = null;
    emit();
  });
}

/**
 * v1 → v2: drafts saved before difficulty bins existed get the
 * conservative default, keeping old saves playable (the community can
 * re-bin them via fixes afterwards).
 */
function migrateToV2(state: CommunityState): void {
  const backfill = (draft: QuestionDraft): void => {
    if (!isDifficulty(draft.difficulty)) draft.difficulty = 'essential';
  };
  for (const s of state.submissions) backfill(s.draft);
  for (const c of state.corrections) backfill(c.draft);
  for (const draft of Object.values(state.overrides)) backfill(draft);
  state.version = COMMUNITY_STATE_VERSION;
}

function load(): CommunityState {
  if (cached) return cached;
  hookStorage();
  if (typeof window === 'undefined') {
    // SSR/prerender: never seed or touch storage here — the client
    // hook hydrates from real storage in an effect (no mismatch).
    return emptyState();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CommunityState;
      if (parsed && (parsed.version === 1 || parsed.version === COMMUNITY_STATE_VERSION) && Array.isArray(parsed.submissions)) {
        cached = { ...emptyState(), ...parsed };
        if (cached.version === 1) {
          migrateToV2(cached);
          persist(cached);
        }
        return cached;
      }
    }
  } catch {
    // Corrupt JSON — fall through to a fresh seed.
  }
  cached = seedState();
  persist(cached);
  return cached;
}

/** Read the current state (client-safe; SSR returns an empty snapshot). */
export function getState(): CommunityState {
  return load();
}

/** Re-run `listener` after every mutation (and cross-tab writes). */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  // Ensure the storage hook exists even if subscribe beats first read.
  if (typeof window !== 'undefined') hookStorage();
  return () => {
    listeners.delete(listener);
  };
}

function update(mutator: (state: CommunityState) => void): void {
  const prev = load();
  // Clone-on-write: subscribers (useSyncExternalStore) detect changes by
  // reference, so every mutation produces a new state object.
  const next: CommunityState = JSON.parse(JSON.stringify(prev)) as CommunityState;
  mutator(next);
  cached = next;
  persist(next);
  emit();
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Auth (STUB — see file header)
// ---------------------------------------------------------------------------

/** Non-cryptographic hash for the local stub. NOT real password security. */
function stubHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
}

const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;

export function getSessionUser(state: CommunityState): CommunityUser | null {
  if (!state.sessionUserId) return null;
  return state.users.find((u) => u.id === state.sessionUserId) ?? null;
}

function requireUser(state: CommunityState): CommunityUser | null {
  return getSessionUser(state);
}

export function signUp(
  username: string,
  password: string,
  displayName?: string
): ActionResult {
  const handle = username.trim();
  const name = (displayName ?? '').trim() || handle;
  if (handle.length < C.usernameMin || handle.length > C.usernameMax) {
    return {
      ok: false,
      error: `Username needs ${C.usernameMin}–${C.usernameMax} characters.`,
    };
  }
  if (!USERNAME_RE.test(handle)) {
    return { ok: false, error: 'Username can only use letters, numbers, _ and -.' };
  }
  if (password.length < C.passwordMin) {
    return { ok: false, error: `Password needs at least ${C.passwordMin} characters.` };
  }
  const state = load();
  if (state.users.some((u) => u.username === handle.toLowerCase())) {
    return { ok: false, error: 'That username is taken — try another.' };
  }
  const user: CommunityUser = {
    id: newId('u'),
    username: handle.toLowerCase(),
    displayName: name.slice(0, 32),
    passHash: '',
    createdAt: nowIso(),
  };
  user.passHash = stubHash(`${user.id}:${password}`);
  update((s) => {
    s.users.push(user);
    s.sessionUserId = user.id;
  });
  return { ok: true };
}

export function signIn(username: string, password: string): ActionResult {
  const handle = username.trim().toLowerCase();
  const state = load();
  const user = state.users.find((u) => u.username === handle);
  if (!user || stubHash(`${user.id}:${password}`) !== user.passHash) {
    return { ok: false, error: 'Invalid username or password.' };
  }
  update((s) => {
    s.sessionUserId = user.id;
  });
  return { ok: true };
}

export function signOut(): void {
  update((s) => {
    s.sessionUserId = null;
  });
}

/** One-click demo account so visitors can try submit/review instantly. */
export function signInDemo(): ActionResult {
  const state = load();
  const demo = state.users.find((u) => u.username === 'demo');
  if (!demo) {
    const user: CommunityUser = {
      id: newId('u'),
      username: 'demo',
      displayName: 'Demo Raider',
      passHash: '',
      createdAt: nowIso(),
      seeded: true,
    };
    user.passHash = stubHash(`${user.id}:demo1234`);
    update((s) => {
      s.users.push(user);
      s.sessionUserId = user.id;
    });
    return { ok: true };
  }
  update((s) => {
    s.sessionUserId = demo.id;
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Selectors — question pool, flags, queues
// ---------------------------------------------------------------------------

export function countApprovals(reviews: Review[]): number {
  return reviews.filter((r) => r.decision === 'approve').length;
}

export function countRejections(reviews: Review[]): number {
  return reviews.filter((r) => r.decision === 'reject').length;
}

function openReportsFor(state: CommunityState, questionId: string): QuestionReport[] {
  return state.reports.filter((r) => r.questionId === questionId && r.status === 'open');
}

export function isFlagged(state: CommunityState, questionId: string): boolean {
  return openReportsFor(state, questionId).length >= C.reportsToFlag;
}

/**
 * Resolve any question id (built-in `c-…` or community `u-…`) to its
 * current live version, applying community corrections. Null when the id
 * belongs to a submission that hasn't been approved (or was declined).
 */
export function resolveQuestion(
  state: CommunityState,
  questionId: string
): LiveQuestion | null {
  const flagged = isFlagged(state, questionId);
  const openReportCount = openReportsFor(state, questionId).length;

  const override = state.overrides[questionId];
  if (override) {
    return {
      question: draftToQuestion(override, questionId),
      source: 'official',
      overridden: true,
      flagged,
      openReportCount,
    };
  }

  const builtin = CUSTOMS_DRILL_QUESTIONS.find((q) => q.id === questionId);
  if (builtin) {
    return { question: builtin, source: 'official', overridden: false, flagged, openReportCount };
  }

  const submission = state.submissions.find(
    (s) => s.id === questionId && s.status === 'approved'
  );
  if (!submission) return null;
  return {
    question: draftToQuestion(submission.draft, submission.id),
    source: 'community',
    authorName: submission.authorName,
    submissionId: submission.id,
    overridden: Boolean(submission.correctedAt),
    flagged,
    openReportCount,
  };
}

/** Full drill pool: official questions (+corrections) then approved community. */
export function getLiveQuestions(state: CommunityState): LiveQuestion[] {
  const official: LiveQuestion[] = CUSTOMS_DRILL_QUESTIONS.map((q) => {
    const override = state.overrides[q.id];
    return {
      question: override ? draftToQuestion(override, q.id) : q,
      source: 'official' as const,
      overridden: Boolean(override),
      flagged: isFlagged(state, q.id),
      openReportCount: openReportsFor(state, q.id).length,
    };
  });
  const community: LiveQuestion[] = state.submissions
    .filter((s) => s.status === 'approved')
    .sort((a, b) => (a.decidedAt ?? a.createdAt).localeCompare(b.decidedAt ?? b.createdAt))
    .map((s) => ({
      question: draftToQuestion(s.draft, s.id),
      source: 'community' as const,
      authorName: s.authorName,
      submissionId: s.id,
      overridden: Boolean(s.correctedAt),
      flagged: isFlagged(state, s.id),
      openReportCount: openReportsFor(state, s.id).length,
    }));
  return [...official, ...community];
}

/**
 * Export a player's approved submissions for the curator flow.
 * Pending / rejected / withdrawn work never leaves the device here —
 * only peer-approved questions are bank-worthy.
 */
export function buildExportPayload(state: CommunityState, userId: string): QuestionExport {
  const user = state.users.find((u) => u.id === userId);
  const questions = state.submissions
    .filter((s) => s.authorId === userId && s.status === 'approved')
    .sort((a, b) => (a.decidedAt ?? a.createdAt).localeCompare(b.decidedAt ?? b.createdAt))
    .map((s) => ({
      submissionId: s.id,
      authorName: s.authorName,
      ...(s.decidedAt ? { decidedAt: s.decidedAt } : {}),
      draft: s.draft,
    }));
  return {
    format: 'tarkov-map-learner-export',
    version: 1,
    exportedAt: nowIso(),
    exportedBy: user?.displayName ?? 'unknown',
    questions,
  };
}

/** Oldest-first: the fair review order. */
export function pendingSubmissions(state: CommunityState): Submission[] {
  return state.submissions
    .filter((s) => s.status === 'pending')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function pendingCorrections(state: CommunityState): CorrectionProposal[] {
  return state.corrections
    .filter((c) => c.status === 'pending')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getFlaggedItems(state: CommunityState): FlaggedItem[] {
  const byQuestion = new Map<string, QuestionReport[]>();
  for (const report of state.reports) {
    if (report.status !== 'open') continue;
    const list = byQuestion.get(report.questionId) ?? [];
    list.push(report);
    byQuestion.set(report.questionId, list);
  }
  const items: FlaggedItem[] = [];
  for (const [questionId, reports] of byQuestion) {
    if (reports.length < C.reportsToFlag) continue;
    const live = resolveQuestion(state, questionId);
    if (!live) continue; // Submission declined after being reported.
    reports.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    items.push({
      questionId,
      live,
      reports,
      keepVotes: state.keepVotes[questionId] ?? [],
      corrections: state.corrections
        .filter((c) => c.questionId === questionId && c.status === 'pending')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    });
  }
  // Most-reported first, then oldest report.
  items.sort(
    (a, b) => b.reports.length - a.reports.length || a.reports[0].createdAt.localeCompare(b.reports[0].createdAt)
  );
  return items;
}

/** Build a review record (comments trimmed + capped). */
function makeReview(
  user: CommunityUser,
  decision: 'approve' | 'reject',
  comment?: string
): Review {
  return {
    reviewerId: user.id,
    reviewerName: user.displayName,
    decision,
    createdAt: nowIso(),
    ...(comment?.trim() ? { comment: comment.trim().slice(0, 500) } : {}),
  };
}

function hasReviewed(reviews: Review[], userId: string): boolean {
  return reviews.some((r) => r.reviewerId === userId);
}

/**
 * Review-tab badge: everything the current user can personally act on —
 * submissions + fixes they didn't author and haven't reviewed yet, plus
 * flagged questions they haven't keep-voted on. Guests see raw queue
 * sizes so the tab still signals activity.
 */
export function actionableReviewCount(state: CommunityState): number {
  const user = getSessionUser(state);
  const subs = pendingSubmissions(state);
  const fixes = pendingCorrections(state);
  const flagged = getFlaggedItems(state);
  if (!user) return subs.length + fixes.length + flagged.length;
  const mySub = subs.filter((s) => s.authorId !== user.id && !hasReviewed(s.reviews, user.id)).length;
  const myFix = fixes.filter(
    (c) => c.authorId !== user.id && !hasReviewed(c.reviews, user.id)
  ).length;
  const myFlag = flagged.filter(
    (f) => !f.keepVotes.some((v) => v.userId === user.id)
  ).length;
  return mySub + myFix + myFlag;
}

export interface DuplicateHit {
  questionId: string;
  prompt: string;
  source: 'official' | 'community' | 'pending';
}

function promptTokens(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Possible duplicates of a prompt across the live pool + pending queue.
 * Non-blocking by design: surfaced to the author (who can still submit)
 * and to reviewers (who decide). `excludeId` skips your own draft.
 */
export function findDuplicates(
  state: CommunityState,
  prompt: string,
  excludeId?: string
): DuplicateHit[] {
  const norm = promptTokens(prompt).join(' ');
  if (norm.length < 12) return [];
  const candidates: DuplicateHit[] = [
    ...getLiveQuestions(state).map((l) => ({
      questionId: l.question.id,
      prompt: l.question.prompt,
      source: l.source,
    })),
    ...pendingSubmissions(state).map((s) => ({
      questionId: s.id,
      prompt: s.draft.prompt,
      source: 'pending' as const,
    })),
  ];
  const hits: DuplicateHit[] = [];
  const aTokens = new Set(promptTokens(prompt));
  for (const c of candidates) {
    if (c.questionId === excludeId) continue;
    const bNorm = promptTokens(c.prompt).join(' ');
    if (!bNorm || bNorm.length < 12) continue;
    if (bNorm === norm) {
      hits.push(c);
      continue;
    }
    const longer = bNorm.length >= norm.length ? bNorm : norm;
    const shorter = bNorm.length >= norm.length ? norm : bNorm;
    if (shorter.length >= 24 && longer.includes(shorter)) {
      hits.push(c);
      continue;
    }
    const bTokens = new Set(promptTokens(c.prompt));
    if (aTokens.size >= 6 && bTokens.size >= 6) {
      let inter = 0;
      for (const t of aTokens) if (bTokens.has(t)) inter++;
      const union = aTokens.size + bTokens.size - inter;
      if (union > 0 && inter / union >= 0.8) hits.push(c);
    }
  }
  return hits.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Actions — submit / review / report / fix
// ---------------------------------------------------------------------------

export function submitQuestion(draft: QuestionDraft): SubmitResult {
  const state = load();
  const user = requireUser(state);
  if (!user) return { ok: false, error: 'Sign in to submit a question.' };
  if (!isDraftValid(draft)) {
    return { ok: false, error: 'This question still has errors — fix them and resubmit.' };
  }
  const id = newId('u');
  const submission: Submission = {
    id,
    draft: { ...draft },
    authorId: user.id,
    authorName: user.displayName,
    createdAt: nowIso(),
    status: 'pending',
    reviews: [],
  };
  update((s) => {
    s.submissions.push(submission);
  });
  return { ok: true, id };
}

function decideSubmission(s: Submission): void {
  if (s.status !== 'pending') return;
  if (countApprovals(s.reviews) >= C.approvalsToPublish) {
    s.status = 'approved';
    s.decidedAt = nowIso();
  } else if (countRejections(s.reviews) >= C.rejectionsToDecline) {
    s.status = 'rejected';
    s.decidedAt = nowIso();
  }
}

export function reviewSubmission(
  submissionId: string,
  decision: 'approve' | 'reject',
  comment?: string
): ActionResult {
  const state = load();
  const user = requireUser(state);
  if (!user) return { ok: false, error: 'Sign in to review.' };
  const submission = state.submissions.find((s) => s.id === submissionId);
  if (!submission || submission.status !== 'pending') {
    return { ok: false, error: 'This submission is no longer under review.' };
  }
  if (submission.authorId === user.id) {
    return { ok: false, error: 'You can’t review your own submission — peers decide.' };
  }
  if (hasReviewed(submission.reviews, user.id)) {
    return { ok: false, error: 'You already reviewed this submission.' };
  }
  if (decision === 'reject' && (comment?.trim().length ?? 0) < C.minRejectionNoteLength) {
    return { ok: false, error: 'Rejections need a short note so the author knows what to fix.' };
  }
  const review = makeReview(user, decision, comment);
  update((s) => {
    const target = s.submissions.find((x) => x.id === submissionId);
    if (!target) return;
    target.reviews.push(review);
    decideSubmission(target);
  });
  return { ok: true };
}

export function fileReport(
  questionId: string,
  reason: ReportReason,
  details?: string
): ActionResult {
  const state = load();
  const user = requireUser(state);
  if (!user) return { ok: false, error: 'Sign in to report a question.' };
  const live = resolveQuestion(state, questionId);
  if (!live) {
    return { ok: false, error: 'That question no longer exists.' };
  }
  if (live.source === 'community') {
    const own = state.submissions.find((s) => s.id === questionId);
    if (own && own.authorId === user.id) {
      return { ok: false, error: 'This is your own question — propose a fix for it directly instead of reporting it.' };
    }
  }
  if (reason === 'other' && !details?.trim()) {
    return { ok: false, error: 'Tell reviewers what the problem is so they know what to check.' };
  }
  const existing = state.reports.find(
    (r) => r.questionId === questionId && r.reporterId === user.id && r.status === 'open'
  );
  if (existing) {
    return { ok: false, error: 'You already reported this question — it’s in the review queue.' };
  }
  const report: QuestionReport = {
    id: newId('r'),
    questionId,
    reporterId: user.id,
    reporterName: user.displayName,
    reason,
    createdAt: nowIso(),
    status: 'open',
    ...(details?.trim() ? { details: details.trim().slice(0, 500) } : {}),
  };
  update((s) => {
    s.reports.push(report);
  });
  return { ok: true };
}

/**
 * "Looks correct" vote on a flagged question. At the threshold the flag
 * clears and open reports are dismissed — the community overrules bad
 * reports, which is what keeps reporting honest.
 */
export function voteKeep(questionId: string): ActionResult {
  const state = load();
  const user = requireUser(state);
  if (!user) return { ok: false, error: 'Sign in to review flagged questions.' };
  const live = resolveQuestion(state, questionId);
  if (!live) {
    return { ok: false, error: 'That question no longer exists.' };
  }
  if (live.source === 'community') {
    const own = state.submissions.find((s) => s.id === questionId);
    if (own && own.authorId === user.id) {
      return { ok: false, error: 'You can’t verify your own question — peers decide.' };
    }
  }
  const votes = state.keepVotes[questionId] ?? [];
  if (votes.some((v) => v.userId === user.id)) {
    return { ok: false, error: 'You already voted that this looks correct.' };
  }
  if (openReportsFor(state, questionId).length === 0) {
    return { ok: false, error: 'This question is no longer flagged.' };
  }
  update((s) => {
    const list = s.keepVotes[questionId] ?? [];
    list.push({ userId: user.id, userName: user.displayName, createdAt: nowIso() });
    s.keepVotes[questionId] = list;
    if (list.length >= C.keepVotesToClearFlag) {
      for (const report of s.reports) {
        if (report.questionId === questionId && report.status === 'open') {
          report.status = 'dismissed';
        }
      }
      delete s.keepVotes[questionId];
    }
  });
  return { ok: true };
}

export function proposeCorrection(
  questionId: string,
  draft: QuestionDraft,
  reason: string
): SubmitResult {
  const state = load();
  const user = requireUser(state);
  if (!user) return { ok: false, error: 'Sign in to propose a fix.' };
  if (!resolveQuestion(state, questionId)) {
    return { ok: false, error: 'That question no longer exists.' };
  }
  if (!isDraftValid(draft)) {
    return { ok: false, error: 'The corrected question still has errors.' };
  }
  if (reason.trim().length < C.minCorrectionReasonLength) {
    return {
      ok: false,
      error: `Say what was wrong in at least ${C.minCorrectionReasonLength} characters so reviewers can judge the fix.`,
    };
  }
  const mine = state.corrections.find(
    (c) => c.questionId === questionId && c.authorId === user.id && c.status === 'pending'
  );
  if (mine) {
    return { ok: false, error: 'You already have a pending fix for this question.' };
  }
  const id = newId('f');
  const proposal: CorrectionProposal = {
    id,
    questionId,
    draft: { ...draft },
    reason: reason.trim().slice(0, 500),
    authorId: user.id,
    authorName: user.displayName,
    createdAt: nowIso(),
    status: 'pending',
    reviews: [],
  };
  update((s) => {
    s.corrections.push(proposal);
  });
  return { ok: true, id };
}

/** Apply an approved fix: patch the live question, resolve its reports. */
function applyCorrection(state: CommunityState, fix: CorrectionProposal): void {
  const submission = state.submissions.find((s) => s.id === fix.questionId);
  if (submission) {
    submission.draft = { ...fix.draft };
    submission.correctedAt = nowIso();
    submission.correctedBy = fix.authorName;
  } else {
    state.overrides[fix.questionId] = { ...fix.draft };
  }
  for (const report of state.reports) {
    if (report.questionId === fix.questionId && report.status === 'open') {
      report.status = 'resolved';
    }
  }
  delete state.keepVotes[fix.questionId];
}

export function reviewCorrection(
  correctionId: string,
  decision: 'approve' | 'reject',
  comment?: string
): ActionResult {
  const state = load();
  const user = requireUser(state);
  if (!user) return { ok: false, error: 'Sign in to review.' };
  const fix = state.corrections.find((c) => c.id === correctionId);
  if (!fix || fix.status !== 'pending') {
    return { ok: false, error: 'This fix is no longer under review.' };
  }
  if (fix.authorId === user.id) {
    return { ok: false, error: 'You can’t review your own fix — peers decide.' };
  }
  if (hasReviewed(fix.reviews, user.id)) {
    return { ok: false, error: 'You already reviewed this fix.' };
  }
  if (decision === 'reject' && (comment?.trim().length ?? 0) < C.minRejectionNoteLength) {
    return { ok: false, error: 'Rejections need a short note so the author knows what to fix.' };
  }
  const review = makeReview(user, decision, comment);
  update((s) => {
    const target = s.corrections.find((x) => x.id === correctionId);
    if (!target || target.status !== 'pending') return;
    target.reviews.push(review);
    if (countApprovals(target.reviews) >= C.approvalsToApplyFix) {
      target.status = 'approved';
      target.decidedAt = nowIso();
      applyCorrection(s, target);
    } else if (countRejections(target.reviews) >= C.rejectionsToDeclineFix) {
      target.status = 'rejected';
      target.decidedAt = nowIso();
    }
  });
  return { ok: true };
}

/**
 * Edit your own pending submission. Clears existing reviews — they judged
 * the old version, so restarting review is the only fair option.
 */
export function editSubmission(submissionId: string, draft: QuestionDraft): ActionResult {
  const state = load();
  const user = requireUser(state);
  if (!user) return { ok: false, error: 'Sign in to edit.' };
  const sub = state.submissions.find((s) => s.id === submissionId);
  if (!sub || sub.status !== 'pending') {
    return { ok: false, error: 'Only pending submissions can be edited.' };
  }
  if (sub.authorId !== user.id) {
    return { ok: false, error: 'You can only edit your own submissions.' };
  }
  if (!isDraftValid(draft)) {
    return { ok: false, error: 'The edited question still has errors.' };
  }
  update((s) => {
    const target = s.submissions.find((x) => x.id === submissionId);
    if (!target || target.status !== 'pending') return;
    target.draft = { ...draft };
    target.reviews = [];
  });
  return { ok: true };
}

/** Withdraw your own pending submission (removes it entirely). */
export function withdrawSubmission(submissionId: string): ActionResult {
  const state = load();
  const user = requireUser(state);
  if (!user) return { ok: false, error: 'Sign in to withdraw.' };
  const sub = state.submissions.find((s) => s.id === submissionId);
  if (!sub || sub.status !== 'pending') {
    return { ok: false, error: 'Only pending submissions can be withdrawn.' };
  }
  if (sub.authorId !== user.id) {
    return { ok: false, error: 'You can only withdraw your own submissions.' };
  }
  update((s) => {
    s.submissions = s.submissions.filter((x) => x.id !== submissionId);
  });
  return { ok: true };
}

/** Edit your own pending fix (same fairness rule: reviews restart). */
export function editCorrection(
  correctionId: string,
  draft: QuestionDraft,
  reason: string
): ActionResult {
  const state = load();
  const user = requireUser(state);
  if (!user) return { ok: false, error: 'Sign in to edit.' };
  const fix = state.corrections.find((c) => c.id === correctionId);
  if (!fix || fix.status !== 'pending') {
    return { ok: false, error: 'Only pending fixes can be edited.' };
  }
  if (fix.authorId !== user.id) {
    return { ok: false, error: 'You can only edit your own fixes.' };
  }
  if (!isDraftValid(draft)) {
    return { ok: false, error: 'The edited fix still has errors.' };
  }
  if (reason.trim().length < C.minCorrectionReasonLength) {
    return {
      ok: false,
      error: `Explain what was wrong in at least ${C.minCorrectionReasonLength} characters so reviewers can judge the fix.`,
    };
  }
  update((s) => {
    const target = s.corrections.find((x) => x.id === correctionId);
    if (!target || target.status !== 'pending') return;
    target.draft = { ...draft };
    target.reason = reason.trim().slice(0, 500);
    target.reviews = [];
  });
  return { ok: true };
}

/** Withdraw your own pending fix (removes it entirely). */
export function withdrawCorrection(correctionId: string): ActionResult {
  const state = load();
  const user = requireUser(state);
  if (!user) return { ok: false, error: 'Sign in to withdraw.' };
  const fix = state.corrections.find((c) => c.id === correctionId);
  if (!fix || fix.status !== 'pending') {
    return { ok: false, error: 'Only pending fixes can be withdrawn.' };
  }
  if (fix.authorId !== user.id) {
    return { ok: false, error: 'You can only withdraw your own fixes.' };
  }
  update((s) => {
    s.corrections = s.corrections.filter((x) => x.id !== correctionId);
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Seed — first-run demo content so every queue is explorable
// ---------------------------------------------------------------------------

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function seedState(): CommunityState {
  const ratter: CommunityUser = {
    id: 'seed-ratter',
    username: 'veteranratter',
    displayName: 'VeteranRatter',
    passHash: 'seeded',
    createdAt: hoursAgo(500),
    seeded: true,
  };
  const loot: CommunityUser = {
    id: 'seed-loot',
    username: 'lootgoblin',
    displayName: 'LootGoblin',
    passHash: 'seeded',
    createdAt: hoursAgo(400),
    seeded: true,
  };
  const camper: CommunityUser = {
    id: 'seed-camper',
    username: 'campervan',
    displayName: 'CamperVan',
    passHash: 'seeded',
    createdAt: hoursAgo(300),
    seeded: true,
  };

  const approve = (u: CommunityUser, at: string, comment?: string): Review => ({
    reviewerId: u.id,
    reviewerName: u.displayName,
    decision: 'approve',
    createdAt: at,
    ...(comment ? { comment } : {}),
  });

  const submissions: Submission[] = [
    {
      // Sits at 2/3 approvals — one visitor review publishes it.
      id: 'u-seed-bigred',
      draft: {
        mapId: 'customs',
        type: 'extract_logic',
        difficulty: 'essential',
        prompt: 'You spawned at Big Red (west side). Which guaranteed PMC extract is OPEN for you?',
        options: ['Crossroads', 'ZB-1011', 'Trailer Park Workers', 'Dorms V-Ex'],
        correctAnswer: 'ZB-1011',
        spawnLocation: 'Big Red',
        explanation:
          'Big Red is a far-west spawn, so your guaranteed PMC extract is the far-east ZB-1011 bunker.',
        tip: 'Opposite-side rule: any west-side spawn (Big Red, Crossroads, Trailer Park) means routing the full map to ZB-1011.',
      },
      authorId: ratter.id,
      authorName: ratter.displayName,
      createdAt: hoursAgo(30),
      status: 'pending',
      reviews: [
        approve(loot, hoursAgo(28), 'Spawn and extract check out against the wiki map.'),
        approve(camper, hoursAgo(20)),
      ],
    },
    {
      // Sits at 1/3 — needs more eyes.
      id: 'u-seed-ruaf',
      draft: {
        mapId: 'customs',
        type: 'compass_check',
        difficulty: 'enlightened',
        prompt:
          'You are standing at the RUAF Roadblock extract facing back toward the Customs main area. Which cardinal direction are you looking?',
        options: ['N', 'E', 'S', 'W'],
        correctAnswer: 'W',
        explanation:
          'RUAF Roadblock sits on the far north edge; facing back into the map means looking west along the northern wall.',
        tip: 'RUAF is north — turn your back to the map edge and the whole of Customs spreads out to your west and south.',
      },
      authorId: loot.id,
      authorName: loot.displayName,
      createdAt: hoursAgo(10),
      status: 'pending',
      reviews: [approve(camper, hoursAgo(8), 'Good orientation check for north spawns.')],
    },
    {
      // Already approved — shows the community badge in drills.
      id: 'u-seed-crackhouse',
      draft: {
        mapId: 'customs',
        type: 'landmark_mc',
        difficulty: 'enlightened',
        prompt: 'Which of these buildings is the Crackhouse?',
        options: ['Crackhouse', 'Stronghold', 'Dorms Guard Desk', 'ZB-1012'],
        correctAnswer: 'Crackhouse',
        explanation:
          'Crackhouse is the two-story brick medical block between Stronghold and the construction yard.',
        tip: 'Find Stronghold first — Crackhouse is the smaller brick building just south of it.',
      },
      authorId: camper.id,
      authorName: camper.displayName,
      createdAt: hoursAgo(90),
      decidedAt: hoursAgo(70),
      status: 'approved',
      reviews: [
        approve(ratter, hoursAgo(80)),
        approve(loot, hoursAgo(75), 'Clear distractors, all real Customs spots.'),
        approve(
          { ...ratter, id: 'seed-extra', displayName: 'ExitCamper' },
          hoursAgo(70)
        ),
      ],
    },
  ];

  const reports: QuestionReport[] = [
    {
      // c-12's "Streets" answer genuinely looks off — a realistic flag.
      id: 'r-seed-1',
      questionId: 'c-12',
      reporterId: ratter.id,
      reporterName: ratter.displayName,
      reason: 'wrong-answer',
      details: '“Streets” is a different map, not a Customs extract. The spawn/extract pairing needs a rework.',
      createdAt: hoursAgo(15),
      status: 'open',
    },
  ];

  const corrections: CorrectionProposal[] = [
    {
      id: 'f-seed-1',
      questionId: 'c-12',
      draft: {
        mapId: 'customs',
        type: 'extract_logic',
        difficulty: 'essential',
        prompt: 'You spawned at Old Gas Station. Which guaranteed PMC extract is OPEN for you?',
        options: ['Old Gas Station', 'ZB-1011', 'Crossroads', 'Dorms V-Ex'],
        correctAnswer: 'ZB-1011',
        spawnLocation: 'Old Gas Station',
        explanation:
          'Old Gas sits center-south; the guaranteed PMC route from a central spawn runs east to ZB-1011.',
        tip: 'Central spawn? Default to routing east — ZB-1011 is the reliable far-east guarantee.',
      },
      reason: 'Replaces the non-Customs “Streets” answer with the real guaranteed extract and a proper spawn.',
      authorId: loot.id,
      authorName: loot.displayName,
      createdAt: hoursAgo(12),
      status: 'pending',
      reviews: [approve(camper, hoursAgo(9), 'ZB-1011 is right; spawn naming matches the map.')],
    },
  ];

  return {
    ...emptyState(),
    users: [ratter, loot, camper],
    submissions,
    reports,
    corrections,
  };
}
