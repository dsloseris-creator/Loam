import { Calibration } from './calibration';
import { colors } from './theme';

export type Plant = {
  id: string;
  name: string;
  location: string;
  moisture: number; // percent, 0-100 (the node already sends this)
  battery?: number; // percent: the real node doesn't report this yet
  lastSeenSec: number;
  nodeId?: number; // set for real sensors; demo plants have none (and no chart)
  calibration?: Calibration; // the sensor's raw-to-percent calibration
  startedAt?: number; // when the sensor was put in this plant (epoch ms); 0 = since the beginning
  stale?: boolean;
  intervalSec?: number; // how often the sensor measures (reported by the sensor)
  pendingIntervalSec?: number;
  historySec?: number; // how much saved history the hub has for this sensor
  readingAt?: number; // when the newest reading arrived; changes with every new reading
  raw?: number; // the newest raw reading, so the chart can show it straight away
};

// Made-up plants for design work (see SHOW_DEMO_PLANTS in config.ts).
export const demoPlants: Plant[] = [
  { id: 'demo-1', name: 'Fiddle leaf fig', location: 'Demo', moisture: 24, battery: 74, lastSeenSec: 240 },
  { id: 'demo-2', name: 'Snake plant', location: 'Demo', moisture: 41, battery: 58, lastSeenSec: 60 },
  { id: 'demo-3', name: 'Basil', location: 'Demo', moisture: 9, battery: 15, lastSeenSec: 420 },
];

// Same threshold as LED_DRY_THRESHOLD in the node firmware.
export const DRY_THRESHOLD = 30;
export const LOW_BATTERY = 20;

export function moistureState(percent: number) {
  if (percent < 15) return { label: 'Thirsty', color: colors.clay };
  if (percent < DRY_THRESHOLD) return { label: 'Getting dry', color: colors.sand };
  if (percent < 70) return { label: 'Happy', color: colors.moss };
  return { label: 'Well watered', color: colors.water };
}

export function ago(sec: number) {
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  return `${Math.floor(sec / 3600)} h ago`;
}

export function fmtInterval(sec: number) {
  if (sec < 60) return `${sec} s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  if (sec < 86400) return `${+(sec / 3600).toFixed(1)} h`;
  return `${+(sec / 86400).toFixed(1)} d`;
}

// Chart lengths. "Auto" picks one of RANGE_STEPS from the sensor's interval.
export const STANDARD_RANGES = [
  { label: '1h', minutes: 60 },
  { label: '6h', minutes: 360 },
  { label: '24h', minutes: 1440 },
  { label: '7d', minutes: 10080 },
  { label: '30d', minutes: 43200 },
];
const RANGE_STEPS = [60, 180, 360, 720, 1440, 2880, 10080, 20160, 43200, 86400];

// About 48 readings across the chart, rounded up to a tidy length and never longer than the saved history.
export function autoRangeMinutes(intervalSec = 60, historySec?: number) {
  const target = (intervalSec * 48) / 60;
  const cap = historySec && historySec > 0 ? Math.max(60, historySec / 60) : Infinity;
  const fits = RANGE_STEPS.filter((m) => m <= cap);
  return fits.find((m) => m >= target) ?? fits[fits.length - 1];
}
