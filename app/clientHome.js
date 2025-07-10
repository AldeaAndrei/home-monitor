"use client";
import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function ClientHome() {
  const [readings, setReadings] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/sensor_readings");
        const json = await res.json();
        setReadings(json.data || []);
        setStats({
          tempAvg: json.tempAvg,
          tempMax: json.tempMax,
          tempMin: json.tempMin,
          humAvg: json.humAvg,
          humMax: json.humMax,
          humMin: json.humMin,
        });
      } catch (err) {
        console.error("Failed to fetch sensor data", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div>Loading sensor data...</div>;

  // Prepare chart data
  const labels = readings.map((r) =>
    new Date(r.created_at).toLocaleTimeString()
  );

  const temperatureData = readings.map((r) => r.temperature);
  const humidityData = readings.map((r) => r.humidity);

  const dataTemp = {
    labels,
    datasets: [
      {
        label: "Temperature (°C)",
        data: temperatureData,
        borderColor: "rgb(255, 99, 132)",
        backgroundColor: "rgba(255, 99, 132, 0.5)",
        yAxisID: "y",
      },
    ],
  };

  const dataHum = {
    labels,
    datasets: [
      {
        label: "Humidity (%)",
        data: humidityData,
        borderColor: "rgb(54, 162, 235)",
        backgroundColor: "rgba(54, 162, 235, 0.5)",
        yAxisID: "y1",
      },
    ],
  };

  const optionsTemp = {
    responsive: true,
    interaction: {
      mode: "index",
      intersect: false,
    },
    stacked: false,
    scales: {
      y: {
        type: "linear",
        display: true,
        position: "left",
        title: {
          display: true,
          text: "Temperature (°C)",
        },
        min: stats.tempMin - stats.tempMin * 0.1,
        max: stats.tempMax + stats.tempMax * 0.1,
      },
    },
  };

  const optionsHum = {
    responsive: true,
    interaction: {
      mode: "index",
      intersect: false,
    },
    stacked: false,
    scales: {
      y1: {
        type: "linear",
        display: true,
        position: "right",
        grid: {
          drawOnChartArea: false,
        },
        title: {
          display: true,
          text: "Humidity (%)",
        },
        min: stats.humMin - stats.humMin * 0.1,
        max: stats.humMax + stats.humMax * 0.1,
      },
    },
  };

  return (
    <div className="max-w-xl w-full">
      <h1 className="text-3xl font-bold mb-6">Latest Sensor Readings</h1>
      <h2 className="text-xl">Last temp: {readings[0].temperature}°C</h2>
      <h2 className="text-md mb-6">
        {"   "} stats: min = {stats.tempMin} max = {stats.tempMax} avg ={" "}
        {stats.tempAvg}
      </h2>
      <h2 className="text-xl">Last hum: {readings[0].humidity}%</h2>
      <h2 className="text-md mb-6">
        {"   "} stats: min = {stats.humMin} max = {stats.humMax} avg ={" "}
        {stats.humAvg}
      </h2>
      <Line options={optionsTemp} data={dataTemp} />
      <Line options={optionsHum} data={dataHum} />
      <ul className="space-y-4 mt-6">
        {readings.map((reading) => (
          <li key={reading.id} className="p-4 border rounded-lg shadow">
            <div>
              <strong>Time:</strong>{" "}
              {new Date(reading.created_at).toLocaleString()}
            </div>
            <div>
              <strong>Temperature:</strong> {reading.temperature ?? "N/A"} °C
            </div>
            <div>
              <strong>Humidity:</strong> {reading.humidity} %
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
