"use client";

import CustomPieChart from "./CustomPieChart";
import { BatteryCharging, Droplet, GaugeCircle, Ruler, Thermometer, Calendar, ChevronLeft, Menu } from "lucide-react";
import Sensor from "./Sensor";
import ScrollView from "./ScrollView";
import BasePanel from "./BasePanel";
import Button from "./Button";
import TimeSeriesAreaChart from "./TimeSeriesLineChart";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SensorPage({ initialReadings, deviceId }) {
  const [isSensors, setIsSensors] = useState(true);
  const [isGraphs, setIsGraphs] = useState(false);
  const [period, setPeriod] = useState("last_2_days");
  const [currentValue, setCurrentValue] = useState(initialReadings[0]);
  const [readings, setReadings] = useState(initialReadings);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleTimeframeChange = async (timeframe) => {
    try {
      setLoading(true);

      const response = await fetch(`/api/readings?deviceId=${deviceId}&timeframe=${timeframe}`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Failed to fetch readings");
      }

      const data = await response.json();

      setPeriod(timeframe);
      setReadings(data);
      setCurrentValue(data[0]);
      setLoading(false);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSelectGraphs = () => {
    setIsSensors(false);
    setIsGraphs(true);
  };

  const handleSelectSensors = () => {
    setIsSensors(true);
    setIsGraphs(false);
  };

  function formatTime(date) {
    const d = new Date(date);

    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    const dayMonth = d.toLocaleDateString([], { day: "2-digit", month: "short" });

    return { time, dayMonth };
  }

  return (
    <div>
      <section className="h-20 text-2xl text-center justify-between items-center flex px-2">
        <div>
          <ChevronLeft onClick={() => router.push("/")} />
        </div>
        <h1>ESP32 - Home</h1>
        <div>
          <Menu />
        </div>
      </section>
      <section className="flex">
        <BasePanel className="mx-1 flex-1 h-[150px] flex justify-center items-center flex-col">
          <CustomPieChart value={currentValue?.battery_voltage} max={5} />
          <p className="mb-2 flex gap-3 font-extralight text-gray-400">
            <span>
              <BatteryCharging />
            </span>
            Battery
          </p>
        </BasePanel>
        <BasePanel className="mx-1 flex-1 h-[150px] flex justify-between items-center flex-col py-2 pt-8">
          <div>
            <p className="text-3xl text-center text-[#99C64C] font-extrabold">
              {formatTime(currentValue?.created_at).time}
            </p>
            <p className="text--lg text-center">{formatTime(currentValue?.created_at).dayMonth}</p>
          </div>
          <p className="flex gap-3 font-extralight text-gray-400">
            <span className="">
              <Calendar size={20} />
            </span>
            Last read
          </p>
        </BasePanel>
      </section>
      <section className="flex mt-10">
        <Button onClick={handleSelectSensors} selected={isSensors} disabled={loading}>
          <p className="h-full flex justify-center items-center w-full">Values</p>
        </Button>
        <Button onClick={handleSelectGraphs} selected={isGraphs} disabled={loading || readings.length < 1}>
          <p className="h-full flex justify-center items-center w-full">Graphs</p>
        </Button>
      </section>
      <section className="flex mt-2">
        <Button
          onClick={() => handleTimeframeChange("last_2_days")}
          selected={period === "last_2_days"}
          disabled={loading}
        >
          <p className="h-full flex justify-center items-center w-full">Last 2 Days</p>
        </Button>
        <Button onClick={() => handleTimeframeChange("last_week")} selected={period === "last_week"} disabled={loading}>
          <p className="h-full flex justify-center items-center w-full">Last Week</p>
        </Button>
        <Button
          onClick={() => handleTimeframeChange("last_month")}
          selected={period === "last_month"}
          disabled={loading}
        >
          <p className="h-full flex justify-center items-center w-full">Last Month</p>
        </Button>
        {/* <Button onClick={() => handleTimeframeChange("last_year")} selected={period === "last_year"} disabled={loading}>
          <p className="h-full flex justify-center items-center w-full">Last Year</p>
        </Button> */}
      </section>
      {isSensors && (
        <section>
          <li className="mx-1">
            <ul className="mt-7">
              <h1 className="text-lg ml-2 mb-0 font-bold">DHT 11</h1>
              <h2 className="text-sm ml-2 mb-2 font-extralight text-gray-400">
                Digital humidity & temperature sensor. Temp accuracy ±2 °C, humidity accuracy ±5 %RH
              </h2>
              <ScrollView>
                <Sensor
                  title={"DHT11"}
                  value={currentValue?.temperature11}
                  range={{ min: 10, max: 40, reverse: false }}
                  unit={"°C"}
                  icon={<Thermometer />}
                  color={"white"}
                />
                <Sensor
                  title={"DHT11"}
                  value={currentValue?.humidity11}
                  range={{ min: 0, max: 100, reverse: false }}
                  unit={"%"}
                  icon={<Droplet />}
                  color={"white"}
                />
              </ScrollView>
            </ul>
            <ul className="mt-5">
              <h1 className="text-lg ml-2 mb-0 font-bold">DHT 22</h1>
              <h2 className="text-sm ml-2 mb-2 font-extralight text-gray-400">
                Digital humidity & temperature sensor. Temp accuracy ±0.5 °C, humidity accuracy ±2 %RH
              </h2>
              <ScrollView>
                <Sensor
                  title={"DHT22"}
                  value={currentValue?.temperature22}
                  range={{ min: 10, max: 40, reverse: false }}
                  unit={"°C"}
                  icon={<Thermometer />}
                  color={"white"}
                />
                <Sensor
                  title={"DHT22"}
                  value={currentValue?.humidity22}
                  range={{ min: 0, max: 100, reverse: false }}
                  unit={"%"}
                  icon={<Droplet />}
                  color={"white"}
                />
              </ScrollView>
            </ul>
            <ul className="mt-5">
              <h1 className="text-lg ml-2 mb-0 font-bold">BMP</h1>
              <h2 className="text-sm ml-2 mb-2 font-extralight text-gray-400">
                Digital barometric pressure & temperature sensor. Pressure accuracy ±1 hPa, temperature accuracy ±1 °C
              </h2>
              <ScrollView>
                <Sensor
                  title={"BMP"}
                  value={currentValue?.bmp_temperature}
                  range={{ min: 10, max: 40, reverse: false }}
                  unit={"°C"}
                  icon={<Thermometer />}
                  color={"white"}
                />
                <Sensor
                  title={"BMP"}
                  value={(currentValue?.bmp_pressure * 0.000987).toFixed(2)}
                  range={{ min: 0.95, max: 1.05, reverse: false }}
                  unit={"atm"}
                  icon={<GaugeCircle />}
                  color={"white"}
                />
                <Sensor
                  title={"BMP"}
                  value={currentValue?.bmp_altitude}
                  range={{ min: 0, max: 4000, reverse: false }}
                  unit={"m"}
                  icon={<Ruler />}
                  color={"white"}
                />
              </ScrollView>
            </ul>
          </li>
        </section>
      )}
      {isGraphs && (
        <section className="flex flex-col mt-7 gap-2 mx-1">
          <TimeSeriesAreaChart
            loading={loading}
            title={"Battery Voltage"}
            data={readings}
            dataKey={"battery_voltage"}
            unit="V"
          />
          <TimeSeriesAreaChart
            loading={loading}
            title={"DHT22 Temperature"}
            data={readings}
            dataKey={"temperature22"}
            unit="°C"
          />
          <TimeSeriesAreaChart
            loading={loading}
            title={"DHT22 Humidity"}
            data={readings}
            dataKey={"humidity22"}
            unit="%"
          />
          <TimeSeriesAreaChart
            loading={loading}
            title={"DHT11 Temperature"}
            data={readings}
            dataKey={"temperature11"}
            unit="°C"
          />
          <TimeSeriesAreaChart
            loading={loading}
            title={"DHT11 Humidity"}
            data={readings}
            dataKey={"humidity11"}
            unit="%"
          />
          <TimeSeriesAreaChart
            loading={loading}
            title={"BMP Temperature"}
            data={readings}
            dataKey={"bmp_temperature"}
            unit="°C"
          />
          <TimeSeriesAreaChart
            loading={loading}
            title={"BMP Pressure"}
            data={readings}
            dataKey={"bmp_pressure"}
            unit="hPa"
          />
          <TimeSeriesAreaChart
            loading={loading}
            title={"BMP Altitude"}
            data={readings}
            dataKey={"bmp_altitude"}
            unit="m"
          />
        </section>
      )}
    </div>
  );
}
