/**
 * VictoryScene — T23
 *
 * Reached when:
 *  - VERSUS mode: either player wins the match.
 *  - ARCADE mode: (a) the player dies (loss screen) or (b) the full ladder is cleared (win screen).
 *
 * FightScene routing contract:
 *  - Mid-ladder wins go directly to the next FightScene; VictoryScene is NOT shown.
 *  - VictoryScene is only shown on (a) arcade player loss or (b) arcade complete / versus finish.
 *
 * TODO: when src/data/endings.ts exists, import { getEnding } from '../data/endings'
 *       and replace GENERIC_ENDING with getEnding(lastWinnerId).
 */

import Phaser from 'phaser';
import { gameState } from '../game/state/GameState';
import { getFighter } from '../data/roster';
import { Vfx } from '../game/systems/Vfx';
import { playMusic, playSfx, stopMusic } from '../audio';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const W = 1280;
const H = 720;
const CX = W / 2;
const CY = H / 2;

// ---------------------------------------------------------------------------
// Generic ending text (fallback until T24 endings module)
// ---------------------------------------------------------------------------
const GENERIC_ENDING =
  'With the tournament behind them, the champion stood alone on the summit — ' +
  'their legend etched into the annals of the realm. Heroes and villains alike ' +
  'would whisper the name for generations to come.';

// ---------------------------------------------------------------------------
// Menu item descriptor
// ---------------------------------------------------------------------------
interface MenuItem {
  label: string;
  action: () => void;
}

// ---------------------------------------------------------------------------
// VictoryScene
// ---------------------------------------------------------------------------
export class VictoryScene extends Phaser.Scene {
  private _menuItems: MenuItem[] = [];
  private _menuIndex = 0;
  private _menuTexts: Phaser.GameObjects.Text[] = [];
  private _cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private _upKey!: Phaser.Input.Keyboard.Key;
  private _downKey!: Phaser.Input.Keyboard.Key;
  private _confirmKey!: Phaser.Input.Keyboard.Key;
  private _confirmKey2!: Phaser.Input.Keyboard.Key;
  private _confirmKey3!: Phaser.Input.Keyboard.Key;
  private _inputCooldown = 0;
  private _vfx!: Vfx;

  constructor() {
    super({ key: 'VictoryScene' });
  }

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  create(): void {
    const mode = gameState.config.mode;
    const lastWinner = gameState.lastWinner;   // 1 | 2 | null
    const lastWinnerId = gameState.lastWinnerId ?? gameState.config.p1Id;

    // In arcade, p1 is always the human fighter.
    const arcadeFighterId = gameState.arcadeFighterId || gameState.config.p1Id;
    const playerWon =
      mode !== 'arcade' || lastWinnerId === arcadeFighterId;

    const arcadeComplete = mode === 'arcade' && gameState.arcadeCleared;

    // ── Background ────────────────────────────────────────────────────────────
    this._buildBackground(playerWon, arcadeComplete);

    // ── Spotlight ─────────────────────────────────────────────────────────────
    this._buildSpotlight(playerWon);

    // ── Winner sprite ────────────────────────────────────────────────────────
    this._buildWinnerSprite(lastWinnerId, playerWon);

    // ── Banner ────────────────────────────────────────────────────────────────
    const bannerText = this._buildBannerText(
      mode, lastWinner, lastWinnerId, playerWon, arcadeComplete,
    );
    this._buildBanner(bannerText, playerWon, arcadeComplete);

    // ── Quote / Ending ────────────────────────────────────────────────────────
    this._buildQuoteSection(lastWinnerId, playerWon, arcadeComplete);

    // ── Menu ──────────────────────────────────────────────────────────────────
    this._buildMenu(mode, playerWon, arcadeComplete);
    this._renderMenu();

    // ── Input ─────────────────────────────────────────────────────────────────
    this._setupInput();

    // ── Audio ─────────────────────────────────────────────────────────────────
    stopMusic();
    if (playerWon) {
      playSfx('victory');
      this.time.delayedCall(300, () => playMusic('victory'));
    }

    // ── Particles ─────────────────────────────────────────────────────────────
    this._vfx = new Vfx(this);
    if (playerWon) {
      this.time.delayedCall(400, () => {
        this._vfx.koBurst(CX, CY - 80);
        this.time.delayedCall(180, () => this._burstConfetti());
      });
    }
  }

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------
  update(_time: number, delta: number): void {
    this._inputCooldown = Math.max(0, this._inputCooldown - delta);
    if (this._inputCooldown > 0) return;

    const upPressed =
      Phaser.Input.Keyboard.JustDown(this._upKey) ||
      (this._cursors && Phaser.Input.Keyboard.JustDown(this._cursors.up));
    const downPressed =
      Phaser.Input.Keyboard.JustDown(this._downKey) ||
      (this._cursors && Phaser.Input.Keyboard.JustDown(this._cursors.down));
    const confirmPressed =
      Phaser.Input.Keyboard.JustDown(this._confirmKey) ||
      Phaser.Input.Keyboard.JustDown(this._confirmKey2) ||
      Phaser.Input.Keyboard.JustDown(this._confirmKey3);

    if (upPressed && this._menuItems.length > 0) {
      this._menuIndex = (this._menuIndex - 1 + this._menuItems.length) % this._menuItems.length;
      playSfx('menu_move');
      this._renderMenu();
      this._inputCooldown = 120;
    } else if (downPressed && this._menuItems.length > 0) {
      this._menuIndex = (this._menuIndex + 1) % this._menuItems.length;
      playSfx('menu_move');
      this._renderMenu();
      this._inputCooldown = 120;
    } else if (confirmPressed && this._menuItems.length > 0) {
      playSfx('menu_confirm');
      this._inputCooldown = 400;
      this._menuItems[this._menuIndex].action();
    }
  }

  // ---------------------------------------------------------------------------
  // Private builders
  // ---------------------------------------------------------------------------

  private _buildBackground(playerWon: boolean, arcadeComplete: boolean): void {
    // Deep dark overlay
    this.add
      .rectangle(CX, CY, W, H, 0x04040e, 1)
      .setDepth(0);

    if (arcadeComplete) {
      // Dramatic purple-gold gradient via layered rects
      this.add.rectangle(CX, CY, W, H, 0x1a0030, 0.85).setDepth(1);
      this._addVignette(0x6600cc, 0x220044);
    } else if (playerWon) {
      this.add.rectangle(CX, CY, W, H, 0x0a1a00, 0.8).setDepth(1);
      this._addVignette(0x004400, 0x001100);
    } else {
      // Loss — cold blue-grey
      this.add.rectangle(CX, CY, W, H, 0x050814, 0.85).setDepth(1);
      this._addVignette(0x001133, 0x000511);
    }
  }

  /** Layered radial vignette via concentric rects with transparency. */
  private _addVignette(innerTint: number, outerTint: number): void {
    const g = this.add.graphics().setDepth(2);
    // Outer glow ring
    g.fillStyle(outerTint, 0.5);
    g.fillRect(0, 0, W, H);
    // Slightly lighter centre
    g.fillStyle(innerTint, 0.3);
    g.fillEllipse(CX, CY, W * 0.85, H * 0.7);
  }

  private _buildSpotlight(playerWon: boolean): void {
    const g = this.add.graphics().setDepth(3);
    const spotColor = playerWon ? 0xfffbe0 : 0xb0c4de;
    // Cone downward from top
    g.fillStyle(spotColor, 0.07);
    g.fillTriangle(CX - 80, 0, CX + 80, 0, CX + 300, H);
    g.fillTriangle(CX - 80, 0, CX - 300, H, CX + 300, H);
    // Bright inner cone
    g.fillStyle(spotColor, 0.05);
    g.fillTriangle(CX - 40, 0, CX + 40, 0, CX + 140, H);
  }

  private _buildWinnerSprite(winnerId: string, playerWon: boolean): void {
    const fighter = getFighter(winnerId);
    const idleKey = `${winnerId}__idle`;

    // Pick best available animation key
    let animKey: string | null = null;
    if (this.anims.exists(idleKey)) {
      animKey = idleKey;
    }

    // Find sprite texture key — try to find a registered anim that uses this fighter
    let textureKey: string | null = null;
    let animSpec = fighter.animations[idleKey];
    if (!animSpec) {
      // Fallback to any animation from this fighter
      const firstKey = Object.keys(fighter.animations)[0];
      if (firstKey) animSpec = fighter.animations[firstKey];
    }
    if (animSpec) {
      // Build texture key per PreloadScene convention
      const sanitize = (s: string): string => s.replace(/[ +&]/g, '_');
      textureKey = `char_${sanitize(winnerId)}_${sanitize(animSpec.state)}`;
    }

    if (!textureKey || !this.textures.exists(textureKey)) {
      // Draw a silhouette placeholder
      const g = this.add.graphics().setDepth(10);
      g.fillStyle(playerWon ? 0xffd700 : 0x4488cc, 0.25);
      g.fillEllipse(CX, H - 200, 180, 320);
      return;
    }

    const sprite = this.add
      .sprite(CX, H - 160, textureKey)
      .setDepth(10)
      .setScale(2.4)
      .setOrigin(0.5, 1);

    if (!playerWon) sprite.setTint(0x8899bb);

    if (animKey) {
      try {
        sprite.play(animKey);
      } catch {
        // Anim missing at runtime — silently ignore
      }
    }

    // Subtle entrance tween
    sprite.setAlpha(0).setY(sprite.y + 40);
    this.tweens.add({
      targets: sprite,
      alpha: 1,
      y: sprite.y - 40,
      duration: 600,
      ease: 'Back.easeOut',
      delay: 200,
    });

    // Floating bob
    this.tweens.add({
      targets: sprite,
      y: sprite.y - 12,
      yoyo: true,
      repeat: -1,
      duration: 1800,
      ease: 'Sine.easeInOut',
      delay: 900,
    });
  }

  private _buildBannerText(
    mode: string,
    lastWinner: 1 | 2 | null,
    lastWinnerId: string,
    playerWon: boolean,
    arcadeComplete: boolean,
  ): string {
    if (mode === 'arcade') {
      if (!playerWon) return 'DEFEATED';
      if (arcadeComplete) return 'CHAMPION!';
      return 'VICTORY!';
    }

    // VERSUS / TRAINING
    const fighter = getFighter(lastWinnerId);
    if (mode === 'versus') {
      if (lastWinner === 1) return 'PLAYER 1 WINS';
      if (lastWinner === 2) return 'PLAYER 2 WINS';
    }
    return `${fighter.displayName.toUpperCase()} WINS`;
  }

  private _buildBanner(text: string, playerWon: boolean, arcadeComplete: boolean): void {
    // Shadow rectangle behind banner
    const bannerY = 110;

    const shadowRect = this.add
      .rectangle(CX, bannerY, W * 0.85, 90, 0x000000, 0.7)
      .setDepth(19);
    this.tweens.add({
      targets: shadowRect,
      scaleX: { from: 0.2, to: 1 },
      alpha: { from: 0, to: 1 },
      duration: 500,
      ease: 'Expo.easeOut',
    });

    // Accent line top
    const accentColor = arcadeComplete ? 0xcc66ff : playerWon ? 0xffd700 : 0x4477cc;
    this.add.rectangle(CX, bannerY - 44, W * 0.85, 3, accentColor, 0.9).setDepth(20);
    this.add.rectangle(CX, bannerY + 44, W * 0.85, 3, accentColor, 0.9).setDepth(20);

    const titleColor = arcadeComplete ? '#cc66ff' : playerWon ? '#ffd700' : '#6699cc';

    const title = this.add
      .text(CX, bannerY, text, {
        fontFamily: '"Arial Black", "Impact", sans-serif',
        fontSize: arcadeComplete ? '72px' : '64px',
        color: titleColor,
        stroke: '#000000',
        strokeThickness: 8,
        shadow: {
          offsetX: 4,
          offsetY: 4,
          color: '#000000',
          blur: 8,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setDepth(21)
      .setAlpha(0)
      .setScale(2);

    this.tweens.add({
      targets: title,
      alpha: 1,
      scale: 1,
      duration: 450,
      ease: 'Back.easeOut',
      delay: 150,
    });

    // Subtle pulse on the title
    this.tweens.add({
      targets: title,
      scaleX: 1.03,
      scaleY: 1.03,
      yoyo: true,
      repeat: -1,
      duration: 1400,
      ease: 'Sine.easeInOut',
      delay: 700,
    });
  }

  private _buildQuoteSection(
    winnerId: string,
    playerWon: boolean,
    arcadeComplete: boolean,
  ): void {
    const fighter = getFighter(winnerId);
    const quoteY = 220;

    // Fighter name
    this.add
      .text(CX, quoteY, fighter.displayName, {
        fontFamily: '"Arial", sans-serif',
        fontSize: '28px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        shadow: { offsetX: 2, offsetY: 2, color: '#000000', blur: 4, fill: true },
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setAlpha(0)
      .setData('anim', true);

    // Animate fighter name in
    const nameObj = this.children.getAll().slice(-1)[0] as Phaser.GameObjects.Text;
    this.tweens.add({ targets: nameObj, alpha: 1, duration: 400, delay: 500 });

    // Quote or ending
    let quoteText = '';

    if (arcadeComplete) {
      // Arcade ending — TODO: replace with getEnding(winnerId) when src/data/endings.ts exists
      quoteText = GENERIC_ENDING;
    } else if (playerWon && fighter.winQuotes.length > 0) {
      const idx = Math.floor(Math.random() * fighter.winQuotes.length);
      quoteText = `"${fighter.winQuotes[idx]}"`;
    } else if (!playerWon) {
      quoteText = 'The fight is over... for now.';
    }

    if (quoteText) {
      const maxWidth = arcadeComplete ? W * 0.65 : W * 0.6;
      const quote = this.add
        .text(CX, quoteY + 50, quoteText, {
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'italic',
          fontSize: arcadeComplete ? '19px' : '22px',
          color: arcadeComplete ? '#ddaaff' : '#e8d9a0',
          stroke: '#000000',
          strokeThickness: 3,
          align: 'center',
          wordWrap: { width: maxWidth },
          shadow: { offsetX: 1, offsetY: 1, color: '#000000', blur: 3, fill: true },
        })
        .setOrigin(0.5, 0)
        .setDepth(20)
        .setAlpha(0);

      this.tweens.add({ targets: quote, alpha: 1, duration: 500, delay: 700 });
    }
  }

  private _buildMenu(mode: string, playerWon: boolean, arcadeComplete: boolean): void {
    this._menuItems = [];

    if (mode === 'versus') {
      this._menuItems.push({
        label: 'Rematch',
        action: () => {
          gameState.resetMatch();
          this.scene.start('FightScene');
        },
      });
      this._menuItems.push({
        label: 'Character Select',
        action: () => this.scene.start('CharacterSelectScene'),
      });
      this._menuItems.push({
        label: 'Main Menu',
        action: () => this.scene.start('MainMenuScene'),
      });
    } else if (mode === 'arcade') {
      if (!playerWon) {
        // Player lost the arcade fight
        this._menuItems.push({
          label: 'Continue?',
          action: () => {
            gameState.resetMatch();
            this.scene.start('FightScene');
          },
        });
        this._menuItems.push({
          label: 'Retire',
          action: () => this.scene.start('MainMenuScene'),
        });
      } else if (arcadeComplete) {
        // Full ladder cleared
        this._menuItems.push({
          label: 'Main Menu',
          action: () => this.scene.start('MainMenuScene'),
        });
        // Credits — scene key may not exist yet; guard so scene.start doesn't crash.
        this._menuItems.push({
          label: 'Credits',
          action: () => {
            if (this.scene.manager.getScene('CreditsScene')) {
              this.scene.start('CreditsScene');
            } else {
              this.scene.start('MainMenuScene');
            }
          },
        });
      } else {
        // Mid-arcade: won the fight but ladder not cleared.
        // Per spec, FightScene routes here only on loss or arcade-complete;
        // this branch is a safety fallback.
        this._menuItems.push({
          label: 'Next Battle',
          action: () => {
            gameState.resetMatch();
            this.scene.start('FightScene');
          },
        });
        this._menuItems.push({
          label: 'Retire',
          action: () => this.scene.start('MainMenuScene'),
        });
      }
    } else {
      // Training or unknown mode
      this._menuItems.push({
        label: 'Play Again',
        action: () => {
          gameState.resetMatch();
          this.scene.start('FightScene');
        },
      });
      this._menuItems.push({
        label: 'Main Menu',
        action: () => this.scene.start('MainMenuScene'),
      });
    }
  }

  private _renderMenu(): void {
    const menuBaseY = H - 190;
    const itemSpacing = 52;

    // Destroy old texts
    this._menuTexts.forEach(t => t.destroy());
    this._menuTexts = [];

    const totalH = (this._menuItems.length - 1) * itemSpacing;
    const startY = menuBaseY - totalH / 2;

    this._menuItems.forEach((item, i) => {
      const isSelected = i === this._menuIndex;
      const y = startY + i * itemSpacing;

      // Selection highlight rect
      if (isSelected) {
        const highlightW = 360;
        const highlight = this.add
          .rectangle(CX, y, highlightW, 44, 0xffd700, 0.18)
          .setDepth(29)
          .setStrokeStyle(2, 0xffd700, 0.7);
        this._menuTexts.push(highlight as unknown as Phaser.GameObjects.Text);
      }

      const label = this.add
        .text(CX, y, item.label, {
          fontFamily: '"Arial Black", Impact, sans-serif',
          fontSize: isSelected ? '30px' : '26px',
          color: isSelected ? '#ffd700' : '#aabbcc',
          stroke: '#000000',
          strokeThickness: isSelected ? 5 : 3,
          shadow: isSelected
            ? { offsetX: 0, offsetY: 0, color: '#ffd700', blur: 10, fill: false }
            : undefined,
        })
        .setOrigin(0.5)
        .setDepth(30);

      this._menuTexts.push(label);

      // Arrow indicator for selected item
      if (isSelected) {
        const arrow = this.add
          .text(CX - 200, y, '>', {
            fontFamily: '"Arial Black", Impact, sans-serif',
            fontSize: '28px',
            color: '#ffd700',
            stroke: '#000000',
            strokeThickness: 4,
          })
          .setOrigin(0.5)
          .setDepth(30);

        // Animate arrow
        this.tweens.add({
          targets: arrow,
          x: CX - 188,
          yoyo: true,
          repeat: -1,
          duration: 400,
          ease: 'Sine.easeInOut',
        });

        this._menuTexts.push(arrow);
      }
    });

    // Keyboard hint at bottom
    const hint = this.add
      .text(CX, H - 28, 'W/S or ↑↓ to move   Enter / Space / J to select', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#556677',
      })
      .setOrigin(0.5)
      .setDepth(30);
    this._menuTexts.push(hint);
  }

  private _setupInput(): void {
    const kb = this.input.keyboard!;
    const KC = Phaser.Input.Keyboard.KeyCodes;

    this._cursors = kb.createCursorKeys();
    this._upKey = kb.addKey(KC.W);
    this._downKey = kb.addKey(KC.S);
    this._confirmKey = kb.addKey(KC.ENTER);
    this._confirmKey2 = kb.addKey(KC.SPACE);
    this._confirmKey3 = kb.addKey(KC.J);

    // Brief lockout to avoid accidental confirm from previous scene
    this._inputCooldown = 500;
  }

  /**
   * Custom confetti burst — multi-colour particles shot upward then arcing down.
   * Uses koBurst for the main burst and adds extra coloured sparks manually.
   */
  private _burstConfetti(): void {
    const COLORS = [0xff4444, 0xffaa00, 0x44ff88, 0x44aaff, 0xff44ff, 0xffff44, 0xffffff];
    const TEX = '__vfx_star';

    if (!this.textures.exists(TEX)) return;

    COLORS.forEach((tint, i) => {
      const x = CX + (i - 3) * 60;
      const emitter = this.add.particles(x, CY - 60, TEX, {
        emitting: false,
        lifespan: { min: 700, max: 1200 },
        speed: { min: 200, max: 500 },
        angle: { min: 240, max: 300 }, // shoot upward
        scale: { start: 1.2, end: 0 },
        alpha: { start: 1, end: 0 },
        tint,
        rotate: { min: 0, max: 360 },
        gravityY: 500,
        blendMode: Phaser.BlendModes.ADD,
      }).setDepth(200);

      emitter.explode(10, x, CY - 60);
      this.time.delayedCall(1500, () => emitter.destroy());
    });
  }

  // ---------------------------------------------------------------------------
  // shutdown
  // ---------------------------------------------------------------------------
  shutdown(): void {
    this._vfx?.destroy();
    this._menuTexts.forEach(t => t.destroy());
    this._menuTexts = [];
  }
}

