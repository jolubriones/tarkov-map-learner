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
        if (next <= 0) setIs