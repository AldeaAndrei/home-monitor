
import { BatteryFull, Cpu, Dam, Droplet, Gauge, SolarPanel, Sun, Thermometer } from "lucide-react";

export const selectedIcon = (type) => {
  switch (type) {
    case "temperature":
      return { icon: <Thermometer />, className: "bg-[#2f3c25] text-[#91be5b]", color: "#91be5b" };
    case "humidity":
      return { icon: <Droplet />, className: "bg-[#303f51] text-[#87b4f6]", color: "#87b4f6" };
    case "pressure":
      return { icon: <Gauge />, className: "bg-[#2b433f] text-[#6bd8bf]", color: "#6bd8bf" };
    case "light":
      return { icon: <Sun />, className: "bg-[#3e3c22] text-[#f1d153]", color: "#f1d153" };
    case "uv":
      return { icon: <SolarPanel />, className: "bg-[#493524] text-[#e58c42]", color: "#e58c42" };
    case "soil":
      return { icon: <Dam />, className: "bg-[#3d384c] text-[#b18ced]", color: "#b18ced" };
    case "cpu":
      return { icon: <Cpu />, className: "bg-[#1c2021] text-[#babbbd]", color: "#babbbd" };
    case "battery":
      return { icon: <BatteryFull />, className: "bg-[#2f3c25] text-[#91be5b]", color: "#91be5b" };
  }
};

export const selectedUnit = (type) => {
  switch (type) {
    case "temperature":
      return "°C";
    case "humidity":
      return "%";
    case "pressure":
      return "hPa";
    case "light":
      return "lux";
    case "uv":
      return "UV";
    case "soil":
      return "%";
    case "battery":
      return "V";
  }
};

export const formatLastSeen = (date) => {
  if (!date) return "Last seen unknown";

  const diffMs = Date.now() - new Date(date).getTime();
  if (diffMs < 60_000) return "Last seen just now";

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) {
    return `Last seen: ${mins} ${mins === 1 ? "min" : "mins"} ago`;
  }

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last seen: ${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `Last seen: ${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `Last seen: ${months} ${months === 1 ? "month" : "months"} ago`;
  }

  const years = Math.floor(months / 12);
  return `Last seen: ${years} ${years === 1 ? "year" : "years"} ago`;
};
