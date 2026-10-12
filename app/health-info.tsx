// Health Info assistant (native) — general health Q&A via the on-device model.
// Separate from the records "Ask": this answers general questions, never reads a
// profile's documents, and gives educational info only (no diagnosis/treatment).
import { useState } from 'react';
import { ScrollView, View, TextInput, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../src/design/theme';
import { Button, Card, Disclaimer, Text } from '../src/design/components';
import { layout, radius, space } from '../src/design/tokens';
import { askHealthInfo, type ChatTurn } from '../src/features/health';

export default function HealthInfo() {
  const { c } = useTheme();
  const [log, setLog] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (text: string) => {
    if (!text.trim() || busy) return;
    const next: ChatTurn[] = [...log, { role: 'user', text: text.trim() }];
    setLog(next);
    setInput('');
    setBusy(true);
    try {
      const answer = await askHealthInfo(next);
      setLog([...next, { role: 'assistant', text: answer || '(no answer)' }]);
    } catch {
      setLog([...next, { role: 'assistant', text: 'Sorry — something went wrong. Please try again.' }]);
    }
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: layout.screenPadding, paddingTop: space.xl }}>
        <Button kind="text" title="‹" onPress={() => router.replace('/')} />
        <Text variant="title" style={{ flex: 1 }}>Health Info</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingBottom: 16 }}>
        <Card>
          <Text variant="caption" muted>
            General health information only — not a diagnosis and not personal medical advice. Runs on your device; no
            internet. Always discuss your own health with a doctor.
          </Text>
        </Card>
        {log.map((t, i) => (
          <Card key={i} style={t.role === 'user' ? { borderColor: c.accent, marginLeft: 40 } : undefined}>
            <Text>{t.role === 'user' ? 'You: ' : ''}{t.text}</Text>
          </Card>
        ))}
        {busy ? <Text variant="caption" muted style={{ textAlign: 'center' }}>Thinking…</Text> : null}
        <Disclaimer text="General information, not medical advice." />
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: space.sm, padding: layout.screenPadding, paddingTop: 0 }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          editable={!busy}
          onSubmitEditing={() => submit(input)}
          placeholder="Ask a general health question…"
          placeholderTextColor={c.textMuted}
          style={{ flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.field, padding: space.md, color: c.text }}
        />
        <TouchableOpacity onPress={() => submit(input)} style={{ width: 48, height: 48, borderRadius: radius.field, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text color={c.onAccent} style={{ fontSize: 18 }}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
