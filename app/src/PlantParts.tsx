import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CalibrationWizard } from './CalibrationWizard';
import { IntervalDialog } from './IntervalDialog';
import { Calibration, DEFAULT_CALIBRATION, rawToPercent } from './calibration';
import { useHistory } from './hub';
import { MoistureChart } from './MoistureChart';
import { NameDialog } from './NameDialog';
import { Plant, STANDARD_RANGES, autoRangeMinutes, fmtInterval } from './plants';
import { ArcGauge } from './ArcGauge';
import { DailyHeatmap } from './DailyHeatmap';
import { GlassFill } from './Glass';
import { RangeDialog } from './RangeDialog';
import { Sparkline } from './Sparkline';
import { colors, ink, radius, spacing, type } from './theme';

// Pieces shared by the plant card, the small overview tile and the full-screen plant view.

type HistoryProps = {
  bare?: boolean; // no divider line above it, for when it sits in its own panel
  nodeId: number;
  color: string;
  from: number;
  calibration: Calibration;
  intervalSec?: number;
  historySec?: number;
  moisture: number;
  live?: { t: number; raw: number };
};

export function HistoryPanel({ nodeId, color, from, calibration, intervalSec, historySec, moisture, live, bare }: HistoryProps) {
  const [view, setView] = useState<'chart' | 'daily' | 'gauge'>('chart');
  // 'auto' follows the sensor's interval; otherwise a fixed number of minutes
  const [range, setRange] = useState<'auto' | number>('auto');
  const [askCustom, setAskCustom] = useState(false);

  const maxMinutes = historySec && historySec > 0 ? Math.max(60, historySec / 60) : 30 * 1440;
  // How much history to fetch: the standard window for this interval in auto, or the length you chose
  const fetchMinutes = range === 'auto' ? autoRangeMinutes(intervalSec, historySec) : range;
  const history = useHistory(nodeId, fetchMinutes, live);
  // Only readings since the sensor was put in this plant, converted to percent with its calibration
  const points = useMemo(() => {
    return history.points.filter((p) => p.t >= from).map((p) => ({ t: p.t, v: rawToPercent(p.raw, calibration) }));
  }, [history.points, from, calibration]);
  const end = history.end;

  // Auto doesn't show time before the first reading. The chart starts at the first reading and widens as
  // more come in, until it reaches the standard window. A little room before the first point keeps it off the edge.
  const firstT = points.length ? points[0].t : undefined;
  const sinceFirst = firstT !== undefined ? ((end - firstT) / 60000) * 1.05 : fetchMinutes;
  const minutes = range === 'auto' ? Math.min(fetchMinutes, Math.max(sinceFirst, 5)) : fetchMinutes;
  const stillFilling = range === 'auto' && minutes < fetchMinutes - 0.5;

  // Standard lengths the saved history can actually fill (1h is always offered)
  const standard = STANDARD_RANGES.filter((r) => r.minutes === 60 || r.minutes <= maxMinutes);
  const customActive = range !== 'auto' && !standard.some((r) => r.minutes === range);

  const chip = (label: string, on: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.range, on && { backgroundColor: color + '26' }]}
    >
      <Text style={[styles.rangeText, on && { color, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.panel, bare && styles.panelBare]}>
      <View style={styles.ranges}>
        {chip('Chart', view === 'chart', () => setView('chart'))}
        {chip('Daily', view === 'daily', () => setView('daily'))}
        {chip('Gauge', view === 'gauge', () => setView('gauge'))}
      </View>
      {view === 'chart' && (
      <>
      <View style={styles.ranges}>
        {chip('Auto', range === 'auto', () => setRange('auto'))}
        {standard.map((r) => chip(r.label, range === r.minutes, () => setRange(r.minutes)))}
        {chip(customActive ? fmtInterval((range as number) * 60) : 'Custom', customActive, () => setAskCustom(true))}
      </View>
      <MoistureChart points={points} end={end} minutes={minutes} color={color} from={from} />
      <Text style={styles.hint}>
        {stillFilling ? 'Since the first reading' : `Last ${fmtInterval(minutes * 60)}`}
        {range === 'auto' ? (stillFilling ? ` (auto, grows to ${fmtInterval(fetchMinutes * 60)})` : ' (auto, from the measurement interval)') : ''} · drag the
        chart for exact readings
      </Text>
      </>
      )}
      {view === 'daily' && <DailyHeatmap nodeId={nodeId} calibration={calibration} from={from} />}
      {view === 'gauge' && <ArcGauge percent={moisture} />}
      <RangeDialog
        visible={askCustom}
        maxMinutes={maxMinutes}
        onCancel={() => setAskCustom(false)}
        onConfirm={(m) => {
          setRange(m);
          setAskCustom(false);
        }}
      />
    </View>
  );
}

// The newest reading, if we have it
export const liveOf = (plant: Plant) =>
  plant.readingAt !== undefined && plant.raw !== undefined ? { t: plant.readingAt, raw: plant.raw } : undefined;

// The trend line on the collapsed card: the same length as the chart's Auto range
export function CardSparkline({ plant, color }: { plant: Plant; color: string }) {
  const minutes = autoRangeMinutes(plant.intervalSec, plant.historySec);
  const history = useHistory(plant.nodeId as number, minutes, liveOf(plant));
  const calibration = plant.calibration ?? DEFAULT_CALIBRATION;
  const from = plant.startedAt ?? 0;
  const points = useMemo(
    () => history.points.filter((p) => p.t >= from).map((p) => ({ t: p.t, v: rawToPercent(p.raw, calibration) })),
    [history.points, from, calibration],
  );
  return <Sparkline points={points} color={color} pulseKey={plant.readingAt} />;
}

// A small dot that flashes with a soft ring each time a new reading arrives, then fades back.
export function LiveDot({ pulseKey, color }: { pulseKey?: number; color: string }) {
  const glow = useRef(new Animated.Value(0)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false; // don't flash just because the app opened
      return;
    }
    glow.setValue(1);
    Animated.timing(glow, { toValue: 0, duration: 2600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [pulseKey, glow]);

  return (
    <View style={styles.dotBox}>
      <Animated.View
        style={[
          styles.dotRing,
          {
            borderColor: color,
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }),
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) }],
          },
        ]}
      />
      <View style={[styles.liveDot, { backgroundColor: colors.border }]} />
      <Animated.View style={[styles.liveDot, styles.liveDotLit, { backgroundColor: color, opacity: glow }]} />
    </View>
  );
}

// A small dot that breathes while something is happening in the background
function BusyDot({ color }: { color: string }) {
  const a = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: a }} />;
}

// A tinted-glass button. The color tells the buttons apart at a glance.
export function ActionChip({
  label,
  tone,
  onPress,
  busy,
}: {
  label: string;
  tone: 'moss' | 'sand' | 'water';
  onPress: () => void;
  busy?: boolean;
}) {
  const base = { moss: colors.moss, sand: colors.sand, water: colors.water }[tone];
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: base + '33' },
        pressed && { opacity: 0.7 },
      ]}
    >
      <GlassFill radius={radius.pill} tint={base + '33'} />
      {busy && <BusyDot color={ink[tone]} />}
      <Text style={[styles.actionText, { color: ink[tone], fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}


export type DialogName = 'rename' | 'switch' | 'calibrate' | 'interval' | null;

export type PlantHandlers = {
  onRename?: (name: string) => void;
  onSwitch?: (name: string) => void;
  onCalibrated?: (calibration: Calibration) => void;
  onResetCalibration?: () => void;
  onSetDefaultCalibration?: (calibration: Calibration) => void;
  onIntervalQueued?: (seconds: number) => void;
};

// The three buttons under a plant: interval, calibrate, and a menu with the rest
export function PlantActions({ plant, setDialog, setMenu }: { plant: Plant; setDialog: (d: DialogName) => void; setMenu: (open: boolean) => void }) {
  return (
    <View style={styles.actions}>
      <ActionChip
        tone="moss"
        busy={!!plant.pendingIntervalSec}
        onPress={() => setDialog('interval')}
        label={`${plant.intervalSec ? `Every ${fmtInterval(plant.intervalSec)}` : 'Set interval'}${
          plant.pendingIntervalSec ? ` → ${fmtInterval(plant.pendingIntervalSec)}` : ''
        }`}
      />
      <ActionChip tone="sand" onPress={() => setDialog('calibrate')} label="Calibrate" />
      <ActionChip tone="water" onPress={() => setMenu(true)} label="More ···" />
    </View>
  );
}

// The menu and every dialog a plant can open
export function PlantDialogs({
  plant,
  dialog,
  setDialog,
  menu,
  setMenu,
  onRename,
  onSwitch,
  onCalibrated,
  onResetCalibration,
  onSetDefaultCalibration,
  onIntervalQueued,
}: PlantHandlers & { plant: Plant; dialog: DialogName; setDialog: (d: DialogName) => void; menu: boolean; setMenu: (open: boolean) => void }) {
  return (
    <>
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenu(false)}>
          <View style={styles.menu}>
            <GlassFill radius={radius.lg} opaque />
            {[
              { label: 'Rename plant', key: 'rename' as const },
              { label: 'Move sensor to another plant', key: 'switch' as const },
              ...(plant.nodeId !== undefined
                ? [
                    { label: 'Use this calibration as the default', key: 'setDefault' as const },
                    { label: 'Reset to default calibration', key: 'resetCal' as const },
                  ]
                : []),
            ].map((item) => (
              <Pressable
                key={item.key}
                style={styles.menuItem}
                onPress={() => {
                  setMenu(false);
                  if (item.key === 'setDefault') {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    if (plant.calibration) onSetDefaultCalibration?.(plant.calibration);
                  } else if (item.key === 'resetCal') {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    onResetCalibration?.();
                  } else setDialog(item.key);
                }}
              >
                <Text style={styles.menuText}>{item.label}</Text>
              </Pressable>
            ))}
            {plant.nodeId !== undefined && (
              <Text selectable style={styles.menuNumbers}>
                {[...(plant.calibration ?? DEFAULT_CALIBRATION)]
                  .sort((a, b) => a.percent - b.percent)
                  .map((p) => `${p.percent === 0 ? 'Dry (0%)' : p.percent === 100 ? 'Wet (100%)' : `${p.percent}%`}: ${p.raw}`)
                  .join('  ·  ')}
              </Text>
            )}
          </View>
        </Pressable>
      </Modal>

      {plant.nodeId !== undefined && (
        <IntervalDialog
          visible={dialog === 'interval'}
          nodeId={plant.nodeId}
          plantName={plant.name}
          currentSec={plant.intervalSec}
          pendingSec={plant.pendingIntervalSec}
          onQueued={(sec) => onIntervalQueued?.(sec)}
          onClose={() => setDialog(null)}
        />
      )}
      {plant.nodeId !== undefined && (
        <CalibrationWizard
          visible={dialog === 'calibrate'}
          nodeId={plant.nodeId}
          plantName={plant.name}
          onClose={() => setDialog(null)}
          onSave={(cal) => onCalibrated?.(cal)}
        />
      )}
      <NameDialog
        visible={dialog === 'rename'}
        title="Rename plant"
        initial={plant.name}
        placeholder="Plant name"
        confirmLabel="Save"
        onCancel={() => setDialog(null)}
        onConfirm={(name) => {
          onRename?.(name);
          setDialog(null);
        }}
      />
      <NameDialog
        visible={dialog === 'switch'}
        title="Move sensor to another plant"
        message="Name the new plant. Its graph starts fresh from now."
        initial=""
        placeholder="New plant's name"
        confirmLabel="Start fresh"
        onCancel={() => setDialog(null)}
        onConfirm={(name) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onSwitch?.(name);
          setDialog(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  panelBare: { borderTopWidth: 0, paddingTop: 0 },
  ranges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  range: { paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.md - 2, borderRadius: radius.pill },
  rangeText: { ...type.caption, color: colors.textMuted },
  hint: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  menuBackdrop: { flex: 1, backgroundColor: '#3A3A3266', justifyContent: 'flex-end', padding: spacing.lg },
  menu: { borderRadius: radius.lg, overflow: 'hidden' },
  menuItem: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuText: { ...type.body, color: colors.text },
  menuNumbers: { ...type.caption, fontSize: 11, color: colors.textMuted, textAlign: 'center', padding: spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm - 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  actionText: { ...type.caption, color: colors.text },
  dotBox: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveDotLit: { position: 'absolute' },
  dotRing: { position: 'absolute', width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
});
