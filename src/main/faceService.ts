// Owns the SmartSpectra SDK in the main process (decision D-002): the API key never leaves this process.
// Converts raw SDK output into small normalized messages for the renderer.
import { CameraSelection, faceMetrics, ProcessingStatus, SmartSpectraErrorCode, SmartSpectraSDK, ValidationCode } from '@smartspectra/node-sdk';
import { decodeMetrics } from '@smartspectra/node-sdk/messages';
import { normalizeMetrics } from '../sdk/normalize';
import { packFrame } from '../sdk/frame';
import type { FaceError, FaceFrame, FaceSample, FaceStatus, FaceValidation, StartResult } from '../shared/types';

export interface FaceSink {
  status(s: FaceStatus): void;
  validation(v: FaceValidation): void;
  samples(s: FaceSample[]): void;
  frame(f: FaceFrame): void;
  error(e: FaceError): void;
}

const nameOf = (table: Record<string, number>, v: number) => Object.keys(table).find((k) => table[k] === v) ?? String(v);

const STATUS: Record<string, FaceStatus> = {
  kUninitialized: 'idle', kIdle: 'idle', kStarting: 'starting', kRunning: 'running', kStopping: 'stopping', kError: 'error',
};

const FRAME_INTERVAL_MS = 66; // ~15 fps preview is enough and keeps IPC light

export class FaceService {
  private sdk: SmartSpectraSDK | null = null;
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly apiKey: string | undefined,
    private readonly cameraId: string | undefined,
    private readonly sink: FaceSink,
  ) {}

  hasKey(): boolean {
    return !!this.apiKey;
  }

  /** start/stop are serialized so rapid clicks can't interleave SDK lifecycle calls. */
  start(): Promise<StartResult> {
    const generation = this.generation;
    return this.serial(() => generation === this.generation
      ? this.doStart(generation)
      : Promise.resolve({ ok: false as const, reason: 'start-failed' as const, message: 'Camera start was cancelled.' }));
  }

  stop(): Promise<void> {
    this.generation++; // invalidate queued starts and callbacks before asynchronous teardown
    return this.serial(() => this.doStop());
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private async doStart(generation: number): Promise<StartResult> {
    if (!this.apiKey) return { ok: false, reason: 'no-key', message: 'No SmartSpectra API key configured.' };
    if (this.sdk) return { ok: true };

    // New instance per session: requestedMetrics is fixed at construction and M1 showed rebuild-per-cycle is clean.
    let candidate: SmartSpectraSDK | null = null;
    try {
      const sdk = new SmartSpectraSDK({
        apiKey: this.apiKey,
        requestedMetrics: [...faceMetrics],
        enableTelemetry: false,
        enableAccumulatedOutput: false,
      });
      candidate = sdk;
      sdk.useCamera(this.cameraId ? CameraSelection.byId(this.cameraId) : CameraSelection.default);

      const live = () => this.sdk === sdk && generation === this.generation; // drop events from a session that has been stopped
      let lastFrame = 0;

      sdk.on('processingStatus', (s) => {
        if (live()) this.sink.status(STATUS[nameOf(ProcessingStatus, s)] ?? 'idle');
      });
      sdk.on('validationStatus', (code, _ts, hint) => {
        if (!live()) return;
        const name = nameOf(ValidationCode, code);
        this.sink.validation({ ok: name === 'kOk', code: name, hint: hint ?? '' });
      });
      sdk.on('metrics', (buf) => {
        if (!live()) return;
        try {
          const samples = normalizeMetrics(decodeMetrics(buf));
          if (samples.length) this.sink.samples(samples);
        } catch {
          /* a single undecodable packet is not fatal */
        }
      });
      sdk.on('videoOutput', (buf, w, h, stride, fmt) => {
        if (!live()) return;
        const now = Date.now();
        if (now - lastFrame < FRAME_INTERVAL_MS) return;
        lastFrame = now;
        const f = packFrame(buf, w, h, stride, fmt);
        if (f) this.sink.frame(f);
      });
      sdk.on('error', (code, _message, retryable) => {
        const safeCode = nameOf(SmartSpectraErrorCode, code);
        if (live()) this.sink.error({ code: safeCode, message: safeCode, retryable: !!retryable });
      });

      this.sdk = sdk;
      sdk.start();
      return { ok: true };
    } catch (e) {
      this.sdk = null;
      await candidate?.destroy().catch(() => undefined);
      const code = (e as { code?: unknown })?.code;
      const codeName = typeof code === 'number' ? nameOf(SmartSpectraErrorCode, code) : '';
      return { ok: false, reason: 'start-failed', message: codeName || 'Camera initialization failed.' };
    }
  }

  private async doStop(): Promise<void> {
    const sdk = this.sdk;
    if (!sdk) return;
    this.sdk = null;
    this.sink.status('stopping');
    await sdk.stopAsync().catch(() => undefined);
    await sdk.destroy().catch(() => undefined);
    this.sink.status('idle');
  }
}
