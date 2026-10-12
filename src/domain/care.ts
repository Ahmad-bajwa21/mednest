// Dashboard + unified history views (spec §8/§9). Pure functions over plain shapes so
// they are testable off-device. Every history entry carries its provenance, so
// AI-read, patient-reported, user-entered and doctor-written information stay distinct.
import {
  addDaysLocal,
  deriveStatus,
  doseOccurrences,
  doseState,
  localDateIso,
  scheduleBlockers,
  type DoseLogLike,
  type DoseOccurrence,
  type DoseState,
  type SchedulableMedicine,
} from './schedule';

export interface CareMedicine extends SchedulableMedicine {
  documentId?: string | null;
  source?: string | null;
  updatedAt?: string | null;
}
export interface CareAppointment {
  id: string;
  documentId?: string | null;
  date: string | null;
  time?: string | null;
  doctor?: string | null;
  reason?: string | null;
  sourceText?: string | null;
  basis?: string | null;
  status: string; // proposed | planned | completed | cancelled
  createdAt: string;
}
export interface CareEpisode {
  id: string;
  protocolId?: string | null;
  complaint: string;
  disposition?: string | null;
  createdAt: string;
}
export interface CareDocument {
  id: string;
  type: string;
  docDate?: string | null;
  doctor?: string | null;
  diagnosisWritten?: string | null;
  source?: string | null;
  createdAt?: string | null;
}
export interface CareAudit {
  entity: string;
  entityId?: string | null;
  action: string;
  detail?: string | null;
  at: string;
}

export interface CareData {
  documents: CareDocument[];
  medicines: CareMedicine[];
  appointments: CareAppointment[];
  episodes: CareEpisode[];
  doseLogs: DoseLogLike[];
  audit?: CareAudit[];
}

/* ============================== Today's medicines ============================== */
export interface TodayDose {
  occ: DoseOccurrence;
  medicine: CareMedicine;
  state: DoseState;
}

export function todaysDoses(meds: CareMedicine[], logs: DoseLogLike[], now: Date): TodayDose[] {
  const today = localDateIso(now);
  const byKey = new Map(logs.map((l) => [l.doseKey, l]));
  return meds
    .flatMap((m) => doseOccurrences(m, today, today).map((occ) => ({ occ, medicine: m, state: doseState(occ, byKey.get(occ.key), now.getTime()) })))
    .sort((a, z) => a.occ.at - z.occ.at);
}

/** Past doses for the dose history screen, newest first. */
export function pastDoses(meds: CareMedicine[], logs: DoseLogLike[], now: Date, days = 14): TodayDose[] {
  const today = localDateIso(now);
  const from = addDaysLocal(today, -(days - 1));
  const byKey = new Map(logs.map((l) => [l.doseKey, l]));
  return meds
    .flatMap((m) => doseOccurrences(m, from, today).map((occ) => ({ occ, medicine: m, state: doseState(occ, byKey.get(occ.key), now.getTime()) })))
    .filter((d) => d.occ.at <= now.getTime())
    .sort((a, z) => z.occ.at - a.occ.at);
}

/* ============================== Appointments ============================== */
export function upcomingAppointments(appts: CareAppointment[], today: string, days = 60): CareAppointment[] {
  const until = addDaysLocal(today, days);
  return appts
    .filter((a) => a.status === 'planned' && a.date && a.date >= today && a.date <= until)
    .sort((a, z) => `${a.date}${a.time ?? ''}`.localeCompare(`${z.date}${z.time ?? ''}`));
}

/* ============================== Pending confirmations ============================== */
export interface PendingItem {
  kind: 'medicine' | 'appointment' | 'overdue_followup';
  id: string;
  title: string;
  detail: string;
}

export function pendingConfirmations(data: CareData, today: string): PendingItem[] {
  const out: PendingItem[] = [];
  for (const m of data.medicines) {
    const status = deriveStatus(m, today);
    if (status !== 'active' && status !== 'pending') continue;
    const blockers = scheduleBlockers(m);
    if (m.status === 'pending' || blockers.length) {
      out.push({ kind: 'medicine', id: m.id, title: `${m.name || 'Medicine'}: reminders not set`, detail: blockers.join(' · ') || 'Needs your confirmation' });
    }
  }
  for (const a of data.appointments) {
    if (a.status === 'proposed') {
      out.push({
        kind: 'appointment',
        id: a.id,
        title: a.date ? `Confirm follow-up on ${a.date}` : 'Choose a follow-up date',
        detail: a.sourceText ? `Document says: “${a.sourceText}”` : a.reason ?? 'Follow-up',
      });
    } else if (a.status === 'planned' && a.date && a.date < today) {
      out.push({ kind: 'overdue_followup', id: a.id, title: `Follow-up on ${a.date}: did it happen?`, detail: 'Mark it completed or reschedule it.' });
    }
  }
  return out;
}

/* ============================== Unified history ============================== */
export type HistoryKind = 'document' | 'medicine_start' | 'medicine_change' | 'symptom' | 'appointment' | 'diagnosis';

export interface HistoryEntry {
  date: string; // YYYY-MM-DD or ISO
  kind: HistoryKind;
  title: string;
  detail?: string;
  provenance: string;
  refId: string;
}

const DOC_SOURCE: Record<string, string> = {
  camera: 'Scanned · read by AI, confirmed by you',
  gallery: 'From gallery · read by AI, confirmed by you',
  file: 'From file · read by AI, confirmed by you',
  manual: 'Entered by you',
};
const BASIS: Record<string, string> = {
  written_date: 'Date written on the document',
  relative_to_document: 'Date calculated from the document date, confirmed by you',
  needs_user: 'Date chosen by you',
  manual: 'Added by you',
};
const DISPOSITION_LABEL: Record<string, string> = {
  emergency: 'Advised emergency care',
  urgent: 'Advised seeing a doctor the same day',
  gp: 'Advised seeing a GP',
  self_care: 'Advised watching at home',
  insufficient: 'Not enough information',
};

export function historyEntries(data: CareData): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const d of data.documents) {
    const date = d.docDate ?? d.createdAt ?? '';
    out.push({ date, kind: 'document', title: `${d.type}${d.doctor ? ` · ${d.doctor}` : ''}`, provenance: DOC_SOURCE[d.source ?? 'manual'] ?? 'Entered by you', refId: d.id });
    if (d.diagnosisWritten) out.push({ date, kind: 'diagnosis', title: `Diagnosis written: ${d.diagnosisWritten}`, provenance: 'Written by the doctor on the document', refId: d.id });
  }
  for (const m of data.medicines) {
    out.push({
      date: m.startDate ?? m.confirmedAt ?? '',
      kind: 'medicine_start',
      title: `Started ${m.name}${m.dose ? ` ${m.dose}` : ''}`,
      detail: [m.times.join(', '), m.durationDays ? `${m.durationDays} days` : null, m.instructions].filter(Boolean).join(' · ') || undefined,
      provenance: m.source === 'document_confirmed' ? 'From a prescription · AI-read, confirmed by you' : 'Entered by you',
      refId: m.id,
    });
  }
  for (const e of data.episodes) {
    out.push({
      date: e.createdAt,
      kind: 'symptom',
      title: `Reported: ${e.complaint}`,
      detail: e.disposition ? DISPOSITION_LABEL[e.disposition] : undefined,
      provenance: 'Reported by you · rules-based assistant, not a diagnosis',
      refId: e.id,
    });
  }
  for (const a of data.appointments) {
    if (a.status === 'proposed' || !a.date) continue;
    out.push({
      date: a.date,
      kind: 'appointment',
      title: `${a.status === 'completed' ? 'Follow-up done' : a.status === 'cancelled' ? 'Follow-up cancelled' : 'Follow-up planned'}${a.doctor ? ` · ${a.doctor}` : ''}`,
      detail: a.reason ?? undefined,
      provenance: BASIS[a.basis ?? 'manual'] ?? 'Added by you',
      refId: a.id,
    });
  }
  for (const c of data.audit ?? []) {
    if (c.entity !== 'medicine' || (c.action !== 'status' && c.action !== 'update')) continue;
    const med = data.medicines.find((m) => m.id === c.entityId);
    const detail = safeJson(c.detail);
    out.push({
      date: c.at,
      kind: 'medicine_change',
      title: c.action === 'status' ? `${med?.name ?? 'Medicine'}: ${String(detail?.before ?? '')} → ${String(detail?.after ?? '')}` : `${med?.name ?? 'Medicine'}: schedule edited`,
      provenance: 'Changed by you',
      refId: c.entityId ?? '',
    });
  }
  return out.sort((a, z) => z.date.localeCompare(a.date));
}

function safeJson(s: string | null | undefined): Record<string, unknown> | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}
