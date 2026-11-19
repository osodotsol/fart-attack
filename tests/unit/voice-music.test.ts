// Voice / music / audio-preference rules. The speech engine is a STUB — no sound is produced and no camera is involved.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrefs, resetPrefs, setPrefs, toggleAll } from '../../src/renderer/audioPrefs';
import { BEATS_PER_BAR, generateBar, LEAD_SCALE } from '../../src/renderer/music';
import {
  cleanForSpeech, estimateSpeechMs, initVoice, isSpeaking, localEnglishVoices, pickVoice, PENDING_MAX_MS, resetVoiceForTests, speak, START_WATCHDOG_MS, stopSpeech,
} from '../../src/renderer/voice';

interface FakeVoice { name: string; lang: string; localService: boolean }
const VOICES: FakeVoice[] = [
  { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US', localService: false },
  { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true },
  { name: 'Microsoft Zira - English (United States)', lang: 'en-US', localService: true },
  { name: 'Microsoft Hortense - French (France)', lang: 'fr-FR', localService: true },
];

class FakeUtterance {
  voice: FakeVoice | null = null;
  lang = '';
  pitch = 1;
  rate = 1;
  volume = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

function installEngine(voices: FakeVoice[] = VOICES) {
  const spoken: FakeUtterance[] = [];
  const engine = {
    getVoices: () => voices,
    speak: vi.fn((u: FakeUtterance) => { spoken.push(u); }),
    cancel: vi.fn(() => {
      // like Chromium: cancelling fires an error/interrupted event on the active utterance
      const last = spoken[spoken.length - 1];
      last?.onerror?.();
    }),
    addEventListener: vi.fn(),
  };
  vi.stubGlobal('speechSynthesis', engine);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return { engine, spoken };
}

beforeEach(() => {
  resetPrefs();
  stopSpeech();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('voice selection (offline only)', () => {
  it('only local English voices are eligible — online "Natural" and non-English are skipped', () => {
    const names = localEnglishVoices(VOICES).map((v) => v.name);
    expect(names).toEqual(['Microsoft David - English (United States)', 'Microsoft Zira - English (United States)']);
  });

  it('narrator gets a male-sounding voice, robot a different one; falls back to any local English voice', () => {
    expect(pickVoice(VOICES, 'narrator')?.name).toMatch(/David/);
    expect(pickVoice(VOICES, 'robot')?.name).toMatch(/Zira/);
    expect(pickVoice([{ name: 'Some Voice', lang: 'en-GB', localService: true }], 'robot')?.name).toBe('Some Voice');
  });

  it('no local English voice → undefined (game stays subtitle-only)', () => {
    expect(pickVoice([VOICES[0], VOICES[3]], 'narrator')).toBeUndefined();
  });
});

describe('speech text', () => {
  it('strips emoji and *stage directions* so they are not read aloud', () => {
    expect(cleanForSpeech('*beep beep* Incoming stink alert… 💨')).toBe('Incoming stink alert...');
  });

  it('estimates a longer time for longer lines and a slower role', () => {
    expect(estimateSpeechMs('Hi', 'narrator')).toBe(900);
    expect(estimateSpeechMs('x'.repeat(100), 'narrator')).toBeGreaterThan(estimateSpeechMs('x'.repeat(50), 'narrator'));
    expect(estimateSpeechMs('x'.repeat(100), 'narrator')).toBeGreaterThan(estimateSpeechMs('x'.repeat(100), 'robot')); // robot talks faster
  });
});

describe('speaking rules', () => {
  beforeEach(() => {
    installEngine();
    initVoice();
    setPrefs({ voiceAvailable: true });
  });

  it('speaks with the role style (robot = high pitch, fast)', () => {
    const { spoken } = installEngine();
    setPrefs({ voiceAvailable: true });
    expect(speak({ id: 'a', text: 'Hello hero', role: 'robot' })).toBe(true);
    expect(spoken[0].pitch).toBeGreaterThanOrEqual(1.8);
    expect(spoken[0].rate).toBeGreaterThan(1);
    expect(spoken[0].voice?.localService).toBe(true);
  });

  it('never overlaps: a new line cancels the old one first', () => {
    const { engine, spoken } = installEngine();
    setPrefs({ voiceAvailable: true });
    speak({ id: 'a', text: 'First line', role: 'narrator' });
    speak({ id: 'b', text: 'Second line', role: 'kid' });
    expect(engine.cancel).toHaveBeenCalled();
    expect(engine.cancel.mock.invocationCallOrder[0]).toBeLessThan(engine.speak.mock.invocationCallOrder[1]);
    expect(spoken.map((u) => u.text)).toEqual(['First line', 'Second line']);
  });

  it('never repeats the same line while it is still playing', () => {
    const { engine } = installEngine();
    setPrefs({ voiceAvailable: true });
    expect(speak({ id: 'same', text: 'Only once', role: 'narrator' })).toBe(true);
    expect(speak({ id: 'same', text: 'Only once', role: 'narrator' })).toBe(true);
    expect(engine.speak).toHaveBeenCalledTimes(1);
  });

  it('the same id can play again after it finished (e.g. replaying a level)', () => {
    const { engine, spoken } = installEngine();
    setPrefs({ voiceAvailable: true });
    speak({ id: 'x', text: 'Again', role: 'narrator' });
    spoken[0].onend?.();
    speak({ id: 'x', text: 'Again', role: 'narrator' });
    expect(engine.speak).toHaveBeenCalledTimes(2);
  });

  it('onEnd fires when the line ends, but NOT when it was cancelled by a newer line or stopSpeech()', () => {
    const { spoken } = installEngine();
    setPrefs({ voiceAvailable: true });
    const first = vi.fn();
    const second = vi.fn();
    speak({ id: 'a', text: 'First', role: 'narrator', onEnd: first });
    speak({ id: 'b', text: 'Second', role: 'narrator', onEnd: second }); // cancels a
    expect(first).not.toHaveBeenCalled();
    spoken[1].onend?.();
    expect(second).toHaveBeenCalledTimes(1);
    const third = vi.fn();
    speak({ id: 'c', text: 'Third', role: 'narrator', onEnd: third });
    stopSpeech();
    expect(third).not.toHaveBeenCalled();
    expect(isSpeaking()).toBe(false);
  });

  it('stopSpeech() cancels the engine (skip / quit / level change)', () => {
    const { engine } = installEngine();
    setPrefs({ voiceAvailable: true });
    speak({ id: 'a', text: 'Talking', role: 'narrator' });
    engine.cancel.mockClear();
    stopSpeech();
    expect(engine.cancel).toHaveBeenCalledTimes(1);
    expect(isSpeaking()).toBe(false);
  });

  it('turning the Voice switch off silences speech immediately; while off nothing is spoken', () => {
    const { engine } = installEngine();
    setPrefs({ voiceAvailable: true });
    initVoice();
    speak({ id: 'a', text: 'Talking', role: 'narrator' });
    engine.cancel.mockClear();
    setPrefs({ voice: false });
    expect(engine.cancel).toHaveBeenCalled();
    engine.speak.mockClear();
    expect(speak({ id: 'b', text: 'Muted', role: 'narrator' })).toBe(false);
    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('does nothing (returns false) when voice is unavailable — subtitles carry the story', () => {
    const { engine } = installEngine();
    setPrefs({ voiceAvailable: false });
    expect(speak({ id: 'a', text: 'Hello', role: 'narrator' })).toBe(false);
    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('survives a missing speech engine entirely (gameplay stays usable)', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('speechSynthesis', undefined);
    expect(() => stopSpeech()).not.toThrow();
    expect(speak({ id: 'a', text: 'Hello', role: 'narrator' })).toBe(false);
  });

  it('a throwing engine does not break the caller', () => {
    const { engine } = installEngine();
    setPrefs({ voiceAvailable: true });
    engine.speak.mockImplementationOnce(() => { throw new Error('boom'); });
    expect(speak({ id: 'a', text: 'Hello', role: 'narrator' })).toBe(false);
    expect(isSpeaking()).toBe(false);
  });
});

describe('voice availability detection', () => {
  it('available only when a local English voice exists', () => {
    installEngine(VOICES);
    resetPrefs();
    initVoice();
    // initVoice only runs once per module load; availability is re-evaluated through the same helper on voiceschanged
    expect(typeof getPrefs().voiceAvailable).toBe('boolean');
  });
});

describe('independent switches', () => {
  it('sound, voice and music are separate; M (toggleAll) mutes everything, then restores everything', () => {
    expect(getPrefs()).toMatchObject({ sfx: true, voice: true, music: true });
    setPrefs({ voice: false });
    expect(getPrefs()).toMatchObject({ sfx: true, voice: false, music: true });
    toggleAll(); // something is on → all off
    expect(getPrefs()).toMatchObject({ sfx: false, voice: false, music: false });
    toggleAll(); // all off → all on
    expect(getPrefs()).toMatchObject({ sfx: true, voice: true, music: true });
  });
});

describe('music composition', () => {
  it('is deterministic for a seed', () => {
    expect(generateBar(3, 'game', 1)).toEqual(generateBar(3, 'game', 1));
    expect(generateBar(3, 'game', 1)).not.toEqual(generateBar(3, 'game', 2));
  });

  it('every note is inside the bar, and every melody note is in the consonant pentatonic scale', () => {
    for (const mood of ['menu', 'game'] as const)
      for (let bar = 0; bar < 8; bar++)
        for (const n of generateBar(bar, mood)) {
          expect(n.beat).toBeGreaterThanOrEqual(0);
          expect(n.beat).toBeLessThan(BEATS_PER_BAR);
          expect(n.dur).toBeGreaterThan(0);
          if (n.kind === 'lead') expect(LEAD_SCALE).toContain(n.midi);
        }
  });

  it('follows C–Am–F–G: bass roots 48, 45, 41, 43, repeating', () => {
    const roots = [0, 1, 2, 3, 4].map((b) => generateBar(b, 'menu').find((n) => n.kind === 'bass')!.midi);
    expect(roots).toEqual([48, 45, 41, 43, 48]);
  });

  it('game mood is livelier than menu mood (more bass + melody notes over many bars)', () => {
    const count = (m: 'menu' | 'game') => Array.from({ length: 16 }, (_, b) => generateBar(b, m).filter((n) => n.kind !== 'pad').length).reduce((a, b) => a + b, 0);
    expect(count('game')).toBeGreaterThan(count('menu'));
  });

  it('every bar has at least a bass note and a downbeat melody note', () => {
    for (let bar = 0; bar < 8; bar++) {
      const notes = generateBar(bar, 'game');
      expect(notes.some((n) => n.kind === 'bass')).toBe(true);
      expect(notes.some((n) => n.kind === 'lead' && n.beat === 0)).toBe(true);
    }
  });
});

// ───────────────── First story line: voices still loading at launch / engine silently drops the first utterance ─────────────────
function installLateEngine() {
  const voices: FakeVoice[] = []; // empty at start-up, like a fresh Chromium process
  const handlers: Array<() => void> = [];
  const spoken: FakeUtterance[] = [];
  const engine = {
    getVoices: () => voices,
    speak: vi.fn((u: FakeUtterance) => { spoken.push(u); }),
    cancel: vi.fn(),
    addEventListener: vi.fn((ev: string, h: () => void) => { if (ev === 'voiceschanged') handlers.push(h); }),
  };
  vi.stubGlobal('speechSynthesis', engine);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return { engine, spoken, voicesArrive: () => { voices.push(...VOICES); handlers.forEach((h) => h()); } };
}

describe('first line before the voice list has loaded (fresh launch)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPrefs();
    resetVoiceForTests();
  });

  it('REGRESSION: a line requested while voices are still loading is held, then spoken once when they arrive', () => {
    const { engine, spoken, voicesArrive } = installLateEngine();
    initVoice();
    expect(getPrefs().voiceAvailable).toBe(false);
    expect(speak({ id: 'opening:0', text: 'A peaceful afternoon in the quiet town of Beanbury…', role: 'narrator' })).toBe(true);
    expect(engine.speak).not.toHaveBeenCalled(); // nothing to speak with yet
    voicesArrive();
    expect(engine.speak).toHaveBeenCalledTimes(1);
    expect(spoken[0].text).toMatch(/peaceful afternoon/);
    expect(spoken[0].voice?.localService).toBe(true);
    expect(getPrefs().voiceAvailable).toBe(true);
  });

  it('a held line is dropped if the player skips/quits (stopSpeech) before voices arrive', () => {
    const { engine, voicesArrive } = installLateEngine();
    initVoice();
    speak({ id: 'a', text: 'Hello', role: 'narrator' });
    stopSpeech();
    voicesArrive();
    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('only the NEWEST held line is spoken (no pile-up, no overlap)', () => {
    const { engine, spoken, voicesArrive } = installLateEngine();
    initVoice();
    speak({ id: 'a', text: 'First line', role: 'narrator' });
    speak({ id: 'b', text: 'Second line', role: 'kid' });
    voicesArrive();
    expect(engine.speak).toHaveBeenCalledTimes(1);
    expect(spoken[0].text).toBe('Second line');
  });

  it('a stale held line (older than PENDING_MAX_MS) is not spoken late', () => {
    const { engine, voicesArrive } = installLateEngine();
    initVoice();
    speak({ id: 'a', text: 'Too old', role: 'narrator' });
    vi.advanceTimersByTime(PENDING_MAX_MS + 100);
    voicesArrive();
    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('keeps the first line when voices arrive after settling but within the pending window', () => {
    const { spoken, voicesArrive } = installLateEngine();
    initVoice();
    speak({ id: 'opening:0', text: 'A peaceful afternoon', role: 'narrator' });
    vi.advanceTimersByTime(2000);
    voicesArrive();
    expect(spoken.map((u) => u.text)).toEqual(['A peaceful afternoon']);
  });

  it('if no offline voice ever appears, the line is dropped and later requests return false (subtitle-only)', () => {
    const { engine } = installLateEngine();
    initVoice();
    expect(speak({ id: 'a', text: 'Hello', role: 'narrator' })).toBe(true); // still waiting
    vi.advanceTimersByTime(2000); // settle timer: voices never came
    expect(getPrefs().voiceAvailable).toBe(false);
    expect(speak({ id: 'b', text: 'Hello again', role: 'narrator' })).toBe(false);
    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('Voice switched off while a line is held: nothing is spoken afterwards', () => {
    const { engine, voicesArrive } = installLateEngine();
    initVoice();
    speak({ id: 'a', text: 'Hello', role: 'narrator' });
    setPrefs({ voice: false });
    voicesArrive();
    expect(engine.speak).not.toHaveBeenCalled();
  });
});

describe('start watchdog: engine silently drops the first utterance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPrefs();
    resetVoiceForTests({ settled: true });
    setPrefs({ voiceAvailable: true });
  });

  const ready = () => {
    const e = installLateEngine();
    e.voicesArrive();
    setPrefs({ voiceAvailable: true });
    return e;
  };

  it('REGRESSION: if no start/end/error arrives in time, the line is retried once', () => {
    const { engine, spoken } = ready();
    speak({ id: 'opening:0', text: 'Retry me', role: 'narrator' });
    expect(engine.speak).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(START_WATCHDOG_MS + 50);
    expect(engine.speak).toHaveBeenCalledTimes(2);
    expect(spoken[1].text).toBe('Retry me');
    vi.advanceTimersByTime(20_000);
    expect(engine.speak).toHaveBeenCalledTimes(2); // only once
  });

  it('no retry when the engine reports a start in time', () => {
    const { engine, spoken } = ready();
    speak({ id: 'a', text: 'Fine', role: 'narrator' });
    spoken[0].onstart?.();
    vi.advanceTimersByTime(START_WATCHDOG_MS * 3);
    expect(engine.speak).toHaveBeenCalledTimes(1);
  });

  it('no retry after the line ended or errored, or after stopSpeech()', () => {
    const { engine, spoken } = ready();
    speak({ id: 'a', text: 'Ended', role: 'narrator' });
    spoken[0].onend?.();
    vi.advanceTimersByTime(START_WATCHDOG_MS * 2);
    speak({ id: 'b', text: 'Stopped', role: 'narrator' });
    stopSpeech();
    vi.advanceTimersByTime(START_WATCHDOG_MS * 2);
    expect(engine.speak).toHaveBeenCalledTimes(2); // the two original calls only
  });

  it("the dropped utterance's late cancel event does not finish the retried line or fire onEnd early", () => {
    const { spoken } = ready();
    const onEnd = vi.fn();
    speak({ id: 'a', text: 'Retry me', role: 'narrator', onEnd });
    vi.advanceTimersByTime(START_WATCHDOG_MS + 50);
    spoken[0].onerror?.(); // late "interrupted" from the first (dropped) utterance
    expect(onEnd).not.toHaveBeenCalled();
    expect(isSpeaking()).toBe(true);
    spoken[1].onstart?.();
    spoken[1].onend?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('ignores a synchronous cancellation event while retrying and completes the replacement', () => {
    const { engine, spoken } = ready();
    engine.cancel.mockImplementation(() => spoken.at(-1)?.onerror?.());
    const onEnd = vi.fn();
    speak({ id: 'opening:0', text: 'Retry me', role: 'narrator', onEnd });
    vi.advanceTimersByTime(START_WATCHDOG_MS + 1);
    expect(onEnd).not.toHaveBeenCalled();
    expect(isSpeaking()).toBe(true);
    spoken[1].onstart?.();
    spoken[1].onend?.();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('engine warm-up on the title screen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPrefs();
    resetVoiceForTests();
  });

  it('with warmUp enabled, one near-silent syllable is spoken once the voices are ready (and only once)', () => {
    const { engine, spoken, voicesArrive } = installLateEngine();
    initVoice({ warmUp: true });
    expect(engine.speak).not.toHaveBeenCalled(); // no voices yet
    voicesArrive();
    expect(engine.speak).toHaveBeenCalledTimes(1);
    expect(spoken[0].text).toBe('a');
    expect(spoken[0].volume).toBeLessThanOrEqual(0.02);
    voicesArrive(); // voiceschanged can fire again
    expect(engine.speak).toHaveBeenCalledTimes(1);
  });

  it('is opt-in: plain initVoice() never speaks anything by itself', () => {
    const { engine, voicesArrive } = installLateEngine();
    initVoice();
    voicesArrive();
    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('is skipped when the Voice switch is off', () => {
    const { engine, voicesArrive } = installLateEngine();
    setPrefs({ voice: false });
    initVoice({ warmUp: true });
    voicesArrive();
    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('a real line requested while the voice list loads is spoken instead (it IS the warm-up), without a stray extra utterance', () => {
    const { engine, spoken, voicesArrive } = installLateEngine();
    initVoice({ warmUp: true });
    speak({ id: 'opening:0', text: 'A peaceful afternoon', role: 'narrator' });
    voicesArrive();
    expect(engine.speak).toHaveBeenCalledTimes(1);
    expect(spoken[0].text).toBe('A peaceful afternoon');
  });

  it('a real line starting during the warm-up cancels it first (one speaker at a time)', () => {
    const { engine, spoken, voicesArrive } = installLateEngine();
    initVoice({ warmUp: true });
    voicesArrive();
    setPrefs({ voiceAvailable: true });
    speak({ id: 'a', text: 'Real line', role: 'narrator' });
    expect(engine.cancel).toHaveBeenCalled();
    expect(spoken.map((u) => u.text)).toEqual(['a', 'Real line']);
  });
});
