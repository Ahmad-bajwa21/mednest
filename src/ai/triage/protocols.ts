// Symptom protocols for the assistant: which follow-up questions to ask for a complaint,
// when a question is relevant, and which answer combinations raise a warning flag.
// The engine walks these adaptively (skipping what the patient already told us, asking
// conditional questions only when relevant). The model never decides what is urgent.
//
// CLINICAL REVIEW REQUIRED: questions, thresholds, general information and warning
// signs are a DRAFT for clinician sign-off (spec §12). Bump PROTOCOL_VERSION on change;
// every saved assessment records the version it was produced with.
import type { Option } from './parse';
import type { RedFlag } from './redFlags';

export const PROTOCOL_VERSION = 'protocols-0.2-draft';

export type SlotKind = 'duration' | 'scale' | 'choice' | 'multi' | 'yesno' | 'text';

export type AnswerValue =
  | { kind: 'duration'; hours: number; text: string }
  | { kind: 'scale'; value: number }
  | { kind: 'choice'; value: string; label: string }
  | { kind: 'multi'; values: string[]; labels: string[] }
  | { kind: 'yesno'; value: boolean }
  | { kind: 'text'; value: string }
  | { kind: 'skipped' };

export type Answers = Record<string, AnswerValue>;

export interface TriageContext {
  /** Whole years, from the profile's birth year. */
  ageYears?: number | null;
  allergies?: string | null;
  activeMedicines: string[];
  priorEpisodes: PriorEpisode[];
  now: Date;
}

export interface PriorEpisode {
  protocolId: string;
  complaint: string;
  date: string; // YYYY-MM-DD
  disposition?: string | null;
}

export interface Slot {
  id: string;
  kind: SlotKind;
  question: string;
  /** Short label used in the summary ("Started", "Where"). */
  label: string;
  options?: Option[];
  /** Ask only when this returns true for the answers so far. */
  askIf?: (a: Answers, ctx: TriageContext) => boolean;
  /** May be filled from the patient's opening message. */
  prefillable?: boolean;
  /**
   * A red-flag question. If the patient answers "not sure", the warning sign cannot be
   * ruled out, so the outcome is raised to at least "see a doctor today" (engine).
   * The text names the sign, e.g. "neck stiffness".
   */
  critical?: string;
}

export interface Protocol {
  id: string;
  label: string;
  /** Matches the opening complaint. */
  match: RegExp;
  slots: Slot[];
  /** Answer combinations that raise a flag. Evaluated after every answer. */
  rules: (a: Answers, ctx: TriageContext) => RedFlag[];
  /** General, non-prescriptive information shown with a self-care outcome. */
  generalInfo: string[];
  /** "Get help sooner if…" warning signs shown with every outcome. */
  safetyNet: string[];
  /** Days after which a still-present symptom should be seen by a GP. */
  seeGpAfterDays: number;
  /** Protocol-specific wording for the outcome (e.g. mental health). */
  advice?: Partial<Record<'urgent' | 'gp' | 'self_care' | 'insufficient', string>>;
  heading?: Partial<Record<'urgent' | 'gp' | 'self_care' | 'insufficient', string>>;
  /** Opening line instead of the generic empathy line. */
  opening?: string;
  /** Softer acknowledgements between questions. */
  gentle?: boolean;
}

/* ---------- answer helpers ---------- */
export const hoursOf = (a: Answers, id: string): number | null => {
  const v = a[id];
  return v?.kind === 'duration' ? v.hours : null;
};
export const scaleOf = (a: Answers, id: string): number | null => {
  const v = a[id];
  return v?.kind === 'scale' ? v.value : null;
};
export const choiceOf = (a: Answers, id: string): string | null => {
  const v = a[id];
  return v?.kind === 'choice' ? v.value : null;
};
export const has = (a: Answers, id: string, value: string): boolean => {
  const v = a[id];
  return v?.kind === 'multi' && v.values.includes(value);
};
export const yes = (a: Answers, id: string): boolean => {
  const v = a[id];
  return v?.kind === 'yesno' && v.value;
};
export const no = (a: Answers, id: string): boolean => {
  const v = a[id];
  return v?.kind === 'yesno' && !v.value;
};

const flag = (id: string, level: RedFlag['level'], reason: string): RedFlag => ({ id, level, reason });

/* ---------- shared slots ---------- */
const onset: Slot = {
  id: 'onset',
  kind: 'duration',
  label: 'Started',
  question: 'When did it start? (for example "this morning", "2 days ago")',
  prefillable: true,
};
const severity: Slot = {
  id: 'severity',
  kind: 'scale',
  label: 'Severity',
  question: 'How bad is it, from 0 (none) to 10 (worst you can imagine)?',
  prefillable: true,
};
const pattern: Slot = {
  id: 'pattern',
  kind: 'choice',
  label: 'Pattern',
  question: 'Is it there all the time, or does it come and go?',
  prefillable: true,
  options: [
    { value: 'constant', label: 'All the time', aliases: /constant|all the time|non ?stop|continuous|lagatar/ },
    { value: 'intermittent', label: 'Comes and goes', aliases: /comes and goes|on and off|off and on|intermittent|kabhi kabhi/ },
    { value: 'worsening', label: 'Getting worse', aliases: /worse|increasing|barh/ },
  ],
};
const previous = (what: string): Slot => ({
  id: 'previous',
  kind: 'yesno',
  label: 'Had before',
  question: `Have you had ${what} like this before?`,
});
const food: Slot = {
  id: 'food',
  kind: 'text',
  label: 'Recent food',
  question: 'What have you eaten or drunk in the last 24 hours? Anything unusual, from outside, or that others who ate it also felt unwell from?',
};
const NONE: Option = { value: 'none', label: 'None of these' };

/* ---------- protocols ---------- */
const abdominal: Protocol = {
  id: 'abdominal_pain',
  label: 'Stomach pain',
  match: /stomach|abdom|belly|tummy|\bpet\b|navel|cramp/,
  seeGpAfterDays: 3,
  slots: [
    onset,
    {
      id: 'location',
      kind: 'choice',
      label: 'Where',
      question: 'Where exactly is the pain?',
      prefillable: true,
      options: [
        { value: 'upper_middle', label: 'Upper middle', aliases: /upper middle|top middle|below (the )?(chest|ribs) in the middle|epigastr|upper (stomach|abdomen)/ },
        { value: 'upper_right', label: 'Upper right', aliases: /upper right|right upper|under (the )?right ribs?/ },
        { value: 'upper_left', label: 'Upper left', aliases: /upper left|left upper/ },
        { value: 'lower_right', label: 'Lower right', aliases: /lower right|right lower|right side (of|lower)/ },
        { value: 'lower_left', label: 'Lower left', aliases: /lower left|left lower/ },
        { value: 'lower_middle', label: 'Lower middle', aliases: /lower middle|below (the )?(belly button|navel)/ },
        { value: 'around_navel', label: 'Around the belly button', aliases: /around (the )?(belly button|navel)/ },
        { value: 'all_over', label: 'All over', aliases: /all over|everywhere|whole (stomach|belly)/ },
      ],
    },
    severity,
    pattern,
    {
      id: 'associated',
      kind: 'multi',
      label: 'Other symptoms',
      question: 'Do you have any of these as well?',
      prefillable: true,
      options: [
        { value: 'fever', label: 'Fever', aliases: /fever|temperature|bukhar/ },
        { value: 'vomiting', label: 'Vomiting', aliases: /vomit|throwing up|ulti/ },
        { value: 'diarrhea', label: 'Diarrhoea', aliases: /diarrh|loose (stool|motion)s?|dast/ },
        { value: 'bloating', label: 'Bloating', aliases: /bloat|gas|afara/ },
        { value: 'constipation', label: 'Constipation', aliases: /constipat|qabz/ },
        { value: 'blood_stool', label: 'Blood in stool', aliases: /blood in (my )?(stool|poo)|bloody (stool|diarrh)/ },
        { value: 'moves_right', label: 'Pain moved to the lower right', aliases: /moved to (the )?(lower )?right/ },
        NONE,
      ],
    },
    food,
    previous('stomach pain'),
  ],
  rules: (a) => {
    const out: RedFlag[] = [];
    const sev = scaleOf(a, 'severity');
    if (sev !== null && sev >= 8) out.push(flag('severe_abdominal', 'urgent', 'severe stomach pain'));
    if (has(a, 'associated', 'blood_stool')) out.push(flag('blood_stool', 'urgent', 'blood in the stool'));
    if ((choiceOf(a, 'location') === 'lower_right' || has(a, 'associated', 'moves_right')) && (has(a, 'associated', 'fever') || has(a, 'associated', 'vomiting')))
      out.push(flag('rlq_fever', 'urgent', 'pain on the lower right side with fever or vomiting'));
    if (choiceOf(a, 'location') === 'upper_right' && has(a, 'associated', 'fever')) out.push(flag('ruq_fever', 'urgent', 'upper right pain with fever'));
    if (choiceOf(a, 'pattern') === 'worsening' && (sev ?? 0) >= 6) out.push(flag('worsening_abdominal', 'urgent', 'stomach pain that keeps getting worse'));
    const h = hoursOf(a, 'onset');
    if (h !== null && h >= 24 * 14) out.push(flag('long_abdominal', 'gp', 'stomach pain lasting more than two weeks'));
    return out;
  },
  generalInfo: [
    'Sip water or oral rehydration solution (ORS) regularly, especially if you have vomiting or diarrhoea.',
    'Small, plain meals are usually easier on the stomach than large, oily or spicy ones.',
    'Rest, and keep a note of what makes the pain better or worse to tell your doctor.',
  ],
  safetyNet: [
    'The pain becomes severe, constant, or moves to the lower right side',
    'You vomit blood, or your stool is black or bloody',
    'You cannot keep fluids down or stop passing urine',
    'Your stomach becomes hard and very painful to touch',
    'You develop a high fever',
  ],
};

const headache: Protocol = {
  id: 'headache',
  label: 'Headache',
  match: /headache|head ?ache|migraine|sar ?dard|head (is )?(hurt|pain)/,
  seeGpAfterDays: 3,
  slots: [
    onset,
    {
      id: 'speed',
      kind: 'choice',
      label: 'How it began',
      question: 'Did it start suddenly (reaching its worst within a minute or so) or build up gradually?',
      options: [
        { value: 'sudden', label: 'Suddenly', aliases: /sudden|instant|all at once|out of nowhere|achanak/ },
        { value: 'gradual', label: 'Gradually', aliases: /gradual|slowly|built up|over time|aahista/ },
      ],
    },
    severity,
    {
      id: 'associated',
      kind: 'multi',
      label: 'Other symptoms',
      question: 'Do you have any of these as well?',
      prefillable: true,
      options: [
        { value: 'fever', label: 'Fever', aliases: /fever|temperature|bukhar/ },
        { value: 'vomiting', label: 'Vomiting', aliases: /vomit|throwing up|ulti/ },
        { value: 'light', label: 'Bright light bothers me', aliases: /light (bothers|hurts)|sensitive to light|photophob/ },
        { value: 'vision', label: 'Vision changes', aliases: /vision|blurr|double vision|seeing/ },
        { value: 'stiff_neck', label: 'Stiff neck', aliases: /stiff neck|neck (is )?stiff/ },
        { value: 'weakness', label: 'Weakness or numbness', aliases: /weak|numb/ },
        { value: 'confusion', label: 'Confusion', aliases: /confus|disorient/ },
        NONE,
      ],
    },
    // Red-flag questions, asked directly (not left to a checklist) when relevant.
    {
      id: 'neck',
      kind: 'yesno',
      label: 'Stiff neck',
      critical: 'neck stiffness',
      question: 'Is your neck stiff, or painful when you bend your head forward (chin to chest)?',
      askIf: (a) => !has(a, 'associated', 'stiff_neck') && (has(a, 'associated', 'fever') || (scaleOf(a, 'severity') ?? 0) >= 7),
    },
    {
      id: 'rash',
      kind: 'yesno',
      label: 'New rash',
      critical: 'a rash',
      question: 'Do you have a new rash — especially spots that don’t fade when you press a glass against them?',
      askIf: (a) => has(a, 'associated', 'fever'),
    },
    {
      id: 'neuro',
      kind: 'yesno',
      label: 'Confusion, drowsiness, weakness or speech problems',
      critical: 'confusion, weakness or speech problems',
      question: 'Any confusion, unusual drowsiness, weakness or numbness, or difficulty speaking?',
      askIf: (a) => !has(a, 'associated', 'weakness') && !has(a, 'associated', 'confusion') && (has(a, 'associated', 'fever') || (scaleOf(a, 'severity') ?? 0) >= 7 || choiceOf(a, 'speed') === 'sudden'),
    },
    {
      id: 'vomit_repeat',
      kind: 'yesno',
      label: 'Repeated vomiting',
      question: 'Have you vomited more than once?',
      askIf: (a) => has(a, 'associated', 'vomiting'),
    },
    { id: 'injury', kind: 'yesno', label: 'Head injury', question: 'Did you hit or injure your head recently?' },
    previous('headaches'),
    {
      id: 'different',
      kind: 'yesno',
      label: 'Different from usual headaches',
      critical: 'a change from your usual headaches',
      question: 'Is this headache different from your usual ones — much worse, a new kind of pain, or with new symptoms?',
      askIf: (a) => yes(a, 'previous'),
    },
  ],
  rules: (a) => {
    const out: RedFlag[] = [];
    const sev = scaleOf(a, 'severity') ?? 0;
    const fever = has(a, 'associated', 'fever');
    const neck = has(a, 'associated', 'stiff_neck') || yes(a, 'neck');
    const neuro = has(a, 'associated', 'weakness') || has(a, 'associated', 'confusion') || yes(a, 'neuro');
    if (choiceOf(a, 'speed') === 'sudden' && sev >= 8) out.push(flag('thunderclap', 'emergency', 'a sudden, very severe headache'));
    if (fever && neck) out.push(flag('meningism', 'emergency', 'headache with fever and a stiff neck'));
    if (fever && yes(a, 'rash')) out.push(flag('fever_rash', 'emergency', 'headache with fever and a rash'));
    if (neuro) out.push(flag('neuro', 'emergency', 'headache with confusion, drowsiness, weakness or speech problems'));
    if (neck && !fever) out.push(flag('neck', 'urgent', 'headache with a stiff neck'));
    if (fever && sev >= 7) out.push(flag('fever_severe_headache', 'urgent', 'a severe headache with fever'));
    if (fever && has(a, 'associated', 'light')) out.push(flag('fever_light', 'urgent', 'headache with fever and sensitivity to light'));
    if (yes(a, 'vomit_repeat')) out.push(flag('vomit_repeat', 'urgent', 'headache with repeated vomiting'));
    if (has(a, 'associated', 'vision')) out.push(flag('vision', 'urgent', 'headache with changes in vision'));
    if (yes(a, 'injury')) out.push(flag('head_injury', 'urgent', 'a headache after a head injury'));
    if (yes(a, 'different')) out.push(flag('new_pattern', 'urgent', 'a headache that is different from your usual ones'));
    if (sev >= 8 && !(fever && sev >= 7)) out.push(flag('severe_headache', 'urgent', 'a severe headache'));
    return out;
  },
  generalInfo: [
    'Rest in a quiet, dim room and drink enough water.',
    'Regular meals and sleep can help; note any triggers (screens, missed meals, stress).',
  ],
  safetyNet: [
    'The headache becomes sudden and the worst you have ever had',
    'You develop a stiff neck, or a rash that does not fade when pressed with a glass',
    'You become confused or very drowsy, or have weakness, numbness or trouble speaking',
    'You keep vomiting, have a seizure, or the headache follows a head injury',
  ],
};

const fever: Protocol = {
  id: 'fever',
  label: 'Fever',
  match: /fever|temperature|bukhar|feverish|chills/,
  seeGpAfterDays: 3,
  slots: [
    onset,
    {
      id: 'temperature',
      kind: 'choice',
      label: 'Highest temperature',
      question: 'What is the highest temperature you measured?',
      options: [
        { value: 'lt38', label: 'Below 38°C (100.4°F)', aliases: /\b(37(\.\d)?|9[89](\.\d)?|100(\.[0-3])?)\b/ },
        { value: '38_39', label: '38–39°C (100.4–102°F)', aliases: /\b(38(\.\d)?|10[01](\.\d)?)\b/ },
        { value: '39_40', label: '39–40°C (102–104°F)', aliases: /\b(39(\.\d)?|10[23](\.\d)?)\b/ },
        { value: 'gt40', label: 'Above 40°C (104°F)', aliases: /\b(4[0-2](\.\d)?|10[4-7](\.\d)?)\b/ },
        { value: 'unmeasured', label: 'Not measured', aliases: /not (measured|checked)|no thermometer|didn'?t (check|measure)/ },
      ],
    },
    {
      id: 'associated',
      kind: 'multi',
      label: 'Other symptoms',
      question: 'Do you have any of these as well?',
      prefillable: true,
      options: [
        { value: 'cough', label: 'Cough', aliases: /cough|khansi/ },
        { value: 'sore_throat', label: 'Sore throat', aliases: /sore throat|throat (pain|hurts)|gala/ },
        { value: 'rash', label: 'Rash', aliases: /rash|spots|daane/ },
        { value: 'stiff_neck', label: 'Stiff neck', aliases: /stiff neck/ },
        { value: 'urine', label: 'Burning when passing urine', aliases: /burning (urine|when|while)|pain(ful)? (urine|urination|peeing)/ },
        { value: 'diarrhea', label: 'Diarrhoea or vomiting', aliases: /diarrh|vomit|loose motion|dast|ulti/ },
        { value: 'breathing', label: 'Hard to breathe', aliases: /breath/ },
        { value: 'body_ache', label: 'Body aches', aliases: /body ache|joint pain|muscle pain/ },
        { value: 'headache', label: 'Headache', aliases: /headache|head ?ache|sar ?dard/ },
        NONE,
      ],
    },
    {
      id: 'neck',
      kind: 'yesno',
      label: 'Stiff neck',
      critical: 'neck stiffness',
      question: 'Is your neck stiff, or painful when you bend your head forward (chin to chest)?',
      askIf: (a) => has(a, 'associated', 'headache') && !has(a, 'associated', 'stiff_neck'),
    },
    {
      id: 'rash_glass',
      kind: 'yesno',
      label: 'Rash that doesn’t fade',
      critical: 'a rash that doesn’t fade',
      question: 'Does the rash stay visible when you press a clear glass firmly against it?',
      askIf: (a) => has(a, 'associated', 'rash'),
    },
    {
      id: 'neuro',
      kind: 'yesno',
      label: 'Confusion or unusual drowsiness',
      critical: 'confusion or unusual drowsiness',
      question: 'Is there any confusion or unusual drowsiness (hard to wake)?',
      askIf: (a) => has(a, 'associated', 'headache') || choiceOf(a, 'temperature') === 'gt40',
    },
    { id: 'drinking', kind: 'yesno', label: 'Drinking normally', question: 'Are you able to drink fluids normally?' },
    previous('a fever'),
  ],
  rules: (a, ctx) => {
    const out: RedFlag[] = [];
    if (has(a, 'associated', 'stiff_neck') || yes(a, 'neck')) out.push(flag('meningism', 'emergency', 'fever with a stiff neck'));
    if (yes(a, 'rash_glass')) out.push(flag('nonblanching_rash', 'emergency', 'fever with a rash that does not fade when pressed'));
    if (yes(a, 'neuro')) out.push(flag('fever_neuro', 'emergency', 'fever with confusion or unusual drowsiness'));
    if (has(a, 'associated', 'headache') && choiceOf(a, 'temperature') && ['39_40', 'gt40'].includes(choiceOf(a, 'temperature')!)) out.push(flag('fever_headache_high', 'urgent', 'a high fever with headache'));
    if (has(a, 'associated', 'breathing')) out.push(flag('fever_breathing', 'emergency', 'fever with difficulty breathing'));
    if (has(a, 'associated', 'rash')) out.push(flag('fever_rash', 'urgent', 'fever with a rash'));
    if (choiceOf(a, 'temperature') === 'gt40') out.push(flag('very_high_fever', 'urgent', 'a temperature above 40°C'));
    if (no(a, 'drinking')) out.push(flag('not_drinking', 'urgent', 'fever and not able to drink'));
    if (ctx.ageYears !== null && ctx.ageYears !== undefined && ctx.ageYears < 1) out.push(flag('infant_fever', 'urgent', 'a fever in a baby under one year'));
    const h = hoursOf(a, 'onset');
    if (h !== null && h >= 72) out.push(flag('fever_3d', 'gp', 'a fever lasting three days or more'));
    if (has(a, 'associated', 'urine')) out.push(flag('fever_urine', 'gp', 'fever with burning urine'));
    return out;
  },
  generalInfo: [
    'Drink plenty of fluids and rest.',
    'Wear light clothing and keep the room comfortably cool.',
    'Check your temperature a few times a day and write it down for your doctor.',
  ],
  safetyNet: [
    'You develop a stiff neck, a rash that does not fade when pressed, or confusion',
    'You have difficulty breathing',
    'You cannot keep fluids down or stop passing urine',
    'The fever lasts more than three days or goes above 40°C',
  ],
};

const cough: Protocol = {
  id: 'cough',
  label: 'Cough or cold',
  match: /cough|khansi|cold|flu|runny nose|blocked nose|sore throat|nazla|zukam/,
  seeGpAfterDays: 21,
  slots: [
    onset,
    {
      id: 'kind',
      kind: 'choice',
      label: 'Type of cough',
      question: 'Is the cough dry, or are you bringing up phlegm?',
      options: [
        { value: 'dry', label: 'Dry', aliases: /\bdry\b|khushk/ },
        { value: 'phlegm', label: 'With phlegm', aliases: /phlegm|mucus|sputum|balgham|wet|chesty/ },
        { value: 'blood', label: 'With blood', aliases: /blood/ },
        { value: 'no_cough', label: 'No cough', aliases: /no cough|not coughing/ },
      ],
    },
    {
      id: 'associated',
      kind: 'multi',
      label: 'Other symptoms',
      question: 'Do you have any of these as well?',
      prefillable: true,
      options: [
        { value: 'fever', label: 'Fever', aliases: /fever|temperature|bukhar/ },
        { value: 'breathless', label: 'Shortness of breath', aliases: /short(ness)? of breath|breathless|hard to breathe/ },
        { value: 'chest_pain', label: 'Chest pain', aliases: /chest pain/ },
        { value: 'wheeze', label: 'Wheezing', aliases: /wheez/ },
        { value: 'sore_throat', label: 'Sore throat', aliases: /sore throat|gala/ },
        { value: 'runny_nose', label: 'Runny or blocked nose', aliases: /runny|blocked|stuffy|nose/ },
        { value: 'weight_loss', label: 'Weight loss or night sweats', aliases: /weight loss|night sweats/ },
        NONE,
      ],
    },
    previous('a cough'),
  ],
  rules: (a) => {
    const out: RedFlag[] = [];
    if (has(a, 'associated', 'breathless') || has(a, 'associated', 'chest_pain')) out.push(flag('resp_emergency', 'emergency', 'cough with chest pain or difficulty breathing'));
    if (choiceOf(a, 'kind') === 'blood') out.push(flag('haemoptysis', 'urgent', 'coughing up blood'));
    if (has(a, 'associated', 'wheeze')) out.push(flag('wheeze', 'urgent', 'wheezing'));
    if (has(a, 'associated', 'weight_loss')) out.push(flag('weight_loss', 'gp', 'cough with weight loss or night sweats'));
    const h = hoursOf(a, 'onset');
    if (h !== null && h >= 24 * 21) out.push(flag('chronic_cough', 'gp', 'a cough lasting more than three weeks'));
    return out;
  },
  generalInfo: [
    'Rest, drink warm fluids, and honey in warm water can soothe a cough (not for babies under one year).',
    'Steam inhalation or saline nose drops may ease a blocked nose.',
    'Most colds get better on their own within 7–10 days.',
  ],
  safetyNet: [
    'You become short of breath or have chest pain',
    'You cough up blood',
    'A high fever lasts more than three days',
    'The cough lasts more than three weeks',
  ],
};

const gut: Protocol = {
  id: 'diarrhea_vomiting',
  label: 'Diarrhoea or vomiting',
  match: /diarrh|loose (stool|motion)|vomit|throwing up|nausea|ulti|dast/,
  seeGpAfterDays: 3,
  slots: [
    onset,
    {
      id: 'frequency',
      kind: 'choice',
      label: 'How often',
      question: 'How many times in the last 24 hours?',
      options: [
        { value: '1_3', label: '1–3 times', aliases: /\b[1-3]\b|once|twice|few/ },
        { value: '4_6', label: '4–6 times', aliases: /\b[4-6]\b/ },
        { value: 'gt6', label: 'More than 6 times', aliases: /\b([7-9]|\d\d+)\b|many|lots|countless/ },
      ],
    },
    { id: 'fluids', kind: 'yesno', label: 'Keeping fluids down', question: 'Are you able to keep fluids down?' },
    { id: 'urine', kind: 'yesno', label: 'Passed urine', question: 'Have you passed urine in the last 8 hours?' },
    {
      id: 'associated',
      kind: 'multi',
      label: 'Other symptoms',
      question: 'Do you have any of these as well?',
      prefillable: true,
      options: [
        { value: 'fever', label: 'Fever', aliases: /fever|temperature|bukhar/ },
        { value: 'blood', label: 'Blood in stool or vomit', aliases: /blood/ },
        { value: 'severe_pain', label: 'Severe stomach pain', aliases: /severe (stomach|abdominal|tummy) pain/ },
        { value: 'dizzy', label: 'Dizzy when standing', aliases: /dizz|light ?headed|chakkar/ },
        NONE,
      ],
    },
    food,
  ],
  rules: (a, ctx) => {
    const out: RedFlag[] = [];
    if (no(a, 'fluids')) out.push(flag('not_keeping_fluids', 'urgent', 'not able to keep fluids down'));
    if (no(a, 'urine')) out.push(flag('no_urine', 'urgent', 'no urine for 8 hours'));
    if (has(a, 'associated', 'blood')) out.push(flag('blood', 'urgent', 'blood in the stool or vomit'));
    if (has(a, 'associated', 'severe_pain')) out.push(flag('severe_pain', 'urgent', 'severe stomach pain'));
    if (has(a, 'associated', 'dizzy')) out.push(flag('dizzy', 'urgent', 'dizziness on standing (possible dehydration)'));
    if (choiceOf(a, 'frequency') === 'gt6') out.push(flag('very_frequent', 'urgent', 'more than 6 episodes in a day'));
    if (ctx.ageYears !== null && ctx.ageYears !== undefined && (ctx.ageYears < 2 || ctx.ageYears >= 75)) out.push(flag('vulnerable_age', 'urgent', 'diarrhoea or vomiting in a very young or older person'));
    const h = hoursOf(a, 'onset');
    if (h !== null && h >= 72) out.push(flag('long_gut', 'gp', 'diarrhoea or vomiting lasting three days or more'));
    return out;
  },
  generalInfo: [
    'Keep sipping fluids: oral rehydration solution (ORS) is best, in small frequent sips.',
    'Wash hands with soap after using the toilet and before eating or preparing food.',
    'Eat light food when you feel ready.',
  ],
  safetyNet: [
    'You cannot keep fluids down or stop passing urine',
    'There is blood in your stool or vomit',
    'You feel very dizzy, drowsy or confused',
    'It lasts more than three days',
  ],
};

const general: Protocol = {
  id: 'general',
  label: 'Something else',
  match: /$^/, // never matched by text; chosen explicitly or as the fallback
  seeGpAfterDays: 7,
  slots: [
    { id: 'where', kind: 'text', label: 'Where / what', question: 'Please describe the problem a little more: where is it and what does it feel like?' },
    onset,
    severity,
    pattern,
    { id: 'associated_text', kind: 'text', label: 'Other symptoms', question: 'Any other symptoms (for example fever, vomiting, rash, dizziness)? Say "none" if not.' },
    previous('this problem'),
  ],
  rules: (a) => {
    const out: RedFlag[] = [];
    const sev = scaleOf(a, 'severity');
    if (sev !== null && sev >= 8) out.push(flag('severe_general', 'urgent', 'severe symptoms'));
    if (choiceOf(a, 'pattern') === 'worsening') out.push(flag('worsening', 'gp', 'symptoms that keep getting worse'));
    const h = hoursOf(a, 'onset');
    if (h !== null && h >= 24 * 14) out.push(flag('long_general', 'gp', 'symptoms lasting more than two weeks'));
    return out;
  },
  generalInfo: ['Rest, drink enough fluids, and keep a short note of how the symptoms change to show your doctor.'],
  safetyNet: ['The symptoms get much worse or new symptoms appear', 'You feel very unwell, faint, or confused'],
};

// Asked last in every protocol: what the patient has already taken (patient-reported;
// feeds the doctor visit summary). Never used to recommend anything.
const remedies: Slot = {
  id: 'remedies',
  kind: 'text',
  label: 'Medicines taken for this',
  question: 'Have you taken any medicine for this so far? If yes, which one and when? Say “none” if not.',
};
// Mood and mental health. Empathy first, then the standard safety questions (thoughts
// of suicide/self-harm, a plan, feeling safe now, harming others), asked gently and
// directly. A plan, not feeling safe, or thoughts of harming others -> crisis response
// immediately; thoughts without a plan -> support today. Never treated as a physical
// symptom (no "where is the pain?").
const mental: Protocol = {
  id: 'mental_health',
  label: 'Mood or mental health',
  match: /\b(depress\w*|anxi\w*|panic|stress\w*|hopeless\w*|worthless|low mood|(feel|feeling|felt)( very| so| really| quite)? (low|down|sad|empty|hopeless|numb|worthless|lonely)|lonely|can'?t cope|cannot cope|overwhelm\w*|overthink\w*|intrusive thoughts?|dark thoughts?|negative thoughts?|bad thoughts?|thoughts? (are|is|keep) (getting )?(worse|bad)|mental health|mentally|empty inside|udas\w*|pareshan\w*|ghabrahat|dil nahi lagta|sad)\b/,
  seeGpAfterDays: 14,
  gentle: true,
  opening: 'Thank you for telling me — that takes courage, and I’m glad you reached out. I’m here to listen. I’ll ask a few gentle questions so I can point you to the right kind of help, and you can skip any of them.',
  slots: [
    {
      id: 'feelings',
      kind: 'multi',
      label: 'Feelings',
      prefillable: true,
      question: 'Which of these have you been experiencing?',
      options: [
        { value: 'low', label: 'Low or sad mood', aliases: /\b(sad|low|depress\w*|down|udas\w*)\b/ },
        { value: 'hopeless', label: 'Feeling hopeless or worthless', aliases: /hopeless|worthless|no hope|pointless|no future/ },
        { value: 'anxious', label: 'Anxiety or constant worry', aliases: /anxi\w*|worr\w*|nervous|tension|ghabrah\w*/ },
        { value: 'panic', label: 'Panic attacks', aliases: /panic/ },
        { value: 'sleep', label: 'Sleep problems', aliases: /sleep|insomnia|awake at night/ },
        { value: 'interest', label: 'Lost interest in things', aliases: /no interest|lost interest|don'?t enjoy|dil nahi lagta/ },
        { value: 'thoughts', label: 'Upsetting or racing thoughts', aliases: /thoughts?|overthink\w*|racing mind|intrusive/ },
        NONE,
      ],
    },
    {
      id: 'harm_thoughts',
      kind: 'yesno',
      label: 'Thoughts of suicide or self-harm',
      critical: 'thoughts of self-harm',
      question: 'When people feel this way, they sometimes have thoughts of ending their life or hurting themselves. Have you had thoughts like that recently? It’s okay to be honest — I’m asking so I can make sure you get the right support.',
    },
    {
      id: 'plan',
      kind: 'yesno',
      label: 'Plan or method considered',
      critical: 'a plan to harm yourself',
      question: 'Thank you for telling me. Have you thought about how you might do it, or made any plans?',
      askIf: (a) => yes(a, 'harm_thoughts'),
    },
    {
      id: 'safe_now',
      kind: 'yesno',
      label: 'Able to stay safe right now',
      critical: 'whether you are safe right now',
      question: 'Do you feel able to keep yourself safe right now, for the next few hours?',
      askIf: (a) => yes(a, 'harm_thoughts'),
    },
    {
      id: 'harm_others',
      kind: 'yesno',
      label: 'Thoughts of harming someone else',
      critical: 'thoughts of harming someone else',
      question: 'Have you had any thoughts of harming someone else?',
    },
    { id: 'onset', kind: 'duration', label: 'How long', prefillable: true, question: 'How long have you been feeling like this?' },
    { id: 'worsening', kind: 'yesno', label: 'Getting worse', question: 'Has it been getting worse recently?' },
    {
      id: 'daily',
      kind: 'choice',
      label: 'Effect on daily life',
      question: 'How much is this affecting your daily life — work or studies, family, eating, looking after yourself?',
      options: [
        { value: 'little', label: 'A little', aliases: /\b(little|a bit|slightly|not much)\b/ },
        { value: 'lot', label: 'A lot', aliases: /\b(a lot|lots|very much|badly|quite a lot)\b/ },
        { value: 'cant', label: 'I can barely manage', aliases: /\b(barely|can'?t manage|cannot manage|unable|not at all)\b/ },
      ],
    },
    { id: 'support', kind: 'yesno', label: 'Someone to talk to', question: 'Is there someone you trust that you can talk to — family, a friend, a teacher?' },
    { id: 'previous', kind: 'yesno', label: 'Previous episodes or treatment', question: 'Have you felt like this before, or had help or treatment for your mental health?' },
  ],
  rules: (a) => {
    const out: RedFlag[] = [];
    if (yes(a, 'plan')) out.push(flag('suicide_plan', 'emergency', 'thoughts of ending your life with a plan'));
    if (no(a, 'safe_now')) out.push(flag('not_safe', 'emergency', 'not feeling able to stay safe right now'));
    if (yes(a, 'harm_others')) out.push(flag('harm_others', 'emergency', 'thoughts of harming someone else'));
    if (yes(a, 'harm_thoughts')) out.push(flag('harm_thoughts', 'urgent', 'thoughts of ending your life or hurting yourself'));
    if (choiceOf(a, 'daily') === 'cant') out.push(flag('cant_manage', 'urgent', 'finding it very hard to manage day to day'));
    if (has(a, 'feelings', 'hopeless') && yes(a, 'worsening')) out.push(flag('hopeless_worse', 'urgent', 'feeling hopeless and getting worse'));
    const h = hoursOf(a, 'onset');
    if (h !== null && h >= 24 * 14) out.push(flag('two_weeks', 'gp', 'feeling this way for two weeks or more'));
    if (yes(a, 'worsening')) out.push(flag('worsening_mood', 'gp', 'it is getting worse'));
    if (choiceOf(a, 'daily') === 'lot') out.push(flag('daily_impact', 'gp', 'it is affecting daily life a lot'));
    if (has(a, 'feelings', 'panic')) out.push(flag('panic', 'gp', 'panic attacks'));
    return out;
  },
  advice: {
    urgent: `Please talk to a doctor or a mental health professional today. If you can, tell someone you trust how you’re feeling and try not to be alone. If thoughts of harming yourself get stronger, call 1122 or go to the nearest emergency department straight away.`,
    gp: 'Please book an appointment with a doctor (GP) or a psychologist in the next few days. Depression and anxiety are common and treatable — you don’t have to manage this alone.',
    self_care: 'From what you’ve shared, this may ease with rest and support — but you don’t need to wait until it gets worse to ask for help. If it lasts more than two weeks or starts affecting your daily life, please see a doctor.',
    insufficient: 'I don’t have enough information to guide you, and that’s okay. If you’re struggling, please talk to a doctor or someone you trust — reaching out is a good step.',
  },
  heading: {
    urgent: 'Please get support today',
    gp: 'Please see a doctor or psychologist soon',
    self_care: 'Look after yourself — and reach out',
  },
  generalInfo: [
    'Talk to someone you trust about how you feel — you don’t have to carry it alone.',
    'Try to keep a routine: regular sleep, meals and a little daily movement or time outside.',
    'Avoid alcohol and recreational drugs; they can make low mood and anxiety worse.',
    'Depression and anxiety are common and treatable — a doctor or psychologist can help.',
  ],
  safetyNet: [
    'You have thoughts of ending your life, or of harming yourself or someone else',
    'You feel you can’t keep yourself safe',
    'You stop eating or drinking, or can’t get out of bed for days',
    'You hear or see things other people don’t',
  ],
};

for (const p of [abdominal, headache, fever, cough, gut, general]) p.slots.push(remedies);

// Mental health is matched first, so "I feel depressed and can't sleep" is never
// treated as a physical symptom.
export const PROTOCOLS: Protocol[] = [mental, abdominal, headache, fever, cough, gut, general];
export const GENERAL_PROTOCOL = general;

export function protocolById(id: string | null | undefined): Protocol | undefined {
  return PROTOCOLS.find((p) => p.id === id);
}

/** Best protocol for an opening complaint, or undefined when nothing matches. */
export function matchProtocol(text: string): Protocol | undefined {
  const t = text.toLowerCase();
  return PROTOCOLS.find((p) => p !== general && p.match.test(t));
}
