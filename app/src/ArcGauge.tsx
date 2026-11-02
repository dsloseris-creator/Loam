import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { DRY_THRESHOLD, moistureState } from './plants';
import { RollingNumber } from './RollingNumber';
import { colors, spacing, type } from './theme';

// A half-circle gauge of the moisture level, split into the same zones as the status pill, with a mark
// at the dry line (after Bklit UI's gauge). The marker springs to the new level.
const W = 260;
const H = 150;
const CX = W / 2;
const CY = 128;
const R = 104;
const STROKE = 16;

const ZONES = [
  { from: 0, to: 15, color: colors.clay },
  { from: 15, to: DRY_THRESHOLD, color: colors.sand },
  { from: DRY_THRESHOLD, to: 70, color: colors.moss },
  { from: 70, to: 100, color: colors.water },
];

// 0% is the left end of the arc, 100% the right end, passing over the top
const point = (percent: number, r = R) => {
  const a = Math.PI * (1 - percent / 100);
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
};

const arc = (from: number, to: number) => {
  const a = point(from);
  const b = point(to);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
};

export function ArcGauge({ percent }: { percent: number }) {
  const level = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const id = level.addListener(({ value }) => setShown(value));
    return () => level.removeListener(id);
  }, [level]);

  useEffect(() => {
    Animated.spring(level, { toValue: percent, friction: 7, tension: 60, useNativeDriver: false }).start();
  }, [percent, level]);

  const clamped = Math.min(Math.max(shown, 0), 100);
  const marker = point(clamped);
  const state = moistureState(percent);
  const tickIn = point(DRY_THRESHOLD, R - STROKE / 2 - 4);
  const tickOut = point(DRY_THRESHOLD, R + STROKE / 2 + 4);
  const margin = Math.round(percent - DRY_THRESHOLD);

  return (
    <View style={styles.wrap}>
      <View style={{ width: W, height: H }}>
        <Svg width={W} height={H}>
          {ZONES.map((z) => (
            <Path key={z.from} d={arc(z.from, z.to)} stroke={z.color} strokeOpacity={0.35} strokeWidth={STROKE} fill="none" />
          ))}
          {/* The part of the arc that's filled so far */}
          {ZONES.map((z) => {
            const filledTo = Math.min(clamped, z.to);
            if (filledTo <= z.from) return null;
            return <Path key={'f' + z.from} d={arc(z.from, filledTo)} stroke={z.color} strokeWidth={STROKE} fill="none" />;
          })}
          <Line x1={tickIn.x} y1={tickIn.y} x2={tickOut.x} y2={tickOut.y} stroke={colors.text} strokeWidth={2} strokeLinecap="round" />
          <Circle cx={marker.x} cy={marker.y} r={11} fill={colors.surface} stroke={state.color} strokeWidth={4} />
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <RollingNumber value={percent} suffix="%" height={44} style={styles.big} suffixStyle={styles.suffix} />
        </View>
      </View>
      <Text style={[styles.verdict, { color: state.color }]}>{state.label}</Text>
      <Text style={styles.muted}>
        {margin < 0 ? `${-margin} points below the dry line. Time to water.` : `${margin} points above the dry line (${DRY_THRESHOLD}%).`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.xs },
  center: { position: 'absolute', left: 0, right: 0, top: CY - 50, alignItems: 'center' },
  big: { fontSize: 40, fontWeight: '600', color: colors.text, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  suffix: { fontSize: 20, color: colors.textMuted, fontWeight: '500', letterSpacing: 0 },
  verdict: { ...type.heading },
  muted: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
});
