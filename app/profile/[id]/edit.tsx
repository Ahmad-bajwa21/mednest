import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { ProfileForm } from '../../../src/features/ProfileForm';
import { useProfile } from '../../../src/features/useProfile';
import { Text } from '../../../src/design/components';

export default function EditProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, loading } = useProfile(id);
  if (loading) return <View />;
  if (!profile) return <Text style={{ padding: 16 }}>Profile not found.</Text>;
  return <ProfileForm existing={profile} />;
}
