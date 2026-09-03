import { Question } from './types';

export const CUSTOMS_DRILL_QUESTIONS: Question[] = [
  {
    id: 'c-01',
    mapId: 'customs',
    type: 'landmark_mc',
    prompt: 'Identify this landmark on Customs:',
    imageUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb186f5f7?auto=format&fit=crop&w=800&q=80',
    options: ['Big Red Warehouse', 'Crackhouse', '3-Story Dorms', 'New Gas Station'],
    correctAnswer: 'Big Red Warehouse',
    explanation: 'Big Red dominates the western industrial side of Customs near the river.'
  },
  {
    id: 'c-02',
    mapId: 'customs',
    type: 'compass_check',
    prompt: 'You are facing the front main entrance of 3-Story Dorms. Which cardinal direction are you looking?',
    options: ['N', 'E', 'S', 'W'],
    correctAnswer: 'N',
    explanation: 'Facing the front double doors of 3-Story Dorms points almost directly North.'
  },
  {
    id: 'c-03',
    mapId: 'customs',
    type: 'extract_logic',
    prompt: 'You spawned at Crossroads (Far West). Which guaranteed PMC extract is OPEN for you?',
    spawnLocation: 'Crossroads / Trailer Park',
    options: ['Crossroads', 'Trailer Park Workers', 'ZB-1011', 'Smuggler\'s Boat'],
    correctAnswer: 'ZB-1011',
    explanation: 'Spawning on the far west side guarantees your main extraction will be on the far east at ZB-1011.'
  }
];