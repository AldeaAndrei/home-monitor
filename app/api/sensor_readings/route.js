import pool from "../../../lib/db";

export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT id, created_at, read_at, temperature, humidity
      FROM sensor_readings
      ORDER BY created_at DESC
    `);

    return Response.json({ data: rows });
  } catch (err) {
    console.error("Database query failed:", err);
    return Response.json({ error: "Database error" }, { status: 500 });
  }
}
