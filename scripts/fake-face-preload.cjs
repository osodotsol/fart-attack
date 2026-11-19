// DEV-ONLY verification harness — SIMULATION. Never bundled into the app, never used in the judge demo.
// Stands in for the real preload so camera-mode UI paths can be exercised with NO SDK, NO camera and NO API credits.
// All "face data" below is synthetic and generated locally.
const { contextBridge } = require('electron');

// Keep synthetic camera screenshots unmistakable even though the production self-view says LIVE.
window.addEventListener('DOMContentLoaded', () => {
  const badge = document.createElement('div');
  badge.textContent = 'SIMULATION — synthetic face input, no camera or SDK';
  badge.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;text-align:center;background:#5b173c;color:white;font:bold 14px sans-serif;padding:5px;pointer-events:none';
  document.body.appendChild(badge);
});

const stats = { starts: 0, stops: 0 };
let samplesCb = null;
let statusCb = null;
let validationCb = null;
let timer = null;
let signal = true;
let happy = 3;
let surprise = 2;
let frameCb = null;
let frameTimer = null;
let framesOn = true;

/** SYNTHETIC preview frame: flat-colour cartoon face (mouth widens with "happy", opens round with "surprise") inside a magenta border. */
function makeFrame(w, h) {
  const data = new Uint8Array(w * h * 4);
  const cx = w / 2, cy = h / 2 + 6;
  const smile = happy / 100, wow = surprise / 100;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = 38, g = 46, b = 70; // dark blue-grey background
      const dx = (x - cx) / 62, dy = (y - cy) / 82;
      if (dx * dx + dy * dy < 1) { r = 240; g = 190; b = 150; } // face
      const eyeY = cy - 22 - wow * 8;
      for (const ex of [cx - 24, cx + 24]) { const ddx = x - ex, ddy = y - eyeY; if (ddx * ddx + ddy * ddy < 36 + wow * 20) { r = 25; g = 25; b = 30; } } // eyes
      const my = cy + 34; // mouth
      if (wow > 0.4) { const ddx = (x - cx) / 14, ddy = (y - my) / (18 * wow + 4); if (ddx * ddx + ddy * ddy < 1) { r = 120; g = 30; b = 40; } }
      else { const ddx = (x - cx) / (16 + 26 * smile), ddy = (y - (my - 8 * smile)) / (4 + 10 * smile); const lower = y > my - 8 * smile; if (ddx * ddx + ddy * ddy < 1 && lower) { r = 120; g = 30; b = 40; } }
      if (x < 5 || y < 5 || x >= w - 5 || y >= h - 5) { r = 255; g = 0; b = 200; } // magenta border = unmistakably synthetic
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

const api = {
  hasKey: async () => true,
  start: async () => {
    stats.starts++;
    statusCb?.('running');
    validationCb?.({ ok: true, code: 'kOk', hint: '' });
    clearInterval(timer);
    timer = setInterval(() => {
      if (signal) samplesCb?.([{ t: Date.now(), stable: true, scores: { HAPPY: happy, SURPRISE: surprise, NEUTRAL: 50 } }]);
    }, 32);
    clearInterval(frameTimer);
    frameTimer = setInterval(() => { if (framesOn) frameCb?.(makeFrame(320, 240)); }, 66);
    return { ok: true };
  },
  stop: async () => {
    stats.stops++;
    clearInterval(timer);
    clearInterval(frameTimer);
    timer = null;
    frameTimer = null;
    statusCb?.('idle');
  },
  onSamples: (cb) => { samplesCb = cb; return () => undefined; },
  onStatus: (cb) => { statusCb = cb; return () => undefined; },
  onValidation: (cb) => { validationCb = cb; return () => undefined; },
  onError: () => () => undefined,
  onFrame: (cb) => { frameCb = cb; return () => undefined; },
};

contextBridge.exposeInMainWorld('faceApi', api);
contextBridge.exposeInMainWorld('__fakeFace', {
  setSignal: (v) => { signal = !!v; },
  setValid: (v) => { validationCb?.({ ok: !!v, code: v ? 'kOk' : 'kNoFaceFound', hint: '' }); },
  setHappy: (n) => { happy = n; },
  setSurprise: (n) => { surprise = n; },
  setFrames: (v) => { framesOn = !!v; },
  stats: () => ({ ...stats, running: timer !== null }),
});
