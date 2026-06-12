import type { AudioEngine } from './AudioEngine';

export type SfxId =
  | 'hit_light'
  | 'hit_heavy'
  | 'hit_special'
  | 'block'
  | 'whoosh'
  | 'whoosh_heavy'
  | 'projectile_spawn'
  | 'projectile_hit'
  | 'jump'
  | 'land'
  | 'ko'
  | 'round_start'
  | 'round_end'
  | 'victory'
  | 'menu_move'
  | 'menu_confirm'
  | 'low_health'
  | 'timer_warning';

// --- Helpers ---

function getCtx(engine: AudioEngine): AudioContext | null {
  if (!engine.available) return null;
  return engine.ctx;
}

function getBus(engine: AudioEngine): GainNode | null {
  return engine.sfxBus;
}

/** Create a noise buffer (white noise) */
function makeNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.ceil(rate * duration);
  const buf = ctx.createBuffer(1, length, rate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

function noiseSource(ctx: AudioContext, duration: number): AudioBufferSourceNode {
  const buf = makeNoiseBuffer(ctx, duration);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function osc(
  ctx: AudioContext,
  type: OscillatorType,
  freq: number,
  dest: AudioNode,
  startTime: number,
  endTime: number,
  gainStart: number,
  gainEnd: number,
  freqEnd?: number,
): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, startTime);
  if (freqEnd !== undefined) {
    o.frequency.exponentialRampToValueAtTime(freqEnd, endTime);
  }
  g.gain.setValueAtTime(gainStart, startTime);
  g.gain.exponentialRampToValueAtTime(Math.max(gainEnd, 0.0001), endTime);
  o.connect(g);
  g.connect(dest);
  o.start(startTime);
  o.stop(endTime);
}

// --- SFX implementations ---

function hitLight(ctx: AudioContext, bus: AudioNode, t: number): void {
  // Noise burst
  const noise = noiseSource(ctx, 0.08);
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = 1800;
  nf.Q.value = 1.2;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.7, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(bus);
  noise.start(t);
  noise.stop(t + 0.08);

  // Low thump
  osc(ctx, 'sine', 160, bus, t, t + 0.08, 0.6, 0.001, 60);
}

function hitHeavy(ctx: AudioContext, bus: AudioNode, t: number): void {
  // Thicker noise
  const noise = noiseSource(ctx, 0.18);
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = 900;
  nf.Q.value = 0.8;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(1.0, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(bus);
  noise.start(t);
  noise.stop(t + 0.18);

  // Deep thump
  osc(ctx, 'sine', 90, bus, t, t + 0.18, 0.9, 0.001, 40);
  osc(ctx, 'sine', 180, bus, t, t + 0.1, 0.4, 0.001, 80);
}

function hitSpecial(ctx: AudioContext, bus: AudioNode, t: number): void {
  // Electric crunch
  const noise = noiseSource(ctx, 0.28);
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = 2000;
  nf.Q.value = 0.5;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(1.1, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(bus);
  noise.start(t);
  noise.stop(t + 0.28);

  // Sub bass hit
  osc(ctx, 'sine', 60, bus, t, t + 0.25, 1.0, 0.001, 30);
  // High zap
  osc(ctx, 'sawtooth', 800, bus, t, t + 0.12, 0.35, 0.001, 200);
}

function block(ctx: AudioContext, bus: AudioNode, t: number): void {
  // Metallic ping — short sine burst at high freq with quick decay
  osc(ctx, 'sine', 1200, bus, t, t + 0.15, 0.5, 0.001, 1000);
  osc(ctx, 'triangle', 2400, bus, t, t + 0.08, 0.25, 0.001);
  // Clank noise
  const noise = noiseSource(ctx, 0.04);
  const nf = ctx.createBiquadFilter();
  nf.type = 'highpass';
  nf.frequency.value = 4000;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.4, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(bus);
  noise.start(t);
  noise.stop(t + 0.04);
}

function whoosh(ctx: AudioContext, bus: AudioNode, t: number): void {
  const noise = noiseSource(ctx, 0.22);
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.setValueAtTime(3000, t);
  nf.frequency.exponentialRampToValueAtTime(800, t + 0.22);
  nf.Q.value = 1.5;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.01, t);
  ng.gain.linearRampToValueAtTime(0.7, t + 0.05);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(bus);
  noise.start(t);
  noise.stop(t + 0.22);
}

function whooshHeavy(ctx: AudioContext, bus: AudioNode, t: number): void {
  const noise = noiseSource(ctx, 0.35);
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.setValueAtTime(2000, t);
  nf.frequency.exponentialRampToValueAtTime(400, t + 0.35);
  nf.Q.value = 1.0;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.01, t);
  ng.gain.linearRampToValueAtTime(1.0, t + 0.06);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(bus);
  noise.start(t);
  noise.stop(t + 0.35);

  osc(ctx, 'sine', 80, bus, t, t + 0.3, 0.4, 0.001, 40);
}

function projectileSpawn(ctx: AudioContext, bus: AudioNode, t: number): void {
  // Rising zap
  osc(ctx, 'sawtooth', 300, bus, t, t + 0.12, 0.5, 0.001, 900);
  const noise = noiseSource(ctx, 0.08);
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = 3000;
  nf.Q.value = 5;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.4, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(bus);
  noise.start(t);
  noise.stop(t + 0.08);
}

function projectileHit(ctx: AudioContext, bus: AudioNode, t: number): void {
  // Zap impact — descend
  osc(ctx, 'sawtooth', 700, bus, t, t + 0.15, 0.6, 0.001, 200);
  const noise = noiseSource(ctx, 0.1);
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = 2500;
  nf.Q.value = 3;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.5, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(bus);
  noise.start(t);
  noise.stop(t + 0.1);
}

function jump(ctx: AudioContext, bus: AudioNode, t: number): void {
  // Rising pitch sweep
  osc(ctx, 'triangle', 200, bus, t, t + 0.18, 0.45, 0.001, 600);
  const noise = noiseSource(ctx, 0.06);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.15, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  noise.connect(ng);
  ng.connect(bus);
  noise.start(t);
  noise.stop(t + 0.06);
}

function land(ctx: AudioContext, bus: AudioNode, t: number): void {
  // Thud — low noise burst
  const noise = noiseSource(ctx, 0.1);
  const nf = ctx.createBiquadFilter();
  nf.type = 'lowpass';
  nf.frequency.value = 400;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.8, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(bus);
  noise.start(t);
  noise.stop(t + 0.1);

  osc(ctx, 'sine', 80, bus, t, t + 0.1, 0.5, 0.001, 40);
}

function ko(ctx: AudioContext, bus: AudioNode, t: number): void {
  // Descending pitch — dramatic
  osc(ctx, 'sawtooth', 600, bus, t, t + 0.8, 0.8, 0.001, 60);
  osc(ctx, 'sine', 300, bus, t, t + 0.8, 0.6, 0.001, 30);

  // Noise crash at start
  const noise = noiseSource(ctx, 0.3);
  const nf = ctx.createBiquadFilter();
  nf.type = 'lowpass';
  nf.frequency.value = 2000;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(1.0, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(bus);
  noise.start(t);
  noise.stop(t + 0.3);
}

function roundStart(ctx: AudioContext, bus: AudioNode, t: number): void {
  // Two quick ascending beeps
  osc(ctx, 'square', 440, bus, t, t + 0.12, 0.5, 0.001);
  osc(ctx, 'square', 660, bus, t + 0.15, t + 0.27, 0.5, 0.001);
  osc(ctx, 'square', 880, bus, t + 0.30, t + 0.50, 0.6, 0.001);
}

function roundEnd(ctx: AudioContext, bus: AudioNode, t: number): void {
  // Three descending beeps
  osc(ctx, 'square', 880, bus, t, t + 0.12, 0.5, 0.001);
  osc(ctx, 'square', 660, bus, t + 0.15, t + 0.27, 0.5, 0.001);
  osc(ctx, 'square', 440, bus, t + 0.30, t + 0.50, 0.5, 0.001);
}

function victory(ctx: AudioContext, bus: AudioNode, t: number): void {
  // Short major arpeggio: C4 E4 G4 C5
  const notes = [261.63, 329.63, 392.0, 523.25];
  notes.forEach((freq, i) => {
    const start = t + i * 0.14;
    osc(ctx, 'square', freq, bus, start, start + 0.18, 0.55, 0.001);
    osc(ctx, 'triangle', freq * 0.5, bus, start, start + 0.22, 0.3, 0.001);
  });
}

function menuMove(ctx: AudioContext, bus: AudioNode, t: number): void {
  osc(ctx, 'square', 660, bus, t, t + 0.06, 0.3, 0.001);
}

function menuConfirm(ctx: AudioContext, bus: AudioNode, t: number): void {
  osc(ctx, 'square', 880, bus, t, t + 0.06, 0.35, 0.001);
  osc(ctx, 'square', 1100, bus, t + 0.07, t + 0.14, 0.35, 0.001);
}

function lowHealth(ctx: AudioContext, bus: AudioNode, t: number): void {
  // Soft heartbeat pulse: two thumps
  osc(ctx, 'sine', 70, bus, t, t + 0.12, 0.5, 0.001);
  osc(ctx, 'sine', 70, bus, t + 0.18, t + 0.30, 0.35, 0.001);
}

function timerWarning(ctx: AudioContext, bus: AudioNode, t: number): void {
  // Urgent short beep
  osc(ctx, 'square', 1320, bus, t, t + 0.08, 0.5, 0.001);
  osc(ctx, 'square', 1320, bus, t + 0.12, t + 0.20, 0.5, 0.001);
}

// --- Dispatch ---

const sfxMap: Record<SfxId, (ctx: AudioContext, bus: AudioNode, t: number) => void> = {
  hit_light: hitLight,
  hit_heavy: hitHeavy,
  hit_special: hitSpecial,
  block,
  whoosh,
  whoosh_heavy: whooshHeavy,
  projectile_spawn: projectileSpawn,
  projectile_hit: projectileHit,
  jump,
  land,
  ko,
  round_start: roundStart,
  round_end: roundEnd,
  victory,
  menu_move: menuMove,
  menu_confirm: menuConfirm,
  low_health: lowHealth,
  timer_warning: timerWarning,
};

export function playSfx(engine: AudioEngine, id: SfxId): void {
  const ctx = getCtx(engine);
  const bus = getBus(engine);
  if (!ctx || !bus) return;
  const fn = sfxMap[id];
  fn(ctx, bus, engine.now + 0.005);
}
