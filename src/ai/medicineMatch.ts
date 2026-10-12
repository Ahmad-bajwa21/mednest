// Medicine name matching (spec §6.4 step 3). Fuzzy-match an extracted name against
// the bundled medicine list. No match OR more than one close match => unsure, with
// the candidates offered as tap options on the review screen (S9).

export interface MedicineEntry {
  id: string;
  name: string; // brand or generic
  generic?: string;
}

export interface MatchResult {
  status: 'matched' | 'unsure' | 'none';
  matchedId?: string;
  matchedName?: string;
  candidates: MedicineEntry[]; // offered to the user when unsure
}

// Levenshtein distance (iterative, O(n*m)).
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

// Similarity in [0,1]: 1 = identical.
export function similarity(a: string, b: string): number {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (!x && !y) return 1;
  const maxLen = Math.max(x.length, y.length);
  return maxLen === 0 ? 1 : 1 - levenshtein(x, y) / maxLen;
}

const ACCEPT = 0.9; // single confident match
const CANDIDATE = 0.72; // close enough to offer as an option

export function matchMedicine(name: string, list: MedicineEntry[]): MatchResult {
  const q = name.trim();
  if (!q) return { status: 'none', candidates: [] };
  const scored = list
    .map((e) => ({ e, s: Math.max(similarity(q, e.name), e.generic ? similarity(q, e.generic) : 0) }))
    .sort((a, b) => b.s - a.s);

  const top = scored[0];
  if (!top || top.s < CANDIDATE) return { status: 'none', candidates: [] };

  const close = scored.filter((x) => x.s >= CANDIDATE);
  // One clearly-best confident match, and it is meaningfully ahead of the runner-up.
  const runnerUp = scored[1]?.s ?? 0;
  if (top.s >= ACCEPT && top.s - runnerUp >= 0.08) {
    return { status: 'matched', matchedId: top.e.id, matchedName: top.e.name, candidates: [] };
  }
  // Ambiguous (none confident, or two near-equal) => unsure with up to 3 candidates.
  return { status: 'unsure', candidates: close.slice(0, 3).map((x) => x.e) };
}
