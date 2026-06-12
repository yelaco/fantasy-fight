import type { FighterData, AnimSpec, FighterStats, FighterFlags, MoveData, SpecialMoveData } from '../../types';

/**
 * Remaps an animation map from a base fighter's keys/states to a new fighter id and state set.
 * For each logical key (e.g. 'idle', 'walk', 'attack_lp', ...) we build:
 *   key: `${newId}__${logicalKey}`
 *   state: as provided in stateMap
 */
export function remapAnims(
  newId: string,
  entries: Array<{
    logicalKey: string;
    state: string;
    frameRate: number;
    repeat: number;
    flipX?: boolean;
  }>,
): Record<string, AnimSpec> {
  const result: Record<string, AnimSpec> = {};
  for (const e of entries) {
    const key = `${newId}__${e.logicalKey}`;
    result[key] = {
      key,
      state: e.state,
      frameRate: e.frameRate,
      repeat: e.repeat,
      ...(e.flipX !== undefined ? { flipX: e.flipX } : {}),
    };
  }
  return result;
}

export interface VariantOverrides {
  id: string;
  family: string;
  displayName: string;
  lore: string;
  winQuotes: string[];
  flags: FighterFlags;
  stats: FighterStats;
  animations: Record<string, AnimSpec>;
  /** Provide to fully replace normals (with remapped animStates) */
  normals?: MoveData[];
  /** Provide to fully replace specials */
  specials?: SpecialMoveData[];
  archetype?: FighterData['archetype'];
  portraitState?: string;
}

/**
 * Clone a base FighterData and apply variant overrides.
 * Move frame-data (normals/specials) is inherited from base unless explicitly overridden.
 * Deep-copies arrays to avoid shared mutation.
 */
export function makeVariant(base: FighterData, overrides: VariantOverrides): FighterData {
  const normals: MoveData[] = (overrides.normals ?? base.normals).map((n) => ({ ...n }));
  const specials: SpecialMoveData[] = (overrides.specials ?? base.specials).map((s) => ({
    ...s,
    ...(s.projectile ? { projectile: { ...s.projectile } } : {}),
    ...(s.hitbox ? { hitbox: { ...s.hitbox } } : {}),
  }));

  return {
    id: overrides.id,
    family: overrides.family,
    displayName: overrides.displayName,
    archetype: overrides.archetype ?? base.archetype,
    lore: overrides.lore,
    stats: { ...overrides.stats },
    flags: { ...overrides.flags },
    animations: { ...overrides.animations },
    normals,
    specials,
    winQuotes: [...overrides.winQuotes],
    portraitState: overrides.portraitState ?? base.portraitState,
  };
}
