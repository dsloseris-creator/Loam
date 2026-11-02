import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Calibration, rawToPercent } from './calibration';
import { useHistory } from './hub';
import { colors, radius, spacing, type } from './theme';

// A calendar grid of daily moisture: one square per day, colored by that day's average
// (after Bklit UI's heatmap). Each column is a week, Monday at the top.
const WEEKS = 6;
const GAP = 4;
const LABEL_W = 22;
const DAY_LABELS = ['M', '', 'W', '', 'F', '', ''];

// Same palette as the status colors: dry clay, then sand, moss, and wet water-blue
const SCALE: [number, string][] = [
  [0, '#C4745A'],
  [30, '#D9A86C'],
  [55, '#7A8F6B'],
  [85, '#7FA3A8'],
];

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

function colorFor(percent: number) {
  if (percent <= SCALE[0][0]) return SCALE[0][1];
  for (let i = 1; i < SCALE.length; i++) {
    const [p1, c1] = SCALE[i];
    if (percent <= p1) {
      const [p0, c0] = SCALE[i - 1];
      const f = (percent - p0) / (p1 - p0);
      const a = hex(c0);
      const b = hex(c1);
      return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
    }
  }
  return SCALE[SCALE.length - 1][1];
}

const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

type Day = { date: Date; key: string; future: boolean };

export function DailyHeatmap({ nodeId, calibration, from }: { nodeId: number; calibration: Calibration; from: number }) {
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const history = useHistory(nodeId, WEEKS * 7 * 1440);

  // Group readings by calendar day and average them
  const byDay = useMemo(() => {
    const sums = new Map<string, { total: number; n: number }>();
    for (const p of history.points) {
      if (p.t < from) continue;
      const k = keyOf(new Date(p.t));
      const e = sums.get(k) ?? { total: 0, n: 0 };
      e.total += rawToPercent(p.raw, calibration);
      e.n += 1;
      sums.set(k, e);
    }
    return sums;
  }, [history.points, calibration, from]);

  // WEEKS columns of 7 days, from the Monday WEEKS-1 weeks ago to this week's Sunday
  const days = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (WEEKS - 1) * 7);
    const out: Day[] = [];
    for (let i = 0; i < WEEKS * 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      out.push({ date, key: keyOf(date), future: date > today });
    }
    return out;
  }, []);

  const todayKey = keyOf(new Date());
  const cell = Math.max(Math.min(Math.floor((width - LABEL_W - GAP * WEEKS) / WEEKS), 44), 12);

  const pickedDay = days.find((d) => d.key === picked);
  const pickedStats = picked ? byDay.get(picked) : undefined;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: spacing.md }}>
      {width > 0 && (
        <View style={{ flexDirection: 'row', gap: GAP }}>
          <View style={{ width: LABEL_W - GAP, gap: GAP }}>
            {DAY_LABELS.map((l, i) => (
              <Text key={i} style={[styles.dayLabel, { height: cell, lineHeight: cell }]}>
                {l}
              </Text>
            ))}
          </View>
          {Array.from({ length: WEEKS }, (_, w) => (
            <View key={w} style={{ gap: GAP }}>
              {days.slice(w * 7, w * 7 + 7).map((d, r) => {
                const stats = byDay.get(d.key);
                const avg = stats ? stats.total / stats.n : undefined;
                return (
                  <Cell
                    key={d.key}
                    size={cell}
                    delay={(w * 7 + r) * 14}
                    color={avg !== undefined ? colorFor(avg) : undefined}
                    hidden={d.future}
                    today={d.key === todayKey}
                    selected={d.key === picked}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setPicked(d.key);
                    }}
                  />
                );
              })}
            </View>
          ))}
        </View>
      )}

      <Text style={styles.readout}>
        {pickedDay
          ? pickedStats
            ? `${pickedDay.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · average ${Math.round(
                pickedStats.total / pickedStats.n,
              )}% · ${pickedStats.n} reading${pickedStats.n === 1 ? '' : 's'}`
            : `${pickedDay.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · no readings`
          : 'Tap a day to see its average. Days fill in as the sensor collects data.'}
      </Text>

      <View style={styles.legend}>
        <Text style={styles.legendText}>Dry</Text>
        {[5, 25, 45, 65, 90].map((p) => (
          <View key={p} style={[styles.swatch, { backgroundColor: colorFor(p) }]} />
        ))}
        <Text style={styles.legendText}>Wet</Text>
      </View>
    </View>
  );
}

function Cell({
  size,
  delay,
  color,
  hidden,
  today,
  selected,
  onPress,
}: {
  size: number;
  delay: number;
  color?: string;
  hidden: boolean;
  today: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 380, delay, useNativeDriver: true }).start();
  }, [a, delay]);

  if (hidden) return <View style={{ width: size, height: size }} />;
  return (
    <Animated.View style={{ opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
      <Pressable
        onPress={onPress}
        style={[
          styles.cell,
          { width: size, height: size, backgroundColor: color ?? colors.border + '99' },
          (today || selected) && { borderWidth: 2, borderColor: selected ? colors.text : colors.textMuted },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cell: { borderRadius: radius.sm - 4 },
  dayLabel: { ...type.caption, fontSize: 11, color: colors.textMuted, textAlign: 'right' },
  readout: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs + 2 },
  legendText: { ...type.caption, fontSize: 11, color: colors.textMuted },
  swatch: { width: 16, height: 10, borderRadius: 3 },
});
