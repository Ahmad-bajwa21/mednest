// S6 — Add / edit profile. Only Name and Relation are required. Uses birth year (less
// sensitive than a full date). Enforces the cap via the store/repo on save.
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useProfiles } from '../state/profilesStore';
import { useTheme } from '../design/theme';
import { Button, Chip, Field, Text } from '../design/components';
import { PROFILE_DOT_COLORS, layout, space } from '../design/tokens';
import type { ProfileRow } from '../data/schema';

const RELATIONS = ['Self', 'Mother', 'Father', 'Spouse', 'Child', 'Other'];
const SEXES = ['F', 'M', '-'];

export function ProfileForm({ existing }: { existing?: ProfileRow }) {
  const { add, update, remove, error } = useProfiles();
  const { c } = useTheme();

  const [name, setName] = useState(existing?.name ?? '');
  const [relation, setRelation] = useState(existing?.relation ?? '');
  const [birthYear, setBirthYear] = useState(existing?.birthYear ? String(existing.birthYear) : '');
  const [sex, setSex] = useState(existing?.sex ?? '-');
  const [bloodGroup, setBloodGroup] = useState(existing?.bloodGroup ?? '');
  const [allergies, setAllergies] = useState(existing?.allergies ?? '');
  const [colour, setColour] = useState(existing?.colour ?? PROFILE_DOT_COLORS[0]);
  const [localError, setLocalError] = useState<string | null>(null);

  // Birth year or age (people often type their age); validated, never guessed.
  const thisYear = new Date().getFullYear();
  const resolveYear = (raw: string): number | null | 'invalid' => {
    const t = raw.trim();
    if (!t) return null;
    if (!/^d{1,4}$/.test(t)) return 'invalid';
    const n = parseInt(t, 10);
    if (n <= 120) return thisYear - n; // an age
    return n >= 1900 && n <= thisYear ? n : 'invalid';
  };
  const resolved = resolveYear(birthYear);
  const ageHint = resolved === 'invalid' ? 'Please enter a birth year (e.g. 1990) or an age in years.' : resolved ? `Age: ${thisYear - resolved} years (born ${resolved})` : undefined;

  const onSave = async () => {
    if (!name.trim()) return setLocalError('Please enter a name.');
    if (!relation) return setLocalError('Please choose a relation.');
    if (resolved === 'invalid') return setLocalError('Please enter a birth year (e.g. 1990) or an age in years (0–120).');
    const fields = {
      name: name.trim(),
      relation,
      birthYear: resolved,
      sex,
      bloodGroup: bloodGroup.trim() || null,
      allergies: allergies.trim() || null,
      colour,
      importedFrom: existing?.importedFrom ?? null,
    };
    if (existing) {
      await update(existing.id, fields);
      router.back();
    } else {
      const row = await add(fields);
      if (row) router.replace(`/profile/${row.id}`);
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    await remove(existing.id);
    router.replace('/');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: layout.screenPadding, paddingTop: space.xl }}>
      <Text variant="title" style={{ marginBottom: space.sm }}>
        {existing ? 'Edit profile' : 'New profile'}
      </Text>

      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Ammi" />

      <Text variant="label" muted style={{ marginTop: space.md, marginBottom: space.xs }}>
        Relation
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {RELATIONS.map((r) => (
          <Chip key={r} label={r} selected={relation === r} onPress={() => setRelation(r)} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: space.lg }}>
        <View style={{ flex: 1 }}>
          <Field label="Birth year or age" value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" placeholder="e.g. 1990 or 34" hint={ageHint} uncertain={resolved === 'invalid'} />
        </View>
        <View>
          <Text variant="label" muted style={{ marginTop: space.md, marginBottom: space.xs }}>
            Sex
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {SEXES.map((s) => (
              <Chip key={s} label={s} selected={sex === s} onPress={() => setSex(s)} />
            ))}
          </View>
        </View>
      </View>

      <Field label="Blood group (optional)" value={bloodGroup} onChangeText={setBloodGroup} placeholder="O+" />
      <Field label="Known allergies (optional)" value={allergies} onChangeText={setAllergies} placeholder="penicillin" />

      <Text variant="label" muted style={{ marginTop: space.md, marginBottom: space.xs }}>
        Colour
      </Text>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        {PROFILE_DOT_COLORS.map((col) => (
          <View
            key={col}
            onTouchEnd={() => setColour(col)}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: col,
              borderWidth: 2,
              borderColor: colour === col ? c.text : 'transparent',
            }}
          />
        ))}
      </View>

      {(localError || error) && (
        <Text color={c.danger} style={{ marginTop: space.md }}>
          {localError ?? error}
        </Text>
      )}

      <Button title="Save" onPress={onSave} />
      {existing ? <Button kind="danger" title="Delete profile" onPress={onDelete} /> : null}
    </ScrollView>
  );
}
