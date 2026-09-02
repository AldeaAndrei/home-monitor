export default function StatusDisplay({ lastSeenAt }) {
    if (!lastSeenAt) {
      return (
        <div className="flex flex-row items-center justify-start gap-1">
          <div className="aspect-square w-2 h-2 rounded-full bg-[#9c9fa0]"></div>
          <div className="text-[#9c9fa0]">Unresponsive</div>
        </div>
      );
    }

    const lastSeenMs = new Date(lastSeenAt).getTime();
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    if (lastSeenMs > fourHoursAgo) {
      return (
        <div className="flex flex-row items-center justify-start gap-1">
          <div className="aspect-square w-2 h-2 rounded-full bg-[#93c65d]"></div>
          <div className="text-[#93c65d]">Online</div>
        </div>
      );
    }

    if (lastSeenMs > oneDayAgo) {
      return (
        <div className="flex flex-row items-center justify-start gap-1">
          <div className="aspect-square w-2 h-2 rounded-full bg-[#e58c42]"></div>
          <div className="text-[#e58c42]">Offline</div>
        </div>
      );
    }

    return (
      <div className="flex flex-row items-center justify-start gap-1">
        <div className="aspect-square w-2 h-2 rounded-full bg-[#9c9fa0]"></div>
        <div className="text-[#9c9fa0]">Unresponsive</div>
      </div>
    );
}