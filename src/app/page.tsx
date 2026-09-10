'use client';

import React, { useState, useEffect } from 'react';
import { RotateCcw, Heart, Flame, Flag, Volume2, VolumeX, MapPin } from 'lucide-react';
import { CUSTOMS_DRILL_QUESTIONS } from '@/lib/mockData';
import AnswerFeedback from '@/components/AnswerFeedback';
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

// Initialize from localStorage if available
const initStreak = (): number => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(`${STORAGE_KEY}_streak`);
    return stored ? parseInt(stored, 10) : 0;
  }
  return 0;
};

const initLives = (): number => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(`${STORAGE_KEY}_lives`);
    return stored ? parseInt(stored, 10) : 3;
  }
  return 3;
};

const initBestStreak = (): number => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(`${STORAGE_KEY}_bestStreak`);
    return stored ? parseInt(stored, 10) : 0;
  }
  return 0;
};

const initGamesPlayed = (): number => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(`${STORAGE_KEY}_gamesPlayed`);
    return stored ? parseInt(stored, 10) : 0;
  }
  return 0;
};

export default function Home() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lives, setLives] = useState(initLives);
  const [streak, setStreak] = useState(initStreak);
  const [bestStreak, setBestStreak] = useState(initBestStreak);
  const [gamesPlayed, setGamesPlayed] = useState(initGamesPlayed);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  // Lazy init from storage (same pattern as streak/lives; isMuted is SSR-safe)
  const [muted, setMutedState] = useState<boolean>(() => isMuted());

  const totalQuestions = CUSTOMS_DRILL_QUESTIONS.length;
  const currentQ = CUSTOMS_DRILL_QUESTIONS[currentIndex];
  const isCorrect =
    isAnswerSubmitted && selectedOption === currentQ.correctAnswer;

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_streak`, streak.toString());
    localStorage.setItem(`${STORAGE_KEY}_lives`, lives.toString());
    localStorage.setItem(`${STORAGE_KEY}_bestStreak`, bestStreak.toString());
    localStorage.setItem(`${STORAGE_KEY}_gamesPlayed`, gamesPlayed.toString());
  }, [streak, lives, bestStreak, gamesPlayed]);

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

    if (correct) {
      playCorrectSound();
      setStreak((prev) => prev + 1);
      // Update best streak if applicable
      setBestStreak((prev) => Math.max(prev, streak + 1));
    } else {
      playWrongSound();
      setStreak(0);
      setLives((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          // Delay the game-over sting so it doesn't overlap the wrong buzz
          window.setTimeout(() => playGameOverSound(), 350);
          setIsGameOver(true);
          // Games played count increases even when game over
          setGamesPlayed((prev) => prev + 1);
        }
        return next;
      });
    }
  };

  const handleNextQuestion = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsAnswerSubmitted(false);
    } else {
      // Last question answered - game completes
      setIsGameOver(true);
      setGamesPlayed((prev) => prev + 1);
      setBestStreak((prev) => Math.max(prev, streak));
      if (lives > 0) {
        playCompleteSound();
      }
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setLives(3);
    setStreak(0);
    setBestStreak((prev) => Math.max(prev, streak));
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setIsGameOver(false);
    setGamesPlayed((prev) => prev + 1);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 sm:p-8 flex flex-col gap-6">
        {/* Header Stats */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2 font-bold text-amber-500">
            <Flame className="w-6 h-6 fill-amber-500 text-amber-500" />{' '}
            <span className="text-lg">{streak} Streak</span>
          </div>

          <div className="text-sm font-semibold text-zinc-400 tracking-wider uppercase flex items-center gap-1">
            <Flag className="w-4 h-4" /> Customs Drill
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <Heart
                  key={i}
                  className={`w-6 h-6 transition-colors ${
                    i < lives
                      ? 'fill-red-500 text-red-500'
                      : 'text-zinc-700 fill-zinc-800'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={toggleMute}
              title={muted ? 'Unmute sounds' : 'Mute sounds'}
              aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
              aria-pressed={muted}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Game Info Bar */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <span className="text-sm text-zinc-500">
            Q {currentIndex + 1} of {totalQuestions}
          </span>
          <span className="text-sm text-zinc-500">
            Games: {gamesPlayed} | Best: {bestStreak}
          </span>
        </div>

        {/* Game Over Screen */}
        {isGameOver ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-6">
            <h2 className="text-3xl font-extrabold text-white">
              {lives > 0 ? 'Drill Completed!' : 'MIA - Raid Failed'}
            </h2>
            <p className="text-zinc-400">
              {lives > 0
                ? `Great job! You finished with a streak of ${streak}.`
                : 'You lost all your lives. Study the map and try again!'}
            </p>
            <button
              onClick={handleRestart}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1 transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-5 h-5" /> Try Again
            </button>
          </div>
        ) : (
          /* Question Content */
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <span className="text-xs font-bold text-zinc-500 tracking-widest uppercase">
                Question {currentIndex + 1} of {totalQuestions}
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-zinc-100">
                {currentQ.prompt}
              </h2>
              {currentQ.type === 'extract_logic' && (
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-300 bg-sky-950/60 border border-sky-800 rounded-full px-3 py-1">
                  <MapPin className="w-3.5 h-3.5" />
                  Spawn: {currentQ.spawnLocation}
                </div>
              )}
            </div>

            {currentQ.imageUrl && (
              <div className="relative overflow-hidden rounded-xl border border-zinc-800 max-h-56">
                <img
                  src={currentQ.imageUrl}
                  alt="Tarkov Drill Landmark"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Answer Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                  />

                  <button
                    onClick={handleNextQuestion}
                    className="w-full py-3.5 rounded-xl font-bold uppercase tracking-wider bg-emerald-600 border-b-4 border-emerald-800 hover:bg-emerald-500 text-white active:border-b-0 active:translate-y-1 transition-all"
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
