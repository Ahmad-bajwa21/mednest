// S8/S9 — Add document. Choose how: scan with the camera (edge detection, crop and
// perspective correction via the document scanner), pick from the gallery or a file,
// or type it in. Scans are read on-device (OCR + model + code validators) and shown for
// review. Every field the reader was unsure about is marked and blocks "Confirm and
// save" until the user corrects it or confirms it is right. The original image is kept.
import { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../../src/design/theme';
import { Button, Card, Chip, Field, Text } from '../../../src/design/components';
import { layout, radius, space } from '../../../src/design/tokens';
import { saveConfirmedDocument } from '../../../src/data/recordsRepo';
import { native } from '../../../src/native';
import { readDocument, retainImages } from '../../../src/features/scanPipeline';
import { parseFrequency } from '../../../src/ai/frequency';
import type { ReviewDocument } from '../../../src/ai/extract';
import { proposeFollowUp } from '../../../src/domain/followUp';
import { parseLocalDate } from '../../../src/domain/schedule';
import { requestNotificationPermission, syncReminders } from '../../../src/features/reminders';
import { useProfile } from '../../../src/features/useProfile';

const DOC_TYPES = ['Prescription', 'Lab report', 'Scan report', 'Discharge summary', 'Bill', 'Other'];
const TYPE_FROM_AI: Record<string, string> = { prescription: 'Prescription', lab_report: 'Lab report', scan_report: 'Scan report', discharge_summary: 'Discharge summary', bill: 'Bill', other: 'Other' };
const SLOTS = ['Morning', 'Afternoon', 'Evening', 'Night'];

type Source = 'camera' | 'gallery' | 'file' | 'manual';
interface MedDraft { name: string; dose: string; durationDays: string; times: string[]; instructions: string; asNeeded: boolean; asWritten: string | null; candidates: string[] }
interface ResDraft { test: string; value: string; unit: string; rangeLow: string; rangeHigh: string }

function splitRange(range: string | null): [string, string] {
  const m = range?.match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/);
  return m ? [m[1]!, m[2]!] : ['', ''];
}

export default function AddDocument() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { profile } = useProfile(id);

  const [step, setStep] = useState<'choose' | 'reading' | 'review'>('choose');
  const [source, setSource] = useState<Source>('manual');
  const [images, setImages] = useState<string[]>([]);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<{ json: string | null; model: string | null; patientName: string | null }>({ json: null, model: null, patientName: null });
  const [problem, setProblem] = useState<string | null>(null);

  const [type, setType] = useState('Prescription');
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [doctor, setDoctor] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [meds, setMeds] = useState<MedDraft[]>([]);
  const [results, setResults] = useState<ResDraft[]>([]);
  const [followText, setFollowText] = useState('');
  const [followDate, setFollowDate] = useState('');
  const [followConfirmed, setFollowConfirmed] = useState(false);
  // Field keys the reader was unsure about and the user has not resolved yet.
  const [unsure, setUnsure] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = (key: string) => setUnsure((u) => { const n = new Set(u); n.delete(key); return n; });

  /* ---------- capture ---------- */
  const fromReview = (r: ReviewDocument) => {
    const u = new Set<string>();
    setType(TYPE_FROM_AI[r.type] ?? 'Other');
    if (r.date) setDocDate(r.date);
    if (r.dateUnsure) u.add('date');
    setDoctor(r.doctor ?? '');
    setDiagnosis(r.diagnosisWritten ?? '');
    setMeds(
      r.medicines.map((m, i) => {
        if (m.nameUnsure) u.add(`med.${i}.name`);
        if (m.doseUnsure) u.add(`med.${i}.dose`);
        if (m.frequencyUnsure) u.add(`med.${i}.freq`);
        return {
          name: m.name ?? '',
          dose: m.dose ?? '',
          durationDays: m.durationDays ? String(m.durationDays) : '',
          times: m.slots,
          instructions: m.instructions ?? '',
          asNeeded: parseFrequency(m.frequencyRaw).asNeeded,
          asWritten: m.frequencyRaw,
          candidates: m.match.candidates.map((x) => x.name),
        };
      }),
    );
    setResults(
      r.results.map((x, i) => {
        if (x.valueUnsure) u.add(`res.${i}.value`);
        const [lo, hi] = splitRange(x.range);
        return { test: x.test ?? '', value: x.value ?? '', unit: x.unit ?? '', rangeLow: lo, rangeHigh: hi };
      }),
    );
    if (r.followUp) {
      setFollowText(r.followUp);
      const p = proposeFollowUp(r.followUp, r.date, !r.dateUnsure);
      setFollowDate(p.date ?? '');
    }
    setUnsure(u);
  };

  const read = async (uris: string[], src: Source) => {
    setSource(src);
    setStep('reading');
    setProblem(null);
    const out = await readDocument(uris);
    setImages(out.imagePaths);
    setOcrText(out.ocrText || null);
    setExtraction({ json: out.extractionJson, model: out.modelVersion, patientName: out.review?.patientName ?? null });
    if (out.review) fromReview(out.review);
    setProblem(out.problem);
    setStep('review');
  };

  const scan = async () => {
    try {
      const res = await native.scanner.scan(5);
      if (res?.pages.length) await read(res.pages, 'camera');
    } catch (e) {
      setError(String(e).includes('permission') ? 'Camera permission is off. You can allow it in Settings, or choose from the gallery.' : 'The camera could not be opened.');
    }
  };

  const gallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError('Photo access is off. You can allow it in Settings.');
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5, quality: 0.9 });
    if (!res.canceled && res.assets.length) await read(res.assets.map((a) => a.uri), 'gallery');
  };

  const file = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets.length) return;
    const asset = res.assets[0]!;
    if (asset.mimeType?.startsWith('image/')) return read([asset.uri], 'file');
    // PDFs are kept as the original; automatic reading of PDFs is not supported yet.
    setSource('file');
    setImages(await retainImages([asset.uri]));
    setProblem('PDF files are saved as they are, but can’t be read automatically yet. Please fill in the details.');
    setStep('review');
  };

  /* ---------- save ---------- */
  const save = async () => {
    setError(null);
    if (unsure.size) return setError(`${unsure.size} field${unsure.size === 1 ? '' : 's'} still need checking.`);
    if (!parseLocalDate(docDate.trim())) return setError('Please enter the document date as YYYY-MM-DD.');
    if (followDate.trim() && !parseLocalDate(followDate.trim())) return setError('Please enter the follow-up date as YYYY-MM-DD.');
    setSaving(true);
    try {
      const confirmedMeds = meds.filter((m) => m.name.trim());
      await saveConfirmedDocument({
        profileId: id!,
        type,
        docDate: docDate.trim(),
        doctor: doctor.trim() || null,
        diagnosisWritten: diagnosis.trim() || null,
        source,
        imagePaths: images,
        ocrText,
        extractionJson: extraction.json,
        modelVersion: extraction.model,
        medicines: confirmedMeds.map((m) => ({
          name: m.name.trim(),
          dose: m.dose.trim() || null,
          times: m.asNeeded ? [] : m.times,
          durationDays: m.durationDays ? parseInt(m.durationDays, 10) : null,
          instructions: m.instructions.trim() || null,
          asNeeded: m.asNeeded,
        })),
        results: results.filter((r) => r.test.trim()).map((r) => ({ test: r.test.trim(), value: r.value.trim() || null, unit: r.unit.trim() || null, rangeLow: r.rangeLow ? parseFloat(r.rangeLow) : null, rangeHigh: r.rangeHigh ? parseFloat(r.rangeHigh) : null })),
        followUp:
          followText.trim() || followDate.trim()
            ? {
                text: followText.trim() || null,
                date: followDate.trim() || null,
                basis: !followText.trim() ? 'manual' : proposeFollowUp(followText, docDate, !unsure.has('date')).basis,
                confirmed: followConfirmed && !!followDate.trim(),
              }
            : null,
      });
      if (confirmedMeds.length || (followConfirmed && followDate.trim())) {
        await requestNotificationPermission().catch(() => undefined);
        await syncReminders().catch(() => undefined);
      }
      router.replace(`/profile/${id}`);
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  /* ---------- render helpers (functions, not components, so inputs keep focus) ---------- */
  const flagged = (key: string) => unsure.has(key);
  const okButton = (key: string) =>
    flagged(key) ? <Button kind="text" title="✓ This is correct" onPress={() => resolve(key)} /> : null;
  const updMed = (i: number, patch: Partial<MedDraft>, key?: string) => {
    setMeds((ms) => ms.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    if (key) resolve(key);
  };
  const updRes = (i: number, patch: Partial<ResDraft>, key?: string) => {
    setResults((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    if (key) resolve(key);
  };

  const option = (icon: string, title: string, detail: string, onPress: () => void) => (
    <TouchableOpacity key={title} onPress={onPress} accessibilityRole="button" style={{ backgroundColor: c.surface, borderWidth: layout.borderWidth, borderColor: c.border, borderRadius: radius.card, padding: space.lg, marginTop: space.md, flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
      <Text style={{ fontSize: 28 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text variant="heading">{title}</Text>
        <Text variant="caption" muted>{detail}</Text>
      </View>
    </TouchableOpacity>
  );

  if (step === 'choose') {
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: layout.screenPadding, paddingTop: space.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Button kind="text" title="✕" onPress={() => router.back()} />
          <Text variant="title" style={{ flex: 1 }}>Add document</Text>
        </View>
        {option('📷', 'Scan with camera', 'Finds the page edges, straightens and crops it. Retake if blurry.', scan)}
        {option('🖼', 'Choose from gallery', 'Pick photos of a prescription or report.', gallery)}
        {option('📎', 'Choose a file', 'PDF or image from your phone.', file)}
        {option('⌨', 'Enter manually', 'Type the details yourself.', () => { setSource('manual'); setStep('review'); })}
        {error ? <Text variant="caption" color={c.danger} style={{ marginTop: space.md }}>{error}</Text> : null}
        <Text variant="caption" muted style={{ marginTop: space.lg }}>Documents are read on this phone. Nothing is uploaded.</Text>
      </ScrollView>
    );
  }

  if (step === 'reading') {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        <ActivityIndicator color={c.accent} size="large" />
        <Text style={{ marginTop: space.lg }}>Reading your document…</Text>
        <Text variant="caption" muted>This can take up to a minute.</Text>
      </View>
    );
  }

  const nameMismatch =
    extraction.patientName && profile?.name && !extraction.patientName.toLowerCase().split(/\s+/).some((w) => w.length > 1 && profile.name.toLowerCase().includes(w));

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: layout.screenPadding, paddingTop: space.xl, paddingBottom: 48 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Button kind="text" title="✕" onPress={() => router.back()} />
        <Text variant="title" style={{ flex: 1 }}>{source === 'manual' ? 'Add document' : 'Check and confirm'}</Text>
      </View>

      {images.length ? (
        <ScrollView horizontal style={{ marginTop: space.sm }} contentContainerStyle={{ gap: space.sm }}>
          {images.filter((p) => !p.endsWith('.pdf')).map((p) => <Image key={p} source={{ uri: p }} style={{ width: 96, height: 128, borderRadius: radius.field, borderWidth: 1, borderColor: c.border }} />)}
          {images.some((p) => p.endsWith('.pdf')) ? <Text muted>PDF attached</Text> : null}
        </ScrollView>
      ) : null}
      {source === 'camera' ? <Button kind="text" title="Retake photo" onPress={scan} /> : null}

      {problem ? (
        <Card style={{ borderColor: c.warn }}>
          <Text color={c.warn}>{problem}</Text>
        </Card>
      ) : source !== 'manual' ? (
        <Text variant="caption" muted>Read by AI on this phone. Fields marked “Please check” must be corrected or confirmed before saving.</Text>
      ) : null}
      {nameMismatch ? (
        <Card style={{ borderColor: c.warn }}>
          <Text color={c.warn}>This document seems to be for “{extraction.patientName}”. It will be saved to {profile?.name}’s record.</Text>
        </Card>
      ) : null}

      <Text variant="label" muted style={{ marginTop: space.md, marginBottom: space.xs }}>Type</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {DOC_TYPES.map((t) => <Chip key={t} label={t} selected={type === t} onPress={() => setType(t)} />)}
      </View>

      <Field label="Date" value={docDate} uncertain={flagged('date')} onChangeText={(v) => { setDocDate(v); resolve('date'); }} placeholder="YYYY-MM-DD" />
      {okButton('date')}
      <Field label="Doctor" value={doctor} onChangeText={setDoctor} placeholder="Dr. S. Khan" />
      <Field label="Diagnosis (only if written on the document)" value={diagnosis} onChangeText={setDiagnosis} />

      <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Medicines</Text>
      {meds.map((m, i) => (
        <Card key={i}>
          <Field label="Name" value={m.name} uncertain={flagged(`med.${i}.name`)} onChangeText={(v) => updMed(i, { name: v }, `med.${i}.name`)} />
          {m.candidates.length && flagged(`med.${i}.name`) ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
              {m.candidates.map((n) => <Chip key={n} label={n} onPress={() => updMed(i, { name: n }, `med.${i}.name`)} />)}
            </View>
          ) : null}
          {okButton(`med.${i}.name`)}
          <Field label="Dose" value={m.dose} uncertain={flagged(`med.${i}.dose`)} onChangeText={(v) => updMed(i, { dose: v }, `med.${i}.dose`)} placeholder="500 mg" />
          {okButton(`med.${i}.dose`)}
          {m.asWritten ? <Text variant="caption" muted style={{ marginTop: space.sm }}>Written on the prescription: “{m.asWritten}”</Text> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
            <Chip label="At set times" selected={!m.asNeeded} onPress={() => updMed(i, { asNeeded: false }, `med.${i}.freq`)} />
            <Chip label="Only when needed" selected={m.asNeeded} onPress={() => updMed(i, { asNeeded: true, times: [] }, `med.${i}.freq`)} />
          </View>
          {!m.asNeeded ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm, padding: flagged(`med.${i}.freq`) ? space.xs : 0, borderWidth: flagged(`med.${i}.freq`) ? 1.5 : 0, borderColor: c.warn, borderRadius: radius.field }}>
              {SLOTS.map((s) => <Chip key={s} label={s} selected={m.times.includes(s)} onPress={() => updMed(i, { times: m.times.includes(s) ? m.times.filter((x) => x !== s) : [...m.times, s] }, `med.${i}.freq`)} />)}
            </View>
          ) : null}
          {flagged(`med.${i}.freq`) ? <Text variant="caption" color={c.warn}>We could not read how often. Please choose the times written by your doctor.</Text> : null}
          {okButton(`med.${i}.freq`)}
          <Field label="Duration (days)" value={m.durationDays} keyboardType="number-pad" onChangeText={(v) => updMed(i, { durationDays: v })} hint={m.durationDays ? undefined : 'Not written? Leave empty — reminders continue until you stop them.'} />
          <Field label="Instructions" value={m.instructions} onChangeText={(v) => updMed(i, { instructions: v })} placeholder="After meals" />
          <Button kind="text" title="Remove" onPress={() => {
            setMeds((ms) => ms.filter((_, j) => j !== i));
            // Drop this medicine's flags and shift the later ones down — never clear them.
            setUnsure((u) => new Set([...u].flatMap((k) => {
              const m2 = k.match(/^med\.(\d+)\.(.+)$/);
              if (!m2) return [k];
              const j = +m2[1]!;
              return j === i ? [] : [j > i ? `med.${j - 1}.${m2[2]}` : k];
            })));
          }} />
        </Card>
      ))}
      <Button kind="text" title="＋ Add medicine" onPress={() => setMeds((ms) => [...ms, { name: '', dose: '', durationDays: '', times: [], instructions: '', asNeeded: false, asWritten: null, candidates: [] }])} />

      <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Results</Text>
      {results.map((r, i) => (
        <Card key={i}>
          <Field label="Test" value={r.test} onChangeText={(v) => updRes(i, { test: v })} placeholder="HbA1c" />
          <Field label="Value" value={r.value} uncertain={flagged(`res.${i}.value`)} onChangeText={(v) => updRes(i, { value: v }, `res.${i}.value`)} />
          {okButton(`res.${i}.value`)}
          <Field label="Unit" value={r.unit} onChangeText={(v) => updRes(i, { unit: v })} placeholder="%" />
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}><Field label="Range low" value={r.rangeLow} keyboardType="numeric" onChangeText={(v) => updRes(i, { rangeLow: v })} /></View>
            <View style={{ flex: 1 }}><Field label="Range high" value={r.rangeHigh} keyboardType="numeric" onChangeText={(v) => updRes(i, { rangeHigh: v })} /></View>
          </View>
        </Card>
      ))}
      <Button kind="text" title="＋ Add result" onPress={() => setResults((rs) => [...rs, { test: '', value: '', unit: '', rangeLow: '', rangeHigh: '' }])} />

      <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Follow-up</Text>
      <Card>
        <Field label="As written (optional)" value={followText} onChangeText={(v) => { setFollowText(v); setFollowConfirmed(false); }} placeholder="e.g. Review after 7 days" />
        {followText.trim() ? <Text variant="caption" muted style={{ marginTop: space.xs }}>{proposeFollowUp(followText, docDate, !flagged('date')).explanation}</Text> : null}
        <Field label="Follow-up date" value={followDate} onChangeText={(v) => { setFollowDate(v); setFollowConfirmed(false); }} placeholder="YYYY-MM-DD" />
        {followDate.trim() ? (
          <Chip label={followConfirmed ? '✓ Date confirmed — reminders will be set' : 'Confirm this date and set reminders'} selected={followConfirmed} onPress={() => setFollowConfirmed((v) => !v)} />
        ) : followText.trim() ? (
          <Text variant="caption" muted>No date yet — it will wait under Pending confirmations.</Text>
        ) : null}
      </Card>

      {error ? <Text variant="caption" color={c.danger} style={{ marginTop: space.md }}>{error}</Text> : null}
      {unsure.size ? <Text variant="caption" color={c.warn} style={{ marginTop: space.md }}>{unsure.size} field{unsure.size === 1 ? '' : 's'} still need checking.</Text> : null}
      <Button title="Confirm and save" onPress={save} disabled={unsure.size > 0} loading={saving} />
      <Button kind="text" title="Discard" onPress={() => router.back()} />
    </ScrollView>
  );
}
