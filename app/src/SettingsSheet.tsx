import * as Haptics from 'expo-haptics';
import { startTransition, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { GlassFill } from './Glass';
import { DEFAULT_SETTINGS, MoodChoice, SeasonChoice, Settings } from './settings';
import { colors, ink, radius, spacing, type } from './theme';

type Props = {
  visible: boolean;
  settings: Settings;
  onChange: (change: Partial<Settings>) => void;
  onReset: () => void;
  onClose: () => void;
};

const SEASONS: { value: SeasonChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'autumn', label: 'Autumn' },
  { value: 'winter', label: 'Winter' },
];

const MOODS: { value: MoodChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'off', label: 'Off' },
  { value: 'lush', label: 'Lush' },
  { value: 'calm', label: 'Calm' },
  { value: 'parched', label: 'Parched' },
];

const STRENGTHS: { value: Settings['washStrength']; label: string }[] = [
  { value: 'soft', label: 'Soft' },
  { value: 'medium', label: 'Medium' },
  { value: 'bold', label: 'Bold' },
];

export function SettingsSheet({ visible, settings, onChange, onReset, onClose }: Props) {
  const { height } = useWindowDimensions();

  // The sheet keeps its own copy, so every control reacts at once. The rest of the app (the background
  // redrawing, for one) catches up a moment later without holding the controls up.
  const [local, setLocal] = useState(settings);
  useEffect(() => setLocal(settings), [settings]);

  const set = (change: Partial<Settings>) => {
    Haptics.selectionAsync();
    setLocal((l) => ({ ...l, ...change }));
    startTransition(() => onChange(change));
  };

  const toggle = (key: keyof Settings, label: string, hint?: string) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch value={local[key] as boolean} onValueChange={(v) => set({ [key]: v })} trackColor={{ true: colors.moss, false: colors.border }} />
    </View>
  );

  const chips = <T extends string>(options: { value: T; label: string }[], current: T, pick: (v: T) => void) => (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.value === current;
        return (
          <Pressable key={o.value} onPress={() => pick(o.value)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.chipText, on && { color: colors.surface, fontWeight: '600' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Tapping outside the sheet closes it. This sits behind the sheet, so it doesn't steal the scrolling. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={[styles.sheet, { maxHeight: height * 0.82 }]}>
          <GlassFill radius={radius.lg} opaque />
          <Text style={styles.title}>Settings</Text>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator contentContainerStyle={styles.scrollContent}>
            <Text style={styles.section}>Background</Text>
            {toggle('hills', 'Hills')}
            {toggle('sunlight', 'Sunlight', 'A warm glow that drifts across')}
            {toggle('wash', 'Colour washes', 'Soft, abstract colour drifting behind the cards')}
            {local.wash && (
              <View style={styles.row}>
                <Text style={[styles.hint, { flex: 1 }]}>Wash strength</Text>
                {chips(STRENGTHS, local.washStrength, (washStrength) => set({ washStrength }))}
              </View>
            )}
            {toggle('drifters', 'Drifting specks', 'Petals, pollen, leaves or snow, by season')}
            {toggle('grain', 'Paper grain')}

            <Text style={styles.section}>Season</Text>
            {chips(SEASONS, local.season, (season) => set({ season }))}
            {local.season === 'auto' && (
              <View style={styles.row}>
                <Text style={[styles.label, { flex: 1 }]}>Hemisphere</Text>
                {chips(
                  [
                    { value: 'north' as const, label: 'North' },
                    { value: 'south' as const, label: 'South' },
                  ],
                  local.hemisphere,
                  (hemisphere) => set({ hemisphere }),
                )}
              </View>
            )}

            <Text style={styles.section}>Plant mood</Text>
            <Text style={styles.hint}>Auto follows how your plants are doing. Off keeps the background steady. The others preview the look.</Text>
            {chips(MOODS, local.mood, (mood) => set({ mood }))}

            <Text style={styles.section}>Testing</Text>
            {toggle('demoPlants', 'Demo plants', 'Shows made-up plants next to your real sensor')}

            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setLocal(DEFAULT_SETTINGS);
                startTransition(onReset);
              }}
            >
              <Text style={styles.reset}>Reset to defaults</Text>
            </Pressable>
          </ScrollView>

          <Pressable onPress={onClose} style={styles.done}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#3A3A3299', justifyContent: 'center', padding: spacing.lg },
  sheet: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { ...type.heading, color: colors.text },
  scroll: { flexShrink: 1 }, // lets the list shrink to fit the sheet, which is what makes it scroll
  scrollContent: { gap: spacing.md, paddingBottom: spacing.sm },
  section: { ...type.caption, color: ink.moss, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { ...type.body, color: colors.text },
  hint: { ...type.caption, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.border + '88' },
  chipOn: { backgroundColor: colors.moss },
  chipText: { ...type.caption, color: colors.text },
  reset: { ...type.caption, color: colors.clay, fontWeight: '600', textAlign: 'center', paddingVertical: spacing.sm },
  done: { alignItems: 'center', paddingVertical: spacing.md - 2, borderRadius: radius.pill, backgroundColor: colors.moss },
  doneText: { ...type.body, fontWeight: '600', color: colors.surface },
});
