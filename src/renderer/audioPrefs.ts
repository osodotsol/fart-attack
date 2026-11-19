// Audio preferences: three independent switches (sound effects, spoken voice, music). Memory only — never persisted.
// voiceAvailable is set by voice.ts once it has found an offline (local) English voice; gameplay never depends on it.
import { useSyncExternalStore } from 'react';

export interface AudioPrefs {
  sfx: boolean;
  voice: boolean;
  music: boolean;
  voiceAvailable: boolean;
}

const DEFAULTS: AudioPrefs = { sfx: true, voice: true, music: true, voiceAvailable: false };
let prefs: AudioPrefs = { ...DEFAULTS };
const listeners = new Set<() => void>();

export const getPrefs = (): AudioPrefs => prefs;

export function setPrefs(patch: Partial<AudioPrefs>): void {
  const next = { ...prefs, ...patch };
  if (next.sfx === prefs.sfx && next.voice === prefs.voice && next.music === prefs.music && next.voiceAvailable === prefs.voiceAvailable) return;
  prefs = next;
  listeners.forEach((l) => l());
}

/** "M" key: if anything is on, mute everything; if everything is off, turn everything back on. */
export function toggleAll(): void {
  const anyOn = prefs.sfx || prefs.voice || prefs.music;
  setPrefs({ sfx: !anyOn, voice: !anyOn, music: !anyOn });
}

export function subscribePrefs(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const useAudioPrefs = (): AudioPrefs => useSyncExternalStore(subscribePrefs, getPrefs);

/** True when speech would actually be produced right now. */
export const voiceActive = (): boolean => prefs.voice && prefs.voiceAvailable;

/** Test helper: restore defaults (subscribers such as voice/music stay registered, as in the real app). */
export function resetPrefs(): void {
  setPrefs({ ...DEFAULTS });
}
