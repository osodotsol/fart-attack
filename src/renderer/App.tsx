import { useCallback, useEffect, useState } from 'react';
import { getLevel, nextLevel, type LevelDef } from '../game/levels';
import { SCENE_AFTER, type SceneId } from '../game/story';
import { toggleAll } from './audioPrefs';
import { Cutscene } from './Cutscene';
import { faceStore } from './faceStore';
import { Game, type PlayMode, type RoundResult } from './Game';
import { setMusicMood } from './music';
import { Consent, Finale, LevelComplete, LevelSelect, Practice, Title } from './screens';
import { initVoice, stopSpeech } from './voice';

type Screen = 'title' | 'story' | 'consent' | 'practice' | 'levels' | 'game' | 'complete' | 'finale';

export function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [mode, setMode] = useState<PlayMode>('keyboard');
  const [level, setLevel] = useState<LevelDef>(getLevel(1));
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [best, setBest] = useState(0); // memory only, never persisted
  // Story state — memory only. storyMode = playing the campaign in order; seen = scenes already shown this session.
  const [storyMode, setStoryMode] = useState(false);
  const [seen, setSeen] = useState<ReadonlySet<SceneId>>(new Set());
  const [scene, setScene] = useState<{ id: SceneId; then: () => void } | null>(null);
  const [campaign, setCampaign] = useState<Record<number, number>>({});
  /** Where to go once consent/practice is done. */
  const [afterSetup, setAfterSetup] = useState<'story' | 'levels'>('levels');

  // Voice detection once; music follows the screen; "M" mutes/unmutes everything on screens that don't handle it themselves.
  useEffect(() => initVoice({ warmUp: true }), []);
  useEffect(() => {
    setMusicMood(screen === 'game' ? 'game' : 'menu');
    // Quiet screens never keep a character talking. (Story/game manage their own speech; result screens may finish a verdict line.)
    if (screen === 'title' || screen === 'consent' || screen === 'practice' || screen === 'levels') stopSpeech();
  }, [screen]);
  useEffect(() => {
    if (screen === 'game' || screen === 'story') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && !e.repeat) toggleAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);

  /** Show a story scene once per session; otherwise go straight on. */
  const showScene = useCallback(
    (id: SceneId, then: () => void) => {
      if (seen.has(id)) return then();
      setSeen((s) => new Set(s).add(id));
      setScene({ id, then });
      setScreen('story');
    },
    [seen],
  );

  /** Leaving gameplay always releases the camera (SDK stopAsync + destroy in main). */
  const quit = useCallback(() => {
    stopSpeech();
    void faceStore.stop();
    setStoryMode(false);
    setScreen('title');
  }, []);

  const play = useCallback((l: LevelDef) => {
    setLevel(l);
    setRound((r) => r + 1);
    setScreen('game');
  }, []);

  const setupDone = useCallback(() => {
    if (afterSetup === 'story') play(getLevel(1));
    else setScreen('levels');
  }, [afterSetup, play]);

  const keyboardOnly = useCallback(() => {
    void faceStore.stop();
    setMode('keyboard');
    setupDone();
  }, [setupDone]);

  const startStory = () => {
    setStoryMode(true);
    setCampaign({});
    setAfterSetup('story');
    showScene('opening', () => setScreen('consent'));
  };

  const chooseLevel = () => {
    setStoryMode(false);
    setAfterSetup('levels');
    setScreen('consent');
  };

  const onEnd = useCallback(
    (r: RoundResult) => {
      setResult(r);
      setBest((b) => Math.max(b, r.score));
      if (storyMode && r.won) setCampaign((c) => ({ ...c, [r.levelId]: Math.max(c[r.levelId] ?? 0, r.score) }));
      setScreen('complete');
    },
    [storyMode],
  );

  switch (screen) {
    case 'title':
      return <Title onPlay={startStory} onLevels={chooseLevel} />;
    case 'story':
      return scene ? <Cutscene key={scene.id} scene={scene.id} onDone={scene.then} /> : null;
    case 'consent':
      return <Consent onCamera={() => { setMode('camera'); setScreen('practice'); }} onKeyboard={keyboardOnly} />;
    case 'practice':
      return <Practice onReady={setupDone} onKeyboard={keyboardOnly} onQuit={quit} />;
    case 'levels':
      return <LevelSelect camera={mode === 'camera'} onPick={(l) => { setStoryMode(false); play(l); }} onQuit={quit} />;
    case 'game':
      return <Game key={round} level={level} mode={mode} onEnd={onEnd} onQuit={quit} />;
    case 'complete': {
      const next = nextLevel(level.id);
      let onContinue: (() => void) | undefined;
      let continueLabel: string | undefined;
      if (storyMode) {
        const after = SCENE_AFTER[level.id];
        onContinue = next
          ? () => showScene(after, () => play(next))
          : () => showScene(after, () => setScreen('finale'));
        continueLabel = next ? 'Continue the story ▶' : 'See the ending ▶';
      } else if (next) onContinue = () => play(next);
      return (
        <LevelComplete
          result={result!}
          best={best}
          camera={mode === 'camera'}
          continueLabel={continueLabel}
          onContinue={onContinue}
          onRetry={() => play(level)}
          onLevels={() => { setStoryMode(false); setScreen('levels'); }}
          onQuit={quit}
        />
      );
    }
    case 'finale':
      return <Finale scores={campaign} camera={mode === 'camera'} onLevels={() => { setStoryMode(false); setScreen('levels'); }} onQuit={quit} />;
  }
}
