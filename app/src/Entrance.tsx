import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

// Fades and slides its child up into place, a little later for each index, so a list arrives one by one.
export function Entrance({ index, children }: { index: number; children: ReactNode }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 520, delay: index * 90, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [index, t]);

  return (
    <Animated.View style={{ opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}
