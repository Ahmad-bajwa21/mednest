// S14 — Ask. Scope is one profile. Shared rules-based answerer (src/domain/askCare):
// medicines (what for, when, how long, who prescribed), results, follow-ups, allergies,
// doses and symptom checks, plus curated general medicine information. Advice-seeking
// questions get a fixed refusal; emergencies get the call-now message.
import { useState } from 'react';
import { ScrollView, View, TextInput, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useBundle } from '../../../src/features/useBundle';
import { askCare, type AskContext } from '../../../src/domain/askCare';
import { useCare } from '../../../src/features/useCare';
import { useTheme } from '../../../src/design/theme';
import { Button, Card, Chip, Disclaimer, Text } from '../../../src/design/components';
import { BottomTabs } from '../../../src/features/BottomTabs';
import { layout, radius, space } from '../../../src/design/tokens';

interface Turn { role: 'user' | 'bot'; text: string; sources?: string[]; suggestions?: string[]; emergency?: boolean }
const SUGGESTED = ['What medicines am I taking, and why?', 'When do I take them?', 'Next follow-up?', 'Last sugar test?'];

export default function Ask() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bundle } = useBundle(id);
  const { profile, data } = useCare(id);
  const { c } = useTheme();
  const [log, setLog] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [ctx, setCtx] = useState<AskContext>({});

  const submit = (text: string) => {
    if (!text.trim() || !bundle || !data || !profile) return;
    const res = askCare(text, {
      profileName: profile.name,
      allergies: profile.allergies,
      documents: data.documents,
      medicines: data.medicines,
      results: bundle.results,
      appointments: data.appointments,
      episodes: data.episodes,
      doseLogs: data.doseLogs,
      now: new Date(),
    }, ctx);
    // Conversation memory: selected medicine, already-explained medicines, and the
    // question behind a "which medicine?" clarification.
    setCtx({
      lastMedicineId: res?.medicineId ?? ctx.lastMedicineId ?? null,
      explainedIds: res?.explainedIds ?? ctx.explainedIds,
      pendingIntent: res?.pendingIntent ?? null,
    });
    setLog((l) => [...l, { role: 'user', text }, { role: 'bot', text: res?.answer ?? '', sources: res?.sources, suggestions: res?.suggestions, emergency: res?.emergency }]);
    setInput('');
  };
  const last = [...log].reverse().find((t) => t.role === 'bot');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: layout.screenPadding, paddingTop: space.xl }}>
        <Button kind="text" title="‹" onPress={() => router.replace(`/profile/${id}`)} />
        <Text variant="title" style={{ flex: 1 }}>Ask {bundle?.profile.name ? `· ${bundle.profile.name}` : ''}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingBottom: 80 }}>
        {log.length === 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {SUGGESTED.map((q) => <Chip key={q} label={q} onPress={() => submit(q)} />)}
            <Chip label="Check a symptom →" onPress={() => router.push(`/profile/${id}/assistant`)} />
          </View>
        ) : (
          log.map((t, i) => (
            <Card key={i} style={t.role === 'user' ? { borderColor: c.accent, marginLeft: 40 } : t.emergency ? { borderColor: c.danger, borderWidth: 2 } : undefined}>
              <Text>{t.role === 'user' ? 'You: ' : ''}{t.text}</Text>
              {t.sources && t.sources.length ? (
                <Text variant="caption" muted style={{ marginTop: space.xs }}>Source: {t.sources.length} document(s)</Text>
              ) : null}
            </Card>
          ))
        )}
        {last?.suggestions?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {last.suggestions.map((q) => <Chip key={q} label={q} onPress={() => submit(q)} />)}
          </View>
        ) : null}
        <Disclaimer />
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: space.sm, padding: layout.screenPadding, paddingTop: 0 }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => submit(input)}
          placeholder={`Ask about ${bundle?.profile.name ?? ''}…`}
          placeholderTextColor={c.textMuted}
          style={{ flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.field, padding: space.md, color: c.text }}
        />
        <TouchableOpacity onPress={() => submit(input)} style={{ width: 48, height: 48, borderRadius: radius.field, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text color={c.onAccent} style={{ fontSize: 18 }}>➤</Text>
        </TouchableOpacity>
      </View>
      <BottomTabs id={id!} active="ask" />
    </View>
  );
}
