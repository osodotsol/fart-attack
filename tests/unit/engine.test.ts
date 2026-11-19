import { describe, expect, it } from 'vitest';
import { act, cooldownLeft, createGame, isSpraying, sprayLeft, tick, type GameState } from '../../src/game/engine';
import { getLevel, LEVELS, nextLevel } from '../../src/game/levels';

const L1 = getLevel(1);
const L3 = getLevel(3);
const run = (s: GameState, ms: number, step = 16) => {
  for (let t = 0; t < ms; t += step) s = tick(s, step);
  return s;
};

describe('engine basics', () => {
  it('is deterministic for a given seed', () => {
    const a = run(createGame(L1, 42), 20_000);
    const b = run(createGame(L1, 42), 20_000);
    expect(a.stink).toBeCloseTo(b.stink, 6);
    expect(a.farts).toBe(b.farts);
  });

  it('every level is lost if nobody cleans', () => {
    for (const lvl of LEVELS) {
      const s = run(createGame(lvl, 1), lvl.roundMs);
      expect(s.status, lvl.name).toBe('lost');
    }
  });

  it('opening fart happens at firstFartMs and adds stink', () => {
    const s = run(createGame(L1, 1), L1.firstFartMs + 50);
    expect(s.farts).toBe(1);
    expect(s.stink).toBeGreaterThan(L1.startStink + L1.fart.stink);
  });

  it('caps a single huge tick at 1 s (e.g. after the window was hidden)', () => {
    expect(tick(createGame(L1, 1), 30_000).t).toBe(1_000);
  });
});

describe('freshener: short activation, timed spray, reload', () => {
  it('one activation sprays for durationMs and drains stink while relaxing', () => {
    let s = run(createGame(L1, 1), 3_000);
    s = act(s, 'freshener').state;
    expect(isSpraying(s)).toBe(true);
    expect(sprayLeft(s)).toBeCloseTo(1, 5);
    const before = s.stink;
    s = run(s, 2_000);
    expect(isSpraying(s)).toBe(true);
    expect(s.stink).toBeLessThan(before - 8); // ~6/s drain minus ~0.7/s growth
    s = run(s, 2_100);
    expect(isSpraying(s)).toBe(false);
  });

  it('cannot re-activate while spraying or reloading (duration + cooldown, configurable)', () => {
    const { durationMs, cooldownMs } = L1.freshener;
    let s = act(run(createGame(L1, 1), 3_000), 'freshener').state;
    let accepted = 0;
    // Spam the action every frame for the whole spray + reload window: nothing else is accepted.
    for (let t = 0; t < durationMs + cooldownMs - 50; t += 16) {
      s = tick(s, 16);
      const r = act(s, 'freshener');
      s = r.state;
      if (r.accepted) accepted++;
    }
    expect(accepted).toBe(0);
    expect(s.events.some((e) => e.kind === 'rejected')).toBe(true);
    s = run(s, 100);
    expect(cooldownLeft(s, 'freshener')).toBe(0);
    expect(act(s, 'freshener').accepted).toBe(true);
  });

  it('respects custom duration/cooldown from the level config', () => {
    const custom = { ...L1, freshener: { ...L1.freshener, durationMs: 1_000, cooldownMs: 500 } };
    let s = act(createGame(custom, 1), 'freshener').state;
    s = run(s, 1_100);
    expect(isSpraying(s)).toBe(false);
    expect(act(s, 'freshener').accepted).toBe(false);
    s = run(s, 500);
    expect(act(s, 'freshener').accepted).toBe(true);
  });

  it('prompt re-use after reload builds a combo', () => {
    const { durationMs, cooldownMs, points } = L1.freshener;
    let s = act(run(createGame(L1, 1), 2_000), 'freshener').state;
    s = run(s, durationMs + cooldownMs + 50);
    s = act(s, 'freshener').state;
    expect(s.combo).toBe(1.5);
    expect(s.score).toBe(points + Math.round(points * 1.5));
  });
});

describe('windows', () => {
  it('is rejected in levels without windows', () => {
    expect(act(createGame(L1, 1), 'windows').accepted).toBe(false);
  });

  it('bursts stink down and has a long cooldown in levels that have it', () => {
    let s = run(createGame(L3, 1), 5_000);
    const before = s.stink;
    s = act(s, 'windows').state;
    expect(s.stink).toBeCloseTo(Math.max(0, before - L3.windows!.stink), 6);
    expect(cooldownLeft(s, 'windows')).toBeCloseTo(1, 2);
    s = run(s, L3.windows!.cooldownMs / 2);
    expect(cooldownLeft(s, 'windows')).toBeCloseTo(0.5, 1);
  });
});

/** Simple player policy: use the freshener when ready and stink is noticeable. Keyboard-equivalent. */
function playSmilesOnly(level = L1, seed = 7) {
  let s = createGame(level, seed);
  let lastScore = 0;
  while (s.status === 'playing') {
    s = tick(s, 50);
    if (s.stink > 20) s = act(s, 'freshener').state;
    if (s.status === 'playing') lastScore = s.score;
  }
  return { s, lastScore };
}

describe('level balance (simulated, deterministic seeds)', () => {
  it('Level 1 is winnable with ≤10 smile activations, and the win adds a bonus', () => {
    for (const seed of [1, 2, 3, 7, 99]) {
      const { s, lastScore } = playSmilesOnly(L1, seed);
      expect(s.status, `seed ${seed}`).toBe('won');
      expect(s.actions.freshener, `seed ${seed}`).toBeLessThanOrEqual(10);
      expect(s.score).toBe(lastScore + s.winBonus);
    }
  });

  it('ignores actions after the round ends', () => {
    const { s } = playSmilesOnly(L1, 1);
    expect(act(s, 'freshener').accepted).toBe(false);
  });
});

describe('levels data', () => {
  it('ids are sequential and nextLevel only returns available levels', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([1, 2, 3]);
    expect(LEVELS[0].available).toBe(true);
    for (const l of LEVELS) if (nextLevel(l.id)) expect(nextLevel(l.id)!.available).toBe(true);
  });

  it('every level has a freshener (smile path always exists)', () => {
    for (const l of LEVELS) expect(l.freshener.durationMs).toBeGreaterThan(0);
  });
});
