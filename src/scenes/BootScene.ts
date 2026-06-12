import Phaser from 'phaser';

/**
 * BootScene — key: 'BootScene'
 *
 * Minimal first scene. Configures pixel art scaling, generates a 1×1 white
 * texture used for health/meter bars, draws a quick title splash, then
 * immediately hands off to PreloadScene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Generate a 1×1 white texture for solid-colour rectangles (HP bars etc.)
    if (!this.textures.exists('white')) {
      const gfx = this.make.graphics({ x: 0, y: 0 });
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(0, 0, 1, 1);
      gfx.generateTexture('white', 1, 1);
      gfx.destroy();
    }

    // Simple title text — visible for a frame before PreloadScene's bar appears.
    this.add
      .text(width / 2, height / 2, 'Fantasy Fight', {
        fontFamily: 'serif',
        fontSize: '48px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.scene.start('PreloadScene');
  }
}
