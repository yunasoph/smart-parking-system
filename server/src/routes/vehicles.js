const express = require('express');
const pool = require('../db');
const { HttpError, asyncHandler, normalizePlate } = require('../errors');

const router = express.Router();

const PLAN_TO_DB = {
  'Monthly pass': 'MONTHLY',
  'Pay per hour': 'PAY_PER_HOUR',
  Visitor: 'VISITOR',
  MONTHLY: 'MONTHLY',
  PAY_PER_HOUR: 'PAY_PER_HOUR',
  VISITOR: 'VISITOR'
};

router.get(
  '/vehicles',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const rawPlan = String(req.query.plan || 'All').trim();
    const dbPlan = rawPlan === 'All' || !rawPlan ? null : PLAN_TO_DB[rawPlan] || rawPlan;

    const [totalRes, listRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::INT AS total FROM v_vehicle_list`),
      pool.query(
        `SELECT
           plate_no AS plate,
           type_name AS type,
           owner_name AS owner,
           CASE plan
             WHEN 'MONTHLY' THEN 'Monthly pass'
             WHEN 'PAY_PER_HOUR' THEN 'Pay per hour'
             WHEN 'VISITOR' THEN 'Visitor'
             ELSE plan
           END AS plan,
           visits,
           CASE
             WHEN last_seen IS NULL THEN 'Never'
             WHEN last_seen::DATE = CURRENT_DATE THEN 'Today, ' || TO_CHAR(last_seen, 'HH24:MI')
             WHEN last_seen::DATE = CURRENT_DATE - 1 THEN 'Yesterday, ' || TO_CHAR(last_seen, 'HH24:MI')
             ELSE TO_CHAR(last_seen, 'FMDD Mon, HH24:MI')
           END AS last
         FROM v_vehicle_list
         WHERE ($1::TEXT IS NULL OR plan = $1)
           AND ($2::TEXT = '' OR plate_no ILIKE '%' || $2 || '%' OR owner_name ILIKE '%' || $2 || '%')
         ORDER BY
           (CASE
             WHEN visits = 0 AND last_seen IS NULL THEN 0
             WHEN owner_name NOT LIKE 'Driver %' AND owner_name <> 'Visitor' THEN 1
             ELSE 2
           END),
           last_seen DESC NULLS LAST,
           plate_no ASC`,
        [dbPlan, q]
      )
    ]);

    res.json({
      total: totalRes.rows[0].total,
      vehicles: listRes.rows
    });
  })
);

router.post(
  '/vehicles',
  asyncHandler(async (req, res) => {
    const plate = normalizePlate(req.body && req.body.plate);
    const typeName = String((req.body && req.body.type) || 'Car').trim();
    const ownerName = String((req.body && req.body.owner) || '').trim();
    const phoneDigits = String((req.body && req.body.phone) || '').replace(/\D/g, '');

    if (!plate) {
      throw new HttpError(422, 'Enter the plate number.');
    }
    if (!ownerName) {
      throw new HttpError(422, "Enter the owner's name.");
    }
    if (!/^\d{10}$/.test(phoneDigits)) {
      throw new HttpError(422, 'Enter a 10-digit mobile number.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const typeRes = await client.query(
        `SELECT type_id, type_name FROM vehicle_type WHERE type_name = $1`,
        [typeName]
      );
      if (typeRes.rows.length === 0) {
        throw new HttpError(422, 'That value is not allowed.');
      }
      const vehicleType = typeRes.rows[0];

      const existingOwner = await client.query(
        `SELECT owner_id, full_name FROM owner WHERE phone = $1`,
        [phoneDigits]
      );

      let ownerId;
      let resolvedOwnerName;
      if (existingOwner.rows.length > 0) {
        ownerId = existingOwner.rows[0].owner_id;
        resolvedOwnerName = existingOwner.rows[0].full_name;
      } else {
        const insOwner = await client.query(
          `INSERT INTO owner (full_name, phone)
           VALUES ($1, $2)
           RETURNING owner_id, full_name`,
          [ownerName, phoneDigits]
        );
        ownerId = insOwner.rows[0].owner_id;
        resolvedOwnerName = insOwner.rows[0].full_name;
      }

      await client.query(
        `INSERT INTO vehicle (plate_no, type_id, owner_id)
         VALUES ($1, $2, $3)`,
        [plate, vehicleType.type_id, ownerId]
      );

      await client.query('COMMIT');

      res.status(201).json({
        plate,
        type: vehicleType.type_name,
        owner: resolvedOwnerName,
        plan: 'Pay per hour',
        visits: 0,
        last: 'Never'
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
