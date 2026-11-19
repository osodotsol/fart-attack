// SYNTHETIC score sequences (not SDK data) — exercise the gesture state machine deterministically.
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, FaceInput, GestureDetector } from '../../src/game/gestures';
import type { FaceSample } from '../../src/shared/types';

const happyRule = DEFAULT_RULES.find((r) => r.gesture === 'freshener')!;
const feed = (d: GestureDetector, scores: number[]) => scores.map((s) => d.push(s));
const rep = (v: number, n: number) => Array(n).fill(v);

describe('GestureDetector', () => {
  it('fires once after fireFrames consecutive samples at/above threshold', () => {
    const d = new GestureDetector(happyRule);
    const fired = feed(d, [...rep(59, 10), ...rep(60, 5)]);
    expect(fired.filter(Boolean)).toHaveLength(1);
    expect(fired.at(-1)).toBe(true);
  });

  it('does not fire on a brief spike shorter than fireFrames', () => {
    const d = new GestureDetector(happyRule);
    expect(feed(d, [...rep(90, 4), 10, ...rep(90, 4)]).some(Boolean)).toBe(false);
  });

  it('does not re-fire while the smile is held (needs release to re-arm)', () => {
    const d = new GestureDetector(happyRule);
    expect(feed(d, rep(95, 100)).filter(Boolean)).toHaveLength(1);
  });

  it('re-arms only after rearmFrames below rearmBelow, then can fire again', () => {
    const d = new GestureDetector(happyRule);
    feed(d, rep(95, 5));
    feed(d, rep(50, 20)); // between thresholds: stays disarmed
    expect(d.armed).toBe(false);
    feed(d, rep(10, 7));
    expect(d.armed).toBe(false); // needs rearmFrames (8) consecutive low samples
    feed(d, rep(10, 1));
    expect(d.armed).toBe(true);
    expect(feed(d, rep(95, 5)).at(-1)).toBe(true);
  });

  it('interrupt breaks a streak without firing', () => {
    const d = new GestureDetector(happyRule);
    feed(d, rep(95, 4));
    d.interrupt();
    expect(feed(d, rep(95, 4)).some(Boolean)).toBe(false);
  });
});

const sample = (HAPPY: number, SURPRISE = 0): FaceSample => ({ t: 0, stable: true, scores: { HAPPY, SURPRISE } });

describe('FaceInput', () => {
  it('maps HAPPY→freshener and SURPRISE→windows', () => {
    const fi = new FaceInput();
    let out: string[] = [];
    for (let i = 0; i < 5; i++) out = out.concat(fi.push(sample(80, 50), i * 32));
    expect(out.sort()).toEqual(['freshener', 'windows']);
  });

  it('ignores samples while validation is not OK', () => {
    const fi = new FaceInput();
    fi.setValid(false);
    const out = Array.from({ length: 20 }, (_, i) => fi.push(sample(99), i * 32)).flat();
    expect(out).toEqual([]);
  });

  it('a stream gap longer than stallMs breaks the streak', () => {
    const fi = new FaceInput(DEFAULT_RULES, 500);
    for (let i = 0; i < 4; i++) fi.push(sample(99), i * 32);
    expect(fi.push(sample(99), 4 * 32 + 600)).toEqual([]); // gap → streak reset, this is sample 1
    expect(fi.isStalled(10_000)).toBe(true);
  });
});
