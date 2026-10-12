// Bottom tabs for a profile (Overview · Timeline · Meds · Ask) — spec §S7.
import { View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../design/theme';
import { Text } from '../design/components';
import { layout, space } from '../design/tokens';

type Key = 'overview' | 'timeline' | 'meds' | 'ask';
const TABS: Array<{ key: Key; icon: string; label: string; path: (id: string) => string }> = [
  { key: 'overview', icon: '▦', label: 'Overview', path: (id) => `/profile/${id}` },
  { key: 'timeline', icon: '≣', label: 'Timeline', path: (id) => `/profile/${id}/timeline` },
  { key: 'meds', icon: '℞', label: 'Meds', path: (id) => `/profile/${id}/meds` },
  { key: 'ask', icon: '?', label: 'Ask', path: (id) => `/profile/${id}/ask` },
];

export function BottomTabs({ id, active }: { id: string; active: Key }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', borderTopWidth: layout.borderWidth, borderColor: c.border, backgroundColor: c.bg }}>
      {TABS.map((t) => (
        <TouchableOpacity
          key={t.key}
          style={{ flex: 1, alignItems: 'center', paddingVertical: space.sm, paddingBottom: space.md }}
          onPress={() => (active === t.key ? null : router.replace(t.path(id)))}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === t.key }}
        >
          <Text style={{ fontSize: 20, color: active === t.key ? c.accent : c.textMuted }}>{t.icon}</Text>
          <Text variant="caption" color={active === t.key ? c.accent : c.textMuted}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
