import type { FighterData } from '../../types';
import { makeVariant, remapAnims } from './_inherit';
import gorgon1 from './gorgon_1';

export const gorgon_3: FighterData = makeVariant(gorgon1, {
  id: 'gorgon_3',
  family: 'gorgon',
  displayName: 'Gorgon Ancient',
  lore: 'The eldest of the gorgon bloodline, her hide is thick as granite and her gaze carries the weight of millennia of hatred.',
  flags: { hasJump: false, hasBlock: false },
  stats: {
    maxHp: 1150,
    walkSpeed: 175,
    jumpVelocity: 0,
    weight: 130,
    meterGainOnHit: 6,
    meterGainOnTake: 5,
  },
  animations: remapAnims('gorgon_3', [
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
    'Centuries of war, and still you mortals do not learn.',
    'Your petrified form will decorate my labyrinth.',
    'Even gods have fallen to my gaze. You were not a god.',
  ],
});
