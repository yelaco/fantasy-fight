export interface AIParams {
  /** Frames to wait before re-evaluating the decision (higher = slower reaction). */
  reactionFrames: number;
  /** 0..1 — how often the AI approaches and attacks. */
  aggression: number;
  /** Probability of blocking when opponent is attacking in range. */
  blockChance: number;
  /** Probability of anti-airing an incoming jump-in. */
  antiAirChance: number;
  /** Probability of using a special/super when meter is available. */
  specialChance: number;
  /** Probability of punishing opponent whiffs. */
  whiffPunishChance: number;
  /** Probability of following up with a second hit after landing one. */
  comboFollowupChance: number;
  /** Preferred fighting distance in pixels. */
  spacingPreference: number;
  /** Probability of doing nothing / wrong action (simulates human error). */
  mistakeChance: number;
}

export const AI_TIERS: Record<'easy' | 'medium' | 'hard', AIParams> = {
  easy: {
    reactionFrames:     18,
    aggression:         0.25,
    blockChance:        0.15,
    antiAirChance:      0.10,
    specialChance:      0.05,
    whiffPunishChance:  0.05,
    comboFollowupChance: 0.15,
    spacingPreference:  180,
    mistakeChance:      0.40,
  },
  medium: {
    reactionFrames:     10,
    aggression:         0.55,
    blockChance:        0.50,
    antiAirChance:      0.45,
    specialChance:      0.30,
    whiffPunishChance:  0.35,
    comboFollowupChance: 0.50,
    spacingPreference:  140,
    mistakeChance:      0.15,
  },
  hard: {
    reactionFrames:     4,
    aggression:         0.80,
    blockChance:        0.90,
    antiAirChance:      0.85,
    specialChance:      0.65,
    whiffPunishChance:  0.80,
    comboFollowupChance: 0.85,
    spacingPreference:  110,
    mistakeChance:      0.02,
  },
};
