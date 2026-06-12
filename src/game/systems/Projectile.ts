/**
 * Projectile system — T8
 *
 * TEXTURE / ANIM KEY CONVENTION (PreloadScene T17 must match):
 *   Texture  : load spritesheet under key === ProjectileData.textureKey
 *              e.g. this.load.spritesheet('fireball', 'assets/proj/fireball.png', { frameWidth: 48, frameHeight: 48 })
 *   Animation: register anim under key === `${ProjectileData.textureKey}__anim`
 *              e.g. this.anims.create({ key: 'fireball__anim', frames: ..., frameRate: 12, repeat: -1 })
 *   If frameCount === 1 no animation is needed; the sprite just shows frame 0.
 *
 * PROJECTILE-VS-PROJECTILE (v1):
 *   Skipped. Projectiles pass through each other.  A future v2 can compare
 *   ProjectileData.tier (add to the type) and cancel same-tier projectiles
 *   by checking bounding-box overlaps inside update() before the fighter loop.
 */

import Phaser from 'phaser';
import type { ProjectileData, FrameHitbox } from '../../types';
import type { Fighter, WorldBox } from '../entities/Fighter';
import { playSfx } from '../../audio';

// ---------------------------------------------------------------------------
// VFX callback interface — defined locally so we don't import from VFX module
// ---------------------------------------------------------------------------

export interface ProjectileHitEvent {
  /** World-space X of the impact. */
  x: number;
  /** World-space Y of the impact. */
  y: number;
  /** The projectile data that caused the hit. */
  data: ProjectileData;
  /** Index of the player who fired (1 or 2). */
  ownerPlayerIndex: 1 | 2;
}

export type OnProjectileHit = (event: ProjectileHitEvent) => void;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build world-space AABB from a hitbox spec, owner position, and facing. */
function hitboxToWorld(
  hb: FrameHitbox,
  ownerX: number,
  ownerY: number,
  facing: 1 | -1,
): WorldBox {
  // hb.x is the forward offset from the owner centre.
  // Mirror when facing left so the box always extends in the travel direction.
  const offsetX = facing === 1 ? hb.x : -(hb.x + hb.w);
  return {
    x: ownerX + offsetX,
    y: ownerY - hb.y - hb.h,
    w: hb.w,
    h: hb.h,
  };
}

/** AABB overlap test. */
function overlaps(a: WorldBox, b: WorldBox): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// ---------------------------------------------------------------------------
// Projectile
// ---------------------------------------------------------------------------

export class Projectile {
  /** The underlying Phaser image (no physics body — we move it manually). */
  readonly sprite: Phaser.GameObjects.Image;

  /** Live flag — false while sitting in the pool waiting to be reused. */
  alive: boolean = false;

  private data!: ProjectileData;
  private facing!: 1 | -1;
  private ownerPlayerIndex!: 1 | 2;
  private distanceTravelled: number = 0;

  constructor(scene: Phaser.Scene) {
    // Create with a placeholder texture; spawn() will configure it.
    this.sprite = scene.add.image(0, 0, '__DEFAULT');
    this.sprite.setVisible(false);
    this.sprite.setActive(false);
  }

  /**
   * (Re)configure this projectile from pool and make it live.
   */
  spawn(
    scene: Phaser.Scene,
    x: number,
    y: number,
    facing: 1 | -1,
    data: ProjectileData,
    ownerPlayerIndex: 1 | 2,
  ): void {
    this.data = data;
    this.facing = facing;
    this.ownerPlayerIndex = ownerPlayerIndex;
    this.distanceTravelled = 0;
    this.alive = true;

    this.sprite.setPosition(x, y);
    this.sprite.setFlipX(facing === -1);
    this.sprite.setVisible(true);
    this.sprite.setActive(true);

    // Try to set texture; fall back to Phaser's built-in white pixel if missing.
    const textureKey = data.textureKey;
    if (scene.textures.exists(textureKey)) {
      this.sprite.setTexture(textureKey, 0);
    } else {
      // Graceful fallback — use the built-in white square so we never throw.
      this.sprite.setTexture('__DEFAULT');
    }

    // Animate if multi-frame and anim exists.
    if (data.frameCount > 1) {
      const animKey = `${textureKey}__anim`;
      if (scene.anims.exists(animKey)) {
        // Image objects don't have anims; cast to Sprite if the caller has
        // already created it as one.  We use a Phaser.GameObjects.Sprite here
        // via the pool so animations work.
        (this.sprite as unknown as Phaser.GameObjects.Sprite).play?.(animKey, true);
      }
      // If the anim doesn't exist, static frame 0 is already shown — no throw.
    }
  }

  /**
   * Move the projectile one frame. Returns false when the projectile should despawn.
   */
  update(dt: number): boolean {
    if (!this.alive) return false;

    const dx = this.data.speed * this.facing * (dt / 1000);
    this.sprite.x += dx;
    this.distanceTravelled += Math.abs(dx);

    if (this.distanceTravelled >= this.data.maxRange) {
      return false;
    }

    return true;
  }

  /** Current world-space hitbox. */
  getHitbox(): WorldBox {
    return hitboxToWorld(
      this.data.hitbox,
      this.sprite.x,
      this.sprite.y,
      this.facing,
    );
  }

  get projectileData(): ProjectileData { return this.data; }
  get owner(): 1 | 2 { return this.ownerPlayerIndex; }
  get travelFacing(): 1 | -1 { return this.facing; }

  /** Return to pool: hide and deactivate. */
  despawn(): void {
    this.alive = false;
    this.sprite.setVisible(false);
    this.sprite.setActive(false);
    // Stop any running animation.
    (this.sprite as unknown as Phaser.GameObjects.Sprite).anims?.stop?.();
  }
}

// ---------------------------------------------------------------------------
// ProjectileManager
// ---------------------------------------------------------------------------

/** Maximum pool size — prevents unbounded growth. */
const POOL_SIZE = 32;

export class ProjectileManager {
  private scene: Phaser.Scene;
  private pool: Projectile[] = [];

  /** Register a handler to be called on every confirmed projectile hit (for VFX). */
  onProjectileHit: OnProjectileHit | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // Pre-allocate pool.
    for (let i = 0; i < POOL_SIZE; i++) {
      this.pool.push(new Projectile(scene));
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Spawn a projectile from the given owner state.
   *
   * @param data           ProjectileData from the fighter manifest.
   * @param owner          Snapshot of the owning fighter's position/facing/index.
   */
  spawn(
    data: ProjectileData,
    owner: { x: number; y: number; facing: 1 | -1; playerIndex: 1 | 2 },
  ): void {
    const proj = this._acquire();
    if (!proj) return; // Pool exhausted — silently drop (rare edge case).

    const spawnX = owner.x + data.spawnOffset.x * owner.facing;
    const spawnY = owner.y + data.spawnOffset.y;

    proj.spawn(this.scene, spawnX, spawnY, owner.facing, data, owner.playerIndex);
    playSfx('projectile_spawn');
  }

  /**
   * Called every frame from the scene update.
   *
   * @param targets All fighters in the match.  Each projectile will only test
   *                against fighters who are NOT the owner.
   * @param dt      Delta-time in milliseconds (Phaser's game.loop.delta).
   */
  update(targets: Fighter[], dt: number): void {
    for (const proj of this.pool) {
      if (!proj.alive) continue;

      const stillAlive = proj.update(dt);

      if (!stillAlive) {
        proj.despawn();
        continue;
      }

      // World bounds check — despawn if the sprite has left the camera/world.
      if (this._isOutOfBounds(proj)) {
        proj.despawn();
        continue;
      }

      // Collision vs opposing fighters.
      const projHitbox = proj.getHitbox();

      for (const target of targets) {
        // Don't hit the owner.
        if (target.playerIndex === proj.owner) continue;

        const hurtbox = target.getHurtbox();
        if (!overlaps(projHitbox, hurtbox)) continue;

        // Hit confirmed.
        const data = proj.projectileData;
        // Knockback is proportional to damage for projectiles (no separate field in ProjectileData).
        const knockback = data.damage * 1.5;

        target.applyHit(data.damage, data.hitstun, knockback, proj.travelFacing);
        playSfx('projectile_hit');

        if (this.onProjectileHit) {
          this.onProjectileHit({
            x: proj.sprite.x,
            y: proj.sprite.y,
            data,
            ownerPlayerIndex: proj.owner,
          });
        }

        // Despawn on hit (non-piercing — v1 has no piercing flag in ProjectileData).
        proj.despawn();
        break; // Each projectile can only hit one target per frame.
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Pool management
  // ---------------------------------------------------------------------------

  private _acquire(): Projectile | null {
    for (const p of this.pool) {
      if (!p.alive) return p;
    }
    return null; // Pool exhausted.
  }

  private _isOutOfBounds(proj: Projectile): boolean {
    const cam = this.scene.cameras.main;
    const margin = 64; // allow a little off-screen before despawn
    const x = proj.sprite.x;
    const y = proj.sprite.y;
    return (
      x < cam.worldView.left - margin ||
      x > cam.worldView.right + margin ||
      y < cam.worldView.top - margin ||
      y > cam.worldView.bottom + margin
    );
  }
}
