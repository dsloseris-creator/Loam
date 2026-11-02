import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LiquidGauge } from './LiquidGauge';
import { LOW_BATTERY, Plant, ago, moistureState } from './plants';
import { LiveDot } from './PlantParts';
import { RollingNumber } from './RollingNumber';
import { colors, radius, spacing, type } from './theme';

// A small tile, so every plant fits on one screen. Tap it to open the plant full screen.
export function PlantTile({ plant, width, onOpen }: { plant: Plant; width: number; onOpen: () => void }) {
  const state = plant.stale ? { label: 'No signal', color: colors.textMuted } : moistureState(plant.moisture);
  const lowBattery = plant.battery !== undefined && plant.battery < LOW_BATTERY;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onOpen();
      }}
      style={({ pressed }) => [styles.tile, { width }, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
    >
      <View style={styles.top}>
        <LiquidGauge percent={plant.moisture} color={state.color} size={52} />
        <View style={styles.live}>{plant.nodeId !== undefined && <LiveDot pulseKey={plant.readingAt} color={state.color} />}</View>
      </View>

      <View style={{ gap: 2 }}>
        <Text style={styles.name} numberOfLines={1}>
          {plant.name}
        </Text>
        <RollingNumber value={plant.moisture} suffix="%" height={34} style={styles.number} suffixStyle={styles.suffix} />
      </View>

      <View style={styles.foot}>
        <View style={[styles.pill, { backgroundColor: state.color + '26' }]}>
          <View style={[styles.dot, { backgroundColor: state.color }]} />
          <Text style={[styles.pillText, { color: state.color }]} numberOfLines={1}>
            {state.label}
          </Text>
        </View>
        <Text style={styles.muted} numberOfLines={1}>
          {lowBattery ? 'Low battery' : ago(plant.lastSeenSec)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surface + 'E6',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm + 2,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  live: { paddingTop: spacing.xs },
  name: { ...type.body, fontWeight: '600', color: colors.text },
  number: { fontSize: 30, fontWeight: '600', color: colors.text, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  suffix: { fontSize: 17, color: colors.textMuted, fontWeight: '500', letterSpacing: 0 },
  foot: { gap: spacing.xs + 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { ...type.caption, fontSize: 12, fontWeight: '600' },
  muted: { ...type.caption, fontSize: 12, color: colors.textMuted },
});
