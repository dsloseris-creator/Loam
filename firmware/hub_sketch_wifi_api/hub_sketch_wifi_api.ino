#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <esp_now.h>
#include "secrets.h"  // WIFI_SSID, WIFI_PASSWORD

// ---- Settings ----
const bool PRINT_INFO = true;             // true = print readings and checks to the Serial Monitor | false = silent
#define HUB_HOSTNAME "plant-hub"   // reachable at http://plant-hub.local
const int MAX_NODES = 16;                 // node IDs 0 to 15
const int HISTORY_SIZE = 2000;            // saved chart points (about 33 hours at 1 per minute)
const uint32_t HISTORY_EVERY_MS = 60000;  // when readings come faster than this, thin the saved history to about one a minute
// ------------------

#define INFO(...) do { if (PRINT_INFO) Serial.printf(__VA_ARGS__); } while (0)

typedef struct {
  uint8_t nodeId;
  int raw;
  int percent;
  uint8_t mode;  // 0 = normal reading, 1 = calibration reading
  uint32_t intervalSec;  // the node's current sleep time
} Reading;  // must match the node's struct

// Commands sent back to a node (must match the node's enum)
enum { CMD_CAL_START = 1, CMD_CAL_STOP = 2, CMD_SET_INTERVAL = 3 };
typedef struct {
  uint8_t cmd;
  uint32_t value;
} Command;

// Where each node is in a calibration started from the app
enum CalState : uint8_t { CAL_IDLE = 0, CAL_PENDING_START = 1, CAL_ACTIVE = 2, CAL_PENDING_STOP = 3 };
const uint32_t CAL_SILENCE_MS = 10000;  // no calibration readings for this long = calibration is over

struct Incoming {
  Reading r;
  int8_t rssi;
  uint8_t mac[6];
};

struct Sample {
  uint32_t ms;
  uint8_t node;
  int16_t raw;
};

struct NodeState {
  bool seen = false;
  Reading last;
  int8_t rssi = 0;
  uint32_t lastMs = 0;
  uint32_t lastSavedMs = 0;
  int lastSavedRaw = 0;
  uint8_t mac[6];
  bool macKnown = false;
  CalState calState = CAL_IDLE;
  int calRaw = 0;        // latest calibration reading (kept apart from the normal reading)
  uint32_t calSeq = 0;   // counts calibration readings, so the app can tell new from repeated
  uint32_t calMs = 0;
  uint32_t interval = 0;         // sleep time the node says it is using (seconds)
  uint32_t pendingInterval = 0;  // new sleep time the app asked for, until the node confirms it
};

NodeState nodes[MAX_NODES];
Sample history[HISTORY_SIZE];
int historyHead = 0;   // next slot to write
int historyCount = 0;

QueueHandle_t incoming;
WebServer server(80);
bool ready = false;
uint32_t lastStatusMs = 0;

// Runs in the Wi-Fi task: just hand the packet to loop() through a queue.
void onReceive(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (len != sizeof(Reading)) return;
  Incoming in;
  memcpy(&in.r, data, sizeof(Reading));
  in.rssi = info->rx_ctrl->rssi;
  memcpy(in.mac, info->src_addr, 6);
  xQueueSend(incoming, &in, 0);
}

// Sends a command to a node. Only works in the short window right after the node reports.
void sendCommand(NodeState &n, uint8_t cmd, uint32_t value = 0) {
  if (!n.macKnown) return;
  if (!esp_now_is_peer_exist(n.mac)) {
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, n.mac, 6);
    peer.channel = 0;  // use the current channel
    peer.encrypt = false;
    esp_now_add_peer(&peer);
  }
  Command c = {cmd, value};
  esp_now_send(n.mac, (uint8_t *)&c, sizeof(c));
  if (cmd == CMD_SET_INTERVAL) {
    INFO("[Hub] Sent new interval %lu s to node\n", (unsigned long)value);
  } else {
    INFO("[Hub] Sent %s to node\n", cmd == CMD_CAL_START ? "CALIBRATION START" : "CALIBRATION STOP");
  }
}

void storeReading(const Incoming &in) {
  if (in.r.nodeId >= MAX_NODES) return;
  NodeState &n = nodes[in.r.nodeId];
  uint32_t now = millis();
  memcpy(n.mac, in.mac, 6);
  n.macKnown = true;

  if (in.r.mode == 1) {
    // Fast calibration reading: keep it out of the normal reading and the history
    n.calRaw = in.r.raw;
    n.calSeq++;
    n.calMs = now;
    if (n.calState == CAL_PENDING_START) n.calState = CAL_ACTIVE;
    INFO("[Hub] Node %d | CALIBRATION raw: %d\n", in.r.nodeId, in.r.raw);
    if (n.calState == CAL_PENDING_STOP) sendCommand(n, CMD_CAL_STOP);
    return;
  }

  bool firstTime = !n.seen;
  n.seen = true;
  n.last = in.r;
  n.rssi = in.rssi;
  n.lastMs = now;
  n.interval = in.r.intervalSec;
  if (n.pendingInterval && n.interval == n.pendingInterval) {
    INFO("[Hub] Node %d confirmed its new interval: %lu s\n", in.r.nodeId, (unsigned long)n.interval);
    n.pendingInterval = 0;
  }
  INFO("[Hub] Node %d | Raw: %d | Moisture: %d%% | signal: %d dBm\n",
       in.r.nodeId, in.r.raw, in.r.percent, in.rssi);

  // Keep every reading unless they're coming faster than once a minute. Even then, a sudden change is
  // always kept, so the chart shows it right away.
  bool sparse = (uint32_t)in.r.intervalSec * 1000UL >= HISTORY_EVERY_MS;
  bool bigChange = abs(in.r.raw - n.lastSavedRaw) >= 40;
  if (firstTime || sparse || bigChange || now - n.lastSavedMs >= HISTORY_EVERY_MS) {
    n.lastSavedMs = now;
    n.lastSavedRaw = in.r.raw;
    history[historyHead] = {now, in.r.nodeId, (int16_t)in.r.raw};
    historyHead = (historyHead + 1) % HISTORY_SIZE;
    if (historyCount < HISTORY_SIZE) historyCount++;
  }

  // A normal reading arriving means the node isn't calibrating (any earlier session ended)
  if (n.calState == CAL_ACTIVE || n.calState == CAL_PENDING_STOP) n.calState = CAL_IDLE;
  if (n.calState == CAL_PENDING_START) {
    sendCommand(n, CMD_CAL_START);
  } else if (n.pendingInterval) {
    sendCommand(n, CMD_SET_INTERVAL, n.pendingInterval);
  }
}

void handleNodes() {
  uint32_t now = millis();
  // How far back each node's saved history reaches (the oldest saved point)
  uint32_t oldestMs[MAX_NODES];
  bool hasHistory[MAX_NODES] = {};
  for (int i = 0; i < historyCount; i++) {
    const Sample &smp = history[(historyHead - historyCount + i + HISTORY_SIZE) % HISTORY_SIZE];
    if (smp.node < MAX_NODES && !hasHistory[smp.node]) {
      hasHistory[smp.node] = true;
      oldestMs[smp.node] = smp.ms;
    }
  }
  String out = "{\"nodes\":[";
  bool first = true;
  for (int i = 0; i < MAX_NODES; i++) {
    if (!nodes[i].seen) continue;
    if (!first) out += ",";
    first = false;
    out += "{\"id\":" + String(i) + ",\"raw\":" + nodes[i].last.raw +
           ",\"percent\":" + nodes[i].last.percent + ",\"rssi\":" + nodes[i].rssi +
           ",\"ageSec\":" + String((now - nodes[i].lastMs) / 1000) +
           ",\"cal\":" + String((int)nodes[i].calState) + ",\"calRaw\":" + nodes[i].calRaw +
           ",\"calSeq\":" + String(nodes[i].calSeq) +
           ",\"interval\":" + String(nodes[i].interval) +
           ",\"pendingInterval\":" + String(nodes[i].pendingInterval) +
           ",\"historySec\":" + String(hasHistory[i] ? (now - oldestMs[i]) / 1000 : 0) + "}";
  }
  out += "]}";
  server.send(200, "application/json", out);
}

// /api/history?node=1&minutes=60 -> {"points":[[ageSec,raw],...]} oldest first.
// Raw sensor values only: the app turns them into moisture percent using its calibration.
void handleHistory() {
  int node = server.arg("node").toInt();
  uint32_t minutes = server.hasArg("minutes") ? server.arg("minutes").toInt() : 60;
  uint32_t now = millis();
  String out = "{\"points\":[";
  out.reserve(2048);
  bool first = true;
  for (int i = 0; i < historyCount; i++) {
    const Sample &s = history[(historyHead - historyCount + i + HISTORY_SIZE) % HISTORY_SIZE];
    if (s.node != node) continue;
    uint32_t ageSec = (now - s.ms) / 1000;
    if (ageSec > minutes * 60) continue;
    if (!first) out += ",";
    first = false;
    out += "[" + String(ageSec) + "," + String(s.raw) + "]";
  }
  out += "]}";
  server.send(200, "application/json", out);
}

// POST /api/calibrate?node=1&action=start|stop
// start: the node switches to fast readings at its next check-in. stop: it returns to normal.
void handleCalibrate() {
  int id = server.arg("node").toInt();
  String action = server.arg("action");
  if (id < 0 || id >= MAX_NODES || !nodes[id].seen) {
    server.send(404, "application/json", "{\"error\":\"unknown node\"}");
    return;
  }
  NodeState &n = nodes[id];
  if (action == "start") {
    n.calState = CAL_PENDING_START;
  } else if (action == "stop") {
    n.calState = (n.calState == CAL_ACTIVE) ? CAL_PENDING_STOP : CAL_IDLE;
  } else {
    server.send(400, "application/json", "{\"error\":\"action must be start or stop\"}");
    return;
  }
  INFO("[Hub] App asked to %s calibration for node %d\n", action.c_str(), id);
  server.send(200, "application/json", "{\"ok\":true}");
}

// POST /api/interval?node=1&seconds=1800   (seconds=0 cancels a change that hasn't been delivered)
// The node gets the new value the next time it checks in (right away if you press its reset button).
void handleInterval() {
  int id = server.arg("node").toInt();
  long seconds = server.arg("seconds").toInt();
  if (id < 0 || id >= MAX_NODES || !nodes[id].seen) {
    server.send(404, "application/json", "{\"error\":\"unknown node\"}");
    return;
  }
  if (seconds != 0 && (seconds < 10 || seconds > 7L * 24 * 3600)) {
    server.send(400, "application/json", "{\"error\":\"seconds must be 10 to 604800\"}");
    return;
  }
  nodes[id].pendingInterval = (seconds == (long)nodes[id].interval) ? 0 : (uint32_t)seconds;
  INFO("[Hub] App asked node %d to measure every %ld s\n", id, seconds);
  server.send(200, "application/json", "{\"ok\":true}");
}

void printStatus() {
  int seen = 0;
  for (int i = 0; i < MAX_NODES; i++) seen += nodes[i].seen;
  INFO("[Hub] Status: Wi-Fi %s | %d node(s) heard | %d saved chart points\n",
       WiFi.status() == WL_CONNECTED ? "OK" : "DISCONNECTED", seen, historyCount);
}

void setup() {
  if (PRINT_INFO) {
    Serial.begin(115200);
    delay(3000);  // time to open the Serial Monitor
  }

  incoming = xQueueCreate(16, sizeof(Incoming));

  WiFi.mode(WIFI_STA);
  WiFi.setHostname(HUB_HOSTNAME);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  INFO("[Hub] Connecting to Wi-Fi");
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    INFO(".");
  }
  INFO("\n");
  bool wifiOk = WiFi.status() == WL_CONNECTED;
  if (!wifiOk) {
    INFO("[Hub] Check FAILED: Wi-Fi (check secrets.h, 2.4 GHz networks only)\n");
    return;
  }
  WiFi.setSleep(false);  // keep the radio awake so no node packets are missed

  INFO("[Hub] My MAC: %s\n", WiFi.macAddress().c_str());
  INFO("[Hub] IP address: %s\n", WiFi.localIP().toString().c_str());
  INFO("[Hub] Router Wi-Fi channel: %d  <-- set WIFI_CHANNEL to this in the node sketch\n",
       WiFi.channel());

  bool mdnsOk = MDNS.begin(HUB_HOSTNAME);
  bool espNowOk = esp_now_init() == ESP_OK;
  if (espNowOk) esp_now_register_recv_cb(onReceive);

  server.on("/api/nodes", handleNodes);
  server.on("/api/history", handleHistory);
  server.on("/api/calibrate", HTTP_POST, handleCalibrate);
  server.on("/api/interval", HTTP_POST, handleInterval);
  server.begin();

  INFO("[Hub] Checks: Wi-Fi OK | ESP-NOW %s | name %s%s | web server OK\n",
       espNowOk ? "OK" : "FAILED", mdnsOk ? "http://" HUB_HOSTNAME ".local " : "unavailable", mdnsOk ? "OK" : "(use the IP)");
  ready = espNowOk;
  if (ready) INFO("[Hub] Ready, listening...\n");
}

void loop() {
  Incoming in;
  while (xQueueReceive(incoming, &in, 0) == pdTRUE) storeReading(in);
  if (!ready) return;
  server.handleClient();
  // If a node stops sending calibration readings (finished, timed out or out of range), reset
  for (int i = 0; i < MAX_NODES; i++) {
    if ((nodes[i].calState == CAL_ACTIVE || nodes[i].calState == CAL_PENDING_STOP) &&
        millis() - nodes[i].calMs > CAL_SILENCE_MS) {
      nodes[i].calState = CAL_IDLE;
    }
  }
  if (PRINT_INFO && millis() - lastStatusMs > 30000) {
    lastStatusMs = millis();
    printStatus();
  }
}
