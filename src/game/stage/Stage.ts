/**
 * Stage.ts — Parallax stage renderer for Fantasy Fight.
 *
 * ─── TEXTURE-KEY CONVENTION (shared with PreloadScene / T17) ───────────────
 *   key = `stage_<stageId>_<variant>_<layer>`
 *   Examples:
 *     "stage_Battleground1_Bright_Sky"
 *     "stage_Battleground3_Pale_Ground"
 *
 *   <layer>   = StageLayerEntry.layer  (the layer name from the manifest)
 *   <stageId> = StageLayerEntry.stage  (e.g. "Battleground1")
 *   <variant> = StageLayerEntry.variant (e.g. "Bright" or "Pale")
 *
 *   PreloadScene must load each stage image under exactly this key so that
 *   Stage.ts can resolve them at construction time.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Parallax behaviour
 *   update(cameraScrollX) is called every frame.
 *   Each TileSprite layer's tilePositionX is set to:
 *     cameraScrollX * parallaxFactor
 *   Far layers (factor ≈ 0.05) barely move; the nearest layer (factor 1.0)
 *   tracks the camera exactly, appearing stationary relative to the world.
 */

import Phaser from 'phaser';
import type { Manifest, StageLayerEntry, StageVariant } from '../../types/manifest';
import { STAGES, getParallaxFactor } from './stageConfig';
import type { StageDef } from './stageConfig';

/** Internal record for a single rendered layer. */
interface LayerRecord {
  sprite: Phaser.GameObjects.TileSprite;
  parallaxFactor: number;
}

export class Stage {
  /** Y coordinate of the floor in world space (pass to FightScene). */
  readonly groundY: number;
  /** Left bound of the fightable area (always 0). */
  readonly leftBound: number = 0;
  /** Right bound of the fightable area (= worldWidth). */
  readonly rightBound: number;

  private readonly layers: LayerRecord[] = [];
  private readonly stageDef: StageDef;

  /**
   * Build and render the stage.
   *
   * @param scene    The Phaser.Scene that owns this stage.
   * @param manifest The parsed manifest.json loaded at runtime.
   * @param stageId  One of the STAGE_IDS (e.g. "Battleground1").
   * @param variant  "Bright" or "Pale".
   */
  constructor(
    scene: Phaser.Scene,
    manifest: Manifest,
    stageId: string,
    variant: StageVariant,
  ) {
    const stageDef = STAGES[stageId];
    if (!stageDef) {
      throw new Error(`Stage: unknown stageId "${stageId}". Check STAGES in stageConfig.ts.`);
    }
    this.stageDef = stageDef;
    this.groundY = stageDef.groundY;
    this.rightBound = stageDef.worldWidth;

    // Filter manifest to this stage + variant, sorted furthest → nearest.
    const entries: StageLayerEntry[] = manifest.stages
      .filter((e) => e.stage === stageId && e.variant === variant)
      .sort((a, b) => a.index - b.index);

    const { worldWidth } = stageDef;
    const viewportH = 720;

    entries.forEach((entry) => {
      const textureKey = Stage.textureKey(entry.stage, entry.variant, entry.layer);

      // Skip gracefully if the texture was not loaded (e.g. missing asset).
      if (!scene.textures.exists(textureKey)) {
        console.warn(`Stage: texture "${textureKey}" not found — layer skipped.`);
        return;
      }

      // TileSprite fills worldWidth × 720; tileScaleY stretches the 1080-tall
      // source image down to fit the 720-px viewport height.
      const tileScaleY = viewportH / entry.height; // 720 / 1080 ≈ 0.667

      const sprite = scene.add.tileSprite(
        0,          // x — anchored at world origin
        0,          // y — anchored at top
        worldWidth, // display width covers the full fightable area
        viewportH,  // display height fills the viewport
        textureKey,
      );
      sprite.setOrigin(0, 0);

      // Scale the tile texture so its 1920×1080 source fits 1920×720 display.
      // tileScaleX stays 1 so tiles repeat naturally across worldWidth.
      sprite.setTileScale(1, tileScaleY);

      // Draw order: index 0 (furthest) is added first → lowest depth.
      // Phaser renders in insertion order by default; no explicit setDepth needed
      // as long as we add layers in sorted order (which we do).

      const parallaxFactor = getParallaxFactor(stageDef, entry.index);
      this.layers.push({ sprite, parallaxFactor });
    });
  }

  /**
   * Call every frame from the scene's update loop.
   *
   * @param cameraScrollX The camera's current scrollX in world pixels.
   */
  update(cameraScrollX: number): void {
    for (const layer of this.layers) {
      // Moving tilePositionX shifts which part of the tile texture is visible.
      // Far layers use a small factor → slow apparent motion (parallax depth).
      layer.sprite.setTilePosition(cameraScrollX * layer.parallaxFactor, 0);
    }
  }

  /**
   * Destroy all layer sprites (call when leaving the scene).
   */
  destroy(): void {
    for (const layer of this.layers) {
      layer.sprite.destroy();
    }
    this.layers.length = 0;
  }

  // ── Static helpers ────────────────────────────────────────────────────────

  /**
   * Derive the texture key for a single layer.
   * Convention: `stage_<stageId>_<variant>_<layer>`
   * This MUST match the key used by PreloadScene (T17).
   */
  static textureKey(stageId: string, variant: StageVariant, layer: string): string {
    return `stage_${stageId}_${variant}_${layer}`;
  }

  /**
   * Return all texture keys a stage+variant needs so PreloadScene can load them.
   * Pass the runtime manifest; returns an empty array if the stage is not found.
   */
  static layerKeysFor(
    manifest: Manifest,
    stageId: string,
    variant: StageVariant,
  ): string[] {
    return manifest.stages
      .filter((e) => e.stage === stageId && e.variant === variant)
      .sort((a, b) => a.index - b.index)
      .map((e) => Stage.textureKey(e.stage, e.variant, e.layer));
  }

  /** Expose the resolved StageDef for any consumer that needs it. */
  get def(): StageDef {
    return this.stageDef;
  }
}
