/**
 * ArcadeManager — owns arcade-ladder progression logic.
 *
 * CONTRACT
 * --------
 * CharacterSelect  → beginArcade(playerId, difficulty)
 *                    then navigates to FightScene
 * FightScene       → on P1 match win: advance()
 *                      { done:false }  → setupCurrentFight() then restart FightScene
 *                      { done:true, cleared:true } → navigate to VictoryScene
 * VictoryScene     → if gameState.arcadeCleared: display playerEnding()
 *
 * setupCurrentFight() can also be called at the start of each FightScene to
 * ensure gameState.config is correct for the current arcadeIndex (idempotent).
 */

import { ARCADE_LADDER } from '../../data/roster';
import { getEnding, type Ending } from '../../data/endings';
import { gameState } from '../state/GameState';
import type { Difficulty, StageVariant } from '../state/MatchConfig';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ARCADE_LADDER_LENGTH: number = ARCADE_LADDER.length; // 7

/** Stages cycled across the 7 fights. */
const STAGE_ROTATION: string[] = [
  'Battleground1', // fight 0
  'Battleground2', // fight 1
  'Battleground3', // fight 2
  'Battleground4', // fight 3
  'Battleground1', // fight 4
  'Battleground2', // fight 5
  'Battleground4', // fight 6 — boss
];

const STAGE_VARIANTS: StageVariant[] = ['Bright', 'Bright', 'Pale', 'Bright', 'Pale', 'Bright', 'Pale'];

const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escalate difficulty across the ladder.
 *   index 0-2  → one step below base (floor: easy)
 *   index 3-4  → base difficulty
 *   index 5    → one step above base (ceil: hard)
 *   index 6    → hard (boss is always hard)
 */
export function difficultyForFight(baseDifficulty: Difficulty, index: number): Difficulty {
  if (index >= ARCADE_LADDER_LENGTH - 1) return 'hard'; // boss

  const baseIdx = DIFFICULTY_ORDER.indexOf(baseDifficulty);
  let adjusted: number;
  if (index <= 2) {
    adjusted = Math.max(0, baseIdx - 1);
  } else if (index <= 4) {
    adjusted = baseIdx;
  } else {
    adjusted = Math.min(DIFFICULTY_ORDER.length - 1, baseIdx + 1);
  }
  return DIFFICULTY_ORDER[adjusted];
}

/** Stage id for the given ladder index (wraps safely if index is out of range). */
export function stageForFight(index: number): string {
  return STAGE_ROTATION[index % STAGE_ROTATION.length] ?? 'Battleground1';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Current opponent id at the active ladder position. */
export function currentOpponentId(): string {
  return ARCADE_LADDER[gameState.arcadeIndex] ?? ARCADE_LADDER[ARCADE_LADDER_LENGTH - 1];
}

/**
 * Patch gameState.config for the fight at the current arcadeIndex.
 * Called before (re-)starting FightScene.
 */
export function setupCurrentFight(): void {
  const index = gameState.arcadeIndex;
  gameState.patch({
    mode: 'arcade',
    p1Id: gameState.arcadeFighterId,
    p2Id: currentOpponentId(),
    stageId: stageForFight(index),
    stageVariant: STAGE_VARIANTS[index % STAGE_VARIANTS.length] ?? 'Bright',
    difficulty: difficultyForFight(gameState.arcadeDifficulty, index),
    roundsToWin: 2,
  });
}

/**
 * Initialise a new arcade run.
 * Sets ladder state on gameState and configures the first fight.
 */
export function beginArcade(playerFighterId: string, difficulty: Difficulty): void {
  gameState.startArcade(playerFighterId, difficulty);
  setupCurrentFight();
}

/**
 * Advance the ladder after P1 wins a match.
 * Returns { done, cleared } so the caller can decide routing:
 *   done=false  → call setupCurrentFight() then start next FightScene
 *   done=true   → navigate to VictoryScene (arcadeCleared is set)
 */
export function advance(): { done: boolean; cleared: boolean } {
  gameState.advanceArcade();

  if (gameState.isArcadeComplete(ARCADE_LADDER_LENGTH)) {
    gameState.arcadeCleared = true;
    return { done: true, cleared: true };
  }

  setupCurrentFight();
  return { done: false, cleared: false };
}

/** Ending for the player's chosen fighter. Safe — never throws. */
export function playerEnding(): Ending {
  return getEnding(gameState.arcadeFighterId);
}
