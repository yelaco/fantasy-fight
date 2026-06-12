/**
 * StageSelectScene.ts — key: 'StageSelectScene'
 *
 * FR-4: Stage selector screen.
 *
 * Layout
 * ──────
 *   5 cards across (4 stages + Random), centred horizontally.
 *   Each stage card shows a layered thumbnail built from preloaded
 *   `stage_<id>_<variant>_<layer>` textures composited onto a RenderTexture
 *   (furthest → nearest).  If any layer is missing it is silently skipped.
 *
 * Controls
 * ────────
 *   Left / A / ← : move left          Right / D / → : move right
 *   Enter / Space / J : confirm        Esc / P2 ← : back to CharacterSelectScene
 *   Q / E / Up-Arrow / Down-Arrow : toggle variant (Bright ↔ Pale)
 *
 * Routing
 * ───────
 *   On confirm: patches gameState.config with stageId + stageVariant then
 *   routes to TrainingScene (mode='training') or FightScene (all other modes).
 */

import Phaser from 'phaser';
import type { Manifest, StageLayerEntry } from '../types/manifest';
import type { StageVariant } from '../types/manifest';
import { STAGES, STAGE_IDS } from '../game/stage/stageConfig';
import { gameState } from '../game/state/GameState';
import { playSfx } from '../audio';

// ── Layout ────────────────────────────────────────────────────────────────────
const W  = 1280;
const H  = 720;
const CX = W / 2;

// Thumbnail dimensions (rendered to RenderTexture, displayed smaller)
const THUMB_W = 192;
const THUMB_H = 108;

// Card dimensions (frame around thumbnail)
const CARD_W  = THUMB_W + 16;   // 208
const CARD_H  = THUMB_H + 64;   // 172

// Total cards = 4 stages + 1 Random
const TOTAL_CARDS = STAGE_IDS.length + 1; // 5
const CARD_GAP    = 22;
const TOTAL_ROW_W = TOTAL_CARDS * CARD_W + (TOTAL_CARDS - 1) * CARD_GAP;
const ROW_LEFT    = CX - TOTAL_ROW_W / 2;
const CARD_Y      = H / 2 - CARD_H / 2 - 20;

// ── Colours ───────────────────────────────────────────────────────────────────
const GOLD_NUM     = 0xffd700;
const EMBER_NUM    = 0xff8800;
const PALE_TINT    = 0xb8d4ff;  // bluish tint applied to thumbnail for Pale variant
const DARK_OVERLAY = 0x000000;

// ── Random slot index ─────────────────────────────────────────────────────────
const RANDOM_INDEX = STAGE_IDS.length; // 4

interface CardObjects {
  frame:      Phaser.GameObjects.Rectangle;
  thumb:      Phaser.GameObjects.Image;     // shows the RenderTexture
  glowLeft:   Phaser.GameObjects.Rectangle;
  glowRight:  Phaser.GameObjects.Rectangle;
  nameplate:  Phaser.GameObjects.Text;
  variantBadge: Phaser.GameObjects.Text;
  selIndicator: Phaser.GameObjects.Text;    // ▼ arrow above selected card
}

export class StageSelectScene extends Phaser.Scene {

  // ── State ──────────────────────────────────────────────────────────────────
  private _manifest!: Manifest;
  private _variant: StageVariant = 'Bright';
  private _selectedIndex = 0;          // 0..3 = stage cards, 4 = Random
  private _inputCooldown = 0;

  // ── Render textures (one per stage, keyed by stageId) ─────────────────────
  private _rtBright = new Map<string, Phaser.GameObjects.RenderTexture>();
  private _rtPale   = new Map<string, Phaser.GameObjects.RenderTexture>();

  // ── Card UI objects ────────────────────────────────────────────────────────
  private _cards: CardObjects[] = [];

  // ── Background ─────────────────────────────────────────────────────────────
  private _bgOverlay!: Phaser.GameObjects.Rectangle;

  // ── Header / footer texts ──────────────────────────────────────────────────
  private _headerText!: Phaser.GameObjects.Text;
  private _variantToggleHint!: Phaser.GameObjects.Text;

  // ── Scanline graphics ──────────────────────────────────────────────────────
  private _scanlines!: Phaser.GameObjects.Graphics;

  // ── Keys ──────────────────────────────────────────────────────────────────
  private _keyLeft!:    Phaser.Input.Keyboard.Key;
  private _keyRight!:   Phaser.Input.Keyboard.Key;
  private _keyA!:       Phaser.Input.Keyboard.Key;
  private _keyD!:       Phaser.Input.Keyboard.Key;
  private _keyEnter!:   Phaser.Input.Keyboard.Key;
  private _keySpace!:   Phaser.Input.Keyboard.Key;
  private _keyJ!:       Phaser.Input.Keyboard.Key;
  private _keyEsc!:     Phaser.Input.Keyboard.Key;
  private _keyUp!:      Phaser.Input.Keyboard.Key;
  private _keyDown!:    Phaser.Input.Keyboard.Key;
  private _keyQ!:       Phaser.Input.Keyboard.Key;
  private _keyE!:       Phaser.Input.Keyboard.Key;

  // ── Tween references for cleanup ──────────────────────────────────────────
  private _glowTween: Phaser.Tweens.Tween | null = null;

  constructor() {
    super({ key: 'StageSelectScene' });
  }

  // ── create ─────────────────────────────────────────────────────────────────

  create(): void {
    this._manifest = this.registry.get('manifest') as Manifest;

    // Inherit current variant from gameState so coming back keeps selection
    this._variant = gameState.config.stageVariant ?? 'Bright';

    this._buildBackground();
    this._buildRenderTextures();
    this._buildCards();
    this._buildHeader();
    this._buildFooter();
    this._buildScanlines();
    this._setupKeys();

    // Brief cooldown to avoid confirming from previous scene's key
    this._inputCooldown = 250;

    this._refreshCards();
  }

  // ── update ─────────────────────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    this._inputCooldown = Math.max(0, this._inputCooldown - delta);
    if (this._inputCooldown > 0) return;

    const JD = Phaser.Input.Keyboard.JustDown;

    const leftPressed  = JD(this._keyLeft) || JD(this._keyA);
    const rightPressed = JD(this._keyRight) || JD(this._keyD);
    const varToggle    = JD(this._keyUp) || JD(this._keyDown) ||
                         JD(this._keyQ) || JD(this._keyE);
    const confirmPressed = JD(this._keyEnter) || JD(this._keySpace) || JD(this._keyJ);
    const escPressed     = JD(this._keyEsc);

    if (leftPressed) {
      this._selectedIndex =
        (this._selectedIndex - 1 + TOTAL_CARDS) % TOTAL_CARDS;
      playSfx('menu_move');
      this._refreshCards();
      this._inputCooldown = 120;
    } else if (rightPressed) {
      this._selectedIndex = (this._selectedIndex + 1) % TOTAL_CARDS;
      playSfx('menu_move');
      this._refreshCards();
      this._inputCooldown = 120;
    } else if (varToggle) {
      this._variant = this._variant === 'Bright' ? 'Pale' : 'Bright';
      playSfx('menu_move');
      this._refreshCards();
      this._inputCooldown = 180;
    } else if (confirmPressed) {
      playSfx('menu_confirm');
      this._inputCooldown = 400;
      this._confirm();
    } else if (escPressed) {
      playSfx('menu_move');
      this.scene.start('CharacterSelectScene');
    }
  }

  // ── Background ─────────────────────────────────────────────────────────────

  private _buildBackground(): void {
    // Dark atmospheric background — deep navy/slate
    this.add.rectangle(CX, H / 2, W, H, 0x080c14).setDepth(0);

    // Horizontal ember glow bars at top and bottom
    const g = this.add.graphics().setDepth(1);

    // Top bar
    g.fillStyle(GOLD_NUM, 0.55);
    g.fillRect(0, 0, W, 3);
    g.fillStyle(0xff6600, 0.18);
    g.fillRect(0, 3, W, 12);

    // Bottom bar
    g.fillStyle(GOLD_NUM, 0.55);
    g.fillRect(0, H - 3, W, 3);
    g.fillStyle(0xff6600, 0.18);
    g.fillRect(0, H - 15, W, 12);

    // Radial vignette — four corner darken rectangles (fade illusion)
    const vg = this.add.graphics().setDepth(2);
    for (let i = 0; i < 8; i++) {
      vg.fillStyle(0x000000, 0.035 * (8 - i));
      const margin = i * 24;
      vg.fillRect(0, margin, W, 1);
      vg.fillRect(0, H - margin, W, 1);
    }

    // Dark overlay (keeps card area readable)
    this._bgOverlay = this.add
      .rectangle(CX, H / 2, W, H, DARK_OVERLAY, 0.0)
      .setDepth(3);
  }

  // ── RenderTextures ─────────────────────────────────────────────────────────

  /**
   * For each stage × variant, composite its layers (furthest→nearest) into a
   * small RenderTexture of THUMB_W × THUMB_H.  Missing textures are skipped
   * gracefully.  RTs are re-used across variant toggles so we only build once.
   */
  private _buildRenderTextures(): void {
    const variants: StageVariant[] = ['Bright', 'Pale'];

    for (const stageId of STAGE_IDS) {
      for (const variant of variants) {
        const rt = this.add.renderTexture(0, 0, THUMB_W, THUMB_H).setVisible(false);
        rt.setDepth(-10);

        // Gather manifest entries for this stage + variant, sorted furthest→nearest
        const entries: StageLayerEntry[] = this._manifest.stages
          .filter((e) => e.stage === stageId && e.variant === variant)
          .sort((a, b) => a.index - b.index);

        // Use stamp() to draw each layer scaled to fit the thumbnail.
        // stamp(key, frame, x, y, config) — origin defaults to top-left (0, 0).
        for (const entry of entries) {
          const key = `stage_${entry.stage}_${entry.variant}_${entry.layer}`;
          if (!this.textures.exists(key)) continue;

          const scaleX = THUMB_W / (entry.width  > 0 ? entry.width  : THUMB_W);
          const scaleY = THUMB_H / (entry.height > 0 ? entry.height : THUMB_H);

          rt.stamp(key, undefined, THUMB_W / 2, THUMB_H / 2, {
            scaleX,
            scaleY,
            originX: 0.5,
            originY: 0.5,
          });
        }

        const map = variant === 'Bright' ? this._rtBright : this._rtPale;
        map.set(stageId, rt);
      }
    }
  }

  // ── Cards ──────────────────────────────────────────────────────────────────

  private _buildCards(): void {
    // 4 stage cards + 1 Random card
    const labels = [
      ...STAGE_IDS.map((id) => STAGES[id].displayName),
      'RANDOM',
    ];

    for (let i = 0; i < TOTAL_CARDS; i++) {
      const cx = this._cardCX(i);
      const cy = CARD_Y + CARD_H / 2;

      // ── Outer frame ──
      const frame = this.add
        .rectangle(cx, cy, CARD_W, CARD_H, 0x0a1020, 1)
        .setDepth(10)
        .setStrokeStyle(2, 0x334466, 1);

      // ── Side glow accents (hidden until selected) ──
      const glowLeft = this.add
        .rectangle(cx - CARD_W / 2 + 1, cy, 3, CARD_H, GOLD_NUM, 0)
        .setDepth(11);
      const glowRight = this.add
        .rectangle(cx + CARD_W / 2 - 1, cy, 3, CARD_H, GOLD_NUM, 0)
        .setDepth(11);

      // ── Thumbnail image ──
      const thumb = this.add
        .image(cx, CARD_Y + THUMB_H / 2 + 8, '__DEFAULT')
        .setDisplaySize(THUMB_W, THUMB_H)
        .setDepth(12);

      // ── Name plate ──
      const nameplate = this.add
        .text(cx, CARD_Y + CARD_H - 14, labels[i], {
          fontFamily: '"Arial Black", Impact, sans-serif',
          fontSize: '11px',
          color: '#aabbdd',
          stroke: '#000000',
          strokeThickness: 3,
          letterSpacing: 1,
        })
        .setOrigin(0.5, 1)
        .setDepth(13);

      // ── Variant badge (only on stage cards, not Random) ──
      const variantBadge = this.add
        .text(cx + CARD_W / 2 - 4, CARD_Y + 4, '', {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#88aacc',
          backgroundColor: '#00000080',
          padding: { x: 3, y: 2 },
        })
        .setOrigin(1, 0)
        .setDepth(14);

      // ── Selection indicator ──
      const selIndicator = this.add
        .text(cx, CARD_Y - 12, '▼', {
          fontFamily: '"Arial Black", Impact, sans-serif',
          fontSize: '16px',
          color: '#ffd700',
          stroke: '#000000',
          strokeThickness: 3,
          shadow: { offsetX: 0, offsetY: 0, color: '#ff8800', blur: 8, fill: true },
        })
        .setOrigin(0.5, 1)
        .setDepth(14)
        .setVisible(false);

      this._cards.push({
        frame,
        thumb,
        glowLeft,
        glowRight,
        nameplate,
        variantBadge,
        selIndicator,
      });
    }
  }

  // ── Header / Footer ────────────────────────────────────────────────────────

  private _buildHeader(): void {
    // "SELECT STAGE" header
    this._headerText = this.add
      .text(CX, 52, 'SELECT STAGE', {
        fontFamily: '"Arial Black", Impact, sans-serif',
        fontSize: '44px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 8,
        shadow: { offsetX: 0, offsetY: 0, color: '#ff6600', blur: 28, fill: true },
      })
      .setOrigin(0.5)
      .setDepth(20);

    // Entrance animation
    this._headerText.setScale(0.7).setAlpha(0);
    this.tweens.add({
      targets: this._headerText,
      scale: 1,
      alpha: 1,
      duration: 450,
      ease: 'Back.easeOut',
    });

    // Decorative separator
    const sep = this.add.graphics().setDepth(20);
    sep.fillStyle(GOLD_NUM, 0.6);
    sep.fillRect(CX - 200, 80, 400, 2);
    sep.fillStyle(EMBER_NUM, 0.3);
    sep.fillRect(CX - 300, 82, 600, 1);

    // Subtitle flavor
    this.add
      .text(CX, 98, '— CHOOSE YOUR BATTLEGROUND —', {
        fontFamily: '"Arial Black", Impact, sans-serif',
        fontSize: '14px',
        color: '#ff8800',
        letterSpacing: 4,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setAlpha(0);

    const subText = this.children.getAll().slice(-1)[0] as Phaser.GameObjects.Text;
    this.tweens.add({ targets: subText, alpha: 1, duration: 400, delay: 300 });
  }

  private _buildFooter(): void {
    const footerY = CARD_Y + CARD_H + 48;

    // Variant toggle hint
    this._variantToggleHint = this.add
      .text(CX, footerY, 'VARIANT: BRIGHT', {
        fontFamily: '"Arial Black", Impact, sans-serif',
        fontSize: '16px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 4,
        shadow: { offsetX: 0, offsetY: 0, color: '#ff8800', blur: 10, fill: false },
      })
      .setOrigin(0.5)
      .setDepth(20);

    // Controls hint
    this.add
      .text(CX, footerY + 28, '← → Move   Q/E/↑↓ Toggle Variant   Enter/J Confirm   Esc Back', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#445566',
      })
      .setOrigin(0.5)
      .setDepth(20);
  }

  private _buildScanlines(): void {
    // Subtle CRT scanline overlay for arcade feel
    const g = this.add.graphics().setDepth(100).setAlpha(0.04);
    for (let y = 0; y < H; y += 3) {
      g.fillStyle(0x000000, 1);
      g.fillRect(0, y, W, 1);
    }
    this._scanlines = g;
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private _setupKeys(): void {
    const kb = this.input.keyboard!;
    const KC = Phaser.Input.Keyboard.KeyCodes;
    this._keyLeft  = kb.addKey(KC.LEFT);
    this._keyRight = kb.addKey(KC.RIGHT);
    this._keyA     = kb.addKey(KC.A);
    this._keyD     = kb.addKey(KC.D);
    this._keyUp    = kb.addKey(KC.UP);
    this._keyDown  = kb.addKey(KC.DOWN);
    this._keyQ     = kb.addKey(KC.Q);
    this._keyE     = kb.addKey(KC.E);
    this._keyEnter = kb.addKey(KC.ENTER);
    this._keySpace = kb.addKey(KC.SPACE);
    this._keyJ     = kb.addKey(KC.J);
    this._keyEsc   = kb.addKey(KC.ESC);
  }

  // ── Refresh ────────────────────────────────────────────────────────────────

  /**
   * Redraw all cards to reflect current _selectedIndex and _variant.
   */
  private _refreshCards(): void {
    // Kill existing glow tween
    if (this._glowTween) {
      this._glowTween.stop();
      this._glowTween = null;
    }

    for (let i = 0; i < TOTAL_CARDS; i++) {
      const card    = this._cards[i];
      const isSelected = i === this._selectedIndex;
      const isRandom   = i === RANDOM_INDEX;
      const stageId    = isRandom ? null : STAGE_IDS[i];

      // ── Thumbnail ──────────────────────────────────────────────────────────
      if (!isRandom && stageId) {
        const rtMap = this._variant === 'Bright' ? this._rtBright : this._rtPale;
        const rt    = rtMap.get(stageId);
        if (rt) {
          card.thumb.setTexture(rt.texture.key);
          card.thumb.setDisplaySize(THUMB_W, THUMB_H);
          // Pale gets a cool blue tint to visually distinguish
          card.thumb.setTint(this._variant === 'Pale' ? PALE_TINT : 0xffffff);
        } else {
          card.thumb.setTexture('__DEFAULT');
        }
      } else {
        // Random — draw a question mark tile
        card.thumb.setTexture('__DEFAULT');
        card.thumb.setTint(0x556688);
      }

      // ── Frame ──────────────────────────────────────────────────────────────
      if (isSelected) {
        card.frame.setFillStyle(0x0f1e38, 1);
        card.frame.setStrokeStyle(2.5, GOLD_NUM, 1);
      } else {
        card.frame.setFillStyle(0x0a1020, 1);
        card.frame.setStrokeStyle(1.5, 0x223344, 0.7);
      }

      // ── Name plate ────────────────────────────────────────────────────────
      if (isSelected) {
        card.nameplate.setStyle({
          color: '#ffd700',
          fontSize: '12px',
          stroke: '#000000',
          strokeThickness: 4,
          shadow: { offsetX: 0, offsetY: 0, color: '#ff8800', blur: 8, fill: false },
        });
      } else {
        card.nameplate.setStyle({
          color: '#778899',
          fontSize: '11px',
          stroke: '#000000',
          strokeThickness: 3,
          shadow: undefined,
        });
      }

      // ── Variant badge ─────────────────────────────────────────────────────
      if (!isRandom) {
        card.variantBadge.setText(this._variant === 'Bright' ? '☀' : '🌙');
        card.variantBadge.setAlpha(isSelected ? 1 : 0.5);
      } else {
        card.variantBadge.setText('');
      }

      // ── Glow accents ──────────────────────────────────────────────────────
      if (isSelected) {
        card.glowLeft.setAlpha(0.9);
        card.glowRight.setAlpha(0.9);
        card.glowLeft.setFillStyle(GOLD_NUM, 0.9);
        card.glowRight.setFillStyle(GOLD_NUM, 0.9);
      } else {
        card.glowLeft.setAlpha(0);
        card.glowRight.setAlpha(0);
      }

      // ── Selection indicator ───────────────────────────────────────────────
      card.selIndicator.setVisible(isSelected);
    }

    // ── Animated glow pulse on selected card ─────────────────────────────────
    const sel = this._cards[this._selectedIndex];
    if (sel) {
      this._glowTween = this.tweens.add({
        targets: [sel.glowLeft, sel.glowRight],
        alpha: { from: 0.4, to: 1 },
        yoyo: true,
        repeat: -1,
        duration: 500,
        ease: 'Sine.easeInOut',
      });
    }

    // ── Animate selected indicator bounce ────────────────────────────────────
    if (sel?.selIndicator) {
      this.tweens.killTweensOf(sel.selIndicator);
      sel.selIndicator.setY(CARD_Y - 12);
      this.tweens.add({
        targets: sel.selIndicator,
        y: CARD_Y - 16,
        yoyo: true,
        repeat: -1,
        duration: 420,
        ease: 'Sine.easeInOut',
      });
    }

    // ── Scale-pop selected card ───────────────────────────────────────────────
    for (let i = 0; i < TOTAL_CARDS; i++) {
      const card = this._cards[i];
      const isSelected = i === this._selectedIndex;
      this.tweens.killTweensOf(card.frame);
      this.tweens.add({
        targets: [card.frame, card.thumb, card.nameplate, card.glowLeft, card.glowRight, card.selIndicator, card.variantBadge],
        scaleX: isSelected ? 1.06 : 1,
        scaleY: isSelected ? 1.06 : 1,
        duration: 180,
        ease: 'Back.easeOut',
      });
    }

    // ── Variant toggle hint ───────────────────────────────────────────────────
    this._variantToggleHint.setText(
      `VARIANT: ${this._variant.toUpperCase()}`,
    );
    this._variantToggleHint.setStyle({
      color: this._variant === 'Bright' ? '#ffd700' : '#88ccff',
    });
  }

  // ── Confirm ────────────────────────────────────────────────────────────────

  private _confirm(): void {
    const isRandom = this._selectedIndex === RANDOM_INDEX;

    // Resolve stageId
    let stageId: string;
    if (isRandom) {
      const idx = Math.floor(Math.random() * STAGE_IDS.length);
      stageId = STAGE_IDS[idx];
    } else {
      stageId = STAGE_IDS[this._selectedIndex];
    }

    // Patch game state
    gameState.patch({
      stageId,
      stageVariant: this._variant,
    });

    // Flash the selected card before transitioning
    const sel = this._cards[this._selectedIndex];
    this.tweens.add({
      targets: [sel.frame, sel.thumb],
      alpha: 0.2,
      yoyo: true,
      repeat: 2,
      duration: 80,
      ease: 'Linear',
      onComplete: () => {
        this._destroyRTs();
        const mode = gameState.config.mode;
        if (mode === 'training') {
          this.scene.start('TrainingScene');
        } else {
          this.scene.start('FightScene');
        }
      },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** X centre of card i. */
  private _cardCX(i: number): number {
    return ROW_LEFT + i * (CARD_W + CARD_GAP) + CARD_W / 2;
  }

  private _destroyRTs(): void {
    for (const rt of this._rtBright.values()) rt.destroy();
    for (const rt of this._rtPale.values())   rt.destroy();
    this._rtBright.clear();
    this._rtPale.clear();
  }

  // ── shutdown ───────────────────────────────────────────────────────────────

  shutdown(): void {
    if (this._glowTween) {
      this._glowTween.stop();
      this._glowTween = null;
    }
    this._destroyRTs();
    this._cards = [];
  }
}
