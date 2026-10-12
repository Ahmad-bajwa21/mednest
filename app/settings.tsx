// S18 — Settings (Phase 1 subset: data controls + legal). App lock, backup, ads, Urdu
// are wired in later phases.
import { Alert, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { deleteEverything } from '../src/data/db';
import { useProfiles } from '../src/state/profilesStore';
import { useTheme } from '../src/design/theme';
import { Button, Card, Text } from '../src/design/components';
import { layout, space } from '../src/design/tokens';

export default function Settings() {
  const { c } = useTheme();
  const { refresh } = useProfiles();

  const onDeleteAll = () => {
    Alert.prompt?.(
      'Delete all data',
      'This permanently wipes the database, images and keys. Type DELETE to confirm.',
      async (text) => {
        if (text === 'DELETE') {
          await deleteEverything();
          await refresh();
          router.replace('/');
        }
      },
    );
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: layout.screenPadding, paddingTop: space.xl }}>
      <Text variant="title" style={{ marginBottom: space.md }}>
        Settings
      </Text>

      <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
        Data
      </Text>
      <Card onPress={onDeleteAll}>
        <Text color={c.danger}>Delete all data</Text>
      </Card>

      <Text variant="caption" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg }}>
        About
      </Text>
      <Card>
        <Text muted>
          Not medical advice. MedNest organises and explains your own documents; it does not diagnose or advise treatment.
        </Text>
      </Card>
      <Text variant="caption" muted style={{ textAlign: 'center', marginTop: space.lg }}>
        MedNest v1.0.0
      </Text>

      <Button kind="secondary" title="Back" onPress={() => router.back()} />
    </ScrollView>
  );
}
