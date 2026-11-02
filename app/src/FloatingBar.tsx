import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassFill } from './Glass';
import { HubStatus } from './hub';
import { colors, ink, radius, spacing, type } from './theme';

// A glass bar floating at the bottom: hub status, refresh, and add-a-sensor.
// Glass belongs on controls that float above the content, which is what this is.
const STATUS = {
  online: { label: 'Hub online', color: colors.moss },
  connecting: { label: 'Connecting…', color: colors.sand },
  offline: { label: 'Hub offline', color: colors.clay },
};

type Props = { status: HubStatus; refreshing: boolean; onRefresh: () => void; onAdd: () => void; onSettings: () => void };

export function FloatingBar({ status, refreshing, onRefresh, onAdd, onSettings }: Props) {
  const insets = useSafeAreaInsets();
  const spin = useRef(new Animated.Value(0)).current;
  const s = STATUS[status];

  useEffect(() => {
    if (!refreshing) return;
    spin.setValue(0);
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [refreshing, spin]);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 10 }]}>
      <View style={styles.bar}>
        <GlassFill radius={radius.pill} />

        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: s.color }]} />
          <Text style={styles.statusText}>{s.label}</Text>
        </View>

        <View style={styles.divider} />

        <Pressable
          accessibilityLabel="Refresh"
          onPress={() => {
            Haptics.selectionAsync();
            onRefresh();
          }}
          style={styles.button}
        >
          <Animated.Text
            style={[styles.glyph, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}
          >
            ↻
          </Animated.Text>
        </Pressable>

        <Pressable
          accessibilityLabel="Add a sensor"
          onPress={() => {
            Haptics.selectionAsync();
            onAdd();
          }}
          style={[styles.button, styles.add]}
        >
          <Text style={[styles.glyph, { color: ink.moss }]}>＋</Text>
        </Pressable>

        <Pressable
          accessibilityLabel="Settings"
          onPress={() => {
            Haptics.selectionAsync();
            onSettings();
          }}
          style={styles.button}
        >
          <Text style={styles.glyph}>{'\u2699\uFE0E'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.lg - 4,
    paddingRight: spacing.sm,
    borderRadius: radius.pill,
    shadowColor: '#3A3A32',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { ...type.caption, color: colors.text, fontWeight: '600' },
  divider: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: spacing.xs },
  button: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  add: { backgroundColor: colors.moss + '30' },
  glyph: { fontSize: 20, color: colors.text },
});
