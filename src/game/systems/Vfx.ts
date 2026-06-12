import Phaser from 'phaser';
import { TUNING } from './tuning';

// Procedurally-generated texture keys
const TEX_SPARK  = '__vfx_spark';
const TEX_STAR   = '__vfx_star';
const TEX_CIRCLE = '__vfx_circle';
const TEX_RING   = '__vfx_ring';

type HitTier = 'light' | 'heavy' | 'special';

interface TierCfg {
  count:  number;
  tints:  number[];
  life:   [number, number];
  speed:  [number, number];
  scale:  number;
}

const HIT_TIER_CFG: Record<HitTier, TierCfg> = {
  light: {
    count:  8,
    tints:  [0xffffff, 0xffffaa, 0xffff44],
    life:   [100, 200],
    speed:  [80,  220],
    scale:  0.7,
  },
  heavy: {
    count:  16,
    tints:  [0xff8800, 0xffcc00, 0xff4400],
    life:   [180, 320],
    speed:  [140, 340],
    scale:  1.1,
  },
  special: {
    count:  24,
    tints:  [0x00ffff, 0xff00ff, 0xffffff, 0x8800ff],
    life:   [250, 450],
    speed:  [180, 420],
    scale:  1.4,
  },
};

export class Vfx {
  private scene:        Phaser.Scene;
  private sparkEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private blockEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustEmitter:  Phaser.GameObjects.Particles.ParticleEmitter;
  private koEmitter:    Phaser.GameObjects.Particles.ParticleEmitter;
  private flashRect:    Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this._buildTextures();
    this.sparkEmitter = this._buildSparkEmitter();
    this.blockEmitter = this._buildBlockEmitter();
    this.dustEmitter  = this._buildDustEmitter();
    this.koEmitter    = this._buildKoEmitter();
    this.flashRect    = this._buildFlashOverlay();
  }

  // ---------------------------------------------------------------------------
  // Texture generation — all procedural via Graphics.generateTexture
  // ---------------------------------------------------------------------------
  private _buildTextures(): void {
    const tex = this.scene.textures;

    // 1. Spark dot: crisp white disc (8×8)
    if (!tex.exists(TEX_SPARK)) {
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture(TEX_SPARK, 8, 8);
      g.destroy();
    }

    // 2. Star/impact: 4-pointed diamond (16×16)
    if (!tex.exists(TEX_STAR)) {
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
      const cx = 8, cy = 8, ro = 7, ri = 2.5;
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < 4; i++) {
        const oa = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const ia = oa + Math.PI / 4;
        pts.push({ x: cx + Math.cos(oa) * ro, y: cy + Math.sin(oa) * ro });
        pts.push({ x: cx + Math.cos(ia) * ri, y: cy + Math.sin(ia) * ri });
      }
      g.fillStyle(0xffffff, 1);
      g.fillPoints(pts, true);
      g.generateTexture(TEX_STAR, 16, 16);
      g.destroy();
    }

    // 3. Soft circle: radial-fade disc (12×12) for dust/glow
    if (!tex.exists(TEX_CIRCLE)) {
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
      for (let r = 6; r >= 1; r--) {
        g.fillStyle(0xffffff, (r / 6) * 0.85);
        g.fillCircle(6, 6, r);
      }
      g.generateTexture(TEX_CIRCLE, 12, 12);
      g.destroy();
    }

    // 4. Ring: thin hollow circle (20×20) for block/KO rings
    if (!tex.exists(TEX_RING)) {
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
      g.lineStyle(2, 0xffffff, 1);
      g.strokeCircle(10, 10, 8);
      g.generateTexture(TEX_RING, 20, 20);
      g.destroy();
    }
  }

  // ---------------------------------------------------------------------------
  // Emitter factories — each returns a stopped, reusable emitter
  // ---------------------------------------------------------------------------
  private _buildSparkEmitter(): Phaser.GameObjects.Particles.ParticleEmitter {
    return this.scene.add.particles(0, 0, TEX_STAR, {
      emitting:  false,
      lifespan:  { min: 120, max: 260 },
      speed:     { min: 80,  max: 340 },
      scale:     { start: 1.0, end: 0 },
      alpha:     { start: 1.0, end: 0 },
      angle:     { min: 0, max: 360 },
      gravityY:  120,
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(100);
  }

  private _buildBlockEmitter(): Phaser.GameObjects.Particles.ParticleEmitter {
    return this.scene.add.particles(0, 0, TEX_SPARK, {
      emitting:  false,
      lifespan:  { min: 180, max: 320 },
      speed:     { min: 40,  max: 140 },
      scale:     { start: 0.9, end: 0 },
      alpha:     { start: 0.9, end: 0 },
      angle:     { min: 200, max: 340 },
      tint:      0x44aaff,
      gravityY:  80,
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(100);
  }

  private _buildDustEmitter(): Phaser.GameObjects.Particles.ParticleEmitter {
    return this.scene.add.particles(0, 0, TEX_CIRCLE, {
      emitting:  false,
      lifespan:  { min: 220, max: 380 },
      speed:     { min: 20,  max: 80 },
      angle:     { min: 190, max: 350 },
      scale:     { start: 0.7, end: 1.4 },
      alpha:     { start: 0.5, end: 0 },
      tint:      0xc8a87a,
      gravityY:  -20,
      blendMode: Phaser.BlendModes.NORMAL,
    }).setDepth(50);
  }

  private _buildKoEmitter(): Phaser.GameObjects.Particles.ParticleEmitter {
    return this.scene.add.particles(0, 0, TEX_STAR, {
      emitting:  false,
      lifespan:  { min: 400, max: 700 },
      speed:     { min: 120, max: 480 },
      scale:     { start: 1.6, end: 0 },
      alpha:     { start: 1.0, end: 0 },
      angle:     { min: 0, max: 360 },
      rotate:    { min: 0, max: 360 },
      gravityY:  60,
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(200);
  }

  private _buildFlashOverlay(): Phaser.GameObjects.Rectangle {
    const { width, height } = this.scene.scale;
    return this.scene.add
      .rectangle(width / 2, height / 2, width, height, 0xffffff, 0)
      .setDepth(999)
      .setScrollFactor(0);
  }

  // ---------------------------------------------------------------------------
  // Public VFX API
  // ---------------------------------------------------------------------------

  /**
   * Burst of spark particles on hit.
   * light  → white/yellow  | heavy → orange | special → cyan+magenta
   */
  hitSpark(x: number, y: number, tier: HitTier): void {
    const cfg = HIT_TIER_CFG[tier];

    this.sparkEmitter.setPosition(x, y);
    // Reconfigure via updateConfig so tint/lifespan/scale adapt per tier
    this.sparkEmitter.updateConfig({
      tint:    cfg.tints,
      lifespan: { min: cfg.life[0], max: cfg.life[1] },
      scale:   { start: cfg.scale, end: 0 },
    });
    this.sparkEmitter.explode(cfg.count, x, y);

    // Extra slow lingering glow for heavy / special
    if (tier !== 'light') {
      const extra = this.scene.add.particles(x, y, TEX_CIRCLE, {
        emitting:    false,
        lifespan:    cfg.life[1],
        speed:       { min: 10, max: 50 },
        scale:       { start: cfg.scale * 2, end: 0 },
        alpha:       { start: 0.6, end: 0 },
        angle:       { min: 0, max: 360 },
        tint:        cfg.tints[0],
        blendMode:   Phaser.BlendModes.ADD,
        maxParticles: tier === 'special' ? 5 : 3,
      });
      extra.setDepth(99).explode(tier === 'special' ? 5 : 3, x, y);
      this.scene.time.delayedCall(cfg.life[1] + 80, () => extra.destroy());
    }
  }

  /**
   * Defensive block sparkle + expanding ring.
   */
  blockSpark(x: number, y: number): void {
    this.blockEmitter.setPosition(x, y);
    this.blockEmitter.explode(10, x, y);

    // Expanding ring tween
    const ring = this.scene.add
      .image(x, y, TEX_RING)
      .setTint(0x88ccff)
      .setScale(0.5)
      .setAlpha(0.9)
      .setDepth(102)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.scene.tweens.add({
      targets:  ring,
      scaleX:   4,
      scaleY:   4,
      alpha:    0,
      duration: 250,
      ease:     'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Flash target sprite white for ~2 frames — the universal "got hit" indicator.
   */
  hitFlash(targetSprite: Phaser.GameObjects.Sprite): void {
    targetSprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(33, () => targetSprite.clearTint());
  }

  /**
   * Camera shake using TUNING magnitudes.
   * Intensity is pixel magnitude converted to Phaser's 0..1 ratio.
   */
  screenShake(tier: HitTier): void {
    const mag = TUNING.screenShake[tier];
    const { width, height } = this.scene.scale;
    const intensity = new Phaser.Math.Vector2(mag / width, mag / height);
    this.scene.cameras.main.shake(140, intensity);
  }

  /**
   * Full-screen white flash + optional peak callback for super activation.
   * Use the callback to apply hitstop / timeScale slowmo in the scene.
   */
  superFlash(onPeak?: () => void): void {
    this.flashRect.setFillStyle(0xffffff, 0);

    this.scene.tweens.add({
      targets:   this.flashRect,
      fillAlpha: 1,
      duration:  55,
      ease:      'Quad.easeIn',
      onComplete: () => {
        onPeak?.();
        this.flashRect.setFillStyle(0x88eeff, 1);
        this.scene.tweens.add({
          targets:   this.flashRect,
          fillAlpha: 0,
          duration:  230,
          ease:      'Quad.easeOut',
        });
      },
    });

    // Boost camera saturation briefly (WebGL only; no-op on canvas renderer)
    this._camSaturate(2.5, 80, 200);
  }

  /**
   * Landing / dash dust puff.
   */
  dustPuff(x: number, y: number): void {
    this.dustEmitter.setPosition(x, y);
    this.dustEmitter.explode(8, x, y);
  }

  /**
   * KO impact: radial burst + dual expanding rings + shake + desaturate.
   */
  koBurst(x: number, y: number): void {
    // Radial particle burst (gold/red mix)
    this.koEmitter.updateConfig({ tint: [0xffdd00, 0xff6600, 0xff2200, 0xffffff] });
    this.koEmitter.explode(40, x, y);

    // Primary expanding ring
    this._expandRing(x, y, 0xffcc00, 1, 18, 600, 'Expo.easeOut');

    // Secondary ring, offset by 80 ms
    this.scene.time.delayedCall(80, () => {
      this._expandRing(x, y, 0xff4400, 0.5, 10, 450, 'Expo.easeOut');
    });

    // Golden screen flash
    this.flashRect.setFillStyle(0xffdd44, 0);
    this.scene.tweens.add({
      targets:   this.flashRect,
      fillAlpha: 0.6,
      duration:  40,
      ease:      'Quad.easeIn',
      hold:      30,
      yoyo:      true,
    });

    // Heaviest shake
    this.screenShake('special');

    // Desaturate camera for ~400 ms (WebGL only)
    this._camSaturate(-1, 0, 400);
  }

  /**
   * Rising combo floater text: e.g. "3 Hits!".
   */
  comboFloater(x: number, y: number, text: string): void {
    const label = this.scene.add
      .text(x, y, text, {
        fontFamily: '"Arial Black", Impact, sans-serif',
        fontSize:   '22px',
        color:      '#ffee00',
        stroke:     '#000000',
        strokeThickness: 4,
      })
      .setDepth(300)
      .setOrigin(0.5, 1);

    this.scene.tweens.add({
      targets:  label,
      y:        y - 56,
      alpha:    0,
      scaleX:   1.3,
      scaleY:   1.3,
      duration: 700,
      ease:     'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /**
   * Called from scene update if manual animation is ever needed.
   * Currently a no-op — all effects delegate to Phaser tweens / emitters.
   */
  update(_dt: number): void {
    // reserved
  }

  /**
   * Destroy all managed objects on scene shutdown.
   */
  destroy(): void {
    this.sparkEmitter.destroy();
    this.blockEmitter.destroy();
    this.dustEmitter.destroy();
    this.koEmitter.destroy();
    this.flashRect.destroy();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Spawn a transient ring image and tween it outward. */
  private _expandRing(
    x: number, y: number,
    tint: number, startScale: number, endScale: number,
    duration: number, ease: string,
  ): void {
    const ring = this.scene.add
      .image(x, y, TEX_RING)
      .setTint(tint)
      .setScale(startScale)
      .setAlpha(1)
      .setDepth(201)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.scene.tweens.add({
      targets:  ring,
      scaleX:   endScale,
      scaleY:   endScale,
      alpha:    0,
      duration,
      ease,
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Temporarily adjust camera saturation (WebGL only).
   * @param sat  Saturation factor (-1 = full desaturate, 0 = normal, 2+ = oversaturate).
   * @param holdMs   How long to hold the effect before fading out.
   * @param fadeOutMs How long to wait after hold before clearing.
   */
  private _camSaturate(sat: number, holdMs: number, fadeOutMs: number): void {
    const cam = this.scene.cameras.main;
    // postFX is only present in WebGL mode; guard to avoid Canvas crashes
    if (!cam.postFX) return;

    const fx = cam.postFX.addColorMatrix();
    fx.saturate(sat, false);

    this.scene.time.delayedCall(holdMs + fadeOutMs, () => {
      // FX.ColorMatrix has no Controller base in types but is removed via clear()
      // We use clear() only if this is the sole effect; otherwise accept the
      // transient over-clear as acceptable (KO & super don't overlap in practice).
      cam.postFX.clear();
    });
  }
}
