import { getDevices } from "@/lib/utils/utils";
import ModulePanel from "./components/ModulePanel";
import { Menu } from "lucide-react";
import Link from "next/link";

export default async function ClientHome() {
  const devices = await getDevices();

  return (
    <main className="flex flex-col gap-3 p-0">
      <section className="h-20 text-2xl text-center justify-between items-center flex px-2">
        <h1>Home Monitoring</h1>
        <div>
          <Menu />
        </div>
      </section>
      <section className="mx-1">
        <li>
          {devices.map((device) => {
            return (
              <Link key={`${device.device_id}-${device.device_type}`} href={`/devices/${device.device_id}`}>
                <ModulePanel id={device.device_id} type={device.device_type} lastSeenAt={device.last_seen_at} />
              </Link>
            );
          })}
        </li>
      </section>
    </main>
  );
}
