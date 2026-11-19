// Paints the SDK preview frame onto a canvas — and, just as importantly, CLEARS it when there is no fresh frame
// (camera stopped, SDK stalled/errored, frames older than FRAME_STALE_MS). A stale face must never stay on screen looking live.
// Pure with respect to the DOM: the canvas and the ImageData factory are injected so this can be unit-tested without a browser.
import type { FaceFrame } from '../shared/types';

export interface PreviewCtx {
  putImageData(image: unknown, x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
}
export interface PreviewCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): PreviewCtx | null;
}
export interface PaintState {
  /** Pixel buffer of the frame currently on the canvas (so identical frames are not redrawn). */
  lastData: Uint8Array | null;
  /** True while the canvas holds a picture that must be cleared when frames stop. */
  drawn: boolean;
}

/** A preview older than this is treated as "no signal" and cleared. */
export const FRAME_STALE_MS = 1500;

export const newPaintState = (): PaintState => ({ lastData: null, drawn: false });

const toImageData = (f: FaceFrame): unknown =>
  new ImageData(new Uint8ClampedArray(f.data.buffer as ArrayBuffer, f.data.byteOffset, f.data.byteLength), f.width, f.height);

export function paintPreview(
  canvas: PreviewCanvas,
  frame: FaceFrame | null,
  frameAt: number,
  now: number,
  state: PaintState,
  makeImage: (f: FaceFrame) => unknown = toImageData,
): void {
  const fresh = frame !== null && now - frameAt <= FRAME_STALE_MS;
  if (!frame || !fresh) {
    if (state.drawn) {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      state.drawn = false;
      state.lastData = null;
    }
    return;
  }
  if (frame.data === state.lastData) return;
  if (canvas.width !== frame.width || canvas.height !== frame.height) {
    canvas.width = frame.width;
    canvas.height = frame.height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.putImageData(makeImage(frame), 0, 0);
  state.lastData = frame.data;
  state.drawn = true;
}
