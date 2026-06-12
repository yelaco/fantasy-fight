import { defaultMatchConfig, type Difficulty, type MatchConfig } from './MatchConfig';

const PREFS_KEY = 'ff_prefs';

interface Prefs {
  defaultDifficulty: Difficulty;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Prefs>;
      return {
        defaultDifficulty: parsed.defaultDifficulty ?? 'medium',
      };
    }
  } catch {
    // ignore
  }
  return { defaultDifficulty: 'medium' };
}

function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

class GameState {
  // Match config
  private _config: MatchConfig = defaultMatchConfig();

  // Per-match round state
  p1RoundWins = 0;
  p2RoundWins = 0;
  roundIndex = 0;

  // Per-round carry (resets each match)
  p1Meter = 0;
  p2Meter = 0;

  // Victory screen
  lastWinner: 1 | 2 | null = null;
  lastWinnerId: string | null = null;

  // Arcade ladder state
  arcadeFighterId: string = '';
  arcadeIndex: number = 0;
  arcadeDifficulty: Difficulty = 'medium';
  arcadeCleared: boolean = false;

  // Persisted preferences
  defaultDifficulty: Difficulty;

  constructor() {
    const prefs = loadPrefs();
    this.defaultDifficulty = prefs.defaultDifficulty;
  }

  // Config getter / setter / patch
  get config(): MatchConfig {
    return this._config;
  }

  set config(value: MatchConfig) {
    this._config = value;
  }

  patch(partial: Partial<MatchConfig>): void {
    this._config = { ...this._config, ...partial };
  }

  // Match lifecycle
  startMatch(config: MatchConfig): void {
    this._config = config;
    this.resetMatch();
  }

  resetMatch(): void {
    this.p1RoundWins = 0;
    this.p2RoundWins = 0;
    this.roundIndex = 0;
    this.p1Meter = 0;
    this.p2Meter = 0;
    this.lastWinner = null;
    this.lastWinnerId = null;
  }

  nextRound(): void {
    this.roundIndex += 1;
  }

  recordRoundWin(player: 1 | 2): void {
    if (player === 1) {
      this.p1RoundWins += 1;
    } else {
      this.p2RoundWins += 1;
    }
  }

  matchWinner(): 1 | 2 | null {
    const { roundsToWin } = this._config;
    if (this.p1RoundWins >= roundsToWin) return 1;
    if (this.p2RoundWins >= roundsToWin) return 2;
    return null;
  }

  setLastWinner(player: 1 | 2, id: string): void {
    this.lastWinner = player;
    this.lastWinnerId = id;
  }

  // Arcade ladder
  startArcade(fighterId: string, difficulty: Difficulty): void {
    this.arcadeFighterId = fighterId;
    this.arcadeDifficulty = difficulty;
    this.arcadeIndex = 0;
    this.arcadeCleared = false;
  }

  advanceArcade(): void {
    this.arcadeIndex += 1;
  }

  isArcadeComplete(ladderLength: number): boolean {
    return this.arcadeIndex >= ladderLength;
  }

  // Preferences persistence
  saveDefaultDifficulty(difficulty: Difficulty): void {
    this.defaultDifficulty = difficulty;
    savePrefs({ defaultDifficulty: difficulty });
  }
}

export const gameState = new GameState();
