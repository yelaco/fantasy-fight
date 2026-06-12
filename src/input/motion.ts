/**
 * Numpad notation (relative to facing direction):
 *   7 8 9
 *   4 5 6
 *   1 2 3
 *
 * 5 = neutral, 6 = forward, 4 = back, 8 = up, 2 = down
 * Diagonals: 1=db, 3=df, 7=ub, 9=uf
 *
 * "facing" is +1 (right) or -1 (left).
 * When facing left, raw-left is forward (6) and raw-right is back (4).
 */

export type MotionName = 'qcf' | 'qcb' | 'dp' | 'charge_back_fwd' | 'charge_down_up';
export type Facing = 1 | -1;

interface DirState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/** Frames required holding back/down for a charge motion. */
const CHARGE_HOLD_FRAMES = 40;

/** Rolling history size (frames). Must cover the longest window needed. */
const HISTORY_SIZE = 16;

/** Sequence windows for each named motion (in numpad notation, relative to facing). */
const MOTION_SEQUENCES: Record<'qcf' | 'qcb' | 'dp', number[][]> = {
  qcf: [[2, 3], [2], [3, 6]],          // 236  (down → df → fwd)
  qcb: [[2, 1], [2], [1, 4]],          // 214  (down → db → back)
  dp:  [[6], [2], [2, 3], [3, 6]],     // 623  (fwd → down → df)
};

function toNumpad(dir: DirState, facing: Facing): number {
  // Resolve forward/back relative to facing direction
  const fwd  = facing === 1 ? dir.right : dir.left;
  const back = facing === 1 ? dir.left  : dir.right;
  const up   = dir.up;
  const dn   = dir.down;

  if (dn && fwd)  return 3;
  if (dn && back) return 1;
  if (up && fwd)  return 9;
  if (up && back) return 7;
  if (dn)         return 2;
  if (up)         return 8;
  if (fwd)        return 6;
  if (back)       return 4;
  return 5;
}

interface FrameEntry {
  numpad: number;
  dir: DirState;
}

export class MotionBuffer {
  private history: FrameEntry[] = [];
  /** Tracks how many consecutive frames each charge direction has been held. */
  private chargeBackFrames  = 0;
  private chargeDownFrames  = 0;
  /** Flags set to true when a motion was matched and not yet consumed. */
  private pending: Set<MotionName> = new Set();

  push(dir: DirState, facing: Facing): void {
    const numpad = toNumpad(dir, facing);
    this.history.push({ numpad, dir });
    if (this.history.length > HISTORY_SIZE) {
      this.history.shift();
    }

    // Track charge accumulation
    const back = facing === 1 ? dir.left : dir.right;
    this.chargeBackFrames  = back    ? this.chargeBackFrames  + 1 : 0;
    this.chargeDownFrames  = dir.down ? this.chargeDownFrames + 1 : 0;
  }

  /**
   * Returns true if the named motion is currently present in the history buffer.
   * Does NOT consume — pair with consume() to avoid re-triggering.
   */
  matches(motion: MotionName): boolean {
    if (motion === 'charge_back_fwd') return this.checkChargeFwd();
    if (motion === 'charge_down_up')  return this.checkChargeUp();
    return this.checkSequence(MOTION_SEQUENCES[motion]);
  }

  /**
   * Returns true once if the motion is present, then clears it so it won't
   * re-trigger until the sequence is performed again.
   */
  consume(motion: MotionName): boolean {
    if (this.pending.has(motion)) {
      this.pending.delete(motion);
      return true;
    }
    if (this.matches(motion)) {
      // matched fresh — mark as fired
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------

  private checkSequence(steps: number[][]): boolean {
    // Walk forward through history looking for steps in order.
    // Each step is a set of acceptable numpad values for that position.
    if (this.history.length < steps.length) return false;

    let stepIdx = 0;
    for (const entry of this.history) {
      if (steps[stepIdx].includes(entry.numpad)) {
        stepIdx++;
        if (stepIdx === steps.length) return true;
      }
    }
    return false;
  }

  private checkChargeFwd(): boolean {
    if (this.chargeBackFrames < CHARGE_HOLD_FRAMES) return false;
    // The most recent frame must be forward (6) or a forward diagonal (3,9)
    const last = this.history[this.history.length - 1];
    if (!last) return false;
    return [6, 3, 9].includes(last.numpad);
  }

  private checkChargeUp(): boolean {
    if (this.chargeDownFrames < CHARGE_HOLD_FRAMES) return false;
    const last = this.history[this.history.length - 1];
    if (!last) return false;
    return [8, 7, 9].includes(last.numpad);
  }
}
