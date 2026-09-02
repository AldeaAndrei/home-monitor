#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BMP280.h>
#include "DHT.h"

// XIAO ESP32-C5 I2C: D4 = SDA (GPIO23), D5 = SCL (GPIO24)
#define I2C_SDA D4
#define I2C_SCL D5

// DHT data pins (single-wire, needs 4.7k–10k pull-up to 3V3)
#define DHTPIN11 D2   // GPIO25
#define DHTPIN22 D3   // GPIO7
#define DHTTYPE11 DHT11
#define DHTTYPE22 DHT22

#define SEALEVELPRESSURE_HPA (1013.25)

DHT dht11(DHTPIN11, DHTTYPE11);
DHT dht22(DHTPIN22, DHTTYPE22);
Adafruit_BMP280 bmp;

void setup() {
  Serial.begin(115200);
  delay(1000);

  dht11.begin();
  dht22.begin();

  Wire.begin(I2C_SDA, I2C_SCL);

  if (!bmp.begin(0x76)) {
    if (!bmp.begin(0x77)) {
      Serial.println("BMP280 not found! Check wiring (SDA=D4, SCL=D5).");
      while (1) {
        delay(10);
      }
    }
  }

  Serial.println("BMP280, DHT11, DHT22 ready.");
}

void loop() {
  float dht11Humidity = dht11.readHumidity();
  float dht11Temperature = dht11.readTemperature();
  float dht22Humidity = dht22.readHumidity();
  float dht22Temperature = dht22.readTemperature();

  float bmpTemperature = bmp.readTemperature();
  float bmpPressure = bmp.readPressure() / 100.0F;
  float bmpAltitude = bmp.readAltitude(SEALEVELPRESSURE_HPA);

  Serial.println("--- Sensor readings ---");

  if (isnan(dht11Humidity) || isnan(dht11Temperature)) {
    Serial.println("DHT11: read failed");
  } else {
    Serial.print("DHT11  | Temp: ");
    Serial.print(dht11Temperature);
    Serial.print(" C  |  Humidity: ");
    Serial.print(dht11Humidity);
    Serial.println(" %");
  }

  if (isnan(dht22Humidity) || isnan(dht22Temperature)) {
    Serial.println("DHT22: read failed");
  } else {
    Serial.print("DHT22  | Temp: ");
    Serial.print(dht22Temperature);
    Serial.print(" C  |  Humidity: ");
    Serial.print(dht22Humidity);
    Serial.println(" %");
  }

  Serial.print("BMP280 | Temp: ");
  Serial.print(bmpTemperature);
  Serial.print(" C  |  Pressure: ");
  Serial.print(bmpPressure);
  Serial.print(" hPa  |  Altitude: ");
  Serial.print(bmpAltitude);
  Serial.println(" m");

  delay(2000);
}
