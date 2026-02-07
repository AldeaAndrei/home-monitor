import { House } from "lucide-react";
import BasePanel from "./BasePanel";
export default function ModulePanel({ id, type, lastSeenAt }) {
  const formatTs = (ts) =>
    new Date(ts).toLocaleString([], {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  return (
    <BasePanel className="flex items-center justify-start gap-5 px-2 py-1">
      <div>
        <House size={60} />
      </div>
      <div>
        <div className="text-2xl mb-2">
          {type} <span> #{id}</span>
        </div>
        <p className="mb-2 flex gap-3 font-extralight text-gray-400">Last seen at: {formatTs(lastSeenAt)}</p>
      </div>
    </BasePanel>
  );
}
