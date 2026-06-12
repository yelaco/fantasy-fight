export type Archetype = 'balanced' | 'zoner' | 'grappler' | 'rushdown' | 'mixed' | 'special';
export type MotionInput = 'none' | 'qcf' | 'qcb' | 'charge_back_fwd' | 'charge_down_up' | 'dp';
export type AttackButton = 'lp' | 'hp' | 'lk' | 'hk';

export interface FrameHitbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MoveData {
  name: string;
  button: AttackButton;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  hitstun: number;
  blockstun: number;
  knockback: number;
  hitbox: FrameHitbox;
  animState: string;
  tier: 'light' | 'heavy';
  cancelableInto?: AttackButton[] | 'special';
  launcher?: boolean;
}

export interface ProjectileData {
  id: string;
  textureKey: string;
  frameW: number;
  frameH: number;
  frameCount: number;
  speed: number;
  damage: number;
  hitstun: number;
  maxRange: number;
  hitbox: FrameHitbox;
  spawnOffset: { x: number; y: number };
}

export interface SpecialMoveData {
  name: string;
  motion: MotionInput;
  button: AttackButton;
  meterCost: number;
  isSuper?: boolean;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  hitstun: number;
  blockstun: number;
  knockback: number;
  hitbox?: FrameHitbox;
  projectile?: ProjectileData;
  animState: string;
  vfx?: string;
  sfx?: string;
}

export interface AnimSpec {
  key: string;
  state: string;
  frameRate: number;
  repeat: number;
  flipX?: boolean;
}

export interface FighterFlags {
  hasJump: boolean;
  hasBlock: boolean;
}

export interface FighterStats {
  maxHp: number;
  walkSpeed: number;
  jumpVelocity: number;
  weight: number;
  meterGainOnHit: number;
  meterGainOnTake: number;
}

export interface FighterData {
  id: string;
  family: string;
  displayName: string;
  archetype: Archetype;
  lore: string;
  stats: FighterStats;
  flags: FighterFlags;
  animations: Record<string, AnimSpec>;
  normals: MoveData[];
  specials: SpecialMoveData[];
  winQuotes: string[];
  portraitState?: string;
}
