/**
 * CharacterSelectScene.ts — key: 'CharacterSelectScene'
 *
 * LAYOUT
 * ------
 * 7 columns × 3 rows = 21 cells, centered horizontally.
 * Each cell: idle sprite (${id}__idle anim) + name label below.
 * Left panel (P1 preview) · Center grid · Right panel (P2 preview).
 *
 * CURSORS & ROUTING
 * -----------------
 * VERSUS / TRAINING (p2IsCpu=false):
 *   Two independent cursors (P1=blue, P2=red). Both must lock in.
 *   → StageSelectScene
 *
 * ARCADE (mode='arcade', p2IsCpu=true):
 *   Single P1 cursor only. P2 is the ArcadeManager ladder.
 *   On confirm: beginArcade(p1Id, difficulty) → FightScene directly.
 *
 * SINGLE PLAYER (mode='arcade', p2IsCpu=true, arcadeIndex=0 pre-started):
 *   Same as arcade path — beginArcade handles the ladder state.
 *
 * TRAINING with p2IsCpu=true (edge case — treated as two-cursor, same as versus).
 *   Actually MainMenu sets p2IsCpu=false for training, so this branch won't fire.
 *
 * ESC → back to MainMenuScene.
 */

import Phaser from 'phaser';
import { ALL_IDS, getFighter, DEFAULT_P1, DEFAULT_P2 } from '../data/roster';
import { gameState } from '../game/state/GameState';
import { playSfx } from '../audio';
import { P1_BINDINGS, P2_BINDINGS } from '../input';
import { beginArcade } from '../game/systems/ArcadeManager';

// ── Layout ─────────────────────────────────────────────────────────────────────
const W = 1280;
const H = 720;

const COLS = 7;
const ROWS = 3; // 7 × 3 = 21

const CELL_W = 108;
const CELL_H = 118;
const CELL_GAP_X = 10;
const CELL_GAP_Y = 10;

const GRID_W = COLS * CELL_W + (COLS - 1) * CELL_GAP_X; // 796
const GRID_H = ROWS * CELL_H + (ROWS - 1) * CELL_GAP_Y; // 374
const GRID_X = (W - GRID_W) / 2; // ~242
const GRID_Y = 180; // top of grid

const PREVIEW_W = 210;
const PREVIEW_H = 340;

// P1 preview: right-aligned to just before the grid
const P1_PANEL_X = GRID_X / 2; // ~121
// P2 preview: centred in the right margin
const P2_PANEL_X = W - GRID_X / 2; // ~1159

// ── Colours ───────────────────────────────────────────────────────────────────
const COL_GOLD    = 0xffd700;
const COL_BG      = 0x0a0c14;
const COL_PANEL   = 0x111622;
const COL_CELL    = 0x161e2c;
const COL_HOVER   = 0x22304a;
const COL_P1      = 0x2288ff;
const COL_P2      = 0xff2233;
const COL_LOCKED  = 0x22cc66;

const DEPTH_BG   = 0;
const DEPTH_GRID = 5;
const DEPTH_UI   = 10;
const DEPTH_CURSOR = 12;
const DEPTH_PREVIEW = 8;
const DEPTH_BADGE = 15;

// ── Families (for section dividers) ──────────────────────────────────────────
const FAMILY_LABELS = [
  'Gorgons', 'Minotaurs', 'Ninjas', 'Samurai', 'Skeletons', 'Werewolves', 'Wizards',
];

// ── Input cooldown (ms) ───────────────────────────────────────────────────────
const INPUT_COOLDOWN = 130;

// ── Cursor state ─────────────────────────────────────────────────────────────
interface CursorState {
  col: number;
  row: number;
  locked: boolean;
  lockedIdx: number;
}

// ── Preview panel objects ─────────────────────────────────────────────────────
interface PreviewPanel {
  sprite: Phaser.GameObjects.Sprite | null;
  nameText: Phaser.GameObjects.Text;
  archetypeText: Phaser.GameObjects.Text;
  loreText: Phaser.GameObjects.Text;
  currentId: string;
}

export class CharacterSelectScene extends Phaser.Scene {

  // ── Mode ──
  private _isTwoPlayer = false; // true = versus/training two-cursor mode

  // ── Cursors ──
  private _p1: CursorState = { col: 0, row: 0, locked: false, lockedIdx: 0 };
  private _p2: CursorState = { col: 6, row: 2, locked: false, lockedIdx: 20 };

  // ── Input cooldowns (per-player) ──
  private _p1Cool = 0;
  private _p2Cool = 0;
  private _escCool = 0;

  // ── Keys ──
  private _keys!: Record<string, Phaser.Input.Keyboard.Key>;

  // ── Cell graphics ──
  private _cellBgs: Phaser.GameObjects.Rectangle[] = [];
  private _cellSprites: (Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle)[] = [];
  private _cellNames: Phaser.GameObjects.Text[] = [];

  // ── Cursor rings ──
  private _p1Ring!: Phaser.GameObjects.Rectangle;
  private _p2Ring!: Phaser.GameObjects.Rectangle;

  // ── Locked-badge texts ──
  private _p1Badge: Phaser.GameObjects.Text | null = null;
  private _p2Badge: Phaser.GameObjects.Text | null = null;

  // ── Preview panels ──
  private _p1Preview!: PreviewPanel;
  private _p2Preview!: PreviewPanel;

  // ── Ready overlay ──
  private _readyText: Phaser.GameObjects.Text | null = null;

  // ── Glow tweens ──
  private _glowTween: Phaser.Tweens.Tween | null = null;

  constructor() {
    super({ key: 'CharacterSelectScene' });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────────────────────────────

  create(): void {
    const mode = gameState.config.mode;
    const p2IsCpu = this.registry.get('p2IsCpu') as boolean;

    // Two-player cursors for versus + training (when both players are human)
    this._isTwoPlayer = (mode === 'versus' || mode === 'training') && !p2IsCpu;

    // Set initial cursor positions
    const p1DefaultIdx = ALL_IDS.indexOf(DEFAULT_P1);
    const p2DefaultIdx = ALL_IDS.indexOf(DEFAULT_P2);

    this._p1.col = (p1DefaultIdx >= 0 ? p1DefaultIdx : 0) % COLS;
    this._p1.row = Math.floor((p1DefaultIdx >= 0 ? p1DefaultIdx : 0) / COLS);

    this._p2.col = (p2DefaultIdx >= 0 ? p2DefaultIdx : COLS - 1) % COLS;
    this._p2.row = Math.floor((p2DefaultIdx >= 0 ? p2DefaultIdx : ALL_IDS.length - 1) / COLS);

    this._buildBackground();
    this._buildGrid();
    this._buildCursors();
    this._buildPreviewPanels();
    this._buildHeader();
    this._buildControlHints();
    this._setupKeys();

    // Initial preview render
    this._refreshPreviews();

    // Brief cooldown to prevent accidental confirm from prior scene
    this._p1Cool = 300;
    this._p2Cool = 300;
    this._escCool = 300;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // update
  // ──────────────────────────────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    this._p1Cool  = Math.max(0, this._p1Cool - delta);
    this._p2Cool  = Math.max(0, this._p2Cool - delta);
    this._escCool = Math.max(0, this._escCool - delta);

    this._handleP1Input();
    if (this._isTwoPlayer) {
      this._handleP2Input();
    }
    this._handleEsc();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Background
  // ──────────────────────────────────────────────────────────────────────────

  private _buildBackground(): void {
    // Deep dark base
    this.add.rectangle(W / 2, H / 2, W, H, COL_BG).setDepth(DEPTH_BG);

    // Horizontal scanline texture (procedural)
    const g = this.add.graphics().setDepth(DEPTH_BG + 1);
    g.lineStyle(1, 0x1a2540, 0.4);
    for (let y = 0; y < H; y += 6) {
      g.lineBetween(0, y, W, y);
    }

    // Subtle radial vignette — two gradients from corners
    const vg = this.add.graphics().setDepth(DEPTH_BG + 2);
    // Top-centre gold accent band
    vg.fillGradientStyle(0x0a0c14, 0x0a0c14, 0x1a1e30, 0x1a1e30, 0.9);
    vg.fillRect(0, 0, W, 100);
    vg.fillGradientStyle(0x1a1e30, 0x1a1e30, 0x0a0c14, 0x0a0c14, 0.9);
    vg.fillRect(0, 100, W, 80);

    // Bottom fade
    vg.fillGradientStyle(0x0a0c14, 0x0a0c14, 0x080a10, 0x080a10, 0.9);
    vg.fillRect(0, H - 80, W, 80);

    // Gold accent lines
    const ag = this.add.graphics().setDepth(DEPTH_BG + 3);
    ag.lineStyle(2, COL_GOLD, 0.5);
    ag.lineBetween(0, 60, W, 60);
    ag.lineBetween(0, H - 50, W, H - 50);
    ag.lineStyle(1, COL_GOLD, 0.2);
    ag.lineBetween(0, 62, W, 62);
    ag.lineBetween(0, H - 52, W, H - 52);

    // Vertical separators framing grid
    ag.lineStyle(1, COL_GOLD, 0.15);
    ag.lineBetween(GRID_X - 20, 65, GRID_X - 20, H - 55);
    ag.lineBetween(GRID_X + GRID_W + 20, 65, GRID_X + GRID_W + 20, H - 55);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Grid
  // ──────────────────────────────────────────────────────────────────────────

  private _buildGrid(): void {
    // Grid background panel
    const gp = this.add.graphics().setDepth(DEPTH_GRID - 1);
    gp.fillStyle(COL_PANEL, 0.7);
    gp.fillRoundedRect(GRID_X - 14, GRID_Y - 14, GRID_W + 28, GRID_H + 28 + 30, 8);
    gp.lineStyle(1, COL_GOLD, 0.3);
    gp.strokeRoundedRect(GRID_X - 14, GRID_Y - 14, GRID_W + 28, GRID_H + 28 + 30, 8);

    // Family column labels (one per column = one per family)
    FAMILY_LABELS.forEach((label, col) => {
      const cx = GRID_X + col * (CELL_W + CELL_GAP_X) + CELL_W / 2;
      this.add.text(cx, GRID_Y - 8, label, {
        fontFamily: '"Arial Black", Impact, sans-serif',
        fontSize: '9px',
        color: '#7799bb',
        letterSpacing: 1,
      }).setOrigin(0.5, 1).setDepth(DEPTH_GRID);
    });

    // Cells
    for (let idx = 0; idx < ALL_IDS.length; idx++) {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const cx = GRID_X + col * (CELL_W + CELL_GAP_X) + CELL_W / 2;
      const cy = GRID_Y + row * (CELL_H + CELL_GAP_Y) + CELL_H / 2;

      const id = ALL_IDS[idx];
      const fighter = getFighter(id);

      // Cell background
      const bg = this.add.rectangle(cx, cy, CELL_W, CELL_H, COL_CELL, 0.9)
        .setDepth(DEPTH_GRID)
        .setStrokeStyle(1, 0x2a3a5a, 1);
      this._cellBgs.push(bg);

      // Idle sprite or placeholder
      const animKey = `${id}__idle`;
      const hasAnim = this.anims.exists(animKey);

      if (hasAnim) {
        const sp = this.add.sprite(cx, cy - 8, '')
          .setDepth(DEPTH_GRID + 1)
          .play(animKey);

        // Scale sprite to fit within cell (leaving room for label)
        const targetH = CELL_H - 28;
        const targetW = CELL_W - 8;
        const texture = sp.texture;
        const frame = sp.frame;
        const fw = frame.realWidth || texture.source[0]?.width || CELL_W;
        const fh = frame.realHeight || texture.source[0]?.height || CELL_H;
        const scale = Math.min(targetW / fw, targetH / fh);
        sp.setScale(scale > 0 ? scale : 1);

        this._cellSprites.push(sp);
      } else {
        // Colored placeholder rectangle
        const hue = (idx / ALL_IDS.length) * 360;
        const placeholder = this.add.rectangle(cx, cy - 8, CELL_W - 10, CELL_H - 28, 0)
          .setDepth(DEPTH_GRID + 1)
          .setFillStyle(Phaser.Display.Color.HSLToColor(hue / 360, 0.4, 0.2).color, 0.8)
          .setStrokeStyle(1, Phaser.Display.Color.HSLToColor(hue / 360, 0.6, 0.5).color, 0.5);
        this._cellSprites.push(placeholder);
      }

      // Name label
      const nameText = this.add.text(cx, cy + CELL_H / 2 - 11, fighter.displayName, {
        fontFamily: '"Arial Black", Impact, sans-serif',
        fontSize: '8px',
        color: '#aabbcc',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5, 0.5).setDepth(DEPTH_GRID + 2);
      this._cellNames.push(nameText);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cursors
  // ──────────────────────────────────────────────────────────────────────────

  private _buildCursors(): void {
    this._p1Ring = this.add.rectangle(0, 0, CELL_W + 6, CELL_H + 6, 0, 0)
      .setDepth(DEPTH_CURSOR)
      .setStrokeStyle(3, COL_P1, 1);

    this._p2Ring = this.add.rectangle(0, 0, CELL_W + 6, CELL_H + 6, 0, 0)
      .setDepth(DEPTH_CURSOR)
      .setStrokeStyle(3, COL_P2, 1);

    if (!this._isTwoPlayer) {
      this._p2Ring.setVisible(false);
    }

    this._moveCursorRing(this._p1Ring, this._p1.col, this._p1.row);
    this._moveCursorRing(this._p2Ring, this._p2.col, this._p2.row);

    // Animated pulse on cursor rings
    this.tweens.add({
      targets: this._p1Ring,
      alpha: 0.5,
      yoyo: true,
      repeat: -1,
      duration: 500,
      ease: 'Sine.easeInOut',
    });

    if (this._isTwoPlayer) {
      this.tweens.add({
        targets: this._p2Ring,
        alpha: 0.5,
        yoyo: true,
        repeat: -1,
        duration: 500,
        ease: 'Sine.easeInOut',
        delay: 250,
      });
    }
  }

  private _moveCursorRing(ring: Phaser.GameObjects.Rectangle, col: number, row: number): void {
    const cx = GRID_X + col * (CELL_W + CELL_GAP_X) + CELL_W / 2;
    const cy = GRID_Y + row * (CELL_H + CELL_GAP_Y) + CELL_H / 2;
    ring.setPosition(cx, cy);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Preview panels
  // ──────────────────────────────────────────────────────────────────────────

  private _buildPreviewPanels(): void {
    this._p1Preview = this._createPreviewPanel(P1_PANEL_X, true);
    this._p2Preview = this._createPreviewPanel(P2_PANEL_X, false);
    if (!this._isTwoPlayer) {
      // hide P2 preview area label — still build so refresh is safe
      this._p2Preview.nameText.setVisible(false);
      this._p2Preview.archetypeText.setVisible(false);
      this._p2Preview.loreText.setVisible(false);
    }
  }

  private _createPreviewPanel(cx: number, isP1: boolean): PreviewPanel {
    const py = 260; // panel centre Y
    const col = isP1 ? COL_P1 : COL_P2;
    const label = isP1 ? 'P1' : 'P2';

    // Panel backing
    const g = this.add.graphics().setDepth(DEPTH_PREVIEW);
    g.fillStyle(COL_PANEL, 0.75);
    g.fillRoundedRect(cx - PREVIEW_W / 2, py - PREVIEW_H / 2, PREVIEW_W, PREVIEW_H, 6);
    g.lineStyle(2, col, 0.6);
    g.strokeRoundedRect(cx - PREVIEW_W / 2, py - PREVIEW_H / 2, PREVIEW_W, PREVIEW_H, 6);

    // Player label badge
    this.add.rectangle(cx, py - PREVIEW_H / 2 - 12, 54, 22, col, 0.9)
      .setDepth(DEPTH_PREVIEW + 1)
      .setStrokeStyle(1, 0xffffff, 0.3);
    this.add.text(cx, py - PREVIEW_H / 2 - 12, label, {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '13px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH_PREVIEW + 2);

    // Name text
    const nameText = this.add.text(cx, py + PREVIEW_H / 2 - 90, '', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '15px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
      wordWrap: { width: PREVIEW_W - 16 },
    }).setOrigin(0.5, 0).setDepth(DEPTH_PREVIEW + 2);

    // Archetype text
    const archetypeText = this.add.text(cx, py + PREVIEW_H / 2 - 68, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: isP1 ? '#66aaff' : '#ff6677',
      letterSpacing: 2,
    }).setOrigin(0.5, 0).setDepth(DEPTH_PREVIEW + 2);

    // Lore blurb
    const loreText = this.add.text(cx, py + PREVIEW_H / 2 - 50, '', {
      fontFamily: '"Arial", sans-serif',
      fontSize: '9px',
      color: '#889aaa',
      align: 'center',
      wordWrap: { width: PREVIEW_W - 20 },
    }).setOrigin(0.5, 0).setDepth(DEPTH_PREVIEW + 2);

    return {
      sprite: null,
      nameText,
      archetypeText,
      loreText,
      currentId: '',
    };
  }

  private _refreshPreviews(): void {
    const p1Idx = this._p1.row * COLS + this._p1.col;
    const p1Id = ALL_IDS[p1Idx] ?? ALL_IDS[0];
    this._updatePreview(this._p1Preview, p1Id, P1_PANEL_X, true);

    if (this._isTwoPlayer) {
      const p2Idx = this._p2.row * COLS + this._p2.col;
      const p2Id = ALL_IDS[p2Idx] ?? ALL_IDS[ALL_IDS.length - 1];
      this._updatePreview(this._p2Preview, p2Id, P2_PANEL_X, false);
    }
  }

  private _updatePreview(panel: PreviewPanel, id: string, cx: number, _isP1: boolean): void {
    if (panel.currentId === id) return;
    panel.currentId = id;

    const fighter = getFighter(id);
    const py = 260;

    // Destroy old sprite
    panel.sprite?.destroy();
    panel.sprite = null;

    // Big idle sprite
    const animKey = `${id}__idle`;
    const hasAnim = this.anims.exists(animKey);
    const spriteY = py - 30;

    if (hasAnim) {
      const sp = this.add.sprite(cx, spriteY, '').setDepth(DEPTH_PREVIEW + 1).play(animKey);
      // Scale to preview area
      const frame = sp.frame;
      const fw = frame.realWidth || 64;
      const fh = frame.realHeight || 64;
      const maxH = 140;
      const maxW = PREVIEW_W - 20;
      const scale = Math.min(maxW / fw, maxH / fh);
      sp.setScale(scale > 0 ? scale : 2);
      panel.sprite = sp;
    } else {
      // Placeholder rectangle in preview
      const ph = this.add.rectangle(cx, spriteY, 100, 120, 0x223355, 0.7)
        .setDepth(DEPTH_PREVIEW + 1)
        .setStrokeStyle(1, 0x445577) as unknown as Phaser.GameObjects.Sprite;
      panel.sprite = ph as unknown as Phaser.GameObjects.Sprite;
      this.add.text(cx, spriteY, fighter.displayName.substring(0, 8), {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#556677',
      }).setOrigin(0.5).setDepth(DEPTH_PREVIEW + 2);
    }

    // Text fields
    panel.nameText.setText(fighter.displayName.toUpperCase());
    panel.archetypeText.setText(fighter.archetype.toUpperCase());
    panel.loreText.setText(fighter.lore);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Header
  // ──────────────────────────────────────────────────────────────────────────

  private _buildHeader(): void {
    // Title
    this.add.text(W / 2, 30, 'SELECT YOUR FIGHTER', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '32px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 0, color: '#ff8800', blur: 20, fill: true },
    }).setOrigin(0.5).setDepth(DEPTH_UI + 2);

    // Mode badge
    const mode = gameState.config.mode;
    const modeStr = mode === 'arcade' ? 'ARCADE' : mode === 'versus' ? 'VS MODE' : 'TRAINING';
    this.add.text(W / 2, 57, modeStr, {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '13px',
      color: '#ff8800',
      letterSpacing: 4,
    }).setOrigin(0.5).setDepth(DEPTH_UI + 2);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Control hints
  // ──────────────────────────────────────────────────────────────────────────

  private _buildControlHints(): void {
    const hint1 = this._isTwoPlayer
      ? 'P1: WASD + J confirm   P2: Arrow keys + Numpad1 confirm   ESC: back'
      : 'WASD / Arrows to move   J / Numpad1 to select   ESC to back';
    this.add.text(W / 2, H - 22, hint1, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#445566',
    }).setOrigin(0.5).setDepth(DEPTH_UI);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cell highlight helpers
  // ──────────────────────────────────────────────────────────────────────────

  private _cellIdx(col: number, row: number): number {
    return row * COLS + col;
  }

  private _highlightCell(idx: number, color: number, alpha: number): void {
    const bg = this._cellBgs[idx];
    if (!bg) return;
    bg.setFillStyle(color, alpha);
    bg.setStrokeStyle(2, color, 0.8);
  }

  private _resetCell(idx: number): void {
    const bg = this._cellBgs[idx];
    if (!bg) return;
    bg.setFillStyle(COL_CELL, 0.9);
    bg.setStrokeStyle(1, 0x2a3a5a, 1);
  }

  private _refreshCellColors(): void {
    for (let i = 0; i < ALL_IDS.length; i++) {
      this._resetCell(i);
    }

    const p1HoverIdx = this._cellIdx(this._p1.col, this._p1.row);

    // Locked state overrides hover
    if (this._p1.locked) {
      this._highlightCell(this._p1.lockedIdx, COL_LOCKED, 0.25);
    } else {
      this._highlightCell(p1HoverIdx, COL_P1, 0.2);
    }

    if (this._isTwoPlayer) {
      if (this._p2.locked) {
        // Don't double-reset a cell if both locked to same idx
        if (this._p2.lockedIdx !== this._p1.lockedIdx) {
          this._highlightCell(this._p2.lockedIdx, COL_P2, 0.25);
        }
      } else {
        const p2HoverIdx = this._cellIdx(this._p2.col, this._p2.row);
        if (p2HoverIdx !== p1HoverIdx) {
          this._highlightCell(p2HoverIdx, COL_P2, 0.2);
        } else {
          // Both on same cell — blend
          this._highlightCell(p2HoverIdx, COL_HOVER, 0.3);
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Badge helpers (P1 / P2 lock-in badges on cells)
  // ──────────────────────────────────────────────────────────────────────────

  private _placeBadge(isP1: boolean, col: number, row: number): void {
    const cx = GRID_X + col * (CELL_W + CELL_GAP_X) + CELL_W / 2;
    const cy = GRID_Y + row * (CELL_H + CELL_GAP_Y) + 4;
    const color = isP1 ? COL_P1 : COL_P2;
    const label = isP1 ? 'P1' : 'P2';

    const badge = this.add.text(cx, cy, label, {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '11px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      backgroundColor: Phaser.Display.Color.IntegerToColor(color).rgba,
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 0).setDepth(DEPTH_BADGE);

    if (isP1) {
      this._p1Badge?.destroy();
      this._p1Badge = badge;
    } else {
      this._p2Badge?.destroy();
      this._p2Badge = badge;
    }
  }

  private _removeBadge(isP1: boolean): void {
    if (isP1) {
      this._p1Badge?.destroy();
      this._p1Badge = null;
    } else {
      this._p2Badge?.destroy();
      this._p2Badge = null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Input key setup
  // ──────────────────────────────────────────────────────────────────────────

  private _setupKeys(): void {
    const kb = this.input.keyboard!;
    const KC = Phaser.Input.Keyboard.KeyCodes;

    // Add all distinct keycodes used
    const allCodes = new Set<number>([
      P1_BINDINGS.left, P1_BINDINGS.right, P1_BINDINGS.up, P1_BINDINGS.down,
      P1_BINDINGS.lp, P1_BINDINGS.pause,
      P2_BINDINGS.left, P2_BINDINGS.right, P2_BINDINGS.up, P2_BINDINGS.down,
      P2_BINDINGS.lp,
      KC.ENTER, KC.SPACE, KC.ESC,
    ]);

    this._keys = {};
    for (const code of allCodes) {
      const name = `k${code}`;
      this._keys[name] = kb.addKey(code);
    }
  }

  private _key(code: number): Phaser.Input.Keyboard.Key {
    return this._keys[`k${code}`];
  }

  private _just(code: number): boolean {
    const k = this._key(code);
    return k ? Phaser.Input.Keyboard.JustDown(k) : false;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // P1 input
  // ──────────────────────────────────────────────────────────────────────────

  private _handleP1Input(): void {
    if (this._p1Cool > 0) return;

    const moved = this._moveCursor(this._p1, P1_BINDINGS);
    if (moved) {
      if (!this._p1.locked) {
        playSfx('menu_move');
        this._refreshPreviews();
        this._refreshCellColors();
        this._moveCursorRing(this._p1Ring, this._p1.col, this._p1.row);
      }
      this._p1Cool = INPUT_COOLDOWN;
      return;
    }

    // Confirm (P1_BINDINGS.lp = J, also accept Enter/Space/Numpad1)
    const confirmP1 =
      this._just(P1_BINDINGS.lp) ||
      this._just(Phaser.Input.Keyboard.KeyCodes.ENTER) ||
      this._just(Phaser.Input.Keyboard.KeyCodes.SPACE);

    if (confirmP1) {
      if (!this._p1.locked) {
        this._p1.lockedIdx = this._cellIdx(this._p1.col, this._p1.row);
        this._p1.locked = true;
        playSfx('menu_confirm');
        this._placeBadge(true, this._p1.col, this._p1.row);
        this._refreshCellColors();
        this._p1Cool = INPUT_COOLDOWN;
        this._checkBothLocked();
      } else {
        // Unlock (back out of selection)
        this._p1.locked = false;
        this._removeBadge(true);
        playSfx('menu_move');
        this._refreshCellColors();
        this._readyText?.destroy();
        this._readyText = null;
        this._p1Cool = INPUT_COOLDOWN;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // P2 input
  // ──────────────────────────────────────────────────────────────────────────

  private _handleP2Input(): void {
    if (this._p2Cool > 0) return;

    const moved = this._moveCursor(this._p2, P2_BINDINGS);
    if (moved) {
      if (!this._p2.locked) {
        playSfx('menu_move');
        this._refreshPreviews();
        this._refreshCellColors();
        this._moveCursorRing(this._p2Ring, this._p2.col, this._p2.row);
      }
      this._p2Cool = INPUT_COOLDOWN;
      return;
    }

    const confirmP2 = this._just(P2_BINDINGS.lp); // Numpad1

    if (confirmP2) {
      if (!this._p2.locked) {
        this._p2.lockedIdx = this._cellIdx(this._p2.col, this._p2.row);
        this._p2.locked = true;
        playSfx('menu_confirm');
        this._placeBadge(false, this._p2.col, this._p2.row);
        this._refreshCellColors();
        this._p2Cool = INPUT_COOLDOWN;
        this._checkBothLocked();
      } else {
        this._p2.locked = false;
        this._removeBadge(false);
        playSfx('menu_move');
        this._refreshCellColors();
        this._readyText?.destroy();
        this._readyText = null;
        this._p2Cool = INPUT_COOLDOWN;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cursor movement helper
  // ──────────────────────────────────────────────────────────────────────────

  private _moveCursor(
    cursor: CursorState,
    bindings: typeof P1_BINDINGS,
  ): boolean {
    if (cursor.locked) return false;

    let dc = 0;
    let dr = 0;

    if (this._just(bindings.left))  dc = -1;
    else if (this._just(bindings.right)) dc = 1;
    else if (this._just(bindings.up))   dr = -1;
    else if (this._just(bindings.down)) dr = 1;

    if (dc === 0 && dr === 0) return false;

    cursor.col = (cursor.col + dc + COLS) % COLS;
    cursor.row = (cursor.row + dr + ROWS) % ROWS;
    return true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ESC
  // ──────────────────────────────────────────────────────────────────────────

  private _handleEsc(): void {
    if (this._escCool > 0) return;
    const escPressed = this._just(P1_BINDINGS.pause);
    if (!escPressed) return;
    this._escCool = 400;
    this.scene.start('MainMenuScene');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lock-in / confirm logic
  // ──────────────────────────────────────────────────────────────────────────

  private _checkBothLocked(): void {
    if (this._isTwoPlayer) {
      if (!this._p1.locked || !this._p2.locked) return;
      this._showReady(() => this._confirmTwoPlayer());
    } else {
      if (!this._p1.locked) return;
      this._showReady(() => this._confirmSingleCursor());
    }
  }

  private _confirmTwoPlayer(): void {
    const p1Id = ALL_IDS[this._p1.lockedIdx] ?? DEFAULT_P1;
    const p2Id = ALL_IDS[this._p2.lockedIdx] ?? DEFAULT_P2;
    gameState.patch({
      p1Id,
      p2Id,
      roundsToWin: 2,
    });
    this.scene.start('StageSelectScene');
  }

  private _confirmSingleCursor(): void {
    const p1Id = ALL_IDS[this._p1.lockedIdx] ?? DEFAULT_P1;
    const mode = gameState.config.mode;

    if (mode === 'arcade') {
      // Arcade ladder: beginArcade sets up the first fight and configures p2Id
      // via setupCurrentFight → ARCADE_LADDER[0]
      beginArcade(p1Id, gameState.arcadeDifficulty || gameState.config.difficulty || 'medium');
      // gameState.config.p1Id + p2Id are now set by beginArcade → setupCurrentFight
      this.scene.start('FightScene');
    } else {
      // Single player / training solo path (mode='training', p2IsCpu=true — edge)
      // Pick a random different fighter for CPU
      let p2Id = DEFAULT_P2;
      const otherIds = ALL_IDS.filter(id => id !== p1Id);
      if (otherIds.length > 0) {
        p2Id = otherIds[Math.floor(Math.random() * otherIds.length)];
      }
      gameState.patch({ p1Id, p2Id, roundsToWin: 2 });
      this.scene.start('StageSelectScene');
    }
  }

  private _showReady(onComplete: () => void): void {
    this._readyText?.destroy();

    this._readyText = this.add.text(W / 2, H / 2 - 10, 'READY!', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '80px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 12,
      shadow: { offsetX: 0, offsetY: 0, color: '#ff8800', blur: 40, fill: true },
    }).setOrigin(0.5).setDepth(30).setScale(0.3).setAlpha(0);

    this.tweens.add({
      targets: this._readyText,
      scale: 1,
      alpha: 1,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.time.delayedCall(500, onComplete);
      },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Shutdown
  // ──────────────────────────────────────────────────────────────────────────

  shutdown(): void {
    this._glowTween?.stop();
    this._p1Badge?.destroy();
    this._p2Badge?.destroy();
    this._readyText?.destroy();
    this._p1Preview.sprite?.destroy();
    this._p2Preview.sprite?.destroy();
    // Clean up all key listeners to avoid leaks
    this.input.keyboard?.removeAllListeners();
  }
}
