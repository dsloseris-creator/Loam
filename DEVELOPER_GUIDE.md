# Developer Guide (for collaborators and their AI coding assistants)

Everything needed to get the Loam app running and to work on it. If you are an LLM coding assistant: read this whole file before changing anything, then read `app/AGENTS.md` (Expo rules) and `CLAUDE.md` (the owner's product decisions and preferences).

Where these files disagree with the code, **trust the code** and tell the owner.

## 1. What this project is

Cheap wireless soil-moisture sensors for houseplants, with a phone app that shows moisture and alerts when a plant is dry. The working app name is **Loam** (a working name, not final).

```
[sensor node] --ESP-NOW--> [hub] --Wi-Fi, HTTP JSON--> [phone app]
 ESP32-C3 + capacitive     ESP32 on home Wi-Fi          Expo / React Native
 sensor, deep sleeps       keeps a short history        (iPhone first)
```

- **Nodes** wake, read the sensor (raw ADC value), send it to the hub over ESP-NOW, listen ~300 ms for a command back, and go back to deep sleep.
- **The hub** joins the home Wi-Fi, receives the nodes' readings, keeps a RAM history, and serves a small JSON API at `http://plant-hub.local`.
- **The app** polls the hub every 2 s, converts raw readings to moisture percent using a per-sensor calibration stored on the phone, and draws everything.
- Home Wi-Fi only for now. Cloud/remote access, push alerts and Bluetooth are not built.

**Your job, as an app collaborator, is almost certainly the `app/` folder.** The firmware is covered in section 8 only so you understand the data.

## 2. Repository layout

```
CLAUDE.md             Owner's product context and decisions (read it)
DEVELOPER_GUIDE.md    This file
mock-hub/             PRETEND hub for developing without hardware (Python + uv, see its README)
app/                  Expo + React Native app (TypeScript)  <- main work
  App.tsx             Entry screen: home (grid/list), settings, wires everything together
  src/                All components, hooks and stores (flat folder, see section 5)
  AGENTS.md           Expo-specific rules for AI assistants
firmware/
  hub_sketch_wifi_api/            CURRENT hub firmware (Arduino IDE sketch)
  node_sketch_wifi_channel/       CURRENT node firmware
  *_baseline_working_ESP32/       Earlier untouched baselines (ignore)
```

## 3. Setup: running the app

### Prerequisites
- **Node.js** 20 or newer (LTS is fine) and npm.
- **An iPhone or Android phone with Expo Go** installed from the App Store / Play Store. Expo Go is enough; no custom development build is needed (the app deliberately avoids native modules that Expo Go lacks, such as Bluetooth).
- Computer and phone on the **same Wi-Fi network**.
- The app was built and tested on **iPhone first**. Android has not been tested.

### Steps
```bash
cd app
npm install
npx expo start          # add --clear after pulling changes or if anything looks stale
```
Scan the QR code: iPhone Camera app (opens Expo Go), or Expo Go's scanner on Android.

If the phone cannot connect to the dev server (corporate/guest Wi-Fi, client isolation), use `npx expo start --tunnel`.

### Working without the hardware (the usual case for a collaborator): use the MOCK HUB
You will not have the sensor or hub. **`mock-hub/` is a pretend hub** (a small Python program, run with `uv`) that fakes the real hub's whole API: live readings, a day of history, calibration, interval changes, power loss. It is **not real hardware**; it exists so the app can be developed without any. Full instructions: [`mock-hub/README.md`](mock-hub/README.md). Short version:
```bash
# terminal 1
cd mock-hub && uv run mock_hub.py        # prints the exact command for terminal 2
# terminal 2
cd app && EXPO_PUBLIC_HUB_HOST=<your-computer-ip>:8080 npx expo start --clear
```
`EXPO_PUBLIC_HUB_HOST` overrides `HUB_HOST` in `app/src/config.ts` without editing it.

Lighter alternative with no hub at all: open **⚙︎ settings** (floating bottom bar) and turn on **Demo plants**. These are made-up tiles only: they have no `nodeId`, so **no history chart, calibration, interval control or live dot**. Use the mock hub for anything beyond looks.

### Connecting to a real hub (owner's setup)
- `app/src/config.ts` → `HUB_HOST = 'plant-hub.local'`. If mDNS (`.local`) does not resolve on the phone, replace it with the hub's IP address (the hub prints its IP on the Serial Monitor at startup).
- iOS shows a "Local Network" permission prompt on first connect; allow it. It is declared in `app.json` (`NSLocalNetworkUsageDescription`, `NSBonjourServices`, `NSAppTransportSecurity`).

## 4. Commands and checks

```bash
cd app
npx tsc --noEmit        # typecheck. Must pass before you call anything done
npx expo lint           # lint (only if a linter is set up; none is configured yet)
npx expo-doctor         # dependency/config sanity (was 20/20 clean)
npx expo install --check   # are package versions what this Expo SDK expects?
npx expo install <pkg>  # ALWAYS use this to add packages, never npm install <pkg>
```
Rules that matter:
- **Add dependencies with `npx expo install <pkg>`**, which picks SDK-compatible versions.
- **Expo SDK 58, React Native 0.88, React 19.** Your training data is probably out of date for these; check `https://docs.expo.dev/llms.txt` and the versioned docs for SDK 58 before using any Expo/React Native API (this is also what `app/AGENTS.md` says).
- **There is no test suite.** Verification is `tsc`, then checking on a phone. Optionally check that the JS bundle builds: `npx expo export --platform ios` (output goes to `dist/`, git-ignored).
- Restart Metro with `--clear` after changing `app.json`, `babel` config or native-ish dependencies.

**Not Expo Router.** `app/AGENTS.md` is a template that says to use Expo Router with routes in `src/app/`. **This app does not use Expo Router.** The entry is `index.ts` → `App.tsx`; there is no file-based routing. "Screens" are modals, sheets and a full-screen overlay (`PlantDetail`). Do not restructure to Expo Router unless the owner asks.

## 5. Architecture of the app

Stack: Expo + React Native, TypeScript (strict), `react-native-svg` + `d3-shape` for charts, `react-native-reanimated` 4 + `react-native-worklets` + `react-native-gesture-handler` 3 for gestures, `expo-glass-effect` + `expo-blur` for glass, `expo-haptics`, `@react-native-async-storage/async-storage` for persistence. No state library: plain hooks and small stores.

### Data flow
```
hub.ts useHub()  -- polls /api/nodes every POLL_MS -->  nodes (raw values)
App.tsx          -- node + plantStore (name) + calibrationStore (raw -> percent) --> Plant objects
PlantCard / PlantTile / PlantDetail  render a Plant
hub.ts useHistory(nodeId, minutes, live) --> chart points (hub copy + phone-side archive)
```
- The **percent is computed in the app**, never trusted from the hub: `rawToPercent(raw, calibration)` in `calibration.ts`. The hub and node only deal in raw values (the node keeps rough numbers just for its own LED).
- A **Plant** (`plants.ts`) is the UI's model of one sensor. `nodeId` links it to a real sensor; demo plants have none.

### File map (`app/src/`)
| File | Purpose |
|---|---|
| `config.ts` | Hub host, polling interval, stale-signal rule. Edit `HUB_HOST` here. |
| `theme.ts` | **All design tokens**: colors, spacing, radius, type, `ink`. Use these; do not hardcode colors/sizes. |
| `hub.ts` | Everything that talks to the hub: `useHub`, `fetchNodes`, `fetchHistory`, `useHistory`, `startCalibration`, `stopCalibration`, `setNodeInterval`. Keeps last-known sensors so plants don't vanish when the hub is offline. |
| `historyCache.ts` | Phone-side copy of each sensor's raw history (hub history is RAM only and lost on hub power loss). |
| `calibration.ts`, `calibrationStore.ts` | Calibration model (list of raw→percent points, interpolated), per-sensor storage, user-saved default, `DEFAULT_CALIBRATION` (dry 2656, wet 1156). |
| `plantStore.ts` | Plant names and "sensor moved to another plant" start dates. |
| `plants.ts` | `Plant` type, demo plants, `moistureState`, interval/age formatting, chart range helpers. |
| `settings.ts`, `SettingsSheet.tsx` | User settings (home view, background layers, season, mood, demo plants). |
| `PlantCard.tsx` / `PlantTile.tsx` | List card / grid tile. Tap opens `PlantDetail`. |
| `PlantDetail.tsx` | Full-screen plant: swipe between plants, edge-swipe/pull-down to close. |
| `PlantParts.tsx` | Shared pieces: `HistoryPanel` (chart/daily/gauge views and range chooser), action chips, the "More" menu and all plant dialogs. |
| `MoistureChart.tsx`, `ArcGauge.tsx`, `DailyHeatmap.tsx`, `Sparkline.tsx`, `LiquidGauge.tsx`, `RollingNumber.tsx`, `DetentSlider.tsx`, `Ring.tsx` | Visual building blocks (Bklit/Kokonut/React-Bits-inspired, reimplemented natively). |
| `CalibrationWizard.tsx` | Two-step dry/wet calibration driven by the hub's fast mode. |
| `IntervalDialog.tsx`, `RangeDialog.tsx`, `NameDialog.tsx`, `AddSensorSheet.tsx` | Dialogs/sheets. |
| `Backdrop.tsx`, `wash.ts` | The soft background: paper gradient, colour washes, hills, drifting specks, seasonal and mood-adaptive palette. |
| `FloatingBar.tsx`, `Glass.tsx` | Floating bottom bar and the glass/blur fill. |
| `Toast.tsx`, `SkeletonCard.tsx`, `Entrance.tsx`, `EdgeFade.tsx`, `Logo.tsx` | Small UI pieces. `Logo.tsx` has `APP_NAME`. |

### Persistence (AsyncStorage, all on the phone)
`plants.v1`, `calibrations.v1`, `calibrations.default.v1`, `settings.v1`, `hub.nodes.v1` (last known sensors), `history.v1.<nodeId>` (raw history archive, up to 8000 points per sensor). Bump the `.vN` suffix and migrate if you change a stored shape.

### Design language (the owner cares about this a lot)
Grassroots, calm, aesthetic: muted earthy palette, rounded shapes, generous spacing, soft motion.
- Tokens only from `theme.ts`.
- **Glass is used sparingly**, only on floating layers (bottom bar, sheets, chips). The background is a soft diffuse scene, *not* glass. Cards are slightly translucent solid fills.
- Buttons are solid tinted fills with **no outlines**. Native iOS `Switch` for toggles.
- Edge-to-edge scrolling: content runs behind the Dynamic Island and the home indicator, with safe-area padding (`useSafeAreaInsets`).
- Things the owner explicitly rejected: leaf/branch/Matisse-style patterns in the background, a custom toggle switch, outlines on buttons.
- Web-only libraries (Bklit UI, Kokonut UI, Magic UI, React Bits) cannot run in React Native; this app copies their *ideas* with SVG/Reanimated.

### Gotchas worth knowing
- `StyleSheet.absoluteFillObject` no longer exists in this RN version; use `StyleSheet.absoluteFill`.
- Gestures use `react-native-gesture-handler` 3 + Reanimated shared values (`PlantDetail.tsx`). Keep gesture work on the UI thread; heavy content in the plant page is deferred ~380 ms so swiping stays smooth.
- Chart axis labels are RN `Text` outside the SVG, deliberately (SVG text overlapped gridlines).
- Re-render cost matters: `Backdrop` is memoized and only redraws when mood/settings change.
- Plant mood (background colour shift) is computed in `App.tsx`; it has an "Off" setting and is intentionally subtle.

## 6. The hub API (the contract the app depends on)

Base URL `http://plant-hub.local` (port 80). All responses are JSON. Times are seconds *ago*, not timestamps (the hub has no real clock); the app converts them to epoch ms on receipt.

### `GET /api/nodes`
```json
{ "nodes": [ {
  "id": 1, "raw": 2210, "percent": 41, "rssi": -52, "ageSec": 12,
  "cal": 0, "calRaw": 0, "calSeq": 0,
  "interval": 1800, "pendingInterval": 0, "historySec": 5400
} ] }
```
- `raw`: latest ADC reading (about 1100 wet … 2700 dry for the owner's sensor; higher = drier). `percent` is the node's rough value; **the app ignores it**.
- `ageSec`: seconds since this reading arrived.
- `cal`: calibration state, 0 idle, 1 waiting for the node to check in, 2 node is sending fast readings, 3 stopping. `calRaw` is the newest fast reading and `calSeq` increments per fast reading (so repeats can be told from new ones).
- `interval`: seconds the node sleeps between readings, as the node reports it. `pendingInterval`: a requested interval the node hasn't confirmed yet (0 = none).
- `historySec`: how far back the hub's saved history for this node reaches.

### `GET /api/history?node=<id>&minutes=<n>`
`{ "points": [[ageSec, raw], ...] }`, oldest first. Calibration (fast) readings are never included.

### `POST /api/calibrate?node=<id>&action=start|stop`
Starts/stops fast-reading mode on that node. Takes effect at the node's next check-in (immediately if the node is reset). The node leaves fast mode by itself after 3 minutes.

### `POST /api/interval?node=<id>&seconds=<n>`
Queues a new measuring interval (10 s to 1 week). `seconds=0` cancels a pending change. Applied at the node's next check-in; the node saves it in flash and reports it back, which clears `pendingInterval`.

### Behaviours to remember
- Hub history is a **RAM ring buffer (2000 points shared by all nodes)** with uptime-based timestamps. It is lost on hub power loss. That's why `historyCache.ts` exists.
- A node that sleeps for 30 minutes can only receive commands right after it reports, so calibration/interval changes are not instant. The UI is built around that (non-blocking dialogs, "pending" indicators).
- After a hub restart, `/api/nodes` may be empty until each node reports again; the app keeps its last-known sensors meanwhile.

## 7. Calibration model

A calibration is a list of `{ raw, percent }` points, interpolated linearly, clamped at the ends (`rawToPercent`). Today it is two points: dry (air) → 0 percent and wet (water) → 100 percent. Defaults for new sensors: dry **2656**, wet **1156**. The user can "Use this calibration as the default" or "Reset to default calibration" from a plant's **More** menu, which also shows the sensor's numbers.

Planned (not built): extra soil-based points, pre-baked per-soil-type curves, a plant-type library that replaces the fixed 30 percent dry threshold (`DRY_THRESHOLD` in `plants.ts`).

## 8. Firmware (only if you touch the hub/node side)

Arduino IDE sketches for ESP32-C3 Super Mini boards.
- Board: ESP32 core by Espressif (ESP32C3 Dev Module). **Tools → USB CDC On Boot → Enabled**, otherwise `Serial` prints nothing.
- Hub needs `firmware/hub_sketch_wifi_api/secrets.h`. **It is git-ignored.** Copy `secrets.h.example` to `secrets.h` and fill in the 2.4 GHz Wi-Fi name and password. Never commit it.
- Node and hub must be on the **same Wi-Fi channel as the router** (`WIFI_CHANNEL` in the node sketch; the hub prints its channel at startup).
- Node has the hub's MAC address hardcoded (`hubAddress[]`), a hardcoded `NODE_ID`, and a rough built-in calibration used only for its LED.
- `PRINT_INFO` at the top of each sketch toggles serial diagnostics.
- Packet structs (`Reading`, `Command`) must match between hub and node. If you change one, change both, and keep `app/src/hub.ts` in step with the API.

If you only work on the app you do not need any of this.

## 9. Known gaps and ideas

- The mock hub (`mock-hub/`) only imitates the API. Radio behaviour, timing quirks and real soil are not modelled, so check against real hardware before trusting those. If you change the API in `firmware/hub_sketch_wifi_api`, update `mock-hub/mock_hub.py` too.
- Not built: push alerts, remote access (planned: a tiny cloud relay such as Cloudflare Workers, which needs an Apple Developer account and a development build for push), hub-side persistent history with real timestamps, LED colour settings from the app, scheduled wake slots, plant-type library, low-battery data from nodes (battery is a field on `Plant` but real nodes don't report it yet).
- Unverified: Android behaviour, the Android monochrome icon, and visuals on iOS versions before 26 (glass falls back to blur).
- Distribution later: Apple Developer Program, `eas build --platform ios`, `eas submit`, TestFlight. The name "Loam" has not been legally cleared.

## 10. Conventions

- **Python: always use `uv`** (`uv init`, `uv add`, `uv run`), never bare pip/venv/conda. The only Python in the repo is `mock-hub/` (standard library only, run with `uv run mock_hub.py`); the rule applies to any other helper scripts too.
- Match the surrounding code's style: small files, short comments that explain *why*, plain-language naming. The owner has some coding experience but **no electronics experience**, so explain hardware reasoning in plain language.
- Keep changes simple and cheap; do not jump ahead to later features. Get the simple version working first.
- Don't commit secrets (`secrets.h`) or machine folders (`.expo`, `node_modules`).
- Before finishing a change: `cd app && npx tsc --noEmit`, then check it on a phone if it is visual or gestural.
