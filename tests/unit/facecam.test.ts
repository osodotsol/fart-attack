// Facecam preview: paint/clear rules, show/hide switch, and "disappears when the camera stops". SYNTHETIC frames; no camera, no SDK.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FaceStore } from '../../src/renderer/faceStore';
import { isFacecamVisible, resetFacecam, setFacecamVisible, toggleFacecam } from '../../src/renderer/facecamStore';
import { FRAME_STALE_MS, newPaintState, paintPreview, type PreviewCanvas } from '../../src/renderer/previewPaint';
import type { FaceApi, FaceFrame, FaceSample, FaceStatus } from '../../src/shared/types';

const frame = (w = 320, h = 240): FaceFrame => ({ width: w, height: h, data: new Uint8Array(w * h * 4) });

function fakeCanvas(w = 320, h = 240) {
  const ctx = { putImageData: vi.fn(), clearRect: vi.fn() };
  const canvas: PreviewCanvas = { width: w, height: h, getContext: () => ctx };
  return { canvas, ctx };
}
const img = (f: FaceFrame) => ({ img: f.data });

describe('paintPreview', () => {
  it('draws a fresh frame once; the same frame is not redrawn', () => {
    const { canvas, ctx } = fakeCanvas();
    const st = newPaintState();
    const f = frame();
    paintPreview(canvas, f, 1000, 1100, st, img);
    paintPreview(canvas, f, 1000, 1116, st, img);
    expect(ctx.putImageData).toHaveBeenCalledTimes(1);
    expect(st.drawn).toBe(true);
    paintPreview(canvas, frame(), 1200, 1216, st, img); // a new frame object → redraw
    expect(ctx.putImageData).toHaveBeenCalledTimes(2);
  });

  it('resizes the canvas to the frame size', () => {
    const { canvas } = fakeCanvas(10, 10);
    paintPreview(canvas, frame(320, 240), 0, 10, newPaintState(), img);
    expect([canvas.width, canvas.height]).toEqual([320, 240]);
  });

  it('REGRESSION: the picture is CLEARED when frames stop (frame becomes null) — no stale face left on screen', () => {
    const { canvas, ctx } = fakeCanvas();
    const st = newPaintState();
    paintPreview(canvas, frame(), 1000, 1010, st, img);
    paintPreview(canvas, null, 0, 1020, st, img);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 320, 240);
    expect(st.drawn).toBe(false);
    paintPreview(canvas, null, 0, 1036, st, img);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1); // cleared once, not every frame
  });

  it('REGRESSION: a frame older than FRAME_STALE_MS counts as "no signal" and is cleared', () => {
    const { canvas, ctx } = fakeCanvas();
    const st = newPaintState();
    const f = frame();
    paintPreview(canvas, f, 1000, 1010, st, img);
    paintPreview(canvas, f, 1000, 1000 + FRAME_STALE_MS - 1, st, img);
    expect(ctx.clearRect).not.toHaveBeenCalled(); // still fresh enough
    paintPreview(canvas, f, 1000, 1000 + FRAME_STALE_MS + 50, st, img);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
  });

  it('after being cleared, a fresh frame paints again (even the same buffer)', () => {
    const { canvas, ctx } = fakeCanvas();
    const st = newPaintState();
    const f = frame();
    paintPreview(canvas, f, 1000, 1010, st, img);
    paintPreview(canvas, null, 0, 1020, st, img);
    paintPreview(canvas, f, 2000, 2010, st, img);
    expect(ctx.putImageData).toHaveBeenCalledTimes(2);
  });

  it('never draws or clears when nothing was ever drawn', () => {
    const { canvas, ctx } = fakeCanvas();
    paintPreview(canvas, null, 0, 10, newPaintState(), img);
    expect(ctx.putImageData).not.toHaveBeenCalled();
    expect(ctx.clearRect).not.toHaveBeenCalled();
  });
});

describe('Show/Hide facecam switch', () => {
  beforeEach(() => resetFacecam());

  it('is visible by default; toggles; set is idempotent', () => {
    expect(isFacecamVisible()).toBe(true);
    toggleFacecam();
    expect(isFacecamVisible()).toBe(false);
    setFacecamVisible(false);
    expect(isFacecamVisible()).toBe(false);
    toggleFacecam();
    expect(isFacecamVisible()).toBe(true);
  });
});

describe('FaceStore: camera-off state and clearing when the camera stops', () => {
  type Cbs = { samples?: (s: FaceSample[]) => void; status?: (s: FaceStatus) => void; frame?: (f: FaceFrame) => void };
  let cbs: Cbs;
  let clock: number;
  let store: FaceStore;
  let startResult: { ok: true } | { ok: false; reason: 'start-failed'; message: string };
  const smile: FaceSample = { t: 0, stable: true, scores: { HAPPY: 80 } };

  beforeEach(() => {
    cbs = {};
    clock = 1000;
    startResult = { ok: true };
    const api: FaceApi = {
      hasKey: async () => true,
      start: async () => startResult,
      stop: async () => undefined,
      onSamples: (cb) => { cbs.samples = cb; return () => undefined; },
      onStatus: (cb) => { cbs.status = cb; return () => undefined; },
      onValidation: () => () => undefined,
      onError: () => () => undefined,
      onFrame: (cb) => { cbs.frame = cb; return () => undefined; },
    };
    store = new FaceStore(() => api, (cb) => cb(), () => clock);
  });

  it('cameraOn is false before start, true after start, false after stop', async () => {
    expect(store.getSnapshot().cameraOn).toBe(false);
    await store.start();
    expect(store.getSnapshot().cameraOn).toBe(true);
    await store.stop();
    expect(store.getSnapshot().cameraOn).toBe(false);
  });

  it('a failed start leaves cameraOn false (the preview shows "Camera off", not a fake warm-up)', async () => {
    startResult = { ok: false, reason: 'start-failed', message: 'x' };
    await store.start();
    expect(store.getSnapshot().cameraOn).toBe(false);
  });

  it('REGRESSION: the preview frame is dropped the moment the SDK reports it is no longer running', async () => {
    for (const status of ['idle', 'error', 'stopping'] as const) {
      await store.start();
      cbs.status!('running');
      cbs.frame!(frame());
      expect(store.frame).not.toBeNull();
      cbs.status!(status);
      expect(store.frame, `status ${status}`).toBeNull();
      await store.stop();
    }
  });

  it('the frame is kept while starting/running, and its arrival time is recorded', async () => {
    await store.start();
    clock = 4200;
    cbs.frame!(frame());
    cbs.status!('running');
    expect(store.frame).not.toBeNull();
    expect(store.frameAt).toBe(4200);
  });

  it('stop() clears the frame and its timestamp; late frames from the old session are ignored', async () => {
    await store.start();
    cbs.frame!(frame());
    await store.stop();
    expect(store.frame).toBeNull();
    expect(store.frameAt).toBe(0);
    cbs.frame!(frame()); // late frame from main
    expect(store.frame).toBeNull();
  });

  it('readings flowing = hasSamples; a stopped session no longer reports readings', async () => {
    await store.start();
    cbs.samples!([smile]);
    expect(store.getSnapshot().hasSamples).toBe(true);
    await store.stop();
    expect(store.getSnapshot()).toMatchObject({ hasSamples: false, happy: 0, cameraOn: false });
  });
});
