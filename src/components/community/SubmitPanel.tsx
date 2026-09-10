'use client';

import { useState } from 'react';
import { CheckCircle2, ClipboardCheck, PlusCircle, User } from 'lucide-react';
import { useCommunity } from '@/hooks/useCommunity';
import { submitQuestion } from '@/lib/community/store';
import { COMMUNITY_CONFIG as C } from '@/lib/community/config';
import type { QuestionDraft } from '@/lib/community/types';
import QuestionForm from './QuestionForm';

/**
 * Submit tab: the guided template for signed-in users, a sign-in nudge
 * for guests, and a success card pointing at the review queue.
 */
export default function SubmitPanel({
  onRequireAuth,
  onGoReview,
}: {
  onRequireAuth: () => void;
  onGoReview: () => void;
}) {
  const { user } = useCommunity();
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [topError, setTopError] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8 text-center flex flex-col items-center gap-3">
        <span className="w-12 h-12 rounded-2xl bg-emerald-950 border border-emerald-800 flex items-center justify-center">
          <PlusCircle className="w-6 h-6 text-emerald-400" />
        </span>
        <h2 className="text-xl font-extrabold text-zinc-100">Submit a drill question</h2>
        <p className="text-sm text-zinc-400 max-w-md leading-relaxed">
          Questions come from players like you. Sign in to use the template — every submission
          needs an answer plus an explanation, then {C.approvalsToPublish} peer reviews publish it
          to the drill pool.
        </p>
        <button
          onClick={onRequireAuth}
          className="mt-1 px-6 py-3 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-2"
        >
          <User className="w-4 h-4" /> Sign in / Create account
        </button>
      </div>
    );
  }

  if (submittedId) {
    return (
      <div className="rounded-2xl border border-emerald-800 bg-emerald-950/30 p-6 sm:p-8 text-center flex flex-col items-center gap-3">
        <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        <h2 className="text-xl font-extrabold text-zinc-100">Submitted for review</h2>
        <p className="text-sm text-zinc-400 max-w-md leading-relaxed">
          Your question is in the review queue. Once {C.approvalsToPublish} players approve it, it
          joins the drill pool for everyone — you can watch its progress under Review.
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <button
            onClick={onGoReview}
            className="px-5 py-2.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-2"
          >
            <ClipboardCheck className="w-4 h-4" /> Track it in Review
          </button>
          <button
            onClick={() => {
              setSubmittedId(null);
              setTopError(null);
              setFormKey((k) => k + 1);
            }}
            className="px-5 py-2.5 rounded-xl font-semibold text-sm border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Submit another
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = (draft: QuestionDraft) => {
    const result = submitQuestion(draft);
    if (result.ok) {
      setSubmittedId(result.id);
      return { ok: true as const };
    }
    setTopError(result.error);
    return result;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs text-zinc-400 leading-relaxed">
        Posting as <span className="font-bold text-zinc-200">{user.displayName}</span> · needs{' '}
        {C.approvalsToPublish} approvals to go live · answer + explanation + difficulty bin
        required · you can’t review your own entry.
      </div>
      <QuestionForm
        key={formKey}
        submitLabel="Submit for review"
        onSubmit={handleSubmit}
        topError={topError}
      />
    </div>
  );
}
