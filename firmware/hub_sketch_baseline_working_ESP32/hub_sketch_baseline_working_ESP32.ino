#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

typedef struct {
  uint8_t nodeId;
  int raw;
  int percent;
} Reading;

void onReceive(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (len != sizeof(Reading)) {
    Serial.printf("[Hub] Unexpected packet size: %d bytes\n", len);
    return;
  }
  Reading r;
  memcpy(&r, data, sizeof(r));
  Serial.printf("[Hub] Node %d | Raw: %d | Moisture: %d%% | signal: %d dBm\n",
                r.nodeId, r.raw, r.percent, info->rx_ctrl->rssi);
}

void setup() {
  Serial.begin(115200);
  delay(3000);
  WiFi.mode(WIFI_STA);
  delay(100);
  WiFi.setTxPower(WIFI_POWER_8_5dBm);
  esp_wifi_set_promiscuous(true);
  esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);

  Serial.print("[Hub] My MAC: ");
  Serial.println(WiFi.macAddress());

  if (esp_now_init() != ESP_OK) {
    Serial.println("[Hub] ESP-NOW init FAILED");
    return;
  }
  esp_now_register_recv_cb(onReceive);
  Serial.println("[Hub] Ready, listening...");
}

void loop() {}