require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { ensureBaseSchema } = require('./utils/baseSchema');
const { ensureWorkflowSchema } = require('./utils/workflow');
const { ensureTenantSchema } = require('./utils/tenantSchema');
const { apiRateLimiter } = require('./middleware/rateLimit');

// Import routes
const authRoutes = require('./routes/auth');
const donorRoutes = require('./routes/donor');
const recipientRoutes = require('./routes/recipient');
const stockRoutes = require('./routes/stock');
const approvalRoutes = require('./routes/approval');
const reportRoutes = require('./routes/reports');
const applicationRoutes = require('./routes/application');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const initializeDatabase = async () => {
  // Base schema is created using explicit idempotent SQL statements.
  await ensureBaseSchema();

  // Workflow migration is safe to run repeatedly.
  await ensureWorkflowSchema();

  // Tenant foundation migration can be applied repeatedly.
  await ensureTenantSchema();
};

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  }
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/api', apiRateLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/donors', donorRoutes);
app.use('/api/recipients', recipientRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/applications', applicationRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Blood Bank API is running' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
    });
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });
