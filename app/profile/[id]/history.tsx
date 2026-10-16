// Medical history (proposal §2, §8). One chronological record of documents, diagnoses
// written by doctors, medicines started and changed, symptom checks and follow-ups.
// Every entry shows where it came from, so AI-read, patient-reported and doctor-written
// information are never confused.
import { useCallback } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../src/design/theme';
import { Button, Card, Disclaimer, EmptyState, Text, BannerAdSlot } from '../../../src/design/components';
import { layout, space } from '../../../src/design/tokens';
import { useCare } from '../../../src/features/useCare';
import { historyEntries, type HistoryEntry, type HistoryKind } from '../../../src/domain/care';

const ICON: Record<HistoryKind, string> = { document: '📄', diagnosis: '🩺', medicine_start: '℞', medicine_change: '✎', symptom: '💬', appointment: '📅' };

function monthLabel(iso: string) {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return isNaN(d.getTime()) ? 'Undated' : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function History() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { profile, data, reload } = useCare(id);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const entries = data ? historyEntries(data) : [];
  const groups: Array<[string, HistoryEntry[]]> = [];
  for (const e of entries) {
    const m = monthLabel(e.date);
    const g = groups.find(([k]) => k === m);
    if (g) g[1].push(e);
    else groups.push([m, [e]]);
  }

  const open = (e: HistoryEntry) => {
    if (e.kind === 'document' || e.kind === 'diagnosis') router.push(`/profile/${id}/doc/${e.refId}`);
    else if (e.kind === 'medicine_start' || e.kind === 'medicine_change') router.push(`/profile/${id}/medicine/${e.refId}`);
    else if (e.kind === 'appointment') router.push(`/profile/${id}/appointments`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: layout.screenPadding, paddingTop: space.xl }}>
        <Button kind="text" title="‹" onPress={() => router.replace(`/profile/${id}`)} />
        <Text variant="title" style={{ flex: 1 }}>Medical history{profile ? ` · ${profile.name}` : ''}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingBottom: 48 }}>
        {profile?.allergies ? (
          <Card style={{ borderColor: c.warn }}>
            <Text variant="label" color={c.warn}>Allergies</Text>
            <Text>{profile.allergies}</Text>
          </Card>
        ) : null}
        {entries.length === 0 ? (
          <EmptyState icon="≣" message="Nothing recorded yet. Add a document or do a symptom check." />
        ) : (
          groups.map(([month, list]) => (
            <View key={month}>
              <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>{month}</Text>
              {list.map((e, i) => (
                <Card key={`${e.kind}-${e.refId}-${i}`} onPress={e.kind === 'symptom' ? undefined : () => open(e)}>
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <Text style={{ fontSize: 18 }}>{ICON[e.kind]}</Text>
                    <View style={{ flex: 1 }}>
                      <Text variant="heading">{e.title}</Text>
                      {e.detail ? <Text muted>{e.detail}</Text> : null}
                      <Text variant="caption" muted style={{ marginTop: space.xs }}>{e.date.slice(0, 10)} · {e.provenance}</Text>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          ))
        )}
        <Disclaimer />
      </ScrollView>
      <BannerAdSlot />
    </View>
  );
}
