import pool from "@/lib/db";

export async function lastWeekData() {
  try {
    // Get the rows plus aggregates
    // const result = await pool.query(`
    //   SELECT
    //     created_at, temperature, humidity,
    //     AVG(temperature) OVER () AS temp_avg,
    //     MAX(temperature) OVER () AS temp_max,
    //     MIN(temperature) OVER () AS temp_min,
    //     AVG(humidity) OVER () AS hum_avg,
    //     MAX(humidity) OVER () AS hum_max,
    //     MIN(humidity) OVER () AS hum_min
    //   FROM sensor_readings
    //   WHERE created_at >= NOW() - INTERVAL '7 days'
    //   ORDER BY created_at DESC
    // `);

    const result = await pool.query(`
SELECT 
  d.created_at,
  d.temperature,
  d.humidity,
  agg.temp_avg,
  agg.temp_max,
  agg.temp_min,
  agg.hum_avg,
  agg.hum_max,
  agg.hum_min
FROM (
  SELECT
    AVG(temperature) AS temp_avg,
    MAX(temperature) AS temp_max,
    MIN(temperature) AS temp_min,
    AVG(humidity) AS hum_avg,
    MAX(humidity) AS hum_max,
    MIN(humidity) AS hum_min
  FROM sensor_readings
  WHERE created_at >= NOW() - INTERVAL '7 days'
) agg,
(
  SELECT created_at, temperature, humidity
  FROM sensor_readings
  WHERE created_at >= NOW() - INTERVAL '24 hours'
  ORDER BY created_at DESC
) d

    `);

    const rows = result.rows;

    if (rows.length === 0) {
      return {
        data: [],
        tempAvg: null,
        tempMax: null,
        tempMin: null,
        humAvg: null,
        humMax: null,
        humMin: null,
      };
    }

    // Pull aggregates from first row (they’re the same for all rows)
    const aggregates = {
      tempAvg: parseFloat(rows[0].temp_avg.toFixed(2)),
      tempMax: rows[0].temp_max,
      tempMin: rows[0].temp_min,
      humAvg: parseFloat(rows[0].hum_avg.toFixed(2)),
      humMax: rows[0].hum_max,
      humMin: rows[0].hum_min,
    };

    // Strip out aggregates from each data row
    const data = rows.map(({ created_at, temperature, humidity }) => ({
      created_at,
      temperature,
      humidity,
    }));

    return {
      data,
      ...aggregates,
    };
  } catch (err) {
    console.error("Database query failed:", err);
    return {};
  }
}
