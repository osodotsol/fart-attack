// DEV-ONLY offline verification, run with:  npm run verify:offline
// Drives the BUILT renderer in a hidden Electron window. It never loads the main-process app, the SmartSpectra SDK or a camera,
// so no API credits are used (asserted at the end). Window audio is muted and every utterance is forced to volume 0: silent run.
// Camera-mode checks use scripts/fake-face-preload.cjs, a clearly labelled SIMULATION.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const PAGE = process.argv.find((a) => a.startsWith('--page='))?.slice(7) ?? path.join(__dirname, '..', 'dist', 'renderer', 'index.html');
const fs = require('node:fs');
const SHOTS = process.argv.find((a) => a.startsWith('--shots='))?.slice(8);
// --real: use a normal (non-offscreen) hidden window and near-silent (volume 0.02) speech with simulated user activation, so the
// speech engine REALLY speaks and start/end timings are meaningful. Default (offscreen, volume 0) is faster but never actually speaks.
const REAL = process.argv.includes('--real');
const FRAME_STALE_WAIT_MS = 1900; // > FRAME_STALE_MS (1500) in src/renderer/previewPaint.ts
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const note = (msg) => console.log(`INFO  ${msg}`);

async function closeWin(d) {
  try { d.win.destroy(); } catch { /* already gone */ }
  await wait(800); // let the previous offscreen window fully tear down before opening the next
}

async function open({ fake = false, reducedMotion = false, settle = 2200, width = 1280, height = 800 } = {}) {
  const win = new BrowserWindow({
    show: false, width, height,
    webPreferences: {
      contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: !REAL,
      preload: fake ? path.join(__dirname, 'fake-face-preload.cjs') : undefined,
    },
  });
  if (!REAL) win.webContents.setAudioMuted(true); // window muting makes the speech engine finish instantly, so --real leaves it unmuted
  win.webContents.setFrameRate(60);
  await win.loadFile(PAGE);
  if (reducedMotion) {
    // emulate the OS "reduce motion" setting, then reload so the app starts with it
    win.webContents.debugger.attach('1.3');
    await Promise.race([
      win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }),
      wait(5000).then(() => { throw new Error('reduced-motion emulation timed out'); }),
    ]);
    await win.loadFile(PAGE);
  }
  const js = (code) => win.webContents.executeJavaScript(code, true); // true = simulate user activation, like a real click/keypress
  const d = {
    win, js,
    text: () => js('document.body.innerText'),
    shot: async (name) => {
      if (!SHOTS) return;
      fs.mkdirSync(SHOTS, { recursive: true });
      fs.writeFileSync(path.join(SHOTS, name + '.png'), (await win.webContents.capturePage()).toPNG());
    },
    click: (label) => js(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(label)}) && !b.disabled); if(b){b.click();return true} return false })()`),
    key: (k) => js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(k)}}))`),
    // click as soon as an enabled button with this label exists (buttons can be briefly disabled, e.g. until the first face sample)
    clickSoon: async (label, ms = 6000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (await d.click(label)) return true; await wait(100); }
      return false;
    },
    pressed: (label) => js(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(label)})); return b ? { pressed: b.getAttribute('aria-pressed'), disabled: b.disabled } : null })()`),
    has: async (s) => (await d.text()).includes(s),
    waitFor: async (fn, ms = 8000, step = 100) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(step); }
      return false;
    },
    waitText: (s, ms) => d.waitFor(() => d.has(s), ms),
    log: () => js('window.__log'),
    panel: () => js("document.querySelectorAll('.cut-progress span.on').length"),
    subtitle: () => js("document.querySelector('.bubble-text')?.textContent ?? ''"),
    bubbleFull: () => js("(document.querySelector('.bubble-next')?.textContent ?? '').length > 0"),
    time: () => js("(() => { const n=[...document.querySelectorAll('.hud-box')].find(b=>b.textContent.includes('TIME')); return n ? Number(n.querySelector('.hud-num').textContent) : null })()"),
    // finish the subtitle, then go to the next panel
    next: async () => {
      if (!(await d.bubbleFull())) { await d.key(' '); await wait(120); }
      await d.key(' ');
      await wait(250);
    },
  };
  // speech hooks: record every speak/cancel, detect overlap, force volume 0
  await js(`(() => {
    window.__log = { speaks: [], cancels: 0, overlaps: 0, ends: 0, errors: 0 };
    const ss = window.speechSynthesis; if (!ss) return;
    const oSpeak = ss.speak.bind(ss), oCancel = ss.cancel.bind(ss); let since = 0;
    ss.cancel = () => { __log.cancels++; since++; return oCancel(); };
    ss.speak = (u) => {
      if (ss.speaking && since === 0) __log.overlaps++;
      since = 0;
      const e = { text: u.text, pitch: u.pitch, rate: u.rate, voice: u.voice && u.voice.name, local: u.voice && u.voice.localService, panel: document.querySelectorAll('.cut-progress span.on').length, t0: performance.now(), tStart: null, tEnd: null, err: null };
      __log.speaks.push(e);
      u.volume = ${REAL ? 0.02 : 0};
      u.addEventListener('start', () => { e.tStart = performance.now(); });
      u.addEventListener('end', () => { e.tEnd = performance.now(); __log.ends++; });
      u.addEventListener('error', (ev) => { e.err = ev.error; __log.errors++; });
      return oSpeak(u);
    };
  })()`);
  if (REAL && !process.argv.includes('--music')) { await d.click('Sound'); await d.click('Music'); } // keep sound effects + music off; only near-silent speech remains
  await wait(settle); // voices load asynchronously (settle=0 reproduces a fresh launch where the player clicks immediately)
  return d;
}

// ───────────────────────── Scenario B: audio controls, skip, reduced motion ─────────────────────────
async function scenarioControls() {
  console.log('\n=== B: audio controls, skip, reduced motion (no SDK) ===');
  let d = await open();
  const voiceBtn = await d.pressed('Voice');
  const voiceOn = !!voiceBtn && !voiceBtn.disabled;
  const voices = await d.js('speechSynthesis.getVoices().map(v => ({ local: v.localService, lang: v.lang }))');
  note(`speech voices: ${voices.length} total, ${voices.filter((v) => v.local && /^en/i.test(v.lang)).length} offline English → Voice switch ${voiceOn ? 'ENABLED' : 'DISABLED (subtitle-only mode)'}`);
  check('title shows three separate audio switches (Sound, Voice, Music)', !!(await d.pressed('Sound')) && !!voiceBtn && !!(await d.pressed('Music')));

  await d.click('Play the story');
  await d.waitFor(async () => (await d.subtitle()).length > 3);
  check('story starts with a visible subtitle', (await d.subtitle()).length > 3);
  if (voiceOn) {
    await d.waitFor(async () => (await d.log()).speaks.length >= 1, 4000);
    const l = await d.log();
    const story = l.speaks.filter((x) => x.text !== 'a'); // 'a' = the title-screen engine warm-up syllable
    check('panel 1 (narrator) is spoken exactly once, with an OFFLINE voice', story.length === 1 && story[0].local === true && /peaceful afternoon/i.test(story[0].text), story[0] && `voice="${story[0].voice}" pitch=${story[0].pitch}`);
    await wait(1500);
    check('no second utterance appears for the same line', (await d.log()).speaks.filter((x) => x.text !== 'a').length === 1);
  } else note('voice tests skipped: no offline English voice on this machine');

  // Skip
  const before = await d.log();
  await d.click('Skip story');
  await d.waitText('Before we turn on your camera', 3000);
  const afterSkip = await d.log();
  check('Skip story leaves the scene (consent screen shown)', await d.has('Before we turn on your camera'));
  check('Skip story cancels speech', voiceOn ? afterSkip.cancels > before.cancels : true);
  await wait(1500);
  check('no speech starts after skipping', (await d.log()).speaks.length === afterSkip.speaks.length);
  await closeWin(d);

  // Voice off mid-story + separate switches + M key
  d = await open();
  await d.click('Play the story');
  await d.waitFor(async () => (await d.subtitle()).length > 3);
  if (voiceOn) await d.waitFor(async () => (await d.log()).speaks.length >= 1, 4000);
  const c0 = (await d.log()).cancels;
  await d.click('Voice');
  await wait(200);
  check('Voice switch turns OFF (aria-pressed=false)', (await d.pressed('Voice')).pressed === 'false');
  if (voiceOn) check('turning Voice off cancels current speech immediately', (await d.log()).cancels > c0);
  check('Sound and Music stay ON when only Voice is switched off (separate controls)', (await d.pressed('Sound')).pressed === 'true' && (await d.pressed('Music')).pressed === 'true');
  const spokenWhileOn = (await d.log()).speaks.length;
  for (let i = 0; i < 5; i++) await d.next(); // reaches panel 6 → includes voiced panel 5 (robot)
  check('no speech while Voice is off, even on voiced panels', (await d.log()).speaks.length === spokenWhileOn, `panel ${await d.panel()}`);
  const sub = await d.subtitle();
  check('subtitles are still shown with Voice off', sub.length > 3, `"${sub.slice(0, 40)}…"`);
  await d.click('Sound');
  check('Sound switch toggles independently', (await d.pressed('Sound')).pressed === 'false' && (await d.pressed('Music')).pressed === 'true');
  await d.click('Sound');
  await d.key('m');
  await wait(150);
  const allOff = [(await d.pressed('Sound')).pressed, (await d.pressed('Music')).pressed];
  check('M key mutes everything', allOff.every((x) => x === 'false'), JSON.stringify(allOff));
  await d.key('m');
  await wait(150);
  check('M again restores everything', (await d.pressed('Sound')).pressed === 'true' && (await d.pressed('Music')).pressed === 'true');
  await closeWin(d);

  // Reduced motion → subtitles appear instantly
  d = await open({ reducedMotion: true });
  const rm = await d.js("matchMedia('(prefers-reduced-motion: reduce)').matches");
  await d.click('Play the story');
  await wait(400);
  const full = 'A peaceful afternoon in the quiet town of Beanbury…';
  check('reduced-motion emulation active', rm === true);
  check('reduced motion: subtitle shown instantly (no typewriter)', (await d.subtitle()) === full, `"${(await d.subtitle()).slice(0, 30)}"`);
  for (const key of [' ', 'Enter']) {
    const panel = await d.panel();
    const nativeActivationAllowed = await d.js(`(() => {
      const b = document.querySelector('.audio-controls button');
      return b.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }));
    })()`);
    await wait(100);
    check(`focused audio button keeps its native ${key === ' ' ? 'Space' : 'Enter'} activation without advancing the story`, nativeActivationAllowed && await d.panel() === panel);
  }
  await closeWin(d);
}

// ───────────────────────── Scenario C: R1 / R2 / R4 in the real renderer (SIMULATED face) ─────────────────────────
async function scenarioCamera() {
  console.log('\n=== C: camera-mode fallback, quit, session reset (SIMULATED face feed, no SDK) ===');
  const d = await open({ fake: true });
  check('synthetic camera UI is visibly labelled SIMULATION', await d.has('SIMULATION — synthetic face input'));
  await d.click('Choose a level');
  await d.waitText('Before we turn on your camera');
  await d.click('Turn on camera');
  await d.waitFor(async () => (await d.js('window.__fakeFace.stats().starts')) >= 1);
  check('camera mode starts a (simulated) session', (await d.js('window.__fakeFace.stats().starts')) === 1);
  await d.waitFor(async () => (await d.has('Skip practice')) || (await d.has("Let's go")), 4000);
  await d.shot('c1-practice');
  const skipped = await d.clickSoon('Skip practice');
  note(`clicked Skip practice: ${skipped}`);
  await d.waitFor(async () => (await d.text()).startsWith('Choose a level'), 4000);
  await d.shot('c2-levels');
  note(`clicked Living Room: ${await d.clickSoon('Living Room')}`);
  await wait(800);
  await d.shot('c3-intro');
  await d.waitFor(async () => (await d.time()) !== null && !(await d.has('Get ready')) && !(await d.has('LEVEL 1\nLiving Room Disaster\nBean')), 6000);
  await wait(4200); // intro countdown
  const t1 = await d.time();
  await wait(1200);
  check('round runs while the signal is good', (await d.time()) < t1, `time ${t1} → ${await d.time()}`);
  await d.js(`document.querySelector('.audio-controls button').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))`);
  await wait(150);
  check('Space on an audio button does not also activate the freshener', await d.js("document.querySelector('.control.active') === null"));

  // R1
  await d.js('window.__fakeFace.setSignal(false)');
  await d.waitText('We lost your face', 5000);
  check('R1: signal loss pauses the game with a clear message', await d.has('We lost your face'));
  const tp = await d.time();
  await wait(1200);
  check('R1: game time is frozen while paused for signal loss', (await d.time()) === tp);
  await d.key('j');
  await wait(500);
  check('R1: pressing J enters keyboard mode (pause overlay gone, banner shown)', !(await d.has('We lost your face')) && (await d.has('Keyboard mode')));
  const tk = await d.time();
  await wait(3500); // signal is STILL dead for this whole time
  check('R1 REGRESSION: with the signal still dead, the game does NOT re-pause', !(await d.has('We lost your face')) && (await d.time()) < tk, `time ${tk} → ${await d.time()}`);
  await d.key('c');
  await wait(300);
  check('R1: restoring while no face is visible is refused with an explanation', (await d.has("Still can't see your face")) && (await d.has('Keyboard mode')));
  await d.js('window.__fakeFace.setSignal(true)');
  await wait(500);
  check('R1: banner tells the player the camera is back (no silent switch)', await d.has('Camera is back'));
  await d.key('c');
  await wait(300);
  check('R1: deliberate restore returns to camera control', !(await d.has('Keyboard mode')));
  await d.js('window.__fakeFace.setHappy(95)');
  await d.waitText('SMILE → SPRAY', 3000);
  check('simulated smile drives the spray again after restore', await d.has('SMILE → SPRAY'));
  await d.js('window.__fakeFace.setHappy(3)');

  // R2: end of round delay vs quit
  console.log('   (waiting for the round to end by itself — about 40 s)');
  const ended = await d.waitFor(async () => (await d.has('OVERWHELMED')) || (await d.has('ROOM SAVED')), 70000, 200);
  check('round ends', ended);
  await wait(300);
  await d.click('Pause');
  await wait(150);
  const stopsBefore = await d.js('window.__fakeFace.stats().stops');
  await d.click('Quit & turn camera off'); // inside the 1.8 s hand-off window to the result screen
  await wait(3500);
  const txt = await d.text();
  check('R2 REGRESSION: quitting during the result delay stays on the title (no late jump to the result screen)', txt.includes('Play the story') && !txt.includes('OVERWHELMED') && !txt.includes('LEVEL COMPLETE'));
  const st = await d.js('window.__fakeFace.stats()');
  check('quit releases the (simulated) camera', st.stops === stopsBefore + 1 && st.running === false, JSON.stringify(st));
  await closeWin(d);
}

// Keyboard-only bot: presses J (and K where windows exist) every 250 ms, but never while the teacher is watching.
// Returns 'won' | 'lost' and prints a one-line summary of every attempt (score, caught, customers) for diagnosis.
async function playLevel(d, label, useK, maxTries = 3) {
  console.log(`   playing ${label}…`);
  const sum = async () => {
    const t = await d.text();
    const line = (re) => (t.match(re) || [''])[0];
    const score = (t.match(/\n(\d{2,5})\n/) || [])[1] ?? '?';
    const caught = line(/caught by teacher ×\d+/);
    const customers = line(/customers stayed \(\d+\) \+\d+/);
    const farts = line(/\d+ farts?[^\n]*/);
    return `${t.includes('LEVEL COMPLETE') ? 'WON ' : 'LOST'} score=${score} ${caught} ${customers} | ${farts}`;
  };
  for (let tries = 1; ; tries++) {
    const t0 = Date.now();
    let outcome = null;
    while (Date.now() - t0 < 90000) {
      const txt = await d.text();
      if (txt.includes('LEVEL COMPLETE')) { outcome = 'won'; break; }
      if (txt.includes('OVERWHELMED!') && txt.includes('Try again')) { outcome = 'lost'; break; }
      if (!txt.includes("DON'T LAUGH")) { await d.key('j'); if (useK) await d.key('k'); }
      await wait(250);
    }
    note(`${label} attempt ${tries}: ${outcome ?? 'timeout'} — ${await sum()}`);
    if (outcome === 'won') return 'won';
    if (tries >= maxTries) return 'lost';
    await d.click('Try again');
    await d.waitText('LEVEL', 3000);
  }
}

// ───────────────────────── Scenario D: levels 2 and 3 on their own (bot fairness diagnosis) ─────────────────────────
async function scenarioLevels() {
  console.log('\n=== D: Classroom and Restaurant, keyboard bot, attempt-by-attempt ===');
  for (const [name, useK] of [['Classroom', false], ['Restaurant', true]]) {
    const d = await open();
    await d.click('Choose a level');
    await d.waitText('Before we turn on your camera');
    await d.click('keyboard only');
    await d.waitText('Choose a level', 3000);
    await d.clickSoon(name);
    await wait(500);
    check(`${name}: keyboard bot wins within 3 attempts`, (await playLevel(d, name, useK)) === 'won');
    await closeWin(d);
  }
}

// ───────────────────────── Scenario E: fresh launch — is the FIRST story line spoken however soon Play is clicked? ─────────────────────────
async function scenarioFreshLaunch() {
  console.log('\n=== E: fresh launch, Play the story clicked N ms after the page loads (no SDK) ===');
  const delays = (process.argv.find((a) => a.startsWith('--delays='))?.slice(9) ?? '0,300,1000,2500').split(',').map(Number);
  for (const delay of delays) {
    const d = await open({ settle: 0 });
    const voicesAtLoad = await d.js('speechSynthesis.getVoices().length');
    await wait(delay);
    const voicesAtClick = await d.js('speechSynthesis.getVoices().length');
    const enabledAtClick = !(await d.pressed('Voice'))?.disabled;
    await d.clickSoon('Play the story', 3000);
    await wait(REAL ? 2500 : 800); // real engine: first start can take up to ~1 s on a cold process
    const l = await d.log();
    const warm = l.speaks.find((x) => x.text === 'a'); // the title-screen engine warm-up syllable
    const first = l.speaks.find((x) => /peaceful afternoon/i.test(x.text)); // the real first story line
    const speakingNow = await d.js('speechSynthesis.speaking');
    const fmt = (x) => (x ? `requested on panel ${x.panel}; engine start after ${x.tStart == null ? 'NEVER' : Math.round(x.tStart - x.t0) + ' ms'}` : 'n/a');
    note(`click at +${delay} ms: warm-up ${warm ? (warm.tStart == null ? 'cancelled by the real line' : 'started after ' + Math.round(warm.tStart - warm.t0) + ' ms') : 'not run'}; voices at load=${voicesAtLoad}, at click=${voicesAtClick}, Voice enabled=${enabledAtClick} → first line: ${fmt(first)}; engine speaking now=${speakingNow}`);
    check(`first panel is spoken when Play is clicked ${delay} ms after launch`, !!first && /peaceful afternoon/i.test(first.text) && first.panel === 1, first ? `spoken on panel ${first.panel}: "${first.text.slice(0, 30)}"` : 'NOTHING spoken on panel 1');
    if (REAL) {
      check(`  …and the REAL engine actually started it (start event, speaking=true)`, first && first.tStart != null && speakingNow === true);
      check(`  …and the subtitle is shown alongside`, (await d.subtitle()).length > 3);
      const c0 = (await d.log()).cancels;
      await d.click('Skip story');
      await wait(700);
      check(`  …and Skip story really stops it (engine speaking=false, cancel called)`, (await d.js('speechSynthesis.speaking')) === false && (await d.log()).cancels > c0);
    }
    await closeWin(d);
  }
}

// ───────────────────────── Scenario F: facecam layout (SIMULATED preview frames, no SDK) ─────────────────────────
// Measures where the in-game face preview sits, so it can be proven not to cover gameplay UI. The picture is a synthetic cartoon (magenta border).
const rectOf = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; })()`;
const overlaps = (a, b) => !!a && !!b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;

async function enterLevelCamera(d, levelName) {
  await d.click('Choose a level');
  await d.waitText('Before we turn on your camera');
  await d.click('Turn on camera');
  await d.clickSoon('Skip practice');
  await d.waitFor(async () => (await d.text()).startsWith('Choose a level'), 4000);
  await d.clickSoon(levelName);
  await wait(4300); // intro countdown
}

async function scenarioFacecam() {
  console.log('\n=== F: facecam layout and behaviour (SIMULATED preview, no SDK) ===');
  const sizes = [[1280, 800], [1536, 864], [1920, 1080]];
  for (const [W, H] of sizes) {
    for (const [lvl, name] of [[1, 'Living Room'], [2, 'Classroom'], [3, 'Restaurant']]) {
      const d = await open({ fake: true, settle: 300, width: W, height: H });
      await enterLevelCamera(d, name);
      await d.js('window.__fakeFace.setHappy(92)');
      await wait(400);
      const R = {};
      for (const k of ['.hud', '.stage', '.controls', '.selfview', '.selfview-frame', '.meters', '.selfview canvas']) R[k] = await d.js(rectOf(k));
      const f = R['.selfview-frame'], st = R['.stage'], hud = R['.hud'], ctl = R['.controls'];
      note(`L${lvl} ${W}x${H}: facecam ${f ? Math.round(f.w) + 'x' + Math.round(f.h) : 'none'} | stage ${st ? Math.round(st.w) + 'x' + Math.round(st.h) : '?'} (${st ? Math.round(100 * st.h / H) : '?'}% of window height) | bar h=${ctl ? Math.round(ctl.h) : '?'}`);
      check(`L${lvl} ${W}x${H}: facecam does not overlap stage or HUD`, !!f && !overlaps(f, st) && !overlaps(f, hud));
      check(`L${lvl} ${W}x${H}: whole facecam is inside the window`, !!f && f.x >= 0 && f.y >= 0 && f.r <= W && f.b <= H);
      // improved size/layout, measured against the pre-change baseline (200x150 face; stage heights from the baseline run)
      const base = { 1280: [472, 472, 421], 1536: [487, 487, 436], 1920: [487, 487, 436] }[W][lvl - 1];
      check(`L${lvl} ${W}x${H}: facecam is larger (>= 250 px wide, 4:3)`, !!f && f.w >= 250 && Math.abs(f.w / f.h - 4 / 3) < 0.02, f && `${Math.round(f.w)}x${Math.round(f.h)}`);
      check(`L${lvl} ${W}x${H}: gameplay stage is NOT smaller than before (>= baseline ${base} px)`, !!st && st.h >= base - 1, st && `${Math.round(st.h)} px`);
      const mt = R['.meters'];
      check(`L${lvl} ${W}x${H}: Smile/Surprise indicators sit beside the face, not on it`, !!mt && !overlaps(mt, f) && mt.r <= f.x + 1);
      if (lvl === 2) {
        // wait for the teacher to start watching and check the banner is not covered
        await d.waitFor(async () => (await d.has("DON'T LAUGH")), 20000, 150);
        const tb = await d.js(rectOf('.teacher-banner'));
        check(`L2 ${W}x${H}: teacher warning/DON'T LAUGH banner is visible and not covered by the facecam`, !!tb && !overlaps(tb, f));
      }
      if (lvl === 3) {
        const cust = await d.js("(() => { const b=[...document.querySelectorAll('.hud-box')].find(x=>x.textContent.includes('CUSTOMERS')); if(!b) return null; const r=b.getBoundingClientRect(); return { x:r.left,y:r.top,w:r.width,h:r.height,r:r.right,b:r.bottom } })()");
        check(`L3 ${W}x${H}: customer counter visible and not covered`, !!cust && !overlaps(cust, f));
      }
      if (W === 1536 && lvl === 1) {
        // show/hide, stale clearing and clearing on stop (SIMULATED frames from the fake preload)
        const alpha = () => d.js("(() => { const c = document.querySelector('.selfview canvas'); if (!c) return null; return c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data[3]; })()");
        const frameCount = () => d.js("document.querySelectorAll('.selfview-frame').length");
        check('facecam shows a picture while frames arrive', (await alpha()) === 255);
        const stageBefore = (await d.js(rectOf('.stage'))).h;
        const startsBefore = (await d.js('window.__fakeFace.stats().starts'));
        await d.key('f');
        await wait(300);
        check('F hides the facecam picture but keeps the Smile indicator', (await frameCount()) === 0 && !!(await d.js(rectOf('.meters'))));
        check('hiding frees space for the stage', (await d.js(rectOf('.stage'))).h > stageBefore + 20);
        const st1 = await d.js('window.__fakeFace.stats()');
        check('hiding does NOT touch the camera: same SDK session, still running, no extra start', st1.running === true && st1.starts === startsBefore);
        check('the game did not pause or react to F', !(await d.has('Paused')));
        await d.click('Facecam');
        await wait(300);
        check('the Facecam button brings it back', (await frameCount()) === 1);
        await wait(300);
        check('picture is live again after showing', (await alpha()) === 255);
        await d.js('window.__fakeFace.setFrames(false)');
        await wait(FRAME_STALE_WAIT_MS);
        check('when frames stop arriving the picture is cleared (no stale face)', (await alpha()) === 0);
        check('stale frames also remove LIVE and frozen readings', !(await d.has('LIVE')) && (await d.js("document.querySelector('.meters-side .meter-val')?.textContent")) === '0%');
        await d.js('window.__fakeFace.setFrames(true)');
        await wait(500);
        check('picture returns when frames resume', (await alpha()) === 255);
        await d.js('window.faceApi.stop()'); // the SDK reports it has stopped
        await wait(400);
        check('when the camera stops, the picture is cleared immediately', (await alpha()) === 0);
        check('…and the dock says the camera is not live', !(await d.text()).includes('LIVE · not recorded'));
        check('…and the Smile indicator no longer shows a frozen reading', (await d.js("(document.querySelector('.meters-side .meter-val')?.textContent ?? '')")) === '0%');
        await d.shot('f-after-stop');
      }
      if (W === 1536) await d.shot(`f-L${lvl}-${W}x${H}`);
      await closeWin(d);
    }
  }
}

// ───────────────────────── Scenario A: full keyboard-only campaign with story + finale ─────────────────────────
async function scenarioCampaign() {
  console.log('\n=== A: keyboard-only campaign — story, three levels, finale (about 4 minutes) ===');
  const d = await open();
  const voiceOn = !!(await d.pressed('Voice')) && !(await d.pressed('Voice')).disabled;
  const panelsDone = {};
  const playScene = async (name, expected) => {
    for (let n = 0; n < expected; n++) {
      if (!(await d.waitFor(async () => (await d.subtitle()).length > 0, 3000))) break;
      panelsDone[name] = (panelsDone[name] ?? 0) + 1;
      if (n < expected - 1) await d.next(); else { if (!(await d.bubbleFull())) { await d.key(' '); await wait(150); } await d.key(' '); await wait(300); }
    }
  };
  await d.click('Play the story');
  await playScene('opening', 7);
  check('opening story shows all 7 panels', panelsDone.opening === 7, `${panelsDone.opening}`);
  await d.waitText('Before we turn on your camera', 3000);
  check('story → consent screen (camera stays an explicit separate step)', await d.has('Before we turn on your camera'));
  await d.click('keyboard only');
  await d.waitText('LEVEL 1', 3000);

  const bot = (levelLabel, useK) => playLevel(d, levelLabel, useK);
  const afterWin = async (sceneName, panels) => {
    const label = sceneName === 'finale' ? 'See the ending' : 'Continue the story';
    await d.click(label);
    await playScene(sceneName, panels);
  };

  check('Level 1 (Living Room) won with keyboard only', (await bot('Level 1', false)) === 'won');
  const scoreL1 = await d.text();
  await afterWin('after1', 6);
  check('story after level 1 shows 6 panels', panelsDone.after1 === 6, `${panelsDone.after1}`);
  await d.waitText('LEVEL 2', 4000);
  check('Level 2 (Classroom) won with keyboard only (respecting the teacher)', (await bot('Level 2', false)) === 'won');
  await afterWin('after2', 6);
  check('story after level 2 shows 6 panels', panelsDone.after2 === 6, `${panelsDone.after2}`);
  await d.waitText('LEVEL 3', 4000);
  check('Level 3 (Restaurant) won with keyboard only', (await bot('Level 3', true)) === 'won');
  await afterWin('finale', 3);
  check('finale story shows 3 panels', panelsDone.finale === 3, `${panelsDone.finale}`);
  const reached = await d.waitText('YOU SAVED THE CITY', 4000);
  const fin = await d.text();
  check('finale screen reached with total score and a rank title', reached && /Your official title/.test(fin), fin.split('\n').filter((l) => /^[A-Z][A-Za-z\- ]+$/.test(l) && l.length > 12).slice(-2).join(' | '));

  const l = await d.log();
  if (voiceOn) {
    check('voice: spoken lines happened across the campaign', l.speaks.length >= 8, `${l.speaks.length} utterances`);
    check('voice: no overlapping speech anywhere in the campaign', l.overlaps === 0, `overlaps=${l.overlaps}`);
    check('voice: every utterance used an offline voice', l.speaks.every((s) => s.local === true));
    const roles = new Set(l.speaks.map((s) => (s.pitch >= 1.9 ? 'robot' : s.pitch >= 1.6 ? 'kid' : 'other')));
    check('voice: distinct character styles used (robot squeaky, kid high, others)', roles.has('robot') && roles.has('kid') && roles.has('other'), [...roles].join(','));
    const texts = l.speaks.map((s) => s.text);
    const dups = texts.filter((t, i) => i > 0 && t === texts[i - 1]);
    check('no spoken line is repeated back-to-back', dups.length === 0, dups.length ? `repeated: ${[...new Set(dups)].join(' | ')}` : '');
    note(`spoken: ${texts.map((t) => JSON.stringify(t.slice(0, 28))).join(' · ')}`);
    note(`utterances: ${texts.length} | engine end events: ${l.ends} | errors/cancels reported: ${l.errors}`);
  } else note('campaign ran in subtitle-only mode (no offline voice available)');
  await closeWin(d);
}

// F3/F5 stabilization: real production renderer, explicitly simulated bridge.
async function scenarioStartupRecovery() {
  console.log('=== G: startup watchdog and direct keyboard escape (SIMULATION) ===');
  const d = await open({ fake: true, settle: 300 });
  await d.js('window.__fakeFace.setSignal(false); window.__fakeFace.setFrames(false)');
  await d.click('Choose a level'); await d.waitText('Before we turn on your camera');
  await d.click('Turn on camera'); await d.waitText('Practise your moves');
  check('keyboard escape is available while the sensor is warming', await d.has('Play with keyboard'));
  check('no-readings startup offers bounded recovery after 30 seconds', await d.waitText('after 30 seconds', 33000));
  check('timeout exposes Retry', !!(await d.pressed('Retry')));
  await d.js('window.__fakeFace.setSignal(true); window.__fakeFace.setFrames(true)');
  await d.click('Retry');
  check('Retry starts a clean simulated session and restores readiness', await d.waitFor(async () => (await d.js('window.__fakeFace.stats().starts')) === 2 && await d.click('Skip practice'), 6000));
  await d.waitFor(async () => (await d.text()).startsWith('Choose a level'));
  await d.click('Living Room'); await wait(4300);
  await d.js('window.__fakeFace.setHappy(92)'); await wait(300);
  check('fresh frames and readings show LIVE', await d.has('LIVE'));
  await d.js('window.__fakeFace.setValid(false)'); await wait(300);
  check('invalid readings hide LIVE but retain actionable validation guidance', !(await d.has('LIVE')) && await d.has("look at the camera"));
  await d.js('window.__fakeFace.setValid(true)'); await wait(300);
  await d.js('window.__fakeFace.setSignal(false)'); await wait(900);
  check('stale readings remove LIVE even while preview frames continue', !(await d.has('LIVE')));
  check('stale readings display zero, not the last smile', (await d.js("document.querySelector('.meters-side .meter-val')?.textContent")) === '0%');
  await d.js('window.__fakeFace.setSignal(true)');
  check('fresh signals restore LIVE without another SDK start', await d.waitText('LIVE') && (await d.js('window.__fakeFace.stats().starts')) === 2);
  await closeWin(d);
  const escape = await open({ fake: true, settle: 300 });
  await escape.js('window.__fakeFace.setSignal(false)');
  await escape.click('Choose a level'); await escape.waitText('Before we turn on your camera');
  await escape.click('Turn on camera'); await escape.waitText('Practise your moves');
  await escape.click('Play with keyboard');
  check('keyboard escape goes directly to level select without quitting', await escape.waitFor(async () => (await escape.text()).startsWith('Choose a level')));
  check('keyboard escape stops the simulated camera', (await escape.js('window.__fakeFace.stats().running')) === false);
  await closeWin(escape);
}

app.on('window-all-closed', () => { /* stay alive between scenarios; the script calls app.exit itself */ });

app.whenReady().then(async () => {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  try {
    if (!only || only === 'B') await scenarioControls();
    if (!only || only === 'C') await scenarioCamera();
    if (only === 'D') await scenarioLevels();
    if (only === 'F') await scenarioFacecam();
    if (!only || only === 'G') await scenarioStartupRecovery();
    if (!only || only === 'E') await scenarioFreshLaunch();
    if (!only || only === 'A') await scenarioCampaign();
  } catch (e) {
    check('verification script ran to completion', false, String(e && e.stack ? e.stack : e));
  }
  const sdkLoaded = Object.keys(require.cache).some((k) => /smartspectra/i.test(k));
  check('SDK never loaded in this process → no API credits used', sdkLoaded === false);
  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESULT: ${results.length - failed.length}/${results.length} checks passed${failed.length ? ' — FAILED: ' + failed.map((f) => f.name).join('; ') : ''}`);
  app.exit(failed.length ? 1 : 0);
});
