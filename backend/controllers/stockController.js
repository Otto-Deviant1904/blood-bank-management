const pool = require('../config/database');
const { writeAuditLog } = require('../utils/audit');
const logger = require('../utils/logger');

const LOW_STOCK_THRESHOLD = parseInt(process.env.LOW_STOCK_THRESHOLD || '5', 10);
const EXPIRY_URGENT_DAYS = 7;

// Get All Blood Stock
const getAllStock = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM blood_stock WHERE tenant_id = $1 ORDER BY blood_group',
      [req.user.tenant_id]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Failed to fetch blood stock', error);
    res.status(500).json({ error: 'Failed to fetch blood stock' });
  }
};

// Get Stock by Blood Group
const getStockByBloodGroup = async (req, res) => {
  try {
    const { blood_group } = req.params;

    const result = await pool.query(
      'SELECT * FROM blood_stock WHERE blood_group = $1 AND tenant_id = $2',
      [blood_group, req.user.tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Stock not found for this blood group' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to fetch stock by blood group', error);
    res.status(500).json({ error: 'Failed to fetch stock' });
  }
};

// Add Stock
const addStock = async (req, res) => {
  try {
    const { blood_group, units, expiry_date } = req.body;

    const parsedUnits = parseInt(units, 10);
    if (!parsedUnits || parsedUnits < 1) {
      return res.status(400).json({ error: 'units must be a positive integer' });
    }

    // Check if stock exists for this blood group
    const existingStock = await pool.query(
      'SELECT * FROM blood_stock WHERE blood_group = $1 AND tenant_id = $2',
      [blood_group, req.user.tenant_id]
    );

    if (existingStock.rows.length === 0) {
      // Create new stock entry
      const result = await pool.query(
        'INSERT INTO blood_stock (tenant_id, site_id, blood_group, units_available, expiry_date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [req.user.tenant_id, req.user.site_id, blood_group, parsedUnits, expiry_date]
      );

      await writeAuditLog(req, {
        action: 'STOCK_ADDED',
        entityType: 'blood_stock',
        entityId: result.rows[0].stock_id,
        details: { blood_group, units: parsedUnits, expiry_date }
      });
      return res.status(201).json({
        message: 'Stock added successfully',
        stock: result.rows[0]
      });
    } else {
      // Update existing stock
      const result = await pool.query(
        'UPDATE blood_stock SET units_available = units_available + $1, expiry_date = $2 WHERE blood_group = $3 AND tenant_id = $4 RETURNING *',
        [parsedUnits, expiry_date, blood_group, req.user.tenant_id]
      );

      await writeAuditLog(req, {
        action: 'STOCK_UPDATED',
        entityType: 'blood_stock',
        entityId: result.rows[0].stock_id,
        details: { blood_group, units_delta: parsedUnits, expiry_date }
      });
      return res.json({
        message: 'Stock updated successfully',
        stock: result.rows[0]
      });
    }
  } catch (error) {
    logger.error('Failed to add stock', error);
    res.status(500).json({ error: 'Failed to add stock' });
  }
};

// Reduce Stock
const reduceStock = async (req, res) => {
  try {
    const { blood_group, units } = req.body;

    const result = await pool.query(
      'UPDATE blood_stock SET units_available = units_available - $1 WHERE blood_group = $2 AND tenant_id = $3 AND units_available >= $1 RETURNING *',
      [units, blood_group, req.user.tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Insufficient stock or blood group not found' });
    }

    await writeAuditLog(req, {
      action: 'STOCK_REDUCED',
      entityType: 'blood_stock',
      entityId: result.rows[0].stock_id,
      details: { blood_group, units }
    });

    res.json({
      message: 'Stock reduced successfully',
      stock: result.rows[0]
    });
  } catch (error) {
    logger.error('Failed to reduce stock', error);
    res.status(500).json({ error: 'Failed to reduce stock' });
  }
};

// Get Expiry Warnings
const getExpiryWarnings = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM blood_stock
       WHERE tenant_id = $1
         AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
       ORDER BY expiry_date ASC`,
      [req.user.tenant_id]
    );

    const urgentCutoff = EXPIRY_URGENT_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    res.json({
      warnings: result.rows,
      urgent: result.rows.filter(s => new Date(s.expiry_date).getTime() - now < urgentCutoff)
    });
  } catch (error) {
    logger.error('Failed to fetch expiry warnings', error);
    res.status(500).json({ error: 'Failed to fetch expiry warnings' });
  }
};

// Get Low Stock Alerts
const getLowStockAlerts = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM blood_stock WHERE units_available < $1 AND tenant_id = $2',
      [LOW_STOCK_THRESHOLD, req.user.tenant_id]
    );

    res.json({
      low_stock_alerts: result.rows,
      threshold: LOW_STOCK_THRESHOLD
    });
  } catch (error) {
    logger.error('Failed to fetch low stock alerts', error);
    res.status(500).json({ error: 'Failed to fetch low stock alerts' });
  }
};

module.exports = {
  getAllStock,
  getStockByBloodGroup,
  addStock,
  reduceStock,
  getExpiryWarnings,
  getLowStockAlerts
};
