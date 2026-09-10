import type { Question } from './types';

// Customs question bank — 15 questions covering landmarks, compass, and extracts
// (Landmark photos: free Pexels stock used as mock stand-ins, not real Tarkov screenshots.
// Canonical images live in public/images/<map>/ and are referenced by path —
// community merges self-host there; c-05's is an AI stand-in.)
export const CUSTOMS_DRILL_QUESTIONS: Question[] = [
  {
    id: 'c-01',
    mapId: 'customs',
    type: 'landmark_mc',
    difficulty: 'essential',
    prompt: 'Identify this landmark on Customs:',
    imageUrl: 'https://images.pexels.com/photos/7160000/pexels-photo-7160000.jpeg?auto=compress&cs=tinysrgb&w=800',
    options: ['Big Red Warehouse', 'Crackhouse', '3-Story Dorms', 'New Gas Station'],
    correctAnswer: 'Big Red Warehouse',
    explanation: 'Big Red dominates the western industrial side of Customs near the river.',
    tip: 'Memory trick: "Red = West." Big Red sits on the WEST bank of the river — if you cross the bridge heading east, you have left it behind.'
  },
  {
    id: 'c-02',
    mapId: 'customs',
    type: 'compass_check',
    difficulty: 'essential',
    prompt: 'You are facing the front main entrance of 3-Story Dorms. Which cardinal direction are you looking?',
    options: ['N', 'E', 'S', 'W'],
    correctAnswer: 'N',
    explanation: 'Facing the front double doors of 3-Story Dorms points almost directly North.',
    tip: 'Dorms run east–west. Front (double doors + parking lot) faces NORTH toward the road; the back faces the construction yard to the south.'
  },
  {
    id: 'c-03',
    mapId: 'customs',
    type: 'extract_logic',
    difficulty: 'essential',
    prompt: 'You spawned at Crossroads (Far West). Which guaranteed PMC extract is OPEN for you?',
    spawnLocation: 'Crossroads / Trailer Park',
    options: ['Crossroads', 'Trailer Park Workers', 'ZB-1011', "Smuggler's Boat"],
    correctAnswer: 'ZB-1011',
    explanation: 'Spawning on the far west side guarantees your main extraction will be on the far east at ZB-1011.',
    tip: 'Opposite-side rule: PMC extracts are always across the map from your spawn. Spawn west → plan a full west-to-east route ending at ZB-1011.'
  },
  // Landmark questions
  {
    id: 'c-04',
    mapId: 'customs',
    type: 'landmark_mc',
    difficulty: 'enlightened',
    prompt: 'Identify this landmark on Customs:',
    imageUrl: 'https://images.pexels.com/photos/5540003/pexels-photo-5540003.jpeg?auto=compress&cs=tinysrgb&w=800',
    options: ['Old Gas Station', 'Shelter', 'Checkpoint', 'Power Station'],
    correctAnswer: 'Old Gas Station',
    explanation: 'Old Gas Station is located on the southern side of Customs near the highway overpass.',
    tip: 'Two gas stations on Customs: OLD gas is south-center by the tracks, NEW gas is far east on the main road. "Old = South-center, New = East."'
  },
  {
    id: 'c-05',
    mapId: 'customs',
    type: 'landmark_mc',
    difficulty: 'immortal',
    prompt: 'Identify this landmark on Customs:',
    imageUrl: '/images/customs/c-05.jpg',
    options: ['Swamp', 'Basilica', "Sanitar's House", 'Pharmacy'],
    correctAnswer: "Sanitar's House",
    explanation: "Sanitar's House is in the northern residential area near the swamps of Customs.",
    tip: 'Anchor on the water: the swamp / river bend is your north-star here. Find the water first, then the house just south of it.'
  },
  {
    id: 'c-06',
    mapId: 'customs',
    type: 'landmark_mc',
    difficulty: 'essential',
    prompt: 'Identify this landmark on Customs:',
    imageUrl: 'https://images.pexels.com/photos/28104540/pexels-photo-28104540.jpeg?auto=compress&cs=tinysrgb&w=800',
    options: ['Gas Station', 'Railway', 'Subway', 'Underground'],
    correctAnswer: 'Railway',
    explanation: 'The railway runs along the eastern edge of Customs connecting various points.',
    tip: 'The railway is a handrail: follow the tracks and they funnel you along the eastern edge toward ZB-1011 and the far-east extracts.'
  },
  // Compass questions
  {
    id: 'c-07',
    mapId: 'customs',
    type: 'compass_check',
    difficulty: 'enlightened',
    prompt: 'You are facing the main entrance of the Gas Station. Which cardinal direction are you looking?',
    options: ['N', 'E', 'S', 'W'],
    correctAnswer: 'S',
    explanation: 'The Gas Station main entrance faces south towards the highway.',
    tip: 'Face the pumps, then picture the highway behind you: the forecourt opens SOUTH onto the road. Highway = South from here.'
  },
  {
    id: 'c-08',
    mapId: 'customs',
    type: 'compass_check',
    difficulty: 'enlightened',
    prompt: 'You are standing outside the dorms building facing the courtyard. Which direction are you looking?',
    options: ['N', 'NE', 'E', 'SE'],
    correctAnswer: 'E',
    explanation: 'Facing the courtyard from the dorms, you look east towards the main pathways.',
    tip: 'Think of dorms as two blocks in a row: the courtyard gap between them lines up EAST toward the main Customs road.'
  },
  {
    id: 'c-09',
    mapId: 'customs',
    type: 'compass_check',
    difficulty: 'essential',
    prompt: 'You spawned at Customs Checkpoint and face the main road. Which direction?',
    options: ['N', 'NE', 'E', 'SE'],
    correctAnswer: 'E',
    explanation: 'From Customs Checkpoint, the main road runs east-west.',
    tip: "The main road is the map's spine running west→east. Face along it toward the center of the map and you are looking EAST."
  },
  // Extract-logic questions
  {
    id: 'c-10',
    mapId: 'customs',
    type: 'extract_logic',
    difficulty: 'enlightened',
    prompt: 'You spawned at the Resort. Which PMC extract is OPEN for you?',
    spawnLocation: 'Resort',
    options: ['Resort', 'Land House', 'Gas Station', 'Customs'],
    correctAnswer: 'Land House',
    explanation: 'From the Resort, the Land House extract is the main PMC exit to the north.',
    tip: 'Never pick your own spawn as the extract — it is never open for you. Cross off "Resort" first, then choose the farthest option north.'
  },
  {
    id: 'c-11',
    mapId: 'customs',
    type: 'extract_logic',
    difficulty: 'enlightened',
    prompt: 'You spawned at the Sawmill (far north). Which extract is OPEN?',
    spawnLocation: 'Sawmill',
    options: ['Sawmill', 'Log Cabin', 'ZB-1011', 'Highway'],
    correctAnswer: 'ZB-1011',
    explanation: 'From the Sawmill, ZB-1011 is the guaranteed east-side extraction.',
    tip: 'ZB-1011 is the default guaranteed extract for west/north spawns. When in doubt on Customs, route toward the far-east bunker.'
  },
  {
    id: 'c-12',
    mapId: 'customs',
    type: 'extract_logic',
    difficulty: 'enlightened',
    prompt: 'You spawned at the Gas Station. Which extract can you use?',
    spawnLocation: 'Gas Station',
    options: ['Gas Station', 'Streets', 'Land House', 'Resort'],
    correctAnswer: 'Streets',
    explanation: 'The Streets extract is right at the Gas Station location.',
    tip: 'Some extracts share a name with a nearby landmark but are NOT the spawn itself — confirm the extract icon on your map before committing.'
  },
  {
    id: 'c-13',
    mapId: 'customs',
    type: 'landmark_mc',
    difficulty: 'sherpa',
    prompt: 'Identify this landmark on Customs:',
    imageUrl: 'https://images.pexels.com/photos/415470/pexels-photo-415470.jpeg?auto=compress&cs=tinysrgb&w=800',
    options: ['Wharf', 'Dock', 'Boathouse', 'Pier'],
    correctAnswer: 'Wharf',
    explanation: 'The Wharf is located on the southwestern coast of Customs near the water.',
    tip: 'Water words cluster in the southwest. When all options sound wet, anchor on the river bend — the Wharf is the structure ON the south-west water.'
  },
  {
    id: 'c-14',
    mapId: 'customs',
    type: 'compass_check',
    difficulty: 'essential',
    prompt: 'You are facing the back of the 3-Story Dorms. Which direction?',
    options: ['N', 'NE', 'E', 'SE', 'S', 'SW'],
    correctAnswer: 'S',
    explanation: 'Facing the back of 3-Story Dorms points you south towards the open area.',
    tip: 'Flip it: front of dorms = North, so the back must be SOUTH. Pair fronts and backs as opposites to answer compass checks fast.'
  },
  {
    id: 'c-15',
    mapId: 'customs',
    type: 'extract_logic',
    difficulty: 'essential',
    prompt: 'You spawned at the Trailer Park. Which guaranteed extract is OPEN?',
    spawnLocation: 'Trailer Park',
    options: ['Trailer Park Workers', 'ZB-1011', 'Customs', 'Streets'],
    correctAnswer: 'ZB-1011',
    explanation: 'From the far west Trailer Park, ZB-1011 is the guaranteed east extract.',
    tip: 'Trailer Park is a far-west spawn, so eliminate every west-side option first. Only the far-east ZB-1011 survives the opposite-side rule.'
  }
];
