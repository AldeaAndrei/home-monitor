"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceDot, Label, CartesianGrid, Tooltip  } from "recharts";
import BasePanel from "./BasePanel";
import { INTERVAL_MAP } from "@/constants";

export default function SensorGraph({
  loading,
  data,
  dataKey,
  unit,
  color = "#99C64C",
  title,
  range = [0, 100],
  timeframe,
  onTimeframeChange,
}) {
  const chartData = useMemo(() => {
    return data
      .map((d) => ({
        ...d,
        ts: new Date(d.created_at).getTime(),
      }))
      .sort((a, b) => a.ts - b.ts);
  }, [data]);

  const values = useMemo(() => chartData.filter((d) => typeof d[dataKey] === "number"), [chartData, dataKey]);

  const minPoint = useMemo(() => {
    if (!values.length) return null;
    return values.reduce((a, b) => (b[dataKey] < a[dataKey] ? b : a));
  }, [values, dataKey]);

  const maxPoint = useMemo(() => {
    if (!values.length) return null;
    return values.reduce((a, b) => (b[dataKey] > a[dataKey] ? b : a));
  }, [values, dataKey]);

  if (minPoint && maxPoint) {
    const off = 0.05;
    const minValue = minPoint[dataKey];
    const maxValue = maxPoint[dataKey];
    range = [Math.floor(minValue * (1 - off)), Math.ceil(maxValue * (1 + off))];
  }

  const formatTs = (ts) =>
    new Date(ts).toLocaleString([], {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  const formatTooltipDate = (ts) => {
    const date = new Date(ts);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}-${month} ${hours}:${minutes}`;
  };

  const formatAxisTick = (ts) => {
    const date = new Date(ts);
    const hour12 = date.getHours() % 12 || 12;
    const ampm = date.getHours() < 12 ? "AM" : "PM";
    const day = date.getDate();
    return `${String(hour12).padStart(2, "0")}${ampm}-${day}`;
  };

  const minTs = chartData[0]?.ts;
  const maxTs = chartData[chartData.length - 1]?.ts;

  const hourlyTicks = useMemo(() => {
    if (!minTs || !maxTs) return [];

    const hourMs = 60 * 60 * 1000;
    const start = new Date(minTs);
    start.setMinutes(0, 0, 0);

    let t = start.getTime();
    if (t < minTs) t += hourMs;

    const ticks = [];
    while (t <= maxTs) {
      ticks.push(t);
      t += hourMs;
    }
    return ticks;
  }, [minTs, maxTs]);

  return (
    <BasePanel className="text-foreground py-1">
      <h1 className="text-lg ml-7 mb-0 font-bold">{title}</h1>

      <div className="flex flex-row items-center justify-between pr-4">
        <p className="text-sm text-foreground/70 ml-7 mb-3">
          Data from {minTs ? formatTs(minTs) : "N/A"} - {maxTs ? formatTs(maxTs) : "N/A"}
        </p>
        <select
          value={timeframe}
          onChange={(e) => onTimeframeChange(e.target.value)}
          className="text-foreground bg-background rounded-md border border-foreground/20 px-2 py-1 text-sm"
        >
          {Object.entries(INTERVAL_MAP).map(([key, value]) => (
            <option
              className="text-foreground bg-background"
              key={key}
              value={key}>{value}
            </option>
          ))}
        </select>
      </div>

      <div className="relative w-full h-52 pr-3">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm p-1 rounded-md mt-2">
            <div className="h-8 w-8 animate-spin rounded-lg border-4 border-muted border-t-primary" />
          </div>
        )}

        {!loading && data.length < 1 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm p-1 rounded-md mt-2">
            No data
          </div>
        )}

        {!loading && data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <XAxis
                stroke="currentColor"
                dataKey="ts"
                domain={["dataMin", "dataMax"]}
                type="number"
                tickFormatter={formatAxisTick}
                angle={0}
                textAnchor="start"
                height={50}
                tickSize={10}
                tick={{ fontSize: 10 }}
                ticks={hourlyTicks}
              />

              <CartesianGrid horizontal vertical={false} stroke="currentColor" strokeOpacity={0.1} />

              <YAxis
                stroke="currentColor"
                tickFormatter={(v) => `${v}${unit}`}
                width={50}
                domain={range}
                tick={{ fontSize: 10 }}
              />

              {minPoint && (
                <ReferenceDot x={minPoint.ts} y={minPoint[dataKey]} r={5} fill="#4da8c7" stroke="black">
                  <Label value={`${minPoint[dataKey]}${unit}`} position="bottom" fill="#4da8c7" fontSize={12} />
                </ReferenceDot>
              )}

              {maxPoint && (
                <ReferenceDot x={maxPoint.ts} y={maxPoint[dataKey]} r={5} fill="#c74d4d" stroke="black">
                  <Label value={`${maxPoint[dataKey]}${unit}`} position="top" fill="#c74d4d" fontSize={12} />
                </ReferenceDot>
              )}

              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;

                  const point = payload[0];
                  const value = point.value;

                  return (
                    <div className="rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm shadow-md">
                      <p className="text-foreground/70">{formatTooltipDate(point.payload.ts)}</p>
                      <p className="font-medium">
                        {title}: {value}
                        {unit}
                      </p>
                    </div>
                  );
                }}
              />

              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                fill={color + "55"}
                strokeWidth={2}
                isAnimationActive
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </BasePanel>
  );
}
