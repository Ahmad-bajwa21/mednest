// Symptom assistant (proposal §1–§2, §12). Adaptive follow-up questions from the
// rules-based triage engine; emergencies are detected in code on every message and end
// the questioning with a call-now message. History-aware (allergies, current medicines,
// earlier episodes). Every finished check is saved to the profile's history.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../src/design/theme';
import { Button, Card, Chip, Text } from '../../../src/design/components';
import { layout, radius, space } from '../../../src/design/tokens';
import { ageFromBirthYear, useCare } from '../../../src/features/useCare';
import { computeOutcome, respond, startTriage, DISCLAIMER, type AssistantMessage, type TriageState } from '../../../src/ai/triage/engine';
import { EMERGENCY_NUMBER } from '../../../src/ai/triage/redFlags';
import { makeLlmInterpreter } from '../../../src/ai/triage/llmInterpreter';
import type { TriageContext } from '../../../src/ai/triage/protocols';
import { saveAssessment } from '../../../src/data/careRepo';
import { deriveStatus, localDateIso } from '../../../src/domain/schedule';
import { native } from '../../../src/native';

interface Bubble {
  role: 'user' | 'assistant';
  msg: AssistantMessage;
}

export default function Assistant() {
  const { id, q } = useLocalSearchParams<{ id: string; q?: string }>();
  const { c } = useTheme();
  const { profile, data, reload } = useCare(id);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const ctx = useMemo<TriageContext>(() => {
    const today = localDateIso(new Date());
    return {
      ageYears: ageFromBirthYear(profile?.birthYear),
      allergies: profile?.allergies,
      activeMedicines: (data?.medicines ?? []).filter((m) => deriveStatus(m, today) === 'active').map((m) => `${m.name}${m.dose ? ' ' + m.dose : ''}`),
      priorEpisodes: (data?.episodes ?? []).map((e) => ({ protocolId: e.protocolId ?? '', complaint: e.complaint, date: e.createdAt.slice(0, 10), disposition: e.disposition })),
      now: new Date(),
    };
  }, [profile, data]);

  const initial = useMemo(() => startTriage(ctx), []); // start once; ctx is re-read on every message
  const [state, setState] = useState<TriageState>(initial.state);
  const [bubbles, setBubbles] = useState<Bubble[]>(initial.messages.map((m) => ({ role: 'assistant', msg: m })));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const interpret = useMemo(() => makeLlmInterpreter(native.llm), []);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    setBusy(true);
    setBubbles((b) => [...b, { role: 'user', msg: { kind: 'info', text: t } }]);
    try {
      const r = await respond(state, t, { ...ctx, now: new Date() }, interpret);
      setState(r.state);
      setBubbles((b) => [...b, ...r.messages.map((m) => ({ role: 'assistant' as const, msg: m }))]);
      // Save once the check has an outcome (emergencies included).
      if (r.state.done && !r.state.stopped && !savedId && id) {
        const summary = r.state.disposition === 'emergency' ? r.messages.map((m) => m.text).join('\n') : computeSummaryText(r.state, ctx);
        setSavedId(await saveAssessment(id, r.state, summary));
      }
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  // Opened from Ask with the person's own words: answer them straight away.
  const sentOpening = useRef(false);
  useEffect(() => {
    if (q && profile && data && !sentOpening.current) {
      sentOpening.current = true;
      send(q);
    }
  }, [q, profile, data]); // once, when the profile has loaded

  const restart = () => {
    const s = startTriage({ ...ctx, now: new Date() });
    setState(s.state);
    setBubbles(s.messages.map((m) => ({ role: 'assistant', msg: m })));
    setSavedId(null);
    reload();
  };

  const lastAssistant = [...bubbles].reverse().find((b) => b.role === 'assistant')?.msg;
  const call = () => Linking.openURL(`tel:${EMERGENCY_NUMBER}`);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: layout.screenPadding, paddingTop: space.xl }}>
        <Button kind="text" title="‹" onPress={() => router.replace(`/profile/${id}`)} />
        <Text variant="title" style={{ flex: 1 }}>Symptom check{profile ? ` · ${profile.name}` : ''}</Text>
      </View>

      <View style={{ marginHorizontal: layout.screenPadding, padding: space.md, borderRadius: radius.card, borderWidth: layout.borderWidth, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text variant="caption" muted style={{ flex: 1 }}>Rules-based assistant, not a doctor. Emergency? Call {EMERGENCY_NUMBER} now.</Text>
        <TouchableOpacity onPress={call} accessibilityRole="button" style={{ paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.chip, borderWidth: 1, borderColor: c.danger }}>
          <Text variant="label" color={c.danger}>Call {EMERGENCY_NUMBER}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingBottom: space.lg }}>
        {bubbles.map((b, i) =>
          b.role === 'user' ? (
            <Card key={i} style={{ borderColor: c.accent, marginLeft: 48 }}>
              <Text>{b.msg.text}</Text>
            </Card>
          ) : (
            <Card key={i} style={b.msg.kind === 'emergency' ? { borderColor: c.danger, borderWidth: 2 } : b.msg.kind === 'summary' ? { borderColor: c.accent } : { marginRight: 32 }}>
              {b.msg.kind === 'emergency' ? <Text variant="heading" color={c.danger} style={{ marginBottom: space.xs }}>Get help now</Text> : null}
              <Text>{b.msg.text}</Text>
              {b.msg.kind === 'emergency' ? <Button kind="danger" title={`Call ${EMERGENCY_NUMBER}`} onPress={call} /> : null}
            </Card>
          ),
        )}

        {state.done ? (
          <View style={{ gap: space.sm }}>
            {savedId ? <Text variant="caption" muted style={{ textAlign: 'center' }}>Saved to {profile?.name ?? 'the'} history.</Text> : null}
            <Button title="Prepare doctor visit summary" onPress={() => router.push(`/profile/${id}/visit`)} />
            <Button kind="secondary" title="Start a new check" onPress={restart} />
            <Button kind="text" title="See medical history" onPress={() => router.push(`/profile/${id}/history`)} />
          </View>
        ) : lastAssistant?.quickReplies?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
            {lastAssistant.quickReplies.map((q) => <Chip key={q} label={q} onPress={() => send(q)} />)}
          </View>
        ) : null}
      </ScrollView>

      {!state.done ? (
        <View style={{ flexDirection: 'row', gap: space.sm, padding: layout.screenPadding, paddingTop: 0 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send(input)}
            editable={!busy}
            placeholder="Type your answer…"
            placeholderTextColor={c.textMuted}
            style={{ flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.field, padding: space.md, color: c.text }}
          />
          <TouchableOpacity onPress={() => send(input)} disabled={busy} style={{ width: 48, height: 48, borderRadius: radius.field, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
            <Text color={c.onAccent} style={{ fontSize: 18 }}>➤</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text variant="caption" muted style={{ textAlign: 'center', paddingBottom: space.md, paddingHorizontal: layout.screenPadding }}>{DISCLAIMER}</Text>
    </View>
  );
}

function computeSummaryText(state: TriageState, ctx: TriageContext): string {
  const o = computeOutcome(state, ctx);
  return `${o.summary}\n\n${o.advice}`;
}
