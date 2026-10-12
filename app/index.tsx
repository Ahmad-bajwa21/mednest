// S5 — Profiles (home). Choose whose record to open. Hard 4-profile cap.
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useProfiles } from '../src/state/profilesStore';
import { useTheme } from '../src/design/theme';
import { BannerAdSlot, Button, Card, EmptyState, Text } from '../src/design/components';
import { MAX_PROFILES } from '../src/data/schema';
import { layout, space } from '../src/design/tokens';

export default function ProfilesHome() {
  const { profiles, refresh } = useProfiles();
  const { c } = useTheme();

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* top bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: layout.screenPadding, paddingTop: space.xl }}>
        <Text variant="title" style={{ flex: 1 }}>
          MedNest
        </Text>
        <Button kind="text" title="⚙" onPress={() => router.push('/settings')} />
      </View>

      <ScrollView contentContainerStyle={{ padding: layout.screenPadding, paddingTop: 0 }}>
        {profiles.length === 0 ? (
          <EmptyState
            icon="👪"
            message="Add the first person whose records you want to keep."
            action={<Button title="Add profile" onPress={() => router.push('/profile/new')} />}
          />
        ) : (
          <>
            {profiles.map((p) => (
              <Card key={p.id} onPress={() => router.push(`/profile/${p.id}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: p.colour, marginRight: space.md }} />
                  <View style={{ flex: 1 }}>
                    <Text variant="heading">
                      {p.name} <Text muted>{p.relation}</Text>
                    </Text>
                  </View>
                  <Text muted>›</Text>
                </View>
              </Card>
            ))}

            {profiles.length < MAX_PROFILES ? (
              <Card onPress={() => router.push('/profile/new')}>
                <Text variant="heading">＋ Add profile</Text>
              </Card>
            ) : null}

            <Text variant="caption" muted style={{ textAlign: 'center', marginTop: space.sm }}>
              {profiles.length} of {MAX_PROFILES} profiles
            </Text>
          </>
        )}

        <Card onPress={() => router.push('/health-info')}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 20, marginRight: space.md }}>💬</Text>
            <View style={{ flex: 1 }}>
              <Text variant="heading">Health Info</Text>
              <Text muted>General health questions · on-device, offline</Text>
            </View>
            <Text muted>›</Text>
          </View>
        </Card>
      </ScrollView>

      <BannerAdSlot />
    </View>
  );
}
