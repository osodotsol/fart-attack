// R1: explicit input-mode state machine for camera play.
//   camera    — face gestures drive the game (keyboard also works)
//   lost      — face signal stale > SIGNAL_LOST_MS: game paused; resumes by itself when the face returns
//   fallback  — player deliberately chose keyboard after signal loss: stays until they deliberately restore the camera
// Pure functions, so the "keyboard press immediately re-pauses" bug class is unit-testable.

export type InputMode = 'camera' | 'lost' | 'fallback';

export const SIGNAL_LOST_MS = 2000;
export const SIGNAL_BACK_MS = 300;

/** Automatic transitions from signal freshness. 'fallback' never changes automatically. */
export function stepInputMode(mode: InputMode, msSinceSample: number): InputMode {
  if (mode === 'camera' && msSinceSample > SIGNAL_LOST_MS) return 'lost';
  if (mode === 'lost' && msSinceSample < SIGNAL_BACK_MS) return 'camera';
  return mode;
}

/** Player pressed a game key / "Continue with keyboard" while paused for signal loss. */
export function chooseKeyboard(mode: InputMode): InputMode {
  return mode === 'lost' ? 'fallback' : mode;
}

/** Player asked to restore camera control. Only succeeds when a fresh face signal exists right now. */
export function restoreCamera(mode: InputMode, msSinceSample: number): { mode: InputMode; ok: boolean } {
  if (mode !== 'fallback') return { mode, ok: true };
  return msSinceSample < SIGNAL_BACK_MS ? { mode: 'camera', ok: true } : { mode, ok: false };
}
