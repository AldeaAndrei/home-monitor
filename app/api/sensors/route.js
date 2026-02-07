import { getDevices } from "@/lib/utils/utils";

export async function GET(req) {
  try {
    const data = await getDevices();
    return Response.json(data);
  } catch (err) {
    console.error("Failed to get sensors:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
