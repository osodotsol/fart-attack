// Sandboxed preload: exposes exactly the FaceApi contract — no raw ipcRenderer, no Node.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type FaceApi } from '../shared/types';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: FaceApi = {
  hasKey: () => ipcRenderer.invoke(IPC.hasKey),
  start: () => ipcRenderer.invoke(IPC.start),
  stop: () => ipcRenderer.invoke(IPC.stop),
  onSamples: (cb) => subscribe(IPC.samples, cb),
  onStatus: (cb) => subscribe(IPC.status, cb),
  onValidation: (cb) => subscribe(IPC.validation, cb),
  onError: (cb) => subscribe(IPC.error, cb),
  onFrame: (cb) => subscribe(IPC.frame, cb),
};

contextBridge.exposeInMainWorld('faceApi', api);
