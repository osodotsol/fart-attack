// Offline regressions for F3/F5 and recovery ordering; no native SDK.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FaceStore } from '../../src/renderer/faceStore';
import type { FaceApi, FaceFrame, FaceSample, FaceStatus, FaceValidation, FaceError, StartResult } from '../../src/shared/types';

describe('camera startup recovery and fresh UI readings', () => {
  let store: FaceStore;
  let callbacks: { samples?: (s: FaceSample[]) => void; status?: (s: FaceStatus) => void; frame?: (f: FaceFrame) => void; validation?: (v: FaceValidation) => void; error?: (e: FaceError) => void };
  let api: FaceApi;
  const frame: FaceFrame = { width: 1, height: 1, data: new Uint8Array(4) };
  const sample: FaceSample = { t: 0, stable: true, scores: { HAPPY: 90, SURPRISE: 60 } };
  beforeEach(() => {
    vi.useFakeTimers(); callbacks = {};
    api = { hasKey: async () => true, start: vi.fn(async () => ({ ok: true as const })), stop: vi.fn(async () => {}),
      onSamples: cb => { callbacks.samples = cb; return () => {}; },
      onStatus: cb => { callbacks.status = cb; return () => {}; },
      onFrame: cb => { callbacks.frame = cb; return () => {}; },
      onValidation: cb => { callbacks.validation = cb; return () => {}; },
      onError: cb => { callbacks.error = cb; return () => {}; } };
    store = new FaceStore(() => api, cb => cb(), () => Date.now());
    store.subscribe(() => {});
  });
  afterEach(async () => { await store.stop(); vi.useRealTimers(); });

  it('F3: offers recovery after 30 seconds without readings or an error; retry starts a clean attempt', async () => {
    await store.start();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(store.getSnapshot().error).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(store.getSnapshot().error?.code).toBe('startup-timeout');
    await store.restart();
    expect(api.stop).toHaveBeenCalledTimes(1);
    expect(api.start).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().error).toBeNull();
    callbacks.samples!([sample]);
    await vi.advanceTimersByTimeAsync(30_001);
    expect(store.getSnapshot().error).toBeNull();
  });

  it('F3: the watchdog also recovers a still-pending start invocation', async () => {
    let release!: (r: StartResult) => void;
    vi.mocked(api.start).mockImplementationOnce(() => new Promise<StartResult>(r => { release = r; }));
    const pending = store.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.getSnapshot().error?.code).toBe('startup-timeout');
    await store.stop(); release({ ok: true }); await pending;
    expect(store.getSnapshot().cameraOn).toBe(false);
  });

  it('F3: frames alone do not satisfy the readings watchdog', async () => {
    await store.start(); callbacks.frame!(frame);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.getSnapshot().error?.code).toBe('startup-timeout');
  });

  it('F3: stop cancels the watchdog and clears camera state before a delayed IPC stop resolves', async () => {
    let release!: () => void;
    vi.mocked(api.stop).mockImplementationOnce(() => new Promise<void>(r => { release = r; }));
    await store.start(); callbacks.frame!(frame);
    const stopped = store.stop();
    expect(store.getSnapshot().cameraOn).toBe(false);
    expect(store.frame).toBeNull();
    await vi.advanceTimersByTimeAsync(30_001);
    expect(store.getSnapshot().error).toBeNull();
    release(); await stopped;
  });

  it('F3: a late failed start cannot erase a newer session', async () => {
    let release!: (r: StartResult) => void;
    vi.mocked(api.start).mockImplementationOnce(() => new Promise<StartResult>(r => { release = r; }));
    const old = store.start(); await store.stop(); await store.start();
    release({ ok: false, reason: 'start-failed', message: 'old failure' }); await old;
    expect(store.getSnapshot().cameraOn).toBe(true);
  });

  it('F3: a retry waiting for stop cannot restart capture after keyboard fallback/quit', async () => {
    let release!: () => void;
    vi.mocked(api.stop).mockImplementationOnce(() => new Promise<void>(r => { release = r; }));
    await store.start(); const retry = store.restart(); await store.stop(); release(); await retry;
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().cameraOn).toBe(false);
  });

  it('F5: historical samples expire without needing another SDK event, then recover', async () => {
    await store.start(); callbacks.status!('running'); callbacks.frame!(frame); callbacks.samples!([sample]);
    expect(store.getSnapshot()).toMatchObject({ samplesFresh: true, frameFresh: true });
    await vi.advanceTimersByTimeAsync(750);
    expect(store.getSnapshot()).toMatchObject({ hasSamples: true, samplesFresh: false, frameFresh: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.getSnapshot().frameFresh).toBe(false);
    callbacks.frame!(frame); callbacks.samples!([sample]);
    expect(store.getSnapshot()).toMatchObject({ samplesFresh: true, frameFresh: true });
  });

  it('F5: invalid measurements cannot make the readings fresh', async () => {
    await store.start(); callbacks.status!('running'); callbacks.frame!(frame);
    callbacks.validation!({ ok: false, code: 'kNoFaceFound', hint: '' }); callbacks.samples!([sample]);
    expect(store.getSnapshot().samplesFresh).toBe(false);
  });
});
