/**
 * stageConfig.ts
 *
 * Static metadata for every battleground stage used in Fantasy Fight.
 *
 * Parallax multiplier mapping (by layer `index`, furthest → nearest):
 *   index 0 → 0.05   (sky / most distant)
 *   index 1 → 0.10
 *   index 2 → 0.15
 *   index 3 → 0.20
 *   index 4 → 0.30
 *   index 5 → 0.45
 *   index 6 → 0.70
 *   index 7 → 1.00   (ground / nearest foreground)
 *   index ≥8 → 1.00  (any extra foreground layers also track at 1:1)
 *
 * Stages with fewer than 8 layers use the tail of the table so the nearest
 * layer is always 1.0 and the furthest is always the smallest value.
 *
 * groundY, leftBound, rightBound are expressed in the 1280×720 world space.
 * worldWidth ≥ 2560 gives the camera room to pan across the fight area.
 * Background images are 1920 px wide; TileSprite tiles them to worldWidth.
 */

export interface StageDef {
  /** Matches the `stage` field in the manifest (e.g. "Battleground1") */
  id: string;
  displayName: string;
  /** Y coordinate of the floor line (world space, 1280×720 viewport) */
  groundY: number;
  /** Total scrollable width in world pixels */
  worldWidth: number;
  /**
   * Parallax scroll multiplier keyed by layer index (furthest = 0).
   * Layers not present in this map fall back to 1.0.
   */
  parallaxByIndex: Record<number, number>;
}

/** Base table: 8 depth levels from furthest (0) to nearest (7). */
const BASE_PARALLAX: Record<number, number> = {
  0: 0.05,
  1: 0.10,
  2: 0.15,
  3: 0.20,
  4: 0.30,
  5: 0.45,
  6: 0.70,
  7: 1.00,
};

/**
 * Build a parallax map for a stage that has `layerCount` layers.
 * The nearest layer always gets 1.0; layers are mapped to the tail of
 * BASE_PARALLAX so the distribution is always furthest→nearest.
 */
function buildParallaxMap(layerCount: number): Record<number, number> {
  const tableSize = Object.keys(BASE_PARALLAX).length; // 8
  const map: Record<number, number> = {};
  for (let i = 0; i < layerCount; i++) {
    // Offset into the base table so the last layer always hits index 7 (1.0)
    const tableIdx = tableSize - layerCount + i;
    map[i] = BASE_PARALLAX[Math.max(0, tableIdx)] ?? 1.0;
  }
  return map;
}

// All four stages use 7–9 layers; generate maps for common counts.
const PARALLAX_7 = buildParallaxMap(7);
const PARALLAX_8 = buildParallaxMap(8);
const PARALLAX_9 = buildParallaxMap(9);

export const STAGES: Record<string, StageDef> = {
  Battleground1: {
    id: 'Battleground1',
    displayName: 'Ruined Shrine',
    groundY: 600,
    worldWidth: 3840,
    parallaxByIndex: PARALLAX_8,
  },
  Battleground2: {
    id: 'Battleground2',
    displayName: "Dragon's Throne",
    groundY: 600,
    worldWidth: 3840,
    parallaxByIndex: PARALLAX_9,
  },
  Battleground3: {
    id: 'Battleground3',
    displayName: 'Jungle Depths',
    groundY: 608,
    worldWidth: 3840,
    parallaxByIndex: PARALLAX_8,
  },
  Battleground4: {
    id: 'Battleground4',
    displayName: 'Graveyard',
    groundY: 595,
    worldWidth: 3840,
    parallaxByIndex: PARALLAX_7,
  },
};

export const STAGE_IDS = Object.keys(STAGES) as (keyof typeof STAGES)[];

/** Stage + variant shown in the main menu backdrop. */
export const MENU_STAGE = { stageId: 'Battleground1', variant: 'Bright' } as const;

/**
 * Return the parallax multiplier for a given stage and layer index.
 * Falls back to 1.0 for unknown indices.
 */
export function getParallaxFactor(stageDef: StageDef, layerIndex: number): number {
  return stageDef.parallaxByIndex[layerIndex] ?? 1.0;
}
