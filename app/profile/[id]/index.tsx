// S7 — Profile overview. The always-on summary is always first (RULE). Then: pending
// confirmations, today's medicines, upcoming follow-ups, symptom check, recent
// documents, latest results with trend, Things to notice and medical history.
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
import { useCare } from '../../../src/features/useCare';
import { pendingConfirmations, todaysDoses, upcomingAppointments } from '../../../src/domain/care';
import { formatTime, localDateIso } from '../../../src/domain/schedule';

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
  const care = useCare(id);
  const { c } = useTheme();

  useFocusEffect(useCallback(() => { reload(); care.reload(); }, [reload, care.reload]));

  if (loading || !bundle) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const now = new Date();
  const today = localDateIso(now);
  const results = latestResults(bundle, 3);
  const notes = patternNotes(bundle);
  const doses = care.data ? todaysDoses(care.data.medicines, care.data.doseLogs, now) : [];
  const appts = care.data ? upcomingAppointments(care.data.appointments, today).slice(0, 3) : [];
  const pending = care.data ? pendingConfirmations(care.data, today) : [];
  const recentDocs = bundle.documents.slice().sort((a, z) => (z.docDate ?? '').localeCompare(a.docDate ?? '')).slice(0, 3);
  const doseColour = (st: string) => (st === 'taken' ? c.ok : st === 'missed' || st === 'due' ? c.warn : c.textMuted);
  const DOSE_LABEL: Record<string, string> = { upcoming: '', due: 'Due', taken: 'Taken', skipped: 'Skipped', missed: 'Not marked' };

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

        {pending.length ? (
          <>
            <SectionLabel>Pending confirmations ({pending.length})</SectionLabel>
            <Card style={{ borderColor: c.warn }}>
              {pending.slice(0, 4).map((p, i) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => router.push(p.kind === 'medicine' ? `/profile/${id}/medicine/${p.id}` : `/profile/${id}/appointments`)}
                  style={{ marginTop: i ? space.md : 0 }}
                >
                  <Text>{p.title}</Text>
                  <Text variant="caption" muted>{p.detail}</Text>
                </TouchableOpacity>
              ))}
            </Card>
          </>
        ) : null}

        <SectionLabel>Today's medicines</SectionLabel>
        <Card onPress={() => router.push(`/profile/${id}/doses`)}>
          {doses.length ? (
            doses.slice(0, 6).map((d, i) => (
              <View key={d.occ.key} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: i ? space.sm : 0 }}>
                <Text style={{ flex: 1 }}>{formatTime(d.occ.time)} · {d.medicine.name}{d.medicine.dose ? ` ${d.medicine.dose}` : ''}</Text>
                <Text variant="caption" color={doseColour(d.state)}>{DOSE_LABEL[d.state]}</Text>
              </View>
            ))
          ) : (
            <Text muted>No doses scheduled today.</Text>
          )}
        </Card>

        <SectionLabel>Upcoming appointments</SectionLabel>
        <Card onPress={() => router.push(`/profile/${id}/appointments`)}>
          {appts.length ? (
            appts.map((a, i) => (
              <View key={a.id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: i ? space.sm : 0 }}>
                <Text style={{ flex: 1 }}>{[a.doctor, a.reason].filter(Boolean).join(' · ') || 'Follow-up'}</Text>
                <Text variant="caption" muted>{a.date}{a.time ? ` ${a.time}` : ''}</Text>
              </View>
            ))
          ) : (
            <Text muted>Nothing planned.</Text>
          )}
        </Card>

        <SectionLabel>Health assistant</SectionLabel>
        <Card onPress={() => router.push(`/profile/${id}/assistant`)} style={{ borderColor: c.accent }}>
          <Text variant="heading">Check a symptom</Text>
          <Text muted>Answer a few questions and get guidance on what to do next. Not a diagnosis.</Text>
        </Card>

        <SectionLabel>Recent documents</SectionLabel>
        <Card>
          {recentDocs.length ? (
            recentDocs.map((d, i) => (
              <TouchableOpacity key={d.id} onPress={() => router.push(`/profile/${id}/doc/${d.id}`)} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: i ? space.sm : 0 }}>
                <Text>{d.type}{d.doctor ? ` · ${d.doctor}` : ''}</Text>
                <Text variant="caption" muted>{d.docDate ?? '—'}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text muted>No documents yet.</Text>
          )}
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

        <Button kind="secondary" title="Medical history" onPress={() => router.push(`/profile/${id}/history`)} />
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
