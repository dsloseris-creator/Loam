import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { HUB_HOST, staleAfterSec } from './src/config';
import { Calibration, rawToPercent } from './src/calibration';
import { Wordmark } from './src/Logo';
import { useCalibrationStore } from './src/calibrationStore';
import { usePlantStore } from './src/plantStore';
import { useHub } from './src/hub';
import { AddSensorSheet } from './src/AddSensorSheet';
import { Backdrop } from './src/Backdrop';
import { EdgeFade } from './src/EdgeFade';
import { Entrance } from './src/Entrance';
import { FloatingBar } from './src/FloatingBar';
import { SettingsSheet } from './src/SettingsSheet';
import { useSettings } from './src/settings';
import { SkeletonCard } from './src/SkeletonCard';
import { Toast, ToastMessage } from './src/Toast';
import { PlantCard } from './src/PlantCard';
import { PlantDetail } from './src/PlantDetail';
import { PlantTile } from './src/PlantTile';
import { DRY_THRESHOLD, Plant, demoPlants, fmtInterval } from './src/plants';
import { colors, radius, spacing, type } from './src/theme';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Main />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Main() {
  // The cards scroll across the whole screen, behind the dynamic island and past the curved bottom corners.
  // The safe areas become padding at the ends of the list, so nothing is hidden when it's at rest.
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [openId, setOpenId] = useState<string | null>(null); // the plant shown full screen
  const { status, nodes, fetchedAt, readingAt, refresh } = useHub();
  const plantStore = usePlantStore();
  const calStore = useCalibrationStore();
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { settings, update: updateSettings, reset: resetSettings } = useSettings();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const showToast = (text: string) => setToast({ id: Date.now(), text });

  // Tell the user when a queued interval change actually lands on the sensor
  const pendingSeen = useRef<Record<number, number>>({});
  useEffect(() => {
    for (const n of nodes) {
      const was = pendingSeen.current[n.id] ?? 0;
      const now = n.pendingInterval ?? 0;
      if (was > 0 && now === 0 && n.interval === was) {
        showToast(`Done: the sensor now measures every ${fmtInterval(was)}.`);
      }
      pendingSeen.current[n.id] = now;
    }
  }, [nodes]);

  const live: Plant[] = nodes.map((n) => {
    const saved = plantStore.get(n.id);
    const lastSeenSec = n.ageSec + Math.max(0, Math.round((Date.now() - fetchedAt) / 1000));
    return {
      id: `node-${n.id}`,
      name: saved.name,
      location:
        saved.startedAt > 0
          ? `Sensor ${n.id} · since ${new Date(saved.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
          : `Sensor ${n.id}`,
      startedAt: saved.startedAt,
      moisture: rawToPercent(n.raw, calStore.get(n.id)),
      calibration: calStore.get(n.id),
      lastSeenSec,
      nodeId: n.id,
      stale: lastSeenSec > staleAfterSec(n.interval),
      intervalSec: n.interval,
      pendingIntervalSec: n.pendingInterval,
      historySec: n.historySec,
      readingAt: readingAt[n.id],
      raw: n.raw,
    };
  });
  const plants = settings.demoPlants ? [...live, ...demoPlants] : live;

  // How the plants are doing overall, 0 (parched) to 1 (lush): mostly the thirstiest plant, some of the average.
  // A sensor that stopped reporting doesn't count, since we don't know how that plant is.
  const scores = plants.filter((p) => !p.stale).map((p) => Math.min(Math.max((p.moisture - 5) / 50, 0), 1));
  const plantMood = scores.length ? 0.6 * Math.min(...scores) + 0.4 * (scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  // The settings can pin the mood, to preview how the background looks in each
  const mood = { auto: plantMood, off: null, lush: 1, calm: 0.65, parched: 0 }[settings.mood];

  const thirsty = plants.filter((p) => !p.stale && p.moisture < DRY_THRESHOLD).length;
  const summary =
    plants.length === 0
      ? 'Waiting for your sensor…'
      : thirsty === 0
        ? 'Everyone is happy.'
        : `${thirsty} ${thirsty === 1 ? 'plant needs' : 'plants need'} water.`;

  // What each plant's buttons and dialogs do, shared by the card, the tile view and the full-screen view
  const handlersFor = (plant: Plant) => ({
    onRename: (name: string) => plant.nodeId !== undefined && plantStore.rename(plant.nodeId, name),
    onSwitch: (name: string) => plant.nodeId !== undefined && plantStore.switchPlant(plant.nodeId, name),
    onCalibrated: (cal: Calibration) => plant.nodeId !== undefined && calStore.set(plant.nodeId, cal),
    onResetCalibration: () => {
      if (plant.nodeId !== undefined) calStore.reset(plant.nodeId);
      showToast('Back to the default calibration.');
    },
    onSetDefaultCalibration: (cal: Calibration) => {
      calStore.setDefault(cal);
      showToast('Saved as the default for all sensors without their own calibration.');
    },
    onIntervalQueued: (sec: number) => {
      showToast(`Sent: every ${fmtInterval(sec)}. The sensor applies it at its next check-in.`);
      refresh();
    },
  });

  // Tiles: as many columns as fit, never fewer than two
  const sidePad = Math.max(spacing.lg, insets.left + spacing.md) + Math.max(spacing.lg, insets.right + spacing.md);
  const columns = Math.max(2, Math.floor((screenWidth - sidePad + TILE_GAP) / (170 + TILE_GAP)));
  const tileWidth = Math.floor((screenWidth - sidePad - TILE_GAP * (columns - 1)) / columns);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <Backdrop mood={mood} settings={settings} />
      <StatusBar style="dark" />
      <ScrollView
        style={styles.screen}
        contentInsetAdjustmentBehavior="never"
        scrollIndicatorInsets={{ top: insets.top, bottom: insets.bottom + 80 }}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.md,
            paddingBottom: insets.bottom + 128,
            paddingLeft: Math.max(spacing.lg, insets.left + spacing.md),
            paddingRight: Math.max(spacing.lg, insets.right + spacing.md),
          },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.moss} progressViewOffset={insets.top} />}
      >
          <View style={styles.headerRow}>
            <View style={styles.header}>
              <Wordmark logo={false} />
              <Text style={styles.title}>Your plants</Text>
              <Text style={styles.subtitle}>{summary}</Text>
            </View>
            {plants.length > 1 && (
              <View style={styles.viewToggle}>
                {(['overview', 'cards'] as const).map((v) => (
                  <Pressable
                    key={v}
                    onPress={() => {
                      Haptics.selectionAsync();
                      updateSettings({ homeView: v });
                    }}
                    style={[styles.viewOption, settings.homeView === v && styles.viewOptionOn]}
                  >
                    <Text style={[styles.viewText, settings.homeView === v && { color: colors.surface, fontWeight: '600' }]}>
                      {v === 'overview' ? 'Grid' : 'List'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {status === 'offline' && (
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>Can't reach your hub</Text>
              <Text style={styles.bannerText}>
                Check that it's powered and on the same Wi-Fi as your phone ({HUB_HOST}).
                {plants.length > 0 ? ' Showing the last readings.' : ''}
              </Text>
            </View>
          )}

          {plants.length === 0 && status !== 'offline' && <SkeletonCard />}

          {settings.homeView === 'overview' && plants.length > 1 ? (
            <View style={[styles.grid, { gap: TILE_GAP }]}>
              {plants.map((plant, index) => (
                <Entrance key={plant.id} index={index}>
                  <PlantTile plant={plant} width={tileWidth} onOpen={() => setOpenId(plant.id)} />
                </Entrance>
              ))}
            </View>
          ) : (
            plants.map((plant, index) => (
              <Entrance key={plant.id} index={index}>
                <PlantCard plant={plant} {...handlersFor(plant)} onOpen={() => setOpenId(plant.id)} />
              </Entrance>
            ))
          )}
      </ScrollView>
      <EdgeFade height={insets.top + 28} />
      <FloatingBar status={status} refreshing={refreshing} onRefresh={onRefresh} onAdd={() => setAdding(true)} onSettings={() => setShowSettings(true)} />
      {/* Above everything else except the toasts, so an open plant covers the whole screen */}
      <PlantDetail plants={plants} openId={openId} onOpenChange={setOpenId} handlersFor={handlersFor} />
      <AddSensorSheet visible={adding} onClose={() => setAdding(false)} />
      <SettingsSheet
        visible={showSettings}
        settings={settings}
        onChange={updateSettings}
        onReset={resetSettings}
        onClose={() => setShowSettings(false)}
      />
      <Toast message={toast} />
    </View>
  );
}

const TILE_GAP = spacing.md;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1 },
  content: { gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  header: { flex: 1, paddingVertical: spacing.md, gap: spacing.xs },
  viewToggle: { flexDirection: 'row', marginTop: spacing.md + 4, padding: 3, borderRadius: radius.pill, backgroundColor: colors.border + '99' },
  viewOption: { paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.pill },
  viewOptionOn: { backgroundColor: colors.moss },
  viewText: { ...type.caption, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.body, color: colors.textMuted },
  banner: {
    backgroundColor: colors.clay + '1F',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  bannerTitle: { ...type.body, fontWeight: '600', color: colors.clay },
  bannerText: { ...type.caption, color: colors.text },
});
