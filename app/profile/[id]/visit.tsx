// Doctor visit summary (native). Chronological summary of what the patient reported
// (symptom checks, updates, corrections) plus labelled records, built by code from
// saved entries only (src/domain/visitSummary.ts). Share it, save it, or add an update.
import { useCallback, useState } from 'react';
import { Linking, ScrollView, Share, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../src/design/theme';
import { Button, Card, Chip, Field, Text } from '../../../src/design/components';
import { layout, space } from '../../../src/design/tokens';
import { ageFromBirthYear, useCare } from '../../../src/features/useCare';
import { addSymptomUpdate, listEpisodes, listSymptomUpdates, saveVisitSummary } from '../../../src/data/careRepo';
import { buildVisitSummary, renderVisitSummaryText, type VisitSummary } from '../../../src/domain/visitSummary';
import { detectRedFlags, EMERGENCY_MESSAGE, EMERGENCY_NUMBER } from '../../../src/ai/triage/redFlags';
import type { Answers } from '../../../src/ai/triage/protocols';

const PERIODS: Array<[number | null, string]> = [[7, '7 days'], [14, '14 days'], [30, '30 days'], [null, 'Everything']];

export default function VisitSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { profile, data, reload } = useCare(id);
  const [days, setDays] = useState<number | null>(14);
  const [summary, setSummary] = useState<VisitSummary | null>(null);
  const [text, setText] = useState('');
  const [form, setForm] = useState({ complaint: '', severity: '', symptoms: '', note: '', corrects: false });
  const [msg, setMsg] = useState<string | null>(null);

  const build = useCallback(async () => {
    if (!id || !profile || !data) return;
    const [eps, ups] = await Promise.all([listEpisodes(id), listSymptomUpdates(id)]);
    const p = { name: profile.name, ageYears: ageFromBirthYear(profile.birthYear), sex: profile.sex, allergies: profile.allergies };
    const s = buildVisitSummary({
      profile: p,
      episodes: eps.map((e) => ({ id: e.id, protocolId: e.protocolId, complaint: e.complaint, disposition: e.disposition, createdAt: e.createdAt, answers: e.answers ? (JSON.parse(e.answers) as Answers) : null })),
      updates: ups.map((u) => ({ id: u.id, at: u.at, complaint: u.complaint, severity: u.severity, newSymptoms: u.newSymptoms, note: u.note, correctsId: u.correctsId })),
      medicines: data.medicines,
      documents: data.documents,
      since: days ? new Date(Date.now() - days * 86400000).toISOString() : null,
      now: new Date(),
    });
    setSummary(s);
    setText(renderVisitSummaryText(s, p));
    if (!form.complaint && s.complaints[0]) setForm((f) => ({ ...f, complaint: s.complaints[0]!.complaint }));
  }, [id, profile, data, days, form.complaint]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  useFocusEffect(useCallback(() => { build(); }, [build]));

  const addUpdate = async () => {
    setMsg(null);
    const sev = form.severity.trim() === '' ? null : parseInt(form.severity, 10);
    if (!form.complaint.trim()) return setMsg('Please name the problem.');
    if (sev !== null && (isNaN(sev) || sev < 0 || sev > 10)) return setMsg('Severity must be 0–10.');
    if (sev === null && !form.symptoms.trim() && !form.note.trim()) return setMsg('Add a severity, new symptoms or a note.');
    await addSymptomUpdate({ profileId: id!, complaint: form.complaint.trim(), severity: sev, newSymptoms: form.symptoms.trim() || null, note: form.note.trim() || null, correctsId: form.corrects ? 'earlier' : null });
    const flags = detectRedFlags(`${form.symptoms} ${form.note}`);
    if (flags[0]?.level === 'emergency') setMsg(EMERGENCY_MESSAGE);
    else if (sev !== null && sev >= 8) setMsg('Your symptoms sound worse. Please run a new symptom check now so MedNest can tell you how soon to get care.');
    setForm((f) => ({ ...f, severity: '', symptoms: '', note: '', corrects: false }));
    build();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: layout.screenPadding, paddingTop: space.xl }}>
        <Button kind="text" title="‹" onPress={() => router.back()} />
        <Text variant="title" style={{ flex: 1 }}>Doctor visit summary</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingBottom: 48 }}>
        {summary?.urgent ? (
          <Card style={{ borderColor: c.danger, borderWidth: 2 }}>
            <Text variant="heading" color={c.danger}>{summary.urgent.disposition === 'emergency' ? 'Emergency care was advised' : 'Seeing a doctor today was advised'}</Text>
            <Text muted>Don’t wait for a planned appointment.</Text>
            {summary.urgent.disposition === 'emergency' ? <Button kind="danger" title={`Call ${EMERGENCY_NUMBER}`} onPress={() => Linking.openURL(`tel:${EMERGENCY_NUMBER}`)} /> : null}
          </Card>
        ) : null}
        <Text variant="caption" muted>Built from what you reported and your saved records. Review it, add corrections, then share it with your doctor. Not a diagnosis.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }}>
          {PERIODS.map(([d, l]) => <Chip key={l} label={l} selected={days === d} onPress={() => setDays(d)} />)}
        </View>
        <Card><Text style={{ fontSize: 14, lineHeight: 21 }}>{text}</Text></Card>
        <Button title="Share" onPress={() => Share.share({ title: 'Doctor visit summary', message: text })} />
        <Button kind="secondary" title="Save to medical records" onPress={async () => { await saveVisitSummary(id!, text); setMsg('Saved to medical records.'); }} />
        {msg ? <Text variant="caption" color={c.warn} style={{ marginTop: space.sm }}>{msg}</Text> : null}

        <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Add an update or correction</Text>
        <Card>
          <Field label="Which problem?" value={form.complaint} onChangeText={(v) => setForm((f) => ({ ...f, complaint: v }))} />
          <Field label="How bad now? (0–10, optional)" value={form.severity} keyboardType="number-pad" onChangeText={(v) => setForm((f) => ({ ...f, severity: v }))} />
          <Field label="New symptoms (optional)" value={form.symptoms} onChangeText={(v) => setForm((f) => ({ ...f, symptoms: v }))} />
          <Field label="Note (optional)" value={form.note} onChangeText={(v) => setForm((f) => ({ ...f, note: v }))} />
          <View style={{ marginTop: space.md }}><Chip label={form.corrects ? '✓ This corrects an earlier entry' : 'This corrects an earlier entry'} selected={form.corrects} onPress={() => setForm((f) => ({ ...f, corrects: !f.corrects }))} /></View>
          <Button title="Add to timeline" onPress={addUpdate} />
          <Text variant="caption" muted>Corrections are kept next to the original entry — nothing is deleted.</Text>
        </Card>
      </ScrollView>
    </View>
  );
}
