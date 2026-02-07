"use client";

import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceDot, Label } from "recharts";
import BasePanel from "./BasePanel";

export default function TimeSeriesAreaChart({ data, dataKey, unit, color = "#99C64C", title, range = [0, 100] }) {
  // Map and sort data by created_at
  const chartData = data
    .map((d) => {
      return {
        ...d,
        ts: new Date(d.created_at).getTime(),
      };
    })
    .sort((a, b) => a.ts - b.ts);

  const values = chartData.filter((d) => typeof d[dataKey] === "number");

  const minPoint = values.reduce((a, b) => (b[dataKey] < a[dataKey] ? b : a));
  const maxPoint = values.reduce((a, b) => (b[dataKey] > a[dataKey] ? b : a));

  const minValue = minPoint[dataKey];
  const maxValue = maxPoint[dataKey];

  const off = 0.05;
  range = [Math.floor(minValue * (1 - off)), Math.ceil(maxValue * (1 + off))];

  const formatTs = (ts) =>
    new Date(ts).toLocaleString([], {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  const minTs = chartData[0]?.ts;
  const maxTs = chartData[chartData.length - 1]?.ts;

  return (
    <BasePanel className="text-foreground py-1">
      <h1 className="text-lg ml-7 mb-0 font-bold">{title}</h1>
      {minTs && maxTs && (
        <p className="text-sm text-foreground/70 ml-7 mb-3">
          Data from {formatTs(minTs)} - {formatTs(maxTs)}
        </p>
      )}
      <div className="w-full h-52 pr-3">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <XAxis
              stroke="currentColor"
              dataKey="ts"
              domain={["dataMin", "dataMax"]}
              type="number"
              tickFormatter={(v) =>
                new Date(v).toLocaleString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })
              }
              angle={0}
              textAnchor="start"
              height={50}
              tickSize={10}
              tick={{ fontSize: 10 }}
              tickCount={10}
            />

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

            <Area
              type="monotone"
              dataKey={dataKey} // single field from props
              stroke={color}
              fill={color + "BB"}
              strokeWidth={2}
              isAnimationActive
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </BasePanel>
  );
}
