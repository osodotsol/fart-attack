// Gesture recognition: expression score stream → discrete, debounced gesture events.
// Hysteresis state machine per gesture (thresholds from docs/PRD.md, evidence in docs/SDK_VALIDATION.md).
import type { ExpressionName, FaceSample } from '../shared/types';

export type GestureName = 'freshener' | 'windows';

export interface GestureRule {
  gesture: GestureName;
  expression: ExpressionName;
  /** Fire when score ≥ fireAt for fireFrames consecutive valid samples (while armed). */
  fireAt: number;
  fireFrames: number;
  /** After firing, re-arm only when score < rearmBelow for rearmFrames consecutive valid samples. */
  rearmBelow: number;
  rearmFrames: number;
}

export const DEFAULT_RULES: readonly GestureRule[] = [
  // Re-arm at <45 for 8 samples (~250 ms): M1 showed HAPPY takes 2–3 s to decay below 30, which forced constant
  // smiling. Replaying the recorded sessions: every held smile fired exactly once with this setting, and the
  // stray post-prompt re-fire seen with <45×3 disappears (docs/SDK_VALIDATION.md "Gesture replay").
  { gesture: 'freshener', expression: 'HAPPY', fireAt: 60, fireFrames: 5, rearmBelow: 45, rearmFrames: 8 },
  { gesture: 'windows', expression: 'SURPRISE', fireAt: 40, fireFrames: 5, rearmBelow: 20, rearmFrames: 8 },
];

export class GestureDetector {
  armed = true;
  private above = 0;
  private below = 0;
  /** Last raw score (for UI bars). */
  score = 0;

  constructor(readonly rule: GestureRule) {}

  /**
   * Feed one valid sample's score. Returns true exactly once per fire.
   * A missing / non-finite score is NOT a neutral reading: it breaks any streak (fire or re-arm) and counts for nothing.
   */
  push(score: number | undefined): boolean {
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      this.interrupt();
      return false;
    }
    this.score = score;
    const r = this.rule;
    if (this.armed) {
      this.above = score >= r.fireAt ? this.above + 1 : 0;
      if (this.above >= r.fireFrames) {
        this.armed = false;
        this.above = 0;
        this.below = 0;
        return true;
      }
    } else {
      this.below = score < r.rearmBelow ? this.below + 1 : 0;
      if (this.below >= r.rearmFrames) {
        this.armed = true;
        this.below = 0;
      }
    }
    return false;
  }

  /** Invalid measurement / signal gap: break any streak but keep armed state (no free fires, no stuck locks). */
  interrupt(): void {
    this.above = 0;
    this.below = 0;
    this.score = 0;
  }

  /** Back to the initial state (new session): armed, no streaks, no score. */
  reset(): void {
    this.armed = true;
    this.interrupt();
  }

  /** 0..1 progress toward firing, for UI. */
  get progress(): number {
    if (!this.armed) return 0;
    return Math.min(1, this.score / this.rule.fireAt);
  }
}

/** Combines detectors with signal-validity gating. Pure apart from the time values passed in. */
export class FaceInput {
  readonly detectors: GestureDetector[];
  private valid = true;
  private lastSampleAt = -Infinity;

  constructor(rules: readonly GestureRule[] = DEFAULT_RULES, readonly stallMs = 500) {
    this.detectors = rules.map((r) => new GestureDetector(r));
  }

  /** SDK validation status changed (only kOk counts as valid). */
  setValid(ok: boolean): void {
    if (this.valid && !ok) this.detectors.forEach((d) => d.interrupt());
    this.valid = ok;
  }

  get isValid(): boolean {
    return this.valid;
  }

  /** Feed one sample at local time nowMs. Returns gestures that fired. */
  push(sample: FaceSample, nowMs: number): GestureName[] {
    if (nowMs - this.lastSampleAt > this.stallMs) this.detectors.forEach((d) => d.interrupt());
    this.lastSampleAt = nowMs;
    if (!this.valid) return [];
    const fired: GestureName[] = [];
    for (const d of this.detectors) {
      if (d.push(sample.scores[d.rule.expression])) fired.push(d.rule.gesture);
    }
    return fired;
  }

  /** True when no sample arrived within stallMs. */
  isStalled(nowMs: number): boolean {
    return nowMs - this.lastSampleAt > this.stallMs;
  }

  msSinceSample(nowMs: number): number {
    return nowMs - this.lastSampleAt;
  }

  /** Forget everything about the previous session (called when the camera stops / a new session starts). */
  reset(): void {
    this.valid = true;
    this.lastSampleAt = -Infinity;
    this.detectors.forEach((d) => d.reset());
  }

  get(gesture: GestureName): GestureDetector | undefined {
    return this.detectors.find((d) => d.rule.gesture === gesture);
  }
}
