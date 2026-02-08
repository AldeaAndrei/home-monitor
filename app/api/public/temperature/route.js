import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT (data::jsonb)->>'temperature22' AS temperature
      FROM sensor_readings
      WHERE data IS NOT NULL
        AND (data::jsonb)->>'temperature22' IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const temperature = rows[0]?.temperature ?? "N/A";

    return NextResponse.json(
      {
        schemaVersion: 1,
        label: "last temperature reading",
        message: `${temperature}°C`,
        color: "orange",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Failed to fetch last temperature22" }, { status: 500 });
  }
}
