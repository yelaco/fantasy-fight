import Phaser from 'phaser';
import { GameAction } from './bindings';

/** Shared contract so AI controllers can be plugged in wherever InputManager is used. */
export interface IInputSource {
  held(action: GameAction): boolean;
  justPressed(action: GameAction): boolean;
  justReleased(action: GameAction): boolean;
}

type KeyMap = Map<GameAction, Phaser.Input.Keyboard.Key>;

export class InputManager implements IInputSource {
  private keys: KeyMap = new Map();
  private prev: Map<GameAction, boolean> = new Map();
  private curr: Map<GameAction, boolean> = new Map();

  constructor(
    private readonly scene: Phaser.Scene,
    bindings: Record<GameAction, number>,
  ) {
    const kb = scene.input?.keyboard;
    if (!kb) return;

    for (const [action, keyCode] of Object.entries(bindings) as [GameAction, number][]) {
      const key = kb.addKey(keyCode, /* enableCapture */ false);
      this.keys.set(action, key);
      this.prev.set(action, false);
      this.curr.set(action, false);
    }
  }

  /** Call once per frame (e.g. from Scene.update or a preupdate listener). */
  update(): void {
    for (const [action, key] of this.keys) {
      this.prev.set(action, this.curr.get(action) ?? false);
      this.curr.set(action, key.isDown);
    }
  }

  held(action: GameAction): boolean {
    return this.curr.get(action) ?? false;
  }

  justPressed(action: GameAction): boolean {
    return (this.curr.get(action) ?? false) && !(this.prev.get(action) ?? false);
  }

  justReleased(action: GameAction): boolean {
    return !(this.curr.get(action) ?? false) && (this.prev.get(action) ?? false);
  }

  /** Directional snapshot used by MotionBuffer each frame. */
  get dirSnapshot(): { left: boolean; right: boolean; up: boolean; down: boolean } {
    return {
      left:  this.held('left'),
      right: this.held('right'),
      up:    this.held('up'),
      down:  this.held('down'),
    };
  }
}
