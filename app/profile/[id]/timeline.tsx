// S10 — Timeline. Every document for one profile, newest first, grouped by month.
import { useCallback } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useBundle } from '../../../src/features/useBundle';
import { useTheme } from '../../../src/design/theme';
import { Button, Card, EmptyState, Text, BannerAdSlot } from '../../../src/design/components';
import { BottomTabs } from '../../../src/features/BottomTabs';
import { layout, space } from '../../../src/design/tokens';

function monthLabel(iso?: string | null) {
  if (!iso) return 'Undated';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? 'Undated' : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function Timeline() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bundle, reload } = useBundle(id);
  const { c } = useTheme();
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const docs = (bundle?.documents ?? []).slice().sort((a, z) => (z.docDate ?? '').localeCompare(a.docDate ?? ''));
  const groups: Record<string, typeof docs> = {};
  docs.forEach((d) => ((groups[monthLabel(d.docDate)] ||= []).push(d)));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: layout.screenPadding, paddingTop: space.xl }}>
        <Button kind="text" title="‹" onPress={() => router.replace(`/profile/${id}`)} />
        <Text variant="title" style={{ flex: 1 }}>Timeline</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingBottom: 80 }}>
        {docs.length === 0 ? (
          <EmptyState icon="≣" message="No documents yet." action={<Button title="Add document" onPress={() => router.push(`/profile/${id}/add`)} />} />
        ) : (
          Object.entries(groups).map(([month, ds]) => (
            <View key={month}>
              <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>{month}</Text>
              {ds.map((d) => {
                const meds = bundle!.medicines.filter((m) => m.documentId === d.id);
                const res = bundle!.results.filter((r) => r.documentId === d.id);
                const sub = res.length ? res.map((r) => r.test).join(', ') : `${d.doctor ?? 'Doctor'} · ${meds.length} med${meds.length === 1 ? '' : 's'}`;
                return (
                  <Card key={d.id} onPress={() => router.push(`/profile/${id}/doc/${d.id}`)}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text variant="heading">{d.docDate ?? '—'}</Text>
                      <Text muted>{d.type}</Text>
                    </View>
                    <Text muted numberOfLines={1}>{sub}</Text>
                  </Card>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
      <BannerAdSlot />
      <BottomTabs id={id!} active="timeline" />
    </View>
  );
}
