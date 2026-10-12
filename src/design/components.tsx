// MedNest core components — spec §2.5. Solid flat fills, 1dp borders, no shadows.
import React from 'react';
import {
  Text as RNText,
  TextProps,
  TouchableOpacity,
  View,
  ViewProps,
  TextInput,
  TextInputProps,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from './theme';
import { layout, radius, space, type as T } from './tokens';

/* ---------- Text ---------- */
type Variant = keyof typeof T;
export function Text({
  variant = 'body',
  muted,
  color,
  style,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean; color?: string }) {
  const { c } = useTheme();
  return <RNText style={[T[variant], { color: color ?? (muted ? c.textMuted : c.text) }, style]} {...rest} />;
}

/* ---------- Button ---------- */
type BtnKind = 'primary' | 'secondary' | 'text' | 'danger';
export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  testID,
}: {
  title: string;
  onPress?: () => void;
  kind?: BtnKind;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}) {
  const { c } = useTheme();
  const base = {
    minHeight: kind === 'text' ? layout.minTapTarget : layout.primaryButtonHeight,
    borderRadius: radius.button,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    paddingHorizontal: space.lg,
    borderWidth: kind === 'secondary' ? layout.borderWidth : 0,
  };
  const styleByKind = {
    primary: { backgroundColor: c.accent },
    secondary: { backgroundColor: 'transparent', borderColor: c.border },
    text: { backgroundColor: 'transparent' },
    danger: { backgroundColor: 'transparent', borderWidth: layout.borderWidth, borderColor: c.danger },
  }[kind];
  const textColor = { primary: c.onAccent, secondary: c.text, text: c.accent, danger: c.danger }[kind];
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={[base, styleByKind, { opacity: disabled ? 0.45 : 1 }]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <RNText style={[T.body, { fontWeight: '600', color: textColor }]}>{title}</RNText>
      )}
    </TouchableOpacity>
  );
}

/* ---------- Card ---------- */
export function Card({ children, onPress, style, ...rest }: ViewProps & { onPress?: () => void }) {
  const { c } = useTheme();
  const cardStyle = [
    {
      backgroundColor: c.surface,
      borderWidth: layout.borderWidth,
      borderColor: c.border,
      borderRadius: radius.card,
      padding: space.lg,
      marginVertical: space.md,
    },
    style,
  ];
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} style={cardStyle} accessibilityRole="button">
        {children}
      </TouchableOpacity>
    );
  }
  return (
    <View style={cardStyle} {...rest}>
      {children}
    </View>
  );
}

/* ---------- Chip ---------- */
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        minHeight: 40,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.chip,
        borderWidth: layout.borderWidth,
        borderColor: selected ? c.accent : c.border,
        backgroundColor: selected ? c.accent : 'transparent',
      }}
    >
      <RNText style={[T.label, { color: selected ? c.onAccent : c.text }]}>{label}</RNText>
    </TouchableOpacity>
  );
}

/* ---------- Field (label above, never floating) ---------- */
export function Field({
  label,
  uncertain,
  hint,
  ...input
}: TextInputProps & { label: string; uncertain?: boolean; hint?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ marginTop: space.md }}>
      <RNText style={[T.label, { color: c.textMuted, marginBottom: space.xs }]}>{label}</RNText>
      <TextInput
        placeholderTextColor={c.textMuted}
        style={{
          backgroundColor: c.surface,
          borderWidth: uncertain ? 1.5 : layout.borderWidth,
          borderColor: uncertain ? c.warn : c.border,
          borderRadius: radius.field,
          padding: space.md,
          color: c.text,
          ...T.body,
        }}
        {...input}
      />
      {uncertain ? <RNText style={[T.caption, { color: c.warn, marginTop: space.xs }]}>Please check</RNText> : null}
      {hint && !uncertain ? <RNText style={[T.caption, { color: c.textMuted, marginTop: space.xs }]}>{hint}</RNText> : null}
    </View>
  );
}

/* ---------- EmptyState (one icon, one sentence, one button) ---------- */
export function EmptyState({ icon, message, action }: { icon: string; message: string; action?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: space.xxl }}>
      <RNText style={{ fontSize: 40, marginBottom: space.sm }}>{icon}</RNText>
      <RNText style={[T.body, { color: c.textMuted, textAlign: 'center', marginBottom: space.lg }]}>{message}</RNText>
      {action}
    </View>
  );
}

/* ---------- Banner ad slot (fixed 50dp, labelled "Ad") ---------- */
export function BannerAdSlot() {
  const { c } = useTheme();
  return (
    <View
      style={{
        height: layout.bannerAdHeight,
        borderTopWidth: layout.borderWidth,
        borderColor: c.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RNText style={[T.caption, { color: c.textMuted, letterSpacing: 2 }]}>AD</RNText>
    </View>
  );
}

/* ---------- Disclaimer footer ---------- */
export function Disclaimer({ text = 'Information only. Not medical advice.' }: { text?: string }) {
  const { c } = useTheme();
  return <RNText style={[T.caption, { color: c.textMuted, textAlign: 'center', marginVertical: space.lg }]}>{text}</RNText>;
}
