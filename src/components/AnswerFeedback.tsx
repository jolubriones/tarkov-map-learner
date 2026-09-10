import {
  CheckCircle2,
  XCircle,
  Flame,
  Lightbulb,
  BookOpen,
  Target,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import type { Question } from '@/lib/types';
import { rankForRating } from '@/lib/community/elo';
import { mapLabel } from '@/lib/community/maps';

interface AnswerFeedbackProps {
  question: Question;
  selectedOption: string;
  isCorrect: boolean;
  /** ELO swing: the map's before/after, the overall before/after, + streak juice. */
  elo?: {
    mapId: string;
    before: number;
    after: number;
    overallBefore: number;
    overallAfter: number;
    bonus: number;
    winStreak: number;
  };
}

/**
 * Learning-focused feedback panel shown after the user checks an answer.
 *
 * - Wrong answers: plays alongside the "wrong" sound — explicitly reveals
 *   the correct answer, shows what the user picked, the explanation, and a
 *   tip for how to get it right next time.
 * - Correct answers: reinforces learning with the explanation + tip too.
 * - Both: show the ELO swing, since harder bins move the rating more.
 */
export default function AnswerFeedback({
  question,
  selectedOption,
  isCorrect,
  elo,
}: AnswerFeedbackProps) {
  const delta = elo ? elo.after - elo.before : 0;
  // Overall rank-ups are the big moment; map rank-ups are the frequent one.
  // One banner max — overall wins ties (single-map players move both).
  const overallBefore = elo ? rankForRating(elo.overallBefore) : null;
  const overallAfter = elo ? rankForRating(elo.overallAfter) : null;
  const overallUp = overallBefore && overallAfter && overallAfter.rankMin > overallBefore.rankMin;
  const overallDown = overallBefore && overallAfter && overallAfter.rankMin < overallBefore.rankMin;
  const mapUp = elo && rankForRating(elo.after).rankMin > rankForRating(elo.before).rankMin;
  const mapDown = elo && rankForRating(elo.after).rankMin < rankForRating(elo.before).rankMin;
  const rankedUp = overallUp || (!overallDown && mapUp);
  const rankedDown = overallDown || (!overallUp && mapDown);
  const celebrationRank = overallUp || overallDown ? overallAfter : elo ? rankForRating(elo.after) : null;
  const celebrationScope =
    overallUp || overallDown ? 'Overall' : elo ? mapLabel(elo.mapId) : '';
  return (
    <div
      role="alert"
      className={`rounded-xl border p-4 flex flex-col gap-3 ${
        isCorrect ? 'animate-feedback-in' : 'animate-feedback-shake'
      } ${
        isCorrect
          ? 'bg-emerald-950/50 border-emerald-800 text-emerald-100'
          : 'bg-red-950/50 border-red-800 text-red-100'
      }`}
    >
      {/* Verdict row */}
      <div className="flex items-start gap-3">
        {isCorrect ? (
          <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <XCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
        )}
        <div>
          <h2 className="font-bold text-sm">
            {isCorrect ? 'Excellent — correct!' : 'Incorrect'}
          </h2>
          {!isCorrect && (
            <p className="text-xs mt-0.5 text-zinc-400">
              You answered:{' '}
              <span className="font-semibold text-red-300 line-through decoration-red-400/70">
                {selectedOption}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Correct answer reveal */}
      <div className="flex items-start gap-2.5 rounded-lg border border-emerald-700/60 bg-emerald-900/40 px-3 py-2.5">
        <Target className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-sm leading-snug">
          <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">
            Correct answer:{' '}
          </span>
          <span className="font-bold text-emerald-300">
            {question.correctAnswer}
          </span>
        </p>
      </div>

      {/* Explanation */}
      {question.explanation && (
        <div className="flex items-start gap-2.5">
          <BookOpen className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-zinc-300">
            {question.explanation}
          </p>
        </div>
      )}

      {/* Learning tip */}
      {question.tip && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2.5">
          <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-amber-100/90">
            {question.tip}
          </p>
        </div>
      )}

      {/* ELO swing */}
      {elo && overallAfter && celebrationRank && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
          <span className="text-xs text-zinc-400">
            Overall{' '}
            <span className="font-bold text-zinc-100 tabular-nums">{elo.overallAfter}</span>
            <span className="text-zinc-600"> · {overallAfter.label}</span>
          </span>
          <div className="flex flex-col items-end gap-0.5">
            {rankedUp ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300">
                <TrendingUp className="w-4 h-4" /> {celebrationScope} rank up — {celebrationRank.label}!
              </span>
            ) : rankedDown ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-red-300">
                <TrendingDown className="w-4 h-4" /> {celebrationScope} rank down — {celebrationRank.label}
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1 text-xs font-bold tabular-nums ${delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-red-300' : 'text-zinc-500'}`}
              >
                {delta > 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : delta < 0 ? (
                  <TrendingDown className="w-4 h-4" />
                ) : null}
                {mapLabel(elo.mapId)} {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
            {elo.bonus > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-300">
                <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                Streak ×{elo.winStreak} (+{elo.bonus})
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
