// CRUD for documents, medicines and test results, plus loadBundle() which assembles a
// domain ProfileBundle for the pure logic (summary, patterns, trends, Ask).
import { eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { getDb } from './db';
import { appointments, documents, medicines, testResults, type DocumentRow, type MedicineRow, type TestResultRow } from './schema';
import type { ProfileBundle } from '../domain/types';
import { jsonArray, toJson } from './json';
import { audit } from './auditRepo';
import { createAppointment, setMedicineStatus } from './careRepo';
import { scheduleBlockers } from '../domain/schedule';
import { deleteImages } from './files';

export async function loadBundle(profileId: string, profile: ProfileBundle['profile']): Promise<ProfileBundle> {
  const db = await getDb();
  const [docs, meds, results] = await Promise.all([
    db.select().from(documents).where(eq(documents.profileId, profileId)),
    db.select().from(medicines).where(eq(medicines.profileId, profileId)),
    db.select().from(testResults).where(eq(testResults.profileId, profileId)),
  ]);
  return {
    profile,
    documents: docs.map((d) => ({ id: d.id, type: d.type, docDate: d.docDate, doctor: d.doctor, followUp: d.followUp })),
    medicines: meds.map((m) => ({
      id: m.id,
      documentId: m.documentId,
      name: m.name,
      dose: m.dose,
      times: jsonArray(m.times),
      durationDays: m.durationDays,
      startDate: m.startDate,
      active: m.active,
    })),
    results: results.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      docDate: r.docDate,
      test: r.testNameRaw,
      value: r.value,
      unit: r.unit,
      rangeLow: r.rangeLow,
      rangeHigh: r.rangeHigh,
    })),
  };
}

export interface NewDocumentInput {
  profileId: string;
  type: string;
  docDate: string;
  doctor?: string | null;
  diagnosisWritten?: string | null;
  /** How it arrived: camera | gallery | file | manual. */
  source?: 'camera' | 'gallery' | 'file' | 'manual';
  /** Original page images — always kept, even when extraction failed (spec §3/§11). */
  imagePaths?: string[];
  ocrText?: string | null;
  /** Raw AI extraction, kept so AI-read values stay distinguishable from confirmed ones. */
  extractionJson?: string | null;
  modelVersion?: string | null;
  medicines: Array<{
    name: string;
    dose?: string | null;
    times: string[];
    durationDays?: number | null;
    instructions?: string | null;
    asNeeded?: boolean;
    startDate?: string | null;
  }>;
  results: Array<{ test: string; value?: string | null; unit?: string | null; rangeLow?: number | null; rangeHigh?: number | null }>;
  /** Follow-up as written + the date the user confirmed (or null while undecided). */
  followUp?: { text: string | null; date: string | null; basis: 'written_date' | 'relative_to_document' | 'needs_user' | 'manual'; confirmed: boolean } | null;
}

// Saves a confirmed document and its children in one go (the S9 "Confirm and save" step).
// Medicines are saved as confirmed by the user; any that still lack something needed for
// reminders are saved as 'pending' and appear under Pending confirmations.
export async function saveConfirmedDocument(input: NewDocumentInput): Promise<string> {
  const db = await getDb();
  const docId = Crypto.randomUUID();
  const now = new Date().toISOString();
  const fromDocument = input.source && input.source !== 'manual';
  const docRow: DocumentRow = {
    id: docId,
    profileId: input.profileId,
    type: input.type,
    docDate: input.docDate,
    doctor: input.doctor ?? null,
    facility: null,
    diagnosisWritten: input.diagnosisWritten ?? null,
    imagePaths: input.imagePaths?.length ? toJson(input.imagePaths) : null,
    ocrText: input.ocrText ?? null,
    status: 'confirmed',
    modelVersion: input.modelVersion ?? null,
    followUp: input.followUp?.date ?? input.followUp?.text ?? null,
    source: input.source ?? 'manual',
    extractionJson: input.extractionJson ?? null,
    createdAt: now,
  };
  await db.insert(documents).values(docRow);
  await audit(input.profileId, 'document', docId, 'create', { note: `${input.type} (${docRow.source})` });

  for (const m of input.medicines) {
    const startDate = m.startDate ?? input.docDate;
    const draft = {
      id: Crypto.randomUUID(),
      name: m.name,
      dose: m.dose ?? null,
      times: m.times,
      startDate,
      durationDays: m.durationDays ?? null,
      instructions: m.instructions ?? null,
      asNeeded: !!m.asNeeded,
      confirmedAt: now,
      status: 'active' as const,
    };
    const status = scheduleBlockers(draft).length ? 'pending' : 'active';
    const row: MedicineRow = {
      id: draft.id,
      profileId: input.profileId,
      documentId: docId,
      name: m.name,
      matchedMedicineId: null,
      dose: draft.dose,
      frequencyCode: null,
      times: toJson(m.times),
      durationDays: draft.durationDays,
      startDate,
      endDate: null, // derived from start + duration (domain/schedule.effectiveEndDate)
      instructions: draft.instructions,
      active: true,
      status,
      asNeeded: draft.asNeeded,
      source: fromDocument ? 'document_confirmed' : 'manual',
      confirmedAt: now,
      updatedAt: now,
    };
    await db.insert(medicines).values(row);
    await audit(input.profileId, 'medicine', row.id, 'create', { after: { name: row.name, dose: row.dose, times: m.times, status } });
  }

  for (const r of input.results) {
    const row: TestResultRow = {
      id: Crypto.randomUUID(),
      profileId: input.profileId,
      documentId: docId,
      testCode: null,
      testNameRaw: r.test,
      value: r.value ?? null,
      unit: r.unit ?? null,
      rangeLow: r.rangeLow ?? null,
      rangeHigh: r.rangeHigh ?? null,
      flag: null,
      docDate: input.docDate,
    };
    await db.insert(testResults).values(row);
  }

  const f = input.followUp;
  if (f && (f.text || f.date)) {
    await createAppointment({
      profileId: input.profileId,
      documentId: docId,
      date: f.date,
      doctor: input.doctor ?? null,
      reason: f.text ? `Follow-up: ${f.text}` : 'Follow-up',
      sourceText: f.text,
      basis: f.basis,
      // Reminders only for a confirmed date; otherwise it waits in Pending confirmations.
      status: f.confirmed && f.date ? 'planned' : 'proposed',
    });
  }

  return docId;
}

export async function getDocumentRow(docId: string): Promise<DocumentRow | undefined> {
  const db = await getDb();
  const [row] = await db.select().from(documents).where(eq(documents.id, docId));
  return row;
}

export async function stopMedicine(id: string): Promise<void> {
  await setMedicineStatus(id, 'discontinued');
}

export async function deleteDocumentCascade(docId: string): Promise<void> {
  const db = await getDb();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  await db.delete(medicines).where(eq(medicines.documentId, docId));
  await db.delete(testResults).where(eq(testResults.documentId, docId));
  await db.delete(appointments).where(eq(appointments.documentId, docId));
  await db.delete(documents).where(eq(documents.id, docId));
  if (doc?.imagePaths) await deleteImages(jsonArray(doc.imagePaths));
  // The user deleted it; the audit row keeps a trace that it existed (no content).
  await audit(doc?.profileId ?? null, 'document', docId, 'delete', { note: doc ? `${doc.type} of ${doc.docDate ?? 'unknown date'}` : undefined });
}
