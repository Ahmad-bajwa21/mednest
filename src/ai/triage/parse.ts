// Deterministic parsers that turn a patient's free-text answer into a slot value.
// They return null when unsure, so the engine asks again (or the on-device model maps
// the text onto the allowed options — never onto anything else).

const NUM_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  ek: 1, do: 2, teen: 3, char: 4, panch: 5,
};

export interface Duration {
  hours: number;
  text: string;
}

const UNIT_HOURS: Array<[RegExp, number]> = [
  [/^(min|minute)s?$/, 1 / 60],
  [/^(h|hr|hrs|hour|hours|ghant[ae]y?)$/, 1],
  [/^(d|day|days|din)$/, 24],
  [/^(w|wk|wks|week|weeks|hafta|haftay|hafte)$/, 24 * 7],
  [/^(month|months|mahina|mahinay|mahine)$/, 24 * 30],
  [/^(year|years|saal)$/, 24 * 365],
];

/** "2 days", "since yesterday", "a week", "3 hrs", "this morning" -> hours. */
export function parseDuration(input: string): Duration | null {
  const t = input.toLowerCase();
  if (/\b(just now|few minutes|an? (few )?min)/.test(t)) return { hours: 0.25, text: 'minutes ago' };
  if (/\b(this morning|today|tonight|aaj)\b/.test(t)) return { hours: 6, text: 'today' };
  if (/\b(last night|yesterday|kal)\b/.test(t)) return { hours: 24, text: 'since yesterday' };
  if (/\bday before yesterday|parson\b/.test(t)) return { hours: 48, text: '2 days' };
  const m = t.match(/\b(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|ek|do|teen|char|panch)\s*([a-z]+)/g);
  if (!m) return null;
  for (const chunk of m) {
    const parts = chunk.match(/^(\S+?)\s*([a-z]+)$/);
    if (!parts) continue;
    const n = /^\d/.test(parts[1]!) ? parseFloat(parts[1]!) : NUM_WORDS[parts[1]!];
    if (n === undefined || !Number.isFinite(n)) continue;
    const unit = UNIT_HOURS.find(([re]) => re.test(parts[2]!));
    if (!unit) continue;
    return { hours: n * unit[1], text: describeHours(n * unit[1]) };
  }
  return null;
}

export function describeHours(h: number): string {
  if (h < 1) return 'less than an hour';
  if (h < 24) return `${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} day${d === 1 ? '' : 's'}`;
  if (d < 60) return `${Math.round(d / 7)} weeks`;
  return `${Math.round(d / 30)} months`;
}

/**
 * Severity 0–10 from a number or words ("mild", "very bad"). In `strict` mode (used on
 * the opening message, where a bare number is more likely a duration) only "7/10"-style
 * numbers and words count.
 */
export function parseSeverity(input: string, strict = false): number | null {
  const t = input.toLowerCase();
  const n = strict ? t.match(/\b(10|[0-9])\s*(?:\/|out of)\s*10\b/) : t.match(/\b(10|[0-9])\b/);
  if (n) return parseInt(n[1]!, 10);
  if (/unbearable|worst|excruciating|extreme|bardasht se bahar/.test(t)) return 10;
  if (/very (bad|severe|strong)|really bad|severe|bohat (zyada|tez)/.test(t)) return 8;
  if (/moderate|medium|quite bad|bad|tez/.test(t)) return 5;
  if (/mild|slight|little|light|halka|thora/.test(t)) return 2;
  return null;
}

export function parseYesNo(input: string): boolean | null {
  const t = input.toLowerCase().trim();
  if (/^(y|yes|yeah|yep|yup|sure|i have|i did|it is|haan|han|ji haan|ji|hmm yes)\b/.test(t)) return true;
  if (/^(n|no|nope|nah|not really|never|i haven'?t|i didn'?t|nahi|nahin|na)\b/.test(t)) return false;
  return null;
}

export interface Option {
  value: string;
  label: string;
  /** Extra phrasings that select this option. */
  aliases?: RegExp;
}

function optionMatches(o: Option, t: string): boolean {
  if (o.aliases?.test(t)) return true;
  return t.includes(o.label.toLowerCase());
}

/** Single choice: exactly one option must match, otherwise null (ambiguous / unknown). */
export function parseChoice(input: string, options: Option[]): string | null {
  const t = input.toLowerCase();
  const exact = options.find((o) => o.label.toLowerCase() === t.trim() || o.value === t.trim());
  if (exact) return exact.value;
  const hits = options.filter((o) => optionMatches(o, t));
  return hits.length === 1 ? hits[0]!.value : null;
}

const NEGATED = /(?:\bno|\bnot|\bwithout|n'?t have|\bnever)\s+(?:[a-z']+\s+){0,2}$/;

/** Multi choice: every un-negated option mentioned. "none"/"no" -> ['none']. */
export function parseMulti(input: string, options: Option[]): string[] | null {
  const t = input.toLowerCase().trim();
  if (/^(none|no|nope|nothing( else)?|nahi|nahin|none of these)\b\.?$/.test(t)) return ['none'];
  const hits: string[] = [];
  for (const o of options) {
    if (o.value === 'none') continue;
    const res = [o.aliases, new RegExp(escapeRe(o.label.toLowerCase()))].filter((r): r is RegExp => !!r);
    const found = res.some((re) => {
      const g = new RegExp(re.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = g.exec(t)) !== null) {
        if (!NEGATED.test(t.slice(Math.max(0, m.index - 30), m.index))) return true;
        if (m[0].length === 0) g.lastIndex++;
      }
      return false;
    });
    if (found) hits.push(o.value);
  }
  return hits.length ? hits : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "skip", "don't know", "not sure" -> the user chose not to answer. */
export function isSkip(input: string): boolean {
  return /^(skip|pass|don'?t know|do not know|not sure|no idea|i'?m not sure|pata nahi|maloom nahi)\b/i.test(input.trim());
}
