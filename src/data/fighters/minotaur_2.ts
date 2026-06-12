import type { FighterData } from '../../types';
import { makeVariant, remapAnims } from './_inherit';
import { minotaur_1 } from './minotaur_1';

export const minotaur_2: FighterData = makeVariant(minotaur_1, {
  id: 'minotaur_2',
  family: 'minotaur',
  displayName: 'Minotaur Titan',
  lore: 'A younger but no less vicious kin of the labyrinth beast. He fights up close, locks opponents in holds they cannot escape, and finishes them without mercy.',
  archetype: 'grappler',
  flags: { hasJump: false, hasBlock: false },
  stats: {
    maxHp: 1300,
    walkSpeed: 140,
    jumpVelocity: 0,
    weight: 1.7,
    meterGainOnHit: 6,
    meterGainOnTake: 4,
  },
  animations: remapAnims('minotaur_2', [
    { logicalKey: 'idle',      state: 'Idle',   frameRate: 8,  repeat: -1 },
    { logicalKey: 'walk',      state: 'Walk',   frameRate: 9,  repeat: -1 },
    { logicalKey: 'hurt',      state: 'Hurt',   frameRate: 12, repeat: 0  },
    { logicalKey: 'dead',      state: 'Dead',   frameRate: 10, repeat: 0  },
    { logicalKey: 'attack_lp', state: 'Attack', frameRate: 14, repeat: 0  },
    { logicalKey: 'attack_hp', state: 'Attack', frameRate: 12, repeat: 0  },
    { logicalKey: 'attack_lk', state: 'Attack', frameRate: 14, repeat: 0  },
    { logicalKey: 'attack_hk', state: 'Attack', frameRate: 11, repeat: 0  },
    { logicalKey: 'special_1', state: 'Attack', frameRate: 18, repeat: 0  },
    { logicalKey: 'super',     state: 'Attack', frameRate: 14, repeat: 0  },
  ]),
  winQuotes: [
    'You thought size was your weapon. Mine is fury.',
    'The maze claimed you too. It always does.',
    'HRAAAUGH.',
  ],
});
