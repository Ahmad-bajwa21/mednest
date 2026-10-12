// S7 — Profile overview. The always-on summary is always first (RULE). Shows active
// medicines, latest results with trend, Things to notice (pattern notes) and Coming up.
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { ScrollView, View, TouchableOpacity } from 'react-native';
import { useBundle } from '../../../src/features/useBundle';
import { useTheme } from '../../../src/design/theme';
import { Button, Card, Disclaimer, Text } from '../../../src/design/components';
import { BottomTabs } from '../../../src/features/BottomTabs';
import { layout, space } from '../../../src/design/tokens';
import { buildSummary } from '../../../src/domain/summary';
import { latestResults } from '../../../src/domain/trends';
import { patternNotes } from '../../../src/domain/patterns';
import { activeMedicines, SLOT_CLOCK } from '../../../src/domain/types';

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>
      {children}
    </Text>
  );
}

export default function Overview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bundle, loading, reload } = useBundle(id);
  const { c } = useTheme();

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  if (loading || !bundle) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const meds = activeMedicines(bundle);
  const results = latestResults(bundle, 3);
  const notes = patternNotes(bundle);
  const coming = meds.filter((m) => m.times.length).map((m) => ({ text: `${m.name} ${m.dose ?? ''}`.trim(), when: m.times.map((t) => SLOT_CLOCK[t]).filter(Boolean).join(', ') }));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: layout.screenPadding, paddingTop: space.xl }}>
        <Button kind="text" title="‹" onPress={() => router.replace('/')} />
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: bundle.profile.sex ? c.accent : c.accent, marginHorizontal: space.sm }} />
        <Text variant="title" style={{ flex: 1 }}>{bundle.profile.name}</Text>
        <Button kind="text" title="Edit" onPress={() => router.push(`/profile/${id}/edit`)} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingBottom: 96 }}>
        <SectionLabel>Summary</SectionLabel>
        <Card>
          <Text>{buildSummary(bundle)}</Text>
          <Text variant="caption" muted style={{ marginTop: space.sm }}>
            Built from {bundle.documents.length} document{bundle.documents.length === 1 ? '' : 's'}
          </Text>
        </Card>

        <SectionLabel>Active medicines ({meds.length})</SectionLabel>
        <Card onPress={() => router.replace(`/profile/${id}/meds`)}>
          <Text>{meds.length ? meds.slice(0, 3).map((m) => m.name).join(', ') : 'None'}</Text>
        </Card>

        <SectionLabel>Latest results</SectionLabel>
        <Card>
          {results.length ? (
            results.map((r, i) => (
              <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: i ? space.sm : 0 }}>
                <Text>{r.test}</Text>
                <Text color={r.outOfRange ? c.warn : c.text}>
                  {r.value}{r.unit ? ' ' + r.unit : ''} {r.trend === 'up' ? '▲' : r.trend === 'down' ? '▼' : '='}
                </Text>
              </View>
            ))
          ) : (
            <Text muted>No results yet</Text>
          )}
        </Card>

        <SectionLabel>Things to notice ({notes.length})</SectionLabel>
        <Card>
          {notes.length ? (
            notes.map((n, i) => (
              <View key={i} style={{ marginTop: i ? space.md : 0 }}>
                <Text>{n.text}</Text>
                <Text variant="caption" muted>Discuss with your doctor.</Text>
              </View>
            ))
          ) : (
            <Text muted>Nothing notable yet.</Text>
          )}
        </Card>

        <SectionLabel>Coming up</SectionLabel>
        <Card>
          {coming.length ? (
            coming.map((cu, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: i ? space.sm : 0 }}>
                <Text>{cu.text}</Text>
                <Text variant="caption" muted>{cu.when}</Text>
              </View>
            ))
          ) : (
            <Text muted>Nothing scheduled.</Text>
          )}
        </Card>

        <Button kind="secondary" title="Doctor summary" onPress={() => router.replace(`/profile/${id}/summary`)} />
        <Disclaimer />
      </ScrollView>

      <TouchableOpacity
        onPress={() => router.push(`/profile/${id}/add`)}
        style={{ position: 'absolute', right: space.lg, bottom: 76, width: 56, height: 56, borderRadius: 28, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text color={c.onAccent} style={{ fontSize: 28 }}>＋</Text>
      </TouchableOpacity>

      <BottomTabs id={id!} active="overview" />
    </View>
  );
}
