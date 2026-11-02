import { area, curveMonotoneX, line } from 'd3-shape';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { Point } from './hub';
import { colors, type } from './theme';

// A tiny trend line with a glowing end dot that pulses when a new reading arrives (after Bklit UI's sparkline).
const PAD_X = 6;
const PAD_Y = 8;

export function Sparkline({ points, color, pulseKey, height = 46 }: { points: Point[]; color: string; pulseKey?: number; height?: number }) {
  const [width, setWidth] = useState(0);
  const id = useRef('sp' + Math.random().toString(36).slice(2, 8)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ring.setValue(1);
    Animated.timing(ring, { toValue: 0, duration: 1800, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [pulseKey, ring]);

  const geo = useMemo(() => {
    if (points.length < 2 || width === 0) return null;
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const vs = points.map((p) => p.v);
    let lo = Math.min(...vs);
    let hi = Math.max(...vs);
    if (hi - lo < 20) {
      // keep tiny wobbles from looking like dramatic swings
      const mid = (hi + lo) / 2;
      lo = mid - 10;
      hi = mid + 10;
    }
    const x = (t: number) => PAD_X + ((t - t0) / Math.max(t1 - t0, 1)) * (width - 2 * PAD_X);
    const y = (v: number) => PAD_Y + (1 - (v - lo) / (hi - lo)) * (height - 2 * PAD_Y);
    const l = line<Point>().x((p) => x(p.t)).y((p) => y(p.v)).curve(curveMonotoneX);
    const a = area<Point>().x((p) => x(p.t)).y0(height).y1((p) => y(p.v)).curve(curveMonotoneX);
    const last = points[points.length - 1];
    return { line: l(points) ?? '', area: a(points) ?? '', ex: x(last.t), ey: y(last.v) };
  }, [points, width, height]);

  return (
    <View style={{ flex: 1, height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {geo ? (
        <>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.28} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={geo.area} fill={`url(#${id})`} />
            <Path d={geo.line} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              {
                left: geo.ex - 4,
                top: geo.ey - 4,
                borderColor: color,
                opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0, 0.7] }),
                transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [3.4, 1] }) }],
              },
            ]}
          />
          <View pointerEvents="none" style={[styles.dot, { left: geo.ex - 4, top: geo.ey - 4, backgroundColor: color }]} />
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>gathering a trend…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  ring: { position: 'absolute', width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  empty: { flex: 1, alignItems: 'flex-end', justifyContent: 'center' },
  emptyText: { ...type.caption, color: colors.textMuted },
});
