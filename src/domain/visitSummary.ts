// Doctor Visit Summary — a chronological, structured overview of what the patient
// reported, for them to review and show their doctor (proposal: "AI-generated Doctor
// Visit Summary"). Built by CODE from saved records only:
//  - symptom checks (answers + timestamps), patient updates and corrections;
//  - medicines, allergies and diagnoses already in MedNest, each labelled by source.
// It never invents events, times or details, never diagnoses, and lists what is still
// unknown. Corrections are added next to the original entry — nothing is overwritten.
import { PROTOCOLS, type Answers } from '../ai/triage/protocols';

export interface VisitEpisode {
  id: string;
  protocolId?: string | null;
  complaint: string;
  answers?: Answers | null;
  disposition?: string | null;
  createdAt: string; // ISO
}

/** A later patient report: new severity, new symptoms, a note, or a correction. */
export interface SymptomUpdate {
  id: string;
  at: string; // ISO
  complaint: string; // which problem it is about
  severity?: number | null;
  newSymptoms?: string | null;
  note?: string | null;
  /** Set when this corrects an earlier entry (episode or update id). */
  correctsId?: string | null;
}

export interface VisitInput {
  profile: { name: string; ageYears?: number | null; sex?: string | null; allergies?: string | null };
  episodes: VisitEpisode[];
  updates: SymptomUpdate[];
  medicines: Array<{ name: string; dose?: string | null; times?: string[]; source?: string | null; status?: string | null }>;
  documents: Array<{ id: string; type: string; docDate?: string | null; doctor?: string | null; diagnosisWritten?: string | null }>;
  /** Only events at or after this ISO time (e.g. last 14 days). */
  since?: string | null;
  now: Date;
}

export type TimelineSource = 'symptom_check' | 'patient_update' | 'correction' | 'mednest_advice';

export interface TimelineEntry {
  at: string;
  text: string;
  source: TimelineSource;
  refId: string;
}

export interface ComplaintSummary {
  complaint: string;
  firstReported: string;
  lastReported: string;
  onset: string | null;
  severities: Array<{ at: string; value: number }>;
  positives: string[];
  negatives: string[];
  remedies: string[];
  hadBefore: string | null;
  toClarify: string[];
  latestAdvice: string | null;
}

export interface VisitSummary {
  generatedAt: string;
  since: string | null;
  urgent: { disposition: string; at: string; complaint: string } | null;
  timeline: TimelineEntry[];
  complaints: ComplaintSummary[];
  medicines: string[];
  allergies: string | null;
  diagnoses: string[];
  empty: boolean;
}

const ADVICE: Record<string, string> = {
  emergency: 'emergency care advised',
  urgent: 'advised to see a doctor the same day',
  gp: 'advised to see a GP within a few days',
  self_care: 'advised to watch at home',
  insufficient: 'not enough information for advice',
};

const ts = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function slotLabel(protocolId: string | null | undefined, slotId: string): string {
  const p = PROTOCOLS.find((x) => x.id === protocolId);
  return p?.slots.find((s) => s.id === slotId)?.label ?? slotId;
}

/** Facts from one symptom check's answers, split into positive / negative / unknown. */
function facts(e: VisitEpisode) {
  const a = e.answers ?? {};
  const positives: string[] = [];
  const negatives: string[] = [];
  const unknown: string[] = [];
  let severity: number | null = null;
  let onset: string | null = null;
  let remedies: string | null = null;
  let hadBefore: string | null = null;
  for (const [id, v] of Object.entries(a)) {
    const label = slotLabel(e.protocolId, id);
    if (v.kind === 'skipped') unknown.push(label);
    else if (v.kind === 'scale') severity = v.value;
    else if (v.kind === 'duration') {
      const start = new Date(new Date(e.createdAt).getTime() - v.hours * 3600_000);
      onset = v.hours < 24 ? `${v.text} before this report (patient’s estimate)` : `about ${v.text} before this report — around ${day(start)} (patient’s estimate)`;
      if (v.text === 'today' || v.text.startsWith('since')) onset = `${v.text} (patient’s words), reported ${ts(e.createdAt)}`;
    } else if (v.kind === 'multi') {
      const real = v.labels.filter((l) => l !== 'None of these');
      if (real.length) positives.push(...real);
      else negatives.push(`${label}: none of the listed symptoms`);
    } else if (v.kind === 'yesno') {
      if (id === 'previous') hadBefore = v.value ? 'yes' : 'no';
      else (v.value ? positives : negatives).push(label);
    } else if (v.kind === 'choice') positives.push(`${label}: ${v.label}`);
    else if (v.kind === 'text') {
      if (id === 'remedies') remedies = /^(none|no|nothing|nahi)\b/i.test(v.value) ? null : v.value;
      else positives.push(`${label}: “${v.value}”`);
    }
  }
  return { positives, negatives, unknown, severity, onset, remedies, hadBefore };
}

const norm = (s: string) => s.trim().toLowerCase();

export function buildVisitSummary(input: VisitInput): VisitSummary {
  const since = input.since ?? null;
  const inWindow = (iso: string) => !since || iso >= since;
  const episodes = input.episodes.filter((e) => inWindow(e.createdAt)).sort((a, z) => a.createdAt.localeCompare(z.createdAt));
  const updates = input.updates.filter((u) => inWindow(u.at)).sort((a, z) => a.at.localeCompare(z.at));

  const timeline: TimelineEntry[] = [];
  const byComplaint = new Map<string, ComplaintSummary>();
  const get = (complaint: string, at: string) => {
    const key = norm(complaint);
    let c = byComplaint.get(key);
    if (!c) {
      c = { complaint, firstReported: at, lastReported: at, onset: null, severities: [], positives: [], negatives: [], remedies: [], hadBefore: null, toClarify: [], latestAdvice: null };
      byComplaint.set(key, c);
    }
    c.lastReported = at > c.lastReported ? at : c.lastReported;
    return c;
  };

  for (const e of episodes) {
    const f = facts(e);
    const c = get(e.complaint, e.createdAt);
    const seenBefore = new Set(c.positives);
    const parts = [`Reported ${e.complaint.toLowerCase()}`];
    if (f.severity !== null) parts.push(`severity ${f.severity}/10`);
    if (f.onset) parts.push(`started ${f.onset}`);
    const newPos = f.positives.filter((p) => !seenBefore.has(p));
    if (newPos.length) parts.push(`${c.positives.length ? 'new: ' : 'with: '}${newPos.join(', ')}`);
    if (f.negatives.length) parts.push(`no ${f.negatives.map((n) => n.toLowerCase()).join(', no ')}`);
    if (f.remedies) parts.push(`had taken: ${f.remedies}`);
    timeline.push({ at: e.createdAt, text: parts.join('; ') + '.', source: 'symptom_check', refId: e.id });
    if (e.disposition) timeline.push({ at: e.createdAt, text: `MedNest symptom check: ${ADVICE[e.disposition] ?? e.disposition} (rules-based, not a diagnosis).`, source: 'mednest_advice', refId: e.id });

    if (!c.onset && f.onset) c.onset = f.onset;
    if (f.severity !== null) c.severities.push({ at: e.createdAt, value: f.severity });
    c.positives.push(...newPos);
    for (const n of f.negatives) if (!c.negatives.includes(n) && !c.positives.includes(n)) c.negatives.push(n);
    if (f.remedies && !c.remedies.includes(f.remedies)) c.remedies.push(f.remedies);
    if (f.hadBefore) c.hadBefore = f.hadBefore;
    for (const u of f.unknown) if (!c.toClarify.includes(`Not answered: ${u.toLowerCase()}`)) c.toClarify.push(`Not answered: ${u.toLowerCase()}`);
    if (e.disposition) c.latestAdvice = ADVICE[e.disposition] ?? e.disposition;
  }

  for (const u of updates) {
    const c = get(u.complaint, u.at);
    const bits: string[] = [];
    if (u.severity !== null && u.severity !== undefined) {
      bits.push(`severity ${u.severity}/10`);
      c.severities.push({ at: u.at, value: u.severity });
    }
    if (u.newSymptoms?.trim()) {
      bits.push(`new symptoms: ${u.newSymptoms.trim()}`);
      c.positives.push(`${u.newSymptoms.trim()} (reported ${ts(u.at)})`);
    }
    if (u.note?.trim()) bits.push(`note: “${u.note.trim()}”`);
    if (!bits.length) continue;
    timeline.push({
      at: u.at,
      text: u.correctsId ? `Correction by patient (the earlier entry is kept): ${bits.join('; ')}.` : `Patient update on ${u.complaint.toLowerCase()}: ${bits.join('; ')}.`,
      source: u.correctsId ? 'correction' : 'patient_update',
      refId: u.id,
    });
  }

  const complaints = [...byComplaint.values()];
  for (const c of complaints) {
    c.severities.sort((a, z) => a.at.localeCompare(z.at));
    if (!c.onset) c.toClarify.push('When it started was not reported');
    if (!c.severities.length) c.toClarify.push('Severity was not reported');
    if (c.hadBefore === null) c.toClarify.push('Whether this has happened before was not reported');
  }

  // Recent urgent advice is shown first — a summary must never delay care.
  const recent = [...episodes].reverse().find((e) => (e.disposition === 'emergency' || e.disposition === 'urgent') && input.now.getTime() - new Date(e.createdAt).getTime() < 48 * 3600_000);

  return {
    generatedAt: input.now.toISOString(),
    since,
    urgent: recent ? { disposition: recent.disposition!, at: recent.createdAt, complaint: recent.complaint } : null,
    timeline: timeline.sort((a, z) => a.at.localeCompare(z.at)),
    complaints,
    medicines: input.medicines
      .filter((m) => !m.status || ['active', 'paused', 'pending'].includes(m.status))
      .map((m) => `${m.name}${m.dose ? ' ' + m.dose : ''}${m.status === 'paused' ? ' (paused)' : ''} — ${m.source === 'document_confirmed' ? 'from a prescription, confirmed by the patient' : 'entered by the patient'}`),
    allergies: input.profile.allergies?.trim() || null,
    diagnoses: input.documents.filter((x) => x.diagnosisWritten).map((x) => `${x.diagnosisWritten} — written by ${x.doctor ?? 'a doctor'} on a ${x.type.toLowerCase()}${x.docDate ? ` (${x.docDate})` : ''}`),
    empty: !timeline.length,
  };
}

function trend(sev: Array<{ at: string; value: number }>): string {
  if (!sev.length) return 'not reported';
  if (sev.length === 1) return `${sev[0]!.value}/10 (${ts(sev[0]!.at)})`;
  const first = sev[0]!, last = sev[sev.length - 1]!;
  const dir = last.value > first.value ? 'worse' : last.value < first.value ? 'better' : 'unchanged';
  return `${first.value}/10 (${ts(first.at)}) → ${last.value}/10 (${ts(last.at)}) — ${dir}; highest ${Math.max(...sev.map((s) => s.value))}/10`;
}

const SOURCE_TAG: Record<TimelineSource, string> = {
  symptom_check: 'patient-reported',
  patient_update: 'patient-reported',
  correction: 'patient correction',
  mednest_advice: 'MedNest',
};

/** Plain text for copy, download, print and sharing. */
export function renderVisitSummaryText(s: VisitSummary, profile: VisitInput['profile']): string {
  const L: string[] = [];
  L.push('DOCTOR VISIT SUMMARY');
  L.push(`Patient: ${profile.name}${profile.ageYears ? `, ${profile.ageYears} years` : ''}${profile.sex && profile.sex !== '-' ? `, ${profile.sex}` : ''}`);
  L.push(`Prepared: ${ts(s.generatedAt)}${s.since ? ` · covers reports since ${ts(s.since)}` : ''}`);
  L.push('Prepared by the patient with MedNest from their own reports and records. Not a diagnosis.');
  if (s.urgent) L.push('', `⚠ IMPORTANT: on ${ts(s.urgent.at)} MedNest advised ${s.urgent.disposition === 'emergency' ? 'EMERGENCY care' : 'seeing a doctor the same day'} for ${s.urgent.complaint.toLowerCase()}. Do not wait for a planned appointment.`);
  if (s.empty) {
    L.push('', 'No symptoms have been reported in this period.');
  } else {
    L.push('', 'TIMELINE');
    for (const t of s.timeline) L.push(`• ${ts(t.at)} — ${t.text} [${SOURCE_TAG[t.source]}]`);
    for (const c of s.complaints) {
      L.push('', `SUMMARY: ${c.complaint.toUpperCase()}`);
      L.push(`• First reported: ${ts(c.firstReported)}${c.lastReported !== c.firstReported ? ` · last report: ${ts(c.lastReported)}` : ''}`);
      L.push(`• Onset: ${c.onset ?? 'not reported'}`);
      L.push(`• Severity: ${trend(c.severities)}`);
      L.push(`• Reported symptoms / findings: ${c.positives.length ? c.positives.join('; ') : 'none beyond the main complaint'}`);
      if (c.negatives.length) L.push(`• Patient said NO to: ${c.negatives.join('; ')}`);
      L.push(`• Medicines taken for this (patient-reported): ${c.remedies.length ? c.remedies.join('; ') : 'none reported'}`);
      L.push(`• Happened before: ${c.hadBefore ?? 'not reported'}`);
      if (c.latestAdvice) L.push(`• Latest MedNest advice: ${c.latestAdvice}`);
      if (c.toClarify.length) L.push(`• Still to clarify: ${c.toClarify.join('; ')}`);
    }
  }
  L.push('', 'RECORDS IN MEDNEST');
  L.push(`• Allergies: ${s.allergies ?? 'none recorded'}`);
  L.push(`• Current medicines: ${s.medicines.length ? '' : 'none recorded'}`);
  for (const m of s.medicines) L.push(`   – ${m}`);
  L.push(`• Diagnoses written on documents: ${s.diagnoses.length ? '' : 'none recorded'}`);
  for (const d of s.diagnoses) L.push(`   – ${d}`);
  L.push('', 'Patient-reported information has not been verified by a clinician.');
  return L.join('\n');
}
