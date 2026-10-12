// S14 — Ask. Scope is one profile. Advice-seeking questions get a fixed refusal; every
// answer lists its source documents. Rule-based on-web/stub; model-backed on-device.
import { useState } from 'react';
import { ScrollView, View, TextInput, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useBundle } from '../../../src/features/useBundle';
import { askRecords, type AskAnswer } from '../../../src/domain/ask';
import { useTheme } from '../../../src/design/theme';
import { Button, Card, Chip, Disclaimer, Text } from '../../../src/design/components';
import { BottomTabs } from '../../../src/features/BottomTabs';
import { layout, radius, space } from '../../../src/design/tokens';

interface Turn { role: 'user' | 'bot'; text: string; sources?: string[] }
const SUGGESTED = ['Last sugar test?', 'Current medicines?', 'What changed this year?'];

export default function Ask() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bundle } = useBundle(id);
  const { c } = useTheme();
  const [log, setLog] = useState<Turn[]>([]);
  const [input, setInput] = useState('');

  const submit = (text: string) => {
    if (!text.trim() || !bundle) return;
    const res: AskAnswer | null = askRecords(bundle, text);
    setLog((l) => [...l, { role: 'user', text }, { role: 'bot', text: res?.answer ?? '', sources: res?.sources }]);
    setInput('');
  };

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
          </View>
        ) : (
          log.map((t, i) => (
            <Card key={i} style={t.role === 'user' ? { borderColor: c.accent, marginLeft: 40 } : undefined}>
              <Text>{t.role === 'user' ? 'You: ' : ''}{t.text}</Text>
              {t.sources && t.sources.length ? (
                <Text variant="caption" muted style={{ marginTop: space.xs }}>Source: {t.sources.length} document(s)</Text>
              ) : null}
            </Card>
          ))
        )}
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
