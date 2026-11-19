// Mirrored self-view from the SDK's own preview frames (no second camera connection) + live expression meters with threshold markers.
// size="large": practice screen. size="small": the in-game facecam dock (bottom-right corner of the controls bar, outside the scene).
import { useEffect, useRef } from 'react';
import { DEFAULT_RULES } from '../game/gestures';
import { useFacecamVisible } from './facecamStore';
import { faceStore, useFace, validationHint } from './faceStore';
import { newPaintState, paintPreview } from './previewPaint';

const HAPPY_AT = DEFAULT_RULES.find((r) => r.gesture === 'freshener')!.fireAt;
const SURPRISE_AT = DEFAULT_RULES.find((r) => r.gesture === 'windows')!.fireAt;

export function Meter({ label, emoji, value, at, armed, keyHint }: { label: string; emoji: string; value: number; at: number; armed: boolean; keyHint?: string }) {
  const hit = value >= at;
  return (
    <div className={`meter ${hit ? 'hit' : ''} ${armed ? '' : 'cooling'}`}>
      <div className="meter-label">
        <span className="meter-emoji">{emoji}</span> {label} {keyHint && <kbd>{keyHint}</kbd>}
        <span className="meter-val">{Math.round(value)}%</span>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${Math.min(100, value)}%` }} />
        <div className="meter-mark" style={{ left: `${at}%` }} title={`Triggers at ${at}%`} />
      </div>
      {!armed && <div className="meter-note">Relax your face to reload</div>}
    </div>
  );
}

export function SelfView({ size = 'large', showMeters = true, showSurprise = true }: { size?: 'large' | 'small'; showMeters?: boolean; showSurprise?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const face = useFace();
  const facecamVisible = useFacecamVisible();
  // Only the in-game dock can be hidden; the practice screen always shows the face (it is where you learn the expressions).
  const showFace = size === 'large' || facecamVisible;

  useEffect(() => {
    if (!showFace) return;
    const state = newPaintState();
    let raf = 0;
    const draw = () => {
      const c = canvas.current;
      if (c) paintPreview(c, faceStore.frame, faceStore.frameAt, performance.now(), state);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf); // the canvas unmounts with the component, so nothing is left behind
  }, [showFace]);

  const hint = validationHint(face.validation);
  // States: off (no session) · warming (starting, no readings yet) · live (running + readings flowing) · stopped (SDK stopped/errored on its own)
  const live = face.cameraOn && face.status === 'running' && face.samplesFresh && face.frameFresh && !face.error;
  const stopped = face.cameraOn && (face.status === 'error' || face.status === 'stopping' || (face.status === 'idle' && face.hasSamples));
  const warming = face.cameraOn && !face.hasSamples && !stopped;
  const stale = face.cameraOn && face.hasSamples && !live && !stopped;
  const overlay = !face.cameraOn ? 'Camera off' : stopped ? 'Camera stopped' : warming ? 'Warming up the face sensor…' : stale && !hint ? 'Waiting for a fresh camera signal…' : null;
  const badge = live ? '● LIVE · not recorded' : warming ? 'Starting…' : stale ? 'Signal lost' : 'Camera off';
  const keyHints = size === 'small';
  // A reading is only shown while the camera is genuinely live: a stopped/off camera must not leave a frozen percentage behind.
  const happy = live ? face.happy : 0;
  const surprise = live ? face.surprise : 0;

  const meters = showMeters && (
    <div className={size === 'small' ? 'meters meters-side' : 'meters'}>
      <Meter label="Smile" emoji="😄" value={happy} at={HAPPY_AT} armed={face.happyArmed} keyHint={keyHints ? 'J' : undefined} />
      {showSurprise && <Meter label="Surprise" emoji="😮" value={surprise} at={SURPRISE_AT} armed={face.surpriseArmed} keyHint={keyHints ? 'K' : undefined} />}
    </div>
  );

  return (
    <div className={`selfview selfview-${size}`}>
      {size === 'small' && meters}
      {showFace && (
        <div className="selfview-frame">
          <canvas ref={canvas} width={320} height={240} aria-label="Your camera (mirrored, not recorded)" />
          {overlay && <div className="selfview-overlay">{overlay}</div>}
          {hint && !overlay && <div className="selfview-hint">{hint}</div>}
          <div className="selfview-badge">{badge}</div>
        </div>
      )}
      {size === 'large' && meters}
    </div>
  );
}
