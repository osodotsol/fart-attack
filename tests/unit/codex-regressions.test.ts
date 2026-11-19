// Regression tests for Codex review findings R1–R5. All input is SYNTHETIC (no SDK data, no camera).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RULES, FaceInput, GestureDetector } from '../../src/game/gestures';
import { chooseKeyboard, restoreCamera, SIGNAL_BACK_MS, SIGNAL_LOST_MS, stepInputMode, type InputMode } from '../../src/game/inputMode';
import { isTrustedSender } from '../../src/main/ipcGuard';
import { FaceStore } from '../../src/renderer/faceStore';
import { createTimerBag } from '../../src/renderer/timers';
import type { FaceApi, FaceError, FaceFrame, FaceSample, FaceStatus, FaceValidation } from '../../src/shared/types';

const happyRule = DEFAULT_RULES.find((r) => r.gesture === 'freshener')!;
const rep = (v: number, n: number) => Array<number>(n).fill(v);
const smile = (HAPPY: number, extra: FaceSample['scores'] = {}): FaceSample => ({ t: 0, stable: true, scores: { HAPPY, ...extra } });

describe('R1 — keyboard fallback after signal loss', () => {
  it('stale signal pauses; a fresh signal resumes automatically', () => {
    expect(stepInputMode('camera', SIGNAL_LOST_MS + 1)).toBe('lost');
    expect(stepInputMode('camera', 100)).toBe('camera');
    expect(stepInputMode('lost', 100)).toBe('camera');
    expect(stepInputMode('lost', 5000)).toBe('lost');
  });

  it('REGRESSION: after choosing the keyboard, a still-stale signal does NOT re-pause the game', () => {
    let mode: InputMode = stepInputMode('camera', 3000); // signal lost
    expect(mode).toBe('lost');
    mode = chooseKeyboard(mode); // player presses J / clicks "Continue with keyboard"
    expect(mode).toBe('fallback');
    // the loop keeps running with the signal still dead — for a long time
    for (const ms of [3000, 5000, 60_000, Infinity]) mode = stepInputMode(mode, ms);
    expect(mode).toBe('fallback');
  });

  it('fallback does not silently return to camera even when the face reappears (deliberate restore only)', () => {
    expect(stepInputMode('fallback', 10)).toBe('fallback');
  });

  it('restoring the camera needs a fresh signal; otherwise stays in fallback', () => {
    expect(restoreCamera('fallback', SIGNAL_BACK_MS + 1)).toEqual({ mode: 'fallback', ok: false });
    expect(restoreCamera('fallback', Infinity)).toEqual({ mode: 'fallback', ok: false });
    expect(restoreCamera('fallback', SIGNAL_BACK_MS - 1)).toEqual({ mode: 'camera', ok: true });
  });

  it('keyboard choice only applies while signal is lost', () => {
    expect(chooseKeyboard('camera')).toBe('camera');
    expect(chooseKeyboard('fallback')).toBe('fallback');
  });
});

describe('R3 — missing/invalid scores are not neutral samples', () => {
  const fireThenWait = (d: GestureDetector) => {
    rep(95, 5).forEach((s) => d.push(s));
    expect(d.armed).toBe(false);
  };

  it('REGRESSION: a stream of samples with NO HAPPY score never re-arms the detector', () => {
    const d = new GestureDetector(happyRule);
    fireThenWait(d);
    for (let i = 0; i < 50; i++) d.push(undefined);
    expect(d.armed).toBe(false);
  });

  it('NaN / Infinity scores are also ignored for re-arming and for firing', () => {
    const d = new GestureDetector(happyRule);
    fireThenWait(d);
    for (const bad of [NaN, Infinity, -Infinity]) for (let i = 0; i < 20; i++) d.push(bad);
    expect(d.armed).toBe(false);
    const fresh = new GestureDetector(happyRule);
    expect([NaN, NaN, NaN, NaN, NaN, NaN].map((x) => fresh.push(x)).some(Boolean)).toBe(false);
  });

  it('a missing score in the middle of a re-arm streak breaks the streak (needs 8 consecutive REAL low scores)', () => {
    const d = new GestureDetector(happyRule);
    fireThenWait(d);
    rep(5, 7).forEach((s) => d.push(s));
    d.push(undefined); // gap
    rep(5, 7).forEach((s) => d.push(s));
    expect(d.armed).toBe(false);
    d.push(5);
    expect(d.armed).toBe(true); // 8 consecutive real lows
  });

  it('a missing score in the middle of a fire streak breaks that streak too (no fire from 4 + gap + 1)', () => {
    const d = new GestureDetector(happyRule);
    rep(90, 4).forEach((s) => d.push(s));
    d.push(undefined);
    expect(d.push(90)).toBe(false);
  });

  it('FaceInput: samples lacking HAPPY do not re-arm freshener, but a real SURPRISE score still works', () => {
    const fi = new FaceInput();
    let t = 0;
    for (let i = 0; i < 5; i++) fi.push(smile(95), (t += 32)); // fire
    expect(fi.get('freshener')!.armed).toBe(false);
    for (let i = 0; i < 50; i++) fi.push({ t: 0, stable: true, scores: { SURPRISE: 5 } }, (t += 32)); // HAPPY absent
    expect(fi.get('freshener')!.armed).toBe(false);
    expect(fi.get('windows')!.armed).toBe(true);
  });

  it('a genuinely low real score still re-arms (behaviour preserved)', () => {
    const fi = new FaceInput();
    let t = 0;
    for (let i = 0; i < 5; i++) fi.push(smile(95), (t += 32));
    for (let i = 0; i < 8; i++) fi.push(smile(10), (t += 32));
    expect(fi.get('freshener')!.armed).toBe(true);
  });
});

describe('R4 — camera stop clears session readings', () => {
  it('FaceInput.reset() clears streaks, scores, validity and timestamps', () => {
    const fi = new FaceInput();
    fi.setValid(false);
    for (let i = 0; i < 4; i++) fi.push(smile(95), i * 32);
    fi.reset();
    expect(fi.isValid).toBe(true);
    expect(fi.get('freshener')!.score).toBe(0);
    expect(fi.msSinceSample(1000)).toBe(Infinity);
    // streak was wiped: one more high sample must not fire
    expect(fi.push(smile(95), 2000)).toEqual([]);
  });

  it('GestureDetector.reset() re-arms a fired detector', () => {
    const d = new GestureDetector(happyRule);
    rep(95, 5).forEach((s) => d.push(s));
    d.reset();
    expect(d.armed).toBe(true);
    expect(d.score).toBe(0);
  });

  describe('FaceStore session lifecycle', () => {
    type Cbs = {
      samples?: (s: FaceSample[]) => void;
      status?: (s: FaceStatus) => void;
      validation?: (v: FaceValidation) => void;
      error?: (e: FaceError) => void;
      frame?: (f: FaceFrame) => void;
    };
    let cbs: Cbs;
    let clock: number;
    let store: FaceStore;
    const makeApi = (): FaceApi => ({
      hasKey: async () => true,
      start: async () => ({ ok: true }),
      stop: async () => undefined,
      onSamples: (cb) => { cbs.samples = cb; return () => undefined; },
      onStatus: (cb) => { cbs.status = cb; return () => undefined; },
      onValidation: (cb) => { cbs.validation = cb; return () => undefined; },
      onError: (cb) => { cbs.error = cb; return () => undefined; },
      onFrame: (cb) => { cbs.frame = cb; return () => undefined; },
    });
    beforeEach(() => {
      cbs = {};
      clock = 1000;
      const a = makeApi();
      store = new FaceStore(() => a, (cb) => cb(), () => clock);
    });
    const frame: FaceFrame = { width: 1, height: 1, data: new Uint8Array(4) };

    it('REGRESSION: stop() wipes snapshot, preview frame, detector state and timestamps', async () => {
      await store.start();
      cbs.frame!(frame);
      for (let i = 0; i < 5; i++) cbs.samples!([smile(95)]);
      expect(store.getSnapshot().happy).toBe(95);
      expect(store.getSnapshot().happyArmed).toBe(false); // fired
      expect(store.getSnapshot().hasSamples).toBe(true);
      expect(store.frame).not.toBeNull();
      cbs.validation!({ ok: false, code: 'kTooDark', hint: '' });
      expect(store.input.isValid).toBe(false);
      expect(store.getSnapshot().validation?.code).toBe('kTooDark');
      clock = 1500;
      await store.stop();
      expect(store.getSnapshot()).toMatchObject({
        happy: 0, surprise: 0, hasSamples: false, validation: null, error: null, status: 'idle', happyArmed: true, surpriseArmed: true,
      });
      expect(store.frame).toBeNull();
      expect(store.input.isValid).toBe(true);
      expect(store.msSinceSample()).toBe(Infinity);
    });

    it('late samples/frames/errors from the stopped session are dropped', async () => {
      await store.start();
      await store.stop();
      const gestures: string[] = [];
      store.onGesture((g) => gestures.push(g));
      for (let i = 0; i < 10; i++) cbs.samples!([smile(99)]);
      cbs.frame!(frame);
      cbs.error!({ code: 'kNetworkError', message: 'x', retryable: true });
      cbs.status!('running');
      expect(gestures).toEqual([]);
      expect(store.frame).toBeNull();
      expect(store.getSnapshot()).toMatchObject({ hasSamples: false, error: null, status: 'idle', happy: 0 });
    });

    it('a new session never inherits a fired (disarmed) detector or old timestamps', async () => {
      await store.start();
      for (let i = 0; i < 5; i++) cbs.samples!([smile(95)]);
      expect(store.getSnapshot().happyArmed).toBe(false);
      await store.stop();
      await store.start();
      expect(store.getSnapshot().happyArmed).toBe(true);
      expect(store.msSinceSample()).toBe(Infinity);
    });
  });
});

describe('R2 — timers never fire after dispose', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('REGRESSION: a pending "end of round" callback is cancelled when the bag is cleared (quit / restart / unmount)', () => {
    const bag = createTimerBag();
    const onEnd = vi.fn();
    bag.later(onEnd, 1800);
    expect(bag.pending).toBe(1);
    vi.advanceTimersByTime(900);
    bag.clear(); // player quits mid-delay
    vi.advanceTimersByTime(10_000);
    expect(onEnd).not.toHaveBeenCalled();
    expect(bag.pending).toBe(0);
  });

  it('callbacks scheduled after clear() are ignored', () => {
    const bag = createTimerBag();
    bag.clear();
    const fn = vi.fn();
    bag.later(fn, 10);
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it('normal callbacks still fire once and are untracked afterwards', () => {
    const bag = createTimerBag();
    const fn = vi.fn();
    bag.later(fn, 50);
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(bag.pending).toBe(0);
  });
});

describe('R5 — IPC sender validation', () => {
  const EXPECTED = 'file:///C:/Users/Player/Fart%20Attack/dist/renderer/index.html';
  const ok = { senderIsOurWebContents: true, senderIsMainFrame: true, frameUrl: EXPECTED };

  it('accepts our window, main frame, exact page', () => {
    expect(isTrustedSender(ok, EXPECTED)).toBe(true);
  });

  it('accepts harmless encoding/case differences of the SAME file (Windows)', () => {
    expect(isTrustedSender({ ...ok, frameUrl: 'file:///c:/users/player/fart attack/dist/renderer/index.html' }, EXPECTED)).toBe(true);
  });

  it('REGRESSION: rejects look-alike paths that merely CONTAIN the page path', () => {
    for (const evil of [
      'file:///C:/Users/Evil/dist/renderer/index.html',
      'file:///C:/tmp/x/dist/renderer/index.html',
      'file:///C:/Users/Player/Fart%20Attack/dist/renderer/index.html.evil/x',
      'file:///C:/Users/Player/Fart%20Attack/dist/renderer/index.html/extra',
    ]) {
      expect(isTrustedSender({ ...ok, frameUrl: evil }, EXPECTED), evil).toBe(false);
    }
  });

  it('rejects other origins/schemes, hosts, queries and fragments', () => {
    for (const bad of [
      'https://example.com/dist/renderer/index.html',
      'http://localhost/dist/renderer/index.html',
      'about:blank',
      'data:text/html,hi',
      'file://evilhost/C:/Users/Player/Fart%20Attack/dist/renderer/index.html',
      EXPECTED + '?x=1',
      EXPECTED + '#frag',
      '',
      'not a url',
    ]) {
      expect(isTrustedSender({ ...ok, frameUrl: bad }, EXPECTED), bad).toBe(false);
    }
  });

  it('rejects subframes and foreign webContents even with the right URL', () => {
    expect(isTrustedSender({ ...ok, senderIsMainFrame: false }, EXPECTED)).toBe(false);
    expect(isTrustedSender({ ...ok, senderIsOurWebContents: false }, EXPECTED)).toBe(false);
    expect(isTrustedSender({ ...ok, frameUrl: undefined }, EXPECTED)).toBe(false);
  });
});
