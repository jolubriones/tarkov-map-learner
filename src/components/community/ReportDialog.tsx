'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { useCommunity } from '@/hooks/useCommunity';
import { fileReport } from '@/lib/community/store';
import { REPORT_REASONS, type ReportReason } from '@/lib/community/types';
import { Modal, inputClass } from './ui';

/**
 * Report-a-question dialog from the drill. Filing flags the question into
 * the review queue, where peers either fix it or vote it correct.
 */
export default function ReportDialog({
  questionPrompt,
  questionId,
  onClose,
  onRequireAuth,
}: {
  questionPrompt: string;
  questionId: string;
  onClose: () => void;
  onRequireAuth: () => void;
}) {
  const { user } = useCommunity();
  const [reason, setReason] = useState<ReportReason>('wrong-answer');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!user) {
    return (
      <Modal label="Report question" onClose={onClose}>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Reporting needs an account so the community can weigh reports fairly (and so one person
          can’t spam-flag a question).
        </p>
        <button
          onClick={onRequireAuth}
          className="mt-4 w-full py-2.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
        >
          Sign in / Create account
        </button>
      </Modal>
    );
  }

  if (done) {
    return (
      <Modal label="Report filed" onClose={onClose}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-300 leading-relaxed">
            Thanks — this question is now <span className="font-bold text-amber-300">flagged</span>{' '}
            for community review. Peers will either propose a fix or confirm it’s correct.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Back to drill
          </button>
        </div>
      </Modal>
    );
  }

  const submit = () => {
    if (reason === 'other' && !details.trim()) {
      setError('Describe the problem so reviewers know what to check.');
      return;
    }
    const result = fileReport(questionId, reason, details);
    if (result.ok) {
      setDone(true);
    } else {
      setError(result.error);
    }
  };

  return (
    <Modal label="Report question" onClose={onClose}>
      <p className="text-xs text-zinc-500 leading-snug border-l-2 border-zinc-700 pl-3 mb-3">
        {questionPrompt}
      </p>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Report reason">
        {REPORT_REASONS.map((r) => {
          const active = reason === r.id;
          return (
            <button
              key={r.id}
              role="radio"
              aria-checked={active}
              onClick={() => setReason(r.id)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                active
                  ? 'border-amber-500 bg-amber-950/40'
                  : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-600'
              }`}
            >
              <span className={`block text-sm font-bold ${active ? 'text-amber-200' : 'text-zinc-200'}`}>
                {r.label}
              </span>
              <span className="block text-xs text-zinc-500">{r.hint}</span>
            </button>
          );
        })}
      </div>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder={
          reason === 'other'
            ? 'Describe the problem (required for “Something else”)'
            : 'Details for reviewers (optional but helpful) — e.g. what the answer should be'
        }
        aria-label="Report details"
        className={`${inputClass} mt-3`}
      />
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </p>
      )}
      <button
        onClick={submit}
        className="mt-3 w-full py-2.5 rounded-xl font-bold text-sm bg-amber-600 hover:bg-amber-500 text-white transition-colors flex items-center justify-center gap-2"
      >
        <Flag className="w-4 h-4" /> File report
      </button>
    </Modal>
  );
}
