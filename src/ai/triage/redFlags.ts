// Emergency / urgent warning-sign detector for the symptom assistant (spec §1, §12).
// RULES IN CODE, never the model. It runs on EVERY user message before anything else,
// so an emergency is never delayed by more questions. Biased towards false positives:
// a needless "seek urgent care" is acceptable, a missed emergency is not.
//
// CLINICAL REVIEW REQUIRED: the patterns and wording below are a draft and must be
// reviewed and signed off by a qualified clinician before release.

export type FlagLevel = 'emergency' | 'urgent' | 'gp';

export interface RedFlag {
  id: string;
  level: FlagLevel;
  /** Short plain-language reason shown to the user. */
  reason: string;
}

/** Local emergency number. Pakistan (launch market): Rescue 1122. Localise per market. */
export const EMERGENCY_NUMBER = '1122';

export const EMERGENCY_MESSAGE =
  `This could be serious. Please call ${EMERGENCY_NUMBER} or go to the nearest emergency department now. ` +
  'Do not wait and do not drive yourself if you feel unwell. If someone is with you, ask them to help.';

export const SELF_HARM_MESSAGE =
  `You deserve support right now. Please call ${EMERGENCY_NUMBER}, go to the nearest emergency department, ` +
  'or reach out to someone you trust and tell them how you are feeling. You are not alone.';

interface Rule {
  id: string;
  level: FlagLevel;
  reason: string;
  patterns: RegExp[];
}

// English plus common Roman-Urdu phrasings (launch market is Pakistan).
const RULES: Rule[] = [
  {
    id: 'self_harm',
    level: 'emergency',
    reason: 'thoughts of self-harm',
    patterns: [/suicid/, /kill (my ?self|myself)/, /end (my|it all|my life)\b/, /self[- ]?harm/, /want to die/, /khud ?kushi/],
  },
  {
    id: 'chest_pain',
    level: 'emergency',
    reason: 'chest pain or pressure',
    patterns: [/chest (pain|tightness|pressure|discomfort)/, /pain in (my |the )?chest/, /crushing (pain|feeling)/, /seen[ae]y? (mein|me|main) (dard|dabao)/],
  },
  {
    id: 'breathing',
    level: 'emergency',
    reason: 'difficulty breathing',
    patterns: [
      /(can'?t|cannot|unable to|hard to|difficult(y)? (to )?|trouble|struggling to) breath/,
      /short(ness)? of breath/,
      /breathless/,
      /gasping/,
      /saans (nahi|nahin|lene mein|phool)/,
    ],
  },
  {
    id: 'blue_lips',
    level: 'emergency',
    reason: 'blue lips or face',
    patterns: [/blue (lips|face|skin)/, /lips (are |turning |look )?blue/],
  },
  {
    id: 'stroke',
    level: 'emergency',
    reason: 'possible stroke signs (face, arm or speech)',
    patterns: [
      /face (is )?droop/,
      /droop(ing|y) face/,
      /slurred speech/,
      /(can'?t|cannot) (speak|talk) (properly|clearly)/,
      /weak(ness)? (on|in) one side/,
      /one side of (my|the|his|her) (body|face)/,
      /(can'?t|cannot) (move|feel) (my |his |her )?(arm|leg|hand|face)/,
      /sudden (confusion|vision loss|loss of vision|numbness)/,
    ],
  },
  {
    id: 'unconscious',
    level: 'emergency',
    reason: 'fainting or loss of consciousness',
    patterns: [/unconscious/, /passed out/, /faint(ed|ing)/, /not waking/, /unresponsive/, /behosh/],
  },
  {
    id: 'seizure',
    level: 'emergency',
    reason: 'a seizure or fit',
    patterns: [/seizure/, /convuls/, /\b(having|had|has) (a )?fit\b/, /mirgi/, /daura (para|pada|pad)/],
  },
  {
    id: 'severe_bleeding',
    level: 'emergency',
    reason: 'heavy bleeding or blood in vomit',
    patterns: [
      /(heavy|severe|uncontrolled|a lot of) bleeding/,
      /bleeding (heavily|a lot|won'?t stop|will not stop|non ?stop)/,
      /(vomit(ing|ed)?|throwing up) blood/,
      /blood in (my |the )?vomit/,
      /cough(ing|ed)? (up )?blood/,
      /black,? (tarry |sticky )?(stool|poo)/,
    ],
  },
  {
    id: 'anaphylaxis',
    level: 'emergency',
    reason: 'swelling of the face, lips or throat',
    patterns: [/(swelling|swollen) (of |in )?(my |the )?(lips|tongue|throat|face)/, /(lips|tongue|throat|face) (is |are )?(swelling|swollen)/, /throat (is )?(closing|tight)/],
  },
  {
    id: 'worst_pain',
    level: 'emergency',
    reason: 'sudden, very severe pain',
    patterns: [/worst (headache|pain) (of|in) my life/, /thunderclap/, /sudden (and )?(severe|extreme) (headache|pain)/],
  },
  {
    id: 'meningism',
    level: 'emergency',
    reason: 'fever with a stiff neck',
    patterns: [/stiff neck.*fever/, /fever.*stiff neck/],
  },
  {
    id: 'poisoning',
    level: 'emergency',
    reason: 'possible poisoning or overdose',
    patterns: [/overdose/, /swallowed (poison|bleach|acid|chemicals?|too many)/, /\bpoison(ed|ing)?\b/, /took too many (pills|tablets)/],
  },
  {
    id: 'pregnancy',
    level: 'emergency',
    reason: 'bleeding or severe pain in pregnancy',
    patterns: [/pregnan\w*.*(bleed|severe pain|heavy pain)/, /(bleed\w*|severe pain).*pregnan/],
  },
  {
    id: 'head_injury',
    level: 'urgent',
    reason: 'a head injury',
    patterns: [/head injury/, /(hit|banged|bumped|injured) (my|his|her|the) head/, /fell on (my|his|her) head/],
  },
  {
    id: 'dehydration',
    level: 'urgent',
    reason: 'signs of dehydration',
    patterns: [/(no|not passed|haven'?t passed) urine/, /haven'?t (peed|urinated)/, /(can'?t|cannot|unable to) keep (any )?(water|fluids?|anything) down/],
  },
];

// A negation right before the match ("no chest pain", "not short of breath") cancels it.
// Kept deliberately tight (negation word + at most 2 words) so phrases like
// "no idea why but chest pain" still trigger.
const NEGATION_BEFORE = /(?:\bno|\bnot|\bwithout|\bdeny|\bdenies|n'?t have|n'?t feel|\bnever)\s+(?:[a-z']+\s+){0,2}$/;

function normalise(text: string): string {
  return text.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
}

function matchesUnnegated(text: string, re: RegExp): boolean {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (!NEGATION_BEFORE.test(before)) return true;
    if (m[0].length === 0) g.lastIndex++;
  }
  return false;
}

/** All red flags found in one free-text message, most serious first. */
export function detectRedFlags(message: string): RedFlag[] {
  const text = normalise(message);
  if (!text) return [];
  const found: RedFlag[] = [];
  for (const rule of RULES) {
    if (rule.patterns.some((re) => matchesUnnegated(text, re))) {
      found.push({ id: rule.id, level: rule.level, reason: rule.reason });
    }
  }
  return sortFlags(found);
}

const RANK: Record<FlagLevel, number> = { emergency: 0, urgent: 1, gp: 2 };

export function sortFlags(flags: RedFlag[]): RedFlag[] {
  return flags.slice().sort((a, z) => RANK[a.level] - RANK[z.level]);
}

export function highestLevel(flags: RedFlag[]): FlagLevel | null {
  return sortFlags(flags)[0]?.level ?? null;
}
