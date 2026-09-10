import {
  CheckCircle2,
  XCircle,
  Lightbulb,
  BookOpen,
  Target,
} from 'lucide-react';
import type { Question } from '@/lib/types';

interface AnswerFeedbackProps {
  question: Question;
  selectedOption: string;
  isCorrect: boolean;
}

/**
 * Learning-focused feedback panel shown after the user checks an answer.
 *
 * - Wrong answers: plays alongside the "wrong" sound — explicitly reveals
 *   the correct answer, shows what the user picked, the explanation, and a
 *   tip for how to get it right next time.
 * - Correct answers: reinforces learning with the explanation + tip too.
 */
export default function AnswerFeedback({
  question,
  selectedOption,
  isCorrect,
}: AnswerFeedbackProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
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
          <h4 className="font-bold text-sm">
            {isCorrect ? 'Excellent — correct!' : 'Incorrect'}
          </h4>
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
    </div>
  );
}
