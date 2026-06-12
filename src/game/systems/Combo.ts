/**
 * Combo / Cancel System  (T9)
 *
 * Cancel rules (canCancel):
 *   light normal  → any button listed in cancelableInto[], or 'special'
 *   heavy normal  → only 'special' (or any button if cancelableInto is an array containing it)
 *   special       → never cancellable (caller passes intoSpecial=false)
 *
 * Combo timer:
 *   Grace window = 45 frames (~750 ms at 60 fps).
 *   The timer counts UP each update tick (dt in seconds × 60 = frames elapsed).
 *   If the defender is no longer in hitstun AND the timer exceeds COMBO_GRACE_FRAMES,
 *   the combo for that attacker is reset automatically.
 *
 * Damage scaling (index-clamped):
 *   hit 0 (first)  → 1.0×
 *   hit 1          → 0.9×
 *   hit 2          → 0.8×
 *   hit 3+         → 0.7×  (floor, last value repeated)
 */

import { MoveData, AttackButton } from '../../types';

// ---------------------------------------------------------------------------
// Tuning – prefer ./tuning if it ships; fall back to inline constants.
// ---------------------------------------------------------------------------
let TUNING: { comboDamageScaling: number[]; comboHitstunScaling: number[] } | undefined;

try {
  // Dynamic import is not tree-shakeable in tsc --noEmit context; use a
  // synchronous conditional require pattern via a type-safe wrapper so the
  // compiler is happy regardless of whether the file exists.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  TUNING = (require('./tuning') as { TUNING: typeof TUNING }).TUNING;
} catch {
  // tuning.ts not yet present – use fallback below.
}

const COMBO_DAMAGE_SCALING: readonly number[] =
  TUNING?.comboDamageScaling ?? [1.0, 0.9, 0.8, 0.7];

const COMBO_HITSTUN_SCALING: readonly number[] =
  TUNING?.comboHitstunScaling ?? [1.0, 0.95, 0.9, 0.85];

const COMBO_GRACE_FRAMES = 45; // frames before an unextended combo drops

// ---------------------------------------------------------------------------
// Internal per-fighter state
// ---------------------------------------------------------------------------
interface ComboState {
  count: number;       // number of hits landed this combo
  damage: number;      // cumulative raw (pre-scaled) damage
  timer: number;       // frames elapsed since last hit
  active: boolean;     // whether we are currently in a combo
}

function makeState(): ComboState {
  return { count: 0, damage: 0, timer: 0, active: false };
}

// ---------------------------------------------------------------------------
// ComboSystem
// ---------------------------------------------------------------------------
export class ComboSystem {
  /** Current combo state for fighter 0 and fighter 1 (as attackers). */
  private readonly states: [ComboState, ComboState] = [makeState(), makeState()];

  /** Best combo (hit count) recorded this match, keyed by attacker index. */
  private readonly bestCombo: [number, number] = [0, 0];

  /**
   * Called whenever a combo updates (new hit or reset).
   * Subscribers (e.g. HUD) are notified within the same frame the change occurs.
   * Signature: (attackerIndex: 0|1, count: number) => void
   */
  onComboUpdate: ((attackerIndex: 0 | 1, count: number) => void) | null = null;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Register a successful hit by `attackerIndex`.
   * Returns the damage-scaling multiplier that should be applied to this hit.
   */
  registerHit(attackerIndex: 0 | 1): number {
    const s = this.states[attackerIndex];

    if (!s.active) {
      s.active = true;
    }

    const scale = this._scalingAt(s.count);
    s.count += 1;
    s.timer = 0; // reset grace window

    if (s.count > this.bestCombo[attackerIndex]) {
      this.bestCombo[attackerIndex] = s.count;
    }

    this._emit(attackerIndex, s.count);
    return scale;
  }

  /**
   * Returns `baseDamage` after applying the current combo scaling for `attackerIndex`.
   * Does NOT advance the hit count – call `registerHit` first.
   */
  scaledDamage(attackerIndex: 0 | 1, baseDamage: number): number {
    const s = this.states[attackerIndex];
    // scale index is count-1 because registerHit already incremented count
    const idx = Math.max(0, s.count - 1);
    return baseDamage * this._scalingAt(idx);
  }

  /**
   * Returns the damage-scaling multiplier for hitstun on the current hit.
   * Useful for callers that also want to scale hitstun duration.
   */
  hitstunScale(attackerIndex: 0 | 1): number {
    const s = this.states[attackerIndex];
    const idx = Math.max(0, s.count - 1);
    return this._hitstunScalingAt(idx);
  }

  /** Current combo hit count for `attackerIndex`. */
  getCount(attackerIndex: 0 | 1): number {
    return this.states[attackerIndex].count;
  }

  /** Largest combo recorded this match for `attackerIndex`. */
  getBestCombo(attackerIndex: 0 | 1): number {
    return this.bestCombo[attackerIndex];
  }

  /**
   * Explicitly reset the combo for `attackerIndex` (e.g. on knockdown).
   * Emits onComboUpdate(index, 0).
   */
  reset(attackerIndex: 0 | 1): void {
    const s = this.states[attackerIndex];
    if (s.active || s.count > 0) {
      s.count = 0;
      s.damage = 0;
      s.timer = 0;
      s.active = false;
      this._emit(attackerIndex, 0);
    }
  }

  /**
   * Tick the combo system each game frame.
   *
   * @param dt               - delta time in seconds
   * @param fightersInHitstun - [p0InHitstun, p1InHitstun]
   *   p0InHitstun means fighter-0 is the DEFENDER (hit by fighter-1).
   *   p1InHitstun means fighter-1 is the DEFENDER (hit by fighter-0).
   */
  update(dt: number, fightersInHitstun: [boolean, boolean]): void {
    const framesElapsed = dt * 60;

    // Attacker 0 hits defender 1 → defender is fightersInHitstun[1]
    // Attacker 1 hits defender 0 → defender is fightersInHitstun[0]
    const defenderInHitstun: [boolean, boolean] = [
      fightersInHitstun[1], // defender for attacker 0
      fightersInHitstun[0], // defender for attacker 1
    ];

    for (const idx of [0, 1] as const) {
      const s = this.states[idx];
      if (!s.active) continue;

      s.timer += framesElapsed;

      // Drop combo if defender has recovered and grace window expired
      if (!defenderInHitstun[idx] && s.timer > COMBO_GRACE_FRAMES) {
        this.reset(idx);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Cancel logic
  // -------------------------------------------------------------------------

  /**
   * Determine whether a fighter may cancel `fromMove` into `toButton`.
   *
   * Rules:
   *  • If fromMove.cancelableInto is 'special' → only special cancels allowed.
   *  • If fromMove.cancelableInto is an AttackButton[] → cancelling into any
   *    listed button is allowed; specials are also allowed when intoSpecial=true
   *    AND the array contains the button being pressed (or you call with intoSpecial=true
   *    directly, which covers motion-input specials regardless of button).
   *  • If fromMove.cancelableInto is undefined → no cancels allowed.
   *
   * @param fromMove    - the currently active move
   * @param toButton    - the button the player just pressed
   * @param intoSpecial - true when the input resolves as a special/super move
   */
  canCancel(fromMove: MoveData, toButton: AttackButton, intoSpecial: boolean): boolean {
    const ci = fromMove.cancelableInto;

    if (ci === undefined) return false;

    if (ci === 'special') {
      // Only special-move cancels are permitted
      return intoSpecial;
    }

    // ci is AttackButton[]
    if (intoSpecial) {
      // Motion-input specials can always cancel when cancelableInto is defined as a list
      return true;
    }

    return ci.includes(toButton);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _scalingAt(hitIndex: number): number {
    const arr = COMBO_DAMAGE_SCALING;
    return arr[Math.min(hitIndex, arr.length - 1)];
  }

  private _hitstunScalingAt(hitIndex: number): number {
    const arr = COMBO_HITSTUN_SCALING;
    return arr[Math.min(hitIndex, arr.length - 1)];
  }

  private _emit(attackerIndex: 0 | 1, count: number): void {
    this.onComboUpdate?.(attackerIndex, count);
  }
}
