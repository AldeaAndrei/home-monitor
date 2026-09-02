'use client';

import { useEffect, useState } from "react";
import SensorGraph from "@/app/components/SensorGraph";
import { useParams } from "next/navigation";
import DeviceCard from "@/app/components/DeviceCard";
import SensorCard from "@/app/components/SensorCard";

export default function DevicePage({ device }) {
  const { id } = useParams();
  const [fullReadings, setFullReadings] = useState([]);
  const [lastReading, setLastReading] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSensor, setSelectedSensor] = useState({
    title: "",
    key: "",
    unit: "",
    color: ""
  });
  const [selectedTimeframe, setSelectedTimeframe] = useState("last_2_days");
  const [deviceConfig, setDeviceConfig] = useState(null);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/readings?deviceId=${id}&timeframe=${selectedTimeframe}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to fetch readings");
        const data = await res.json();
        setFullReadings(data);
        setLastReading(data[0] ?? null);
      } catch (err) {
        console.error(err);
        setFullReadings([]);
        setLastReading(null);
      } finally {
        setLoading(false);
      }
    };

    const fetchDeviceConfig = async () => {
      try {
        const config = await fetch(`/api/devices/${id}`);
        if (!config.ok) throw new Error("Failed to fetch device config");
        const data = await config.json();
        setDeviceConfig(data);
      } catch (err) {
        console.error(err);
        setDeviceConfig(null);
      }
    };

    fetchData();
    fetchDeviceConfig();
  }, [id, selectedTimeframe]);

  return (
    <div className="px-4 flex flex-col">
      <DeviceCard deviceConfig={deviceConfig} lastSeenAt={lastReading?.created_at} />
      <div className="flex flex-col md:flex-row gap-4">
        <div className="w-full md:flex-1 h-full flex flex-col gap-1 mt-4 md:justify-start">
          <h2 className="text-md text-[#d6d8d8] mt-2">Sensors</h2>
          {deviceConfig?.fields?.length > 0 && deviceConfig?.fields?.map((field) => (
            <SensorCard
              key={field.field}
              selectedSensor={selectedSensor}
              setSelectedSensor={setSelectedSensor}
              lastReading={lastReading}
              fieldTitle={field.title}
              dataFieldName={field.field}
              type={field.type}
            />
          ))}
        </div>
        <div className="w-full md:flex-[2] h-full flex flex-col gap-1 mt-4 md:justify-end">
          <h2 className="text-md text-[#d6d8d8] mt-2">Chart</h2>
          {selectedSensor.title && <SensorGraph
            loading={loading}
            data={fullReadings}
            dataKey={selectedSensor.key}
            unit={selectedSensor.unit}
            color={selectedSensor.color}
            title={selectedSensor.title}
            timeframe={selectedTimeframe}
            onTimeframeChange={setSelectedTimeframe}
          />}
          {!selectedSensor.title && <div className="flex flex-row items-center justify-center h-full">
            <div className="text-md text-[#d6d8d8]">Select a sensor to view the chart</div>
          </div>}
        </div>
      </div>
    </div>
  );
}
