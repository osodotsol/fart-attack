// Production main/preload/renderer with an in-process SDK double. SIMULATION ONLY.
// No .env reads, native imports, webcam, network or SDK credits.
const electron = require('electron');
const { app, BrowserWindow } = electron;
const Module = require('node:module');
const path = require('node:path');
const load = Module._load;
const wait = ms => new Promise(r => setTimeout(r, ms));
let starts = 0, stops = 0, destroys = 0, current = null, releaseStop = null, holdNextStop = false;
let failures = 0, checks = 0;
const check = (label, ok, detail = '') => { checks++; if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${detail}`); };
class SDK {
  constructor(options) {
    if (options.apiKey !== 'OFFLINE_SYNTHETIC_ONLY' || options.enableTelemetry !== false) throw new Error('Unsafe offline SDK configuration');
    this.events = {}; this.running = false; this.destroyed = false; current = this;
  }
  useCamera() {}
  on(name, cb) { this.events[name] = cb; }
  start() { starts++; this.running = true; this.events.processingStatus?.(3); }
  async stopAsync() { stops++; if (holdNextStop) { holdNextStop = false; await new Promise(r => { releaseStop = r; }); } this.running = false; }
  async destroy() { if (!this.destroyed) { destroys++; this.destroyed = true; } }
}
// Preserve security settings while making the production window offscreen for deterministic offline checks.
function OfflineWindow(options) {
  return new BrowserWindow({ ...options, show: false, webPreferences: { ...options.webPreferences, offscreen: true, backgroundThrottling: false } });
}
Module._load = function(name, ...args) {
  if (name === 'electron') return { ...electron, BrowserWindow: OfflineWindow };
  if (name === '@smartspectra/node-sdk') return { SmartSpectraSDK: SDK, CameraSelection: { default: {} }, faceMetrics: [14], ProcessingStatus: { kRunning: 3 }, ValidationCode: { kOk: 0 }, SmartSpectraErrorCode: {} };
  if (name === '@smartspectra/node-sdk/messages') return { decodeMetrics: x => x };
  return load.call(this, name, ...args);
};
process.env.SMARTSPECTRA_API_KEY = 'OFFLINE_SYNTHETIC_ONLY';
process.env.SMARTSPECTRA_CAMERA_ID = '';
process.loadEnvFile = () => { throw new Error('Offline harness forbids reading credentials'); };
require('../dist/main.cjs');
// Keep the harness alive long enough to assert cleanup after the production window is destroyed.
app.on('before-quit', e => e.preventDefault());
app.whenReady().then(async () => {
  let w;
  for (let i = 0; i < 100 && !w; i++) { w = BrowserWindow.getAllWindows()[0]; if (!w) await wait(50); }
  if (!w) throw new Error('Production window missing');
  w.webContents.setAudioMuted(true);
  const js = s => w.webContents.executeJavaScript(s, true);
  const text = () => js('document.body.innerText');
  const click = label => js(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(${JSON.stringify(label)})&&!b.disabled)?.click()`);
  const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now()-t < ms) { if (await fn()) return true; await wait(50); } return false; };
  const mark = () => js(`(()=>{const b=document.createElement('div');b.textContent='SIMULATION - SDK double, no camera';b.style.cssText='position:fixed;top:0;z-index:99999;background:magenta';document.body.appendChild(b)})()`);
  const consent = async () => {
    await until(async () => (await text()).includes('Choose a level'));
    await mark(); await click('Choose a level');
    await until(async () => (await text()).includes('Turn on camera'));
    await until(() => js("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Turn on camera')&&!b.disabled)"));
    await click('Turn on camera'); await until(async () => (await text()).includes('Practise your moves'));
  };
  await until(async () => (await text()).includes('Play the story'));
  await js("window.dispatchEvent(new KeyboardEvent('keydown',{key:'m'}))");
  const prefs = w.webContents.getLastWebPreferences();
  check('production hardening retained', prefs.sandbox && prefs.contextIsolation && !prefs.nodeIntegration && prefs.webSecurity);
  await consent(); await until(() => starts === 1);
  check('no-readings startup exposes direct keyboard escape', (await text()).includes('Play with keyboard'));
  check('30-second no-readings startup exposes Retry', await until(async () => (await text()).includes('after 30 seconds') && (await text()).includes('Retry'), 33000));
  holdNextStop = true;
  await click('Retry'); await until(() => releaseStop !== null);
  await click('Play with keyboard');
  check('keyboard fallback clears camera state while retry teardown is pending', await until(async () => (await text()).startsWith('Choose a level')));
  releaseStop(); releaseStop = null; await wait(350);
  check('late retry never starts a camera after keyboard fallback', starts === 1 && destroys === 1, JSON.stringify({starts,stops,destroys}));
  await click('Back to title'); await consent(); await until(() => starts === 2);
  const beforeReload = { starts, stops, destroys };
  const loaded = new Promise(r => w.webContents.once('did-finish-load', r)); w.webContents.reload(); await loaded;
  check('reload cleans up exactly once', await until(() => stops === beforeReload.stops+1 && destroys === beforeReload.destroys+1));
  check('reload returns to title with no active capture', (await text()).includes('Play the story') && !current.running);
  await consent(); await until(() => starts === 3);
  holdNextStop = true;
  const loadedAgain = new Promise(r => w.webContents.once('did-finish-load', r)); w.webContents.reload(); await loadedAgain;
  await until(() => releaseStop !== null);
  await consent(); await wait(150);
  check('replacement session waits for old teardown', starts === 3);
  check('queued startup also reaches bounded recovery', await until(async () => (await text()).includes('after 30 seconds'), 33000));
  await click('Retry');
  releaseStop(); releaseStop = null;
  check('replacement starts after old teardown completes', await until(() => starts === 4));
  current.events.metrics({ face: { expression: [{ timestamp: 1000, stable: true, scores: [{ type: 5, confidence: 90 }] }] } });
  current.events.videoOutput(Buffer.alloc(12), 2, 2, 6, 0);
  await wait(350);
  check('cancelled old start never leaves a failure on the healthy retry', !(await text()).includes('Something went wrong') && !(await text()).includes('after 30 seconds'));

  const beforeCrash = { stops, destroys };
  const gone = new Promise(r => w.webContents.once('render-process-gone', r));
  w.webContents.forcefullyCrashRenderer(); await gone;
  check('actual renderer crash cleans up exactly once', await until(() => stops === beforeCrash.stops+1 && destroys === beforeCrash.destroys+1));
  const recovered = new Promise(r => w.webContents.once('did-finish-load', r)); w.webContents.reload(); await recovered;
  await consent(); await until(() => starts === 5);
  const beforeDestroy = { stops, destroys }; w.destroy();
  check('window/webContents disappearance cleans up exactly once', await until(() => stops === beforeDestroy.stops+1 && destroys === beforeDestroy.destroys+1));
  check('native SDK was never loaded', !Object.keys(require.cache).some(k=>/smartspectra/i.test(k)));
  console.log(`RESULT ${checks-failures}/${checks}; SIMULATION ONLY`, JSON.stringify({starts,stops,destroys}));
  app.exit(failures ? 1 : 0);
}).catch(e => { console.error(e); app.exit(1); });
