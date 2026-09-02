#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BMP280.h>
#include "DHT.h"
#include <esp_sleep.h>

// ---------- CONFIG (from .env.local) ----------
const char* ssid = "xxx";
const char* password = "xxx";
const char* SUPABASE_TABLE_URL = "xxx";
const char* SUPABASE_API_KEY = "xxx";
const int DEVICE_ID = 1;
const char* DEVICE_TYPE = "ESP32-C5";

// XIAO ESP32-C5 pins (D2–D5, BAT_VOLT_* from variants/XIAO_ESP32C5/pins_arduino.h)
#define I2C_SDA D4
#define I2C_SCL D5
#define DHTPIN11 D2
#define DHTPIN22 D3
#define DHTTYPE11 DHT11
#define DHTTYPE22 DHT22

#define SEALEVELPRESSURE_HPA (1013.25)
#define uS_TO_S_FACTOR 1000000ULL
#define TIME_TO_SLEEP 900            // 15 minutes
#define WIFI_CONNECT_TIMEOUT_MS 20000
#define HTTP_TIMEOUT_MS 10000
#define HTTP_RETRIES 3

DHT dht11(DHTPIN11, DHTTYPE11);
DHT dht22(DHTPIN22, DHTTYPE22);
Adafruit_BMP280 bmp;

char authorizationHeader[256];
char apiKeyHeader[256];
char jsonBuffer[512];

RTC_DATA_ATTR int bootCount = 0;

void print_wakeup_reason() {
  esp_sleep_wakeup_cause_t reason = esp_sleep_get_wakeup_cause();
  switch (reason) {
    case ESP_SLEEP_WAKEUP_TIMER:
      Serial.println("Wakeup: timer");
      break;
    default:
      Serial.printf("Wakeup: power-on / reset (%d)\n", reason);
      break;
  }
}

bool connectToWiFi() {
  Serial.print("WiFi connecting");
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > WIFI_CONNECT_TIMEOUT_MS) {
      Serial.println(" timeout");
      return false;
    }
    delay(250);
    Serial.print(".");
  }
  Serial.println("\nWiFi OK: " + WiFi.localIP().toString());
  return true;
}

void initHeaders() {
  snprintf(authorizationHeader, sizeof(authorizationHeader), "Bearer %s", SUPABASE_API_KEY);
  snprintf(apiKeyHeader, sizeof(apiKeyHeader), "%s", SUPABASE_API_KEY);
}

// Seeed wiki: enable BAT_VOLT_PIN_EN, 16x analogReadMilliVolts, 2:1 divider
float readBatteryVoltage() {
  pinMode(BAT_VOLT_PIN, INPUT);
  pinMode(BAT_VOLT_PIN_EN, OUTPUT);
  digitalWrite(BAT_VOLT_PIN_EN, HIGH);
  delay(2);

  uint32_t vbatt = 0;
  for (int i = 0; i < 16; i++) {
    vbatt += analogReadMilliVolts(BAT_VOLT_PIN);
  }

  digitalWrite(BAT_VOLT_PIN_EN, LOW);
  return 2.0f * vbatt / 16.0f / 1000.0f;
}

void readSensorsAndBuildJson() {
  float humidity11 = dht11.readHumidity();
  float temperature11 = dht11.readTemperature();
  float humidity22 = dht22.readHumidity();
  float temperature22 = dht22.readTemperature();

  // BMP280 is in FORCED mode (configured in setup): each read triggers a
  // single measurement then auto-returns to sleep.
  float bmpTemp = bmp.readTemperature();
  float bmpPres = bmp.readPressure() / 100.0F;
  float bmpAlt = bmp.readAltitude(SEALEVELPRESSURE_HPA);

  float batteryVoltage = readBatteryVoltage();

  snprintf(jsonBuffer, sizeof(jsonBuffer),
           "{\"data\": {"
           "\"temperature11\": %.2f,"
           "\"humidity11\": %.2f,"
           "\"temperature22\": %.2f,"
           "\"humidity22\": %.2f,"
           "\"bmp_temperature\": %.2f,"
           "\"bmp_pressure\": %.2f,"
           "\"bmp_altitude\": %.2f,"
           "\"battery_voltage\": %.2f,"
           "\"device_id\": %d,"
           "\"device_type\": \"%s\""
           "}}",
           temperature11, humidity11, temperature22, humidity22, bmpTemp,
           bmpPres, bmpAlt, batteryVoltage, DEVICE_ID, DEVICE_TYPE);

  Serial.println("JSON:");
  Serial.println(jsonBuffer);
}

bool postJson() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected");
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setConnectTimeout(HTTP_TIMEOUT_MS);

  if (!http.begin(client, SUPABASE_TABLE_URL)) {
    Serial.println("http.begin failed");
    return false;
  }
  http.addHeader("apikey", apiKeyHeader);
  http.addHeader("Authorization", authorizationHeader);
  http.addHeader("Content-Type", "application/json");

  int code = http.POST(jsonBuffer);
  Serial.printf("HTTP %d\n", code);
  if (code <= 0) {
    Serial.println("POST error: " + http.errorToString(code));
  }
  http.end();
  return code > 0 && code < 300;
}

void prepareForDeepSleep() {
  // LED off (active-LOW on XIAO ESP32-C5; HIGH = off)
  digitalWrite(LED_BUILTIN, HIGH);

  // Put BMP280 in deep sleep over I2C, then release the bus
  bmp.setSampling(Adafruit_BMP280::MODE_SLEEP,
                  Adafruit_BMP280::SAMPLING_NONE,
                  Adafruit_BMP280::SAMPLING_NONE,
                  Adafruit_BMP280::FILTER_OFF);
  Wire.end();

  // Float external lines so internal pulls / leakage are minimized
  pinMode(I2C_SDA, INPUT);
  pinMode(I2C_SCL, INPUT);
  pinMode(DHTPIN11, INPUT);
  pinMode(DHTPIN22, INPUT);

  // Battery sense rail off (TPS22916 load switch)
  pinMode(BAT_VOLT_PIN, INPUT);
  pinMode(BAT_VOLT_PIN_EN, OUTPUT);
  digitalWrite(BAT_VOLT_PIN_EN, LOW);

  // Wireless fully off
  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_OFF);

  Serial.flush();

  // 15 min sleep >> flash power-down time, so cut VDDSDIO too
  esp_sleep_pd_config(ESP_PD_DOMAIN_VDDSDIO, ESP_PD_OPTION_OFF);

  esp_sleep_enable_timer_wakeup((uint64_t)TIME_TO_SLEEP * uS_TO_S_FACTOR);
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH);  // off

  Serial.begin(115200);
  delay(50);

  ++bootCount;
  Serial.printf("Boot #%d\n", bootCount);
  print_wakeup_reason();

  Wire.begin(I2C_SDA, I2C_SCL);

  if (!bmp.begin(0x76) && !bmp.begin(0x77)) {
    Serial.println("BMP280 not found, sleeping anyway.");
    prepareForDeepSleep();
    esp_deep_sleep_start();
  }

  // FORCED mode = one-shot measurement on demand, then auto-sleep.
  // Lowest BMP280 current between reads (~0.1 µA typ.).
  bmp.setSampling(Adafruit_BMP280::MODE_FORCED,
                  Adafruit_BMP280::SAMPLING_X1,    // temp oversampling
                  Adafruit_BMP280::SAMPLING_X4,    // pressure oversampling
                  Adafruit_BMP280::FILTER_X4,
                  Adafruit_BMP280::STANDBY_MS_1);

  dht11.begin();
  dht22.begin();

  initHeaders();

  if (connectToWiFi()) {
    readSensorsAndBuildJson();

    bool sent = false;
    for (int i = 0; i < HTTP_RETRIES && !sent; i++) {
      sent = postJson();
      if (!sent && i + 1 < HTTP_RETRIES) {
        delay(500);
      }
    }
    Serial.println(sent ? "Sent OK" : "Send failed");
  } else {
    Serial.println("Skipping send (no WiFi)");
  }

  prepareForDeepSleep();
  Serial.println("Deep sleep " + String(TIME_TO_SLEEP) + "s");
  esp_deep_sleep_start();
}

void loop() {
  // unused; device deep-sleeps at end of setup()
}
