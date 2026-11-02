// Where the soft colour washes sit. Each is a big, slightly tilted oval of colour that fades to nothing at its
// edge (a radial gradient), so together they read as blurry, organic patches of light and colour.
// Everything stays inside the area above the hills, so nothing washes over them.
export type WashBlob = {
  key: 'sage' | 'accent' | 'sky' | 'sun' | 'mist';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number; // degrees
  opacity: number;
  period: number; // ms for one slow breath of drifting
};

// width, height: the screen. hillsTop: where the hills start, measured from the top of the screen.
export function washBlobs(width: number, height: number, hillsTop: number): WashBlob[] {
  const W = width;
  const H = hillsTop;
  void height;
  return [
    { key: 'mist', cx: 0.5 * W, cy: 0.36 * H, rx: 0.95 * W, ry: 0.34 * H, rot: 0, opacity: 0.26, period: 40000 },
    { key: 'sage', cx: 0.12 * W, cy: 0.13 * H, rx: 0.64 * W, ry: 0.26 * H, rot: -18, opacity: 0.55, period: 26000 },
    { key: 'accent', cx: 0.92 * W, cy: 0.3 * H, rx: 0.56 * W, ry: 0.24 * H, rot: 28, opacity: 0.5, period: 31000 },
    { key: 'sky', cx: 0.08 * W, cy: 0.54 * H, rx: 0.6 * W, ry: 0.22 * H, rot: 14, opacity: 0.42, period: 36000 },
    { key: 'sun', cx: 0.74 * W, cy: 0.64 * H, rx: 0.52 * W, ry: 0.2 * H, rot: -12, opacity: 0.5, period: 29000 },
  ];
}
