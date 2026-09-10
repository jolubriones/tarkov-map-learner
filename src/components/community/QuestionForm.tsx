'use client';

import { useMemo, useState } from 'react';
import { Camera, Compass, MapPin, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { QuestionDraft, ActionResult } from '@/lib/community/types';
import { COMMUNITY_CONFIG as C } from '@/lib/community/config';
import {
  COMPASS_POINTS,
  QUESTION_TYPE_META,
  blankDraft,
  exampleDraft,
  validateDraft,
  type DraftErrors,
} from '@/lib/community/validation';
import QuestionPreview from './QuestionPreview';
import { FieldError, inputClass, labelClass } from './ui';
import { useCommunity } from '@/hooks/useCommunity';
import { findDuplicates } from '@/lib/community/store';
import { DIFFICULTY_META, DIFFICULTY_ORDER } from '@/lib/community/difficulty';
import { MAPS } from '@/lib/community/maps';
import type { QuestionDifficulty, QuestionType } from '@/lib/types';

const TYPE_ORDER: QuestionType[] = ['landmark_mc', 'compass_check', 'extract_logic'];
const TYPE_ICON = {
  landmark_mc: Camera,
  compass_check: Compass,
  extract_logic: MapPin,
} as const;

/**
 * The community submission template: pick a type, fill the guided fields,
 * mark the (mandatory) answer, watch the live preview. Reused for
 * proposing corrections — same template, prefilled with the live question.
 */
export default function QuestionForm({
  initial,
  submitLabel,
  onSubmit,
  topError,
  excludeQuestionId,
}: {
  initial?: QuestionDraft;
  submitLabel: string;
  onSubmit: (draft: QuestionDraft) => ActionResult;
  /** Server/store-side error to show above the submit button. */
  topError?: string | null;
  /** Skip this id in duplicate detection (your own draft when editing). */
  excludeQuestionId?: string;
}) {
  const { state: communityState } = useCommunity();
  const [type, setType] = useState<QuestionType>(initial?.type ?? 'landmark_mc');
  // No default: the author must consciously bin their own question.
  const [difficulty, setDifficulty] = useState<QuestionDifficulty | null>(
    initial?.difficulty ?? null
  );
  const [mapId, setMapId] = useState(initial?.mapId ?? 'customs');
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [options, setOptions] = useState<string[]>(
    initial ? [...initial.options] : blankDraft('landmark_mc').options
  );
  const [correctAnswer, setCorrectAnswer] = useState(initial?.correctAnswer ?? '');
  const [spawnLocation, setSpawnLocation] = useState(initial?.spawnLocation ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [tip, setTip] = useState(initial?.tip ?? '');
  const [errors, setErrors] = useState<DraftErrors>({});
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false);

  const draft: QuestionDraft = useMemo(
    () => ({
      mapId,
      type,
      // Preview fallback only — submit is blocked until a bin is picked.
      difficulty: difficulty ?? 'essential',
      prompt,
      options,
      correctAnswer,
      spawnLocation: type === 'extract_logic' ? spawnLocation : undefined,
      imageUrl,
      explanation,
      tip,
    }),
    [mapId, type, difficulty, prompt, options, correctAnswer, spawnLocation, imageUrl, explanation, tip]
  );

  const isCompass = type === 'compass_check';

  const dupHits = useMemo(
    () => findDuplicates(communityState, prompt, excludeQuestionId),
    [communityState, prompt, excludeQuestionId]
  );

  const switchType = (next: QuestionType) => {
    setType(next);
    setErrors({});
    if (next === 'compass_check') {
      setOptions(['N', 'E', 'S', 'W']);
      setCorrectAnswer('');
    } else if (isCompass) {
      // Leaving compass mode: start from clean text options.
      setOptions(['', '', '', '']);
      setCorrectAnswer('');
    }
  };

  const loadExample = () => {
    const example = exampleDraft(type);
    setMapId(example.mapId);
    setDifficulty(example.difficulty);
    setPrompt(example.prompt);
    setOptions([...example.options]);
    setCorrectAnswer(example.correctAnswer);
    setSpawnLocation(example.spawnLocation ?? '');
    setExplanation(example.explanation);
    setTip(example.tip ?? '');
    if (type === 'landmark_mc') setImageUrl(example.imageUrl ?? '');
    setErrors({});
  };

  const setOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
    setErrors((prev) => ({ ...prev, options: undefined, correctAnswer: undefined }));
  };

  const removeOption = (index: number) => {
    setOptions((prev) => {
      if (prev.length <= C.minOptions) return prev;
      const removed = prev[index];
      const next = prev.filter((_, i) => i !== index);
      if (correctAnswer === removed) setCorrectAnswer('');
      return next;
    });
  };

  const addOption = () => {
    setOptions((prev) => (prev.length >= C.maxOptions ? prev : [...prev, '']));
  };

  const toggleCompass = (point: string) => {
    setOptions((prev) => {
      const has = prev.includes(point);
      if (has && prev.length <= C.minOptions) return prev; // keep minimum
      const next = has ? prev.filter((p) => p !== point) : [...prev, point];
      if (has && correctAnswer === point) setCorrectAnswer('');
      // Keep canonical compass order.
      return [...COMPASS_POINTS].filter((p) => next.includes(p));
    });
    setErrors((prev) => ({ ...prev, options: undefined, correctAnswer: undefined }));
  };

  const handleSubmit = () => {
    if (!difficulty) {
      setErrors((prev) => ({ ...prev, difficulty: 'Pick the difficulty bin your question belongs in.' }));
      return;
    }
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit(draft);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* ---- Guided fields ---- */}
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="qf-map" className={labelClass}>
            1 · Map
          </label>
          <select
            id="qf-map"
            value={mapId}
            onChange={(e) => {
              setMapId(e.target.value);
              setErrors((prev) => ({ ...prev, mapId: undefined }));
            }}
            className={`${inputClass} mt-2`}
          >
            {MAPS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <FieldError message={errors.mapId} />
        </div>
        <div>
          <span className={labelClass}>2 · Question type</span>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {TYPE_ORDER.map((t) => {
              const Icon = TYPE_ICON[t];
              const active = t === type;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchType(t)}
                  aria-pressed={active}
                  className={`rounded-xl border p-2.5 sm:p-3 text-left transition-colors ${
                    active
                      ? 'border-emerald-500 bg-emerald-950/50'
                      : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 sm:w-5 sm:h-5 ${active ? 'text-emerald-400' : 'text-zinc-500'}`}
                  />
                  <span
                    className={`block mt-1.5 text-xs sm:text-sm font-bold ${active ? 'text-emerald-200' : 'text-zinc-200'}`}
                  >
                    {QUESTION_TYPE_META[t].label}
                  </span>
                  <span className="hidden sm:block mt-0.5 text-[11px] leading-snug text-zinc-500">
                    {QUESTION_TYPE_META[t].blurb}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={loadExample}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Fill from a {QUESTION_TYPE_META[type].label.toLowerCase()} example — then make it yours
          </button>
        </div>

        <div>
          <span className={labelClass}>
            3 · Difficulty <span className="text-red-400 normal-case">(required)</span>
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2" role="radiogroup" aria-label="Difficulty bin">
            {DIFFICULTY_ORDER.map((bin) => {
              const meta = DIFFICULTY_META[bin];
              const active = difficulty === bin;
              return (
                <button
                  key={bin}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={meta.description}
                  onClick={() => {
                    setDifficulty(bin);
                    setErrors((prev) => ({ ...prev, difficulty: undefined }));
                  }}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? 'border-emerald-500 bg-emerald-950/50'
                      : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
                  }`}
                >
                  <span
                    className={`block text-sm font-bold ${active ? 'text-emerald-200' : 'text-zinc-200'}`}
                  >
                    {meta.label}
                  </span>
                  <span className="block mt-0.5 text-[11px] leading-snug text-zinc-500">
                    {meta.blurb}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-1.5">
            <FieldError message={errors.difficulty} />
          </div>
          <p className="mt-1 text-[11px] text-zinc-600">
            Bin it honestly — harder bins are worth more rating, and reviewers can dispute the bin via a fix.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="qf-prompt">
            4 · Prompt
          </label>
          <textarea
            id="qf-prompt"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setErrors((prev) => ({ ...prev, prompt: undefined }));
            }}
            rows={2}
            maxLength={300}
            placeholder={
              type === 'extract_logic'
                ? 'e.g. You spawned at Dorms. Which guaranteed PMC extract is OPEN for you?'
                : type === 'compass_check'
                  ? 'e.g. You are facing the front of 3-Story Dorms. Which cardinal direction are you looking?'
                  : 'e.g. Identify this landmark on Customs:'
            }
            className={inputClass}
          />
          <FieldError message={errors.prompt} />
          {dupHits.length > 0 && (
            <div className="rounded-xl border border-amber-700/50 bg-amber-950/40 px-3 py-2.5">
              <p className="text-xs font-bold text-amber-300">
                Possible duplicate{dupHits.length === 1 ? '' : 's'} — you can still submit, reviewers decide:
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
        </div>

        {type === 'extract_logic' && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="qf-spawn">
              Spawn location
            </label>
            <input
              id="qf-spawn"
              value={spawnLocation}
              onChange={(e) => {
                setSpawnLocation(e.target.value);
                setErrors((prev) => ({ ...prev, spawnLocation: undefined }));
              }}
              maxLength={80}
              placeholder="e.g. Crossroads / Trailer Park"
              className={inputClass}
            />
            <FieldError message={errors.spawnLocation} />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>
            5 · Options + answer <span className="text-red-400 normal-case">(answer required)</span>
          </span>
          {isCompass ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Direction options">
                {COMPASS_POINTS.map((point) => {
                  const enabled = options.includes(point);
                  const isAnswer = correctAnswer === point;
                  return (
                    <button
                      key={point}
                      type="button"
                      onClick={() => toggleCompass(point)}
                      aria-pressed={enabled}
                      title={enabled ? 'Remove from options' : 'Add to options'}
                      className={`w-11 h-11 rounded-xl border font-bold text-sm transition-colors ${
                        isAnswer
                          ? 'border-emerald-500 bg-emerald-950/70 text-emerald-200'
                          : enabled
                            ? 'border-zinc-600 bg-zinc-800 text-zinc-100 hover:border-zinc-400'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-600 hover:border-zinc-600'
                      }`}
                    >
                      {point}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-500" htmlFor="qf-compass-answer">
                  Correct direction:
                </label>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Correct direction">
                  {options.map((point) => (
                    <button
                      key={point}
                      type="button"
                      role="radio"
                      aria-checked={correctAnswer === point}
                      onClick={() => {
                        setCorrectAnswer(point);
                        setErrors((prev) => ({ ...prev, correctAnswer: undefined }));
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                        correctAnswer === point
                          ? 'border-emerald-500 bg-emerald-950/70 text-emerald-200'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                    >
                      {point}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-zinc-600">
                Tap directions to include them as options (min {C.minOptions}), then tap the correct one.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {options.map((option, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={correctAnswer === option && option.trim() !== ''}
                    title="Mark as the correct answer"
                    onClick={() => {
                      setCorrectAnswer(option);
                      setErrors((prev) => ({ ...prev, correctAnswer: undefined }));
                    }}
                    className={`shrink-0 w-8 h-8 rounded-lg border text-xs font-bold transition-colors ${
                      correctAnswer === option && option.trim() !== ''
                        ? 'border-emerald-500 bg-emerald-950/70 text-emerald-300'
                        : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
                    }`}
                  >
                    ✓
                  </button>
                  <input
                    value={option}
                    onChange={(e) => setOption(i, e.target.value)}
                    maxLength={80}
                    placeholder={`Option ${i + 1}`}
                    aria-label={`Option ${i + 1}`}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    disabled={options.length <= C.minOptions}
                    aria-label={`Remove option ${i + 1}`}
                    title="Remove option"
                    className="shrink-0 p-2 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {options.length < C.maxOptions && (
                <button
                  type="button"
                  onClick={addOption}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors self-start"
                >
                  <Plus className="w-3.5 h-3.5" /> Add option (up to {C.maxOptions})
                </button>
              )}
              <p className="text-[11px] text-zinc-600">
                Tap ✓ to mark the correct answer — required before submitting.
              </p>
            </div>
          )}
          <FieldError message={errors.options} />
          <FieldError message={errors.correctAnswer} />
        </div>

        {type === 'landmark_mc' && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="qf-image">
              Photo URL <span className="text-red-400 normal-case">(required)</span>
            </label>
            <input
              id="qf-image"
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                setImagePreviewFailed(false);
                setErrors((prev) => ({ ...prev, imageUrl: undefined }));
              }}
              inputMode="url"
              maxLength={500}
              placeholder="https://… (stable link — self-hosted on merge)"
              className={inputClass}
            />
            <FieldError message={errors.imageUrl} />
            {imageUrl.trim() && !imagePreviewFailed ? (
              <img
                src={imageUrl.trim()}
                alt=""
                aria-hidden
                loading="lazy"
                onError={() => setImagePreviewFailed(true)}
                className="rounded-xl border border-zinc-800 max-h-32 object-cover"
              />
            ) : imageUrl.trim() && imagePreviewFailed ? (
              <p className="text-xs text-amber-400">
                That URL didn’t load a preview — double-check it (reviewers will verify).
              </p>
            ) : null}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="qf-explanation">
            6 · Explanation <span className="text-red-400 normal-case">(required)</span>
          </label>
          <textarea
            id="qf-explanation"
            value={explanation}
            onChange={(e) => {
              setExplanation(e.target.value);
              setErrors((prev) => ({ ...prev, explanation: undefined }));
            }}
            rows={2}
            maxLength={500}
            placeholder="Why is this the answer? This is what players learn from."
            className={inputClass}
          />
          <FieldError message={errors.explanation} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="qf-tip">
            Memory tip <span className="text-zinc-600 normal-case">(optional, earns approvals)</span>
          </label>
          <textarea
            id="qf-tip"
            value={tip}
            onChange={(e) => setTip(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="e.g. Red = West. Big Red sits on the WEST bank of the river."
            className={inputClass}
          />
        </div>
      </div>

      {/* ---- Live preview ---- */}
      <div className="flex flex-col gap-3">
        <span className={labelClass}>Live preview — exactly what reviewers see</span>
        <div className="lg:sticky lg:top-4 flex flex-col gap-3">
          <QuestionPreview draft={draft} />
          {topError && (
            <p role="alert" className="text-xs text-red-400">
              {topError}
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            className="w-full py-3.5 rounded-xl font-bold uppercase tracking-wider bg-emerald-600 border-b-4 border-emerald-800 hover:bg-emerald-500 text-white active:border-b-0 active:translate-y-1 transition-all"
          >
            {submitLabel}
          </button>
          <p className="text-[11px] text-zinc-600 leading-relaxed">
            {C.approvalsToPublish} peer approvals publish it to the drill pool · {C.rejectionsToDecline} rejections
            decline it · you can’t review your own entry.
          </p>
        </div>
      </div>
    </div>
  );
}
