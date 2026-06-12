import type { IInputSource } from '../../input';
import type { GameAction } from '../../input';
import type { Difficulty } from '../state/MatchConfig';
import type { Fighter } from '../entities/Fighter';
import { AI_TIERS, type AIParams } from './tiers';

// ---------------------------------------------------------------------------
// Archetype tag influences style but is entirely optional
// ---------------------------------------------------------------------------

export type AIArchetype = 'rushdown' | 'zoner' | 'balanced';

// ---------------------------------------------------------------------------
// Virtual button state
// ---------------------------------------------------------------------------

type VirtualState = Record<GameAction, boolean>;

function emptyState(): VirtualState {
  return {
    left:  false,
    right: false,
    up:    false,
    down:  false,
    lp:    false,
    hp:    false,
    lk:    false,
    hk:    false,
    pause: false,
  };
}

// ---------------------------------------------------------------------------
// Special-motion emitter
//
// A QCF (quarter-circle forward) is: down → down+forward → forward + button
// We emit each "step" as a justPressed over consecutive decide() calls.
// The Fighter's MotionBuffer sees the same directional sequence a human
// would produce, so the existing recognition path fires the special.
// ---------------------------------------------------------------------------

interface MotionStep {
  held: Partial<VirtualState>;
  justPressed: Partial<VirtualState>;
}

// QCF + button: 3-step sequence
function qcfMotion(button: 'lp' | 'hp' | 'lk' | 'hk', facingRight: boolean): MotionStep[] {
  const fwd  = facingRight ? 'right' : 'left';
  return [
    // Step 1: down
    { held: { down: true },                           justPressed: { down: true } },
    // Step 2: down + forward
    { held: { down: true, [fwd]: true },              justPressed: { [fwd]: true } },
    // Step 3: forward + button
    { held: { [fwd]: true },                          justPressed: { [fwd]: true, [button]: true } },
  ];
}

// ---------------------------------------------------------------------------
// AIController
// ---------------------------------------------------------------------------

export class AIController implements IInputSource {
  private readonly params: AIParams;
  private readonly archetype: AIArchetype;

  // Frame counters
  private framesSinceDecide = 0;

  // The most recently decided virtual input state
  private curr: VirtualState = emptyState();
  private prev: VirtualState = emptyState();

  // Pending motion sequence being emitted (specials)
  private motionQueue: MotionStep[] = [];
  private motionStep = 0;

  // Suppresses new decisions while motion is playing
  private get playingMotion(): boolean {
    return this.motionStep < this.motionQueue.length;
  }

  constructor(
    private readonly self: Fighter,
    private readonly opponent: Fighter,
    difficulty: Difficulty,
    archetype?: AIArchetype,
  ) {
    this.params   = AI_TIERS[difficulty];
    this.archetype = archetype ?? 'balanced';
  }

  // ---------------------------------------------------------------------------
  // IInputSource implementation
  // ---------------------------------------------------------------------------

  held(action: GameAction): boolean {
    return this.curr[action];
  }

  justPressed(action: GameAction): boolean {
    return this.curr[action] && !this.prev[action];
  }

  justReleased(action: GameAction): boolean {
    return !this.curr[action] && this.prev[action];
  }

  // ---------------------------------------------------------------------------
  // Public update — call once per game frame before Fighter.update()
  // ---------------------------------------------------------------------------

  update(_dt: number): void {
    // Snapshot previous state for justPressed / justReleased
    this.prev = { ...this.curr };

    // Advance motion sequence if one is active
    if (this.playingMotion) {
      this.applyMotionStep();
      return;
    }

    // Gate decisions behind reactionFrames
    this.framesSinceDecide++;
    if (this.framesSinceDecide >= this.params.reactionFrames) {
      this.framesSinceDecide = 0;
      this.decide();
    }
  }

  // ---------------------------------------------------------------------------
  // Decision logic
  // ---------------------------------------------------------------------------

  private decide(): void {
    const next = emptyState();

    // Random mistake: do nothing
    if (Math.random() < this.params.mistakeChance) {
      this.curr = next;
      return;
    }

    const dist    = Math.abs(this.self.x - this.opponent.x);
    const facingRight = this.self.facing === 1;
    const inAttackRange = dist < 140;
    const inCloseRange  = dist < 80;
    const oppIsAirborne = this.opponent.isAirborne;
    const oppIsAttacking = this.opponent.isAttacking;
    const selfCanAct    = !this.self.isAttacking && !this.self.isBlocking && this.self.onGround;

    // ----- Anti-air -----
    if (
      selfCanAct &&
      oppIsAirborne &&
      inAttackRange &&
      Math.random() < this.params.antiAirChance
    ) {
      // Heavy punch upward — use HP as the anti-air button
      next.hp = true;
      this.curr = next;
      return;
    }

    // ----- Block incoming attack -----
    if (
      oppIsAttacking &&
      inAttackRange &&
      !this.self.isAttacking &&
      Math.random() < this.params.blockChance
    ) {
      // Hold away from opponent = block direction
      if (facingRight) {
        next.left = true;
      } else {
        next.right = true;
      }
      this.curr = next;
      return;
    }

    // ----- Whiff punish -----
    if (
      selfCanAct &&
      oppIsAttacking &&
      inAttackRange &&
      Math.random() < this.params.whiffPunishChance
    ) {
      next.hp = true;
      this.curr = next;
      return;
    }

    // ----- Special / super -----
    if (
      selfCanAct &&
      inAttackRange &&
      Math.random() < this.params.specialChance
    ) {
      const hasMeter = this.self.meter >= 30;
      const hasSuper = this.self.meter >= 100;

      if (hasSuper && Math.random() < 0.3) {
        // Emit QCF+HP as super motion (most common super input)
        this.startMotion(qcfMotion('hp', facingRight));
        this.applyMotionStep();
        return;
      } else if (hasMeter) {
        this.startMotion(qcfMotion('lp', facingRight));
        this.applyMotionStep();
        return;
      }
    }

    // ----- Normal attacks -----
    if (selfCanAct && inAttackRange && Math.random() < this.params.aggression) {
      // Choose attack based on distance and aggression level
      if (inCloseRange) {
        // Mix of light and heavy at close range
        if (Math.random() < 0.5) {
          next.lp = true;
        } else {
          next.hp = true;
        }
      } else {
        // Poke from mid-range with kick
        if (Math.random() < 0.5) {
          next.lk = true;
        } else {
          next.hk = true;
        }
      }
      this.curr = next;
      return;
    }

    // ----- Combo follow-up -----
    // If self just landed a hit (was attacking last decide), press again
    if (
      selfCanAct &&
      inCloseRange &&
      Math.random() < this.params.comboFollowupChance
    ) {
      next.lp = true;
      this.curr = next;
      return;
    }

    // ----- Movement / spacing -----
    const preferred = this.effectiveSpacing();
    const tooClose  = dist < preferred * 0.75;
    const tooFar    = dist > preferred * 1.25;

    if (tooFar && Math.random() < this.params.aggression) {
      // Walk forward
      if (facingRight) {
        next.right = true;
      } else {
        next.left = true;
      }

      // Rushdown: occasionally jump in when far
      if (this.archetype === 'rushdown' && dist > preferred * 2 && Math.random() < 0.25) {
        next.up = true;
        if (facingRight) next.right = true; else next.left = true;
      }
    } else if (tooClose) {
      // Walk back to preferred spacing
      if (facingRight) {
        next.left = true;
      } else {
        next.right = true;
      }

      // Zoner: throw projectile from range
      if (this.archetype === 'zoner' && dist > 120 && selfCanAct && Math.random() < 0.4) {
        this.startMotion(qcfMotion('lp', facingRight));
        this.applyMotionStep();
        return;
      }
    }

    this.curr = next;
  }

  // ---------------------------------------------------------------------------
  // Motion-sequence helpers
  // ---------------------------------------------------------------------------

  private startMotion(steps: MotionStep[]): void {
    this.motionQueue = steps;
    this.motionStep  = 0;
  }

  private applyMotionStep(): void {
    if (!this.playingMotion) return;

    const step = this.motionQueue[this.motionStep];
    const next = emptyState();

    // Apply held keys for this step
    for (const [k, v] of Object.entries(step.held) as [GameAction, boolean][]) {
      next[k] = v;
    }

    // justPressed is encoded as a transient press (curr=true, prev=false).
    // We set curr here; prev was snapshotted at the top of update(), so
    // any key that wasn't in prev but is in curr will read as justPressed.
    for (const [k, v] of Object.entries(step.justPressed) as [GameAction, boolean][]) {
      if (v) next[k] = true;
    }

    // Ensure prev doesn't have the justPressed keys so they register as new
    for (const [k, v] of Object.entries(step.justPressed) as [GameAction, boolean][]) {
      if (v) this.prev[k] = false;
    }

    this.curr = next;
    this.motionStep++;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private effectiveSpacing(): number {
    switch (this.archetype) {
      case 'rushdown': return this.params.spacingPreference * 0.7;
      case 'zoner':    return this.params.spacingPreference * 1.4;
      default:         return this.params.spacingPreference;
    }
  }
}
