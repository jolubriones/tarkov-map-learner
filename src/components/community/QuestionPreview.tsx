'use client';

import { useState } from 'react';
import { BookOpen, Compass, Lightbulb, MapPin, Camera, Check } from 'lucide-react';
import type { QuestionDraft } from '@/lib/community/types';
import { QUESTION_TYPE_META } from '@/lib/community/validation';
import { DifficultyBadge } from './ui';

const TYPE_ICON = {
  landmark_mc: Camera,
  compass_check: Compass,
  extract_logic: MapPin,
} as const;

/**
 * Renders a draft exactly like a drill card (minus interactivity), with the
 * correct answer revealed. Shared by the submission live-preview, the
 * review queue, and the flagged/fix flows so reviewers judge what players
 * will actually see.
 */
export default function QuestionPreview({
  draft,
  compact,
}: {
  draft: QuestionDraft;
  compact?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const TypeIcon = TYPE_ICON[draft.type];
  const options = draft.options.map((o) => o.trim()).filter((o) => o !== '');
  const showImage = draft.imageUrl?.trim() && !imageFailed;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-800/80 border border-zinc-700 rounded-full px-2.5 py-1">
          <TypeIcon className="w-3.5 h-3.5" />
          {QUESTION_TYPE_META[draft.type].label}
        </span>
        <DifficultyBadge difficulty={draft.difficulty} />
        {draft.type === 'extract_logic' && draft.spawnLocation?.trim() && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-300 bg-sky-950/60 border border-sky-800 rounded-full px-3 py-1">
            <MapPin className="w-3.5 h-3.5" />
            Spawn: {draft.spawnLocation.trim()}
          </span>
        )}
      </div>

      <p className={`font-bold text-zinc-100 leading-snug ${compact ? 'text-sm' : 'text-base'}`}>
        {draft.prompt.trim() || <span className="text-zinc-600">Your prompt appears here…</span>}
      </p>

      {showImage && (
        <div className="relative overflow-hidden rounded-xl border border-zinc-800 aspect-video max-h-44">
          <img
            src={draft.imageUrl!.trim()}
            alt="Proposed landmark photo"
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.length === 0 && (
          <p className="text-xs text-zinc-600 col-span-full">Options appear here…</p>
        )}
        {options.map((option) => {
          const isCorrect = option === draft.correctAnswer.trim();
          return (
            <div
              key={option}
              className={`px-3 py-2 rounded-lg text-sm font-semibold border flex items-center justify-between gap-2 ${
                isCorrect
                  ? 'bg-emerald-950/60 border-emerald-600 text-emerald-200'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
              }`}
            >
              <span>{option}</span>
              {isCorrect && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-emerald-400">
                  <Check className="w-3.5 h-3.5" /> Answer
                </span>
              )}
            </div>
          );
        })}
      </div>

      {draft.explanation.trim() && (
        <div className="flex items-start gap-2">
          <BookOpen className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-zinc-300">{draft.explanation.trim()}</p>
        </div>
      )}
      {draft.tip?.trim() && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2">
          <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-amber-100/90">{draft.tip.trim()}</p>
        </div>
      )}
    </div>
  );
}
