// Web Audio stub only; no sound, device access or SDK.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('AudioContext', class {
    state = 'running';
    currentTime = 12;
    destination = {};
    createGain() {
      const gain = { value: 1, setValueAtTime(value: number) { this.value = value; } };
      return { gain, connect: vi.fn() };
    }
  });
});
afterEach(() => vi.unstubAllGlobals());

it('muting Sound immediately silences already scheduled effects without muting Music', async () => {
  const { getAudio } = await import('../../src/renderer/audio');
  const { setPrefs } = await import('../../src/renderer/audioPrefs');
  const audio = getAudio()!;
  audio.music.gain.value = 0.1;
  setPrefs({ sfx: false });
  expect(audio.sfx.gain.value).toBe(0);
  expect(audio.music.gain.value).toBe(0.1);
  setPrefs({ sfx: true });
  expect(audio.sfx.gain.value).toBe(0.45);
});

it('a context first created while Sound is off starts with a silent effects bus', async () => {
  const { setPrefs } = await import('../../src/renderer/audioPrefs');
  setPrefs({ sfx: false });
  const { getAudio } = await import('../../src/renderer/audio');
  expect(getAudio()!.sfx.gain.value).toBe(0);
});
