import { useEffect, useRef, useState } from 'react';
import { faceStore, useFace, errorText } from './faceStore';
import { SelfView } from './SelfView';
import type { RoundResult } from './Game';
import { getLevel, LEVELS, rankTitle, type LevelDef } from '../game/levels';
import { QUIPS } from '../game/story';
import { BeanKid, FreshBot } from './art/characters';
import { AudioControls } from './AudioControls';

export function Title({ onPlay, onLevels }: { onPlay: () => void; onLevels: () => void }) {
  return (
    <div className="screen title-screen">
      <svg className="title-art" viewBox="0 0 600 220" aria-hidden="true">
        <g transform="translate(170 215) scale(0.95)"><BeanKid mood="smug" /></g>
        <g transform="translate(420 110) scale(1.05)"><FreshBot mood="happy" /></g>
      </svg>
      <div className="logo">💨 FART ATTACK! 💨</div>
      <p className="tagline">The Great Stink Disaster — your face is the controller.</p>
      <div className="row center">
        <button className="btn btn-big" onClick={onPlay} autoFocus>▶ Play the story</button>
        <button className="btn btn-ghost" onClick={onLevels}>Choose a level</button>
      </div>
      <AudioControls />
      <p className="small muted">Uses your webcam with the Presage SmartSpectra SDK · keyboard play available</p>
    </div>
  );
}

export function Consent({ onCamera, onKeyboard }: { onCamera: () => void; onKeyboard: () => void }) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  useEffect(() => {
    void faceStore.hasKey().then(setHasKey);
  }, []);
  return (
    <div className="screen consent">
      <h1>Before we turn on your camera</h1>
      <ul className="disclosure">
        <li><b>What it's for:</b> the game reads two facial expressions — a <b>smile</b> and a <b>surprised face</b> — to control the cleaning gadgets.</li>
        <li><b>How:</b> your camera is processed by the Presage SmartSpectra SDK on this computer. It reports expression <i>estimates</i> — they describe facial movement, not how you actually feel.</li>
        <li><b>Nothing is saved:</b> no video, photos or face data are stored or sent anywhere by this game. Readings exist only while you play.</li>
        <li><b>Network:</b> the SDK contacts Presage's servers to check the developer API key and download its models. SDK telemetry is turned <b>off</b>.</li>
        <li><b>You're in control:</b> choose "Quit camera" at any time — the camera turns off. You can also play with the keyboard only.</li>
      </ul>
      {hasKey === false && (
        <div className="notice">No SmartSpectra API key is set up on this computer, so the camera can't be used. See the README to add one — or play with the keyboard.</div>
      )}
      <div className="row">
        <button className="btn btn-big" onClick={onCamera} disabled={!hasKey} autoFocus={!!hasKey}>Turn on camera & continue</button>
        <button className="btn btn-ghost" onClick={onKeyboard}>Play with keyboard only</button>
      </div>
    </div>
  );
}

export function Practice({ onReady, onKeyboard, onQuit }: { onReady: () => void; onKeyboard: () => void; onQuit: () => void }) {
  const face = useFace();
  const [retrying, setRetrying] = useState(false);
  const retryBusy = useRef(false);
  const mounted = useRef(false);
  const attempt = useRef(0);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [done, setDone] = useState({ freshener: false, windows: false });

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    const id = ++attempt.current;
    void faceStore.start().then((r) => {
      if (!cancelled && id === attempt.current && !r.ok) setStartErr(errorText(r));
    });
    const off = faceStore.onGesture((g) => setDone((d) => ({ ...d, [g]: true })));
    return () => {
      cancelled = true;
      mounted.current = false;
      attempt.current++;
      off();
    };
  }, []);

  const retry = () => {
    if (retryBusy.current) return;
    retryBusy.current = true;
    const id = ++attempt.current;
    setRetrying(true);
    setStartErr(null);
    void faceStore.restart().then((r) => {
      if (mounted.current && id === attempt.current && !r.ok) setStartErr(errorText(r));
    }).finally(() => {
      retryBusy.current = false;
      if (mounted.current) setRetrying(false);
    });
  };

  const err = startErr ?? (face.error ? errorText(face.error) : null);

  return (
    <div className="screen practice">
      <h1>Practise your moves</h1>
      <div className="practice-body">
        <SelfView size="large" />
        <div className="tasks">
          <div className={`task ${done.freshener ? 'done' : ''}`}>
            <span className="task-emoji">😄</span>
            <div><b>Big smile</b> — fill the bar past the line, then relax.<div className="small">Sprays the air freshener</div></div>
            <span className="tick">{done.freshener ? '✅' : ''}</span>
          </div>
          <div className={`task ${done.windows ? 'done' : ''}`}>
            <span className="task-emoji">😮</span>
            <div><b>Surprise!</b> — eyebrows way up, mouth in a big "O". Hold it.<div className="small">Blasts the windows open in later levels (optional — K works too)</div></div>
            <span className="tick">{done.windows ? '✅' : ''}</span>
          </div>
          <p className="small muted">Tip: good light on your face and an arm's length from the screen work best. Readings are estimates and vary between people — the keyboard always works too (J and K).</p>
          {err && (
            <div className="notice error">
              {err}
              <div className="row">
                <button className="btn" onClick={retry} disabled={retrying}>{retrying ? 'Retrying…' : 'Retry'}</button>
              </div>
            </div>
          )}
          <div className="row">
            <button className="btn btn-big" onClick={onReady} disabled={!face.hasSamples} autoFocus>{done.freshener ? "Let's go! ▶" : 'Skip practice ▶'}</button>
            <button className="btn btn-ghost" onClick={onKeyboard}>Play with keyboard</button>
            <button className="btn btn-ghost" onClick={onQuit}>Quit camera</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LevelSelect({ camera, onPick, onQuit }: { camera: boolean; onPick: (l: LevelDef) => void; onQuit: () => void }) {
  return (
    <div className="screen levels">
      <h1>Choose a level</h1>
      <div className="level-cards">
        {LEVELS.map((l) => (
          <button key={l.id} className={`level-card theme-${l.theme}`} disabled={!l.available} onClick={() => onPick(l)} autoFocus={l.id === 1}>
            <div className="level-num">LEVEL {l.id}</div>
            <div className="level-name">{l.name}</div>
            <div className="level-tag">{l.tagline}</div>
            <div className="level-uses">{l.windows ? "😄 smile · 😮 surprise (optional)" : l.teacher ? "😄 smile · ⏱️ timing" : "😄 smile"}</div>
            {!l.available && <div className="level-soon">Coming soon</div>}
          </button>
        ))}
      </div>
      <div className="row center">
        <button className="btn btn-ghost" onClick={onQuit}>{camera ? "Quit & turn camera off" : "Back to title"}</button>
      </div>
    </div>
  );
}

const pickQuip = (k: 'win' | 'lose') => QUIPS[k][Math.floor(Math.random() * QUIPS[k].length)];

export function LevelComplete({ result, best, continueLabel, onContinue, onRetry, onLevels, onQuit, camera }: {
  result: RoundResult; best: number; continueLabel?: string; onContinue?: () => void; onRetry: () => void; onLevels: () => void; onQuit: () => void; camera: boolean;
}) {
  const level = getLevel(result.levelId);
  const [quip] = useState(() => pickQuip(result.won ? 'win' : 'lose'));
  return (
    <div className="screen result">
      <div className="small muted">LEVEL {level.id} · {level.name}</div>
      <div className="result-head">
        <svg viewBox="-110 -110 220 180" className="result-bot" aria-hidden="true"><g className={result.won ? 'bounce' : ''}><FreshBot mood={result.won ? 'happy' : 'sad'} /></g></svg>
        <div className="bubble-mini">{quip}</div>
      </div>
      <div className="logo small-logo">{result.won ? '🌸 LEVEL COMPLETE! 🌸' : '🤢 OVERWHELMED! 🤢'}</div>
      <div className="score-big">{result.score}</div>
      <div className="breakdown small">
        {result.won && result.winBonus > 0 && <span>fresh-air bonus +{result.winBonus}</span>}
        {result.customerBonus > 0 && <span>customers stayed ({result.customersLeft}) +{result.customerBonus}</span>}
        {result.caught > 0 && <span className="bad">caught by teacher ×{result.caught}</span>}
      </div>
      <p>{result.score >= best && result.score > 0 ? '🏆 New best this session!' : `Best this session: ${best}`}</p>
      <p className="small muted">
        {`${result.farts} fart${result.farts === 1 ? '' : 's'}`}{result.megaFarts ? ` (${result.megaFarts} MEGA)` : ''} · {`${result.actions.freshener} spray${result.actions.freshener === 1 ? '' : 's'}`}{result.actions.windows ? ` · ${result.actions.windows} window blast${result.actions.windows === 1 ? '' : 's'}` : ''}
        {camera && ` · ${result.faceActions} triggered by your face`}
      </p>
      <div className="row center">
        {result.won && onContinue && <button className="btn btn-big" onClick={onContinue} autoFocus>{continueLabel ?? 'Continue ▶'}</button>}
        <button className={result.won && onContinue ? 'btn btn-ghost' : 'btn btn-big'} onClick={onRetry} autoFocus={!(result.won && onContinue)}>
          {result.won ? 'Play again' : 'Try again'}
        </button>
        <button className="btn btn-ghost" onClick={onLevels}>Levels</button>
        <button className="btn btn-ghost" onClick={onQuit}>{camera ? 'Quit & turn camera off' : 'Back to title'}</button>
      </div>
    </div>
  );
}

export function Finale({ scores, onLevels, onQuit, camera }: { scores: Record<number, number>; onLevels: () => void; onQuit: () => void; camera: boolean }) {
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  return (
    <div className="screen result finale">
      <svg className="title-art" viewBox="0 0 600 220" aria-hidden="true">
        <g transform="translate(170 215) scale(0.95)"><BeanKid mood="happy" /></g>
        <g transform="translate(420 110) scale(1.05)"><g className="bounce"><FreshBot mood="happy" /></g></g>
      </svg>
      <div className="logo small-logo">🏙️ YOU SAVED THE CITY! 🏙️</div>
      <div className="score-big">{total}</div>
      <div className="rank-label">Your official title:</div>
      <div className="rank">{rankTitle(total)}</div>
      <div className="breakdown small">
        {LEVELS.map((l) => <span key={l.id}>L{l.id} {l.name}: {scores[l.id] ?? 0}</span>)}
      </div>
      <div className="row center">
        <button className="btn btn-big" onClick={onLevels} autoFocus>Replay a level</button>
        <button className="btn btn-ghost" onClick={onQuit}>{camera ? 'Quit & turn camera off' : 'Back to title'}</button>
      </div>
    </div>
  );
}
