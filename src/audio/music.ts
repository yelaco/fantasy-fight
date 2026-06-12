import type { AudioEngine } from './AudioEngine';

export type TrackId = 'menu' | 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'victory';

// ---------------------------------------------------------------------------
// Scale / note helpers
// ---------------------------------------------------------------------------

const A4 = 440;

function midiToHz(midi: number): number {
  return A4 * Math.pow(2, (midi - 69) / 12);
}

// Note name -> midi offset from C (for building scales)
// We'll define scales as arrays of semitone intervals from root.

const SCALES = {
  minor:       [0, 2, 3, 5, 7, 8, 10],
  diminished:  [0, 2, 3, 5, 6, 8, 9, 11],
  pentatonic:  [0, 2, 4, 7, 9],
  majorTriad:  [0, 4, 7, 12],
} as const;

type ScaleName = keyof typeof SCALES;

function scaleHz(root: number, scale: readonly number[], degree: number): number {
  const notes = scale;
  const octave = Math.floor(degree / notes.length);
  const idx = degree % notes.length;
  return midiToHz(root + notes[idx] + octave * 12);
}

// ---------------------------------------------------------------------------
// Track definitions
// ---------------------------------------------------------------------------

interface TrackDef {
  bpm: number;
  root: number;        // midi root note
  scale: ScaleName;
  steps: number;       // 16 steps
  lead: number[];      // degree index per step (-1 = rest)
  bass: number[];      // degree index per step (-1 = rest)
  hats: boolean[];     // hi-hat on/off per step
}

const TRACKS: Record<TrackId, TrackDef> = {
  menu: {
    bpm: 100,
    root: 60, // C4
    scale: 'majorTriad',
    steps: 16,
    lead: [0, -1, 2, -1, 1, -1, 3, -1, 0, -1, 2, -1, 3, 2, 1, -1],
    bass: [0, -1, 0, -1, 0, -1, 1, -1, 0, -1, 0, -1, 1, -1, 2, -1],
    hats: [false,false,true,false, false,false,true,false, false,false,true,false, false,false,true,false],
  },
  stage1: {
    bpm: 120,
    root: 57, // A3
    scale: 'minor',
    steps: 16,
    lead: [0, -1, 2, 3, -1, 4, -1, 6, 5, -1, 4, 3, -1, 2, -1, 0],
    bass: [0, -1, 0, -1, 2, -1, 2, -1, 3, -1, 3, -1, 2, -1, 0, -1],
    hats: [true,false,false,true, true,false,true,false, true,false,false,true, true,false,true,false],
  },
  stage2: {
    bpm: 135,
    root: 55, // G3
    scale: 'diminished',
    steps: 16,
    lead: [0, 2, -1, 4, 3, -1, 5, 4, -1, 6, 5, -1, 4, 3, 2, -1],
    bass: [0, -1, 2, -1, 3, -1, 2, -1, 0, -1, 3, -1, 2, -1, 0, -1],
    hats: [true,false,true,false, true,true,false,true, true,false,true,false, true,true,false,true],
  },
  stage3: {
    bpm: 125,
    root: 62, // D4
    scale: 'pentatonic',
    steps: 16,
    lead: [0, 1, 2, -1, 1, 3, -1, 4, 2, 1, -1, 0, 1, 2, 4, -1],
    bass: [0, -1, 0, -1, 1, -1, 1, -1, 2, -1, 2, -1, 0, -1, 0, -1],
    hats: [true,false,true,false, false,true,false,true, true,false,true,false, false,true,true,false],
  },
  stage4: {
    bpm: 110,
    root: 53, // F3
    scale: 'minor',
    steps: 16,
    lead: [0, -1, -1, 2, -1, 3, -1, -1, 4, -1, 3, -1, 2, -1, 0, -1],
    bass: [0, -1, 0, -1, 0, -1, 2, -1, 3, -1, 3, -1, 2, -1, 0, -1],
    hats: [true,false,false,false, true,false,false,false, true,false,false,false, true,false,false,false],
  },
  victory: {
    bpm: 140,
    root: 60, // C4
    scale: 'majorTriad',
    steps: 8,
    lead: [0, 1, 2, 3, 2, 3, 3, -1],
    bass: [0, -1, 1, -1, 2, -1, 3, -1],
    hats: [true,false,true,false, true,false,true,true],
  },
};

// ---------------------------------------------------------------------------
// MusicPlayer
// ---------------------------------------------------------------------------

const LOOKAHEAD = 0.1;      // seconds ahead to schedule
const SCHEDULE_INTERVAL = 50; // ms

export class MusicPlayer {
  private _engine: AudioEngine;
  private _currentTrack: TrackId | null = null;
  private _step = 0;
  private _nextStepTime = 0;
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  private _fadeGain: GainNode | null = null;
  private _def: TrackDef | null = null;
  private _stepDuration = 0;

  constructor(engine: AudioEngine) {
    this._engine = engine;
  }

  play(track: TrackId): void {
    if (!this._engine.available || !this._engine.ctx || !this._engine.musicBus) return;
    if (this._currentTrack === track) return;

    this._stop(true); // fade out previous

    const ctx = this._engine.ctx;
    const def = TRACKS[track];
    this._def = def;
    this._currentTrack = track;
    this._step = 0;
    this._stepDuration = (60 / def.bpm) / 4; // 16th note duration

    // Fade-in gain
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0, ctx.currentTime);
    fade.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.0);
    fade.connect(this._engine.musicBus);
    this._fadeGain = fade;

    this._nextStepTime = ctx.currentTime + 0.05;
    this._intervalId = setInterval(() => this._schedule(), SCHEDULE_INTERVAL);
  }

  stop(): void {
    this._stop(true);
  }

  private _stop(fade: boolean): void {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    if (this._fadeGain && this._engine.ctx) {
      const g = this._fadeGain;
      const ctx = this._engine.ctx;
      if (fade) {
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0);
        // Disconnect after fade
        setTimeout(() => { try { g.disconnect(); } catch { /* ok */ } }, 1200);
      } else {
        try { g.disconnect(); } catch { /* ok */ }
      }
      this._fadeGain = null;
    }
    this._currentTrack = null;
    this._def = null;
  }

  private _schedule(): void {
    const ctx = this._engine.ctx;
    const fade = this._fadeGain;
    const def = this._def;
    if (!ctx || !fade || !def) return;

    const lookAheadUntil = ctx.currentTime + LOOKAHEAD;

    while (this._nextStepTime < lookAheadUntil) {
      this._scheduleStep(ctx, fade, def, this._step, this._nextStepTime);
      this._step = (this._step + 1) % def.steps;
      this._nextStepTime += this._stepDuration;
    }
  }

  private _scheduleStep(
    ctx: AudioContext,
    dest: AudioNode,
    def: TrackDef,
    step: number,
    t: number,
  ): void {
    const scale = SCALES[def.scale];
    const sd = this._stepDuration;

    // Lead
    const leadDeg = def.lead[step];
    if (leadDeg >= 0) {
      const freq = scaleHz(def.root + 12, scale, leadDeg);
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, t);
      g.gain.setValueAtTime(0.18, t + sd * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + sd * 0.95);
      o.connect(g);
      g.connect(dest);
      o.start(t);
      o.stop(t + sd);
    }

    // Bass
    const bassDeg = def.bass[step];
    if (bassDeg >= 0) {
      const freq = scaleHz(def.root - 12, scale, bassDeg);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + sd * 1.8);
      o.connect(g);
      g.connect(dest);
      o.start(t);
      o.stop(t + sd * 2);
    }

    // Hi-hat (noise burst)
    if (def.hats[step]) {
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.04), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hf = ctx.createBiquadFilter();
      hf.type = 'highpass';
      hf.frequency.value = 8000;
      const hg = ctx.createGain();
      hg.gain.setValueAtTime(0.12, t);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      src.connect(hf);
      hf.connect(hg);
      hg.connect(dest);
      src.start(t);
      src.stop(t + 0.04);
    }
  }
}
