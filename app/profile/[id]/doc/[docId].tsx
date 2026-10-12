// S11 — Document detail. "In simple words" (template restatement) + results + medicines
// + comparison with an earlier document of the same test. Delete removes it and its data.
import { useCallback, useState } from 'react';
import { Alert, Image, ScrollView, View } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useBundle } from '../../../../src/features/useBundle';
import { deleteDocumentCascade, getDocumentRow } from '../../../../src/data/recordsRepo';
import { jsonArray } from '../../../../src/data/json';
import type { DocumentRow } from '../../../../src/data/schema';
import { useTheme } from '../../../../src/design/theme';
import { Button, Card, Disclaimer, Text } from '../../../../src/design/components';
import { layout, space } from '../../../../src/design/tokens';
import { sortedResults, toNum } from '../../../../src/domain/types';

export default function DocDetail() {
  const { id, docId } = useLocalSearchParams<{ id: string; docId: string }>();
  const { bundle, reload } = useBundle(id);
  const { c } = useTheme();
  const [row, setRow] = useState<DocumentRow | null>(null);
  const [showText, setShowText] = useState(false);
  useFocusEffect(useCallback(() => { reload(); getDocumentRow(docId!).then((r) => setRow(r ?? null)); }, [reload, docId]));

  if (!bundle) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  const doc = bundle.documents.find((d) => d.id === docId);
  if (!doc) return <Text style={{ padding: layout.screenPadding }}>Document not found.</Text>;

  const meds = bundle.medicines.filter((m) => m.documentId === docId);
  const res = bundle.results.filter((r) => r.documentId === docId);

  const simple = res.length
    ? res
        .map((r) => {
          const v = toNum(r.value);
          let note = '';
          if (v != null && r.rangeHigh != null && v > r.rangeHigh) note = ` This is above the report's range (up to ${r.rangeHigh}).`;
          else if (v != null && r.rangeLow != null && v < r.rangeLow) note = ` This is below the report's range (from ${r.rangeLow}).`;
          return `Your ${r.test} is ${r.value ?? ''}${r.unit ? ' ' + r.unit : ''}.${note}`;
        })
        .join(' ')
    : meds.length
      ? `This ${doc.type.toLowerCase()} lists ${meds.length} medicine${meds.length > 1 ? 's' : ''}.`
      : `A ${doc.type.toLowerCase()} dated ${doc.docDate ?? 'an unknown date'}.`;

  const comparisons = res
    .map((r) => {
      const prev = sortedResults(bundle).find((x) => x.test === r.test && (x.docDate ?? '') < (doc.docDate ?? ''));
      return prev ? `${r.test}: ${prev.value} → ${r.value} (since ${prev.docDate})` : '';
    })
    .filter(Boolean);

  const onDelete = () => {
    Alert.alert('Delete document', 'Delete this document and everything read from it?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteDocumentCascade(docId!);
          router.replace(`/profile/${id}/timeline`);
        },
      },
    ]);
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: layout.screenPadding, paddingTop: space.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Button kind="text" title="‹" onPress={() => router.replace(`/profile/${id}/timeline`)} />
        <Text variant="title" style={{ flex: 1 }}>{doc.type}</Text>
        <Button kind="text" title="🗑" onPress={onDelete} />
      </View>
      <Text variant="caption" muted>{doc.docDate ?? '—'}{doc.doctor ? ' · ' + doc.doctor : ''}</Text>
      <Text variant="caption" muted>
        {row?.source && row.source !== 'manual' ? 'Read by AI on this phone, then checked and confirmed by you.' : 'Entered by you.'}
      </Text>

      {row && jsonArray(row.imagePaths).length ? (
        <>
          <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Original document</Text>
          <ScrollView horizontal contentContainerStyle={{ gap: space.sm }}>
            {jsonArray(row.imagePaths).map((p) =>
              p.endsWith('.pdf') ? <Card key={p}><Text muted>PDF saved</Text></Card> : <Image key={p} source={{ uri: p }} style={{ width: 220, height: 300, borderRadius: 8, borderWidth: 1, borderColor: c.border }} resizeMode="contain" />,
            )}
          </ScrollView>
        </>
      ) : null}
      {row?.diagnosisWritten ? (
        <Card><Text variant="label" muted>Diagnosis written by the doctor</Text><Text>{row.diagnosisWritten}</Text></Card>
      ) : null}

      <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>In simple words</Text>
      <Card><Text>{simple}</Text></Card>

      {res.length ? (
        <>
          <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Results</Text>
          <Card>
            {res.map((r, i) => {
              const v = toNum(r.value);
              const oor = v != null && ((r.rangeLow != null && v < r.rangeLow) || (r.rangeHigh != null && v > r.rangeHigh));
              return (
                <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: i ? space.sm : 0 }}>
                  <Text>{r.test}</Text>
                  <Text color={oor ? c.warn : c.text}>{r.value}{r.unit ? ' ' + r.unit : ''}</Text>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {meds.length ? (
        <>
          <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Medicines</Text>
          <Card>
            {meds.map((m) => (
              <Button key={m.id} kind="text" title={`${m.name} ${m.dose ?? ''} — ${m.times.join(', ') || '—'}`} onPress={() => router.push(`/profile/${id}/medicine/${m.id}`)} />
            ))}
          </Card>
        </>
      ) : null}

      {comparisons.length ? (
        <>
          <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Compared with earlier</Text>
          <Card>{comparisons.map((cmp, i) => <Text key={i}>{cmp}</Text>)}</Card>
        </>
      ) : null}

      {row?.ocrText ? (
        <>
          <Button kind="text" title={showText ? 'Hide text read from the page' : 'Show text read from the page'} onPress={() => setShowText((v) => !v)} />
          {showText ? <Card><Text variant="caption">{row.ocrText}</Text></Card> : null}
        </>
      ) : null}

      <Disclaimer />
    </ScrollView>
  );
}
