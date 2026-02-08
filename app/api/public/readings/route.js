import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM sensor_readings
      WHERE data IS NOT NULL
    `);

    const count = rows[0].count;

    return NextResponse.json(
      {
        schemaVersion: 1,
        label: "total readings",
        message: String(count),
        color: "blue",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Failed to fetch total readings" }, { status: 500 });
  }
}
