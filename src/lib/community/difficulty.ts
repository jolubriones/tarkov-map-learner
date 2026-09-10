import type { QuestionDifficulty } from '@/lib/types';

/**
 * Difficulty bins — the skill ladder for questions AND players.
 *
 * Every question (built-in or community-submitted) must carry one bin,
 * chosen by the author and visible to reviewers, who can dispute it via
 * the normal correction flow. The same five names rank players: your ELO
 * rating maps onto whichever bin you're competitive in (see `elo.ts`).
 */

export interface DifficultyMeta {
  id: QuestionDifficulty;
  label: string;
  /** One-liner for the submission template cards. */
  blurb: string;
  /** Full definition (tooltips + docs). */
  description: string;
  /** ELO rating of a question in this bin — the opponent you face. */
  questionRating: number;
  /** Minimum player rating to hold this rank. */
  rankMin: number;
}

export const DIFFICULTY_ORDER: QuestionDifficulty[] = [
  'timmy',
  'essential',
  'enlightened',
  'sherpa',
  'immortal',
];

export const DIFFICULTY_META: Record<QuestionDifficulty, DifficultyMeta> = {
  timmy: {
    id: 'timmy',
    label: 'Timmy',
    blurb: 'The absolute basics. Everyone starts here.',
    description:
      'Fresh-spawn knowledge for players who do not know the maps at all yet: the absolute basics. Every PMC starts here — win your way out.',
    questionRating: 300,
    rankMin: 0,
  },
  essential: {
    id: 'essential',
    label: 'Essential',
    blurb: 'Spawns + extract directions. The basics.',
    description:
      'The bare minimum to enjoy Tarkov: knowing where you spawned within a couple of seconds and the general direction of your extracts.',
    questionRating: 600,
    rankMin: 600,
  },
  enlightened: {
    id: 'enlightened',
    label: 'Enlightened',
    blurb: 'Boss/PMC spawns, more maps, special extracts.',
    description:
      'Beyond the basics: more maps, boss spawns, PMC spawns, and special extracts (car, co-op, no-backpack, and friends).',
    questionRating: 1100,
    rankMin: 1000,
  },
  sherpa: {
    id: 'sherpa',
    label: 'Sherpa',
    blurb: 'Hidden stashes + quest locations.',
    description:
      'Guide-tier knowledge: most hidden stash locations and quest locations, beyond what Enlightened covers.',
    questionRating: 1600,
    rankMin: 1500,
  },
  immortal: {
    id: 'immortal',
    label: 'Immortal',
    blurb: 'Every nook and cranny.',
    description:
      'Total mastery: pretty much every nook and cranny of the game. Nothing hides from you.',
    questionRating: 2100,
    rankMin: 2000,
  },
};

export function isDifficulty(value: unknown): value is QuestionDifficulty {
  return (
    typeof value === 'string' &&
    (DIFFICULTY_ORDER as readonly string[]).includes(value)
  );
}
