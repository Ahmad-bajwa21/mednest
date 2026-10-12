// S12 — Medicines. Active and past, with stop (moves to Past) and source link.
import { useCallback } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useBundle } from '../../../src/features/useBundle';
import { stopMedicine } from '../../../src/data/recordsRepo';
import { useTheme } from '../../../src/design/theme';
import { Button, Card, Disclaimer, Text } from '../../../src/design/components';
import { BottomTabs } from '../../../src/features/BottomTabs';
import { layout, space } from '../../../src/design/tokens';
import type { MedicineLike } from '../../../src/domain/types';

export default function Meds() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bundle, reload } = useBundle(id);
  const { c } = useTheme();
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const all = bundle?.medicines ?? [];
  const active = all.filter((m) => m.active !== false);
  const past = all.filter((m) => m.active === false);

  const onStop = async (mid: string) => {
    await stopMedicine(mid);
    reload();
  };

  const MedCard = ({ m }: { m: MedicineLike }) => (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="heading">{m.name} {m.dose ?? ''}</Text>
        {m.active !== false ? <Button kind="text" title="Stop" onPress={() => onStop(m.id)} /> : <Text variant="caption" muted>Past</Text>}
      </View>
      <Text muted>{m.times.length ? m.times.join(' · ') : 'No times set'}</Text>
      <Text variant="caption" muted>{m.durationDays ? `For ${m.durationDays} days` : 'No end date'}</Text>
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: layout.screenPadding, paddingTop: space.xl }}>
        <Button kind="text" title="‹" onPress={() => router.replace(`/profile/${id}`)} />
        <Text variant="title" style={{ flex: 1 }}>Medicines</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingBottom: 80 }}>
        <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Active ({active.length})</Text>
        {active.length ? active.map((m) => <MedCard key={m.id} m={m} />) : <Text muted>No active medicines</Text>}
        {past.length ? (
          <>
            <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Past ({past.length})</Text>
            {past.map((m) => <MedCard key={m.id} m={m} />)}
          </>
        ) : null}
        <Disclaimer />
      </ScrollView>
      <BottomTabs id={id!} active="meds" />
    </View>
  );
}
