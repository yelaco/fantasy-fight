import { AudioEngine } from './AudioEngine';
import { MusicPlayer } from './music';
import { playSfx as _playSfx } from './sfx';

export type { SfxId } from './sfx';
export type { TrackId } from './music';
export { AudioEngine } from './AudioEngine';
export { MusicPlayer } from './music';

// Singletons
export const audioEngine = new AudioEngine();
export const musicPlayer = new MusicPlayer(audioEngine);

// Convenience API
export function initAudio(): void {
  // Engine initializes in constructor; call resumeAudio() on first user gesture.
}

export function resumeAudio(): void {
  audioEngine.resume();
}

export function playSfx(id: import('./sfx').SfxId): void {
  _playSfx(audioEngine, id);
}

export function playMusic(track: import('./music').TrackId): void {
  musicPlayer.play(track);
}

export function stopMusic(): void {
  musicPlayer.stop();
}

// Volume / mute re-exports
export function setMasterVolume(v: number): void {
  audioEngine.setMasterVolume(v);
}

export function setSfxVolume(v: number): void {
  audioEngine.setSfxVolume(v);
}

export function setMusicVolume(v: number): void {
  audioEngine.setMusicVolume(v);
}

export function setMuted(muted: boolean): void {
  audioEngine.setMuted(muted);
}

export function getMasterVolume(): number { return audioEngine.masterVolume; }
export function getSfxVolume(): number { return audioEngine.sfxVolume; }
export function getMusicVolume(): number { return audioEngine.musicVolume; }
export function isMuted(): boolean { return audioEngine.muted; }
