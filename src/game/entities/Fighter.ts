import Phaser from 'phaser';
import type { IInputSource } from '../../input';
import type {
  FighterData,
  MoveData,
  SpecialMoveData,
  FrameHitbox,
} from '../../types';
import { FighterState, canTransition } from './states';

// ---------------------------------------------------------------------------
// Public hitbox types (used by Combat T7)
// ---------------------------------------------------------------------------

export interface WorldBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------
// Hooks / callbacks that cross-system owners (Combat, VFX, etc.) inject
// ---------------------------------------------------------------------------

export interface FighterCallbacks {
  /** Called when the fighter initiates a projectile-based special. */
  onSpawnProjectile?: (fighter: Fighter, special: SpecialMoveData) => void;
  /** Called on every confirmed hit (after Combat resolves). */
  onHitConfirm?: (fighter: Fighter, move: MoveData | SpecialMoveData) => void;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const METER_MAX = 100;
const GROUND_EPSILON = 2; // px tolerance for "on ground" check

// Logical animation key → FighterData.animations record key
const ANIM_KEY_MAP: Record<string, string> = {
  idle:        'idle',
  walk:        'walk',
  run:         'run',
  jump:        'jump',
  hurt:        'hurt',
  dead:        'dead',
  block:       'block',
  attack_lp:   'attack_lp',
  attack_hp:   'attack_hp',
  attack_lk:   'attack_lk',
  attack_hk:   'attack_hk',
  special_1:   'special_1',
  special_2:   'special_2',
  super:       'super',
};

// ---------------------------------------------------------------------------
// Move-frame tracker
// ---------------------------------------------------------------------------

interface MoveFrame {
  move: MoveData | SpecialMoveData;
  frame: number;          // frames elapsed since move started
  hitboxFired: boolean;   // has the active window opened yet
}

// ---------------------------------------------------------------------------
// Fighter class
// ---------------------------------------------------------------------------

export class Fighter {
  // Public readable state
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  hp: number;
  meter: number = 0;
  state: FighterState = FighterState.Idle;
  facing: 1 | -1;           // 1 = right, -1 = left

  readonly playerIndex: 1 | 2;
  readonly data: FighterData;

  // Set by the scene before update() is called each round
  groundY: number = 0;

  // Hitstop state
  private hitstopFrames: number = 0;

  // Move FSM
  private moveFrame: MoveFrame | null = null;

  // Per-state counters
  private hitstunFrames: number = 0;
  private blockstunFrames: number = 0;
  private getupFrames: number = 0;
  private readonly GETUP_DURATION = 30; // frames

  // Synthesis: jump arc
  private jumpVelocityApplied = false;
  private readonly LANDING_SQUASH_FRAMES = 8;
  private landingSquashTimer = 0;
  private readonly AIR_HURTBOX_SCALE = 0.6;

  // Synthesis: block tint
  private blockTintActive = false;

  // Synthesis: crouch scale
  private crouchActive = false;
  private readonly CROUCH_SCALE_Y = 0.65;
  private readonly CROUCH_OFFSET_Y = 35; // px, lifts feet back to ground

  // Callbacks injected by Combat / VFX systems
  callbacks: FighterCallbacks = {};

  // Facing auto-flip suppression (only in neutral)
  private lastOpponentSide: number = 0; // sign of (opponentX - myX)

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    data: FighterData,
    facing: 1 | -1,
    playerIndex: 1 | 2,
  ) {
    this.data = data;
    this.facing = facing;
    this.playerIndex = playerIndex;
    this.hp = data.stats.maxHp;

    // Build Phaser sprite from the fighter's texture key (convention: data.id)
    this.sprite = scene.physics.add.sprite(x, y, data.id);
    this.sprite.setFlipX(facing === -1);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    body.setGravityY(0); // scene-level gravity applies; we set extra for no-jump synthesis

    this.groundY = y;
    this.playAnim('idle');
  }

  // ---------------------------------------------------------------------------
  // Animation helpers — CS-7 synthesis logic lives here
  // ---------------------------------------------------------------------------

  private hasAnim(logicalKey: string): boolean {
    const recordKey = ANIM_KEY_MAP[logicalKey] ?? logicalKey;
    return recordKey in this.data.animations;
  }

  /**
   * Play a logical animation key, falling back to 'idle' if not present.
   * Returns false when synthesis overrides the real animation.
   */
  private playAnim(logicalKey: string): boolean {
    const recordKey = ANIM_KEY_MAP[logicalKey] ?? logicalKey;
    const spec = this.data.animations[recordKey] ?? this.data.animations['idle'];
    if (!spec) return false; // nothing to play

    // Avoid restarting the same animation
    if (this.sprite.anims.currentAnim?.key === spec.key && this.sprite.anims.isPlaying) {
      return true;
    }

    this.sprite.play(spec.key, /* ignoreIfPlaying */ true);
    return true;
  }

  /** Freeze the sprite on frame 0 of a logical animation (for synthesis). */
  private showStaticFrame(logicalKey: string, frameIndex = 0): void {
    const recordKey = ANIM_KEY_MAP[logicalKey] ?? logicalKey;
    const spec = this.data.animations[recordKey] ?? this.data.animations['idle'];
    if (!spec) return;
    this.sprite.anims.stop();
    this.sprite.setFrame(frameIndex);
    // Ensure the texture key is correct even if we never played this anim
    this.sprite.play(spec.key);
    this.sprite.anims.stop();
  }

  // ---------------------------------------------------------------------------
  // Synthesis: Crouch (universal — no fighter ever has a crouch anim)
  // ---------------------------------------------------------------------------

  private enterCrouch(): void {
    if (this.crouchActive) return;
    this.crouchActive = true;
    this.sprite.setScale(this.sprite.scaleX, this.CROUCH_SCALE_Y);
    this.sprite.y += this.CROUCH_OFFSET_Y;
    // Show idle frame 0 as crouch pose
    this.showStaticFrame('idle', 0);
  }

  private exitCrouch(): void {
    if (!this.crouchActive) return;
    this.crouchActive = false;
    this.sprite.setScale(this.sprite.scaleX, 1);
    this.sprite.y -= this.CROUCH_OFFSET_Y;
  }

  // ---------------------------------------------------------------------------
  // Synthesis: Block (flag-driven)
  // ---------------------------------------------------------------------------

  private enterBlock(): void {
    if (!this.data.flags.hasBlock) {
      // Synthesis: show idle frame 0 + blue tint
      if (!this.blockTintActive) {
        this.showStaticFrame('idle', 0);
        this.sprite.setTint(0x8899ff);
        this.blockTintActive = true;
      }
    } else {
      this.playAnim('block');
    }
  }

  private exitBlock(): void {
    if (this.blockTintActive) {
      this.sprite.clearTint();
      this.blockTintActive = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Synthesis: Jump (flag-driven)
  // ---------------------------------------------------------------------------

  private applyJumpImpulse(): void {
    if (this.jumpVelocityApplied) return;
    this.jumpVelocityApplied = true;

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    if (!this.data.flags.hasJump) {
      // Synthesis: ballistic arc via physics, play run/walk anim
      body.setVelocityY(-this.data.stats.jumpVelocity);
      this.playAnim(this.hasAnim('run') ? 'run' : 'walk');
    } else {
      body.setVelocityY(-this.data.stats.jumpVelocity);
      this.playAnim('jump');
    }
  }

  // ---------------------------------------------------------------------------
  // State transition
  // ---------------------------------------------------------------------------

  private setState(next: FighterState): boolean {
    if (this.state === next) return false;
    if (!canTransition(this.state, next)) return false;

    const prev = this.state;
    this.state = next;
    this.onStateEnter(next, prev);
    return true;
  }

  /** Force a state transition bypassing canTransition (for combat hits). */
  private forceState(next: FighterState): void {
    const prev = this.state;
    this.state = next;
    this.onStateEnter(next, prev);
  }

  private onStateEnter(next: FighterState, prev: FighterState): void {
    // Exit side-effects of previous state
    const wasCrouching =
      prev === FighterState.Crouch || prev === FighterState.CrouchWalk;
    const nowCrouching =
      next === FighterState.Crouch || next === FighterState.CrouchWalk;
    if (wasCrouching && !nowCrouching) this.exitCrouch();

    const wasBlocking =
      prev === FighterState.BlockStand || prev === FighterState.BlockCrouch;
    const nowBlocking =
      next === FighterState.BlockStand || next === FighterState.BlockCrouch;
    if (wasBlocking && !nowBlocking) this.exitBlock();

    // If we left a jump/falling state
    const wasAir = this.isAirState(prev);
    const nowAir = this.isAirState(next);
    if (wasAir && !nowAir) {
      // Landed — apply landing squash if no-jump synthesis
      if (!this.data.flags.hasJump) {
        this.landingSquashTimer = this.LANDING_SQUASH_FRAMES;
        this.sprite.setScale(this.sprite.scaleX, 0.75);
      }
      this.jumpVelocityApplied = false;
      const body = this.sprite.body as Phaser.Physics.Arcade.Body;
      body.setVelocityX(0);
    }

    // Enter side-effects
    switch (next) {
      case FighterState.Idle:
        this.moveFrame = null;
        this.playAnim('idle');
        break;

      case FighterState.WalkForward:
        this.playAnim(this.hasAnim('run') ? 'run' : 'walk');
        break;

      case FighterState.WalkBackward:
        this.playAnim('walk');
        break;

      case FighterState.Crouch:
      case FighterState.CrouchWalk:
        this.enterCrouch();
        break;

      case FighterState.JumpUp:
      case FighterState.JumpForward:
      case FighterState.JumpBackward:
        this.applyJumpImpulse();
        break;

      case FighterState.Falling:
        if (!this.data.flags.hasJump) {
          this.playAnim(this.hasAnim('run') ? 'run' : 'walk');
        } else {
          this.playAnim('jump');
        }
        break;

      case FighterState.BlockStand:
      case FighterState.BlockCrouch:
        this.enterBlock();
        break;

      case FighterState.AttackLight:
        this.startMove('lp');
        break;
      case FighterState.AttackHeavy:
        this.startMove('hp');
        break;
      case FighterState.AttackLightKick:
        this.startMove('lk');
        break;
      case FighterState.AttackHeavyKick:
        this.startMove('hk');
        break;

      case FighterState.Hitstun:
        this.moveFrame = null;
        this.playAnim('hurt');
        break;

      case FighterState.Knockdown:
        this.moveFrame = null;
        this.playAnim('hurt');
        break;

      case FighterState.Getup:
        this.getupFrames = this.GETUP_DURATION;
        this.playAnim('idle');
        break;

      case FighterState.Dead:
        this.moveFrame = null;
        this.playAnim('dead');
        break;

      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Move startup
  // ---------------------------------------------------------------------------

  private startMove(button: string): void {
    const move = this.data.normals.find((m) => m.button === button);
    if (!move) {
      this.state = FighterState.Idle;
      return;
    }
    this.moveFrame = { move, frame: 0, hitboxFired: false };
    this.playAnim(move.animState);
  }

  private startSpecialMove(special: SpecialMoveData): void {
    this.moveFrame = { move: special, frame: 0, hitboxFired: false };
    this.playAnim(special.animState);
    if (special.projectile && this.callbacks.onSpawnProjectile) {
      this.callbacks.onSpawnProjectile(this, special);
    }
  }

  // ---------------------------------------------------------------------------
  // Public: special / super triggers (called by the motion system / Combat)
  // ---------------------------------------------------------------------------

  tryStartSpecial(index: 0 | 1): boolean {
    const special = this.data.specials[index];
    if (!special || special.isSuper) return false;
    if (this.meter < special.meterCost) return false;
    if (!this.isGroundedNeutral()) return false;

    const targetState = index === 0 ? FighterState.Special1 : FighterState.Special2;
    if (!this.setState(targetState)) return false;

    this.meter = Math.max(0, this.meter - special.meterCost);
    this.startSpecialMove(special);
    return true;
  }

  tryStartSuper(): boolean {
    const superMove = this.data.specials.find((s) => s.isSuper);
    if (!superMove) return false;
    if (this.meter < superMove.meterCost) return false;
    if (!this.isGroundedNeutral()) return false;

    if (!this.setState(FighterState.Super)) return false;

    this.meter = Math.max(0, this.meter - superMove.meterCost);
    this.startSpecialMove(superMove);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Combat hooks (called by Combat T7)
  // ---------------------------------------------------------------------------

  applyHit(damage: number, hitstunFrames: number, knockback: number, fromFacing: 1 | -1): void {
    this.hp = Math.max(0, this.hp - damage);
    this.meter = Math.min(METER_MAX, this.meter + this.data.stats.meterGainOnTake);

    if (this.hp <= 0) {
      this.kill();
      return;
    }

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    // Knockback away from attacker
    body.setVelocityX(-fromFacing * knockback);

    if (hitstunFrames >= 20) {
      // Heavy hit → knockdown
      this.hitstunFrames = hitstunFrames;
      this.forceState(FighterState.Knockdown);
    } else {
      this.hitstunFrames = hitstunFrames;
      this.forceState(FighterState.Hitstun);
    }
  }

  applyBlock(damage: number, blockstunFrames: number, pushback: number, fromFacing: 1 | -1): void {
    // Chip damage
    this.hp = Math.max(1, this.hp - damage);
    this.blockstunFrames = blockstunFrames;

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(-fromFacing * pushback);

    const isCrouching = this.state === FighterState.Crouch || this.state === FighterState.CrouchWalk;
    this.forceState(isCrouching ? FighterState.BlockCrouch : FighterState.BlockStand);
  }

  enterHitstop(frames: number): void {
    this.hitstopFrames = Math.max(this.hitstopFrames, frames);
  }

  kill(): void {
    this.hp = 0;
    this.forceState(FighterState.Dead);
  }

  // ---------------------------------------------------------------------------
  // Hurtbox / hitbox API (used by Combat T7)
  // ---------------------------------------------------------------------------

  getHurtbox(): WorldBox {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    let w = body.width;
    let h = body.height;

    // Crouch: 65% height
    if (this.crouchActive) h *= this.CROUCH_SCALE_Y;

    // Airborne (no-jump synthesis): 60% height
    if (this.isAirborne && !this.data.flags.hasJump) h *= this.AIR_HURTBOX_SCALE;

    // Block synthesis: ~80% of normal dimensions while blocking
    if (!this.data.flags.hasBlock && this.blockTintActive) {
      w *= 0.8;
      h *= 0.8;
    }

    return {
      x: this.sprite.x - w / 2,
      y: this.sprite.y - h,
      w,
      h,
    };
  }

  getActiveHitbox(): WorldBox | null {
    if (!this.moveFrame) return null;
    const { move, frame } = this.moveFrame;
    const total = move.startup + move.active + move.recovery;
    if (frame < move.startup || frame >= move.startup + move.active) return null;
    if (!move.hitbox) return null;

    const hb = move.hitbox;
    // Mirror hitbox by facing
    const offsetX = this.facing === 1 ? hb.x : -(hb.x + hb.w);
    return {
      x: this.sprite.x + offsetX,
      y: this.sprite.y - hb.y - hb.h,
      w: hb.w,
      h: hb.h,
    };
  }

  get currentMove(): MoveData | SpecialMoveData | null {
    return this.moveFrame?.move ?? null;
  }

  get isAttacking(): boolean {
    return (
      this.state === FighterState.AttackLight ||
      this.state === FighterState.AttackHeavy ||
      this.state === FighterState.AttackLightKick ||
      this.state === FighterState.AttackHeavyKick ||
      this.state === FighterState.Special1 ||
      this.state === FighterState.Special2 ||
      this.state === FighterState.Super
    );
  }

  get isBlocking(): boolean {
    return (
      this.state === FighterState.BlockStand ||
      this.state === FighterState.BlockCrouch
    );
  }

  get isAirborne(): boolean {
    return this.isAirState(this.state);
  }

  get onGround(): boolean {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    return body.touching.down || this.sprite.y >= this.groundY - GROUND_EPSILON;
  }

  // ---------------------------------------------------------------------------
  // Main update
  // ---------------------------------------------------------------------------

  update(input: IInputSource, opponentX: number, dt: number): void {
    // Hitstop: freeze everything
    if (this.hitstopFrames > 0) {
      this.hitstopFrames--;
      this.sprite.anims.pause();
      (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
      return;
    }
    this.sprite.anims.resume();

    // Auto-flip facing toward opponent (neutral states only)
    this.updateFacing(opponentX);

    // Landing squash recovery (no-jump synthesis)
    if (this.landingSquashTimer > 0) {
      this.landingSquashTimer--;
      if (this.landingSquashTimer === 0) {
        this.sprite.setScale(this.sprite.scaleX, 1);
      }
    }

    // Ground-to-air detection: if airborne but in ground state, switch to Falling
    if (!this.isAirborne && !this.onGround) {
      // Walked off a ledge
      this.forceState(FighterState.Falling);
    }

    // Landing detection: if airborne and now on ground, land
    if (this.isAirborne && this.onGround) {
      this.forceState(FighterState.Idle);
    }

    // Tick jump horizontal velocity
    this.tickJumpHorizontal();

    // Per-state update
    switch (this.state) {
      case FighterState.Idle:
      case FighterState.WalkForward:
      case FighterState.WalkBackward:
      case FighterState.Crouch:
      case FighterState.CrouchWalk:
        this.tickGroundedInput(input);
        break;

      case FighterState.JumpUp:
      case FighterState.JumpForward:
      case FighterState.JumpBackward:
      case FighterState.Falling:
        this.tickAirInput(input);
        break;

      case FighterState.BlockStand:
      case FighterState.BlockCrouch:
        this.tickBlockInput(input, opponentX);
        break;

      case FighterState.AttackLight:
      case FighterState.AttackHeavy:
      case FighterState.AttackLightKick:
      case FighterState.AttackHeavyKick:
      case FighterState.Special1:
      case FighterState.Special2:
      case FighterState.Super:
        this.tickAttack();
        break;

      case FighterState.Hitstun:
        this.tickHitstun();
        break;

      case FighterState.Blockstun:
        this.tickBlockstun();
        break;

      case FighterState.Knockdown:
        this.tickKnockdown();
        break;

      case FighterState.Getup:
        this.tickGetup();
        break;

      case FighterState.Dead:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Tick helpers
  // ---------------------------------------------------------------------------

  private updateFacing(opponentX: number): void {
    const side = opponentX > this.sprite.x ? 1 : -1;
    if (side !== this.lastOpponentSide) {
      this.lastOpponentSide = side;
      // Only flip in neutral states
      if (this.isGroundedNeutral()) {
        this.facing = side as 1 | -1;
        this.sprite.setFlipX(this.facing === -1);
      }
    }
  }

  private tickJumpHorizontal(): void {
    if (!this.isAirborne) return;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    switch (this.state) {
      case FighterState.JumpForward:
        body.setVelocityX(this.facing * this.data.stats.walkSpeed * 1.2);
        break;
      case FighterState.JumpBackward:
        body.setVelocityX(-this.facing * this.data.stats.walkSpeed);
        break;
      case FighterState.JumpUp:
      case FighterState.Falling:
        // Horizontal drift decays to 0
        body.setVelocityX(body.velocity.x * 0.9);
        break;
      default:
        break;
    }
  }

  private tickGroundedInput(input: IInputSource): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    const holdDown  = input.held('down');
    const holdLeft  = input.held('left');
    const holdRight = input.held('right');
    const holdUp    = input.held('up');

    // "Back" relative to facing
    const holdBack    = (this.facing === 1 && holdLeft) || (this.facing === -1 && holdRight);
    const holdForward = (this.facing === 1 && holdRight) || (this.facing === -1 && holdLeft);

    // Block: back (or back+down)
    if (holdBack && !holdUp) {
      const blockState = holdDown ? FighterState.BlockCrouch : FighterState.BlockStand;
      this.setState(blockState);
      body.setVelocityX(0);
      return;
    }

    // Crouch
    if (holdDown) {
      if (holdForward) {
        this.setState(FighterState.CrouchWalk);
        body.setVelocityX(this.facing * this.data.stats.walkSpeed * 0.5);
      } else {
        this.setState(FighterState.Crouch);
        body.setVelocityX(0);
      }
      // Attacks from crouch
      this.tryGroundAttackInput(input);
      return;
    }

    // Jump
    if (holdUp && this.onGround) {
      if (holdForward) {
        this.setState(FighterState.JumpForward);
      } else if (holdBack) {
        this.setState(FighterState.JumpBackward);
      } else {
        this.setState(FighterState.JumpUp);
      }
      return;
    }

    // Walk
    if (holdForward) {
      this.setState(FighterState.WalkForward);
      body.setVelocityX(this.facing * this.data.stats.walkSpeed);
    } else if (holdBack) {
      this.setState(FighterState.WalkBackward);
      body.setVelocityX(-this.facing * this.data.stats.walkSpeed);
    } else {
      this.setState(FighterState.Idle);
      body.setVelocityX(0);
    }

    this.tryGroundAttackInput(input);
  }

  private tryGroundAttackInput(input: IInputSource): void {
    if (input.justPressed('lp')) {
      this.setState(FighterState.AttackLight);
    } else if (input.justPressed('hp')) {
      this.setState(FighterState.AttackHeavy);
    } else if (input.justPressed('lk')) {
      this.setState(FighterState.AttackLightKick);
    } else if (input.justPressed('hk')) {
      this.setState(FighterState.AttackHeavyKick);
    }
  }

  private tickAirInput(_input: IInputSource): void {
    // Air normals / air mobility extensions can be added here later.
    // Currently we just let physics handle the arc.
    // Transition to Falling if ascending velocity has peaked
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (
      body.velocity.y > 0 &&
      (this.state === FighterState.JumpUp ||
        this.state === FighterState.JumpForward ||
        this.state === FighterState.JumpBackward)
    ) {
      this.setState(FighterState.Falling);
    }
  }

  private tickBlockInput(input: IInputSource, opponentX: number): void {
    const holdDown  = input.held('down');
    const holdLeft  = input.held('left');
    const holdRight = input.held('right');
    const holdBack  = (this.facing === 1 && holdLeft) || (this.facing === -1 && holdRight);

    if (!holdBack) {
      // Released block
      this.exitBlock();
      this.setState(FighterState.Idle);
    } else if (holdDown) {
      this.setState(FighterState.BlockCrouch);
    } else {
      this.setState(FighterState.BlockStand);
    }
  }

  private tickAttack(): void {
    if (!this.moveFrame) {
      this.setState(FighterState.Idle);
      return;
    }

    this.moveFrame.frame++;
    const { move, frame } = this.moveFrame;
    const total = move.startup + move.active + move.recovery;

    // Recovery complete → return to idle
    if (frame >= total) {
      this.moveFrame = null;
      this.setState(FighterState.Idle);
    }
  }

  private tickHitstun(): void {
    this.hitstunFrames--;
    if (this.hitstunFrames <= 0) {
      this.setState(FighterState.Idle);
    }
  }

  private tickBlockstun(): void {
    this.blockstunFrames--;
    if (this.blockstunFrames <= 0) {
      this.exitBlock();
      this.setState(FighterState.Idle);
    }
  }

  private tickKnockdown(): void {
    if (this.onGround) {
      this.setState(FighterState.Getup);
    }
  }

  private tickGetup(): void {
    this.getupFrames--;
    if (this.getupFrames <= 0) {
      this.setState(FighterState.Idle);
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private isGroundedNeutral(): boolean {
    return (
      this.state === FighterState.Idle ||
      this.state === FighterState.WalkForward ||
      this.state === FighterState.WalkBackward ||
      this.state === FighterState.Crouch ||
      this.state === FighterState.CrouchWalk
    );
  }

  private isAirState(s: FighterState): boolean {
    return (
      s === FighterState.JumpUp ||
      s === FighterState.JumpForward ||
      s === FighterState.JumpBackward ||
      s === FighterState.Falling
    );
  }

  get x(): number { return this.sprite.x; }
  get y(): number { return this.sprite.y; }
}
