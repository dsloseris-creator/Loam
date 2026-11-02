# Mock hub: a PRETEND hub and sensors (no hardware needed)

> **This is fake.** Nothing here is real hardware. It is a small Python program that pretends to be
> the plant hub and its sensors, so the phone app can be developed and tested without owning any of
> the electronics. When real hardware is available, the app talks to that instead and this folder is
> not needed.

It copies the real hub's JSON API (see `../DEVELOPER_GUIDE.md`, section 6 and `../firmware/hub_sketch_wifi_api`):
live readings, history charts, calibration mode, changing the measuring interval, "No signal", and a
hub that loses power. Plants dry out on their own, get "watered" now and then, and you can poke them
from the terminal.

Needs only [`uv`](https://docs.astral.sh/uv/) (no packages to install, standard library only).

## Run it

Terminal 1, the pretend hub:
```bash
cd mock-hub
uv run mock_hub.py
```
It prints a banner containing an exact command like the one below (with your computer's IP address filled in).

Terminal 2, the app, pointed at the pretend hub (use the command the banner printed):
```bash
cd app
npm install                     # first time only
EXPO_PUBLIC_HUB_HOST=192.168.1.20:8080 npx expo start --clear
```
Scan the QR code with Expo Go. Phone and computer must be on the same Wi-Fi. You should see two
plants ("Sensor 1", "Sensor 2") with charts that already have a day of history.

To go back to a real hub later, start the app normally (`npx expo start --clear`, without `EXPO_PUBLIC_HUB_HOST`).
Heads-up: the app remembers the sensors it has seen, so pretend sensors the real hub doesn't have will stay on screen as "No signal". Deleting and reinstalling Expo Go clears that.

Options: `uv run mock_hub.py --help` (number of sensors, port, how fast plants dry out, how much fake history).

## What you can do with it

Type these into the mock hub's terminal (`help` lists them):

| Command | Does |
|---|---|
| `status` | Show every pretend sensor |
| `pour [id]` | Water a plant (moisture jumps up) |
| `parch [id]` | Make a plant bone dry, to see the "thirsty" look |
| `checkin [id]` | Make a sensor report right now (like pressing the real sensor's reset button) |
| `air` / `water` | What a sensor in calibration mode is touching |
| `restart` | Hub "loses power": history and sensors vanish until they report again |
| `offline` / `online` | Hub "unplugged" / back: the app should keep showing its saved data |

### Testing calibration (the one slightly fiddly flow)
Real sensors are held in air, then dipped in water. The mock can't see your hands, so you tell it:
1. In the app: a plant's **Calibrate** > Start. The wizard says it's waiting; type `checkin` in the mock terminal to speed it up.
2. Dry step: leave the mock on `air` (the default) and tap **Start dry reading** in the app.
3. Wet step: type `water` in the mock terminal, then tap **Continue to wet** in the app (the app only counts wet readings once they are far from dry).
4. Type `air` again afterwards if you want to repeat.

### Testing interval changes
Change a sensor's interval in the app. It shows as pending until that sensor next reports (`checkin` makes it immediate), exactly like the real thing.

## How it differs from the real hub
- Port **8080** instead of 80, and no `plant-hub.local` name: the app is pointed at your computer's IP instead.
- Plant moisture is a simple made-up curve (default: wet to dry in about 1.5 hours, `--speed 1` for realistic days). Real soil is messier.
- History survives only as long as the program runs (the real hub also loses it on power loss, so that part matches).
- No radio, no ESP-NOW, no battery data, and no weird real-world hiccups (dropped packets, Wi-Fi channel issues).

So: great for building UI and app logic, but always do a final check against real hardware before trusting timing- or radio-related behaviour.
