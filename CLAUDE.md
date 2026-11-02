# Plant Moisture Sensors: Project Context

Read this first. It's the shared context between me (the owner) and Claude Code. If anything here conflicts with what you see in the code, trust the code and tell me, then suggest an update to this file.

## About me and how to work with me
- Some coding experience, **no electronics experience**. Go step by step, start as simple as possible, and explain the *why* of hardware choices (wiring, power, pins) in plain language.
- Don't jump ahead to later features. Get the simple version working and testable first.
- Prefer cheap, simple solutions. Cost per node matters because this may become a product later.

## Name and logo (working, rough)
- Working name: **Loam** (rich, healthy soil). Chosen from a shortlist (Mizzle, Petrichor, Understory, Soilmate, Fernly, Pottle, Mossdrop, Rootwork, Sipwell were the other options). Earlier names ruled out: Leafsip (pending US trademark in housewares), Tilth (an existing garden-journal app), Dewroot (dropped by the owner). Verify the name (USPTO, App Store, domains) before committing; "Loam" is a common word, so conflicts are likely.
- Logo: a mound of soil with a sprout growing out of it (`app/src/Logo.tsx`). The app icon files in `app/assets/` are generated from the same shape. The in-app name is the `APP_NAME` constant in `Logo.tsx`, and the display name is in `app.json`.

## The goal
Cheap, wireless soil moisture sensors for plants. When a plant needs water, my phone gets an alert. I want my own app rather than an existing one. Long term it should be cheap, portable and possibly marketable.

## Architecture
- Many cheap **sensor nodes** report to a **single hub**. No full dev board per sensor if it can be avoided.
- The hub is battery-powered and rechargeable, with minimal power consumption.
- The phone app talks to the hub over **home Wi-Fi for now** (decided; Bluetooth and cloud remain possible later, e.g. cloud for away-from-home alerts). This also means Expo Go works without a custom build.
- Target phones: **iPhone and Android** (iPhone first for the deploy roadmap).

## Hardware I have
- Capacitive soil moisture sensor **v2.0**
- **ESP32-C3 Super Mini**, programmed with **Arduino IDE** (more on order, plus RGB LEDs)
- RGB LED on pins 5, 6, 7 (already supported in the node firmware via `LED_IS_RGB`)
- Plan to test nodes on battery with the Super Mini and possibly remove its onboard red LED myself. I decided not to buy ~$13 XIAO ESP32-C3 boards for now.

## Tooling preferences
- **Python: always use `uv`** (`uv init`, `uv add`, `uv run`), never bare pip/venv/conda.

## Node behavior decisions
- Each node has an LED that lights **only when the plant is dry**, with the color getting redder the drier it is.
- The LED color range should be customizable, or the LED fully disableable, to save battery.
- **Low-battery warnings go to the app**, not the node LED.
- Keep nodes simple: no button for now.
- Each new node needs a **setup/calibration step in the app**, because wet/dry readings differ per sensor.

## Calibration and sleep decisions (planned, not built yet)
- **Nodes report raw values only; the app computes moisture percent.** The hub should store raw history, so recalibrating redraws old graphs correctly.
- **Option B (hub sends config back to the node) is deferred.** For now the node keeps a rough built-in dry/wet calibration, used only for its LED; the precise calibration lives in the app. Eventually the node listens briefly after each report and the hub replies with calibration, LED settings, sleep interval; the same channel later carries wake slots. Changing the measurement interval from the app needs at least this minimal reply. **Partly built:** the node now listens ~300 ms after each report, and the hub can reply with CAL_START / CAL_STOP (fast calibration mode, driven by the app's calibration wizard via `POST /api/calibrate`). Calibration is stored per sensor on the phone. The measurement interval is also settable from the app (`POST /api/interval`, sent as CMD_SET_INTERVAL; the node saves it in flash and reports it in every packet so the app can confirm it). LED settings and wake slots over this channel are not built yet. Chart ranges (1h/6h/24h) don't yet scale with long intervals.
- **Sleep time becomes customizable, eventually hours or days.** This affects: stale/"No signal" timing (should scale with the interval), chart ranges (1h/6h/24h stop making sense), and hub RAM-only history (a power loss costs far more at this timescale: plan flash storage or app-side history caching).
- **Calibration mode:** fast sampling (seconds) to capture dry and wet values. Because a node asleep for days can't hear the hub, enter it on a cold power-up (new node setup) or at the next wake after the app requests it; no button on nodes.
- **Calibration data model:** a list of (raw, percent) points with interpolation. Two-point air/water is the quick default; optional extra soil points (dry soil, watered soil) for precision. Plan: normalize each sensor with its own air/water readings, then apply a pre-baked per-soil-type curve from real experiments.
- **Experiments planned:** measure real soils with known water content to build calibration curves that ship pre-baked in the app.
- **Later ideas:** plant-type library with moisture-level and care guides (would replace the fixed 30% dry threshold per plant). Far future: a hub with a screen/interface that also stores config and history.

## Where we are
- Working end to end: node -> hub (ESP-NOW) -> hub Wi-Fi JSON API -> Expo app with live readings, history chart, plant rename and "move sensor to another plant". Firmware to use: `hub_sketch_wifi_api` and `node_sketch_wifi_channel` (the `*_baseline_working_*` sketches are untouched originals). Needs USB CDC On Boot = Enabled in the Arduino IDE for Serial output.
- Still hardcoded in the node: calibration values, hub MAC, Wi-Fi channel (must match the router), node ID.
- **Next hardware step** after the simple version works: scheduled wake slots for nodes so the hub can sleep between them.

## The app
- Home has a Grid (small tiles, all plants at once) and a List (detailed cards) view. Tapping either opens the plant full screen: swipe left/right for the next/previous plant, swipe right from the left edge to go back, pull down at the top to close.
- Goal: build quickly, and make it **testable on my iPhone early**, before going deep.
- Proposed stack (open to discussion): **Expo + React Native**. Preview with Expo Go and mock moisture data first. Bluetooth would need a custom development build instead of Expo Go.
- Start with fake data and a single home screen showing plants and their moisture state, then wire in real hub data later.
- Planned screens/features: plant list and status, add-node setup with calibration, alerts, low-battery warnings, LED color settings.
- **Design language: grassroots, aesthetic and calming.** UI quality matters a lot to me. Think muted earthy palette, rounded shapes, soft motion, generous spacing. Define design tokens (colors, type, spacing, radius) in one place.
- UI building blocks to consider for mobile: react-native-reusables (shadcn-style, on NativeWind), React Native Skia and Reanimated for polish, Victory Native or react-native-gifted-charts for charts. Web-only libraries like Kokonut UI and Bklit UI won't run in a native app as-is.

## Deploy roadmap (later)
1. Decide hub-to-phone connection.
2. Design tokens and wireframes.
3. UI with mock data in Expo, tested on my iPhone.
4. Connect real hub data.
5. Apple Developer Program ($99/yr), needed for TestFlight and the App Store.
6. `eas build --platform ios` then `eas submit --platform ios`, test via TestFlight.
7. App Store listing (screenshots, privacy policy, icon), then App Review.

## Suggested folder layout
```
plant-sensors/
  CLAUDE.md
  firmware/   # Arduino sketch(es)
  app/        # Expo app
  mock-hub/   # pretend hub for developing without hardware (uv run mock_hub.py)
```

## First things to do in a new session
1. Read `firmware/` and tell me what's working and what isn't.
2. Ask me anything that's unclear instead of guessing, especially about hub communication and wiring.
3. Scaffold `app/` with Expo, mock data and one calm home screen, and tell me how to open it on my iPhone.
