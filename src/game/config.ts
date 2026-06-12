import Phaser from 'phaser';
import { BootScene }             from '../scenes/BootScene';
import { PreloadScene }          from '../scenes/PreloadScene';
import { MainMenuScene }         from '../scenes/MainMenuScene';
import { OptionsScene }          from '../scenes/OptionsScene';
import { CreditsScene }          from '../scenes/CreditsScene';
import { CharacterSelectScene }  from '../scenes/CharacterSelectScene';
import { StageSelectScene }      from '../scenes/StageSelectScene';
import { FightScene }            from '../scenes/FightScene';
import { VictoryScene }          from '../scenes/VictoryScene';
import { TrainingScene }         from '../scenes/TrainingScene';

const scene: Phaser.Types.Core.GameConfig['scene'] = [
  BootScene,
  PreloadScene,
  MainMenuScene,
  OptionsScene,
  CreditsScene,
  CharacterSelectScene,
  StageSelectScene,
  FightScene,
  VictoryScene,
  TrainingScene,
];

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#0b0b12',
  pixelArt: false,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 2000 },
      debug: false,
    },
  },
  scene,
};

export default config;
