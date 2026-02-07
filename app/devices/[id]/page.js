import SensorPage from "@/app/components/SensorPage";
import { getLast48hData } from "@/lib/utils/utils";

export default async function DevicePage({ params }) {
  const { id } = await params;
  const readings = await getLast48hData(id);

  function formatReadings(readings) {
    return readings.map((r) => {
      const flatData = Object.fromEntries(Object.entries(r.data).map(([key, value]) => [key, value ?? null]));
      return {
        created_at: r.created_at,
        ...flatData,
      };
    });
  }

  return <SensorPage readings={formatReadings(readings)} />;
}
