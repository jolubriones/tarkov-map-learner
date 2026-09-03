'use client';

import React from 'react';
import { Heart, Flame, Flag } from 'lucide-react';

interface DrillHeaderProps {
  current: number;
  total: number;
  lives: number;
  streak: number;
  onReportClick: () => void;
}

export default function DrillHeader({
  current,
  total,
  lives,
  streak,
  onReportClick,
}: DrillHeaderProps) {
  const progressPercent = Math.min(100, Math.round((current / total) * 100));

  return (
    <header className="w-full max-w-2xl mx-auto flex items-center justify-between gap-4 p-4 border-b border-zinc-800 bg-zinc-950 text-zinc-100">
      <div className="flex-1 bg-zinc-800 h-3 rounded-full overflow-hidden">
        <div
          className="bg-emerald-500 h-full transition-all duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex items-center gap-4 text-sm font-semibold">
        <div className="flex items-center gap-1 text-amber-400">
          <Flame className="w-5 h-5 fill-amber-400" />
          <span>{streak}</span>
        </div>

        <div className="flex items-center gap-1 text-rose-500">
          <Heart className="w-5 h-5 fill-rose-500" />
          <span>{lives}</span>
        </div>

        <button
          onClick={onReportClick}
          title="Report issue with this question"
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Flag className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}