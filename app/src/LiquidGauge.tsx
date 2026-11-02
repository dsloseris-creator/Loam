import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

// A glass that fills with water to the moisture level, with a gently sloshing surface.
// Inspired by Kokonut UI's Liquid Slider. The waves are two sine curves that slide sideways forever
// on the native thread, and the level moves on a spring so a change makes the water settle with a wobble.
const WAVE_H = 10;

function wavePath(size: number, phase: number) {
  const width = size * 2; // two periods, so sliding by one `size` loops seamlessly
  const amp = WAVE_H / 2 - 1;
  let d = `M0 ${WAVE_H}`;
  for (let x = 0; x <= width; x += 3) {
    d += ` L${x} ${(WAVE_H / 2 + amp * Math.sin((x / size) * 2 * Math.PI + phase)).toFixed(2)}`;
  }
  return `${d} L${width} ${WAVE_H} Z`;
}

function Wave({ size, color, opacity, phase, duration }: { size: number; color: string; opacity: number; phase: number; duration: number }) {
  const shift = useRef(new Animated.Value(0)).current;
  const d = useMemo(() => wavePath(size, phase), [size, phase]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shift, { toValue: -size, duration, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [size, duration, shift]);

  return (
    <Animated.View
      style={{ position: 'absolute', top: -WAVE_H, left: 0, width: size * 2, height: WAVE_H, opacity, transform: [{ translateX: shift }] }}
    >
      <Svg width={size * 2} height={WAVE_H}>
        <Path d={d} fill={color} />
      </Svg>
    </Animated.View>
  );
}

export function LiquidGauge({ percent, color, size = 68 }: { percent: number; color: string; size?: number }) {
  const level = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(level, {
      toValue: Math.min(Math.max(percent, 0), 100) / 100,
      friction: 6,
      tension: 55,
      useNativeDriver: true,
    }).start();
  }, [percent, level]);

  // Water starts fully below the glass at 0% and tops it up at 100%
  const translateY = level.interpolate({ inputRange: [0, 1], outputRange: [size + WAVE_H, 0] });

  return (
    <View style={[styles.glass, { width: size, height: size, borderRadius: size / 2, backgroundColor: color + '14', borderColor: color + '55' }]}>
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size + WAVE_H, transform: [{ translateY }] }}>
        <Wave size={size} color={color} opacity={0.4} phase={1.6} duration={3800} />
        <Wave size={size} color={color} opacity={0.9} phase={0} duration={2600} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: color, opacity: 0.9 }} />
      </Animated.View>
      <View style={[styles.shine, { left: size * 0.2, top: size * 0.14, width: size * 0.09, height: size * 0.26, borderRadius: size }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  glass: { overflow: 'hidden', borderWidth: 1.5 },
  shine: { position: 'absolute', backgroundColor: '#FFFFFF', opacity: 0.4 },
});
