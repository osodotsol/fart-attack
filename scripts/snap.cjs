// Dev-only visual check: drives the built renderer in KEYBOARD mode (no preload → no SDK, no camera, no credits)
// and saves screenshots. Usage: node scripts/launch-snap.mjs <outDir>
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const last = process.argv[process.argv.length - 1];
const out = last.endsWith('.cjs') ? path.join(__dirname, '..', 'snaps') : last; // default: ./snaps (git-ignored)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: true } });
  win.webContents.setFrameRate(60);
  await win.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
  const js = (code) => win.webContents.executeJavaScript(code);
  const click = (text) => js(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(text)})); if(b){b.click(); return true} return false })()`);
  const key = (k) => js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(k)}}))`);
  const snap = async (name) => fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG());

  await wait(800); await snap('01-title');
  await click('Play the story'); await wait(1500); await snap('02-story-1');
  for (let i = 2; i <= 7; i++) { await key(' '); await wait(200); await key(' '); await wait(1300); if ([3, 4, 5, 7].includes(i)) await snap(`02-story-${i}`); }
  await key(' '); await wait(600); await snap('03-consent');
  await click('keyboard only'); await wait(1200); await snap('04-L1-intro');
  await wait(4000); await snap('05-L1-play');
  await key('j'); await wait(900); await snap('06-L1-spray');
  await key('p'); await wait(300); await click('Quit'); await wait(500);
  await click('Choose a level'); await wait(400); await click('keyboard only'); await wait(600); await snap('07-levels');
  await click('Classroom'); await wait(5200); await snap('08-L2-play');
  await wait(5500); await snap('09-L2-warning');
  await wait(3300); await snap('10-L2-watching');
  await key('j'); await wait(300); await snap('11-L2-caught');
  await key('p'); await wait(300); await click('Quit'); await wait(500);
  await click('Choose a level'); await wait(400); await click('keyboard only'); await wait(600);
  await click('Restaurant'); await wait(4500); await key('j'); await wait(12000); await snap('12-L3-play');
  await key('k'); await wait(500); await snap('13-L3-windows');
  // let the round play out unattended to capture the lose screen
  await wait(45000); await snap('14-L3-end'); await wait(2500); await snap('15-complete');
  app.quit();
});
