'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { QuestionDifficulty } from '@/lib/types';
import { DIFFICULTY_META } from '@/lib/community/difficulty';

/** Centered modal shell (backdrop click + Escape to close). */
export function Modal({
  label,
  onClose,
  children,
  wide,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6 shadow-2xl my-8`}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="font-bold text-zinc-100 text-lg">{label}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** "2 / 3" approval progress dots. */
export function ProgressDots({
  current,
  total,
  tone = 'emerald',
}: {
  current: number;
  total: number;
  tone?: 'emerald' | 'red' | 'amber';
}) {
  const filled =
    tone === 'emerald'
      ? 'bg-emerald-500 border-emerald-500'
      : tone === 'red'
        ? 'bg-red-500 border-red-500'
        : 'bg-amber-500 border-amber-500';
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`${current} of ${total}`}>
      <span className="flex items-center gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`w-2.5 h-2.5 rounded-full border ${
              i < current ? filled : 'bg-zinc-800 border-zinc-700'
            }`}
          />
        ))}
      </span>
      <span className="text-xs font-bold text-zinc-400 tabular-nums">
        {current}/{total}
      </span>
    </span>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-red-400 leading-snug">
      {message}
    </p>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 px-4 py-8 text-center flex flex-col items-center gap-2">
      <p className="font-bold text-zinc-200 text-sm">{title}</p>
      <p className="text-xs text-zinc-500 max-w-sm leading-relaxed">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const DIFFICULTY_STYLES: Record<QuestionDifficulty, string> = {
  essential: 'text-zinc-300 bg-zinc-800/80 border-zinc-700',
  enlightened: 'text-emerald-300 bg-emerald-950/60 border-emerald-800',
  sherpa: 'text-amber-300 bg-amber-950/60 border-amber-800',
  immortal: 'text-rose-300 bg-rose-950/60 border-rose-800',
};

/** Difficulty-bin pill (doubles as the ELO rank pill with `extra`). */
export function DifficultyBadge({
  difficulty,
  extra,
}: {
  difficulty: QuestionDifficulty;
  extra?: string;
}) {
  const meta = DIFFICULTY_META[difficulty];
  return (
    <span
      title={meta.description}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1 border ${DIFFICULTY_STYLES[difficulty]}`}
    >
      {meta.label}
      {extra ? <span className="tabular-nums opacity-80">· {extra}</span> : null}
    </span>
  );
}

export const inputClass =
  'w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500';

export const labelClass =
  'block text-xs font-bold uppercase tracking-wider text-zinc-400';
