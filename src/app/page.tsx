'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  RotateCcw,
  Heart,
  Flame,
  Flag,
  Info,
  Volume2,
  VolumeX,
  MapPin,
  Crosshair,
  PlusCircle,
  ClipboardCheck,
  Users,
  ShieldCheck,
} from 'lucide-react';
import AnswerFeedback from '@/components/AnswerFeedback';
import AdSlot from '@/components/ads/AdSlot';
import DonateButton from '@/components/DonateButton';
import DonorBadge from '@/components/DonorBadge';
import AuthDialog from '@/components/community/AuthDialog';
import ReportDialog from '@/components/community/ReportDialog';
import SubmitPanel from '@/components/community/SubmitPanel';
import ReviewQueue from '@/components/community/ReviewQueue';
import GuideDialog, { type GuideSection } from '@/components/community/GuideDialog';
import { DifficultyBadge, EmptyState } from '@/components/community/ui';
import { useCommunity, useLiveQuestions } from '@/hooks/useCommunity';
import { actionableReviewCount } from '@/lib/community/store';
import {
  applyEloAnswer,
  mapRatingFor,
  nextRankProgress,
  overallRating,
  rankForRating,
  readElo,
  writeElo,
  type EloState,
} from '@/lib/community/elo';
import { DIFFICULTY_META, DIFFICULTY_ORDER, isDifficulty } from '@/lib/community/difficulty';
import { MAPS, isMapId, mapLabel } from '@/lib/community/maps';
import type { QuestionDifficulty } from '@/lib/types';
import {
  playCorrectSound,
  playWrongSound,
  playSelectSound,
  playCompleteSound,
  playGameOverSound,
  isMuted,
  setMuted,
} from '@/lib/sounds';

const STORAGE_KEY = 'tarkov-map-learner-storage';
const MAX_LIVES = 3;

type View = 'drill' | 'submit' | 'review';

// SSR-safe read of a persisted number (falls back when missing/invalid/blocked).
function readStoredNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const parsed = parseInt(localStorage.getItem(`${STORAGE_KEY}_${key}`) ?? '', 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  } catch {
    return fallback; // Storage blocked (e.g. private mode) — use defaults.
  }
}

// A stored 0 means the last run ended in death — always start a fresh run alive.
function readStoredLives(): number {
  const stored = readStoredNumber('lives', MAX_LIVES);
  return stored >= 1 && stored <= MAX_LIVES ? stored : MAX_LIVES;
}

function readStoredBin(): 'all' | QuestionDifficulty {
  if (typeof window === 'undefined') return 'all';
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY}_bin`);
    return stored === 'all' || isDifficulty(stored) ? stored : 'all';
  } catch {
    return 'all';
  }
}

function readStoredMaps(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_maps`);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m): m is string => typeof m === 'string' && isMapId(m));
  } catch {
    return [];
  }
}

function BinChip({
  label,
  count,
  active,
  onSelect,
  title,
}: {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
        active
          ? 'border-emerald-500 bg-emerald-950/60 text-emerald-200'
          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
      }`}
    >
      {label}
      <span className="tabular-nums rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-extrabold text-zinc-400">
        {count}
      </span>
    </button>
  );
}

// Drill image that disappears gracefully if the URL ever breaks,
// instead of showing a broken-image icon. Key by question id so a
// failure on one question doesn't hide the next question's image.
function DrillImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800 aspect-video max-h-44 sm:max-h-56">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover"
      />
    </div>
  );
}

export default function Home() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lives, setLives] = useState(readStoredLives);
  const [streak, setStreak] = useState(() => readStoredNumber('streak', 0));
  const [bestStreak, setBestStreak] = useState(() => readStoredNumber('bestStreak', 0));
  const [gamesPlayed, setGamesPlayed] = useState(() => readStoredNumber('gamesPlayed', 0));
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  // Shuffled run order: a fresh permutation per run, fixed for the run.
  // Null until the first client effect (SSR-safe: no hydration mismatch).
  const [runId, setRunId] = useState(0);
  const [order, setOrder] = useState<number[] | null>(null);
  // Lazy init from storage (same pattern as above; isMuted is SSR-safe)
  const [muted, setMutedState] = useState(() => isMuted());
  // Skill rating: every answer is an ELO match vs the question's bin.
  const [elo, setElo] = useState<EloState>(() => readElo());
  const [lastElo, setLastElo] = useState<{
    mapId: string;
    before: number;
    after: number;
    overallBefore: number;
    overallAfter: number;
    bonus: number;
    winStreak: number;
  } | null>(null);
  const overall = overallRating(elo);
  const rank = rankForRating(overall.rating);
  const rankProgress = nextRankProgress(overall.rating);
  const [binFilter, setBinFilter] = useState<'all' | QuestionDifficulty>(readStoredBin);
  const [mapFilter, setMapFilter] = useState<string[]>(readStoredMaps);

  // Community ecosystem: view tabs, account + report dialogs.
  const [view, setView] = useState<View>('drill');
  const [authOpen, setAuthOpen] = useState(false);
  const [guideSection, setGuideSection] = useState<GuideSection | null>(null);
  const [reportTarget, setReportTarget] = useState<{ id: string; prompt: string } | null>(null);
  const { state, user } = useCommunity();
  const pool = useLiveQuestions(state);
  const reviewCount = actionableReviewCount(state);
  const activePool = useMemo(() => {
    let filtered = pool;
    if (binFilter !== 'all') filtered = filtered.filter((l) => l.question.difficulty === binFilter);
    if (mapFilter.length > 0) filtered = filtered.filter((l) => mapFilter.includes(l.question.mapId));
    if (filtered.length > 0) return filtered;
    // A bin can only empty via data changes — never strand the drill. An
    // empty map pick is a real signal (uncovered map), so it stays empty
    // and renders the no-questions panel instead of the drill card.
    if (mapFilter.length === 0) return pool;
    return [];
  }, [pool, binFilter, mapFilter]);

  // The drill mechanics always have a question to point at; the empty-map
  // panel swaps in for the card, so this fallback never renders.
  const drillPool = activePool.length > 0 ? activePool : pool;
  // Per-run shuffle: re-rolled on every reset (client-only effect, so the
  // server render and first paint agree), then fixed for the run — mid-run
  // approvals join the NEXT run. Past-the-end indices are dropped, so pool
  // growth or author removals can never strand or crash the run.
  const shuffledRun = useRef(-1);
  useEffect(() => {
    // Once per run: mid-run pool growth must NOT reshuffle the live run.
    if (shuffledRun.current === runId) return;
    shuffledRun.current = runId;
    const indices = drillPool.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    setOrder(indices);
  }, [runId, drillPool]);
  const runPool = useMemo(() => {
    if (!order) return drillPool;
    return order.filter((i) => i < drillPool.length).map((i) => drillPool[i]);
  }, [order, drillPool]);
  const totalQuestions = runPool.length;
  // Clamp during render (never in an effect): the pool only grows as the
  // community approves questions, so this is purely defensive.
  const safeIndex = totalQuestions === 0 ? 0 : Math.min(currentIndex, totalQuestions - 1);
  const current = runPool[safeIndex];
  const currentQ = current.question;
  const isCorrect = isAnswerSubmitted && selectedOption === currentQ.correctAnswer;
  const isRunEnding = lives <= 0 || safeIndex === totalQuestions - 1;

  // Persist state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_streak`, streak.toString());
      localStorage.setItem(`${STORAGE_KEY}_lives`, lives.toString());
      localStorage.setItem(`${STORAGE_KEY}_bestStreak`, bestStreak.toString());
      localStorage.setItem(`${STORAGE_KEY}_gamesPlayed`, gamesPlayed.toString());
    } catch {
      // Storage blocked or full — the drill still works, just not persisted.
    }
    writeElo(elo);
    try {
      localStorage.setItem(`${STORAGE_KEY}_bin`, binFilter);
      localStorage.setItem(`${STORAGE_KEY}_maps`, JSON.stringify(mapFilter));
    } catch {
      // Same as above — filters just won't persist.
    }
  }, [streak, lives, bestStreak, gamesPlayed, elo, binFilter, mapFilter]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  // New filter, fresh run (ratings + streak carry over — skill is skill).
  const resetRun = () => {
    setCurrentIndex(0);
    setLives(MAX_LIVES);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setIsGameOver(false);
    setRunId((id) => id + 1);
  };

  const changeBin = (next: 'all' | QuestionDifficulty) => {
    if (next === binFilter) return;
    setBinFilter(next);
    resetRun();
  };

  const toggleMap = (mapId: string) => {
    setMapFilter((prev) =>
      prev.includes(mapId) ? prev.filter((m) => m !== mapId) : [...prev, mapId]
    );
    resetRun();
  };

  const clearMaps = () => {
    if (mapFilter.length === 0) return;
    setMapFilter([]);
    resetRun();
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  const handleSelectOption = (option: string) => {
    if (isAnswerSubmitted || isGameOver) return;
    setSelectedOption(option);
    playSelectSound();
  };

  const handleCheckAnswer = () => {
    if (!selectedOption || isAnswerSubmitted) return;

    const correct = selectedOption === currentQ.correctAnswer;
    setIsAnswerSubmitted(true);

    // ELO match vs the question's difficulty bin — paused while the
    // question is under community review (lives + streaks still count).
    if (current.flagged) {
      setLastElo(null);
    } else {
      const mapBefore = mapRatingFor(elo, currentQ.mapId).rating;
      const result = applyEloAnswer(elo, currentQ.mapId, currentQ.difficulty, correct);
      setElo(result.state);
      setLastElo({
        mapId: currentQ.mapId,
        before: mapBefore,
        after: result.mapRating,
        overallBefore: overall.rating,
        overallAfter: result.overall.rating,
        bonus: result.bonus,
        winStreak: result.winStreak,
      });
    }

    if (correct) {
      playCorrectSound();
      setStreak((prev) => prev + 1);
      // Best streak is fully maintained here — every new high is recorded
      // on correct answers, so game-end/restart need no further updates.
      setBestStreak((prev) => Math.max(prev, streak + 1));
    } else {
      playWrongSound();
      setStreak(0);
      setLives(lives - 1);
    }
  };

  const handleNextQuestion = () => {
    if (lives <= 0) {
      // The last answer cost the final life — end the run (feedback was shown first).
      playGameOverSound();
      setIsGameOver(true);
      setGamesPlayed((prev) => prev + 1);
      return;
    }
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsAnswerSubmitted(false);
    } else {
      // Last question answered - game completes
      setIsGameOver(true);
      setGamesPlayed((prev) => prev + 1);
      playCompleteSound();
    }
  };

  const handleRestart = () => {
    resetRun();
    setStreak(0);
  };

  const contentWidth = view === 'drill' ? 'max-w-xl' : 'max-w-3xl';
  const drillTitle =
    mapFilter.length === 1
      ? `${mapLabel(mapFilter[0])} Drill`
      : mapFilter.length > 1
        ? 'Mixed Drill'
        : 'Tarkov Drill';

  return (
    <main className="min-h-dvh flex flex-col items-center p-4 bg-zinc-950 text-zinc-100">
      {/* App header: brand + community tabs + account */}
      <header className={`w-full ${contentWidth} flex flex-wrap items-center gap-2 pt-2 pb-3`}>
        <div className="flex items-center gap-2 font-extrabold tracking-tight text-zinc-100 mr-auto">
          <span className="w-8 h-8 rounded-xl bg-emerald-950 border border-emerald-800 flex items-center justify-center">
            <Crosshair className="w-4.5 h-4.5 text-emerald-400" />
          </span>
          <span className="text-sm sm:text-base">
            Tarkov <span className="text-zinc-500 font-bold">Map Learner</span>
          </span>
        </div>

        <nav
          className="flex items-center gap-1 rounded-xl bg-zinc-900 border border-zinc-800 p-1 text-sm font-bold order-3 min-[420px]:order-none w-full min-[420px]:w-auto justify-center"
          aria-label="Sections"
        >
          <button
            onClick={() => setView('drill')}
            aria-current={view === 'drill' ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
              view === 'drill' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Crosshair className="w-4 h-4" /> Drill
          </button>
          <button
            onClick={() => setView('submit')}
            aria-current={view === 'submit' ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
              view === 'submit' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <PlusCircle className="w-4 h-4" /> Submit
          </button>
          <button
            onClick={() => setView('review')}
            aria-current={view === 'review' ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
              view === 'review' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" /> Review
            {reviewCount > 0 && (
              <span className="text-[11px] font-extrabold tabular-nums rounded-full px-1.5 py-0.5 bg-amber-600 text-white">
                {reviewCount}
              </span>
            )}
          </button>
        </nav>

        <button
          onClick={() => setGuideSection('ranks')}
          title="How it works"
          aria-label="How it works"
          className="p-2 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
        >
          <Info className="w-4 h-4" />
        </button>

        <button
          onClick={() => setAuthOpen(true)}
          title={user ? `Signed in as ${user.displayName}` : 'Sign in'}
          className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm font-bold transition-colors ${
            user
              ? 'border-emerald-800 bg-emerald-950/50 text-emerald-200 hover:border-emerald-600'
              : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600'
          }`}
        >
          {user ? (
            <>
              <span className="w-6 h-6 rounded-full bg-emerald-800 flex items-center justify-center text-xs font-extrabold text-white">
                {user.displayName.charAt(0).toUpperCase()}
              </span>
              <span className="hidden sm:inline max-w-24 truncate">{user.displayName}</span>
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </header>

      {view === 'submit' && (
        <div className={`w-full ${contentWidth} flex flex-col gap-4`}>
          <SubmitPanel onRequireAuth={() => setAuthOpen(true)} onGoReview={() => setView('review')} />
        </div>
      )}

      {view === 'review' && (
        <div className={`w-full ${contentWidth} flex flex-col gap-4`}>
          <ReviewQueue onRequireAuth={() => setAuthOpen(true)} />
        </div>
      )}

      {view === 'drill' && (
        <div
          className="w-full max-w-xl flex flex-wrap items-center gap-1.5 pb-3"
          role="group"
          aria-label="Filter drills by difficulty"
        >
          <BinChip
            label="All"
            count={pool.length}
            active={binFilter === 'all'}
            onSelect={() => changeBin('all')}
          />
          {DIFFICULTY_ORDER.map((bin) => (
            <BinChip
              key={bin}
              label={DIFFICULTY_META[bin].label}
              title={DIFFICULTY_META[bin].description}
              count={pool.filter((l) => l.question.difficulty === bin).length}
              active={binFilter === bin}
              onSelect={() => changeBin(bin)}
            />
          ))}
        </div>
      )}

      {view === 'drill' && (
        <div
          className="w-full max-w-xl flex flex-wrap items-center gap-1.5 pb-3 -mt-2"
          role="group"
          aria-label="Filter drills by map"
        >
          <BinChip
            label="All maps"
            count={pool.length}
            active={mapFilter.length === 0}
            onSelect={clearMaps}
          />
          {MAPS.map((m) => (
            <BinChip
              key={m.id}
              label={m.label}
              count={pool.filter((l) => l.question.mapId === m.id).length}
              active={mapFilter.includes(m.id)}
              onSelect={() => toggleMap(m.id)}
            />
          ))}
        </div>
      )}

      {view === 'drill' && activePool.length === 0 && (
        <div className="w-full max-w-xl">
          <EmptyState
            title="No questions here yet"
            body={`None of the drill questions cover ${mapFilter.map(mapLabel).join(', ') || 'these maps'} yet — submit the first one and put them on the board.`}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => {
                    setBinFilter('all');
                    setMapFilter([]);
                    resetRun();
                  }}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 transition-colors"
                >
                  Clear filters
                </button>
                <button
                  onClick={() => setView('submit')}
                  className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-200 hover:border-zinc-500 transition-colors"
                >
                  Submit one
                </button>
              </div>
            }
          />
        </div>
      )}

      {view === 'drill' && activePool.length > 0 && (
        <>
          <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-4 sm:p-6 lg:p-8 flex flex-col gap-6 my-auto">
        {/* Header Stats — compresses gracefully on narrow phones */}
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2 font-bold text-amber-500 shrink-0">
            <Flame className="w-5 h-5 sm:w-6 sm:h-6 fill-amber-500 text-amber-500" />
            <span className="text-base sm:text-lg">
              {streak} <span className="hidden min-[380px]:inline">Streak</span>
            </span>
          </div>

          <div className="hidden min-[500px]:flex text-sm font-semibold text-zinc-400 tracking-wider uppercase items-center gap-1 min-w-0">
            <Flag className="w-4 h-4 shrink-0" /> <span className="truncate">{drillTitle}</span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <div className="flex items-center gap-1">
              {Array.from({ length: MAX_LIVES }).map((_, i) => (
                <Heart
                  key={i}
                  className={`w-5 h-5 sm:w-6 sm:h-6 transition-colors ${
                    i < lives
                      ? 'fill-red-500 text-red-500'
                      : 'text-zinc-700 fill-zinc-800'
                  }`}
                />
              ))}
            </div>
            {/* Renders only once NEXT_PUBLIC_DONATION_URL is set */}
            <DonateButton variant="icon" />
            <button
              onClick={toggleMute}
              title={muted ? 'Unmute sounds' : 'Mute sounds'}
              aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
              aria-pressed={muted}
              className="p-2.5 sm:p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Game Info Bar */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm text-zinc-500">
              Q {safeIndex + 1} of {totalQuestions}
            </span>
            {/* Renders only while a donor entitlement is active */}
            <DonorBadge />
          </div>
          <span className="text-xs sm:text-sm text-zinc-500">
            Games: {gamesPlayed} | Best: {bestStreak}
          </span>
        </div>

        {/* Skill rating — title explains the stakes */}
        <button
          type="button"
          onClick={() => setGuideSection('ranks')}
          className="-mt-3 mb-1"
          title={`Overall ELO ${overall.rating}${overall.mapsPlayed > 0 ? ` across ${overall.mapsPlayed} map${overall.mapsPlayed === 1 ? '' : 's'}` : ''}: every answer is a rated match between that map and the question's difficulty (flagged questions pause rating). Ratings are per map — unplayed maps never drag you down.${
            rankProgress.next
              ? ` ${rankProgress.pointsAway} points to ${rankProgress.next.label}.`
              : ' Max rank — defend it.'
          }`}
        >
          <DifficultyBadge
            difficulty={rank.id}
            extra={
              overall.mapsPlayed > 0
                ? `${overall.rating} · ${overall.mapsPlayed} map${overall.mapsPlayed === 1 ? '' : 's'}`
                : `${overall.rating}`
            }
          />
        </button>

        {/* Game Over Screen */}
        {isGameOver ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-6">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              {lives > 0 ? 'Drill Completed!' : 'MIA - Raid Failed'}
            </h1>
            <p className="text-zinc-400">
              {lives > 0
                ? `Great job! You finished with a streak of ${streak}.`
                : 'You lost all your lives. Study the map and try again!'}
            </p>
            {/* Ad + donation placements: both render null until configured */}
            <AdSlot slot="game-over" className="w-full" />
            <button
              onClick={handleRestart}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1 transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-5 h-5" /> Try Again
            </button>
            <DonateButton variant="cta" />
          </div>
        ) : (
          /* Question Content */
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-100">
                {currentQ.prompt}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <DifficultyBadge difficulty={currentQ.difficulty} />
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-300 bg-zinc-800/80 border border-zinc-700 rounded-full px-3 py-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {mapLabel(currentQ.mapId)}
                </span>
                {currentQ.type === 'extract_logic' && (
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-300 bg-sky-950/60 border border-sky-800 rounded-full px-3 py-1">
                    <MapPin className="w-3.5 h-3.5" />
                    Spawn: {currentQ.spawnLocation}
                  </div>
                )}
                {/* Community provenance: flagged questions stay playable but marked,
                    so a single report can't grief content out of the pool. */}
                {current.flagged ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 bg-amber-950/60 border border-amber-800 rounded-full px-3 py-1">
                    <Flag className="w-3.5 h-3.5" />
                    Under review · {current.openReportCount} report{current.openReportCount === 1 ? '' : 's'}
                  </span>
                ) : current.source === 'community' ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/60 border border-emerald-800 rounded-full px-3 py-1">
                    <Users className="w-3.5 h-3.5" />
                    {current.seeded ? 'Demo' : `Community${current.authorName ? ` · by ${current.authorName}` : ''}`}
                  </span>
                ) : current.overridden ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-300 bg-sky-950/60 border border-sky-800 rounded-full px-3 py-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Community-corrected
                  </span>
                ) : null}
                <button
                  onClick={() => setReportTarget({ id: currentQ.id, prompt: currentQ.prompt })}
                  title="Report a problem with this question"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-amber-400 transition-colors ml-auto"
                >
                  <Flag className="w-3.5 h-3.5" /> Report
                </button>
              </div>
            </div>

            {currentQ.imageUrl && (
              <DrillImage
                key={currentQ.id}
                src={currentQ.imageUrl}
                alt={`Mystery landmark to identify on ${mapLabel(currentQ.mapId)}`}
              />
            )}

            {/* Answer Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentQ.options.map((option) => {
                const isSelected = selectedOption === option;
                const isThisCorrect = option === currentQ.correctAnswer;

                let buttonStyle = 'bg-zinc-800/80 border-zinc-700 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600';

                if (isAnswerSubmitted) {
                  if (isThisCorrect) {
                    buttonStyle = 'bg-emerald-950/80 border-emerald-500 text-emerald-300';
                  } else if (isSelected) {
                    buttonStyle = 'bg-red-950/80 border-red-500 text-red-300';
                  } else {
                    buttonStyle = 'bg-zinc-900 border-zinc-800 text-zinc-600 opacity-50';
                  }
                } else if (isSelected) {
                  buttonStyle = 'bg-emerald-950/50 border-emerald-500 text-emerald-200';
                }

                return (
                  <button
                    key={option}
                    onClick={() => handleSelectOption(option)}
                    disabled={isAnswerSubmitted}
                    aria-pressed={isSelected}
                    className={`p-3 rounded-xl font-semibold text-left border-b-4 transition-all duration-150 ${buttonStyle} active:border-b-0 active:translate-y-1`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {/* Action & Feedback Footer */}
            <div className="pt-2 border-t border-zinc-800 flex flex-col gap-4">
              {!isAnswerSubmitted ? (
                <button
                  onClick={handleCheckAnswer}
                  disabled={!selectedOption}
                  className={`w-full py-3.5 rounded-xl font-bold uppercase tracking-wider transition-all border-b-4 ${
                    selectedOption
                      ? 'bg-emerald-600 border-emerald-800 hover:bg-emerald-500 text-white active:border-b-0 active:translate-y-1'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  Check Answer
                </button>
              ) : (
                <div className="space-y-4">
                  <AnswerFeedback
                    question={currentQ}
                    selectedOption={selectedOption!}
                    isCorrect={isCorrect}
                    elo={lastElo ?? undefined}
                    unrated={current.flagged}
                  />

                  <button
                    onClick={handleNextQuestion}
                    className="w-full py-3.5 rounded-xl font-bold uppercase tracking-wider bg-emerald-600 border-b-4 border-emerald-800 hover:bg-emerald-500 text-white active:border-b-0 active:translate-y-1 transition-all"
                  >
                    {isRunEnding ? 'See Results' : 'Continue'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
          </div>

          {/* Below-content ad placement: renders null until ads are enabled */}
          <div className="w-full max-w-xl">
            <AdSlot slot="below-content" />
          </div>
        </>
      )}

      {guideSection && (
        <GuideDialog initialSection={guideSection} onClose={() => setGuideSection(null)} />
      )}
      {reportTarget && (
        <ReportDialog
          questionId={reportTarget.id}
          questionPrompt={reportTarget.prompt}
          onClose={() => setReportTarget(null)}
          onRequireAuth={() => setAuthOpen(true)}
        />
      )}
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
    </main>
  );
}
