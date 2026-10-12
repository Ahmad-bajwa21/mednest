// Ask — answers questions about one person's records (spec §6.4 Task D, §7.4), shared by
// the Android app and the web build. Rules in code, no model:
//  - emergency warning signs -> fixed emergency message;
//  - advice-seeking ("should I stop…", "do I have…") -> fixed refusal;
//  - everything else is answered from the person's OWN records (what the prescription
//    says, which doctor, when, how long, follow-ups, results, doses, symptom checks),
//    plus curated general information about common medicines (src/ai/medicineInfo).
// It remembers the last medicine discussed so "what is it for?" works as a follow-up.
import { ADVICE_REFUSAL, isAdviceSeeking } from '../ai/adviceFilter';
import { detectRedFlags, EMERGENCY_MESSAGE, SELF_HARM_MESSAGE } from '../ai/triage/redFlags';
import { doseCheck, identifyMedicine, lookupMedicineInfo, MEDICINE_INFO, type MedicineInfo } from '../ai/medicineInfo';
import { deriveStatus, effectiveEndDate, formatTime, localDateIso, doseOccurrences, doseState, scheduleIssues, sortedTimes, type SchedulableMedicine } from './schedule';

export interface AskMedicine extends SchedulableMedicine {
  documentId?: string | null;
  /** document_confirmed (read from a prescription, confirmed by the user) | manual */
  source?: string | null;
}
export interface AskDocument {
  id: string;
  type: string;
  docDate?: string | null;
  doctor?: string | null;
  diagnosisWritten?: string | null;
  /** camera | gallery | file | manual */
  source?: string | null;
}
export interface AskResult {
  id: string;
  documentId?: string | null;
  docDate?: string | null;
  test: string;
  value?: string | null;
  unit?: string | null;
  rangeLow?: number | string | null;
  rangeHigh?: number | string | null;
}
export interface AskAppointment {
  id: string;
  date: string | null;
  time?: string | null;
  doctor?: string | null;
  reason?: string | null;
  status: string;
  documentId?: string | null;
  /** Follow-up text as written on the document. */
  sourceText?: string | null;
  /** written_date | relative_to_document | needs_user | manual */
  basis?: string | null;
}
export interface AskEpisode {
  id: string;
  complaint: string;
  disposition?: string | null;
  createdAt: string;
}
export interface AskData {
  profileName: string;
  allergies?: string | null;
  documents: AskDocument[];
  medicines: AskMedicine[];
  results: AskResult[];
  appointments: AskAppointment[];
  episodes: AskEpisode[];
  doseLogs: Array<{ doseKey: string; status: 'taken' | 'skipped' | 'missed' }>;
  now: Date;
}
export interface AskContext {
  lastMedicineId?: string | null;
  /** Medicines already explained in this conversation (repeats get a short answer). */
  explainedIds?: string[];
  /** We asked "which medicine?" — this is what the user wanted to know about it. */
  pendingIntent?: Intent | null;
}
export type Intent = 'when' | 'why' | 'howLong' | 'who' | 'disease';
export interface AskReply {
  answer: string;
  sources: string[]; // document ids
  refusal?: boolean;
  emergency?: boolean;
  /** Medicine this answer was about — pass back as context.lastMedicineId. */
  medicineId?: string | null;
  /** Questions the user can tap next. */
  suggestions?: string[];
  /** The user mentioned a medicine that is not recorded: offer to add it (name/dose as told). */
  addMedicine?: { name: string; dose: string | null };
  /** Updated list of explained medicines — pass back as context.explainedIds. */
  explainedIds?: string[];
  /** Set when we asked "which medicine?" — pass back as context.pendingIntent. */
  pendingIntent?: Intent | null;
}

const GENERAL_NOTE = 'This is general information about the medicine; your doctor can tell you why it was prescribed for you.';

const fmt = (iso?: string | null) => {
  if (!iso) return 'an unknown date';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const num = (v: unknown) => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const title = (m: AskMedicine) => `${m.name}${m.dose ? ' ' + m.dose : ''}`;
// Times are always shown in chronological order.
const timesText = (m: Pick<AskMedicine, 'times' | 'asNeeded'>) =>
  m.asNeeded ? 'only when needed' : m.times.length ? sortedTimes(m.times).map((t) => (/^\d\d:\d\d$/.test(t) ? formatTime(t) : t)).join(', ') : 'no scheduled time recorded';

/** Where a medicine's details came from, in plain words. */
function provenance(m: AskMedicine, d: AskData): string {
  const doc = d.documents.find((x) => x.id === m.documentId);
  if (doc && (m.source === 'document_confirmed' || (doc.source && doc.source !== 'manual'))) return `from the ${doc.type.toLowerCase()} of ${fmt(doc.docDate)}${doc.doctor ? ` (${doc.doctor})` : ''}, read automatically and confirmed by you`;
  if (doc) return `from the ${doc.type.toLowerCase()} of ${fmt(doc.docDate)}${doc.doctor ? ` (${doc.doctor})` : ''}, entered by you`;
  return `entered by you${m.startDate ? ` on ${fmt(m.startDate)}` : ''}`;
}
const uniq = <T,>(xs: T[]) => [...new Set(xs)];

function currentMeds(d: AskData): AskMedicine[] {
  const today = localDateIso(d.now);
  return d.medicines.filter((m) => ['active', 'pending', 'paused'].includes(deriveStatus(m, today)));
}

/** Which of the person's medicines the question is about: named, "it" (context), or the only one. */
function targetMedicines(q: string, d: AskData, ctx: AskContext): { meds: AskMedicine[]; explicit: boolean } {
  const lower = ` ${q.toLowerCase()} `;
  const named = d.medicines.filter((m) => {
    const first = m.name.toLowerCase().split(/\s+/)[0] ?? '';
    if (first.length >= 3 && lower.includes(first)) return true;
    const info = lookupMedicineInfo(m.name);
    return !!info && info.names.some((n) => lower.includes(` ${n} `) || lower.includes(` ${n}?`));
  });
  if (named.length) {
    const cur = named.filter((m) => currentMeds(d).includes(m));
    return { meds: cur.length ? cur : named.slice(-1), explicit: true };
  }
  // "these / them / all / both / together" = all current medicines.
  const cur0 = currentMeds(d);
  if (cur0.length > 1 && /\b(these|those|them|they|all|both|together|collectively|each|my medicines|my meds|my tablets)\b/.test(lower)) return { meds: cur0, explicit: true };
  if (/\b(it|this|that|these|those|them|the medicine|this medicine|that medicine|the tablet|the pill)\b/.test(lower) && ctx.lastMedicineId) {
    const m = d.medicines.find((x) => x.id === ctx.lastMedicineId);
    if (m) return { meds: [m], explicit: true };
  }
  // Only one current medicine and the question is about "a medicine" -> that one.
  const cur = currentMeds(d);
  if (cur.length === 1 && /\b(it|this|that|medicine|medication|tablet|pill|dose|take|taking|eat|dawai)\b/.test(lower)) return { meds: cur, explicit: false };
  return { meds: [], explicit: false };
}

/** A medicine named in the question that is NOT in the record (general info only). */
function generalMedicine(q: string): MedicineInfo | null {
  const lower = ` ${q.toLowerCase().replace(/[^a-z0-9 -]/g, ' ')} `;
  for (const info of MEDICINE_INFO) if (info.names.some((n) => lower.includes(` ${n} `))) return info;
  for (const w of q.toLowerCase().split(/[^a-z0-9-]+/)) {
    const hit = w.length >= 5 ? lookupMedicineInfo(w) : null;
    if (hit) return hit;
  }
  return null;
}

function generalText(name: string, info: MedicineInfo): string {
  const n = name.charAt(0).toUpperCase() + name.slice(1);
  return `${n} is ${info.what}, commonly used ${info.commonUse}.${info.note ? ' ' + info.note : ''}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One medicine as a short block: what it is, where it came from, safety notes. */
/** What a medicine is, from the curated list — or an honest "please confirm". */
function identityText(name: string): { text: string; info: MedicineInfo | null } {
  const id = identifyMedicine(name);
  if (!id) return { text: 'I can’t identify this medicine from its name alone. Please check the name on the box, or ask a pharmacist what it contains.', info: null };
  const brand = id.matched !== id.generic ? ` (contains ${id.generic})` : '';
  if (id.certainty === 'possible') {
    return {
      text: `this may be ${cap(id.matched)}${brand}, ${id.info.what} — but the spelling is different, so please confirm the name on the box or with a pharmacist. If it is ${cap(id.matched)}, it is commonly used ${id.info.commonUse}.`,
      info: null, // not certain: no safety notes or dose checks based on a guess
    };
  }
  return { text: `${id.info.what}${brand}. Commonly used ${id.info.commonUse}.`, info: id.info };
}

function medBlock(m: Pick<AskMedicine, 'name' | 'dose'> & Partial<AskMedicine>, d: AskData, brief: boolean, withTimes = false): string {
  const { text, info } = identityText(m.name);
  const doc = d.documents.find((x) => x.id === m.documentId);
  const lines = [`• ${cap(`${m.name}${m.dose ? ' ' + m.dose : ''}`)} — ${text}`];
  if (withTimes && m.times) {
    lines.push(`   Take: ${timesText(m as AskMedicine)}${m.instructions ? ` · ${m.instructions}` : ''}.`);
    for (const issue of scheduleIssues({ times: m.times, instructions: m.instructions ?? null, asNeeded: m.asNeeded })) {
      if (issue.kind !== 'no_times') lines.push(`   ⚠ ${issue.text} Please check with your doctor or pharmacist.`);
    }
  }
  if (!brief && m.id) {
    lines.push(`   Saved ${provenance(m as AskMedicine, d)} · ${doc?.diagnosisWritten ? `diagnosis written: ${doc.diagnosisWritten}` : 'no reason written'}.`);
    if (info?.note) lines.push(`   ⚠ ${info.note}`);
  }
  const check = info ? doseCheck(m.name, m.dose) : null;
  if (check) lines.push(`   ⚠ ${check}`);
  return lines.join('\n');
}

/** Doctors who prescribed these medicines (for "ask Dr. X"). */
function prescribers(meds: AskMedicine[], d: AskData): string {
  const names = uniq(meds.map((m) => d.documents.find((x) => x.id === m.documentId)?.doctor).filter((x): x is string => !!x));
  return names.length ? names.join(' or ') : 'your doctor';
}

/** "What is it for?" for one or more medicines. Repeats are answered briefly. */
function whyAnswer(meds: AskMedicine[], d: AskData, ctx: AskContext, withTimes = false): { answer: string; explained: string[] } {
  const seen = new Set(ctx.explainedIds ?? []);
  const brief = !withTimes && meds.every((m) => seen.has(m.id));
  const many = meds.length > 1;
  const parts: string[] = [];
  if (withTimes) parts.push(`${cap(d.profileName)} takes ${meds.length} medicine${many ? 's' : ''}:`);
  else if (many) parts.push(`What ${d.profileName}’s ${meds.length} medicines are commonly used for:`);
  else if (brief) parts.push('In short:');
  parts.push(meds.map((m) => medBlock(m, d, brief, withTimes)).join('\n'));
  const written = meds.some((m) => d.documents.find((x) => x.id === m.documentId)?.diagnosisWritten);
  if (!brief && !written) parts.push(`${many ? 'The records don’t say why these were' : 'The record doesn’t say why it was'} prescribed for ${d.profileName}. Ask ${prescribers(meds, d)}: “What ${many ? 'is each of these medicines' : 'is this medicine'} for in my case?”`);
  parts.push('General information, not a diagnosis.');
  return { answer: parts.join('\n\n'), explained: uniq([...seen, ...meds.map((m) => m.id)]) };
}

/** "Which disease are these for?" — written diagnoses first, never inferred from medicines. */
function diseaseAnswer(meds: AskMedicine[], d: AskData): string {
  const dx = d.documents.filter((x) => x.diagnosisWritten);
  const parts: string[] = [];
  if (dx.length) {
    parts.push('Diagnoses written by doctors on the documents:\n' + dx.map((x) => `• ${x.diagnosisWritten} — ${x.doctor ?? 'doctor'}, ${fmt(x.docDate)}`).join('\n'));
  } else {
    parts.push(`No diagnosis is written on ${d.profileName}’s documents, so I can’t tell which condition ${meds.length > 1 ? 'these medicines are' : 'this medicine is'} for — only the doctor who prescribed ${meds.length > 1 ? 'them' : 'it'} can.`);
  }
  if (meds.length) {
    parts.push('What they are commonly used for:\n' + meds.map((m) => medBlock(m, d, true)).join('\n'));
    parts.push('The same medicine can be used for different conditions, so please don’t assume a diagnosis from this list.');
    parts.push(`Ask ${prescribers(meds, d)}: “Which condition is each of my medicines for?” If a diagnosis is written on a prescription, add it in the document so it shows here.`);
  }
  return parts.join('\n\n');
}

/** "When do I take it?" — only what is saved; missing or conflicting details are named. */
function howText(m: AskMedicine, d: AskData): string {
  const issues = scheduleIssues(m);
  const lines: string[] = [];
  const noTimes = issues.find((i) => i.kind === 'no_times');
  if (noTimes) {
    lines.push(`${cap(title(m))}: ${noTimes.text}${m.instructions ? ` The instructions say “${m.instructions}”.` : ''}`);
    lines.push('I won’t guess a time. Check the prescription or ask your pharmacist, then add the time in Meds so I can remind you.');
  } else {
    lines.push(`${cap(title(m))}: ${timesText(m)}${m.instructions ? ` · ${m.instructions}` : ''}.`);
  }
  for (const i of issues.filter((x) => x.kind !== 'no_times')) lines.push(`⚠ ${i.text} Please check with the prescribing doctor or a pharmacist which is right.`);
  if (!m.dose) lines.push('The dose is not recorded — check the prescription.');
  const check = identifyMedicine(m.name)?.certainty === 'possible' ? null : doseCheck(m.name, m.dose);
  if (check) lines.push(`⚠ ${check}`);
  if (m.status === 'paused') lines.push('This medicine is paused in MedNest, so no reminders are set.');
  lines.push(`(Saved ${provenance(m, d)}.)`);
  return lines.join('\n');
}

/** Everything saved about a medicine: what it is, when, dose, duration, source. */
function overviewText(meds: AskMedicine[], d: AskData): string {
  return meds
    .map((m) => [medBlock(m, d, false, true), `   Duration: ${durationText(m, d)}`].join('\n'))
    .join('\n\n') + '\n\nGeneral information about a medicine is not the reason it was prescribed for you.';
}

function joinOr(xs: string[]): string {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;
}

function durationText(m: AskMedicine, d: AskData): string {
  const end = effectiveEndDate(m);
  const today = localDateIso(d.now);
  if (m.status === 'discontinued') return `${title(m)} was stopped${m.endDate ? ` on ${fmt(m.endDate)}` : ''}.`;
  if (end) return end < today ? `${title(m)} was for ${m.durationDays ?? 'a set number of'} days and ended on ${fmt(end)}.` : `${title(m)} is for ${m.durationDays ? m.durationDays + ' days' : 'a set period'}${m.startDate ? ` from ${fmt(m.startDate)}` : ''}, until ${fmt(end)}.`;
  return `No duration is written for ${title(m)}, so there is no end date. Ask your doctor how long to take it.`;
}

const SUGGEST = ['What medicines am I taking?', 'What is it for?', 'When do I take it?', 'Next follow-up?', 'Last sugar test?', 'Did I take my medicines today?'];

export function askCare(question: string, d: AskData, ctx: AskContext = {}): AskReply | null {
  const q = question.trim();
  if (!q) return null;
  const lower = q.toLowerCase();

  const flags = detectRedFlags(q);
  if (flags[0]?.level === 'emergency') {
    return { answer: flags.some((f) => f.id === 'self_harm') ? SELF_HARM_MESSAGE : EMERGENCY_MESSAGE, sources: [], emergency: true };
  }
  if (isAdviceSeeking(q)) {
    return { answer: `${ADVICE_REFUSAL} If you feel unwell, use “Check a symptom” for guided questions and next steps.`, sources: [], refusal: true };
  }

  const { meds, explicit } = targetMedicines(q, d, ctx);
  const m0 = meds[0];
  const src = (ms: AskMedicine[]) => uniq(ms.map((m) => m.documentId).filter((x): x is string => !!x));

  let asksWhy = /\b(why|what (is|are|was|were) (it|this|that|they|these|those|the \w+|\w+) for|what('?s| is| are)? .* for\b|used for|purpose|for what|kis liye|kyun)\b/.test(lower);
  let asksHowLong = /\b(how long|until when|till when|end date|when (does|do|will) .* (end|finish|stop)|how many days|kitne din)\b/.test(lower);
  let asksHow = !asksHowLong && /\b(when|what time|how (do|should|often|many|much)|times? a day|before or after|with food|dose|dosage|schedule|timing|kab)\b/.test(lower);
  let asksWho = /\b(who|which doctor|prescribed by|kis doctor)\b/.test(lower);
  let asksDisease = /\b(disease|diseases|condition|conditions|illness|illnesses|problem|problems|diagnos\w*|bimari|beemari)\b/.test(lower);
  const hasIntent = asksWhy || asksHow || asksHowLong || asksWho || asksDisease;
  // Answer to our "Which medicine do you mean?" — apply the question they asked before.
  if (!hasIntent && explicit && ctx.pendingIntent) {
    asksWhy = ctx.pendingIntent === 'why';
    asksHow = ctx.pendingIntent === 'when';
    asksHowLong = ctx.pendingIntent === 'howLong';
    asksWho = ctx.pendingIntent === 'who';
    asksDisease = ctx.pendingIntent === 'disease';
  }
  const intent: Intent | null = asksDisease ? 'disease' : asksHowLong ? 'howLong' : asksWho ? 'who' : asksHow && !asksWhy ? 'when' : asksWhy ? 'why' : null;
  // Just a medicine name ("Mitika") with no question: everything saved about it.
  const bareName = explicit && !intent && q.split(/\s+/).length <= 4 && !/\b(i|i'm|im|am|taking|take|started)\b/.test(lower);
  const asksList = /\b(what|which|current|my|all|list)\b.*\b(medicine|medicines|meds|tablets|pills|medication|dawai|dawa)\b|\btaking now\b|\bdo i (eat|take)\b/.test(lower);


  const pluralList = /\b(medicines|meds|tablets|pills|all|list|what medicine|which medicine)\b/.test(lower);
  const medicineAnswer = (): AskReply | null => {
    if (!m0) return null;
    if (asksHowLong) return { answer: meds.map((m) => durationText(m, d)).join(' '), sources: src(meds), medicineId: m0.id };
    if (asksWho) {
      const doc = d.documents.find((x) => x.id === m0.documentId);
      return { answer: doc ? `${title(m0)} was prescribed${doc.doctor ? ` by ${doc.doctor}` : ' (no doctor name recorded)'} on ${fmt(doc.docDate)}.` : `${title(m0)} was entered by you; no prescription is linked.`, sources: src([m0]), medicineId: m0.id };
    }
    if (asksHow && !asksWhy) return { answer: meds.map((m) => howText(m, d)).join('\n\n'), sources: src(meds), medicineId: meds.length === 1 ? m0.id : null, suggestions: ['What is it for?', 'How long do I take it?'] };
    if (bareName) return { answer: overviewText(meds, d), sources: src(meds), medicineId: meds.length === 1 ? m0.id : null, suggestions: ['What is it for?', 'When do I take it?', 'How long do I take it?'] };
    if (asksDisease) return { answer: diseaseAnswer(meds, d), sources: src(meds), medicineId: meds.length === 1 ? m0.id : null, explainedIds: uniq([...(ctx.explainedIds ?? []), ...meds.map((m) => m.id)]), suggestions: ['When do I take them?', 'Next follow-up?'] };
    if (asksWhy || /\bwhat (is|are)\b|\btell me about\b|\babout\b/.test(lower)) {
      const w = whyAnswer(meds, d, ctx);
      return { answer: w.answer, sources: src(meds), medicineId: meds.length === 1 ? m0.id : null, explainedIds: w.explained, suggestions: meds.length > 1 ? ['Which disease are these for?', 'When do I take them?'] : ['When do I take it?', 'How long do I take it?'] };
    }
    return null;
  };

  // 1. A medicine named in the question (or "it" from the conversation).
  if (explicit) {
    const r = medicineAnswer();
    if (r) return r;
  }

  // 2a. The person TELLS us about a medicine ("I am also taking colchicine 5 mg").
  // Ask cannot change the record, so confirm or point to where it is added.
  // "started taking" is listed before "taking" so "I started taking X" captures X, not "taking X".
  const told = /\b(?:i(?:'m| am)?|also)\s+(?:also\s+|now\s+|just\s+)?(?:started\s+(?:taking\s+|on\s+)?|taking\s+|take\s+|on\s+|using\s+|use\s+)(?:the |a |tab\.? |tablet |cap\.? |capsule |syp\.? )?([a-z][a-z0-9-]{2,}(?: [a-z][a-z-]{2,})?)(?:\s+(\d+(?:\.\d+)?\s?(?:mg|mcg|ml|g|iu)))?/.exec(lower);
  const vague = /^(medicine|medicines|medication|tablets?|pills?|this|that|them|it|my)\b/;
  if (told && !vague.test(told[1]!)) {
    const said = told[1]!.replace(/\s+(?:tablet|tablets|daily|twice|once|at|in|for|and|every|now|too|also)$/, '').trim();
    const dose = told[2]?.replace(/\s+/g, ' ') ?? null;
    const general = lookupMedicineInfo(said);
    const name = general?.names[0] ?? said;
    const inRecord = d.medicines.find((m) => {
      const first = m.name.toLowerCase().split(/\s+/)[0] ?? '';
      return first === said.split(' ')[0] || (!!general && lookupMedicineInfo(m.name) === general);
    });
    if (inRecord && currentMeds(d).includes(inRecord)) {
      return { answer: `Yes — ${title(inRecord)} is in ${d.profileName}’s records: ${timesText(inRecord)}.`, sources: src([inRecord]), medicineId: inRecord.id, suggestions: ['What is it for?', 'When do I take it?'] };
    }
    const label = cap(name);
    const parts = [`${label} isn’t in ${d.profileName}’s records yet. Tap “Add ${label}${dose ? ' ' + dose : ''}” below, then set the times your doctor gave — after that I can answer questions about it and remind you of doses.`];
    if (general || dose) {
      // Same block as other medicines: what it is, safety note, dose check.
      const block = medBlock({ name: label, dose }, d, true).split('\n');
      if (general?.note) block.splice(1, 0, `   ⚠ ${general.note}`);
      parts.push(block.join('\n'));
    }
    const others = currentMeds(d).map((m) => m.name);
    if (others.length) parts.push(`You also take ${others.join(', ')}. Make sure your doctor and pharmacist know about every medicine you take.`);
    if (general) parts.push('General information, not a diagnosis.');
    return {
      answer: parts.join('\n\n'),
      sources: [],
      addMedicine: { name: label, dose },
      suggestions: ['What medicines am I taking?'],
    };
  }

  // 2b. A medicine that is not in the record: general information only.
  const general = generalMedicine(q);
  if (general && !explicit && /\b(what|why|for|used|about|tell)\b/.test(lower)) {
    const name = general.names[0]!;
    return { answer: `${generalText(name, general)} ${name.charAt(0).toUpperCase() + name.slice(1)} is not in ${d.profileName}’s records. ${GENERAL_NOTE}`, sources: [] };
  }

  // 3. List of medicines (optionally "…and why").
  const asksDosesToday = /\b(did i take|have i taken|taken today|missed|doses? today|today'?s (doses|medicines))\b/.test(lower);
  if (asksList && (pluralList || !m0) && !asksHowLong && !asksWho && !asksDosesToday && !(asksHow && !pluralList)) {
    const cur = currentMeds(d);
    if (!cur.length) return { answer: `No current medicines are recorded for ${d.profileName}. Add a prescription with ＋ and I can answer questions about it.`, sources: [], suggestions: SUGGEST };
    const lines = cur.map((m) => `• ${title(m)} — ${timesText(m)}${m.instructions ? ', ' + m.instructions : ''}`);
    const answer = `Current medicines:\n${lines.join('\n')}`;
    if (asksWhy) {
      // One block per medicine: what it is, when to take it, where it came from.
      const w = whyAnswer(cur, d, ctx, true);
      return { answer: w.answer, sources: src(cur), medicineId: cur.length === 1 ? cur[0]!.id : null, explainedIds: w.explained, suggestions: cur.length > 1 ? ['Which disease are these for?', 'How long do I take them?'] : ['How long do I take it?', 'Next follow-up?'] };
    }
    return { answer, sources: src(cur), medicineId: cur.length === 1 ? cur[0]!.id : null, suggestions: ['What is it for?', 'When do I take it?', 'How long do I take it?'] };
  }

  // 4. Follow-ups
  if (/\b(follow[- ]?up|appointment|next visit|checkup|check-up|see the doctor again)\b/.test(lower)) {
    const today = localDateIso(d.now);
    const next = d.appointments.filter((a) => a.status === 'planned' && a.date && a.date >= today).sort((a, z) => a.date!.localeCompare(z.date!))[0];
    const proposed = d.appointments.filter((a) => a.status === 'proposed');
    const lines: string[] = [];
    if (next) {
      const doc = d.documents.find((x) => x.id === next.documentId);
      const days = Math.round((new Date(next.date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000);
      const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
      const reason = next.reason && next.reason.toLowerCase() !== 'follow-up' ? next.reason.replace(/^follow-up:\s*/i, '') : null;
      const doctor = next.doctor ?? doc?.doctor ?? null;
      lines.push(`Next follow-up: ${fmt(next.date)}${next.time ? ` at ${next.time}` : ''} (${when}).`);
      lines.push(`• Doctor: ${doctor ?? 'not recorded'}`);
      lines.push(`• Reason: ${reason ?? (next.sourceText ? `the document says “${next.sourceText}”` : 'not recorded')}`);
      if (doc) lines.push(`• From: the ${doc.type.toLowerCase()} of ${fmt(doc.docDate)}`);
      const basis: Record<string, string> = {
        written_date: 'the date written on the document',
        relative_to_document: 'calculated from the document date and confirmed by you',
        needs_user: 'chosen by you',
        manual: 'added by you',
      };
      lines.push(`• Date: ${basis[next.basis ?? 'manual'] ?? 'added by you'}`);
      lines.push('• Status: planned — MedNest will remind you the evening before and on the day.');
      lines.push('This is a reminder in MedNest, not a booking. Contact the clinic to book or confirm the appointment.');
    }
    if (proposed.length) lines.push(`${next ? '\n' : ''}${proposed.length} follow-up${proposed.length > 1 ? 's are' : ' is'} waiting for you to confirm the date — open Follow-ups to confirm.`);
    if (!lines.length) return { answer: 'No follow-up is planned. You can add one in Follow-ups.', sources: [] };
    return { answer: lines.join('\n'), sources: next?.documentId ? [next.documentId] : [] };
  }

  // 5. Allergies
  if (/\ballerg/.test(lower)) return { answer: d.allergies ? `Recorded allergies: ${d.allergies}.` : `No allergies are recorded for ${d.profileName}. You can add them in the profile.`, sources: [] };

  // 6. Doses today
  if (/\b(did i take|have i taken|taken today|missed|doses? today|today'?s (doses|medicines))\b/.test(lower)) {
    const today = localDateIso(d.now);
    const byKey = new Map(d.doseLogs.map((l) => [l.doseKey, l]));
    const doses = d.medicines.flatMap((m) => doseOccurrences(m, today, today).map((o) => ({ m, o, s: doseState(o, byKey.get(o.key), d.now.getTime()) })));
    if (!doses.length) return { answer: 'No doses are scheduled today.', sources: [] };
    const label = { upcoming: 'upcoming', due: 'due now', taken: 'taken', skipped: 'skipped', missed: 'not marked' } as const;
    return { answer: 'Today:\n' + doses.sort((a, z) => a.o.at - z.o.at).map((x) => `• ${formatTime(x.o.time)} ${x.m.name}: ${label[x.s]}`).join('\n'), sources: [] };
  }

  // 7. Test results
  const res = d.results.slice().sort((a, z) => (z.docDate ?? '').localeCompare(a.docDate ?? ''));
  const testHit = res.find((r) => lower.includes(r.test.toLowerCase())) || (/sugar|hba1c|glucose|diabet/.test(lower) ? res.find((r) => /hba1c|glucose|sugar/i.test(r.test)) : undefined);
  if (testHit) {
    const v = num(testHit.value), lo = num(testHit.rangeLow), hi = num(testHit.rangeHigh);
    const range = v !== null && hi !== null && v > hi ? ` That is above the report’s range (up to ${hi}).` : v !== null && lo !== null && v < lo ? ` That is below the report’s range (from ${lo}).` : '';
    const prev = res.find((r) => r.test === testHit.test && r !== testHit);
    return { answer: `The last ${testHit.test} was ${testHit.value ?? ''}${testHit.unit ? ' ' + testHit.unit : ''} on ${fmt(testHit.docDate)}.${range}${prev ? ` Before that: ${prev.value} on ${fmt(prev.docDate)}.` : ''} Discuss results with your doctor.`, sources: testHit.documentId ? [testHit.documentId] : [] };
  }
  if (/\b(result|results|test|tests|report|reports|lab)\b/.test(lower)) {
    const latest = uniq(res.map((r) => r.test)).slice(0, 5).map((t) => res.find((r) => r.test === t)!);
    return latest.length
      ? { answer: 'Latest results:\n' + latest.map((r) => `• ${r.test}: ${r.value ?? ''}${r.unit ? ' ' + r.unit : ''} (${fmt(r.docDate)})`).join('\n'), sources: uniq(latest.map((r) => r.documentId).filter((x): x is string => !!x)) }
      : { answer: 'No test results are recorded yet.', sources: [] };
  }

  // 8. Doctors / visits
  if (/\b(doctor|doctors|last visit|visited)\b/.test(lower)) {
    const docs = d.documents.filter((x) => x.doctor).sort((a, z) => (z.docDate ?? '').localeCompare(a.docDate ?? ''));
    if (!docs.length) return { answer: 'No doctor names are recorded on the documents.', sources: [] };
    return { answer: `Doctors in the records: ${uniq(docs.map((x) => x.doctor!)).join(', ')}. Most recent: ${docs[0]!.doctor} on ${fmt(docs[0]!.docDate)} (${docs[0]!.type.toLowerCase()}).`, sources: [docs[0]!.id] };
  }

  // 9. Diagnoses written on documents
  if (/\b(diagnos(is|es|ed)|condition|illness|disease)\b/.test(lower)) {
    const dx = d.documents.filter((x) => x.diagnosisWritten);
    return dx.length
      ? { answer: 'Diagnoses written by doctors on the documents:\n' + dx.map((x) => `• ${x.diagnosisWritten} — ${x.doctor ?? 'doctor'}, ${fmt(x.docDate)}`).join('\n'), sources: dx.map((x) => x.id) }
      : { answer: 'No diagnosis is written on any saved document.', sources: [] };
  }

  // 10. Earlier symptom checks
  const ep = d.episodes.slice().sort((a, z) => z.createdAt.localeCompare(a.createdAt));
  const epHit = ep.find((e) => e.complaint.toLowerCase().split(/\W+/).some((w) => w.length > 3 && lower.includes(w)));
  if (epHit || /\b(symptom|symptoms|felt|feeling|last time i (had|was))\b/.test(lower)) {
    const list = epHit ? ep.filter((e) => e.complaint.toLowerCase() === epHit.complaint.toLowerCase()) : ep.slice(0, 5);
    return list.length
      ? { answer: 'Symptom checks you saved:\n' + list.map((e) => `• ${fmt(e.createdAt.slice(0, 10))}: ${e.complaint}`).join('\n'), sources: [] }
      : { answer: 'No symptom checks are saved yet. Use “Check a symptom” if you feel unwell.', sources: [] };
  }

  // 11. The only current medicine, asked about without naming it.
  const implicit = medicineAnswer();
  if (implicit) return implicit;
  if (intent && currentMeds(d).length > 1) {
    // One concise clarification; the reply (just a name) is answered with this intent.
    const names = currentMeds(d).map((m) => m.name);
    return { answer: `Which medicine do you mean — ${joinOr(names)}? Or ask about “all of them”.`, sources: [], pendingIntent: intent, suggestions: [...names, 'All of them'] };
  }

  // 12. Nothing matched — say what we can answer instead of a dead end.
  if (!d.documents.length && !d.medicines.length) {
    return { answer: `There are no records for ${d.profileName} yet. Add a prescription or report with ＋, then ask me about medicines, results or follow-ups.`, sources: [], suggestions: SUGGEST };
  }
  return {
    answer: `I couldn’t find an answer to that in ${d.profileName}’s records. I can answer questions like the ones below. For general health questions, use the Health Info assistant; if you feel unwell, use “Check a symptom”.`,
    sources: [],
    suggestions: SUGGEST,
  };
}
