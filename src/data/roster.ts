import type { FighterData } from '../types';

// --- Gorgons ---
import gorgon_1 from './fighters/gorgon_1';
import { gorgon_2 } from './fighters/gorgon_2';
import { gorgon_3 } from './fighters/gorgon_3';
// --- Minotaurs ---
import { minotaur_1 } from './fighters/minotaur_1';
import { minotaur_2 } from './fighters/minotaur_2';
import { minotaur_3 } from './fighters/minotaur_3';
// --- Ninjas ---
import kunoichi from './fighters/kunoichi';
import { ninja_monk } from './fighters/ninja_monk';
import { ninja_peasant } from './fighters/ninja_peasant';
// --- Samurai ---
import samurai from './fighters/samurai';
import { samurai_archer } from './fighters/samurai_archer';
import { samurai_commander } from './fighters/samurai_commander';
// --- Skeletons ---
import { skeleton_warrior } from './fighters/skeleton_warrior';
import { skeleton_spearman } from './fighters/skeleton_spearman';
import { skeleton_archer } from './fighters/skeleton_archer';
// --- Werewolves ---
import black_werewolf from './fighters/black_werewolf';
import { red_werewolf } from './fighters/red_werewolf';
import { white_werewolf } from './fighters/white_werewolf';
// --- Wizards ---
import { fire_wizard } from './fighters/fire_wizard';
import { lightning_mage } from './fighters/lightning_mage';
import { wanderer_magican } from './fighters/wanderer_magican';

export const ROSTER: Record<string, FighterData> = {
  gorgon_1,
  gorgon_2,
  gorgon_3,
  minotaur_1,
  minotaur_2,
  minotaur_3,
  kunoichi,
  ninja_monk,
  ninja_peasant,
  samurai,
  samurai_archer,
  samurai_commander,
  skeleton_warrior,
  skeleton_spearman,
  skeleton_archer,
  black_werewolf,
  red_werewolf,
  white_werewolf,
  fire_wizard,
  lightning_mage,
  wanderer_magican,
};

/**
 * All 21 fighter ids grouped by family for a sensible character-select grid.
 * Order: gorgons → minotaurs → ninjas → samurai → skeletons → werewolves → wizards
 */
export const ALL_IDS: string[] = [
  // Gorgons (3)
  'gorgon_1',
  'gorgon_2',
  'gorgon_3',
  // Minotaurs (3)
  'minotaur_1',
  'minotaur_2',
  'minotaur_3',
  // Ninjas (3)
  'kunoichi',
  'ninja_monk',
  'ninja_peasant',
  // Samurai (3)
  'samurai',
  'samurai_archer',
  'samurai_commander',
  // Skeletons (3)
  'skeleton_warrior',
  'skeleton_spearman',
  'skeleton_archer',
  // Werewolves (3)
  'black_werewolf',
  'red_werewolf',
  'white_werewolf',
  // Wizards (3)
  'fire_wizard',
  'lightning_mage',
  'wanderer_magican',
];

export const FEATURED_IDS: string[] = [
  'skeleton_warrior',
  'fire_wizard',
  'minotaur_1',
  'kunoichi',
  'samurai',
  'gorgon_1',
  'black_werewolf',
];

/**
 * Arcade ladder: 7 escalating fights, boss minotaur_3 last.
 * Roughly: easy starters → mid-tier threats → heavy hitters → boss.
 */
export const ARCADE_LADDER: string[] = [
  'skeleton_warrior',   // 1 — balanced starter
  'ninja_peasant',      // 2 — light rushdown
  'red_werewolf',       // 3 — aggressive mid
  'samurai_archer',     // 4 — zoner pressure
  'gorgon_2',           // 5 — escalating threat
  'wanderer_magican',   // 6 — tricky mage
  'minotaur_3',         // 7 — final boss
];

export const DEFAULT_P1 = 'skeleton_warrior';
export const DEFAULT_P2 = 'fire_wizard';

export function getFighter(id: string): FighterData {
  const fighter = ROSTER[id];
  if (fighter) return fighter;
  const fallback = ROSTER[ALL_IDS[0]];
  console.warn(`[roster] Unknown fighter id "${id}" — falling back to "${ALL_IDS[0]}"`);
  return fallback;
}

// Dev-only self-check: validates registry integrity at module load time.
// Runs in all environments (lightweight — 21 iterations) to catch regressions early.
if (ALL_IDS.length !== 21) {
  throw new Error(`[roster] ALL_IDS must have 21 entries, got ${ALL_IDS.length}`);
}
for (const id of ALL_IDS) {
  if (!ROSTER[id]) {
    throw new Error(`[roster] id "${id}" is listed in ALL_IDS but missing from ROSTER`);
  }
}
