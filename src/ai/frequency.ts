// Frequency shorthand parser (spec §6.4 step 5). Converts prescription shorthand to
// time slots using RULES IN CODE — never the model. Returns null slots when the
// shorthand is unknown so the field can be flagged for the user to check.

export type Slot = 'Morning' | 'Afternoon' | 'Evening' | 'Night';
export const SLOT_ORDER: Slot[] = ['Morning', 'Afternoon', 'Evening', 'Night'];

export interface FrequencyResult {
  slots: Slot[];
  perDay: number;
  asNeeded: boolean; // SOS / PRN
  recognised: boolean;
}

const UNKNOWN: FrequencyResult = { slots: [], perDay: 0, asNeeded: false, recognised: false };

// Latin abbreviations (case-insensitive). HS = at night, OD = once daily, etc.
const ABBREV: Record<string, FrequencyResult> = {
  od: { slots: ['Morning'], perDay: 1, asNeeded: false, recognised: true },
  qd: { slots: ['Morning'], perDay: 1, asNeeded: false, recognised: true },
  bd: { slots: ['Morning', 'Night'], perDay: 2, asNeeded: false, recognised: true },
  bid: { slots: ['Morning', 'Night'], perDay: 2, asNeeded: false, recognised: true },
  tds: { slots: ['Morning', 'Afternoon', 'Night'], perDay: 3, asNeeded: false, recognised: true },
  tid: { slots: ['Morning', 'Afternoon', 'Night'], perDay: 3, asNeeded: false, recognised: true },
  qds: { slots: ['Morning', 'Afternoon', 'Evening', 'Night'], perDay: 4, asNeeded: false, recognised: true },
  qid: { slots: ['Morning', 'Afternoon', 'Evening', 'Night'], perDay: 4, asNeeded: false, recognised: true },
  hs: { slots: ['Night'], perDay: 1, asNeeded: false, recognised: true },
  nocte: { slots: ['Night'], perDay: 1, asNeeded: false, recognised: true },
  mane: { slots: ['Morning'], perDay: 1, asNeeded: false, recognised: true },
  sos: { slots: [], perDay: 0, asNeeded: true, recognised: true },
  prn: { slots: [], perDay: 0, asNeeded: true, recognised: true },
};

// Positional patterns like "1-0-1" (Morning-Afternoon-Night) or "1-1-1-1"
// (Morning-Afternoon-Evening-Night). A non-zero in a position means "take then".
function parsePositional(raw: string): FrequencyResult | null {
  const m = raw.match(/^(\d+)\s*-\s*(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?$/);
  if (!m) return null;
  const nums = [m[1], m[2], m[3], m[4]].filter((x) => x !== undefined).map((x) => parseInt(x!, 10));
  const map3: Slot[] = ['Morning', 'Afternoon', 'Night'];
  const map4: Slot[] = ['Morning', 'Afternoon', 'Evening', 'Night'];
  const map = nums.length === 4 ? map4 : map3;
  const slots: Slot[] = [];
  let perDay = 0;
  nums.forEach((n, i) => {
    if (n > 0) {
      slots.push(map[i]!);
      perDay += n;
    }
  });
  return { slots, perDay, asNeeded: false, recognised: true };
}

export function parseFrequency(input: string | null | undefined): FrequencyResult {
  if (!input) return UNKNOWN;
  const raw = input.trim().toLowerCase();
  if (!raw) return UNKNOWN;
  const positional = parsePositional(raw);
  if (positional) return positional;
  const key = raw.replace(/[.\s]/g, '');
  if (ABBREV[key]) return ABBREV[key]!;
  // "twice a day", "once daily", "three times a day"
  if (/once\s*(a\s*day|daily)/.test(raw)) return ABBREV.od!;
  if (/twice\s*(a\s*day|daily)/.test(raw)) return ABBREV.bd!;
  if (/thrice|three\s*times/.test(raw)) return ABBREV.tds!;
  if (/four\s*times/.test(raw)) return ABBREV.qds!;
  if (/at\s*night|bed\s*time|bedtime/.test(raw)) return ABBREV.hs!;
  if (/as\s*needed|when\s*required/.test(raw)) return ABBREV.sos!;
  return UNKNOWN;
}
