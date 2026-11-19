// Subtle original background music, generated live (no audio files, nothing licensed).
// A bouncy C–Am–F–G loop: soft bass + plucked pentatonic melody. 'menu' is slower/sparser, 'game' is a bit livelier.
// generateBar() is pure (seeded) so the composition rules can be unit-tested; the scheduler below just plays it.
import { getAudio } from './audio';
import { getPrefs, subscribePrefs } from './audioPrefs';

export type MusicMood = 'menu' | 'game';

export interface Note {
  /** Beat offset inside the bar (0–3.5). */
  beat: number;
  midi: number;
  /** Duration in beats. */
  dur: number;
  kind: 'bass' | 'lead' | 'pad';
}

export const BEATS_PER_BAR = 4;
const MOODS: Record<MusicMood, { bpm: number; density: number }> = {
  menu: { bpm: 88, density: 0.42 },
  game: { bpm: 114, density: 0.62 },
};

/** [bass root, chord tones] for C, Am, F, G. */
const PROGRESSION: ReadonlyArray<{ root: number; chord: readonly number[] }> = [
  { root: 48, chord: [60, 64, 67] },
  { root: 45, chord: [57, 60, 64] },
  { root: 41, chord: [53, 57, 60] },
  { root: 43, chord: [55, 59, 62] },
];
/** C major pentatonic (C D E G A) across one octave+ — every note is consonant over all four chords. */
export const LEAD_SCALE: readonly number[] = [72, 74, 76, 79, 81, 84];

function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateBar(barIndex: number, mood: MusicMood, seed = 20261117): Note[] {
  const { chord, root } = PROGRESSION[barIndex % PROGRESSION.length];
  const r = rng(seed + barIndex * 7919);
  const notes: Note[] = [];
  const m = MOODS[mood];
  // bass
  if (mood === 'menu') notes.push({ beat: 0, midi: root, dur: 3.6, kind: 'bass' });
  else for (let b = 0; b < 4; b++) notes.push({ beat: b, midi: b === 2 ? root + 7 : b === 3 ? root + 12 : root, dur: 0.8, kind: 'bass' });
  // pad (chord) in menus only
  if (mood === 'menu') for (const midi of chord) notes.push({ beat: 0, midi, dur: 3.8, kind: 'pad' });
  // lead: random walk over the pentatonic scale on 8th notes; downbeat is always a chord-friendly note
  let idx = Math.floor(r() * LEAD_SCALE.length);
  for (let i = 0; i < 8; i++) {
    if (i !== 0 && r() > m.density) continue;
    idx = Math.min(LEAD_SCALE.length - 1, Math.max(0, idx + (r() < 0.5 ? -1 : 1) * (r() < 0.25 ? 2 : 1)));
    notes.push({ beat: i * 0.5, midi: LEAD_SCALE[idx], dur: 0.45, kind: 'lead' });
  }
  return notes;
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const LEVEL = 0.1; // overall music loudness — deliberately subtle
const DUCKED = 0.035; // while someone is speaking

let mood: MusicMood = 'menu';
let wanted = false;
let timer: ReturnType<typeof setInterval> | null = null;
let nextBarTime = 0;
let barIndex = 0;
let ducked = false;

function setBusGain(target: number, ramp = 0.35) {
  const a = getAudio();
  if (!a) return;
  const t = a.ctx.currentTime;
  a.music.gain.cancelScheduledValues(t);
  a.music.gain.setTargetAtTime(target, t, ramp / 3);
}

function playNote(n: Note, t0: number, secPerBeat: number) {
  const a = getAudio();
  if (!a) return;
  const t = t0 + n.beat * secPerBeat;
  const dur = n.dur * secPerBeat;
  const o = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  o.type = n.kind === 'lead' ? 'triangle' : n.kind === 'bass' ? 'sine' : 'triangle';
  o.frequency.value = midiHz(n.midi);
  const peak = n.kind === 'lead' ? 0.5 : n.kind === 'bass' ? 0.7 : 0.18;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (n.kind === 'pad' ? dur : Math.max(0.12, dur * 0.9)));
  o.connect(g).connect(a.music);
  o.start(t);
  o.stop(t + dur + 0.1);
}

function pump() {
  const a = getAudio();
  if (!a || !wanted) return;
  const spb = 60 / MOODS[mood].bpm;
  if (nextBarTime < a.ctx.currentTime) nextBarTime = a.ctx.currentTime + 0.05;
  while (nextBarTime < a.ctx.currentTime + 0.8) {
    for (const n of generateBar(barIndex, mood)) playNote(n, nextBarTime, spb);
    nextBarTime += BEATS_PER_BAR * spb;
    barIndex++;
  }
}

function halt() {
  if (timer) clearInterval(timer);
  timer = null;
  setBusGain(0, 0.2);
}

/** Request music for a screen. Honours the Music switch; safe to call repeatedly. */
export function setMusicMood(m: MusicMood): void {
  if (m !== mood) {
    mood = m;
    barIndex = 0; // restart the progression when the vibe changes
    nextBarTime = 0;
  }
  wanted = true;
  if (!getPrefs().music) return;
  start();
}

function start() {
  const a = getAudio();
  if (!a || timer) {
    if (a) setBusGain(ducked ? DUCKED : LEVEL);
    return;
  }
  setBusGain(ducked ? DUCKED : LEVEL);
  timer = setInterval(pump, 150);
  pump();
}

export function stopMusic(): void {
  wanted = false;
  halt();
}

/** Lower the music while the voice is speaking. */
export function setMusicDuck(on: boolean): void {
  ducked = on;
  if (timer) setBusGain(on ? DUCKED : LEVEL, 0.2);
}

// React to the Music switch immediately.
subscribePrefs(() => {
  if (!getPrefs().music) halt();
  else if (wanted) start();
});
