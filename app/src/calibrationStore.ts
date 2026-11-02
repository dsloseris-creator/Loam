import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Calibration, DEFAULT_CALIBRATION } from './calibration';

// Each sensor's calibration, kept on the phone. Sensors without one use the default,
// which is the factory one unless the user saved their own with "Use as default".
type Store = Record<number, Calibration>;

const KEY = 'calibrations.v1';
const DEFAULT_KEY = 'calibrations.default.v1';

export function useCalibrationStore() {
  const [store, setStore] = useState<Store>({});
  const [defaultCal, setDefaultCal] = useState<Calibration>(DEFAULT_CALIBRATION);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setStore(JSON.parse(raw)))
      .catch(() => {});
    AsyncStorage.getItem(DEFAULT_KEY)
      .then((raw) => raw && setDefaultCal(JSON.parse(raw)))
      .catch(() => {});
  }, []);

  const get = (nodeId: number): Calibration => store[nodeId] ?? defaultCal;

  const set = useCallback((nodeId: number, calibration: Calibration) => {
    setStore((prev) => {
      const next = { ...prev, [nodeId]: calibration };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Back to the default: forget this sensor's own calibration
  const reset = useCallback((nodeId: number) => {
    setStore((prev) => {
      const { [nodeId]: _removed, ...next } = prev;
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Sensors without their own calibration (including newly added ones) start from this
  const setDefault = useCallback((calibration: Calibration) => {
    setDefaultCal(calibration);
    AsyncStorage.setItem(DEFAULT_KEY, JSON.stringify(calibration)).catch(() => {});
  }, []);

  // Back to the numbers the app shipped with
  const resetDefault = useCallback(() => setDefault(DEFAULT_CALIBRATION), [setDefault]);

  return { get, set, reset, setDefault, resetDefault };
}
