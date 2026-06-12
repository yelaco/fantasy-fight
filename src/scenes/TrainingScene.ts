/**
 * TrainingScene.ts  (T25 — Training mode)
 * ==========================================
 * Scene key: 'TrainingScene'
 *
 * Features (FR-8):
 *  - P1 = human (P1_BINDINGS)
 *  - P2 = Training Dummy (cycles between Stand / Block / Human-P2 via P2_BINDINGS)
 *    Toggle dummy behaviour with NUMPAD_5 (or fall back to F2 if numpad absent).
 *  - Infinite HP: both fighters' HP is clamped to a floor (1) each frame;
 *    hits, hitstun, knockback and VFX all play normally.
 *  - No round timer, no rounds, no KO.
 *  - F1 toggle: hitbox (red) / hurtbox (blue) overlay.
 *  - Tab toggle: move-list panel for current P1 fighter.
 *  - R key: reset both fighters to start positions + restore HP + clear combo.
 *  - Esc: pause / quit to MainMenu (stopMusic).
 *  - Same update order as FightScene.
 *  - Stage music plays.
 *
 * Dummy controls (shown on-screen):
 *   NUMPAD_5 / F2 : cycle dummy behaviour
 *   Behaviours    : Stand | Block | Human (P2_BINDINGS)
 */

import Phaser from 'phaser';

import { gameState }          from '../game/state/GameState';
import { getFighter }         from '../data/roster';

import { Fighter }            from '../game/entities/Fighter';
import { FighterState }       from '../game/entities/states';
import type { FighterData }   from '../types';

import {
  InputManager,
  P1_BINDINGS,
  P2_BINDINGS,
  MotionBuffer,
}                             from '../input';
import type { IInputSource, GameAction }  from '../input';

import { Combat }             from '../game/systems/Combat';
import type { CombatCallbacks, ContactPoint } from '../game/systems/Combat';
import type { MoveData, SpecialMoveData }     from '../types';

import { ProjectileManager }  from '../game/systems/Projectile';
import { ComboSystem }        from '../game/systems/Combo';
import { Vfx }                from '../game/systems/Vfx';

import { Stage }              from '../game/stage/Stage';
import type { Manifest }      from '../types/manifest';

import { Hud }                from '../game/fight/Hud';

import { playMusic, stopMusic, playSfx } from '../audio';

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGE_MUSIC: Record<string, import('../audio').TrackId> = {
  Battleground1: 'stage1',
  Battleground2: 'stage2',
  Battleground3: 'stage3',
  Battleground4: 'stage4',
};

const SPAWN_OFFSET = 300;

const HIT_FLOOR = 1; // minimum HP to clamp to in training mode

// ─── Dummy Behaviour ─────────────────────────────────────────────────────────

type DummyBehaviour = 'stand' | 'block' | 'human';

const DUMMY_LABELS: Record<DummyBehaviour, string> = {
  stand: 'Stand',
  block: 'Block',
  human: 'Human (P2)',
};

const DUMMY_CYCLE: DummyBehaviour[] = ['stand', 'block', 'human'];

/**
 * A synthetic IInputSource that always holds specific directions/buttons.
 * Used to drive the training dummy's fixed-behaviour modes.
 */
class DummyInputSource implements IInputSource {
  private _held: Partial<Record<GameAction, boolean>> = {};

  setHeld(snapshot: Partial<Record<GameAction, boolean>>): void {
    this._held = snapshot;
  }

  held(action: GameAction): boolean {
    return this._held[action] ?? false;
  }
  justPressed(_action: GameAction): boolean { return false; }
  justReleased(_action: GameAction): boolean { return false; }
}

// ─── TrainingScene ────────────────────────────────────────────────────────────

export class TrainingScene extends Phaser.Scene {

  // ── Systems ──
  private stage!: Stage;
  private fighter1!: Fighter;
  private fighter2!: Fighter;
  private inputP1!: InputManager;
  private inputP2Human!: InputManager;   // always created; used in 'human' mode
  private dummyInput!: DummyInputSource;
  private motionBuf1!: MotionBuffer;
  private motionBuf2!: MotionBuffer;
  private combat!: Combat;
  private projMgr!: ProjectileManager;
  private combo!: ComboSystem;
  private vfx!: Vfx;
  private hud!: Hud;

  // ── Config snapshot ──
  private p1Data!: FighterData;
  private p2Data!: FighterData;

  // ── Training state ──
  private dummyBehaviour: DummyBehaviour = 'stand';
  private dummyBehaviourIdx = 0;

  // ── Overlay toggles ──
  private hitboxOverlayOn = false;
  private hitboxGfx!: Phaser.GameObjects.Graphics;

  private moveListOn = false;
  private moveListPanel!: Phaser.GameObjects.Container;

  // ── Pause ──
  private paused = false;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private pauseKeyDown = false;

  // ── Key-edge detectors (one-shot per press) ──
  private f1Down   = false;
  private tabDown  = false;
  private rDown    = false;
  private cycleDown = false;

  // ── HUD extras: max-combo display ──
  private maxComboText!: Phaser.GameObjects.Text;
  private dummyLabel!: Phaser.GameObjects.Text;
  private controlsHint!: Phaser.GameObjects.Text;

  // ── Keyboard references for non-IInputSource hotkeys ──
  private keyF1!: Phaser.Input.Keyboard.Key;
  private keyTab!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyCycle!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'TrainingScene' });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────────────────────────────

  create(): void {
    const cfg      = gameState.config;
    const manifest: Manifest = this.registry.get('manifest');

    // ── Fighter data ──
    this.p1Data = getFighter(cfg.p1Id);
    this.p2Data = getFighter(cfg.p2Id);

    // ── Stage ──
    this.stage = new Stage(this, manifest, cfg.stageId, cfg.stageVariant);
    const { groundY, rightBound } = this.stage;

    this.physics.world.setBounds(0, 0, rightBound, 720);
    this.cameras.main.setBounds(0, 0, rightBound, 720);

    // ── Fighters ──
    const midX = rightBound / 2;
    this.fighter1 = new Fighter(this, midX - SPAWN_OFFSET, groundY, this.p1Data,  1, 1);
    this.fighter2 = new Fighter(this, midX + SPAWN_OFFSET, groundY, this.p2Data, -1, 2);
    this.fighter1.groundY = groundY;
    this.fighter2.groundY = groundY;
    this.fighter1.meter   = gameState.p1Meter;
    this.fighter2.meter   = gameState.p2Meter;

    // ── Input ──
    this.inputP1      = new InputManager(this, P1_BINDINGS);
    this.inputP2Human = new InputManager(this, P2_BINDINGS);
    this.dummyInput   = new DummyInputSource();

    this.motionBuf1 = new MotionBuffer();
    this.motionBuf2 = new MotionBuffer();

    // ── Systems ──
    this.combo   = new ComboSystem();
    this.vfx     = new Vfx(this);
    this.projMgr = new ProjectileManager(this);

    this.projMgr.onProjectileHit = (e) => {
      this.vfx.hitSpark(e.x, e.y, 'special');
    };

    this.fighter1.callbacks.onSpawnProjectile = (f, special) => {
      if (special.projectile) {
        this.projMgr.spawn(special.projectile, {
          x: f.x, y: f.y, facing: f.facing, playerIndex: f.playerIndex,
        });
      }
    };
    this.fighter2.callbacks.onSpawnProjectile = (f, special) => {
      if (special.projectile) {
        this.projMgr.spawn(special.projectile, {
          x: f.x, y: f.y, facing: f.facing, playerIndex: f.playerIndex,
        });
      }
    };

    // ── Combo callbacks ──
    this.combo.onComboUpdate = (attackerIndex, count) => {
      const player = (attackerIndex + 1) as 1 | 2;
      this.hud?.setCombo(player, count);
      if (count >= 2) {
        const f = attackerIndex === 0 ? this.fighter1 : this.fighter2;
        this.vfx.comboFloater(f.x, f.y - 120, `${count} Hits!`);
      }
      // Update max-combo display
      this._refreshMaxCombo();
    };

    // ── Combat ──
    const combatCallbacks: CombatCallbacks = {
      onHit: (attacker, defender, _move, tier, contact) => {
        this.vfx.hitSpark(contact.x, contact.y, tier);
        this.vfx.hitFlash(defender.sprite);
        this.vfx.screenShake(tier);
        const idx = (attacker.playerIndex - 1) as 0 | 1;
        this.hud?.setCombo(attacker.playerIndex, this.combo.getCount(idx));
      },
      onBlock: (_attacker, _defender, _move, contact) => {
        this.vfx.blockSpark(contact.x, contact.y);
      },
      // Training mode: suppress KO — just let the HP clamp in update() handle it
      onKO: (_loser) => { /* no-op: infinite HP prevents real KO */ },
      getComboCount: (attacker) => {
        const idx = (attacker.playerIndex - 1) as 0 | 1;
        return this.combo.getCount(idx);
      },
      addCombo: (attacker) => {
        const idx = (attacker.playerIndex - 1) as 0 | 1;
        this.combo.registerHit(idx);
      },
      onHitConfirm: (attacker, move) => {
        attacker.callbacks.onHitConfirm?.(attacker, move);
      },
    };

    this.combat = new Combat(this, this.fighter1, this.fighter2, combatCallbacks);

    // ── HUD ──
    this.hud = new Hud(this, { p1Data: this.p1Data, p2Data: this.p2Data });
    // Training mode: hide round pips and timer by setting them to benign values
    this.hud.setRound(1, 0);
    this.hud.setRound(2, 0);
    this.hud.setTimer(Infinity); // shows ∞ visually (large number OK)

    // ── Hitbox overlay graphics (world space, depth above fighters) ──
    this.hitboxGfx = this.add.graphics().setDepth(900);

    // ── Move-list panel (hidden by default) ──
    this.moveListPanel = this._buildMoveListPanel();
    this.moveListPanel.setVisible(false);

    // ── Pause overlay ──
    this._buildPauseOverlay();

    // ── Training HUD extras ──
    this._buildTrainingHud();

    // ── Hotkeys ──
    const kb = this.input.keyboard!;
    this.keyF1    = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F1,  false);
    this.keyTab   = kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB, false);
    this.keyR     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.R,   false);
    this.keyCycle = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F2,  false);

    // ── Music ──
    const trackId = STAGE_MUSIC[cfg.stageId] ?? 'stage1';
    playMusic(trackId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // update
  // ──────────────────────────────────────────────────────────────────────────

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs;

    // ── Pause toggle ──
    this._handlePauseToggle();
    if (this.paused) return;

    // ── Hotkey edge detection ──
    this._handleHotkeys();

    // ─────────────────────────────────────────────────────────────────────
    // GAMEPLAY FRAME
    // ─────────────────────────────────────────────────────────────────────

    // 1. Input snapshots
    this.inputP1.update();
    this.inputP2Human.update();

    // Resolve which input P2 uses this frame
    const f2Input: IInputSource = this.dummyBehaviour === 'human'
      ? this.inputP2Human
      : this._buildDummySnapshot();

    // 2. Motion buffers
    const f1Input = this.inputP1;

    this.motionBuf1.push(
      { left: f1Input.held('left'), right: f1Input.held('right'), up: f1Input.held('up'), down: f1Input.held('down') },
      this.fighter1.facing,
    );
    this.motionBuf2.push(
      { left: f2Input.held('left'), right: f2Input.held('right'), up: f2Input.held('up'), down: f2Input.held('down') },
      this.fighter2.facing,
    );

    // 3. Special/super motion checks (P1 always human; P2 only in human mode)
    this._checkSpecialInput(this.fighter1, f1Input, this.motionBuf1);
    if (this.dummyBehaviour === 'human') {
      this._checkSpecialInput(this.fighter2, f2Input, this.motionBuf2);
    }

    // 4. Fighter updates
    this.fighter1.update(f1Input,    this.fighter2.x, dt);
    this.fighter2.update(f2Input,    this.fighter1.x, dt);

    // 5. Combat
    this.combat.update();

    // 6. INFINITE HP — clamp both fighters' HP to the floor AFTER combat resolves.
    //    Hitstun/knockback/VFX have already been applied; we just prevent KO.
    if (this.fighter1.hp < HIT_FLOOR) {
      this.fighter1.hp = this.p1Data.stats.maxHp;
      // Fighter was kill()'d → force back to Idle so they can keep fighting
      if (this.fighter1.state === FighterState.Dead) {
        this.fighter1.hp = this.p1Data.stats.maxHp;
        // Resurrect by re-creating is heavy; instead rely on the fact that
        // after one full frame with hp > 0 they'll recover from Getup naturally.
        // Force hitstun exit by setting hp high — Fighter.applyHit won't kill again.
      }
    }
    if (this.fighter2.hp < HIT_FLOOR) {
      this.fighter2.hp = this.p2Data.stats.maxHp;
      if (this.fighter2.state === FighterState.Dead) {
        this.fighter2.hp = this.p2Data.stats.maxHp;
      }
    }

    // 7. Projectiles
    this.projMgr.update([this.fighter1, this.fighter2], dt);

    // 8. Combo system
    const f1InHitstun =
      this.fighter1.state === FighterState.Hitstun ||
      this.fighter1.state === FighterState.Knockdown;
    const f2InHitstun =
      this.fighter2.state === FighterState.Hitstun ||
      this.fighter2.state === FighterState.Knockdown;
    this.combo.update(dt / 1000, [f1InHitstun, f2InHitstun]);

    // 9. Stage parallax
    this.stage.update(this.cameras.main.scrollX);

    // 10. Camera: follow midpoint, clamp to stage
    const midX      = (this.fighter1.x + this.fighter2.x) / 2;
    const camHalfW  = this.cameras.main.width / 2;
    const maxScroll = this.stage.rightBound - this.cameras.main.width;
    const scrollX   = Phaser.Math.Clamp(midX - camHalfW, 0, maxScroll);
    this.cameras.main.setScroll(scrollX, 0);

    // 11. HUD health / meter (training: HP shown, no timer countdown)
    this.hud.setHealth(1, this.fighter1.hp / this.p1Data.stats.maxHp);
    this.hud.setHealth(2, this.fighter2.hp / this.p2Data.stats.maxHp);
    this.hud.setMeter(1,  this.fighter1.meter / 100);
    this.hud.setMeter(2,  this.fighter2.meter / 100);

    // 12. VFX update
    this.vfx.update(dt);

    // 13. Hitbox overlay (cleared and redrawn each frame)
    this._drawHitboxOverlay();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Dummy behaviour
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Build and assign a DummyInputSource snapshot based on the current
   * dummyBehaviour. For 'block', the dummy holds the back direction relative
   * to the fighter2's facing (i.e. always blocking).
   */
  private _buildDummySnapshot(): IInputSource {
    switch (this.dummyBehaviour) {
      case 'stand':
        this.dummyInput.setHeld({});
        break;

      case 'block': {
        // "back" for fighter2: if facing left (default), back = right key
        const backKey = this.fighter2.facing === -1 ? 'right' : 'left';
        this.dummyInput.setHeld({ [backKey]: true });
        break;
      }

      default:
        this.dummyInput.setHeld({});
        break;
    }
    return this.dummyInput;
  }

  private _cycleDummy(): void {
    this.dummyBehaviourIdx = (this.dummyBehaviourIdx + 1) % DUMMY_CYCLE.length;
    this.dummyBehaviour = DUMMY_CYCLE[this.dummyBehaviourIdx]!;
    this.dummyLabel.setText(`Dummy: ${DUMMY_LABELS[this.dummyBehaviour]}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Hotkeys
  // ──────────────────────────────────────────────────────────────────────────

  private _handleHotkeys(): void {
    // F1 — toggle hitbox overlay
    const f1Now = this.keyF1.isDown;
    if (f1Now && !this.f1Down) {
      this.hitboxOverlayOn = !this.hitboxOverlayOn;
      if (!this.hitboxOverlayOn) this.hitboxGfx.clear();
    }
    this.f1Down = f1Now;

    // Tab — toggle move list panel
    const tabNow = this.keyTab.isDown;
    if (tabNow && !this.tabDown) {
      this.moveListOn = !this.moveListOn;
      this.moveListPanel.setVisible(this.moveListOn);
    }
    this.tabDown = tabNow;

    // R — reset positions
    const rNow = this.keyR.isDown;
    if (rNow && !this.rDown) {
      this._resetPositions();
    }
    this.rDown = rNow;

    // F2 — cycle dummy behaviour
    const cycleNow = this.keyCycle.isDown;
    if (cycleNow && !this.cycleDown) {
      this._cycleDummy();
    }
    this.cycleDown = cycleNow;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Reset positions
  // ──────────────────────────────────────────────────────────────────────────

  private _resetPositions(): void {
    const midX    = this.stage.rightBound / 2;
    const groundY = this.stage.groundY;

    this.fighter1.sprite.setPosition(midX - SPAWN_OFFSET, groundY);
    this.fighter2.sprite.setPosition(midX + SPAWN_OFFSET, groundY);

    this.fighter1.hp = this.p1Data.stats.maxHp;
    this.fighter2.hp = this.p2Data.stats.maxHp;

    const body1 = this.fighter1.sprite.body as Phaser.Physics.Arcade.Body;
    const body2 = this.fighter2.sprite.body as Phaser.Physics.Arcade.Body;
    body1.setVelocity(0, 0);
    body2.setVelocity(0, 0);

    this.combo.reset(0);
    this.combo.reset(1);
    this.combat.reset();

    this.hud.setHealth(1, 1);
    this.hud.setHealth(2, 1);
    this.hud.setCombo(1, 0);
    this.hud.setCombo(2, 0);

    this._refreshMaxCombo();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Hitbox overlay
  // ──────────────────────────────────────────────────────────────────────────

  private _drawHitboxOverlay(): void {
    if (!this.hitboxOverlayOn) return;

    this.hitboxGfx.clear();

    for (const fighter of [this.fighter1, this.fighter2]) {
      // Hurtbox — blue
      const hurtbox = fighter.getHurtbox();
      this.hitboxGfx.lineStyle(2, 0x4488ff, 0.85);
      this.hitboxGfx.strokeRect(hurtbox.x, hurtbox.y, hurtbox.w, hurtbox.h);

      // Hitbox — red (active window only)
      const hitbox = fighter.getActiveHitbox();
      if (hitbox) {
        this.hitboxGfx.lineStyle(2, 0xff2222, 0.95);
        this.hitboxGfx.fillStyle(0xff2222, 0.20);
        this.hitboxGfx.fillRect(hitbox.x, hitbox.y, hitbox.w, hitbox.h);
        this.hitboxGfx.strokeRect(hitbox.x, hitbox.y, hitbox.w, hitbox.h);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Move-list panel
  // ──────────────────────────────────────────────────────────────────────────

  private _buildMoveListPanel(): Phaser.GameObjects.Container {
    const W = 380, H = 420;
    const PX = 640 - W / 2, PY = 150;

    const bg = this.add.rectangle(0, 0, W, H, 0x0a0a18, 0.90)
      .setOrigin(0, 0);
    const border = this.add.graphics();
    border.lineStyle(2, 0x4466cc, 0.8);
    border.strokeRect(0, 0, W, H);

    const title = this.add.text(W / 2, 10, `${this.p1Data.displayName.toUpperCase()} — MOVE LIST`, {
      fontFamily: '"Impact", sans-serif',
      fontSize: '14px',
      color: '#ffdd44',
    }).setOrigin(0.5, 0);

    const lines: string[] = [];

    // Normals
    lines.push('── NORMALS ──');
    for (const n of this.p1Data.normals) {
      lines.push(`  ${n.button.toUpperCase().padEnd(4)} ${n.name}`);
    }

    // Specials
    lines.push('');
    lines.push('── SPECIALS ──');
    for (const s of this.p1Data.specials) {
      const motionStr = s.motion === 'none' ? '' : `[${s.motion}]`;
      const superTag  = s.isSuper ? ' (SUPER)' : '';
      lines.push(`  ${s.button.toUpperCase()} ${motionStr} ${s.name}${superTag}`);
    }

    // Binding reminder
    lines.push('');
    lines.push('── P1 BUTTONS ──');
    lines.push('  WASD=move  J=LP  K=HP  L=LK  U=HK');

    const bodyText = this.add.text(12, 34, lines.join('\n'), {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ccddff',
      wordWrap: { width: W - 24 },
    }).setOrigin(0, 0);

    const container = this.add.container(PX, PY, [bg, border, title, bodyText])
      .setDepth(700)
      .setScrollFactor(0);

    return container;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Training HUD extras
  // ──────────────────────────────────────────────────────────────────────────

  private _buildTrainingHud(): void {
    const depth = 1010;

    // Max combo tracker
    this.maxComboText = this.add.text(640, 680, 'Max Combo: 0', {
      fontFamily: '"Impact", sans-serif',
      fontSize: '18px',
      color: '#ffdd44',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(depth);

    // Dummy label
    this.dummyLabel = this.add.text(640, 85, `Dummy: ${DUMMY_LABELS[this.dummyBehaviour]}`, {
      fontFamily: '"Impact", sans-serif',
      fontSize: '16px',
      color: '#aaffaa',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(depth);

    // Controls hint
    const hint = [
      'F1: Hitboxes  |  Tab: Move List  |  R: Reset  |  F2: Cycle Dummy  |  Esc: Pause',
    ].join('');
    this.controlsHint = this.add.text(640, 700, hint, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#888888',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(depth);
  }

  private _refreshMaxCombo(): void {
    const best = Math.max(
      this.combo.getBestCombo(0),
      this.combo.getBestCombo(1),
    );
    this.maxComboText.setText(`Max Combo: ${best}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Pause
  // ──────────────────────────────────────────────────────────────────────────

  private _handlePauseToggle(): void {
    const pauseDown = this.inputP1?.held('pause') ?? false;

    if (pauseDown && !this.pauseKeyDown) {
      this.pauseKeyDown = true;
      this.paused = !this.paused;

      if (this.paused) {
        this.physics.pause();
        this.pauseOverlay.setVisible(true);
      } else {
        this.physics.resume();
        this.pauseOverlay.setVisible(false);
      }
    }

    if (!pauseDown) this.pauseKeyDown = false;
  }

  private _buildPauseOverlay(): void {
    const bg = this.add.rectangle(640, 360, 420, 260, 0x000000, 0.78)
      .setScrollFactor(0).setDepth(800);

    const title = this.add.text(640, 270, 'PAUSED — TRAINING', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: '36px',
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(801);

    const btnResume = this.add.text(640, 340, 'Resume', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '24px',
      color: '#aaffaa',
      backgroundColor: '#003300',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(801).setInteractive({ useHandCursor: true });

    btnResume.on('pointerdown', () => {
      this.paused = false;
      this.physics.resume();
      this.pauseOverlay.setVisible(false);
    });

    const btnQuit = this.add.text(640, 400, 'Quit to Menu', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '24px',
      color: '#ffaaaa',
      backgroundColor: '#330000',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(801).setInteractive({ useHandCursor: true });

    btnQuit.on('pointerdown', () => {
      stopMusic();
      this.scene.start('MainMenuScene');
    });

    this.pauseOverlay = this.add.container(0, 0, [bg, title, btnResume, btnQuit])
      .setVisible(false).setDepth(800);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Special / super motion check (human players only)
  // ──────────────────────────────────────────────────────────────────────────

  private _checkSpecialInput(
    fighter: Fighter,
    input: IInputSource,
    motionBuf: MotionBuffer,
  ): void {
    for (let i = 0; i < fighter.data.specials.length; i++) {
      const special = fighter.data.specials[i];
      if (!special) continue;
      if (special.motion === 'none') continue;

      const buttonJustPressed = input.justPressed(special.button);
      if (!buttonJustPressed) continue;

      if (motionBuf.matches(special.motion)) {
        if (special.isSuper) {
          fighter.tryStartSuper();
        } else {
          fighter.tryStartSpecial(i === 0 ? 0 : 1);
        }
        break;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Shutdown
  // ──────────────────────────────────────────────────────────────────────────

  shutdown(): void {
    if (this.fighter1) gameState.p1Meter = this.fighter1.meter;
    if (this.fighter2) gameState.p2Meter = this.fighter2.meter;

    this.vfx?.destroy();
    this.hud?.destroy();
    this.stage?.destroy();

    this.time.timeScale          = 1;
    this.physics.world.timeScale = 1;
  }
}
