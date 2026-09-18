require('dotenv').config();
const express = require('express');
const cors = require('cors');
const logger = require('./src/utils/logger');
const path = require('path');
const { healthCheck } = require('./src/config/database');

const app = express();

(async () => {
  try {
    const health = await healthCheck();
    if (health.status === 'healthy') {
      console.log('PostgreSQL database connection verified - Construction ERP');
    } else {
      console.error('PostgreSQL database connection failed:', health.message);
    }
  } catch (error) {
    console.error('Database health check failed:', error);
  }
})();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    name: 'Construction ERP',
    version: '1.0.0',
    status: 'running',
    database: 'PostgreSQL',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/approvals', require('./src/routes/approvals'));
app.use('/api/activity', require('./src/routes/activity'));
app.use('/api/dashboard', require('./src/routes/dashboard'));
app.use('/api/items', require('./src/routes/items'));
app.use('/api/suppliers', require('./src/routes/suppliers'));
app.use('/api/clients', require('./src/routes/clients'));
app.use('/api/legal', require('./src/routes/legal'));
app.use('/api/expenses', require('./src/routes/expenses'));
app.use('/api/invoices', require('./src/routes/invoices'));
app.use('/api/payments', require('./src/routes/payments'));
app.use('/api/finance', require('./src/routes/finance'));
app.use('/api/assets', require('./src/routes/assets'));
app.use('/api/maintenance', require('./src/routes/maintenance'));
app.use('/api/hr', require('./src/routes/hr'));
app.use('/api/payroll', require('./src/routes/payroll'));
app.use('/api/projects', require('./src/routes/projects'));
app.use('/api/warehouses', require('./src/routes/warehouses'));
app.use('/api/boq', require('./src/routes/boq'));
app.use('/api/work-orders', require('./src/routes/workorders'));
app.use('/api/subcontractors', require('./src/routes/subcontractors'));
app.use('/api/costing', require('./src/routes/costing'));
app.use('/api/documents', require('./src/routes/documents'));
app.use('/api/projects', require('./src/routes/site'));
app.use('/api/qhse', require('./src/routes/qhse'));
app.use('/api/docs', require('./src/routes/doccontrol'));
app.use('/api/sales', require('./src/routes/units'));
app.use('/api/actions', require('./src/routes/actions'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/locations', require('./src/routes/locations'));
app.use('/api/quantities', require('./src/routes/quantities'));
app.use('/api/materials', require('./src/routes/materials'));
app.use('/api/procurement', require('./src/routes/procurement'));
app.use('/api/commercial', require('./src/routes/commercial'));

// Initialize cost event listener
require('./src/services/costEventListener').initCostEventListener();

// Initialize action/notification dispatcher + escalation scheduler (Phase 7)
require('./src/services/eventDispatcher').initEventDispatcher();
require('./src/services/escalationScheduler').initEscalationScheduler();

// Replenishment / auto-purchasing sweep (Phase 11)
require('./src/services/replenishment').initReplenishmentScheduler();

app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Construction ERP Server running on port ${PORT}`);
  logger.info(`Database: ${process.env.DB_NAME || 'construction_erp'}`);
});

module.exports = { app };
