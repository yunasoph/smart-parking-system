require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const meRoutes = require('./routes/me');
const usersRoutes = require('./routes/users');
const dashboardRoutes = require('./routes/dashboard');
const slotsRoutes = require('./routes/slots');
const sessionsRoutes = require('./routes/sessions');
const vehiclesRoutes = require('./routes/vehicles');
const billingRoutes = require('./routes/billing');
const { requireAuth, requireRole } = require('./middleware/auth');
const { errorHandler } = require('./errors');

const app = express();

app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());

// Auth, Parker (/api/me/*), and Admin (/api/users/*) routes
app.use('/api', authRoutes);
app.use('/api', meRoutes);
app.use('/api', usersRoutes);

// Staff & Admin routes
app.use('/api', requireAuth, requireRole('ADMIN', 'STAFF'), dashboardRoutes);
app.use('/api', requireAuth, requireRole('ADMIN', 'STAFF'), slotsRoutes);
app.use('/api', requireAuth, requireRole('ADMIN', 'STAFF'), sessionsRoutes);
app.use('/api', requireAuth, requireRole('ADMIN', 'STAFF'), vehiclesRoutes);
app.use('/api', requireAuth, requireRole('ADMIN', 'STAFF'), billingRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ParkSmart API listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
