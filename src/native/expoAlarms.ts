// AlarmScheduler backed by expo-notifications (works today, no custom native code).
// Android keeps scheduled notifications across reboots; MedNest additionally rebuilds
// the whole set on every app start / foreground / time-zone change (features/reminders).
// The custom exact-alarm module (plugins/withExactAlarms) can replace this later through
// registerNative() without touching any caller.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { AlarmScheduler, ScheduledAlarm } from './types';

export const DOSE_CHANNEL = 'medicine-reminders';
export const APPOINTMENT_CHANNEL = 'follow-up-reminders';
export const DOSE_ACTIONS = { taken: 'taken', later: 'later', skip: 'skip' } as const;

const OWN_PREFIXES = ['dose:', 'appt:'];
const isOwn = (id: string) => OWN_PREFIXES.some((p) => id.startsWith(p));

export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(DOSE_CHANNEL, {
      name: 'Medicine reminders',
      importance: Notifications.AndroidImportance.HIGH,
      // Lock-screen content is hidden; the full text shows once unlocked (S13).
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync(APPOINTMENT_CHANNEL, {
      name: 'Follow-up reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
  // Taken / Skip open the app so the choice is always recorded, even if the app was
  // killed (a background-only action is dropped in that case on expo-notifications).
  await Notifications.setNotificationCategoryAsync('dose', [
    { identifier: DOSE_ACTIONS.taken, buttonTitle: 'Taken', options: { opensAppToForeground: true } },
    { identifier: DOSE_ACTIONS.later, buttonTitle: 'Later', options: { opensAppToForeground: true } },
    { identifier: DOSE_ACTIONS.skip, buttonTitle: 'Skip', options: { opensAppToForeground: true } },
  ]);
}

export class ExpoAlarmScheduler implements AlarmScheduler {
  async schedule(a: ScheduledAlarm): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(a.id).catch(() => undefined);
    await Notifications.scheduleNotificationAsync({
      identifier: a.id,
      content: {
        title: a.title,
        body: a.body,
        data: { ...(a.data ?? {}), alarmId: a.id, at: a.at },
        categoryIdentifier: a.category === 'dose' ? 'dose' : undefined,
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: a.at,
        channelId: a.category === 'dose' ? DOSE_CHANNEL : APPOINTMENT_CHANNEL,
      },
    });
  }

  async cancel(id: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(id);
  }

  /** Diff against what is already scheduled: cancel stale, add missing, keep the rest. */
  async rescheduleAll(alarms: ScheduledAlarm[]): Promise<void> {
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    const wanted = new Map(alarms.map((a) => [a.id, a]));
    const keep = new Set<string>();
    for (const n of existing) {
      const id = n.identifier;
      if (!isOwn(id)) continue;
      const w = wanted.get(id);
      const at = Number((n.content.data as Record<string, unknown> | undefined)?.at);
      if (w && at === w.at && n.content.body === w.body) keep.add(id);
      else if (!id.endsWith(':snooze')) await Notifications.cancelScheduledNotificationAsync(id);
      else keep.add(id); // a pending snooze stays until it fires
    }
    for (const a of alarms) if (!keep.has(a.id)) await this.schedule(a);
  }

  async canScheduleExact(): Promise<boolean> {
    const p = await Notifications.getPermissionsAsync();
    return p.granted;
  }
}
