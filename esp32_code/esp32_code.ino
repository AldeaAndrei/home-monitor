#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BMP280.h>
#include "DHT.h"

// ---------- CONFIG ----------
#define LED_PIN 2
#define BATTERY_READ_PIN 34

#define DHTPIN11 18  
#define DHTTYPE11 DHT11

#define DHTPIN22 19  
#define DHTTYPE22 DHT22

#define SEALEVELPRESSURE_HPA (1013.25)

#define uS_TO_S_FACTOR 1000000ULL
#define TIME_TO_SLEEP 1800  // 30 minutes

const char* ssid = "xxx";
const char* password = "xxx";

const char* SUPABASE_TABLE_URL = "xxx";
const char* SUPABASE_API_KEY   = "xxx";
const int DEVICE_ID = 1;
const char* DEVICE_TYPE = "ESP32";

// ---------- OBJECTS ----------
DHT dht11(DHTPIN11, DHTTYPE11);
DHT dht22(DHTPIN22, DHTTYPE22);
Adafruit_BMP280 bmp;

// ---------- HEADERS ----------
char authorizationHeader[256];
char apiKeyHeader[256];
char contentTypeHeader[256];

// ---------- UTILS ----------
void blink_times(int n) {
  for (int i = 0; i < n; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(250);
    digitalWrite(LED_PIN, LOW);
    delay(150);
  }
}

void connectToWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected. IP: " + WiFi.localIP().toString());
}

void initHeaders() {
  strcpy(authorizationHeader, "Bearer ");
  strcat(authorizationHeader, SUPABASE_API_KEY);
  strcpy(apiKeyHeader, SUPABASE_API_KEY);
  strcpy(contentTypeHeader, "application/json");
}

// ---------- SENSOR READ & SEND ----------
bool readAndSendData() {
  blink_times(1);
  Serial.println("Reading sensors...");

  // Read DHT11
  float humidity11 = dht11.readHumidity();
  float temperature11 = dht11.readTemperature();

  // Read DHT22
  float humidity22 = dht22.readHumidity();
  float temperature22 = dht22.readTemperature();

  // Read BMP280
  float bmpTemp = bmp.readTemperature();
  float bmpPres = bmp.readPressure() / 100.0F;
  float bmpAlt  = bmp.readAltitude(SEALEVELPRESSURE_HPA);

  // Read battery voltage (1:1 divider)
  int batteryRaw = analogRead(BATTERY_READ_PIN);
  float batteryVoltage = (batteryRaw / 4095.0f) * 3.3f * 2.0f;

  // Prepare JSON
  char jsonBuffer[512];
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
    temperature11, humidity11,
    temperature22, humidity22,
    bmpTemp, bmpPres, bmpAlt,
    batteryVoltage,
    DEVICE_ID, DEVICE_TYPE
  );

  Serial.println("Sending JSON:");
  Serial.println(jsonBuffer);

  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    HTTPClient http;
    client.setInsecure();  // Skip SSL verification

    http.begin(client, SUPABASE_TABLE_URL);
    http.addHeader("apikey", apiKeyHeader);
    http.addHeader("Authorization", authorizationHeader);
    http.addHeader("Content-Type", contentTypeHeader);

    int httpResponseCode = http.POST(jsonBuffer);
    Serial.println("HTTP Response code: " + String(httpResponseCode));
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("Response payload:");
      Serial.println(response);
    } else {
      Serial.println("Error sending POST: " + http.errorToString(httpResponseCode));
    }
    http.end();
    return (httpResponseCode > 0);
  } else {
    Serial.println("WiFi disconnected");
    return false;
  }
}

// ---------- SETUP ----------
void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
  delay(1000);

  // Init sensors
  dht11.begin();
  dht22.begin();
  Wire.begin(21, 22);
  if (!bmp.begin(0x76)) {
    Serial.println("BMP280 not found! Check wiring!");
    while (1) delay(10);
  }

  // WiFi & headers
  connectToWiFi();
  initHeaders();

  // Blink to indicate start
  blink_times(2);

  // Attempt sending data 3 times
  int attempts = 3;
  bool sent = false;
  while (!sent && attempts-- > 0) {
    sent = readAndSendData();
    delay(1000);
  }

  Serial.println("Entering deep sleep for " + String(TIME_TO_SLEEP) + " seconds.");
  esp_sleep_enable_timer_wakeup(TIME_TO_SLEEP * uS_TO_S_FACTOR);
  esp_deep_sleep_start();
}

// ---------- LOOP ----------
void loop() {
  // Not used, device goes to deep sleep after sending
}
