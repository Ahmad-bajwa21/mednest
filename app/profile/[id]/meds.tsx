// S12 — Medicines. Current (active / paused / waiting for details) and past (completed /
// stopped). Tap a medicine to see or edit its schedule; "Doses" shows today's doses.
import { useCallback } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useCare } from '../../../src/features/useCare';
import { useTheme } from '../../../src/design/theme';
import { Button, Card, Disclaimer, Text, BannerAdSlot } from '../../../src/design/components';
import { BottomTabs } from '../../../src/features/BottomTabs';
import { layout, space } from '../../../src/design/tokens';
import { deriveStatus, effectiveEndDate, formatTime, localDateIso, resolveTime, scheduleBlockers, type MedStatus } from '../../../src/domain/schedule';
import type { CareMedicine } from '../../../src/domain/care';

const STATUS_LABEL: Record<MedStatus, string> = { pending: 'Needs details', active: 'Active', paused: 'Paused', completed: 'Completed', discontinued: 'Stopped' };

export default function Meds() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, reload } = useCare(id);
  const { c } = useTheme();
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const today = localDateIso(new Date());
  const all = data?.medicines ?? [];
  const current = all.filter((m) => ['active', 'paused', 'pending'].includes(deriveStatus(m, today)));
  const past = all.filter((m) => !current.includes(m));

  const card = (m: CareMedicine) => {
    const status = deriveStatus(m, today);
    const needs = (status === 'active' || status === 'pending') && scheduleBlockers(m).length > 0;
    const end = effectiveEndDate(m);
    return (
      <Card key={m.id} onPress={() => router.push(`/profile/${id}/medicine/${m.id}`)} style={needs ? { borderColor: c.warn } : undefined}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="heading" style={{ flex: 1 }}>{m.name} {m.dose ?? ''}</Text>
          <Text variant="label" color={needs ? c.warn : status === 'active' ? c.ok : c.textMuted}>{needs ? 'Needs details' : STATUS_LABEL[status]}</Text>
        </View>
        <Text muted>{m.asNeeded ? 'When needed' : m.times.length ? m.times.map((t) => { const r = resolveTime(t); return r ? formatTime(r) : t; }).join(' · ') : 'No times set'}</Text>
        <Text variant="caption" muted>{end ? `Until ${end}` : m.durationDays ? `For ${m.durationDays} days` : 'No end date'}{m.instructions ? ` · ${m.instructions}` : ''}</Text>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: layout.screenPadding, paddingTop: space.xl }}>
        <Button kind="text" title="‹" onPress={() => router.replace(`/profile/${id}`)} />
        <Text variant="title" style={{ flex: 1 }}>Medicines</Text>
        <Button kind="text" title="Doses" onPress={() => router.push(`/profile/${id}/doses`)} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: layout.screenPadding, paddingBottom: 80 }}>
        <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Current ({current.length})</Text>
        {current.length ? current.map(card) : <Text muted>No current medicines</Text>}
        {past.length ? (
          <>
            <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>Past ({past.length})</Text>
            {past.map(card)}
          </>
        ) : null}
        <Disclaimer />
      </ScrollView>
      <BannerAdSlot />
      <BottomTabs id={id!} active="meds" />
    </View>
  );
}
