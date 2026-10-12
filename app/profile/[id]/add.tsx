// S8/S9 — Add document (manual entry + confirm). On-device the camera + AI fills this
// in for the user to check; here it is manual. Nothing is saved until "Confirm and save".
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '../../../src/design/theme';
import { Button, Card, Chip, Field, Text } from '../../../src/design/components';
import { layout, space } from '../../../src/design/tokens';
import { saveConfirmedDocument } from '../../../src/data/recordsRepo';

const DOC_TYPES = ['Prescription', 'Lab report', 'Scan report', 'Bill', 'Other'];
const SLOTS = ['Morning', 'Afternoon', 'Evening', 'Night'];

interface MedDraft { name: string; dose: string; durationDays: string; times: string[] }
interface ResDraft { test: string; value: string; unit: string; rangeLow: string; rangeHigh: string }

export default function AddDocument() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const [type, setType] = useState('Prescription');
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [doctor, setDoctor] = useState('');
  const [meds, setMeds] = useState<MedDraft[]>([]);
  const [results, setResults] = useState<ResDraft[]>([]);

  const toggleSlot = (mi: number, slot: string) =>
    setMeds((ms) => ms.map((m, i) => (i === mi ? { ...m, times: m.times.includes(slot) ? m.times.filter((s) => s !== slot) : [...m.times, slot] } : m)));

  const save = async () => {
    await saveConfirmedDocument({
      profileId: id!,
      type,
      docDate,
      doctor: doctor.trim() || null,
      medicines: meds.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), dose: m.dose.trim() || null, times: m.times, durationDays: m.durationDays ? parseInt(m.durationDays, 10) : null })),
      results: results.filter((r) => r.test.trim()).map((r) => ({ test: r.test.trim(), value: r.value.trim() || null, unit: r.unit.trim() || null, rangeLow: r.rangeLow ? parseFloat(r.rangeLow) : null, rangeHigh: r.rangeHigh ? parseFloat(r.rangeHigh) : null })),
    });
    router.replace(`/profile/${id}`);
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: layout.screenPadding, paddingTop: space.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Button kind="text" title="✕" onPress={() => router.back()} />
        <Text variant="title" style={{ flex: 1 }}>Add document</Text>
      </View>
      <Text variant="caption" muted>Manual entry. On the native camera flow the on-device AI fills this in for you to check.</Text>

      <Text variant="label" muted style={{ marginTop: space.md, marginBottom: space.xs }}>Type</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {DOC_TYPES.map((t) => <Chip key={t} label={t} selected={type === t} onPress={() => setType(t)} />)}
      </View>

      <Field label="Date" value={docDate} onChangeText={setDocDate} placeholder="YYYY-MM-DD" />
      <Field label="Doctor" value={doctor} onChangeText={setDoctor} placeholder="Dr. S. Khan" />

      <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Medicines</Text>
      {meds.map((m, i) => (
        <Card key={i}>
          <Field label="Name" value={m.name} onChangeText={(v) => setMeds((ms) => ms.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
          <Field label="Dose" value={m.dose} onChangeText={(v) => setMeds((ms) => ms.map((x, j) => (j === i ? { ...x, dose: v } : x)))} placeholder="500 mg" />
          <Field label="Duration (days)" value={m.durationDays} keyboardType="number-pad" onChangeText={(v) => setMeds((ms) => ms.map((x, j) => (j === i ? { ...x, durationDays: v } : x)))} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
            {SLOTS.map((s) => <Chip key={s} label={s} selected={m.times.includes(s)} onPress={() => toggleSlot(i, s)} />)}
          </View>
        </Card>
      ))}
      <Button kind="text" title="＋ Add medicine" onPress={() => setMeds((ms) => [...ms, { name: '', dose: '', durationDays: '', times: [] }])} />

      <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Results</Text>
      {results.map((r, i) => (
        <Card key={i}>
          <Field label="Test" value={r.test} onChangeText={(v) => setResults((rs) => rs.map((x, j) => (j === i ? { ...x, test: v } : x)))} placeholder="HbA1c" />
          <Field label="Value" value={r.value} onChangeText={(v) => setResults((rs) => rs.map((x, j) => (j === i ? { ...x, value: v } : x)))} />
          <Field label="Unit" value={r.unit} onChangeText={(v) => setResults((rs) => rs.map((x, j) => (j === i ? { ...x, unit: v } : x)))} placeholder="%" />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}><Field label="Range low" value={r.rangeLow} keyboardType="numeric" onChangeText={(v) => setResults((rs) => rs.map((x, j) => (j === i ? { ...x, rangeLow: v } : x)))} /></View>
            <View style={{ flex: 1 }}><Field label="Range high" value={r.rangeHigh} keyboardType="numeric" onChangeText={(v) => setResults((rs) => rs.map((x, j) => (j === i ? { ...x, rangeHigh: v } : x)))} /></View>
          </View>
        </Card>
      ))}
      <Button kind="text" title="＋ Add result" onPress={() => setResults((rs) => [...rs, { test: '', value: '', unit: '', rangeLow: '', rangeHigh: '' }])} />

      <Button title="Confirm and save" onPress={save} />
      <Button kind="text" title="Discard" onPress={() => router.back()} />
    </ScrollView>
  );
}
