// Pure, deterministic game engine (rules in docs/PRD.md). No DOM, no SDK, no wall clock.
// Freshener = timed activation (short smile → sprays for durationMs, then reloads). Windows = instant burst.
import { LEVELS, type LevelDef } from './levels';

export type Action = 'freshener' | 'windows';
export type GameStatus = 'playing' | 'won' | 'lost';

export interface GameRules {
  comboWindowMs: number;
  comboStep: number;
  comboMax: number;
  winBonusPerStink: number;
}

export const DEFAULT_RULES: GameRules = { comboWindowMs: 2_500, comboStep: 0.5, comboMax: 3, winBonusPerStink: 10 };

export type TeacherPhase = 'away' | 'warning' | 'watching';

export interface GameEvent {
  kind: 'fart' | Action | 'rejected' | 'caught' | 'teacher' | 'customer-left' | 'won' | 'lost';
  t: number;
  points?: number;
  action?: Action;
  /** fart: which desk/table it came from (0-based). */
  source?: number;
  mega?: boolean;
  /** teacher: new phase. */
  phase?: TeacherPhase;
}

export interface GameState {
  level: LevelDef;
  rules: GameRules;
  t: number;
  stink: number;
  score: number;
  winBonus: number;
  combo: number;
  /** Time the previous action's effect ended (combo reference). */
  lastEffectEndT: number;
  nextFartT: number;
  readyAt: Record<Action, number>;
  /** Freshener spraying until this time. */
  sprayUntil: number;
  status: GameStatus;
  farts: number;
  megaFarts: number;
  /** Classroom only. */
  teacher: { phase: TeacherPhase; phaseEndT: number } | null;
  caught: number;
  /** Restaurant only (null elsewhere). */
  customers: number | null;
  customerBonus: number;
  nextLeaveT: number;
  actions: Record<Action, number>;
  /** Events since the previous tick/act call — consumed by the UI for animations/sounds. */
  events: GameEvent[];
  rng: number;
}

// mulberry32 — small seeded PRNG so tests are deterministic.
function nextRandom(state: number): [number, number] {
  const t = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

function rand(s: GameState): number {
  const [r, rng] = nextRandom(s.rng);
  s.rng = rng;
  return r;
}

const between = (s: GameState, min: number, max: number) => min + rand(s) * (max - min);

function scheduleFart(s: GameState): void {
  s.nextFartT = s.t + between(s, s.level.fart.minMs, s.level.fart.maxMs);
}

/** Advance the teacher's away → warning → watching cycle. */
function stepTeacher(s: GameState): void {
  const cfg = s.level.teacher;
  if (!cfg || !s.teacher || s.t < s.teacher.phaseEndT) return;
  const next: Record<TeacherPhase, TeacherPhase> = { away: 'warning', warning: 'watching', watching: 'away' };
  const phase = next[s.teacher.phase];
  const dur =
    phase === 'warning' ? cfg.warnMs : phase === 'watching' ? between(s, cfg.watchMinMs, cfg.watchMaxMs) : between(s, cfg.awayMinMs, cfg.awayMaxMs);
  s.teacher = { phase, phaseEndT: s.t + dur };
  s.events.push({ kind: 'teacher', t: s.t, phase });
}

export const teacherWatching = (s: GameState) => s.teacher?.phase === 'watching';

export function createGame(level: LevelDef = LEVELS[0], seed = Date.now() >>> 0, rules: GameRules = DEFAULT_RULES): GameState {
  return {
    level, rules, t: 0, stink: level.startStink, score: 0, winBonus: 0, combo: 1, lastEffectEndT: -Infinity,
    nextFartT: level.firstFartMs, readyAt: { freshener: 0, windows: 0 }, sprayUntil: 0, status: 'playing', farts: 0, megaFarts: 0,
    teacher: level.teacher ? { phase: 'away', phaseEndT: level.teacher.firstTurnMs } : null, caught: 0,
    customers: level.customers ? level.customers.start : null, customerBonus: 0, nextLeaveT: 0,
    actions: { freshener: 0, windows: 0 }, events: [], rng: seed >>> 0,
  };
}

const clamp = (v: number) => Math.min(100, Math.max(0, v));
const copy = (s: GameState, keepEvents: boolean): GameState => ({
  ...s, readyAt: { ...s.readyAt }, actions: { ...s.actions }, teacher: s.teacher && { ...s.teacher }, events: keepEvents ? [...s.events] : [],
});

export const isSpraying = (s: GameState) => s.t < s.sprayUntil;

/** Advance time by dtMs (capped at 1 s per call). Returns a new state object (input is not mutated). */
export function tick(prev: GameState, dtMs: number): GameState {
  const s = copy(prev, false);
  if (s.status !== 'playing' || dtMs <= 0) return s;
  const L = s.level;
  // Integrate in ≤100 ms steps so a long frame can't skip a fart or the loss check.
  let remaining = Math.min(dtMs, 1_000);
  while (remaining > 0 && s.status === 'playing') {
    const step = Math.min(remaining, 100);
    remaining -= step;
    const progress = Math.min(1, s.t / L.roundMs);
    const rate = L.growth.start + (L.growth.end - L.growth.start) * progress;
    const sprayMs = Math.max(0, Math.min(step, s.sprayUntil - s.t));
    s.t += step;
    s.stink = clamp(s.stink + (rate * step) / 1000 - (L.freshener.drainPerSec * sprayMs) / 1000);
    stepTeacher(s);
    if (s.t >= s.nextFartT) {
      s.farts++;
      const mega = !!L.mega && s.farts % L.mega.every === 0;
      if (mega) s.megaFarts++;
      s.stink = clamp(s.stink + (mega ? L.mega!.stink : L.fart.stink));
      const source = L.fartSources > 1 ? Math.floor(rand(s) * L.fartSources) : 0;
      s.events.push({ kind: 'fart', t: s.t, source, mega });
      scheduleFart(s);
    }
    if (L.customers && s.customers! > 0) {
      if (s.stink >= L.customers.leaveAtStink) {
        if (s.nextLeaveT === 0) s.nextLeaveT = s.t + L.customers.leaveEveryMs;
        else if (s.t >= s.nextLeaveT) {
          s.customers!--;
          s.nextLeaveT = s.t + L.customers.leaveEveryMs;
          s.events.push({ kind: 'customer-left', t: s.t });
        }
      } else s.nextLeaveT = 0;
    }
    if (s.stink >= 100) {
      s.status = 'lost';
      s.sprayUntil = 0;
      s.events.push({ kind: 'lost', t: s.t });
    } else if (s.t >= L.roundMs) {
      s.winBonus = Math.round((100 - s.stink) * s.rules.winBonusPerStink);
      s.customerBonus = L.customers ? s.customers! * L.customers.pointsPerCustomer : 0;
      s.score += s.winBonus + s.customerBonus;
      s.status = 'won';
      s.sprayUntil = 0;
      s.events.push({ kind: 'won', t: s.t, points: s.winBonus });
    }
  }
  return s;
}

/** Try to perform an action now. Rejected while spraying/reloading, if unavailable in this level, or after the round. */
export function act(prev: GameState, action: Action): { state: GameState; accepted: boolean } {
  const tool = action === 'freshener' ? prev.level.freshener : prev.level.windows;
  if (prev.status !== 'playing' || !tool || prev.t < prev.readyAt[action]) {
    if (prev.status === 'playing' && tool) {
      const s = copy(prev, true);
      s.events.push({ kind: 'rejected', t: s.t, action });
      return { state: s, accepted: false };
    }
    return { state: prev, accepted: false };
  }
  const s = copy(prev, true);
  // Classroom: a NEW freshener activation while the teacher watches is caught — spray confiscated (it still
  // reloads), points lost, extra stink. Sprays already running when the teacher turns are not penalised.
  if (action === 'freshener' && teacherWatching(s)) {
    const cfg = s.level.teacher!;
    s.score = Math.max(0, s.score - cfg.penaltyPoints);
    s.stink = clamp(s.stink + cfg.penaltyStink);
    s.readyAt.freshener = s.t + s.level.freshener.cooldownMs;
    s.combo = 1;
    s.lastEffectEndT = -Infinity;
    s.caught++;
    s.events.push({ kind: 'caught', t: s.t, points: -cfg.penaltyPoints, action });
    return { state: s, accepted: false };
  }
  s.combo = s.t - s.lastEffectEndT <= s.rules.comboWindowMs ? Math.min(s.rules.comboMax, s.combo + s.rules.comboStep) : 1;
  const points = Math.round(tool.points * s.combo);
  s.score += points;
  if (action === 'freshener') {
    const f = s.level.freshener;
    s.sprayUntil = s.t + f.durationMs;
    s.readyAt.freshener = s.sprayUntil + f.cooldownMs;
    s.lastEffectEndT = s.sprayUntil;
  } else {
    const w = s.level.windows!;
    s.stink = clamp(s.stink - w.stink);
    s.readyAt.windows = s.t + w.cooldownMs;
    s.lastEffectEndT = s.t;
  }
  s.actions[action]++;
  s.events.push({ kind: action, t: s.t, points });
  return { state: s, accepted: true };
}

/** 0..1 of the reload remaining (after any spray time), for UI rings. 0 = ready. */
export function cooldownLeft(s: GameState, action: Action): number {
  const left = s.readyAt[action] - s.t;
  if (left <= 0) return 0;
  const total = action === 'freshener' ? s.level.freshener.durationMs + s.level.freshener.cooldownMs : (s.level.windows?.cooldownMs ?? 1);
  return Math.min(1, left / total);
}

/** 0..1 spray time remaining, for UI. */
export function sprayLeft(s: GameState): number {
  return isSpraying(s) ? (s.sprayUntil - s.t) / s.level.freshener.durationMs : 0;
}
