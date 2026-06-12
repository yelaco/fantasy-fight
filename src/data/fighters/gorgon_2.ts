import type { FighterData } from '../../types';
import { makeVariant, remapAnims } from './_inherit';
import gorgon1 from './gorgon_1';

export const gorgon_2: FighterData = makeVariant(gorgon1, {
  id: 'gorgon_2',
  family: 'gorgon',
  displayName: 'Gorgon Crimson',
  lore: 'A more feral sister of the ancient gorgon lineage, her venom runs hotter and her strikes land with terrible swiftness.',
  flags: { hasJump: false, hasBlock: false },
  stats: {
    maxHp: 1000,
    walkSpeed: 200,
    jumpVelocity: 0,
    weight: 115,
    meterGainOnHit: 7,
    meterGainOnTake: 4,
  },
  animations: remapAnims('gorgon_2', [
    { logicalKey: 'idle',       state: 'Idle',     frameRate: 8,  repeat: -1 },
    { logicalKey: 'idle_2',     state: 'Idle_2',   frameRate: 8,  repeat: -1 },
    { logicalKey: 'walk',       state: 'Walk',     frameRate: 9,  repeat: -1 },
    { logicalKey: 'run',        state: 'Run',      frameRate: 12, repeat: -1 },
    { logicalKey: 'hurt',       state: 'Hurt',     frameRate: 14, repeat: 0  },
    { logicalKey: 'dead',       state: 'Dead',     frameRate: 12, repeat: 0  },
    { logicalKey: 'attack_lp',  state: 'Attack_1', frameRate: 15, repeat: 0  },
    { logicalKey: 'attack_hp',  state: 'Attack_2', frameRate: 15, repeat: 0  },
    { logicalKey: 'attack_lk',  state: 'Attack_1', frameRate: 15, repeat: 0  },
    { logicalKey: 'attack_hk',  state: 'Attack_3', frameRate: 15, repeat: 0  },
    { logicalKey: 'special_1',  state: 'Special',  frameRate: 16, repeat: 0  },
    { logicalKey: 'special_2',  state: 'Attack_3', frameRate: 16, repeat: 0  },
    { logicalKey: 'super',      state: 'Special',  frameRate: 18, repeat: 0  },
  ]),
  winQuotes: [
    'Crimson suits you — especially your blood on the stone.',
    'I see you trembling. That is the last sensation you will know.',
    'My sisters warned you. You did not listen.',
  ],
});
