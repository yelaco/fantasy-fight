/**
 * Combat — hit-resolution system (T7 / CS-5, CS-6).
 *
 * Constructed with (scene, fighterA, fighterB, callbacks).
 * The FightScene calls combat.update() every frame AFTER both fighters update.
 *
 * Responsibilities:
 *  - AABB hitbox vs hurtbox overlap test (world space)
 *  - Block / hit determination (stance-aware, tier-aware)
 *  - Damage scaling via combo count (via callbacks.getComboCount / addCombo)
 *  - Hitstop on both fighters simultaneously
 *  - Meter gain on hit/block
 *  - KO detection and signalling
 *  - One-hit-per-move-activation guard (multi-hit moves via move.active window only)
 *
 * Does NOT import VFX, Combo, or HUD directly — all feedback is emitted
 * through the CombatCallbacks interface so those systems can plug in.
 */

import Phaser from 'phaser';
import type { Fighter, WorldBox } from '../entities/Fighter';
import type { MoveData, SpecialMoveData } from '../../types';
import { playSfx } from '../../audio';
import { TUNING, comboDamageScalar, comboHitstunScalar } from './tuning';

// ---------------------------------------------------------------------------
// Hit tier helpers
// ---------------------------------------------------------------------------

type HitTier = 'light' | 'heavy' | 'special';

function moveTier(move: MoveData | SpecialMoveData): HitTier {
  // SpecialMoveData has no `tier` property; MoveData does.
  if ('tier' in move) return move.tier; // 'light' | 'heavy'
  return 'special';
}

// ---------------------------------------------------------------------------
// Contact point (centre of hitbox/hurtbox overlap) for VFX spark placement
// ---------------------------------------------------------------------------

export interface ContactPoint {
  x: number;
  y: number;
}

function overlapContact(a: WorldBox, b: WorldBox): ContactPoint {
  const left   = Math.max(a.x, b.x);
  const right  = Math.min(a.x + a.w, b.x + b.w);
  const top    = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
  };
}

// ---------------------------------------------------------------------------
// CombatCallbacks interface
// ---------------------------------------------------------------------------

/**
 * Every system that needs to react to combat events implements this interface
 * (or a partial of it) and passes it to the Combat constructor.
 *
 * Combat never hard-imports VFX / Combo / HUD — all coupling is through here.
 */
export interface CombatCallbacks {
  /**
   * A hit connected (not blocked).
   * @param attacker  The fighter who landed the move.
   * @param defender  The fighter who was hit.
   * @param move      The move that connected.
   * @param tier      'light' | 'heavy' | 'special' — drives SFX, VFX, shake tier.
   * @param contact   World-space centre of the hit overlap — for spark/flash placement.
   *
   * Fire ALL feedback simultaneously here:
   *   screen shake, VFX spark/flash, combo counter increment, HUD flash.
   */
  onHit(
    attacker: Fighter,
    defender: Fighter,
    move: MoveData | SpecialMoveData,
    tier: HitTier,
    contact: ContactPoint,
  ): void;

  /**
   * An attack was blocked.
   * @param attacker  Fighter who attacked.
   * @param defender  Fighter who blocked.
   * @param move      The move that was blocked.
   * @param contact   World-space contact point — for block spark placement.
   */
  onBlock(
    attacker: Fighter,
    defender: Fighter,
    move: MoveData | SpecialMoveData,
    contact: ContactPoint,
  ): void;

  /**
   * A fighter's HP reached 0.
   * @param loser  The fighter who was KO'd.
   * The FightScene owns round/match flow; Combat just signals once.
   */
  onKO(loser: Fighter): void;

  /**
   * Return the current combo hit count for `attacker` (0 if no active combo).
   * Used by Combat to compute damage / hitstun scaling.
   */
  getComboCount(attacker: Fighter): number;

  /**
   * Increment the combo counter for `attacker` by one hit.
   * Called by Combat immediately before onHit so the Combo system can update
   * its display in the same callback.
   */
  addCombo(attacker: Fighter): void;

  /**
   * Forward of Fighter.callbacks.onHitConfirm — called after hit is fully
   * applied so Combo/VFX systems that want a post-resolution signal can act.
   */
  onHitConfirm(attacker: Fighter, move: MoveData | SpecialMoveData): void;
}

// ---------------------------------------------------------------------------
// Per-move hit-registration tracker
// ---------------------------------------------------------------------------

/**
 * Tracks which (attacker, moveActivationId) pairs have already connected
 * against which defender this active window, preventing repeat hits from a
 * single move window unless the move explicitly supports multi-hit.
 *
 * activationId is assigned when the hitbox first becomes active and increments
 * each time the fighter starts a new attack state.
 */
interface HitRecord {
  attackerIndex: 1 | 2;
  activationId: number;
  defenderIndex: 1 | 2;
}

// ---------------------------------------------------------------------------
// Combat class
// ---------------------------------------------------------------------------

export class Combat {
  private readonly scene: Phaser.Scene;
  private readonly fighterA: Fighter;
  private readonly fighterB: Fighter;
  private readonly callbacks: CombatCallbacks;

  /** Monotonically increasing IDs assigned when a move's hitbox opens. */
  private activationIdA: number = 0;
  private activationIdB: number = 0;

  /** True while a hitbox is in its active window (to detect when it opens). */
  private hitboxOpenA: boolean = false;
  private hitboxOpenB: boolean = false;

  /** Hit records for the current active window. Cleared when window closes. */
  private hitRecords: HitRecord[] = [];

  /** Guard against firing onKO multiple times in one round. */
  private koFired: boolean = false;

  constructor(
    scene: Phaser.Scene,
    fighterA: Fighter,
    fighterB: Fighter,
    callbacks: CombatCallbacks,
  ) {
    this.scene    = scene;
    this.fighterA = fighterA;
    this.fighterB = fighterB;
    this.callbacks = callbacks;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Call once per frame after both fighters have updated. */
  update(): void {
    this.trackActivations();
    this.resolveHitPair(this.fighterA, this.fighterB, this.activationIdA, 'A');
    this.resolveHitPair(this.fighterB, this.fighterA, this.activationIdB, 'B');
    this.checkKO();
  }

  /** Reset internal state at the start of a new round. */
  reset(): void {
    this.activationIdA = 0;
    this.activationIdB = 0;
    this.hitboxOpenA   = false;
    this.hitboxOpenB   = false;
    this.hitRecords    = [];
    this.koFired       = false;
  }

  // ---------------------------------------------------------------------------
  // Activation tracking (detects when a hitbox window opens / closes)
  // ---------------------------------------------------------------------------

  private trackActivations(): void {
    const openA = this.fighterA.getActiveHitbox() !== null;
    const openB = this.fighterB.getActiveHitbox() !== null;

    // Leading edge: hitbox window just opened → new activation ID
    if (openA && !this.hitboxOpenA) {
      this.activationIdA++;
      this.clearHitRecordsFor(this.fighterA.playerIndex);
    }
    if (openB && !this.hitboxOpenB) {
      this.activationIdB++;
      this.clearHitRecordsFor(this.fighterB.playerIndex);
    }

    // Trailing edge: hitbox closed → clear stale records
    if (!openA && this.hitboxOpenA) {
      this.clearHitRecordsFor(this.fighterA.playerIndex);
    }
    if (!openB && this.hitboxOpenB) {
      this.clearHitRecordsFor(this.fighterB.playerIndex);
    }

    this.hitboxOpenA = openA;
    this.hitboxOpenB = openB;
  }

  private clearHitRecordsFor(attackerIndex: 1 | 2): void {
    this.hitRecords = this.hitRecords.filter(
      (r) => r.attackerIndex !== attackerIndex,
    );
  }

  // ---------------------------------------------------------------------------
  // Hit resolution for one attacker → defender pair
  // ---------------------------------------------------------------------------

  private resolveHitPair(
    attacker: Fighter,
    defender: Fighter,
    activationId: number,
    _side: 'A' | 'B',
  ): void {
    const hitbox   = attacker.getActiveHitbox();
    const hurtbox  = defender.getHurtbox();
    const move     = attacker.currentMove;

    if (!hitbox || !move) return;
    if (!this.aabbOverlap(hitbox, hurtbox)) return;

    // Already connected this activation window against this defender?
    if (this.alreadyHit(attacker.playerIndex, activationId, defender.playerIndex)) return;

    // Register the hit so this move-window can't hit again (single-hit v1)
    this.hitRecords.push({
      attackerIndex: attacker.playerIndex,
      activationId,
      defenderIndex: defender.playerIndex,
    });

    const contact = overlapContact(hitbox, hurtbox);
    const tier    = moveTier(move);
    const blocked = this.isBlocked(attacker, defender, move);

    if (blocked) {
      this.applyBlock(attacker, defender, move, tier, contact);
    } else {
      this.applyHit(attacker, defender, move, tier, contact);
    }
  }

  // ---------------------------------------------------------------------------
  // AABB overlap test
  // ---------------------------------------------------------------------------

  private aabbOverlap(a: WorldBox, b: WorldBox): boolean {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  // ---------------------------------------------------------------------------
  // Block determination
  // ---------------------------------------------------------------------------

  /**
   * Determine whether the defender successfully blocks the attack.
   *
   * Stance rules (v1 simplified — all normals are mid):
   *   - Standing block (BlockStand): blocks mid and high.
   *   - Crouch block (BlockCrouch):  blocks low and mid.
   *   - Normals are mid → both stances block them.
   *   - Specials are mid in v1 → both stances block them.
   *
   * Airborne defenders cannot block.
   */
  private isBlocked(
    attacker: Fighter,
    defender: Fighter,
    _move: MoveData | SpecialMoveData,
  ): boolean {
    if (!defender.isBlocking) return false;
    if (defender.isAirborne)  return false;

    // Verify the defender is actually facing the attacker (back held toward them)
    // Fighter.ts transitions to block states only when holding back relative to facing,
    // so isBlocking already implies correct facing. Extra sanity check:
    const defenderFacingAttacker =
      (defender.facing === 1 && attacker.sprite.x > defender.sprite.x) ||
      (defender.facing === -1 && attacker.sprite.x < defender.sprite.x);

    return defenderFacingAttacker;
  }

  // ---------------------------------------------------------------------------
  // Apply block
  // ---------------------------------------------------------------------------

  private applyBlock(
    attacker: Fighter,
    defender: Fighter,
    move: MoveData | SpecialMoveData,
    tier: HitTier,
    contact: ContactPoint,
  ): void {
    const isSpecial = tier === 'special';
    const chipFraction = isSpecial
      ? TUNING.chipDamageFraction.special
      : TUNING.chipDamageFraction.normal;

    const chipDamage   = Math.floor(move.damage * chipFraction);
    const blockstun    = move.blockstun;
    const pushback     = TUNING.pushback.onBlock;
    const fromFacing   = attacker.facing;

    // Apply to defender
    defender.applyBlock(chipDamage, blockstun, pushback, fromFacing);

    // Light pushback on attacker too (Newton's third law)
    const attackerBody = attacker.sprite.body as Phaser.Physics.Arcade.Body;
    attackerBody.setVelocityX(-fromFacing * TUNING.pushback.attackerOnBlock);

    // Meter gain
    this.addMeter(attacker, TUNING.meter.onBlock * 0.5); // attacker gets less
    this.addMeter(defender, TUNING.meter.onBlock);

    // SFX
    playSfx('block');

    // Notify listeners (VFX block spark etc.)
    this.callbacks.onBlock(attacker, defender, move, contact);
  }

  // ---------------------------------------------------------------------------
  // Apply hit
  // ---------------------------------------------------------------------------

  private applyHit(
    attacker: Fighter,
    defender: Fighter,
    move: MoveData | SpecialMoveData,
    tier: HitTier,
    contact: ContactPoint,
  ): void {
    // Combo count BEFORE increment (0 = first hit)
    const comboCount   = this.callbacks.getComboCount(attacker);
    const hitIndex     = comboCount; // 0-indexed for scalar lookup

    // Scaled damage
    const damageScalar = comboDamageScalar(hitIndex + 1); // pass 1-indexed hit count
    const scaledDamage = Math.max(1, Math.round(move.damage * damageScalar));

    // Scaled hitstun
    const hitstunScalar  = comboHitstunScalar(hitIndex + 1);
    const scaledHitstun  = Math.max(1, Math.round(move.hitstun * hitstunScalar));

    // Knockback (weight-dampened)
    const weight          = defender.data.stats.weight;
    const weightDampening = 1 + weight * TUNING.knockback.weightFactor;
    const scaledKnockback = Math.round(
      (move.knockback * TUNING.knockback.baseScale) / weightDampening,
    );

    const fromFacing = attacker.facing;

    // ── Increment combo BEFORE callbacks so Combo HUD reflects correct count ──
    this.callbacks.addCombo(attacker);

    // ── Apply hit to defender ──
    defender.applyHit(scaledDamage, scaledHitstun, scaledKnockback, fromFacing);

    // ── Hitstop: both fighters freeze simultaneously ──
    const stopFrames = TUNING.hitstop[tier];
    attacker.enterHitstop(stopFrames);
    defender.enterHitstop(stopFrames);

    // ── Meter gain ──
    this.addMeter(attacker, TUNING.meter.onHit + attacker.data.stats.meterGainOnHit);
    this.addMeter(defender, TUNING.meter.onTake);

    // ── SFX (simultaneous with everything else) ──
    const sfxId = tier === 'light'
      ? 'hit_light'
      : tier === 'heavy'
        ? 'hit_heavy'
        : 'hit_special';
    playSfx(sfxId);

    // ── Notify listeners: VFX spark/flash, screen shake, combo display ──
    // All fired in a single callback so the FightScene can dispatch them
    // atomically (shake + spark + flash + combo counter in one frame).
    this.callbacks.onHit(attacker, defender, move, tier, contact);

    // ── Post-resolution confirm (Combo/VFX secondary hook) ──
    this.callbacks.onHitConfirm(attacker, move);
  }

  // ---------------------------------------------------------------------------
  // KO detection
  // ---------------------------------------------------------------------------

  private checkKO(): void {
    if (this.koFired) return;

    const aKO = this.fighterA.hp <= 0;
    const bKO = this.fighterB.hp <= 0;

    if (!aKO && !bKO) return;

    this.koFired = true;

    // If both somehow reach 0 simultaneously, call KO for both (scene resolves draw).
    if (aKO) {
      this.fighterA.kill();
      playSfx('ko');
      this.callbacks.onKO(this.fighterA);
    }
    if (bKO) {
      this.fighterB.kill();
      if (!aKO) playSfx('ko'); // avoid double SFX on simultaneous KO
      this.callbacks.onKO(this.fighterB);
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private alreadyHit(
    attackerIndex: 1 | 2,
    activationId: number,
    defenderIndex: 1 | 2,
  ): boolean {
    return this.hitRecords.some(
      (r) =>
        r.attackerIndex === attackerIndex &&
        r.activationId  === activationId  &&
        r.defenderIndex === defenderIndex,
    );
  }

  private addMeter(fighter: Fighter, amount: number): void {
    fighter.meter = Math.min(TUNING.meter.max, fighter.meter + amount);
  }
}
