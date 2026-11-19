// Raw decoded SmartSpectra Metrics → FaceSample[]. Pure: no SDK import, so it is unit-testable.
// Shape per SDK messages typings: metrics.face.expression[] = { stable, timestamp (µs, number|Long), scores: [{type, confidence}] }.
import type { ExpressionName, FaceSample } from '../shared/types';

const EXPRESSION_BY_CODE: Record<number, ExpressionName> = {
  1: 'ANGRY', 2: 'CONTEMPT', 3: 'DISGUST', 4: 'FEAR', 5: 'HAPPY', 6: 'NEUTRAL', 7: 'SAD', 8: 'SURPRISE',
};

function toMs(ts: unknown): number {
  if (typeof ts === 'number') return ts / 1000;
  if (ts != null && typeof (ts as { toString(): string }).toString === 'function') {
    const n = Number((ts as { toString(): string }).toString());
    return Number.isFinite(n) ? n / 1000 : 0;
  }
  return 0;
}

export function normalizeMetrics(decoded: unknown): FaceSample[] {
  const list = (decoded as { face?: { expression?: unknown } } | null)?.face?.expression;
  if (!Array.isArray(list)) return [];
  const out: FaceSample[] = [];
  for (const ex of list as Array<{ stable?: unknown; timestamp?: unknown; scores?: unknown }>) {
    if (!ex || !Array.isArray(ex.scores)) continue;
    const scores: FaceSample['scores'] = {};
    for (const s of ex.scores as Array<{ type?: unknown; confidence?: unknown }>) {
      const name = typeof s?.type === 'number' ? EXPRESSION_BY_CODE[s.type] : undefined;
      const c = s?.confidence;
      if (name && typeof c === 'number' && Number.isFinite(c)) scores[name] = Math.min(100, Math.max(0, c));
    }
    if (Object.keys(scores).length === 0) continue;
    out.push({ t: toMs(ex.timestamp), stable: ex.stable === true, scores });
  }
  return out;
}
