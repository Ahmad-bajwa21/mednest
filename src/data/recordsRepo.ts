// CRUD for documents, medicines and test results, plus loadBundle() which assembles a
// domain ProfileBundle for the pure logic (summary, patterns, trends, Ask).
import { eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { getDb } from './db';
import { documents, medicines, testResults, type DocumentRow, type MedicineRow, type TestResultRow } from './schema';
import type { ProfileBundle } from '../domain/types';
import { jsonArray, toJson } from './json';

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
  followUp?: string | null;
  medicines: Array<{ name: string; dose?: string | null; times: string[]; durationDays?: number | null }>;
  results: Array<{ test: string; value?: string | null; unit?: string | null; rangeLow?: number | null; rangeHigh?: number | null }>;
}

// Saves a confirmed document and its children in one go (the S9 "Confirm and save" step).
export async function saveConfirmedDocument(input: NewDocumentInput): Promise<string> {
  const db = await getDb();
  const docId = Crypto.randomUUID();
  const now = new Date().toISOString();
  const docRow: DocumentRow = {
    id: docId,
    profileId: input.profileId,
    type: input.type,
    docDate: input.docDate,
    doctor: input.doctor ?? null,
    facility: null,
    diagnosisWritten: null,
    imagePaths: null,
    ocrText: null,
    status: 'confirmed',
    modelVersion: null,
    followUp: input.followUp ?? null,
    createdAt: now,
  };
  await db.insert(documents).values(docRow);

  for (const m of input.medicines) {
    const row: MedicineRow = {
      id: Crypto.randomUUID(),
      profileId: input.profileId,
      documentId: docId,
      name: m.name,
      matchedMedicineId: null,
      dose: m.dose ?? null,
      frequencyCode: null,
      times: toJson(m.times),
      durationDays: m.durationDays ?? null,
      startDate: input.docDate,
      endDate: m.durationDays ? addDaysIso(input.docDate, m.durationDays) : null,
      instructions: null,
      active: true,
    };
    await db.insert(medicines).values(row);
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

  return docId;
}

export async function stopMedicine(id: string): Promise<void> {
  const db = await getDb();
  await db.update(medicines).set({ active: false, endDate: new Date().toISOString().slice(0, 10) }).where(eq(medicines.id, id));
}

export async function deleteDocumentCascade(docId: string): Promise<void> {
  const db = await getDb();
  await db.delete(medicines).where(eq(medicines.documentId, docId));
  await db.delete(testResults).where(eq(testResults.documentId, docId));
  await db.delete(documents).where(eq(documents.id, docId));
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
