// Comic-panel story player: SVG backdrop + character cue + typewriter speech bubble. Always skippable.
import { useEffect, useState } from 'react';
import { STORY, type Cue, type Panel, type SceneId, type Speaker } from '../game/story';
import { prefersReducedMotion } from './a11y';
import { play } from './audio';
import { toggleAll } from './audioPrefs';
import { AudioControls } from './AudioControls';
import { estimateSpeechMs, speak, stopSpeech, type VoiceRole } from './voice';
import { BeanKid, FreshBot, Teacher, Waiter } from './art/characters';
import { Backdrop, Cloud, FartPuff, GasDefs } from './art/scenes';

const NAMES: Record<Speaker, string> = {
  narrator: '', robot: 'FRESHBOT 3000', kid: 'BEAN KID', teacher: 'MS. PRIMWHISTLE', waiter: 'WAITER', crowd: 'EVERYONE',
};

const Confetti = () => (
  <g className="confetti">
    {Array.from({ length: 28 }, (_, i) => (
      <rect key={i} x={(i * 97) % 800} y={-20 - (i % 5) * 30} width="10" height="16" fill={['#ffd84d', '#ff6fa8', '#5cc8ff', '#8bd94a'][i % 4]} style={{ animationDelay: `${(i % 7) * 0.15}s` }} />
    ))}
  </g>
);

function CueArt({ cue }: { cue: Cue }) {
  const kid = (mood: Parameters<typeof BeanKid>[0]['mood'], x = 400, y = 440, s = 1.1, cls = '') => (
    <g transform={`translate(${x} ${y}) scale(${s})`}><g className={cls}><BeanKid mood={mood} /></g></g>
  );
  const bot = (mood: Parameters<typeof FreshBot>[0]['mood'], x = 400, y = 230, s = 1.5, cls = '') => (
    <g transform={`translate(${x} ${y}) scale(${s})`}><g className={cls}><FreshBot mood={mood} /></g></g>
  );
  switch (cue) {
    case 'peaceful': return <>{kid('happy')}<text x="640" y="120" fontSize="40">☀️</text></>;
    case 'beans': return kid('eat');
    case 'pfft': return <>{kid('smug')}<FartPuff fartKey={1} x={440} y={400} mega /><Cloud stink={55} x={400} y={300} /></>;
    case 'alarm': return <>{kid('shock')}<Cloud stink={90} x={400} y={290} /><rect className="alarm-flash" width="800" height="500" fill="#ff2d2d" /></>;
    case 'robot-arrives': return <><Cloud stink={80} x={480} y={300} />{kid('gag', 560, 450, 0.9)}{bot('alarm', 230, 220, 1.4, 'fly-in')}</>;
    case 'robot-scan': return <><path className="scan-beam" d="M400 250 L170 500 L630 500 Z" fill="#7dffcf" />{bot('scan')}</>;
    case 'robot-hope': return bot('happy', 400, 240, 1.7);
    case 'robot-cheer': return <>{bot('happy', 400, 240, 1.6, 'bounce')}<Confetti /></>;
    case 'robot-phone': return <>{bot('talk')}<text x="520" y="190" fontSize="48" className="wiggle">📱</text></>;
    case 'robot-shock': return bot('shock', 400, 240, 1.7);
    case 'kid-school': return <>{kid('happy', 300)}<text x="380" y="380" fontSize="44">🎒🌯</text></>;
    case 'teacher-warns': return <g transform="translate(400 470) scale(1.1)"><Teacher facing="class" /></g>;
    case 'teacher-busts': return <><Cloud stink={60} x={260} y={330} />{kid('shock', 250, 450, 0.9)}<g transform="translate(560 470) scale(1.1)"><Teacher facing="class" warning /></g></>;
    case 'kid-escapes': return <><Cloud stink={50} x={250} y={330} />{kid('run', 400, 450, 1, 'run-off')}</>;
    case 'kid-restaurant': return <>{kid('eat')}<text x="480" y="400" fontSize="44">🫘🫘</text></>;
    case 'waiter-special': return <>{kid('happy', 250, 450, 0.95)}<g transform="translate(520 470) scale(1.1)"><Waiter /></g></>;
    case 'city-saved': return <>{bot('happy', 300, 220, 1.3, 'bounce')}{kid('happy', 560, 450, 0.95)}<Confetti /></>;
    case 'kid-sorry': return kid('worried');
  }
}

const ROLE_OF: Record<Speaker, VoiceRole> = { narrator: 'narrator', robot: 'robot', kid: 'kid', teacher: 'teacher', waiter: 'waiter', crowd: 'narrator' };
const TICK_MS = 28;

export function Cutscene({ scene, onDone }: { scene: SceneId; onDone: () => void }) {
  const panels = STORY[scene];
  const [i, setI] = useState(0);
  const [chars, setChars] = useState(0);
  const panel: Panel = panels[i];
  const len = panel.text.length;
  const full = chars >= len;

  // Per panel: stop whatever was playing, play the panel's effect, speak it (if voiced), and reveal the subtitle.
  // The reveal is paced to the estimated speech length so the text and the voice finish together.
  // Subtitles are ALWAYS shown; reduced-motion shows them instantly.
  useEffect(() => {
    stopSpeech();
    const reduced = prefersReducedMotion();
    setChars(reduced ? len : 0);
    if (panel.sfx) play(panel.sfx);
    let perTick = 2;
    if (panel.voice) {
      // speak() decides: it holds the line if the voice list is still loading, and returns false if voice is off/unavailable
      const role = ROLE_OF[panel.speaker];
      const spoken = panel.say ?? panel.text;
      const started = speak({ id: `${scene}:${i}`, text: spoken, role, onEnd: () => setChars(len) });
      if (started) perTick = Math.max(0.5, len / (estimateSpeechMs(spoken, role) / TICK_MS));
    }
    const id = reduced ? undefined : setInterval(() => setChars((c) => c + perTick), TICK_MS);
    return () => {
      if (id) clearInterval(id);
    };
    // toggling Voice mid-panel must not restart the line, so the effect only re-runs per panel.
  }, [i, panel, scene]);

  // Leaving the scene in ANY way (skip, finish, Esc, quit) silences the voice.
  useEffect(() => () => stopSpeech(), []);

  const next = () => {
    if (!full) return setChars(len);
    play('click');
    if (i + 1 < panels.length) setI(i + 1);
    else onDone();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Space/Enter on a focused button belongs to that control, not story navigation.
      if ((e.key === ' ' || e.key === 'Enter') && (e.target as HTMLElement | null)?.closest?.('button')) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        next();
      } else if (e.key === 'Escape') onDone();
      else if (e.key.toLowerCase() === 'm') toggleAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="cutscene" onClick={next}>
      <svg key={i} className="cut-art" viewBox="0 0 800 500" aria-hidden="true">
        <GasDefs />
        <Backdrop kind={panel.backdrop} />
        <CueArt cue={panel.cue} />
      </svg>
      <div className={`bubble bubble-${panel.speaker}`}>
        {NAMES[panel.speaker] && <div className="bubble-name">{NAMES[panel.speaker]}</div>}
        <div className="bubble-text">{panel.text.slice(0, Math.floor(chars))}</div>
        <div className="bubble-next">{full ? (i + 1 < panels.length ? 'Click / Space ▶' : 'Click / Space to start ▶') : ''}</div>
      </div>
      <div className="cut-progress">{panels.map((_, k) => <span key={k} className={k <= i ? 'on' : ''} />)}</div>
      <div className="cut-top" onClick={(e) => e.stopPropagation()}>
        <AudioControls />
        <button className="btn btn-ghost btn-small" onClick={() => onDone()}>Skip story ⏭</button>
      </div>
    </div>
  );
}
