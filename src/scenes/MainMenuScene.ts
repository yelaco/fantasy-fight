/**
 * MainMenuScene.ts — key: 'MainMenuScene'
 *
 * Arcade front-end for Fantasy Fight.
 *
 * AUDIO GESTURE NOTE:
 *   Web AudioContext requires a user gesture before audio can play.
 *   We show a "Press any key" hint until the first key/pointer event,
 *   then call resumeAudio() + playMusic('menu').
 *
 * SINGLE PLAYER ROUTING:
 *   Single Player (1P vs CPU) sets mode='arcade' via gameState.patch and
 *   routes to 'CharacterSelectScene'.  FightScene treats mode='arcade' as
 *   P1 human / P2 AI automatically — no extra flag needed.
 *   This is the cleanest approach because FightScene's AI branch is:
 *     cfg.mode === 'arcade'  → P2 = AIController
 *   A registry flag 'p2IsCpu' is also set (true) so CharacterSelect can
 *   optionally display messaging, though it does not change fight logic.
 *
 * VERSUS ROUTING:
 *   Sets mode='versus' — both P1 and P2 are human InputManagers in FightScene.
 *   registry 'p2IsCpu' is set false.
 *
 * ARCADE ROUTING:
 *   Sets mode='arcade', starts the full ladder (gameState.startArcade).
 *   registry 'p2IsCpu' = true (AI).
 */

import Phaser from 'phaser';
import { gameState } from '../game/state/GameState';
import { Stage } from '../game/stage/Stage';
import { MENU_STAGE } from '../game/stage/stageConfig';
import {
  resumeAudio,
  playMusic,
  playSfx,
} from '../audio';
import type { Manifest } from '../types/manifest';

// ── Layout constants ──────────────────────────────────────────────────────────
const W = 1280;
const H = 720;
const CX = W / 2;

// ── Colours ───────────────────────────────────────────────────────────────────
const GOLD        = '#ffd700';
const GOLD_NUM    = 0xffd700;
const EMBER       = '#ff8800';
const DIM         = '#667788';
const WHITE       = '#ffffff';
const SELECTED_BG = 0xffd700;

// ── Menu items ────────────────────────────────────────────────────────────────
interface MenuItem {
  label: string;
  action: () => void;
}

export class MainMenuScene extends Phaser.Scene {

  // ── State ──
  private _stage!: Stage;
  private _scrollX = 0;                // ambient parallax drift
  private _audioUnlocked = false;

  // ── Menu ──
  private _items: MenuItem[] = [];
  private _index = 0;
  private _itemTexts: Phaser.GameObjects.Text[] = [];
  private _itemHighlights: Phaser.GameObjects.Rectangle[] = [];

  // ── Title ──
  private _titleText!: Phaser.GameObjects.Text;

  // ── Hint ──
  private _hintText!: Phaser.GameObjects.Text;

  // ── Input cooldown ──
  private _inputCooldown = 0;

  // ── Keys ──
  private _upKey!: Phaser.Input.Keyboard.Key;
  private _downKey!: Phaser.Input.Keyboard.Key;
  private _wKey!: Phaser.Input.Keyboard.Key;
  private _sKey!: Phaser.Input.Keyboard.Key;
  private _enterKey!: Phaser.Input.Keyboard.Key;
  private _spaceKey!: Phaser.Input.Keyboard.Key;
  private _jKey!: Phaser.Input.Keyboard.Key;
  private _cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super({ key: 'MainMenuScene' });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────────────────────────────

  create(): void {
    const manifest = this.registry.get('manifest') as Manifest;

    // ── Parallax backdrop ────────────────────────────────────────────────────
    try {
      this._stage = new Stage(this, manifest, MENU_STAGE.stageId, MENU_STAGE.variant);
    } catch (e) {
      console.warn('[MainMenuScene] Stage backdrop failed:', e);
    }

    // ── Dark overlay to keep text readable ───────────────────────────────────
    this.add.rectangle(CX, H / 2, W, H, 0x000000, 0.55).setDepth(5);

    // ── Decorative ember lines ───────────────────────────────────────────────
    this._buildDecorLines();

    // ── Title ────────────────────────────────────────────────────────────────
    this._buildTitle();

    // ── Subtitle ─────────────────────────────────────────────────────────────
    this.add.text(CX, 180, '— THE TOURNAMENT AWAITS —', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '18px',
      color: EMBER,
      letterSpacing: 6,
      stroke: '#000000',
      strokeThickness: 4,
      shadow: { offsetX: 0, offsetY: 2, color: '#cc4400', blur: 6, fill: true },
    }).setOrigin(0.5).setDepth(10).setAlpha(0);
    const sub = this.children.getAll().slice(-1)[0] as Phaser.GameObjects.Text;
    this.tweens.add({ targets: sub, alpha: 1, duration: 600, delay: 600 });

    // ── Build menu items ─────────────────────────────────────────────────────
    this._buildMenuItems();
    this._renderMenu();

    // ── Hint text (pre-audio-gesture) ────────────────────────────────────────
    this._hintText = this.add.text(CX, H - 28, 'Press any key or click to start', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#445566',
    }).setOrigin(0.5).setDepth(20);

    this.tweens.add({
      targets: this._hintText,
      alpha: 0.3,
      yoyo: true,
      repeat: -1,
      duration: 900,
      ease: 'Sine.easeInOut',
    });

    // ── Control hint ─────────────────────────────────────────────────────────
    this.add.text(CX, H - 52, 'W / ↑↓ Move   Enter / Space / J Confirm   Mouse hover+click', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#334455',
    }).setOrigin(0.5).setDepth(20);

    // ── Input setup ──────────────────────────────────────────────────────────
    this._setupInput();

    // ── Brief cooldown so we don't instantly re-trigger from previous scene ──
    this._inputCooldown = 300;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // update
  // ──────────────────────────────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    // Slowly drift the parallax backdrop
    this._scrollX += delta * 0.015; // ~1px per 67ms
    if (this._stage) {
      this._stage.update(this._scrollX);
    }

    this._inputCooldown = Math.max(0, this._inputCooldown - delta);
    if (this._inputCooldown > 0) return;

    // ── Keyboard navigation ──────────────────────────────────────────────────
    const upPressed =
      Phaser.Input.Keyboard.JustDown(this._upKey) ||
      Phaser.Input.Keyboard.JustDown(this._wKey) ||
      (this._cursors && Phaser.Input.Keyboard.JustDown(this._cursors.up));
    const downPressed =
      Phaser.Input.Keyboard.JustDown(this._downKey) ||
      Phaser.Input.Keyboard.JustDown(this._sKey) ||
      (this._cursors && Phaser.Input.Keyboard.JustDown(this._cursors.down));
    const confirmPressed =
      Phaser.Input.Keyboard.JustDown(this._enterKey) ||
      Phaser.Input.Keyboard.JustDown(this._spaceKey) ||
      Phaser.Input.Keyboard.JustDown(this._jKey);

    if (upPressed) {
      this._unlockAudio();
      this._index = (this._index - 1 + this._items.length) % this._items.length;
      playSfx('menu_move');
      this._renderMenu();
      this._inputCooldown = 130;
    } else if (downPressed) {
      this._unlockAudio();
      this._index = (this._index + 1) % this._items.length;
      playSfx('menu_move');
      this._renderMenu();
      this._inputCooldown = 130;
    } else if (confirmPressed) {
      this._unlockAudio();
      playSfx('menu_confirm');
      this._inputCooldown = 400;
      this._items[this._index]?.action();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Builders
  // ──────────────────────────────────────────────────────────────────────────

  private _buildDecorLines(): void {
    const g = this.add.graphics().setDepth(6);
    // Top ember glow line
    g.fillStyle(GOLD_NUM, 0.6);
    g.fillRect(0, 0, W, 3);
    g.fillStyle(0xff6600, 0.25);
    g.fillRect(0, 3, W, 8);
    // Bottom line
    g.fillStyle(GOLD_NUM, 0.6);
    g.fillRect(0, H - 3, W, 3);
    g.fillStyle(0xff6600, 0.25);
    g.fillRect(0, H - 11, W, 8);
    // Flank lines for menu panel
    g.fillStyle(GOLD_NUM, 0.35);
    g.fillRect(CX - 270, 210, 2, 430);
    g.fillRect(CX + 268, 210, 2, 430);
  }

  private _buildTitle(): void {
    // Shadow layer
    this.add.text(CX + 4, 104, 'FANTASY FIGHT', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '96px',
      color: '#330000',
    }).setOrigin(0.5).setDepth(9).setAlpha(0.6);

    // Main title
    this._titleText = this.add.text(CX, 100, 'FANTASY FIGHT', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '96px',
      color: GOLD,
      stroke: '#000000',
      strokeThickness: 10,
      shadow: {
        offsetX: 0,
        offsetY: 0,
        color: EMBER,
        blur: 32,
        fill: true,
      },
    }).setOrigin(0.5).setDepth(10);

    // Entrance scale-in
    this._titleText.setScale(0.5).setAlpha(0);
    this.tweens.add({
      targets: this._titleText,
      scale: 1,
      alpha: 1,
      duration: 700,
      ease: 'Back.easeOut',
    });

    // Continuous float tween
    this.tweens.add({
      targets: this._titleText,
      y: 94,
      yoyo: true,
      repeat: -1,
      duration: 2200,
      ease: 'Sine.easeInOut',
      delay: 800,
    });

    // Subtle pulse on scale
    this.tweens.add({
      targets: this._titleText,
      scaleX: 1.025,
      scaleY: 1.025,
      yoyo: true,
      repeat: -1,
      duration: 1800,
      ease: 'Sine.easeInOut',
      delay: 800,
    });
  }

  private _buildMenuItems(): void {
    this._items = [
      {
        label: 'Arcade',
        action: () => {
          // Full arcade ladder: P1 human, P2 AI, ladder progression
          gameState.patch({ mode: 'arcade', difficulty: gameState.defaultDifficulty });
          gameState.startArcade('', gameState.defaultDifficulty);
          this.registry.set('p2IsCpu', true);
          this._goTo('CharacterSelectScene');
        },
      },
      {
        label: 'Versus',
        action: () => {
          // Local 2P human vs human
          gameState.patch({ mode: 'versus' });
          this.registry.set('p2IsCpu', false);
          this._goTo('CharacterSelectScene');
        },
      },
      {
        label: 'Single Player',
        action: () => {
          // 1P vs CPU — single fight, no ladder.
          // mode='arcade' makes FightScene assign P2 as AIController.
          // p2IsCpu=true signals CharacterSelect to auto-assign a CPU opponent.
          // The distinction from full Arcade is that arcadeIndex/arcadeCleared
          // won't accumulate (CharSelect/FightScene handles one match then Victory).
          gameState.patch({ mode: 'arcade', difficulty: gameState.defaultDifficulty });
          this.registry.set('p2IsCpu', true);
          this._goTo('CharacterSelectScene');
        },
      },
      {
        label: 'Training',
        action: () => {
          gameState.patch({ mode: 'training' });
          this.registry.set('p2IsCpu', false);
          this._goTo('CharacterSelectScene');
        },
      },
      {
        label: 'Options',
        action: () => this._goTo('OptionsScene'),
      },
      {
        label: 'Credits',
        action: () => this._goTo('CreditsScene'),
      },
    ];
  }

  private _renderMenu(): void {
    // Destroy previous items
    this._itemTexts.forEach(t => t.destroy());
    this._itemHighlights.forEach(r => r.destroy());
    this._itemTexts = [];
    this._itemHighlights = [];

    const menuStartY = 252;
    const spacing = 62;

    this._items.forEach((item, i) => {
      const y = menuStartY + i * spacing;
      const isSelected = i === this._index;

      // Highlight bar
      if (isSelected) {
        const bar = this.add.rectangle(CX, y, 500, 50, SELECTED_BG, 0.13)
          .setDepth(9)
          .setStrokeStyle(1.5, GOLD_NUM, 0.8);
        this._itemHighlights.push(bar);
      }

      // Item text
      const txt = this.add.text(CX, y, item.label, {
        fontFamily: '"Arial Black", Impact, sans-serif',
        fontSize: isSelected ? '34px' : '28px',
        color: isSelected ? GOLD : '#aabbcc',
        stroke: '#000000',
        strokeThickness: isSelected ? 6 : 4,
        shadow: isSelected
          ? { offsetX: 0, offsetY: 0, color: EMBER, blur: 14, fill: false }
          : undefined,
      })
        .setOrigin(0.5)
        .setDepth(15)
        .setInteractive({ useHandCursor: true });

      txt.on('pointerover', () => {
        if (i !== this._index) {
          this._unlockAudio();
          this._index = i;
          playSfx('menu_move');
          this._renderMenu();
        }
      });

      txt.on('pointerdown', () => {
        this._unlockAudio();
        playSfx('menu_confirm');
        this._inputCooldown = 400;
        this._items[i]?.action();
      });

      this._itemTexts.push(txt);

      // Arrow indicator
      if (isSelected) {
        const arrow = this.add.text(CX - 265, y, '▶', {
          fontFamily: '"Arial Black", Impact, sans-serif',
          fontSize: '22px',
          color: GOLD,
          stroke: '#000000',
          strokeThickness: 4,
          shadow: { offsetX: 0, offsetY: 0, color: EMBER, blur: 8, fill: true },
        }).setOrigin(0.5).setDepth(15);

        this.tweens.add({
          targets: arrow,
          x: CX - 256,
          yoyo: true,
          repeat: -1,
          duration: 380,
          ease: 'Sine.easeInOut',
        });

        this._itemTexts.push(arrow);
      }
    });
  }

  private _setupInput(): void {
    const kb = this.input.keyboard!;
    const KC = Phaser.Input.Keyboard.KeyCodes;
    this._cursors  = kb.createCursorKeys();
    this._upKey    = kb.addKey(KC.UP);
    this._downKey  = kb.addKey(KC.DOWN);
    this._wKey     = kb.addKey(KC.W);
    this._sKey     = kb.addKey(KC.S);
    this._enterKey = kb.addKey(KC.ENTER);
    this._spaceKey = kb.addKey(KC.SPACE);
    this._jKey     = kb.addKey(KC.J);

    // Any key or pointer → unlock audio (first gesture)
    this.input.keyboard!.on('keydown', () => this._unlockAudio());
    this.input.on('pointerdown', () => this._unlockAudio());
  }

  private _unlockAudio(): void {
    if (this._audioUnlocked) return;
    this._audioUnlocked = true;
    resumeAudio();
    playMusic('menu');
    // Hide the "Press any key" hint
    if (this._hintText) this._hintText.setVisible(false);
  }

  private _goTo(sceneKey: string): void {
    this._stage?.destroy();
    this.scene.start(sceneKey);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Shutdown
  // ──────────────────────────────────────────────────────────────────────────

  shutdown(): void {
    this._stage?.destroy();
    this._itemTexts.forEach(t => t.destroy());
    this._itemHighlights.forEach(r => r.destroy());
    this._itemTexts = [];
    this._itemHighlights = [];
  }
}
