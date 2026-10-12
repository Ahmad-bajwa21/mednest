// Bottom tabs for a profile (Overview · Timeline · Meds · Ask) — spec §S7.
import { View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../design/theme';
import { Text } from '../design/components';
import { layout, space } from '../design/tokens';

// Five places people look for health information (same as the web app). Older screen
// keys map onto them so existing screens keep working.
type Key = 'home' | 'assist' | 'records' | 'meds' | 'appts' | 'overview' | 'timeline' | 'ask';
const ALIAS: Record<string, Key> = { overview: 'home', timeline: 'records', ask: 'assist' };
const TABS: Array<{ key: Key; icon: string; label: string; path: (id: string) => string }> = [
  { key: 'home', icon: '⌂', label: 'Home', path: (id) => `/profile/${id}` },
  { key: 'assist', icon: '✚', label: 'Assistant', path: (id) => `/profile/${id}/assistant` },
  { key: 'records', icon: '≣', label: 'Records', path: (id) => `/profile/${id}/history` },
  { key: 'meds', icon: '℞', label: 'Medicines', path: (id) => `/profile/${id}/meds` },
  { key: 'appts', icon: '▣', label: 'Appointments', path: (id) => `/profile/${id}/appointments` },
];

export function BottomTabs({ id, active: raw }: { id: string; active: Key }) {
  const { c } = useTheme();
  const active = ALIAS[raw] ?? raw;
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
