/**
 * TUNING — central balance constants for Fantasy Fight.
 * T28 edits VALUES here only; Combat.ts reads these at runtime.
 */

export const TUNING = {
  // -------------------------------------------------------------------------
  // Hitstop: frames both fighters freeze on impact, per move tier
  // -------------------------------------------------------------------------
  hitstop: {
    light:   4,  // frames — snappy confirm, just enough to feel the hit
    heavy:   8,  // +2: extra weight, satisfying crunch on heavy normals
    special: 11, // +3: cinematic freeze — sells the "super move" moment
  },

  // -------------------------------------------------------------------------
  // Combo damage scaling — index = (comboHits - 1), clamped at last entry
  // e.g. hit 1 = 1.0, hit 2 = 0.9, hit 3 = 0.8, hit 4+ = 0.7
  // -------------------------------------------------------------------------
  comboDamageScale: [1.0, 0.9, 0.80, 0.70, 0.62] as readonly number[], // taper steeper after hit 4 to punish infinite attempts
  /** Minimum damage scalar — applied when combo count exceeds scale table */
  comboDamageScaleFloor: 0.55, // floor lowered: long combos impressive but not KO-threatening

  // -------------------------------------------------------------------------
  // Combo hitstun scaling — slight decay per hit so combos feel tighter
  // applied as: hitstun * (hitstunScaleBase ^ comboIndex)
  // -------------------------------------------------------------------------
  comboHitstunScaleBase: 0.93, // 7% decay per hit — combos become escapable around hit 6-7, preventing true infinites

  // -------------------------------------------------------------------------
  // Chip damage — fraction of raw damage applied through block
  // Specials deal chip; normals deal 0 (set normalChipFraction to 0 to disable)
  // -------------------------------------------------------------------------
  chipDamageFraction: {
    normal:  0.0,   // normals: no chip — blocking normals is free (rewards defense)
    special: 0.03,  // specials: 3% chip — blocking is strong but specials still threaten; 15% was too punishing
  },

  // -------------------------------------------------------------------------
  // Pushback / knockback
  // -------------------------------------------------------------------------
  pushback: {
    /** Defender pushback velocity (px/s) on block */
    onBlock:        120, // +40: creates clear spacing after blocked strings, prevents corner lockdown
    /** Attacker pushback (px/s) during blockstun */
    attackerOnBlock: 60, // +20: mutual separation — both fighters reset to neutral footsies
  },

  knockback: {
    /** Base launch velocity scalar applied to move.knockback */
    baseScale: 1.0,
    /**
     * Weight dampening: heavier fighters travel less.
     * finalKnockback = move.knockback * baseScale / (weight * weightFactor)
     * weightFactor = 0 disables weight influence.
     */
    weightFactor: 0.004,
  },

  // -------------------------------------------------------------------------
  // Screen shake magnitudes per hit tier (pixels of camera offset)
  // -------------------------------------------------------------------------
  screenShake: {
    light:   2,  // -1: subtle — confirms the hit without disrupting read
    heavy:   6,  // -1: punchy but not jarring across a full round
    special: 10, // -2: big impact moment; was 12 which felt nauseating on repeated specials
  },

  // -------------------------------------------------------------------------
  // Meter gain
  // -------------------------------------------------------------------------
  meter: {
    /** Attacker gains this on landing a hit (added on top of FighterData.stats.meterGainOnHit) */
    onHit:    12, // +4: ~8-9 landed hits fills a super — aggressive play rewarded but not spammable
    /** Defender gains this on blocking a hit */
    onBlock:  4,  // unchanged — blocking builds meter slowly, incentivises patience
    /** Defender gains this on taking a hit (Fighter.applyHit uses FighterData.stats.meterGainOnTake) */
    onTake:   10, // +4: being hit builds meter faster — comeback mechanic, keeps losing player dangerous
    /** Maximum super meter value */
    max:     100,
  },

  // -------------------------------------------------------------------------
  // Low-health threshold — triggers heartbeat SFX / HUD flash
  // -------------------------------------------------------------------------
  lowHealthThreshold: 0.20, // fraction of maxHp

  // -------------------------------------------------------------------------
  // Round / match settings
  // -------------------------------------------------------------------------
  round: {
    timerSeconds:  99,
    roundsToWin:    2,  // best-of-3 → first to 2 round wins

    /** Frames between "FIGHT!" and input being accepted (intro freeze) */
    introFreezeFrames: 72,  // 1.2s — snappier than 1.5s; players read the screen and are ready to engage
    /** Frames the KO screen is held before next-round reset */
    koHoldFrames:     150,  // 2.5s — enough to savour the KO beat without dragging
    /** Frames between a round end and the next round intro */
    roundResetFrames: 150,  // +30: cinematic pause between rounds; gives the moment room to breathe
  },

  // -------------------------------------------------------------------------
  // Proximity guard window (future parry / proximity block)
  // Kept here so T28 can tune without touching logic files.
  // -------------------------------------------------------------------------
  proximity: {
    /** Pixel distance within which a defender auto-guards (set high to disable) */
    guardDistance: 0,   // 0 = disabled for v1
    /** Parry window in frames (0 = no parry in v1) */
    parryWindowFrames: 0,
  },
} as const;

/** Convenience: derive damage scalar for a given combo hit count (1-indexed). */
export function comboDamageScalar(hitCount: number): number {
  const idx = Math.max(0, hitCount - 1);
  return TUNING.comboDamageScale[idx] ?? TUNING.comboDamageScaleFloor;
}

/** Convenience: derive hitstun scalar for a given combo hit count (1-indexed). */
export function comboHitstunScalar(hitCount: number): number {
  const idx = Math.max(0, hitCount - 1);
  return Math.pow(TUNING.comboHitstunScaleBase, idx);
}
