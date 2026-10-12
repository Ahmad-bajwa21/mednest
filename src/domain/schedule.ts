// Medication schedule + reminder generation (spec §5–§6, S12/S13). Pure code — the
// model never computes dates, times or counts. Rules:
//  - a medicine is only schedulable when its instructions were CONFIRMED and nothing
//    needed is missing (scheduleBlockers); missing values are never invented;
//  - each dose has a stable key (medicineId:date:HH:mm) used as the alarm id, so
//    re-scheduling replaces instead of duplicating;
//  - a dose is "taken"/"skipped" ONLY when the user logged it. An alarm being shown is
//    not a dose being taken; an unlogged past dose is "missed" after a grace period;
//  - alarms are built from local wall-clock times over a short horizon and fully
//    rebuilt on app start, boot, time-zone change and any medicine edit (rescheduleAll),
//    which keeps us inside OS limits on pending alarms.
import type { ScheduledAlarm } from '../native/types';
import { SLOT_CLOCK } from './types';

export type MedStatus = 'pending' | 'active' | 'paused' | 'completed' | 'discontinued';

export interface SchedulableMedicine {
  id: string;
  name: string;
  dose?: string | null;
  /** Slots ("Morning") or clock times ("08:00"). */
  times: string[];
  startDate?: string | null;
  endDate?: string | null;
  durationDays?: number | null;
  instructions?: string | null;
  status: MedStatus;
  asNeeded?: boolean;
  /** Set once the user confirmed the instructions on the review screen. */
  confirmedAt?: string | null;
}

export interface DoseOccurrence {
  key: string;
  medicineId: string;
  date: string; // YYYY-MM-DD (local)
  time: string; // HH:mm (local)
  at: number; // epoch ms
}

export type DoseLogStatus = 'taken' | 'skipped' | 'missed';
export interface DoseLogLike {
  doseKey: string;
  status: DoseLogStatus;
  loggedAt?: string | null;
}
export type DoseState = 'upcoming' | 'due' | 'taken' | 'skipped' | 'missed';

export const MISSED_GRACE_MINUTES = 120;
export const ALARM_HORIZON_DAYS = 3;
export const MAX_PENDING_ALARMS = 60;
export const SNOOZE_MINUTES = 15;
export const MAX_SNOOZES = 3;

/* ---------- dates in LOCAL time ---------- */
export function localDateIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function pad(n: number) {
  return String(n).padStart(2, '0');
}
export function parseLocalDate(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  return d.getMonth() === +m[2]! - 1 ? d : null;
}
export function addDaysLocal(iso: string, n: number): string {
  const d = parseLocalDate(iso)!;
  d.setDate(d.getDate() + n);
  return localDateIso(d);
}

/** "Morning" -> "08:00", "8:00" -> "08:00", "20:30" -> "20:30"; null if unreadable. */
export function resolveTime(t: string): string | null {
  const clock = SLOT_CLOCK[t] ?? t;
  const m = clock.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1]!;
  const min = +m[2]!;
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}

/** Last day of treatment (inclusive), or null for open-ended. "5 days from the 1st" ends on the 5th. */
export function effectiveEndDate(m: SchedulableMedicine): string | null {
  if (m.endDate) return m.endDate;
  if (m.startDate && m.durationDays && m.durationDays > 0) return addDaysLocal(m.startDate, m.durationDays - 1);
  return null;
}

/**
 * Why this medicine cannot have reminders yet. Empty = ready. These are shown in
 * "Pending confirmations"; nothing here is ever filled in automatically.
 */
export function scheduleBlockers(m: SchedulableMedicine): string[] {
  const out: string[] = [];
  if (!m.confirmedAt) out.push('Instructions not confirmed yet');
  if (!m.name.trim()) out.push('Medicine name missing');
  if (!m.dose?.trim()) out.push('Dose missing');
  if (m.asNeeded) return out; // "when needed" medicines never get timed reminders
  if (!m.times.length) out.push('How often / what times is missing');
  const bad = m.times.filter((t) => !resolveTime(t));
  if (bad.length) out.push(`Unclear time: ${bad.join(', ')}`);
  if (!m.startDate) out.push('Start date missing');
  return out;
}

export function isSchedulable(m: SchedulableMedicine): boolean {
  return m.status === 'active' && !m.asNeeded && scheduleBlockers(m).length === 0;
}

/** Status shown to the user; an active course past its end date reads as completed. */
export function deriveStatus(m: SchedulableMedicine, today: string): MedStatus {
  if (m.status !== 'active') return m.status;
  const end = effectiveEndDate(m);
  return end && end < today ? 'completed' : 'active';
}

export function doseKey(medicineId: string, date: string, time: string): string {
  return `${medicineId}:${date}:${time}`;
}

/** Every dose of one medicine between two local dates (inclusive). */
export function doseOccurrences(m: SchedulableMedicine, fromDate: string, toDate: string): DoseOccurrence[] {
  if (!isSchedulable(m)) return [];
  const start = m.startDate! > fromDate ? m.startDate! : fromDate;
  const endTreat = effectiveEndDate(m);
  const end = endTreat && endTreat < toDate ? endTreat : toDate;
  const times = [...new Set(m.times.map(resolveTime).filter((t): t is string => !!t))].sort();
  const out: DoseOccurrence[] = [];
  for (let day = start; day <= end; day = addDaysLocal(day, 1)) {
    for (const time of times) {
      const d = parseLocalDate(day)!;
      const [h, min] = time.split(':').map(Number);
      d.setHours(h!, min!, 0, 0);
      out.push({ key: doseKey(m.id, day, time), medicineId: m.id, date: day, time, at: d.getTime() });
    }
  }
  return out;
}

export function doseState(occ: DoseOccurrence, log: DoseLogLike | undefined, now: number): DoseState {
  if (log) return log.status;
  if (now < occ.at) return 'upcoming';
  if (now <= occ.at + MISSED_GRACE_MINUTES * 60_000) return 'due';
  return 'missed';
}

export function reminderBody(m: Pick<SchedulableMedicine, 'name' | 'dose' | 'instructions'>, time: string): string {
  return [m.name, m.dose ? `Dose: ${m.dose}` : null, `Time: ${formatTime(time)}`, m.instructions ? `Instruction: ${m.instructions}` : null].filter(Boolean).join(' · ');
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h! >= 12 ? 'PM' : 'AM';
  return `${((h! + 11) % 12) + 1}:${pad(m!)} ${suffix}`;
}

/**
 * Full set of upcoming dose alarms for these medicines, de-duplicated by dose key and
 * capped, excluding doses the user already logged. Pass to AlarmScheduler.rescheduleAll.
 */
export function buildDoseAlarms(
  meds: SchedulableMedicine[],
  logs: DoseLogLike[],
  now: Date,
  opts: { profileName?: string; hideOnLockScreen?: boolean } = {},
): ScheduledAlarm[] {
  const today = localDateIso(now);
  const until = addDaysLocal(today, ALARM_HORIZON_DAYS - 1);
  const logged = new Set(logs.map((l) => l.doseKey));
  const seen = new Set<string>();
  const alarms: ScheduledAlarm[] = [];
  for (const m of meds) {
    for (const occ of doseOccurrences(m, today, until)) {
      if (occ.at <= now.getTime() || logged.has(occ.key) || seen.has(occ.key)) continue;
      seen.add(occ.key);
      alarms.push({
        id: `dose:${occ.key}`,
        at: occ.at,
        title: opts.profileName ? `Medicine reminder · ${opts.profileName}` : 'Medicine reminder',
        body: reminderBody(m, occ.time),
        lockScreenBody: opts.hideOnLockScreen ? 'MedNest reminder' : undefined,
        category: 'dose',
        data: { kind: 'dose', medicineId: m.id, doseKey: occ.key, at: occ.at, snoozeCount: 0 },
      });
    }
  }
  return alarms.sort((a, z) => a.at - z.at).slice(0, MAX_PENDING_ALARMS);
}

/** Snooze replaces itself (same id) so repeated "Later" never stacks reminders. */
export function snoozeAlarm(original: ScheduledAlarm, snoozeCount: number, now: Date): ScheduledAlarm | null {
  if (snoozeCount >= MAX_SNOOZES) return null;
  const base = original.id.replace(/:snooze$/, '');
  return {
    ...original,
    id: `${base}:snooze`,
    at: now.getTime() + SNOOZE_MINUTES * 60_000,
    data: { ...(original.data ?? {}), snoozeCount: snoozeCount + 1 },
  };
}

/** Times in chronological order, as clock times ("8:00 AM"). */
export function sortedTimes(times: string[]): string[] {
  return [...new Set(times.map((t) => resolveTime(t) ?? t))].sort((a, z) => a.localeCompare(z));
}

export type ScheduleIssue =
  | { kind: 'no_times'; text: string }
  | { kind: 'conflict'; text: string }
  | { kind: 'unclear_time'; text: string };

/**
 * Problems with what is saved for WHEN to take a medicine. Nothing is guessed: a
 * missing schedule is reported as missing, and contradictory instructions (fixed times
 * plus "any time" / "when needed") are reported as a conflict to check with the
 * prescriber or pharmacist.
 */
export function scheduleIssues(m: Pick<SchedulableMedicine, 'times' | 'instructions' | 'asNeeded'>): ScheduleIssue[] {
  const out: ScheduleIssue[] = [];
  const instr = (m.instructions ?? '').toLowerCase();
  const flexible = /\b(any ?time|whenever|when (needed|required)|as (needed|required)|if needed|sos|prn)\b/.test(instr);
  const bad = m.times.filter((t) => !resolveTime(t));
  if (bad.length) out.push({ kind: 'unclear_time', text: `The saved time “${bad.join(', ')}” is not a clear clock time.` });
  if (m.asNeeded) return out;
  if (!m.times.length) {
    out.push({ kind: 'no_times', text: flexible ? 'No fixed time is recorded; the instructions say it can be taken as needed.' : 'No scheduled time is recorded.' });
  } else if (flexible) {
    out.push({ kind: 'conflict', text: `The record has a fixed time (${sortedTimes(m.times).filter((t) => /^\d\d:\d\d$/.test(t)).map(formatTime).join(', ')}) but the instructions also say “${m.instructions}”. These don’t match.` });
  }
  return out;
}
