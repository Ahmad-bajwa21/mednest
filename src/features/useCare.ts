// Loads one profile's care data (documents, medicines with schedule state, dose logs,
// appointments, symptom assessments, change log) for the dashboard, dose, follow-up,
// history and assistant screens.
import { useCallback, useEffect, useState } from 'react';
import { eq } from 'drizzle-orm';
import { getDb } from '../data/db';
import { documents } from '../data/schema';
import { getProfileById } from '../data/profileRepo';
import { listAppointments, listDoseLogs, listEpisodes, listMedicineRows, toSchedulable } from '../data/careRepo';
import { listAudit } from '../data/auditRepo';
import type { CareData } from '../domain/care';
import type { ProfileRow } from '../data/schema';
import type { DoseLogStatus } from '../domain/schedule';

export function useCare(id: string | undefined) {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [data, setData] = useState<CareData | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    const db = await getDb();
    const [p, docs, meds, logs, appts, eps, audit] = await Promise.all([
      getProfileById(id),
      db.select().from(documents).where(eq(documents.profileId, id)),
      listMedicineRows(id),
      listDoseLogs(id),
      listAppointments(id),
      listEpisodes(id),
      listAudit(id),
    ]);
    setProfile(p ?? null);
    setData({
      documents: docs.map((d) => ({ id: d.id, type: d.type, docDate: d.docDate, doctor: d.doctor, diagnosisWritten: d.diagnosisWritten, source: d.source, createdAt: d.createdAt })),
      medicines: meds.map((m) => ({ ...toSchedulable(m), documentId: m.documentId, source: m.source, updatedAt: m.updatedAt })),
      doseLogs: logs.map((l) => ({ doseKey: l.doseKey, status: l.status as DoseLogStatus, loggedAt: l.loggedAt })),
      appointments: appts.map((a) => ({ ...a })),
      episodes: eps.map((e) => ({ id: e.id, complaint: e.complaint, disposition: e.disposition, createdAt: e.createdAt, protocolId: e.protocolId })),
      audit,
    });
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { profile, data, reload };
}

export function ageFromBirthYear(birthYear: number | null | undefined, now = new Date()): number | null {
  return birthYear ? now.getFullYear() - birthYear : null;
}
