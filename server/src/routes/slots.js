const express = require('express');
const pool = require('../db');
const { HttpError, asyncHandler } = require('../errors');

const router = express.Router();

router.get(
  '/floors',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT code, floor_name AS name
       FROM floor
       ORDER BY floor_id`
    );
    res.json(rows);
  })
);

router.get(
  '/slots',
  asyncHandler(async (req, res) => {
    const floorParam = String(req.query.floor || 'G').trim();

    const floorRes = await pool.query(
      `SELECT floor_id, code, floor_name AS name
       FROM floor
       WHERE code = $1 OR floor_name = $1
       LIMIT 1`,
      [floorParam]
    );

    if (floorRes.rows.length === 0) {
      throw new HttpError(404, 'Floor not found.');
    }

    const floor = floorRes.rows[0];
    const slotsRes = await pool.query(
      `SELECT
         slot_code AS code,
         LPAD(slot_no::TEXT, 2, '0') AS number,
         kind,
         status
       FROM slot
       WHERE floor_id = $1
       ORDER BY slot_no`,
      [floor.floor_id]
    );

    res.json({
      floor: { code: floor.code, name: floor.name },
      slots: slotsRes.rows
    });
  })
);

router.get(
  '/slots/:code',
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();

    const { rows } = await pool.query(
      `SELECT
         slot_code AS code,
         floor_name AS floor,
         kind,
         status,
         plate,
         entry_time AS "enteredAt",
         minutes,
         fee_so_far AS fee,
         reserved_plate AS "heldFor",
         expires_at AS "holdEndsAt"
       FROM v_slot_detail
       WHERE slot_code = $1`,
      [code]
    );

    if (rows.length === 0) {
      throw new HttpError(404, 'Slot not found.');
    }

    const row = rows[0];
    res.json({
      code: row.code,
      floor: row.floor,
      kind: row.kind,
      status: row.status,
      plate: row.plate || null,
      enteredAt: row.enteredAt ? new Date(row.enteredAt).toISOString() : null,
      minutes: row.minutes !== null ? Number(row.minutes) : null,
      fee: row.fee !== null ? Number(row.fee) : null,
      heldFor: row.heldFor || null,
      holdEndsAt: row.holdEndsAt ? new Date(row.holdEndsAt).toISOString() : null
    });
  })
);

module.exports = router;
