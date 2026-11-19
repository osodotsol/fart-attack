// Renderer-side face state: subscribes once to window.faceApi, runs gesture detection, notifies React.
import { useSyncExternalStore } from 'react';
import { FRAME_STALE_MS } from './previewPaint';

import { FaceInput, type GestureName } from '../game/gestures';
import type { FaceApi, FaceError, FaceFrame, FaceStatus, FaceValidation, StartResult } from '../shared/types';

export interface FaceSnapshot {
  /** True from start() until stop() (or a failed start): the camera session is wanted/active. Drives the preview's "Camera off" state. */
  cameraOn: boolean;
  status: FaceStatus;
  validation: FaceValidation | null;
  error: FaceError | null;
  hasSamples: boolean;
  samplesFresh: boolean;
  frameFresh: boolean;
  happy: number;
  surprise: number;
  happyArmed: boolean;
  surpriseArmed: boolean;
}

export const STARTUP_TIMEOUT_MS = 30_000;

const INITIAL: FaceSnapshot = {
  cameraOn: false, status: 'idle', validation: null, error: null, hasSamples: false, samplesFresh: false, frameFresh: false, happy: 0, surprise: 0, happyArmed: true, surpriseArmed: true,
};

export class FaceStore {
  readonly input = new FaceInput();
  frame: FaceFrame | null = null;
  /** Local time (this.now()) the current frame arrived; lets the preview treat an old frame as "no signal". */
  frameAt = 0;
  private snap: FaceSnapshot = { ...INITIAL };
  private listeners = new Set<() => void>();
  private gestureListeners = new Set<(g: GestureName) => void>();
  private pending = false;
  private wired = false;
  /** Only true between start() and stop(): late events from a stopped session are dropped (R4). */
  private active = false;
  private version = 0;
  private startupTimer: ReturnType<typeof setTimeout> | undefined;
  private freshnessTimer: ReturnType<typeof setInterval> | undefined;

  private clearStartupTimer(): void {
    clearTimeout(this.startupTimer);
    this.startupTimer = undefined;
  }

  private startFreshnessClock(): void {
    if (!this.active || !this.listeners.size || this.freshnessTimer !== undefined) return;
    const refresh = () => {
      const samplesFresh = this.input.isValid && !this.input.isStalled(this.now());
      const frameFresh = this.frame !== null && this.now() - this.frameAt <= FRAME_STALE_MS;
      if (samplesFresh !== this.snap.samplesFresh || frameFresh !== this.snap.frameFresh) this.update({});
    };
    refresh();
    this.freshnessTimer = setInterval(refresh, 250);
  }

  private stopFreshnessClock(): void {
    clearInterval(this.freshnessTimer);
    this.freshnessTimer = undefined;
  }

  constructor(
    private readonly getApi: () => FaceApi | undefined = () => (typeof window !== 'undefined' ? window.faceApi : undefined),
    private readonly schedule: (cb: () => void) => void = (cb) => {
      requestAnimationFrame(cb);
    },
    private readonly now: () => number = () => performance.now(),
  ) {}

  get api() {
    return this.getApi();
  }

  private wire(): void {
    const api = this.api;
    if (this.wired || !api) return;
    this.wired = true;
    api.onSamples((samples) => {
      if (!this.active) return;
      const now = this.now();
      for (const s of samples) for (const g of this.input.push(s, now)) this.gestureListeners.forEach((l) => l(g));
      if (samples.length) {
        this.clearStartupTimer();
        this.update({ hasSamples: true, ...(this.snap.error?.code === 'startup-timeout' ? { error: null } : {}) });
      }
    });
    api.onStatus((status) => {
      if (this.active || status === 'idle') {
        if (status !== 'running' && status !== 'starting') this.frame = null; // camera stopping/stopped/errored: the last picture must not linger
        this.update({ status });
      }
    });
    api.onValidation((v) => {
      if (!this.active) return;
      this.input.setValid(v.ok);
      this.update({ validation: v });
    });
    api.onError((error) => {
      if (this.active) { this.clearStartupTimer(); this.update({ error }); }
    });
    api.onFrame((f) => {
      if (this.active) {
        this.frame = f;
        this.frameAt = this.now();
        if (!this.snap.frameFresh) this.update({});
      }
    });
  }

  /** Forget every reading from the previous session: detectors, timestamps, preview frame, snapshot. */
  private resetSession(): void {
    this.input.reset();
    this.frame = null;
    this.frameAt = 0;
    this.snap = { ...INITIAL };
    this.notify();
  }

  private notify(): void {
    if (this.pending) return;
    this.pending = true;
    this.schedule(() => {
      this.pending = false;
      this.listeners.forEach((l) => l());
    });
  }

  /** Coalesce updates to one React notification per animation frame. */
  private update(patch: Partial<FaceSnapshot>): void {
    const h = this.input.get('freshener')!;
    const s = this.input.get('windows')!;
    this.snap = { ...this.snap, ...patch,
      samplesFresh: this.active && this.input.isValid && !this.input.isStalled(this.now()),
      frameFresh: this.active && this.frame !== null && this.now() - this.frameAt <= FRAME_STALE_MS, happy: h.score, surprise: s.score, happyArmed: h.armed, surpriseArmed: s.armed };
    this.notify();
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    this.startFreshnessClock();
    return () => {
      this.listeners.delete(l);
      if (!this.listeners.size) this.stopFreshnessClock();
    };
  };

  getSnapshot = () => this.snap;

  onGesture(l: (g: GestureName) => void): () => void {
    this.gestureListeners.add(l);
    return () => this.gestureListeners.delete(l);
  }

  async hasKey(): Promise<boolean> {
    return (await this.api?.hasKey()) ?? false;
  }

  async start(): Promise<StartResult> {
    this.wire();
    if (!this.api) return { ok: false, reason: 'start-failed', message: 'Camera bridge unavailable.' };
    const version = ++this.version;
    this.clearStartupTimer();
    this.resetSession(); // a new session never inherits streaks, scores or timestamps from an old one
    this.active = true;
    this.update({ cameraOn: true });
    this.startFreshnessClock();
    this.startupTimer = setTimeout(() => {
      if (this.active && version === this.version && !this.snap.hasSamples && !this.snap.error) {
        this.update({ error: { code: 'startup-timeout', message: 'No camera readings received.', retryable: true } });
      }
    }, STARTUP_TIMEOUT_MS);
    let r: StartResult;
    try {
      r = await this.api.start();
    } catch {
      r = { ok: false, reason: 'start-failed', message: 'Camera bridge unavailable.' };
    }
    if (version !== this.version) return r;
    if (!r.ok) {
      this.clearStartupTimer();
      this.stopFreshnessClock();
      this.active = false;
      this.update({ cameraOn: false });
    }
    return r;
  }

  async stop(): Promise<void> {
    this.version++;
    this.active = false; // drop anything still in flight from main
    this.clearStartupTimer();
    this.stopFreshnessClock();
    this.resetSession(); // clear immediately; old teardown cannot reset a later session
    await this.api?.stop();
  }

  async restart(): Promise<StartResult> {
    const version = this.version + 1;
    await this.stop();
    if (version !== this.version) return { ok: false, reason: 'start-failed', message: 'Camera retry was cancelled.' };
    return this.start();
  }

  msSinceSample(): number {
    return this.input.msSinceSample(this.now());
  }
}

export const faceStore = new FaceStore();

export function useFace(): FaceSnapshot {
  return useSyncExternalStore(faceStore.subscribe, faceStore.getSnapshot);
}

/** Friendly text for SDK validation codes (docs/SDK_RESEARCH.md). */
export function validationHint(v: FaceValidation | null): string | null {
  if (!v || v.ok) return null;
  const map: Record<string, string> = {
    kNoFaceFound: "We can't see your face — look at the camera.",
    kMultipleFacesFound: 'One face at a time, please!',
    kFaceNotCentered: 'Move your face to the centre.',
    kFaceSizeOutOfRange: 'Move a little closer or further away.',
    kFaceTooClose: 'Too close — lean back a little.',
    kFaceTooFar: 'Too far — come a bit closer.',
    kFaceTooHigh: 'Move down a little.',
    kFaceTooLow: 'Move up a little (or tilt the screen).',
    kFaceNotForward: 'Face the camera straight on.',
    kTooDark: "It's too dark — add some light on your face.",
    kTooBright: 'Too bright — avoid light behind or straight into the camera.',
    kExcessiveMotion: 'Hold still for a moment.',
    kCameraTuning: 'Camera is adjusting…',
    kFrameRateTooLow: 'Camera is running slowly — close other camera apps.',
  };
  return map[v.code] ?? 'Adjusting…';
}

export function errorText(e: FaceError | { message: string; reason?: string }): string {
  const code = 'code' in e ? e.code : e.reason;
  const map: Record<string, string> = {
    'startup-timeout': 'The face sensor has not sent any readings after 30 seconds. Retry, or play with the keyboard.',
    'no-key': 'No SmartSpectra API key is set up on this computer.',
    kAuthenticationFailed: 'The SmartSpectra API key was rejected.',
    kNetworkError: "Couldn't reach Presage's servers — check your internet connection.",
    kServerError: "Presage's servers are busy right now.",
    kCreditExhausted: 'This SmartSpectra API key has run out of credits.',
    kInputUnavailable: "The camera isn't available — is another app using it?",
    kMetricNotAuthorized: 'This API key is not enabled for face metrics.',
    kSustainedLowFrameRate: 'The camera is too slow — close other apps using it.',
  };
  return (code && map[code]) || `Something went wrong with the camera (${code ?? 'error'}).`;
}
