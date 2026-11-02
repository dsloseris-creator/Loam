import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { WashBlob, washBlobs } from './wash';
import { Settings } from './settings';
import { colors } from './theme';

// A quiet scene behind the app. It follows two things:
//   the season (palette, and what drifts through the air), and
//   the plants' mood (lush and green when they're happy, drying toward gold when they need water).
// Linen paper, rolling hills, soft abstract colour washes, warm sunlight and a speck of grain. Always low-contrast.

type Season = 'spring' | 'summer' | 'autumn' | 'winter';

type Palette = { paperTop: string; paperBottom: string; hillFar: string; hillNear: string; sun: string };

const SEASONS: Record<Season, Palette> = {
  spring: { paperTop: '#F6F3EA', paperBottom: '#E6EBD6', hillFar: '#B8CBA0', hillNear: '#8FAF7A', sun: '#F4E3A8' },
  summer: { paperTop: '#F8F2E4', paperBottom: '#E4E6CC', hillFar: '#A9BE8B', hillNear: '#7A9A62', sun: '#F2D58F' },
  autumn: { paperTop: '#F8F0E2', paperBottom: '#EBDFC6', hillFar: '#C9B98A', hillNear: '#A8975E', sun: '#F0C47A' },
  winter: { paperTop: '#F3F3F0', paperBottom: '#E1E5E3', hillFar: '#B9C5BD', hillNear: '#94A89E', sun: '#E6EDF2' },
};

// Where every season drifts when the plants are thirsty: ochre hills, a hotter sun
const PARCHED: Palette = { paperTop: '#F8EEDA', paperBottom: '#EBDDBE', hillFar: '#D9C08A', hillNear: '#C9A768', sun: '#F0C070' };

// And the fresh, cool tint when everyone is well watered
const LUSH_PAPER = '#F1F5EA';

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const x = hex(a);
  const y = hex(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

function seasonOf(date: Date, choice: Settings['season'], hemisphere: Settings['hemisphere']): Season {
  if (choice !== 'auto') return choice;
  const month = (date.getMonth() + (hemisphere === 'south' ? 6 : 0)) % 12; // 0 = January
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

// mood: 0 = plants are parched, 1 = lush. 0.65 is the calm in-between.
function paletteFor(season: Season, mood: number): Palette & { dry: number } {
  const base = SEASONS[season];
  const dry = Math.min(Math.max((0.55 - mood) / 0.55, 0), 1); // 0 when mood is fine, 1 when parched
  const lush = Math.min(Math.max((mood - 0.7) / 0.3, 0), 1);
  const blend = (k: keyof Palette) => mix(base[k], PARCHED[k], dry * 0.5);
  return {
    paperTop: mix(blend('paperTop'), LUSH_PAPER, lush * 0.35),
    paperBottom: blend('paperBottom'),
    hillFar: blend('hillFar'),
    hillNear: blend('hillNear'),
    sun: blend('sun'),
    dry,
  };
}

// ---------- hills ----------

const hillY = (x: number, width: number, base: number, amp: number, phase: number) =>
  base + amp * Math.sin((x / width) * Math.PI * 2 + phase) + amp * 0.45 * Math.sin((x / width) * Math.PI * 5 + phase * 2);

function hillPath(width: number, height: number, base: number, amp: number, phase: number) {
  let d = `M0 ${height}`;
  for (let x = 0; x < width; x += 12) d += ` L${x} ${hillY(x, width, base, amp, phase).toFixed(1)}`;
  d += ` L${width} ${hillY(width, width, base, amp, phase).toFixed(1)}`; // end exactly at the right edge
  return `${d} L${width} ${height} Z`;
}

// Tiny specks, in the same places every time
function grainPath(width: number, height: number, count: number) {
  let seed = 7;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  let d = '';
  for (let i = 0; i < count; i++) d += `M${(next() * width).toFixed(0)} ${(next() * height).toFixed(0)}h0.1`;
  return d;
}

// ---------- soft colour washes ----------

const STRENGTH = { soft: 0.6, medium: 1, bold: 1.5 }; // multiplies each wash's opacity
const HILLS_TOP_FROM_BOTTOM = 190; // the hills start about this far up from the bottom of the screen

// What colour each wash is, for the current season and mood
function washColors(p: Palette & { dry: number }, season: Season): Record<WashBlob['key'], string> {
  const accent = { spring: '#E9B9C4', summer: '#F1D679', autumn: '#D99A74', winter: '#A9BDCB' }[season];
  return {
    sage: p.hillFar,
    accent: mix(accent, PARCHED.sun, p.dry * 0.4),
    sky: mix('#9CC0C4', PARCHED.hillFar, p.dry * 0.45),
    sun: p.sun,
    mist: p.hillFar,
  };
}

function WashBlobView({ blob, color, strength }: { blob: WashBlob; color: string; strength: number }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: blob.period, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: blob.period, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blob.period, t]);

  const id = `wash-${blob.key}`;
  const opacity = Math.min(blob.opacity * strength, 0.9);
  const w = blob.rx * 2;
  const h = blob.ry * 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: blob.cx - blob.rx,
        top: blob.cy - blob.ry,
        width: w,
        height: h,
        transform: [
          { rotate: `${blob.rot}deg` },
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-18, 18] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [10, -10] }) },
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] }) },
        ],
      }}
    >
      <Svg width={w} height={h}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.45} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={blob.rx} cy={blob.ry} rx={blob.rx} ry={blob.ry} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

// ---------- sunlight ----------

function Sunlight({ color, strength }: { color: string; strength: number }) {
  const { width, height } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;
  const size = 420;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 26000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 26000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: -size * 0.35,
        top: height * 0.08,
        width: size,
        height: size,
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, width * 0.18] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
        ],
      }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="sun" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={strength} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#sun)" />
      </Svg>
    </Animated.View>
  );
}

// ---------- things drifting through the air ----------

const DRIFT: Record<Season, { count: number; fill: string; rise: boolean; size: [number, number]; spin: number; opacity: number }> = {
  spring: { count: 7, fill: '#EDBFC8', rise: false, size: [9, 14], spin: 70, opacity: 0.55 }, // petals
  summer: { count: 6, fill: '#F2DE96', rise: true, size: [4, 8], spin: 0, opacity: 0.6 }, // pollen and fireflies
  autumn: { count: 6, fill: '#C98A4B', rise: false, size: [12, 18], spin: 90, opacity: 0.5 }, // falling leaves
  winter: { count: 9, fill: '#D5E0E6', rise: false, size: [3, 6], spin: 0, opacity: 0.85 }, // snow
};

function Drifter({ season, index, height, width }: { season: Season; index: number; height: number; width: number }) {
  const spec = DRIFT[season];
  const t = useRef(new Animated.Value(0)).current;

  // Same values for the same particle every time, so nothing jumps when the app reopens
  const mine = useMemo(() => {
    const r = (n: number) => ((Math.sin((index + 1) * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    return {
      x: r(1) * (width - 24),
      size: spec.size[0] + r(2) * (spec.size[1] - spec.size[0]),
      duration: 26000 + r(3) * 22000,
      start: r(4),
      sway: 14 + r(5) * 26,
    };
  }, [index, width, spec]);

  useEffect(() => {
    t.setValue(mine.start);
    const run = () =>
      Animated.loop(Animated.timing(t, { toValue: 1, duration: mine.duration, easing: Easing.linear, useNativeDriver: true }));
    let loop: Animated.CompositeAnimation | undefined;
    const first = Animated.timing(t, { toValue: 1, duration: mine.duration * (1 - mine.start), easing: Easing.linear, useNativeDriver: true });
    first.start(({ finished }) => {
      if (finished) {
        loop = run();
        loop.start();
      }
    });
    return () => {
      first.stop();
      loop?.stop();
    };
  }, [mine, t]);

  const from = spec.rise ? height + 20 : -30;
  const to = spec.rise ? -30 : height + 20;
  const s = mine.size;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: mine.x,
        top: 0,
        width: s,
        height: s,
        opacity: spec.opacity,
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) },
          { translateX: t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, mine.sway, 0, -mine.sway, 0] }) },
          { rotate: t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ['0deg', `${spec.spin}deg`, '0deg', `${-spec.spin}deg`, '0deg'] }) },
        ],
      }}
    >
      <Svg width={s} height={s}>
        {season === 'autumn' ? (
          <Path d={`M${s / 2} ${s} C${s * 1.05} ${s * 0.7} ${s * 0.95} ${s * 0.2} ${s / 2} 0 C${s * 0.05} ${s * 0.2} ${-s * 0.05} ${s * 0.7} ${s / 2} ${s}Z`} fill={spec.fill} />
        ) : season === 'spring' ? (
          <Ellipse cx={s / 2} cy={s / 2} rx={s / 2} ry={s * 0.3} fill={spec.fill} />
        ) : (
          <Circle cx={s / 2} cy={s / 2} r={s / 2} fill={spec.fill} />
        )}
      </Svg>
    </Animated.View>
  );
}

// ---------- the whole scene ----------

function BackdropScene({ mood, settings }: { mood: number | null; settings: Settings }) {
  const { width, height } = useWindowDimensions();
  const season = useMemo(() => seasonOf(new Date(), settings.season, settings.hemisphere), [settings.season, settings.hemisphere]);

  // Ease toward the target mood, so a plant drying out turns the scene gradually, not abruptly
  const target = mood ?? 0.65;
  const eased = useRef(new Animated.Value(target)).current;
  const [shown, setShown] = useState(target);
  useEffect(() => {
    const id = eased.addListener(({ value }) => setShown(value));
    return () => eased.removeListener(id);
  }, [eased]);
  useEffect(() => {
    Animated.timing(eased, { toValue: target, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
  }, [target, eased]);

  const p = paletteFor(season, shown);
  const washColor = washColors(p, season);
  const hillsTop = height - HILLS_TOP_FROM_BOTTOM;
  const shapes = useMemo(
    () => ({
      far: hillPath(width, 240, 90, 22, 0.6),
      near: hillPath(width, 240, 140, 26, 2.4),
      grain: grainPath(width, height, 320),
    }),
    [width, height],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={p.paperTop} />
            <Stop offset="1" stopColor={p.paperBottom} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#paper)" />
        {settings.grain && <Path d={shapes.grain} stroke={colors.text} strokeOpacity={0.16} strokeWidth={1.5} strokeLinecap="round" />}
      </Svg>

      {settings.sunlight && <Sunlight color={p.sun} strength={0.5 + 0.15 * p.dry} />}

      {/* The washes live in a box that ends above the hills, so they never reach them */}
      {settings.wash && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width, height: hillsTop, overflow: 'hidden' }}>
          {washBlobs(width, height, hillsTop).map((b) => (
            <WashBlobView key={b.key} blob={b} color={washColor[b.key]} strength={STRENGTH[settings.washStrength]} />
          ))}
        </View>
      )}

      {settings.hills && (
        <Svg width={width} height={240} style={{ position: 'absolute', bottom: 0, left: 0 }}>
          <Path d={shapes.far} fill={p.hillFar} fillOpacity={0.55} />
          <Path d={shapes.near} fill={p.hillNear} fillOpacity={0.5} />
        </Svg>
      )}

      {settings.drifters &&
        Array.from({ length: DRIFT[season].count }, (_, i) => (
        <Drifter key={season + i} season={season} index={i} height={height} width={width} />
      ))}
    </View>
  );
}

// Redraws only when the mood or the settings change, not every time the app refreshes its readings
export const Backdrop = memo(BackdropScene);
