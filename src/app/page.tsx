'use client';

import React, { useState } from 'react';
import { CheckCircle2, XCircle, RotateCcw, Heart, Flame, Flag } from 'lucide-react';

const QUESTIONS = [
  {
    id: 'c-01',
    prompt: 'Identify this landmark on Customs:',
    imageUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb186f5f7?auto=format&fit=crop&w=800&q=80',
    options: ['Big Red Warehouse', 'Crackhouse', '3-Story Dorms', 'New Gas Station'],
    correctAnswer: 'Big Red Warehouse',
    explanation: 'Big Red dominates the western industrial side of Customs near the river.'
  },
  {
    id: 'c-02',
    prompt: 'You are facing the front main entrance of 3-Story Dorms. Which cardinal direction are you looking?',
    options: ['N', 'E', 'S', 'W'],
    correctAnswer: 'N',
    explanation: 'Facing the front double doors of 3-Story Dorms points almost directly North.'
  },
  {
    id: 'c-03',
    prompt: 'You spawned at Crossroads (Far West). Which guaranteed PMC extract is OPEN for you?',
    options: ['Crossroads', 'Trailer Park Workers', 'ZB-1011', 'Smuggler\'s Boat'],
    correctAnswer: 'ZB-1011',
    explanation: 'Spawning on the far west side guarantees your main extraction will be on the far east at ZB-1011.'
  }
];

export default function Home() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lives, setLives] = useState(3);
  const [streak, setStreak] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  const currentQ = QUESTIONS[currentIndex];

  const handleSelectOption = (option: string) => {
    if (isAnswerSubmitted || isGameOver) return;
    setSelectedOption(option);
  };

  const handleCheckAnswer = () => {
    if (!selectedOption || isAnswerSubmitted) return;

    const isCorrect = selectedOption === currentQ.correctAnswer;
    setIsAnswerSubmitted(true);

    if (isCorrect) {
      setStreak((prev) => prev + 1);
    } else {
      setStreak(0);
      setLives((prev) => {
        const next = prev - 1;
        if (next <= 0) setIsGameOver(true);
        return next;
      });
    }
  };

  const handleNext = () => {
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    if (currentIndex + 1 < QUESTIONS.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      alert('Raid Survived! You completed all questions.');
      resetDrill();
    }
  };

  const resetDrill = () => {
    setCurrentIndex(0);
    setLives(3);
    setStreak(0);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setIsGameOver(false);
  };

  const isCorrect = selectedOption === currentQ?.correctAnswer;
  const progressPercent = Math.min(100, Math.round((currentIndex / QUESTIONS.length) * 100));

  return (
    <main suppressHydrationWarning className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center">
      {/* Header Bar */}
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
            onClick={() => alert('Feedback modal goes here!')}
            title="Report issue with this question"
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Flag className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="w-full max-w-2xl flex-1 flex flex-col justify-between p-4 py-8">
        {isGameOver ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
            <h2 className="text-3xl font-black text-rose-500 uppercase tracking-wide">MIA / Raid Failed</h2>
            <p className="text-zinc-400">You ran out of lives. Review your extracts and try again.</p>
            <button
              onClick={resetDrill}
              className="flex items-center gap-2 mt-4 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 font-bold rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Retry Drill
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <h2 className="text-xl font-bold">{currentQ.prompt}</h2>

              {currentQ.imageUrl && (
                <div className="w-full h-56 md:h-72 rounded-xl overflow-hidden border border-zinc-800 relative bg-zinc-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentQ.imageUrl}
                    alt="Map reference"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                {currentQ.options.map((opt) => {
                  let btnStyle = 'border-zinc-800 bg-zinc-900 hover:border-zinc-600 text-zinc-200';

                  if (selectedOption === opt) {
                    btnStyle = 'border-blue-500 bg-blue-950/40 text-blue-200';
                  }

                  if (isAnswerSubmitted) {
                    if (opt === currentQ.correctAnswer) {
                      btnStyle = 'border-emerald-500 bg-emerald-950/50 text-emerald-200';
                    } else if (selectedOption === opt) {
                      btnStyle = 'border-rose-500 bg-rose-950/50 text-rose-200';
                    }
                  }

                  return (
                    <button
                      key={opt}
                      disabled={isAnswerSubmitted}
                      onClick={() => handleSelectOption(opt)}
                      className={`p-4 rounded-xl border-2 text-left font-semibold transition-all duration-150 ${btnStyle}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-zinc-800/80">
              {!isAnswerSubmitted ? (
                <button
                  disabled={!selectedOption}
                  onClick={handleCheckAnswer}
                  className={`w-full py-4 rounded-xl font-bold uppercase tracking-wider transition-all duration-150 ${
                    selectedOption
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  Check Answer
                </button>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    {isCorrect ? (
                      <>
                        <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                        <span className="font-bold text-emerald-400">Correct! Well played.</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-6 h-6 text-rose-400" />
                        <span className="font-bold text-rose-400">Incorrect!</span>
                      </>
                    )}
                  </div>
                  {currentQ.explanation && (
                    <p className="text-sm text-zinc-400">{currentQ.explanation}</p>
                  )}
                  <button
                    onClick={handleNext}
                    className="w-full py-4 mt-2 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded-xl uppercase tracking-wider transition-all"
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}