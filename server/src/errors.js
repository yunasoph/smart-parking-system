class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function normalizePlate(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err && err.code === '23505') {
    if (err.constraint === 'uq_open_session_per_plate') {
      return res.status(409).json({ error: 'That vehicle is already in the lot.' });
    }
    if (err.constraint === 'uq_open_session_per_slot') {
      return res.status(409).json({ error: 'No free slot on that floor. Try another floor.' });
    }
    if (err.constraint === 'vehicle_pkey') {
      return res.status(409).json({ error: 'This plate is already registered.' });
    }
    if (err.constraint === 'payment_session_id_key') {
      return res.status(409).json({ error: 'This session has already been paid.' });
    }
    if (err.constraint === 'owner_phone_key') {
      return res.status(409).json({ error: 'That phone number is already registered.' });
    }
    if (err.constraint === 'app_user_email_key') {
      return res.status(409).json({ error: 'That email address is already registered.' });
    }
    if (err.constraint === 'app_user_owner_id_key') {
      return res.status(409).json({ error: 'An account already exists for that mobile number.' });
    }
    return res.status(409).json({ error: 'That record already exists.' });
  }

  if (err && err.code === '23503') {
    return res.status(422).json({ error: 'That record does not exist.' });
  }

  if (err && err.code === '23514') {
    return res.status(422).json({ error: 'That value is not allowed.' });
  }

  return res.status(500).json({ error: 'Something went wrong. Try again.' });
}

module.exports = {
  HttpError,
  asyncHandler,
  normalizePlate,
  errorHandler
};
