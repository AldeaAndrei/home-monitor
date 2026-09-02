import { selectedIcon } from "@/lib/utils/client";

export default function IconBubble({ type }) {
  const config = selectedIcon(type);
  if (!config) return null;

  const { icon, className } = config;
  return (
    <div
      className={`aspect-square flex items-center justify-center rounded-full max-w-10 max-h-10 m-1 p-2 shrink-0 ${className}`}
    >
      {icon}
    </div>
  );
}
