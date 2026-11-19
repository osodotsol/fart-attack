// M1 live SmartSpectra capability probe (headless, main-process SDK — see docs/DECISIONS.md D-002/D-003).
// Usage:
//   npm run probe -- --list-cameras
//   npm run probe -- --readiness
//   npm run probe                 (guided expression/blink session, ~70 s)
//   npm run probe -- --cycles 2   (also tests stop + restart in one process)
// Privacy: no video is stored. Only numeric face metrics are written to tools/sdk-probe/logs/ (git-ignored).
// The API key is read from env and never printed.
import { createRequire } from 'node:module';
import { mkdirSync, createWriteStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sdkMod = require('@smartspectra/node-sdk');
const { decodeMetrics } = require('@smartspectra/node-sdk/messages');
const { SmartSpectraSDK, CameraSelection, faceMetrics, ProcessingStatus, ValidationCode, SmartSpectraErrorCode } = sdkMod;

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

const nameOf = (table, v) => Object.keys(table).find((k) => table[k] === v) ?? String(v);
const EXPR = { 1: 'ANGRY', 2: 'CONTEMPT', 3: 'DISGUST', 4: 'FEAR', 5: 'HAPPY', 6: 'NEUTRAL', 7: 'SAD', 8: 'SURPRISE' };
const toNum = (t) => (t == null ? null : typeof t === 'number' ? t : Number(t.toString()));

console.log(`[probe] SDK version ${SmartSpectraSDK.version} | node ${process.version} | ${process.platform}-${process.arch}`);

if (flag('--list-cameras')) {
  const cams = SmartSpectraSDK.availableCameras();
  console.log(`[probe] ${cams.length} camera(s):`);
  for (const c of cams) console.log(`  id=${c.id}  name=${c.name}  facing=${c.facing}  lens=${c.lensType}`);
  process.exit(0);
}

const apiKey = process.env.SMARTSPECTRA_API_KEY?.trim();
if (!apiKey) {
  console.error('[probe] SMARTSPECTRA_API_KEY is not set. Copy .env.example to .env and add your key.');
  process.exit(2);
}
const camId = process.env.SMARTSPECTRA_CAMERA_ID?.trim();
const selection = camId ? CameraSelection.byId(camId) : CameraSelection.default;
console.log(`[probe] camera selection: ${camId ? 'byId (from env)' : 'default'} | telemetry: disabled`);

function makeSdk() {
  return new SmartSpectraSDK({ apiKey, requestedMetrics: [...faceMetrics], enableTelemetry: false, enableAccumulatedOutput: false });
}

if (flag('--readiness')) {
  const sdk = makeSdk().useCamera(selection);
  try {
    const r = await sdk.checkDeviceReadiness();
    console.log(`[probe] readiness verdict=${r.verdict} reason=${r.reason}`);
  } catch (e) { console.error('[probe] readiness threw:', e?.code ?? '', e?.message ?? e); }
  await sdk.destroy();
  process.exit(0);
}

// Guided script. Phases are prompts for the human; analysis groups samples by phase.
const RETEST_PHASES = [
  ['warmup', 6, 'Look at the camera, relaxed face. Watch yourself in the preview window.'],
  ['neutral', 6, 'Stay NEUTRAL.'],
  ['surprise', 8, 'SURPRISE! Eyebrows way up, mouth in a big O. Hold it and watch the bar.'],
  ['neutral2', 5, 'Relax. Neutral.'],
  ['talking', 8, 'TALK! Say "eww, what is that smell" over and over.'],
  ['neutral3', 5, 'Stop talking. Neutral.'],
  ['mouthopen', 8, 'Open your MOUTH WIDE and hold it, then close, then open again.'],
  ['neutral4', 5, 'Relax. Neutral.'],
  ['happy', 6, 'BIG SMILE.'],
  ['neutral5', 5, 'Relax. Neutral.'],
];
const PHASES = flag('--retest') ? RETEST_PHASES : [
  ['warmup', 8, 'Look at the camera, face centred, neutral face. (warming up)'],
  ['neutral', 8, 'Stay NEUTRAL — relaxed face.'],
  ['happy', 6, 'BIG SMILE (HAPPY) — hold it!'],
  ['neutral2', 4, 'Back to neutral.'],
  ['surprise', 6, 'SURPRISE — eyebrows up, mouth open!'],
  ['neutral3', 4, 'Back to neutral.'],
  ['disgust', 6, 'DISGUST — wrinkle your nose, raise upper lip ("eww, smell!")'],
  ['neutral4', 4, 'Back to neutral.'],
  ['blink', 10, 'Do 5 slow, deliberate BLINKS (about 1 per 2 seconds).'],
  ['offframe', 6, 'Move OUT of frame (or cover camera) to test signal loss.'],
];

const here = dirname(fileURLToPath(import.meta.url));
const logDir = join(here, 'logs');
mkdirSync(logDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const log = createWriteStream(join(logDir, `probe-${stamp}.jsonl`));

const cycles = Number(opt('--cycles', '1'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --voice: speak prompts with Windows' built-in speech synthesizer (offline, System.Speech).
const VOICE = flag('--voice') && process.platform === 'win32';
const { spawn } = require('node:child_process');
// --preview: local-only (127.0.0.1) live preview page with expression bars. Frames are held in memory
// (latest only), never written to disk or sent anywhere else.
const PREVIEW = flag('--preview');
const live = { phase: 'starting', prompt: 'Starting camera…', scores: {}, blink: false, talking: false, valid: '', status: '', frame: null };
if (PREVIEW) {
  const http = require('node:http');
  const page = `<!doctype html><meta charset="utf-8"><title>SDK probe preview</title>
<style>body{margin:0;background:#111;color:#eee;font:16px system-ui;display:flex;gap:20px;padding:16px}
canvas{width:640px;border-radius:8px;background:#000}#p{font-size:26px;font-weight:700;color:#ffd84d;margin:0 0 10px}
.r{display:flex;align-items:center;gap:8px;margin:4px 0}.r b{width:90px}.bar{height:18px;background:#4caf50;border-radius:3px}
.hl b{color:#ffd84d}#v{color:#f88}small{color:#999}</style>
<div><canvas id=c width=320 height=240></canvas><div><small>LOCAL PREVIEW ONLY — not recorded</small></div></div>
<div style="flex:1"><p id=p></p><div id=s></div><div id=st></div><div id=v></div><div id=b></div></div>
<script>
const c=document.getElementById('c'),x=c.getContext('2d');
async function frame(){try{const r=await fetch('/frame');if(r.status===200){const a=await r.arrayBuffer();const d=new DataView(a);const w=d.getUint32(0),h=d.getUint32(4);
if(c.width!==w){c.width=w;c.height=h}x.putImageData(new ImageData(new Uint8ClampedArray(a,8,w*h*4),w,h),0,0)}}catch(e){}setTimeout(frame,80)}
async function state(){try{const j=await (await fetch('/state')).json();p.textContent=j.prompt;
const hl={surprise:'SURPRISE',happy:'HAPPY',neutral:'NEUTRAL'}[j.phase.replace(/\\d/,'')];
s.innerHTML=Object.entries(j.scores).sort((a,b)=>b[1]-a[1]).map(([k,v])=>'<div class="r'+(k===hl?' hl':'')+'"><b>'+k+'</b><div class=bar style="width:'+(v*3)+'px"></div>'+v.toFixed(0)+'%</div>').join('');
st.textContent='status: '+j.status;v.textContent=j.valid&&j.valid!=='kOk'?'⚠ '+j.valid:'';b.textContent='talking: '+(j.talking?'YES':'no')+'   blink: '+(j.blink?'YES':'no')}catch(e){}setTimeout(state,100)}
frame();state();</script>`;
  http.createServer((req, res) => {
    if (req.url === '/frame') {
      if (!live.frame) { res.writeHead(204); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' }); return res.end(live.frame);
    }
    if (req.url === '/state') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      const { frame, ...rest } = live; return res.end(JSON.stringify(rest));
    }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page);
  }).listen(5178, '127.0.0.1', () => {
    console.log('[probe] preview at http://127.0.0.1:5178');
    if (process.platform === 'win32') spawn('cmd.exe', ['/c', 'start', '', 'http://127.0.0.1:5178'], { stdio: 'ignore', windowsHide: true });
  });
}
// Downscale + mirror a raw frame to ≤320 px wide RGBA with an 8-byte (w,h) header.
function packFrame(buf, width, height, stride, fmt) {
  const bpp = { 0: 3, 1: 3, 2: 4, 3: 4 }[fmt]; if (!bpp) return null; // RGB, BGR, RGBA, BGRA only
  const bgr = fmt === 1 || fmt === 3;
  const step = Math.max(1, Math.ceil(width / 320)); const w = Math.floor(width / step), h = Math.floor(height / step);
  const out = Buffer.alloc(8 + w * h * 4); out.writeUInt32BE(w, 0); out.writeUInt32BE(h, 4);
  let o = 8;
  for (let y = 0; y < h; y++) {
    const row = y * step * stride;
    for (let xx = 0; xx < w; xx++) {
      const i = row + (width - 1 - xx * step) * bpp; // mirrored
      out[o++] = buf[i + (bgr ? 2 : 0)]; out[o++] = buf[i + 1]; out[o++] = buf[i + (bgr ? 0 : 2)]; out[o++] = 255;
    }
  }
  return out;
}

function say(text) {
  if (!VOICE) return;
  const safe = text.replace(/[^A-Za-z0-9 ,.!?()-]/g, ' ');
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate=1; $s.Speak('${safe}')`],
    { stdio: 'ignore', windowsHide: true }).on('error', () => {});
}

async function runCycle(cycle) {
  console.log(`\n[probe] ===== cycle ${cycle}/${cycles} =====`);
  const sdk = makeSdk().useCamera(selection);
  let phase = 'starting';
  const stats = { emits: 0, exprSamples: 0, blinkSamples: 0, firstMetricMs: null, errors: [], validation: {} };
  const t0 = Date.now();
  let lastBlink = false;
  const byPhase = {}; // phase -> { n, sum:{type:conf}, max:{type:conf}, top:{type:count}, blinkEdges, stableN }
  const bucket = () => (byPhase[phase] ??= { n: 0, sum: {}, max: {}, top: {}, blinkEdges: 0, blinkSamples: 0, stableN: 0 });

  sdk.on('processingStatus', (s) => { live.status = nameOf(ProcessingStatus, s); console.log(`[status] ${live.status} (+${Date.now() - t0} ms)`); });
  if (PREVIEW) {
    let lastPack = 0;
    sdk.on('videoOutput', (buf, w, h, stride, fmt) => {
      const now = Date.now(); if (now - lastPack < 66) return; lastPack = now; // ~15 fps is plenty
      const f = packFrame(buf, w, h, stride, fmt);
      if (f) live.frame = f; else if (!stats.badFmt) { stats.badFmt = true; console.log(`[preview] unsupported pixel format ${fmt}`); }
    });
  }
  let lmCount = 0, lastTalk = false;
  sdk.on('validationStatus', (code, _ts, hint) => {
    const n = nameOf(ValidationCode, code);
    live.valid = n;
    stats.validation[n] = (stats.validation[n] ?? 0) + 1;
    console.log(`[valid] ${n}${hint ? ` — ${hint}` : ''}`);
    log.write(JSON.stringify({ k: 'valid', cycle, phase, t: Date.now() - t0, code: n }) + '\n');
  });
  sdk.on('error', (code, message, retryable) => {
    const n = nameOf(SmartSpectraErrorCode, code);
    stats.errors.push(n);
    console.error(`[error] ${n} retryable=${retryable} ${message}`);
  });
  sdk.on('metrics', (buf, tsUs) => {
    stats.emits++;
    stats.firstMetricMs ??= Date.now() - t0;
    let m;
    try { m = decodeMetrics(buf); } catch (e) { console.error('[decode] failed', e?.message); return; }
    const face = m?.face;
    if (!face) return;
    const b = bucket();
    for (const ex of face.expression ?? []) {
      stats.exprSamples++; b.n++;
      if (ex.stable) b.stableN++;
      const scores = {};
      let topT = null, topC = -1;
      for (const s of ex.scores ?? []) {
        const t = EXPR[s.type] ?? `T${s.type}`; const c = s.confidence ?? 0;
        scores[t] = Math.round(c * 10) / 10;
        b.sum[t] = (b.sum[t] ?? 0) + c; b.max[t] = Math.max(b.max[t] ?? 0, c);
        if (c > topC) { topC = c; topT = t; }
      }
      if (topT) b.top[topT] = (b.top[topT] ?? 0) + 1;
      live.scores = scores;
      log.write(JSON.stringify({ k: 'expr', cycle, phase, t: Date.now() - t0, ts: toNum(ex.timestamp), stable: !!ex.stable, scores }) + '\n');
      process.stdout.write(`\r[expr] ${phase.padEnd(9)} top=${(topT ?? '-').padEnd(8)} ${topC.toFixed(0).padStart(3)}%  stable=${ex.stable ? 'Y' : 'n'}   `);
    }
    for (const bl of face.blinking ?? []) {
      stats.blinkSamples++; b.blinkSamples++;
      const d = !!bl.detected;
      if (d && !lastBlink) { b.blinkEdges++; process.stdout.write(`\n[blink] rising edge (${phase})\n`); }
      lastBlink = d; live.blink = d;
      log.write(JSON.stringify({ k: 'blink', cycle, phase, t: Date.now() - t0, ts: toNum(bl.timestamp), detected: d, stable: !!bl.stable }) + '\n');
    }
    for (const tk of face.talking ?? []) {
      const d = !!tk.detected; b.talkSamples = (b.talkSamples ?? 0) + 1; if (d) b.talkOn = (b.talkOn ?? 0) + 1;
      if (d && !lastTalk) b.talkEdges = (b.talkEdges ?? 0) + 1;
      lastTalk = d; live.talking = d;
      log.write(JSON.stringify({ k: 'talk', cycle, phase, t: Date.now() - t0, detected: d, stable: !!tk.stable }) + '\n');
    }
    // Landmarks: log every 3rd set (~10 Hz) for offline mouth-open analysis (numbers only).
    for (const lm of face.landmarks ?? []) {
      if (lmCount++ === 0) console.log(`\n[landmarks] first set: ${lm.value?.length ?? 0} points`);
      if (lmCount % 3 === 0) log.write(JSON.stringify({ k: 'lm', cycle, phase, t: Date.now() - t0, pts: (lm.value ?? []).map((p) => [+(p.x ?? 0).toFixed(1), +(p.y ?? 0).toFixed(1)]) }) + '\n');
    }
    log.write(JSON.stringify({ k: 'emit', cycle, t: Date.now() - t0, tsUs, nExpr: face.expression?.length ?? 0, nBlink: face.blinking?.length ?? 0 }) + '\n');
  });

  try {
    sdk.start();
  } catch (e) {
    console.error('[probe] start() threw:', e?.code ?? '', e?.message ?? e);
    await sdk.destroy();
    return { ok: false };
  }

  // Wait (max 90 s) for the first expression sample so prompts line up with real measurement.
  say(cycle === 1 ? 'Starting the face test. Look at the camera and keep a relaxed face.' : 'Round two. Look at the camera.');
  const tWait = Date.now();
  while (stats.exprSamples === 0 && Date.now() - tWait < 90000 && stats.errors.length === 0) await sleep(250);
  console.log(`\n[probe] first expression sample after ${Date.now() - t0} ms (exprSamples=${stats.exprSamples})`);

  for (const [id, secs, prompt] of PHASES) {
    phase = id; live.phase = id; live.prompt = prompt;
    console.log(`\n\n>>> [${id}] ${prompt}  (${secs}s)`);
    say(prompt.replace(/\(.*?\)/g, ''));
    await sleep(secs * 1000);
  }
  say(cycle < cycles ? 'Done. Come back into frame. Short pause.' : 'All done. Thank you!');
  phase = 'stopping';
  const tStop = Date.now();
  await sdk.stopAsync();
  console.log(`\n[probe] stopAsync resolved in ${Date.now() - tStop} ms — check the camera LED is OFF now.`);
  await sdk.destroy();

  const runSecs = (Date.now() - t0) / 1000;
  console.log(`\n[summary cycle ${cycle}] emits=${stats.emits} (${(stats.emits / runSecs).toFixed(1)}/s) exprSamples=${stats.exprSamples} blinkSamples=${stats.blinkSamples} firstMetric=${stats.firstMetricMs} ms errors=[${stats.errors.join(',')}]`);
  console.log(`[summary] validation counts: ${JSON.stringify(stats.validation)}`);
  for (const [p, b] of Object.entries(byPhase)) {
    const mean = Object.fromEntries(Object.entries(b.sum).map(([t, s]) => [t, +(s / Math.max(b.n, 1)).toFixed(1)]));
    const max = Object.fromEntries(Object.entries(b.max).map(([t, s]) => [t, +s.toFixed(1)]));
    console.log(`  ${p.padEnd(9)} n=${b.n} stable=${b.stableN} top=${JSON.stringify(b.top)} blinkEdges=${b.blinkEdges}/${b.blinkSamples} talkOn=${b.talkOn ?? 0}/${b.talkSamples ?? 0} talkEdges=${b.talkEdges ?? 0}`);
    console.log(`            mean=${JSON.stringify(mean)}`);
    console.log(`            max =${JSON.stringify(max)}`);
  }
  return { ok: stats.errors.length === 0 };
}

for (let c = 1; c <= cycles; c++) {
  await runCycle(c);
  if (c < cycles) await sleep(2000);
}
console.log(`\n[probe] numeric log written to tools/sdk-probe/logs/probe-${stamp}.jsonl`);
log.end(() => process.exit(0)); // also closes the preview server
