// Electron main process: window, security policy, SDK lifecycle, narrow IPC.
import { app, BrowserWindow, ipcMain, session, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isTrustedSender } from './ipcGuard';
import { rendererLifetime } from './rendererLifetime';
import { FaceService } from './faceService';
import { IPC } from '../shared/types';

// Credentials: read from the project's .env (dev) or the environment. Never sent to the renderer.
function loadEnv(): void {
  for (const dir of [app.getAppPath(), path.dirname(app.getPath('exe'))]) {
    try {
      process.loadEnvFile(path.join(dir, '.env'));
      return;
    } catch {
      /* no .env here — fall through to plain environment variables */
    }
  }
}
loadEnv();

const RENDERER_INDEX = path.join(__dirname, 'renderer', 'index.html');
const RENDERER_URL = pathToFileURL(RENDERER_INDEX).href;

let win: BrowserWindow | null = null;
let lifetime: ReturnType<typeof rendererLifetime> | null = null;

const send = (channel: string, payload: unknown) => {
  if (lifetime?.ready && win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, payload);
};

const face = new FaceService(process.env.SMARTSPECTRA_API_KEY?.trim() || undefined, process.env.SMARTSPECTRA_CAMERA_ID?.trim() || undefined, {
  status: (s) => send(IPC.status, s),
  validation: (v) => send(IPC.validation, v),
  samples: (s) => send(IPC.samples, s),
  frame: (f) => send(IPC.frame, f),
  error: (e) => send(IPC.error, e),
});

/** Only accept IPC from the main frame of our own window, showing exactly our bundled page (see ipcGuard.ts). */
function trusted(e: IpcMainInvokeEvent): boolean {
  const wc = win && !win.isDestroyed() ? win.webContents : null;
  return isTrustedSender(
    { senderIsOurWebContents: !!wc && e.sender === wc, senderIsMainFrame: !!wc && e.senderFrame === wc.mainFrame, frameUrl: e.senderFrame?.url },
    RENDERER_URL,
  );
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#1b1530',
    title: 'Fart Attack!',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  const owner = rendererLifetime(() => face.stop());
  lifetime = owner;
  win.webContents.on('did-finish-load', () => owner.loaded());
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) void owner.release();
  });
  win.webContents.on('render-process-gone', () => { void owner.release(); });
  win.webContents.on('destroyed', () => { void owner.release(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('closed', () => {
    void owner.release();
    win = null;
  });
  void win.loadFile(RENDERER_INDEX);
}

app.whenReady().then(() => {
  // The renderer never calls getUserMedia (the SDK captures in main), so deny every web permission.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  ipcMain.handle(IPC.hasKey, (e) => trusted(e) && face.hasKey());
  ipcMain.handle(IPC.start, (e) => (trusted(e) && lifetime?.ready ? face.start() : { ok: false, reason: 'start-failed', message: 'untrusted sender' }));
  ipcMain.handle(IPC.stop, (e) => (trusted(e) ? face.stop() : undefined));

  createWindow();
});

// Release the camera before quitting.
let quitting = false;
app.on('before-quit', (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  void face.stop().finally(() => app.quit());
});

app.on('window-all-closed', () => app.quit());
