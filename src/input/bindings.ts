import Phaser from 'phaser';

export type GameAction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'lp'
  | 'hp'
  | 'lk'
  | 'hk'
  | 'pause';

const KC = Phaser.Input.Keyboard.KeyCodes;

export const P1_BINDINGS: Record<GameAction, number> = {
  left:  KC.A,
  right: KC.D,
  up:    KC.W,
  down:  KC.S,
  lp:    KC.J,
  hp:    KC.K,
  lk:    KC.L,
  hk:    KC.U,
  pause: KC.ESC,
};

export const P2_BINDINGS: Record<GameAction, number> = {
  left:  KC.LEFT,
  right: KC.RIGHT,
  up:    KC.UP,
  down:  KC.DOWN,
  lp:    KC.NUMPAD_ONE,
  hp:    KC.NUMPAD_TWO,
  lk:    KC.NUMPAD_THREE,
  hk:    KC.NUMPAD_FOUR,
  pause: KC.ESC,
};
