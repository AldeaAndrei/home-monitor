#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_BME280.h>
#include <BH1750.h>
#include <DHT.h>
#include <esp_sleep.h>
#include <driver/gpio.h>
#include <ArduinoJson.h>  // 7.x
#include <time.h>

// ============================================================
// CONFIG (from .env.local) — must not overlap other devices
// ============================================================
//
// esp32c5_monitor: DEVICE_ID=1, DEVICE_TYPE="ESP32-C5"
// this board:      DEVICE_ID=3, DEVICE_TYPE="ESP32_DEV_KIT_V1"

const char* ssid = "xxx";
const char* password = "xxx";
const char* SUPABASE_TABLE_URL = "xxx";
// Base table — PATCH used=true by id
const char* SUPABASE_ACTIONS_URL = "xxx";
// View: unused + created_at >= now() - 1 hour (server-side)
// .../rest/v1/sensor_actions_pending
const char* SUPABASE_ACTIONS_PENDING_URL = "xxx";
const char* SUPABASE_API_KEY = "xxx";

const int DEVICE_ID = 3;
const char* DEVICE_TYPE = "ESP32_DEV_KIT_V1";

#define uS_TO_S_FACTOR 1000000ULL
#define TIME_TO_SLEEP 600  // 10 minutes
#define WIFI_CONNECT_TIMEOUT_MS 20000
#define HTTP_TIMEOUT_MS 10000
#define HTTP_RETRIES 3

// Every sensor is sampled SAMPLE_COUNT times in one shared loop, then reduced
// with a trimmed mean (drop one min and one max) to reject spikes.
#define SAMPLE_COUNT 10
#define SAMPLE_DELAY_MS 200

// Pump may never run longer than this, whatever the caller asks for.
#define PUMP_MAX_RUN_MS 2000
#define PUMP_SPEED 255


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

// Water pump motor driver (MX1508), silkscreen D18/D19.
// These are digital pads, not RTC pads, so their deep-sleep hold comes from
// gpio_deep_sleep_hold_en() and is dropped by any reset. The 10k pulldowns to
// GND are what keep the driver off across resets and power-on.
#define PUMP_IN1 18
#define PUMP_IN2 19


// ============================================================
// SOIL MOISTURE CALIBRATION
// ============================================================
// Dry: 1.605 V = 0%
// Wet: 0.830 V = 100%

#define SOIL_DRY_VOLTAGE 1.605
#define SOIL_WET_VOLTAGE 0.830


// ============================================================
// PLAUSIBILITY RANGES
// ============================================================
// A stuck I2C bus returns in-range garbage rather than NaN, so every sample is
// also bounds-checked. Anything outside these becomes NAN and is sent as null.

#define BME_TEMP_MIN -40.0
#define BME_TEMP_MAX 85.0
#define DHT_TEMP_MIN -40.0
#define DHT_TEMP_MAX 80.0
#define HUMIDITY_MIN 0.0
#define HUMIDITY_MAX 100.0
#define PRESSURE_MIN_HPA 300.0
#define PRESSURE_MAX_HPA 1100.0
#define LUX_MIN 0.0
#define LUX_MAX 100000.0
#define ADC_VOLTAGE_MIN 0.0
#define ADC_VOLTAGE_MAX 3.3


// ============================================================
// SENSOR OBJECTS
// ============================================================

Adafruit_BME280 bme;
BH1750 lightMeter;
DHT dht(DHT_PIN, DHT_TYPE);

struct SampleSet {
  float bmeTemp[SAMPLE_COUNT];
  float bmeHumidity[SAMPLE_COUNT];
  float bmePressure[SAMPLE_COUNT];
  float lux[SAMPLE_COUNT];
  float dhtTemp[SAMPLE_COUNT];
  float dhtHumidity[SAMPLE_COUNT];
  float uvVoltage[SAMPLE_COUNT];
  float soilVoltage[SAMPLE_COUNT];
};

SampleSet samples;

struct PendingAction {
  bool pump;
  char id[40];  // fits a bigint or a uuid
};

PendingAction pendingAction;

char authorizationHeader[256];
char apiKeyHeader[256];
char jsonBuffer[1024];


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

bool beginSupabaseRequest(HTTPClient& http, WiFiClientSecure& client, const char* url) {
  client.setInsecure();
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setConnectTimeout(HTTP_TIMEOUT_MS);

  if (!http.begin(client, url)) {
    Serial.println("http.begin failed");
    return false;
  }

  http.addHeader("apikey", apiKeyHeader);
  http.addHeader("Authorization", authorizationHeader);
  return true;
}

bool postJson() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected");
    return false;
  }

  WiFiClientSecure client;
  HTTPClient http;
  if (!beginSupabaseRequest(http, client, SUPABASE_TABLE_URL)) return false;

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
// SAMPLING
// ============================================================

float plausible(float value, float minValue, float maxValue) {
  if (isnan(value) || isinf(value)) return NAN;
  if (value < minValue || value > maxValue) return NAN;
  return value;
}

float readAdcVoltage(int pin) {
  return (analogRead(pin) / 4095.0f) * 3.3f;
}

void collectSamples() {
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    samples.bmeTemp[i] = plausible(bme.readTemperature(), BME_TEMP_MIN, BME_TEMP_MAX);
    samples.bmeHumidity[i] = plausible(bme.readHumidity(), HUMIDITY_MIN, HUMIDITY_MAX);
    samples.bmePressure[i] =
        plausible(bme.readPressure() / 100.0F, PRESSURE_MIN_HPA, PRESSURE_MAX_HPA);
    samples.lux[i] = plausible(lightMeter.readLightLevel(), LUX_MIN, LUX_MAX);
    samples.dhtTemp[i] = plausible(dht.readTemperature(), DHT_TEMP_MIN, DHT_TEMP_MAX);
    samples.dhtHumidity[i] = plausible(dht.readHumidity(), HUMIDITY_MIN, HUMIDITY_MAX);
    samples.uvVoltage[i] = plausible(readAdcVoltage(UV_PIN), ADC_VOLTAGE_MIN, ADC_VOLTAGE_MAX);
    samples.soilVoltage[i] = plausible(readAdcVoltage(SOIL_PIN), ADC_VOLTAGE_MIN, ADC_VOLTAGE_MAX);

    delay(SAMPLE_DELAY_MS);
  }
}

// Drop one min and one max, average the rest. NAN when too few valid samples
// remain to trim and still have something to average.
float trimmedMean(const float* values, int count) {
  float valid[SAMPLE_COUNT];
  int n = 0;

  for (int i = 0; i < count; i++) {
    if (!isnan(values[i])) valid[n++] = values[i];
  }

  if (n < 3) return NAN;

  for (int i = 1; i < n; i++) {
    float key = valid[i];
    int j = i - 1;
    while (j >= 0 && valid[j] > key) {
      valid[j + 1] = valid[j];
      j--;
    }
    valid[j + 1] = key;
  }

  int first = (n > 3) ? 1 : 0;
  int last = (n > 3) ? n - 2 : n - 1;

  float sum = 0.0f;
  for (int i = first; i <= last; i++) sum += valid[i];

  return sum / (float)(last - first + 1);
}


// ============================================================
// CONVERT SOIL VOLTAGE TO MOISTURE %
// ============================================================

float soilMoisturePercent(float voltage) {
  if (isnan(voltage)) return NAN;

  float percentage =
      (SOIL_DRY_VOLTAGE - voltage) / (SOIL_DRY_VOLTAGE - SOIL_WET_VOLTAGE) * 100.0;
  return constrain(percentage, 0.0, 100.0);
}


// ============================================================
// PUMP CONTROL
// ============================================================

void pumpStop() {
  analogWrite(PUMP_IN1, 0);
  analogWrite(PUMP_IN2, 0);

  // analogWrite() attaches an LEDC channel; pinMode() detaches it again so the
  // pin is a plain output that deep-sleep hold can latch low.
  pinMode(PUMP_IN1, OUTPUT);
  pinMode(PUMP_IN2, OUTPUT);
  digitalWrite(PUMP_IN1, LOW);
  digitalWrite(PUMP_IN2, LOW);
}

void pumpFor(int speed, uint32_t durationMs) {
  speed = constrain(speed, 0, 255);
  if (speed == 0) {
    pumpStop();
    return;
  }

  if (durationMs > PUMP_MAX_RUN_MS) durationMs = PUMP_MAX_RUN_MS;

  digitalWrite(PUMP_IN2, LOW);
  analogWrite(PUMP_IN1, speed);
  delay(durationMs);
  pumpStop();
}

// Pads keep their level across deep sleep only while held, otherwise they float
// and the driver can latch on for the whole sleep window.
void holdPumpLow() {
  pumpStop();
  gpio_hold_en((gpio_num_t)PUMP_IN1);
  gpio_hold_en((gpio_num_t)PUMP_IN2);
  gpio_deep_sleep_hold_en();
}

void releasePumpHold() {
  gpio_deep_sleep_hold_dis();
  gpio_hold_dis((gpio_num_t)PUMP_IN1);
  gpio_hold_dis((gpio_num_t)PUMP_IN2);
}

void enterDeepSleep() {
  holdPumpLow();

  Serial.println("Deep sleep " + String(TIME_TO_SLEEP) + "s");
  Serial.flush();
  esp_sleep_enable_timer_wakeup((uint64_t)TIME_TO_SLEEP * uS_TO_S_FACTOR);
  esp_deep_sleep_start();
}


// ============================================================
// PENDING ACTIONS (sensor_actions queue)
// ============================================================

// The LLM in dailySummary.js picks from sensor_config.allowed_actions, which is
// ["water","fan","shade"] for this device — it never emits "pump". Accept both
// names until the insert path settles on one.
const char* PUMP_ACTION_NAMES[] = {"pump", "water"};

bool actionsContainPump(JsonVariantConst actions) {
  JsonArrayConst list = actions.as<JsonArrayConst>();
  if (list.isNull()) return false;

  for (JsonVariantConst item : list) {
    const char* name = item.as<const char*>();
    if (name == nullptr) continue;

    for (const char* trigger : PUMP_ACTION_NAMES) {
      if (strcmp(name, trigger) == 0) return true;
    }
  }
  return false;
}

bool actionIdToString(JsonVariantConst value, char* out, size_t size) {
  if (value.is<const char*>()) {
    snprintf(out, size, "%s", value.as<const char*>());
    return out[0] != '\0';
  }

  if (value.is<long long>()) {
    snprintf(out, size, "%lld", value.as<long long>());
    return true;
  }

  return false;
}

bool fetchPendingAction() {
  pendingAction.pump = false;
  pendingAction.id[0] = '\0';

  if (WiFi.status() != WL_CONNECTED) return false;

  char url[512];
  // View already restricts to used=false and created_at within the last hour.
  snprintf(url, sizeof(url),
           "%s?select=id,actions&device_id=eq.%d"
           "&order=created_at.desc&limit=1",
           SUPABASE_ACTIONS_PENDING_URL, DEVICE_ID);

  WiFiClientSecure client;
  HTTPClient http;
  if (!beginSupabaseRequest(http, client, url)) return false;

  int code = http.GET();
  Serial.printf("Actions GET HTTP %d\n", code);

  if (code != 200) {
    if (code <= 0) Serial.println("GET error: " + http.errorToString(code));
    http.end();
    return false;
  }

  String payload = http.getString();
  http.end();
  Serial.println("Actions payload: " + payload);

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.println("Actions parse error: " + String(err.c_str()));
    return false;
  }

  JsonArrayConst rows = doc.as<JsonArrayConst>();
  if (rows.isNull() || rows.size() == 0) {
    Serial.println("No pending action");
    return false;
  }

  JsonObjectConst row = rows[0];
  if (!actionIdToString(row["id"], pendingAction.id, sizeof(pendingAction.id))) {
    Serial.println("Pending action has no usable id");
    return false;
  }

  pendingAction.pump = actionsContainPump(row["actions"]);
  return true;
}

bool markActionUsed(const char* id) {
  char url[512];
  snprintf(url, sizeof(url), "%s?id=eq.%s", SUPABASE_ACTIONS_URL, id);

  WiFiClientSecure client;
  HTTPClient http;
  if (!beginSupabaseRequest(http, client, url)) return false;

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=representation");

  String body = "{\"used\": true}";
  int code = http.sendRequest("PATCH", body);
  Serial.printf("Actions PATCH HTTP %d\n", code);

  if (code < 200 || code >= 300) {
    http.end();
    return false;
  }

  String payload = http.getString();
  http.end();

  // A 2xx with an empty array means RLS filtered the write out. Treating that
  // as success would let the same row water the plant again on every wake.
  JsonDocument doc;
  if (deserializeJson(doc, payload)) return false;

  JsonArrayConst rows = doc.as<JsonArrayConst>();
  return !rows.isNull() && rows.size() > 0;
}

void handlePendingAction() {
  if (!fetchPendingAction()) return;

  Serial.printf("Pending action %s (pump: %s)\n", pendingAction.id,
                pendingAction.pump ? "yes" : "no");

  // Claim the row before actuating. If the PATCH fails the row stays pending,
  // so pumping now would repeat every wake until someone notices.
  if (!markActionUsed(pendingAction.id)) {
    Serial.println("Could not mark action used - not running pump");
    return;
  }

  if (!pendingAction.pump) return;

  Serial.printf("Running pump for %d ms\n", PUMP_MAX_RUN_MS);
  pumpFor(PUMP_SPEED, PUMP_MAX_RUN_MS);
}


// ============================================================
// READ SENSORS + BUILD JSON
// ============================================================

// A missing reading must reach Postgres as null, never as 0, or it drags the
// segment averages down.
const char* jsonNum(char* buf, size_t size, float value, int decimals) {
  if (isnan(value) || isinf(value)) snprintf(buf, size, "null");
  else snprintf(buf, size, "%.*f", decimals, value);

  return buf;
}

void readSensorsAndBuildJson() {
  Serial.printf("Sampling %dx every %d ms...\n", SAMPLE_COUNT, SAMPLE_DELAY_MS);
  collectSamples();

  float bmeTemp = trimmedMean(samples.bmeTemp, SAMPLE_COUNT);
  float bmeHumidity = trimmedMean(samples.bmeHumidity, SAMPLE_COUNT);
  float bmePressure = trimmedMean(samples.bmePressure, SAMPLE_COUNT);
  float lux = trimmedMean(samples.lux, SAMPLE_COUNT);
  float dhtTemp = trimmedMean(samples.dhtTemp, SAMPLE_COUNT);
  float dhtHumidity = trimmedMean(samples.dhtHumidity, SAMPLE_COUNT);
  float uvVoltage = trimmedMean(samples.uvVoltage, SAMPLE_COUNT);
  float soilVoltage = trimmedMean(samples.soilVoltage, SAMPLE_COUNT);
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

  char bmeTempStr[16];
  char bmeHumidityStr[16];
  char bmePressureStr[16];
  char luxStr[16];
  char dhtTempStr[16];
  char dhtHumidityStr[16];
  char uvVoltageStr[16];
  char soilVoltageStr[16];
  char soilPercentStr[16];

  snprintf(jsonBuffer, sizeof(jsonBuffer),
           "{"
           "\"device_id\": %d,"
           "\"data\": {"
           "\"bme_temperature\": %s,"
           "\"bme_humidity\": %s,"
           "\"bme_pressure\": %s,"
           "\"lux\": %s,"
           "\"dht_temperature\": %s,"
           "\"dht_humidity\": %s,"
           "\"uv_voltage\": %s,"
           "\"soil_voltage\": %s,"
           "\"soil_moisture\": %s,"
           "\"device_id\": %d,"
           "\"device_type\": \"%s\""
           "}}",
           DEVICE_ID,
           jsonNum(bmeTempStr, sizeof(bmeTempStr), bmeTemp, 2),
           jsonNum(bmeHumidityStr, sizeof(bmeHumidityStr), bmeHumidity, 2),
           jsonNum(bmePressureStr, sizeof(bmePressureStr), bmePressure, 2),
           jsonNum(luxStr, sizeof(luxStr), lux, 1),
           jsonNum(dhtTempStr, sizeof(dhtTempStr), dhtTemp, 2),
           jsonNum(dhtHumidityStr, sizeof(dhtHumidityStr), dhtHumidity, 2),
           jsonNum(uvVoltageStr, sizeof(uvVoltageStr), uvVoltage, 3),
           jsonNum(soilVoltageStr, sizeof(soilVoltageStr), soilVoltage, 3),
           jsonNum(soilPercentStr, sizeof(soilPercentStr), soilPercent, 1),
           DEVICE_ID, DEVICE_TYPE);

  Serial.println("JSON:");
  Serial.println(jsonBuffer);
}


// ============================================================
// SETUP
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(50);

  // Configure the pump pins low first: while the hold is active the pad ignores
  // register writes, so releasing it afterwards latches LOW instead of floating.
  pinMode(PUMP_IN1, OUTPUT);
  pinMode(PUMP_IN2, OUTPUT);
  digitalWrite(PUMP_IN1, LOW);
  digitalWrite(PUMP_IN2, LOW);
  releasePumpHold();

  Wire.begin(SDA_PIN, SCL_PIN);

  if (!bme.begin(0x76, &Wire)) {
    Serial.println("BME280 not found! Sleeping anyway.");
    enterDeepSleep();
  }

  if (!lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire)) {
    Serial.println("BH1750 not found! Sleeping anyway.");
    enterDeepSleep();
  }

  dht.begin();

  analogReadResolution(12);
  analogSetPinAttenuation(UV_PIN, ADC_11db);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);

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

    // After the POST so the readings describe the soil before any watering.
    handlePendingAction();
  } else {
    Serial.println("Skipping send (no WiFi)");
  }

  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_OFF);

  enterDeepSleep();
}


// ============================================================
// LOOP
// ============================================================

void loop() {
  // unused; device deep-sleeps at end of setup()
}
