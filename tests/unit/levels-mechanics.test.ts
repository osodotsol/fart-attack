// Level-specific mechanics (Classroom teacher, Restaurant mega farts + customers) and balance simulations.
// All input here is SIMULATED keyboard-equivalent play — no SDK data.
import { describe, expect, it } from 'vitest';
import { act, createGame, isSpraying, teacherWatching, tick, type GameState } from '../../src/game/engine';
import { getLevel, LEVELS, rankTitle } from '../../src/game/levels';

const L2 = getLevel(2);
const L3 = getLevel(3);
const runUntil = (s: GameState, pred: (s: GameState) => boolean, step = 16, maxMs = 120_000) => {
  for (let t = 0; t < maxMs && !pred(s) && s.status === 'playing'; t += step) s = tick(s, step);
  return s;
};

describe('Classroom: DON\'T LAUGH! teacher', () => {
  it('cycles away → warning → watching → away with a warning of warnMs', () => {
    let s = createGame(L2, 5);
    const phases: string[] = [];
    let warnStart = 0;
    let warnLen = 0;
    for (let t = 0; t < 40_000; t += 16) {
      s = tick(s, 16);
      for (const e of s.events)
        if (e.kind === 'teacher') {
          phases.push(e.phase!);
          if (e.phase === 'warning') warnStart = e.t;
          if (e.phase === 'watching' && !warnLen) warnLen = e.t - warnStart;
        }
    }
    expect(phases.slice(0, 6)).toEqual(['warning', 'watching', 'away', 'warning', 'watching', 'away']);
    expect(warnLen).toBeGreaterThanOrEqual(L2.teacher!.warnMs);
    expect(warnLen).toBeLessThan(L2.teacher!.warnMs + 120);
  });

  it('a NEW activation while watching is caught: no spray, points + stink penalty, reload applies', () => {
    let s = runUntil(createGame(L2, 5), teacherWatching);
    s = { ...s, score: 500 };
    const before = s.stink;
    const r = act(s, 'freshener');
    expect(r.accepted).toBe(false);
    expect(isSpraying(r.state)).toBe(false);
    expect(r.state.caught).toBe(1);
    expect(r.state.score).toBe(500 - L2.teacher!.penaltyPoints);
    expect(r.state.stink).toBeCloseTo(before + L2.teacher!.penaltyStink, 6);
    expect(r.state.events.at(-1)?.kind).toBe('caught');
    // spamming during the reload is a plain rejection, not repeated catches
    expect(act(r.state, 'freshener').state.caught).toBe(1);
  });

  it('a spray started before the teacher turns is NOT penalised while it continues', () => {
    // activate during the warning, then let the teacher turn round
    let s = runUntil(createGame(L2, 5), (x) => x.teacher?.phase === 'warning');
    s = act(s, 'freshener').state;
    expect(isSpraying(s)).toBe(true);
    s = runUntil(s, teacherWatching);
    expect(isSpraying(s)).toBe(true);
    expect(s.caught).toBe(0);
  });

  it('activations while the teacher is away/warning are normal', () => {
    const s = createGame(L2, 5);
    expect(s.teacher?.phase).toBe('away');
    expect(act(s, 'freshener').accepted).toBe(true);
  });

  it('levels without a teacher never catch anyone', () => {
    expect(createGame(getLevel(1), 1).teacher).toBeNull();
  });
});

describe('Restaurant: mega farts + customers', () => {
  it('every 3rd fart is MEGA and adds more stink', () => {
    let s = createGame(L3, 2);
    const megas: boolean[] = [];
    for (let t = 0; t < 60_000 && s.status === 'playing'; t += 16) {
      s = tick(s, 16);
      for (const e of s.events) if (e.kind === 'fart') megas.push(!!e.mega);
      s = { ...s, stink: 10 }; // keep alive to observe the sequence
    }
    expect(megas.slice(0, 6)).toEqual([false, false, true, false, false, true]);
  });

  it('customers leave only while stink stays at/above the threshold, one per interval', () => {
    let s = { ...createGame(L3, 2), stink: 70 };
    const cfg = L3.customers!;
    s = tick(s, 100); // starts the leave timer
    for (let t = 0; t < cfg.leaveEveryMs * 2 + 50; t += 50) s = { ...tick(s, 50), stink: 70 };
    expect(s.customers).toBe(cfg.start - 2);
    for (let t = 0; t < 10_000; t += 50) s = { ...tick(s, 50), stink: 20 };
    expect(s.customers).toBe(cfg.start - 2);
  });

  it('winning adds a bonus per remaining customer', () => {
    const { s } = playSmart(L3, 4, false);
    expect(s.status).toBe('won');
    expect(s.customerBonus).toBe(s.customers! * L3.customers!.pointsPerCustomer);
  });
});

/** Simulated player. Smiles (freshener) when ready & stink > 20, respecting the teacher; optional windows. */
function playSmart(level = L2, seed = 1, useWindows = true, reactAt = 20) {
  let s = createGame(level, seed);
  while (s.status === 'playing') {
    s = tick(s, 50);
    if (s.stink > reactAt && !teacherWatching(s)) s = act(s, 'freshener').state;
    if (useWindows && level.windows && s.stink > reactAt) s = act(s, 'windows').state;
  }
  return { s };
}

describe('balance (simulated play, 5 seeds each)', () => {
  const seeds = [1, 2, 3, 7, 99];

  it('every level is winnable with SMILES ONLY (no surprise/windows)', () => {
    for (const lvl of LEVELS)
      for (const seed of seeds) expect(playSmart(lvl, seed, false).s.status, `${lvl.name} seed ${seed}`).toBe('won');
  });

  it('Classroom: a player who ignores the teacher gets caught', () => {
    let caught = 0;
    for (const seed of seeds) {
      let s = createGame(L2, seed);
      while (s.status === 'playing') {
        s = tick(s, 50);
        if (s.stink > 20) s = act(s, 'freshener').state;
      }
      caught += s.caught;
    }
    expect(caught).toBeGreaterThan(0);
  });

  it('Restaurant: for a relaxed player (reacts at stink > 45), surprise/windows keeps more customers and scores more', () => {
    let withW = 0, without = 0, custW = 0, custNo = 0;
    for (const seed of seeds) {
      const a = playSmart(L3, seed, true, 45).s;
      const b = playSmart(L3, seed, false, 45).s;
      withW += a.score; without += b.score; custW += a.customers!; custNo += b.customers!;
    }
    expect(withW).toBeGreaterThan(without);
    expect(custW).toBeGreaterThanOrEqual(custNo);
  });
});

it('bounded acceptance: Classroom and smile-only Restaurant survive varied seeds and keyboard polling cadence', () => {
  // Synthetic keyboard bot: 64 seeds x 3 frame sizes x 2 levels = 384 complete rounds.
  // Read the teacher from the previous frame, matching a UI bot's observation/action delay.
  for (const level of [L2, L3]) for (let seed = 0; seed < 64; seed++) for (const frameMs of [16, 50, 100]) {
    let s = createGame(level, seed);
    let nextPress = 0;
    for (let elapsed = 0; elapsed < 70_000 && s.status === 'playing'; elapsed += frameMs) {
      const watching = teacherWatching(s);
      s = tick(s, frameMs);
      if (s.t >= nextPress) {
        nextPress = s.t + 250;
        if (!watching) s = act(s, 'freshener').state;
      }
    }
    expect(s.status, `level=${level.id} seed=${seed} frame=${frameMs}`).toBe('won');
    expect(s.actions.windows).toBe(0);
  }
});

describe('rank titles', () => {
  it('maps score to funny titles, top tier is the Supreme Minister', () => {
    expect(rankTitle(0)).toBe('Professional Nose-Holder');
    expect(rankTitle(9_000)).toBe('SUPREME MINISTER OF FRESH AIR');
    expect(rankTitle(6_000)).toBe('Certified Window Warrior');
    expect(rankTitle(4_000)).toBe('Junior Stink Inspector');
  });
});
