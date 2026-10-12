// Follow-ups & appointments (proposal §7). Follow-ups read from documents arrive as
// "proposed" and only get reminders once the user confirms the date. Users can add,
// reschedule, complete or cancel. MedNest never books anything itself.
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../src/design/theme';
import { Button, Card, Disclaimer, EmptyState, Field, Text } from '../../../src/design/components';
import { layout, space } from '../../../src/design/tokens';
import { useCare } from '../../../src/features/useCare';
import { createAppointment, updateAppointment } from '../../../src/data/careRepo';
import { parseLocalDate, localDateIso } from '../../../src/domain/schedule';
import { requestNotificationPermission, syncReminders } from '../../../src/features/reminders';
import type { CareAppointment } from '../../../src/domain/care';

const validDate = (s: string) => !!parseLocalDate(s.trim());
const validTime = (s: string) => !s.trim() || /^([01]\d|2[0-3]):[0-5]\d$/.test(s.trim());

export default function Appointments() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { data, reload } = useCare(id);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ date: '', time: '', doctor: '', reason: '' });
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const today = localDateIso(new Date());
  const appts = (data?.appointments ?? []).slice().sort((a, z) => (a.date ?? '0').localeCompare(z.date ?? '0'));
  const proposed = appts.filter((a) => a.status === 'proposed');
  const planned = appts.filter((a) => a.status === 'planned');
  const done = appts.filter((a) => a.status === 'completed' || a.status === 'cancelled').reverse();

  const startEdit = (a: CareAppointment | null) => {
    setError(null);
    setEditing(a?.id ?? 'new');
    setDraft({ date: a?.date ?? '', time: a?.time ?? '', doctor: a?.doctor ?? '', reason: a?.reason ?? '' });
  };

  const after = async () => {
    setEditing(null);
    await requestNotificationPermission().catch(() => undefined);
    await syncReminders().catch(() => undefined);
    reload();
  };

  const save = async () => {
    if (!validDate(draft.date)) return setError('Please enter the date as YYYY-MM-DD.');
    if (!validTime(draft.time)) return setError('Please enter the time as HH:MM (24-hour), or leave it empty.');
    const patch = { date: draft.date.trim(), time: draft.time.trim() || null, doctor: draft.doctor.trim() || null, reason: draft.reason.trim() || null };
    if (editing === 'new') await createAppointment({ profileId: id!, ...patch, basis: 'manual', status: 'planned' });
    else if (editing) await updateAppointment(editing, { ...patch, status: 'planned' }); // confirming or rescheduling
    await after();
  };

  const setStatus = async (a: CareAppointment, status: 'completed' | 'cancelled') => {
    await updateAppointment(a.id, { status });
    await after();
  };

  // A render function, not a component: an inner component would remount on every
  // keystroke and drop the text field focus.
  const editor = (key: string) => (
    <Card key={key} style={{ borderColor: c.accent }}>
      <Field label="Date" value={draft.date} onChangeText={(v) => setDraft((d) => ({ ...d, date: v }))} placeholder="YYYY-MM-DD" />
      <Field label="Time (optional)" value={draft.time} onChangeText={(v) => setDraft((d) => ({ ...d, time: v }))} placeholder="HH:MM" />
      <Field label="Doctor" value={draft.doctor} onChangeText={(v) => setDraft((d) => ({ ...d, doctor: v }))} />
      <Field label="Reason" value={draft.reason} onChangeText={(v) => setDraft((d) => ({ ...d, reason: v }))} />
      {error ? <Text variant="caption" color={c.danger} style={{ marginTop: space.sm }}>{error}</Text> : null}
      <Button title="Confirm date & set reminders" onPress={save} />
      <Button kind="text" title="Cancel" onPress={() => setEditing(null)} />
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: layout.screenPadding, paddingTop: space.xl }}>
        <Button kind="text" title="‹" onPress={() => router.replace(`/profile/${id}`)} />
        <Text variant="title" style={{ flex: 1 }}>Follow-ups</Text>
        <Button kind="text" title="＋ Add" onPress={() => startEdit(null)} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingBottom: 48 }}>
        {editing === 'new' ? editor('new') : null}

        {proposed.length ? <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Needs your confirmation</Text> : null}
        {proposed.map((a) =>
          editing === a.id ? editor(a.id) : (
            <Card key={a.id} style={{ borderColor: c.warn }}>
              <Text variant="heading">{a.date ? `Proposed: ${a.date}` : 'Date not clear'}</Text>
              {a.sourceText ? <Text muted>Document says: “{a.sourceText}”</Text> : null}
              <Text variant="caption" muted>
                {a.basis === 'relative_to_document' ? 'Calculated from the document date — please check.' : a.basis === 'written_date' ? 'Date as written on the document — please check.' : 'Please choose the date.'}
              </Text>
              <Button title={a.date ? 'Check and confirm' : 'Choose date'} onPress={() => startEdit(a)} />
              <Button kind="text" title="Not needed" onPress={() => setStatus(a, 'cancelled')} />
            </Card>
          ),
        )}

        <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Planned</Text>
        {planned.length === 0 && editing !== 'new' ? <EmptyState icon="📅" message="No follow-ups planned." /> : null}
        {planned.map((a) =>
          editing === a.id ? editor(a.id) : (
            <Card key={a.id} style={a.date && a.date < today ? { borderColor: c.warn } : undefined}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="heading">{a.date}{a.time ? ` · ${a.time}` : ''}</Text>
                {a.date && a.date < today ? <Text variant="label" color={c.warn}>Date passed</Text> : null}
              </View>
              <Text muted>{[a.doctor, a.reason].filter(Boolean).join(' · ') || 'Follow-up'}</Text>
              <Text variant="caption" muted>Reminders: the evening before and on the day.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Button kind="text" title="Mark done" onPress={() => setStatus(a, 'completed')} />
                <Button kind="text" title="Reschedule" onPress={() => startEdit(a)} />
                <Button kind="text" title="Cancel" onPress={() => setStatus(a, 'cancelled')} />
              </View>
            </Card>
          ),
        )}

        {done.length ? (
          <>
            <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Past</Text>
            {done.map((a) => (
              <Card key={a.id}>
                <Text>{a.date ?? '—'} · {a.status === 'completed' ? 'Done' : 'Cancelled'}</Text>
                <Text variant="caption" muted>{[a.doctor, a.reason].filter(Boolean).join(' · ')}</Text>
              </Card>
            ))}
          </>
        ) : null}
        <Disclaimer text="MedNest reminds you; it does not book appointments. Information only. Not medical advice." />
      </ScrollView>
    </View>
  );
}
