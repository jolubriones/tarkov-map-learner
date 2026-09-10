'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  ClipboardCheck,
  Flag,
  Info,
  Pencil,
  Trash2,
  User,
  Wrench,
  X,
} from 'lucide-react';
import {
  useBackend,
  useFlaggedItems,
  useLivePool,
  useMyWork,
  usePendingCorrections,
  usePendingSubmissions,
  useSessionUser,
  type MyWork,
} from '@/hooks/useCommunity';
// Local-only export payload + pure counting helpers — not backend actions,
// so they stay as direct imports (everything mutating goes via useBackend).
import { buildExportPayload, countApprovals, countRejections, getState } from '@/lib/community/store';
import { COMMUNITY_CONFIG as C } from '@/lib/community/config';
import {
  type ActionResult,
  type CommunityUser,
  type CorrectionProposal,
  type FlaggedItem,
  type LiveQuestion,
  type QuestionDraft,
  type Review,
  type Submission,
} from '@/lib/community/types';
import { draftsEqual, findDuplicateHits, questionToDraft } from '@/lib/community/validation';
import { DIFFICULTY_META } from '@/lib/community/difficulty';
import { reportReasonLabel, timeAgo } from '@/lib/community/format';
import QuestionPreview from './QuestionPreview';
import QuestionForm from './QuestionForm';
import { EmptyState, ProgressDots, inputClass } from './ui';
import GuideDialog from './GuideDialog';

type SubTab = 'new' | 'flagged' | 'fixes' | 'mine';

// Stable empties while queries load (keeps card memos from recomputing).
const EMPTY_SUBS: Submission[] = [];
const EMPTY_FIXES: CorrectionProposal[] = [];
const EMPTY_FLAGGED: FlaggedItem[] = [];
const EMPTY_LIVE: LiveQuestion[] = [];

function PaneLoading() {
  return <p className="text-sm text-zinc-500 py-8 text-center">Loading…</p>;
}

/**
 * Review mode: the community quality-control room.
 * - New: pending submissions waiting for 3 approvals.
 * - Flagged: live questions players reported, with fix + keep flows.
 * - Fixes: proposed corrections awaiting 3 approvals.
 * - Mine: the signed-in player's own contributions and their status.
 */
export default function ReviewQueue({ onRequireAuth }: { onRequireAuth: () => void }) {
  const { data: user, loading: userLoading } = useSessionUser();
  const { data: subsData, loading: subsLoading } = usePendingSubmissions();
  const { data: fixesData, loading: fixesLoading } = usePendingCorrections();
  const { data: flaggedData, loading: flaggedLoading } = useFlaggedItems();
  const { data: myWork, loading: myLoading } = useMyWork();
  const { data: liveData } = useLivePool();
  const [tab, setTab] = useState<SubTab>('new');
  const [howOpen, setHowOpen] = useState(false);

  const subs = subsData ?? EMPTY_SUBS;
  const fixes = fixesData ?? EMPTY_FIXES;
  const flagged = flaggedData ?? EMPTY_FLAGGED;
  const live = liveData ?? EMPTY_LIVE;
  const mineCount = myWork
    ? myWork.submissions.length + myWork.corrections.length + myWork.reports.length
    : 0;

  const tabs: { id: SubTab; label: string; count: number }[] = [
    { id: 'new', label: 'New', count: subs.length },
    { id: 'flagged', label: 'Flagged', count: flagged.length },
    { id: 'fixes', label: 'Fixes', count: fixes.length },
    { id: 'mine', label: 'Mine', count: mineCount },
  ];

  if (userLoading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex gap-1 rounded-xl bg-zinc-900 border border-zinc-800 p-1 text-sm font-bold overflow-x-auto"
          role="tablist"
          aria-label="Review queues"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 sm:px-4 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                tab === t.id ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.label}
              <span
                className={`text-[11px] font-extrabold tabular-nums rounded-full px-1.5 py-0.5 ${
                  t.count > 0 ? 'bg-amber-600/90 text-white' : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setHowOpen(true)}
          title="How community review works"
          className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Info className="w-4 h-4" />
          <span className="hidden sm:inline">How it works</span>
        </button>
      </div>

      {tab === 'new' &&
        (subsLoading && !subsData ? (
          <PaneLoading />
        ) : subs.length === 0 ? (
          <EmptyState
            title="Queue clear"
            body="No submissions waiting. Submit a question and it will show up here for peer review."
          />
        ) : (
          subs.map((s) => (
            <SubmissionCard
              key={s.id}
              submission={s}
              user={user}
              onRequireAuth={onRequireAuth}
              live={live}
              pendingSubs={subs}
            />
          ))
        ))}

      {tab === 'flagged' &&
        (flaggedLoading && !flaggedData ? (
          <PaneLoading />
        ) : flagged.length === 0 ? (
          <EmptyState
            title="Nothing flagged"
            body="No live questions are under suspicion. If you spot a wrong answer mid-drill, hit Report and it lands here."
          />
        ) : (
          flagged.map((f) => (
            <FlaggedCard key={f.questionId} item={f} user={user} onRequireAuth={onRequireAuth} />
          ))
        ))}

      {tab === 'fixes' &&
        (fixesLoading && !fixesData ? (
          <PaneLoading />
        ) : fixes.length === 0 ? (
          <EmptyState
            title="No pending fixes"
            body="Nobody has proposed a correction yet. Flagged questions get fixed here once reviewers approve a new version."
          />
        ) : (
          fixes.map((c) => (
            <CorrectionCard
              key={c.id}
              fix={c}
              user={user}
              onRequireAuth={onRequireAuth}
              live={live}
            />
          ))
        ))}

      {tab === 'mine' && (
        <MineSection
          onRequireAuth={onRequireAuth}
          user={user}
          myWork={myWork}
          myLoading={myLoading && !myWork}
          live={live}
        />
      )}

      {howOpen && (
        <GuideDialog initialSection="review" onClose={() => setHowOpen(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared review block: progress + existing reviews + approve/reject
// ---------------------------------------------------------------------------

function ReviewBlock({
  reviews,
  approvalsNeeded,
  rejectionsNeeded,
  user,
  isAuthor,
  onRequireAuth,
  onReview,
  approveLabel = 'Approve',
  rejectLabel = 'Reject',
}: {
  reviews: Review[];
  approvalsNeeded: number;
  rejectionsNeeded: number;
  user: CommunityUser | null;
  isAuthor: boolean;
  onRequireAuth: () => void;
  onReview: (decision: 'approve' | 'reject', comment: string) => Promise<ActionResult>;
  approveLabel?: string;
  rejectLabel?: string;
}) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mine = user ? reviews.find((r) => r.reviewerId === user.id) : undefined;

  const act = (decision: 'approve' | 'reject') => {
    if (busy) return;
    if (decision === 'reject' && comment.trim().length < C.minRejectionNoteLength) {
      setError('Rejections need a short note so the author knows what to fix.');
      return;
    }
    setBusy(true);
    void onReview(decision, comment).then((result) => {
      setBusy(false);
      if (result.ok) {
        setComment('');
        setError(null);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3.5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-400">
          <Check className="w-3.5 h-3.5 text-emerald-400" /> Approvals
          <ProgressDots current={countApprovals(reviews)} total={approvalsNeeded} tone="emerald" />
        </span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-400">
          <X className="w-3.5 h-3.5 text-red-400" /> Rejections
          <ProgressDots current={countRejections(reviews)} total={rejectionsNeeded} tone="red" />
        </span>
      </div>

      {reviews.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {reviews.map((r) => (
            <li
              key={`${r.reviewerId}-${r.createdAt}`}
              className="flex items-start gap-2 text-xs leading-snug"
            >
              <span
                className={`mt-0.5 inline-flex items-center gap-1 font-bold shrink-0 ${
                  r.decision === 'approve' ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {r.decision === 'approve' ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <X className="w-3.5 h-3.5" />
                )}
                {r.reviewerName}
              </span>
              <span className="text-zinc-500 min-w-0">
                {r.comment ? <span className="text-zinc-400">“{r.comment}” · </span> : null}
                {timeAgo(r.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!user ? (
        <button
          onClick={onRequireAuth}
          className="w-full py-2.5 rounded-xl font-bold text-xs sm:text-sm border border-dashed border-zinc-700 text-zinc-300 hover:bg-zinc-800/60 transition-colors flex items-center justify-center gap-2"
        >
          <User className="w-4 h-4" /> Sign in to review
        </button>
      ) : isAuthor ? (
        <p className="text-xs text-zinc-500 text-center">
          Your entry — peers decide. No self-reviews keeps the pool honest.
        </p>
      ) : mine ? (
        <p className="text-xs text-zinc-500 text-center">
          You {mine.decision === 'approve' ? 'approved' : 'rejected'} this
          {mine.comment ? <> — “{mine.comment}”</> : null}. One review per player.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            placeholder="Note for the author (optional for approvals, required for rejections)"
            aria-label="Review note"
            className={inputClass}
          />
          {error && (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => act('approve')}
              disabled={busy}
              className="py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-colors flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" /> {approveLabel}
            </button>
            <button
              onClick={() => act('reject')}
              disabled={busy}
              className="py-2.5 rounded-xl font-bold text-xs sm:text-sm border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
            >
              <X className="w-4 h-4" /> {rejectLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AuthorLine({ name, createdAt }: { name: string; createdAt: string }) {
  return (
    <p className="text-xs text-zinc-500">
      by <span className="font-bold text-zinc-300">{name}</span> · {timeAgo(createdAt)}
    </p>
  );
}

// ---------------------------------------------------------------------------
// New submissions
// ---------------------------------------------------------------------------

function SubmissionCard({
  submission,
  user,
  onRequireAuth,
  live,
  pendingSubs,
}: {
  submission: Submission;
  user: CommunityUser | null;
  onRequireAuth: () => void;
  live: LiveQuestion[];
  pendingSubs: Submission[];
}) {
  const { backend } = useBackend();
  const dupHits = useMemo(() => {
    const candidates = [
      ...live.map((l) => ({
        questionId: l.question.id,
        prompt: l.question.prompt,
        source: l.source,
      })),
      ...pendingSubs.map((s) => ({
        questionId: s.id,
        prompt: s.draft.prompt,
        source: 'pending' as const,
      })),
    ];
    return findDuplicateHits(candidates, submission.draft.prompt, submission.id);
  }, [live, pendingSubs, submission.draft.prompt, submission.id]);
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-300 bg-sky-950/60 border border-sky-800 rounded-full px-2.5 py-1">
          <ClipboardCheck className="w-3.5 h-3.5" /> New submission
        </span>
        {submission.seeded && (
          <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-zinc-500 border border-zinc-800 rounded-full px-2 py-0.5">
            demo
          </span>
        )}
        <AuthorLine name={submission.authorName} createdAt={submission.createdAt} />
      </div>
      <QuestionPreview draft={submission.draft} />
      {dupHits.length > 0 && (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/40 px-3 py-2.5">
          <p className="text-xs font-bold text-amber-300">
            Possible duplicate{dupHits.length === 1 ? '' : 's'} — verify before approving:
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {dupHits.slice(0, 3).map((hit) => (
              <li key={hit.questionId} className="text-xs text-zinc-400 leading-snug">
                <span className="font-semibold text-zinc-300">
                  {hit.source === 'official' ? 'Official' : hit.source === 'community' ? 'Community' : 'In review'}:{' '}
                </span>
                {hit.prompt}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ReviewBlock
        reviews={submission.reviews}
        approvalsNeeded={C.approvalsToPublish}
        rejectionsNeeded={C.rejectionsToDecline}
        user={user}
        isAuthor={user?.id === submission.authorId}
        onRequireAuth={onRequireAuth}
        onReview={async (decision, comment) => {
          if (!backend) return { ok: false as const, error: 'Still loading — try again in a moment.' };
          return backend.reviewSubmission(submission.id, decision, comment);
        }}
      />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Corrections (Fixes tab + nested under flagged questions)
// ---------------------------------------------------------------------------

function CorrectionCard({
  fix,
  user,
  onRequireAuth,
  live,
}: {
  fix: CorrectionProposal;
  user: CommunityUser | null;
  onRequireAuth: () => void;
  live: LiveQuestion[];
}) {
  const { backend } = useBackend();
  const current = live.find((l) => l.question.id === fix.questionId);
  const changedAnswer =
    current && current.question.correctAnswer !== fix.draft.correctAnswer.trim();
  const changedBin = current && current.question.difficulty !== fix.draft.difficulty;

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-300 bg-violet-950/60 border border-violet-800 rounded-full px-2.5 py-1">
          <Wrench className="w-3.5 h-3.5" /> Proposed fix
        </span>
        {fix.seeded && (
          <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-zinc-500 border border-zinc-800 rounded-full px-2 py-0.5">
            demo
          </span>
        )}
        <AuthorLine name={fix.authorName} createdAt={fix.createdAt} />
      </div>

      <div className="rounded-xl border border-violet-800/60 bg-violet-950/30 px-3 py-2.5 text-xs leading-relaxed text-violet-100/90">
        <span className="font-bold uppercase tracking-wide text-[11px] text-violet-300">
          What was wrong:{' '}
        </span>
        {fix.reason}
      </div>

      {current && (
        <p className="text-xs text-zinc-500 leading-snug border-l-2 border-zinc-700 pl-3">
          Fixes: {current.question.prompt}
          <span className="block mt-0.5">
            Answer{' '}
            <span className="font-semibold text-red-300 line-through">
              {current.question.correctAnswer}
            </span>
            {changedAnswer ? (
              <>
                {' → '}
                <span className="font-bold text-emerald-300">{fix.draft.correctAnswer}</span>
              </>
            ) : (
              <> (unchanged — wording or details fixed)</>
            )}
          </span>
          {changedBin && current && (
            <span className="block mt-0.5">
              Difficulty{' '}
              <span className="font-semibold text-red-300 line-through">
                {DIFFICULTY_META[current.question.difficulty].label}
              </span>
              {' → '}
              <span className="font-bold text-emerald-300">
                {DIFFICULTY_META[fix.draft.difficulty].label}
              </span>
            </span>
          )}
        </p>
      )}

      <QuestionPreview draft={fix.draft} compact />
      <ReviewBlock
        reviews={fix.reviews}
        approvalsNeeded={C.approvalsToApplyFix}
        rejectionsNeeded={C.rejectionsToDeclineFix}
        user={user}
        isAuthor={user?.id === fix.authorId}
        onRequireAuth={onRequireAuth}
        onReview={async (decision, comment) => {
          if (!backend) return { ok: false as const, error: 'Still loading — try again in a moment.' };
          return backend.reviewCorrection(fix.id, decision, comment);
        }}
        approveLabel="Approve fix"
        rejectLabel="Reject fix"
      />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Flagged questions
// ---------------------------------------------------------------------------

function FlaggedCard({
  item,
  user,
  onRequireAuth,
}: {
  item: FlaggedItem;
  user: CommunityUser | null;
  onRequireAuth: () => void;
}) {
  const { backend } = useBackend();
  const [fixing, setFixing] = useState(false);
  const [keepError, setKeepError] = useState<string | null>(null);
  const [keepBusy, setKeepBusy] = useState(false);
  const voted = user ? item.keepVotes.some((v) => v.userId === user.id) : false;

  const keep = () => {
    if (!backend || keepBusy) return;
    setKeepBusy(true);
    void backend.voteKeep(item.questionId).then((result) => {
      setKeepBusy(false);
      setKeepError(result.ok ? null : result.error);
    });
  };

  return (
    <article className="rounded-2xl border border-amber-800/70 bg-zinc-900 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300 bg-amber-950/60 border border-amber-800 rounded-full px-2.5 py-1">
          <Flag className="w-3.5 h-3.5" />
          Flagged · {item.reports.length} report{item.reports.length === 1 ? '' : 's'}
        </span>
        <span className="text-xs text-zinc-500">
          {item.live.source === 'community' ? (
            <>
              Community question by{' '}
              <span className="font-bold text-zinc-300">{item.live.authorName}</span>
            </>
          ) : (
            <>Official question{item.live.overridden ? ' (community-corrected)' : ''}</>
          )}
        </span>
      </div>

      <QuestionPreview draft={questionToDraft(item.live.question)} compact />

      <ul className="flex flex-col gap-1.5">
        {item.reports.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs leading-snug"
          >
            <span className="font-bold text-amber-300">{reportReasonLabel(r.reason)}</span>
            <span className="text-zinc-500">
              {' '}
              · {r.reporterName} · {timeAgo(r.createdAt)}
            </span>
            {r.details && <span className="block mt-0.5 text-zinc-400">“{r.details}”</span>}
          </li>
        ))}
      </ul>

      {item.corrections.map((c) => (
        <CorrectionCard
          key={c.id}
          fix={c}
          user={user}
          onRequireAuth={onRequireAuth}
          live={[item.live]}
        />
      ))}

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3.5 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-zinc-400">
            {C.keepVotesToClearFlag} “looks correct” votes clear a bad flag:
          </span>
          <ProgressDots
            current={item.keepVotes.length}
            total={C.keepVotesToClearFlag}
            tone="amber"
          />
        </div>
        {item.keepVotes.length > 0 && (
          <p className="text-xs text-zinc-500">
            Voted correct by {item.keepVotes.map((v) => v.userName).join(', ')}
          </p>
        )}
        {keepError && (
          <p role="alert" className="text-xs text-red-400">
            {keepError}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {!user ? (
            <button
              onClick={onRequireAuth}
              className="sm:col-span-2 py-2.5 rounded-xl font-bold text-xs sm:text-sm border border-dashed border-zinc-700 text-zinc-300 hover:bg-zinc-800/60 transition-colors flex items-center justify-center gap-2"
            >
              <User className="w-4 h-4" /> Sign in to fix or verify
            </button>
          ) : (
            <>
              <button
                onClick={() => setFixing((f) => !f)}
                className="py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-violet-600 hover:bg-violet-500 text-white transition-colors flex items-center justify-center gap-1.5"
              >
                <Wrench className="w-4 h-4" /> {fixing ? 'Close editor' : 'Propose a fix'}
              </button>
              <button
                onClick={keep}
                disabled={voted || keepBusy}
                title={voted ? 'You already voted' : 'Vote that this question is actually correct'}
                className={`py-2.5 rounded-xl font-bold text-xs sm:text-sm border transition-colors flex items-center justify-center gap-1.5 ${
                  voted || keepBusy
                    ? 'border-zinc-800 text-zinc-600 cursor-default'
                    : 'border-zinc-700 text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                <Check className="w-4 h-4" /> {voted ? 'You voted correct' : 'Looks correct'}
              </button>
            </>
          )}
        </div>
      </div>

      {fixing && user && (
        <CorrectionEditor
          questionId={item.questionId}
          current={questionToDraft(item.live.question)}
          onCancel={() => setFixing(false)}
          onDone={() => setFixing(false)}
        />
      )}
    </article>
  );
}

function CorrectionEditor({
  questionId,
  current,
  onCancel,
  onDone,
}: {
  questionId: string;
  current: QuestionDraft;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { backend } = useBackend();
  const [reason, setReason] = useState('');
  const [topError, setTopError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-5 text-center flex flex-col items-center gap-2">
        <Check className="w-8 h-8 text-emerald-400" />
        <p className="font-bold text-zinc-100 text-sm">Fix submitted for review</p>
        <p className="text-xs text-zinc-400 max-w-sm">
          {C.approvalsToApplyFix} approvals apply it to the live question and resolve its reports.
        </p>
        <button
          onClick={onDone}
          className="mt-1 px-5 py-2 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  const handleSubmit = async (draft: QuestionDraft): Promise<ActionResult> => {
    if (draftsEqual(current, draft)) {
      const err = 'No changes yet — edit the question before submitting the fix.';
      setTopError(err);
      return { ok: false as const, error: err };
    }
    if (reason.trim().length < C.minCorrectionReasonLength) {
      const err = `Explain what was wrong (min ${C.minCorrectionReasonLength} characters) so reviewers can judge the fix.`;
      setTopError(err);
      return { ok: false as const, error: err };
    }
    if (!backend) {
      const err = 'Still loading — try again in a moment.';
      setTopError(err);
      return { ok: false as const, error: err };
    }
    const result = await backend.proposeCorrection(questionId, draft, reason);
    if (result.ok) {
      setSubmitted(true);
      return { ok: true as const };
    }
    setTopError(result.error);
    return result;
  };

  return (
    <div className="rounded-xl border border-violet-800/60 bg-violet-950/20 p-3.5 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label
          className="text-xs font-bold uppercase tracking-wider text-zinc-400"
          htmlFor="fix-reason"
        >
          What’s wrong with the current version?
        </label>
        <textarea
          id="fix-reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setTopError(null);
          }}
          rows={2}
          maxLength={500}
          placeholder="e.g. The marked answer is a different map — the real extract is ZB-1011."
          className={`${inputClass} !bg-zinc-950/70`}
        />
      </div>
      <QuestionForm
        initial={current}
        excludeQuestionId={questionId}
        submitLabel="Submit fix for review"
        onSubmit={handleSubmit}
        topError={topError}
      />
      <button
        onClick={onCancel}
        className="self-center text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mine
// ---------------------------------------------------------------------------

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'text-amber-300 bg-amber-950/60 border-amber-800',
    approved: 'text-emerald-300 bg-emerald-950/60 border-emerald-800',
    rejected: 'text-red-300 bg-red-950/60 border-red-800',
    open: 'text-amber-300 bg-amber-950/60 border-amber-800',
    resolved: 'text-emerald-300 bg-emerald-950/60 border-emerald-800',
    dismissed: 'text-zinc-400 bg-zinc-900 border-zinc-700',
  };
  return (
    <span
      className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wider rounded-full px-2.5 py-1 border ${styles[status] ?? styles.pending}`}
    >
      {status}
    </span>
  );
}

/**
 * Violet editing shell shared by the Mine cards: the reviews-restart
 * notice, the form bits, and a cancel button.
 */
function EditingShell({
  noun,
  onCancel,
  children,
}: {
  noun: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-violet-800/60 bg-violet-950/20 p-3.5 flex flex-col gap-3">
      <p className="text-xs text-zinc-400 leading-relaxed">
        Saving replaces your {noun} and{' '}
        <span className="font-bold text-zinc-200">clears existing reviews</span> — they
        judged the old version.
      </p>
      {children}
      <button
        onClick={onCancel}
        className="self-center text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

/** Approve/reject progress dots for a pending Mine item. */
function PendingProgress({
  reviews,
  approveTotal,
  rejectTotal,
}: {
  reviews: Review[];
  approveTotal: number;
  rejectTotal: number;
}) {
  return (
    <span className="flex items-center gap-3 text-xs">
      <span className="inline-flex items-center gap-1 font-semibold text-zinc-500">
        <Check className="w-3 h-3 text-emerald-400" />
        <ProgressDots current={countApprovals(reviews)} total={approveTotal} />
      </span>
      <span className="inline-flex items-center gap-1 font-semibold text-zinc-500">
        <X className="w-3 h-3 text-red-400" />
        <ProgressDots current={countRejections(reviews)} total={rejectTotal} tone="red" />
      </span>
    </span>
  );
}

/**
 * Edit / withdraw row for a pending Mine item. Owns its withdraw
 * confirmation; failures surface through the parent's error slot.
 */
function AuthorBar({
  noun,
  error,
  onEdit,
  onWithdraw,
}: {
  noun: string;
  error: string | null;
  onEdit: () => void;
  onWithdraw: () => Promise<ActionResult>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {error && (
        <p role="alert" className="w-full text-xs text-red-400">
          {error}
        </p>
      )}
      {confirming ? (
        <>
          <span className="text-xs text-zinc-400">Withdraw this {noun}?</span>
          <button
            onClick={() => {
              if (busy) return;
              setBusy(true);
              void onWithdraw().then((result) => {
                setBusy(false);
                if (!result.ok) setConfirming(false);
              });
            }}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg font-bold text-xs bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white transition-colors"
          >
            Yes, withdraw
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg font-semibold text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-60 transition-colors"
          >
            Keep it
          </button>
        </>
      ) : (
        <>
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs border border-zinc-700 text-zinc-500 hover:text-red-400 hover:border-red-800 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Withdraw
          </button>
        </>
      )}
    </div>
  );
}

function RemoveFromPool({ onRemove }: { onRemove: () => Promise<ActionResult> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="self-start text-xs font-semibold text-zinc-600 hover:text-red-400 transition-colors"
      >
        Remove from pool
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-400">Remove this live question from your pool?</span>
      <button
        onClick={() => {
          if (busy) return;
          setBusy(true);
          void onRemove().then((result) => {
            setBusy(false);
            if (result.ok) setConfirming(false);
          });
        }}
        disabled={busy}
        className="px-3 py-1.5 rounded-lg font-bold text-xs bg-red-950/60 border border-red-800 text-red-300 hover:bg-red-900/60 disabled:opacity-60 transition-colors"
      >
        Yes, remove
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={busy}
        className="px-3 py-1.5 rounded-lg font-semibold text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-60 transition-colors"
      >
        Keep
      </button>
    </div>
  );
}

function MineSubmissionCard({ submission: s }: { submission: Submission }) {
  const { backend } = useBackend();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (editing && s.status === 'pending') {
    return (
      <EditingShell
        noun="draft"
        onCancel={() => {
          setEditing(false);
          setError(null);
        }}
      >
        <QuestionForm
          initial={s.draft}
          excludeQuestionId={s.id}
          submitLabel="Save changes"
          topError={error}
          onSubmit={async (draft) => {
            if (!backend) {
              const err = 'Still loading — try again in a moment.';
              setError(err);
              return { ok: false as const, error: err };
            }
            const result = await backend.editSubmission(s.id, draft);
            if (result.ok) {
              setEditing(false);
              setError(null);
              return { ok: true as const };
            }
            setError(result.error);
            return result;
          }}
        />
      </EditingShell>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3.5 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusPill status={s.status} />
        {s.status === 'pending' && (
          <PendingProgress
            reviews={s.reviews}
            approveTotal={C.approvalsToPublish}
            rejectTotal={C.rejectionsToDecline}
          />
        )}
      </div>
      <p className="text-sm font-semibold text-zinc-200 leading-snug">{s.draft.prompt}</p>
      <p className="text-xs text-zinc-500">
        Answer: <span className="font-bold text-zinc-300">{s.draft.correctAnswer}</span> ·{' '}
        {timeAgo(s.createdAt)}
      </p>
      {s.status === 'pending' && (
        <AuthorBar
          noun="submission"
          error={error}
          onEdit={() => setEditing(true)}
          onWithdraw={async () => {
            if (!backend) {
              const err = 'Still loading — try again in a moment.';
              setError(err);
              return { ok: false as const, error: err };
            }
            const result = await backend.withdrawSubmission(s.id);
            if (!result.ok) setError(result.error);
            return result;
          }}
        />
      )}
      {s.status === 'approved' && (
        <RemoveFromPool
          onRemove={async () => {
            if (!backend) {
              const err = 'Still loading — try again in a moment.';
              setError(err);
              return { ok: false as const, error: err };
            }
            const result = await backend.removeSubmission(s.id);
            if (!result.ok) setError(result.error);
            return result;
          }}
        />
      )}
      {s.status !== 'pending' && error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

function MineCorrectionCard({ fix: c, live }: { fix: CorrectionProposal; live: LiveQuestion[] }) {
  const { backend } = useBackend();
  const target = live.find((l) => l.question.id === c.questionId);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(c.reason);
  const [error, setError] = useState<string | null>(null);

  if (editing && c.status === 'pending') {
    return (
      <EditingShell
        noun="fix"
        onCancel={() => {
          setEditing(false);
          setError(null);
          setReason(c.reason);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-bold uppercase tracking-wider text-zinc-400"
            htmlFor={`mine-fix-reason-${c.id}`}
          >
            What’s wrong with the current version?
          </label>
          <textarea
            id={`mine-fix-reason-${c.id}`}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            rows={2}
            maxLength={500}
            className={`${inputClass} !bg-zinc-950/70`}
          />
        </div>
        <QuestionForm
          initial={c.draft}
          excludeQuestionId={c.questionId}
          submitLabel="Save changes"
          topError={error}
          onSubmit={async (draft) => {
            if (!backend) {
              const err = 'Still loading — try again in a moment.';
              setError(err);
              return { ok: false as const, error: err };
            }
            const result = await backend.editCorrection(c.id, draft, reason);
            if (result.ok) {
              setEditing(false);
              setError(null);
              return { ok: true as const };
            }
            setError(result.error);
            return result;
          }}
        />
      </EditingShell>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3.5 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusPill status={c.status} />
        {c.status === 'pending' && (
          <PendingProgress
            reviews={c.reviews}
            approveTotal={C.approvalsToApplyFix}
            rejectTotal={C.rejectionsToDeclineFix}
          />
        )}
      </div>
      <p className="text-sm font-semibold text-zinc-200 leading-snug">
        Fix for: {target ? target.question.prompt : '(removed question)'}
      </p>
      <p className="text-xs text-zinc-500">“{c.reason}” · {timeAgo(c.createdAt)}</p>
      {c.status === 'pending' && (
        <AuthorBar
          noun="fix"
          error={error}
          onEdit={() => setEditing(true)}
          onWithdraw={async () => {
            if (!backend) {
              const err = 'Still loading — try again in a moment.';
              setError(err);
              return { ok: false as const, error: err };
            }
            const result = await backend.withdrawCorrection(c.id);
            if (!result.ok) setError(result.error);
            return result;
          }}
        />
      )}
    </div>
  );
}

function MineSection({
  onRequireAuth,
  user,
  myWork,
  myLoading,
  live,
}: {
  onRequireAuth: () => void;
  user: CommunityUser | null;
  myWork: MyWork | null;
  myLoading: boolean;
  live: LiveQuestion[];
}) {
  const { kind } = useBackend();
  if (!user) {
    return (
      <EmptyState
        title="Sign in to track your impact"
        body="Your submissions, fixes, and reports — with live review progress — show up here once you have an account."
        action={
          <button
            onClick={onRequireAuth}
            className="px-5 py-2.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Sign in / Create account
          </button>
        }
      />
    );
  }

  if (myLoading || !myWork) {
    return <PaneLoading />;
  }

  const mySubs = [...myWork.submissions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const myFixes = [...myWork.corrections].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const myReports = [...myWork.reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const approvedSubs = mySubs.filter((s) => s.status === 'approved');

  if (mySubs.length + myFixes.length + myReports.length === 0) {
    return (
      <EmptyState
        title="No contributions yet"
        body="Submit a question, fix a flagged one, or report a bad answer mid-drill — your ecosystem impact lands here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {mySubs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            My submissions ({mySubs.length})
          </h3>
          {mySubs.map((s) => (
            <MineSubmissionCard key={s.id} submission={s} />
          ))}
        </section>
      )}

      {kind === 'local' && approvedSubs.length > 0 && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 flex flex-col gap-2">
          <p className="text-xs text-zinc-400 leading-relaxed">
            <span className="font-bold text-zinc-200">Take them with you.</span> Export your{' '}
            {approvedSubs.length} approved question{approvedSubs.length === 1 ? '' : 's'} as
            JSON — send it to a maintainer and they join the shared bank (images get
            self-hosted on merge).
          </p>
          <button
            onClick={() => {
              const payload = buildExportPayload(getState(), user.id);
              const blob = new Blob([JSON.stringify(payload, null, 2)], {
                type: 'application/json',
              });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `tarkov-questions-${user.username}-${new Date().toISOString().slice(0, 10)}.json`;
              link.click();
              URL.revokeObjectURL(url);
            }}
            className="self-start px-4 py-2 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Export {approvedSubs.length} approved
          </button>
        </section>
      )}

      {myFixes.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            My fixes ({myFixes.length})
          </h3>
          {myFixes.map((c) => (
            <MineCorrectionCard key={c.id} fix={c} live={live} />
          ))}
        </section>
      )}

      {myReports.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            My reports ({myReports.length})
          </h3>
          {myReports.map((r) => {
            const target = live.find((l) => l.question.id === r.questionId);
            return (
              <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3.5 flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusPill status={r.status} />
                  <span className="text-xs text-zinc-500">{timeAgo(r.createdAt)}</span>
                </div>
                <p className="text-sm font-semibold text-zinc-200 leading-snug">
                  {reportReasonLabel(r.reason)}: {target ? target.question.prompt : '(removed question)'}
                </p>
                {r.details && <p className="text-xs text-zinc-500">“{r.details}”</p>}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
