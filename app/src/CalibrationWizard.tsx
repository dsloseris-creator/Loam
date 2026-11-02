import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Calibration } from './calibration';
import { Ring } from './Ring';
import { fetchNodes, startCalibration, stopCalibration } from './hub';
import { GlassFill } from './Glass';
import { colors, radius, spacing, type } from './theme';

const POLL_MS = 300; // faster than the sensor's ~2 readings a second, so none are missed
const SETTLE_COUNT = 5; // this many fast readings in a row must agree...
const SETTLE_SPREAD = 40; // ...to within this many raw counts, and then the value is captured
const MIN_SPAN = 400; // dry and wet must differ by at least this much

type Step = 'intro' | 'waiting' | 'dryReady' | 'dry' | 'dryDone' | 'wet' | 'done' | 'error';
const WATCHING: Step[] = ['waiting', 'dryReady', 'dry', 'wet'];

type Props = {
  visible: boolean;
  nodeId: number;
  plantName: string;
  onClose: () => void;
  onSave: (calibration: Calibration) => void;
};

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

// How many of the newest readings in a row agree with each other (within SETTLE_SPREAD)
function steadyRun(readings: number[]) {
  let lo = Infinity;
  let hi = -Infinity;
  let n = 0;
  for (let i = readings.length - 1; i >= 0; i--) {
    lo = Math.min(lo, readings[i]);
    hi = Math.max(hi, readings[i]);
    if (hi - lo > SETTLE_SPREAD) break;
    n++;
  }
  return n;
}

export function CalibrationWizard({ visible, nodeId, plantName, onClose, onSave }: Props) {
  const [step, setStep] = useState<Step>('intro');
  const [recent, setRecent] = useState<number[]>([]); // newest last, restarts at each step
  const [liveRaw, setLiveRaw] = useState<number | undefined>();
  const [dryRaw, setDryRaw] = useState(0);
  const [wetRaw, setWetRaw] = useState(0);
  const [message, setMessage] = useState('');
  const started = useRef(false); // we asked the hub to start, so we must ask it to stop
  const lastSeq = useRef<number | undefined>(undefined);
  const stepRef = useRef(step);
  stepRef.current = step;
  const dryRef = useRef(dryRaw);
  dryRef.current = dryRaw;

  const clearReadings = () => {
    setRecent([]);
    setLiveRaw(undefined);
    lastSeq.current = undefined;
  };

  const reset = () => {
    setStep('intro');
    setMessage('');
    clearReadings();
  };

  useEffect(() => {
    if (visible) reset();
  }, [visible]);

  // Watch the sensor while waiting for it or collecting readings
  useEffect(() => {
    if (!visible || !WATCHING.includes(step)) return;
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const node = (await fetchNodes()).find((n) => n.id === nodeId);
        const cur = stepRef.current;
        if (!node || !WATCHING.includes(cur)) return;
        if (cur === 'waiting') {
          if (node.cal === 2) setStep('dryReady');
          return;
        }
        if (node.cal !== 2) {
          started.current = false; // the sensor is out of fast mode, so "try again" starts over
          setMessage('The sensor left calibration mode. It stops by itself after 3 minutes.');
          setStep('error');
          return;
        }
        if (cur === 'dryReady') return; // fast mode is on; readings only count once the user taps Start
        if (node.calSeq !== lastSeq.current && node.calRaw !== undefined) {
          lastSeq.current = node.calSeq;
          const raw = node.calRaw;
          setLiveRaw(raw);
          // While waiting for water, readings still close to the dry value don't count
          const notInWater = cur === 'wet' && dryRef.current - raw < MIN_SPAN;
          setRecent((r) => (notInWater ? [] : [...r, raw].slice(-30)));
        }
      } catch {
        // a missed poll is fine; the next one will catch up
      } finally {
        busy = false;
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [visible, step, nodeId]);

  const run = steadyRun(recent);

  // Capture automatically once enough steady readings are in
  useEffect(() => {
    if ((step !== 'dry' && step !== 'wet') || run < SETTLE_COUNT) return;
    const value = median(recent.slice(-SETTLE_COUNT));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    clearReadings();
    if (step === 'dry') {
      setDryRaw(value);
      setStep('dryDone');
      return;
    }
    if (dryRaw - value < MIN_SPAN) {
      setMessage(`The dry (${dryRaw}) and wet (${value}) readings are too close together. Try again.`);
      setStep('error');
      return;
    }
    setWetRaw(value);
    onSave([
      { raw: value, percent: 100 },
      { raw: dryRaw, percent: 0 },
    ]);
    stopOnHub();
    setStep('done');
  }, [run, step]);

  const stopOnHub = () => {
    if (started.current) {
      started.current = false;
      stopCalibration(nodeId).catch(() => {}); // the sensor also stops by itself after 3 minutes
    }
  };

  const close = () => {
    stopOnHub();
    onClose();
  };

  const begin = async () => {
    try {
      await startCalibration(nodeId);
      started.current = true;
      setStep('waiting');
    } catch {
      setMessage("Couldn't reach the hub, or it needs the updated firmware (hub_sketch_wifi_api).");
      setStep('error');
    }
  };

  const retry = () => {
    clearReadings();
    setMessage('');
    if (started.current) setStep('dryReady');
    else reset();
  };

  const inWater = step === 'wet' && liveRaw !== undefined && dryRaw - liveRaw >= MIN_SPAN;
  const holdLabel =
    step === 'wet' && !inWater ? 'Put the sensor in water' : run === 0 ? 'Settling…' : 'Hold steady…';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <GlassFill radius={radius.lg} opaque />
          <Text style={styles.title}>Calibrate · {plantName}</Text>

          {step === 'intro' && (
            <>
              <Text style={styles.body}>
                Two quick readings teach the app what “dry” and “wet” look like for this sensor: first in the air, then
                in water.
              </Text>
              <Text style={styles.muted}>
                The sensor switches to fast readings during this and returns to normal when you're done.
              </Text>
              <Button label="Start" onPress={begin} primary />
            </>
          )}

          {step === 'waiting' && (
            <>
              <Ring spinning>
                <Text style={styles.ringLabel}>Connecting</Text>
              </Ring>
              <Text style={styles.body}>Waiting for the sensor to check in…</Text>
              <Text style={styles.muted}>
                It switches to fast mode the next time it reports. To start right away, press the reset button on the
                sensor.
              </Text>
            </>
          )}

          {step === 'dryReady' && (
            <>
              <Text style={styles.step}>Step 1 of 2 · Dry</Text>
              <Text style={styles.body}>
                The sensor is connected. Hold it in the air, clean and dry, away from your hands and other objects.
              </Text>
              <Text style={styles.muted}>Tap Start dry reading when it's in place.</Text>
              <Button
                label="Start dry reading"
                onPress={() => {
                  clearReadings();
                  setStep('dry');
                }}
                primary
              />
            </>
          )}

          {(step === 'dry' || step === 'wet') && (
            <>
              <Text style={styles.step}>{step === 'dry' ? 'Step 1 of 2 · Dry' : 'Step 2 of 2 · Wet'}</Text>
              <Text style={styles.body}>
                {step === 'dry'
                  ? 'Hold the sensor in the air, clean and dry, away from your hands and other objects.'
                  : 'Put the sensor in a glass of water, up to the line on the board. Keep the electronics dry.'}
              </Text>
              <Ring progress={run / SETTLE_COUNT}>
                <Text style={styles.number}>{liveRaw ?? '…'}</Text>
                <Text style={styles.ringLabel}>{holdLabel}</Text>
              </Ring>
            </>
          )}

          {step === 'dryDone' && (
            <>
              <Ring progress={1} complete>
                <Text style={styles.check}>✓</Text>
              </Ring>
              <Text style={styles.body}>Dry captured · {dryRaw}</Text>
              <Text style={styles.muted}>
                Now put the sensor in water up to the line. Continue when it's in.
              </Text>
              <Button
                label="Continue to wet"
                onPress={() => {
                  clearReadings();
                  setStep('wet');
                }}
                primary
              />
            </>
          )}

          {step === 'done' && (
            <>
              <Ring progress={1} complete>
                <Text style={styles.check}>✓</Text>
              </Ring>
              <Text style={styles.body}>This sensor is calibrated.</Text>
              <Text style={styles.muted}>
                Dry {dryRaw} · Wet {wetRaw}. It's back to normal readings now.
              </Text>
              <Button label="Done" onPress={close} primary />
            </>
          )}

          {step === 'error' && (
            <>
              <Text style={[styles.body, { color: colors.clay }]}>{message}</Text>
              <Button label="Try again" onPress={retry} primary />
            </>
          )}

          {step !== 'done' && <Button label="Cancel" onPress={close} />}
        </View>
      </View>
    </Modal>
  );
}

function Button({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.button, primary && styles.primary]}>
      <Text style={[styles.buttonText, primary && { color: colors.surface, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#3A3A3299', justifyContent: 'center', padding: spacing.lg },
  sheet: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { ...type.heading, color: colors.text },
  step: { ...type.caption, color: colors.moss, fontWeight: '600' },
  body: { ...type.body, color: colors.text },
  muted: { ...type.caption, color: colors.textMuted },
  ringLabel: { ...type.caption, color: colors.textMuted },
  number: { fontSize: 40, fontWeight: '600', color: colors.text, letterSpacing: -1 },
  check: { fontSize: 56, color: colors.moss },
  button: {
    alignItems: 'center',
    paddingVertical: spacing.md - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.border + '88',
  },
  primary: { backgroundColor: colors.moss },
  buttonText: { ...type.body, color: colors.textMuted },
});
