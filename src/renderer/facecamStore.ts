// Show/Hide switch for the in-game face preview. Display only: hiding it does NOT stop the camera or the SDK session,
// and the Smile/Surprise indicators stay. Memory only (never persisted); defaults to visible.
import { useSyncExternalStore } from 'react';

let visible = true;
const listeners = new Set<() => void>();

export const isFacecamVisible = (): boolean => visible;

export function setFacecamVisible(v: boolean): void {
  if (v === visible) return;
  visible = v;
  listeners.forEach((l) => l());
}

export const toggleFacecam = (): void => setFacecamVisible(!visible);

export const useFacecamVisible = (): boolean =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    isFacecamVisible,
  );

/** Test helper. */
export const resetFacecam = (): void => setFacecamVisible(true);
