import { getDataByRange } from "@/lib/utils/utils";

const ALLOWED_RANGES = ["last_2_days", "last_week", "last_month", "last_year"];

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const deviceId = searchParams.get("deviceId");
    const timeframe = searchParams.get("timeframe") || "last_2_days";

    if (!deviceId) {
      return Response.json({ error: "Missing deviceId" }, { status: 400 });
    }

    if (!ALLOWED_RANGES.includes(timeframe)) {
      return Response.json({ error: "Invalid timeframe" }, { status: 400 });
    }

    const data = await getDataByRange(deviceId, timeframe);

    return Response.json(data);
  } catch (err) {
    console.error("Failed to fetch readings:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
