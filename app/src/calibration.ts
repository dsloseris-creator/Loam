// Turns the sensor's raw value into moisture percent.
// A calibration is a list of (raw, percent) points; values between points are interpolated
// in a straight line. Two points (air = 0%, water = 100%) is the simple case; more points
// (dry soil, watered soil, a pre-baked soil curve) work the same way.
export type CalPoint = { raw: number; percent: number };
export type Calibration = CalPoint[];

// What new sensors start with: measured from a real sensor (dry in air, wet in water).
export const DEFAULT_CALIBRATION: Calibration = [
  { raw: 1156, percent: 100 },
  { raw: 2656, percent: 0 },
];

export function rawToPercent(raw: number, calibration: Calibration): number {
  const pts = [...calibration].sort((a, b) => a.raw - b.raw);
  if (raw <= pts[0].raw) return pts[0].percent;
  if (raw >= pts[pts.length - 1].raw) return pts[pts.length - 1].percent;
  for (let i = 1; i < pts.length; i++) {
    if (raw <= pts[i].raw) {
      const a = pts[i - 1];
      const b = pts[i];
      return Math.round(a.percent + ((raw - a.raw) / (b.raw - a.raw)) * (b.percent - a.percent));
    }
  }
  return pts[pts.length - 1].percent;
}
