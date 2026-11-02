"""A pretend plant hub (with pretend sensors) for developing the app WITHOUT any hardware.

It speaks the same JSON API as the real hub (firmware/hub_sketch_wifi_api), including calibration
mode, interval changes and history. Run it with:

    uv run mock_hub.py

Then follow the instructions it prints (they include the exact command to start the app).
Type `help` in this terminal to see the commands that poke the pretend plants and sensors.
Standard library only; no packages to install.
"""
import argparse
import json
import math
import random
import socket
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

# The real node's built-in rough calibration, used for the "percent" field the app ignores
NODE_DRY, NODE_WET = 3310, 1615
FAST_READING_EVERY = 0.5  # seconds between readings in calibration mode (like the real node)
CAL_MAX_SECONDS = 180  # the real node gives up on calibration mode after this long
HISTORY_TOTAL = 2000  # the real hub shares one 2000-point buffer between all sensors


class Sensor:
    """One pretend sensor sitting in one pretend plant."""

    def __init__(self, node_id, dry, wet, moisture, interval, drying_rate):
        self.id = node_id
        self.dry, self.wet = dry, wet  # raw reading in air / in water: differs per real sensor
        self.moisture = moisture  # 0 (bone dry) to 1 (soaked): the plant's true state
        self.interval = interval  # seconds between readings
        self.pending_interval = 0
        self.drying_rate = drying_rate  # relative; 1 = about 4 days from wet to dry at --speed 1
        self.seen = True
        self.raw = self.sample()
        self.last_report = time.time()
        self.next_checkin = time.time() + interval
        self.rssi = random.randint(-62, -44)
        self.cal = 0  # 0 idle, 1 waiting for the sensor, 2 fast readings, 3 stopping
        self.cal_raw = 0
        self.cal_seq = 0
        self.cal_started = 0.0
        self.next_fast = 0.0
        self.last_saved_raw = None
        self.last_saved_at = 0.0

    def sample(self, medium=None):
        """What the sensor would read right now. medium: None = in its plant, 'air' or 'water'."""
        if medium == "air":
            level = 0.0
        elif medium == "water":
            level = 1.0
        else:
            level = self.moisture
        return round(self.dry - level * (self.dry - self.wet) + random.gauss(0, 6))


class Hub:
    def __init__(self, args):
        self.lock = threading.Lock()
        self.args = args
        self.history = deque(maxlen=HISTORY_TOTAL)  # (epoch seconds, node id, raw)
        self.medium = "air"  # what the sensor is in during calibration: 'air' or 'water'
        self.offline = False
        self.sensors = {}
        self.build_sensors()

    def build_sensors(self):
        a = self.args
        specs = [(1, 2656, 1156, 0.75, a.interval, 1.0), (2, 2810, 1262, 0.45, a.interval, 1.6), (3, 2540, 1090, 0.2, a.interval, 0.7)]
        self.sensors = {s[0]: Sensor(*s) for s in specs[: a.sensors]}
        if a.backfill_hours > 0:
            self.backfill(a.backfill_hours)

    def step_moisture(self, s, dt, speed):
        # Plants dry out slowly; a little curve makes it look natural (fast at first, slower when dry)
        k = math.log(4) / (4 * 86400) * s.drying_rate * speed
        s.moisture = max(0.02, s.moisture * math.exp(-k * dt))
        if self.args.autowater and s.moisture < 0.1:
            s.moisture = random.uniform(0.7, 0.9)  # somebody watered the plant

    def backfill(self, hours):
        """Make up some past history, so the charts have something to show straight away."""
        now = time.time()
        step = max(self.args.interval, 300)
        for s in self.sensors.values():
            t = now - hours * 3600
            s.moisture = random.uniform(0.6, 0.9)
            while t < now:
                self.step_moisture(s, step, self.args.speed)
                self.history.append((t, s.id, s.sample()))
                t += step
            s.raw = s.sample()
            s.last_saved_raw, s.last_saved_at = s.raw, now
        self.history = deque(sorted(self.history), maxlen=HISTORY_TOTAL)

    # ----- the pretend sensors' behaviour, called about 4 times a second -----
    def tick(self, dt):
        now = time.time()
        with self.lock:
            for s in self.sensors.values():
                self.step_moisture(s, dt, self.args.speed)
                if s.cal == 2:
                    self.fast_reading(s, now)
                elif now >= s.next_checkin:
                    self.check_in(s, now)

    def check_in(self, s, now):
        """The sensor wakes up, reports, listens for a command from the hub, goes back to sleep."""
        s.seen = True
        s.raw = s.sample()
        s.last_report = now
        s.rssi = max(-90, min(-35, s.rssi + random.randint(-2, 2)))
        # Save to history like the real hub: sparse readings always, fast ones thinned to ~1 a minute
        if s.interval >= 60 or s.last_saved_raw is None or abs(s.raw - s.last_saved_raw) >= 40 or now - s.last_saved_at >= 60:
            self.history.append((now, s.id, s.raw))
            s.last_saved_raw, s.last_saved_at = s.raw, now
        # Commands waiting for this sensor are delivered now
        if s.pending_interval:
            s.interval, s.pending_interval = s.pending_interval, 0
        if s.cal == 1:
            s.cal, s.cal_started, s.next_fast = 2, now, now
        s.next_checkin = now + s.interval

    def fast_reading(self, s, now):
        if now - s.cal_started > CAL_MAX_SECONDS:
            s.cal = 0  # the sensor gave up, like the real one
            s.next_checkin = now + s.interval
            return
        if now >= s.next_fast:
            s.cal_raw = s.sample(self.medium)
            s.cal_seq += 1
            s.next_fast = now + FAST_READING_EVERY

    # ----- what the API returns -----
    def nodes_json(self):
        now = time.time()
        oldest = {}
        for t, node, _ in self.history:
            oldest.setdefault(node, t)
        out = []
        for s in sorted(self.sensors.values(), key=lambda x: x.id):
            if not s.seen:
                continue
            percent = max(0, min(100, round((NODE_DRY - s.raw) * 100 / (NODE_DRY - NODE_WET))))
            out.append({
                "id": s.id, "raw": s.raw, "percent": percent, "rssi": s.rssi,
                "ageSec": int(now - s.last_report), "cal": s.cal, "calRaw": s.cal_raw, "calSeq": s.cal_seq,
                "interval": s.interval, "pendingInterval": s.pending_interval,
                "historySec": int(now - oldest[s.id]) if s.id in oldest else 0,
            })
        return {"nodes": out}

    def history_json(self, node, minutes):
        now = time.time()
        pts = [[int(now - t), raw] for t, n, raw in self.history if n == node and now - t <= minutes * 60]
        return {"points": pts}

    def restart(self):
        """Like unplugging the real hub: history and the list of sensors are forgotten until they report again."""
        with self.lock:
            self.history.clear()
            for s in self.sensors.values():
                s.seen = False
                s.cal, s.pending_interval = 0, 0
                s.last_saved_raw = None
                s.next_checkin = time.time() + random.uniform(2, 8)


def make_handler(hub):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *a):
            pass  # keep the terminal for the commands

        def send(self, code, body):
            data = json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def handle_any(self, method):
            if hub.offline:
                self.connection.close()  # as if the hub were unplugged: no answer at all
                return
            url = urlparse(self.path)
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            node = int(q["node"]) if q.get("node", "").lstrip("-").isdigit() else 0
            with hub.lock:
                s = hub.sensors.get(node)
                if url.path == "/api/nodes" and method == "GET":
                    return self.send(200, hub.nodes_json())
                if url.path == "/api/history" and method == "GET":
                    minutes = int(q.get("minutes", 60) or 60)
                    return self.send(200, hub.history_json(node, minutes))
                if url.path == "/api/calibrate" and method == "POST":
                    if not s or not s.seen:
                        return self.send(404, {"error": "unknown node"})
                    action = q.get("action")
                    if action == "start":
                        s.cal = 1
                    elif action == "stop":
                        s.cal = 0
                        s.next_checkin = time.time() + s.interval
                    else:
                        return self.send(400, {"error": "action must be start or stop"})
                    return self.send(200, {"ok": True})
                if url.path == "/api/interval" and method == "POST":
                    if not s or not s.seen:
                        return self.send(404, {"error": "unknown node"})
                    seconds = int(q.get("seconds", 0) or 0)
                    if seconds != 0 and not 10 <= seconds <= 7 * 24 * 3600:
                        return self.send(400, {"error": "seconds must be 10 to 604800"})
                    s.pending_interval = 0 if seconds == s.interval else seconds
                    return self.send(200, {"ok": True})
            self.send(404, {"error": "not found"})

        def do_GET(self):
            self.handle_any("GET")

        def do_POST(self):
            self.handle_any("POST")

    return Handler


HELP = """Commands (type then Enter):
  status           show every pretend sensor
  air | water      what a sensor in calibration mode is touching. Use `air` for the DRY step and
                   `water` for the WET step of the app's calibration wizard (starts as `air`)
  checkin [id]     make a sensor report right now (like pressing its reset button); applies a waiting
                   calibration or interval request at once
  pour [id]        water that plant: moisture jumps up
  parch [id]       make that plant bone dry (triggers the app's "thirsty" look)
  restart          pretend the hub lost power: it forgets its history and sensors until they report again
  offline | online pretend the hub is unplugged / plugged back in (the app should cope)
  help             this list
  quit             stop (also Ctrl+C)
Without an id, pour/parch/checkin apply to every sensor."""


def lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("10.255.255.255", 1))  # sends nothing; just asks which network interface would be used
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def command_loop(hub):
    print(HELP)
    while True:
        try:
            line = input("mock-hub> ").strip().lower().split()
        except (EOFError, KeyboardInterrupt):
            return
        if not line:
            continue
        cmd, rest = line[0], line[1:]
        targets = [int(rest[0])] if rest and rest[0].isdigit() else None
        with hub.lock:
            chosen = [s for s in hub.sensors.values() if targets is None or s.id in targets]
            if cmd in ("quit", "exit"):
                return
            elif cmd == "help":
                print(HELP)
            elif cmd == "status":
                for s in hub.sensors.values():
                    print(f"  sensor {s.id}: moisture {s.moisture:.0%} (raw {s.raw}), every {s.interval}s, "
                          f"next report in {max(0, s.next_checkin - time.time()):.0f}s, cal state {s.cal}"
                          + (f", pending interval {s.pending_interval}s" if s.pending_interval else ""))
                print(f"  calibration medium: {hub.medium} | saved history points: {len(hub.history)} | offline: {hub.offline}")
            elif cmd in ("air", "water"):
                hub.medium = cmd
                print(f"  sensors in calibration mode now read as if in {cmd}")
            elif cmd == "checkin":
                for s in chosen:
                    s.next_checkin = 0
            elif cmd == "pour":
                for s in chosen:
                    s.moisture = random.uniform(0.8, 0.92)
            elif cmd == "parch":
                for s in chosen:
                    s.moisture = 0.05
            elif cmd == "offline":
                hub.offline = True
                print("  hub is now 'unplugged': the app will get no answers")
            elif cmd == "online":
                hub.offline = False
                print("  hub is back")
            elif cmd == "restart":
                pass
            else:
                print("  unknown command; type help")
                continue
        if cmd == "restart":
            hub.restart()
            print("  hub 'lost power': history cleared; sensors reappear as they report in a few seconds")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--port", type=int, default=8080, help="port to listen on (default 8080; the real hub uses 80)")
    p.add_argument("--sensors", type=int, default=2, choices=[1, 2, 3], help="how many pretend sensors (default 2)")
    p.add_argument("--interval", type=int, default=15, help="seconds between readings (default 15; the app can change it)")
    p.add_argument("--speed", type=float, default=60, help="how much faster than real life the plants dry out (default 60, "
                   "so a plant goes from wet to dry in about 1.5 hours; 1 = realistic)")
    p.add_argument("--backfill-hours", type=float, default=24, help="hours of made-up past history (default 24, 0 = none)")
    p.add_argument("--no-autowater", dest="autowater", action="store_false", help="plants stay dry once dry (default: they get watered)")
    args = p.parse_args()

    hub = Hub(args)
    server = ThreadingHTTPServer(("0.0.0.0", args.port), make_handler(hub))
    threading.Thread(target=server.serve_forever, daemon=True).start()

    def ticker():
        last = time.time()
        while True:
            time.sleep(0.25)
            now = time.time()
            hub.tick(now - last)
            last = now

    threading.Thread(target=ticker, daemon=True).start()

    ip = lan_ip()
    print("=" * 66)
    print("  MOCK HUB RUNNING: this is NOT real hardware. Everything is pretend.")
    print("=" * 66)
    print(f"  Pretending to be the hub, with {args.sensors} sensor(s), on port {args.port}.\n")
    print("  In a SECOND terminal, start the app pointed at this mock:\n")
    print(f"      cd app && EXPO_PUBLIC_HUB_HOST={ip}:{args.port} npx expo start --clear\n")
    print("  (phone and computer must be on the same Wi-Fi). Back to the real hub later by")
    print("  starting the app normally, without EXPO_PUBLIC_HUB_HOST.\n")
    command_loop(hub)
    print("bye")


if __name__ == "__main__":
    main()
