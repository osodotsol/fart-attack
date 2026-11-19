// One round of a level: rAF loop drives the pure engine; face gestures and keys queue actions.
import { useEffect, useRef, useState } from 'react';
import { act, cooldownLeft, createGame, isSpraying, sprayLeft, tick, type Action, type GameState } from '../game/engine';
import { chooseKeyboard, restoreCamera, SIGNAL_BACK_MS, stepInputMode, type InputMode } from '../game/inputMode';
import type { LevelDef } from '../game/levels';
import { KID_EXCUSES, pickDifferent, QUIPS, type QuipKind } from '../game/story';
import { play, playBotTalk } from './audio';
import { toggleAll } from './audioPrefs';
import { AudioControls } from './AudioControls';
import { GameScene } from './art/scenes';
import { faceStore, useFace } from './faceStore';
import { toggleFacecam, useFacecamVisible } from './facecamStore';
import { SelfView } from './SelfView';
import { createTimerBag, type TimerBag } from './timers';
import { speak, stopSpeech } from './voice';

export type PlayMode = 'camera' | 'keyboard';

export interface RoundResult {
  levelId: number;
  won: boolean;
  score: number;
  winBonus: number;
  customerBonus: number;
  customersLeft: number | null;
  caught: number;
  farts: number;
  megaFarts: number;
  actions: Record<Action, number>;
  faceActions: number;
}

interface Popup {
  id: number;
  text: string;
  kind: Action | 'rejected' | 'caught' | 'mega';
}

const INTRO_MS = 3500;
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
// Remembered across rounds so consecutive spoken lines are never identical.
let lastKidExcuse: string | undefined;
let lastVerdict: string | undefined;

export function Game({ level, mode, onEnd, onQuit }: { level: LevelDef; mode: PlayMode; onEnd: (r: RoundResult) => void; onQuit: () => void }) {
  const [state, setState] = useState<GameState>(() => createGame(level));
  const [fx, setFx] = useState({ windows: 0, fart: 0, fartSource: 0, mega: false, windowsOpenUntil: 0, left: 0, faceFlash: 0, faceAction: 'freshener' as Action });
  const [popups, setPopups] = useState<Popup[]>([]);
  const [quip, setQuip] = useState<{ text: string; id: number } | null>(null);
  const [paused, setPaused] = useState<null | 'manual'>(null);
  const [inputMode, setInputModeState] = useState<InputMode>('camera');
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [introLeft, setIntroLeft] = useState(INTRO_MS);
  const face = useFace();
  const facecamVisible = useFacecamVisible();

  const stateRef = useRef(state);
  const queue = useRef<{ action: Action; byFace: boolean }[]>([]);
  const faceActions = useRef(0);
  const ended = useRef(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const inputModeRef = useRef<InputMode>('camera');
  const setInputMode = (m: InputMode) => {
    inputModeRef.current = m;
    setInputModeState(m);
  };
  const introRef = useRef(introLeft);
  const quipAt = useRef(0);
  const voiceAt = useRef(0);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  // R2: every delayed callback goes through this bag; unmount / quit / restart clears them all, so nothing fires late.
  const timers = useRef<TimerBag | null>(null);
  useEffect(() => {
    const bag = createTimerBag();
    timers.current = bag;
    return () => {
      bag.clear();
      timers.current = null;
      stopSpeech(); // leaving the level silences any character mid-sentence
    };
  }, []);
  const later = (fn: () => void, ms: number) => timers.current?.later(fn, ms);

  const say = (kind: QuipKind, force = false) => {
    const now = performance.now();
    if (!force && now - quipAt.current < 3500) return;
    quipAt.current = now;
    const id = now;
    const text = pick(QUIPS[kind]);
    setQuip({ text, id });
    playBotTalk(text); // FRESHBOT's babble; the sound/voice switches decide if you hear it
    later(() => setQuip((q) => (q?.id === id ? null : q)), 2600);
  };
  /** A few spoken character lines during play (rate-limited; the voice switch and availability still apply). */
  const voiceLine = (id: string, role: 'robot' | 'kid' | 'teacher', text: string, coolMs: number) => {
    const now = performance.now();
    if (now - voiceAt.current < coolMs) return;
    voiceAt.current = now;
    speak({ id, role, text });
  };
  const sayRef = useRef(say);
  sayRef.current = say;
  const voiceLineRef = useRef(voiceLine);
  voiceLineRef.current = voiceLine;
  const laterRef = useRef(later);
  laterRef.current = later;

  const tryRestore = () => {
    const r = restoreCamera(inputModeRef.current, faceStore.msSinceSample());
    if (r.ok) {
      setRestoreMsg(null);
      setInputMode(r.mode);
    } else {
      setRestoreMsg("Still can't see your face — look at the camera, then try again.");
      later(() => setRestoreMsg(null), 3000);
    }
  };
  const tryRestoreRef = useRef(tryRestore);
  tryRestoreRef.current = tryRestore;

  // Inputs: keyboard always; face gestures only while the camera is actually in control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === ' ' && (e.target as HTMLElement | null)?.closest?.('button')) return;
      const k = e.key.toLowerCase();
      const actionKey = k === 'j' || k === ' ' || (k === 'k' && !!level.windows);
      // R1: a game key while paused for signal loss is a deliberate choice to continue on the keyboard.
      if (inputModeRef.current === 'lost' && actionKey) {
        setInputMode(chooseKeyboard('lost'));
        return;
      }
      if (k === 'j' || k === ' ') queue.current.push({ action: 'freshener', byFace: false });
      else if (k === 'k' && level.windows) queue.current.push({ action: 'windows', byFace: false });
      else if (k === 'p' || k === 'escape') {
        setPaused((p) => (p ? null : 'manual'));
        stopSpeech();
      } else if (k === 'm') toggleAll();
      else if (k === 'c' && mode === 'camera') tryRestoreRef.current();
      else if (k === 'f' && mode === 'camera') toggleFacecam();
    };
    window.addEventListener('keydown', onKey);
    const offGesture =
      mode === 'camera'
        ? faceStore.onGesture((g) => {
            if (inputModeRef.current !== 'camera') return; // keyboard fallback: face gestures are ignored until restored
            if (g === 'windows' && !level.windows) return;
            queue.current.push({ action: g, byFace: true });
          })
        : () => undefined;
    return () => {
      window.removeEventListener('keydown', onKey);
      offGesture();
    };
  }, [mode, level]);

  // Game loop.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let popupId = 0;
    let dangerSaid = false;
    const loop = (now: number) => {
      const dt = now - last;
      last = now;

      if (introRef.current > 0) {
        introRef.current = Math.max(0, introRef.current - dt);
        setIntroLeft(introRef.current);
        if (introRef.current === 0) sayRef.current('start', true);
        queue.current.length = 0;
        raf = requestAnimationFrame(loop);
        return;
      }

      if (mode === 'camera') {
        const next = stepInputMode(inputModeRef.current, faceStore.msSinceSample());
        if (next !== inputModeRef.current) setInputMode(next);
      }
      const halted = !!pausedRef.current || inputModeRef.current === 'lost';

      if (!halted && !ended.current) {
        let s = tick(stateRef.current, dt);
        for (const q of queue.current.splice(0)) {
          const r = act(s, q.action);
          s = r.state;
          if (r.accepted && q.byFace) {
            faceActions.current++;
            setFx((f) => ({ ...f, faceFlash: f.faceFlash + 1, faceAction: q.action }));
          }
        }
        const newPopups: Popup[] = [];
        for (const e of s.events) {
          switch (e.kind) {
            case 'fart':
              setFx((f) => ({ ...f, fart: f.fart + 1, fartSource: e.source ?? 0, mega: !!e.mega }));
              play(e.mega ? 'bigfart' : 'fart');
              if (e.mega) {
                newPopups.push({ id: ++popupId, kind: 'mega', text: 'MEGA FART!' });
                sayRef.current('mega', true);
                laterRef.current(() => play('oops'), 700); // Bean Kid's squeak
                lastKidExcuse = pickDifferent(KID_EXCUSES, lastKidExcuse);
                voiceLineRef.current('kid-mega', 'kid', lastKidExcuse, 14000);
              } else sayRef.current('fart');
              break;
            case 'freshener':
              play('spray');
              sayRef.current('spray');
              break;
            case 'windows':
              setFx((f) => ({ ...f, windows: f.windows + 1, windowsOpenUntil: s.t + 1500 }));
              play('whoosh');
              sayRef.current('windows', true);
              break;
            case 'caught':
              play('caught');
              newPopups.push({ id: ++popupId, kind: 'caught', text: `CAUGHT! ${e.points}` });
              sayRef.current('caught', true);
              voiceLineRef.current('teacher-caught', 'teacher', 'I saw that!', 6000);
              break;
            case 'teacher':
              if (e.phase === 'warning') {
                play('warn');
                sayRef.current('warn', true);
              } else if (e.phase === 'watching') play('ahem');
              break;
            case 'customer-left':
              setFx((f) => ({ ...f, left: f.left + 1 }));
              play('eek');
              sayRef.current('customer');
              break;
            case 'won':
              play('win');
              sayRef.current('win', true);
              break;
            case 'lost':
              play('lose');
              sayRef.current('lose', true);
              break;
            case 'rejected':
              if (e.action === 'freshener' && !isSpraying(s)) newPopups.push({ id: ++popupId, kind: 'rejected', text: 'Reloading…' });
              break;
          }
          if ((e.kind === 'freshener' || e.kind === 'windows') && e.points)
            newPopups.push({ id: ++popupId, kind: e.kind, text: `+${e.points}${s.combo > 1 ? ` ×${s.combo}` : ''}` });
        }
        if (s.stink > 85 && !dangerSaid) {
          dangerSaid = true;
          sayRef.current('danger', true);
          play('gag'); // Bean Kid is not well
        } else if (s.stink < 60) dangerSaid = false;
        if (newPopups.length) {
          setPopups((p) => [...p.slice(-4), ...newPopups]);
          const ids = new Set(newPopups.map((p) => p.id));
          laterRef.current(() => setPopups((p) => p.filter((x) => !ids.has(x.id))), 1200);
        }
        stateRef.current = s;
        setState(s);
        if (s.status !== 'playing') {
          ended.current = true;
          const result: RoundResult = {
            levelId: level.id, won: s.status === 'won', score: s.score, winBonus: s.winBonus, customerBonus: s.customerBonus,
            customersLeft: s.customers, caught: s.caught, farts: s.farts, megaFarts: s.megaFarts, actions: s.actions, faceActions: faceActions.current,
          };
          // The robot speaks the verdict. R2: this delayed hand-off is cancelled if the player quits/restarts first.
          lastVerdict = pickDifferent(s.status === 'won' ? QUIPS.win : QUIPS.lose, lastVerdict);
          speak({ id: `verdict:${level.id}:${s.status}`, role: 'robot', text: lastVerdict });
          laterRef.current(() => onEndRef.current(result), 1800);
        }
      } else {
        queue.current.length = 0; // don't bank actions while paused / waiting for signal
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode, level]);

  const secondsLeft = Math.max(0, Math.ceil((level.roundMs - state.t) / 1000));
  const spraying = isSpraying(state);
  const freshCd = cooldownLeft(state, 'freshener');
  const windowsCd = cooldownLeft(state, 'windows');
  const stinkColor = state.stink < 40 ? '#7bd389' : state.stink < 75 ? '#ffc145' : '#ff5a5f';
  const phase = state.teacher?.phase;
  const signalBack = inputMode === 'fallback' && faceStore.msSinceSample() < SIGNAL_BACK_MS;

  return (
    <div className="game">
      <div className="hud">
        <div className="hud-box hud-level"><div className="hud-label">LEVEL {level.id}</div><div className="hud-name">{level.name}</div></div>
        <div className="hud-stink">
          <div className="hud-label">STINK</div>
          <div className="stink-track">
            <div className="stink-fill" style={{ width: `${state.stink}%`, background: stinkColor }} />
            {level.customers && <div className="stink-line" style={{ left: `${level.customers.leaveAtStink}%` }} title="Customers leave above this line" />}
          </div>
        </div>
        {state.customers !== null && (
          <div className="hud-box"><div className="hud-label">CUSTOMERS</div><div className="hud-num">🧑‍🍳 {state.customers}</div></div>
        )}
        <div className="hud-box"><div className="hud-label">SCORE</div><div className="hud-num">{state.score}</div></div>
        <div className="hud-box"><div className="hud-label">TIME</div><div className="hud-num">{secondsLeft}</div></div>
        {state.combo > 1 && <div className="hud-combo">COMBO ×{state.combo}</div>}
      </div>

      <div className="stage">
        <GameScene
          theme={level.theme}
          stink={state.stink}
          spraying={spraying}
          windowsOpen={state.t < fx.windowsOpenUntil}
          windowsKey={fx.windows}
          fartKey={fx.fart}
          fartSource={fx.fartSource}
          mega={fx.mega}
          teacherPhase={phase}
          customers={state.customers}
          customersStart={level.customers?.start}
          leftKey={fx.left}
          quip={quip?.text}
          quipKey={quip?.id}
        />
        {phase === 'warning' && <div className="teacher-banner warn">⚠️ TEACHER TURNING AROUND!</div>}
        {phase === 'watching' && <div className="teacher-banner watch">👀 DON'T LAUGH! 👀</div>}
        {fx.faceFlash > 0 && (
          <div key={fx.faceFlash} className="face-flash">{fx.faceAction === 'freshener' ? '😄 SMILE → SPRAY!' : '😮 SURPRISE → WINDOWS!'}</div>
        )}
        {inputMode === 'fallback' && (
          <div className="fallback-banner" role="status">
            <span>⌨️ Keyboard mode — the camera lost your face.</span>
            <button className="btn btn-small" onClick={tryRestore}>{signalBack ? '📷 Camera is back — restore (C)' : '📷 Restore camera control (C)'}</button>
            {restoreMsg && <span className="fallback-msg">{restoreMsg}</span>}
          </div>
        )}
        <div className="popups">
          {popups.map((p) => <div key={p.id} className={`popup popup-${p.kind}`}>{p.text}</div>)}
        </div>
        {introLeft > 0 && (
          <div className="pause intro">
            <div className="intro-level">LEVEL {level.id}</div>
            <h2>{level.name}</h2>
            <p className="muted">{level.tagline}</p>
            <ul className="howto">{level.howTo.map((h) => <li key={h}>{h}</li>)}</ul>
            <div className="countdown">{Math.ceil(introLeft / 1000) > 3 ? 'Get ready…' : Math.ceil(introLeft / 1000)}</div>
          </div>
        )}
        {state.status !== 'playing' && (
          <div className="banner">{state.status === 'won' ? 'ROOM SAVED! 🌸' : 'OVERWHELMED! 🤢'}</div>
        )}
        {(paused || inputMode === 'lost') && (
          <div className="pause">
            {inputMode === 'lost' && !paused ? (
              <>
                <h2>We lost your face 👀</h2>
                <p>{face.status === 'error' ? 'The face sensor stopped.' : 'Look back at the camera to continue.'}</p>
                <p className="small">Or keep playing with the keyboard — press J / Space{level.windows ? ' / K' : ''} or use the button below.</p>
                <div className="row center">
                  <button className="btn" onClick={() => setInputMode(chooseKeyboard('lost'))}>Continue with keyboard</button>
                  <button className="btn btn-ghost" onClick={onQuit}>{mode === 'camera' ? 'Quit & turn camera off' : 'Quit to title'}</button>
                </div>
              </>
            ) : (
              <>
                <h2>Paused</h2>
                <p>Press P or Esc to continue.</p>
                <div className="row center">
                  <button className="btn" onClick={() => setPaused(null)}>Resume</button>
                  <button className="btn btn-ghost" onClick={onQuit}>{mode === 'camera' ? 'Quit & turn camera off' : 'Quit to title'}</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="controls">
        <div className={`control ${spraying ? 'active' : ''}`}>
          <span className={`control-emoji ring ${spraying ? 'ring-spray' : ''}`} style={{ ['--p' as string]: spraying ? sprayLeft(state) : freshCd }}>
            {mode === 'camera' && inputMode === 'camera' ? '😄' : '🌸'}
          </span>
          <div>
            <b>FRESHBOT spray</b>{' '}
            {spraying ? <span className="spraying">SPRAYING!</span> : freshCd > 0 ? <span className="small">reloading…</span> : <span className="ready">READY</span>}
            <div className="small">{mode === 'camera' && inputMode === 'camera' ? 'Quick smile, then relax · ' : ''}<kbd>J</kbd> / <kbd>Space</kbd></div>
          </div>
        </div>
        {level.windows && (
          <div className="control">
            <span className="control-emoji ring" style={{ ['--p' as string]: windowsCd }}>{mode === 'camera' && inputMode === 'camera' ? '😮' : '🪟'}</span>
            <div>
              <b>Open windows</b> <span className="small">(optional)</span> {windowsCd > 0 ? <span className="small">recharging…</span> : <span className="ready">READY</span>}
              <div className="small">{mode === 'camera' && inputMode === 'camera' ? 'Eyebrows up, big O mouth · ' : ''}<kbd>K</kbd></div>
            </div>
          </div>
        )}
        <div className="control-buttons">
          <AudioControls />
          <button className="btn btn-ghost btn-small" onClick={() => { setPaused('manual'); stopSpeech(); }}>⏸ Pause</button>
          {mode === 'camera' && (
            <button className="btn btn-ghost btn-small" aria-pressed={facecamVisible} onClick={toggleFacecam} title="Show or hide your face preview (F). The camera keeps running.">
              🎥 Facecam {facecamVisible ? 'on' : 'off'}
            </button>
          )}
        </div>
        {mode === 'camera' && <SelfView size="small" showSurprise={!!level.windows} />}
      </div>
    </div>
  );
}
