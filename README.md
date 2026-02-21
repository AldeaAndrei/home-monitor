# Home Sensor Monitoring System

A full-stack monitoring system built with Next.js and ESP32 devices.  
The system collects environmental data from physical sensors, stores it in Supabase, and visualizes it through a web dashboard.

---

## Overview

This project consists of:

- **ESP32 firmware**
  - Reads data from connected sensors (DHT11, DHT22, BMP280)
  - Monitors battery voltage using a voltage divider
  - Sends measurements periodically over WiFi
  - Pushes data to Supabase REST APIs

- **Supabase**
  - Stores sensor readings
  - Exposes secure database APIs

- **Next.js application**
  - Fetches sensor data from Supabase
  - Displays current values and historical charts
  - Allows switching between time ranges (week, month, year)

---

## Application Screens

<p align="center">
  <img src="https://github.com/user-attachments/assets/20bd7a98-c78c-49ab-92cd-006317aa856f" width="800" alt="All application screens" />
</p>

The dashboard includes:

- Current sensor values
- Historical charts
- Time range filtering
- Battery monitoring
- Multiple sensor views

---

## ESP32 Hardware Setup

<p align="center">
  <img src="https://github.com/user-attachments/assets/f0880995-ec1c-46c5-a51a-b5d71ccf99f6" width="600" alt="ESP32 schematic" />
</p>

### Sensors Used

- **DHT11** – temperature and humidity
- **DHT22** – temperature and humidity (higher accuracy)
- **BMP280** – temperature, pressure, altitude
- **Voltage divider** – battery voltage monitoring

The ESP32 connects to WiFi and sends JSON payloads to Supabase APIs at fixed intervals.

---

## Battery Discharge Comparison

<p align="center">
  <img src="https://github.com/user-attachments/assets/6125a9a4-3773-4754-9b31-aa29cfcd5226" width="700" alt="Battery discharge comparison graph" />
</p>

The graph compares discharge rates between:

- Alkaline batteries
- NiMH rechargeable batteries

The data shows voltage behavior over time under the same load conditions. In both cases, the batteries lasted around 11 days before the voltage dropped too low to power the ESP32 reliably.

---

## Data Structure

The ESP32 sends data as a JSON payload in the following format:

```json
{
  "data": {
    "temperature11": 0.00,
    "humidity11": 0.00,
    "temperature22": 0.00,
    "humidity22": 0.00,
    "bmp_temperature": 0.00,
    "bmp_pressure": 0.00,
    "bmp_altitude": 0.00,
    "battery_voltage": 0.00,
    "device_id": 1,
    "device_type": "sensor_node"
  }
}
