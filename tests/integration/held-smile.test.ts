// SYNTHETIC face stream (not SDK data) → FaceInput → engine. Verifies the full input path:
// a sustained smile, including natural wobble, activates the freshener exactly once.
import { describe, expect, it } from 'vitest';
import { act, createGame, tick } from '../../src/game/engine';
import { FaceInput } from '../../src/game/gestures';
import { getLevel } from '../../src/game/levels';

const SAMPLE_MS = 32; // ~31 Hz, as measured in M1

function simulate(happyAt: (i: number) => number, seconds: number) {
  const input = new FaceInput();
  let s = createGame(getLevel(1), 3);
  let activations = 0;
  for (let i = 0; i < (seconds * 1000) / SAMPLE_MS; i++) {
    s = tick(s, SAMPLE_MS);
    for (const g of input.push({ t: i * SAMPLE_MS, stable: true, scores: { HAPPY: happyAt(i) } }, i * SAMPLE_MS)) {
      const r = act(s, g);
      s = r.state;
      if (r.accepted) activations++;
    }
  }
  return { activations, s };
}

describe('held smile → single activation', () => {
  it('a steady 15 s smile activates once', () => {
    expect(simulate(() => 85, 15).activations).toBe(1);
  });

  it('a wobbly held smile (dips to 50 and brief dips to 40) activates once', () => {
    // Real held smiles hover 60–100 with dips (M1: ≥60 in only 43–66% of frames).
    const wobble = (i: number) => (i % 40 < 6 ? (i % 40 < 3 ? 40 : 50) : 80 + (i % 7));
    expect(simulate(wobble, 15).activations).toBe(1);
  });

  it('smile → relax → smile cycles activate once per cycle (when reloaded)', () => {
    // 1 s smile, 6 s relaxed: longer than spray (4 s) + reload (2 s)
    const cycle = (i: number) => ((i * SAMPLE_MS) % 7000 < 1000 ? 85 : 3);
    expect(simulate(cycle, 21).activations).toBe(3);
  });

  it('re-smiling during the spray/reload window does not stack activations', () => {
    // smiles every 2 s, shorter than the 6 s spray+reload window
    const fast = (i: number) => ((i * SAMPLE_MS) % 2000 < 500 ? 85 : 3);
    const { activations } = simulate(fast, 12);
    expect(activations).toBe(2); // t≈0 and t≈6 s
  });
});
