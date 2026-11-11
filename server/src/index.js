require('dotenv').config();
const express = require('express');
const cors = require('cors');

const dashboardRoutes = require('./routes/dashboard');
const slotsRoutes = require('./routes/slots');
const sessionsRoutes = require('./routes/sessions');
const vehiclesRoutes = require('./routes/vehicles');
const billingRoutes = require('./routes/billing');
const { errorHandler } = require('./errors');

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api', dashboardRoutes);
app.use('/api', slotsRoutes);
app.use('/api', sessionsRoutes);
app.use('/api', vehiclesRoutes);
app.use('/api', billingRoutes);

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
