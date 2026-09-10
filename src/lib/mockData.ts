import { Question } from './types';

// Expanded Customs question bank - 15 questions covering landmarks, compass, and exports
export const CUSTOMS_DRILL_QUESTIONS: Question[] = [
  // Original questions preserved
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
  },
  // New landmark questions
  {
    id: 'c-04',
    mapId: 'customs',
    type: 'landmark_mc',
    prompt: 'Identify this landmark on Customs:',
    imageUrl: 'https://images.unsplash.com/photo-1552664734-dd639bd970ba?auto=format&fit=crop&w=800&q=80',
    options: ['Old Gas Station', 'Shelter', 'Checkpoint', 'Power Station'],
    correctAnswer: 'Old Gas Station',
    explanation: 'Old Gas Station is located on the southern side of Customs near the highway overpass.'
  },
  {
    id: 'c-05',
    mapId: 'customs',
    type: 'landmark_mc',
    prompt: 'Identify this landmark on Customs:',
    imageUrl: 'https://images.unsplash.com/photo-1547658719-making-262?auto=format&fit=crop&w=800&q=80',
    options: ['Swamp', 'Basilica', "Sanitar's House", 'Pharmacy'],
    correctAnswer: "Sanitar's House",
    explanation: "Sanitar's House is in the northern residential area near the swamps of Customs."
  },
  {
    id: 'c-06',
    mapId: 'customs',
    type: 'landmark_mc',
    prompt: 'Identify this landmark on Customs:',
    imageUrl: 'https://images.unsplash.com/photo-1518717712515-45c494839636?auto=format&fit=crop&w=800&q=80',
    options: ['Gas Station', 'Railway', 'Subway', 'Underground'],
    correctAnswer: 'Railway',
    explanation: 'The railway runs along the eastern edge of Customs connecting various points.'
  },
  // New compass questions
  {
    id: 'c-07',
    mapId: 'customs',
    type: 'compass_check',
    prompt: 'You are facing the main entrance of the Gas Station. Which cardinal direction are you looking?',
    options: ['N', 'E', 'S', 'W'],
    correctAnswer: 'S',
    explanation: 'The Gas Station main entrance faces south towards the highway.'
  },
  {
    id: 'c-08',
    mapId: 'customs',
    type: 'compass_check',
    prompt: 'You are standing outside the dorms building facing the courtyard. Which direction are you looking?',
    options: ['N', 'NE', 'E', 'SE'],
    correctAnswer: 'E',
    explanation: 'Facing the courtyard from the dorms, you look east towards the main pathways.'
  },
  {
    id: 'c-09',
    mapId: 'customs',
    type: 'compass_check',
    prompt: 'You spawned at Customs Checkpoint and face the main road. Which direction?',
    options: ['N', 'NE', 'E', 'SE'],
    correctAnswer: 'E',
    explanation: 'From Customs Checkpoint, the main road runs east-west.'
  },
  // New extract questions
  {
    id: 'c-10',
    mapId: 'customs',
    type: 'extract_logic',
    prompt: 'You spawned at the Resort. Which PMC extract is OPEN for you?',
    spawnLocation: 'Resort',
    options: ['Resort', 'Land House', 'Gas Station', 'Customs'],
    correctAnswer: 'Land House',
    explanation: 'From the Resort, the Land House extract is the main PMC exit to the north.'
  },
  {
    id: 'c-11',
    mapId: 'customs',
    type: 'extract_logic',
    prompt: 'You spawned at the Sawmill (far north). Which extract is OPEN?',
    spawnLocation: 'Sawmill',
    options: ['Sawmill', 'Log Cabin', 'ZB-1011', 'Highway'],
    correctAnswer: 'ZB-1011',
    explanation: 'From the Sawmill, ZB-1011 is the guaranteed east-side extraction.'
  },
  {
    id: 'c-12',
    mapId: 'customs',
    type: 'extract_logic',
    prompt: 'You spawned at the Gas Station. Which extract can you use?',
    spawnLocation: 'Gas Station',
    options: ['Gas Station', 'Streets', 'Land House', 'Resort'],
    correctAnswer: 'Streets',
    explanation: 'The Streets extract is right at the Gas Station location.'
  },
  // Mixed difficulty questions
  {
    id: 'c-13',
    mapId: 'customs',
    type: 'landmark_mc',
    prompt: 'Identify this landmark on Customs:',
    imageUrl: 'https://images.unsplash.com/photo-1541896961231-8c43d4e7d8c1?auto=format&fit=crop&w=800&q=80',
    options: ['Wharf', 'Dock', 'Boathouse', 'Pier'],
    correctAnswer: 'Wharf',
    explanation: 'The Wharf is located on the southwestern coast of Customs near the water.'
  },
  {
    id: 'c-14',
    mapId: 'customs',
    type: 'compass_check',
    prompt: 'You are facing the back of the 3-Story Dorms. Which direction?',
    options: ['N', 'NE', 'E', 'SE', 'S', 'SW'],
    correctAnswer: 'S',
    explanation: 'Facing the back of 3-Story Dorms points you south towards the open area.'
  },
  {
    id: 'c-15',
    mapId: 'customs',
    type: 'extract_logic',
    prompt: 'You spawned at the Trailer Park. Which guaranteed extract is OPEN?',
    spawnLocation: 'Trailer Park',
    options: ['Trailer Park Workers', 'ZB-1011', 'Customs', 'Streets'],
    correctAnswer: 'ZB-1011',
    explanation: 'From the far west Trailer Park, ZB-1011 is the guaranteed east extract.'
  }
];