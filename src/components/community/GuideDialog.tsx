'use client';

import { useState } from 'react';
import { ClipboardCheck, Flag, PlusCircle, TrendingUp } from 'lucide-react';
import { COMMUNITY_CONFIG as C } from '@/lib/community/config';
import { DIFFICULTY_META, DIFFICULTY_ORDER } from '@/lib/community/difficulty';
import { ELO_CONFIG } from '@/lib/community/elo';
import { DifficultyBadge, Modal } from './ui';

export type GuideSection = 'ranks' | 'submit' | 'review' | 'reports';

const TABS: { id: GuideSection; label: string; Icon: typeof Flag }[] = [
  { id: 'ranks', label: 'Ranks', Icon: TrendingUp },
  { id: 'submit', label: 'Submit', Icon: PlusCircle },
  { id: 'review', label: 'Review', Icon: ClipboardCheck },
  { id: 'reports', label: 'Reports', Icon: Flag },
];

/**
 * The whole game, explained in seconds. Every number renders from live
 * config (ELO + community tuning), so this can never go stale.
 */
export default function GuideDialog({
  initialSection,
  onClose,
}: {
  initialSection: GuideSection;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<GuideSection>(initialSection);

  return (
    <Modal label="How it works" onClose={onClose} wide>
      <div
        className="flex gap-1 rounded-xl bg-zinc-800/60 border border-zinc-800 p-1 text-sm font-bold overflow-x-auto"
        role="tablist"
        aria-label="Guide sections"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-20 px-3 py-2 rounded-lg transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 ${
              tab === t.id ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <t.Icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {tab === 'ranks' && <RanksGuide />}
        {tab === 'submit' && <SubmitGuide />}
        {tab === 'review' && <ReviewGuide />}
        {tab === 'reports' && <ReportsGuide />}
      </div>

      <p className="mt-4 text-[11px] text-zinc-600 leading-relaxed">
        Players create, players review, players police, players repair — the pool grows and
        heals itself.
      </p>
    </Modal>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-xs leading-relaxed text-zinc-300">
          <span aria-hidden className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function RanksGuide() {
  return (
    <>
      <p className="text-sm text-zinc-400 leading-relaxed">
        Every map tracks its own rating — each answer moves only that map. Overall is your
        played maps&apos; average (new maps blend in over their first {ELO_CONFIG.overallBlendAnswers}{' '}
        answers, so exploring never craters it); unplayed maps never drag it down.
      </p>
      <div className="flex flex-col gap-1.5">
        {DIFFICULTY_ORDER.map((id, i) => {
          const meta = DIFFICULTY_META[id];
          const next = DIFFICULTY_ORDER[i + 1];
          const range = next
            ? `${meta.rankMin}–${DIFFICULTY_META[next].rankMin - 1}`
            : `${meta.rankMin}+`;
          return (
            <div
              key={id}
              className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2"
            >
              <DifficultyBadge difficulty={id} />
              <span className="text-xs text-zinc-500">
                Questions <span className="font-bold text-zinc-300 tabular-nums">{meta.questionRating}</span>
              </span>
              <span className="text-xs font-bold text-zinc-200 tabular-nums">{range}</span>
            </div>
          );
        })}
      </div>
      <Bullets
        items={[
          `Every map starts at ${ELO_CONFIG.startRating}; its first ${ELO_CONFIG.provisionalGames} answers swing bigger so it places fast.`,
          `Below ${ELO_CONFIG.lossProtectionBelow}, a map's losses count half — exploring new maps is safe.`,
          `Win streaks are global: +${ELO_CONFIG.streakBonusPerWin} per consecutive win (max +${ELO_CONFIG.maxStreakBonusSteps * ELO_CONFIG.streakBonusPerWin}) on top of earned gains, even across maps.`,
          'Flagged questions pause rating — nothing moves while a question is under review.',
          `Wins always pay at least +${ELO_CONFIG.minWinGain}; no map ever drops below ${ELO_CONFIG.floor}.`,
        ]}
      />
    </>
  );
}

function SubmitGuide() {
  return (
    <Bullets
      items={[
        'Any signed-in player can submit through the guided template.',
        'Required: the map, the correct answer, an explanation, a difficulty bin — and a photo for landmark questions.',
        `${C.approvalsToPublish} approvals publish it to drills · ${C.rejectionsToDecline} rejections decline it · no self-reviews.`,
        'Near-duplicates surface automatically — reviewers verify before approving.',
        'Authors can edit (reviews restart) or withdraw while pending.',
      ]}
    />
  );
}

function ReviewGuide() {
  return (
    <Bullets
      items={[
        'New: judge submissions into the pool — or down.',
        'Flagged: reported questions. Fix them, or verify they were fine.',
        'Fixes: approve corrected versions — applying one patches the live question and resolves every report.',
        'One review per player · rejections need a short note.',
        'Track your submissions, fixes, and reports under Mine.',
      ]}
    />
  );
}

function ReportsGuide() {
  return (
    <Bullets
      items={[
        'Spot a wrong answer mid-drill? Report it — the question gets flagged but stays playable.',
        `Propose a corrected version — ${C.approvalsToApplyFix} approvals apply it to the live question.`,
        `Or vote “Looks correct” — ${C.keepVotesToClearFlag} votes dismiss bad flags.`,
        'Mis-binned questions get re-binned through fixes too.',
      ]}
    />
  );
}
