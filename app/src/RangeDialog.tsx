import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { fmtInterval } from './plants';
import { GlassFill } from './Glass';
import { colors, radius, spacing, type } from './theme';

const UNITS = [
  { label: 'minutes', short: 'min', factor: 1 },
  { label: 'hours', short: 'h', factor: 60 },
  { label: 'days', short: 'd', factor: 1440 },
];
const MIN_MINUTES = 5;

type Props = {
  visible: boolean;
  maxMinutes: number; // as much history as the hub has saved
  onCancel: () => void;
  onConfirm: (minutes: number) => void;
};

// Pick any chart length, up to how much history the hub has saved.
export function RangeDialog({ visible, maxMinutes, onCancel, onConfirm }: Props) {
  const [text, setText] = useState('');
  const [unit, setUnit] = useState(1);

  useEffect(() => {
    if (visible) {
      setText('');
      setUnit(1);
    }
  }, [visible]);

  const value = parseFloat(text.replace(',', '.'));
  const minutes = Math.round(value * UNITS[unit].factor);
  const tooBig = !isNaN(value) && minutes > maxMinutes;
  const tooSmall = !isNaN(value) && minutes < MIN_MINUTES;
  const valid = !isNaN(value) && !tooBig && !tooSmall;
  const maxLabel = fmtInterval(Math.floor(maxMinutes) * 60);

  const useMax = () => {
    Haptics.selectionAsync();
    const u = maxMinutes >= 1440 ? 2 : maxMinutes >= 60 ? 1 : 0;
    setUnit(u);
    setText(String(Math.floor((maxMinutes / UNITS[u].factor) * 10) / 10));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.sheet}>
          <GlassFill radius={radius.lg} opaque />
          <Text style={styles.title}>Chart length</Text>
          <Text style={styles.muted}>How far back should the chart go? The hub has {maxLabel} saved for this sensor.</Text>

          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="e.g. 3"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              autoFocus
              maxLength={6}
              style={styles.input}
            />
            <View style={styles.units}>
              {UNITS.map((u, i) => (
                <Pressable
                  key={u.label}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setUnit(i);
                  }}
                  style={[styles.unit, i === unit && styles.unitOn]}
                >
                  <Text style={[styles.unitText, i === unit && { color: colors.surface, fontWeight: '600' }]}>{u.short}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {tooBig && <Text style={styles.error}>The hub only has {maxLabel} saved. Try something shorter.</Text>}
          {tooSmall && <Text style={styles.error}>The shortest chart is {MIN_MINUTES} minutes.</Text>}

          <Pressable onPress={useMax}>
            <Text style={styles.link}>Use everything saved ({maxLabel})</Text>
          </Pressable>

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.button}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => valid && onConfirm(minutes)}
              style={[styles.button, styles.confirm, !valid && { opacity: 0.4 }]}
            >
              <Text style={styles.confirmText}>Show</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#3A3A3299', justifyContent: 'center', padding: spacing.lg },
  sheet: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { ...type.heading, color: colors.text },
  muted: { ...type.caption, color: colors.textMuted },
  error: { ...type.caption, color: colors.clay },
  link: { ...type.caption, color: colors.moss, fontWeight: '600' },
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    ...type.body,
    flex: 1,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.md,
  },
  units: { flexDirection: 'row', gap: spacing.xs },
  unit: { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md - 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  unitOn: { backgroundColor: colors.moss, borderColor: colors.moss },
  unitText: { ...type.caption, color: colors.text },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  button: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg - 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border + '88',
  },
  cancel: { ...type.body, color: colors.textMuted },
  confirm: { backgroundColor: colors.moss },
  confirmText: { ...type.body, fontWeight: '600', color: colors.surface },
});
