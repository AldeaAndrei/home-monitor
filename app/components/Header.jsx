"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const segments = pathname.split("/").filter(Boolean);
  const deviceId = segments[0] === "devices" && segments[1] ? segments[1] : null;
  const showDeviceNav = !isHome && deviceId;

  return (
    <header className="h-20 text-2xl text-center justify-start items-center flex px-4 gap-4 ml-1">
      <div className="flex flex-col gap-0 items-start justify-start">
        <Link href="/" className="cursor-pointer">
          <h1>
            Home<span className="text-[#93c65d] font-bold">Monitor</span>
          </h1>
        </Link>
        {showDeviceNav && (
          <div className="flex flex-row gap-4 items-center justify-start">
            <Link href="/" className="text-sm text-[#9c9fa0]">
              Home
            </Link>
            <Link href={`/devices/${deviceId}`} className="text-sm text-[#9c9fa0]">
              Last readings
            </Link>
            <Link href={`/devices/${deviceId}/actions`} className="text-sm text-[#9c9fa0]">
              Summary & Actions
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
