import { formatLastSeen, selectedIcon, selectedUnit } from "@/lib/utils/client";
import BasePanel from "./BasePanel";
import IconBubble from "./IconBubble";

export default function SensorCard({ fieldTitle, dataFieldName, type, selectedSensor, setSelectedSensor, lastReading }) {
    return (
      <BasePanel
        className="flex flex-row w-full h-full cursor-pointer"
        onClick={() => {
          const config = selectedIcon(type);
          setSelectedSensor({
            title: fieldTitle,
            key: dataFieldName,
            unit: selectedUnit(type),
            color: config?.color ?? "#93c65d",
          });
        }}
      >
        <div className="flex-[2] flex flex-row gap-1">
          {selectedSensor.title == fieldTitle && <div className={`h-full w-1 rounded-full bg-[#93c65d]`}/>}
          <IconBubble type={type} />
          <div className="flex flex-col gap-1">
            <div className="text-md text-[#d6d8d8]">{fieldTitle}</div>
            <div className="text-start text-sm text-[#9c9fa0]">{formatLastSeen(lastReading?.created_at)}</div>
          </div>
        </div>
        <div className="flex-1 flex flex-row items-baseline mt-auto justify-end gap-1">
          <div className="text-justify text-xl font-bold">{lastReading?.[dataFieldName]}</div>
          <div className="text-justify text-sm text-[#9c9fa0]">{selectedUnit(type)}</div>
        </div>
      </BasePanel>
    );
  }