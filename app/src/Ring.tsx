import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, spacing } from './theme';

const RING = 168;
const STROKE = 10;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// A progress ring that fills smoothly, or a rotating arc while we wait for something.
export function Ring({
  progress = 0,
  spinning,
  complete,
  children,
}: {
  progress?: number;
  spinning?: boolean;
  complete?: boolean;
  children?: ReactNode;
}) {
  const fill = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: spinning ? 0.25 : Math.min(progress, 1),
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, spinning, fill]);

  useEffect(() => {
    if (!spinning) return;
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spinning, spin]);

  const r = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = fill.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });
  const rotate = spinning ? spin.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '270deg'] }) : '-90deg';

  return (
    <View style={styles.ring}>
      <Animated.View style={{ position: 'absolute', transform: [{ rotate }] }}>
        <Svg width={RING} height={RING}>
          <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={colors.border} strokeWidth={STROKE} fill="none" />
          <AnimatedCircle
            cx={RING / 2}
            cy={RING / 2}
            r={r}
            stroke={complete ? colors.moss : colors.sage}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={offset}
          />
        </Svg>
      </Animated.View>
      <View style={styles.ringCenter}>{children}</View>
    </View>
  );
}


const styles = StyleSheet.create({
  ring: { width: RING, height: RING, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginVertical: spacing.sm },
  ringCenter: { alignItems: 'center', gap: spacing.xs },
});
