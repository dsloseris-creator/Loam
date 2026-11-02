import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassFill } from './Glass';
import { colors, radius, spacing, type } from './theme';

// New sensors need no setup in the app: the first time one reports to the hub, it appears as a plant.
export function AddSensorSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <GlassFill radius={radius.lg} opaque />
          <Text style={styles.title}>Add a sensor</Text>
          <View style={styles.steps}>
            {[
              'Give the new sensor its own NODE_ID in the node sketch (the first one is 1), then upload it.',
              'Set WIFI_CHANNEL to your router’s channel, the same as your other sensors.',
              'Power it on. When it first reports to the hub, it appears here by itself.',
              'Open its card, then tap Calibrate to teach the app its dry and wet readings.',
            ].map((text, i) => (
              <View key={i} style={styles.step}>
                <Text style={styles.num}>{i + 1}</Text>
                <Text style={styles.stepText}>{text}</Text>
              </View>
            ))}
          </View>
          <Pressable onPress={onClose} style={styles.button}>
            <Text style={styles.buttonText}>Got it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#3A3A3299', justifyContent: 'center', padding: spacing.lg },
  sheet: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { ...type.heading, color: colors.text },
  steps: { gap: spacing.md },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  num: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 13,
    fontWeight: '600',
    color: colors.surface,
    backgroundColor: colors.moss,
  },
  stepText: { ...type.body, color: colors.text, flex: 1 },
  button: { alignItems: 'center', paddingVertical: spacing.md - 2, borderRadius: radius.pill, backgroundColor: colors.moss },
  buttonText: { ...type.body, fontWeight: '600', color: colors.surface },
});
