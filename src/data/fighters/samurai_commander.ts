import type { FighterData } from '../../types';
import { makeVariant, remapAnims } from './_inherit';
import samurai from './samurai';

export const samurai_commander: FighterData = makeVariant(samurai, {
  id: 'samurai_commander',
  family: 'samurai_commander',
  displayName: 'Samurai Commander',
  lore: 'A veteran general who has led ten thousand soldiers and dueled the finest blades in the realm. He commands the battlefield and his own body with equal precision.',
  archetype: 'mixed',
  flags: { hasJump: true, hasBlock: true },
  stats: {
    maxHp: 1100,
    walkSpeed: 205,
    jumpVelocity: 840,
    weight: 108,
    meterGainOnHit: 6,
    meterGainOnTake: 5,
  },
  animations: remapAnims('samurai_commander', [
    { logicalKey: 'idle',       state: 'Idle',     frameRate: 8,  repeat: -1 },
    { logicalKey: 'walk',       state: 'Walk',     frameRate: 9,  repeat: -1 },
    { logicalKey: 'run',        state: 'Run',      frameRate: 12, repeat: -1 },
    { logicalKey: 'jump',       state: 'Jump',     frameRate: 14, repeat: 0  },
    { logicalKey: 'block',      state: 'Protect',  frameRate: 10, repeat: -1 },
    { logicalKey: 'hurt',       state: 'Hurt',     frameRate: 14, repeat: 0  },
    { logicalKey: 'dead',       state: 'Dead',     frameRate: 12, repeat: 0  },
    { logicalKey: 'attack_lp',  state: 'Attack_1', frameRate: 15, repeat: 0  },
    { logicalKey: 'attack_hp',  state: 'Attack_2', frameRate: 15, repeat: 0  },
    { logicalKey: 'attack_lk',  state: 'Attack_1', frameRate: 15, repeat: 0  },
    { logicalKey: 'attack_hk',  state: 'Attack_3', frameRate: 15, repeat: 0  },
    { logicalKey: 'special_1',  state: 'Attack_3', frameRate: 18, repeat: 0  },
    { logicalKey: 'special_2',  state: 'Protect',  frameRate: 14, repeat: 0  },
    { logicalKey: 'super',      state: 'Attack_3', frameRate: 18, repeat: 0  },
  ]),
  winQuotes: [
    'I have ended wars. You were barely a skirmish.',
    'Command is not cruelty. But it demands victory.',
    'Ten thousand battles taught me how to read yours. I read it in seconds.',
  ],
});
