// Original sound effects synthesized with the Web Audio API — no audio files, no third-party assets.
// One shared AudioContext with two buses (sound effects, music) so each can be switched off independently.
// Every call is wrapped: if audio is unavailable the game simply stays silent.
import { getPrefs, subscribePrefs } from './audioPrefs';

export type SoundName =
  | 'fart' | 'bigfart' | 'spray' | 'whoosh' | 'alarm' | 'beep' | 'whistle' | 'caught' | 'warn' | 'win' | 'lose' | 'cheer' | 'eek'
  | 'click' | 'ahem' | 'oops' | 'gag';

interface Audio {
  ctx: AudioContext;
  sfx: GainNode;
  music: GainNode;
}

let audio: Audio | null | undefined;

// Gate the bus as well as new effects: oscillators already scheduled must also obey mute.
subscribePrefs(() => {
  if (audio) audio.sfx.gain.setValueAtTime(getPrefs().sfx ? 0.45 : 0, audio.ctx.currentTime);
});

/** Lazily create the shared context. Returns null when Web Audio is unavailable. */
export function getAudio(): Audio | null {
  if (audio !== undefined) {
    if (audio && audio.ctx.state === 'suspended') void audio.ctx.resume().catch(() => undefined);
    return audio;
  }
  try {
    const ctx = new AudioContext();
    const sfx = ctx.createGain();
    sfx.gain.value = getPrefs().sfx ? 0.45 : 0;
    sfx.connect(ctx.destination);
    const music = ctx.createGain();
    music.gain.value = 0.0;
    music.connect(ctx.destination);
    audio = { ctx, sfx, music };
  } catch {
    audio = null;
  }
  return audio;
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * seconds)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function env(g: GainNode, t0: number, attack: number, hold: number, release: number, peak: number) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.setValueAtTime(peak, t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
}

function tone(a: Audio, type: OscillatorType, freq: number, t0: number, dur: number, peak = 0.3, freqEnd?: number) {
  const o = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  env(g, t0, 0.01, dur * 0.6, dur * 0.4, peak);
  o.connect(g).connect(a.sfx);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** Fart: low buzzy sawtooth with random flutter + filtered noise. Different every time. */
function fart(a: Audio, big: boolean) {
  const c = a.ctx;
  const t0 = c.currentTime;
  const dur = big ? 1.6 + Math.random() * 0.5 : 0.35 + Math.random() * 0.6;
  const base = big ? 55 + Math.random() * 15 : 75 + Math.random() * 45;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  const steps = 24;
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) curve[i] = base * (1 + 0.35 * Math.sin(i * (1.3 + Math.random())) * Math.random()) * (1 - (i / steps) * 0.35);
  o.frequency.setValueCurveAtTime(curve, t0, dur);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = big ? 500 : 700;
  lp.Q.value = 6;
  const g = c.createGain();
  env(g, t0, 0.02, dur * 0.7, dur * 0.3, big ? 0.9 : 0.7);
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 18 + Math.random() * 20;
  lfoGain.gain.value = 0.35;
  lfo.connect(lfoGain).connect(g.gain);
  o.connect(lp).connect(g).connect(a.sfx);
  const n = c.createBufferSource();
  n.buffer = noiseBuffer(c, dur);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 220;
  bp.Q.value = 1.2;
  const ng = c.createGain();
  env(ng, t0, 0.02, dur * 0.6, dur * 0.4, 0.25);
  n.connect(bp).connect(ng).connect(a.sfx);
  o.start(t0); lfo.start(t0); n.start(t0);
  o.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05);
}

function noiseSweep(a: Audio, dur: number, from: number, to: number, type: BiquadFilterType, peak: number) {
  const c = a.ctx;
  const t0 = c.currentTime;
  const n = c.createBufferSource();
  n.buffer = noiseBuffer(c, dur);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = c.createGain();
  env(g, t0, 0.03, dur * 0.4, dur * 0.57, peak);
  n.connect(f).connect(g).connect(a.sfx);
  n.start(t0);
}

/** Wobbly low growl (teacher's throat-clear / Bean Kid gagging). */
function growl(a: Audio, freq: number, dur: number, wobbleHz: number, peak: number) {
  const c = a.ctx;
  const t0 = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(freq * 0.7, t0 + dur);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  const g = c.createGain();
  env(g, t0, 0.04, dur * 0.5, dur * 0.5, peak);
  const lfo = c.createOscillator();
  const lg = c.createGain();
  lfo.frequency.value = wobbleHz;
  lg.gain.value = peak * 0.6;
  lfo.connect(lg).connect(g.gain);
  o.connect(lp).connect(g).connect(a.sfx);
  o.start(t0); lfo.start(t0);
  o.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05);
}

const PLAYERS: Record<SoundName, (a: Audio) => void> = {
  fart: (a) => fart(a, false),
  bigfart: (a) => fart(a, true),
  spray: (a) => noiseSweep(a, 0.7, 6000, 3500, 'highpass', 0.35),
  whoosh: (a) => noiseSweep(a, 0.9, 300, 2500, 'bandpass', 0.6),
  alarm: (a) => { for (let i = 0; i < 4; i++) tone(a, 'square', i % 2 ? 660 : 880, a.ctx.currentTime + i * 0.22, 0.2, 0.15); },
  beep: (a) => {
    tone(a, 'sine', 1200, a.ctx.currentTime, 0.08, 0.2);
    tone(a, 'sine', 1500, a.ctx.currentTime + 0.12, 0.08, 0.2);
  },
  whistle: (a) => tone(a, 'sine', 2200, a.ctx.currentTime, 0.5, 0.25, 2600),
  caught: (a) => tone(a, 'sawtooth', 150, a.ctx.currentTime, 0.5, 0.3, 110),
  warn: (a) => {
    tone(a, 'triangle', 660, a.ctx.currentTime, 0.15, 0.3);
    tone(a, 'triangle', 440, a.ctx.currentTime + 0.17, 0.25, 0.3);
  },
  win: (a) => [523, 659, 784, 1047].forEach((f, i) => tone(a, 'triangle', f, a.ctx.currentTime + i * 0.12, 0.25, 0.3)),
  cheer: (a) => {
    noiseSweep(a, 1.0, 1200, 2500, 'bandpass', 0.25);
    [784, 988, 1175].forEach((f, i) => tone(a, 'triangle', f, a.ctx.currentTime + i * 0.1, 0.2, 0.2));
  },
  lose: (a) => [392, 370, 349].forEach((f, i) => tone(a, 'sawtooth', f, a.ctx.currentTime + i * 0.4, i === 2 ? 0.9 : 0.35, 0.18, i === 2 ? 300 : undefined)),
  eek: (a) => tone(a, 'sine', 700, a.ctx.currentTime, 0.25, 0.18, 1800),
  click: (a) => tone(a, 'square', 900, a.ctx.currentTime, 0.03, 0.08),
  /** Teacher clearing her throat. */
  ahem: (a) => growl(a, 150, 0.55, 22, 0.5),
  /** Bean Kid: squeaky "uh-oh". */
  oops: (a) => {
    tone(a, 'sine', 1100, a.ctx.currentTime, 0.14, 0.22, 1500);
    tone(a, 'sine', 1000, a.ctx.currentTime + 0.17, 0.2, 0.22, 600);
  },
  /** Bean Kid gagging. */
  gag: (a) => growl(a, 110, 0.7, 9, 0.55),
};

export function play(name: SoundName): void {
  if (!getPrefs().sfx) return;
  const a = getAudio();
  if (!a) return;
  try {
    PLAYERS[name](a);
  } catch {
    /* audio is optional — never break the game */
  }
}

/** FRESHBOT's chirpy babble: a short burst of blips whose count follows the line length (like a talking robot). */
export function playBotTalk(text: string): void {
  if (!getPrefs().sfx) return;
  const a = getAudio();
  if (!a) return;
  try {
    const n = Math.min(9, Math.max(3, Math.ceil(text.length / 5)));
    const t0 = a.ctx.currentTime;
    let f = 520 + Math.random() * 200;
    for (let i = 0; i < n; i++) {
      f = Math.min(1400, Math.max(280, f * (0.8 + Math.random() * 0.5)));
      tone(a, i % 3 === 2 ? 'sawtooth' : 'square', f, t0 + i * 0.07, 0.06, 0.1);
    }
    if (/[!?]$/.test(text.trim())) tone(a, 'square', f, t0 + n * 0.07, 0.15, 0.1, f * 1.6);
  } catch {
    /* ignore */
  }
}
