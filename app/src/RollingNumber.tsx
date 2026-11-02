import { useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, Text, TextStyle, View } from 'react-native';

// A number whose digits roll like an odometer when they change (after Kokonut UI's Detent Dial readout).
// Only the digits that change move.
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Digit({ digit, height, style }: { digit: number; height: number; style: StyleProp<TextStyle> }) {
  const roll = useRef(new Animated.Value(digit)).current;

  useEffect(() => {
    Animated.spring(roll, { toValue: digit, friction: 8, tension: 90, useNativeDriver: true }).start();
  }, [digit, roll]);

  const translateY = roll.interpolate({ inputRange: [0, 9], outputRange: [0, -9 * height] });

  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        {DIGITS.map((d) => (
          <Text key={d} style={[style, { height, lineHeight: height }]}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

type Props = { value: number; height?: number; style: StyleProp<TextStyle>; suffix?: string; suffixStyle?: StyleProp<TextStyle> };

export function RollingNumber({ value, height = 44, style, suffix, suffixStyle }: Props) {
  const digits = String(Math.max(0, Math.round(value))).split('').map(Number);
  return (
    <View style={styles.row}>
      {digits.map((d, i) => (
        // keyed from the right, so the ones digit stays the same column when 99 becomes 100
        <Digit key={digits.length - i} digit={d} height={height} style={style} />
      ))}
      {suffix ? <Text style={[style, suffixStyle, { height, lineHeight: height }]}>{suffix}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'flex-start' } });
