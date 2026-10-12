// Medicine detail & schedule (proposal §5). Edit the confirmed instructions, pause,
// resume, mark completed or stop. Reminders are rebuilt after every change. Nothing is
// filled in automatically: what is missing is listed, and reminders wait until it is set.
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../../src/design/theme';
import { Button, Card, Chip, Disclaimer, Field, Text } from '../../../../src/design/components';
import { layout, space } from '../../../../src/design/tokens';
import { useCare } from '../../../../src/features/useCare';
import { editMedicine, setMedicineStatus } from '../../../../src/data/careRepo';
import { deriveStatus, effectiveEndDate, formatTime, localDateIso, parseLocalDate, resolveTime, scheduleBlockers, type MedStatus } from '../../../../src/domain/schedule';
import { requestNotificationPermission, syncReminders } from '../../../../src/features/reminders';

const SLOTS = ['Morning', 'Afternoon', 'Evening', 'Night'];
const STATUS_LABEL: Record<MedStatus, string> = { pending: 'Waiting for details', active: 'Active', paused: 'Paused', completed: 'Completed', discontinued: 'Stopped' };

export default function MedicineDetail() {
  const { id, medId } = useLocalSearchParams<{ id: string; medId: string }>();
  const { c } = useTheme();
  const { data, reload } = useCare(id);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const med = data?.medicines.find((m) => m.id === medId);

  const [form, setForm] = useState({ name: '', dose: '', times: [] as string[], customTime: '', durationDays: '', startDate: '', instructions: '', asNeeded: false });
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!med || editing) return;
    setForm({
      name: med.name,
      dose: med.dose ?? '',
      times: med.times,
      customTime: '',
      durationDays: med.durationDays ? String(med.durationDays) : '',
      startDate: med.startDate ?? '',
      instructions: med.instructions ?? '',
      asNeeded: !!med.asNeeded,
    });
  }, [med, editing]);

  if (!med) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  const today = localDateIso(new Date());
  const status = deriveStatus(med, today);
  const blockers = scheduleBlockers(med);
  const end = effectiveEndDate(med);

  const changed = async (fn: () => Promise<void>) => {
    await fn();
    await requestNotificationPermission().catch(() => undefined);
    await syncReminders().catch(() => undefined);
    reload();
  };

  const save = async () => {
    setError(null);
    if (!form.name.trim()) return setError('Please enter the medicine name.');
    if (form.startDate && !parseLocalDate(form.startDate.trim())) return setError('Start date must be YYYY-MM-DD.');
    if (form.durationDays && !/^\d+$/.test(form.durationDays.trim())) return setError('Duration must be a number of days.');
    await changed(() =>
      editMedicine(med.id, {
        name: form.name.trim(),
        dose: form.dose.trim() || null,
        times: form.asNeeded ? [] : form.times,
        durationDays: form.durationDays ? parseInt(form.durationDays, 10) : null,
        startDate: form.startDate.trim() || null,
        instructions: form.instructions.trim() || null,
        asNeeded: form.asNeeded,
      }),
    );
    setEditing(false);
  };

  const addCustomTime = () => {
    const t = resolveTime(form.customTime.trim());
    if (!t) return setError('Time must be HH:MM, for example 07:30.');
    setError(null);
    setForm((f) => ({ ...f, times: [...new Set([...f.times, t])], customTime: '' }));
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: layout.screenPadding, paddingTop: space.xl }}>
        <Button kind="text" title="‹" onPress={() => router.back()} />
        <Text variant="title" style={{ flex: 1 }}>{med.name}</Text>
        {!editing ? <Button kind="text" title="Edit" onPress={() => setEditing(true)} /> : null}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingBottom: 48 }}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="heading">{STATUS_LABEL[status]}</Text>
            <Text variant="caption" muted>{med.source === 'document_confirmed' ? 'From prescription · confirmed by you' : 'Entered by you'}</Text>
          </View>
          {med.asNeeded ? <Text muted>Take when needed — no timed reminders.</Text> : <Text muted>{med.times.length ? med.times.map((t) => { const r = resolveTime(t); return r ? formatTime(r) : t; }).join(' · ') : 'No times set'}</Text>}
          <Text muted>{med.dose ? `Dose: ${med.dose}` : 'Dose not set'}{med.instructions ? ` · ${med.instructions}` : ''}</Text>
          <Text variant="caption" muted>{med.startDate ? `From ${med.startDate}` : 'Start date not set'}{end ? ` to ${end}` : med.durationDays ? '' : ' · No end date written — reminders continue until you stop them'}</Text>
          {med.documentId ? <Button kind="text" title="View source document" onPress={() => router.push(`/profile/${id}/doc/${med.documentId}`)} /> : null}
        </Card>

        {blockers.length && (status === 'active' || status === 'pending') ? (
          <Card style={{ borderColor: c.warn }}>
            <Text variant="heading" color={c.warn}>Reminders not set yet</Text>
            {blockers.map((b) => <Text key={b} muted>• {b}</Text>)}
            <Text variant="caption" muted style={{ marginTop: space.xs }}>Check the prescription or ask your doctor or pharmacist, then add the missing details.</Text>
            {!editing ? <Button title="Add details" onPress={() => setEditing(true)} /> : null}
          </Card>
        ) : null}

        {editing ? (
          <Card style={{ borderColor: c.accent }}>
            <Text variant="caption" muted>Enter the instructions exactly as your doctor prescribed.</Text>
            <Field label="Name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
            <Field label="Dose" value={form.dose} onChangeText={(v) => setForm((f) => ({ ...f, dose: v }))} placeholder="e.g. 500 mg, 1 tablet" />
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
              <Chip label="At set times" selected={!form.asNeeded} onPress={() => setForm((f) => ({ ...f, asNeeded: false }))} />
              <Chip label="Only when needed" selected={form.asNeeded} onPress={() => setForm((f) => ({ ...f, asNeeded: true }))} />
            </View>
            {!form.asNeeded ? (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
                  {SLOTS.map((s) => (
                    <Chip key={s} label={s} selected={form.times.includes(s)} onPress={() => setForm((f) => ({ ...f, times: f.times.includes(s) ? f.times.filter((x) => x !== s) : [...f.times, s] }))} />
                  ))}
                  {form.times.filter((t) => !SLOTS.includes(t)).map((t) => (
                    <Chip key={t} label={`${t} ✕`} selected onPress={() => setForm((f) => ({ ...f, times: f.times.filter((x) => x !== t) }))} />
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
                  <View style={{ flex: 1 }}><Field label="Exact time (optional)" value={form.customTime} onChangeText={(v) => setForm((f) => ({ ...f, customTime: v }))} placeholder="HH:MM" /></View>
                  <Button kind="secondary" title="Add" onPress={addCustomTime} />
                </View>
              </>
            ) : null}
            <Field label="Start date" value={form.startDate} onChangeText={(v) => setForm((f) => ({ ...f, startDate: v }))} placeholder="YYYY-MM-DD" />
            <Field label="Duration (days)" value={form.durationDays} keyboardType="number-pad" onChangeText={(v) => setForm((f) => ({ ...f, durationDays: v }))} hint="Leave empty if no duration is written." />
            <Field label="Instructions" value={form.instructions} onChangeText={(v) => setForm((f) => ({ ...f, instructions: v }))} placeholder="e.g. after meals" />
            {error ? <Text variant="caption" color={c.danger} style={{ marginTop: space.sm }}>{error}</Text> : null}
            <Button title="Save" onPress={save} />
            <Button kind="text" title="Cancel" onPress={() => { setEditing(false); setError(null); }} />
          </Card>
        ) : (
          <View style={{ gap: space.xs }}>
            {status === 'active' ? <Button kind="secondary" title="Pause reminders" onPress={() => changed(() => setMedicineStatus(med.id, 'paused'))} /> : null}
            {status === 'paused' ? <Button title="Resume" onPress={() => changed(() => setMedicineStatus(med.id, 'active'))} /> : null}
            {status === 'active' || status === 'paused' || status === 'pending' ? (
              <>
                <Button kind="secondary" title="Mark course completed" onPress={() => changed(() => setMedicineStatus(med.id, 'completed'))} />
                <Button kind="danger" title="Stop this medicine" onPress={() => changed(() => setMedicineStatus(med.id, 'discontinued'))} />
              </>
            ) : null}
            <Text variant="caption" muted style={{ textAlign: 'center' }}>Only change or stop a medicine as your doctor advised.</Text>
          </View>
        )}
        <Disclaimer />
      </ScrollView>
    </View>
  );
}
