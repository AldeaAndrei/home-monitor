import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT (data::jsonb)->>'humidity22' AS humidity
      FROM sensor_readings
      WHERE data IS NOT NULL
        AND (data::jsonb)->>'humidity22' IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const humidity = rows[0]?.humidity ?? "N/A";

    return NextResponse.json(
      {
        schemaVersion: 1,
        label: "last humidity reading",
        message: `${humidity}%`,
        color: "blue",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Failed to fetch last humidity22" }, { status: 500 });
  }
}
