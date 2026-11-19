/// <reference types="vite/client" />
import type { FaceApi } from '../shared/types';

declare global {
  interface Window {
    /** Exposed by the preload. Undefined if the page is opened outside Electron. */
    faceApi?: FaceApi;
  }
}

export {};
