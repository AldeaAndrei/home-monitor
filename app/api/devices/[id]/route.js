import { getDeviceConfig } from "@/lib/utils/utils";

export async function GET(_req, { params }) {
  try {
    const { id } = await params;

    if (!id) {
      return Response.json({ error: "Missing device id" }, { status: 400 });
    }

    const data = await getDeviceConfig(id);

    if (!data) {
      return Response.json({ error: "Device not found" }, { status: 404 });
    }

    return Response.json(data);
  } catch (err) {
    console.error("Failed to get device config:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
