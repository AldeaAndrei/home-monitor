import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

export default function CustomPieChart({ value = 2.5, max = 5 }) {
  const data = [
    { name: "Value", value: (value / max) * 100 },
    { name: "Remaining", value: 100 - (value / max) * 100 },
  ];

  return (
    <ResponsiveContainer>
      <PieChart width={200} height={200}>
        <Pie
          data={data}
          dataKey="value"
          cx="50%"
          cy="80%"
          innerRadius={60}
          outerRadius={80}
          startAngle={180}
          endAngle={0}
          cornerRadius={10}
          paddingAngle={0}
          fill="#transparent"
        >
          <Cell fill="#99C64C" stroke="transparent" />
          <Cell fill="transparent" stroke="transparent" />
        </Pie>

        <text
          x="50%"
          y="70%"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={30}
          fontWeight={500}
          fill="#ffffff"
        >
          {value}V
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}
