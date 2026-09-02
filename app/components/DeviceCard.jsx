import BasePanel from "./BasePanel";
import IconBubble from "./IconBubble";
import StatusDisplay from "./StatusDisplay";

export default function DeviceCard({ deviceConfig, lastSeenAt }) {
    return (
        <BasePanel className="flex flex-row w-full h-full bg-secondary-background p-1 rounded-xl">
            <IconBubble type="cpu" />
            <div className="flex flex-col gap-0 w-full">
                <h1 className="flex flex-row gap-3 items-center justify-between md:justify-start">
                    <span>{deviceConfig?.name}</span>
                    <span className="text-start text-sm text-[#9c9fa0]">{deviceConfig?.board}</span>
                </h1>
                <StatusDisplay lastSeenAt={lastSeenAt} />
            </div>
        </BasePanel>
    );
}