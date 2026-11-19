// Contract shared by main, preload and renderer. Keep it small: only normalized data crosses IPC.

export const EXPRESSIONS = ['ANGRY', 'CONTEMPT', 'DISGUST', 'FEAR', 'HAPPY', 'NEUTRAL', 'SAD', 'SURPRISE'] as const;
export type ExpressionName = (typeof EXPRESSIONS)[number];

/** One expression measurement from the SDK, normalized. Scores are SDK confidences in [0, 100]. */
export interface FaceSample {
  /** SDK measurement time in milliseconds. */
  t: number;
  stable: boolean;
  scores: Partial<Record<ExpressionName, number>>;
}

export type FaceStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'error';

export interface FaceValidation {
  ok: boolean;
  /** SDK ValidationCode name, e.g. 'kOk', 'kTooDark'. */
  code: string;
  hint: string;
}

export interface FaceError {
  /** SDK error code name, e.g. 'kNetworkError'. */
  code: string;
  message: string;
  retryable: boolean;
}

/** Mirrored, downscaled RGBA preview frame. Lives in memory only; never stored. */
export interface FaceFrame {
  width: number;
  height: number;
  data: Uint8Array;
}

export type StartResult =
  | { ok: true }
  | { ok: false; reason: 'no-key' | 'start-failed'; message: string };

export type Unsubscribe = () => void;

/** The only API the renderer gets (exposed by preload as `window.faceApi`). */
export interface FaceApi {
  hasKey(): Promise<boolean>;
  start(): Promise<StartResult>;
  stop(): Promise<void>;
  onSamples(cb: (samples: FaceSample[]) => void): Unsubscribe;
  onStatus(cb: (status: FaceStatus) => void): Unsubscribe;
  onValidation(cb: (v: FaceValidation) => void): Unsubscribe;
  onError(cb: (e: FaceError) => void): Unsubscribe;
  onFrame(cb: (f: FaceFrame) => void): Unsubscribe;
}

export const IPC = {
  hasKey: 'face:has-key',
  start: 'face:start',
  stop: 'face:stop',
  samples: 'face:samples',
  status: 'face:status',
  validation: 'face:validation',
  error: 'face:error',
  frame: 'face:frame',
} as const;
