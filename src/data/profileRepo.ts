// Profile repository. The 4-profile cap (spec §5.1 RULE) is enforced HERE, in the
// data layer, so it also covers import and restore — not just the Add-profile UI.
import { eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { getDb } from './db';
import { jsonArray } from './json';
import { deleteImages } from './files';
import { profiles, documents, medicines, testResults, reminders, chunks, patternNotes, summaries, MAX_PROFILES, type ProfileRow, doseLogs, appointments, symptomEpisodes, chatSessions, auditLog } from './schema';

export class ProfileCapError extends Error {
  constructor() {
    super('You already have 4 profiles. Remove one to add another.');
    this.name = 'ProfileCapError';
  }
}

export async function countProfiles(): Promise<number> {
  const db = await getDb();
  const rows = await db.select({ id: profiles.id }).from(profiles);
  return rows.length;
}

export async function listProfiles(): Promise<ProfileRow[]> {
  const db = await getDb();
  return db.select().from(profiles);
}

export async function getProfileById(id: string): Promise<ProfileRow | undefined> {
  const db = await getDb();
  const rows = await db.select().from(profiles).where(eq(profiles.id, id));
  return rows[0];
}

export type NewProfile = Omit<ProfileRow, 'id' | 'createdAt'> & { id?: string; createdAt?: string };

// The ONLY sanctioned way to create a profile. Both this and the import/restore
// path MUST call insertProfileChecked so the cap can never be bypassed.
export async function insertProfileChecked(p: NewProfile): Promise<ProfileRow> {
  const db = await getDb();
  if ((await countProfiles()) >= MAX_PROFILES) throw new ProfileCapError();
  const row: ProfileRow = {
    ...p,
    id: p.id ?? Crypto.randomUUID(),
    createdAt: p.createdAt ?? new Date().toISOString(),
  } as ProfileRow;
  await db.insert(profiles).values(row);
  return row;
}

export async function updateProfile(id: string, patch: Partial<ProfileRow>): Promise<void> {
  const db = await getDb();
  await db.update(profiles).set(patch).where(eq(profiles.id, id));
}

// Deleting a profile removes ALL of its data (spec §5.1): documents, medicines,
// results, reminders, doses, appointments, symptom assessments, chats, chunks, pattern
// notes, the summary and its audit trail.
export async function deleteProfileCascade(id: string): Promise<void> {
  const db = await getDb();
  const docs = await db.select({ imagePaths: documents.imagePaths }).from(documents).where(eq(documents.profileId, id));
  await deleteImages(docs.flatMap((d) => jsonArray(d.imagePaths)));
  await db.delete(documents).where(eq(documents.profileId, id));
  await db.delete(medicines).where(eq(medicines.profileId, id));
  await db.delete(testResults).where(eq(testResults.profileId, id));
  await db.delete(reminders).where(eq(reminders.profileId, id));
  await db.delete(doseLogs).where(eq(doseLogs.profileId, id));
  await db.delete(appointments).where(eq(appointments.profileId, id));
  await db.delete(symptomEpisodes).where(eq(symptomEpisodes.profileId, id));
  await db.delete(chatSessions).where(eq(chatSessions.profileId, id));
  await db.delete(auditLog).where(eq(auditLog.profileId, id));
  await db.delete(chunks).where(eq(chunks.profileId, id));
  await db.delete(patternNotes).where(eq(patternNotes.profileId, id));
  await db.delete(summaries).where(eq(summaries.profileId, id));
  await db.delete(profiles).where(eq(profiles.id, id));
}
