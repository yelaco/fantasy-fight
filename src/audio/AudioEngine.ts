const STORAGE_KEY = 'ff_audio';

interface AudioSettings {
  master: number;
  sfx: number;
  music: number;
  muted: boolean;
}

const DEFAULTS: AudioSettings = {
  master: 0.8,
  sfx: 0.9,
  music: 0.5,
  muted: false,
};

export class AudioEngine {
  private _ctx: AudioContext | null = null;
  private _master: GainNode | null = null;
  private _sfxBus: GainNode | null = null;
  private _musicBus: GainNode | null = null;
  private _settings: AudioSettings = { ...DEFAULTS };
  private _available = false;

  constructor() {
    this._settings = this._load();
    this._init();
  }

  private _init(): void {
    try {
      this._ctx = new AudioContext();
      this._master = this._ctx.createGain();
      this._sfxBus = this._ctx.createGain();
      this._musicBus = this._ctx.createGain();

      this._sfxBus.connect(this._master);
      this._musicBus.connect(this._master);
      this._master.connect(this._ctx.destination);

      this._applyAll();
      this._available = true;
    } catch {
      this._available = false;
    }
  }

  private _load(): AudioSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AudioSettings>;
        return {
          master: typeof parsed.master === 'number' ? parsed.master : DEFAULTS.master,
          sfx: typeof parsed.sfx === 'number' ? parsed.sfx : DEFAULTS.sfx,
          music: typeof parsed.music === 'number' ? parsed.music : DEFAULTS.music,
          muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULTS.muted,
        };
      }
    } catch {
      // ignore
    }
    return { ...DEFAULTS };
  }

  private _save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings));
    } catch {
      // ignore
    }
  }

  private _applyAll(): void {
    if (!this._available || !this._master || !this._sfxBus || !this._musicBus) return;
    const mute = this._settings.muted ? 0 : 1;
    this._master.gain.value = this._settings.master * mute;
    this._sfxBus.gain.value = this._settings.sfx;
    this._musicBus.gain.value = this._settings.music;
  }

  resume(): void {
    if (!this._available || !this._ctx) return;
    if (this._ctx.state === 'suspended') {
      void this._ctx.resume();
    }
  }

  get available(): boolean { return this._available; }
  get ctx(): AudioContext | null { return this._ctx; }
  get now(): number { return this._ctx ? this._ctx.currentTime : 0; }
  get sfxBus(): GainNode | null { return this._sfxBus; }
  get musicBus(): GainNode | null { return this._musicBus; }

  get masterVolume(): number { return this._settings.master; }
  get sfxVolume(): number { return this._settings.sfx; }
  get musicVolume(): number { return this._settings.music; }
  get muted(): boolean { return this._settings.muted; }

  setMasterVolume(v: number): void {
    if (!this._available || !this._master) return;
    this._settings.master = Math.max(0, Math.min(1, v));
    const mute = this._settings.muted ? 0 : 1;
    this._master.gain.setTargetAtTime(this._settings.master * mute, this._ctx!.currentTime, 0.01);
    this._save();
  }

  setSfxVolume(v: number): void {
    if (!this._available || !this._sfxBus) return;
    this._settings.sfx = Math.max(0, Math.min(1, v));
    this._sfxBus.gain.setTargetAtTime(this._settings.sfx, this._ctx!.currentTime, 0.01);
    this._save();
  }

  setMusicVolume(v: number): void {
    if (!this._available || !this._musicBus) return;
    this._settings.music = Math.max(0, Math.min(1, v));
    this._musicBus.gain.setTargetAtTime(this._settings.music, this._ctx!.currentTime, 0.01);
    this._save();
  }

  setMuted(muted: boolean): void {
    if (!this._available || !this._master) return;
    this._settings.muted = muted;
    const mute = muted ? 0 : 1;
    this._master.gain.setTargetAtTime(this._settings.master * mute, this._ctx!.currentTime, 0.01);
    this._save();
  }
}
