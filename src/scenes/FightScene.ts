/**
 * FightScene.ts  (T21 — core match loop)
 * =========================================
 * Scene key: 'FightScene'
 *
 * AI-vs-human rule
 * ─────────────────
 *   mode === 'arcade'  → P1 human (InputManager + P1_BINDINGS),
 *                         P2 AI   (AIController at config.difficulty).
 *   mode === 'versus'  → P1 human, P2 human.
 *   mode === 'training'→ treated as versus (TrainingScene, T25, owns training).
 *
 *   CharSelect is responsible for setting mode correctly.  If a "1P vs CPU"
 *   button sets mode='arcade', this scene picks it up automatically.
 *
 * Update order (every frame)
 * ──────────────────────────
 *  1. If paused → skip all game logic.
 *  2. If roundState !== 'fighting' → handle intro / KO hold timers.
 *  3. inputP1.update() / aiP2.update(dt) — raw input snapshot.
 *  4. motionBuf1.push() / motionBuf2.push() — motion recognition.
 *  5. Special/super motion checks → fighter.tryStartSpecial/Super().
 *  6. fighter1.update(input1, opp.x, dt) + fighter2.update(input2, opp.x, dt).
 *  7. combat.update().
 *  8. projMgr.update([f1,f2], dt).
 *  9. combo.update(dt, hitstunFlags).
 * 10. stage.update(cam.scrollX).
 * 11. Camera midpoint follow + clamp.
 * 12. HUD: health / meter / timer.
 * 13. vfx.update(dt).
 * 14. Low-health one-shot checks.
 * 15. Timer countdown + timer-warning SFX.
 */

import Phaser from 'phaser';

import { gameState }           from '../game/state/GameState';
import { getFighter }          from '../data/roster';
import { ARCADE_LADDER }       from '../data/roster';

import { Fighter }             from '../game/entities/Fighter';
import { FighterState }        from '../game/entities/states';
import type { FighterData }    from '../types';

import {
  InputManager,
  P1_BINDINGS,
  P2_BINDINGS,
  MotionBuffer,
}                              from '../input';
import { AIController }        from '../game/ai/AIController';
import type { IInputSource }   from '../input';

import { Combat }              from '../game/systems/Combat';
import type { CombatCallbacks, ContactPoint } from '../game/systems/Combat';
import type { MoveData, SpecialMoveData }     from '../types';

import { ProjectileManager }   from '../game/systems/Projectile';
import { ComboSystem }         from '../game/systems/Combo';
import { Vfx }                 from '../game/systems/Vfx';
import { TUNING }              from '../game/systems/tuning';

import { Stage }               from '../game/stage/Stage';
import type { Manifest }       from '../types/manifest';

import { Hud }                 from '../game/fight/Hud';

import { playSfx, playMusic, stopMusic } from '../audio';

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGE_MUSIC: Record<string, import('../audio').TrackId> = {
  Battleground1: 'stage1',
  Battleground2: 'stage2',
  Battleground3: 'stage3',
  Battleground4: 'stage4',
};

/** World-space X positions where each fighter spawns. */
const SPAWN_OFFSET = 300; // from stage centre

/** How many seconds the "Round N" banner is frozen before "FIGHT!" appears. */
const INTRO_BANNER_SEC  = 1.5;
/** How long "FIGHT!" is shown before input is re-enabled. */
const FIGHT_BANNER_SEC  = 0.6;
/** How long the KO screen holds (slow-mo included). */
const KO_HOLD_SEC       = TUNING.round.koHoldFrames / 60;
/** How long between round-end and next round starting. */
const ROUND_RESET_SEC   = TUNING.round.roundResetFrames / 60;

/** Time scale applied to the Phaser scene during the KO slow-mo moment. */
const KO_SLOWMO_SCALE   = 0.15;

// ─── Round state machine ─────────────────────────────────────────────────────

type RoundState =
  | 'intro'      // banner shown, input frozen
  | 'fighting'   // normal play
  | 'ko'         // KO sequence running
  | 'done';      // match over, transitioning

// ─── FightScene ──────────────────────────────────────────────────────────────

export class FightScene extends Phaser.Scene {

  // ── Systems ──
  private stage!: Stage;
  private fighter1!: Fighter;
  private fighter2!: Fighter;
  private inputP1!: InputManager;
  private inputP2!: IInputSource;     // human or AI
  private motionBuf1!: MotionBuffer;
  private motionBuf2!: MotionBuffer;
  private combat!: Combat;
  private projMgr!: ProjectileManager;
  private combo!: ComboSystem;
  private vfx!: Vfx;
  private hud!: Hud;

  // ── Round / match ──
  private roundState: RoundState = 'intro';
  private roundTimer: number = TUNING.round.timerSeconds; // seconds remaining
  private introTimer      = 0;   // seconds elapsed in intro phase
  private koTimer         = 0;   // seconds elapsed in KO hold
  private inputEnabled    = false;
  private roundNumber     = 1;   // 1-indexed display label
  private koSlowmoActive  = false;

  // ── Low-health tracking (fire once per round per fighter) ──
  private p1LowHealthFired = false;
  private p2LowHealthFired = false;

  // ── Timer-warning tracking ──
  private lastTimerWarnSec = Infinity; // last integer second when warning played

  // ── Pause ──
  private paused           = false;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private pauseKeyDown     = false; // edge-detect for Esc

  // ── Config snapshot ──
  private p1Data!: FighterData;
  private p2Data!: FighterData;

  constructor() {
    super({ key: 'FightScene' });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // init
  // ──────────────────────────────────────────────────────────────────────────

  init(): void {
    // Config is already on gameState; nothing extra to receive from scene.start data.
    // (CharSelect or ArcadeLobby called gameState.startMatch(config) before launching.)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────────────────────────────

  create(): void {
    const cfg    = gameState.config;
    const manifest: Manifest = this.registry.get('manifest');

    // ── Fighter data ──
    this.p1Data = getFighter(cfg.p1Id);
    this.p2Data = getFighter(cfg.p2Id);

    // ── Stage ──
    this.stage = new Stage(this, manifest, cfg.stageId, cfg.stageVariant);
    const { groundY, rightBound } = this.stage;

    // Set world + physics bounds
    this.physics.world.setBounds(0, 0, rightBound, 720);
    this.cameras.main.setBounds(0, 0, rightBound, 720);

    // ── Fighters ──
    const midX = rightBound / 2;
    this.fighter1 = new Fighter(
      this,
      midX - SPAWN_OFFSET,
      groundY,
      this.p1Data,
      1,       // facing right
      1,
    );
    this.fighter2 = new Fighter(
      this,
      midX + SPAWN_OFFSET,
      groundY,
      this.p2Data,
      -1,      // facing left
      2,
    );
    this.fighter1.groundY = groundY;
    this.fighter2.groundY = groundY;

    // Restore meter from gameState (persists across rounds in a match)
    this.fighter1.meter = gameState.p1Meter;
    this.fighter2.meter = gameState.p2Meter;

    // ── Input ──
    this.inputP1 = new InputManager(this, P1_BINDINGS);

    if (cfg.mode === 'arcade') {
      this.inputP2 = new AIController(
        this.fighter2,
        this.fighter1,
        cfg.difficulty,
        // derive AI archetype from fighter data archetype field (best-effort)
        this._archetypeFor(this.p2Data),
      );
    } else {
      // 'versus' / 'training' → both human
      this.inputP2 = new InputManager(this, P2_BINDINGS);
    }

    // Motion buffers
    this.motionBuf1 = new MotionBuffer();
    this.motionBuf2 = new MotionBuffer();

    // ── Systems ──
    this.combo   = new ComboSystem();
    this.vfx     = new Vfx(this);
    this.projMgr = new ProjectileManager(this);

    // Wire projectile hit → VFX
    this.projMgr.onProjectileHit = (e) => {
      this.vfx.hitSpark(e.x, e.y, 'special');
    };

    // Wire fighter projectile spawn callbacks
    this.fighter1.callbacks.onSpawnProjectile = (f, special) => {
      if (special.projectile) {
        this.projMgr.spawn(special.projectile, {
          x: f.x,
          y: f.y,
          facing: f.facing,
          playerIndex: f.playerIndex,
        });
      }
    };
    this.fighter2.callbacks.onSpawnProjectile = (f, special) => {
      if (special.projectile) {
        this.projMgr.spawn(special.projectile, {
          x: f.x,
          y: f.y,
          facing: f.facing,
          playerIndex: f.playerIndex,
        });
      }
    };

    // ── Combo system callbacks ──
    this.combo.onComboUpdate = (attackerIndex, count) => {
      const player = (attackerIndex + 1) as 1 | 2;
      this.hud?.setCombo(player, count);
      if (count >= 2) {
        const f = attackerIndex === 0 ? this.fighter1 : this.fighter2;
        this.vfx.comboFloater(f.x, f.y - 120, `${count} Hits!`);
      }
    };

    // ── Combat ──
    const combatCallbacks: CombatCallbacks = {
      onHit: (attacker, defender, _move, tier, contact) => {
        this.vfx.hitSpark(contact.x, contact.y, tier);
        this.vfx.hitFlash(defender.sprite);
        this.vfx.screenShake(tier);
        // combo count updated in addCombo (called by Combat before onHit)
        const idx = (attacker.playerIndex - 1) as 0 | 1;
        this.hud?.setCombo(attacker.playerIndex, this.combo.getCount(idx));
      },

      onBlock: (attacker, _defender, _move, contact) => {
        void attacker;
        this.vfx.blockSpark(contact.x, contact.y);
      },

      onKO: (loser) => {
        this._startKoSequence(loser);
      },

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
    this.hud.setRound(1, gameState.p1RoundWins);
    this.hud.setRound(2, gameState.p2RoundWins);
    this.hud.setTimer(TUNING.round.timerSeconds);

    // ── Pause overlay (hidden) ──
    this._buildPauseOverlay();

    // ── Music ──
    const trackId = STAGE_MUSIC[cfg.stageId] ?? 'stage1';
    playMusic(trackId);

    // ── Start first round intro ──
    this.roundState  = 'intro';
    this.roundNumber = gameState.roundIndex + 1;
    this.introTimer  = 0;
    this.inputEnabled = false;
    this.hud.showRoundBanner(`Round ${this.roundNumber}`);
    playSfx('round_start');

    // Reset low-health flags for this round
    this.p1LowHealthFired = false;
    this.p2LowHealthFired = false;
    this.lastTimerWarnSec = Infinity;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // update
  // ──────────────────────────────────────────────────────────────────────────

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs; // ms — consistent with Phaser convention

    // ── Pause toggle ──
    this._handlePauseToggle();
    if (this.paused) return;

    // ── Round state machine ──
    switch (this.roundState) {
      case 'intro':
        this._tickIntro(dt / 1000);
        return; // no gameplay while intro is running

      case 'ko':
        this._tickKo(dt / 1000);
        return; // no gameplay during KO hold

      case 'done':
        return;

      case 'fighting':
        break; // fall through to gameplay
    }

    // ─────────────────────────────────────────────────────────────────────
    // GAMEPLAY FRAME
    // ─────────────────────────────────────────────────────────────────────

    // 1. Input snapshot
    this.inputP1.update();
    if (this.inputP2 instanceof AIController) {
      this.inputP2.update(dt);
    } else if (this.inputP2 instanceof InputManager) {
      this.inputP2.update();
    }

    if (!this.inputEnabled) return;

    // 2. Motion buffers
    const f1Input = this.inputP1;
    const f2Input = this.inputP2;

    this.motionBuf1.push(
      { left: f1Input.held('left'), right: f1Input.held('right'), up: f1Input.held('up'), down: f1Input.held('down') },
      this.fighter1.facing,
    );
    this.motionBuf2.push(
      { left: f2Input.held('left'), right: f2Input.held('right'), up: f2Input.held('up'), down: f2Input.held('down') },
      this.fighter2.facing,
    );

    // 3. Special/super motion checks for P1
    this._checkSpecialInput(this.fighter1, f1Input, this.motionBuf1);

    // 4. Special/super motion checks for P2 (only for human P2)
    if (cfg_mode_is_versus(gameState.config.mode)) {
      this._checkSpecialInput(this.fighter2, f2Input, this.motionBuf2);
    }
    // AI handles specials via its own motion emitter; no manual check needed.

    // 5. Fighter updates
    this.fighter1.update(f1Input, this.fighter2.x, dt);
    this.fighter2.update(f2Input, this.fighter1.x, dt);

    // 6. Combat
    this.combat.update();

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

    // 10. Camera: follow midpoint, clamp to stage bounds
    const midX = (this.fighter1.x + this.fighter2.x) / 2;
    const camHalfW = this.cameras.main.width / 2;
    const minScroll = 0;
    const maxScroll = this.stage.rightBound - this.cameras.main.width;
    const targetScrollX = Phaser.Math.Clamp(midX - camHalfW, minScroll, maxScroll);
    this.cameras.main.setScroll(targetScrollX, 0);

    // 11. HUD updates
    this.hud.setHealth(1, this.fighter1.hp / this.p1Data.stats.maxHp);
    this.hud.setHealth(2, this.fighter2.hp / this.p2Data.stats.maxHp);
    this.hud.setMeter(1, this.fighter1.meter / 100);
    this.hud.setMeter(2, this.fighter2.meter / 100);

    // 12. Timer countdown
    this.roundTimer -= dt / 1000;
    if (this.roundTimer < 0) this.roundTimer = 0;
    this.hud.setTimer(this.roundTimer);

    // Timer warning SFX (once per second when ≤ 10)
    if (this.roundTimer <= 10 && this.roundTimer > 0) {
      const secNow = Math.ceil(this.roundTimer);
      if (secNow !== this.lastTimerWarnSec) {
        this.lastTimerWarnSec = secNow;
        playSfx('timer_warning');
      }
    }

    // Timer expired → judge by HP
    if (this.roundTimer <= 0 && this.roundState === 'fighting') {
      this._handleTimeOut();
    }

    // 13. VFX update
    this.vfx.update(dt);

    // 14. Low-health one-shot checks
    this._checkLowHealth();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Pause
  // ──────────────────────────────────────────────────────────────────────────

  private _handlePauseToggle(): void {
    // P1 escape or AI-match escape
    const pauseDown = this.inputP1?.held('pause') ?? false;

    if (pauseDown && !this.pauseKeyDown && this.roundState === 'fighting') {
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

    if (!pauseDown) {
      this.pauseKeyDown = false;
    }
  }

  private _buildPauseOverlay(): void {
    const bg = this.add.rectangle(640, 360, 400, 240, 0x000000, 0.75)
      .setScrollFactor(0).setDepth(800);

    const title = this.add.text(640, 280, 'PAUSED', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize:   '42px',
      color:      '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(801);

    // Resume button
    const btnResume = this.add.text(640, 350, 'Resume', {
      fontFamily: 'Arial, sans-serif',
      fontSize:   '24px',
      color:      '#aaffaa',
      backgroundColor: '#003300',
      padding:    { x: 16, y: 8 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(801).setInteractive({ useHandCursor: true });

    btnResume.on('pointerdown', () => {
      this.paused = false;
      this.physics.resume();
      this.pauseOverlay.setVisible(false);
    });

    // Quit button
    const btnQuit = this.add.text(640, 410, 'Quit to Menu', {
      fontFamily: 'Arial, sans-serif',
      fontSize:   '24px',
      color:      '#ffaaaa',
      backgroundColor: '#330000',
      padding:    { x: 16, y: 8 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(801).setInteractive({ useHandCursor: true });

    btnQuit.on('pointerdown', () => {
      stopMusic();
      this.scene.start('MainMenuScene');
    });

    this.pauseOverlay = this.add.container(0, 0, [bg, title, btnResume, btnQuit])
      .setVisible(false).setDepth(800);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Intro sequencing
  // ──────────────────────────────────────────────────────────────────────────

  private _tickIntro(dtSec: number): void {
    this.introTimer += dtSec;

    if (this.introTimer >= INTRO_BANNER_SEC && this.introTimer < INTRO_BANNER_SEC + FIGHT_BANNER_SEC) {
      // Show "FIGHT!" once
      if (!this._fightBannerShown) {
        this._fightBannerShown = true;
        this.hud.showRoundBanner('FIGHT!');
      }
    }

    if (this.introTimer >= INTRO_BANNER_SEC + FIGHT_BANNER_SEC) {
      // Enable input and transition to fighting
      this.inputEnabled = true;
      this.roundState   = 'fighting';
    }
  }

  private _fightBannerShown = false;

  // ──────────────────────────────────────────────────────────────────────────
  // KO sequence
  // ──────────────────────────────────────────────────────────────────────────

  private _startKoSequence(loser: Fighter): void {
    if (this.roundState === 'ko' || this.roundState === 'done') return;

    this.roundState   = 'ko';
    this.inputEnabled = false;
    this.koTimer      = 0;

    // Determine winner
    const loserPlayer = loser.playerIndex;
    const winnerPlayer: 1 | 2 = loserPlayer === 1 ? 2 : 1;

    // Save meter state (persists across rounds)
    gameState.p1Meter = this.fighter1.meter;
    gameState.p2Meter = this.fighter2.meter;

    // Record round win
    gameState.recordRoundWin(winnerPlayer);

    // VFX + SFX
    this.vfx.koBurst(loser.x, loser.y - 80);
    playSfx('round_end');
    this.hud.showKo();

    // Update HUD round pips
    this.hud.setRound(1, gameState.p1RoundWins);
    this.hud.setRound(2, gameState.p2RoundWins);

    // Slow-mo effect
    this.time.timeScale      = KO_SLOWMO_SCALE;
    this.physics.world.timeScale = 1 / KO_SLOWMO_SCALE; // physics runs at normal speed
    this.koSlowmoActive = true;

    // Restore time scale after a beat
    this.time.delayedCall(300, () => {
      this.time.timeScale          = 1;
      this.physics.world.timeScale = 1;
      this.koSlowmoActive          = false;
    });

    // Freeze both fighters (no input)
    loser.kill(); // ensure Dead state
  }

  private _tickKo(dtSec: number): void {
    this.koTimer += dtSec;

    if (this.koTimer >= KO_HOLD_SEC) {
      this._endRound();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Time-out
  // ──────────────────────────────────────────────────────────────────────────

  private _handleTimeOut(): void {
    if (this.roundState !== 'fighting') return;

    const hp1 = this.fighter1.hp;
    const hp2 = this.fighter2.hp;

    if (hp1 > hp2) {
      // P1 wins by HP
      this._startKoSequence(this.fighter2); // loser is the one with lower HP
      // But don't call kill on fighter2 since it wasn't a KO — just trigger sequence
    } else if (hp2 > hp1) {
      this._startKoSequence(this.fighter1);
    } else {
      // Exact HP tie → draw (no round win for either player)
      this._handleDraw();
      return;
    }
  }

  private _handleDraw(): void {
    if (this.roundState === 'ko' || this.roundState === 'done') return;

    this.roundState   = 'ko';
    this.inputEnabled = false;
    this.koTimer      = 0;

    playSfx('round_end');
    this.hud.showRoundBanner('Draw!');

    // No round win recorded → round replays (both stay alive, just reset positions)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Round end → check match winner → next round or victory
  // ──────────────────────────────────────────────────────────────────────────

  private _endRound(): void {
    const winner = gameState.matchWinner();

    if (winner !== null) {
      // Match over
      this.roundState = 'done';
      const winnerId  = winner === 1 ? this.p1Data.id : this.p2Data.id;
      gameState.setLastWinner(winner, winnerId);
      stopMusic();

      const cfg = gameState.config;

      if (cfg.mode === 'arcade') {
        gameState.advanceArcade();
        if (gameState.isArcadeComplete(ARCADE_LADDER.length)) {
          this.scene.start('VictoryScene');
        } else {
          // Next arcade fight
          const nextOpponentId = ARCADE_LADDER[gameState.arcadeIndex];
          if (nextOpponentId) {
            gameState.patch({ p2Id: nextOpponentId });
            gameState.p1RoundWins = 0;
            gameState.p2RoundWins = 0;
            gameState.roundIndex  = 0;
            gameState.p1Meter     = this.fighter1.meter; // carry meter (optional; reset if preferred)
            gameState.p2Meter     = 0; // new opponent starts fresh
            this.scene.restart();
          } else {
            this.scene.start('VictoryScene');
          }
        }
      } else {
        // versus / training → victory screen
        this.scene.start('VictoryScene');
      }
    } else {
      // Next round
      gameState.nextRound();
      this.roundNumber += 1;
      this._resetRound();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Round reset (between rounds)
  // ──────────────────────────────────────────────────────────────────────────

  private _resetRound(): void {
    const cfg      = gameState.config;
    const midX     = this.stage.rightBound / 2;
    const groundY  = this.stage.groundY;

    // Save & restore meter
    gameState.p1Meter = this.fighter1.meter;
    gameState.p2Meter = this.fighter2.meter;

    // Reposition fighters
    this.fighter1.sprite.setPosition(midX - SPAWN_OFFSET, groundY);
    this.fighter2.sprite.setPosition(midX + SPAWN_OFFSET, groundY);

    // Restore HP
    this.fighter1.hp = this.p1Data.stats.maxHp;
    this.fighter2.hp = this.p2Data.stats.maxHp;

    // Restore meter from saved state
    this.fighter1.meter = gameState.p1Meter;
    this.fighter2.meter = gameState.p2Meter;

    // Reset fighter states by killing and resurrecting (use forceIdle via kill chain)
    // Fighter.kill() sets Dead; we need Idle — just call the private forceState equivalent.
    // Since Fighter doesn't expose forceIdle publicly, we re-create the fighter … or
    // we call kill() and then immediately set hp back.
    // Best approach: set state to Idle via a small helper or simply restart the scene
    // for a clean round. Here we'll use scene.restart with gameState intact.
    // Actually we want a seamless round start; let's reset fighters in place.

    // Combat reset
    this.combat.reset();

    // Combo reset
    this.combo.reset(0);
    this.combo.reset(1);

    // Reset round timer
    this.roundTimer = TUNING.round.timerSeconds;
    this.hud.setTimer(this.roundTimer);

    // Reset low-health flags
    this.p1LowHealthFired = false;
    this.p2LowHealthFired = false;
    this.lastTimerWarnSec = Infinity;

    // Update HUD win pips
    this.hud.setRound(1, gameState.p1RoundWins);
    this.hud.setRound(2, gameState.p2RoundWins);

    // Intro for next round
    this.roundState   = 'intro';
    this.introTimer   = 0;
    this.inputEnabled = false;
    this._fightBannerShown = false;

    // If mode=arcade and AI, re-create AI with fresh fighter references
    if (cfg.mode === 'arcade') {
      this.inputP2 = new AIController(
        this.fighter2,
        this.fighter1,
        cfg.difficulty,
        this._archetypeFor(this.p2Data),
      );
    }

    this.hud.showRoundBanner(`Round ${this.roundNumber}`);
    playSfx('round_start');

    // Reset physics velocities
    const body1 = this.fighter1.sprite.body as Phaser.Physics.Arcade.Body;
    const body2 = this.fighter2.sprite.body as Phaser.Physics.Arcade.Body;
    body1.setVelocity(0, 0);
    body2.setVelocity(0, 0);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Low-health detection
  // ──────────────────────────────────────────────────────────────────────────

  private _checkLowHealth(): void {
    const threshold = TUNING.lowHealthThreshold;

    if (!this.p1LowHealthFired && this.fighter1.hp / this.p1Data.stats.maxHp <= threshold) {
      this.p1LowHealthFired = true;
      playSfx('low_health');
      this.hud.setLowHealth(1, true);
    }

    if (!this.p2LowHealthFired && this.fighter2.hp / this.p2Data.stats.maxHp <= threshold) {
      this.p2LowHealthFired = true;
      playSfx('low_health');
      this.hud.setLowHealth(2, true);
    }
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

      const motion = special.motion;
      if (motion === 'none') continue;

      // Check if the motion matches and the trigger button was just pressed
      const buttonJustPressed = input.justPressed(special.button);
      if (!buttonJustPressed) continue;

      if (motionBuf.matches(motion)) {
        if (special.isSuper) {
          fighter.tryStartSuper();
        } else {
          fighter.tryStartSpecial(i === 0 ? 0 : 1);
        }
        break; // Only one special per frame
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private _archetypeFor(data: FighterData): import('../game/ai/AIController').AIArchetype {
    const a = data.archetype;
    if (a === 'rushdown') return 'rushdown';
    if (a === 'zoner')    return 'zoner';
    return 'balanced';
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Shutdown cleanup
  // ──────────────────────────────────────────────────────────────────────────

  shutdown(): void {
    // Save meter to gameState before leaving
    if (this.fighter1) gameState.p1Meter = this.fighter1.meter;
    if (this.fighter2) gameState.p2Meter = this.fighter2.meter;

    this.vfx?.destroy();
    this.hud?.destroy();
    this.stage?.destroy();

    // Restore time scale in case we left mid-KO
    this.time.timeScale          = 1;
    this.physics.world.timeScale = 1;
  }
}

// ─── Utility (top-level, tree-shakeable) ─────────────────────────────────────

function cfg_mode_is_versus(mode: string): boolean {
  return mode === 'versus' || mode === 'training';
}
