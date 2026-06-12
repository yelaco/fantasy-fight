/**
 * OptionsScene.ts — key: 'OptionsScene'
 *
 * Audio controls and AI difficulty selector.
 *
 * Controls:
 *   W / ↑ / S / ↓   — move between rows
 *   Left / Right (or A / D)  — adjust slider / cycle value
 *   Enter / Space / J       — toggle Mute
 *   Escape / Backspace      — back to MainMenuScene
 *
 * Volume setters persist immediately to localStorage (ff_audio) via AudioEngine.
 * Difficulty is saved via gameState.saveDefaultDifficulty (ff_prefs).
 *
 * Live feedback: a menu_move sfx blip plays on every volume change so the
 * user can hear the current level.
 */

import Phaser from 'phaser';
import { gameState } from '../game/state/GameState';
import { Stage } from '../game/stage/Stage';
import { MENU_STAGE } from '../game/stage/stageConfig';
import {
  setMasterVolume, getMasterVolume,
  setSfxVolume,    getSfxVolume,
  setMusicVolume,  getMusicVolume,
  setMuted,        isMuted,
  playSfx,
} from '../audio';
import type { Difficulty } from '../game/state/MatchConfig';
import type { Manifest } from '../types/manifest';

// ── Layout ────────────────────────────────────────────────────────────────────
const W  = 1280;
const H  = 720;
const CX = W / 2;

// ── Colours ───────────────────────────────────────────────────────────────────
const GOLD     = '#ffd700';
const GOLD_NUM = 0xffd700;
const EMBER    = '#ff8800';
const DIM      = '#667788';
const WHITE    = '#e8e8e8';

// ── Slider step ───────────────────────────────────────────────────────────────
const VOL_STEP = 0.05;

// ── Row descriptors ───────────────────────────────────────────────────────────
type RowKind = 'volume' | 'mute' | 'difficulty';

interface VolumeRow {
  kind: 'volume';
  label: string;
  get: () => number;
  set: (v: number) => void;
}
interface MuteRow   { kind: 'mute'; label: string }
interface DiffRow   { kind: 'difficulty'; label: string }

type Row = VolumeRow | MuteRow | DiffRow;

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const DIFF_LABELS: Record<Difficulty, string> = {
  easy:   'Easy',
  medium: 'Medium',
  hard:   'Hard',
};

export class OptionsScene extends Phaser.Scene {

  private _stage!: Stage;
  private _scrollX = 0;

  // ── Rows ──
  private _rows: Row[] = [];
  private _rowIndex = 0;

  // ── Rendered objects (rebuilt on each re-render) ──
  private _rowObjects: Phaser.GameObjects.GameObject[] = [];

  // ── Input ──
  private _upKey!:    Phaser.Input.Keyboard.Key;
  private _downKey!:  Phaser.Input.Keyboard.Key;
  private _wKey!:     Phaser.Input.Keyboard.Key;
  private _sKey!:     Phaser.Input.Keyboard.Key;
  private _leftKey!:  Phaser.Input.Keyboard.Key;
  private _rightKey!: Phaser.Input.Keyboard.Key;
  private _aKey!:     Phaser.Input.Keyboard.Key;
  private _dKey!:     Phaser.Input.Keyboard.Key;
  private _enterKey!: Phaser.Input.Keyboard.Key;
  private _spaceKey!: Phaser.Input.Keyboard.Key;
  private _jKey!:     Phaser.Input.Keyboard.Key;
  private _escKey!:   Phaser.Input.Keyboard.Key;
  private _backKey!:  Phaser.Input.Keyboard.Key;
  private _cursors!:  Phaser.Types.Input.Keyboard.CursorKeys;

  private _inputCooldown = 0;

  constructor() {
    super({ key: 'OptionsScene' });
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
    this.add.rectangle(CX, H / 2, W, H, 0x000000, 0.65).setDepth(5);

    // Panel background
    this.add.rectangle(CX, H / 2 + 20, 620, 520, 0x0a0a18, 0.88)
      .setDepth(6)
      .setStrokeStyle(2, GOLD_NUM, 0.7);

    // ── Decor lines ───────────────────────────────────────────────────────────
    const g = this.add.graphics().setDepth(6);
    g.fillStyle(GOLD_NUM, 0.6); g.fillRect(0, 0, W, 3);
    g.fillStyle(GOLD_NUM, 0.6); g.fillRect(0, H - 3, W, 3);

    // ── Title ─────────────────────────────────────────────────────────────────
    this.add.text(CX, 60, 'OPTIONS', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '64px',
      color: GOLD,
      stroke: '#000000',
      strokeThickness: 8,
      shadow: { offsetX: 0, offsetY: 0, color: EMBER, blur: 24, fill: true },
    }).setOrigin(0.5).setDepth(10);

    // ── Section header ────────────────────────────────────────────────────────
    this.add.text(CX - 280, 148, 'AUDIO', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '16px',
      color: EMBER,
      letterSpacing: 4,
    }).setDepth(10);

    this.add.text(CX - 280, 365, 'GAMEPLAY', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '16px',
      color: EMBER,
      letterSpacing: 4,
    }).setDepth(10);

    // Separator lines
    const sg = this.add.graphics().setDepth(10);
    sg.lineStyle(1, GOLD_NUM, 0.3);
    sg.lineBetween(CX - 280, 158, CX + 280, 158);
    sg.lineBetween(CX - 280, 375, CX + 280, 375);

    // ── Define rows ───────────────────────────────────────────────────────────
    this._rows = [
      { kind: 'volume', label: 'Master Volume', get: getMasterVolume, set: setMasterVolume },
      { kind: 'volume', label: 'SFX Volume',    get: getSfxVolume,    set: setSfxVolume    },
      { kind: 'volume', label: 'Music Volume',  get: getMusicVolume,  set: setMusicVolume  },
      { kind: 'mute',   label: 'Mute All'                                                  },
      { kind: 'difficulty', label: 'AI Difficulty'                                         },
    ];

    // ── Render rows ───────────────────────────────────────────────────────────
    this._renderRows();

    // ── Back hint ─────────────────────────────────────────────────────────────
    this.add.text(CX, H - 32, 'W/S or ↑↓ to move   ◀/▶ or A/D to adjust   Esc to go back', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#334455',
    }).setOrigin(0.5).setDepth(20);

    // ── Input ─────────────────────────────────────────────────────────────────
    this._setupInput();
    this._inputCooldown = 300;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // update
  // ──────────────────────────────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    // Drift backdrop
    this._scrollX += delta * 0.012;
    if (this._stage) this._stage.update(this._scrollX);

    this._inputCooldown = Math.max(0, this._inputCooldown - delta);
    if (this._inputCooldown > 0) return;

    const upPressed =
      Phaser.Input.Keyboard.JustDown(this._upKey) ||
      Phaser.Input.Keyboard.JustDown(this._wKey) ||
      (this._cursors && Phaser.Input.Keyboard.JustDown(this._cursors.up));
    const downPressed =
      Phaser.Input.Keyboard.JustDown(this._downKey) ||
      Phaser.Input.Keyboard.JustDown(this._sKey) ||
      (this._cursors && Phaser.Input.Keyboard.JustDown(this._cursors.down));
    const leftPressed =
      Phaser.Input.Keyboard.JustDown(this._leftKey) ||
      Phaser.Input.Keyboard.JustDown(this._aKey) ||
      (this._cursors && Phaser.Input.Keyboard.JustDown(this._cursors.left));
    const rightPressed =
      Phaser.Input.Keyboard.JustDown(this._rightKey) ||
      Phaser.Input.Keyboard.JustDown(this._dKey) ||
      (this._cursors && Phaser.Input.Keyboard.JustDown(this._cursors.right));
    const confirmPressed =
      Phaser.Input.Keyboard.JustDown(this._enterKey) ||
      Phaser.Input.Keyboard.JustDown(this._spaceKey) ||
      Phaser.Input.Keyboard.JustDown(this._jKey);
    const backPressed =
      Phaser.Input.Keyboard.JustDown(this._escKey) ||
      Phaser.Input.Keyboard.JustDown(this._backKey);

    if (backPressed) {
      playSfx('menu_move');
      this._inputCooldown = 300;
      this._leave();
      return;
    }

    if (upPressed) {
      this._rowIndex = (this._rowIndex - 1 + this._rows.length) % this._rows.length;
      playSfx('menu_move');
      this._renderRows();
      this._inputCooldown = 130;
      return;
    }

    if (downPressed) {
      this._rowIndex = (this._rowIndex + 1) % this._rows.length;
      playSfx('menu_move');
      this._renderRows();
      this._inputCooldown = 130;
      return;
    }

    const row = this._rows[this._rowIndex];
    if (!row) return;

    if (row.kind === 'volume') {
      if (leftPressed || rightPressed) {
        const delta = rightPressed ? VOL_STEP : -VOL_STEP;
        const next = Math.max(0, Math.min(1, row.get() + delta));
        row.set(next);
        playSfx('menu_move'); // audible feedback at new level
        this._renderRows();
        this._inputCooldown = 80;
      }
    } else if (row.kind === 'mute') {
      if (confirmPressed || leftPressed || rightPressed) {
        setMuted(!isMuted());
        playSfx('menu_move');
        this._renderRows();
        this._inputCooldown = 200;
      }
    } else if (row.kind === 'difficulty') {
      if (leftPressed || rightPressed) {
        const cur = DIFFICULTIES.indexOf(gameState.defaultDifficulty);
        const next = rightPressed
          ? (cur + 1) % DIFFICULTIES.length
          : (cur - 1 + DIFFICULTIES.length) % DIFFICULTIES.length;
        gameState.saveDefaultDifficulty(DIFFICULTIES[next]!);
        playSfx('menu_move');
        this._renderRows();
        this._inputCooldown = 130;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Rendering
  // ──────────────────────────────────────────────────────────────────────────

  private _renderRows(): void {
    this._rowObjects.forEach(o => (o as Phaser.GameObjects.Text).destroy());
    this._rowObjects = [];

    const startY = 180;
    const spacing = 66;

    this._rows.forEach((row, i) => {
      const y = startY + i * spacing;
      const isSelected = i === this._rowIndex;

      // Selection highlight
      if (isSelected) {
        const hl = this.add.rectangle(CX, y, 580, 54, GOLD_NUM, 0.10)
          .setDepth(9)
          .setStrokeStyle(1, GOLD_NUM, 0.6);
        this._rowObjects.push(hl);
      }

      // Row label
      const labelTxt = this.add.text(CX - 260, y, row.label, {
        fontFamily: '"Arial Black", Impact, sans-serif',
        fontSize: '22px',
        color: isSelected ? GOLD : WHITE,
        stroke: '#000000',
        strokeThickness: 4,
      }).setOrigin(0, 0.5).setDepth(15);
      this._rowObjects.push(labelTxt);

      if (row.kind === 'volume') {
        this._renderVolumeStepper(row, y, isSelected);
      } else if (row.kind === 'mute') {
        this._renderMuteToggle(y, isSelected);
      } else if (row.kind === 'difficulty') {
        this._renderDifficultyCycler(y, isSelected);
      }
    });
  }

  private _renderVolumeStepper(row: VolumeRow, y: number, isSelected: boolean): void {
    const pct = row.get();
    const trackW = 260;
    const trackX = CX + 10;

    // Track background
    const trackBg = this.add.rectangle(trackX + trackW / 2, y, trackW, 10, 0x222233, 1)
      .setDepth(15);
    this._rowObjects.push(trackBg);

    // Fill
    const fillW = Math.max(2, trackW * pct);
    const fillColor = isSelected ? GOLD_NUM : 0x886600;
    const fill = this.add.rectangle(trackX + fillW / 2, y, fillW, 10, fillColor, 1)
      .setDepth(16);
    this._rowObjects.push(fill);

    // Thumb knob
    const thumbX = trackX + trackW * pct;
    const thumb = this.add.circle(thumbX, y, 9, isSelected ? GOLD_NUM : 0xaa9900, 1)
      .setDepth(17)
      .setStrokeStyle(2, 0x000000, 0.8);
    this._rowObjects.push(thumb);

    // Percentage label
    const pctLabel = this.add.text(trackX + trackW + 14, y, `${Math.round(pct * 100)}%`, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: isSelected ? GOLD : DIM,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(16);
    this._rowObjects.push(pctLabel);

    // ◀ ▶ arrows
    if (isSelected) {
      const left = this.add.text(trackX - 16, y, '◀', {
        fontFamily: '"Arial Black"',
        fontSize: '18px',
        color: GOLD,
      }).setOrigin(0.5).setDepth(17);
      const right = this.add.text(trackX + trackW + 60, y, '▶', {
        fontFamily: '"Arial Black"',
        fontSize: '18px',
        color: GOLD,
      }).setOrigin(0.5).setDepth(17);
      this._rowObjects.push(left, right);
    }
  }

  private _renderMuteToggle(y: number, isSelected: boolean): void {
    const muted = isMuted();
    const pill = this.add
      .rectangle(CX + 130, y, 120, 34, muted ? 0x661111 : 0x114411, 1)
      .setDepth(15)
      .setStrokeStyle(2, isSelected ? GOLD_NUM : 0x555566, 0.9);
    this._rowObjects.push(pill);

    const pillLabel = this.add.text(CX + 130, y, muted ? 'ON' : 'OFF', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '18px',
      color: muted ? '#ff4444' : '#44ff88',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(16);
    this._rowObjects.push(pillLabel);

    if (isSelected) {
      const hint = this.add.text(CX + 220, y, '← Enter →', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: GOLD,
      }).setOrigin(0, 0.5).setDepth(16);
      this._rowObjects.push(hint);
    }
  }

  private _renderDifficultyCycler(y: number, isSelected: boolean): void {
    const cur = gameState.defaultDifficulty;
    const colors: Record<Difficulty, string> = {
      easy:   '#44ff88',
      medium: '#ffaa00',
      hard:   '#ff4444',
    };

    if (isSelected) {
      const leftArrow = this.add.text(CX + 60, y, '◀', {
        fontFamily: '"Arial Black"',
        fontSize: '20px',
        color: GOLD,
      }).setOrigin(0.5).setDepth(17);
      this._rowObjects.push(leftArrow);
    }

    const valTxt = this.add.text(CX + 130, y, DIFF_LABELS[cur], {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '22px',
      color: colors[cur],
      stroke: '#000000',
      strokeThickness: 4,
      shadow: { offsetX: 0, offsetY: 0, color: colors[cur], blur: 8, fill: true },
    }).setOrigin(0.5).setDepth(16);
    this._rowObjects.push(valTxt);

    if (isSelected) {
      const rightArrow = this.add.text(CX + 200, y, '▶', {
        fontFamily: '"Arial Black"',
        fontSize: '20px',
        color: GOLD,
      }).setOrigin(0.5).setDepth(17);
      this._rowObjects.push(rightArrow);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Input
  // ──────────────────────────────────────────────────────────────────────────

  private _setupInput(): void {
    const kb = this.input.keyboard!;
    const KC = Phaser.Input.Keyboard.KeyCodes;
    this._cursors   = kb.createCursorKeys();
    this._upKey     = kb.addKey(KC.UP);
    this._downKey   = kb.addKey(KC.DOWN);
    this._leftKey   = kb.addKey(KC.LEFT);
    this._rightKey  = kb.addKey(KC.RIGHT);
    this._wKey      = kb.addKey(KC.W);
    this._sKey      = kb.addKey(KC.S);
    this._aKey      = kb.addKey(KC.A);
    this._dKey      = kb.addKey(KC.D);
    this._enterKey  = kb.addKey(KC.ENTER);
    this._spaceKey  = kb.addKey(KC.SPACE);
    this._jKey      = kb.addKey(KC.J);
    this._escKey    = kb.addKey(KC.ESC);
    this._backKey   = kb.addKey(KC.BACKSPACE);
  }

  private _leave(): void {
    this._stage?.destroy();
    this.scene.start('MainMenuScene');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Shutdown
  // ──────────────────────────────────────────────────────────────────────────

  shutdown(): void {
    this._stage?.destroy();
    this._rowObjects.forEach(o => (o as Phaser.GameObjects.Text).destroy());
    this._rowObjects = [];
  }
}
