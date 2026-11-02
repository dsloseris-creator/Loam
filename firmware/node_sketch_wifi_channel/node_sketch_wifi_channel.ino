#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <esp_sleep.h>
#include <driver/gpio.h>
#include <Preferences.h>

// ---- Settings ----
const bool PRINT_INFO = true;         // true = print readings and checks to the Serial Monitor | false = silent
const bool DEBUG_MODE = false;        // true = stay awake | false = deep sleep
const bool BATTERY_TEST = false;      // true = no testing delays/blinks, 60 s sleep
const uint8_t NODE_ID = 1;
const int WIFI_CHANNEL = 1;           // must match your router's channel (the hub prints it at startup)
int DRY_VALUE = 3310;
int WET_VALUE = 1615;
const uint32_t DEFAULT_SLEEP_SECONDS = 60;  // used until the app sets an interval (the app's choice is saved in flash)

// Calibration mode (started from the app): fast readings so a dry/wet capture takes seconds
const int LISTEN_MS = 300;            // after each report, listen this long for a command from the hub
const int CAL_SAMPLES = 10;           // each fast reading averages this many samples (5 ms apart)
const int CAL_SAMPLE_MS = 500;        // pause between fast readings
const int CAL_MAX_SECONDS = 180;      // gives up and goes back to normal after this long

// LED settings (these are the ones the app will control later)
const bool LED_ENABLED = true;        // false = LED never lights, saves battery
const bool LED_IS_RGB = true;         // false = plain LED on pin 5 | true = RGB on pins 5, 6, 7
const bool LED_COMMON_ANODE = false;  // true if the shared leg goes to 3V3
const int LED_DRY_THRESHOLD = 30;     // LED lights only below this moisture percent
const int LED_BRIGHTNESS = 100;       // 0-100 percent (RGB mode only)
const int LED_ON_MS = 3000;           // how long it stays lit each wake
const uint8_t COLOR_VERY_DRY[3]     = {255, 0, 0};     // red at 0% moisture
const uint8_t COLOR_AT_THRESHOLD[3] = {255, 140, 0};   // orange just below the threshold
// ------------------

#define INFO(...) do { if (PRINT_INFO) Serial.printf(__VA_ARGS__); } while (0)

const int SENSOR_PIN = 3;
const int SENSOR_POWER_PIN = 4;
const int LED_PINS[3] = {5, 6, 7};    // red, green, blue
const int ONBOARD_LED = 8;
RTC_DATA_ATTR int wakeCount = 0;

uint8_t hubAddress[] = {0x68, 0x9D, 0xD2, 0x79, 0x89, 0x4C};

typedef struct {
  uint8_t nodeId;
  int raw;
  int percent;
  uint8_t mode;  // 0 = normal reading, 1 = calibration reading (the hub doesn't save these in history)
  uint32_t intervalSec;  // how long this node sleeps between readings, so the app can show and confirm it
} Reading;

// Commands the hub can send back to the node
enum { CMD_CAL_START = 1, CMD_CAL_STOP = 2, CMD_SET_INTERVAL = 3 };
typedef struct {
  uint8_t cmd;
  uint32_t value;  // CMD_SET_INTERVAL: the new sleep time in seconds
} Command;

const uint32_t MIN_SLEEP_SECONDS = 10;
const uint32_t MAX_SLEEP_SECONDS = 7UL * 24 * 3600;  // one week
uint32_t sleepSeconds = DEFAULT_SLEEP_SECONDS;

volatile bool sendDone = false;
volatile bool sendOk = false;
volatile uint8_t pendingCmd = 0;
volatile uint32_t pendingValue = 0;
int lastPercent = 0;

void onReceive(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (len != sizeof(Command)) return;
  Command c;
  memcpy(&c, data, sizeof(c));
  pendingValue = c.value;
  pendingCmd = c.cmd;
}

// The interval lives in flash, so it survives resets and battery changes.
void loadInterval() {
  Preferences prefs;
  prefs.begin("plant", true);
  uint32_t saved = prefs.getUInt("interval", DEFAULT_SLEEP_SECONDS);
  prefs.end();
  sleepSeconds = (saved >= MIN_SLEEP_SECONDS && saved <= MAX_SLEEP_SECONDS) ? saved : DEFAULT_SLEEP_SECONDS;
}

void saveInterval(uint32_t seconds) {
  Preferences prefs;
  prefs.begin("plant", false);
  prefs.putUInt("interval", seconds);
  prefs.end();
  sleepSeconds = seconds;
}

void onSent(const wifi_tx_info_t *info, esp_now_send_status_t status) {
  sendOk = (status == ESP_NOW_SEND_SUCCESS);
  sendDone = true;
}

void setChannel(int i, int value) {
  analogWrite(LED_PINS[i], LED_COMMON_ANODE ? 255 - value : value);
}

void showLed(int percent) {
  if (!LED_IS_RGB) {
    // Plain on/off LED on pin 5
    gpio_hold_dis((gpio_num_t)LED_PINS[0]);
    pinMode(LED_PINS[0], OUTPUT);
    digitalWrite(LED_PINS[0], HIGH);
    return;
  }
  // 0% = very dry color, at the threshold = the threshold color
  float t = constrain(percent / (float)LED_DRY_THRESHOLD, 0.0, 1.0);
  for (int i = 0; i < 3; i++) {
    gpio_hold_dis((gpio_num_t)LED_PINS[i]);
    float v = COLOR_VERY_DRY[i] + (COLOR_AT_THRESHOLD[i] - COLOR_VERY_DRY[i]) * t;
    v = v * LED_BRIGHTNESS / 100.0;
    setChannel(i, (int)v);
  }
}

void ledOff() {
  for (int i = 0; i < 3; i++) {
    setChannel(i, 0);
    pinMode(LED_PINS[i], OUTPUT);
    digitalWrite(LED_PINS[i], LED_IS_RGB && LED_COMMON_ANODE ? HIGH : LOW);
  }
}

void showLedIfDry() {
  if (!LED_ENABLED) return;
  if (lastPercent < LED_DRY_THRESHOLD) {
    INFO("[Node %d] Plant is dry (%d%% < %d%%): LED on\n",
                  NODE_ID, lastPercent, LED_DRY_THRESHOLD);
    showLed(lastPercent);
    delay(LED_ON_MS);
    ledOff();
  } else {
    INFO("[Node %d] Moisture OK (%d%%): LED stays off\n", NODE_ID, lastPercent);
  }
}

// Steady blue while calibrating, so you can see the node is in calibration mode
void showCalLed() {
  if (!LED_ENABLED) return;
  if (!LED_IS_RGB) {
    gpio_hold_dis((gpio_num_t)LED_PINS[0]);
    pinMode(LED_PINS[0], OUTPUT);
    digitalWrite(LED_PINS[0], HIGH);
    return;
  }
  for (int i = 0; i < 3; i++) {
    gpio_hold_dis((gpio_num_t)LED_PINS[i]);
    setChannel(i, i == 2 ? 80 : 0);
  }
}

bool sendPacket(int raw, int percent, uint8_t mode) {
  sendDone = false;
  sendOk = false;
  Reading r = {NODE_ID, raw, percent, mode, sleepSeconds};
  esp_now_send(hubAddress, (uint8_t *)&r, sizeof(r));
  unsigned long start = millis();
  while (!sendDone && millis() - start < 500) delay(5);
  return sendOk;
}

// Fast readings until the app says stop (or the time limit), then back to normal.
void runCalibration() {
  INFO("[Node %d] CALIBRATION MODE: fast readings until the app finishes (max %d s)\n",
       NODE_ID, CAL_MAX_SECONDS);
  showCalLed();

  gpio_hold_dis((gpio_num_t)SENSOR_POWER_PIN);
  pinMode(SENSOR_POWER_PIN, OUTPUT);
  digitalWrite(SENSOR_POWER_PIN, HIGH);
  delay(200);

  pendingCmd = 0;
  unsigned long start = millis();
  while (pendingCmd != CMD_CAL_STOP && millis() - start < CAL_MAX_SECONDS * 1000UL) {
    long total = 0;
    for (int i = 0; i < CAL_SAMPLES; i++) {
      total += analogRead(SENSOR_PIN);
      delay(5);
    }
    int raw = total / CAL_SAMPLES;
    int percent = constrain(map(raw, DRY_VALUE, WET_VALUE, 0, 100), 0, 100);
    bool delivered = sendPacket(raw, percent, 1);
    INFO("[Node %d] Calibration reading: %d (%s)\n", NODE_ID, raw, delivered ? "sent" : "NOT delivered");
    delay(CAL_SAMPLE_MS);
  }

  digitalWrite(SENSOR_POWER_PIN, LOW);
  ledOff();
  INFO("[Node %d] Calibration mode finished (%s)\n", NODE_ID,
       pendingCmd == CMD_CAL_STOP ? "stopped by the app" : "timed out");
  pendingCmd = 0;
}

void sendReading() {
  gpio_hold_dis((gpio_num_t)SENSOR_POWER_PIN);
  pinMode(SENSOR_POWER_PIN, OUTPUT);

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  digitalWrite(SENSOR_POWER_PIN, HIGH);
  delay(200);
  long total = 0;
  for (int i = 0; i < 10; i++) {
    total += analogRead(SENSOR_PIN);
    delay(10);
  }
  digitalWrite(SENSOR_POWER_PIN, LOW);

  int raw = total / 10;
  int percent = constrain(map(raw, DRY_VALUE, WET_VALUE, 0, 100), 0, 100);
  lastPercent = percent;
  INFO("[Node %d] Raw: %d | Moisture: %d%%\n", NODE_ID, raw, percent);
  // A disconnected sensor reads near 0 or near the 4095 maximum
  bool sensorOk = raw > 100 && raw < 4000;
  INFO("[Node %d] Sensor check: %s\n", NODE_ID,
       sensorOk ? "OK" : "PROBLEM (reading out of range: check the sensor wiring)");

  WiFi.mode(WIFI_STA);
  delay(100);
  WiFi.setTxPower(WIFI_POWER_8_5dBm);
  esp_wifi_set_promiscuous(true);
  esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);

  if (esp_now_init() != ESP_OK) {
    INFO("[Node %d] Radio check FAILED: ESP-NOW init\n", NODE_ID);
    return;
  }
  esp_now_register_send_cb(onSent);
  esp_now_register_recv_cb(onReceive);

  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, hubAddress, 6);
  peer.channel = WIFI_CHANNEL;
  peer.encrypt = false;
  esp_now_add_peer(&peer);

  pendingCmd = 0;
  bool delivered = sendPacket(raw, percent, 0);
  INFO("[Node %d] Delivery to hub: %s\n", NODE_ID,
       delivered ? "SUCCESS" : "FAILED (is the hub on? does WIFI_CHANNEL match its channel?)");
  INFO("[Node %d] Summary: sensor %s | radio OK | hub %s\n", NODE_ID,
       sensorOk ? "OK" : "PROBLEM", delivered ? "OK" : "NOT REACHED");

  // Brief listening window: the hub answers here if the app asked for calibration mode
  if (delivered) {
    unsigned long start = millis();
    while (!pendingCmd && millis() - start < LISTEN_MS) delay(5);
    if (pendingCmd == CMD_CAL_START) {
      runCalibration();
    } else if (pendingCmd == CMD_SET_INTERVAL) {
      uint32_t seconds = pendingValue;
      if (seconds >= MIN_SLEEP_SECONDS && seconds <= MAX_SLEEP_SECONDS) {
        saveInterval(seconds);
        INFO("[Node %d] New interval from the app: %lu s (saved)\n", NODE_ID, (unsigned long)seconds);
        // Report again right away so the hub can confirm the new interval
        sendPacket(raw, percent, 0);
      } else {
        INFO("[Node %d] Ignored interval %lu s (allowed %lu to %lu)\n", NODE_ID, (unsigned long)seconds,
             (unsigned long)MIN_SLEEP_SECONDS, (unsigned long)MAX_SLEEP_SECONDS);
      }
    }
  }

  esp_now_deinit();
}

void setup() {
  if (PRINT_INFO) Serial.begin(115200);
  loadInterval();

  pinMode(ONBOARD_LED, OUTPUT);
  digitalWrite(ONBOARD_LED, HIGH);  // onboard LED off
  for (int i = 0; i < 3; i++) gpio_hold_dis((gpio_num_t)LED_PINS[i]);
  ledOff();

  if (DEBUG_MODE) {
    delay(3000);  // time to open the Serial Monitor
    return;       // loop() handles it in debug mode
  }

  wakeCount++;

  if (!BATTERY_TEST) {
    // Testing aids: three blinks and a pause so the USB port can reappear
    for (int i = 0; i < 3; i++) {
      digitalWrite(ONBOARD_LED, LOW);
      delay(100);
      digitalWrite(ONBOARD_LED, HIGH);
      delay(100);
    }
    delay(2000);
  }

  INFO("[Node %d] WOKE UP (wake #%d)\n", NODE_ID, wakeCount);

  sendReading();
  showLedIfDry();

  INFO("[Node %d] Sleeping %lu s\n", NODE_ID, (unsigned long)sleepSeconds);
  if (PRINT_INFO) Serial.flush();

  for (int i = 0; i < 3; i++) gpio_hold_en((gpio_num_t)LED_PINS[i]);
  gpio_hold_en((gpio_num_t)SENSOR_POWER_PIN);
  gpio_deep_sleep_hold_en();
  esp_sleep_enable_timer_wakeup(sleepSeconds * 1000000ULL);
  esp_deep_sleep_start();
}

void loop() {
  // Only reached in debug mode
  sendReading();
  showLedIfDry();
  delay(sleepSeconds * 1000UL);
}