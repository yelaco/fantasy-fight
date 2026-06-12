import Phaser from 'phaser';
import config from './game/config';

declare global {
  interface Window {
    game: Phaser.Game;
  }
}

const game = new Phaser.Game(config);
window.game = game;
