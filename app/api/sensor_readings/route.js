import { lastWeekData } from "./utils/utils";

export async function GET(req) {
  try {
    const data = await lastWeekData();

    return Response.json(data);
  } catch (err) {
    console.error("Failed to get last week data:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
