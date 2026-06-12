export type GameMode = 'arcade' | 'versus' | 'training';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type StageVariant = 'Bright' | 'Pale';

export interface MatchConfig {
  mode: GameMode;
  p1Id: string;
  p2Id: string;
  stageId: string;
  stageVariant: StageVariant;
  difficulty: Difficulty;
  roundsToWin: number;
}

export function defaultMatchConfig(): MatchConfig {
  return {
    mode: 'versus',
    p1Id: '',
    p2Id: '',
    stageId: 'Battleground1',
    stageVariant: 'Bright',
    difficulty: 'medium',
    roundsToWin: 2,
  };
}
