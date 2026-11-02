import * as Haptics from 'expo-haptics';
import { area, curveMonotoneX, line } from 'd3-shape';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { Point } from './hub';
import { DRY_THRESHOLD, moistureState } from './plants';
import { colors, radius, spacing, type } from './theme';

const HEIGHT = 200;
const PAD = { top: 16, right: 10, bottom: 32, left: 40 };
const TIP_W = 112;

const HOUR = 3600000;
const DAY = 24 * HOUR;

// Long ranges show dates; day-long ranges show the weekday; short ranges show the time.
const fmtTime = (t: number, span: number, full = false) => {
  const d = new Date(t);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (span > 6 * DAY) {
    const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return full ? `${date} ${time}` : date;
  }
  if (span > 23 * HOUR) return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  return time;
};

const MIN_SPAN_MS = 5 * 60000;

// `from` is when this plant's graph began; the chart never reaches back before it.
type Props = { points: Point[]; end: number; minutes: number; color: string; from?: number };

// Area chart in the style of Bklit UI's area chart: soft gradient, hover-style crosshair
// and a floating tooltip. Drag a finger across it to scrub through the readings.
export function MoistureChart({ points, end, minutes, color, from = 0 }: Props) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  const start = Math.min(Math.max(end - minutes * 60000, from), end - MIN_SPAN_MS);
  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - start) / (end - start)) * innerW;
  const y = (v: number) => PAD.top + (1 - v / 100) * innerH;

  const { linePath, areaPath } = useMemo(() => {
    if (points.length < 2 || width === 0) return { linePath: '', areaPath: '' };
    const l = line<Point>().x((p) => x(p.t)).y((p) => y(p.v)).curve(curveMonotoneX);
    const a = area<Point>().x((p) => x(p.t)).y0(y(0)).y1((p) => y(p.v)).curve(curveMonotoneX);
    return { linePath: l(points) ?? '', areaPath: a(points) ?? '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, width, end, start]);

  // Soft fade-in whenever the range changes
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, [minutes, from, fade]);

  // The pan responder is created once, so it reads the latest data through a ref.
  const live = useRef({ points, width, start, end, active: null as number | null });
  live.current = { points, width, start, end, active };

  const scrubTo = (touchX: number) => {
    const { points: pts, width: w, start: s, end: e } = live.current;
    if (!pts.length || !w) return;
    const iw = Math.max(w - PAD.left - PAD.right, 1);
    const t = s + ((touchX - PAD.left) / iw) * (e - s);
    let best = 0;
    for (let i = 1; i < pts.length; i++) {
      if (Math.abs(pts[i].t - t) < Math.abs(pts[best].t - t)) best = i;
    }
    if (best !== live.current.active) {
      live.current.active = best;
      Haptics.selectionAsync();
      setActive(best);
    }
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false, // keep the gesture away from the ScrollView
      onPanResponderGrant: (e) => scrubTo(e.nativeEvent.locationX),
      onPanResponderMove: (e) => scrubTo(e.nativeEvent.locationX),
      onPanResponderRelease: () => {
        live.current.active = null;
        setActive(null);
      },
      onPanResponderTerminate: () => {
        live.current.active = null;
        setActive(null);
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const sel = active !== null ? points[active] : null;
  const span = end - start;
  const xTicks = [0, 0.5, 1].map((f) => start + f * (end - start));

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {width > 0 && (
        <Animated.View style={{ opacity: fade }}>
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.35} />
                <Stop offset="1" stopColor={color} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>

            {[0, 50, 100].map((v) => (
              <Line key={v} x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={colors.border} strokeWidth={1} />
            ))}

            <Line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(DRY_THRESHOLD)}
              y2={y(DRY_THRESHOLD)}
              stroke={colors.sand}
              strokeWidth={1.5}
              strokeDasharray="4 5"
            />

            {areaPath !== '' && <Path d={areaPath} fill="url(#fill)" />}
            {linePath !== '' && (
              <Path d={linePath} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}
            {points.length === 1 && <Circle cx={x(points[0].t)} cy={y(points[0].v)} r={4} fill={color} />}

            {xTicks.map((t, i) => (
              <SvgText
                key={i}
                x={x(t)}
                y={HEIGHT - 8}
                fontSize={11}
                fill={colors.textMuted}
                textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
              >
                {fmtTime(t, span)}
              </SvgText>
            ))}

            {sel && (
              <G>
                <Line x1={x(sel.t)} x2={x(sel.t)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke={colors.textMuted} strokeWidth={1} />
                <Circle cx={x(sel.t)} cy={y(sel.v)} r={9} fill={color} opacity={0.2} />
                <Circle cx={x(sel.t)} cy={y(sel.v)} r={5} fill={colors.surface} stroke={color} strokeWidth={2.5} />
              </G>
            )}
          </Svg>
          {/* Percent labels are plain text beside the plot, so they can't run into the grid lines */}
          {[0, 50, 100].map((v) => (
            <Text key={v} style={[styles.yLabel, { top: y(v) - 8 }]}>
              {v}%
            </Text>
          ))}
        </Animated.View>
      )}

      {sel && (
        <View
          pointerEvents="none"
          style={[styles.tip, { left: Math.min(Math.max(x(sel.t) - TIP_W / 2, 0), width - TIP_W) }]}
        >
          <Text style={[styles.tipValue, { color: moistureState(sel.v).color }]}>{sel.v}% moisture</Text>
          <Text style={styles.tipTime}>{fmtTime(sel.t, span, true)}</Text>
        </View>
      )}

      {points.length === 0 && width > 0 && (
        <View pointerEvents="none" style={styles.empty}>
          <Text style={styles.emptyText}>Collecting readings…</Text>
          <Text style={styles.emptyText}>A new point is saved every minute.</Text>
        </View>
      )}

      {/* Transparent layer that catches the touch, so locationX is stable */}
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: HEIGHT },
  yLabel: { position: 'absolute', left: 0, width: PAD.left - 10, height: 16, lineHeight: 16, textAlign: 'right', fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  tip: {
    position: 'absolute',
    top: 0,
    width: TIP_W,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tipValue: { ...type.caption, fontWeight: '600' },
  tipTime: { fontSize: 11, color: colors.textMuted },
  empty: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingBottom: PAD.bottom },
  emptyText: { ...type.caption, color: colors.textMuted },
});
