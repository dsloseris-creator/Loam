import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from './theme';

// A slider that clicks from notch to notch. The ideas come from Kokonut UI's Detent Dial:
// while dragging the thumb is pulled toward the nearest notch, each notch gives a tap, ticks swell
// as the thumb passes, and on release it springs into place. Rebuilt for React Native.
const THUMB = 30;
const TRACK_Y = 24; // vertical centre of the track
const PULL = 0.35; // how much of the finger's offset from a notch the thumb follows (less = clingier)

type Props = {
  stops: number[]; // the values it clicks between, in increasing order
  value: number;
  onChange: (value: number) => void;
  labels?: { index: number; text: string }[]; // captions under chosen notches
  color?: string;
};

// Nearest stop on a log scale, so 90 s counts as close to 60 s, not to 600 s
function nearestIndex(stops: number[], v: number) {
  let best = 0;
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(Math.log(stops[i] / v)) < Math.abs(Math.log(stops[best] / v))) best = i;
  }
  return best;
}

export function DetentSlider({ stops, value, onChange, labels = [], color = colors.moss }: Props) {
  const last = stops.length - 1;
  const [width, setWidth] = useState(0);
  const start = nearestIndex(stops, value);
  const [vis, setVis] = useState(start); // where the thumb is drawn (can sit between notches)
  const pos = useRef(new Animated.Value(start)).current;
  const committed = useRef(start);
  const dragging = useRef(false);
  const widthRef = useRef(0);
  widthRef.current = width;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const settle = (index: number) =>
    Animated.spring(pos, { toValue: index, useNativeDriver: false, friction: 7, tension: 140 }).start();

  useEffect(() => {
    const id = pos.addListener(({ value: v }) => setVis(v));
    return () => pos.removeListener(id);
  }, [pos]);

  // Follow changes made from outside (for example when the dialog reopens)
  useEffect(() => {
    const i = nearestIndex(stops, value);
    if (!dragging.current && i !== committed.current) {
      committed.current = i;
      settle(i);
    }
  }, [value]);

  const moveTo = (x: number) => {
    const w = widthRef.current;
    if (!w) return;
    const frac = Math.min(Math.max((x - THUMB / 2) / Math.max(w - THUMB, 1), 0), 1);
    const raw = frac * last;
    const nearest = Math.round(raw);
    pos.stopAnimation();
    pos.setValue(nearest + (raw - nearest) * PULL);
    if (nearest !== committed.current) {
      committed.current = nearest;
      Haptics.selectionAsync();
      onChangeRef.current(stops[nearest]);
    }
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        dragging.current = true;
        moveTo(e.nativeEvent.locationX);
      },
      onPanResponderMove: (e) => moveTo(e.nativeEvent.locationX),
      onPanResponderRelease: () => {
        dragging.current = false;
        settle(committed.current);
      },
      onPanResponderTerminate: () => {
        dragging.current = false;
        settle(committed.current);
      },
    }),
  ).current;

  const usable = Math.max(width - THUMB, 1);
  const x = (i: number) => THUMB / 2 + (i / last) * usable;

  return (
    <View style={styles.wrap} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <>
          <View style={[styles.track, { left: THUMB / 2, width: usable }]} />
          <View style={[styles.fill, { left: THUMB / 2, width: (vis / last) * usable, backgroundColor: color + '66' }]} />

          {stops.map((_, i) => {
            const swell = Math.max(0, 1 - Math.abs(i - vis) / 2.5); // ticks near the thumb grow
            return (
              <View
                key={i}
                style={[
                  styles.tick,
                  { left: x(i) - 1, height: 7 + 13 * swell, backgroundColor: swell > 0.5 ? color : colors.border },
                ]}
              />
            );
          })}

          {labels.map((l) => (
            <Text key={l.text} style={[styles.label, { left: x(l.index) - 24 }]}>
              {l.text}
            </Text>
          ))}

          <View style={[styles.thumb, { left: x(vis) - THUMB / 2, borderColor: color }]} />
        </>
      )}
      {/* Transparent layer that catches the touch, so locationX is stable */}
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 96 },
  track: { position: 'absolute', top: TRACK_Y - 3, height: 6, borderRadius: radius.pill, backgroundColor: colors.border },
  fill: { position: 'absolute', top: TRACK_Y - 3, height: 6, borderRadius: radius.pill },
  tick: { position: 'absolute', top: TRACK_Y + 22, width: 2, borderRadius: 1 },
  label: { position: 'absolute', top: 74, width: 48, textAlign: 'center', fontSize: 11, color: colors.textMuted },
  thumb: {
    position: 'absolute',
    top: TRACK_Y - THUMB / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.surface,
    borderWidth: 3,
    shadowColor: '#3A3A32',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
