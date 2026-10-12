// Latest results with trend arrow vs the previous value, and out-of-range detection
// against the range printed on the report (spec S7 / S11). Pure.
import { sortedResults, toNum, type ProfileBundle, type ResultLike } from './types';

export type Trend = 'up' | 'down' | 'same';
export interface TrendedResult extends ResultLike {
  trend: Trend;
  outOfRange: boolean;
  prev?: ResultLike;
}

export function latestResults(b: ProfileBundle, n = 3): TrendedResult[] {
  const res = sortedResults(b);
  const seen = new Set<string>();
  const out: TrendedResult[] = [];
  for (const r of res) {
    if (seen.has(r.test)) continue;
    seen.add(r.test);
    const prev = res.find((x) => x.test === r.test && x !== r && (x.docDate ?? '') < (r.docDate ?? ''));
    let trend: Trend = 'same';
    if (prev) {
      const a = toNum(r.value);
      const z = toNum(prev.value);
      if (a != null && z != null) trend = a > z ? 'up' : a < z ? 'down' : 'same';
    }
    const v = toNum(r.value);
    const outOfRange =
      v != null && ((r.rangeLow != null && v < r.rangeLow) || (r.rangeHigh != null && v > r.rangeHigh));
    out.push({ ...r, trend, outOfRange, prev });
    if (out.length >= n) break;
  }
  return out;
}
