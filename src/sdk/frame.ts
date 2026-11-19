// Downscale + mirror an SDK videoOutput frame to a small RGBA preview. Pure, unit-testable.
// PixelFormat codes per SDK typings: kRGB 0, kBGR 1, kRGBA 2, kBGRA 3 (others unsupported → null).
import type { FaceFrame } from '../shared/types';

export function packFrame(
  buf: Uint8Array, width: number, height: number, stride: number, pixelFormat: number, maxWidth = 320,
): FaceFrame | null {
  const bpp = ({ 0: 3, 1: 3, 2: 4, 3: 4 } as Record<number, number>)[pixelFormat];
  if (!bpp || width <= 0 || height <= 0 || stride < width * bpp || buf.length < stride * (height - 1) + width * bpp) return null;
  const bgr = pixelFormat === 1 || pixelFormat === 3;
  const step = Math.max(1, Math.ceil(width / maxWidth));
  const w = Math.floor(width / step);
  const h = Math.floor(height / step);
  const data = new Uint8Array(w * h * 4);
  let o = 0;
  for (let y = 0; y < h; y++) {
    const row = y * step * stride;
    for (let x = 0; x < w; x++) {
      const i = row + (width - 1 - x * step) * bpp; // mirror horizontally (selfie view)
      data[o++] = buf[i + (bgr ? 2 : 0)];
      data[o++] = buf[i + 1];
      data[o++] = buf[i + (bgr ? 0 : 2)];
      data[o++] = 255;
    }
  }
  return { width: w, height: h, data };
}
