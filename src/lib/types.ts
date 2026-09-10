export type QuestionType = 'landmark_mc' | 'compass_check' | 'extract_logic';

/**
 * Difficulty bins — required on every question (built-in and community).
 * Doubles as the player skill ladder: your ELO rank carries the same name
 * as the bin you're competitive in. Meta lives in
 * `src/lib/community/difficulty.ts`.
 */
export type QuestionDifficulty = 'essential' | 'enlightened' | 'sherpa' | 'immortal';

export interface BaseQuestion {
  id: string;
  mapId: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  prompt: string;
  imageUrl?: string;
  explanation?: string;
  /** Short learning tip shown after answering (especially on wrong answers). */
  tip?: string;
}

export interface LandmarkMCQuestion extends BaseQuestion {
  type: 'landmark_mc';
  options: string[];
  correctAnswer: string;
}

export interface CompassQuestion extends BaseQuestion {
  type: 'compass_check';
  options: ('N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW')[];
  correctAnswer: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
}

export interface ExtractQuestion extends BaseQuestion {
  type: 'extract_logic';
  spawnLocation: string;
  options: string[];
  correctAnswer: string;
}

export type Question = LandmarkMCQuestion | CompassQuestion | ExtractQuestion;
