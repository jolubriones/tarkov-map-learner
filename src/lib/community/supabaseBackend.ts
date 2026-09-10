import type { CommunityBackend } from './backend';

/**
 * Hosted Supabase backend — STUB. Shape is final (it satisfies the full
 * contract); every method throws until the Phase-A2 implementation lands.
 *
 * Planned implementation notes (for the author — same author, later turn):
 * - No static `@supabase/supabase-js` import: the SDK loads lazily via a
 *   dynamic import so `tsc`/build stay green without network-installable
 *   deps. Missing package → "run npm i @supabase/supabase-js" error.
 * - Reads map rows → shared types (Submission/CorrectionProposal/LiveQuestion).
 * - Writes are direct table inserts under RLS (policies enforce the rules)
 *   plus the `answer_rated` RPC; transitions run in DB triggers.
 * - subscribe(): local emitter fired after every mutation (Realtime later).
 */
function stub(method: string): never {
  throw new Error(`Supabase backend not implemented yet (called ${method}).`);
}

export function createSupabaseBackend(): CommunityBackend {
  return {
    kind: 'supabase',
    getSessionUser: () => stub('getSessionUser'),
    signUp: () => stub('signUp'),
    signIn: () => stub('signIn'),
    signOut: () => stub('signOut'),
    listLiveQuestions: () => stub('listLiveQuestions'),
    listPendingSubmissions: () => stub('listPendingSubmissions'),
    listPendingCorrections: () => stub('listPendingCorrections'),
    listFlaggedItems: () => stub('listFlaggedItems'),
    listMySubmissions: () => stub('listMySubmissions'),
    listMyCorrections: () => stub('listMyCorrections'),
    listMyReports: () => stub('listMyReports'),
    actionableReviewCount: () => stub('actionableReviewCount'),
    submitQuestion: () => stub('submitQuestion'),
    editSubmission: () => stub('editSubmission'),
    withdrawSubmission: () => stub('withdrawSubmission'),
    removeSubmission: () => stub('removeSubmission'),
    reviewSubmission: () => stub('reviewSubmission'),
    proposeCorrection: () => stub('proposeCorrection'),
    editCorrection: () => stub('editCorrection'),
    withdrawCorrection: () => stub('withdrawCorrection'),
    reviewCorrection: () => stub('reviewCorrection'),
    fileReport: () => stub('fileReport'),
    voteKeep: () => stub('voteKeep'),
    uploadPhoto: () => stub('uploadPhoto'),
    readElo: () => stub('readElo'),
    answerRated: () => stub('answerRated'),
    subscribe: () => stub('subscribe'),
  };
}
