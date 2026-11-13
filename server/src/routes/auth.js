const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { HttpError, asyncHandler, normalizePlate } = require('../errors');
const {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth
} = require('../middleware/auth');

const router = express.Router();

router.post(
  '/auth/register',
  asyncHandler(async (req, res) => {
    const name = String((req.body && req.body.name) || '').trim();
    const email = String((req.body && req.body.email) || '')
      .trim()
      .toLowerCase();
    const password = String((req.body && req.body.password) || '');
    const phoneDigits = String((req.body && req.body.phone) || '').replace(/\D/g, '');
    const plate = normalizePlate(req.body && req.body.plate);
    const typeName = String((req.body && req.body.type) || 'Car').trim();

    if (!name) {
      throw new HttpError(422, 'Enter your full name.');
    }
    if (!email || !email.includes('@')) {
      throw new HttpError(422, 'Enter a valid email address.');
    }
    if (password.length < 8) {
      throw new HttpError(422, 'Password must be at least 8 characters.');
    }
    if (!/^\d{10}$/.test(phoneDigits)) {
      throw new HttpError(422, 'Enter a 10-digit mobile number.');
    }
    if (!plate) {
      throw new HttpError(422, 'Enter the plate number.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const typeRes = await client.query(
        `SELECT type_id FROM vehicle_type WHERE type_name = $1`,
        [typeName]
      );
      if (typeRes.rows.length === 0) {
        throw new HttpError(422, 'That value is not allowed.');
      }
      const typeId = typeRes.rows[0].type_id;

      const emailCheck = await client.query(
        `SELECT 1 FROM app_user WHERE LOWER(email) = LOWER($1)`,
        [email]
      );
      if (emailCheck.rows.length > 0) {
        throw new HttpError(409, 'That email address is already registered.');
      }

      const existingOwner = await client.query(
        `SELECT owner_id FROM owner WHERE phone = $1`,
        [phoneDigits]
      );

      let ownerId;
      if (existingOwner.rows.length > 0) {
        ownerId = existingOwner.rows[0].owner_id;
        await client.query(
          `UPDATE owner SET full_name = $1, email = COALESCE(email, $2) WHERE owner_id = $3`,
          [name, email, ownerId]
        );
      } else {
        const insOwner = await client.query(
          `INSERT INTO owner (full_name, phone, email)
           VALUES ($1, $2, $3)
           RETURNING owner_id`,
          [name, phoneDigits, email]
        );
        ownerId = insOwner.rows[0].owner_id;
      }

      const existingVeh = await client.query(
        `SELECT v.owner_id, o.full_name, o.phone
           FROM vehicle v
           JOIN owner o ON o.owner_id = v.owner_id
          WHERE v.plate_no = $1
          FOR UPDATE OF v`,
        [plate]
      );
      if (existingVeh.rows.length > 0) {
        const current = existingVeh.rows[0];
        const isWalkIn =
          current.full_name === 'Visitor' && current.phone === '9999999999';
        if (isWalkIn) {
          // First seen at the gate as a walk-in; the real owner takes it over now
          await client.query(
            `UPDATE vehicle
                SET owner_id = $1,
                    plan = CASE WHEN plan = 'VISITOR' THEN 'PAY_PER_HOUR' ELSE plan END
              WHERE plate_no = $2`,
            [ownerId, plate]
          );
        } else if (current.owner_id !== ownerId) {
          throw new HttpError(409, 'This plate is already registered.');
        }
      } else {
        await client.query(
          `INSERT INTO vehicle (plate_no, type_id, owner_id)
           VALUES ($1, $2, $3)`,
          [plate, typeId, ownerId]
        );
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userRes = await client.query(
        `INSERT INTO app_user (email, password_hash, full_name, role, owner_id, active)
         VALUES ($1, $2, $3, 'PARKER', $4, TRUE)
         RETURNING user_id, full_name, email, role`,
        [email, passwordHash, name, ownerId]
      );

      await client.query('COMMIT');

      const created = userRes.rows[0];
      const token = signToken({ user_id: created.user_id, role: created.role });
      setAuthCookie(res, token);

      res.status(201).json({
        id: created.user_id,
        name: created.full_name,
        email: created.email,
        role: created.role
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

router.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const email = String((req.body && req.body.email) || '')
      .trim()
      .toLowerCase();
    const password = String((req.body && req.body.password) || '');

    if (!email || !password) {
      throw new HttpError(401, 'Incorrect email or password.');
    }

    const { rows } = await pool.query(
      `SELECT user_id, email, password_hash, full_name, role, active
       FROM app_user
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (rows.length === 0) {
      throw new HttpError(401, 'Incorrect email or password.');
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      throw new HttpError(401, 'Incorrect email or password.');
    }

    if (!user.active) {
      throw new HttpError(403, 'This account is disabled.');
    }

    const token = signToken({ user_id: user.user_id, role: user.role });
    setAuthCookie(res, token);

    res.json({
      id: user.user_id,
      name: user.full_name,
      email: user.email,
      role: user.role
    });
  })
);

router.post('/auth/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role
  });
});

module.exports = router;
