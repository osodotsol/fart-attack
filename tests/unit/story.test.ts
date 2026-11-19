import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/game/levels';
import { QUIPS, SCENE_AFTER, STORY } from '../../src/game/story';

describe('story data', () => {
  it('every scene has panels with non-empty text', () => {
    for (const [id, panels] of Object.entries(STORY)) {
      expect(panels.length, id).toBeGreaterThan(0);
      for (const p of panels) expect(p.text.trim().length, id).toBeGreaterThan(0);
    }
  });

  it('every level has a story scene after it, and the last one is the finale', () => {
    for (const l of LEVELS) expect(STORY[SCENE_AFTER[l.id]], `level ${l.id}`).toBeDefined();
    expect(SCENE_AFTER[LEVELS[LEVELS.length - 1].id]).toBe('finale');
  });

  it('story never claims the game reads real emotions or smells (copy check)', () => {
    const all = Object.values(STORY).flat().map((p) => p.text.toLowerCase()).join(' ');
    expect(all).not.toMatch(/real emotion|detects? (your )?feelings|smell sensor|medical/);
  });

  it('quips fit the in-scene speech bubble (≤ 40 chars)', () => {
    for (const [k, list] of Object.entries(QUIPS)) for (const q of list) expect(q.length, `${k}: ${q}`).toBeLessThanOrEqual(40);
  });
});

describe('voiced story moments', () => {
  const panels = Object.entries(STORY).flatMap(([scene, ps]) => ps.map((p, i) => ({ scene, i, p })));
  const voiced = panels.filter((x) => x.p.voice);

  it('only a few excellent moments are voiced (not every line)', () => {
    expect(voiced.length).toBeGreaterThanOrEqual(6);
    expect(voiced.length).toBeLessThanOrEqual(12);
    expect(voiced.length).toBeLessThan(panels.length / 2);
  });

  it('every scene keeps its panels (opening still has seven)', () => {
    expect(STORY.opening).toHaveLength(7);
  });

  it('every voiced panel has a speaker with a voice and short speakable text (subtitle is always kept)', () => {
    for (const { scene, i, p } of voiced) {
      expect(['narrator', 'robot', 'kid', 'teacher', 'waiter'], `${scene}:${i}`).toContain(p.speaker);
      expect((p.say ?? p.text).length, `${scene}:${i}`).toBeLessThanOrEqual(120);
      expect(p.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('voiced robot lines that contain digits provide a spelled-out `say` wording', () => {
    for (const { scene, i, p } of voiced) if (/\d/.test(p.text)) expect(p.say, `${scene}:${i}`).toBeDefined();
  });

  it('the voiced moments cover each scene and each major character', () => {
    for (const id of ['opening', 'after1', 'after2', 'finale'] as const) expect(STORY[id].some((p) => p.voice), id).toBe(true);
    const roles = new Set(voiced.map((x) => x.p.speaker));
    for (const r of ['narrator', 'robot', 'kid', 'teacher']) expect(roles.has(r as never), r).toBe(true);
  });
});

import { KID_EXCUSES, pickDifferent } from '../../src/game/story';

describe('spoken variety', () => {
  it('pickDifferent never returns the previous item when there is a choice (any random value)', () => {
    for (const last of KID_EXCUSES) for (const r of [0, 0.25, 0.5, 0.75, 0.999]) expect(pickDifferent(KID_EXCUSES, last, () => r)).not.toBe(last);
  });

  it('pickDifferent still works for a single-item list and with no previous item', () => {
    expect(pickDifferent(['only'], 'only')).toBe('only');
    expect(KID_EXCUSES).toContain(pickDifferent(KID_EXCUSES, undefined));
  });

  it('kid excuses are short, distinct and speakable', () => {
    expect(new Set(KID_EXCUSES).size).toBe(KID_EXCUSES.length);
    for (const e of KID_EXCUSES) expect(e.length).toBeLessThanOrEqual(40);
  });

  it('QUIPS.win / QUIPS.lose have more than one option so verdicts can vary', () => {
    expect(QUIPS.win.length).toBeGreaterThan(1);
    expect(QUIPS.lose.length).toBeGreaterThan(1);
  });
});
