import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { DetentSlider } from './DetentSlider';
import { GlassFill } from './Glass';
import { setNodeInterval } from './hub';
import { fmtInterval } from './plants';
import { colors, radius, spacing, type } from './theme';

// The notches on the slider, in seconds: 10 s up to a week. The shortest is handy for testing.
const STOPS = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 259200, 604800];
const LABELS = [
  { index: 0, text: '10 s' },
  { index: 2, text: '1 min' },
  { index: 8, text: '1 h' },
  { index: 13, text: '1 day' },
  { index: 16, text: '1 wk' },
];

function readingsText(sec: number) {
  const perDay = 86400 / sec;
  if (perDay >= 1.5) return `About ${Math.round(perDay).toLocaleString()} readings a day`;
  return sec === 86400 ? 'One reading a day' : `One reading every ${fmtInterval(sec)}`;
}

type Props = {
  visible: boolean;
  nodeId: number;
  plantName: string;
  currentSec?: number;
  pendingSec?: number; // a change already waiting for the sensor
  onClose: () => void;
  onQueued: (seconds: number) => void; // the hub accepted the change; the sensor applies it at its next check-in
};

// Choosing an interval closes this right away. The sensor applies it whenever it next checks in,
// and the card shows that it's pending, so nothing here has to wait.
export function IntervalDialog({ visible, nodeId, plantName, currentSec, pendingSec, onClose, onQueued }: Props) {
  const [chosen, setChosen] = useState<number | undefined>();
  const [failed, setFailed] = useState(false);
  const bump = useRef(new Animated.Value(1)).current; // the big number pops a little on each notch

  useEffect(() => {
    if (visible) {
      setChosen(pendingSec || currentSec || 60);
      setFailed(false);
    }
  }, [visible]);

  useEffect(() => {
    bump.setValue(1.07);
    Animated.spring(bump, { toValue: 1, useNativeDriver: true, friction: 5, tension: 200 }).start();
  }, [chosen, bump]);

  const apply = async () => {
    if (chosen === undefined) return;
    try {
      await setNodeInterval(nodeId, chosen);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onQueued(chosen);
      onClose();
    } catch {
      setFailed(true);
    }
  };

  const cancelPending = () => {
    setNodeInterval(nodeId, 0).catch(() => {}); // withdraw the queued change
    onClose();
  };

  const unchanged = chosen === (pendingSec || currentSec);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <GlassFill radius={radius.lg} opaque />
          <Text style={styles.title}>Measurement interval · {plantName}</Text>

          {pendingSec ? (
            <View style={styles.pending}>
              <Text style={styles.pendingText}>
                A change to every {fmtInterval(pendingSec)} is waiting for the sensor to check in.
              </Text>
              <Pressable onPress={cancelPending}>
                <Text style={styles.link}>Cancel that change</Text>
              </Pressable>
            </View>
          ) : currentSec ? (
            <Text style={styles.muted}>Now measuring every {fmtInterval(currentSec)}.</Text>
          ) : null}

          <View style={styles.readout}>
            <Animated.Text style={[styles.big, { transform: [{ scale: bump }] }]}>
              {chosen !== undefined ? `Every ${fmtInterval(chosen)}` : ''}
            </Animated.Text>
            <Text style={styles.muted}>{chosen !== undefined ? readingsText(chosen) : ''}</Text>
          </View>
          <DetentSlider stops={STOPS} value={chosen ?? 60} onChange={setChosen} labels={LABELS} />
          <Text style={styles.muted}>
            Longer intervals make the battery last longer. The sensor applies the change the next time it checks in, or
            right away if you press its reset button.
          </Text>

          {failed && (
            <Text style={[styles.muted, { color: colors.clay }]}>
              Couldn't reach the hub, or it needs the updated firmware (hub_sketch_wifi_api).
            </Text>
          )}

          <Button label="Apply" onPress={apply} primary disabled={chosen === undefined || unchanged} />
          <Button label="Cancel" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function Button({ label, onPress, primary, disabled }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.button, primary && styles.primary, disabled && { opacity: 0.4 }]}>
      <Text style={[styles.buttonText, primary && { color: colors.surface, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#3A3A3299', justifyContent: 'center', padding: spacing.lg },
  sheet: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { ...type.heading, color: colors.text },
  muted: { ...type.caption, color: colors.textMuted },
  link: { ...type.caption, color: colors.moss, fontWeight: '600' },
  pending: { backgroundColor: colors.sand + '2E', borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  pendingText: { ...type.caption, color: colors.text },
  readout: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  big: { fontSize: 32, fontWeight: '600', color: colors.text, letterSpacing: -0.5 },
  button: {
    alignItems: 'center',
    paddingVertical: spacing.md - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.border + '88',
  },
  primary: { backgroundColor: colors.moss },
  buttonText: { ...type.body, color: colors.textMuted },
});
