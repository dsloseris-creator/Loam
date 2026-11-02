import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassFill } from './Glass';
import { colors, radius, spacing, type } from './theme';

// A short message that floats up above the bottom bar and fades away by itself.
// Each new `id` shows the message again.
export type ToastMessage = { id: number; text: string };

export function Toast({ message }: { message: ToastMessage | null }) {
  const insets = useSafeAreaInsets();
  const t = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<ToastMessage | null>(null);

  useEffect(() => {
    if (!message) return;
    setShown(message);
    t.setValue(0);
    Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(3600),
      Animated.timing(t, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start();
  }, [message?.id]);

  if (!shown) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 10 + 64 }]}>
      <Animated.View
        style={[
          styles.toast,
          { opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] },
        ]}
      >
        <GlassFill radius={radius.lg} opaque />
        <Text style={styles.text}>{shown.text}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: spacing.lg },
  toast: { borderRadius: radius.lg, paddingVertical: spacing.md - 2, paddingHorizontal: spacing.lg - 4, maxWidth: 340 },
  text: { ...type.caption, color: colors.text, textAlign: 'center' },
});
