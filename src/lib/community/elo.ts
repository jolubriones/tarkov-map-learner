import { MAP_IDS } from './maps';
import { DIFFICULTY_META, DIFFICULTY_ORDER } from './difficulty';
import type { QuestionDifficulty } from '@/lib/types';

/** The rating a question of this bin defends. */
function questionRatingFor(difficulty: QuestionDifficulty): number {
  return DIFFICULTY_META[difficulty].questionRating;
}

/** The rank (bin meta + id) a rating sits in. */
export function rankForRating(rating: number): {
  id: QuestionDifficulty;
  label: string;
  rankMin: number;
} {
  let current = DIFFICULTY_ORDER[0];
  for (const id of DIFFICULTY_ORDER) {
    if (rating >= DIFFICULTY_META[id].rankMin) current = id;
  }
  const meta = DIFFICULTY_META[current];
  return { id: current, label: meta.label, rankMin: meta.rankMin };
}

/**
 * Per-map ELO with a played-maps overall.
 *
 * Every map tracks its own rating: each answer is a match between that
 * map's rating and the question's bin rating. The overall is a blended
 * mean of played maps: each map's weight ramps 0 → 1 over its first 10
 * rated answers, so dabbling in a weak map bends the overall instead of
 * cliff-diving it, and unplayed maps never drag it down. Breadth shows
 * as a visible "· N maps" count instead of a hidden tax.
 *
 * The fun rules run per map (placement, protection, floor); the win
 * streak stays global so mixed-map sessions keep their momentum.
 */
export const ELO_SCALE = 3;

export const ELO_CONFIG = {
  /** Fresh maps start here — Timmy territory, under loss protection. */
  startRating: 500,
  /** Swingy K while a map is placing (fewer answers than this). */
  provisionalK: 48,
  /** Answers before a map leaves placement. */
  provisionalGames: 10,
  /** Settled K. */
  steadyK: 32,
  /** Below this map rating, losses count half (tutorial protection). */
  lossProtectionBelow: 1000,
  /** Bonus per consecutive global win beyond the first. */
  streakBonusPerWin: 2,
  /** Streak bonus caps at steps × per-win. */
  maxStreakBonusSteps: 5,
  /** Wins always pay at least this. */
  minWinGain: 1,
  /** Ratings never drop below this. */
  floor: 100,
  /** A map's overall weight ramps 0 → 1 over its first this-many answers. */
  overallBlendAnswers: 10,
} as const;

export interface MapRating {
  rating: number;
  answered: number;
}

export interface EloState {
  ratings: Record<string, MapRating>;
  winStreak: number;
  scale?: number;
}

export interface OverallRating {
  rating: number;
  mapsPlayed: number;
}

export interface EloResult {
  state: EloState;
  mapId: string;
  mapRating: number;
  mapAnswered: number;
  delta: number;
  bonus: number;
  winStreak: number;
  overall: OverallRating;
}

export const ELO_STORAGE_KEY = 'tarkov-map-learner-storage_elo';

function sanitizeRating(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : NaN;
  if (!Number.isFinite(n)) return ELO_CONFIG.startRating;
  return Math.max(ELO_CONFIG.floor, Math.min(3000, n));
}

function sanitizeCount(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.max(0, n);
}

/** A map's rating, defaulting cleanly when never played. */
export function mapRatingFor(state: EloState, mapId: string): MapRating {
  const found = state.ratings[mapId];
  if (!found) return { rating: ELO_CONFIG.startRating, answered: 0 };
  return { rating: sanitizeRating(found.rating), answered: sanitizeCount(found.answered) };
}

export function applyEloAnswer(
  state: EloState,
  mapId: string,
  difficulty: QuestionDifficulty,
  correct: boolean
): EloResult {
  const prev = mapRatingFor(state, mapId);
  const k = prev.answered < ELO_CONFIG.provisionalGames ? ELO_CONFIG.provisionalK : ELO_CONFIG.steadyK;
  const expected = 1 / (1 + Math.pow(10, (questionRatingFor(difficulty) - prev.rating) / 400));
  let raw = Math.round(k * ((correct ? 1 : 0) - expected));

  const priorStreak = sanitizeCount(state.winStreak);
  let bonus = 0;
  let winStreak = 0;
  if (correct) {
    winStreak = priorStreak + 1;
    // Streaks amplify EARNED gains only: the bonus (2nd win +2, then +4,
    // capped at +10) rides on top of a positive matchup result. Grinding
    // trivial wins pays just the +1 floor no matter the streak — the
    // flame is juice for real wins, not a farming multiplier.
    if (raw > 0) {
      bonus =
        Math.min(winStreak - 1, ELO_CONFIG.maxStreakBonusSteps) * ELO_CONFIG.streakBonusPerWin;
      raw += bonus;
    }
    raw = Math.max(ELO_CONFIG.minWinGain, raw);
  } else if (prev.rating < ELO_CONFIG.lossProtectionBelow) {
    // Tutorial protection: below 1000 the map is still placing, so losses
    // count half. The ceiling keeps it honest (a −1 stays a −1).
    raw = Math.ceil(raw / 2);
  }

  const mapRating = Math.max(ELO_CONFIG.floor, prev.rating + raw);
  const ratings = {
    ...state.ratings,
    [mapId]: { rating: mapRating, answered: prev.answered + 1 },
  };
  const next: EloState = { ratings, winStreak, scale: ELO_SCALE };
  return {
    state: next,
    mapId,
    mapRating,
    mapAnswered: prev.answered + 1,
    delta: mapRating - prev.rating,
    bonus,
    winStreak,
    overall: overallRating(next),
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Overall = played maps' mean, weighted by how established each map is:
 * a map's weight ramps 0 → 1 over its first `overallBlendAnswers`
 * answers. Before anything is played, the seed (every migrated map holds
 * the legacy rating) or the start rating.
 */
export function overallRating(state: EloState): OverallRating {
  const played = Object.values(state.ratings)
    .map((r) => ({ rating: sanitizeRating(r.rating), answered: sanitizeCount(r.answered) }))
    .filter((r) => r.answered > 0);
  if (played.length === 0) {
    const seeds = Object.values(state.ratings).map((r) => sanitizeRating(r.rating));
    return {
      rating: seeds.length > 0 ? Math.round(mean(seeds)) : ELO_CONFIG.startRating,
      mapsPlayed: 0,
    };
  }
  let weighted = 0;
  let weights = 0;
  for (const r of played) {
    const w = Math.min(1, r.answered / ELO_CONFIG.overallBlendAnswers);
    weighted += r.rating * w;
    weights += w;
  }
  return { rating: Math.round(weighted / weights), mapsPlayed: played.length };
}

/**
 * Cross-tab merge: another tab wrote ELO while we were open. Per map, the
 * entry with more rated answers wins (further along the same journey);
 * ties break toward the higher rating, then the incoming copy. Streaks
 * take the max — a background tab's old write must never nuke the live
 * streak being extended in this one. Convergent: merging A←B and B←A
 * lands on the same state, so tabs settle instead of fighting.
 */
export function mergeEloStates(local: EloState, incoming: EloState): EloState {
  const safeIncoming: EloState = {
    ratings:
      incoming && typeof incoming.ratings === 'object' && incoming.ratings !== null
        ? incoming.ratings
        : {},
    winStreak: sanitizeCount(incoming?.winStreak),
  };
  const ids = new Set([
    ...Object.keys(local.ratings ?? {}),
    ...Object.keys(safeIncoming.ratings),
  ]);
  const ratings: Record<string, MapRating> = {};
  for (const id of ids) {
    const a = mapRatingFor(local, id);
    const b = mapRatingFor(safeIncoming, id);
    ratings[id] =
      b.answered > a.answered || (b.answered === a.answered && b.rating >= a.rating) ? b : a;
  }
  return {
    ratings,
    winStreak: Math.max(sanitizeCount(local.winStreak), safeIncoming.winStreak),
    scale: ELO_SCALE,
  };
}

/** Value equality for ELO states (ignores key order and scale metadata). */
export function sameEloState(a: EloState, b: EloState): boolean {
  if (sanitizeCount(a.winStreak) !== sanitizeCount(b.winStreak)) return false;
  const ids = new Set([...Object.keys(a.ratings ?? {}), ...Object.keys(b.ratings ?? {})]);
  for (const id of ids) {
    const ra = mapRatingFor(a, id);
    const rb = mapRatingFor(b, id);
    if (ra.rating !== rb.rating || ra.answered !== rb.answered) return false;
  }
  return true;
}

/** Lifetime rated answers across every map. */
export function totalAnswered(state: EloState): number {
  return Object.values(state.ratings).reduce((sum, r) => sum + sanitizeCount(r.answered), 0);
}

/** Played maps, strongest first — for the profile breakdown. */
export function playedMaps(state: EloState): { mapId: string; rating: number; answered: number }[] {
  return Object.entries(state.ratings)
    .map(([mapId, r]) => ({
      mapId,
      rating: sanitizeRating(r.rating),
      answered: sanitizeCount(r.answered),
    }))
    .filter((r) => r.answered > 0)
    .sort((a, b) => b.rating - a.rating);
}

/** Distance from a rating to the next rank (null at max rank). */
export function nextRankProgress(rating: number): {
  next: { id: string; label: string; rankMin: number } | null;
  pointsAway: number;
} {
  // Derived from the ladder, never hardcoded: inserting a rung below
  // automatically re-points everyone at the right next rank.
  const nextId = DIFFICULTY_ORDER.find((id) => rating < DIFFICULTY_META[id].rankMin) ?? null;
  const next = nextId
    ? { id: nextId, label: DIFFICULTY_META[nextId].label, rankMin: DIFFICULTY_META[nextId].rankMin }
    : null;
  return { next, pointsAway: next ? next.rankMin - rating : 0 };
}

/** Scale-1 saves (600 start, bands at 800/1200/1600) shift +200. */
function migrateScale1(rating: unknown): number {
  const n = sanitizeRating(rating);
  return Math.max(ELO_CONFIG.floor, Math.min(1900, n) + 200);
}

function freshState(): EloState {
  return { ratings: {}, winStreak: 0, scale: ELO_SCALE };
}

export function readElo(): EloState {
  if (typeof window === 'undefined') return freshState();
  try {
    const raw = localStorage.getItem(ELO_STORAGE_KEY);
    if (!raw) return freshState();
    const stored = JSON.parse(raw) as
      | { ratings?: unknown; rating?: unknown; answered?: unknown; winStreak?: unknown; scale?: unknown }
      | null;
    if (!stored || typeof stored !== 'object') return freshState();
    // Flat legacy saves (scale 1/2): seed every map at the legacy rating,
    // provisionally — overall continuity on day one, per-map truth within
    // ~10 answers each. Breadth stays honestly at zero until played.
    if (typeof stored.rating === 'number') {
      const seeded =
        stored.scale === 2 ? sanitizeRating(stored.rating) : migrateScale1(stored.rating);
      const ratings: Record<string, MapRating> = {};
      for (const id of MAP_IDS) ratings[id] = { rating: seeded, answered: 0 };
      return { ratings, winStreak: sanitizeCount(stored.winStreak), scale: ELO_SCALE };
    }
    if (stored.ratings && typeof stored.ratings === 'object') {
      const ratings: Record<string, MapRating> = {};
      for (const [mapId, entry] of Object.entries(stored.ratings as Record<string, unknown>)) {
        if (!entry || typeof entry !== 'object') continue;
        const { rating, answered } = entry as { rating?: unknown; answered?: unknown };
        ratings[mapId] = { rating: sanitizeRating(rating), answered: sanitizeCount(answered) };
      }
      return { ratings, winStreak: sanitizeCount(stored.winStreak), scale: ELO_SCALE };
    }
    return freshState();
  } catch {
    return freshState();
  }
}

export function writeElo(state: EloState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      ELO_STORAGE_KEY,
      JSON.stringify({ ratings: state.ratings, winStreak: state.winStreak, scale: ELO_SCALE })
    );
  } catch {
    // Storage blocked or full — rating just won't persist.
  }
}
