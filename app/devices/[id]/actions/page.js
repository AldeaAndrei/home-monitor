"use client";

import BasePanel from "@/app/components/BasePanel";
import DeviceCard from "@/app/components/DeviceCard";
import IconBubble from "@/app/components/IconBubble";
import { selectedUnit } from "@/lib/utils/client";
import { BrainCircuit, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";

export default function DeviceActionsPage() {
    const { id } = useParams();
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deviceConfig, setDeviceConfig] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);
    const [summaryDates, setSummaryDates] = useState([]);
    const [canIncrementDate, setCanIncrementDate] = useState(false);
    const [canDecrementDate, setCanDecrementDate] = useState(false);

    const handleCanChangeDate = (currentIndex) => {
      setCanIncrementDate(currentIndex < summaryDates.length - 1);
      setCanDecrementDate(currentIndex > 0);
    }

    const handleDecrementDate = () => {
      const currentIndex = summaryDates.indexOf(selectedDate);
      if (currentIndex > 0) {
        const newDate = summaryDates[currentIndex - 1];
        setSelectedDate(newDate);
      }
      handleCanChangeDate(currentIndex - 1);
    }

    const handleIncrementDate = () => {
      const currentIndex = summaryDates.indexOf(selectedDate);
      if (currentIndex < summaryDates.length - 1) {
        const newDate = summaryDates[currentIndex + 1];
        setSelectedDate(newDate);
      }
      handleCanChangeDate(currentIndex + 1);
    }

    const processSummaries = (summaryData) => {
      const summaries = summaryData.summaries;

      let summaryHash = {};

      summaries.forEach(summary => {
        summaryHash[summary.date + " " + summary.timeframe] = summary;
      });

      setSummary(summaryHash);

      const TIMEFRAME_ORDER = {
        night: 0,
        morning: 1,
        afternoon: 2,
        evening: 3,
      };

      const dates = Object.keys(summaryHash).sort((a, b) => {
        const [dateA, timeframeA] = a.split(" ");
        const [dateB, timeframeB] = b.split(" ");

        if (dateA !== dateB) return dateA.localeCompare(dateB);

        return (TIMEFRAME_ORDER[timeframeA] ?? 99) - (TIMEFRAME_ORDER[timeframeB] ?? 99);
      });
      setSummaryDates(dates);
      setSelectedDate(dates[dates.length - 1]);
      
      setCanIncrementDate(false);
      setCanDecrementDate(dates.length > 1);
    }

    useEffect(() => {
        if (!id) return;
    
        const fetchSummary = async () => {
          setLoading(true);
          try {
            const res = await fetch(`/api/readings?deviceId=${id}&isSummary=true`, {
              cache: "no-store",
            });
            if (!res.ok) throw new Error("Failed to fetch readings");
            const data = await res.json();
            processSummaries(data);
          } catch (err) {
            console.error(err);
            setSummary(null);
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
    
        fetchSummary();
        fetchDeviceConfig();
      }, [id]);

    const formatChage = (change_percent) => {
      if (change_percent == 0 || change_percent == null)
        return <span></span>;

      if (change_percent > 0)
        return <span className="text-md text-[#9ec962] font-bold">+{Math.abs(change_percent).toFixed(1)}%</span>;

      if (change_percent < 0)
        return <span className="text-md text-[#c96363] font-bold">-{Math.abs(change_percent).toFixed(1)}%</span>;
    }

    const SensorSummaryCard = (sensor) => {
      const { title, change_percent, type, min, max } = sensor.sensor;
      return (
        <div className="flex flex-row items-center gap-1">
          <IconBubble type={type} />
          <div className="flex flex-row items-center justify-between flex-2">
            <div className="flex flex-col gap-1">
              <div className="text-md text-[#d6d8d8]">{title}</div>
              <div className="flex flex-row items-baseline mt-auto justify-start gap-2">
                <div className="flex flex-row items-baseline gap-1">
                  <div className="text-justify text-sm text-[#9c9fa0]">{min}</div>
                  <div className="text-justify text-sm text-[#9c9fa0]">min</div>
                </div>
                <div className="flex flex-row items-baseline gap-1">
                  <div className="text-justify text-sm text-[#9c9fa0]">{max}</div>
                  <div className="text-justify text-sm text-[#9c9fa0]">max</div>
                </div>
              </div>
            </div>
            {(change_percent != 0 && change_percent != null) && <div className="flex flex-row items-center justify-end flex-1">
                {formatChage(change_percent)}
            </div>}
          </div>
        </div>
      )
    }

    const SummaryCard = () => {
      return (
        <BasePanel className="flex flex-col w-full h-full md:max-w-1/2">
          <div className="flex flex-row w-full h-full justify-between items-center mb-5 mt-3">
            <ChevronLeft className={`cursor-pointer ${canDecrementDate ? "opacity-100" : "opacity-50"}`} onClick={handleDecrementDate} disabled={!canDecrementDate} />
            <span>{selectedDate}</span>
            <ChevronRight className={`cursor-pointer ${canIncrementDate ? "opacity-100" : "opacity-50"}`} onClick={handleIncrementDate} disabled={!canIncrementDate} />
          </div>
          <div className="flex flex-col gap-2">
            {summary?.[selectedDate]?.sensors.map((sensor) => (
              <SensorSummaryCard key={sensor.field} sensor={sensor} />
            ))}
          </div>
        </BasePanel>
      )
    }

    const AssistantCard = () => {
      return (
        <BasePanel className="flex flex-col w-full h-full">
          <div className="flex flex-row items-center justify-start gap-2 p-2"><BrainCircuit className="text-[#9c9fa0] w-4 h-4"/><span className="text-sm text-[#9c9fa0]">{summary?.[selectedDate]?.ai_summary?.model || "No model available"}</span></div>
          <p className="text-md text-[#d6d8d8] p-2">{summary?.[selectedDate]?.ai_summary?.summary || "No summary available"}</p>
          <div className="flex flex-row items-center justify-start gap-2 p-2">
          {summary?.[selectedDate]?.ai_summary?.actions?.length > 0 && <span className="text-sm text-[#9c9fa0]">Recommended: </span>}
            {summary?.[selectedDate]?.ai_summary?.actions?.map((action) => (
                <span key={action} className="text-sm text-[#9c9fa0]">{action}</span>
            ))}
          </div>
        </BasePanel>
      )
    }

    return (
      <div className="flex flex-col gap-4 p-4">
        <DeviceCard deviceConfig={deviceConfig} lastSeenAt={deviceConfig?.last_seen_at} />
        <div className="flex flex-col md:flex-row gap-4">
          <SummaryCard />
          <AssistantCard />
        </div>
      </div>
    );
  }