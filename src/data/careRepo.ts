// Medication status changes, dose logging, appointments/follow-ups and symptom
// assessments. Every write is mirrored to the audit log (./auditRepo).
import { and, eq, gte } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { getDb } from './db';
import { audit } from './auditRepo';
import { jsonArray, toJson } from './json';
import {
  appointments,
  chatSessions,
  doseLogs,
  medicines,
  symptomEpisodes,
  type AppointmentRow,
  type DoseLogRow,
  type MedicineRow,
  type SymptomEpisodeRow,
} from './schema';
import type { MedStatus, SchedulableMedicine, DoseLogStatus } from '../domain/schedule';
import type { TriageState, Disposition } from '../ai/triage/engine';
import { TRIAGE_ENGINE_VERSION } from '../ai/triage/engine';
import { protocolById } from '../ai/triage/protocols';

/* ============================== medicines ============================== */

export function toSchedulable(m: MedicineRow): SchedulableMedicine {
  return {
    id: m.id,
    name: m.name,
    dose: m.dose,
    times: jsonArray(m.times),
    startDate: m.startDate,
    endDate: m.endDate,
    durationDays: m.durationDays,
    instructions: m.instructions,
    status: (m.status as MedStatus) ?? (m.active ? 'active' : 'discontinued'),
    asNeeded: m.asNeeded,
    confirmedAt: m.confirmedAt,
  };
}

export async function listMedicineRows(profileId: string): Promise<MedicineRow[]> {
  const db = await getDb();
  return db.select().from(medicines).where(eq(medicines.profileId, profileId));
}

export async function setMedicineStatus(id: string, status: MedStatus): Promise<void> {
  const db = await getDb();
  const [before] = await db.select().from(medicines).where(eq(medicines.id, id));
  if (!before) return;
  const today = new Date().toISOString().slice(0, 10);
  const ended = status === 'completed' || status === 'discontinued';
  await db
    .update(medicines)
    .set({ status, active: !ended, endDate: ended && !before.endDate ? today : before.endDate, updatedAt: new Date().toISOString() })
    .where(eq(medicines.id, id));
  await audit(before.profileId, 'medicine', id, 'status', { before: before.status, after: status });
}

export interface MedicineEdit {
  name: string;
  dose: string | null;
  times: string[];
  durationDays: number | null;
  startDate: string | null;
  instructions: string | null;
  asNeeded: boolean;
}

/** User edit of a schedule. Confirms it (the user is looking at it) and logs before/after. */
export async function editMedicine(id: string, edit: MedicineEdit): Promise<void> {
  const db = await getDb();
  const [before] = await db.select().from(medicines).where(eq(medicines.id, id));
  if (!before) return;
  const now = new Date().toISOString();
  await db
    .update(medicines)
    .set({
      name: edit.name,
      dose: edit.dose,
      times: toJson(edit.times),
      durationDays: edit.durationDays,
      startDate: edit.startDate,
      endDate: null, // recomputed from start + duration
      instructions: edit.instructions,
      asNeeded: edit.asNeeded,
      confirmedAt: now,
      status: before.status === 'pending' ? 'active' : before.status,
      updatedAt: now,
    })
    .where(eq(medicines.id, id));
  await audit(before.profileId, 'medicine', id, 'update', {
    before: { name: before.name, dose: before.dose, times: jsonArray(before.times), durationDays: before.durationDays, startDate: before.startDate, instructions: before.instructions },
    after: edit,
  });
}

/* ============================== doses ============================== */

export async function listDoseLogs(profileId: string, sinceIso?: string): Promise<DoseLogRow[]> {
  const db = await getDb();
  const where = sinceIso ? and(eq(doseLogs.profileId, profileId), gte(doseLogs.scheduledAt, sinceIso)) : eq(doseLogs.profileId, profileId);
  return db.select().from(doseLogs).where(where);
}

/** The user marked a dose. One row per dose key (re-marking replaces, and is audited). */
export async function logDose(profileId: string, medicineId: string, doseKey: string, scheduledAt: number, status: DoseLogStatus): Promise<void> {
  const db = await getDb();
  const [before] = await db.select().from(doseLogs).where(eq(doseLogs.doseKey, doseKey));
  const row = {
    profileId,
    medicineId,
    doseKey,
    scheduledAt: new Date(scheduledAt).toISOString(),
    status,
    loggedAt: new Date().toISOString(),
  };
  if (before) await db.update(doseLogs).set(row).where(eq(doseLogs.id, before.id));
  else await db.insert(doseLogs).values({ id: Crypto.randomUUID(), reminderId: null, ...row });
  await audit(profileId, 'dose', doseKey, before ? 'update' : 'create', { before: before?.status, after: status });
}

/* ============================== appointments ============================== */

export type AppointmentStatus = 'proposed' | 'planned' | 'completed' | 'cancelled';

export async function listAppointments(profileId: string): Promise<AppointmentRow[]> {
  const db = await getDb();
  return db.select().from(appointments).where(eq(appointments.profileId, profileId));
}

export interface AppointmentInput {
  profileId: string;
  documentId?: string | null;
  date: string | null;
  time?: string | null;
  doctor?: string | null;
  reason?: string | null;
  sourceText?: string | null;
  basis: 'written_date' | 'relative_to_document' | 'needs_user' | 'manual';
  status: AppointmentStatus;
}

export async function createAppointment(input: AppointmentInput): Promise<string> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(appointments).values({
    id,
    profileId: input.profileId,
    documentId: input.documentId ?? null,
    date: input.date,
    time: input.time ?? null,
    doctor: input.doctor ?? null,
    reason: input.reason ?? null,
    sourceText: input.sourceText ?? null,
    basis: input.basis,
    status: input.status,
    createdAt: now,
    updatedAt: now,
  });
  await audit(input.profileId, 'appointment', id, 'create', { after: input });
  return id;
}

export async function updateAppointment(id: string, patch: Partial<Pick<AppointmentRow, 'date' | 'time' | 'doctor' | 'reason' | 'status'>>): Promise<void> {
  const db = await getDb();
  const [before] = await db.select().from(appointments).where(eq(appointments.id, id));
  if (!before) return;
  if (patch.status === 'planned' && !(patch.date ?? before.date)) throw new Error('A follow-up needs a date before it can be confirmed.');
  await db.update(appointments).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(appointments.id, id));
  await audit(before.profileId, 'appointment', id, patch.status && patch.status !== before.status ? 'status' : 'update', {
    before: { date: before.date, time: before.time, status: before.status },
    after: patch,
  });
}

/* ============================== symptom assessments ============================== */

export async function listEpisodes(profileId: string): Promise<SymptomEpisodeRow[]> {
  const db = await getDb();
  return db.select().from(symptomEpisodes).where(eq(symptomEpisodes.profileId, profileId));
}

/** Save a finished assistant conversation: the assessment plus its full transcript. */
export async function saveAssessment(profileId: string, state: TriageState, summary: string): Promise<string> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  const complaint = state.complaint ?? protocolById(state.protocolId)?.label ?? 'Symptom check';
  await db.insert(symptomEpisodes).values({
    id,
    profileId,
    protocolId: state.protocolId,
    complaint,
    answers: JSON.stringify(state.answers),
    flags: JSON.stringify(state.flags),
    disposition: (state.disposition as Disposition | null) ?? null,
    summary,
    engineVersion: TRIAGE_ENGINE_VERSION,
    createdAt: now,
  });
  await db.insert(chatSessions).values({ id: Crypto.randomUUID(), profileId, episodeId: id, transcript: JSON.stringify(state.transcript), createdAt: now });
  await audit(profileId, 'episode', id, 'create', { note: `${complaint} → ${state.disposition ?? 'incomplete'}` });
  return id;
}
