import { COMMUNITY_CONFIG as C } from './config';
import { DIFFICULTY_ORDER } from './difficulty';
import { MAP_IDS } from './maps';
import type { QuestionDraft } from './types';
import type { Question, QuestionType } from '@/lib/types';

/**
 * Submission-template validation + conversions.
 *
 * The rules mirror `scripts/validate-questions.mjs` (correct answer must
 * be one of the options, compass values constrained, extract questions
 * need a spawn) plus community quality bars: an answer is mandatory and
 * an explanation is required so every question teaches, not just tests.
 */

export const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export type DraftField =
  | 'mapId'
  | 'difficulty'
  | 'prompt'
  | 'options'
  | 'correctAnswer'
  | 'spawnLocation'
  | 'imageUrl'
  | 'explanation';

export type DraftErrors = Partial<Record<DraftField, string>>;

export const QUESTION_TYPE_META: Record<
  QuestionType,
  { label: string; blurb: string }
> = {
  landmark_mc: {
    label: 'Landmark',
    blurb: 'Name the place in the photo — 2–6 text options.',
  },
  compass_check: {
    label: 'Compass',
    blurb: 'Which way are you facing? Direction options.',
  },
  extract_logic: {
    label: 'Extract',
    blurb: 'Given a spawn, which extract is open? Needs a spawn location.',
  },
};

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateDraft(draft: QuestionDraft): DraftErrors {
  const errors: DraftErrors = {};

  // Ratings are per map, so the map is mandatory too.
  if (!(MAP_IDS as readonly string[]).includes(draft.mapId)) {
    errors.mapId = 'Pick the map this question is about.';
  }

  // The difficulty bin is mandatory — the author must place their own
  // question on the ladder (reviewers see it and can dispute it via fixes).
  if (!(DIFFICULTY_ORDER as readonly string[]).includes(draft.difficulty)) {
    errors.difficulty = 'Pick a difficulty bin — Essential, Enlightened, Sherpa, or Immortal.';
  }

  const prompt = draft.prompt.trim();

  if (prompt.length < C.minPromptLength) {
    errors.prompt = `Prompt needs at least ${C.minPromptLength} characters — say where the player is and what to answer.`;
  }

  const options = draft.options.map((o) => o.trim()).filter((o) => o !== '');
  if (options.length < C.minOptions) {
    errors.options = `Add at least ${C.minOptions} answer options.`;
  } else if (options.length > C.maxOptions) {
    errors.options = `Keep it to ${C.maxOptions} options max.`;
  } else if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    errors.options = 'Options must be unique — merge or reword duplicates.';
  }

  if (draft.type === 'compass_check') {
    const bad = options.filter(
      (o) => !(COMPASS_POINTS as readonly string[]).includes(o.toUpperCase())
    );
    if (bad.length > 0) {
      errors.options = `Compass options must be directions (N, NE, E…): “${bad[0]}” isn't one.`;
    }
  }

  // The answer is mandatory and must be exactly one of the options.
  if (!draft.correctAnswer.trim()) {
    errors.correctAnswer = 'Pick the correct answer — every submission must include one.';
  } else if (!options.includes(draft.correctAnswer.trim())) {
    errors.correctAnswer = 'The correct answer must be one of the options above.';
  }

  if (draft.type === 'extract_logic' && !draft.spawnLocation?.trim()) {
    errors.spawnLocation = 'Extract questions need a spawn location (e.g. “Crossroads / Trailer Park”).';
  }

  const imageRef = draft.imageUrl?.trim();
  if (draft.type === 'landmark_mc' && !imageRef) {
    errors.imageUrl = 'Landmark questions need a photo — the picture is the question.';
  } else if (imageRef && !isHttpUrl(imageRef) && !imageRef.startsWith('/images/')) {
    errors.imageUrl = 'Image must be a full http(s) URL, or leave it blank.';
  }

  if (draft.explanation.trim().length < C.minExplanationLength) {
    errors.explanation = `Explain the answer in at least ${C.minExplanationLength} characters — this is what players learn from.`;
  }

  return errors;
}

export function isDraftValid(draft: QuestionDraft): boolean {
  return Object.keys(validateDraft(draft)).length === 0;
}

/** Turn an approved/validated draft into a live drill question. */
export function draftToQuestion(draft: QuestionDraft, id: string): Question {
  const base = {
    id,
    mapId: draft.mapId,
    difficulty: draft.difficulty,
    prompt: draft.prompt.trim(),
    explanation: draft.explanation.trim(),
    ...(draft.tip?.trim() ? { tip: draft.tip.trim() } : {}),
    ...(draft.imageUrl?.trim() ? { imageUrl: draft.imageUrl.trim() } : {}),
  };
  const options = draft.options.map((o) => o.trim()).filter((o) => o !== '');
  const correctAnswer = draft.correctAnswer.trim();

  switch (draft.type) {
    case 'compass_check':
      return {
        ...base,
        type: 'compass_check',
        options: options.map((o) =>
          o.toUpperCase()
        ) as ('N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW')[],
        correctAnswer: correctAnswer.toUpperCase() as
          | 'N'
          | 'NE'
          | 'E'
          | 'SE'
          | 'S'
          | 'SW'
          | 'W'
          | 'NW',
      };
    case 'extract_logic':
      return {
        ...base,
        type: 'extract_logic',
        spawnLocation: (draft.spawnLocation ?? '').trim(),
        options,
        correctAnswer,
      };
    default:
      return { ...base, type: 'landmark_mc', options, correctAnswer };
  }
}

/** Turn a live question back into an editable draft (correction flow). */
export function questionToDraft(question: Question): QuestionDraft {
  return {
    mapId: question.mapId,
    type: question.type,
    difficulty: question.difficulty,
    prompt: question.prompt,
    options: [...question.options],
    correctAnswer: question.correctAnswer,
    spawnLocation: question.type === 'extract_logic' ? question.spawnLocation : undefined,
    imageUrl: question.imageUrl,
    explanation: question.explanation ?? '',
    tip: question.tip,
  };
}

export function blankDraft(type: QuestionType): QuestionDraft {
  return {
    mapId: 'customs',
    type,
    difficulty: 'essential',
    prompt: '',
    options: type === 'compass_check' ? ['N', 'E', 'S', 'W'] : ['', '', '', ''],
    correctAnswer: '',
    spawnLocation: type === 'extract_logic' ? '' : undefined,
    imageUrl: '',
    explanation: '',
    tip: '',
  };
}

/** One-tap starting points so the template is easy, not intimidating. */
export function exampleDraft(type: QuestionType): QuestionDraft {
  switch (type) {
    case 'compass_check':
      return {
        mapId: 'customs',
        type,
        difficulty: 'essential',
        prompt:
          'You are facing the front main entrance of the New Gas Station. Which cardinal direction are you looking?',
        options: ['N', 'E', 'S', 'W'],
        correctAnswer: 'S',
        explanation: 'The New Gas Station forecourt opens south onto the main east–west road.',
        tip: 'Face the pumps, then picture the highway: the forecourt opens SOUTH onto the road.',
      };
    case 'extract_logic':
      return {
        mapId: 'customs',
        type,
        difficulty: 'essential',
        prompt:
          'You spawned at Crossroads (far west). Which guaranteed PMC extract is OPEN for you?',
        options: ['Crossroads', 'ZB-1011', "Smuggler's Boat", 'Dorms V-Ex'],
        correctAnswer: 'ZB-1011',
        spawnLocation: 'Crossroads / Trailer Park',
        explanation:
          'Spawning on the far west side guarantees your main extraction will be on the far east at ZB-1011.',
        tip: 'Opposite-side rule: spawn west → plan a full west-to-east route ending at ZB-1011.',
      };
    default:
      return {
        mapId: 'customs',
        type: 'landmark_mc',
        difficulty: 'essential',
        prompt: 'Identify this landmark on Customs:',
        options: ['Crackhouse', 'Stronghold', 'Dorms Guard Desk', 'ZB-1012'],
        correctAnswer: 'Crackhouse',
        explanation:
          'Crackhouse is the two-story brick medical block between Stronghold and the construction yard.',
        tip: 'Anchor on Stronghold first: Crackhouse is the smaller brick building just south of it.',
        imageUrl: '',
      };
  }
}

/** True when two drafts are textually identical (blocks no-op corrections). */
export function draftsEqual(a: QuestionDraft, b: QuestionDraft): boolean {
  const norm = (d: QuestionDraft) =>
    JSON.stringify({
      type: d.type,
      difficulty: d.difficulty,
      prompt: d.prompt.trim(),
      options: d.options.map((o) => o.trim()).filter(Boolean),
      correctAnswer: d.correctAnswer.trim(),
      spawn: (d.spawnLocation ?? '').trim(),
      image: (d.imageUrl ?? '').trim(),
      explanation: d.explanation.trim(),
      tip: (d.tip ?? '').trim(),
    });
  return norm(a) === norm(b);
}
