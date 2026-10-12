// Reminder orchestration (spec §6–§7, §9.6). The database is the source of truth; the
// OS alarm set is rebuilt from it:
//   - on app start and every return to the foreground (covers reboots, OS clean-ups,
//     app updates and time-zone changes — the wall-clock times are re-resolved locally);
//   - after any change to a medicine, dose or appointment (call syncReminders()).
// Notification responses log what the USER chose. Delivery alone never logs a dose.
import * as Notifications from 'expo-notifications';
import { AppState, Linking } from 'react-native';
import { native } from '../native';
import { DOSE_ACTIONS, ExpoAlarmScheduler, setupNotificationChannels } from '../native/expoAlarms';
import { registerNative, type ScheduledAlarm } from '../native';
import { listProfiles } from '../data/profileRepo';
import { listAppointments, listDoseLogs, listMedicineRows, logDose, toSchedulable } from '../data/careRepo';
import { buildDoseAlarms, snoozeAlarm, addDaysLocal, localDateIso } from '../domain/schedule';
import { appointmentAlarms } from '../domain/followUp';
import { getDb } from '../data/db';
import { settings } from '../data/schema';
import { eq } from 'drizzle-orm';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function notificationPermission(): Promise<PermissionState> {
  const p = await Notifications.getPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
}

/** Ask once, in context (when the first schedule is confirmed — not at app launch). */
export async function requestNotificationPermission(): Promise<PermissionState> {
  const current = await notificationPermission();
  if (current !== 'undetermined') return current;
  const p = await Notifications.requestPermissionsAsync();
  return p.granted ? 'granted' : 'denied';
}

export function openNotificationSettings() {
  Linking.openSettings();
}

let syncing: Promise<void> | null = null;

/** Rebuild every MedNest alarm from the database. Safe to call often; calls coalesce. */
export function syncReminders(): Promise<void> {
  if (!syncing) {
    syncing = doSync().finally(() => {
      syncing = null;
    });
  }
  return syncing;
}

async function doSync() {
  const now = new Date();
  const since = new Date(addDaysLocal(localDateIso(now), -1) + 'T00:00:00').toISOString();
  const hide = (await getSetting('appLock')) === 'on';
  const all: ScheduledAlarm[] = [];
  for (const p of await listProfiles()) {
    const [meds, logs, appts] = await Promise.all([listMedicineRows(p.id), listDoseLogs(p.id, since), listAppointments(p.id)]);
    const doseAlarms = buildDoseAlarms(meds.map(toSchedulable), logs.map((l) => ({ doseKey: l.doseKey, status: l.status as 'taken' | 'skipped' | 'missed' })), now, {
      profileName: p.name,
      hideOnLockScreen: hide,
    });
    for (const a of doseAlarms) a.data = { ...(a.data ?? {}), profileId: p.id };
    all.push(...doseAlarms);
    for (const ap of appts) {
      if (!ap.date) continue;
      all.push(
        ...appointmentAlarms({ id: ap.id, date: ap.date, time: ap.time, doctor: ap.doctor, reason: ap.reason, status: ap.status as 'planned' }, now, { profileName: p.name, hideOnLockScreen: hide }).map(
          (a) => ({ ...a, data: { ...(a.data ?? {}), profileId: p.id } }),
        ),
      );
    }
  }
  await native.alarms.rescheduleAll(all);
  await setSetting('lastTimeZone', currentTimeZone());
}

function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? String(new Date().getTimezoneOffset());
  } catch {
    return String(new Date().getTimezoneOffset());
  }
}

/** The user tapped Taken / Later / Skip (or the notification itself). */
export async function handleNotificationResponse(r: Notifications.NotificationResponse): Promise<'taken' | 'skipped' | 'snoozed' | 'opened' | 'ignored'> {
  const data = (r.notification.request.content.data ?? {}) as Record<string, unknown>;
  if (data.kind !== 'dose') return 'opened';
  const profileId = String(data.profileId ?? '');
  const medicineId = String(data.medicineId ?? '');
  const doseKey = String(data.doseKey ?? '');
  const at = Number(data.at);
  if (!profileId || !medicineId || !doseKey) return 'ignored';

  const action = r.actionIdentifier;
  if (action === DOSE_ACTIONS.taken || action === DOSE_ACTIONS.skip) {
    const status = action === DOSE_ACTIONS.taken ? 'taken' : 'skipped';
    await logDose(profileId, medicineId, doseKey, at, status);
    await native.alarms.cancel(`dose:${doseKey}:snooze`).catch(() => undefined);
    await syncReminders();
    return status;
  }
  if (action === DOSE_ACTIONS.later) {
    const original: ScheduledAlarm = {
      id: String(data.alarmId ?? `dose:${doseKey}`),
      at,
      title: r.notification.request.content.title ?? 'Medicine reminder',
      body: r.notification.request.content.body ?? '',
      category: 'dose',
      data: Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === 'string' || typeof v === 'number')) as Record<string, string | number>,
    };
    const next = snoozeAlarm(original, Number(data.snoozeCount ?? 0), new Date());
    if (next) await native.alarms.schedule(next);
    return next ? 'snoozed' : 'ignored';
  }
  // Tapping the body only opens the app (dose screen); nothing is logged.
  return 'opened';
}

let installed = false;

/** Call once from the root layout. */
export async function installReminders(onOpenDose?: (profileId: string) => void): Promise<() => void> {
  if (installed) return () => undefined;
  installed = true;
  registerNative({ alarms: new ExpoAlarmScheduler() });
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  await setupNotificationChannels();

  const onResponse = async (r: Notifications.NotificationResponse) => {
    const result = await handleNotificationResponse(r);
    const pid = (r.notification.request.content.data as Record<string, unknown> | undefined)?.profileId;
    if (result === 'opened' && typeof pid === 'string') onOpenDose?.(pid);
  };
  const sub = Notifications.addNotificationResponseReceivedListener(onResponse);
  // A response that launched the app from a killed state.
  const last = await Notifications.getLastNotificationResponseAsync();
  if (last) await onResponse(last);

  const appSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') syncReminders().catch(() => undefined);
  });
  syncReminders().catch(() => undefined);
  return () => {
    sub.remove();
    appSub.remove();
    installed = false;
  };
}

/* ---------- tiny settings helpers ---------- */
async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row?.value ?? null;
}
async function setSetting(key: string, value: string) {
  const db = await getDb();
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}
