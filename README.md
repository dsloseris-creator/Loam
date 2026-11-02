# Loam

Cheap, wireless soil-moisture sensors for houseplants, with a phone app that tells you when a plant needs water. "Loam" is a working name.

```
[sensor node] --ESP-NOW--> [hub] --home Wi-Fi--> [phone app]
 ESP32-C3 + capacitive     ESP32, keeps a         Expo / React Native
 soil sensor, deep sleeps  short history          (iPhone first)
```

- **Sensor nodes** are tiny ESP32-C3 boards with a capacitive soil sensor. They wake up, take a reading, send it to the hub and go back to deep sleep. An LED on the node lights only when the plant is dry.
- **The hub** collects readings from many nodes and serves them to the app over your home Wi-Fi.
- **The app** shows each plant's moisture, history charts, daily patterns and a gauge, and handles per-sensor calibration and the measuring interval.

## Status

Working end to end on the owner's hardware: node → hub → app with live readings, history charts, calibration from the app and a changeable measuring interval. Not built yet: push alerts, remote access away from home, battery reporting, LED settings from the app. The app has only been tested on iPhone.

## Repository

| Folder | What it is |
|---|---|
| [`app/`](app) | The phone app (Expo + React Native + TypeScript) |
| [`mock-hub/`](mock-hub) | A **pretend** hub and sensors in Python, so the app can be developed with no hardware |
| [`firmware/`](firmware) | Arduino sketches for the hub and the nodes |

## Quick start (no hardware needed)

You need Node.js 20+, [`uv`](https://docs.astral.sh/uv/), and the **Expo Go** app on your phone (phone and computer on the same Wi-Fi).

```bash
# terminal 1: the pretend hub (prints the exact command for terminal 2)
cd mock-hub
uv run mock_hub.py

# terminal 2: the app, pointed at the pretend hub
cd app
npm install
EXPO_PUBLIC_HUB_HOST=<your-computer-ip>:8080 npx expo start --clear
```

Scan the QR code with your phone (Camera app on iPhone, Expo Go's scanner on Android). Details and the mock hub's commands are in [`mock-hub/README.md`](mock-hub/README.md).

To use a real hub instead, run `npx expo start --clear` without `EXPO_PUBLIC_HUB_HOST`; the app looks for `plant-hub.local` (see [`app/src/config.ts`](app/src/config.ts)).

## For contributors (and AI coding assistants)

Read **[`DEVELOPER_GUIDE.md`](DEVELOPER_GUIDE.md)** first. It covers setup, commands, the app's architecture and file map, the hub API, the design language and the gotchas. [`CLAUDE.md`](CLAUDE.md) holds the owner's product decisions, and [`app/AGENTS.md`](app/AGENTS.md) has the Expo-specific rules.

## Firmware

Arduino IDE sketches for ESP32-C3 Super Mini boards: [`firmware/hub_sketch_wifi_api`](firmware/hub_sketch_wifi_api) and [`firmware/node_sketch_wifi_channel`](firmware/node_sketch_wifi_channel). The `*_baseline_working_*` sketches are earlier untouched versions.

Before flashing the hub, copy `firmware/hub_sketch_wifi_api/secrets.h.example` to `secrets.h` and enter your 2.4 GHz Wi-Fi name and password. `secrets.h` is git-ignored; never commit it. In the Arduino IDE set **Tools → USB CDC On Boot → Enabled** or the Serial Monitor stays empty.

## License

The Expo template's MIT `LICENSE` file is in `app/`. No license has been chosen for the rest of the project yet.
