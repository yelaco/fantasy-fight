export enum FighterState {
  Idle,
  WalkForward,
  WalkBackward,
  Crouch,
  CrouchWalk,
  JumpUp,
  JumpForward,
  JumpBackward,
  Falling,
  BlockStand,
  BlockCrouch,
  AttackLight,
  AttackHeavy,
  AttackLightKick,
  AttackHeavyKick,
  Special1,
  Special2,
  Super,
  Hitstun,
  Blockstun,
  Knockdown,
  Getup,
  Dead,
}

// States from which normal actions cannot be initiated
const LOCKED_STATES = new Set<FighterState>([
  FighterState.Hitstun,
  FighterState.Blockstun,
  FighterState.Knockdown,
  FighterState.Dead,
]);

// States considered airborne
const AIR_STATES = new Set<FighterState>([
  FighterState.JumpUp,
  FighterState.JumpForward,
  FighterState.JumpBackward,
  FighterState.Falling,
]);

// States considered attack states
const ATTACK_STATES = new Set<FighterState>([
  FighterState.AttackLight,
  FighterState.AttackHeavy,
  FighterState.AttackLightKick,
  FighterState.AttackHeavyKick,
  FighterState.Special1,
  FighterState.Special2,
  FighterState.Super,
]);

// States from which attacks can be initiated (grounded neutral/walk/crouch)
const GROUNDED_ATTACK_SOURCES = new Set<FighterState>([
  FighterState.Idle,
  FighterState.WalkForward,
  FighterState.WalkBackward,
  FighterState.Crouch,
  FighterState.CrouchWalk,
]);

// Attack targets (can chain if cancelable — caller is responsible for cancel checks)
const ATTACK_TARGETS = new Set<FighterState>([
  FighterState.AttackLight,
  FighterState.AttackHeavy,
  FighterState.AttackLightKick,
  FighterState.AttackHeavyKick,
  FighterState.Special1,
  FighterState.Special2,
  FighterState.Super,
]);

/**
 * Returns whether a state transition from → to is valid according to the
 * fighting-game FSM rules.  The caller should also check frame-level
 * conditions (move fully recovered, cancel windows, etc.).
 */
export function canTransition(from: FighterState, to: FighterState): boolean {
  // Dead is terminal — no exit
  if (from === FighterState.Dead) return false;

  // Knockdown can only proceed to Getup or Dead
  if (from === FighterState.Knockdown) {
    return to === FighterState.Getup || to === FighterState.Dead;
  }

  // Getup can transition to neutral states or Dead
  if (from === FighterState.Getup) {
    return (
      to === FighterState.Idle ||
      to === FighterState.Dead ||
      to === FighterState.Knockdown // re-hit during getup
    );
  }

  // During hitstun / blockstun only combat-driven transitions are valid
  if (from === FighterState.Hitstun) {
    return (
      to === FighterState.Hitstun ||   // re-hit
      to === FighterState.Knockdown ||
      to === FighterState.Dead ||
      to === FighterState.Idle         // recovery expired
    );
  }
  if (from === FighterState.Blockstun) {
    return (
      to === FighterState.Hitstun ||   // re-hit while in blockstun
      to === FighterState.Blockstun ||  // re-blocked
      to === FighterState.Knockdown ||
      to === FighterState.Dead ||
      to === FighterState.Idle ||       // recovery expired
      to === FighterState.BlockStand || // blockstun expired → resume blocking
      to === FighterState.BlockCrouch
    );
  }

  // During an attack the only exits are: other attacks (cancel), hitstun/knockdown/dead, or Idle (recovery done)
  if (ATTACK_STATES.has(from)) {
    return (
      ATTACK_TARGETS.has(to) ||        // cancel / chain
      to === FighterState.Idle ||       // recovery complete
      to === FighterState.Hitstun ||
      to === FighterState.Knockdown ||
      to === FighterState.Dead
    );
  }

  // From airborne states
  if (AIR_STATES.has(from)) {
    // Can get hit while airborne
    if (to === FighterState.Hitstun || to === FighterState.Knockdown || to === FighterState.Dead) return true;
    // Falling is the natural air-to-ground bridge
    if (to === FighterState.Falling) return true;
    // Landing: Falling → Idle/Crouch/WalkForward/WalkBackward
    if (from === FighterState.Falling) {
      return (
        to === FighterState.Idle ||
        to === FighterState.Crouch ||
        to === FighterState.WalkForward ||
        to === FighterState.WalkBackward
      );
    }
    // No blocking/attacking in the air (simplified — extend for air normals if needed)
    return false;
  }

  // From grounded neutral/walk/crouch
  if (GROUNDED_ATTACK_SOURCES.has(from)) {
    // Jump only from ground neutral/walk (not crouch-walk)
    const canJump =
      from !== FighterState.CrouchWalk
        ? to === FighterState.JumpUp ||
          to === FighterState.JumpForward ||
          to === FighterState.JumpBackward
        : false;
    if (canJump) return true;

    // Block
    if (to === FighterState.BlockStand || to === FighterState.BlockCrouch) return true;

    // Movement
    if (
      to === FighterState.Idle ||
      to === FighterState.WalkForward ||
      to === FighterState.WalkBackward ||
      to === FighterState.Crouch ||
      to === FighterState.CrouchWalk
    )
      return true;

    // Attacks
    if (ATTACK_TARGETS.has(to)) return true;

    // Can be hit
    if (to === FighterState.Hitstun || to === FighterState.Knockdown || to === FighterState.Dead) return true;

    return false;
  }

  // From block states — can return to movement or get hit
  if (from === FighterState.BlockStand || from === FighterState.BlockCrouch) {
    return (
      to === FighterState.Idle ||
      to === FighterState.WalkForward ||
      to === FighterState.WalkBackward ||
      to === FighterState.Crouch ||
      to === FighterState.BlockStand ||
      to === FighterState.BlockCrouch ||
      to === FighterState.Blockstun || // hit while blocking → enter blockstun
      to === FighterState.JumpUp ||
      to === FighterState.JumpForward ||
      to === FighterState.JumpBackward ||
      to === FighterState.Hitstun ||
      to === FighterState.Knockdown ||
      to === FighterState.Dead
    );
  }

  // Fallback: allow idle ↔ everything as a safety net
  return from === FighterState.Idle;
}
