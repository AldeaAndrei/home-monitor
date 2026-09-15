import { getDevices } from "@/lib/utils/utils";
import Link from "next/link";
import DeviceCard from "./components/DeviceCard";

export default async function Home() {
  const devices = await getDevices();

  return (
    <main className="flex flex-col gap-4 px-4 md:max-w-1/2">
      {devices.map((device) => {
        return (
          <Link key={`${device.id}`} href={`/devices/${device.id}`}>
            <DeviceCard deviceConfig={device}  lastSeenAt={device.last_seen_at} />
          </Link>
        );
      })}
    </main>
  );
}
