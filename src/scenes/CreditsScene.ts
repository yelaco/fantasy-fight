/**
 * CreditsScene.ts — key: 'CreditsScene'
 *
 * Tasteful scrolling credits with the Battleground1 Bright parallax backdrop.
 * Pressing any key / clicking / scroll reaching the end → back to MainMenuScene.
 */

import Phaser from 'phaser';
import { Stage } from '../game/stage/Stage';
import { MENU_STAGE } from '../game/stage/stageConfig';
import { playSfx } from '../audio';
import type { Manifest } from '../types/manifest';

// ── Layout ────────────────────────────────────────────────────────────────────
const W  = 1280;
const H  = 720;
const CX = W / 2;

// ── Colours ───────────────────────────────────────────────────────────────────
const GOLD_NUM = 0xffd700;
const GOLD     = '#ffd700';
const EMBER    = '#ff8800';
const WHITE    = '#e8e8e8';
const DIM      = '#889aaa';

// ── Credits content ───────────────────────────────────────────────────────────
interface CreditBlock {
  heading?: string;
  lines: string[];
  spaceBefore?: number; // extra y-gap before this block
}

const CREDIT_BLOCKS: CreditBlock[] = [
  {
    heading: 'FANTASY FIGHT',
    lines: ['Version 1.0'],
    spaceBefore: 0,
  },
  {
    heading: 'BUILT WITH',
    lines: [
      'Phaser 3  —  phaser.io',
      'TypeScript + Vite',
    ],
    spaceBefore: 40,
  },
  {
    heading: 'ART',
    lines: [
      'Character & background art',
      'CraftPix.net',
    ],
    spaceBefore: 40,
  },
  {
    heading: 'AUDIO',
    lines: [
      'All music & sound effects',
      'procedurally synthesized',
      'using the Web Audio API',
    ],
    spaceBefore: 40,
  },
  {
    heading: 'GAME DESIGN & DEVELOPMENT',
    lines: [
      'Fantasy Fight Team',
    ],
    spaceBefore: 40,
  },
  {
    heading: 'SPECIAL THANKS',
    lines: [
      'The open-source community',
      'Phaser contributors',
      'Everyone who plays',
    ],
    spaceBefore: 40,
  },
  {
    heading: '',
    lines: [
      '— Thank you for playing —',
    ],
    spaceBefore: 60,
  },
];

export class CreditsScene extends Phaser.Scene {

  private _stage!: Stage;
  private _scrollX = 0;

  // ── Scrolling container ──
  private _scrollContainer!: Phaser.GameObjects.Container;
  private _scrollY = 0;           // current scroll position (0 = top)
  private _contentHeight = 0;     // total height of all credit text
  private _scrollSpeed = 42;      // px per second

  // ── Input ──
  private _escKey!:  Phaser.Input.Keyboard.Key;
  private _backKey!: Phaser.Input.Keyboard.Key;
  private _inputCooldown = 0;

  constructor() {
    super({ key: 'CreditsScene' });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────────────────────────────

  create(): void {
    const manifest = this.registry.get('manifest') as Manifest;

    // ── Backdrop ─────────────────────────────────────────────────────────────
    try {
      this._stage = new Stage(this, manifest, MENU_STAGE.stageId, MENU_STAGE.variant);
    } catch {
      // Missing assets — skip
    }

    // ── Overlays ─────────────────────────────────────────────────────────────
    this.add.rectangle(CX, H / 2, W, H, 0x000000, 0.70).setDepth(5);

    // Decorative gold border lines
    const g = this.add.graphics().setDepth(6);
    g.fillStyle(GOLD_NUM, 0.55); g.fillRect(0, 0, W, 3);
    g.fillStyle(GOLD_NUM, 0.55); g.fillRect(0, H - 3, W, 3);
    // Vertical panel lines
    g.fillStyle(GOLD_NUM, 0.25); g.fillRect(CX - 320, 0, 2, H);
    g.fillStyle(GOLD_NUM, 0.25); g.fillRect(CX + 318, 0, 2, H);

    // ── Top gradient mask (fade content in at top) ────────────────────────────
    // Drawn at high depth so it overlaps the scroll container
    const topFade = this.add.graphics().setDepth(50);
    for (let i = 0; i < 80; i++) {
      const alpha = 1 - i / 80;
      topFade.fillStyle(0x000000, alpha * 0.9);
      topFade.fillRect(0, i, W, 1);
    }

    // ── Bottom gradient + hint ────────────────────────────────────────────────
    const botFade = this.add.graphics().setDepth(50);
    for (let i = 0; i < 80; i++) {
      const alpha = i / 80;
      botFade.fillStyle(0x000000, alpha * 0.9);
      botFade.fillRect(0, H - 80 + i, W, 1);
    }

    this.add.text(CX, H - 28, 'Press any key or click to return to Main Menu', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#334455',
    }).setOrigin(0.5).setDepth(51);

    // ── Build scrollable content ──────────────────────────────────────────────
    this._buildScrollContent();

    // ── Input ─────────────────────────────────────────────────────────────────
    this._setupInput();

    this._inputCooldown = 400; // brief lock so we don't instantly leave
  }

  // ──────────────────────────────────────────────────────────────────────────
  // update
  // ──────────────────────────────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    // Drift backdrop
    this._scrollX += delta * 0.012;
    if (this._stage) this._stage.update(this._scrollX);

    // Auto-scroll credits upward
    this._scrollY += (this._scrollSpeed * delta) / 1000;
    // Clamp — stop a bit past the end so users can read the last line
    const maxScroll = this._contentHeight + H * 0.3;
    if (this._scrollY > maxScroll) this._scrollY = maxScroll;

    // Move the container upward (container.y decreases to scroll up)
    this._scrollContainer.y = H - this._scrollY;

    // If we've scrolled past all content, wait a moment then auto-return
    if (this._scrollY >= maxScroll) {
      this._scrollSpeed = 0; // pause
    }

    // Input
    this._inputCooldown = Math.max(0, this._inputCooldown - delta);

    const escPressed =
      Phaser.Input.Keyboard.JustDown(this._escKey) ||
      Phaser.Input.Keyboard.JustDown(this._backKey);

    if (this._inputCooldown <= 0 && escPressed) {
      this._leave();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Builders
  // ──────────────────────────────────────────────────────────────────────────

  private _buildScrollContent(): void {
    // We build all text objects into a Container, then scroll the container y.
    // Container starts at y=H (below viewport) and scrolls upward.
    this._scrollContainer = this.add.container(0, H).setDepth(20);

    let yOff = 40; // local y within the container, starting a bit below entry

    CREDIT_BLOCKS.forEach((block) => {
      yOff += block.spaceBefore ?? 0;

      if (block.heading) {
        const headStyle: Phaser.Types.GameObjects.Text.TextStyle = {
          fontFamily: '"Arial Black", Impact, sans-serif',
          fontSize: '28px',
          color: GOLD,
          stroke: '#000000',
          strokeThickness: 6,
          shadow: { offsetX: 0, offsetY: 0, color: EMBER, blur: 14, fill: true },
        };
        const ht = this.add.text(CX, yOff, block.heading, headStyle)
          .setOrigin(0.5, 0)
          .setDepth(20);
        this._scrollContainer.add(ht);
        yOff += 42;

        // Underline
        const ul = this.add.graphics().setDepth(20);
        ul.lineStyle(1, GOLD_NUM, 0.4);
        ul.lineBetween(CX - 200, yOff, CX + 200, yOff);
        this._scrollContainer.add(ul);
        yOff += 12;
      }

      block.lines.forEach((line) => {
        const isHighlight = line.startsWith('CraftPix') ||
                            line.startsWith('Phaser 3') ||
                            line.startsWith('Fantasy Fight') ||
                            line === '— Thank you for playing —';

        const style: Phaser.Types.GameObjects.Text.TextStyle = isHighlight
          ? {
              fontFamily: '"Arial Black", Impact, sans-serif',
              fontSize: '24px',
              color: '#ff9922',
              stroke: '#000000',
              strokeThickness: 4,
              shadow: { offsetX: 0, offsetY: 0, color: '#ff5500', blur: 10, fill: true },
            }
          : {
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontStyle: 'italic',
              fontSize: '20px',
              color: WHITE,
              stroke: '#000000',
              strokeThickness: 3,
            };

        const lt = this.add.text(CX, yOff, line, style)
          .setOrigin(0.5, 0)
          .setDepth(20);
        this._scrollContainer.add(lt);
        yOff += 32;
      });
    });

    this._contentHeight = yOff + 120; // extra trailing space
  }

  private _setupInput(): void {
    const kb = this.input.keyboard!;
    const KC = Phaser.Input.Keyboard.KeyCodes;
    this._escKey  = kb.addKey(KC.ESC);
    this._backKey = kb.addKey(KC.BACKSPACE);

    // Any key press returns to main menu
    kb.on('keydown', () => {
      if (this._inputCooldown > 0) return;
      this._leave();
    });

    // Pointer / click also returns
    this.input.on('pointerdown', () => {
      if (this._inputCooldown > 0) return;
      this._leave();
    });
  }

  private _leave(): void {
    playSfx('menu_move');
    this._stage?.destroy();
    this.scene.start('MainMenuScene');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Shutdown
  // ──────────────────────────────────────────────────────────────────────────

  shutdown(): void {
    this._stage?.destroy();
  }
}
