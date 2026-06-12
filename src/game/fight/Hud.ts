/**
 * Hud.ts — Fight HUD for Fantasy Fight
 * Drawn on the passed Phaser.Scene at high depth; purely procedural (no external assets).
 * Mirrors the classic arcade layout: P1 top-left, P2 top-right, timer center-top.
 */

import type { FighterData } from '../../types';
import { TUNING } from '../systems/tuning';

// ─── Layout constants ────────────────────────────────────────────────────────
const W = 1280;
const _H = 720;

const HUD_DEPTH      = 1000;
const BAR_MARGIN_X   = 40;   // outer edge of health bar from screen edge
const BAR_Y          = 40;   // top of health bar
const BAR_W          = 460;
const BAR_H          = 26;
const BAR_BORDER     = 3;

const NAME_Y         = BAR_Y + BAR_H + 6;
const METER_Y        = NAME_Y + 22;
const METER_H        = 10;

const PIP_Y          = BAR_Y - 18;
const PIP_R          = 7;
const PIP_GAP        = 20;

const COMBO_Y        = 200;
const TIMER_X        = W / 2;
const TIMER_Y        = 28;

// Health-bar color stops (ratio → 0xRRGGBB)
function healthColor(ratio: number): number {
  if (ratio > 0.5) {
    // green → yellow
    const t = 1 - (ratio - 0.5) / 0.5; // 0 at full, 1 at 0.5
    const r = Math.round(t * 0xff);
    const g = 0xcc;
    return (r << 16) | (g << 8);
  } else {
    // yellow → red
    const t = 1 - ratio / 0.5; // 0 at 0.5, 1 at 0
    const r = 0xff;
    const g = Math.round((1 - t) * 0xcc);
    return (r << 16) | (g << 8);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface HudOpts {
  p1Data: FighterData;
  p2Data: FighterData;
}

interface BarSet {
  bg:        Phaser.GameObjects.Rectangle;
  chip:      Phaser.GameObjects.Rectangle;
  fill:      Phaser.GameObjects.Rectangle;
  ratio:     number;
  chipRatio: number;
  lowPulse:  Phaser.Tweens.Tween | null;
}

interface MeterSet {
  bg:    Phaser.GameObjects.Rectangle;
  fill:  Phaser.GameObjects.Rectangle;
  ratio: number;
  glow:  Phaser.Tweens.Tween | null;
  full:  boolean;
}

interface PipSet {
  circles: Phaser.GameObjects.Arc[];
}

interface ComboSet {
  text:  Phaser.GameObjects.Text;
  count: number;
  tween: Phaser.Tweens.Tween | null;
  fade:  Phaser.Tweens.Tween | null;
}

// ─── Hud class ───────────────────────────────────────────────────────────────

export class Hud {
  private scene: Phaser.Scene;

  private bars:   [BarSet, BarSet];
  private meters: [MeterSet, MeterSet];
  private pips:   [PipSet, PipSet];
  private combos: [ComboSet, ComboSet];

  private nameTexts: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private timerText: Phaser.GameObjects.Text;
  private timerDanger = false;
  private timerPulse: Phaser.Tweens.Tween | null = null;

  private bannerText:  Phaser.GameObjects.Text;
  private bannerTween: Phaser.Tweens.Tween | Phaser.Tweens.TweenChain | null = null;

  /** All GameObjects owned by the HUD (for destroy). */
  private owned: Phaser.GameObjects.GameObject[] = [];

  // ── constructor ────────────────────────────────────────────────────────────

  constructor(scene: Phaser.Scene, opts: HudOpts) {
    this.scene = scene;

    // ── Health bars ──────────────────────────────────────────────────────────
    this.bars = [
      this.makeBar(1),
      this.makeBar(2),
    ];

    // ── Meters ───────────────────────────────────────────────────────────────
    this.meters = [
      this.makeMeter(1),
      this.makeMeter(2),
    ];

    // ── Round pips ───────────────────────────────────────────────────────────
    this.pips = [
      this.makePips(1),
      this.makePips(2),
    ];

    // ── Names ────────────────────────────────────────────────────────────────
    this.nameTexts = [
      this.makeNameText(1, opts.p1Data.displayName),
      this.makeNameText(2, opts.p2Data.displayName),
    ];

    // ── Timer ────────────────────────────────────────────────────────────────
    this.timerText = this.add(
      scene.add.text(TIMER_X, TIMER_Y, '99', {
        fontFamily: '"Impact", "Arial Black", sans-serif',
        fontSize:   '52px',
        color:      '#ffffff',
        stroke:     '#000000',
        strokeThickness: 6,
        shadow: { offsetX: 2, offsetY: 3, color: '#000000', blur: 4, stroke: true, fill: true },
      }).setOrigin(0.5, 0).setDepth(HUD_DEPTH)
    ) as Phaser.GameObjects.Text;

    // Timer backdrop
    const timerBg = scene.add.graphics().setDepth(HUD_DEPTH - 1);
    timerBg.fillStyle(0x000000, 0.55);
    timerBg.fillRoundedRect(TIMER_X - 44, TIMER_Y - 4, 88, 62, 8);
    timerBg.lineStyle(2, 0xffffff, 0.25);
    timerBg.strokeRoundedRect(TIMER_X - 44, TIMER_Y - 4, 88, 62, 8);
    this.owned.push(timerBg);

    // ── Combo counters ───────────────────────────────────────────────────────
    this.combos = [
      this.makeCombo(1),
      this.makeCombo(2),
    ];

    // ── Banner (round announce) ───────────────────────────────────────────────
    this.bannerText = this.add(
      scene.add.text(W / 2, _H / 2, '', {
        fontFamily: '"Impact", "Arial Black", sans-serif',
        fontSize:   '96px',
        color:      '#ffdd00',
        stroke:     '#000000',
        strokeThickness: 10,
        shadow: { offsetX: 4, offsetY: 6, color: '#000000', blur: 8, stroke: true, fill: true },
      }).setOrigin(0.5).setDepth(HUD_DEPTH + 10).setAlpha(0).setScale(0.5)
    ) as Phaser.GameObjects.Text;
  }

  // ── Private builders ───────────────────────────────────────────────────────

  private add<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.owned.push(obj);
    return obj;
  }

  /**
   * P1 bar: left-anchored (x = BAR_MARGIN_X), fill depletes from right→left.
   * P2 bar: right-anchored (x = W - BAR_MARGIN_X - BAR_W), fill depletes left←right.
   */
  private makeBar(player: 1 | 2): BarSet {
    const scene = this.scene;
    const isP1 = player === 1;
    const bx = isP1 ? BAR_MARGIN_X : W - BAR_MARGIN_X - BAR_W;

    // Outer bg (dark panel)
    const bg = this.add(
      scene.add.rectangle(bx, BAR_Y, BAR_W + BAR_BORDER * 2, BAR_H + BAR_BORDER * 2, 0x0a0a0a)
        .setOrigin(0, 0).setDepth(HUD_DEPTH)
    ) as Phaser.GameObjects.Rectangle;

    // Chip bar (lags behind, white/yellow)
    const chip = this.add(
      scene.add.rectangle(bx + BAR_BORDER, BAR_Y + BAR_BORDER, BAR_W, BAR_H, 0xffee88)
        .setOrigin(0, 0).setDepth(HUD_DEPTH + 1)
    ) as Phaser.GameObjects.Rectangle;

    // Health fill
    const fill = this.add(
      scene.add.rectangle(bx + BAR_BORDER, BAR_Y + BAR_BORDER, BAR_W, BAR_H, 0x44cc44)
        .setOrigin(0, 0).setDepth(HUD_DEPTH + 2)
    ) as Phaser.GameObjects.Rectangle;

    // Bevel/border
    const border = scene.add.graphics().setDepth(HUD_DEPTH + 3);
    border.lineStyle(2, 0xffffff, 0.35);
    border.strokeRect(bx, BAR_Y, BAR_W + BAR_BORDER * 2, BAR_H + BAR_BORDER * 2);
    border.lineStyle(1, 0x000000, 0.6);
    border.strokeRect(bx + 1, BAR_Y + 1, BAR_W + BAR_BORDER * 2 - 2, BAR_H + BAR_BORDER * 2 - 2);
    this.owned.push(border);

    // For P2, the fill grows from the RIGHT side. We achieve this by setting the
    // Rectangle's x to (right edge - fill width) each time. We'll handle that in
    // setHealth by adjusting x; mark it here.
    if (!isP1) {
      // anchor chip and fill to right side of the bar frame
      chip.setX(bx + BAR_BORDER + BAR_W - BAR_W); // full width = right-anchored full
      fill.setX(bx + BAR_BORDER + BAR_W - BAR_W);
    }

    return { bg, chip, fill, ratio: 1, chipRatio: 1, lowPulse: null };
  }

  private makeMeter(player: 1 | 2): MeterSet {
    const scene = this.scene;
    const isP1 = player === 1;
    const mx = isP1 ? BAR_MARGIN_X : W - BAR_MARGIN_X - BAR_W;

    const bg = this.add(
      scene.add.rectangle(mx, METER_Y, BAR_W + BAR_BORDER * 2, METER_H + BAR_BORDER * 2, 0x050510)
        .setOrigin(0, 0).setDepth(HUD_DEPTH)
    ) as Phaser.GameObjects.Rectangle;

    const fill = this.add(
      scene.add.rectangle(mx + BAR_BORDER, METER_Y + BAR_BORDER, 0, METER_H, 0x3366ff)
        .setOrigin(0, 0).setDepth(HUD_DEPTH + 1)
    ) as Phaser.GameObjects.Rectangle;

    // Border
    const mBorder = scene.add.graphics().setDepth(HUD_DEPTH + 2);
    mBorder.lineStyle(1, 0x6699ff, 0.5);
    mBorder.strokeRect(mx, METER_Y, BAR_W + BAR_BORDER * 2, METER_H + BAR_BORDER * 2);
    this.owned.push(mBorder);

    // Label
    const label = this.add(
      scene.add.text(
        isP1 ? mx : mx + BAR_W + BAR_BORDER * 2,
        METER_Y + (METER_H + BAR_BORDER * 2) / 2,
        'SUPER',
        {
          fontFamily: '"Impact", sans-serif',
          fontSize:   '9px',
          color:      '#6699ff',
        }
      ).setOrigin(isP1 ? 0 : 1, 0.5).setDepth(HUD_DEPTH + 3)
    ) as Phaser.GameObjects.Text;
    void label; // referenced via owned

    return { bg, fill, ratio: 0, glow: null, full: false };
  }

  private makePips(player: 1 | 2): PipSet {
    const scene = this.scene;
    const isP1 = player === 1;
    const rounds = TUNING.round.roundsToWin; // 2

    // Pips sit at the inner end of each health bar
    const innerX = isP1
      ? BAR_MARGIN_X + BAR_W + BAR_BORDER * 2   // right end of P1 bar
      : W - BAR_MARGIN_X - BAR_W - BAR_BORDER * 2; // left end of P2 bar

    const totalW = rounds * (PIP_R * 2) + (rounds - 1) * (PIP_GAP - PIP_R * 2);
    const startX = isP1 ? innerX - totalW : innerX;

    const circles: Phaser.GameObjects.Arc[] = [];
    for (let i = 0; i < rounds; i++) {
      const cx = startX + i * PIP_GAP + PIP_R;
      const circle = this.add(
        scene.add.arc(cx, PIP_Y, PIP_R, 0, 360, false, 0x333333)
          .setDepth(HUD_DEPTH + 2)
      ) as Phaser.GameObjects.Arc;
      // stroke via Graphics
      const g = scene.add.graphics().setDepth(HUD_DEPTH + 3);
      g.lineStyle(1.5, 0xaaaaaa, 0.8);
      g.strokeCircle(cx, PIP_Y, PIP_R);
      this.owned.push(g);
      circles.push(circle);
    }

    return { circles };
  }

  private makeNameText(player: 1 | 2, name: string): Phaser.GameObjects.Text {
    const isP1 = player === 1;
    const bx = isP1 ? BAR_MARGIN_X + BAR_BORDER : W - BAR_MARGIN_X - BAR_BORDER;
    return this.add(
      this.scene.add.text(bx, NAME_Y, name.toUpperCase(), {
        fontFamily: '"Impact", "Arial Black", sans-serif',
        fontSize:   '14px',
        color:      '#dddddd',
        stroke:     '#000000',
        strokeThickness: 3,
      }).setOrigin(isP1 ? 0 : 1, 0).setDepth(HUD_DEPTH + 1)
    ) as Phaser.GameObjects.Text;
  }

  private makeCombo(player: 1 | 2): ComboSet {
    const isP1 = player === 1;
    const cx = isP1 ? BAR_MARGIN_X + 10 : W - BAR_MARGIN_X - 10;
    const text = this.add(
      this.scene.add.text(cx, COMBO_Y, '', {
        fontFamily: '"Impact", "Arial Black", sans-serif',
        fontSize:   '48px',
        color:      '#ffdd00',
        stroke:     '#000000',
        strokeThickness: 6,
        shadow: { offsetX: 3, offsetY: 4, color: '#000000', blur: 6, stroke: true, fill: true },
      }).setOrigin(isP1 ? 0 : 1, 0).setDepth(HUD_DEPTH + 5).setAlpha(0)
    ) as Phaser.GameObjects.Text;

    return { text, count: 0, tween: null, fade: null };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private barX(player: 1 | 2): number {
    return player === 1 ? BAR_MARGIN_X : W - BAR_MARGIN_X - BAR_W;
  }

  private updateBarFillX(player: 1 | 2, fillWidth: number): void {
    const bar = this.bars[player - 1];
    if (player === 1) {
      // P1: fill grows from the left; x is fixed
      bar.fill.setDisplaySize(fillWidth, BAR_H);
    } else {
      // P2: fill grows from the right (depletes leftward)
      const bx = this.barX(2);
      const rightEdge = bx + BAR_BORDER + BAR_W;
      bar.fill.setX(rightEdge - fillWidth);
      bar.fill.setDisplaySize(fillWidth, BAR_H);
    }
  }

  private updateChipFillX(player: 1 | 2, chipWidth: number): void {
    const bar = this.bars[player - 1];
    if (player === 1) {
      bar.chip.setDisplaySize(chipWidth, BAR_H);
    } else {
      const bx = this.barX(2);
      const rightEdge = bx + BAR_BORDER + BAR_W;
      bar.chip.setX(rightEdge - chipWidth);
      bar.chip.setDisplaySize(chipWidth, BAR_H);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Animate health bar fill. ratio 0..1 (1=full, 0=empty).
   * P1 depletes rightward, P2 depletes leftward.
   */
  setHealth(player: 1 | 2, ratio: number): void {
    ratio = Phaser.Math.Clamp(ratio, 0, 1);
    const bar = this.bars[player - 1];
    const targetW = Math.round(ratio * BAR_W);
    const newColor = healthColor(ratio);

    // Chip bar snaps to current fill immediately, then stays until fill catches up
    // (chip should always be >= fill width)
    const currentChipW = Math.round(bar.chipRatio * BAR_W);
    const currentFillW = Math.round(bar.ratio * BAR_W);

    if (targetW < currentFillW) {
      // Damage taken — chip stays, fill animates down
      // Reset chip to old fill position if chip was already resolved
      if (currentChipW <= currentFillW) {
        this.updateChipFillX(player, currentFillW);
        bar.chipRatio = bar.ratio;
      }
      // Delay chip drain after fill settles
      this.scene.time.delayedCall(600, () => {
        const chipTargetW = Math.max(targetW, 0);
        this.scene.tweens.add({
          targets:  bar.chip,
          displayWidth: chipTargetW,
          duration: 300,
          ease:     'Sine.easeOut',
          onUpdate: () => {
            if (player === 2) {
              const bx = this.barX(2);
              const rightEdge = bx + BAR_BORDER + BAR_W;
              bar.chip.setX(rightEdge - bar.chip.displayWidth);
            }
          },
        });
        bar.chipRatio = ratio;
      });
    } else if (targetW > currentFillW) {
      // Healing — chip matches fill immediately
      this.updateChipFillX(player, targetW);
      bar.chipRatio = ratio;
    }

    bar.ratio = ratio;

    // Tween fill bar
    this.scene.tweens.add({
      targets:  bar.fill,
      displayWidth: targetW,
      duration: 200,
      ease:     'Sine.easeOut',
      onUpdate: () => {
        bar.fill.setFillStyle(newColor);
        if (player === 2) {
          const bx = this.barX(2);
          const rightEdge = bx + BAR_BORDER + BAR_W;
          bar.fill.setX(rightEdge - bar.fill.displayWidth);
        }
      },
    });

    // Low-health pulse
    const isLow = ratio <= TUNING.lowHealthThreshold;
    this.setLowHealth(player, isLow);
  }

  /**
   * Set super meter fill. ratio 0..1.
   * Glows/flashes when full (ratio === 1).
   */
  setMeter(player: 1 | 2, ratio: number): void {
    ratio = Phaser.Math.Clamp(ratio, 0, 1);
    const meter = this.meters[player - 1];
    const targetW = Math.round(ratio * BAR_W);
    const wasFull = meter.full;
    meter.ratio = ratio;
    meter.full  = ratio >= 1;

    // Choose color
    const color = ratio >= 1 ? 0xffd700 : ratio > 0.5 ? 0x3399ff : 0x1155cc;

    this.scene.tweens.add({
      targets:  meter.fill,
      displayWidth: targetW,
      duration: 150,
      ease:     'Sine.easeOut',
      onUpdate: () => { meter.fill.setFillStyle(color); },
    });

    // Glow flash on full
    if (meter.full && !wasFull) {
      if (meter.glow) { meter.glow.stop(); }
      meter.glow = this.scene.tweens.add({
        targets:  meter.fill,
        alpha:    { from: 1, to: 0.4 },
        duration: 180,
        ease:     'Sine.easeInOut',
        yoyo:     true,
        repeat:   -1,
      });
    } else if (!meter.full && wasFull) {
      if (meter.glow) { meter.glow.stop(); meter.glow = null; }
      meter.fill.setAlpha(1);
    }
  }

  /**
   * Set the round timer display (integer seconds).
   * Automatically triggers danger state at ≤10.
   */
  setTimer(seconds: number): void {
    const s = Math.max(0, Math.floor(seconds));
    this.timerText.setText(String(s));
    this.setTimerDanger(s <= 10);
  }

  /**
   * Manually control danger state on timer.
   * When true: text turns red and pulses scale.
   */
  setTimerDanger(on: boolean): void {
    if (on === this.timerDanger) return;
    this.timerDanger = on;
    if (this.timerPulse) { this.timerPulse.stop(); this.timerPulse = null; }
    if (on) {
      this.timerText.setColor('#ff2222');
      this.timerPulse = this.scene.tweens.add({
        targets:  this.timerText,
        scaleX:   { from: 1.0, to: 1.12 },
        scaleY:   { from: 1.0, to: 1.12 },
        duration: 400,
        ease:     'Sine.easeInOut',
        yoyo:     true,
        repeat:   -1,
      });
    } else {
      this.timerText.setColor('#ffffff').setScale(1);
    }
  }

  /**
   * Light up win pips for a player. wins: 0, 1, or 2.
   */
  setRound(player: 1 | 2, wins: number): void {
    const pip = this.pips[player - 1];
    pip.circles.forEach((c, i) => {
      const lit = i < wins;
      c.setFillStyle(lit ? 0xffdd00 : 0x333333);
    });
  }

  /**
   * Show combo counter. count=0 hides it.
   * Pops/scales on increment, fades on end.
   */
  setCombo(player: 1 | 2, count: number): void {
    const combo = this.combos[player - 1];
    if (count <= 0) {
      // Fade out
      if (combo.tween) { combo.tween.stop(); combo.tween = null; }
      if (combo.fade)  { combo.fade.stop(); }
      combo.fade = this.scene.tweens.add({
        targets:  combo.text,
        alpha:    0,
        duration: 400,
        ease:     'Sine.easeIn',
      });
      combo.count = 0;
      return;
    }

    combo.count = count;
    combo.text.setText(`${count} HITS`);
    combo.text.setAlpha(1).setScale(1);

    if (combo.fade) { combo.fade.stop(); combo.fade = null; }
    if (combo.tween) { combo.tween.stop(); }

    // Pop scale
    combo.tween = this.scene.tweens.add({
      targets:  combo.text,
      scaleX:   { from: 1.25, to: 1.0 },
      scaleY:   { from: 1.25, to: 1.0 },
      duration: 180,
      ease:     'Back.easeOut',
    });
  }

  /**
   * Update fighter display names (also called in constructor from opts).
   */
  setNames(p1Name: string, p2Name: string): void {
    this.nameTexts[0].setText(p1Name.toUpperCase());
    this.nameTexts[1].setText(p2Name.toUpperCase());
  }

  /**
   * Show a big centered banner (e.g. "Round 1", "FIGHT!", "K.O.").
   * Tweens: scale-in → hold → fade out.
   * Returns a Promise that resolves when the animation completes.
   */
  showRoundBanner(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (this.bannerTween) { this.bannerTween.stop(); }

      this.bannerText
        .setText(text)
        .setAlpha(0)
        .setScale(0.4)
        .setVisible(true);

      this.bannerTween = this.scene.tweens.chain({
        targets: this.bannerText,
        tweens: [
          // Scale-in
          {
            scaleX:   1,
            scaleY:   1,
            alpha:    1,
            duration: 220,
            ease:     'Back.easeOut',
          },
          // Hold
          {
            alpha:    1,
            duration: 900,
            ease:     'Linear',
          },
          // Fade out
          {
            alpha:    0,
            scaleX:   1.1,
            scaleY:   1.1,
            duration: 300,
            ease:     'Sine.easeIn',
            onComplete: () => {
              resolve();
            },
          },
        ],
      });
    });
  }

  /**
   * Convenience: show KO banner.
   */
  showKo(): Promise<void> {
    return this.showRoundBanner('K.O.');
  }

  /**
   * Pulse player's health bar red when below low-health threshold.
   * Set on=false to stop.
   */
  setLowHealth(player: 1 | 2, on: boolean): void {
    const bar = this.bars[player - 1];
    if (on && !bar.lowPulse) {
      bar.lowPulse = this.scene.tweens.add({
        targets:  bar.fill,
        alpha:    { from: 1, to: 0.45 },
        duration: 350,
        ease:     'Sine.easeInOut',
        yoyo:     true,
        repeat:   -1,
      });
    } else if (!on && bar.lowPulse) {
      bar.lowPulse.stop();
      bar.lowPulse = null;
      bar.fill.setAlpha(1);
    }
  }

  /**
   * Destroy all HUD GameObjects and stop all tweens.
   */
  destroy(): void {
    // Stop all tweens
    this.bars.forEach((b) => {
      if (b.lowPulse) b.lowPulse.stop();
    });
    this.meters.forEach((m) => {
      if (m.glow) m.glow.stop();
    });
    this.combos.forEach((c) => {
      if (c.tween) c.tween.stop();
      if (c.fade)  c.fade.stop();
    });
    if (this.timerPulse) this.timerPulse.stop();
    if (this.bannerTween) this.bannerTween.stop();

    // Destroy all owned objects
    for (const obj of this.owned) {
      if (obj && obj.active) obj.destroy();
    }
    this.owned.length = 0;
  }
}
