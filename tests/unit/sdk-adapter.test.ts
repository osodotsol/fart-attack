// SYNTHETIC payloads shaped like decodeMetrics() output (per SDK typings) — not live SDK data.
import { describe, expect, it } from 'vitest';
import { normalizeMetrics } from '../../src/sdk/normalize';
import { packFrame } from '../../src/sdk/frame';

describe('normalizeMetrics', () => {
  it('maps expression codes to names and µs timestamps to ms', () => {
    const out = normalizeMetrics({
      face: { expression: [{ stable: true, timestamp: 1_000_000, scores: [{ type: 5, confidence: 87.5 }, { type: 8, confidence: 3 }] }] },
    });
    expect(out).toEqual([{ t: 1000, stable: true, scores: { HAPPY: 87.5, SURPRISE: 3 } }]);
  });

  it('accepts Long-like timestamps', () => {
    const long = { toString: () => '2000000' };
    expect(normalizeMetrics({ face: { expression: [{ timestamp: long, scores: [{ type: 6, confidence: 50 }] }] } })[0].t).toBe(2000);
  });

  it('tolerates missing face / expression / scores and bad values', () => {
    expect(normalizeMetrics(null)).toEqual([]);
    expect(normalizeMetrics({})).toEqual([]);
    expect(normalizeMetrics({ face: {} })).toEqual([]);
    expect(normalizeMetrics({ face: { expression: [{ scores: null }] } })).toEqual([]);
    const out = normalizeMetrics({ face: { expression: [{ scores: [{ type: 99, confidence: 50 }, { type: 5, confidence: NaN }, { type: 8, confidence: 140 }] }] } });
    expect(out[0].scores).toEqual({ SURPRISE: 100 });
    expect(out[0].stable).toBe(false);
  });
});

describe('packFrame', () => {
  it('mirrors and converts BGRA to RGBA', () => {
    // 2×1 BGRA: left pixel blue, right pixel red
    const buf = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]);
    const f = packFrame(buf, 2, 1, 8, 3)!;
    expect(f.width).toBe(2);
    expect(Array.from(f.data)).toEqual([255, 0, 0, 255, 0, 0, 255, 255]); // red first (mirrored), then blue
  });

  it('downscales to maxWidth and rejects unsupported/invalid input', () => {
    const w = 640, h = 480;
    const f = packFrame(new Uint8Array(w * h * 3), w, h, w * 3, 0)!;
    expect([f.width, f.height]).toEqual([320, 240]);
    expect(packFrame(new Uint8Array(10), 640, 480, 640 * 3, 0)).toBeNull();
    expect(packFrame(new Uint8Array(100), 2, 2, 8, 4)).toBeNull();
  });
});
