// Three independent switches. Voice is disabled (with an explanation) when no offline voice is installed.
import { setPrefs, useAudioPrefs } from './audioPrefs';

export function AudioControls({ className = '' }: { className?: string }) {
  const p = useAudioPrefs();
  const noVoice = !p.voiceAvailable;
  return (
    <div className={`audio-controls ${className}`} role="group" aria-label="Audio settings">
      <button className="btn btn-ghost btn-small" aria-pressed={p.sfx} onClick={() => setPrefs({ sfx: !p.sfx })} title="Sound effects (M mutes everything)">
        {p.sfx ? '🔊' : '🔇'} Sound
      </button>
      <button
        className="btn btn-ghost btn-small"
        aria-pressed={p.voice && !noVoice}
        disabled={noVoice}
        onClick={() => setPrefs({ voice: !p.voice })}
        title={noVoice ? 'No offline voice found on this PC — story text is shown as subtitles' : 'Spoken story and character voices'}
      >
        {p.voice && !noVoice ? '🗣' : '🤐'} Voice
      </button>
      <button className="btn btn-ghost btn-small" aria-pressed={p.music} onClick={() => setPrefs({ music: !p.music })} title="Background music">
        {p.music ? '🎵' : '🚫'} Music
      </button>
    </div>
  );
}
