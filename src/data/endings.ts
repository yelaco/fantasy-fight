export interface Ending {
  fighterId: string;
  title: string;
  lines: string[];
}

/**
 * Triumphant arcade endings for all 21 fighters.
 * Keyed by fighter id. getEnding() always returns a value — never throws.
 */
export const ENDINGS: Record<string, Ending> = {
  // --- Gorgons ---
  gorgon_1: {
    fighterId: 'gorgon_1',
    title: 'Stone and Silence',
    lines: [
      'The youngest Gorgon stood victorious, her gaze sweeping the fallen arena.',
      'She had proven herself beyond her sisters\' shadow.',
      'From this day, all who met her eyes would remember — and tremble.',
    ],
  },
  gorgon_2: {
    fighterId: 'gorgon_2',
    title: 'The Serpent\'s Crown',
    lines: [
      'The second sister had always been the calculated one, the patient hunter.',
      'Tonight\'s ladder confirmed it: patience turns stone to victory.',
      'She returned to the Gorgon court draped in the title of Champion.',
    ],
  },
  gorgon_3: {
    fighterId: 'gorgon_3',
    title: 'Eldest Fury',
    lines: [
      'The eldest Gorgon fought not for glory, but for her bloodline\'s dominance.',
      'With every opponent defeated, her legend calcified into myth.',
      'No hero will dare challenge the Gorgon name again.',
    ],
  },

  // --- Minotaurs ---
  minotaur_1: {
    fighterId: 'minotaur_1',
    title: 'Strength of the Labyrinth',
    lines: [
      'He emerged from the labyrinth to prove beasts can be champions too.',
      'Every wall he shattered was a wall of doubt — his own and others\'.',
      'The roar that shook the arena still echoes through the stone corridors.',
    ],
  },
  minotaur_2: {
    fighterId: 'minotaur_2',
    title: 'Blood of the Maze',
    lines: [
      'Born in darkness, trained by isolation, tempered by rage.',
      'The second Minotaur proved the labyrinth breeds more than monsters.',
      'He left the arena carrying the horn of every rival who underestimated him.',
    ],
  },
  minotaur_3: {
    fighterId: 'minotaur_3',
    title: 'The Final Boss Unbound',
    lines: [
      'They built the arena to contain threats like him — it was not enough.',
      'The great Minotaur fought through the ladder and found no equal.',
      'He returns to his labyrinth a god, and the labyrinth bows.',
    ],
  },

  // --- Ninjas ---
  kunoichi: {
    fighterId: 'kunoichi',
    title: 'Shadow Blossom',
    lines: [
      'She moved through the bracket like wind through leaves — unseen until too late.',
      'The kunoichi clan had sent her to test the world; the world failed.',
      'She vanished before the crowd could cheer, her mission complete.',
    ],
  },
  ninja_monk: {
    fighterId: 'ninja_monk',
    title: 'The Silent Fist',
    lines: [
      'Years of monastery training converged in a single tournament night.',
      'The monk struck with precision that looked like prayer — and hit like thunder.',
      'He bowed to each fallen foe, then walked back to the mountain in peace.',
    ],
  },
  ninja_peasant: {
    fighterId: 'ninja_peasant',
    title: 'Rice Farmer, Champion',
    lines: [
      'Nobody in the village believed a peasant could reach the summit.',
      'He proved that discipline forged in fields outlasts power born in palaces.',
      'He returned home; the trophy became a scarecrow in his rice paddy.',
    ],
  },

  // --- Samurai ---
  samurai: {
    fighterId: 'samurai',
    title: 'The Honorable Blade',
    lines: [
      'Each duel was a poem — measured, precise, and final.',
      'He carried no grudge into the arena, only the weight of his oath.',
      'The samurai sheathed his sword; the crowd understood without applause.',
    ],
  },
  samurai_archer: {
    fighterId: 'samurai_archer',
    title: 'Arrow\'s End',
    lines: [
      'She drew from a hundred paces and never missed — not once, not ever.',
      'Her quiver was empty by the final round; her fists did the rest.',
      'They say her arrows are still lodged in the arena pillars as trophies.',
    ],
  },
  samurai_commander: {
    fighterId: 'samurai_commander',
    title: 'By My Command',
    lines: [
      'He had led armies; today he led only himself — and it was enough.',
      'Every move was a battlefield decision executed without hesitation.',
      'The Commander accepted the championship banner and raised it like a war standard.',
    ],
  },

  // --- Skeletons ---
  skeleton_warrior: {
    fighterId: 'skeleton_warrior',
    title: 'The Undying Vanguard',
    lines: [
      'Death had already taken him once; a tournament posed no real threat.',
      'He fought with the calm of one who has nothing left to lose.',
      'The Skeleton Warrior raises his shield — not in defiance of death, but of forgetting.',
    ],
  },
  skeleton_spearman: {
    fighterId: 'skeleton_spearman',
    title: 'Reach Beyond the Grave',
    lines: [
      'His spear arm never tired, his bones never ached.',
      'Opponents feared the rattle of his approach more than the strike itself.',
      'He planted his spear in the arena\'s center stone — his name carved there forever.',
    ],
  },
  skeleton_archer: {
    fighterId: 'skeleton_archer',
    title: 'Bone and Bowstring',
    lines: [
      'Decay claims flesh, but not aim — his arrows still flew true.',
      'He nocked his final arrow, loosed it into the sky, and watched it arc like a comet.',
      'The crowd cheered a skeleton; he smiled — he had always known they would.',
    ],
  },

  // --- Werewolves ---
  black_werewolf: {
    fighterId: 'black_werewolf',
    title: 'Midnight Victor',
    lines: [
      'The Black Werewolf fought best under a moonless sky — tonight was perfect.',
      'His pack had scattered, but his fury carried the weight of all of them.',
      'He howled once over the fallen boss; the sound carried to every den in the forest.',
    ],
  },
  red_werewolf: {
    fighterId: 'red_werewolf',
    title: 'Crimson Hunt',
    lines: [
      'Red fur, red record — no losses, only a trail of rivals left behind.',
      'She fought with the instinct of a predator and the fire of a champion.',
      'The Red Werewolf carried her trophy back into the wild, where it belongs.',
    ],
  },
  white_werewolf: {
    fighterId: 'white_werewolf',
    title: 'The Pale Fury',
    lines: [
      'White as snowfall, swift as an avalanche — and just as unstoppable.',
      'Many thought the White Werewolf too gentle; they corrected that belief quickly.',
      'She stands at the peak, coat gleaming, a legend born from the winter pack.',
    ],
  },

  // --- Wizards ---
  fire_wizard: {
    fighterId: 'fire_wizard',
    title: 'Inferno\'s Crown',
    lines: [
      'He arrived at the tournament with a burning question: who is strongest?',
      'Seven fights, seven pyres — the answer was always the same.',
      'The Fire Wizard ascends his tower; the championship trophy melts into a golden flame.',
    ],
  },
  lightning_mage: {
    fighterId: 'lightning_mage',
    title: 'Strike the Sky',
    lines: [
      'She channeled the storm that raged above the arena and made it her weapon.',
      'Every opponent saw the flash; none were fast enough to escape the thunder.',
      'The Lightning Mage stands at the summit, crackling with power, unbowed.',
    ],
  },
  wanderer_magican: {
    fighterId: 'wanderer_magican',
    title: 'The Road\'s End is the Beginning',
    lines: [
      'He had wandered every road between kingdoms searching for a worthy rival.',
      'The ladder gave him seven — none were worthy, yet all were worthy.',
      'He pockets the championship coin, tips his hat, and wanders on.',
    ],
  },
};

const GENERIC_ENDING: Ending = {
  fighterId: 'unknown',
  title: 'Champion',
  lines: [
    'Against all odds, the fighter clawed through every challenge.',
    'No name was known before; every name knows this champion now.',
  ],
};

export function getEnding(id: string): Ending {
  return ENDINGS[id] ?? { ...GENERIC_ENDING, fighterId: id };
}
