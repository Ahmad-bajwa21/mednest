// Doses (proposal §6, S12/S13). Today's doses with Taken / Skip, and a 14-day history.
// A dose only counts as taken when the user marks it; an unmarked past dose shows as
// "Not marked" (missed), never as taken. Warns when notifications are switched off.
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../src/design/theme';
import { Button, Card, Disclaimer, EmptyState, Text } from '../../../src/design/components';
import { BottomTabs } from '../../../src/features/BottomTabs';
import { layout, space } from '../../../src/design/tokens';
import { useCare } from '../../../src/features/useCare';
import { pastDoses, todaysDoses, type TodayDose } from '../../../src/domain/care';
import { formatTime, type DoseState } from '../../../src/domain/schedule';
import { logDose } from '../../../src/data/careRepo';
import { notificationPermission, openNotificationSettings, requestNotificationPermission, syncReminders, type PermissionState } from '../../../src/features/reminders';

const LABEL: Record<DoseState, string> = { upcoming: 'Upcoming', due: 'Due now', taken: 'Taken', skipped: 'Skipped', missed: 'Not marked' };

export default function Doses() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { data, reload } = useCare(id);
  const [perm, setPerm] = useState<PermissionState | null>(null);

  useFocusEffect(
    useCallback(() => {
      reload();
      notificationPermission().then(setPerm).catch(() => setPerm(null));
    }, [reload]),
  );

  const now = new Date();
  const today = data ? todaysDoses(data.medicines, data.doseLogs, now) : [];
  const past = data ? pastDoses(data.medicines, data.doseLogs, now).filter((d) => d.occ.date !== today[0]?.occ.date) : [];

  const mark = async (d: TodayDose, status: 'taken' | 'skipped') => {
    await logDose(id!, d.medicine.id, d.occ.key, d.occ.at, status);
    await syncReminders().catch(() => undefined); // drops the alarm for a dose already marked
    reload();
  };

  const colour = (s: DoseState) => (s === 'taken' ? c.ok : s === 'missed' || s === 'due' ? c.warn : c.textMuted);

  const Row = ({ d, actions }: { d: TodayDose; actions: boolean }) => (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="heading" style={{ flex: 1 }}>{d.medicine.name}{d.medicine.dose ? ` · ${d.medicine.dose}` : ''}</Text>
        <Text variant="label" color={colour(d.state)}>{LABEL[d.state]}</Text>
      </View>
      <Text muted>{actions ? '' : `${d.occ.date} · `}{formatTime(d.occ.time)}{d.medicine.instructions ? ` · ${d.medicine.instructions}` : ''}</Text>
      {actions && d.state !== 'taken' && d.state !== 'skipped' ? (
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
          <View style={{ flex: 1 }}><Button title="Taken" onPress={() => mark(d, 'taken')} /></View>
          <View style={{ flex: 1 }}><Button kind="secondary" title="Skip" onPress={() => mark(d, 'skipped')} /></View>
        </View>
      ) : null}
      {!actions && d.state === 'missed' ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button kind="text" title="I took it" onPress={() => mark(d, 'taken')} />
          <Button kind="text" title="I skipped it" onPress={() => mark(d, 'skipped')} />
        </View>
      ) : null}
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: layout.screenPadding, paddingTop: space.xl }}>
        <Button kind="text" title="‹" onPress={() => router.replace(`/profile/${id}`)} />
        <Text variant="title" style={{ flex: 1 }}>Doses</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingBottom: 80 }}>
        {perm && perm !== 'granted' ? (
          <Card style={{ borderColor: c.warn }}>
            <Text variant="heading" color={c.warn}>Reminders are switched off</Text>
            <Text muted>MedNest can’t alert you at dose times. Your schedule is still shown here.</Text>
            {perm === 'undetermined' ? (
              <Button title="Turn on reminders" onPress={async () => { setPerm(await requestNotificationPermission()); syncReminders().catch(() => undefined); }} />
            ) : (
              <Button kind="secondary" title="Open settings" onPress={openNotificationSettings} />
            )}
          </Card>
        ) : null}

        <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Today</Text>
        {today.length ? today.map((d) => <Row key={d.occ.key} d={d} actions />) : (
          <EmptyState icon="℞" message="No doses scheduled today." />
        )}

        {past.length ? (
          <>
            <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Last 14 days</Text>
            {past.map((d) => <Row key={d.occ.key} d={d} actions={false} />)}
          </>
        ) : null}
        <Disclaimer text="Marking a dose only records what you tell MedNest. Information only. Not medical advice." />
      </ScrollView>
      <BottomTabs id={id!} active="meds" />
    </View>
  );
}
