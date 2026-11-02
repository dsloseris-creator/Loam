import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Calibration } from './calibration';
import { LiquidGauge } from './LiquidGauge';
import { LOW_BATTERY, Plant, ago, moistureState } from './plants';
import { CardSparkline, DialogName, LiveDot, PlantActions, PlantDialogs } from './PlantParts';
import { RollingNumber } from './RollingNumber';
import { colors, radius, spacing, type } from './theme';

type CardProps = {
  plant: Plant;
  onRename?: (name: string) => void;
  onSwitch?: (name: string) => void;
  onCalibrated?: (calibration: Calibration) => void;
  onResetCalibration?: () => void;
  onSetDefaultCalibration?: (calibration: Calibration) => void;
  onIntervalQueued?: (seconds: number) => void;
  onOpen?: () => void; // open this plant full screen
};

export function PlantCard({ plant, onRename, onSwitch, onCalibrated, onResetCalibration, onSetDefaultCalibration, onIntervalQueued, onOpen }: CardProps) {
  const [dialog, setDialog] = useState<DialogName>(null);
  const [menu, setMenu] = useState(false);
  const noSignal = plant.stale;
  const state = noSignal ? { label: 'No signal', color: colors.textMuted } : moistureState(plant.moisture);
  const canExpand = plant.nodeId !== undefined; // real sensors have buttons and a live dot; demo plants don't

  const open = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onOpen?.();
  };

  return (
    <Pressable onPress={onOpen ? open : undefined} style={({ pressed }) => [styles.card, pressed && !!onOpen && { opacity: 0.92 }]}>
      <View style={styles.top}>
        <LiquidGauge percent={plant.moisture} color={state.color} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={styles.name} numberOfLines={1}>
            {plant.name}
          </Text>
          <Text style={styles.muted} numberOfLines={1}>
            {plant.location}
          </Text>
          <View style={[styles.pill, { backgroundColor: state.color + '26', alignSelf: 'flex-start' }]}>
            <View style={[styles.dot, { backgroundColor: state.color }]} />
            <Text style={[styles.pillText, { color: state.color }]}>{state.label}</Text>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View>
          <RollingNumber value={plant.moisture} suffix="%" style={styles.bigNumber} suffixStyle={styles.bigSuffix} />
          <Text style={styles.muted}>moisture</Text>
        </View>
        {plant.nodeId !== undefined ? (
          <CardSparkline plant={plant} color={state.color} />
        ) : (
          <View style={{ flex: 1 }} />
        )}
      </View>

      <View style={styles.updatedRow}>
        <View style={styles.updated}>
          {canExpand && <LiveDot pulseKey={plant.readingAt} color={state.color} />}
          <Text style={styles.muted}>updated {ago(plant.lastSeenSec)}</Text>
        </View>
      </View>

      {plant.battery !== undefined && plant.battery < LOW_BATTERY && (
        <Text style={styles.battery}>Low sensor battery ({plant.battery}%)</Text>
      )}

      {canExpand && <PlantActions plant={plant} setDialog={setDialog} setMenu={setMenu} />}

      {onOpen && <Text style={styles.more}>Tap to open: chart, history and settings</Text>}

      <PlantDialogs
        plant={plant}
        dialog={dialog}
        setDialog={setDialog}
        menu={menu}
        setMenu={setMenu}
        onRename={onRename}
        onSwitch={onSwitch}
        onCalibrated={onCalibrated}
        onResetCalibration={onResetCalibration}
        onSetDefaultCalibration={onSetDefaultCalibration}
        onIntervalQueued={onIntervalQueued}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface + 'E6',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { ...type.heading, color: colors.text },
  body: { ...type.body, color: colors.text },
  muted: { ...type.caption, color: colors.textMuted },
  updated: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  updatedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  open: { ...type.caption, fontWeight: '700' },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  bigNumber: { fontSize: 40, fontWeight: '600', color: colors.text, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  bigSuffix: { fontSize: 22, color: colors.textMuted, fontWeight: '500', letterSpacing: 0 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm - 2,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md - 4,
    borderRadius: radius.pill,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { ...type.caption, fontWeight: '600' },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  battery: { ...type.caption, color: colors.clay },
  more: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
});
