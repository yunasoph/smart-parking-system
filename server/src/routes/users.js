const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { HttpError, asyncHandler } = require('../errors');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use('/users', requireAuth, requireRole('ADMIN'));

router.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT
         user_id AS id,
         full_name AS name,
         email,
         role,
         active,
         created_at AS "createdAt"
       FROM app_user
       ORDER BY user_id ASC`
    );
    res.json(rows);
  })
);

router.post(
  '/users',
  asyncHandler(async (req, res) => {
    const name = String((req.body && req.body.name) || '').trim();
    const email = String((req.body && req.body.email) || '')
      .trim()
      .toLowerCase();
    const password = String((req.body && req.body.password) || '');

    if (!name) {
      throw new HttpError(422, 'Enter the staff member name.');
    }
    if (!email || !email.includes('@')) {
      throw new HttpError(422, 'Enter a valid email address.');
    }
    if (password.length < 8) {
      throw new HttpError(422, 'Password must be at least 8 characters.');
    }

    const dup = await pool.query(
      `SELECT 1 FROM app_user WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    if (dup.rows.length > 0) {
      throw new HttpError(409, 'That email address is already registered.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO app_user (email, password_hash, full_name, role, owner_id, active)
       VALUES ($1, $2, $3, 'STAFF', NULL, TRUE)
       RETURNING user_id AS id, full_name AS name, email, role, active, created_at AS "createdAt"`,
      [email, passwordHash, name]
    );

    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      throw new HttpError(404, 'User not found.');
    }

    if (targetId === req.user.id) {
      throw new HttpError(422, 'You cannot disable your own account.');
    }

    const existing = await pool.query(
      `SELECT user_id, active FROM app_user WHERE user_id = $1`,
      [targetId]
    );
    if (existing.rows.length === 0) {
      throw new HttpError(404, 'User not found.');
    }

    const nextActive =
      req.body && typeof req.body.active === 'boolean'
        ? req.body.active
        : !existing.rows[0].active;

    const { rows } = await pool.query(
      `UPDATE app_user
          SET active = $2
        WHERE user_id = $1
        RETURNING user_id AS id, full_name AS name, email, role, active, created_at AS "createdAt"`,
      [targetId, nextActive]
    );

    res.json(rows[0]);
  })
);

module.exports = router;
