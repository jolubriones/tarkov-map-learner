import type {
  ActionResult,
  CommunityUser,
  CorrectionProposal,
  FlaggedItem,
  LiveQuestion,
  QuestionDraft,
  QuestionReport,
  ReportReason,
  ReviewDecision,
  Submission,
} from './types';
import type { EloResult, EloState } from './elo';
import type { QuestionDifficulty } from '@/lib/types';
import type { AuthResult, CommunityBackend, IdResult, UrlResult } from './backend';
import {
  actionableReviewCount,
  editCorrection,
  editSubmission,
  fileReport,
  getFlaggedItems,
  getLiveQuestions,
  getSessionUser,
  getState,
  pendingCorrections,
  pendingSubmissions,
  proposeCorrection,
  removeSubmission,
  reviewCorrection,
  reviewSubmission,
  signIn,
  signInDemo,
  signOut,
  signUp,
  submitQuestion,
  subscribe,
  voteKeep,
  withdrawCorrection,
  withdrawSubmission,
} from './store';
import { applyEloAnswer, overallRating, readElo, writeElo } from './elo';
import { blobToDataUrl, preparePhoto } from './photo';

/**
 * Device-local backend: the original stub store behind the async contract.
 *
 * Default until hosted credentials exist. Demo accounts, seeds, instant,
 * offline — and the reference implementation the Supabase adapter must
 * match method for method (the contract suite runs both).
 *
 * Known divergences from hosted (demo-mode trade-offs, documented not
 * hidden): signup ignores email (no mailbox here), sessions are a user id
 * in localStorage, and "peers" are other accounts on this device.
 */
export function createLocalBackend(): CommunityBackend {
  const sessionUser = (): CommunityUser | null => getSessionUser(getState());

  return {
    kind: 'local',

    async getSessionUser() {
      return sessionUser();
    },

    async signUp(username, _email, password, displayName): Promise<AuthResult> {
      const result = signUp(username, password, displayName);
      if (!result.ok) return result;
      const user = sessionUser();
      if (!user) return { ok: false, error: 'Sign-up succeeded but no session started.' };
      return { ok: true, user };
    },

    async signIn(login, password): Promise<AuthResult> {
      const result = signIn(login, password);
      if (!result.ok) return result;
      const user = sessionUser();
      if (!user) return { ok: false, error: 'Sign-in succeeded but no session started.' };
      return { ok: true, user };
    },

    async signOut() {
      signOut();
    },

    async signInDemo(): Promise<AuthResult> {
      const result = signInDemo();
      if (!result.ok) return result;
      const user = sessionUser();
      if (!user) return { ok: false, error: 'Demo sign-in succeeded but no session started.' };
      return { ok: true, user };
    },

    async listLiveQuestions(): Promise<LiveQuestion[]> {
      return getLiveQuestions(getState());
    },

    async listPendingSubmissions(): Promise<Submission[]> {
      return pendingSubmissions(getState());
    },

    async listPendingCorrections(): Promise<CorrectionProposal[]> {
      return pendingCorrections(getState());
    },

    async listFlaggedItems(): Promise<FlaggedItem[]> {
      return getFlaggedItems(getState());
    },

    async listMySubmissions(): Promise<Submission[]> {
      const user = sessionUser();
      if (!user) return [];
      return getState().submissions.filter((s) => s.authorId === user.id);
    },

    async listMyCorrections(): Promise<CorrectionProposal[]> {
      const user = sessionUser();
      if (!user) return [];
      return getState().corrections.filter((c) => c.authorId === user.id);
    },

    async listMyReports(): Promise<QuestionReport[]> {
      const user = sessionUser();
      if (!user) return [];
      return getState().reports.filter((r) => r.reporterId === user.id);
    },

    async countReviewsGiven(): Promise<number> {
      const user = sessionUser();
      if (!user) return 0;
      const s = getState();
      return (
        s.submissions.filter((x) => x.reviews.some((r) => r.reviewerId === user.id)).length +
        s.corrections.filter((x) => x.reviews.some((r) => r.reviewerId === user.id)).length
      );
    },

    async actionableReviewCount(): Promise<number> {
      return actionableReviewCount(getState());
    },

    async submitQuestion(draft: QuestionDraft): Promise<IdResult> {
      return submitQuestion(draft);
    },

    async editSubmission(id: string, draft: QuestionDraft): Promise<ActionResult> {
      return editSubmission(id, draft);
    },

    async withdrawSubmission(id: string): Promise<ActionResult> {
      return withdrawSubmission(id);
    },

    async removeSubmission(id: string): Promise<ActionResult> {
      return removeSubmission(id);
    },

    async reviewSubmission(
      id: string,
      decision: ReviewDecision,
      comment?: string
    ): Promise<ActionResult> {
      return reviewSubmission(id, decision, comment);
    },

    async proposeCorrection(
      questionId: string,
      draft: QuestionDraft,
      reason: string
    ): Promise<IdResult> {
      return proposeCorrection(questionId, draft, reason);
    },

    async editCorrection(
      id: string,
      draft: QuestionDraft,
      reason: string
    ): Promise<ActionResult> {
      return editCorrection(id, draft, reason);
    },

    async withdrawCorrection(id: string): Promise<ActionResult> {
      return withdrawCorrection(id);
    },

    async reviewCorrection(
      id: string,
      decision: ReviewDecision,
      comment?: string
    ): Promise<ActionResult> {
      return reviewCorrection(id, decision, comment);
    },

    async fileReport(
      questionId: string,
      reason: ReportReason,
      details?: string
    ): Promise<ActionResult> {
      return fileReport(questionId, reason, details);
    },

    async voteKeep(questionId: string): Promise<ActionResult> {
      return voteKeep(questionId);
    },

    async uploadPhoto(file: Blob): Promise<UrlResult> {
      try {
        const prepared = await preparePhoto(file);
        return { ok: true, url: await blobToDataUrl(prepared) };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    },

    async readElo(): Promise<EloState> {
      return readElo();
    },

    async answerRated(
      mapId: string,
      difficulty: QuestionDifficulty,
      correct: boolean
    ): Promise<EloResult> {
      const elo = readElo();
      const result = applyEloAnswer(elo, mapId, difficulty, correct);
      writeElo(result.state);
      return {
        state: result.state,
        mapId,
        mapRating: result.mapRating,
        mapAnswered: result.mapAnswered,
        delta: result.delta,
        bonus: result.bonus,
        winStreak: result.winStreak,
        overall: overallRating(result.state),
      };
    },

    subscribe(listener: () => void): () => void {
      return subscribe(listener);
    },
  };
}
