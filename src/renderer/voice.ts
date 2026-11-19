// Spoken storytelling using the built-in speech engine (Web Speech API → Windows voices). No paid APIs, no downloads.
// Privacy/offline: ONLY voices flagged localService are used. Online "Natural" voices (which send text to a server) are skipped.
// One speaker at a time: a new line cancels the previous one, the same line never starts twice while it is playing,
// and stopSpeech() (skip / quit / level change / mute) silences everything immediately.
// If no local English voice exists, voiceAvailable stays false and the game simply shows subtitles.
import { playBotTalk } from './audio';
import { getPrefs, setPrefs, subscribePrefs } from './audioPrefs';
import { setMusicDuck } from './music';

export type VoiceRole = 'narrator' | 'robot' | 'kid' | 'teacher' | 'waiter';

interface RoleStyle {
  pitch: number;
  rate: number;
  /** Preferred voice-name patterns, best first. */
  prefer: RegExp[];
}

const MALE = /david|mark|george|guy|ryan|james|richard|alan|male/i;
const FEMALE = /zira|hazel|susan|aria|jenny|catherine|linda|heera|sonia|female/i;

export const ROLE_STYLE: Record<VoiceRole, RoleStyle> = {
  narrator: { pitch: 0.85, rate: 0.95, prefer: [MALE] },
  robot: { pitch: 2.0, rate: 1.2, prefer: [FEMALE] }, // squeaky + fast = chirpy robot
  kid: { pitch: 1.7, rate: 1.1, prefer: [FEMALE] },
  teacher: { pitch: 0.9, rate: 0.95, prefer: [FEMALE] },
  waiter: { pitch: 1.05, rate: 1.0, prefer: [MALE] },
};

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
}

/** Offline English voices only. */
export const localEnglishVoices = <T extends VoiceLike>(voices: readonly T[]): T[] => voices.filter((v) => v.localService && /^en/i.test(v.lang));

export function pickVoice<T extends VoiceLike>(voices: readonly T[], role: VoiceRole): T | undefined {
  const local = localEnglishVoices(voices);
  if (local.length === 0) return undefined;
  for (const re of ROLE_STYLE[role].prefer) {
    const hit = local.find((v) => re.test(v.name));
    if (hit) return hit;
  }
  return local[0];
}

/** Strip things a speech engine would read out loud ("asterisk beep beep", emoji…). */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/[\p{Extended_Pictographic}️]/gu, '')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Rough speaking time, used to pace the subtitle reveal so text and voice finish together. */
export function estimateSpeechMs(text: string, role: VoiceRole): number {
  return Math.max(900, (cleanForSpeech(text).length * 68) / ROLE_STYLE[role].rate);
}

interface Current {
  id: string;
  done: boolean;
  /** The engine has reported that this line actually began. */
  started: boolean;
  retried: boolean;
  /** The utterance currently in flight for this line (kept referenced: Chromium can drop events for GC'd utterances). */
  u?: SpeechSynthesisUtterance;
  watchdog?: ReturnType<typeof setTimeout>;
}

/** If the engine reports nothing for this long after speak(), the utterance was probably dropped: retry once. */
export const START_WATCHDOG_MS = 2500;
/** At start-up the voice list loads asynchronously; a request made before then is kept this long. */
export const PENDING_MAX_MS = 4000;
const VOICE_LIST_SETTLE_MS = 1500;

let current: Current | null = null;
let inited = false;
/** True once we know the final answer about voices (voices arrived, or the settle timer ran out). */
let settled = false;
/** The newest line requested while the voice list was still loading. */
let pending: { opts: SpeakOptions; at: number } | null = null;
let warmUpWanted = false;
let warmedUp = false;

const engine = (): SpeechSynthesis | null => {
  try {
    return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined' ? speechSynthesis : null;
  } catch {
    return null;
  }
};

function refreshAvailability(final = false): void {
  const s = engine();
  const ok = !!s && localEnglishVoices(s.getVoices()).length > 0;
  if (ok || final) settled = true;
  setPrefs({ voiceAvailable: ok });
  if (ok) {
    if (!pending) warmUp(); // a real line is already waiting? then it IS the warm-up
    flushPending();
  }
  // Availability can settle before a slow voice list arrives. Keep an existing first-line request
  // for its full pending window; new requests after settling still use subtitle-only mode.
  else if (settled && pending && Date.now() - pending.at > PENDING_MAX_MS) pending = null;
}

/**
 * The first utterance of a process is slow to start (measured ~700–1100 ms vs ~130 ms afterwards: the engine initialises on first use),
 * and the first story line is always that utterance. Speak one near-silent syllable on the title screen so the engine is ready by then.
 * Cancelled instantly if a real line is requested meanwhile.
 */
function warmUp(): void {
  const s = engine();
  if (!s || !warmUpWanted || warmedUp || !getPrefs().voice) return;
  const voice = pickVoice(s.getVoices(), 'narrator');
  if (!voice) return;
  warmedUp = true;
  try {
    const u = new SpeechSynthesisUtterance('a');
    u.voice = voice as SpeechSynthesisVoice;
    u.lang = voice.lang;
    u.volume = 0.01; // inaudible
    u.rate = 2;
    s.speak(u);
  } catch {
    /* warm-up is best-effort */
  }
}

/** A line was requested before voices were ready (first story panel on a fresh launch): speak it now, if it is still fresh. */
function flushPending(): void {
  const p = pending;
  pending = null;
  if (p && Date.now() - p.at <= PENDING_MAX_MS) speak(p.opts);
}

/** Call once at start-up. Detects offline voices (they load asynchronously) and reacts to the Voice switch. */
export function initVoice(opts: { warmUp?: boolean } = {}): void {
  if (inited) return;
  inited = true;
  warmUpWanted = !!opts.warmUp;
  const s = engine();
  if (s) {
    s.addEventListener?.('voiceschanged', () => refreshAvailability());
    setTimeout(() => refreshAvailability(true), VOICE_LIST_SETTLE_MS);
  }
  refreshAvailability(!s);
  subscribePrefs(() => {
    if (!getPrefs().voice) stopSpeech();
  });
}

export function isSpeaking(): boolean {
  return !!current && !current.done;
}

/** Silence everything now. Safe to call at any time (skip, quit, restart, level change, mute). */
export function stopSpeech(): void {
  pending = null; // a line still waiting for voices must not start after a skip/quit
  if (current) {
    current.done = true; // so the cancel event of the old line can't fire its callbacks
    if (current.watchdog) clearTimeout(current.watchdog);
  }
  current = null;
  setMusicDuck(false);
  try {
    engine()?.cancel();
  } catch {
    /* ignore */
  }
}

export interface SpeakOptions {
  /** Stable id for the line. The same id is never started twice while it is still playing. */
  id: string;
  text: string;
  role: VoiceRole;
  /** Called when the line finishes or fails (not when it is cancelled by a newer line / stopSpeech). */
  onEnd?: () => void;
}

/** Create + queue one utterance for `cur`. Handlers ignore events from any utterance that is no longer the live one. */
function begin(s: SpeechSynthesis, cur: Current, o: SpeakOptions, text: string, voice: VoiceLike): boolean {
  const style = ROLE_STYLE[o.role];
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice as SpeechSynthesisVoice;
  u.lang = voice.lang;
  u.pitch = style.pitch;
  u.rate = style.rate;
  const live = () => !cur.done && cur.u === u;
  const finish = () => {
    if (!live()) return;
    cur.done = true;
    if (cur.watchdog) clearTimeout(cur.watchdog);
    if (current === cur) {
      current = null;
      setMusicDuck(false);
    }
    o.onEnd?.();
  };
  u.onstart = () => {
    if (!live()) return;
    cur.started = true;
    setMusicDuck(true);
  };
  u.onend = finish;
  u.onerror = finish;
  cur.u = u;
  try {
    s.speak(u);
  } catch {
    finish();
    return false;
  }
  return true;
}

/**
 * Speak one line. Returns false (and does nothing) when voice is off or there is no offline voice — callers keep showing
 * subtitles. If the voice list is still loading (start-up), the request is held and spoken as soon as voices arrive.
 */
export function speak(o: SpeakOptions): boolean {
  const s = engine();
  const prefs = getPrefs();
  if (!s || !prefs.voice) return false;
  if (!prefs.voiceAvailable) {
    if (settled) return false;
    stopSpeech(); // one speaker at a time: this newest request replaces any older waiting one
    pending = { opts: o, at: Date.now() };
    return true;
  }
  if (current && !current.done && current.id === o.id) return true; // already playing: never repeat
  const text = cleanForSpeech(o.text);
  const voice = pickVoice(s.getVoices(), o.role);
  if (!text || !voice) return false;

  stopSpeech(); // one speaker at a time
  const cur: Current = { id: o.id, done: false, started: false, retried: false };
  current = cur;
  if (o.role === 'robot') playBotTalk(text);
  if (!begin(s, cur, o, text, voice)) return false;
  // Watchdog: a first utterance can be silently dropped (cold engine / audio device waking up). If nothing was reported, retry once.
  cur.watchdog = setTimeout(() => {
    if (cur.done || cur.started || cur.retried || current !== cur) return;
    cur.retried = true;
    cur.u = undefined; // invalidate BEFORE cancel(): an engine may dispatch interruption synchronously
    try {
      s.cancel(); // the dropped utterance's own cancel event is ignored (it is no longer the live utterance)
    } catch {
      /* ignore */
    }
    begin(s, cur, o, text, voice);
  }, START_WATCHDOG_MS);
  return true;
}

/** Test helper: forget all module state (voice list settled flag, pending request, current line). */
export function resetVoiceForTests(opts: { settled?: boolean } = {}): void {
  if (current?.watchdog) clearTimeout(current.watchdog);
  current = null;
  pending = null;
  inited = false;
  warmUpWanted = false;
  warmedUp = false;
  settled = !!opts.settled;
}
