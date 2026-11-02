#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <esp_sleep.h>
#include <driver/gpio.h>

// ---- Settings ----
const bool DEBUG_MODE = false;        // true = stay awake | false = deep sleep
const bool BATTERY_TEST = false;      // true = no testing delays/blinks, 60 s sleep
const uint8_t NODE_ID = 1;
int DRY_VALUE = 3310;
int WET_VALUE = 1615;
const uint64_t SLEEP_SECONDS = BATTERY_TEST ? 60 : 10;

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
} Reading;

volatile bool sendDone = false;
volatile bool sendOk = false;
int lastPercent = 0;

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
    Serial.printf("[Node %d] Plant is dry (%d%% < %d%%): LED on\n",
                  NODE_ID, lastPercent, LED_DRY_THRESHOLD);
    showLed(lastPercent);
    delay(LED_ON_MS);
    ledOff();
  } else {
    Serial.printf("[Node %d] Moisture OK (%d%%): LED stays off\n", NODE_ID, lastPercent);
  }
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
  Serial.printf("[Node %d] Raw: %d | Moisture: %d%%\n", NODE_ID, raw, percent);

  WiFi.mode(WIFI_STA);
  delay(100);
  WiFi.setTxPower(WIFI_POWER_8_5dBm);
  esp_wifi_set_promiscuous(true);
  esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);

  if (esp_now_init() != ESP_OK) {
    Serial.println("[Node] ESP-NOW init FAILED");
    return;
  }
  esp_now_register_send_cb(onSent);

  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, hubAddress, 6);
  peer.channel = 1;
  peer.encrypt = false;
  esp_now_add_peer(&peer);

  sendDone = false;
  Reading r = {NODE_ID, raw, percent};
  esp_now_send(hubAddress, (uint8_t *)&r, sizeof(r));

  unsigned long start = millis();
  while (!sendDone && millis() - start < 500) delay(5);
  Serial.printf("[Node %d] Delivery: %s\n", NODE_ID, sendOk ? "SUCCESS" : "FAILED");

  esp_now_deinit();
}

void setup() {
  Serial.begin(115200);

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

  Serial.printf("[Node %d] WOKE UP (wake #%d)\n", NODE_ID, wakeCount);

  sendReading();
  showLedIfDry();

  Serial.printf("[Node %d] Sleeping %d s\n", NODE_ID, (int)SLEEP_SECONDS);
  Serial.flush();

  for (int i = 0; i < 3; i++) gpio_hold_en((gpio_num_t)LED_PINS[i]);
  gpio_hold_en((gpio_num_t)SENSOR_POWER_PIN);
  gpio_deep_sleep_hold_en();
  esp_sleep_enable_timer_wakeup(SLEEP_SECONDS * 1000000ULL);
  esp_deep_sleep_start();
}

void loop() {
  // Only reached in debug mode
  sendReading();
  showLedIfDry();
  delay(SLEEP_SECONDS * 1000);
}