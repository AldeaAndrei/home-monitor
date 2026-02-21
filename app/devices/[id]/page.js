import SensorPage from "@/app/components/SensorPage";
import { getDataByRange } from "@/lib/utils/utils";

export default async function DevicePage({ params }) {
  const { id } = await params;
  const initialReadings = await getDataByRange(id, "last_2_days");

  return <SensorPage deviceId={id} initialReadings={initialReadings} />;
}
