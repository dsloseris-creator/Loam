import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors, radius, spacing } from './theme';

// A placeholder card with a soft light sweeping across it, shown while we wait for the first sensor
// (the shimmer idea from Magic UI and Uiverse loaders).
const SWEEP = 160;

export function SkeletonCard() {
  const [width, setWidth] = useState(0);
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [t]);

  return (
    <View style={styles.card} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.top}>
        <View style={styles.circle} />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <View style={[styles.bone, { width: '55%', height: 18 }]} />
          <View style={[styles.bone, { width: '35%', height: 12 }]} />
          <View style={[styles.bone, { width: 96, height: 24, borderRadius: radius.pill }]} />
        </View>
      </View>
      <View style={[styles.bone, { width: '100%', height: 44 }]} />
      <View style={[styles.bone, { width: '40%', height: 12 }]} />

      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { width: SWEEP, transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-SWEEP, width] }) }] },
        ]}
      >
        <Svg width={SWEEP} height="100%">
          <Defs>
            <LinearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.55} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={SWEEP} height="100%" fill="url(#sweep)" />
        </Svg>
      </Animated.View>
    </View>
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
    overflow: 'hidden',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  circle: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.border },
  bone: { borderRadius: radius.sm, backgroundColor: colors.border },
});
