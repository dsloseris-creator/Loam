import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_CALIBRATION } from './calibration';
import { EdgeFade } from './EdgeFade';
import { GlassFill } from './Glass';
import { LiquidGauge } from './LiquidGauge';
import { LOW_BATTERY, Plant, ago, fmtInterval, moistureState } from './plants';
import { DialogName, HistoryPanel, LiveDot, PlantActions, PlantDialogs, PlantHandlers, liveOf } from './PlantParts';
import { RollingNumber } from './RollingNumber';
import { colors, radius, spacing, type } from './theme';

// One plant opened full screen, as a page that slides over the home screen.
//   swipe left or right         moves to the next or previous plant
//   swipe right from the edge   goes back (the page follows your finger)
//   pull down at the top        closes it
// and the "‹ Plants" button works too (so does the Android back button).
const EDGE = 24; // how wide the back-swipe strip is at the left edge
const PULL_TO_CLOSE = 90; // how far past the top you pull to close

type Props = {
  plants: Plant[];
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  handlersFor: (plant: Plant) => PlantHandlers;
};

export function PlantDetail({ plants, openId, onOpenChange, handlersFor }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // Which plant is showing is tracked here, so swiping between plants only redraws this page,
  // not the whole home screen behind it. The parent hears about it only when the page closes.
  const [currentId, setCurrentId] = useState<string | null>(null);
  const index = currentId ? plants.findIndex((p) => p.id === currentId) : -1;
  const current = index >= 0 ? plants[index] : null;

  const [mounted, setMounted] = useState(false);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [menu, setMenu] = useState(false);
  const pager = useRef<ScrollViewInstance>(null);
  const closing = useRef(false);
  const placed = useRef(false);

  // The page's position lives on the UI thread, so sliding and dragging never wait on JavaScript
  const x = useSharedValue(width); // sliding in from the right, or out to it
  const y = useSharedValue(0); // pulled down
  const pageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));

  const finish = () => onOpenChange(null);

  // Slide in when a plant is opened; tidy up when it's closed
  useEffect(() => {
    if (openId && !mounted) {
      setCurrentId(openId);
      setMounted(true);
      closing.current = false;
      placed.current = false;
      x.value = width;
      y.value = 0;
      x.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
    } else if (!openId && mounted) {
      setMounted(false);
      setCurrentId(null);
      setDialog(null);
      setMenu(false);
    }
  }, [openId, mounted, width, x, y]);

  const close = (way: 'right' | 'down') => {
    if (closing.current) return;
    closing.current = true;
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) runOnJS(finish)();
    };
    if (way === 'down') y.value = withTiming(height, { duration: 260, easing: Easing.in(Easing.cubic) }, done);
    else x.value = withTiming(width, { duration: 260, easing: Easing.in(Easing.cubic) }, done);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Android's back button closes the page too
  useEffect(() => {
    if (!mounted) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeRef.current('right');
      return true;
    });
    return () => sub.remove();
  }, [mounted]);

  // A swipe that starts at the very left edge drags the whole page to the right, like going back.
  // It runs entirely on the UI thread, so the page stays under your finger.
  const edgeSwipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(6)
        .failOffsetY([-30, 30])
        .onUpdate((e) => {
          'worklet';
          x.value = Math.max(0, e.translationX);
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationX > 90 || e.velocityX > 700) {
            x.value = withTiming(width, { duration: 200, easing: Easing.out(Easing.quad) }, (finished) => {
              if (finished) runOnJS(finish)();
            });
          } else {
            x.value = withSpring(0, { damping: 24, stiffness: 260 });
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, x],
  );

  if (!mounted || !current) return null;

  return (
    <Animated.View style={[styles.root, pageStyle]}>
      {/* The pages: swipe sideways to change plant. Only the open one and its neighbours are drawn. */}
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: index * width, y: 0 }}
        onLayout={() => {
          if (!placed.current) {
            placed.current = true;
            pager.current?.scrollTo({ x: index * width, animated: false });
          }
        }}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (plants[i] && plants[i].id !== currentId) {
            Haptics.selectionAsync();
            setCurrentId(plants[i].id);
          }
        }}
        scrollEnabled={plants.length > 1}
      >
        {plants.map((plant, i) => (
          <View key={plant.id} style={{ width }}>
            {Math.abs(i - index) <= 1 && (
              <PlantPage
                plant={plant}
                active={i === index}
                width={width}
                insets={insets}
                onPullDown={() => closeRef.current('down')}
                setDialog={setDialog}
                setMenu={setMenu}
              />
            )}
          </View>
        ))}
      </ScrollView>

      <EdgeFade height={insets.top + 56} />

      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 8 }]}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            close('right');
          }}
          style={styles.back}
          accessibilityLabel="Back to all plants"
        >
          <GlassFill radius={radius.pill} />
          <Text style={styles.backText}>‹  Plants</Text>
        </Pressable>

        {plants.length > 1 && (
          <View pointerEvents="none" style={styles.dots}>
            {plants.map((p, i) => (
              <View key={p.id} style={[styles.pageDot, i === index && styles.pageDotOn]} />
            ))}
          </View>
        )}

        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            close('down');
          }}
          style={styles.down}
          accessibilityLabel="Close"
        >
          <GlassFill radius={radius.pill} />
          <Text style={styles.backText}>⌄</Text>
        </Pressable>
      </View>

      {/* The back-swipe strip along the left edge */}
      <GestureDetector gesture={edgeSwipe}>
        <View style={styles.edge} />
      </GestureDetector>

      <PlantDialogs plant={current} dialog={dialog} setDialog={setDialog} menu={menu} setMenu={setMenu} {...handlersFor(current)} />
    </Animated.View>
  );
}

function PlantPage({
  plant,
  active,
  width,
  insets,
  onPullDown,
  setDialog,
  setMenu,
}: {
  plant: Plant;
  active: boolean; // this is the plant on screen right now
  width: number;
  insets: EdgeInsets;
  onPullDown: () => void;
  setDialog: (d: DialogName) => void;
  setMenu: (open: boolean) => void;
}) {
  const state = plant.stale ? { label: 'No signal', color: colors.textMuted } : moistureState(plant.moisture);
  const gid = `glow-${plant.id}`;

  // The chart, daily view and buttons are the heavy part. They wait until the page has finished sliding in
  // or swiping into place, so the movement itself never has to share time with building them.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!active || settled) return;
    const t = setTimeout(() => setSettled(true), 380);
    return () => clearTimeout(t);
  }, [active, settled]);

  return (
    <View style={{ width, flex: 1 }}>
      {/* A wide, soft glow of the plant's status colour behind the top of the page */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={width} height={520}>
          <Defs>
            <RadialGradient id={gid} cx="50%" cy="22%" r="62%">
              <Stop offset="0" stopColor={state.color} stopOpacity={0.3} />
              <Stop offset="1" stopColor={state.color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={width / 2} cy={120} r={width * 0.95} fill={`url(#${gid})`} />
        </Svg>
      </View>

      <ScrollView
        nestedScrollEnabled
        alwaysBounceVertical
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        onScrollEndDrag={(e) => {
          // Pulled well past the top and let go: close
          if (e.nativeEvent.contentOffset.y < -PULL_TO_CLOSE) onPullDown();
        }}
        contentContainerStyle={{
          paddingTop: insets.top + 64,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: Math.max(spacing.lg, insets.left + spacing.md),
          gap: spacing.lg,
        }}
      >
        <View style={styles.hero}>
          <LiquidGauge percent={plant.moisture} color={state.color} size={132} />
          <RollingNumber value={plant.moisture} suffix="%" height={72} style={styles.huge} suffixStyle={styles.hugeSuffix} />
          <Text style={styles.name}>{plant.name}</Text>
          <Text style={styles.muted}>{plant.location}</Text>
          <View style={[styles.pill, { backgroundColor: state.color + '26' }]}>
            <View style={[styles.dot, { backgroundColor: state.color }]} />
            <Text style={[styles.pillText, { color: state.color }]}>{state.label}</Text>
          </View>
          <View style={styles.updated}>
            {plant.nodeId !== undefined && <LiveDot pulseKey={plant.readingAt} color={state.color} />}
            <Text style={styles.muted}>
              updated {ago(plant.lastSeenSec)}
              {plant.intervalSec ? ` · every ${fmtInterval(plant.intervalSec)}` : ''}
            </Text>
          </View>
          {plant.battery !== undefined && plant.battery < LOW_BATTERY && (
            <Text style={styles.battery}>Low sensor battery ({plant.battery}%)</Text>
          )}
        </View>

        {plant.nodeId !== undefined && !settled && <View style={[styles.panel, { height: 330 }]} />}

        {plant.nodeId !== undefined && settled && (
          <>
            <View style={styles.panel}>
              <HistoryPanel
                bare
                nodeId={plant.nodeId}
                color={state.color}
                from={plant.startedAt ?? 0}
                calibration={plant.calibration ?? DEFAULT_CALIBRATION}
                intervalSec={plant.intervalSec}
                historySec={plant.historySec}
                moisture={plant.moisture}
                live={liveOf(plant)}
              />
            </View>

            <PlantActions plant={plant} setDialog={setDialog} setMenu={setMenu} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F7F2E8',
    shadowColor: '#2F3B28',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: -6, height: 0 },
  },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: EDGE },
  topBar: { position: 'absolute', left: spacing.lg, right: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md + 2, borderRadius: radius.pill },
  down: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  backText: { ...type.body, fontWeight: '600', color: colors.text },
  dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  pageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted + '66' },
  pageDotOn: { width: 18, backgroundColor: colors.moss },
  hero: { alignItems: 'center', gap: spacing.sm },
  huge: { fontSize: 64, fontWeight: '600', color: colors.text, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  hugeSuffix: { fontSize: 30, color: colors.textMuted, fontWeight: '500', letterSpacing: 0 },
  name: { ...type.title, color: colors.text, textAlign: 'center' },
  muted: { ...type.caption, color: colors.textMuted },
  updated: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  battery: { ...type.caption, color: colors.clay },
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm - 2, paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.md - 4, borderRadius: radius.pill },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { ...type.caption, fontWeight: '600' },
  panel: { backgroundColor: colors.surface + 'E6', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
});
