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
import { lookupMedicineInfo, MEDICINE_INFO, type MedicineInfo } from '../ai/medicineInfo';
import { deriveStatus, effectiveEndDate, formatTime, localDateIso, resolveTime, doseOccurrences, doseState, type SchedulableMedicine } from './schedule';

export interface AskMedicine extends SchedulableMedicine {
  documentId?: string | null;
}
export interface AskDocument {
  id: string;
  type: string;
  docDate?: string | null;
  doctor?: string | null;
  diagnosisWritten?: string | null;
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
}
export interface AskReply {
  answer: string;
  sources: string[]; // document ids
  refusal?: boolean;
  emergency?: boolean;
  /** Medicine this answer was about — pass back as context.lastMedicineId. */
  medicineId?: string | null;
  /** Questions the user can tap next. */
  suggestions?: string[];
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
const timesText = (m: AskMedicine) =>
  m.asNeeded ? 'only when needed' : m.times.length ? m.times.map((t) => { const r = resolveTime(t); return r ? formatTime(r) : t; }).join(', ') : 'no times recorded';
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

function whyText(m: AskMedicine, d: AskData): string {
  const doc = d.documents.find((x) => x.id === m.documentId);
  const parts: string[] = [];
  if (doc) {
    parts.push(`${title(m)} was prescribed${doc.doctor ? ` by ${doc.doctor}` : ''} on ${fmt(doc.docDate)}.`);
    parts.push(doc.diagnosisWritten ? `The prescription lists the diagnosis: ${doc.diagnosisWritten}.` : 'The prescription does not say what it is for.');
  } else {
    parts.push(`${title(m)} was added by you${m.startDate ? ` (from ${fmt(m.startDate)})` : ''}.`);
  }
  const info = lookupMedicineInfo(m.name);
  if (info) parts.push(generalText(m.name.split(/\s+/)[0]!, info), GENERAL_NOTE);
  else parts.push(`I don’t have general information about ${m.name}. Ask ${doc?.doctor ?? 'your doctor'} or a pharmacist what it is for.`);
  return parts.join(' ');
}

function howText(m: AskMedicine): string {
  const parts = [`${title(m)}: ${timesText(m)}${m.instructions ? `, ${m.instructions}` : ''}.`];
  if (!m.dose) parts.push('The dose is not recorded — check the prescription.');
  return parts.join(' ') + ' This is what the prescription says; follow your doctor’s instructions.';
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

  const asksWhy = /\b(why|what (is|are|was|were) (it|this|that|they|these|those|the \w+|\w+) for|what('?s| is| are)? .* for\b|used for|purpose|for what|kis liye|kyun)\b/.test(lower);
  const asksHow = /\b(when|what time|how (do|should|often|many|much)|times? a day|before or after|with food|dose|dosage|kab)\b/.test(lower);
  const asksHowLong = /\b(how long|until when|till when|end date|when (does|do|will) .* (end|finish|stop)|how many days|kitne din)\b/.test(lower);
  const asksWho = /\b(who|which doctor|prescribed by|kis doctor)\b/.test(lower);
  const asksList = /\b(what|which|current|my|all|list)\b.*\b(medicine|medicines|meds|tablets|pills|medication|dawai|dawa)\b|\btaking now\b|\bdo i (eat|take)\b/.test(lower);


  const pluralList = /\b(medicines|meds|tablets|pills|all|list|what medicine|which medicine)\b/.test(lower);
  const medicineAnswer = (): AskReply | null => {
    if (!m0) return null;
    if (asksHowLong) return { answer: meds.map((m) => durationText(m, d)).join(' '), sources: src(meds), medicineId: m0.id };
    if (asksWho) {
      const doc = d.documents.find((x) => x.id === m0.documentId);
      return { answer: doc ? `${title(m0)} was prescribed${doc.doctor ? ` by ${doc.doctor}` : ' (no doctor name recorded)'} on ${fmt(doc.docDate)}.` : `${title(m0)} was entered by you; no prescription is linked.`, sources: src([m0]), medicineId: m0.id };
    }
    if (asksHow && !asksWhy) return { answer: meds.map(howText).join(' '), sources: src(meds), medicineId: m0.id };
    if (asksWhy || /\bwhat (is|are)\b|\btell me about\b|\babout\b/.test(lower)) return { answer: meds.map((m) => whyText(m, d)).join('\n\n'), sources: src(meds), medicineId: m0.id, suggestions: ['When do I take it?', 'How long do I take it?'] };
    return null;
  };

  // 1. A medicine named in the question (or "it" from the conversation).
  if (explicit) {
    const r = medicineAnswer();
    if (r) return r;
  }

  // 2. A medicine that is not in the record: general information only.
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
    let answer = `Current medicines:\n${lines.join('\n')}`;
    if (asksWhy) answer += '\n\n' + cur.map((m) => whyText(m, d)).join('\n\n');
    return { answer, sources: src(cur), medicineId: cur.length === 1 ? cur[0]!.id : null, suggestions: ['What is it for?', 'When do I take it?', 'How long do I take it?'] };
  }

  // 4. Follow-ups
  if (/\b(follow[- ]?up|appointment|next visit|checkup|check-up|see the doctor again)\b/.test(lower)) {
    const today = localDateIso(d.now);
    const next = d.appointments.filter((a) => a.status === 'planned' && a.date && a.date >= today).sort((a, z) => a.date!.localeCompare(z.date!))[0];
    const proposed = d.appointments.filter((a) => a.status === 'proposed');
    if (next) return { answer: `Next follow-up: ${fmt(next.date)}${next.time ? ' at ' + next.time : ''}${next.doctor ? ' with ' + next.doctor : ''}${next.reason ? ' — ' + next.reason : ''}.`, sources: [] };
    if (proposed.length) return { answer: 'There is a follow-up waiting for you to confirm the date. Open Follow-ups to confirm it.', sources: [] };
    return { answer: 'No follow-up is planned.', sources: [] };
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
  if ((asksWhy || asksHow || asksHowLong) && currentMeds(d).length > 1) {
    return { answer: `Which medicine do you mean? ${d.profileName} takes ${currentMeds(d).map((m) => m.name).join(', ')}.`, sources: [], suggestions: currentMeds(d).map((m) => `What is ${m.name.split(/\s+/)[0]} for?`) };
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
