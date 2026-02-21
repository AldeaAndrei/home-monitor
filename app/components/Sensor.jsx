import BasePanel from "./BasePanel";

export default function Sensor({ title, value, unit, icon, color, range }) {
  const getColorFromRange = (value, min, max, reverse = false) => {
    const clamped = Math.min(Math.max(value, min), max);
    let ratio = (clamped - min) / (max - min);

    if (reverse) {
      ratio = 1 - ratio;
    }

    // 120° = green → 0° = red
    const hue = 120 - ratio * 120;

    return `hsl(${hue}, 85%, 45%)`;
  };

  const textColor = getColorFromRange(value, range.min, range.max, range.reverse);

  return (
    <BasePanel className="aspect-square w-20 h-20 flex flex-col justify-center gap-2 items-center">
      {icon}
      <p className="" style={{ color: textColor }}>
        {value ?? "-"}
        <span className="ml-1">{value ? unit : ""}</span>
      </p>
    </BasePanel>
  );
}
