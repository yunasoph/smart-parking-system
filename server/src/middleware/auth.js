const jwt = require('jsonwebtoken');
const pool = require('../db');
const { HttpError, asyncHandler } = require('../errors');

const COOKIE_NAME = 'parksmart_token';
const JWT_SECRET = process.env.JWT_SECRET || 'parksmart-dev-jwt-secret-2026';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/'
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  });
}

const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) {
    throw new HttpError(401, 'Please sign in.');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Please sign in.');
  }

  const { rows } = await pool.query(
    `SELECT user_id, email, full_name, role, owner_id, active
     FROM app_user
     WHERE user_id = $1`,
    [decoded.user_id]
  );

  if (rows.length === 0 || !rows[0].active) {
    throw new HttpError(401, 'Please sign in.');
  }

  const u = rows[0];
  req.user = {
    id: u.user_id,
    name: u.full_name,
    email: u.email,
    role: u.role,
    ownerId: u.owner_id
  };

  next();
});

function requireRole(...allowedRoles) {
  return function (req, _res, next) {
    if (!req.user) {
      return next(new HttpError(401, 'Please sign in.'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have access to that.'));
    }
    next();
  };
}

module.exports = {
  COOKIE_NAME,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireRole
};
