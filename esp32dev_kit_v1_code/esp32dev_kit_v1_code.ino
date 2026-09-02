#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_BME280.h>
#include <BH1750.h>
#include <DHT.h>
#include <esp_sleep.h>

// ============================================================
// CONFIG (from .env.local) — must not overlap other devices
// ============================================================
//
// esp32c5_monitor: DEVICE_ID=1, DEVICE_TYPE="ESP32-C5"
// this board:      DEVICE_ID=3, DEVICE_TYPE="ESP32_DEV_KIT_V1"

const char* ssid = "xxx";
const char* password = "xxx";
const char* SUPABASE_TABLE_URL = "xxx";
const char* SUPABASE_API_KEY = "xxx";

const int DEVICE_ID = 3;
const char* DEVICE_TYPE = "ESP32_DEV_KIT_V1";

#define uS_TO_S_FACTOR 1000000ULL
#define TIME_TO_SLEEP 600  // 10 minutes
#define WIFI_CONNECT_TIMEOUT_MS 20000
#define HTTP_TIMEOUT_MS 10000
#define HTTP_RETRIES 3


// ============================================================
// PIN DEFINITIONS
// ============================================================

// I2C
#define SDA_PIN 21
#define SCL_PIN 22

// Analog sensors
#define UV_PIN 34
#define SOIL_PIN 35

// DHT22
#define DHT_PIN 27
#define DHT_TYPE DHT22

// Water pump motor driver (MX1508) — unused in V1
#define PUMP_IN1 25
#define PUMP_IN2 26


// ============================================================
// SOIL MOISTURE CALIBRATION
// ============================================================
// Dry: 1.605 V = 0%
// Wet: 0.830 V = 100%

#define SOIL_DRY_VOLTAGE 1.605
#define SOIL_WET_VOLTAGE 0.830


// ============================================================
// SENSOR OBJECTS
// ============================================================

Adafruit_BME280 bme;
BH1750 lightMeter;
DHT dht(DHT_PIN, DHT_TYPE);

char authorizationHeader[256];
char apiKeyHeader[256];
char jsonBuffer[768];


// ============================================================
// WIFI / SUPABASE
// ============================================================

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


// ============================================================
// READ UV SENSOR
// ============================================================

float readUVVoltage() {
  const int samples = 10;
  long sum = 0;

  for (int i = 0; i < samples; i++) {
    sum += analogRead(UV_PIN);
    delay(10);
  }

  float raw = sum / (float)samples;
  return (raw / 4095.0) * 3.3;
}


// ============================================================
// READ SOIL SENSOR
// ============================================================

float readSoilVoltage() {
  const int samples = 10;
  long sum = 0;

  for (int i = 0; i < samples; i++) {
    sum += analogRead(SOIL_PIN);
    delay(100);
  }

  float raw = sum / (float)samples;
  return (raw / 4095.0) * 3.3;
}


// ============================================================
// CONVERT SOIL VOLTAGE TO MOISTURE %
// ============================================================

float soilMoisturePercent(float voltage) {
  float percentage =
      (SOIL_DRY_VOLTAGE - voltage) / (SOIL_DRY_VOLTAGE - SOIL_WET_VOLTAGE) * 100.0;
  return constrain(percentage, 0.0, 100.0);
}


// ============================================================
// PUMP CONTROL (unused in V1)
// ============================================================

void pump(int speed) {
  speed = constrain(speed, -255, 255);

  if (speed > 0) {
    analogWrite(PUMP_IN1, speed);
    digitalWrite(PUMP_IN2, LOW);
  } else if (speed < 0) {
    digitalWrite(PUMP_IN1, LOW);
    analogWrite(PUMP_IN2, -speed);
  } else {
    digitalWrite(PUMP_IN1, LOW);
    digitalWrite(PUMP_IN2, LOW);
  }
}


// ============================================================
// READ SENSORS + BUILD JSON
// ============================================================

void readSensorsAndBuildJson() {
  float bmeTemp = bme.readTemperature();
  float bmeHumidity = bme.readHumidity();
  float bmePressure = bme.readPressure() / 100.0F;
  float lux = lightMeter.readLightLevel();
  float dhtTemp = dht.readTemperature();
  float dhtHumidity = dht.readHumidity();
  float uvVoltage = readUVVoltage();
  float soilVoltage = readSoilVoltage();
  float soilPercent = soilMoisturePercent(soilVoltage);

  Serial.println("========== SENSOR DATA ==========");
  Serial.printf("BME Temp: %.2f C\n", bmeTemp);
  Serial.printf("BME Humidity: %.2f %%\n", bmeHumidity);
  Serial.printf("Pressure: %.2f hPa\n", bmePressure);
  Serial.printf("Light: %.1f lux\n", lux);
  Serial.printf("DHT22 Temp: %.2f C\n", dhtTemp);
  Serial.printf("DHT22 Humidity: %.2f %%\n", dhtHumidity);
  Serial.printf("UV Voltage: %.3f V\n", uvVoltage);
  Serial.printf("Soil Voltage: %.3f V\n", soilVoltage);
  Serial.printf("Soil Moisture: %.1f %%\n", soilPercent);
  Serial.println("=================================");

  // NaN-safe for DHT (isnan → print as null-ish 0.00 is fine; keep numeric for DB)
  if (isnan(dhtTemp)) dhtTemp = 0.0f;
  if (isnan(dhtHumidity)) dhtHumidity = 0.0f;

  snprintf(jsonBuffer, sizeof(jsonBuffer),
           "{\"data\": {"
           "\"bme_temperature\": %.2f,"
           "\"bme_humidity\": %.2f,"
           "\"bme_pressure\": %.2f,"
           "\"lux\": %.1f,"
           "\"dht_temperature\": %.2f,"
           "\"dht_humidity\": %.2f,"
           "\"uv_voltage\": %.3f,"
           "\"soil_voltage\": %.3f,"
           "\"soil_moisture\": %.1f,"
           "\"device_id\": %d,"
           "\"device_type\": \"%s\""
           "}}",
           bmeTemp, bmeHumidity, bmePressure, lux, dhtTemp, dhtHumidity,
           uvVoltage, soilVoltage, soilPercent, DEVICE_ID, DEVICE_TYPE);

  Serial.println("JSON:");
  Serial.println(jsonBuffer);
}


// ============================================================
// SETUP
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(50);

  Wire.begin(SDA_PIN, SCL_PIN);

  if (!bme.begin(0x76, &Wire)) {
    Serial.println("BME280 not found! Sleeping anyway.");
    esp_sleep_enable_timer_wakeup((uint64_t)TIME_TO_SLEEP * uS_TO_S_FACTOR);
    esp_deep_sleep_start();
  }

  if (!lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire)) {
    Serial.println("BH1750 not found! Sleeping anyway.");
    esp_sleep_enable_timer_wakeup((uint64_t)TIME_TO_SLEEP * uS_TO_S_FACTOR);
    esp_deep_sleep_start();
  }

  dht.begin();

  analogReadResolution(12);
  analogSetPinAttenuation(UV_PIN, ADC_11db);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);

  pinMode(PUMP_IN1, OUTPUT);
  pinMode(PUMP_IN2, OUTPUT);
  digitalWrite(PUMP_IN1, LOW);
  digitalWrite(PUMP_IN2, LOW);

  Serial.println("All sensors initialized!");

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

  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_OFF);

  Serial.println("Deep sleep " + String(TIME_TO_SLEEP) + "s");
  Serial.flush();
  esp_sleep_enable_timer_wakeup((uint64_t)TIME_TO_SLEEP * uS_TO_S_FACTOR);
  esp_deep_sleep_start();
}


// ============================================================
// LOOP
// ============================================================

void loop() {
  // unused; device deep-sleeps at end of setup()
}
