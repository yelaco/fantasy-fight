import Phaser from 'phaser';
import type { Manifest, CharacterAnimEntry } from '../types/manifest';
import { ROSTER } from '../data/roster';
import { initAudio } from '../audio';

// ─── TEXTURE-KEY CONVENTIONS ─────────────────────────────────────────────────
//
// CHARACTER spritesheets:
//   key = `char_<variant>_<state>`  where variant and state are sanitized
//   (spaces, '+', and '&' replaced with '_').
//   Example: "char_fire_wizard_Idle", "char_gorgon_1_Run_attack"
//
//   The ANIM key is the AnimSpec.key defined in FighterData (e.g. "fire_wizard__idle").
//   The TEXTURE key is only used internally by PreloadScene + anim registration.
//   Fighter.play(animSpec.key) resolves because we create Phaser anims under
//   AnimSpec.key backed by frames from char_<variant>_<state>.
//
// PROJECTILE spritesheets:
//   key = ProjectileData.textureKey  (e.g. "Fireball", "Arrow", "Kunai")
//   Anim key = `${textureKey}__anim`
//
// STAGE images:
//   key = `stage_<stageId>_<variant>_<layer>`  (matches Stage.textureKey exactly)
//
// ─────────────────────────────────────────────────────────────────────────────

/** Replace spaces, '+', and '&' with '_' to produce safe-ish Phaser keys. */
function sanitize(s: string): string {
  return s.replace(/[ +&]/g, '_');
}

/** Build the character spritesheet texture key. */
function charTextureKey(variant: string, state: string): string {
  return `char_${sanitize(variant)}_${sanitize(state)}`;
}

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  // ---------------------------------------------------------------------------
  // preload — queue all assets (manifest loaded via this.load.json)
  // ---------------------------------------------------------------------------

  preload(): void {
    // Queue the manifest JSON first; it will be available in create().
    this.load.json('manifest', 'manifest.json');

    const { width, height } = this.scale;

    // ── Progress bar UI ──────────────────────────────────────────────────────
    const barW = Math.min(500, width * 0.6);
    const barH = 28;
    const barX = width / 2 - barW / 2;
    const barY = height / 2 + 20;

    this.add
      .text(width / 2, height / 2 - 60, 'Fantasy Fight', {
        fontFamily: 'serif',
        fontSize: '48px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const loadingLabel = this.add
      .text(width / 2, barY - 24, 'Loading… 0%', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#cccccc',
      })
      .setOrigin(0.5);

    // Track background
    const gfx = this.add.graphics();
    gfx.fillStyle(0x222222, 1);
    gfx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);

    // Fill bar (we update its scaleX)
    const fillBar = this.add.graphics();

    const drawFill = (pct: number): void => {
      fillBar.clear();
      fillBar.fillStyle(0xff6600, 1);
      fillBar.fillRect(barX, barY, barW * pct, barH);
    };

    drawFill(0);

    this.load.on('progress', (value: number) => {
      drawFill(value);
      loadingLabel.setText(`Loading… ${Math.round(value * 100)}%`);
    });

    // ── Queue CHARACTER spritesheets ─────────────────────────────────────────
    // We can't read the manifest yet (it loads as part of this queue).
    // Instead we use a two-pass approach: the manifest JSON is queued above;
    // the remaining assets are queued in a 'filecomplete-json-manifest' callback
    // that fires once the JSON file finishes downloading (still within preload).
    this.load.once('filecomplete-json-manifest', (_key: string, _type: string, data: Manifest) => {
      this._queueAssetsFromManifest(data);
    });
  }

  // ---------------------------------------------------------------------------
  // _queueAssetsFromManifest — called mid-preload once manifest JSON is ready
  // ---------------------------------------------------------------------------

  private _queueAssetsFromManifest(manifest: Manifest): void {
    // ── Character spritesheets ───────────────────────────────────────────────
    const loadedCharKeys = new Set<string>();

    for (const entry of manifest.characters) {
      const key = charTextureKey(entry.variant, entry.state);
      if (loadedCharKeys.has(key)) continue;
      loadedCharKeys.add(key);

      this.load.spritesheet(key, entry.path, {
        frameWidth: entry.frameW,
        frameHeight: entry.frameH,
      });
    }

    // ── Projectile spritesheets ──────────────────────────────────────────────
    // Build a lookup: (variant, state) → CharacterAnimEntry for fast resolution.
    const charIndex = new Map<string, CharacterAnimEntry>();
    for (const entry of manifest.characters) {
      charIndex.set(`${entry.variant}::${entry.state}`, entry);
    }

    const loadedProjKeys = new Set<string>();

    for (const fighter of Object.values(ROSTER)) {
      for (const special of fighter.specials) {
        const proj = special.projectile;
        if (!proj) continue;
        if (loadedProjKeys.has(proj.textureKey)) continue;
        loadedProjKeys.add(proj.textureKey);

        // Find the manifest entry that carries the projectile PNG.
        // Convention: same variant folder as the fighter, state === textureKey name.
        const manifestEntry = charIndex.get(`${fighter.id}::${proj.textureKey}`);
        if (!manifestEntry) {
          console.warn(
            `[PreloadScene] Projectile "${proj.textureKey}" for fighter "${fighter.id}" ` +
              `not found in manifest (variant="${fighter.id}", state="${proj.textureKey}") — skipping load.`,
          );
          continue;
        }

        this.load.spritesheet(proj.textureKey, manifestEntry.path, {
          frameWidth: manifestEntry.frameW,
          frameHeight: manifestEntry.frameH,
        });
      }
    }

    // ── Stage images ─────────────────────────────────────────────────────────
    // Key convention: `stage_<stageId>_<variant>_<layer>` — matches Stage.textureKey exactly.
    for (const entry of manifest.stages) {
      const key = `stage_${entry.stage}_${entry.variant}_${entry.layer}`;
      this.load.image(key, entry.path);
    }
  }

  // ---------------------------------------------------------------------------
  // create — manifest is now available; register all animations
  // ---------------------------------------------------------------------------

  create(): void {
    const manifest = this.cache.json.get('manifest') as Manifest;

    // Store manifest on registry so FightScene / Stage can read it.
    this.registry.set('manifest', manifest);

    // Build lookup: (variant, state) → frameCount  (for anim registration)
    const frameCountFor = new Map<string, number>();
    for (const entry of manifest.characters) {
      frameCountFor.set(`${entry.variant}::${entry.state}`, entry.frameCount);
    }

    // ── Register character animations ────────────────────────────────────────
    const registeredAnimKeys = new Set<string>();

    for (const fighter of Object.values(ROSTER)) {
      for (const animSpec of Object.values(fighter.animations)) {
        // Guard duplicate anim keys (multiple logical keys can share the same AnimSpec.key
        // is unlikely but possible if two entries have identical key strings).
        if (registeredAnimKeys.has(animSpec.key)) continue;
        registeredAnimKeys.add(animSpec.key);

        // Texture key for the spritesheet that backs this animation.
        const textureKey = charTextureKey(fighter.id, animSpec.state);

        if (!this.textures.exists(textureKey)) {
          console.warn(
            `[PreloadScene] Texture "${textureKey}" not loaded ` +
              `(fighter="${fighter.id}", state="${animSpec.state}") — anim "${animSpec.key}" skipped.`,
          );
          continue;
        }

        const frameCount = frameCountFor.get(`${fighter.id}::${animSpec.state}`);
        if (frameCount === undefined) {
          console.warn(
            `[PreloadScene] No manifest entry for variant="${fighter.id}" state="${animSpec.state}" ` +
              `— anim "${animSpec.key}" skipped.`,
          );
          continue;
        }

        const frames = this.anims.generateFrameNumbers(textureKey, {
          start: 0,
          end: frameCount - 1,
        });

        this.anims.create({
          key: animSpec.key,
          frames,
          frameRate: animSpec.frameRate,
          repeat: animSpec.repeat,
        });
      }
    }

    // ── Register projectile animations ───────────────────────────────────────
    // Key: `${textureKey}__anim`  (matches Projectile.ts convention)
    const registeredProjAnims = new Set<string>();

    for (const fighter of Object.values(ROSTER)) {
      for (const special of fighter.specials) {
        const proj = special.projectile;
        if (!proj) continue;

        const animKey = `${proj.textureKey}__anim`;
        if (registeredProjAnims.has(animKey)) continue;
        registeredProjAnims.add(animKey);

        // Single-frame projectiles need no animation.
        if (proj.frameCount <= 1) continue;

        if (!this.textures.exists(proj.textureKey)) {
          console.warn(
            `[PreloadScene] Projectile texture "${proj.textureKey}" not loaded — ` +
              `anim "${animKey}" skipped.`,
          );
          continue;
        }

        const frames = this.anims.generateFrameNumbers(proj.textureKey, {
          start: 0,
          end: proj.frameCount - 1,
        });

        this.anims.create({
          key: animKey,
          frames,
          frameRate: 16,
          repeat: -1,
        });
      }
    }

    // ── Init audio engine ────────────────────────────────────────────────────
    initAudio();

    // ── Hand off to main menu ────────────────────────────────────────────────
    this.scene.start('MainMenuScene');
  }
}
