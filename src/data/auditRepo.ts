// Append-only audit log (spec §8/§11). Every change to the medical record writes one
// row with what it was before, so history is never silently overwritten.
import { desc, eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { getDb } from './db';
import { auditLog, type AuditRow } from './schema';

export type AuditEntity = 'document' | 'medicine' | 'appointment' | 'dose' | 'episode' | 'profile';
export type AuditAction = 'create' | 'update' | 'status' | 'delete' | 'export';

export async function audit(
  profileId: string | null,
  entity: AuditEntity,
  entityId: string | null,
  action: AuditAction,
  detail?: { before?: unknown; after?: unknown; note?: string },
): Promise<void> {
  const db = await getDb();
  await db.insert(auditLog).values({
    id: Crypto.randomUUID(),
    profileId,
    entity,
    entityId,
    action,
    detail: detail ? JSON.stringify(detail) : null,
    at: new Date().toISOString(),
  });
}

export async function listAudit(profileId: string, limit = 200): Promise<AuditRow[]> {
  const db = await getDb();
  return db.select().from(auditLog).where(eq(auditLog.profileId, profileId)).orderBy(desc(auditLog.at)).limit(limit);
}
