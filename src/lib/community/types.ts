import type { Question, QuestionDifficulty, QuestionType } from '@/lib/types';

/**
 * Community data model.
 *
 * Storage today: localStorage via `store.ts` (works with the static
 * export, zero backend). The shapes below are deliberately backend-ready —
 * they map 1:1 onto the Supabase tables sketched in `docs/community.md`,
 * so migrating to hosted persistence + auth later is a store swap,
 * not a redesign.
 */

/** The submission template: a question minus its id, plus author context. */
export interface QuestionDraft {
  mapId: string;
  type: QuestionType;
  /** Required: the author bins their own question; reviewers see it and can dispute via corrections. */
  difficulty: QuestionDifficulty;
  prompt: string;
  options: string[];
  correctAnswer: string;
  spawnLocation?: string;
  imageUrl?: string;
  audioUrl?: string;
  explanation: string;
  tip?: string;
}

/** Local account (stub — see `store.ts`; Supabase Auth is the target). */
export interface CommunityUser {
  id: string;
  /** Unique handle, stored lowercase. */
  username: string;
  displayName: string;
  /** Local adapter only — hosted auth owns password material (Supabase Auth). */
  passHash?: string;
  createdAt: string;
  /** True for the built-in demo/seed accounts. */
  seeded?: boolean;
}

export type ReviewDecision = 'approve' | 'reject';

export interface Review {
  reviewerId: string;
  reviewerName: string;
  decision: ReviewDecision;
  comment?: string;
  createdAt: string;
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

/** A community-submitted question awaiting (or past) peer review. */
export interface Submission {
  /** Stable id (`u-…`); becomes the live question id once approved. */
  id: string;
  draft: QuestionDraft;
  authorId: string;
  authorName: string;
  createdAt: string;
  decidedAt?: string;
  status: SubmissionStatus;
  reviews: Review[];
  correctedAt?: string;
  correctedBy?: string;
  /** True for the bundled demo entries that make first-run queues explorable. */
  seeded?: boolean;
}

export const REPORT_REASONS = [
  { id: 'wrong-answer', label: 'Wrong answer', hint: 'The marked answer is incorrect' },
  { id: 'bad-prompt', label: 'Confusing prompt', hint: 'Misleading or unclear wording' },
  { id: 'bad-explanation', label: 'Bad explanation', hint: 'Explanation or tip is wrong' },
  { id: 'broken-image', label: 'Broken image', hint: 'Landmark photo missing or wrong' },
  { id: 'duplicate', label: 'Duplicate', hint: 'Same question already exists' },
  { id: 'other', label: 'Something else', hint: 'Explain in details' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

export type ReportStatus = 'open' | 'resolved' | 'dismissed';

/** A player report against a live (official or community) question. */
export interface QuestionReport {
  id: string;
  questionId: string;
  reporterId: string;
  reporterName: string;
  reason: ReportReason;
  details?: string;
  createdAt: string;
  status: ReportStatus;
}

export type CorrectionStatus = 'pending' | 'approved' | 'rejected';

/** A proposed fixed version of a live question (itself peer-reviewed). */
export interface CorrectionProposal {
  id: string;
  questionId: string;
  draft: QuestionDraft;
  /** Why the current version is wrong / what changed. */
  reason: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  decidedAt?: string;
  status: CorrectionStatus;
  reviews: Review[];
  /** True for the bundled demo entries that make first-run queues explorable. */
  seeded?: boolean;
}

/** A "this flagged question actually looks correct" vote. */
export interface KeepVote {
  userId: string;
  userName: string;
  createdAt: string;
}

export interface CommunityState {
  /** Schema version of this payload (see COMMUNITY_STATE_VERSION in store.ts). */
  version: number;
  users: CommunityUser[];
  sessionUserId: string | null;
  submissions: Submission[];
  corrections: CorrectionProposal[];
  reports: QuestionReport[];
  /** questionId -> keep votes (cleared when the flag resolves). */
  keepVotes: Record<string, KeepVote[]>;
  /** Built-in questionId -> community-corrected draft. */
  overrides: Record<string, QuestionDraft>;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export type IdResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Curator handoff: a player's approved questions as portable JSON.
 * `scripts/merge-questions.mjs` validates each draft, self-hosts its
 * image, and appends it to the seed bank.
 */
export interface QuestionExport {
  format: 'tarkov-map-learner-export';
  version: 1;
  exportedAt: string;
  exportedBy: string;
  questions: {
    submissionId: string;
    authorName: string;
    decidedAt?: string;
    draft: QuestionDraft;
  }[];
}

/** A live drill question plus its community provenance. */
export interface LiveQuestion {
  question: Question;
  source: 'official' | 'community';
  authorName?: string;
  submissionId?: string;
  /** True when a community correction replaced the original. */
  overridden: boolean;
  /** True for bundled demo content (presented honestly, never as peers). */
  seeded?: boolean;
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

export interface DuplicateHit {
  questionId: string;
  prompt: string;
  source: 'official' | 'community' | 'pending';
}
