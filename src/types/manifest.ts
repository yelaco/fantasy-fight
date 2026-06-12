export type StageVariant = 'Bright' | 'Pale';

export interface CharacterAnimEntry {
  family: string;
  variant: string;
  state: string;
  frameW: number;
  frameH: number;
  frameCount: number;
  path: string;
}

export interface StageLayerEntry {
  stage: string;
  variant: StageVariant;
  layer: string;
  index: number;
  path: string;
  width: number;
  height: number;
}

export interface Manifest {
  characters: CharacterAnimEntry[];
  stages: StageLayerEntry[];
}
